import { describe, expect, it } from 'vitest';
import { accumulateStats, emptyStats, placementOutcome, winRate } from './stats';

describe('player stats', () => {
  it('counts wins (1st) and losses (last), per game, ignoring aborted matches', () => {
    const stats = accumulateStats([
      { gameId: 'mexicana', position: 1, playerCount: 4, aborted: false },
      { gameId: 'mexicana', position: 4, playerCount: 4, aborted: false },
      { gameId: 'mexicana', position: 2, playerCount: 4, aborted: false },
      { gameId: 'high-card', position: 2, playerCount: 2, aborted: false },
      { gameId: 'mexicana', position: null, playerCount: 3, aborted: true },
    ]);
    expect(stats).toEqual({
      played: 4,
      wins: 1,
      losses: 2,
      byGame: {
        mexicana: { played: 3, wins: 1, losses: 1 },
        'high-card': { played: 1, wins: 0, losses: 1 },
      },
    });
  });

  it('computes win rates and outcomes', () => {
    expect(winRate(emptyStats())).toBe(0);
    expect(winRate({ played: 3, wins: 1, losses: 0 })).toBe(33);
    expect(placementOutcome({ gameId: 'x', position: null, playerCount: 2, aborted: false })).toBeNull();
    expect(placementOutcome({ gameId: 'x', position: 1, playerCount: 1, aborted: false })).toEqual({
      played: 1,
      wins: 1,
      losses: 1,
    });
  });
});
