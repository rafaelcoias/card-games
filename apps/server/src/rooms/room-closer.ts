import { Injectable, Logger } from '@nestjs/common';
import type { RoomCloseReason } from '@cardroom/shared';
import { RoomsRepository } from '../persistence/repositories';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import type { Effects } from './effects';
import type { RoomRecord } from './room.model';
import { RoomStore } from './room.store';

/**
 * Closes a room for good (inside a room mutation): everyone still in it is
 * told why and let go, and the room — its code and its chat with it — is
 * deleted when the mutation saves it.
 */
@Injectable()
export class RoomCloser {
  private readonly logger = new Logger(RoomCloser.name);

  constructor(
    private readonly store: RoomStore,
    private readonly emitter: RealtimeEmitter,
    private readonly rooms: RoomsRepository,
  ) {}

  close(room: RoomRecord, effects: Effects, reason: RoomCloseReason): void {
    const roomId = room.id;
    const memberIds = room.members.filter((m) => !m.left).map((m) => m.id);
    room.status = 'CLOSED';
    room.session = null;
    room.closing = null;
    for (const userId of memberIds) {
      effects.defer(() => this.store.clearUserRoom(userId, roomId));
      effects.defer(() => this.emitter.toUser(userId, 'room:closed', { roomId, reason }));
      effects.defer(() => this.emitter.unsubscribeUserFromRoom(userId, roomId));
    }
    effects.defer(() => this.rooms.setStatus(roomId, 'CLOSED'));
    this.logger.log({ roomId, reason }, 'Room closed');
  }
}
