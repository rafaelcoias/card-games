import type { Card } from '@cardroom/game-core';
import type { BlackjackConfig, Chips, Hand, HandOutcome } from './types';

export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 7;
export const SEAT_COUNT = 7;
export const BET_UNIT = 10;

/**
 * The dealer's pace (05-DEALER-BOT §2), in ms. The server waits this long
 * before each automatic step, so everyone can follow the table.
 */
export const PACE = {
  /** Per card of the opening deal (the deal is one action; the table waits for its animation). */
  dealCard: 280,
  peek: 900,
  reveal: 700,
  dealerCard: 750,
  /** Per hand settled. */
  settleHand: 350,
  /** Results on screen before the next bets. */
  summary: 2500,
  shuffle: 2200,
} as const;

export const DEALER_NAMES = ['Rui', 'Sofia', 'Tiago', 'Marta', 'Nuno', 'Inês'] as const;

/** 2–10 at face value, pictures 10, ace 1 (or 11, see `handValue`). */
export function cardPoints(card: Pick<Card, 'rank'>): number {
  if (card.rank === 'A') return 1;
  if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') return 10;
  return Number(card.rank);
}

export interface HandValue {
  total: number;
  /** An ace counts as 11. */
  soft: boolean;
}

/** Best total without going over 21 when possible (rules §3). */
export function handValue(cards: readonly Pick<Card, 'rank'>[]): HandValue {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardPoints(card);
    if (card.rank === 'A') aces += 1;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

/** Ace + ten-value as the first two cards of an original hand; 21 after a split is not a blackjack. */
export function isBlackjack(hand: Pick<Hand, 'cards' | 'fromSplit'>): boolean {
  return !hand.fromSplit && isNatural(hand.cards);
}

export function isNatural(cards: readonly Pick<Card, 'rank'>[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

export function dealerShouldHit(cards: readonly Pick<Card, 'rank'>[], hitsSoft17: boolean): boolean {
  const { total, soft } = handValue(cards);
  return total < 17 || (hitsSoft17 && total === 17 && soft);
}

/** Two cards of the same value (10-J-Q-K alike, or only identical ranks without `splitTensByValue`). */
export function isPair(cards: readonly Pick<Card, 'rank'>[], splitTensByValue: boolean): boolean {
  const [a, b] = cards;
  if (cards.length !== 2 || !a || !b) return false;
  return splitTensByValue ? cardPoints(a) === cardPoints(b) : a.rank === b.rank;
}

/** Insurance costs half the bet (a multiple of 5 since bets are multiples of 10). */
export const insuranceCost = (bet: Chips): Chips => bet / 2;

/**
 * Result of one hand against the dealer's final cards (rules §5.7): what the
 * hand pays back — stake plus winnings — so a loss is 0 and a push the stake.
 */
export function settleHand(
  hand: Pick<Hand, 'cards' | 'fromSplit' | 'status' | 'bet'>,
  dealer: readonly Pick<Card, 'rank'>[],
): { outcome: HandOutcome; payout: Chips } {
  if (hand.status === 'SURRENDERED') return { outcome: 'SURRENDER', payout: hand.bet / 2 };
  const dealerValue = handValue(dealer);
  const dealerBlackjack = isNatural(dealer);
  if (isBlackjack(hand)) {
    return dealerBlackjack
      ? { outcome: 'PUSH', payout: hand.bet }
      : { outcome: 'BLACKJACK', payout: hand.bet + (hand.bet * 3) / 2 };
  }
  if (hand.status === 'BUSTED' || dealerBlackjack) return { outcome: 'LOSE', payout: 0 };
  const player = handValue(hand.cards).total;
  if (dealerValue.total > 21 || player > dealerValue.total) return { outcome: 'WIN', payout: hand.bet * 2 };
  if (player === dealerValue.total) return { outcome: 'PUSH', payout: hand.bet };
  return { outcome: 'LOSE', payout: 0 };
}

/** Insurance pays 2:1 (stake back plus twice it) when the dealer has blackjack. */
export const insurancePayout = (amount: Chips, dealerBlackjack: boolean): Chips =>
  dealerBlackjack ? amount * 3 : 0;

/** Rebuys are counted: net = chips now − everything bought in. */
export const netChips = (
  seat: { stack: Chips; rebuys: number },
  config: Pick<BlackjackConfig, 'startingStack'>,
) => seat.stack - config.startingStack * (1 + seat.rebuys);

/** Table-limit problems of a configuration, in Portuguese for the lobby; `null` when valid. */
export function tableLimitsError(config: BlackjackConfig): string | null {
  if (config.minBet > config.maxBet) return 'A aposta mínima não pode ser maior do que a máxima';
  if (config.maxBet > config.startingStack)
    return 'A aposta máxima não pode ser maior do que as fichas iniciais';
  return null;
}
