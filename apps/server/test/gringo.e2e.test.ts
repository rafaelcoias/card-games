/**
 * Gringo over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * four players. At the first discard all four snap at the same instant: the
 * room's single queue must accept exactly one. Then they play to the end —
 * swapping, using powers, snapping what they remember (and now and then a guess
 * at anyone's card, giving one back on a hit), saying "Gringo" — with a
 * reconnect in the middle of a power. Nobody may ever receive the face of a
 * card they are not allowed to see at that moment.
 */
import { randomUUID } from 'node:crypto';
import type { CardInstance } from '@cardroom/game-core';
import type { GringoClientAction, GringoEvent, GringoView } from '@cardroom/gringo';
import type {
  Ack,
  GameEventsMessage,
  GameViewMessage,
  MatchHistoryEntry,
  MatchResult,
} from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, reconnect, startMatch, waitFor, type Bot } from './e2e-helpers';

type GringoBot = Bot<GringoView, GringoClientAction>;
type Message = GameViewMessage<GringoView, GringoClientAction>;

let racing = true;
/** What each bot remembers of its own grid: index → card. */
const memory = new Map<string, Map<number, CardInstance>>();

const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(Math.random() * list.length)];
const low = (card: CardInstance | null) =>
  !!card &&
  (card.rank === 'JOKER' ||
    (card.rank === 'K' && (card.suit === 'H' || card.suit === 'D')) ||
    ['A', '2', '3', '4'].includes(card.rank));

/** Plays like a casual human with a perfect memory of what they have seen of their own grid. */
function chooseFor(botId: string) {
  return (message: Message): GringoClientAction | null => {
    const { view, validActions } = message;
    const mine = memory.get(botId) ?? new Map<number, CardInstance>();
    memory.set(botId, mine);
    for (const slot of view.seats.find((s) => s.id === botId)?.grid ?? []) {
      if (slot.card && view.phase !== 'FINISHED') mine.set(slot.index, slot.card);
      if (slot.empty) mine.delete(slot.index);
    }
    if (racing) return null;
    const of = <T extends GringoClientAction['type']>(type: T) =>
      validActions.filter((a): a is Extract<GringoClientAction, { type: T }> => a.type === type);

    const snaps = of('SNAP');
    if (snaps.length > 0) {
      const top = view.discardTop;
      const known = snaps.find(
        (a) => (a.owner ?? botId) === botId && top && mine.get(a.index)?.rank === top.rank,
      );
      if (known && Math.random() < 0.8) {
        mine.delete(known.index);
        return known;
      }
      // Now and then a guess, at anyone's card.
      return Math.random() < 0.03 ? (pick(snaps) ?? null) : null;
    }
    // Snapped someone else's card: give away the worst card remembered (or any).
    const gives = of('SNAP_GIVE');
    if (gives.length > 0) {
      const worst = gives.find((a) => mine.has(a.index) && !low(mine.get(a.index) ?? null));
      const give = worst ?? pick(gives)!;
      mine.delete(give.index);
      return give;
    }
    if (of('PEEK_DONE').length > 0) return { type: 'PEEK_DONE' };
    if (of('CALL_GRINGO').length > 0 && Math.random() < 0.25) return { type: 'CALL_GRINGO' };
    if (of('DRAW').length > 0) return { type: 'DRAW' };
    if (of('PASS').length > 0) return { type: 'PASS' };
    const swaps = of('SWAP_DRAWN');
    if (swaps.length > 0) {
      const unknown = swaps.find((a) => !mine.has(a.index));
      if (low(view.drawn) && view.drawn) {
        const target = unknown ?? pick(swaps)!;
        mine.set(target.index, view.drawn);
        return target;
      }
      return (
        validActions.find((a) => a.type === 'DISCARD_DRAWN' && a.usePower) ?? {
          type: 'DISCARD_DRAWN',
          usePower: false,
        }
      );
    }
    const peeksOwn = of('POWER_PEEK').filter((a) => a.owner === botId && !mine.has(a.index));
    if (peeksOwn.length > 0) return peeksOwn[0]!;
    const decisions = of('POWER_SWAP_DECISION');
    if (decisions.length > 0) {
      const peeked = view.peek?.card ?? null;
      const target = decisions.find(
        (a) => a.swap && a.myIndex !== undefined && !low(mine.get(a.myIndex) ?? null),
      );
      if (low(peeked) && target && peeked) {
        mine.set(target.myIndex!, peeked);
        return target;
      }
      return { type: 'POWER_SWAP_DECISION', swap: false };
    }
    const blind = of('POWER_BLIND_SWAP');
    if (blind.length > 0) {
      const choice = pick(blind)!;
      mine.delete(choice.myIndex);
      return choice;
    }
    return validActions.find((a) => a.type === 'POWER_PEEK') ?? validActions[0] ?? null;
  };
}

let bots: GringoBot[] = [];
const rejections: string[] = [];
const received = new Map<string, Message[]>();
const events: GringoEvent[] = [];
const attach = (bot: GringoBot) =>
  attachBot(bot, chooseFor(bot.id), rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Gringo over Socket.IO', () => {
  it('four simultaneous snaps: exactly one counts; a whole game leaks no hidden card, even after a reconnect', async () => {
    bots = await createBots<GringoView, GringoClientAction>(`gri_${randomUUID().slice(0, 6)}`, 4);
    bots.forEach(attach);
    const host = bots[0] as GringoBot;
    host.socket.on('game:events', (message: GameEventsMessage) => {
      events.push(...(message.events as GringoEvent[]));
    });
    await startMatch(bots, 'gringo', {
      gringoEnabled: true,
      gringoMinTurns: 2,
      snapWindowMs: 2000,
      initialPeekMs: 3000,
    });

    // Everyone memorises; the first player draws and discards; then all four snap at once.
    await waitFor(() => bots.every((b) => b.lastView?.view.phase === 'INITIAL_PEEK'), 10_000, 'the deal');
    for (const bot of bots) {
      expect(bot.lastView?.view.seats.find((s) => s.id === bot.id)?.grid.map((s) => s.card !== null)).toEqual(
        [false, false, true, true],
      );
    }
    await Promise.all(
      bots.map((b) => b.socket.timeout(8000).emitWithAck('game:action', { action: { type: 'PEEK_DONE' } })),
    );
    await waitFor(() => host.lastView?.view.phase === 'TURN_DRAW', 10_000, 'the first turn');
    const first = bots.find((b) => b.id === host.lastView?.view.turnPlayerId) as GringoBot;
    await first.socket.timeout(8000).emitWithAck('game:action', { action: { type: 'DRAW' } });
    await first.socket
      .timeout(8000)
      .emitWithAck('game:action', { action: { type: 'DISCARD_DRAWN', usePower: false } });
    await waitFor(() => bots.every((b) => b.lastView?.view.snap?.open === true), 10_000, 'the snap window');
    const acks = (await Promise.all(
      bots.map((b) =>
        b.socket
          .timeout(8000)
          .emitWithAck('game:action', { action: { type: 'SNAP', discardId: 1, index: 0 } }),
      ),
    )) as Ack[];
    expect(acks.filter((a) => a.ok)).toHaveLength(1);
    for (const ack of acks.filter((a) => !a.ok)) {
      expect(ack.ok === false && ['SNAP_TAKEN', 'BUSY'].includes(ack.error.code)).toBe(true);
    }
    await new Promise((r) => setTimeout(r, 300));
    expect(events.filter((e) => e.type === 'SnapSucceeded' || e.type === 'SnapFailed')).toHaveLength(1);

    // Now everybody plays. Mid-game, a player drops while a power is in use.
    racing = false;
    for (const bot of bots) {
      const action = bot.lastView && chooseFor(bot.id)(bot.lastView);
      if (action) void bot.socket.emitWithAck('game:action', { action });
    }
    const dropped = bots[2] as GringoBot;
    await waitFor(() => !!dropped.lastView?.view.power || host.result !== null, 120_000, 'a power in use');
    if (!host.result) {
      const snapshotsBefore = dropped.snapshots;
      await reconnect(dropped, (bot) => attach(bot as GringoBot));
      await waitFor(() => dropped.snapshots > snapshotsBefore, 10_000, 'reconnect snapshot');
    }

    await waitFor(() => bots.every((b) => b.result !== null), 220_000, 'game end');

    // Audit: a face in a view is always one its viewer may see at that seq.
    let audited = 0;
    for (const bot of bots) {
      for (const message of received.get(bot.id) ?? []) {
        const { view } = message;
        for (const seat of view.seats) {
          for (const slot of seat.grid) {
            if (!slot.card) continue;
            audited += 1;
            const missed =
              view.snap?.result &&
              !view.snap.result.hit &&
              view.snap.result.owner === seat.id &&
              view.snap.result.index === slot.index;
            const peeked = view.peek && view.peek.owner === seat.id && view.peek.index === slot.index;
            const initial = view.phase === 'INITIAL_PEEK' && seat.id === bot.id && slot.index >= 2;
            expect(
              view.phase === 'FINISHED' || missed || peeked || initial,
              `${bot.name} saw ${slot.card.id}`,
            ).toBe(true);
          }
        }
        if (view.drawn) expect(view.turnPlayerId).toBe(bot.id);
        if (view.peek) expect(view.turnPlayerId).toBe(bot.id);
      }
    }
    expect(audited).toBeGreaterThan(0);
    for (const event of events) {
      if (
        ['Drew', 'Peeked', 'BlindSwapped', 'PeekSwapDecided', 'CardGiven', 'TurnStarted'].includes(event.type)
      ) {
        expect(JSON.stringify(event)).not.toMatch(/"uid"/);
      }
    }

    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.standings).toHaveLength(4);
    const best = Math.min(...result.standings.map((s) => s.score ?? 0));
    for (const standing of result.standings) {
      expect(standing.outcome).toBe(standing.score === best ? 'WINNER' : 'PLACED');
    }
    const finished = events.find((e) => e.type === 'GameFinished');
    expect(finished?.type === 'GameFinished' && finished.scores).toEqual(
      Object.fromEntries(result.standings.map((s) => [s.playerId, s.score])),
    );

    const history = await api<MatchHistoryEntry[]>(host.token, '/me/matches');
    const recorded = history.find((m) => m.id === result.matchId);
    const own = result.standings.find((s) => s.playerId === host.id);
    expect(recorded).toMatchObject({ gameId: 'gringo', outcome: own?.outcome, score: own?.score });
    expect(recorded?.players).toHaveLength(4);
  });
});
