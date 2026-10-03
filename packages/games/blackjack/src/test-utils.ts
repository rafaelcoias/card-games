import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  parseCardId,
  shuffle,
  type ActionResult,
  type Card,
  type CardInstance,
  type PlayerId,
  type SetupOptions,
  WALLET,
} from '@cardroom/game-core';
import { expect } from 'vitest';
import { scheduleFor } from './engine';
import { blackjackConfigSchema, createBlackjackModule, type BlackjackModule } from './module';
import { chipsInPlay } from './state';
import type { Shuffler } from './shoe';
import type {
  BlackjackAction,
  BlackjackClientAction,
  BlackjackConfig,
  BlackjackEvent,
  BlackjackState,
  BlackjackSystemAction,
} from './types';

export function card(id: string, deck = 0): CardInstance {
  const parsed = parseCardId(id);
  if (!parsed || parsed.rank === 'JOKER') throw new Error(`Bad card id in test: ${id}`);
  return { ...parsed, uid: `${id}#${deck}` };
}

export const cards = (...ids: string[]): CardInstance[] => ids.map((id) => card(id));
export const ranks = (...ranksList: Card['rank'][]): Pick<Card, 'rank'>[] =>
  ranksList.map((rank) => ({ rank }));

export const config = (overrides: Partial<BlackjackConfig> = {}): BlackjackConfig =>
  blackjackConfigSchema.parse(overrides);

/**
 * The first shoe starts with `order` (card ids, dealt in that order), followed
 * by the rest of the cards; later shoes are shuffled normally.
 */
export function stackedShuffler(order: readonly string[]): Shuffler {
  return (source, rng, { shoe }) => {
    if (shoe > 0) return shuffle(source, rng);
    const rest = [...source];
    const top = order.map((id) => {
      const index = rest.findIndex((c) => c.id === id);
      if (index === -1) throw new Error(`The shoe has no more ${id}`);
      return rest.splice(index, 1)[0] as CardInstance;
    });
    return [...top, ...rest];
  };
}

type Result = ActionResult<BlackjackState, BlackjackEvent>;
type Success = Extract<Result, { ok: true }>;

export function expectOk(result: Result): Success {
  if (!result.ok) throw new Error(`Expected success, got ${result.error.code}: ${result.error.message}`);
  return result;
}

export function expectError(result: Result, code: string): void {
  expect(result.ok, 'expected a rejection').toBe(false);
  if (!result.ok) expect(result.error.code).toBe(code);
}

export const eventTypes = (events: readonly BlackjackEvent[]) => events.map((e) => e.type);

/**
 * Chips are neither created nor destroyed: what players hold (seated or gone)
 * plus what is on the felt plus what the house won equals everything bought in.
 */
export function assertConservation(state: BlackjackState): void {
  const people = [...state.seats, ...state.departed];
  const boughtIn = people.reduce((sum, p) => sum + p.buyIn + WALLET.rebuy * p.rebuys, 0);
  const held = people.reduce((sum, p) => sum + p.stack, 0);
  const onFelt = state.seats.reduce((sum, seat) => sum + chipsInPlay(seat), 0);
  if (held + onFelt + state.houseNet !== boughtIn) {
    throw new Error(
      `Chips leaked: ${held} held + ${onFelt} on the felt + ${state.houseNet} house ≠ ${boughtIn}`,
    );
  }
  for (const value of [held, onFelt, state.houseNet, ...people.map((p) => p.stack)]) {
    if (!Number.isInteger(value)) throw new Error(`Fractional chips: ${value}`);
  }
}

/** Every card is somewhere: in the shoe, on the table or in the discard pile. */
export function assertCardsAccounted(state: BlackjackState): void {
  const onTable = [...state.seats.flatMap((s) => s.hands.flatMap((h) => h.cards)), ...state.dealer.cards];
  const all = [...state.shoe.slice(state.shoeIndex), ...onTable, ...state.discard].map((c) => c.uid);
  if (all.length !== state.config.decks * 52 || new Set(all).size !== all.length) {
    throw new Error(`${all.length} cards accounted for (${new Set(all).size} distinct)`);
  }
}

/** What every player brings to a test `Table` unless told otherwise (round numbers read well). */
export const TEST_WALLET = 1000;

/** Fluent driver over a module, for readable round-by-round scenarios. */
export class Table {
  state: BlackjackState;
  last: Success | null = null;
  /** Every event since the table was set up. */
  readonly log: BlackjackEvent[] = [];

  constructor(
    readonly module: BlackjackModule,
    players: PlayerId[],
    cfg: Partial<BlackjackConfig> = {},
    options: SetupOptions = {},
    seed = 'table',
  ) {
    const wallets = options.wallets ?? Object.fromEntries(players.map((id) => [id, TEST_WALLET]));
    this.state = module.setup(players, config(cfg), createSeededRng(seed), { ...options, wallets });
  }

  /** A table whose first shoe deals `order` first. */
  static stacked(
    players: PlayerId[],
    order: readonly string[],
    cfg: Partial<BlackjackConfig> = {},
    options: SetupOptions = {},
  ): Table {
    return new Table(createBlackjackModule(stackedShuffler(order)), players, cfg, options);
  }

  apply(action: BlackjackClientAction, playerId: PlayerId): Success {
    return this.commit(this.module.applyAction(this.state, action, playerId));
  }

  try(action: BlackjackAction, playerId: PlayerId): Result {
    return this.module.applyAction(this.state, action, playerId);
  }

  system(action: BlackjackSystemAction): Success {
    return this.commit(this.module.applyAction(this.state, action, SYSTEM_PLAYER_ID));
  }

  /**
   * Lets the dealer take their scheduled steps until someone owes a decision,
   * the round is settled, or nothing is scheduled.
   */
  run(): this {
    for (let guard = 0; guard < 100; guard++) {
      const [next] = scheduleFor(this.state);
      if (!next || this.state.phase === 'SETTLEMENT') return this;
      if (this.module.getPendingPlayers(this.state).length > 0) return this;
      this.system(next.action as BlackjackSystemAction);
    }
    throw new Error('The dealer never stopped');
  }

  /** Clears the settled round (shuffling if the cut card came out) and opens the next bets. */
  nextRound(): this {
    this.system({ type: 'SYS_NEXT_ROUND' });
    if (this.state.phase === 'SHUFFLING') this.system({ type: 'SYS_SHUFFLE_DONE' });
    return this;
  }

  /** Places the bets (then the deal runs until the first decision). */
  bet(bets: Record<PlayerId, number>): this {
    for (const [playerId, amount] of Object.entries(bets))
      this.apply({ type: 'PLACE_BET', amount }, playerId);
    if (this.state.phase === 'BETTING') this.system({ type: 'SYS_BETTING_CLOSED' });
    return this.run();
  }

  /** Decisions of the player on turn, in order. */
  play(playerId: PlayerId, ...decisions: ('HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'SURRENDER')[]): this {
    for (const type of decisions) {
      expect(this.module.getCurrentPlayer(this.state), `turn for ${type}`).toBe(playerId);
      this.apply({ type }, playerId);
    }
    return this.run();
  }

  /** Sets a player's chips for a scenario; the difference goes to the house, so no chip is conjured. */
  setStack(playerId: PlayerId, stack: number): this {
    const seat = this.state.seats.find((s) => s.playerId === playerId);
    if (!seat) throw new Error(`${playerId} is not seated`);
    this.state.houseNet += seat.stack - stack;
    seat.stack = stack;
    return this;
  }

  stack(playerId: PlayerId): number {
    return this.state.seats.find((s) => s.playerId === playerId)?.stack ?? NaN;
  }

  hands(playerId: PlayerId) {
    return this.state.seats.find((s) => s.playerId === playerId)?.hands ?? [];
  }

  private commit(result: Result): Success {
    const success = expectOk(result);
    this.last = success;
    this.state = success.state;
    this.log.push(...success.events);
    assertConservation(this.state);
    assertCardsAccounted(this.state);
    return success;
  }
}
