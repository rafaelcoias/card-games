import type { z } from 'zod';
import type { Rng } from './rng';

export type PlayerId = string;

/**
 * Actor id of actions the server applies on its own (scheduled system actions).
 * Engines must reject system actions from anyone else, and player actions from it.
 */
export const SYSTEM_PLAYER_ID = '__system__';

export interface GameError {
  readonly code: string;
  readonly message: string;
}

/**
 * Domain events describe what happened so clients can animate it. They are
 * broadcast to the whole room, so they MUST NOT carry hidden information
 * (e.g. the identity of cards drawn into a private hand).
 */
export interface DomainEvent {
  readonly type: string;
}

/**
 * A system action the engine asks the server to apply (as `SYSTEM_PLAYER_ID`)
 * after a delay — e.g. pausing to show who took a trick. Engines stay pure: the
 * server owns the clock. A schedule is tied to the state it was produced from,
 * so any other action applied in between makes it stale and it is dropped.
 */
export interface ScheduledAction {
  readonly action: unknown;
  readonly delayMs: number;
}

export type ActionResult<State, Event extends DomainEvent = DomainEvent> =
  | {
      readonly ok: true;
      readonly state: State;
      readonly events: readonly Event[];
      readonly schedule?: readonly ScheduledAction[];
    }
  | { readonly ok: false; readonly error: GameError };

/**
 * How a match ended for one player. Games with finishing positions use
 * WINNER / PLACED / LOSER; games without winners (e.g. Fodinha) use SURVIVOR / LOSER.
 */
export type Outcome = 'WINNER' | 'LOSER' | 'SURVIVOR' | 'PLACED';

export interface GameStanding {
  readonly playerId: PlayerId;
  readonly outcome: Outcome;
  /** 1 is best (games with finishing positions only). */
  readonly position?: number;
  /** Final score, for games that keep one (e.g. penalty points). */
  readonly score?: number;
}

export interface GameResult {
  /** One entry per player, in display order (best first). */
  readonly standings: readonly GameStanding[];
  /** Game-specific extras, for display only. */
  readonly summary?: Record<string, unknown>;
}

export interface SetupOptions {
  /** Result of the previous match played in the same room, if any. */
  readonly previousResult?: GameResult | null;
  /**
   * Room seat of each player, in the order of `players`. SESSION games keep
   * these seats while others come and go; MATCH games may ignore them.
   */
  readonly seats?: readonly number[];
}

/**
 * `MATCH`: the players who start are the players who finish.
 * `SESSION`: a continuous table. Players join and leave between rounds and the
 * table runs until the host (or the last player) ends it; the server reports
 * those changes to the engine as `SessionAction`s.
 */
export type Lifecycle = 'MATCH' | 'SESSION';

/** System actions the server applies (as `SYSTEM_PLAYER_ID`) to SESSION games. */
export type SessionAction =
  /** Someone took a free seat mid-session (or came back to the seat they were leaving). */
  | { readonly type: 'SYS_PLAYER_JOINED'; readonly playerId: PlayerId; readonly seatIndex: number }
  /** Someone left the room: they give up their seat, at the latest when the current round ends. */
  | { readonly type: 'SYS_PLAYER_LEFT'; readonly playerId: PlayerId }
  /** The host (or the last player leaving) ends the session. */
  | { readonly type: 'SYS_END_SESSION' };

export const sessionActions = {
  joined: (playerId: PlayerId, seatIndex: number): SessionAction => ({
    type: 'SYS_PLAYER_JOINED',
    playerId,
    seatIndex,
  }),
  left: (playerId: PlayerId): SessionAction => ({ type: 'SYS_PLAYER_LEFT', playerId }),
  end: (): SessionAction => ({ type: 'SYS_END_SESSION' }),
} as const;

export type ConfigValue = string | number | boolean;

/** One room setting, described so the lobby can render it without game-specific code. */
export interface ConfigField {
  readonly key: string;
  readonly label: string;
  readonly help?: string;
  readonly options: readonly { readonly label: string; readonly value: ConfigValue }[];
}

/**
 * Contract every game implements. Engines are pure and deterministic: no I/O,
 * no clock, no ambient randomness. `State` must be JSON-serialisable because the
 * server stores it in Redis.
 *
 * Members use method syntax on purpose so concrete modules remain assignable to
 * the type-erased `AnyGameModule` stored in the registry.
 */
export interface GameModule<State, Action, Config, View = unknown, Event extends DomainEvent = DomainEvent> {
  readonly id: string;
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly lifecycle: Lifecycle;
  /** Validates/normalises room configuration (defaults applied). */
  readonly configSchema: z.ZodType<Config>;
  /** Room settings shown when creating a room; defaults come from `configSchema`. */
  readonly configUi: readonly ConfigField[];
  /** Validates actions coming from clients. Server-only actions must not pass it. */
  readonly actionSchema: z.ZodType<Action>;

  /**
   * Checks a configuration against a table size, for rules that tie both together
   * (e.g. enough cards for everyone). `null` means valid. Optional.
   */
  validateTable?(config: Config, playerCount: number): GameError | null;
  setup(players: readonly PlayerId[], config: Config, rng: Rng, options?: SetupOptions): State;
  applyAction(state: State, action: Action, playerId: PlayerId): ActionResult<State, Event>;
  getPlayerView(state: State, playerId: PlayerId): View;
  getSpectatorView(state: State): View;
  getValidActions(state: State, playerId: PlayerId): Action[];
  /** Action applied on the player's behalf when their timer expires; `null` if they have nothing to do. */
  getDefaultAction(state: State, playerId: PlayerId): Action | null;
  /** Player whose turn it is, or `null` during simultaneous phases / after the end. */
  getCurrentPlayer(state: State): PlayerId | null;
  /** Players who currently owe an action (drives timers and away-player automation). */
  getPendingPlayers(state: State): PlayerId[];
  /** Time budget for the current decision, or `null` when no timer should run. */
  getTimeoutMs(state: State): number | null;
  /**
   * System action that closes the current phase when its timer runs out, for
   * phases that end as a whole (e.g. bets close) rather than by acting for each
   * pending player. `null` or absent: the server plays `getDefaultAction` for them.
   */
  getTimeoutAction?(state: State): Action | null;
  /** SESSION games (required there): who holds a seat right now. */
  getSeatedPlayers?(state: State): PlayerId[];
  isFinished(state: State): boolean;
  getResult(state: State): GameResult;
}

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, DomainEvent>;
