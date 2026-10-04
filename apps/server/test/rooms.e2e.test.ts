/**
 * A room's life between matches, over Socket.IO against a RUNNING server (see
 * multiplayer.e2e.test.ts): a rematch starts by itself once everyone asks for
 * it, the host changes the game for the same players, a room whose host
 * leaves closes for everyone, and whoever comes in during a match waits for
 * the next one, ready before it ends.
 */
import { randomUUID } from 'node:crypto';
import type { PeixinhoAction, PeixinhoView } from '@cardroom/peixinho';
import type { Ack, JoinedRoom, RoomCloseReason, RoomState } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { attachBot, createBots, startMatch, waitFor, type Bot } from './e2e-helpers';

type PeixinhoBot = Bot<PeixinhoView, PeixinhoAction>;

let bots: PeixinhoBot[] = [];

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('rooms between matches', () => {
  it('rematch, change of game, and closing when the host leaves', async () => {
    bots = await createBots<PeixinhoView, PeixinhoAction>(`rms_${randomUUID().slice(0, 6)}`, 2);
    const [host, guest] = bots as [PeixinhoBot, PeixinhoBot];
    const rooms: RoomState[] = [];
    guest.socket.on('room:state', (room) => rooms.push(room));
    const closed: RoomCloseReason[] = [];
    guest.socket.on('room:closed', ({ reason }) => closed.push(reason));
    const rejections: string[] = [];
    for (const bot of bots) attachBot(bot, (view) => view.validActions[0] ?? null, rejections);

    const code = await startMatch(bots, 'peixinho');
    await waitFor(() => bots.every((b) => b.result !== null), 60_000, 'first match');
    const first = host.result?.matchId;

    // Rematch: the guest asks first and waits; the host asking too starts it, with no "start".
    const ready = (bot: PeixinhoBot) => bot.socket.timeout(8000).emitWithAck('room:ready', { ready: true });
    expect((await ready(guest)) as Ack).toEqual({ ok: true });
    await waitFor(
      () => rooms.at(-1)?.players.find((p) => p.id === guest.id)?.ready === true,
      5_000,
      'the guest waiting for a rematch',
    );
    expect(rooms.at(-1)?.status).toBe('OPEN');
    expect((await ready(host)) as Ack).toEqual({ ok: true });
    await waitFor(() => rooms.at(-1)?.status === 'PLAYING', 5_000, 'the rematch to start');
    await waitFor(
      () => bots.every((b) => b.result !== null && b.result.matchId !== first),
      60_000,
      'the rematch to end',
    );

    // Another game for the same players: only the host, and the sequence starts over.
    const settings = { gameId: 'gringo', maxPlayers: 4, isPrivate: false, config: {} };
    const refused = (await guest.socket.timeout(8000).emitWithAck('room:configure', settings)) as Ack;
    expect(!refused.ok && refused.error.code).toBe('NOT_HOST');
    expect((await host.socket.timeout(8000).emitWithAck('room:configure', settings)) as Ack).toEqual({
      ok: true,
    });
    await waitFor(() => rooms.at(-1)?.gameId === 'gringo', 5_000, 'the new game');
    expect(rooms.at(-1)).toMatchObject({
      gameName: 'Gringo',
      maxPlayers: 4,
      isPrivate: false,
      lastResult: null,
    });

    // The host leaves: the room, and its chat, are gone for everyone.
    expect((await host.socket.timeout(8000).emitWithAck('room:leave')) as Ack).toEqual({ ok: true });
    await waitFor(() => closed.length > 0, 5_000, 'the room to close');
    expect(closed).toEqual(['HOST_LEFT']);
    const rejoin = (await guest.socket.timeout(8000).emitWithAck('room:join', { code })) as Ack<JoinedRoom>;
    expect(!rejoin.ok && rejoin.error.code).toBe('ROOM_NOT_FOUND');
  });
});

describe('coming in during a match', () => {
  it('waits in the room, says it is ready, and plays the next match', async () => {
    const waiters = await createBots<PeixinhoView, PeixinhoAction>(`wait_${randomUUID().slice(0, 6)}`, 3);
    bots.push(...waiters);
    const [host, guest, newcomer] = waiters as [PeixinhoBot, PeixinhoBot, PeixinhoBot];
    const rooms: RoomState[] = [];
    host.socket.on('room:state', (room) => rooms.push(room));
    const newcomerViews: string[] = [];
    const rejections: string[] = [];
    for (const bot of waiters) {
      attachBot(
        bot,
        (view) => view.validActions[0] ?? null,
        rejections,
        (view) => {
          if (bot === newcomer) newcomerViews.push(view.matchId);
        },
      );
    }
    const latest = () => rooms.at(-1);
    const player = (bot: PeixinhoBot) => latest()?.players.find((p) => p.id === bot.id);
    const ready = (bot: PeixinhoBot, value = true) =>
      bot.socket.timeout(8000).emitWithAck('room:ready', { ready: value }) as Promise<Ack>;

    // A seat is still free: the room takes them in while the match goes on.
    const code = await startMatch([host, guest], 'peixinho', {}, 3);
    await waitFor(() => host.lastView !== null, 5_000, 'the first match');
    const first = host.lastView?.matchId;
    const joined = (await newcomer.socket
      .timeout(8000)
      .emitWithAck('room:join', { code })) as Ack<JoinedRoom>;
    if (!joined.ok) throw new Error(joined.error.code);
    expect(joined.data.room.status).toBe('PLAYING');
    expect(joined.data.room.players.map((p) => [p.id, p.waiting])).toEqual([
      [host.id, false],
      [guest.id, false],
      [newcomer.id, true],
    ]);

    // They say they are in for the next one; the players cannot, their match is not over.
    expect(await ready(newcomer)).toEqual({ ok: true });
    await waitFor(() => player(newcomer)?.ready === true, 5_000, 'the newcomer to be ready');
    const early = await ready(guest);
    expect(!early.ok && early.error.code).toBe('ROOM_IN_PROGRESS');

    await waitFor(
      () => [host, guest].every((b) => b.result?.matchId === first),
      60_000,
      'the first match to end',
    );
    expect(newcomerViews).toEqual([]); // never at that table
    await waitFor(() => latest()?.status === 'OPEN', 5_000, 'the room back between matches');
    // Still ready: the rematch needs only the players who just finished.
    expect(player(newcomer)).toMatchObject({ ready: true, waiting: false });
    expect(player(guest)?.ready).toBe(false);
    expect(await ready(guest)).toEqual({ ok: true });
    expect(await ready(host)).toEqual({ ok: true });

    await waitFor(() => latest()?.status === 'PLAYING', 5_000, 'the rematch to start');
    const second = latest()?.matchId;
    expect(second).not.toBe(first);
    expect(latest()?.players.every((p) => !p.waiting)).toBe(true);
    // Now they are at the table: the match deals them in and they play their turns.
    await waitFor(
      () => newcomer.lastView?.matchId === second && (newcomer.lastView?.seq ?? 0) > 0,
      30_000,
      'the newcomer to play the rematch',
    );
    expect(new Set(newcomerViews)).toEqual(new Set([second]));
  });
});
