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
  type VoiceSignalPayload,
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
import { RoomCloser } from './room-closer';
import {
  addMember,
  appendChat,
  applySettings,
  assertCanConfigure,
  assertCanKick,
  assertCanStart,
  findMember,
  isEmpty,
  markPresent,
  removeMember,
  requireHost,
  requireMember,
  startsByItself,
  type MemberProfile,
} from './room.logic';
import { ROOM_MAX_AGE_MS, type RoomRecord } from './room.model';
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
    private readonly closer: RoomCloser,
  ) {}

  onModuleInit(): void {
    this.scheduler.register('grace', (job) => this.onGraceExpired(job));
    this.scheduler.register('expire', (job) => this.onExpired(job));
  }

  async create(user: MemberProfile, input: CreateRoomInput): Promise<JoinedRoom> {
    const settings = this.settingsFor(input);
    await this.leaveCurrentRoom(user.id);
    const id = randomUUID();
    const code = await this.reserveUniqueCode(id);
    const room: RoomRecord = {
      id,
      code,
      ...settings,
      hostId: user.id,
      status: 'OPEN',
      createdAt: Date.now(),
      members: [],
      chat: [],
      session: null,
      lastResult: null,
      closing: null,
    };
    addMember(room, user);

    return this.store.withLock(id, async () => {
      await this.store.save(room);
      await this.store.setUserRoom(user.id, id);
      await this.scheduler.schedule(
        { kind: 'expire', roomId: id, token: id },
        room.createdAt + ROOM_MAX_AGE_MS,
      );
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
      const returning = existing?.left ?? false;
      const member = existing ?? addMember(room, user);
      if (existing) markPresent(existing);
      await this.store.setUserRoom(user.id, room.id);
      this.emitter.subscribeUserToRoom(user.id, room.id);
      // A running session table seats newcomers, and takes back whoever had got up.
      if (!existing || returning) await this.sessions.seatPlayer(room, member, effects);
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

  /**
   * Ready in the lobby — or, from the results, "play again": once everyone at
   * the table (host included) wants a rematch, it starts by itself.
   */
  async setReady(userId: string, ready: boolean): Promise<void> {
    await this.mutateCurrent(userId, async (room, effects) => {
      if (room.status !== 'OPEN') throw new AppError(ErrorCode.RoomInProgress, 'The match already started');
      requireMember(room, userId).ready = ready;
      const module = this.registry.require(room.gameId);
      if (startsByItself(room, module.minPlayers, Math.min(module.maxPlayers, room.maxPlayers))) {
        await this.sessions.start(room, effects);
        this.logger.log({ roomId: room.id, players: room.members.length }, 'Rematch started');
        return;
      }
      effects.defer(() => this.publisher.publishRoom(room));
    });
  }

  /** Host, between matches: another game or other rules for the same players — almost a new room. */
  async configure(userId: string, input: CreateRoomInput): Promise<void> {
    const settings = this.settingsFor(input);
    await this.mutateCurrent(userId, (room, effects) => {
      assertCanConfigure(room, userId, settings.maxPlayers);
      const gameChanged = settings.gameId !== room.gameId;
      applySettings(room, settings);
      const { id, gameId, isPrivate, maxPlayers } = room;
      effects.defer(() => this.roomsRepository.updateSettings(id, { gameId, isPrivate, maxPlayers }));
      effects.defer(() => this.publisher.publishRoom(room));
      this.logger.log({ roomId: id, gameId, gameChanged }, 'Room settings changed');
    });
  }

  async start(userId: string): Promise<void> {
    await this.mutateCurrent(userId, async (room, effects) => {
      const module = this.registry.require(room.gameId);
      assertCanStart(room, userId, module.minPlayers, Math.min(module.maxPlayers, room.maxPlayers));
      await this.sessions.start(room, effects);
      this.logger.log({ roomId: room.id, players: room.members.length }, 'Match started');
    });
  }

  /** Host ends a running SESSION table (blackjack): the session result is recorded like a match's. */
  async endSession(userId: string): Promise<void> {
    await this.mutateCurrent(userId, (room, effects) => {
      requireHost(room, userId);
      this.sessions.endSession(room, effects);
      this.logger.log({ roomId: room.id }, 'Session end requested');
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

  /** Microphone on/off in the room's voice chat (allowed in the lobby and at the table). */
  async setVoice(userId: string, enabled: boolean): Promise<void> {
    await this.mutateCurrent(userId, (room, effects) => {
      const member = requireMember(room, userId);
      if (member.voice === enabled) return;
      member.voice = enabled;
      effects.defer(() => this.publisher.publishRoom(room));
    });
  }

  /** Relays WebRTC signaling between two members of the same room; anything else is dropped. */
  async relayVoiceSignal(fromId: string, signal: VoiceSignalPayload): Promise<void> {
    const { to, ...rest } = signal;
    if (to === fromId) return;
    const [fromRoom, toRoom] = await Promise.all([
      this.store.getUserRoom(fromId),
      this.store.getUserRoom(to),
    ]);
    if (!fromRoom || fromRoom !== toRoom) return;
    this.emitter.toUser(to, 'voice:signal', { ...rest, from: fromId });
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
        // Peer connections die with the socket; a returning client turns the mic back on itself.
        member.voice = false;
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
      inProgress: room.status === 'PLAYING',
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
        // A host gone for good closes the room once the game in play is over (unless they come back first).
        if (fresh.hostId === userId) this.sessions.wrapUp(fresh, effects);
        this.sessions.onPresenceChanged(fresh, effects);
        if (fresh.status !== 'CLOSED') effects.defer(() => this.publisher.publishRoom(fresh));
      });
    } else {
      await this.removeFromRoom(job.roomId, userId, 'timeout');
    }
  }

  /** The room reached its maximum age: it closes now, or as soon as the game in play is over. */
  private async onExpired(job: TimerJob): Promise<void> {
    await this.store
      .mutate(job.roomId, (room, effects) => {
        if (!room.session) {
          this.closer.close(room, effects, 'EXPIRED');
          return;
        }
        room.closing = 'EXPIRED';
        this.sessions.wrapUp(room, effects);
      })
      .catch((error: unknown) => {
        if (error instanceof AppError && error.code === ErrorCode.RoomNotFound) return;
        throw error;
      });
  }

  /**
   * Shared path for leaving, being kicked and lobby grace expiry (inside a room
   * mutation). The host going closes the room: at once in the lobby, or when
   * the game in play is over.
   */
  private detach(
    room: RoomRecord,
    effects: Effects,
    userId: string,
    reason: 'left' | 'kicked' | 'timeout',
  ): void {
    const roomId = room.id;
    const wasHost = room.hostId === userId;
    removeMember(room, userId);
    effects.defer(() => this.store.clearUserRoom(userId, roomId));
    effects.defer(() => this.emitter.unsubscribeUserFromRoom(userId, roomId));
    if (reason === 'kicked') effects.defer(() => this.emitter.toUser(userId, 'room:kicked', { roomId }));
    this.logger.log({ roomId, userId, reason }, 'Player removed from room');

    if (wasHost && !room.session) {
      this.closer.close(room, effects, 'HOST_LEFT');
      return;
    }
    this.sessions.releasePlayer(room, userId, effects);
    if (wasHost) this.sessions.wrapUp(room, effects);
    if (room.status === 'OPEN' && isEmpty(room)) room.status = 'CLOSED';
    this.sessions.onPresenceChanged(room, effects);

    if (room.status === 'CLOSED') {
      effects.defer(() => this.roomsRepository.setStatus(roomId, 'CLOSED'));
    } else {
      effects.defer(() => this.publisher.publishRoom(room));
    }
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

  /** A room's game and rules, checked against the game (player range, settings, table size). */
  private settingsFor(
    input: CreateRoomInput,
  ): Pick<RoomRecord, 'gameId' | 'lifecycle' | 'isPrivate' | 'maxPlayers' | 'config'> {
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
    const tableError = module.validateTable?.(parsedConfig.data, input.maxPlayers);
    if (tableError) throw new AppError(tableError.code, tableError.message);
    return {
      gameId: module.id,
      lifecycle: module.lifecycle,
      isPrivate: input.isPrivate,
      maxPlayers: input.maxPlayers,
      config: parsedConfig.data as Record<string, unknown>,
    };
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
