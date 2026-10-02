/**
 * Olho over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * a SESSION table (08, phase 3). Three players start, a fourth sits down
 * mid-session and plays from the next game, one gets up in the middle of a
 * game, and cards are really swapped between the roles. After three games
 * the host ends the session: everyone who played a game has a result by
 * points. No view may carry a card its player may not see.
 */
import { randomUUID } from 'node:crypto';
import type { OlhoAction, OlhoView } from '@cardroom/olho';
import type { Ack, GameViewMessage, JoinedRoom, MatchHistoryEntry, MatchResult } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, startMatch, waitFor, type Bot } from './e2e-helpers';

type OlhoBot = Bot<OlhoView, OlhoAction>;
type Message = GameViewMessage<OlhoView, OlhoAction>;

const CARD_ID = /"(?:(?:10|[2-9JQKA])[SHDC]|JK[12])"/g;

/** Gives back the lowest cards, always escapes, plays the lowest play that beats, passes otherwise. */
function chooseAction({ validActions }: Message): OlhoAction | null {
  return (
    validActions.find((a) => a.type === 'RETURN_CARDS') ??
    validActions.find((a) => a.type === 'ESCAPE') ??
    validActions.find((a) => a.type === 'PLAY') ??
    validActions.find((a) => a.type === 'PASS' || a.type === 'ACCEPT_SKIP') ??
    null
  );
}

let bots: OlhoBot[] = [];
const rejections: string[] = [];
/** Every view each player received, to audit hidden information afterwards. */
const received = new Map<string, Message[]>();
const attach = (bot: OlhoBot) =>
  attachBot(bot, chooseAction, rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

const view = (bot: OlhoBot) => bot.lastView?.view;
const seatOf = (bot: OlhoBot, playerId: string) => view(bot)?.seats.find((s) => s.id === playerId);

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Olho over Socket.IO', () => {
  it('a session with an exchange, a latecomer and a leaver ends with everyone’s points', async () => {
    bots = await createBots<OlhoView, OlhoAction>(`olho_${randomUUID().slice(0, 6)}`, 4);
    const [host, second, leaver, latecomer] = bots as [OlhoBot, OlhoBot, OlhoBot, OlhoBot];
    [host, second, leaver].forEach(attach);
    const code = await startMatch([host, second, leaver], 'olho', {}, 5);

    await waitFor(() => (view(host)?.gamesCompleted ?? 0) >= 1, 120_000, 'the first game');

    // A fourth player sits down mid-session: they wait for the next deal, without a role.
    attach(latecomer);
    const joined = (await latecomer.socket
      .timeout(8000)
      .emitWithAck('room:join', { code })) as Ack<JoinedRoom>;
    expect(joined.ok && joined.data.room.status).toBe('PLAYING');
    await waitFor(() => !!seatOf(host, latecomer.id), 120_000, 'the latecomer dealt in');
    expect(view(latecomer)?.me?.waiting).toBe(false);

    // Someone gets up with cards in hand: they are out of the game and their seat frees when it ends.
    await waitFor(
      () => view(host)?.phase === 'PLAYING' && (seatOf(host, leaver.id)?.handCount ?? 0) > 0,
      120_000,
      'the leaver in a game',
    );
    expect((await leaver.socket.timeout(8000).emitWithAck('room:leave')) as Ack).toEqual({ ok: true });
    await waitFor(
      () => seatOf(host, leaver.id)?.leaving === true || !seatOf(host, leaver.id),
      30_000,
      'leaving',
    );
    await waitFor(() => !seatOf(host, leaver.id), 120_000, 'the seat to free');
    expect(view(host)?.session.find((row) => row.playerId === leaver.id)).toMatchObject({ seated: false });
    expect(view(host)?.lastGame?.order.at(-1)).toBe(leaver.id);

    await waitFor(() => (view(host)?.gamesCompleted ?? 0) >= 3, 180_000, 'three games');

    // The host ends the session: at once, the game in play does not count.
    expect((await host.socket.timeout(8000).emitWithAck('room:end')) as Ack).toEqual({ ok: true });
    await waitFor(() => [host, second, latecomer].every((b) => b.result !== null), 30_000, 'session end');
    if (rejections.length > 0) console.warn('rejected actions:', rejections);

    // Cards really changed hands, and only the two players of a pair ever saw them.
    const exchanges = [...received.values()].flat().filter((m) => m.view.exchange?.mine?.given);
    expect(exchanges.length).toBeGreaterThan(0);
    let audited = 0;
    for (const messages of received.values()) {
      for (const { view: v } of messages) {
        const allowed = new Set([
          ...(v.me?.hand ?? []).map((c) => c.id),
          ...v.trick.plays.flatMap((p) => p.cards.map((c) => c.id)),
          ...(v.exchange?.mine?.given ?? []).map((c) => c.id),
          ...(v.exchange?.mine?.returned ?? []).map((c) => c.id),
        ]);
        for (const id of (JSON.stringify(v).match(CARD_ID) ?? []).map((m) => m.slice(1, -1))) {
          expect(allowed.has(id), `${id} in a view of ${v.selfId}`).toBe(true);
        }
        audited += 1;
      }
    }
    expect(audited).toBeGreaterThan(100);

    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.standings.map((s) => s.playerId).sort()).toEqual(
      [host.id, second.id, leaver.id, latecomer.id].sort(),
    );
    const scores = result.standings.map((s) => s.score ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(scores.reduce((a, b) => a + b, 0)).toBe(0);
    expect(result.standings[0]?.outcome).toBe('WINNER');
    expect(result.standings.at(-1)?.outcome).toBe('LOSER');

    // Everyone who played has the session in their history, the leaver and the latecomer too.
    for (const bot of [leaver, latecomer]) {
      const history = await api<MatchHistoryEntry[]>(bot.token, '/me/matches');
      const recorded = history.find((m) => m.id === result.matchId);
      const own = result.standings.find((s) => s.playerId === bot.id);
      expect(recorded).toMatchObject({ gameId: 'olho', score: own?.score });
      expect(recorded?.players).toHaveLength(4);
    }
  });
});
