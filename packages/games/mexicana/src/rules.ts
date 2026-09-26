import { STANDARD_RANKS, type Card, type Rank } from '@cardroom/game-core';
import type { CardEffectTable, CardPower, MexicanaRules, Restriction } from './types';

const NORMAL = { power: 'none', playableOnAnything: false } as const;

/** Card powers from rules §7. Variants only need a different table. */
export const DEFAULT_CARD_EFFECTS: CardEffectTable = {
  '2': { power: 'reset', playableOnAnything: true },
  '3': { power: 'mirror', playableOnAnything: true },
  '4': NORMAL,
  '5': NORMAL,
  '6': NORMAL,
  '7': { power: 'maxSeven', playableOnAnything: false },
  '8': { power: 'skip', playableOnAnything: false },
  '9': NORMAL,
  '10': { power: 'burn', playableOnAnything: true },
  J: NORMAL,
  Q: NORMAL,
  K: NORMAL,
  A: NORMAL,
  JOKER: { power: 'burn', playableOnAnything: true },
};

export const DEFAULT_RULES: MexicanaRules = {
  handSize: 3,
  layerSize: 3,
  effects: DEFAULT_CARD_EFFECTS,
  fourOfAKindBurns: true,
};

const RANK_VALUE = new Map<Rank, number>(STANDARD_RANKS.map((rank, index) => [rank, index]));

/** Position in the hierarchy 2 < … < A; `undefined` for the joker, which has none. */
export function rankValue(rank: Rank): number | undefined {
  return RANK_VALUE.get(rank);
}

export function powerOf(rank: Rank, rules: MexicanaRules): CardPower {
  return rules.effects[rank].power;
}

/**
 * Walks the pile from the top ignoring mirror cards (3s); the first other rank is
 * the effective top. `null` for an empty pile or a pile made only of mirrors.
 */
export function effectiveTopRank(pile: readonly Card[], rules: MexicanaRules): Rank | null {
  for (let i = pile.length - 1; i >= 0; i--) {
    const rank = (pile[i] as Card).rank;
    if (powerOf(rank, rules) !== 'mirror') return rank;
  }
  return null;
}

export function restrictionFor(pile: readonly Card[], rules: MexicanaRules): Restriction {
  const top = effectiveTopRank(pile, rules);
  if (top === null) return 'none';
  switch (powerOf(top, rules)) {
    case 'reset':
      return 'reset';
    case 'maxSeven':
      return 'maxSeven';
    case 'none':
    case 'mirror':
    case 'skip':
    case 'burn':
      return 'none';
  }
}

/** Whether a card of `rank` may be placed on `pile` (rules §5.4, §5.5 and §7). */
export function canPlayRank(rank: Rank, pile: readonly Card[], rules: MexicanaRules): boolean {
  if (rules.effects[rank].playableOnAnything) return true;
  const top = effectiveTopRank(pile, rules);
  if (top === null) return true;
  const topPower = powerOf(top, rules);
  if (topPower === 'reset') return true;
  const value = rankValue(rank);
  const topValue = rankValue(top);
  if (value === undefined || topValue === undefined) return true;
  return topPower === 'maxSeven' ? value <= topValue : value >= topValue;
}

export interface PlacementOutcome {
  readonly pile: Card[];
  readonly sameRankRun: number;
  readonly skips: number;
  readonly burn: 'burnCard' | 'fourOfAKind' | null;
}

/**
 * Places cards on the pile one by one, as if played in sequence, resolving their
 * powers: 8s (and 3s mirroring an 8) add skips, 10/Joker burn, and four
 * physically consecutive cards of the same rank burn (3s break the run).
 */
export function placeCards(
  pile: readonly Card[],
  cards: readonly Card[],
  sameRankRun: number,
  rules: MexicanaRules,
): PlacementOutcome {
  const next = [...pile];
  let run = sameRankRun;
  let skips = 0;
  let burnCard = false;
  let fourOfAKind = false;

  for (const card of cards) {
    const power = powerOf(card.rank, rules);
    if (power === 'mirror') {
      const mirrored = effectiveTopRank(next, rules);
      if (mirrored !== null && powerOf(mirrored, rules) === 'skip') skips += 1;
      run = 0;
    } else {
      const top = next[next.length - 1];
      run = top !== undefined && top.rank === card.rank ? run + 1 : 1;
      if (power === 'skip') skips += 1;
      if (power === 'burn') burnCard = true;
      if (rules.fourOfAKindBurns && run >= 4) fourOfAKind = true;
    }
    next.push(card);
  }

  const burn = burnCard ? 'burnCard' : fourOfAKind ? 'fourOfAKind' : null;
  return { pile: next, sameRankRun: run, skips, burn };
}

/**
 * Ordering used when the server picks face-up cards automatically ("the three
 * highest"). The joker has no hierarchy position, so it is treated as the highest.
 */
export function autoChooseScore(rank: Rank): number {
  return rankValue(rank) ?? STANDARD_RANKS.length;
}
