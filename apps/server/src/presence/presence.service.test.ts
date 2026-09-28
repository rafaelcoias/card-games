import type { GameRegistry } from '@cardroom/game-core';
import type Redis from 'ioredis';
import { describe, expect, it } from 'vitest';
import type { RoomStore } from '../rooms/room.store';
import { PresenceService } from './presence.service';

/** Records every command sent through `multi()`; enough for the write paths under test. */
function fakeRedis() {
  const commands: string[][] = [];
  const tx: object = new Proxy(
    {},
    {
      get: (_, name: string) =>
        name === 'exec'
          ? () => Promise.resolve([])
          : (...args: unknown[]) => {
              commands.push([name, ...args.map(String)]);
              return tx;
            },
    },
  );
  return { redis: { multi: () => tx } as unknown as Redis, commands };
}

const profile = { id: 'u1', username: 'ana', avatarUrl: null, guest: false };

function setup() {
  const { redis, commands } = fakeRedis();
  const service = new PresenceService(redis, {} as GameRegistry, {} as RoomStore);
  const refreshed = () => commands.filter(([name, , , id]) => name === 'zadd' && id === 'u1').length;
  return { service, commands, refreshed };
}

describe('PresenceService', () => {
  it('ignores a socket that closed while the connection was being set up', async () => {
    const { service, commands } = setup();
    await service.connected(profile, { id: 's1', connected: false });
    await service.refreshLocal();
    expect(commands).toEqual([]);
  });

  it('keeps live sockets online and lets closed ones expire', async () => {
    const { service, refreshed } = setup();
    const socket = { id: 's1', connected: true };
    await service.connected(profile, socket);
    expect(refreshed()).toBe(1);

    await service.refreshLocal();
    expect(refreshed()).toBe(2);

    // A disconnect that was missed (or raced the setup) must not leave a ghost behind.
    socket.connected = false;
    await service.refreshLocal();
    await service.refreshLocal();
    expect(refreshed()).toBe(2);
  });

  it('only forgets the socket that actually disconnected', async () => {
    const { service, refreshed } = setup();
    await service.connected(profile, { id: 's2', connected: true });
    await service.disconnected('u1', 's1', false); // an older, replaced tab
    await service.refreshLocal();
    expect(refreshed()).toBe(2);
  });
});
