import { Injectable } from '@nestjs/common';
import type { ClientToServerEvents, ServerToClientEvents } from '@cardroom/shared';
import type { Server } from 'socket.io';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

type EventName = keyof ServerToClientEvents;
type EventArgs<E extends EventName> = Parameters<ServerToClientEvents[E]>;

export const roomChannel = (roomId: string) => `room:${roomId}`;
export const userChannel = (userId: string) => `user:${userId}`;

/**
 * Thin, cluster-aware facade over Socket.IO. Channels are Socket.IO rooms, so
 * with the Redis adapter every call reaches sockets on any instance.
 */
@Injectable()
export class RealtimeEmitter {
  private server: IoServer | null = null;

  attach(server: IoServer): void {
    this.server = server;
  }

  private get io(): IoServer {
    if (!this.server) throw new Error('Socket.IO server not attached yet');
    return this.server;
  }

  toRoom<E extends EventName>(roomId: string, event: E, ...args: EventArgs<E>): void {
    this.io.to(roomChannel(roomId)).emit(event, ...args);
  }

  toUser<E extends EventName>(userId: string, event: E, ...args: EventArgs<E>): void {
    this.io.to(userChannel(userId)).emit(event, ...args);
  }

  subscribeUserToRoom(userId: string, roomId: string): void {
    this.io.in(userChannel(userId)).socketsJoin(roomChannel(roomId));
  }

  unsubscribeUserFromRoom(userId: string, roomId: string): void {
    this.io.in(userChannel(userId)).socketsLeave(roomChannel(roomId));
  }

  /**
   * Closes a superseded connection (on whichever instance holds it) after telling
   * it why. Targets the socket id, never the user channel, so the new socket is safe.
   */
  replaceSession(socketId: string): void {
    this.io.to(socketId).emit('session:replaced');
    this.io.in(socketId).disconnectSockets(true);
  }
}
