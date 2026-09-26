import { describe, expect, it } from 'vitest';
import {
  STANDARD_RANKS,
  createDeck,
  createRankComparator,
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
