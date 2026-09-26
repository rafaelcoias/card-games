import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  autoChooseScore,
  canPlayRank,
  effectiveTopRank,
  placeCards,
  rankValue,
  restrictionFor,
} from './rules';
import { cards } from './test-utils';
import type { MexicanaRules } from './types';

describe('effectiveTopRank', () => {
  it.each([
    [[], null],
    [['3H'], null],
    [['3H', '3S'], null],
    [['9C'], '9'],
    [['9C', '3H'], '9'],
    [['7C', '3H', '3S'], '7'],
    [['KC', '4D'], '4'],
  ] as const)('%j → %s', (pile, expected) => {
    expect(effectiveTopRank(cards(...pile), DEFAULT_RULES)).toBe(expected);
  });
});

describe('restrictionFor', () => {
  it('derives the restriction from the effective top', () => {
    expect(restrictionFor(cards('2C'), DEFAULT_RULES)).toBe('reset');
    expect(restrictionFor(cards('7C', '3D'), DEFAULT_RULES)).toBe('maxSeven');
    expect(restrictionFor(cards('KC'), DEFAULT_RULES)).toBe('none');
    expect(restrictionFor(cards('8C'), DEFAULT_RULES)).toBe('none');
    expect(restrictionFor([], DEFAULT_RULES)).toBe('none');
  });
});

describe('canPlayRank', () => {
  it('handles jokers without hierarchy in custom rules', () => {
    const rules: MexicanaRules = {
      ...DEFAULT_RULES,
      effects: { ...DEFAULT_RULES.effects, JOKER: { power: 'none', playableOnAnything: false } },
    };
    expect(canPlayRank('JOKER', cards('AS'), rules)).toBe(true);
    expect(canPlayRank('4', cards('JK1'), rules)).toBe(true);
  });

  it('applies the base hierarchy', () => {
    expect(canPlayRank('A', cards('KS'), DEFAULT_RULES)).toBe(true);
    expect(canPlayRank('Q', cards('KS'), DEFAULT_RULES)).toBe(false);
    expect(canPlayRank('7', cards('7S'), DEFAULT_RULES)).toBe(true);
    expect(canPlayRank('8', cards('7S'), DEFAULT_RULES)).toBe(false);
  });
});

describe('placeCards', () => {
  it('counts skips for 8s and for 3s mirroring an 8', () => {
    expect(placeCards([], cards('8C', '8D'), 0, DEFAULT_RULES).skips).toBe(2);
    expect(placeCards(cards('8C'), cards('3D', '3S'), 1, DEFAULT_RULES).skips).toBe(2);
    expect(placeCards(cards('9C'), cards('3D'), 1, DEFAULT_RULES).skips).toBe(0);
  });

  it('can disable four-of-a-kind burning through rules', () => {
    const rules = { ...DEFAULT_RULES, fourOfAKindBurns: false };
    expect(placeCards(cards('5C', '5D', '5S'), cards('5H'), 3, rules).burn).toBeNull();
    expect(placeCards(cards('5C', '5D', '5S'), cards('5H'), 3, DEFAULT_RULES).burn).toBe('fourOfAKind');
  });

  it('prefers the burn-card reason when both apply', () => {
    expect(placeCards(cards('10C', '10D', '10S'), cards('10H'), 3, DEFAULT_RULES).burn).toBe('burnCard');
  });
});

describe('rank helpers', () => {
  it('orders ranks and gives the joker the top auto-choice score', () => {
    expect(rankValue('2')).toBe(0);
    expect(rankValue('A')).toBe(12);
    expect(rankValue('JOKER')).toBeUndefined();
    expect(autoChooseScore('JOKER')).toBeGreaterThan(autoChooseScore('A'));
  });
});
