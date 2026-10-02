import {
  SYSTEM_PLAYER_ID,
  createShoe,
  parseCardId,
  type ActionResult,
  type CardInstance,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import type { Dealer } from './engine';
import { createGringoModule, gringoConfigSchema, type GringoModule } from './module';
import type { GringoAction, GringoConfig, GringoEvent, GringoState } from './types';

/** `"7S"`, `"10H"`, `"JK1"`; `copy` tells the decks of a shoe apart. */
export function card(id: string, copy = 0): CardInstance {
  const parsed = parseCardId(id);
  if (!parsed) throw new Error(`Bad card id in test: ${id}`);
  return { ...parsed, uid: `${id}#${copy}` };
}

export const config = (overrides: Partial<GringoConfig> = {}): GringoConfig =>
  gringoConfigSchema.parse(overrides);

/**
 * Deals exactly the given grids (positions 0–3) and puts `deckTop` on top of
 * the deck; with `fill`, the rest of the shoe follows in a fixed order.
 */
export const scriptedDealer =
  (grids: Record<PlayerId, string[]>, deckTop: string[], fill = true): Dealer =>
  ({ seats, decks }) => {
    const dealt = Object.fromEntries(seats.map((id) => [id, (grids[id] ?? []).map((c) => card(c))]));
    const top = deckTop.map((c) => card(c));
    const used = new Set([...Object.values(dealt).flat(), ...top].map((c) => c.uid));
    const rest = fill ? createShoe({ decks, jokers: 2 }).filter((c) => !used.has(c.uid)) : [];
    return { grids: dealt, deck: [...top, ...rest] };
  };

/** Returns the queued values first, then zeros. */
export function queuedRng(...values: number[]): Rng {
  const queue = [...values];
  return { nextInt: (max) => Math.min(queue.shift() ?? 0, max - 1) };
}

type Result = ActionResult<GringoState, GringoEvent>;
export type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly GringoEvent[]) => events.map((e) => e.type);

/** Fluent driver over a module, for readable play-by-play scenarios. */
export class Table {
  last: Success | null = null;

  constructor(
    readonly module: GringoModule,
    public state: GringoState,
  ) {}

  /** Fixed grids, clockwise in key order; the first player starts (unless `starter` says otherwise). */
  static scripted(
    grids: Record<PlayerId, string[]>,
    deckTop: string[],
    cfg: Partial<GringoConfig> = {},
    options: { fill?: boolean; starter?: number } = {},
  ): Table {
    const module = createGringoModule(scriptedDealer(grids, deckTop, options.fill ?? true));
    return new Table(module, module.setup(Object.keys(grids), config(cfg), queuedRng(options.starter ?? 0)));
  }

  /** Scripted, past the initial peek. */
  static started(...args: Parameters<typeof Table.scripted>): Table {
    const table = Table.scripted(...args);
    table.system({ type: 'SYS_INITIAL_PEEK_END' });
    return table;
  }

  get current(): PlayerId | null {
    return this.module.getCurrentPlayer(this.state);
  }

  /** Card ids by position (`null` for an empty one). */
  grid(playerId: PlayerId): (string | null)[] {
    return (this.state.grids[playerId] ?? []).map((slot) => slot.card?.id ?? null);
  }

  apply(action: GringoAction, playerId: PlayerId): Success {
    this.last = expectOk(this.module.applyAction(this.state, action, playerId));
    this.state = this.last.state;
    return this.last;
  }

  try(action: GringoAction, playerId: PlayerId): Result {
    return this.module.applyAction(this.state, action, playerId);
  }

  system(action: GringoAction): Success {
    return this.apply(action, SYSTEM_PLAYER_ID);
  }

  /** Runs what the engine scheduled (the server's clock), once. */
  tick(): Success {
    const next = this.last?.schedule?.[0]?.action as GringoAction | undefined;
    if (!next) throw new Error('Nothing scheduled');
    return this.system(next);
  }

  draw(playerId: PlayerId): Success {
    expect(this.current, 'drawing turn').toBe(playerId);
    return this.apply({ type: 'DRAW' }, playerId);
  }

  swap(playerId: PlayerId, index: number): Success {
    return this.apply({ type: 'SWAP_DRAWN', index }, playerId);
  }

  discard(playerId: PlayerId, usePower = false): Success {
    return this.apply({ type: 'DISCARD_DRAWN', usePower }, playerId);
  }

  snap(playerId: PlayerId, index: number): Success {
    return this.apply({ type: 'SNAP', discardId: this.state.snap?.discardId ?? -1, index }, playerId);
  }

  /** Lets the snap window run out (nobody snaps) or end after a snap. */
  closeWindow(): Success {
    return this.system({ type: 'SYS_SNAP_WINDOW_CLOSED', discardId: this.state.snap?.discardId ?? -1 });
  }
}
