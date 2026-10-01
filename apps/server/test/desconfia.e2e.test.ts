/**
 * Desconfia over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * six players. After the first play the other five call "Desconfia!" at the
 * same instant: the room's single queue must accept exactly one. Then they play
 * to the end, lying and doubting, with a reconnect while a play is open to
 * doubts. Nobody may ever receive a card of another hand or of the pile,
 * except the doubted play, turned over for everyone.
 */
import { randomUUID } from 'node:crypto';
import type { DesconfiaAction, DesconfiaEvent, DesconfiaView } from '@cardroom/desconfia';
import type {
  Ack,
  GameEventsMessage,
  GameViewMessage,
  MatchHistoryEntry,
  MatchResult,
} from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, reconnect, startMatch, waitFor, type Bot } from './e2e-helpers';

type DesconfiaBot = Bot<DesconfiaView, DesconfiaAction>;
type Message = GameViewMessage<DesconfiaView, DesconfiaAction>;

let racing = true;

/**
 * Tells the truth when it can, lies otherwise (or one time in four). Doubts
 * rarely, but nearly always when its own cards make the claim impossible.
 */
function chooseAction(message: Message): DesconfiaAction | null {
  const { view, validActions } = message;
  const plays = validActions.filter((a) => a.type === 'PLAY');
  if (racing) return plays.length > 0 && view.pilePlays.length === 0 ? (plays[0] ?? null) : null;
  const doubt = validActions.find((a) => a.type === 'DOUBT');
  const last = view.pilePlays.at(-1);
  if (doubt && last) {
    const mine = (view.me?.hand ?? []).filter((c) => c.rank === last.claimRank).length;
    if (Math.random() < (mine + last.count > 6 ? 0.8 : 0.04)) return doubt;
  }
  if (plays.length === 0) return null;
  const hand = view.me?.hand ?? [];
  const claimRank = view.claimRank ?? plays[0]!.claimRank;
  const truth = hand.filter((c) => c.rank === claimRank || c.rank === 'JOKER');
  const cards =
    truth.length > 0 && Math.random() < 0.75 ? truth : [hand[Math.floor(Math.random() * hand.length)]!];
  return { type: 'PLAY', cardIds: cards.map((c) => c.id), claimRank };
}

let bots: DesconfiaBot[] = [];
const rejections: string[] = [];
/** Every view each player received, to audit hidden information afterwards. */
const received = new Map<string, Message[]>();
const events: DesconfiaEvent[] = [];
const attach = (bot: DesconfiaBot) =>
  attachBot(bot, chooseAction, rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Desconfia over Socket.IO', () => {
  it('five simultaneous doubts: exactly one counts; a whole match leaks nothing, even after a reconnect', async () => {
    bots = await createBots<DesconfiaView, DesconfiaAction>(`dsc_${randomUUID().slice(0, 6)}`, 6);
    bots.forEach(attach);
    const host = bots[0] as DesconfiaBot;
    host.socket.on('game:events', (message: GameEventsMessage) => {
      events.push(...(message.events as DesconfiaEvent[]));
    });
    await startMatch(bots, 'desconfia', { doubtMinWindowMs: 1000, lastCardWindowMs: 2000 });

    // Whoever holds the 3 of clubs plays one card; the other five doubt it at once.
    await waitFor(() => host.lastView?.view.doubtWindow?.playId === 1, 20_000, 'first play');
    const authorId = host.lastView?.view.doubtWindow?.playerId;
    const doubters = bots.filter((b) => b.id !== authorId);
    await waitFor(
      () => doubters.every((b) => b.lastView?.validActions.some((a) => a.type === 'DOUBT')),
      10_000,
      'doubt buttons',
    );
    const acks = (await Promise.all(
      doubters.map((b) =>
        b.socket.timeout(8000).emitWithAck('game:action', { action: { type: 'DOUBT', playId: 1 } }),
      ),
    )) as Ack[];
    expect(acks.filter((a) => a.ok)).toHaveLength(1);
    for (const ack of acks.filter((a) => !a.ok)) {
      expect(ack.ok === false && ['DOUBT_CLOSED', 'BUSY'].includes(ack.error.code)).toBe(true);
    }
    await waitFor(() => events.filter((e) => e.type === 'DoubtCalled').length === 1, 10_000, 'the doubt');
    await new Promise((r) => setTimeout(r, 300));
    expect(events.filter((e) => e.type === 'DoubtCalled')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'PileTaken')).toEqual([expect.objectContaining({ count: 1 })]);

    // Now everybody plays. Mid-match, a player drops while a play is open to doubts.
    racing = false;
    for (const bot of bots) {
      const action = bot.lastView && chooseAction(bot.lastView);
      if (action) void bot.socket.emitWithAck('game:action', { action });
    }
    // Not the host: its socket records the events.
    const dropped = bots.find((b) => b !== host && b.id !== authorId) as DesconfiaBot;
    await waitFor(
      () => {
        const window = dropped.lastView?.view.doubtWindow;
        return !!window && window.playerId !== dropped.id && !window.lastCard;
      },
      60_000,
      'a play open to doubts',
    );
    const snapshotsBefore = dropped.snapshots;
    await reconnect(dropped, (bot) => attach(bot as DesconfiaBot));
    await waitFor(() => dropped.snapshots > snapshotsBefore, 10_000, 'reconnect snapshot');
    const snapshot = received.get(dropped.id)?.findLast((m) => m.snapshot);
    const window = snapshot?.view.doubtWindow;
    if (window && window.playerId !== dropped.id) {
      expect(snapshot?.validActions).toContainEqual({ type: 'DOUBT', playId: window.playId });
    }

    await waitFor(() => bots.every((b) => b.result !== null), 200_000, 'match end');

    // Audit: at every seq, nobody's view names a card another player holds at that seq,
    // except the cards of a play that was just turned over.
    const bySeq = new Map(
      bots.map((b) => [b.id, new Map((received.get(b.id) ?? []).map((m) => [m.seq, m]))]),
    );
    let audited = 0;
    for (const bot of bots) {
      for (const message of received.get(bot.id) ?? []) {
        const json = JSON.stringify(message);
        const revealed = new Set(message.view.lastReveal?.cards.map((c) => c.id) ?? []);
        for (const other of bots.filter((b) => b.id !== bot.id)) {
          const theirs = bySeq.get(other.id)?.get(message.seq)?.view.me?.hand ?? [];
          for (const card of theirs) if (!revealed.has(card.id)) expect(json).not.toContain(`"${card.id}"`);
          audited += theirs.length;
        }
        expect(message.view.seats.find((s) => s.id === bot.id)?.handCount).toBe(message.view.me?.hand.length);
      }
    }
    expect(audited).toBeGreaterThan(0);
    for (const event of events) {
      if (event.type === 'Played' || event.type === 'PileTaken' || event.type === 'NewPile') {
        expect(JSON.stringify(event)).not.toMatch(/"(?:(?:10|[2-9JQKA])[SHDC]|JK[12])"/);
      }
    }
    expect(events.filter((e) => e.type === 'Revealed').length).toBeGreaterThan(1);

    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.standings).toHaveLength(6);
    expect(result.standings[0]).toMatchObject({ outcome: 'WINNER', position: 1, score: 0 });
    for (const standing of result.standings.slice(1)) expect(standing.outcome).toBe('PLACED');

    const history = await api<MatchHistoryEntry[]>(host.token, '/me/matches');
    const recorded = history.find((m) => m.id === result.matchId);
    const own = result.standings.find((s) => s.playerId === host.id);
    expect(recorded).toMatchObject({ gameId: 'desconfia', outcome: own?.outcome, score: own?.score });
    expect(recorded?.players).toHaveLength(6);
  });
});
