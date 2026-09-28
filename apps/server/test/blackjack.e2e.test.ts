/**
 * Blackjack over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * a SESSION table. Three players sit down, a fourth joins mid-session and one
 * gets up in the middle of a hand; the host ends the session and the result
 * (net chips) is recorded for everyone who played. No view may ever carry the
 * dealer's hole card before it is turned over.
 */
import { randomUUID } from 'node:crypto';
import { basicStrategy, type BlackjackAction, type BlackjackView, type Decision } from '@cardroom/blackjack';
import type { Ack, GameViewMessage, JoinedRoom, MatchHistoryEntry, MatchResult } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, startMatch, waitFor, type Bot } from './e2e-helpers';

type BlackjackBot = Bot<BlackjackView, BlackjackAction>;
type Message = GameViewMessage<BlackjackView, BlackjackAction>;

const DECISIONS = new Set<string>(['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER']);

/** Bets the minimum, rebuys when broke, never insures, plays basic strategy. */
function chooseAction(message: Message): BlackjackAction | null {
  const actions = message.validActions;
  const simple = actions.find(
    (a) =>
      a.type === 'PLACE_BET' ||
      a.type === 'REBUY' ||
      ((a.type === 'INSURANCE' || a.type === 'EVEN_MONEY') && !a.take),
  );
  if (simple) return simple;
  const allowed = new Set(actions.map((a) => a.type).filter((type) => DECISIONS.has(type)) as Decision[]);
  const { view } = message;
  const turn = view.turn;
  const hand = turn && view.seats.find((s) => s.seatIndex === turn.seatIndex)?.hands[turn.handIndex];
  const up = view.dealer.cards[0];
  if (allowed.size === 0 || !hand || !up) return null;
  return { type: basicStrategy(hand.cards, up, allowed) };
}

let bots: BlackjackBot[] = [];
const rejections: string[] = [];
const received = new Map<string, Message[]>();
const attach = (bot: BlackjackBot) =>
  attachBot(bot, chooseAction, rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

const seatOf = (bot: BlackjackBot, playerId: string) =>
  bot.lastView?.view.seats.find((seat) => seat.playerId === playerId);

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Blackjack over Socket.IO', () => {
  it('a session where players come and go ends with every player’s net result', async () => {
    bots = await createBots<BlackjackView, BlackjackAction>(`bj_${randomUUID().slice(0, 6)}`, 4);
    const [host, second, leaver, latecomer] = bots as [
      BlackjackBot,
      BlackjackBot,
      BlackjackBot,
      BlackjackBot,
    ];
    [host, second, leaver].forEach(attach);
    const code = await startMatch([host, second, leaver], 'blackjack', { hintsEnabled: true }, 4);

    await waitFor(() => (host.lastView?.view.roundsDealt ?? 0) >= 2, 90_000, 'two rounds');

    // A fourth player sits down at the running table and is dealt in from the next bets.
    attach(latecomer);
    const joined = (await latecomer.socket
      .timeout(8000)
      .emitWithAck('room:join', { code })) as Ack<JoinedRoom>;
    expect(joined.ok && joined.data.room.status).toBe('PLAYING');
    await waitFor(() => (seatOf(host, latecomer.id)?.roundsPlayed ?? 0) >= 1, 90_000, 'latecomer dealt in');

    // Someone gets up with cards on the table: the hand stands, is settled, the seat frees afterwards.
    await waitFor(
      () => (seatOf(host, leaver.id)?.hands.length ?? 0) > 0 && host.lastView?.view.phase === 'PLAYER_TURNS',
      90_000,
      'the leaver in a hand',
    );
    const roundsWhenLeaving = seatOf(host, leaver.id)?.roundsPlayed ?? 0;
    expect((await leaver.socket.timeout(8000).emitWithAck('room:leave')) as Ack).toEqual({ ok: true });
    await waitFor(() => seatOf(host, leaver.id) === undefined, 60_000, 'the seat to free');
    expect(host.lastView?.view.session.find((row) => row.playerId === leaver.id)).toMatchObject({
      seated: false,
      roundsPlayed: roundsWhenLeaving,
    });

    // The host ends the session; it closes once the round in play is settled.
    expect((await host.socket.timeout(8000).emitWithAck('room:end')) as Ack).toEqual({ ok: true });
    const again = (await host.socket.timeout(8000).emitWithAck('room:end')) as Ack;
    if (!again.ok) expect(['CANNOT_END', 'GAME_NOT_RUNNING']).toContain(again.error.code);
    await waitFor(() => [host, second, latecomer].every((b) => b.result !== null), 60_000, 'session end');
    if (rejections.length > 0) console.warn('rejected actions:', rejections);

    // Audit: until the dealer turns it over, the hole card appears in no view of anyone.
    let audited = 0;
    for (const messages of received.values()) {
      const revealed = new Map<number, string>();
      for (const { view } of messages) {
        const hole = view.dealer.cards[1];
        if (view.dealer.cards.length > 1 && hole) revealed.set(view.roundsDealt, hole.uid);
      }
      for (const message of messages) {
        const { view } = message;
        if (view.dealer.cards.length < 2 || view.dealer.cards[1] !== null) continue;
        const hole = revealed.get(view.roundsDealt);
        if (!hole) continue;
        expect(JSON.stringify(message)).not.toContain(`"${hole}"`);
        audited += 1;
      }
    }
    expect(audited).toBeGreaterThan(0);

    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    const ids = result.standings.map((s) => s.playerId).sort();
    expect(ids).toEqual([host.id, second.id, leaver.id, latecomer.id].sort());
    for (const standing of result.standings) {
      expect(standing.outcome).toBe('PLACED');
      expect(Number.isInteger(standing.score)).toBe(true);
      expect(standing.position).toBeGreaterThanOrEqual(1);
    }
    const scores = result.standings.map((s) => s.score ?? 0);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    // Everyone who sat down has the session in their history, the leaver and the latecomer too.
    for (const bot of [leaver, latecomer]) {
      const history = await api<MatchHistoryEntry[]>(bot.token, '/me/matches');
      const recorded = history.find((m) => m.id === result.matchId);
      const own = result.standings.find((s) => s.playerId === bot.id);
      expect(recorded).toMatchObject({ gameId: 'blackjack', outcome: 'PLACED', score: own?.score });
      expect(recorded?.players).toHaveLength(4);
    }
  });
});
