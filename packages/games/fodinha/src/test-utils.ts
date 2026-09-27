import {
  SYSTEM_PLAYER_ID,
  parseCardId,
  type ActionResult,
  type Card,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import { shuffledDealer, type Dealer } from './engine';
import { createFodinhaModule, fodinhaConfigSchema, type FodinhaModule } from './module';
import type { FodinhaConfig, FodinhaEvent, FodinhaState, FodinhaSystemAction } from './types';

export function card(id: string): Card {
  const parsed = parseCardId(id);
  if (!parsed || parsed.rank === 'JOKER') throw new Error(`Bad card id in test: ${id}`);
  return parsed;
}

export const cards = (...ids: string[]): Card[] => ids.map(card);

export const config = (overrides: Partial<FodinhaConfig> = {}): FodinhaConfig =>
  fodinhaConfigSchema.parse(overrides);

/** Deals the given hands for scripted rounds; other rounds fall back to a shuffled deck. */
export function scriptedDealer(rounds: Record<number, Record<PlayerId, string[]>>): Dealer {
  return (input) => {
    const scripted = rounds[input.round];
    if (!scripted) return shuffledDealer(input);
    return Object.fromEntries(input.seats.map((id) => [id, cards(...(scripted[id] ?? []))]));
  };
}

/** Returns the queued values first (e.g. the starter's index), then zeros. */
export function queuedRng(...values: number[]): Rng {
  const queue = [...values];
  return { nextInt: (max) => Math.min(queue.shift() ?? 0, max - 1) };
}

type Result = ActionResult<FodinhaState, FodinhaEvent>;
type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly FodinhaEvent[]) => events.map((e) => e.type);

/** Fluent driver over a module, for readable round-by-round scenarios. */
export class Table {
  state: FodinhaState;
  last: Success | null = null;

  constructor(
    readonly module: FodinhaModule,
    players: PlayerId[],
    cfg: Partial<FodinhaConfig> = {},
    starterIndex = 0,
  ) {
    this.state = module.setup(players, config(cfg), queuedRng(starterIndex));
  }

  static scripted(
    players: PlayerId[],
    rounds: Record<number, Record<PlayerId, string[]>>,
    cfg: Partial<FodinhaConfig> = {},
    starterIndex = 0,
  ): Table {
    return new Table(createFodinhaModule(scriptedDealer(rounds)), players, cfg, starterIndex);
  }

  get current(): PlayerId | null {
    return this.module.getCurrentPlayer(this.state);
  }

  apply(action: Parameters<FodinhaModule['applyAction']>[1], playerId: PlayerId): Success {
    this.last = expectOk(this.module.applyAction(this.state, action, playerId));
    this.state = this.last.state;
    return this.last;
  }

  system(type: FodinhaSystemAction['type']): Success {
    return this.apply({ type }, SYSTEM_PLAYER_ID);
  }

  /** Bids in turn order; the map's key order must match the turn order. */
  bid(bids: Record<PlayerId, number>): this {
    for (const [playerId, bid] of Object.entries(bids)) {
      expect(this.current, `bidding turn`).toBe(playerId);
      this.apply({ type: 'PLACE_BID', bid }, playerId);
    }
    return this;
  }

  /** Plays one trick (`[player, card]` in turn order) and clears it. */
  trick(...plays: [PlayerId, string][]): this {
    for (const [playerId, cardId] of plays) {
      expect(this.current, `playing turn`).toBe(playerId);
      this.apply({ type: 'PLAY_CARD', cardId }, playerId);
    }
    expect(this.state.phase).toBe('TRICK_RESOLVED');
    this.system('SYS_RESOLVE_TRICK_DONE');
    return this;
  }

  /** Lets the server play every unseen card of a blind round, then clears the trick. */
  blindTrick(): this {
    while (this.state.phase === 'PLAYING') this.system('SYS_AUTO_PLAY');
    this.system('SYS_RESOLVE_TRICK_DONE');
    return this;
  }

  nextRound(): this {
    this.system('SYS_NEXT_ROUND');
    return this;
  }
}
