import {
  SYSTEM_PLAYER_ID,
  parseCardId,
  type ActionResult,
  type Card,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import { scheduleFor, type Dealer } from './engine';
import { createOlhoModule, olhoConfigSchema, type OlhoModule } from './module';
import type { OlhoAction, OlhoConfig, OlhoEvent, OlhoState } from './types';

/** `"7S"`, `"10H"`, `"JK1"`. */
export function card(id: string): Card {
  const parsed = parseCardId(id);
  if (!parsed) throw new Error(`Bad card id in test: ${id}`);
  return parsed;
}

export const cards = (...ids: string[]): Card[] => ids.map(card);
/** Card ids sorted, to compare hands regardless of order. */
export const sorted = (list: readonly Card[]): string[] => list.map((c) => c.id).sort();

export const config = (overrides: Partial<OlhoConfig> = {}): OlhoConfig => olhoConfigSchema.parse(overrides);

/** Deals the given hands, game after game (a reduced deck is fine); later games repeat the last one. */
export const scriptedDealer =
  (games: readonly Record<PlayerId, string[]>[]): Dealer =>
  ({ gameNumber, seats }) => {
    const hands = games[Math.min(gameNumber, games.length) - 1] ?? {};
    return Object.fromEntries(seats.map((id) => [id, cards(...(hands[id] ?? []))]));
  };

/** Returns the queued values first, then zeros. */
export function queuedRng(...values: number[]): Rng {
  const queue = [...values];
  return { nextInt: (max) => Math.min(queue.shift() ?? 0, max - 1) };
}

type Result = ActionResult<OlhoState, OlhoEvent>;
export type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly OlhoEvent[]) => events.map((e) => e.type);

/** Fluent driver over a module, for readable play-by-play scenarios. */
export class Table {
  last: Success | null = null;

  constructor(
    readonly module: OlhoModule,
    public state: OlhoState,
  ) {}

  /** Seats the players of the first game in key order (clockwise) and deals each game's hands. */
  static scripted(games: readonly Record<PlayerId, string[]>[], cfg: Partial<OlhoConfig> = {}): Table {
    const module = createOlhoModule(scriptedDealer(games));
    const players = Object.keys(games[0] ?? {});
    return new Table(module, module.setup(players, config(cfg), queuedRng()));
  }

  get current(): PlayerId | null {
    return this.module.getCurrentPlayer(this.state);
  }

  hand(playerId: PlayerId): string[] {
    return sorted(this.state.hands[playerId] ?? []);
  }

  apply(action: OlhoAction, playerId: PlayerId): Success {
    this.last = expectOk(this.module.applyAction(this.state, action, playerId));
    this.state = this.last.state;
    return this.last;
  }

  try(action: OlhoAction, playerId: PlayerId): Result {
    return this.module.applyAction(this.state, action, playerId);
  }

  /** Plays on behalf of the player on turn (checking it is them). */
  play(playerId: PlayerId, ...ids: string[]): Success {
    expect(this.current, `${playerId} on turn`).toBe(playerId);
    return this.apply({ type: 'PLAY', cardIds: ids }, playerId);
  }

  pass(playerId: PlayerId): Success {
    expect(this.current, `${playerId} on turn`).toBe(playerId);
    return this.apply({ type: 'PASS' }, playerId);
  }

  escape(playerId: PlayerId, ...ids: string[]): Success {
    expect(this.current, `${playerId} may escape`).toBe(playerId);
    return this.apply({ type: 'ESCAPE', cardIds: ids }, playerId);
  }

  acceptSkip(playerId: PlayerId): Success {
    return this.apply({ type: 'ACCEPT_SKIP' }, playerId);
  }

  giveBack(playerId: PlayerId, ...ids: string[]): Success {
    return this.apply({ type: 'RETURN_CARDS', cardIds: ids }, playerId);
  }

  system(action: OlhoAction): Success {
    return this.apply(action, SYSTEM_PLAYER_ID);
  }

  /** Applies what the engine scheduled last (a trick clearing, the next game…). */
  runScheduled(): Success {
    const next = this.last?.schedule?.[0]?.action as OlhoAction | undefined;
    if (!next) throw new Error('Nothing scheduled');
    return this.system(next);
  }

  /** Clears a decided trick. */
  clear(): Success {
    expect(this.state.trick.closing, 'a decided trick').not.toBeNull();
    return this.system({ type: 'SYS_CLOSE_TRICK' });
  }

  /**
   * One step as the server would take it with everyone letting the clock run
   * out: the phase's timeout action or each pending player's default, else
   * what the engine scheduled. `false` when nothing can happen.
   */
  autoStep(): boolean {
    const pending = this.module.getPendingPlayers(this.state);
    const closing = this.module.getTimeoutAction?.(this.state) ?? null;
    if (closing) {
      this.system(closing);
      return true;
    }
    const playerId = pending[0];
    const fallback = playerId ? this.module.getDefaultAction(this.state, playerId) : null;
    if (playerId && fallback) {
      this.apply(fallback, playerId);
      return true;
    }
    const scheduled = scheduleFor(this.state)[0]?.action as OlhoAction | undefined;
    if (!scheduled) return false;
    this.system(scheduled);
    return true;
  }

  /** Auto-plays until `done` holds (at most `limit` steps). */
  autoUntil(done: (state: OlhoState) => boolean, limit = 2000): void {
    for (let i = 0; i < limit && !done(this.state); i++) {
      if (!this.autoStep()) break;
    }
    expect(done(this.state), 'auto-play reached its goal').toBe(true);
  }
}
