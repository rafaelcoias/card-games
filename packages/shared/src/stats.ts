import { outcomeForPosition, type Outcome } from '@cardroom/game-core';
import type { GameStats, PlayerStats } from './models';

export function emptyStats(): PlayerStats {
  return { played: 0, wins: 0, losses: 0, byGame: {} };
}

export interface FinishedPlacement {
  gameId: string;
  outcome: Outcome | null;
  aborted: boolean;
}

/** Outcome of one match for one player, as counter increments. */
export function placementOutcome(p: FinishedPlacement): GameStats | null {
  if (p.aborted || p.outcome === null) return null;
  return { played: 1, wins: p.outcome === 'WINNER' ? 1 : 0, losses: p.outcome === 'LOSER' ? 1 : 0 };
}

/** Outcome of records written before outcomes were stored (only positions existed then). */
export function legacyOutcome(position: number | null, playerCount: number): Outcome | null {
  return position === null ? null : outcomeForPosition(position, playerCount);
}

/** Folds a player's finished matches into stats (used to backfill counters). */
export function accumulateStats(placements: readonly FinishedPlacement[]): PlayerStats {
  const stats = emptyStats();
  for (const placement of placements) {
    const outcome = placementOutcome(placement);
    if (!outcome) continue;
    const game = (stats.byGame[placement.gameId] ??= { played: 0, wins: 0, losses: 0 });
    for (const target of [stats, game]) {
      target.played += outcome.played;
      target.wins += outcome.wins;
      target.losses += outcome.losses;
    }
  }
  return stats;
}

/** Wins as a share of played matches, 0–100 (rounded). */
export function winRate(stats: GameStats): number {
  return stats.played === 0 ? 0 : Math.round((stats.wins / stats.played) * 100);
}
