import { describe, expect, it } from 'vitest';
import { compareCards, fitsInDeck, handSizeCycle, handSizeForRound, resolveTrick, strength } from './rules';
import { card, cards } from './test-utils';
import type { Play } from './types';

const plays = (...ids: string[]): Play[] => ids.map((id, i) => ({ playerId: `p${i + 1}`, card: card(id) }));

describe('hand size sequence (rules §4)', () => {
  const rounds = (max: number) => Array.from({ length: 30 }, (_, i) => handSizeForRound(i + 1, max));

  it('goes up to the maximum and back down, for 30 rounds', () => {
    expect(rounds(1)).toEqual(Array<number>(30).fill(1));
    expect(rounds(2)).toEqual(Array.from({ length: 30 }, (_, i) => (i % 2) + 1));
    expect(rounds(3).slice(0, 9)).toEqual([1, 2, 3, 2, 1, 2, 3, 2, 1]);
    expect(rounds(5).slice(0, 12)).toEqual([1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4]);
    expect(rounds(7).slice(0, 14)).toEqual([1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 2]);
  });

  it('repeats a cycle of 2·max − 2 rounds', () => {
    expect(handSizeCycle(5)).toEqual([1, 2, 3, 4, 5, 4, 3, 2]);
    for (const max of [2, 3, 5, 7]) {
      const all = rounds(max);
      const period = 2 * max - 2;
      all.forEach((size, i) => {
        if (i >= period) expect(size).toBe(all[i - period]);
      });
    }
  });
});

describe('card strength (rules §3)', () => {
  it('ignores suits except for the ace of diamonds', () => {
    expect(strength(card('2C'))).toBeLessThan(strength(card('3C')));
    expect(strength(card('10S'))).toBeLessThan(strength(card('JS')));
    expect(strength(card('KH'))).toBeLessThan(strength(card('AS')));
    expect(strength(card('AS'))).toBeLessThan(strength(card('AD')));
    expect(strength(card('9S'))).toBe(strength(card('9H')));
    expect(strength(card('AS'))).toBe(strength(card('AC')));
  });

  it('sorts weakest first with a stable suit tie-break', () => {
    const sorted = [...cards('AD', '9S', 'AS', '2H', '9C')].sort(compareCards).map((c) => c.id);
    expect(sorted).toEqual(['2H', '9C', '9S', 'AS', 'AD']);
  });
});

describe('who takes the trick (rules §9)', () => {
  it.each([
    [['9S', 'KH', '4C'], 'p2'],
    [['KH', 'KS', '4C'], null],
    [['AS', 'AH', 'KD'], null],
    [['AS', 'AD', 'AH'], 'p2'],
    [['QS', 'QH', 'QD', 'JC'], null],
    [['5C', '5D'], null],
    [['AC', 'AD'], 'p2'],
    [['2C', '3C', '2D'], 'p2'],
  ])('%j → %s', (ids, winner) => {
    expect(resolveTrick(plays(...ids)).winner).toBe(winner);
  });

  it('lists every player tied at the top', () => {
    expect(resolveTrick(plays('KH', 'KS', '4C', 'KD'))).toEqual({
      winner: null,
      tiedPlayerIds: ['p1', 'p2', 'p4'],
    });
    expect(resolveTrick(plays('KH', '4C'))).toEqual({ winner: 'p1', tiedPlayerIds: [] });
  });
});

describe('table size (rules §2)', () => {
  it('needs players × max hand ≤ 52', () => {
    expect(fitsInDeck(10, 5)).toBe(true);
    expect(fitsInDeck(10, 6)).toBe(false);
    expect(fitsInDeck(7, 7)).toBe(true);
    expect(fitsInDeck(8, 7)).toBe(false);
  });
});
