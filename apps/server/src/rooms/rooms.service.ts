import { randomInt, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { GameRegistry } from '@cardroom/game-core';
import {
  ErrorCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type JoinedRoom,
  type PublicRoomSummary,
  type roomCreateSchema,
} from '@cardroom/shared';
import type { z } from 'zod';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { GAME_REGISTRY } from '../games/tokens';
import { RoomsRepository } from '../persistence/repositories';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import { TimerScheduler, type TimerJob } from '../scheduler/timer.scheduler';
import { GameSessionsService } from '../sessions/game-sessions.service';
import { RoomPublisher } from '../sessions/room-publisher';
import type { Effects } from './effects';
import {
  addMember,
  appendChat,
  assertCanKick,
  assertCanStart,
  findMember,
  isEmpty,
  markPresent,
  removeMember,
  requireMember,
  type MemberProfile,
} from './room.logic';
import type { RoomRecord } from './room.model';
import { RoomStore } from './room.store';

/** Seats of absent players in a lobby are released quickly; in a match they get the full grace period. */
const LOBBY_GRACE_MS = 15_000;

type CreateRoomInput = z.output<typeof roomCreateSchema>;

@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
    @Inject(ENV) private readonly env: Env,
    private readonly store: RoomStore,
    private readonly sessions: GameSessionsService,
    private readonly publisher: RoomPublisher,
    private readonly emitter: RealtimeEmitter,
    private readonly scheduler: TimerScheduler,
    private readonly roomsRepository: RoomsRepository,
  ) {}

  onModuleInit(): void {
    this.scheduler.register('grace', (job) => this.onGraceExpired(job));
  }

  async create(user: MemberProfile, input: CreateRoomInput): Promise<JoinedRoom> {
    const module = this.registry.get(input.gameId);
    if (!module) throw new AppError(ErrorCode.UnknownGame, 'Unknown game');
    if (input.maxPlayers < module.minPlayers || input.maxPlayers > module.maxPlayers) {
      throw new AppError(
        ErrorCode.PlayerCount,
        `${module.name} is played by ${module.minPlayers}–${module.maxPlayers}`,
      );
    }
    const parsedConfig = module.configSchema.safeParse(input.config);
    if (!parsedConfig.success) throw new AppError(ErrorCode.Validation, 'Invalid game settings');

    await this.leaveCurrentRoom(user.id);
    const id = randomUUID();
    const code = await this.reserveUniqueCode(id);
    const room: RoomRecord = {
      id,
      code,
      gameId: module.id,
      hostId: user.id,
      isPrivate: input.isPrivate,
      maxPlayers: input.maxPlayers,
      status: 'OPEN',
      config: parsedConfig.data as Record<string, unknown>,
      createdAt: Date.now(),
      members: [],
      chat: [],
      session: null,
      lastResult: null,
    };
    addMember(room, user);

    return this.store.withLock(id, async () => {
      await this.store.save(room);
      await this.store.setUserRoom(user.id, id);
      this.emitter.subscribeUserToRoom(user.id, id);
      await this.roomsRepository
        .create({
          id,
          code,
          gameId: room.gameId,
          hostId: user.id,
          isPrivate: room.isPrivate,
          maxPlayers: room.maxPlayers,
        })
        .catch((error: unknown) => this.logger.error({ err: error, roomId: id }, 'Failed to persist room'));
      this.logger.log({ roomId: id, code, gameId: room.gameId }, 'Room created');
      return { room: this.publisher.roomState(room), chat: [] };
    });
  }

  async join(user: MemberProfile, code: string): Promise<JoinedRoom> {
    const roomId = await this.store.findIdByCode(code);
    if (!roomId) throw new AppError(ErrorCode.RoomNotFound, 'No room with that code');
    const current = await this.store.getUserRoom(user.id);
    if (current && current !== roomId) await this.leaveCurrentRoom(user.id);

    return this.store.mutate(roomId, async (room, effects) => {
      const existing = findMember(room, user.id);
      if (existing) {
        markPresent(existing);
      } else {
        addMember(room, user);
      }
      await this.store.setUserRoom(user.id, room.id);
      this.emitter.subscribeUserToRoom(user.id, room.id);
      if (existing) this.sessions.onPresenceChanged(room, effects);
      this.sessions.sendSnapshot(room, user.id, effects);
      effects.defer(() => this.publisher.publishRoom(room));
      return { room: this.publisher.roomState(room), chat: room.chat };
    });
  }

  async leave(userId: string): Promise<void> {
    const roomId = await this.store.getUserRoom(userId);
    if (!roomId) return;
    await this.removeFromRoom(roomId, userId, 'left');
  }

  async setReady(userId: string, ready: boolean): Promise<void> {
    await this.mutateCurrent(userId, (room, effects) => {
      if (room.status !== 'OPEN') throw new AppError(ErrorCode.RoomInProgress, 'The match already started');
      requireMember(room, userId).ready = ready;
      effects.defer(() => this.publisher.publishRoom(room));
    });
  }

  async start(userId: string): Promise<void> {
    await this.mutateCurrent(userId, (room, effects) => {
      const module = this.registry.require(room.gameId);
      assertCanStart(room, userId, module.minPlayers, Math.min(module.maxPlayers, room.maxPlayers));
      this.sessions.start(room, effects);
      this.logger.log({ roomId: room.id, players: room.members.length }, 'Match started');
    });
  }

  async kick(hostId: string, targetId: string): Promise<void> {
    const roomId = await this.store.getUserRoom(hostId);
    if (!roomId) throw new AppError(ErrorCode.NotInRoom, 'You are not in a room');
    await this.store.mutate(roomId, (room, effects) => {
      assertCanKick(room, hostId, targetId);
      this.detach(room, effects, targetId, 'kicked');
    });
  }

  async chat(user: MemberProfile, text: string): Promise<void> {
    await this.mutateCurrent(user.id, (room, effects) => {
      requireMember(room, user.id);
      const message = { id: randomUUID(), playerId: user.id, username: user.username, text, at: Date.now() };
      appendChat(room, message);
      effects.defer(() => this.emitter.toRoom(room.id, 'room:chat', message));
    });
  }

  /** A socket (re)connected: restore the user's seat if they belong to a room. */
  async onConnected(userId: string): Promise<void> {
    const roomId = await this.store.getUserRoom(userId);
    if (!roomId) return;
    try {
      await this.store.mutate(roomId, (room, effects) => {
        const member = findMember(room, userId);
        if (!member || member.left) {
          effects.defer(() => this.store.clearUserRoom(userId, roomId));
          return;
        }
        const wasAway = member.away;
        markPresent(member);
        this.emitter.subscribeUserToRoom(userId, room.id);
        if (wasAway) this.sessions.onPresenceChanged(room, effects);
        effects.defer(() => this.emitter.toUser(userId, 'room:state', this.publisher.roomState(room)));
        effects.defer(() => this.publisher.publishRoom(room));
        effects.defer(() => this.emitter.toRoom(room.id, 'player:reconnected', { playerId: userId }));
        this.sessions.sendSnapshot(room, userId, effects);
      });
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.RoomNotFound) {
        await this.store.clearUserRoom(userId, roomId);
        return;
      }
      throw error;
    }
  }

  /** The user's active socket dropped: start the grace period. */
  async onDisconnected(userId: string): Promise<void> {
    const roomId = await this.store.getUserRoom(userId);
    if (!roomId) return;
    await this.store
      .mutate(roomId, (room, effects) => {
        const member = findMember(room, userId);
        if (!member || member.left) return;
        member.connected = false;
        member.disconnectedAt = Date.now();
        const inMatch = room.session?.players.includes(userId) ?? false;
        const graceMs = inMatch ? this.env.RECONNECT_GRACE_MS : LOBBY_GRACE_MS;
        const job: TimerJob = { kind: 'grace', roomId, token: `${userId}:${member.disconnectedAt}` };
        const dueAt = member.disconnectedAt + graceMs;
        effects.defer(() => this.scheduler.schedule(job, dueAt));
        effects.defer(() => this.publisher.publishRoom(room));
        effects.defer(() => this.emitter.toRoom(room.id, 'player:disconnected', { playerId: userId }));
      })
      .catch((error: unknown) => this.logger.warn({ err: error, userId }, 'Disconnect bookkeeping failed'));
  }

  async listPublic(): Promise<PublicRoomSummary[]> {
    const rooms = await this.store.listOpenPublic(50);
    return rooms.map((room) => ({
      code: room.code,
      gameId: room.gameId,
      gameName: this.publisher.gameName(room.gameId),
      hostName: findMember(room, room.hostId)?.username ?? '—',
      playerCount: room.members.length,
      maxPlayers: room.maxPlayers,
    }));
  }

  private async onGraceExpired(job: TimerJob): Promise<void> {
    const [userId, disconnectedAt] = job.token.split(':');
    if (!userId || !disconnectedAt) return;
    const room = await this.store.load(job.roomId);
    const member = room && findMember(room, userId);
    if (!member || member.connected || String(member.disconnectedAt) !== disconnectedAt) return;

    if (room.session?.players.includes(userId)) {
      await this.store.mutate(job.roomId, (fresh, effects) => {
        const current = findMember(fresh, userId);
        if (!current || current.connected || String(current.disconnectedAt) !== disconnectedAt) return;
        current.away = true;
        this.sessions.onPresenceChanged(fresh, effects);
        effects.defer(() => this.publisher.publishRoom(fresh));
      });
    } else {
      await this.removeFromRoom(job.roomId, userId, 'timeout');
    }
  }

  /** Shared path for leaving, being kicked and lobby grace expiry (inside a room mutation). */
  private detach(
    room: RoomRecord,
    effects: Effects,
    userId: string,
    reason: 'left' | 'kicked' | 'timeout',
  ): void {
    const roomId = room.id;
    removeMember(room, userId);
    if (room.status === 'OPEN' && isEmpty(room)) room.status = 'CLOSED';
    this.sessions.onPresenceChanged(room, effects);

    effects.defer(() => this.store.clearUserRoom(userId, roomId));
    effects.defer(() => this.emitter.unsubscribeUserFromRoom(userId, roomId));
    if (reason === 'kicked') effects.defer(() => this.emitter.toUser(userId, 'room:kicked', { roomId }));
    if (room.status === 'CLOSED') {
      effects.defer(() => this.roomsRepository.setStatus(roomId, 'CLOSED'));
    } else {
      effects.defer(() => this.publisher.publishRoom(room));
    }
    this.logger.log({ roomId, userId, reason }, 'Player removed from room');
  }

  private async removeFromRoom(roomId: string, userId: string, reason: 'left' | 'timeout'): Promise<void> {
    await this.store
      .mutate(roomId, (room, effects) => {
        if (findMember(room, userId)) this.detach(room, effects, userId, reason);
      })
      .catch((error: unknown) => {
        if (error instanceof AppError && error.code === ErrorCode.RoomNotFound) {
          return this.store.clearUserRoom(userId, roomId);
        }
        throw error;
      });
  }

  /**
   * Called before creating/joining another room. Leaving a lobby is automatic;
   * abandoning a running match must be explicit.
   */
  private async leaveCurrentRoom(userId: string): Promise<void> {
    const roomId = await this.store.getUserRoom(userId);
    if (!roomId) return;
    const room = await this.store.load(roomId);
    const member = room && findMember(room, userId);
    if (room?.session && member && !member.left && room.session.players.includes(userId)) {
      throw new AppError(ErrorCode.AlreadyInRoom, `You are still playing in room ${room.code}`);
    }
    await this.removeFromRoom(roomId, userId, 'left');
  }

  private async mutateCurrent(
    userId: string,
    work: (room: RoomRecord, effects: Effects) => void | Promise<void>,
  ): Promise<void> {
    const roomId = await this.store.getUserRoom(userId);
    if (!roomId) throw new AppError(ErrorCode.NotInRoom, 'You are not in a room');
    await this.store.mutate(roomId, work);
  }

  private async reserveUniqueCode(roomId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
      ).join('');
      if (await this.store.reserveCode(code, roomId)) return code;
    }
    throw new AppError(ErrorCode.Internal, 'Could not allocate a room code');
  }
}
