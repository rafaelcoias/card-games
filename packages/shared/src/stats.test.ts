import { describe, expect, it } from 'vitest';
import { accumulateStats, emptyStats, legacyOutcome, placementOutcome, winRate } from './stats';

describe('player stats', () => {
  it('counts wins and losses by outcome, per game, ignoring aborted matches', () => {
    const stats = accumulateStats([
      { gameId: 'mexicana', outcome: 'WINNER', aborted: false },
      { gameId: 'mexicana', outcome: 'LOSER', aborted: false },
      { gameId: 'mexicana', outcome: 'PLACED', aborted: false },
      { gameId: 'high-card', outcome: 'LOSER', aborted: false },
      { gameId: 'fodinha', outcome: 'SURVIVOR', aborted: false },
      { gameId: 'fodinha', outcome: 'LOSER', aborted: false },
      { gameId: 'mexicana', outcome: null, aborted: true },
    ]);
    expect(stats).toEqual({
      played: 6,
      wins: 1,
      losses: 3,
      byGame: {
        mexicana: { played: 3, wins: 1, losses: 1 },
        'high-card': { played: 1, wins: 0, losses: 1 },
        fodinha: { played: 2, wins: 0, losses: 1 },
      },
    });
  });

  it('computes win rates and outcomes', () => {
    expect(winRate(emptyStats())).toBe(0);
    expect(winRate({ played: 3, wins: 1, losses: 0 })).toBe(33);
    expect(placementOutcome({ gameId: 'x', outcome: null, aborted: false })).toBeNull();
    expect(placementOutcome({ gameId: 'x', outcome: 'WINNER', aborted: true })).toBeNull();
    expect(placementOutcome({ gameId: 'x', outcome: 'SURVIVOR', aborted: false })).toEqual({
      played: 1,
      wins: 0,
      losses: 0,
    });
  });

  it('derives outcomes for history written before outcomes existed', () => {
    expect(legacyOutcome(1, 4)).toBe('WINNER');
    expect(legacyOutcome(2, 4)).toBe('PLACED');
    expect(legacyOutcome(4, 4)).toBe('LOSER');
    expect(legacyOutcome(null, 4)).toBeNull();
  });
});
