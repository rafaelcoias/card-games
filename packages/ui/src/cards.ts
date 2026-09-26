import { parseCardId, type CardId } from '@cardroom/game-core';

export type CardSize = 'xs' | 'sm' | 'md' | 'lg';

/** Poker proportion 2.5 × 3.5. `xs` is used for opponents' table cards on phones. */
export const CARD_RATIO = 250 / 350;
export const CARD_WIDTH: Record<CardSize, number> = { xs: 40, sm: 56, md: 84, lg: 120 };

export function cardHeight(size: CardSize): number {
  return Math.round(CARD_WIDTH[size] / CARD_RATIO);
}

const RANK_NAMES: Record<string, string> = {
  A: 'Ás',
  '2': 'Dois',
  '3': 'Três',
  '4': 'Quatro',
  '5': 'Cinco',
  '6': 'Seis',
  '7': 'Sete',
  '8': 'Oito',
  '9': 'Nove',
  '10': 'Dez',
  J: 'Valete',
  Q: 'Dama',
  K: 'Rei',
};

const SUIT_NAMES: Record<string, string> = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };

/** Accessible Portuguese name, e.g. "Dez de copas". */
export function cardLabel(id: CardId | null | undefined): string {
  if (!id) return 'Verso de carta';
  const card = parseCardId(id);
  if (!card) return 'Carta';
  if (card.rank === 'JOKER') return 'Joker';
  return `${RANK_NAMES[card.rank]} de ${SUIT_NAMES[card.suit ?? '']}`;
}

/** Short rank label for UI copy ("10", "Rei", "Joker"). */
export function rankLabel(rank: string): string {
  if (rank === 'JOKER') return 'Joker';
  return RANK_NAMES[rank] ?? rank;
}

/**
 * Stable pseudo-random value in [-1, 1] derived from a string, so that a card
 * keeps the same "casual" rotation on every client and every render.
 */
export function stableJitter(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1;
}
