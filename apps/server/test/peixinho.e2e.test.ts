/**
 * Peixinho over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * three players ask and fish until the 13 peixinhos are down; one of them drops
 * and reconnects in the middle. The server answers the asks itself, and nobody
 * may ever receive a card of another hand or of the pond.
 */
import { randomUUID } from 'node:crypto';
import type { PeixinhoAction, PeixinhoEvent, PeixinhoView } from '@cardroom/peixinho';
import type { GameEventsMessage, GameViewMessage, MatchHistoryEntry, MatchResult } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, reconnect, startMatch, waitFor, type Bot } from './e2e-helpers';

type PeixinhoBot = Bot<PeixinhoView, PeixinhoAction>;
type Message = GameViewMessage<PeixinhoView, PeixinhoAction>;

/**
 * Fishes the first spot; otherwise asks whoever was last heard asking for a rank
 * it holds (they must still have one), or anyone at random. Always asking the
 * same player would go round in circles once the pond is empty.
 */
function chooseAction(message: Message): PeixinhoAction | null {
  const actions = message.validActions;
  const fish = actions.find((a) => a.type === 'FISH');
  if (fish) return fish;
  for (const entry of [...message.view.askLog].reverse()) {
    const hit = actions.find(
      (a) => a.type === 'ASK' && a.targetId === entry.askerId && a.rank === entry.rank,
    );
    if (hit) return hit;
  }
  return actions[Math.floor(Math.random() * actions.length)] ?? null;
}

let bots: PeixinhoBot[] = [];
const rejections: string[] = [];
/** Every view each player received, to audit hidden information afterwards. */
const received = new Map<string, Message[]>();
const events: PeixinhoEvent[] = [];
const attach = (bot: PeixinhoBot) =>
  attachBot(bot, chooseAction, rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Peixinho over Socket.IO', () => {
  it('three players reach the 13 peixinhos; hands and the pond stay hidden, even after a reconnect', async () => {
    bots = await createBots<PeixinhoView, PeixinhoAction>(`pei_${randomUUID().slice(0, 6)}`, 3);
    bots.forEach(attach);
    const host = bots[0] as PeixinhoBot;
    host.socket.on('game:events', (message: GameEventsMessage) => {
      events.push(...(message.events as PeixinhoEvent[]));
    });
    await startMatch(bots, 'peixinho', { tableMemory: 'FULL' });

    // Mid-game: drop a player and bring them back.
    const dropped = bots[1] as PeixinhoBot;
    await waitFor(() => (host.lastView?.view.peixinhosTotal ?? 0) >= 2, 60_000, 'two peixinhos down');
    const handBefore = dropped.lastView?.view.me?.hand.map((c) => c.id);
    const snapshotsBefore = dropped.snapshots;
    await reconnect(dropped, (bot) => attach(bot as PeixinhoBot));
    await waitFor(() => dropped.snapshots > snapshotsBefore, 10_000, 'reconnect snapshot');
    const snapshot = received.get(dropped.id)?.findLast((m) => m.snapshot);
    expect(snapshot?.view.selfId).toBe(dropped.id);
    if (snapshot && dropped.lastView && snapshot.seq === dropped.lastView.seq) {
      expect(snapshot.view.me?.hand.map((c) => c.id)).toEqual(handBefore);
    }

    await waitFor(() => bots.every((b) => b.result !== null), 200_000, 'match end');
    if (rejections.length > 0) console.warn('rejected actions:', rejections);

    // Audit: at every seq, nobody's view names a card another player holds at that seq
    // (unless it was fished as the rank asked, which is shown to everyone).
    const bySeq = new Map<string, Map<number, Message>>(
      bots.map((b) => [b.id, new Map((received.get(b.id) ?? []).map((m) => [m.seq, m]))]),
    );
    let audited = 0;
    for (const bot of bots) {
      for (const message of received.get(bot.id) ?? []) {
        const json = JSON.stringify(message);
        const publicFish = message.view.lastFish?.caughtAsked ? message.view.lastFish.card?.id : null;
        for (const other of bots.filter((b) => b.id !== bot.id)) {
          const theirs = bySeq.get(other.id)?.get(message.seq)?.view.me?.hand ?? [];
          for (const card of theirs) {
            if (card.id !== publicFish) expect(json).not.toContain(`"${card.id}"`);
          }
          audited += theirs.length;
        }
        expect(message.view.seats.find((s) => s.id === bot.id)?.handCount).toBe(message.view.me?.hand.length);
      }
    }
    expect(audited).toBeGreaterThan(0);
    for (const event of events) {
      if (event.type === 'Fished') expect(event.card === null).toBe(!event.caughtAsked);
      if (event.type === 'Refilled') expect(JSON.stringify(event)).not.toMatch(/"(?:10|[2-9JQKA])[SHDC]"/);
    }
    expect(events.some((e) => e.type === 'CardsGiven')).toBe(true);
    expect(events.filter((e) => e.type === 'PeixinhoMade')).toHaveLength(13);

    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.standings).toHaveLength(3);
    expect(result.standings.reduce((sum, s) => sum + (s.score ?? 0), 0)).toBe(13);
    const top = Math.max(...result.standings.map((s) => s.score ?? 0));
    for (const standing of result.standings) {
      expect(standing.outcome === 'WINNER').toBe(standing.score === top);
      expect(standing.outcome === 'WINNER' || standing.outcome === 'PLACED').toBe(true);
    }

    const history = await api<MatchHistoryEntry[]>(host.token, '/me/matches');
    const recorded = history.find((m) => m.id === result.matchId);
    const own = result.standings.find((s) => s.playerId === host.id);
    expect(recorded).toMatchObject({ gameId: 'peixinho', outcome: own?.outcome, score: own?.score });
    expect(recorded?.players).toHaveLength(3);
  });
});
