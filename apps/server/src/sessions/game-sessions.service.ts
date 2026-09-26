import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AnyGameModule, GameRegistry } from '@cardroom/game-core';
import { createDrbgRng, generateSeed } from '@cardroom/game-core/node';
import { ErrorCode, type MatchResult } from '@cardroom/shared';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { GAME_REGISTRY } from '../games/tokens';
import { MatchesRepository, RoomsRepository } from '../persistence/repositories';
import type { Effects } from '../rooms/effects';
import { purgeLeftMembers, requireMember } from '../rooms/room.logic';
import type { RoomRecord, SessionRecord } from '../rooms/room.model';
import { RoomStore } from '../rooms/room.store';
import { TimerScheduler, type TimerJob } from '../scheduler/timer.scheduler';
import { RoomPublisher } from './room-publisher';
import { decideTimerReset, decisionWindowMs } from './timer-policy';

/**
 * Owns the lifecycle of matches: start, authoritative action processing,
 * timers/default actions, away-player automation and completion.
 * All methods taking a `RoomRecord` must run inside `RoomStore.mutate`.
 */
@Injectable()
export class GameSessionsService implements OnModuleInit {
  private readonly logger = new Logger(GameSessionsService.name);

  constructor(
    @Inject(GAME_REGISTRY) private readonly registry: GameRegistry,
    @Inject(ENV) private readonly env: Env,
    private readonly store: RoomStore,
    private readonly publisher: RoomPublisher,
    private readonly scheduler: TimerScheduler,
    private readonly matches: MatchesRepository,
    private readonly rooms: RoomsRepository,
  ) {}

  onModuleInit(): void {
    this.scheduler.register('turn', (job) => this.onTurnTimer(job));
  }

  start(room: RoomRecord, effects: Effects): void {
    const module = this.registry.require(room.gameId);
    const config = module.configSchema.parse(room.config) as Record<string, unknown>;
    const players = [...room.members].sort((a, b) => a.seat - b.seat).map((m) => m.id);
    const seed = generateSeed();
    const state = module.setup(players, config, createDrbgRng(seed), {
      previousResult: room.lastResult ? { rankings: room.lastResult.rankings } : null,
    });

    const session: SessionRecord = {
      matchId: randomUUID(),
      gameId: room.gameId,
      seed,
      state,
      seq: 0,
      players,
      config,
      startedAt: Date.now(),
      deadline: null,
      timerTotalMs: null,
      timerToken: 0,
    };
    room.session = session;
    room.status = 'PLAYING';
    for (const member of room.members) member.ready = false;
    this.armTimer(room, module, effects);

    effects.defer(() => this.rooms.setStatus(room.id, 'PLAYING'));
    effects.defer(() =>
      this.matches.create({
        id: session.matchId,
        roomId: room.id,
        gameId: room.gameId,
        seed,
        config,
        startedAt: new Date(session.startedAt),
        players: players.map((profileId, seat) => ({
          profileId,
          seat,
          username: room.members.find((m) => m.id === profileId)?.username ?? '—',
        })),
      }),
    );
    effects.defer(() => this.publisher.publishRoom(room));
    this.deferViews(room, effects);
  }

  /** Entry point for a player's intent. Validation is done by the game's schema and engine. */
  async handlePlayerAction(userId: string, rawAction: unknown): Promise<void> {
    const roomId = await this.store.getUserRoom(userId);
    if (!roomId) throw new AppError(ErrorCode.NotInRoom, 'You are not in a room');
    await this.store.mutate(roomId, (room, effects) => {
      const session = this.requireSession(room);
      requireMember(room, userId);
      const module = this.registry.require(session.gameId);
      const parsed = module.actionSchema.safeParse(rawAction);
      if (!parsed.success) throw new AppError(ErrorCode.Validation, 'Malformed game action');
      this.apply(room, module, parsed.data, userId, false, effects);
    });
  }

  /** Re-evaluates timers/abort after presence changes (away, left, kicked). */
  onPresenceChanged(room: RoomRecord, effects: Effects): void {
    const session = room.session;
    if (!session) return;
    const away = this.awayIds(room);
    if (session.players.every((id) => away.has(id))) {
      this.finish(room, effects, true);
      return;
    }
    this.armTimer(room, this.registry.require(session.gameId), effects);
  }

  /** Full resync for one user (join/reconnect). */
  sendSnapshot(room: RoomRecord, userId: string, effects: Effects): void {
    if (room.session?.players.includes(userId)) {
      effects.defer(() => this.publisher.publishViews(room, { snapshot: true, onlyUserId: userId }));
    }
  }

  private apply(
    room: RoomRecord,
    module: AnyGameModule,
    action: unknown,
    actor: string,
    automatic: boolean,
    effects: Effects,
  ): void {
    const session = this.requireSession(room);
    const before = session.state;
    const result = module.applyAction(before, action, actor);
    if (!result.ok) throw new AppError(result.error.code, result.error.message);

    session.state = result.state;
    session.seq += 1;
    const seq = session.seq;
    const matchId = session.matchId;
    effects.defer(() => this.matches.appendAction({ matchId, seq, profileId: actor, action, automatic }));
    effects.defer(() => this.publisher.publishEvents(room.id, matchId, seq, result.events));

    if (module.isFinished(result.state)) {
      this.finish(room, effects, false);
      return;
    }
    if (decideTimerReset(module, before, result.state, actor).reset) {
      this.armTimer(room, module, effects);
    }
    this.deferViews(room, effects);
  }

  /** Views go out once per unit of work, after all events, reflecting the final state. */
  private deferViews(room: RoomRecord, effects: Effects): void {
    effects.deferLatest('views', () => this.publisher.publishViews(room, { snapshot: false }));
  }

  /** Sets a fresh deadline for the current decision and schedules its timer. */
  private armTimer(room: RoomRecord, module: AnyGameModule, effects: Effects): void {
    const session = this.requireSession(room);
    const windowMs = decisionWindowMs(
      module,
      session.state,
      this.awayIds(room),
      this.env.AWAY_ACTION_DELAY_MS,
    );
    session.timerToken += 1;
    if (windowMs === null) {
      session.deadline = null;
      session.timerTotalMs = null;
      return;
    }
    session.deadline = Date.now() + windowMs;
    session.timerTotalMs = windowMs;
    const job: TimerJob = {
      kind: 'turn',
      roomId: room.id,
      token: `${session.matchId}:${session.timerToken}`,
    };
    const dueAt = session.deadline;
    effects.defer(() => this.scheduler.schedule(job, dueAt));
  }

  /** Deadline expired: play the game's default action for everyone still pending. */
  private async onTurnTimer(job: TimerJob): Promise<void> {
    await this.store
      .mutate(job.roomId, (room, effects) => {
        const session = room.session;
        if (!session || job.token !== `${session.matchId}:${session.timerToken}`) return;
        const module = this.registry.require(session.gameId);
        const tokenBefore = session.timerToken;
        for (const playerId of module.getPendingPlayers(session.state)) {
          if (!room.session) break; // a previous default action ended the match
          const action = module.getDefaultAction(room.session.state, playerId);
          if (action === null) continue;
          try {
            this.apply(room, module, action, playerId, true, effects);
          } catch (error) {
            this.logger.error({ err: error, roomId: room.id, playerId }, 'Default action rejected by engine');
          }
        }
        // Never leave a running match without a timer.
        if (room.session && room.session.timerToken === tokenBefore) {
          this.armTimer(room, module, effects);
          this.deferViews(room, effects);
        }
      })
      .catch((error: unknown) => {
        if (error instanceof AppError && error.code === ErrorCode.RoomNotFound) return;
        throw error;
      });
  }

  private finish(room: RoomRecord, effects: Effects, aborted: boolean): void {
    const session = this.requireSession(room);
    const module = this.registry.require(session.gameId);
    const rankings = aborted ? [] : [...module.getResult(session.state).rankings];
    const names = new Map(room.members.map((m) => [m.id, m.username]));
    const result: MatchResult = {
      matchId: session.matchId,
      aborted,
      rankings: rankings.map((r) => ({ ...r, username: names.get(r.playerId) ?? '—' })),
    };

    // Players receive the final view before the room returns to the lobby.
    const finishedRoom = structuredClone(room);
    effects.deferLatest('views', () => this.publisher.publishViews(finishedRoom, { snapshot: false }));
    room.session = null;
    room.status = 'OPEN';
    room.lastResult = aborted ? room.lastResult : result;
    purgeLeftMembers(room);
    for (const member of room.members) member.ready = false;
    if (room.members.length === 0) room.status = 'CLOSED';

    effects.defer(() => this.matches.finish(session.matchId, rankings, aborted));
    effects.defer(() => this.rooms.setStatus(room.id, room.status));
    effects.defer(() => this.publisher.publishFinished(finishedRoom, result));
    effects.defer(() => this.publisher.publishRoom(room));
    this.logger.log({ roomId: room.id, matchId: session.matchId, aborted }, 'Match finished');
  }

  private requireSession(room: RoomRecord): SessionRecord {
    if (!room.session) throw new AppError(ErrorCode.GameNotRunning, 'No match is running in this room');
    return room.session;
  }

  private awayIds(room: RoomRecord): Set<string> {
    return new Set(room.members.filter((m) => m.away).map((m) => m.id));
  }
}
