import { describe, expect, it } from 'vitest';
import {
  cardPoints,
  dealerShouldHit,
  handValue,
  insuranceCost,
  insurancePayout,
  isBlackjack,
  isPair,
  netChips,
  settleHand,
  tableLimitsError,
} from './rules';
import { config, ranks } from './test-utils';
import type { Hand, HandOutcome } from './types';

describe('card and hand values (09 §1)', () => {
  it('counts pictures as 10 and the ace as 1 or 11', () => {
    expect(ranks('2', '9', '10', 'J', 'Q', 'K', 'A').map(cardPoints)).toEqual([2, 9, 10, 10, 10, 10, 1]);
  });

  it.each([
    [['A', '6'], 17, true],
    [['A', '6', '10'], 17, false],
    [['A', 'A'], 12, true],
    [['A', 'A', '9'], 21, true],
    [['A', 'A', 'A', 'A', '7'], 21, true],
    [['10', '6', 'A'], 17, false],
    [['5', '5', 'A'], 21, true],
    [['K', 'Q', '2'], 22, false],
    [[], 0, false],
  ] as const)('%j is %i (soft: %s)', (hand, total, soft) => {
    expect(handValue(ranks(...hand))).toEqual({ total, soft });
  });

  it('a blackjack is ace + ten as the first two cards of an original hand', () => {
    expect(isBlackjack({ cards: ranks('A', 'K') as Hand['cards'], fromSplit: false })).toBe(true);
    expect(isBlackjack({ cards: ranks('A', 'K') as Hand['cards'], fromSplit: true })).toBe(false);
    expect(isBlackjack({ cards: ranks('A', '5', '5') as Hand['cards'], fromSplit: false })).toBe(false);
  });

  it('pairs are cards of the same value (tens by value only when the table says so)', () => {
    expect(isPair(ranks('8', '8'), true)).toBe(true);
    expect(isPair(ranks('J', 'Q'), true)).toBe(true);
    expect(isPair(ranks('J', 'Q'), false)).toBe(false);
    expect(isPair(ranks('K', 'K'), false)).toBe(true);
    expect(isPair(ranks('8', '9'), true)).toBe(false);
    expect(isPair(ranks('8', '8', '8'), true)).toBe(false);
  });
});

describe('dealer (09 §2)', () => {
  it('stands on soft 17 with S17 and hits it with H17', () => {
    expect(dealerShouldHit(ranks('A', '6'), false)).toBe(false);
    expect(dealerShouldHit(ranks('A', '6'), true)).toBe(true);
  });

  it('hits 16 and stands on hard 17', () => {
    expect(dealerShouldHit(ranks('10', '6'), false)).toBe(true);
    expect(dealerShouldHit(ranks('10', '7'), true)).toBe(false);
    expect(dealerShouldHit(ranks('A', '7'), true)).toBe(false);
  });
});

/** Two-card-or-more hands for each player total, and the dealer's final cards. */
const PLAYER = {
  BJ: { cards: ['A', 'K'], status: 'BLACKJACK' },
  '21': { cards: ['7', '7', '7'], status: 'STOOD' },
  '20': { cards: ['K', 'Q'], status: 'STOOD' },
  '17': { cards: ['10', '7'], status: 'STOOD' },
  bust: { cards: ['10', '6', '9'], status: 'BUSTED' },
  surrender: { cards: ['10', '6'], status: 'SURRENDERED' },
} as const;
const DEALER = {
  BJ: ['A', 'Q'],
  '21': ['9', '5', '7'],
  '20': ['10', 'Q'],
  '17': ['10', '7'],
  bust: ['10', '6', '8'],
} as const;

/** Expected outcome and what a 100 bet pays back, player row × dealer column (rules §5.7). */
const MATRIX: Record<keyof typeof PLAYER, Record<keyof typeof DEALER, [HandOutcome, number]>> = {
  BJ: {
    BJ: ['PUSH', 100],
    '21': ['BLACKJACK', 250],
    '20': ['BLACKJACK', 250],
    '17': ['BLACKJACK', 250],
    bust: ['BLACKJACK', 250],
  },
  '21': { BJ: ['LOSE', 0], '21': ['PUSH', 100], '20': ['WIN', 200], '17': ['WIN', 200], bust: ['WIN', 200] },
  '20': { BJ: ['LOSE', 0], '21': ['LOSE', 0], '20': ['PUSH', 100], '17': ['WIN', 200], bust: ['WIN', 200] },
  '17': { BJ: ['LOSE', 0], '21': ['LOSE', 0], '20': ['LOSE', 0], '17': ['PUSH', 100], bust: ['WIN', 200] },
  bust: { BJ: ['LOSE', 0], '21': ['LOSE', 0], '20': ['LOSE', 0], '17': ['LOSE', 0], bust: ['LOSE', 0] },
  surrender: {
    BJ: ['SURRENDER', 50],
    '21': ['SURRENDER', 50],
    '20': ['SURRENDER', 50],
    '17': ['SURRENDER', 50],
    bust: ['SURRENDER', 50],
  },
};

describe('settlement matrix (09 §5)', () => {
  for (const [player, row] of Object.entries(MATRIX)) {
    for (const [dealer, [outcome, payout]] of Object.entries(row)) {
      it(`player ${player} vs dealer ${dealer} → ${outcome} ${payout}`, () => {
        const { cards, status } = PLAYER[player as keyof typeof PLAYER];
        const hand = { cards: ranks(...cards) as Hand['cards'], fromSplit: false, status, bet: 100 };
        expect(settleHand(hand, ranks(...DEALER[dealer as keyof typeof DEALER]))).toEqual({
          outcome,
          payout,
        });
      });
    }
  }

  it('a doubled hand wins or loses its whole stake', () => {
    const doubled = {
      cards: ranks('5', '6', '9') as Hand['cards'],
      fromSplit: false,
      status: 'STOOD' as const,
      bet: 200,
    };
    expect(settleHand(doubled, ranks('10', '7'))).toEqual({ outcome: 'WIN', payout: 400 });
    expect(settleHand(doubled, ranks('A', 'K'))).toEqual({ outcome: 'LOSE', payout: 0 });
  });

  it('21 after a split pays 1:1 and loses to a dealer blackjack', () => {
    const split = {
      cards: ranks('A', 'K') as Hand['cards'],
      fromSplit: true,
      status: 'STOOD' as const,
      bet: 50,
    };
    expect(settleHand(split, ranks('10', '9'))).toEqual({ outcome: 'WIN', payout: 100 });
    expect(settleHand(split, ranks('A', 'J'))).toEqual({ outcome: 'LOSE', payout: 0 });
  });

  it('keeps every payout whole for bets in multiples of 10', () => {
    for (let bet = 10; bet <= 500; bet += 10) {
      expect(Number.isInteger((bet * 3) / 2)).toBe(true);
      expect(Number.isInteger(insuranceCost(bet))).toBe(true);
      expect(Number.isInteger(bet / 2)).toBe(true);
    }
  });

  it('insurance pays 2:1 on a dealer blackjack and is lost otherwise', () => {
    expect(insurancePayout(25, true)).toBe(75);
    expect(insurancePayout(25, false)).toBe(0);
  });
});

describe('chips', () => {
  it('net discounts what was brought and every rebuy', () => {
    expect(netChips({ stack: 1200, buyIn: 1000, rebuys: 0 })).toBe(200);
    expect(netChips({ stack: 800, buyIn: 1000, rebuys: 1 })).toBe(-700);
  });

  it('table limits must fit together', () => {
    expect(tableLimitsError(config())).toBeNull();
    expect(tableLimitsError(config({ minBet: 100, maxBet: 50 }))).toMatch(/mínima/);
    expect(tableLimitsError({ ...config(), minBet: 600, maxBet: 1000 })).toMatch(/recompra/);
  });
});
