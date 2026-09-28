/**
 * The chart of 06-ESTRATEGIA-BASICA, re-typed here independently of
 * `strategy.ts` and checked cell by cell against `basicStrategy`.
 */
import type { Card } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { basicStrategy, hintsSupported } from './strategy';
import { config, ranks } from './test-utils';
import type { Decision } from './types';

const UP: Card['rank'][] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'];
const ALL = new Set<Decision>(['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER']);
const NO_SPLIT = new Set<Decision>(['HIT', 'STAND', 'DOUBLE', 'SURRENDER']);
const CODE: Record<string, Decision> = {
  H: 'HIT',
  S: 'STAND',
  D: 'DOUBLE',
  Ds: 'DOUBLE',
  P: 'SPLIT',
  R: 'SURRENDER',
};

/** [label, two-card hands to try, chart row] */
const HARD: [string, Card['rank'][][], string][] = [
  [
    '17+',
    [
      ['10', '7'],
      ['10', '8'],
      ['10', '9'],
      ['9', '8'],
    ],
    'S S S S S S S S S S',
  ],
  [
    '16',
    [
      ['10', '6'],
      ['9', '7'],
    ],
    'S S S S S H H R R R',
  ],
  [
    '15',
    [
      ['10', '5'],
      ['9', '6'],
    ],
    'S S S S S H H H R H',
  ],
  [
    '13–14',
    [
      ['10', '3'],
      ['10', '4'],
      ['9', '5'],
    ],
    'S S S S S H H H H H',
  ],
  [
    '12',
    [
      ['10', '2'],
      ['9', '3'],
      ['8', '4'],
    ],
    'H H S S S H H H H H',
  ],
  [
    '11',
    [
      ['9', '2'],
      ['8', '3'],
      ['7', '4'],
    ],
    'D D D D D D D D D H',
  ],
  [
    '10',
    [
      ['8', '2'],
      ['7', '3'],
      ['6', '4'],
    ],
    'D D D D D D D D H H',
  ],
  [
    '9',
    [
      ['7', '2'],
      ['6', '3'],
      ['5', '4'],
    ],
    'H D D D D H H H H H',
  ],
  [
    '5–8',
    [
      ['3', '2'],
      ['4', '2'],
      ['5', '2'],
      ['6', '2'],
      ['5', '3'],
    ],
    'H H H H H H H H H H',
  ],
];
const SOFT: [string, Card['rank'][][], string][] = [
  ['A,9', [['A', '9']], 'S S S S S S S S S S'],
  ['A,8', [['A', '8']], 'S S S S S S S S S S'],
  ['A,7', [['A', '7']], 'S Ds Ds Ds Ds S S H H H'],
  ['A,6', [['A', '6']], 'H D D D D H H H H H'],
  [
    'A,4–A,5',
    [
      ['A', '4'],
      ['A', '5'],
    ],
    'H H D D D H H H H H',
  ],
  [
    'A,2–A,3',
    [
      ['A', '2'],
      ['A', '3'],
    ],
    'H H H D D H H H H H',
  ],
];
const PAIRS: [string, Card['rank'][][], string][] = [
  ['A,A', [['A', 'A']], 'P P P P P P P P P P'],
  [
    '10,10',
    [
      ['10', '10'],
      ['K', 'Q'],
      ['J', '10'],
    ],
    'S S S S S S S S S S',
  ],
  ['9,9', [['9', '9']], 'P P P P P S P P S S'],
  ['8,8', [['8', '8']], 'P P P P P P P P P P'],
  ['7,7', [['7', '7']], 'P P P P P P H H H H'],
  ['6,6', [['6', '6']], 'P P P P P H H H H H'],
  ['5,5', [['5', '5']], 'D D D D D D D D H H'],
  ['4,4', [['4', '4']], 'H H H P P H H H H H'],
  [
    '2,2–3,3',
    [
      ['2', '2'],
      ['3', '3'],
    ],
    'P P P P P P H H H H',
  ],
];

function checkChart(chart: [string, Card['rank'][][], string][], allowed: ReadonlySet<Decision>) {
  for (const [label, hands, row] of chart) {
    const cells = row.split(' ');
    for (const hand of hands) {
      UP.forEach((up, col) => {
        const expected = CODE[cells[col] as string];
        expect(
          basicStrategy(ranks(...hand), { rank: up }, allowed),
          `${label} ${hand.join(',')} vs ${up}`,
        ).toBe(expected);
      });
    }
  }
}

describe('basic strategy chart (06)', () => {
  it('hard totals, cell by cell', () => checkChart(HARD, NO_SPLIT));
  it('soft totals, cell by cell', () => checkChart(SOFT, NO_SPLIT));
  it('pairs, cell by cell', () => checkChart(PAIRS, ALL));
});

describe('consultation rules (06)', () => {
  const hitStand = new Set<Decision>(['HIT', 'STAND']);

  it('3+ cards never double, split or surrender: D → hit, Ds → stand, R → hit', () => {
    expect(basicStrategy(ranks('3', '4', '4'), { rank: '6' }, hitStand)).toBe('HIT'); // hard 11
    expect(basicStrategy(ranks('A', '3', '4'), { rank: '4' }, hitStand)).toBe('STAND'); // soft 18 vs 4
    expect(basicStrategy(ranks('10', '3', '3'), { rank: '10' }, hitStand)).toBe('HIT'); // hard 16 vs 10
  });

  it('a pair that cannot be split is played on its total', () => {
    expect(basicStrategy(ranks('8', '8'), { rank: '10' }, NO_SPLIT)).toBe('SURRENDER');
    expect(basicStrategy(ranks('8', '8'), { rank: '6' }, NO_SPLIT)).toBe('STAND');
    expect(basicStrategy(ranks('A', 'A'), { rank: '6' }, NO_SPLIT)).toBe('HIT');
  });

  it('8,8 splits rather than surrenders', () => {
    expect(basicStrategy(ranks('8', '8'), { rank: 'A' }, ALL)).toBe('SPLIT');
  });

  it('J+Q is a pair only when tens split by value', () => {
    // A pair of tens stands either way: the difference is whether splitting is considered.
    expect(basicStrategy(ranks('J', 'Q'), { rank: '6' }, ALL, false)).toBe('STAND');
    expect(basicStrategy(ranks('7', '7'), { rank: '2' }, ALL, false)).toBe('SPLIT');
  });

  it('is offered only for the rules the chart was computed for', () => {
    expect(hintsSupported(config())).toBe(true);
    expect(hintsSupported(config({ decks: 2 }))).toBe(false);
    expect(hintsSupported(config({ dealerHitsSoft17: true }))).toBe(false);
    expect(hintsSupported(config({ doubleAfterSplit: false }))).toBe(false);
    expect(hintsSupported(config({ holeCard: 'EUROPEAN' }))).toBe(false);
  });
});
