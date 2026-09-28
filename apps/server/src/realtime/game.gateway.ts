import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import {
  ClientEvent,
  ErrorCode,
  gameActionSchema,
  roomChatSchema,
  roomCreateSchema,
  roomJoinSchema,
  roomKickSchema,
  roomReadySchema,
  type Ack,
  type ClientToServerEvents,
  type JoinedRoom,
  type ServerToClientEvents,
} from '@cardroom/shared';
import type { Socket } from 'socket.io';
import { AppError, isExpectedError, toErrorPayload } from '../common/app-error';
import { TokenVerifier } from '../auth/token-verifier';
import { ProfilesRepository } from '../persistence/repositories';
import { PresenceService } from '../presence/presence.service';
import { RoomsService } from '../rooms/rooms.service';
import type { MemberProfile } from '../rooms/room.logic';
import { RoomStore } from '../rooms/room.store';
import { GameSessionsService } from '../sessions/game-sessions.service';
import { createSocketRateLimits, type SocketRateLimits } from './rate-limiter';
import { RealtimeEmitter, userChannel, type IoServer } from './realtime.emitter';

interface SocketData {
  profile: MemberProfile;
  limits: SocketRateLimits;
}

type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Transport layer only: authenticates sockets, enforces one connection per user,
 * rate-limits, validates payloads with Zod and delegates to the services.
 */
@WebSocketGateway()
export class GameGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GameGateway.name);
  @WebSocketServer() private server!: IoServer;

  constructor(
    private readonly verifier: TokenVerifier,
    private readonly profiles: ProfilesRepository,
    private readonly rooms: RoomsService,
    private readonly sessions: GameSessionsService,
    private readonly store: RoomStore,
    private readonly emitter: RealtimeEmitter,
    private readonly presence: PresenceService,
  ) {}

  afterInit(server: IoServer): void {
    this.emitter.attach(server);
    server.use((socket, next) => {
      void this.authenticate(socket as GameSocket)
        .then(() => next())
        .catch((error: unknown) => {
          const payload = toErrorPayload(error);
          next(Object.assign(new Error(payload.message), { data: payload }));
        });
    });
  }

  private async authenticate(socket: GameSocket): Promise<void> {
    const token: unknown = (socket.handshake.auth as Record<string, unknown> | undefined)?.token;
    if (typeof token !== 'string' || token.length === 0) {
      throw new AppError(ErrorCode.Unauthorized, 'Missing access token');
    }
    const identity = await this.verifier.verify(token);
    const profile = await this.profiles.find(identity.userId);
    if (!profile) throw new AppError(ErrorCode.ProfileRequired, 'Choose a username first');
    socket.data.profile = { id: profile.id, username: profile.username, avatarUrl: profile.avatarUrl };
    socket.data.limits = createSocketRateLimits();
  }

  async handleConnection(socket: GameSocket): Promise<void> {
    const userId = socket.data.profile.id;
    try {
      // One live connection per player: the newest wins.
      const previous = await this.store.setActiveConnection(userId, socket.id);
      if (previous) this.emitter.replaceSession(previous);
      await socket.join(userChannel(userId));
      await this.rooms.onConnected(userId);
      await this.presence.connected(socket.data.profile, socket);
      this.logger.debug({ userId, socketId: socket.id }, 'Socket connected');
    } catch (error) {
      this.logger.error({ err: error, userId }, 'Connection setup failed');
    }
  }

  async handleDisconnect(socket: GameSocket): Promise<void> {
    const userId = socket.data.profile?.id;
    if (!userId) return;
    const wasActive = await this.store.releaseConnection(userId, socket.id).catch(() => false);
    await this.presence
      .disconnected(userId, socket.id, wasActive)
      .catch((error: unknown) => this.logger.warn({ err: error, userId }, 'Presence update failed'));
    if (wasActive) await this.rooms.onDisconnected(userId);
  }

  @SubscribeMessage(ClientEvent.RoomCreate)
  createRoom(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown): Promise<Ack<JoinedRoom>> {
    return this.handle(socket, () => this.rooms.create(socket.data.profile, roomCreateSchema.parse(body)));
  }

  @SubscribeMessage(ClientEvent.RoomJoin)
  joinRoom(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown): Promise<Ack<JoinedRoom>> {
    return this.handle(socket, () => this.rooms.join(socket.data.profile, roomJoinSchema.parse(body).code));
  }

  @SubscribeMessage(ClientEvent.RoomLeave)
  leaveRoom(@ConnectedSocket() socket: GameSocket): Promise<Ack<void>> {
    return this.handle(socket, () => this.rooms.leave(socket.data.profile.id));
  }

  @SubscribeMessage(ClientEvent.RoomReady)
  setReady(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown): Promise<Ack<void>> {
    return this.handle(socket, () =>
      this.rooms.setReady(socket.data.profile.id, roomReadySchema.parse(body).ready),
    );
  }

  @SubscribeMessage(ClientEvent.RoomStart)
  startMatch(@ConnectedSocket() socket: GameSocket): Promise<Ack<void>> {
    return this.handle(socket, () => this.rooms.start(socket.data.profile.id));
  }

  @SubscribeMessage(ClientEvent.RoomEnd)
  endSession(@ConnectedSocket() socket: GameSocket): Promise<Ack<void>> {
    return this.handle(socket, () => this.rooms.endSession(socket.data.profile.id));
  }

  @SubscribeMessage(ClientEvent.RoomKick)
  kick(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown): Promise<Ack<void>> {
    return this.handle(socket, () =>
      this.rooms.kick(socket.data.profile.id, roomKickSchema.parse(body).playerId),
    );
  }

  @SubscribeMessage(ClientEvent.RoomChat)
  chat(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown): Promise<Ack<void>> {
    if (!socket.data.limits.chat.tryTake()) return Promise.resolve(this.rateLimited());
    return this.handle(socket, () => this.rooms.chat(socket.data.profile, roomChatSchema.parse(body).text));
  }

  @SubscribeMessage(ClientEvent.GameAction)
  async gameAction(@ConnectedSocket() socket: GameSocket, @MessageBody() body: unknown): Promise<Ack<void>> {
    const ack = await this.handle(socket, () =>
      this.sessions.handlePlayerAction(socket.data.profile.id, gameActionSchema.parse(body).action),
    );
    if (!ack.ok) socket.emit('game:error', ack.error);
    return ack;
  }

  private async handle<T>(socket: GameSocket, work: () => Promise<T>): Promise<Ack<T>> {
    if (!socket.data.limits.general.tryTake()) return this.rateLimited();
    try {
      return { ok: true, data: await work() };
    } catch (error) {
      if (!isExpectedError(error)) {
        this.logger.error({ err: error, userId: socket.data.profile.id }, 'Unhandled socket error');
      }
      return { ok: false, error: toErrorPayload(error) };
    }
  }

  private rateLimited<T>(): Ack<T> {
    return { ok: false, error: { code: ErrorCode.RateLimited, message: 'Slow down a little' } };
  }
}
