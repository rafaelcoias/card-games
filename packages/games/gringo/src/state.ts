import type { PlayerId } from '@cardroom/game-core';
import type { GringoState, PowerType, Slot } from './types';

/** Every seat has a grid from setup on. */
export const gridOf = (state: Pick<GringoState, 'grids'>, playerId: PlayerId): Slot[] =>
  state.grids[playerId] ?? [];

export const cardCount = (state: Pick<GringoState, 'grids'>, playerId: PlayerId): number =>
  gridOf(state, playerId).filter((slot) => slot.card !== null).length;

export const hasCards = (state: Pick<GringoState, 'grids'>, playerId: PlayerId): boolean =>
  cardCount(state, playerId) > 0;

/** The indexes of the slots that still hold a card. */
export const filledIndexes = (state: Pick<GringoState, 'grids'>, playerId: PlayerId): number[] =>
  gridOf(state, playerId)
    .filter((slot) => slot.card !== null)
    .map((slot) => slot.index);

export const slotAt = (
  state: Pick<GringoState, 'grids'>,
  playerId: PlayerId,
  index: number,
): Slot | undefined => gridOf(state, playerId).find((slot) => slot.index === index);

/** The next index of a grid: one past the highest ever used, so none is reused (contract §2). */
export const nextIndex = (grid: readonly Slot[]): number =>
  grid.reduce((max, slot) => Math.max(max, slot.index + 1), 0);

/** Whose turn it is: also during their power and the snap window after it. */
export function turnPlayerId(state: GringoState): PlayerId | null {
  if (state.phase === 'INITIAL_PEEK' || state.phase === 'FINISHED') return null;
  return state.seats[state.currentIndex] ?? null;
}

/** Who acts for the turn now (drawing, deciding, using the power); `null` during the snap window. */
export function currentPlayerId(state: GringoState): PlayerId | null {
  return state.phase === 'TURN_DRAW' || state.phase === 'TURN_DECIDE' || state.phase === 'POWER'
    ? (state.seats[state.currentIndex] ?? null)
    : null;
}

/** After a hit on another player's card: the snapper, who owes them one of their cards. */
export const giverOf = (state: GringoState): PlayerId | null =>
  state.phase === 'SNAP_GIVE' ? (state.snap?.result?.playerId ?? null) : null;

/** The other players who still hold a card: the only ones a power may target (rules §8). */
export const targetsOf = (state: GringoState, playerId: PlayerId): PlayerId[] =>
  state.seats.filter((id) => id !== playerId && hasCards(state, id));

/** Powers that touch another grid need someone else with cards (rules §8). */
export function powerUsable(state: GringoState, playerId: PlayerId, power: PowerType): boolean {
  return power === 'PEEK_OWN' ? hasCards(state, playerId) : targetsOf(state, playerId).length > 0;
}

/**
 * Rules §9: with the option on, once, after every player still holding cards
 * has played `gringoMinTurns` turns (open point #8).
 */
export function canCallGringo(state: GringoState): boolean {
  return (
    state.config.gringoEnabled &&
    state.gringo === null &&
    state.seats.every((id) => state.turnsPlayed[id]! >= state.config.gringoMinTurns || !hasCards(state, id))
  );
}

/** Rounds left before "Gringo" may be said; `null` when it cannot be said any more (or at all). */
export function gringoTurnsLeft(state: GringoState): number | null {
  if (!state.config.gringoEnabled || state.gringo !== null || state.phase === 'FINISHED') return null;
  const left = state.seats
    .filter((id) => hasCards(state, id))
    .map((id) => state.config.gringoMinTurns - (state.turnsPlayed[id] ?? 0));
  return Math.max(0, ...left);
}

/** May take a turn: holds cards and, after a "Gringo", still has their last turn to play. */
export function playsTurns(state: GringoState, playerId: PlayerId): boolean {
  if (!hasCards(state, playerId)) return false;
  return state.gringo === null || state.gringo.remaining.includes(playerId);
}

/** A player without cards is still called on turn while they may say "Gringo" (rules §8). */
export const offeredGringoOnly = (state: GringoState, playerId: PlayerId): boolean =>
  !hasCards(state, playerId) && canCallGringo(state);

/** Seats clockwise after `fromIndex`, ending with `fromIndex` itself. */
export const seatsFrom = (state: Pick<GringoState, 'seats'>, fromIndex: number): number[] =>
  Array.from({ length: state.seats.length }, (_, step) => (fromIndex + step + 1) % state.seats.length);
