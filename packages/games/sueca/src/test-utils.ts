import {
  SYSTEM_PLAYER_ID,
  parseCardId,
  type ActionResult,
  type CardInstance,
  type GameResult,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import { shuffledDealer, type Dealer } from './engine';
import { createSuecaModule, suecaConfigSchema, type SuecaModule } from './module';
import { PLAYERS, PLAY_ORDER, nextSeat } from './rules';
import type {
  CutFrom,
  Seat,
  SuecaAction,
  SuecaConfig,
  SuecaEvent,
  SuecaState,
  SuecaSystemAction,
} from './types';

/** `"AS"` → the ace of spades of the (only) deck. */
export function card(id: string): CardInstance {
  const parsed = parseCardId(id);
  if (!parsed || parsed.rank === 'JOKER') throw new Error(`Bad card id in test: ${id}`);
  return { ...parsed, uid: `${id}#0` };
}

export const uid = (id: string) => `${id}#0`;

export const config = (overrides: Partial<SuecaConfig> = {}): SuecaConfig =>
  suecaConfigSchema.parse(overrides);

/** Returns the queued values first (e.g. the first dealer's index), then zeros. */
export function queuedRng(...values: number[]): Rng {
  const queue = [...values];
  return { nextInt: (max) => Math.min(queue.shift() ?? 0, max - 1) };
}

export interface StackedHand {
  hands: Record<Seat, string[]>;
  /** One of the dealer's cards. */
  trump: string;
  from: CutFrom;
}

/**
 * The 40-card deck (top first) that deals exactly `hands` when the cut picks
 * `trump` from `from`: the inverse of the deal (one card at a time from the
 * dealer's right, the dealer last; the trump card is the dealer's tenth).
 */
export function stackedDeck(dealer: Seat, { hands, trump, from }: StackedHand): CardInstance[] {
  const rest = { ...hands, [dealer]: hands[dealer].filter((id) => id !== trump) };
  if (rest[dealer].length !== 9) throw new Error(`The trump ${trump} must be one of the dealer's 10 cards`);
  const order = [1, 2, 3, 0].map((steps) => nextSeat(dealer, steps));
  const dealt = Array.from({ length: 39 }, (_, i) => {
    const seat = order[i % PLAYERS] as Seat;
    return card(rest[seat][Math.floor(i / PLAYERS)] as string);
  });
  const deck = from === 'TOP' ? [card(trump), ...dealt] : [...dealt, card(trump)];
  if (new Set(deck.map((c) => c.uid)).size !== 40) throw new Error('A stacked deck repeats a card');
  return deck;
}

/** Stacked decks for some hands; the others are shuffled. */
export function stackedDealer(stacks: Record<number, StackedHand>): Dealer {
  return (input) => {
    const stack = stacks[input.handNumber];
    return stack ? stackedDeck(input.dealer, stack) : shuffledDealer(input);
  };
}

type Result = ActionResult<SuecaState, SuecaEvent>;
type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly SuecaEvent[]) => events.map((e) => e.type);

export const PLAYER_IDS = ['ana', 'bruno', 'carla', 'duarte'] as const;
/** Ana South, Bruno East, Carla North, Duarte West (as in the kit's script). */
export const SEATING: Record<Seat, PlayerId> = { S: 'ana', E: 'bruno', N: 'carla', W: 'duarte' };

export interface TableOptions {
  firstDealer?: Seat;
  stacks?: Record<number, StackedHand>;
  config?: Partial<SuecaConfig>;
  previousResult?: GameResult | null;
}

/** Fluent driver over a module, for readable hand-by-hand scenarios. */
export class Table {
  readonly module: SuecaModule;
  state: SuecaState;
  last: Success | null = null;

  constructor(options: TableOptions = {}) {
    this.module = createSuecaModule(stackedDealer(options.stacks ?? {}));
    const dealerIndex = PLAY_ORDER.indexOf(options.firstDealer ?? 'S');
    this.state = this.module.setup([...PLAYER_IDS], config(options.config), queuedRng(dealerIndex), {
      seating: SEATING,
      previousResult: options.previousResult ?? null,
    });
  }

  player(seat: Seat): PlayerId {
    return this.state.seats[seat];
  }

  try(action: SuecaAction, playerId: PlayerId): Result {
    return this.module.applyAction(this.state, action, playerId);
  }

  apply(action: SuecaAction, playerId: PlayerId): Success {
    this.last = expectOk(this.try(action, playerId));
    this.state = this.last.state;
    return this.last;
  }

  system(action: SuecaSystemAction): Success {
    return this.apply(action, SYSTEM_PLAYER_ID);
  }

  cut(from: CutFrom): this {
    this.apply({ type: 'CHOOSE_CUT', from }, this.player(this.state.cutter));
    return this;
  }

  play(seat: Seat, cardId: string): Success {
    return this.apply({ type: 'PLAY', cardUid: uid(cardId) }, this.player(seat));
  }

  /** Plays one trick (`[seat, card]` in turn order) and collects it. */
  trick(...plays: [Seat, string][]): this {
    for (const [seat, cardId] of plays) this.play(seat, cardId);
    expect(this.state.phase).toBe('TRICK_DONE');
    this.system({ type: 'SYS_TRICK_SHOWN' });
    return this;
  }

  /** Plays the rest of the hand with the timeout card of whoever is on turn. */
  playOut(): this {
    while (this.state.phase === 'PLAYING' || this.state.phase === 'TRICK_DONE') {
      this.system({ type: this.state.phase === 'PLAYING' ? 'SYS_TURN_TIMEOUT' : 'SYS_TRICK_SHOWN' });
    }
    return this;
  }
}
