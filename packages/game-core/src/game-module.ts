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
  /** Games played with the account's chips: what each player brings to the table. */
  readonly wallets?: Readonly<Record<PlayerId, number>>;
  /** Games that declare `seating`: who sits in each named seat (every seat is taken). */
  readonly seating?: Readonly<Record<string, PlayerId>>;
}

/**
 * Named seats chosen in the room before a match (e.g. the four sides of a
 * Sueca table). Seat `i` of the room is `seats[i]`; partners are given by
 * `teams`. A match starts only with every seat taken.
 */
export interface Seating {
  /** In the order of play. */
  readonly seats: readonly string[];
  readonly teams?: Readonly<Record<string, readonly string[]>>;
}

/**
 * What happens when a player of a running match drops. `AUTO_ACTION` (the
 * default): the server plays for them once their grace period is over.
 * `PAUSE`: the table stops (`PauseAction`s) until they are back, or until the
 * host, once `getPauseGraceMs` has passed, ends the match without a result.
 */
export type DisconnectPolicy = 'AUTO_ACTION' | 'PAUSE';

/** System actions the server applies (as `SYSTEM_PLAYER_ID`) to games with the `PAUSE` policy. */
export type PauseAction =
  /** A seated player dropped (or left): the table waits for them. */
  | { readonly type: 'SYS_PAUSE'; readonly playerId: PlayerId }
  /** They are back; the game goes on once nobody else is missing. */
  | { readonly type: 'SYS_RESUME'; readonly playerId: PlayerId };

export const pauseActions = {
  pause: (playerId: PlayerId): PauseAction => ({ type: 'SYS_PAUSE', playerId }),
  resume: (playerId: PlayerId): PauseAction => ({ type: 'SYS_RESUME', playerId }),
} as const;

/**
 * The chips of an account, for games played with them (Blackjack): virtual,
 * without any value, kept from one table to the next.
 */
export const WALLET = {
  /** What every account starts with. */
  start: 5000,
  /** What a player who ran out may buy back, as many times as they need. */
  rebuy: 500,
} as const;

/**
 * `MATCH`: the players who start are the players who finish.
 * `SESSION`: a continuous table. Players join and leave between rounds and the
 * table runs until the host (or the last player) ends it; the server reports
 * those changes to the engine as `SessionAction`s.
 */
export type Lifecycle = 'MATCH' | 'SESSION';

/** System actions the server applies (as `SYSTEM_PLAYER_ID`) to SESSION games. */
export type SessionAction =
  /**
   * Someone took a free seat mid-session (or came back to the seat they were
   * leaving), with the chips of their account in games played with them.
   */
  | {
      readonly type: 'SYS_PLAYER_JOINED';
      readonly playerId: PlayerId;
      readonly seatIndex: number;
      readonly wallet?: number;
    }
  /** Someone left the room: they give up their seat, at the latest when the current round ends. */
  | { readonly type: 'SYS_PLAYER_LEFT'; readonly playerId: PlayerId }
  /** The host (or the last player leaving) ends the session. */
  | { readonly type: 'SYS_END_SESSION' };

export const sessionActions = {
  joined: (playerId: PlayerId, seatIndex: number, wallet?: number): SessionAction => ({
    type: 'SYS_PLAYER_JOINED',
    playerId,
    seatIndex,
    ...(wallet === undefined ? {} : { wallet }),
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
  /** Players pick named seats (and with them, teams) in the room. Absent: seats follow arrival. */
  readonly seating?: Seating;
  /** Absent: `AUTO_ACTION`. */
  readonly disconnectPolicy?: DisconnectPolicy;
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
  /**
   * Games played with the account's chips (see `WALLET`): what each player
   * who sat down holds now, chips in play included. The server keeps the
   * accounts in step with it, and brings each account's chips to `setup` and
   * `SYS_PLAYER_JOINED`.
   */
  getWallets?(state: State): Readonly<Record<PlayerId, number>>;
  /** `PAUSE` games: how long the table waits for a player who dropped before the host may end it. */
  getPauseGraceMs?(state: State): number;
  /**
   * Games that forbid table talk at times (Sueca: during a hand, so partners
   * cannot signal): whether the room's chat takes messages now. Absent: always.
   */
  isChatOpen?(state: State): boolean;
  isFinished(state: State): boolean;
  getResult(state: State): GameResult;
}

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, DomainEvent>;
