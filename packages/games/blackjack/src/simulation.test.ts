/**
 * Statistical validation (09 §10), blocking: seven basic-strategy bots play
 * through the real engine and the measurements must match the mathematics of
 * the default rules (6 decks, S17, DAS, late surrender: house edge ≈ 0.35%).
 * A mismatch means a bug in the engine. The shuffle gets a chi-square test.
 *
 * Hands at one table share the dealer's cards, so their results are correlated:
 * measured by batch means, a seven-seat table has a standard error of about
 * 0.21 percentage points per million hands — the kit's 0.2–0.7% window would be
 * ±1σ. Ten million hands (the kit asks for at least one) bring it to ≈ 0.07.
 *
 * `BLACKJACK_SIMULATION_HANDS` shortens the run while developing (it then only reports).
 */
import { SYSTEM_PLAYER_ID, createDeck, createSeededRng, shuffle, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { applyAction, scheduleFor } from './engine';
import { blackjack } from './module';
import { handValue } from './rules';
import { shoeRng } from './shoe';
import { allowedDecisions, currentHand, currentPlayerId, findSeat } from './state';
import { basicStrategy } from './strategy';
import { config } from './test-utils';
import type { BlackjackAction, BlackjackState } from './types';

const FULL_RUN = 10_000_000;
const HANDS = Number(process.env.BLACKJACK_SIMULATION_HANDS ?? FULL_RUN);
const BATCHES = 100;
const BET = 10;
const PLAYERS = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

interface Measurements {
  hands: number;
  wagered: number;
  houseNet: number;
  /** House edge of each consecutive batch of hands, in %, for the standard error. */
  batchEdges: number[];
  blackjacks: number;
  sixUp: number;
  sixUpBusts: number;
}

/** A basic-strategy player: flat bets, never insurance or even money (06 rule 5). */
function botAction(state: BlackjackState, playerId: PlayerId): BlackjackAction {
  const seat = findSeat(state, playerId)!;
  if (state.phase === 'BETTING') {
    return seat.stack >= BET ? { type: 'PLACE_BET', amount: BET } : { type: 'REBUY' };
  }
  if (state.phase === 'INSURANCE') {
    return { type: seat.insurance?.evenMoney ? 'EVEN_MONEY' : 'INSURANCE', take: false };
  }
  const hand = currentHand(state)!;
  const up = state.dealer.cards[0]!;
  return {
    type: basicStrategy(hand.cards, up, allowedDecisions(state, seat), state.config.splitTensByValue),
  };
}

function simulate(hands: number, seed: string): Measurements {
  const m: Measurements = {
    hands: 0,
    wagered: 0,
    houseNet: 0,
    batchEdges: [],
    blackjacks: 0,
    sixUp: 0,
    sixUpBusts: 0,
  };
  const batchSize = hands / BATCHES;
  const batchStart = { hands: 0, houseNet: 0 };
  // Deep stacks: nobody runs short of chips to double or split.
  let state = blackjack.setup(PLAYERS, config(), createSeededRng(seed), {
    wallets: Object.fromEntries(PLAYERS.map((id) => [id, 100_000])),
  });

  while (m.hands < hands || state.phase !== 'BETTING') {
    const player =
      state.phase === 'PLAYER_TURNS' ? currentPlayerId(state) : blackjack.getPendingPlayers(state)[0];
    const action = player ? botAction(state, player) : (scheduleFor(state)[0]?.action as BlackjackAction);
    const result = applyAction(state, action, player ?? SYSTEM_PLAYER_ID);
    if (!result.ok) throw new Error(`${action.type} in ${state.phase}: ${result.error.code}`);
    const next = result.state;

    for (const event of result.events) {
      if (event.type === 'BettingClosed') {
        m.hands += event.seats.length;
        m.wagered += event.seats.length * BET;
      } else if (event.type === 'RoundSettled') {
        // The dealer's bust rate counts the rounds the dealer played out: some hand stood against them.
        const played = next.seats.some((seat) => seat.hands.some((hand) => hand.status === 'STOOD'));
        if (next.dealer.cards[0]?.rank === '6' && played) {
          m.sixUp += 1;
          if (handValue(next.dealer.cards).total > 21) m.sixUpBusts += 1;
        }
      }
    }
    if (action.type === 'SYS_DEAL_DONE') {
      m.blackjacks += next.seats.filter((seat) => seat.hands[0]?.status === 'BLACKJACK').length;
    }
    if (next.phase === 'BETTING' && m.hands - batchStart.hands >= batchSize) {
      const wagered = (m.hands - batchStart.hands) * BET;
      m.batchEdges.push(((next.houseNet - batchStart.houseNet) / wagered) * 100);
      Object.assign(batchStart, { hands: m.hands, houseNet: next.houseNet });
    }
    state = next;
  }
  m.houseNet = state.houseNet;
  return m;
}

/** Standard error of the overall mean, from the spread of the batch means. */
function standardError(batches: readonly number[]): number {
  const mean = batches.reduce((sum, x) => sum + x, 0) / batches.length;
  const variance = batches.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (batches.length - 1);
  return Math.sqrt(variance / batches.length);
}

describe('statistical validation (09 §10)', () => {
  it(`basic strategy over ${HANDS.toLocaleString('en')} hands matches the house edge of 6D S17 DAS LS`, () => {
    const m = simulate(HANDS, 'validation');
    const edge = (m.houseNet / m.wagered) * 100;
    const blackjackRate = (m.blackjacks / m.hands) * 100;
    const sixBustRate = (m.sixUpBusts / m.sixUp) * 100;
    // eslint-disable-next-line no-console -- the measurements are the report the kit asks for (09 §10)
    console.info(
      [
        `Blackjack simulation — ${m.hands.toLocaleString('en')} hands, basic strategy, flat ${BET}, seven seats:`,
        `  house edge          ${edge.toFixed(3)}% ± ${standardError(m.batchEdges).toFixed(3)} (accepted 0.2–0.7%)`,
        `  player blackjacks   ${blackjackRate.toFixed(3)}%   (expected 4.75 ± 0.2)`,
        `  dealer busts, 6 up  ${sixBustRate.toFixed(2)}%   (expected 42 ± 2, over ${m.sixUp.toLocaleString('en')} rounds)`,
      ].join('\n'),
    );
    expect(m.hands).toBeGreaterThanOrEqual(HANDS);
    if (HANDS < FULL_RUN) return; // shortened: it plays, but is not precise enough to judge
    expect(edge).toBeGreaterThan(0.2);
    expect(edge).toBeLessThan(0.7);
    expect(Math.abs(blackjackRate - 4.75)).toBeLessThan(0.2);
    expect(Math.abs(sixBustRate - 42)).toBeLessThan(2);
  });

  it('shuffles every card to every position evenly (chi-square over 100 000 shuffles)', () => {
    const deck = createDeck({ jokers: 0 });
    const SHUFFLES = 100_000;
    const counts = Array.from({ length: 52 }, () => new Array<number>(52).fill(0));
    const index = new Map(deck.map((card, i) => [card.id, i]));
    // Exactly how shoes are ordered: one derived PRNG per shoe, Fisher–Yates.
    for (let n = 0; n < SHUFFLES; n++) {
      shuffle(deck, shoeRng('chi-square', n)).forEach((card, position) => {
        const row = counts[position] as number[];
        const column = index.get(card.id) as number;
        row[column] = (row[column] as number) + 1;
      });
    }
    const expected = SHUFFLES / 52;
    const chiSquare = counts.flat().reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
    // (52 − 1)² degrees of freedom: mean 2601, sd √(2·2601) ≈ 72. Accept at p = 0.001, both tails.
    const df = 51 * 51;
    const bound = 3.29 * Math.sqrt(2 * df);
    // eslint-disable-next-line no-console -- the measurements are the report the kit asks for (09 §10)
    console.info(
      `Shuffle chi-square: ${chiSquare.toFixed(1)} for ${df} degrees of freedom (accepted ${df} ± ${bound.toFixed(0)})`,
    );
    expect(Math.abs(chiSquare - df)).toBeLessThan(bound);
  });
});
