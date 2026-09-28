import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ErrorCode } from '@cardroom/shared';
import type Redis from 'ioredis';
import { AppError } from '../common/app-error';
import { REDIS } from '../redis/redis.module';
import { Effects } from './effects';
import { acceptsPlayers, upgradeRoom } from './room.logic';
import type { RoomRecord } from './room.model';

const ROOM_TTL_SECONDS = 60 * 60 * 24;
const LOCK_TTL_MS = 5_000;
const LOCK_WAIT_MS = 4_000;

const keys = {
  room: (id: string) => `room:${id}`,
  code: (code: string) => `roomcode:${code}`,
  lock: (id: string) => `lock:room:${id}`,
  userRoom: (userId: string) => `user:${userId}:room`,
  userConn: (userId: string) => `user:${userId}:conn`,
  openRooms: 'rooms:open',
};

/** Deletes `key` only if it still holds `value` (safe release of ownership). */
const COMPARE_AND_DELETE = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0`;

/**
 * Redis-backed storage for live rooms. Every mutation of a room happens inside
 * `withLock`, which serialises work per room across all server instances (a
 * Redis lock) and inside this process (a promise chain, to avoid lock spinning).
 */
@Injectable()
export class RoomStore {
  private readonly logger = new Logger(RoomStore.name);
  private readonly localQueues = new Map<string, Promise<unknown>>();

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async withLock<T>(roomId: string, work: () => Promise<T>): Promise<T> {
    const previous = this.localQueues.get(roomId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.withDistributedLock(roomId, work));
    this.localQueues.set(roomId, run);
    try {
      return await run;
    } finally {
      if (this.localQueues.get(roomId) === run) this.localQueues.delete(roomId);
    }
  }

  private async withDistributedLock<T>(roomId: string, work: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    const key = keys.lock(roomId);
    const giveUpAt = Date.now() + LOCK_WAIT_MS;
    while ((await this.redis.set(key, token, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') {
      if (Date.now() > giveUpAt) throw new AppError(ErrorCode.Busy, 'The room is busy, try again');
      await sleep(10 + Math.random() * 20);
    }
    try {
      return await work();
    } finally {
      await this.redis.eval(COMPARE_AND_DELETE, 1, key, token);
    }
  }

  /**
   * Unit of work for an existing room: lock, load, mutate, save (or delete when
   * the room was closed), then run the deferred effects.
   */
  async mutate<T>(roomId: string, work: (room: RoomRecord, effects: Effects) => T | Promise<T>): Promise<T> {
    return this.withLock(roomId, async () => {
      const room = await this.load(roomId);
      if (!room) throw new AppError(ErrorCode.RoomNotFound, 'This room no longer exists');
      const effects = new Effects();
      const result = await work(room, effects);
      await this.persist(room);
      await effects.flush(this.logger);
      return result;
    });
  }

  /** Saves a room, or removes it from Redis once it is closed. */
  async persist(room: RoomRecord): Promise<void> {
    if (room.status === 'CLOSED') await this.delete(room);
    else await this.save(room);
  }

  async load(roomId: string): Promise<RoomRecord | null> {
    const raw = await this.redis.get(keys.room(roomId));
    return raw ? upgradeRoom(JSON.parse(raw) as RoomRecord) : null;
  }

  async save(room: RoomRecord): Promise<void> {
    const listed = acceptsPlayers(room) && !room.isPrivate && room.members.length < room.maxPlayers;
    const tx = this.redis
      .multi()
      .set(keys.room(room.id), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS)
      .set(keys.code(room.code), room.id, 'EX', ROOM_TTL_SECONDS);
    if (listed) tx.zadd(keys.openRooms, room.createdAt, room.id);
    else tx.zrem(keys.openRooms, room.id);
    await tx.exec();
  }

  async delete(room: RoomRecord): Promise<void> {
    await this.redis
      .multi()
      .del(keys.room(room.id), keys.code(room.code))
      .zrem(keys.openRooms, room.id)
      .exec();
  }

  /** Claims a room code; `false` when it is already in use. */
  async reserveCode(code: string, roomId: string): Promise<boolean> {
    return (await this.redis.set(keys.code(code), roomId, 'EX', ROOM_TTL_SECONDS, 'NX')) === 'OK';
  }

  async findIdByCode(code: string): Promise<string | null> {
    return this.redis.get(keys.code(code));
  }

  async listOpenPublic(limit: number): Promise<RoomRecord[]> {
    const ids = await this.redis.zrevrange(keys.openRooms, 0, limit - 1);
    if (ids.length === 0) return [];
    const raws = await this.redis.mget(ids.map(keys.room));
    const rooms: RoomRecord[] = [];
    const stale: string[] = [];
    raws.forEach((raw, i) =>
      raw ? rooms.push(upgradeRoom(JSON.parse(raw) as RoomRecord)) : stale.push(ids[i] as string),
    );
    if (stale.length > 0) await this.redis.zrem(keys.openRooms, ...stale);
    return rooms;
  }

  getUserRoom(userId: string): Promise<string | null> {
    return this.redis.get(keys.userRoom(userId));
  }

  async setUserRoom(userId: string, roomId: string): Promise<void> {
    await this.redis.set(keys.userRoom(userId), roomId, 'EX', ROOM_TTL_SECONDS);
  }

  async clearUserRoom(userId: string, roomId: string): Promise<void> {
    await this.redis.eval(COMPARE_AND_DELETE, 1, keys.userRoom(userId), roomId);
  }

  /**
   * Records the user's single active socket and returns the one it replaces
   * (atomically, so two simultaneous logins cannot both win).
   */
  async setActiveConnection(userId: string, socketId: string): Promise<string | null> {
    const previous = await this.redis.set(keys.userConn(userId), socketId, 'EX', ROOM_TTL_SECONDS, 'GET');
    return previous !== socketId ? previous : null;
  }

  /** Releases the connection slot; `true` only if `socketId` was still the active one. */
  async releaseConnection(userId: string, socketId: string): Promise<boolean> {
    return (await this.redis.eval(COMPARE_AND_DELETE, 1, keys.userConn(userId), socketId)) === 1;
  }
}
