import type { Card } from '@cardroom/game-core';
import { cardPoints, handValue, isPair } from './rules';
import type { BlackjackConfig, Decision } from './types';

/**
 * Basic strategy for 4–8 decks, dealer stands on soft 17, double after split,
 * late surrender (06-ESTRATEGIA-BASICA). Tables are data: one string per row,
 * one cell per dealer up card `2 3 4 5 6 7 8 9 10 A`.
 *
 * H hit · S stand · D double (else hit) · Ds double (else stand) · P split · R surrender (else hit)
 */
type Code = 'H' | 'S' | 'D' | 'Ds' | 'P' | 'R';
/** Totals never split. */
type TotalCode = Exclude<Code, 'P'>;

const row = <C extends Code = TotalCode>(cells: string): C[] => cells.split(' ') as C[];

/** Hard totals 4…21. */
const HARD: Record<number, TotalCode[]> = {
  ...Object.fromEntries([4, 5, 6, 7, 8].map((t) => [t, row('H H H H H H H H H H')])),
  9: row('H D D D D H H H H H'),
  10: row('D D D D D D D D H H'),
  11: row('D D D D D D D D D H'),
  12: row('H H S S S H H H H H'),
  13: row('S S S S S H H H H H'),
  14: row('S S S S S H H H H H'),
  15: row('S S S S S H H H R H'),
  16: row('S S S S S H H R R R'),
  ...Object.fromEntries([17, 18, 19, 20, 21].map((t) => [t, row('S S S S S S S S S S')])),
};

/** Soft totals 12 (A,A that cannot be split) … 21. */
const SOFT: Record<number, TotalCode[]> = {
  12: row('H H H H H H H H H H'),
  13: row('H H H D D H H H H H'),
  14: row('H H H D D H H H H H'),
  15: row('H H D D D H H H H H'),
  16: row('H H D D D H H H H H'),
  17: row('H D D D D H H H H H'),
  18: row('S Ds Ds Ds Ds S S H H H'),
  19: row('S S S S S S S S S S'),
  20: row('S S S S S S S S S S'),
  21: row('S S S S S S S S S S'),
};

/** Pairs by card value (1 = aces). Fives are played as a hard 10. */
const PAIRS: Record<number, Code[]> = {
  1: row<Code>('P P P P P P P P P P'),
  2: row<Code>('P P P P P P H H H H'),
  3: row<Code>('P P P P P P H H H H'),
  4: row<Code>('H H H P P H H H H H'),
  5: HARD[10] as TotalCode[],
  6: row<Code>('P P P P P H H H H H'),
  7: row<Code>('P P P P P P H H H H'),
  8: row<Code>('P P P P P P P P P P'),
  9: row<Code>('P P P P P S P P S S'),
  10: row<Code>('S S S S S S S S S S'),
};

/** Column of a dealer up card: 2…10 → 0…8, ace → 9. */
const column = (upCard: Pick<Card, 'rank'>): number => {
  const points = cardPoints(upCard);
  return points === 1 ? 9 : points - 2;
};

/** The table only holds for the rules it was computed for (06: otherwise switch the hint off). */
export function hintsSupported(
  config: Pick<BlackjackConfig, 'decks' | 'dealerHitsSoft17' | 'doubleAfterSplit' | 'holeCard'>,
): boolean {
  return (
    config.decks >= 4 && !config.dealerHitsSoft17 && config.doubleAfterSplit && config.holeCard === 'PEEK'
  );
}

/**
 * The basic-strategy play for a hand, among the decisions allowed right now
 * (06 "Regras de consulta"). Surrender is considered first, except for a pair
 * the table splits (8,8 is always split). Insurance is never advised.
 */
export function basicStrategy(
  cards: readonly Pick<Card, 'rank'>[],
  upCard: Pick<Card, 'rank'>,
  allowed: ReadonlySet<Decision>,
  splitTensByValue = true,
): Decision {
  const col = column(upCard);
  const pairCode =
    allowed.has('SPLIT') && isPair(cards, splitTensByValue)
      ? PAIRS[cardPoints(cards[0] as Pick<Card, 'rank'>)]?.[col]
      : undefined;
  if (pairCode === 'P') return 'SPLIT';

  const { total, soft } = handValue(cards);
  const code: TotalCode = (soft ? SOFT[total] : HARD[total])?.[col] ?? (total >= 17 ? 'S' : 'H');
  switch (code) {
    case 'R':
      return allowed.has('SURRENDER') ? 'SURRENDER' : 'HIT';
    case 'D':
      return allowed.has('DOUBLE') ? 'DOUBLE' : 'HIT';
    case 'Ds':
      return allowed.has('DOUBLE') ? 'DOUBLE' : 'STAND';
    case 'S':
      return 'STAND';
    case 'H':
      return 'HIT';
  }
}
