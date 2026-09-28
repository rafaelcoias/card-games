import { describe, expect, it } from 'vitest';
import {
  STANDARD_RANKS,
  createDeck,
  createRankComparator,
  createShoe,
  drawFrom,
  isRedSuit,
  parseCardId,
  type Rank,
} from './cards';

describe('createDeck', () => {
  it('builds a 52-card deck without jokers', () => {
    const deck = createDeck({ jokers: 0 });
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => c.id)).size).toBe(52);
    expect(deck.some((c) => c.rank === 'JOKER')).toBe(false);
  });

  it('builds a 54-card deck with two distinct jokers', () => {
    const deck = createDeck({ jokers: 2 });
    expect(deck).toHaveLength(54);
    expect(deck.filter((c) => c.rank === 'JOKER').map((c) => c.id)).toEqual(['JK1', 'JK2']);
  });

  it('uses stable ids like "AS" and "10H"', () => {
    const ids = createDeck({ jokers: 0 }).map((c) => c.id);
    expect(ids).toContain('AS');
    expect(ids).toContain('10H');
    expect(ids).toContain('2C');
  });
});

describe('createShoe', () => {
  it('stacks whole decks and tells the copies of a face apart', () => {
    const shoe = createShoe({ decks: 6 });
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((c) => c.uid)).size).toBe(312);
    expect(shoe.filter((c) => c.id === 'AS').map((c) => c.uid)).toEqual([
      'AS#0',
      'AS#1',
      'AS#2',
      'AS#3',
      'AS#4',
      'AS#5',
    ]);
    for (const rank of STANDARD_RANKS) expect(shoe.filter((c) => c.rank === rank)).toHaveLength(24);
  });

  it('keeps the face of each card intact', () => {
    for (const card of createShoe({ decks: 1 })) {
      expect(card).toEqual({ ...parseCardId(card.id), uid: `${card.id}#0` });
    }
    expect(createShoe({ decks: 2, jokers: 2 }).filter((c) => c.rank === 'JOKER')).toHaveLength(4);
  });

  it('refuses an empty or fractional shoe', () => {
    expect(() => createShoe({ decks: 0 })).toThrow(RangeError);
    expect(() => createShoe({ decks: 1.5 })).toThrow(RangeError);
  });
});

describe('parseCardId', () => {
  it('round-trips every card of the deck', () => {
    for (const card of createDeck({ jokers: 2 })) {
      expect(parseCardId(card.id)).toEqual(card);
    }
  });

  it.each(['', '1S', '11H', 'JK3', 'AX', 'as', '10'])('rejects malformed id %j', (id) => {
    expect(parseCardId(id)).toBeNull();
  });
});

describe('helpers', () => {
  it('identifies red suits', () => {
    expect(isRedSuit('H')).toBe(true);
    expect(isRedSuit('D')).toBe(true);
    expect(isRedSuit('S')).toBe(false);
    expect(isRedSuit(null)).toBe(false);
  });

  it('compares by a configurable hierarchy, unranked last', () => {
    const compare = createRankComparator(STANDARD_RANKS);
    const ranks: Rank[] = ['A', 'JOKER', '2', 'K', '10'];
    expect([...ranks].sort(compare)).toEqual(['2', '10', 'K', 'A', 'JOKER']);
  });

  it('draws from the top of a pile without mutating it', () => {
    const pile = [1, 2, 3, 4];
    expect(drawFrom(pile, 3)).toEqual({ drawn: [4, 3, 2], rest: [1] });
    expect(drawFrom(pile, 10)).toEqual({ drawn: [4, 3, 2, 1], rest: [] });
    expect(drawFrom(pile, -1)).toEqual({ drawn: [], rest: [1, 2, 3, 4] });
    expect(pile).toEqual([1, 2, 3, 4]);
  });
});
