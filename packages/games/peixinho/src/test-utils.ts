import {
  SYSTEM_PLAYER_ID,
  createDeck,
  parseCardId,
  type ActionResult,
  type Card,
  type PlayerId,
  type Rng,
  type StandardRank,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import type { Dealer } from './engine';
import { createPeixinhoModule, peixinhoConfigSchema, type PeixinhoModule } from './module';
import type { PeixinhoAction, PeixinhoConfig, PeixinhoEvent, PeixinhoState } from './types';

export function card(id: string): Card {
  const parsed = parseCardId(id);
  if (!parsed || parsed.rank === 'JOKER') throw new Error(`Bad card id in test: ${id}`);
  return parsed;
}

export const cards = (...ids: string[]): Card[] => ids.map(card);
export const ids = (list: readonly Card[]): string[] => list.map((c) => c.id);
/** Card ids sorted, to compare hands regardless of order. */
export const sorted = (list: readonly Card[]): string[] => ids(list).sort();

export const config = (overrides: Partial<PeixinhoConfig> = {}): PeixinhoConfig =>
  peixinhoConfigSchema.parse(overrides);

/** Every card not named in `used`, in a fixed order. */
export function restOfDeck(used: readonly string[]): Card[] {
  const taken = new Set(used);
  return createDeck({ jokers: 0 }).filter((c) => !taken.has(c.id));
}

/** Deals the given hands; the pond starts with `pondTop` and ends with every card left. */
export function scriptedDealer(hands: Record<PlayerId, string[]>, pondTop: string[] = []): Dealer {
  return ({ seats }) => {
    const dealt = seats.flatMap((id) => hands[id] ?? []);
    return {
      hands: Object.fromEntries(seats.map((id) => [id, cards(...(hands[id] ?? []))])),
      pond: [...cards(...pondTop), ...restOfDeck([...dealt, ...pondTop])],
    };
  };
}

/** Returns the queued values first (e.g. the starter's index), then zeros. */
export function queuedRng(...values: number[]): Rng {
  const queue = [...values];
  return { nextInt: (max) => Math.min(queue.shift() ?? 0, max - 1) };
}

type Result = ActionResult<PeixinhoState, PeixinhoEvent>;
export type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly PeixinhoEvent[]) => events.map((e) => e.type);

/**
 * A hand-made state for rules that are hard to reach by dealing (empty pond,
 * players out…). Cards not named anywhere are simply out of play: conservation
 * does not hold here, only in dealt games.
 */
export function craft(input: {
  hands: Record<PlayerId, string[]>;
  pond?: string[];
  peixinhos?: Record<PlayerId, StandardRank[]>;
  current?: PlayerId;
  config?: Partial<PeixinhoConfig>;
}): PeixinhoState {
  const seats = Object.keys(input.hands);
  const pond = cards(...(input.pond ?? []));
  return {
    phase: 'PLAYING',
    config: config(input.config),
    seats,
    currentIndex: Math.max(0, seats.indexOf(input.current ?? (seats[0] as PlayerId))),
    hands: Object.fromEntries(seats.map((id) => [id, cards(...(input.hands[id] ?? []))])),
    peixinhos: Object.fromEntries(seats.map((id) => [id, [...(input.peixinhos?.[id] ?? [])]])),
    pond,
    pondSlots: pond.map((_, slot) => slot),
    pondSize: pond.length,
    awaitingFish: null,
    askLog: [],
    lastFish: null,
    actionCount: 0,
    winners: [],
    seed: 'f'.repeat(64),
  };
}

/** Fluent driver over a module, for readable turn-by-turn scenarios. */
export class Table {
  last: Success | null = null;

  constructor(
    readonly module: PeixinhoModule,
    public state: PeixinhoState,
  ) {}

  /** Deals fixed hands (clockwise in key order) and pond; `starterIndex` starts. */
  static scripted(
    hands: Record<PlayerId, string[]>,
    pondTop: string[] = [],
    cfg: Partial<PeixinhoConfig> = {},
    starterIndex = 0,
  ): Table {
    const module = createPeixinhoModule(scriptedDealer(hands, pondTop));
    return new Table(module, module.setup(Object.keys(hands), config(cfg), queuedRng(starterIndex)));
  }

  static crafted(input: Parameters<typeof craft>[0]): Table {
    return new Table(createPeixinhoModule(), craft(input));
  }

  get current(): PlayerId | null {
    return this.module.getCurrentPlayer(this.state);
  }

  hand(playerId: PlayerId): string[] {
    return sorted(this.state.hands[playerId] ?? []);
  }

  apply(action: PeixinhoAction, playerId: PlayerId): Success {
    this.last = expectOk(this.module.applyAction(this.state, action, playerId));
    this.state = this.last.state;
    return this.last;
  }

  /** Asks on behalf of the player on turn. */
  ask(asker: PlayerId, targetId: PlayerId, rank: StandardRank): Success {
    expect(this.current, 'asking turn').toBe(asker);
    return this.apply({ type: 'ASK', targetId, rank }, asker);
  }

  /** Fishes after "Vai à pesca!" (any spot draws the top card). */
  fish(pondPosition?: number): Success {
    const asker = this.state.awaitingFish?.askerId;
    expect(asker, 'someone must be fishing').toBeDefined();
    return this.apply(
      pondPosition === undefined ? { type: 'FISH' } : { type: 'FISH', pondPosition },
      asker as PlayerId,
    );
  }

  timeout(): Success {
    return this.apply({ type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID);
  }
}
