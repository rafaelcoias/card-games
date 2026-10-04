import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  SYSTEM_PLAYER_ID,
  pauseActions,
  sessionActions,
  type AnyGameModule,
  type GameRegistry,
  type ScheduledAction,
} from '@cardroom/game-core';
import { createDrbgRng, generateSeed } from '@cardroom/game-core/node';
import { ErrorCode, type MatchResult } from '@cardroom/shared';
import { AppError } from '../common/app-error';
import { ENV, type Env } from '../config/env';
import { GAME_REGISTRY } from '../games/tokens';
import { MatchesRepository, ProfilesRepository, RoomsRepository } from '../persistence/repositories';
import type { Effects } from '../rooms/effects';
import { RoomCloser } from '../rooms/room-closer';
import { findMember, hostGone, purgeLeftMembers, requireHost, requireMember } from '../rooms/room.logic';
import type { RoomMember, RoomRecord, SessionPause, SessionRecord } from '../rooms/room.model';
import { RoomStore } from '../rooms/room.store';
import { TimerScheduler, type TimerJob } from '../scheduler/timer.scheduler';
import { RoomPublisher } from './room-publisher';
import { decideTimerReset, decisionWindowMs } from './timer-policy';

/** A system action that finds its room locked is retried this soon: losing it would freeze the table. */
const SYSTEM_RETRY_MS = 250;
/** "Wait longer" at a paused table (core §2: +2 min). */
export const PAUSE_EXTENSION_MS = 120_000;

export type AbortReason = NonNullable<MatchResult['abortReason']>;

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
    private readonly profiles: ProfilesRepository,
    private readonly closer: RoomCloser,
  ) {}

  onModuleInit(): void {
    this.scheduler.register('turn', (job) => this.onTurnTimer(job));
    this.scheduler.register('system', (job) => this.onSystemTimer(job));
    this.scheduler.register('pause', (job) => this.onPauseTimer(job));
  }

  async start(room: RoomRecord, effects: Effects): Promise<void> {
    const module = this.registry.require(room.gameId);
    const config = module.configSchema.parse(room.config) as Record<string, unknown>;
    const members = [...room.members].sort((a, b) => a.seat - b.seat);
    const players = members.map((m) => m.id);
    const tableError = module.validateTable?.(config, players.length);
    if (tableError) throw new AppError(tableError.code, tableError.message);
    // Played with the account's chips: everyone brings theirs to the table.
    const wallets = module.getWallets ? await this.profiles.wallets(players) : undefined;
    const seed = generateSeed();
    const seating = module.seating;
    const state = module.setup(players, config, createDrbgRng(seed), {
      previousResult: room.lastResult
        ? { standings: room.lastResult.standings, summary: room.lastResult.summary }
        : null,
      seats: members.map((m) => m.seat),
      wallets,
      seating: seating
        ? Object.fromEntries(members.map((m) => [seating.seats[m.seat] as string, m.id]))
        : undefined,
    });

    const session: SessionRecord = {
      matchId: randomUUID(),
      gameId: room.gameId,
      seed,
      state,
      seq: 0,
      players,
      usernames: Object.fromEntries(members.map((m) => [m.id, m.username])),
      config,
      startedAt: Date.now(),
      deadline: null,
      timerTotalMs: null,
      timerToken: 0,
      wallets,
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
        players: members.map((m) => ({
          profileId: m.id,
          seat: m.seat,
          username: m.username,
          guest: m.guest === true,
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

  /**
   * Re-evaluates timers after presence changes (away, left, kicked). With
   * nobody left at the table a match is aborted, while a session simply ends:
   * its result stands.
   */
  onPresenceChanged(room: RoomRecord, effects: Effects): void {
    const session = room.session;
    if (!session) return;
    const module = this.registry.require(session.gameId);
    const away = this.awayIds(room);
    if (session.players.every((id) => away.has(id))) {
      if (module.lifecycle === 'MATCH') {
        this.finish(room, effects, true, 'ABANDONED');
        return;
      }
      this.requestEnd(room, module, effects);
      if (!room.session) return;
    }
    // A table that pauses never plays for anyone: its clock stops and resumes with the pause.
    if (module.disconnectPolicy === 'PAUSE') return;
    this.armTimer(room, module, effects);
  }

  /** Whether the room's chat takes messages now (some games close it while a hand is played). */
  isChatOpen(room: RoomRecord): boolean {
    const session = room.session;
    if (!session) return true;
    return this.registry.require(session.gameId).isChatOpen?.(session.state) ?? true;
  }

  /**
   * A player of a match that pauses for its missing players dropped or left:
   * the table stops, with its decision clock frozen, and waits for them
   * (`getPauseGraceMs`). Other games: nothing (their players get a grace period).
   */
  playerAbsent(room: RoomRecord, userId: string, effects: Effects): void {
    const session = room.session;
    const module = session && this.registry.require(session.gameId);
    if (!session || module?.disconnectPolicy !== 'PAUSE' || !session.players.includes(userId)) return;
    if (module.isFinished(session.state) || session.pause?.playerIds.includes(userId)) return;
    const now = Date.now();
    const waitMs = module.getPauseGraceMs?.(session.state) ?? this.env.RECONNECT_GRACE_MS;
    const frozen =
      session.deadline !== null && session.timerTotalMs !== null
        ? { remainingMs: Math.max(0, session.deadline - now), totalMs: session.timerTotalMs }
        : null;
    const pause: SessionPause = session.pause ?? {
      playerIds: [],
      until: 0,
      totalMs: 0,
      expired: false,
      frozen,
    };
    pause.playerIds.push(userId);
    // Everyone missing gets the whole wait, counted from when they went.
    if (now + waitMs > pause.until) {
      pause.until = now + waitMs;
      pause.totalMs = waitMs;
    }
    pause.expired = false;
    session.pause = pause;
    this.apply(room, module, pauseActions.pause(userId), SYSTEM_PLAYER_ID, true, effects);
    this.schedulePauseEnd(room, effects);
  }

  /** A missing player is back: once nobody is missing, the table goes on with the clock it had. */
  playerReturned(room: RoomRecord, userId: string, effects: Effects): void {
    const session = room.session;
    const pause = session?.pause;
    if (!session || !pause?.playerIds.includes(userId)) return;
    const module = this.registry.require(session.gameId);
    pause.playerIds = pause.playerIds.filter((id) => id !== userId);
    if (pause.playerIds.length === 0) session.pause = null;
    this.apply(room, module, pauseActions.resume(userId), SYSTEM_PLAYER_ID, true, effects);
    if (room.session && !session.pause && pause.frozen && module.getTimeoutMs(session.state) !== null) {
      this.armTimerFor(room, pause.frozen.remainingMs, pause.frozen.totalMs, effects);
    }
  }

  /**
   * The host of a table that waited long enough: wait 2 more minutes, or end
   * the match without a result (it counts for nobody's stats).
   */
  decidePause(room: RoomRecord, userId: string, decision: 'WAIT' | 'END', effects: Effects): void {
    requireHost(room, userId);
    const pause = room.session?.pause;
    if (!pause?.expired) throw new AppError(ErrorCode.NotPaused, 'The table is not waiting for a decision');
    if (decision === 'END') {
      this.finish(room, effects, true, 'HOST_ENDED');
      return;
    }
    pause.until = Date.now() + PAUSE_EXTENSION_MS;
    pause.totalMs = PAUSE_EXTENSION_MS;
    pause.expired = false;
    this.schedulePauseEnd(room, effects);
    this.deferViews(room, effects);
  }

  private schedulePauseEnd(room: RoomRecord, effects: Effects): void {
    const session = this.requireSession(room);
    const pause = session.pause;
    if (!pause) return;
    session.pauseToken = (session.pauseToken ?? 0) + 1;
    const job: TimerJob = {
      kind: 'pause',
      roomId: room.id,
      token: `${session.matchId}:${session.pauseToken}`,
    };
    const dueAt = pause.until;
    effects.defer(() => this.scheduler.schedule(job, dueAt));
  }

  /**
   * The wait is over: the host decides — unless the host is the one missing
   * (or gone), and then nobody can: the match ends without a result.
   */
  private async onPauseTimer(job: TimerJob): Promise<void> {
    await this.store
      .mutate(job.roomId, (room, effects) => {
        const session = room.session;
        const pause = session?.pause;
        if (!session || !pause || job.token !== `${session.matchId}:${session.pauseToken ?? 0}`) return;
        const host = findMember(room, room.hostId);
        if (!host || host.left || pause.playerIds.includes(room.hostId)) {
          this.finish(room, effects, true, 'ABANDONED');
          return;
        }
        pause.expired = true;
        this.deferViews(room, effects);
      })
      .catch((error: unknown) => {
        if (error instanceof AppError && error.code === ErrorCode.RoomNotFound) return;
        throw error;
      });
  }

  /**
   * SESSION tables: someone who joined mid-session (or came back) sits down,
   * with their account's chips where the game is played with them; they play
   * from the next round.
   */
  async seatPlayer(room: RoomRecord, member: RoomMember, effects: Effects): Promise<void> {
    const session = room.session;
    const module = session && this.registry.require(session.gameId);
    if (!session || module?.lifecycle !== 'SESSION') return;
    const wallet = module.getWallets ? (await this.profiles.wallets([member.id]))[member.id] : undefined;
    const firstTime = !Object.hasOwn(session.usernames, member.id);
    session.usernames[member.id] = member.username;
    if (wallet !== undefined) session.wallets = { ...session.wallets, [member.id]: wallet };
    const joined = sessionActions.joined(member.id, member.seat, wallet);
    this.apply(room, module, joined, SYSTEM_PLAYER_ID, true, effects);
    if (firstTime) {
      const { matchId } = session;
      const player = {
        profileId: member.id,
        username: member.username,
        seat: member.seat,
        guest: member.guest === true,
      };
      effects.defer(() => this.matches.addPlayer(matchId, player));
    }
  }

  /** SESSION tables: a member who left gives up their seat, at the latest when the round in play ends. */
  releasePlayer(room: RoomRecord, userId: string, effects: Effects): void {
    const session = room.session;
    const module = session && this.registry.require(session.gameId);
    if (!session || module?.lifecycle !== 'SESSION' || !session.players.includes(userId)) return;
    this.apply(room, module, sessionActions.left(userId), SYSTEM_PLAYER_ID, true, effects);
  }

  /** The host ends a SESSION table: at once between rounds, otherwise once the round in play is settled. */
  endSession(room: RoomRecord, effects: Effects): void {
    const session = this.requireSession(room);
    const module = this.registry.require(session.gameId);
    if (module.lifecycle !== 'SESSION') {
      throw new AppError(ErrorCode.CannotEnd, 'Only session tables can be ended by the host');
    }
    if (session.endRequested)
      throw new AppError(ErrorCode.CannotEnd, 'The session already ends after this round');
    this.requestEnd(room, module, effects);
  }

  /**
   * The room is about to close (its host is gone, or it is too old): a SESSION
   * table ends once the round in play is settled, a MATCH plays on to its end.
   * Either way the room closes when the game finishes.
   */
  wrapUp(room: RoomRecord, effects: Effects): void {
    const session = room.session;
    const module = session && this.registry.require(session.gameId);
    if (module?.lifecycle === 'SESSION') this.requestEnd(room, module, effects);
  }

  /**
   * The host left mid-game. A table that pauses for its missing players
   * cannot go on (nobody would ever decide for it): the match ends at once,
   * without a result. Any other game wraps up as when the room closes.
   */
  hostLeft(room: RoomRecord, effects: Effects): void {
    const session = room.session;
    const module = session && this.registry.require(session.gameId);
    if (module?.disconnectPolicy === 'PAUSE') {
      this.finish(room, effects, true, 'ABANDONED');
      return;
    }
    this.wrapUp(room, effects);
  }

  private requestEnd(room: RoomRecord, module: AnyGameModule, effects: Effects): void {
    const session = this.requireSession(room);
    if (session.endRequested) return;
    session.endRequested = true;
    this.apply(room, module, sessionActions.end(), SYSTEM_PLAYER_ID, true, effects);
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
    if (module.lifecycle === 'SESSION') this.syncSeats(room, module, effects);
    if (module.getWallets) this.syncWallets(session, module.getWallets(result.state), effects);

    if (module.isFinished(result.state)) {
      this.finish(room, effects, false);
      return;
    }
    if (decideTimerReset(module, before, result.state, actor).reset) {
      this.armTimer(room, module, effects);
    }
    this.scheduleSystemActions(room, session, result.schedule ?? [], effects);
    this.deferViews(room, effects);
  }

  /**
   * SESSION tables: the players are whoever the engine has seated. Views go to
   * them, and members who left are let go once their seat is free.
   */
  private syncSeats(room: RoomRecord, module: AnyGameModule, effects: Effects): void {
    const session = this.requireSession(room);
    session.players = module.getSeatedPlayers?.(session.state) ?? session.players;
    if (purgeLeftMembers(room, session.players)) effects.defer(() => this.publisher.publishRoom(room));
  }

  /**
   * Games played with the account's chips: whatever changed (a hand settled,
   * a rebuy) is written to the profiles, so an account is always what its
   * owner holds — also for anyone looking at their profile meanwhile.
   */
  private syncWallets(
    session: SessionRecord,
    wallets: Readonly<Record<string, number>>,
    effects: Effects,
  ): void {
    const saved = session.wallets ?? {};
    const changed = Object.fromEntries(Object.entries(wallets).filter(([id, chips]) => saved[id] !== chips));
    if (Object.keys(changed).length === 0) return;
    session.wallets = { ...saved, ...changed };
    effects.defer(() => this.profiles.setWallets(changed));
  }

  /**
   * Queues the engine's follow-up actions (pauses between tricks, rounds…) in the
   * Redis scheduler, so they survive restarts. Each one is bound to the current
   * `seq`: if anything else is applied first, it is stale and gets dropped.
   */
  private scheduleSystemActions(
    room: RoomRecord,
    session: SessionRecord,
    schedule: readonly ScheduledAction[],
    effects: Effects,
  ): void {
    schedule.forEach(({ action, delayMs }, index) => {
      const job: TimerJob = {
        kind: 'system',
        roomId: room.id,
        token: `${session.matchId}:${session.seq}:${index}`,
        payload: action,
      };
      const dueAt = Date.now() + delayMs;
      effects.defer(() => this.scheduler.schedule(job, dueAt));
    });
  }

  private async onSystemTimer(job: TimerJob): Promise<void> {
    const [matchId, seq] = job.token.split(':');
    try {
      await this.store.mutate(job.roomId, (room, effects) => {
        const session = room.session;
        if (!session || session.matchId !== matchId || String(session.seq) !== seq) return;
        const module = this.registry.require(session.gameId);
        this.apply(room, module, job.payload, SYSTEM_PLAYER_ID, true, effects);
      });
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.RoomNotFound) return;
      if (error instanceof AppError && error.code === ErrorCode.Busy) {
        await this.scheduler.schedule(job, Date.now() + SYSTEM_RETRY_MS);
        return;
      }
      throw error;
    }
  }

  /** Views go out once per unit of work, after all events, reflecting the final state. */
  private deferViews(room: RoomRecord, effects: Effects): void {
    effects.deferLatest('views', () => this.publisher.publishViews(room, { snapshot: false }));
  }

  /** A decision clock that picks up where a pause stopped it. */
  private armTimerFor(room: RoomRecord, remainingMs: number, totalMs: number, effects: Effects): void {
    const session = this.requireSession(room);
    session.timerToken += 1;
    session.deadline = Date.now() + remainingMs;
    session.timerTotalMs = totalMs;
    const job: TimerJob = {
      kind: 'turn',
      roomId: room.id,
      token: `${session.matchId}:${session.timerToken}`,
    };
    const dueAt = session.deadline;
    effects.defer(() => this.scheduler.schedule(job, dueAt));
    this.deferViews(room, effects);
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

  /**
   * Deadline expired: close the phase if the game says how (e.g. bets close),
   * otherwise play the game's default action for everyone still pending.
   */
  private async onTurnTimer(job: TimerJob): Promise<void> {
    await this.store
      .mutate(job.roomId, (room, effects) => {
        const session = room.session;
        if (!session || job.token !== `${session.matchId}:${session.timerToken}`) return;
        const module = this.registry.require(session.gameId);
        const tokenBefore = session.timerToken;
        const closing = module.getTimeoutAction?.(session.state) ?? null;
        if (closing !== null) {
          this.applyOnTimeout(room, module, closing, SYSTEM_PLAYER_ID, effects);
        } else {
          for (const playerId of module.getPendingPlayers(session.state)) {
            if (!room.session) break; // a previous default action ended the match
            const action = module.getDefaultAction(room.session.state, playerId);
            if (action !== null) this.applyOnTimeout(room, module, action, playerId, effects);
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

  /** A timeout must never break the timer loop: an engine refusal is logged and the table goes on. */
  private applyOnTimeout(
    room: RoomRecord,
    module: AnyGameModule,
    action: unknown,
    actor: string,
    effects: Effects,
  ): void {
    try {
      this.apply(room, module, action, actor, true, effects);
    } catch (error) {
      this.logger.error({ err: error, roomId: room.id, actor }, 'Timeout action rejected by engine');
    }
  }

  private finish(room: RoomRecord, effects: Effects, abandoned: boolean, reason?: AbortReason): void {
    const session = this.requireSession(room);
    const module = this.registry.require(session.gameId);
    const gameResult = abandoned ? null : module.getResult(session.state);
    const standings = gameResult ? [...gameResult.standings] : [];
    // A session ended before anyone played a round has no result: it counts as aborted.
    const aborted = abandoned || standings.length === 0;
    const names = new Map([
      ...Object.entries(session.usernames),
      ...room.members.map((m) => [m.id, m.username] as const),
    ]);
    const result: MatchResult = {
      matchId: session.matchId,
      aborted,
      standings: standings.map((s) => ({ ...s, username: names.get(s.playerId) ?? '—' })),
      ...(aborted && reason ? { abortReason: reason } : {}),
      ...(!aborted && gameResult?.summary ? { summary: gameResult.summary } : {}),
    };

    // Players receive the final view before the room returns to the lobby.
    const finishedRoom = structuredClone(room);
    effects.deferLatest('views', () => this.publisher.publishViews(finishedRoom, { snapshot: false }));
    room.session = null;
    room.status = 'OPEN';
    room.lastResult = aborted ? room.lastResult : result;
    purgeLeftMembers(room);
    // Players say whether they want another; whoever waited for this one to end already did.
    for (const member of room.members) {
      if (session.players.includes(member.id)) member.ready = false;
    }
    if (room.members.length === 0) room.status = 'CLOSED';

    effects.defer(() => this.matches.finish(session.matchId, standings, aborted));
    effects.defer(() => this.publisher.publishFinished(finishedRoom, result));
    const closing = room.closing ?? (hostGone(room) ? 'HOST_LEFT' : null);
    if (room.status === 'OPEN' && closing) {
      this.closer.close(room, effects, closing);
    } else {
      effects.defer(() => this.rooms.setStatus(room.id, room.status));
      effects.defer(() => this.publisher.publishRoom(room));
    }
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
