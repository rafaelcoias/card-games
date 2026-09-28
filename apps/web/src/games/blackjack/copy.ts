import type { BlackjackConfig, Decision, HandOutcome, HandStatus } from '@cardroom/blackjack';
import { signed } from '../score';

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Label under a hand (UI §4): `16`, `7 / 17` when soft, `BLACKJACK`, `REBENTOU`. */
export function totalLabel(hand: {
  total: number;
  soft: boolean;
  status: HandStatus;
  cards: readonly unknown[];
}): string {
  if (hand.status === 'BLACKJACK') return 'BLACKJACK';
  if (hand.status === 'BUSTED') return 'REBENTOU';
  if (hand.status === 'SURRENDERED') return 'DESISTIU';
  if (hand.soft && hand.total < 21 && hand.status === 'PLAYING') return `${hand.total - 10} / ${hand.total}`;
  return String(hand.total);
}

/** Result tag of a settled hand (UI §8): `+100`, `EMPATE`, `−50`, `BLACKJACK +30`. */
export function outcomeLabel(outcome: HandOutcome, bet: number, payout: number): string {
  const net = payout - bet;
  switch (outcome) {
    case 'BLACKJACK':
      return `BLACKJACK ${signed(net)}`;
    case 'EVEN_MONEY':
      return `1:1 ${signed(net)}`;
    case 'PUSH':
      return 'EMPATE';
    case 'SURRENDER':
      return `DESISTIU ${signed(net)}`;
    case 'WIN':
    case 'LOSE':
      return signed(net);
  }
}

export const outcomeTone = (outcome: HandOutcome): 'win' | 'lose' | 'push' =>
  outcome === 'PUSH' ? 'push' : outcome === 'LOSE' || outcome === 'SURRENDER' ? 'lose' : 'win';

export const DECISION_COPY: Record<Decision, { label: string; key: string }> = {
  HIT: { label: 'Pedir', key: 'H' },
  STAND: { label: 'Ficar', key: 'S' },
  DOUBLE: { label: 'Dobrar', key: 'D' },
  SPLIT: { label: 'Separar', key: 'P' },
  SURRENDER: { label: 'Desistir', key: 'R' },
};

/** Text printed on the felt, from the table's rules (UI §1). */
export function feltPrint(rules: Pick<BlackjackConfig, 'dealerHitsSoft17' | 'insurance'>): string {
  return [
    'BLACKJACK PAGA 3 PARA 2',
    rules.dealerHitsSoft17 ? 'A BANCA PEDE NO 17 MOLE' : 'A BANCA FICA EM TODOS OS 17',
    rules.insurance ? 'SEGURO PAGA 2 PARA 1' : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Chip denominations and colours (UI §2); 5 only appears in insurance stakes. */
export const CHIP_VALUES = [500, 100, 50, 20, 10, 5] as const;
export type ChipValue = (typeof CHIP_VALUES)[number];

/** Fewest chips making `amount` (greedy works for these denominations). */
export function chipsFor(amount: number): ChipValue[] {
  const chips: ChipValue[] = [];
  let rest = amount;
  for (const value of CHIP_VALUES) {
    while (rest >= value) {
      chips.push(value);
      rest -= value;
    }
  }
  return chips;
}
