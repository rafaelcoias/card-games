/**
 * Fodinha over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * four players play a whole match driven by the server's scheduled pauses and
 * blind auto-plays; one of them drops and reconnects in the middle of a blind
 * round. No client may ever receive its own blind card, and the result must be
 * recorded with outcomes and scores.
 */
import { randomUUID } from 'node:crypto';
import type { FodinhaAction, FodinhaView } from '@cardroom/fodinha';
import type { GameViewMessage, MatchHistoryEntry, MatchResult } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, reconnect, startMatch, waitFor, type Bot } from './e2e-helpers';

type FodinhaBot = Bot<FodinhaView, FodinhaAction>;
type Message = GameViewMessage<FodinhaView, FodinhaAction>;

const ORDER = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const strength = (id: string) => (id === 'AD' ? 99 : ORDER.indexOf(id.slice(0, -1)));

/** Bids the lowest allowed value and throws the lowest card. */
function chooseAction(message: Message): FodinhaAction | null {
  const actions = message.validActions;
  const bid = actions.find((a) => a.type === 'PLACE_BID');
  if (bid) return bid;
  const plays = actions.filter(
    (a): a is Extract<FodinhaAction, { type: 'PLAY_CARD' }> => a.type === 'PLAY_CARD',
  );
  return plays.sort((a, b) => strength(a.cardId) - strength(b.cardId))[0] ?? null;
}

let bots: FodinhaBot[] = [];
const rejections: string[] = [];
/** Every view each player received, to audit hidden information afterwards. */
const received = new Map<string, Message[]>();
const attach = (bot: FodinhaBot) =>
  attachBot(bot, chooseAction, rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Fodinha over Socket.IO', () => {
  it('four players finish a match; blind cards never reach their owners, even after a reconnect', async () => {
    bots = await createBots<FodinhaView, FodinhaAction>(`fod_${randomUUID().slice(0, 6)}`, 4);
    bots.forEach(attach);
    const host = bots[0] as FodinhaBot;
    await startMatch(bots, 'fodinha', { maxPoints: 3, maxHandSize: 3 });

    // Round 1 is blind. Wait until the server is auto-playing it, then drop a player.
    const dropped = bots[2] as FodinhaBot;
    await waitFor(
      () => {
        const view = host.lastView?.view;
        return !!view && view.blind && view.phase === 'PLAYING' && view.trick.length <= 1;
      },
      30_000,
      'blind round being played',
    );
    const snapshotsBefore = dropped.snapshots;
    await reconnect(dropped, (bot) => attach(bot as FodinhaBot));
    await waitFor(() => dropped.snapshots > snapshotsBefore, 10_000, 'reconnect snapshot');
    const snapshot = received.get(dropped.id)?.findLast((m) => m.snapshot);
    expect(snapshot?.view.blind).toBe(true);
    expect(snapshot?.view.me?.hand).toBeNull();

    await waitFor(() => bots.every((b) => b.result !== null), 200_000, 'match end');
    if (rejections.length > 0) console.warn('rejected actions:', rejections);

    // Audit: in a blind round, while a player still holds their card, no view of theirs names it.
    const bySeq = (id: string) => new Map((received.get(id) ?? []).map((m) => [m.seq, m]));
    let audited = 0;
    for (const bot of bots) {
      for (const message of received.get(bot.id) ?? []) {
        const view = message.view;
        if (view.blind && view.me && view.me.handCount === 1) {
          expect(view.me.hand).toBeNull();
          const other = bots.find((b) => b.id !== bot.id) as FodinhaBot;
          const seen = bySeq(other.id).get(message.seq)?.view;
          const ownCard = seen?.seats.find((s) => s.id === bot.id)?.visibleHand?.[0]?.id;
          if (ownCard) {
            expect(JSON.stringify(message)).not.toContain(`"${ownCard}"`);
            audited += 1;
          }
        }
        if (!view.blind) expect(view.seats.every((s) => s.visibleHand === null)).toBe(true);
      }
    }
    expect(audited).toBeGreaterThan(0);

    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.standings).toHaveLength(4);
    const losers = result.standings.filter((s) => s.outcome === 'LOSER');
    expect(losers.length).toBeGreaterThan(0);
    for (const standing of result.standings) {
      expect(standing.outcome === 'LOSER' || standing.outcome === 'SURVIVOR').toBe(true);
      expect((standing.score ?? 0) >= 3).toBe(standing.outcome === 'LOSER');
      expect(standing.position).toBeUndefined();
    }

    const history = await api<MatchHistoryEntry[]>(host.token, '/me/matches');
    const recorded = history.find((m) => m.id === result.matchId);
    const own = result.standings.find((s) => s.playerId === host.id);
    expect(recorded).toMatchObject({ gameId: 'fodinha', outcome: own?.outcome, score: own?.score });
    expect(recorded?.players).toHaveLength(4);
  });
});
