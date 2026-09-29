/**
 * Guests over Socket.IO against a RUNNING server (see multiplayer.e2e.test.ts):
 * someone with no account (Firebase anonymous sign-in) picks a temporary name,
 * joins a room and plays a whole match; the name reserves nothing and the
 * guest stays out of the player directory.
 */
import { randomUUID } from 'node:crypto';
import type { PeixinhoAction, PeixinhoView } from '@cardroom/peixinho';
import type { MatchHistoryEntry, MeResponse, PlayerSummary, RoomState } from '@cardroom/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { api, attachBot, createBots, startMatch, waitFor, type Bot } from './e2e-helpers';

type PeixinhoBot = Bot<PeixinhoView, PeixinhoAction>;

let bots: PeixinhoBot[] = [];

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('guests', () => {
  it('play a whole match without an account, under a name that reserves nothing', async () => {
    bots = await createBots<PeixinhoView, PeixinhoAction>(`gst_${randomUUID().slice(0, 6)}`, 2, {
      guests: 1,
    });
    const [host, guest] = bots as [PeixinhoBot, PeixinhoBot];

    const me = await api<MeResponse>(guest.token, '/me');
    expect(me).toMatchObject({ guest: true, email: null, profile: { username: guest.name, guest: true } });
    // A guest's name is not a claim, and a guest cannot take an account's name.
    await expect(
      api(guest.token, '/me/profile', { method: 'PUT', body: JSON.stringify({ username: host.name }) }),
    ).rejects.toThrow(/409/);

    const rooms: RoomState[] = [];
    host.socket.on('room:state', (room) => rooms.push(room));
    const rejections: string[] = [];
    for (const bot of bots) attachBot(bot, (view) => view.validActions[0] ?? null, rejections);
    await startMatch(bots, 'peixinho');
    await waitFor(() => bots.every((b) => b.result !== null), 60_000, 'match end');

    expect(rooms.at(-1)?.players.map((p) => [p.id, p.guest])).toEqual([
      [host.id, false],
      [guest.id, true],
    ]);
    const result = host.result;
    expect(result?.aborted).toBe(false);
    expect(result?.standings.map((s) => s.playerId).sort()).toEqual([host.id, guest.id].sort());

    const history = await api<MatchHistoryEntry[]>(guest.token, '/me/matches');
    const recorded = history.find((m) => m.id === result?.matchId);
    expect(recorded?.players.find((p) => p.username === guest.name)?.guest).toBe(true);

    const directory = await api<PlayerSummary[]>(host.token, `/players?search=${guest.name}`);
    expect(directory.map((p) => p.id)).not.toContain(guest.id);
    await expect(api(host.token, `/players/${guest.name}`)).rejects.toThrow(/404/);
  });
});
