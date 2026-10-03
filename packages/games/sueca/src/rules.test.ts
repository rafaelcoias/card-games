import type { Suit } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import {
  ORDER,
  gamesFor,
  legalCards,
  nextSeat,
  partnerOf,
  pointsOf,
  previousSeat,
  sortHand,
  suitOrder,
  sumPoints,
  teamOf,
  timeoutCard,
  trickWinner,
} from './rules';
import { card } from './test-utils';
import type { Play, Seat } from './types';

const plays = (...entries: [Seat, string][]): Play[] =>
  entries.map(([seat, id]) => ({ seat, card: card(id) }));
const ids = (cards: { id: string }[]) => cards.map((c) => c.id);

describe('cards', () => {
  it('ranks A > 7 > K > J > Q > 6 > 5 > 4 > 3 > 2 and counts 120 points in the deck', () => {
    expect(ORDER).toEqual(['A', '7', 'K', 'J', 'Q', '6', '5', '4', '3', '2']);
    expect(['AS', '7S', 'KS', 'JS', 'QS', '6S'].map((id) => pointsOf(card(id)))).toEqual([
      11, 10, 4, 3, 2, 0,
    ]);
    const deck = ['S', 'H', 'D', 'C'].flatMap((suit) =>
      ['A', '7', 'K', 'J', 'Q', '6', '5', '4', '3', '2'].map((rank) => card(`${rank}${suit}`)),
    );
    expect(sumPoints(deck)).toBe(120);
  });
});

describe('seats', () => {
  it('plays counter-clockwise S → E → N → W; partners face each other', () => {
    expect(['S', 'E', 'N', 'W'].map((s) => nextSeat(s as Seat))).toEqual(['E', 'N', 'W', 'S']);
    expect(['S', 'E', 'N', 'W'].map((s) => previousSeat(s as Seat))).toEqual(['W', 'S', 'E', 'N']);
    expect(['S', 'E', 'N', 'W'].map((s) => partnerOf(s as Seat))).toEqual(['N', 'W', 'S', 'E']);
    expect(['S', 'E', 'N', 'W'].map((s) => teamOf(s as Seat))).toEqual(['A', 'B', 'A', 'B']);
    expect(nextSeat('W', 3)).toBe('N');
  });
});

describe('following suit', () => {
  const hand = ['AS', '2S', 'KH', '3D', '7C'].map(card);

  it('anything opens a trick', () => {
    expect(ids(legalCards(hand, []))).toEqual(['AS', '2S', 'KH', '3D', '7C']);
  });

  it('with the suit led, only that suit', () => {
    expect(ids(legalCards(hand, plays(['E', '6S'])))).toEqual(['AS', '2S']);
    expect(ids(legalCards(hand, plays(['E', '5H'], ['N', 'AD'])))).toEqual(['KH']);
  });

  it('without it, any card — trumping is not compulsory', () => {
    expect(ids(legalCards(['KH', '3D'].map(card), plays(['E', '6S'])))).toEqual(['KH', '3D']);
  });
});

describe('who takes the trick', () => {
  it('without trumps, the highest card of the suit led; other suits never win', () => {
    expect(trickWinner(plays(['S', '6S'], ['E', 'AH'], ['N', '7S'], ['W', 'KS']), 'D')).toBe('N');
    expect(trickWinner(plays(['S', '2C'], ['E', 'AH'], ['N', 'AS'], ['W', '7H']), 'D')).toBe('S');
  });

  it('with trumps, the highest trump', () => {
    expect(trickWinner(plays(['S', 'AS'], ['E', '2D'], ['N', '7S'], ['W', '3D']), 'D')).toBe('W');
    expect(trickWinner(plays(['S', '7D'], ['E', 'AD'], ['N', 'KD'], ['W', 'JD']), 'D')).toBe('E');
  });

  it('the Jack beats the Queen, the 7 beats the King, the 6 beats the 5', () => {
    expect(trickWinner(plays(['S', 'QH'], ['E', 'JH'], ['N', '2H'], ['W', '3H']), 'S')).toBe('E');
    expect(trickWinner(plays(['S', 'KH'], ['E', '7H'], ['N', 'JH'], ['W', 'QH']), 'S')).toBe('E');
    expect(trickWinner(plays(['S', '5C'], ['E', '6C'], ['N', '4C'], ['W', '2C']), 'S')).toBe('E');
  });

  it('refuses an empty trick', () => {
    expect(() => trickWinner([], 'S')).toThrow();
  });
});

describe('games for a hand', () => {
  it.each([
    [0, 0],
    [59, 0],
    [60, 0],
    [61, 1],
    [90, 1],
    [91, 2],
    [119, 2],
    [120, 4],
  ])('%i points → %i', (points, games) => {
    expect(gamesFor(points)).toBe(games);
  });
});

describe('the card played when time runs out', () => {
  it('fewest points first', () => {
    expect(timeoutCard(['AS', 'KS', 'QS'].map(card), 'D').id).toBe('QS');
  });

  it('then the weakest', () => {
    expect(timeoutCard(['6S', '2H', '4C'].map(card), 'D').id).toBe('2H');
  });

  it('then not a trump', () => {
    expect(timeoutCard(['2D', '2S'].map(card), 'D').id).toBe('2S');
    expect(timeoutCard(['3D', '2D'].map(card), 'D').id).toBe('2D');
  });

  it('always the same card (the suit settles the rest)', () => {
    expect(timeoutCard(['2C', '2H'].map(card), 'D').id).toBe('2H');
    expect(timeoutCard(['2H', '2C'].map(card), 'D').id).toBe('2H');
  });

  it('needs a card', () => {
    expect(() => timeoutCard([], 'D')).toThrow();
  });
});

describe('laying out a hand', () => {
  it('puts trumps first, then alternates colours', () => {
    expect(suitOrder(['S', 'H', 'C', 'D'], 'D')).toEqual(['D', 'S', 'H', 'C']);
    expect(suitOrder(['S', 'H', 'C', 'D'], 'S')).toEqual(['S', 'H', 'C', 'D']);
    expect(suitOrder(['S', 'H', 'C', 'D'], 'H')).toEqual(['H', 'S', 'D', 'C']);
    expect(suitOrder(['S', 'H', 'C', 'D'], 'C')).toEqual(['C', 'H', 'S', 'D']);
  });

  it('alternates the suits held, also next to the trump', () => {
    // Diamonds trump with spades and clubs only: red, black, black at best.
    expect(suitOrder(['S', 'C', 'D'], 'D')).toEqual(['D', 'S', 'C']);
    expect(suitOrder(['H', 'S', 'D'], 'S')).toEqual(['S', 'H', 'D']);
    expect(suitOrder(['H', 'C'], null)).toEqual(['H', 'C']);
    expect(suitOrder(['H', 'C', 'D'], 'S')).toEqual(['H', 'C', 'D']);
  });

  it('sorts each suit in the order of Sueca', () => {
    const hand = ['2S', 'JD', 'AS', '4D', 'QD', 'KH', '7S', '3C'].map(card);
    expect(ids(sortHand(hand, 'D'))).toEqual(['JD', 'QD', '4D', 'AS', '7S', '2S', 'KH', '3C']);
    const noTrump: Suit | null = null;
    expect(ids(sortHand(['3C', 'KH'].map(card), noTrump))).toEqual(['KH', '3C']);
  });
});
