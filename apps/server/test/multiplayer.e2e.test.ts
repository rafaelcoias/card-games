/**
 * End-to-end protocol test against a RUNNING server backed by the Firebase
 * emulators (`pnpm emulators` + server with the emulator env):
 *   pnpm --filter @cardroom/server test:e2e
 * Four socket clients create/join a room, play a full Mexicana match, one of
 * them drops and reconnects mid-game, and the result must be persisted.
 */
import { randomUUID } from 'node:crypto';
import type { MexicanaAction, MexicanaView } from '@cardroom/mexicana';
import type { GameViewMessage, MatchHistoryEntry, MatchResult } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, reconnect, startMatch, waitFor, type Bot } from './e2e-helpers';

type MexicanaBot = Bot<MexicanaView, MexicanaAction>;

/**
 * Deterministic, reasonable strategy: lowest single card, else blind card, else pick up
 * (taking the first face-up card offered when none of them can be played).
 */
function chooseAction(view: GameViewMessage<MexicanaView, MexicanaAction>): MexicanaAction | null {
  const actions = view.validActions;
  if (actions.length === 0) return null;
  const choose = actions.find((a) => a.type === 'CHOOSE_FACE_UP');
  if (choose) return choose;
  const order = ['2', '3', '4', '5', '6', '7', '8', '9', 'J', 'Q', 'K', 'A', '10', 'JOKER'];
  const rankOf = (id: string) => (id.startsWith('JK') ? 'JOKER' : id.slice(0, -1));
  const singles = actions.filter(
    (a): a is Extract<MexicanaAction, { type: 'PLAY_CARDS' }> =>
      a.type === 'PLAY_CARDS' && a.cardIds.length === 1,
  );
  singles.sort((a, b) => order.indexOf(rankOf(a.cardIds[0]!)) - order.indexOf(rankOf(b.cardIds[0]!)));
  return singles[0] ?? actions.find((a) => a.type === 'PLAY_FACE_DOWN') ?? actions[0] ?? null;
}

let bots: MexicanaBot[] = [];
const rejections: string[] = [];
const attach = (bot: MexicanaBot) => attachBot(bot, chooseAction, rejections);

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Mexicana over Socket.IO', () => {
  it('four players complete a match, survive a reconnect and get it recorded', async () => {
    bots = await createBots<MexicanaView, MexicanaAction>(`bot_${randomUUID().slice(0, 6)}`, 4);
    bots.forEach(attach);
    const host = bots[0] as MexicanaBot;
    await startMatch(bots, 'mexicana');

    // Mid-game: drop one player and come back; the server must resync them.
    await waitFor(() => (bots[2]?.lastView?.seq ?? 0) > 20, 60_000, 'some progress');
    const dropped = bots[2] as MexicanaBot;
    await reconnect(dropped, (bot) => attach(bot as MexicanaBot));
    await waitFor(() => dropped.snapshots > 0, 10_000, 'reconnect snapshot');

    await waitFor(() => bots.every((b) => b.result !== null), 180_000, 'match end');
    // Rate-limited bot bursts are expected (and retried); anything else is worth seeing.
    if (rejections.length > 0) console.warn('rejected actions:', rejections);
    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.standings.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(result.standings.map((r) => r.outcome)).toEqual(['WINNER', 'PLACED', 'PLACED', 'LOSER']);
    expect(new Set(result.standings.map((r) => r.playerId))).toEqual(new Set(bots.map((b) => b.id)));

    // Each client only ever sees its own hand; other seats are reduced to counts.
    for (const bot of bots) {
      const view = bot.lastView?.view as MexicanaView;
      expect(view.selfId).toBe(bot.id);
      for (const seat of view.seats) expect(Object.keys(seat)).not.toContain('hand');
    }

    const history = await api<MatchHistoryEntry[]>(host.token, '/me/matches');
    const recorded = history.find((m) => m.id === result.matchId);
    expect(recorded).toBeDefined();
    expect(recorded?.players).toHaveLength(4);
    const own = result.standings.find((r) => r.playerId === host.id);
    expect(recorded?.position).toBe(own?.position);
    expect(recorded?.outcome).toBe(own?.outcome);
  });
});
