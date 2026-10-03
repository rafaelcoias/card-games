import { isRedSuit, type CardInstance, type Rank, type StandardRank, type Suit } from '@cardroom/game-core';
import type { Play, Seat, Team } from './types';

export const PLAYERS = 4;
/** No 8, 9 or 10 (rules §3). */
export const EXCLUDED_RANKS: readonly StandardRank[] = ['8', '9', '10'];
export const DECK_SIZE = 40;
export const HAND_SIZE = 10;
export const TRICKS_PER_HAND = 10;
export const TOTAL_POINTS = 120;

/** Strongest first, in every suit (rules §4): the Jack beats the Queen. */
export const ORDER: readonly Rank[] = ['A', '7', 'K', 'J', 'Q', '6', '5', '4', '3', '2'];
export const POINTS: Readonly<Partial<Record<Rank, number>>> = { A: 11, '7': 10, K: 4, J: 3, Q: 2 };

/** Counter-clockwise (rules §5): South, East, North, West. */
export const PLAY_ORDER: readonly Seat[] = ['S', 'E', 'N', 'W'];
export const TEAMS: Readonly<Record<Team, readonly Seat[]>> = { A: ['S', 'N'], B: ['E', 'W'] };

/** Pauses the engine asks the server for (UI §14). */
export const PACE = {
  /** A full trick stays on the table, its winner highlighted. */
  trickShown: 1200,
  /** The hand's result, before the next cut. */
  handSummary: 5000,
  /** A look at the last trick. */
  lastTrick: 3000,
} as const;

export const teamOf = (seat: Seat): Team => (seat === 'S' || seat === 'N' ? 'A' : 'B');
export const otherTeam = (team: Team): Team => (team === 'A' ? 'B' : 'A');
export const partnerOf = (seat: Seat): Seat => nextSeat(nextSeat(seat));

/** The one who plays after `seat`: on their right. */
export function nextSeat(seat: Seat, steps = 1): Seat {
  const index = PLAY_ORDER.indexOf(seat);
  return PLAY_ORDER[(((index + steps) % PLAYERS) + PLAYERS) % PLAYERS] as Seat;
}

/** The one who played before `seat`: on their left (cuts for them, rules §6). */
export const previousSeat = (seat: Seat): Seat => nextSeat(seat, -1);

export const pointsOf = (card: Pick<CardInstance, 'rank'>): number => POINTS[card.rank] ?? 0;
export const sumPoints = (cards: readonly Pick<CardInstance, 'rank'>[]): number =>
  cards.reduce((sum, card) => sum + pointsOf(card), 0);

/** 0 is the strongest. */
export const strength = (card: Pick<CardInstance, 'rank'>): number => ORDER.indexOf(card.rank);

/**
 * Cards `hand` may play on `plays` (rules §7): anything when opening; otherwise
 * the suit led whenever there is one in hand, else anything (trump or not).
 */
export function legalCards(hand: readonly CardInstance[], plays: readonly Play[]): CardInstance[] {
  const lead = plays[0]?.card.suit;
  if (!lead) return [...hand];
  const follow = hand.filter((card) => card.suit === lead);
  return follow.length > 0 ? follow : [...hand];
}

/** The highest trump, if any was played; else the highest card of the suit led (rules §7). */
export function trickWinner(plays: readonly Play[], trumpSuit: Suit): Seat {
  const lead = plays[0];
  if (!lead) throw new Error('An empty trick has no winner');
  const trumps = plays.filter((p) => p.card.suit === trumpSuit);
  const pool = trumps.length > 0 ? trumps : plays.filter((p) => p.card.suit === lead.card.suit);
  return pool.reduce((best, play) => (strength(play.card) < strength(best.card) ? play : best)).seat;
}

/** Rules §8 (open point #2): 61–90 one game, 91–119 two, all 120 four; 60–60 nobody scores. */
export function gamesFor(points: number): number {
  if (points === TOTAL_POINTS) return 4;
  if (points >= 91) return 2;
  if (points >= 61) return 1;
  return 0;
}

const SUIT_ORDER: readonly Suit[] = ['S', 'H', 'C', 'D'];

/**
 * The card the server plays when time runs out (open point #5): the legal card
 * worth least — fewest points, then the weakest, then not a trump; the suit
 * settles what is left, so it is always the same card.
 */
export function timeoutCard(legal: readonly CardInstance[], trumpSuit: Suit | null): CardInstance {
  const sorted = [...legal].sort(
    (a, b) =>
      pointsOf(a) - pointsOf(b) ||
      strength(b) - strength(a) ||
      Number(a.suit === trumpSuit) - Number(b.suit === trumpSuit) ||
      SUIT_ORDER.indexOf(a.suit as Suit) - SUIT_ORDER.indexOf(b.suit as Suit),
  );
  const card = sorted[0];
  if (!card) throw new Error('No legal card to play');
  return card;
}

/**
 * Suits in the order a hand is laid out (UI §5): trump first, then the other
 * suits held, alternating colours as much as they can — also next to the trump.
 */
export function suitOrder(present: readonly Suit[], trumpSuit: Suit | null): Suit[] {
  const others = SUIT_ORDER.filter((suit) => suit !== trumpSuit && present.includes(suit));
  const lead = trumpSuit && present.includes(trumpSuit) ? [trumpSuit] : [];
  let best: Suit[] = others;
  let bestScore = -1;
  for (const order of permutations(others)) {
    const line = [...lead, ...order];
    const score = line.slice(1).filter((suit, i) => isRedSuit(suit) !== isRedSuit(line[i] as Suit)).length;
    if (score > bestScore) [best, bestScore] = [order, score];
  }
  return [...lead, ...best];
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

/** A hand as it is held: by `suitOrder`, each suit strongest first. */
export function sortHand(hand: readonly CardInstance[], trumpSuit: Suit | null): CardInstance[] {
  const suits = suitOrder([...new Set(hand.map((c) => c.suit as Suit))], trumpSuit);
  return [...hand].sort(
    (a, b) => suits.indexOf(a.suit as Suit) - suits.indexOf(b.suit as Suit) || strength(a) - strength(b),
  );
}
