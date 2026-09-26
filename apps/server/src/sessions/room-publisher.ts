import { Inject, Injectable } from '@nestjs/common';
import type { DomainEvent, GameRegistry } from '@cardroom/game-core';
import type { GameViewMessage, MatchResult } from '@cardroom/shared';
import { GAME_REGISTRY } from '../games/tokens';
import { RealtimeEmitter } from '../realtime/realtime.emitter';
import type { RoomRecord, SessionRecord } from '../rooms/room.model';
import { toRoomState } from '../rooms/room.logic';

/** Builds outgoing messages from room records and sends them to the right audience. */
@Injectable()
export class RoomPublisher {
  constructor(
    private readonly emitter: RealtimeEmitter,
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
  ) {}

  gameName(gameId: string): string {
    return this.registry.get(gameId)?.name ?? gameId;
  }

  roomState(room: RoomRecord) {
    return toRoomState(room, this.gameName(room.gameId));
  }

  publishRoom(room: RoomRecord): void {
    this.emitter.toRoom(room.id, 'room:state', this.roomState(room));
  }

  publishEvents(roomId: string, matchId: string, seq: number, events: readonly DomainEvent[]): void {
    if (events.length === 0) return;
    this.emitter.toRoom(roomId, 'game:events', { roomId, matchId, seq, events: [...events] });
  }

  /** Sends every player (or just `onlyUserId`) their own filtered view. */
  publishViews(room: RoomRecord, options: { snapshot: boolean; onlyUserId?: string }): void {
    const session = room.session;
    if (!session) return;
    const targets = options.onlyUserId ? [options.onlyUserId] : session.players;
    for (const userId of targets) {
      if (!session.players.includes(userId)) continue;
      this.emitter.toUser(userId, 'game:view', this.viewFor(room.id, session, userId, options.snapshot));
    }
  }

  publishFinished(room: RoomRecord, result: MatchResult): void {
    this.emitter.toRoom(room.id, 'game:finished', result);
  }

  private viewFor(
    roomId: string,
    session: SessionRecord,
    userId: string,
    snapshot: boolean,
  ): GameViewMessage {
    const module = this.registry.require(session.gameId);
    const pending = module.getPendingPlayers(session.state);
    return {
      roomId,
      matchId: session.matchId,
      gameId: session.gameId,
      seq: session.seq,
      view: module.getPlayerView(session.state, userId),
      validActions: module.getValidActions(session.state, userId),
      timer:
        session.deadline !== null && session.timerTotalMs !== null
          ? {
              remainingMs: Math.max(0, session.deadline - Date.now()),
              totalMs: session.timerTotalMs,
              playerIds: pending,
            }
          : null,
      snapshot,
    };
  }
}
