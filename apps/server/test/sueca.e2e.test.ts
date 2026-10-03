/**
 * Sueca over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * four players choose their seats (and so their partners), play a match with
 * the chat closed during the hand, and one of them drops in the middle of a
 * trick: the table stops, its clock freezes, and it picks up exactly where it
 * was. In a rematch a player stays away past the wait, and the host — the only
 * one who may — waits longer, then ends the match without a result.
 */
import { randomUUID } from 'node:crypto';
import type { SuecaClientAction, SuecaView } from '@cardroom/sueca';
import type { Ack, GameViewMessage, JoinedRoom, MatchResult, MeResponse } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, connect, createBots, waitFor, type Bot } from './e2e-helpers';

type SuecaBot = Bot<SuecaView, SuecaClientAction>;
type Message = GameViewMessage<SuecaView, SuecaClientAction>;

/** While set, nobody moves (to look at a table that stands still). */
let hold = false;
const looked = new Set<string>();

/** Cuts from the top, plays its first legal card, and looks at the last trick once per hand. */
function chooseFor(bot: SuecaBot) {
  return (message: Message): SuecaClientAction | null => {
    if (hold || message.pause) return null;
    const { view, validActions } = message;
    const plays = validActions.filter((a) => a.type === 'PLAY');
    // The server only ever offers legal cards.
    for (const play of plays) expect(view.legalCardUids).toContain(play.cardUid);
    const lookKey = `${bot.id}:${message.matchId}:${view.handNumber}`;
    if (validActions.some((a) => a.type === 'VIEW_LAST_TRICK') && !looked.has(lookKey) && bot === bots[3]) {
      looked.add(lookKey);
      return { type: 'VIEW_LAST_TRICK' };
    }
    return validActions.find((a) => a.type === 'CHOOSE_CUT') ?? plays[0] ?? null;
  };
}

let bots: SuecaBot[] = [];
const rejections: string[] = [];
const received = new Map<string, Message[]>();
const attach = (bot: SuecaBot) =>
  attachBot(bot, chooseFor(bot), rejections, (message) => {
    received.set(bot.id, [...(received.get(bot.id) ?? []), message]);
  });

type LooseEmitter = { emitWithAck: (event: string, ...args: unknown[]) => Promise<unknown> };
/** Any client event, with its ack (the tests also send what the server must refuse). */
const emit = (bot: SuecaBot, event: string, payload?: unknown): Promise<Ack> =>
  (bot.socket.timeout(8000) as unknown as LooseEmitter).emitWithAck(
    event,
    ...(payload === undefined ? [] : [payload]),
  ) as Promise<Ack>;

/** Plays the move the bot would make on its latest view (after `hold` is lifted). */
async function nudge(): Promise<void> {
  for (const bot of bots) {
    const message = bot.lastView;
    const action = message && chooseFor(bot)(message);
    if (action) await bot.socket.timeout(8000).emitWithAck('game:action', { action });
  }
}

const viewOf = (bot: SuecaBot) => bot.lastView?.view;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function dropAndReturn(bot: SuecaBot, awayMs: number): Promise<void> {
  bot.socket.disconnect();
  await sleep(awayMs);
  bot.socket = await connect(bot);
  attach(bot);
}

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Sueca over Socket.IO', () => {
  it('seats, closed chat, a pause in the middle of a trick, and a match won by a pair', async () => {
    bots = await createBots<SuecaView, SuecaClientAction>(`sue_${randomUUID().slice(0, 6)}`, 4);
    bots.forEach(attach);
    const [host, east, north, west] = bots as [SuecaBot, SuecaBot, SuecaBot, SuecaBot];

    const created = (await host.socket.timeout(8000).emitWithAck('room:create', {
      gameId: 'sueca',
      maxPlayers: 4,
      isPrivate: true,
      config: { targetGames: 1, disconnectGraceMs: 30_000 },
    })) as Ack<JoinedRoom>;
    if (!created.ok) throw new Error(created.error.code);
    const code = created.data.room.code;
    for (const guest of [east, north, west]) {
      expect(((await guest.socket.timeout(8000).emitWithAck('room:join', { code })) as Ack).ok).toBe(true);
    }

    // Seats follow arrival (S, E, N, W). A taken seat cannot be taken; the host swaps two.
    expect(await emit(east, 'room:seat', { seat: 2 })).toMatchObject({ error: { code: 'SEAT_TAKEN' } });
    expect(await emit(east, 'room:swap-seats', { a: 1, b: 2 })).toMatchObject({
      error: { code: 'NOT_HOST' },
    });
    expect(await emit(host, 'room:swap-seats', { a: 1, b: 2 })).toEqual({ ok: true });
    // Now "east" sits North, the host's partner; "north" sits East.
    for (const guest of [east, north, west])
      expect(await emit(guest, 'room:ready', { ready: true })).toEqual({ ok: true });
    expect(await emit(host, 'room:start')).toEqual({ ok: true });

    // The bots play at once: a view on the clock lasts milliseconds, so look at all of them.
    const dealt = () => received.get(host.id)?.find((m) => m.view.phase === 'PLAYING');
    await waitFor(() => !!dealt(), 20_000, 'the cut and the deal');
    expect(dealt()?.view.seats.map((s) => s.playerId)).toEqual([host.id, north.id, east.id, west.id]);
    expect(viewOf(east)?.myTeam).toBe(viewOf(host)?.myTeam);
    expect(dealt()?.chatOpen).toBe(false);

    // No table talk while the hand is played: refused by the server, not just hidden.
    expect(await emit(east, 'room:chat', { text: 'tenho o ás' })).toMatchObject({
      error: { code: 'CHAT_CLOSED' },
    });

    // Freeze the bots in the middle of a trick, with someone on the clock.
    await waitFor(() => (viewOf(host)?.tricksPlayed ?? 0) >= 2, 60_000, 'two tricks');
    hold = true;
    // Moves already on their way land first (a trick may close and the next one open).
    await sleep(800);
    const onClock = () => {
      const view = viewOf(host);
      return !!view && view.phase === 'PLAYING' && !!host.lastView?.timer;
    };
    await waitFor(onClock, 10_000, 'someone on turn');
    if (viewOf(host)?.trick.plays.length === 0) {
      // Open the trick with one card, so the table stops in the middle of it.
      const leader = bots.find((b) => b.id === host.lastView?.timer?.playerIds[0]) as SuecaBot;
      await waitFor(
        () => leader.lastView?.validActions.some((a) => a.type === 'PLAY') ?? false,
        5_000,
        'lead',
      );
      const lead = leader.lastView?.validActions.find((a) => a.type === 'PLAY');
      expect(await emit(leader, 'game:action', { action: lead })).toEqual({ ok: true });
      await waitFor(() => onClock() && viewOf(host)?.trick.plays.length === 1, 5_000, 'a trick half played');
    }
    await sleep(400);
    const clock = host.lastView?.timer;
    expect(clock).toBeTruthy();
    const before = Date.now();
    const onTurn = bots.find((b) => b.id === clock?.playerIds[0]) as SuecaBot;
    const watcher = bots.find((b) => b !== onTurn) as SuecaBot;
    await sleep(1200);

    // The player on turn drops: the table stops, with nobody's clock running.
    const away = dropAndReturn(onTurn, 2500);
    await waitFor(() => !!watcher.lastView?.pause, 5_000, 'the pause');
    const paused = watcher.lastView as Message;
    expect(paused.view.phase).toBe('PAUSED');
    expect(paused.timer).toBeNull();
    expect(paused.pause).toMatchObject({ playerIds: [onTurn.id], expired: false, totalMs: 30_000 });
    expect(await emit(watcher, 'game:action', { action: { type: 'VIEW_LAST_TRICK' } })).toMatchObject({
      error: { code: 'PAUSED' },
    });
    expect(await emit(watcher, 'game:pause-decision', { decision: 'END' })).toMatchObject({ ok: false });
    await away;

    // Back: the same decision, with the time it had left (the 2.5 s away did not count).
    await waitFor(
      () => watcher.lastView?.pause === null && watcher.lastView.view.phase === 'PLAYING',
      8_000,
      'resume',
    );
    const resumed = watcher.lastView?.timer;
    const elapsed = Date.now() - before;
    expect(resumed?.playerIds).toEqual([onTurn.id]);
    expect(resumed?.remainingMs).toBeGreaterThan((clock?.remainingMs ?? 0) - 1200 - 1500);
    expect(resumed?.remainingMs).toBeLessThan((clock?.remainingMs ?? 0) - 1000);
    expect(elapsed).toBeGreaterThan(3500);
    hold = false;
    await nudge();

    await waitFor(() => bots.every((b) => b.result !== null), 200_000, 'match end');
    if (rejections.length > 0) console.warn('rejected actions:', rejections);
    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    const winners = result.standings.filter((s) => s.outcome === 'WINNER').map((s) => s.playerId);
    expect(winners).toHaveLength(2);
    // Partners win together: the host with the one sitting North, or East with West.
    expect([[host.id, east.id].sort(), [north.id, west.id].sort()]).toContainEqual([...winners].sort());
    expect(result.summary).toMatchObject({ targetGames: 1 });

    // The look at the last trick reached the one who asked, and only them.
    const looks = [...received.entries()].flatMap(([id, messages]) =>
      messages.filter((m) => m.view.lastTrickView !== null).map(() => id),
    );
    expect(new Set(looks)).toEqual(new Set([west.id]));

    // Nobody ever received a card of another hand (the face-up trump aside).
    const bySeq = new Map<string, Map<number, Message>>(
      bots.map((b) => [b.id, new Map((received.get(b.id) ?? []).map((m) => [m.seq, m]))]),
    );
    let audited = 0;
    for (const viewer of bots) {
      for (const message of received.get(viewer.id) ?? []) {
        const json = JSON.stringify(message);
        const trump = message.view.trump?.card?.uid;
        for (const other of bots) {
          if (other === viewer) continue;
          const theirs = bySeq.get(other.id)?.get(message.seq)?.view.myHand ?? [];
          for (const card of theirs) {
            if (card.uid !== trump) expect(json).not.toContain(`"${card.uid}"`);
            audited += 1;
          }
        }
      }
    }
    expect(audited).toBeGreaterThan(1000);

    const history = await api<{ id: string; outcome: string | null }[]>(host.token, '/me/matches');
    const own = result.standings.find((s) => s.playerId === host.id);
    expect(history.find((m) => m.id === result.matchId)).toMatchObject({ outcome: own?.outcome });
  });

  it('a player who stays away: the host waits longer, then ends the match without a result', async () => {
    const [host, , north, west] = bots as [SuecaBot, SuecaBot, SuecaBot, SuecaBot];
    const played = (await api<MeResponse>(host.token, '/me')).profile?.stats.played ?? 0;
    for (const bot of bots) bot.result = null;
    hold = true;
    // A rematch starts by itself once everyone asks for it.
    for (const bot of bots) expect(await emit(bot, 'room:ready', { ready: true })).toEqual({ ok: true });
    await waitFor(
      () => !!host.lastView && host.lastView.matchId !== received.get(host.id)?.[0]?.matchId,
      10_000,
      'rematch',
    );
    await waitFor(() => viewOf(host)?.phase === 'CUT', 10_000, 'the cut');

    west.socket.disconnect();
    await waitFor(() => !!host.lastView?.pause, 5_000, 'pause');
    // The cut is part of the hand: the chat stays closed.
    expect(host.lastView?.chatOpen).toBe(false);
    expect(await emit(host, 'game:pause-decision', { decision: 'WAIT' })).toMatchObject({
      error: { code: 'NOT_PAUSED' },
    });
    await waitFor(() => host.lastView?.pause?.expired === true, 40_000, 'the wait to run out');
    expect(await emit(north, 'game:pause-decision', { decision: 'END' })).toMatchObject({
      error: { code: 'NOT_HOST' },
    });
    expect(await emit(host, 'game:pause-decision', { decision: 'WAIT' })).toEqual({ ok: true });
    await waitFor(() => host.lastView?.pause?.expired === false, 5_000, 'two more minutes');
    expect(host.lastView?.pause?.totalMs).toBe(120_000);
    expect(await emit(host, 'game:pause-decision', { decision: 'END' })).toMatchObject({
      error: { code: 'NOT_PAUSED' },
    });

    // Back in time, then gone again for good.
    west.socket = await connect(west);
    attach(west);
    await waitFor(() => host.lastView?.pause === null, 8_000, 'resume');
    west.socket.disconnect();
    await waitFor(() => host.lastView?.pause?.expired === true, 40_000, 'the second wait to run out');
    expect(await emit(host, 'game:pause-decision', { decision: 'END' })).toEqual({ ok: true });
    await waitFor(() => host.result !== null, 10_000, 'the end');
    expect(host.result).toMatchObject({ aborted: true, abortReason: 'HOST_ENDED', standings: [] });
    // Without a result it counts for nobody.
    expect((await api<MeResponse>(host.token, '/me')).profile?.stats.played).toBe(played);
  });
});
