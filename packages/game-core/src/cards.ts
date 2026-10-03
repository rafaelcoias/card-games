export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** Standard ranks in ascending natural order (ace high). */
export const STANDARD_RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
export type StandardRank = (typeof STANDARD_RANKS)[number];

export const JOKER = 'JOKER' as const;
export type Rank = StandardRank | typeof JOKER;

/** Stable card identifier: `"AS"`, `"10H"`, `"JK1"`, `"JK2"`. */
export type CardId = string;

export interface Card {
  readonly id: CardId;
  readonly rank: Rank;
  /** `null` for jokers. */
  readonly suit: Suit | null;
}

export interface DeckOptions {
  /** 0 → 52-card deck, 2 → 54-card deck. */
  readonly jokers: 0 | 2;
  /** Ranks left out of every suit (e.g. 8, 9 and 10 for the 40-card deck of Sueca). */
  readonly excludeRanks?: readonly StandardRank[];
}

export function cardId(rank: StandardRank, suit: Suit): CardId {
  return `${rank}${suit}`;
}

export function createDeck(options: DeckOptions): Card[] {
  const excluded = new Set<StandardRank>(options.excludeRanks ?? []);
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      if (excluded.has(rank)) continue;
      deck.push({ id: cardId(rank, suit), rank, suit });
    }
  }
  for (let i = 1; i <= options.jokers; i++) {
    deck.push({ id: `JK${i}`, rank: JOKER, suit: null });
  }
  return deck;
}

/**
 * One physical card of a multi-deck shoe. `id` names the face (what is drawn);
 * `uid` tells the copies of a face apart: `"AS#3"` is the ace of spades of the
 * fourth deck. Single-deck games can keep using plain `Card`s.
 */
export interface CardInstance extends Card {
  readonly uid: string;
}

export interface ShoeOptions {
  readonly decks: number;
  /** Jokers per deck (default none). */
  readonly jokers?: DeckOptions['jokers'];
  /** Ranks left out of every deck. */
  readonly excludeRanks?: DeckOptions['excludeRanks'];
}

/** `decks` complete decks, one after the other and unshuffled. */
export function createShoe({ decks, jokers = 0, excludeRanks }: ShoeOptions): CardInstance[] {
  if (!Number.isInteger(decks) || decks < 1) throw new RangeError(`A shoe needs 1+ decks, got ${decks}`);
  const deck = createDeck({ jokers, excludeRanks });
  return Array.from({ length: decks }, (_, index) =>
    deck.map((card) => ({ ...card, uid: `${card.id}#${index}` })),
  ).flat();
}

const CARD_ID_PATTERN = /^(10|[2-9JQKA])([SHDC])$/;
const JOKER_ID_PATTERN = /^JK[12]$/;

export function parseCardId(id: string): Card | null {
  if (JOKER_ID_PATTERN.test(id)) return { id, rank: JOKER, suit: null };
  const match = CARD_ID_PATTERN.exec(id);
  if (!match) return null;
  return { id, rank: match[1] as StandardRank, suit: match[2] as Suit };
}

export function isRedSuit(suit: Suit | null): boolean {
  return suit === 'H' || suit === 'D';
}

/**
 * Builds a comparator from an explicit hierarchy. Ranks absent from `order`
 * (e.g. the joker in games where it has no position) sort after every ranked card.
 */
export function createRankComparator(order: readonly Rank[]): (a: Rank, b: Rank) => number {
  const index = new Map<Rank, number>(order.map((rank, i) => [rank, i]));
  return (a, b) => (index.get(a) ?? order.length) - (index.get(b) ?? order.length);
}

/** Splits `count` cards off the top (end) of a deck without mutating it. */
export function drawFrom<T>(pile: readonly T[], count: number): { drawn: T[]; rest: T[] } {
  const take = Math.max(0, Math.min(count, pile.length));
  return { drawn: pile.slice(pile.length - take).reverse(), rest: pile.slice(0, pile.length - take) };
}
