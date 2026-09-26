import type { z } from 'zod';
import type { Rng } from './rng';

export type PlayerId = string;

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

export type ActionResult<State, Event extends DomainEvent = DomainEvent> =
  | { readonly ok: true; readonly state: State; readonly events: readonly Event[] }
  | { readonly ok: false; readonly error: GameError };

export interface GameRanking {
  readonly playerId: PlayerId;
  /** 1 is best. */
  readonly position: number;
}

export interface GameResult {
  readonly rankings: readonly GameRanking[];
}

export interface SetupOptions {
  /** Result of the previous match played in the same room, if any. */
  readonly previousResult?: GameResult | null;
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
  /** Validates/normalises room configuration (defaults applied). */
  readonly configSchema: z.ZodType<Config>;
  /** Validates actions coming from clients. Server-only actions must not pass it. */
  readonly actionSchema: z.ZodType<Action>;

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
  isFinished(state: State): boolean;
  getResult(state: State): GameResult;
}

export type AnyGameModule = GameModule<unknown, unknown, unknown, unknown, DomainEvent>;
