import type { GameResult, GameStanding, Outcome, PlayerId } from './game-module';

/** Outcome implied by a finishing position: first wins, last loses, the rest are placed. */
export function outcomeForPosition(position: number, playerCount: number): Outcome {
  if (position === 1) return 'WINNER';
  if (position === playerCount) return 'LOSER';
  return 'PLACED';
}

/** Standings for games that rank every player (ids in finishing order, best first). */
export function placedStandings(orderedPlayerIds: readonly PlayerId[]): GameStanding[] {
  return orderedPlayerIds.map((playerId, index) => ({
    playerId,
    position: index + 1,
    outcome: outcomeForPosition(index + 1, orderedPlayerIds.length),
  }));
}

/** Players who lost the given match (used for "the loser starts the next one"). */
export function losersOf(result: GameResult | null | undefined): PlayerId[] {
  return (result?.standings ?? []).filter((s) => s.outcome === 'LOSER').map((s) => s.playerId);
}
