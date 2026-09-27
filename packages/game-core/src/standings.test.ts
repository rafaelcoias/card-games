import { describe, expect, it } from 'vitest';
import { losersOf, outcomeForPosition, placedStandings } from './standings';

describe('standings helpers', () => {
  it('maps positions to outcomes', () => {
    expect(outcomeForPosition(1, 4)).toBe('WINNER');
    expect(outcomeForPosition(2, 4)).toBe('PLACED');
    expect(outcomeForPosition(4, 4)).toBe('LOSER');
  });

  it('ranks players in order', () => {
    expect(placedStandings(['a', 'b', 'c'])).toEqual([
      { playerId: 'a', position: 1, outcome: 'WINNER' },
      { playerId: 'b', position: 2, outcome: 'PLACED' },
      { playerId: 'c', position: 3, outcome: 'LOSER' },
    ]);
  });

  it('finds the losers of a result', () => {
    expect(losersOf(null)).toEqual([]);
    expect(
      losersOf({
        standings: [
          { playerId: 'a', outcome: 'SURVIVOR', score: 2 },
          { playerId: 'b', outcome: 'LOSER', score: 5 },
          { playerId: 'c', outcome: 'LOSER', score: 6 },
        ],
      }),
    ).toEqual(['b', 'c']);
  });
});
