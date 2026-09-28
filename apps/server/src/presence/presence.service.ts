import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { GameRegistry } from '@cardroom/game-core';
import type { OnlinePlayer, PresenceSnapshot, PresenceStatus } from '@cardroom/shared';
import type Redis from 'ioredis';
import { GAME_REGISTRY } from '../games/tokens';
import { REDIS } from '../redis/redis.module';
import { acceptsPlayers, type MemberProfile } from '../rooms/room.logic';
import type { RoomRecord } from '../rooms/room.model';
import { RoomStore } from '../rooms/room.store';

/** Sorted set: user id → expiry time (ms). Members past their expiry are offline. */
const ONLINE_KEY = 'presence:online';
/** Hash: user id → JSON { username, avatarUrl }. */
const INFO_KEY = 'presence:info';
const TTL_MS = 75_000;
const HEARTBEAT_MS = 25_000;
const MAX_LISTED = 200;

const STATUS_ORDER: Record<PresenceStatus, number> = { playing: 0, room: 1, lobby: 2 };

/** The part of a Socket.IO socket presence needs; `connected` flips to false synchronously on close. */
export interface LiveSocket {
  readonly id: string;
  readonly connected: boolean;
}

/**
 * Who is online, across all server instances. Each instance refreshes the
 * users whose active socket it holds; entries of a crashed instance simply
 * expire. "Online" means: signed in with the app open.
 */
@Injectable()
export class PresenceService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(PresenceService.name);
  /** Users whose active socket lives on this instance. */
  private readonly local = new Map<string, LiveSocket>();
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
    private readonly rooms: RoomStore,
  ) {}

  onApplicationBootstrap(): void {
    this.heartbeat = setInterval(() => void this.refreshLocal(), HEARTBEAT_MS);
  }

  onModuleDestroy(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  async connected(profile: MemberProfile, socket: LiveSocket): Promise<void> {
    // The socket may have closed while the connection was being set up; its
    // disconnect has then already run and must not be undone.
    if (!socket.connected) return;
    this.local.set(profile.id, socket);
    await this.redis
      .multi()
      .hset(
        INFO_KEY,
        profile.id,
        JSON.stringify({ username: profile.username, avatarUrl: profile.avatarUrl, guest: profile.guest }),
      )
      .zadd(ONLINE_KEY, Date.now() + TTL_MS, profile.id)
      .exec();
  }

  /** `wasActive` = this socket was the user's current connection (not a replaced one). */
  async disconnected(userId: string, socketId: string, wasActive: boolean): Promise<void> {
    if (this.local.get(userId)?.id === socketId) this.local.delete(userId);
    if (wasActive) await this.redis.multi().zrem(ONLINE_KEY, userId).hdel(INFO_KEY, userId).exec();
  }

  /** Keeps the public name/avatar in sync after a profile edit. */
  async updateInfo(profile: MemberProfile): Promise<void> {
    if (!(await this.isOnline(profile.id))) return;
    await this.redis.hset(
      INFO_KEY,
      profile.id,
      JSON.stringify({ username: profile.username, avatarUrl: profile.avatarUrl, guest: profile.guest }),
    );
  }

  async count(): Promise<number> {
    return this.redis.zcount(ONLINE_KEY, Date.now(), '+inf');
  }

  async isOnline(userId: string): Promise<boolean> {
    const expiry = await this.redis.zscore(ONLINE_KEY, userId);
    return expiry !== null && Number(expiry) > Date.now();
  }

  async onlineAmong(userIds: readonly string[]): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();
    const scores = await this.redis.zmscore(ONLINE_KEY, ...userIds);
    const now = Date.now();
    return new Set(userIds.filter((_, i) => scores[i] !== null && Number(scores[i]) > now));
  }

  async snapshot(): Promise<PresenceSnapshot> {
    await this.pruneExpired();
    const ids = await this.redis.zrangebyscore(ONLINE_KEY, Date.now(), '+inf', 'LIMIT', 0, MAX_LISTED);
    const players = await this.describe(ids);
    players.sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.username.localeCompare(b.username),
    );
    return { count: await this.count(), players };
  }

  async presenceOf(userId: string): Promise<OnlinePlayer | null> {
    if (!(await this.isOnline(userId))) return null;
    return (await this.describe([userId]))[0] ?? null;
  }

  private async describe(ids: string[]): Promise<OnlinePlayer[]> {
    if (ids.length === 0) return [];
    const [infos, roomIds] = await Promise.all([
      this.redis.hmget(INFO_KEY, ...ids),
      Promise.all(ids.map((id) => this.rooms.getUserRoom(id))),
    ]);
    const roomById = new Map<string, RoomRecord | null>();
    await Promise.all(
      [...new Set(roomIds.filter((id): id is string => id !== null))].map(async (id) =>
        roomById.set(id, await this.rooms.load(id)),
      ),
    );

    const players: OnlinePlayer[] = [];
    ids.forEach((id, i) => {
      const raw = infos[i];
      if (!raw) return;
      const info = JSON.parse(raw) as { username: string; avatarUrl: string | null; guest?: boolean };
      const roomId = roomIds[i];
      const room = roomId ? roomById.get(roomId) : null;
      const status: PresenceStatus = !room ? 'lobby' : room.status === 'PLAYING' ? 'playing' : 'room';
      players.push({
        id,
        username: info.username,
        avatarUrl: info.avatarUrl,
        guest: info.guest === true,
        status,
        gameName: room ? (this.registry.get(room.gameId)?.name ?? room.gameId) : null,
        // Private room codes are invitations: never expose them.
        roomCode: room && !room.isPrivate && acceptsPlayers(room) ? room.code : null,
      });
    });
    return players;
  }

  /** Only live sockets are kept alive: anything missed on disconnect simply expires. */
  async refreshLocal(): Promise<void> {
    for (const [userId, socket] of this.local) {
      if (!socket.connected) this.local.delete(userId);
    }
    if (this.local.size === 0) return;
    const expiry = Date.now() + TTL_MS;
    const tx = this.redis.multi();
    for (const userId of this.local.keys()) tx.zadd(ONLINE_KEY, expiry, userId);
    await tx.exec().catch((error: unknown) => this.logger.warn({ err: error }, 'Presence heartbeat failed'));
  }

  private async pruneExpired(): Promise<void> {
    const expired = await this.redis.zrangebyscore(ONLINE_KEY, 0, Date.now());
    if (expired.length === 0) return;
    await this.redis
      .multi()
      .zrem(ONLINE_KEY, ...expired)
      .hdel(INFO_KEY, ...expired)
      .exec();
  }
}
