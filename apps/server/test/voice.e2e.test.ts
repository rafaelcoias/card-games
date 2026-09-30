/**
 * Voice chat signaling over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * the mic flag is shared with the room, WebRTC signals are relayed only between
 * members of the same room, and a dropped socket turns the mic off.
 */
import { randomUUID } from 'node:crypto';
import type { Ack, JoinedRoom, RoomState, VoiceConfig, VoiceSignal } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { connect, createBots, waitFor, type Bot } from './e2e-helpers';

let bots: Bot[] = [];

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('voice chat', () => {
  it('shares the mic flag and relays signals within the room only', async () => {
    bots = await createBots(`vc_${randomUUID().slice(0, 6)}`, 3);
    const [host, guest, outsider] = bots as [Bot, Bot, Bot];

    const created = (await host.socket.timeout(8000).emitWithAck('room:create', {
      gameId: 'peixinho',
      maxPlayers: 4,
      isPrivate: true,
    })) as Ack<JoinedRoom>;
    if (!created.ok) throw new Error(created.error.code);
    expect(created.data.room.players[0]?.voice).toBe(false);
    const joined = (await guest.socket
      .timeout(8000)
      .emitWithAck('room:join', { code: created.data.room.code })) as Ack<JoinedRoom>;
    expect(joined.ok).toBe(true);

    let guestRoom: RoomState | null = null;
    guest.socket.on('room:state', (room) => {
      guestRoom = room;
    });
    const voiceOf = (room: RoomState | null, id: string) => room?.players.find((p) => p.id === id)?.voice;

    const config = (await host.socket.timeout(8000).emitWithAck('voice:config')) as Ack<VoiceConfig>;
    expect(config.ok && config.data.iceServers[0]?.urls[0]).toMatch(/^stun:/);

    expect(await host.socket.timeout(8000).emitWithAck('voice:set', { enabled: true })).toEqual({ ok: true });
    await waitFor(() => voiceOf(guestRoom, host.id) === true, 5_000, 'mic on');

    const received: VoiceSignal[] = [];
    guest.socket.on('voice:signal', (signal) => received.push(signal));
    const outsiderReceived: VoiceSignal[] = [];
    outsider.socket.on('voice:signal', (signal) => outsiderReceived.push(signal));

    host.socket.emit('voice:signal', { to: guest.id, cid: 'c1', description: { type: 'offer', sdp: 'v=0' } });
    await waitFor(() => received.length === 1, 5_000, 'relayed offer');
    expect(received[0]).toEqual({ from: host.id, cid: 'c1', description: { type: 'offer', sdp: 'v=0' } });

    // Nobody outside the room is reachable, in either direction; malformed signals are ignored.
    host.socket.emit('voice:signal', { to: outsider.id, cid: 'c2', candidate: { candidate: '' } });
    outsider.socket.emit('voice:signal', { to: guest.id, cid: 'c3', candidate: { candidate: '' } });
    host.socket.emit('voice:signal', { to: guest.id, cid: 'c4' });
    await new Promise((r) => setTimeout(r, 500));
    expect(outsiderReceived).toEqual([]);
    expect(received).toHaveLength(1);

    // The peer connections die with the socket, so the mic goes off with it.
    host.socket.disconnect();
    await waitFor(() => voiceOf(guestRoom, host.id) === false, 5_000, 'mic off on disconnect');
    host.socket = await connect(host);
  });
});
