import type { Rank } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import {
  POINTS,
  assignRoles,
  bestCards,
  checkPlay,
  compareCards,
  lowestCards,
  playOptions,
  rolesFor,
  type PlayContext,
} from './rules';
import { cards } from './test-utils';

const rules = { allowFinishWithPower: true, firstTrickNoPower: true };

/** A trick showing `count` cards of `topRank` (or nothing), past the first trick, with a big hand. */
const on = (count: number | null, topRank: Rank | null, extra: Partial<PlayContext> = {}): PlayContext => ({
  count,
  topRank,
  isFirstOfGame: false,
  handSize: 10,
  config: rules,
  ...extra,
});

const check = (context: PlayContext, ...ids: string[]) => checkPlay(context, cards(...ids));

describe('card order', () => {
  it('ranks 3 < … < A < 2 < joker, suits only breaking ties', () => {
    const shuffled = cards('2C', 'JK1', '3S', 'AH', '10D', 'KC', '3C', 'JK2', '4H');
    expect(shuffled.sort(compareCards).map((c) => c.id)).toEqual([
      '3C',
      '3S',
      '4H',
      '10D',
      'KC',
      'AH',
      '2C',
      'JK1',
      'JK2',
    ]);
  });

  it('picks the best cards for the exchange (joker, 2, A, K…) and the lowest on a timeout', () => {
    const hand = cards('KS', '2D', '5C', 'AH', 'JK1', '3D', '2S');
    expect(bestCards(hand, 2).map((c) => c.id)).toEqual(['JK1', '2S']);
    expect(bestCards(hand, 1).map((c) => c.id)).toEqual(['JK1']);
    expect(bestCards(cards('AH', 'AS', 'AC'), 2).map((c) => c.id)).toEqual(['AS', 'AH']);
    expect(lowestCards(hand, 2).map((c) => c.id)).toEqual(['3D', '5C']);
  });
});

describe('roles and points', () => {
  it('names the roles from first out to last for 3, 4, 5 and 8 players', () => {
    expect(rolesFor(3)).toEqual(['PRESIDENTE', 'NEUTRO', 'OLHO']);
    expect(rolesFor(4)).toEqual(['PRESIDENTE', 'VICE_PRESIDENTE', 'VICE_OLHO', 'OLHO']);
    expect(rolesFor(5)).toEqual(['PRESIDENTE', 'VICE_PRESIDENTE', 'NEUTRO', 'VICE_OLHO', 'OLHO']);
    expect(rolesFor(8)).toEqual([
      'PRESIDENTE',
      'VICE_PRESIDENTE',
      'NEUTRO',
      'NEUTRO',
      'NEUTRO',
      'NEUTRO',
      'VICE_OLHO',
      'OLHO',
    ]);
    expect(rolesFor(2)).toEqual(['PRESIDENTE', 'OLHO']);
    expect(rolesFor(1)).toEqual(['PRESIDENTE']);
    expect(rolesFor(0)).toEqual([]);
    expect(assignRoles(['a', 'b', 'c'])).toEqual({ a: 'PRESIDENTE', b: 'NEUTRO', c: 'OLHO' });
  });

  it('scores +2, +1, 0, −1, −2', () => {
    expect(POINTS).toEqual({ PRESIDENTE: 2, VICE_PRESIDENTE: 1, NEUTRO: 0, VICE_OLHO: -1, OLHO: -2 });
  });
});

describe('checking a play (contract §5.1)', () => {
  it('opens with one rank: single, pair, triple, four, or a joker on its own', () => {
    expect(check(on(null, null), '7S')).toBeNull();
    expect(check(on(null, null), '7S', '7H')).toBeNull();
    expect(check(on(null, null), '7S', '7H', '7D')).toBeNull();
    expect(check(on(null, null), '5S', '5H', '5D', '5C')).toBeNull();
    expect(check(on(null, null), 'JK1')).toBeNull();
    expect(check(on(null, null))).toBe('NO_CARDS');
    expect(check(on(null, null), '7S', '8S')).toBe('MIXED_RANKS');
    expect(check(on(null, null), 'JK1', 'JK2')).toBe('JOKER_ALONE');
    expect(check(on(1, '9'), 'JK1', '9S')).toBe('MIXED_RANKS');
  });

  it('follows with as many cards, equal or higher', () => {
    expect(check(on(1, '9'), '8S')).toBe('TOO_LOW');
    expect(check(on(1, '9'), '9S')).toBeNull();
    expect(check(on(1, '9'), 'KS')).toBeNull();
    expect(check(on(2, '9'), 'KS')).toBe('WRONG_COUNT');
    expect(check(on(1, '9'), 'KS', 'KH')).toBe('WRONG_COUNT');
    expect(check(on(2, 'K'), 'AS', 'AH')).toBeNull();
    expect(check(on(3, '8'), 'QS', 'QH', 'QD')).toBeNull();
  });

  it('lets a joker beat anything: single, pair, triple and 2s', () => {
    for (const [count, top] of [
      [1, '9'],
      [2, 'K'],
      [3, 'A'],
      [1, '2'],
      [2, '2'],
    ] as const) {
      expect(check(on(count, top), 'JK2')).toBeNull();
    }
  });

  it('cuts with fewer 2s: max(1, N − 1) or more (the script table)', () => {
    expect(check(on(1, '9'), '2S')).toBeNull();
    expect(check(on(2, 'K'), '2S')).toBeNull();
    expect(check(on(2, 'K'), '2S', '2H')).toBeNull();
    expect(check(on(3, '8'), '2S')).toBe('NOT_ENOUGH_TWOS');
    expect(check(on(3, '8'), '2S', '2H')).toBeNull();
    expect(check(on(1, '9'), '2S', '2H')).toBeNull();
    expect(check(on(2, 'K'), '2S', '2H', '2D')).toBeNull();
    expect(check(on(1, 'A'), '2S')).toBeNull();
  });

  it('on 2s takes only more 2s: a 2 never answers a 2', () => {
    expect(check(on(1, '2'), '2S', '2H')).toBeNull();
    expect(check(on(1, '2'), '2S')).toBe('NOT_ENOUGH_TWOS');
    expect(check(on(2, '2'), '2S', '2H', '2D')).toBeNull();
    expect(check(on(2, '2'), '2S', '2H')).toBe('NOT_ENOUGH_TWOS');
    expect(check(on(1, '2'), '2S', '2H', '2D')).toBeNull();
    expect(check(on(2, '2'), '2S')).toBe('NOT_ENOUGH_TWOS');
    expect(check(on(1, '2'), 'AS')).toBe('TOO_LOW');
  });

  it('bars 2s and jokers from the first trick, opening and following', () => {
    const first = (count: number | null, top: Rank | null) => on(count, top, { isFirstOfGame: true });
    expect(check(first(null, null), '2S')).toBe('POWER_FIRST_TRICK');
    expect(check(first(null, null), 'JK1')).toBe('POWER_FIRST_TRICK');
    expect(check(first(1, '9'), '2S')).toBe('POWER_FIRST_TRICK');
    expect(check(first(1, '9'), 'JK1')).toBe('POWER_FIRST_TRICK');
    expect(check(first(1, '9'), 'AS')).toBeNull();
    const allowed = on(1, '9', { isFirstOfGame: true, config: { ...rules, firstTrickNoPower: false } });
    expect(check(allowed, '2S')).toBeNull();
  });

  it('with allowFinishWithPower off, refuses a 2 or joker that empties the hand (not one of two)', () => {
    const strict = (handSize: number) =>
      on(1, '9', { handSize, config: { ...rules, allowFinishWithPower: false } });
    expect(check(strict(1), '2S')).toBe('CANNOT_FINISH_WITH_POWER');
    expect(check(strict(1), 'JK1')).toBe('CANNOT_FINISH_WITH_POWER');
    expect(check(strict(2), '2S')).toBeNull();
    expect(check(strict(2), '2S', '2H')).toBe('CANNOT_FINISH_WITH_POWER');
    expect(check(strict(1), 'KS')).toBeNull();
    expect(check(on(1, '9', { handSize: 1 }), '2S')).toBeNull();
  });

  it('lists each rank and size that can be played, with the lowest suits', () => {
    const hand = cards('7S', '7C', '9D', '2H', 'JK1');
    const options = (context: Omit<PlayContext, 'handSize'>) =>
      playOptions(context, hand).map((play) => play.map((c) => c.id));
    expect(options(on(null, null))).toEqual([['7C'], ['7C', '7S'], ['9D'], ['2H'], ['JK1']]);
    expect(options(on(null, null, { isFirstOfGame: true }))).toEqual([['7C'], ['7C', '7S'], ['9D']]);
    expect(options(on(1, '8'))).toEqual([['9D'], ['2H'], ['JK1']]);
    expect(options(on(2, '5'))).toEqual([['7C', '7S'], ['2H'], ['JK1']]);
  });
});
