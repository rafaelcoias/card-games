import { JOKER, type Card, type PlayerId, type Rank, type Suit } from '@cardroom/game-core';
import type { OlhoConfig, Role } from './types';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
/** Room seats a session table can use. */
export const SEAT_COUNT = 8;
/** 52 cards and both jokers, all dealt (rules §2, §5). */
export const DECK_SIZE = 54;
/** Whoever is dealt it opens the first game of the session (rules §7). */
export const STARTER_CARD = '3C';

/** Rules §3: 3 < 4 < … < A < 2 < Joker; suits do not count. */
export const STRENGTH: Readonly<Record<Rank, number>> = {
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
  '2': 15,
  JOKER: 16,
};

/** Session points per game (rules §11). */
export const POINTS: Readonly<Record<Role, number>> = {
  PRESIDENTE: 2,
  VICE_PRESIDENTE: 1,
  NEUTRO: 0,
  VICE_OLHO: -1,
  OLHO: -2,
};

/**
 * The table's pace, in ms (UI §9). The server waits this long before each
 * automatic step, so every screen can show what happened.
 */
export const PACE = {
  /** The deal on screen before the best cards leave for the exchange. */
  exchangeGive: 2200,
  /** A cut: stamp and the cards sliding off (900 + 400), and a beat to read who opens. */
  cut: 1500,
  /** Everyone passed: the cards slide off (500) and the caption is read. */
  close: 1100,
  /** The game's order, roles and points (4 s), after the last play lands. */
  summary: 4500,
  /** Someone sat down at a table that was waiting for players. */
  waiting: 1500,
} as const;

/** Ties between equal ranks are broken the same way everywhere (♣ ♦ ♥ ♠). */
const SUIT_ORDER: Readonly<Record<Suit, number>> = { C: 0, D: 1, H: 2, S: 3 };

/** Position of a card from the weakest (3♣) to the strongest (the second joker). */
export function cardOrder(card: Pick<Card, 'id' | 'rank' | 'suit'>): number {
  const tie = card.rank === JOKER ? Number(card.id.slice(2)) : SUIT_ORDER[card.suit as Suit];
  return STRENGTH[card.rank] * 10 + tie;
}

/** Weakest first: the hand's order, 3 → joker, grouped by rank (UI §2). */
export const compareCards = (a: Card, b: Card): number => cardOrder(a) - cardOrder(b);

/** 2s and jokers: barred from the first trick and, as an option, from ending a hand. */
export const isPower = (rank: Rank): boolean => rank === '2' || rank === JOKER;

/** The giver's best cards for the exchange (rules §6): joker, 2, A, K…; ties by suit. */
export function bestCards(hand: readonly Card[], count: number): Card[] {
  return [...hand].sort((a, b) => compareCards(b, a)).slice(0, count);
}

/** The lowest cards: what a receiver gives back when their time runs out. */
export function lowestCards(hand: readonly Card[], count: number): Card[] {
  return [...hand].sort(compareCards).slice(0, count);
}

/** Roles from first out to last (rules §4): 3 → P N O; 4 → P VP VO O; 5+ → P VP N… VO O. */
export function rolesFor(playerCount: number): Role[] {
  if (playerCount <= 0) return [];
  if (playerCount === 1) return ['PRESIDENTE'];
  if (playerCount === 2) return ['PRESIDENTE', 'OLHO'];
  if (playerCount === 3) return ['PRESIDENTE', 'NEUTRO', 'OLHO'];
  const neutral = Array.from({ length: playerCount - 4 }, (): Role => 'NEUTRO');
  return ['PRESIDENTE', 'VICE_PRESIDENTE', ...neutral, 'VICE_OLHO', 'OLHO'];
}

export function assignRoles(order: readonly PlayerId[]): Record<PlayerId, Role> {
  const roles = rolesFor(order.length);
  return Object.fromEntries(order.map((id, i) => [id, roles[i] as Role]));
}

/** What a play is checked against: the trick on the table and the player's hand size. */
export interface PlayContext {
  count: number | null;
  topRank: Rank | null;
  isFirstOfGame: boolean;
  handSize: number;
  config: Pick<OlhoConfig, 'allowFinishWithPower' | 'firstTrickNoPower'>;
}

export type PlayErrorCode =
  | 'NO_CARDS'
  | 'MIXED_RANKS'
  | 'JOKER_ALONE'
  | 'POWER_FIRST_TRICK'
  | 'CANNOT_FINISH_WITH_POWER'
  | 'NOT_ENOUGH_TWOS'
  | 'WRONG_COUNT'
  | 'TOO_LOW';

export const PLAY_ERRORS: Readonly<Record<PlayErrorCode, string>> = {
  NO_CARDS: 'Play at least one card',
  MIXED_RANKS: 'A play is cards of one rank',
  JOKER_ALONE: 'A joker is played on its own',
  POWER_FIRST_TRICK: 'No 2s nor jokers in the first trick',
  CANNOT_FINISH_WITH_POWER: 'You cannot finish with a 2 or a joker',
  NOT_ENOUGH_TWOS: 'Not enough 2s to beat that',
  WRONG_COUNT: 'Play as many cards as the trick',
  TOO_LOW: 'Play the same rank or higher',
};

/**
 * Contract §5.1. Opening: any single, pair, triple or four of one rank, or a
 * joker. Following: as many cards, equal or higher; a joker beats anything;
 * 2s beat a play of N ≤ 3 cards with max(1, N − 1) or more of them, and on 2s
 * only more 2s (or as many, which skips the next player). `null` = valid.
 */
export function checkPlay(context: PlayContext, cards: readonly Pick<Card, 'rank'>[]): PlayErrorCode | null {
  const first = cards[0];
  if (!first) return 'NO_CARDS';
  const rank = first.rank;
  if (cards.some((c) => c.rank !== rank)) return 'MIXED_RANKS';
  if (rank === JOKER && cards.length > 1) return 'JOKER_ALONE';
  if (isPower(rank)) {
    if (context.isFirstOfGame && context.config.firstTrickNoPower) return 'POWER_FIRST_TRICK';
    if (!context.config.allowFinishWithPower && cards.length >= context.handSize)
      return 'CANNOT_FINISH_WITH_POWER';
  }
  const { count, topRank } = context;
  if (count === null || topRank === null) return null;
  if (rank === JOKER) return null;
  if (rank === '2') {
    const needed = topRank === '2' ? count : Math.max(1, count - 1);
    return cards.length >= needed ? null : 'NOT_ENOUGH_TWOS';
  }
  if (cards.length !== count) return 'WRONG_COUNT';
  return STRENGTH[rank] >= STRENGTH[topRank] ? null : 'TOO_LOW';
}

/** Every (rank, how many) a hand could play now, with the lowest suits of the rank. */
export function playOptions(context: Omit<PlayContext, 'handSize'>, hand: readonly Card[]): Card[][] {
  const byRank = new Map<Rank, Card[]>();
  for (const card of [...hand].sort(compareCards)) {
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card]);
  }
  const options: Card[][] = [];
  for (const cards of byRank.values()) {
    for (let n = 1; n <= cards.length; n++) {
      const play = cards.slice(0, n);
      if (checkPlay({ ...context, handSize: hand.length }, play) === null) options.push(play);
    }
  }
  return options;
}
