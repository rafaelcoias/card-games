import {
  SYSTEM_PLAYER_ID,
  parseCardId,
  type ActionResult,
  type Card,
  type PlayerId,
  type Rng,
  type StandardRank,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import type { Dealer } from './engine';
import { createDesconfiaModule, desconfiaConfigSchema, type DesconfiaModule } from './module';
import type { DesconfiaAction, DesconfiaConfig, DesconfiaEvent, DesconfiaState } from './types';

/** `"7S"`, `"10H"`, `"JK1"`. */
export function card(id: string): Card {
  const parsed = parseCardId(id);
  if (!parsed) throw new Error(`Bad card id in test: ${id}`);
  return parsed;
}

export const cards = (...ids: string[]): Card[] => ids.map(card);
/** Card ids sorted, to compare hands regardless of order. */
export const sorted = (list: readonly Card[]): string[] => list.map((c) => c.id).sort();

export const config = (overrides: Partial<DesconfiaConfig> = {}): DesconfiaConfig =>
  desconfiaConfigSchema.parse(overrides);

/** Deals exactly the given hands (a reduced deck is fine). */
export const scriptedDealer =
  (hands: Record<PlayerId, string[]>): Dealer =>
  ({ seats }) =>
    Object.fromEntries(seats.map((id) => [id, cards(...(hands[id] ?? []))]));

/** Returns the queued values first, then zeros. */
export function queuedRng(...values: number[]): Rng {
  const queue = [...values];
  return { nextInt: (max) => Math.min(queue.shift() ?? 0, max - 1) };
}

type Result = ActionResult<DesconfiaState, DesconfiaEvent>;
export type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly DesconfiaEvent[]) => events.map((e) => e.type);

/** Fluent driver over a module, for readable play-by-play scenarios. */
export class Table {
  last: Success | null = null;

  constructor(
    readonly module: DesconfiaModule,
    public state: DesconfiaState,
  ) {}

  /** Deals fixed hands, clockwise in key order. */
  static scripted(hands: Record<PlayerId, string[]>, cfg: Partial<DesconfiaConfig> = {}): Table {
    const module = createDesconfiaModule(scriptedDealer(hands));
    return new Table(module, module.setup(Object.keys(hands), config(cfg), queuedRng()));
  }

  get current(): PlayerId | null {
    return this.module.getCurrentPlayer(this.state);
  }

  hand(playerId: PlayerId): string[] {
    return sorted(this.state.hands[playerId] ?? []);
  }

  apply(action: DesconfiaAction, playerId: PlayerId): Success {
    this.last = expectOk(this.module.applyAction(this.state, action, playerId));
    this.state = this.last.state;
    return this.last;
  }

  /** Plays on behalf of the player on turn, after the doubt window's minimum if one is open. */
  play(playerId: PlayerId, ids: string[], claimRank: StandardRank): Success {
    const window = this.state.doubtWindow;
    if (window && !window.minElapsed && !window.lastCard) this.minElapsed();
    expect(this.current, 'playing turn').toBe(playerId);
    return this.apply({ type: 'PLAY', cardIds: ids, claimRank }, playerId);
  }

  doubt(playerId: PlayerId): Success {
    return this.apply({ type: 'DOUBT', playId: this.state.doubtWindow?.playId ?? -1 }, playerId);
  }

  minElapsed(): Success {
    return this.apply(
      { type: 'SYS_WINDOW_MIN_ELAPSED', playId: this.state.doubtWindow?.playId ?? -1 },
      SYSTEM_PLAYER_ID,
    );
  }

  lastCardClosed(): Success {
    return this.apply(
      { type: 'SYS_LAST_CARD_WINDOW_CLOSED', playId: this.state.doubtWindow?.playId ?? -1 },
      SYSTEM_PLAYER_ID,
    );
  }

  timeout(): Success {
    return this.apply({ type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID);
  }
}
