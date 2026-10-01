import type { Card, PlayerId } from '@cardroom/game-core';
import type { DesconfiaState } from './types';

/** Every seat has a hand (possibly empty) from setup on. */
export const handOf = (state: Pick<DesconfiaState, 'hands'>, playerId: PlayerId): Card[] =>
  state.hands[playerId] as Card[];

/**
 * Who plays next: still waiting for the window's minimum, if any. `null` once
 * the game is over and while a last card is open to doubts (nobody plays then).
 */
export const currentPlayerId = (state: DesconfiaState): PlayerId | null =>
  state.phase === 'PLAYING' && !state.doubtWindow?.lastCard
    ? (state.seats[state.currentIndex] as PlayerId)
    : null;

/** The current player may play now: no window, or its minimum has passed (rules §5). */
export const canPlayNow = (state: DesconfiaState, playerId: PlayerId): boolean =>
  currentPlayerId(state) === playerId && (state.doubtWindow === null || state.doubtWindow.minElapsed);

/** Anyone still in the game, except the author, may doubt the open play (rules §5.1). */
export const canDoubt = (state: DesconfiaState, playerId: PlayerId): boolean =>
  state.phase === 'PLAYING' &&
  state.doubtWindow !== null &&
  state.doubtWindow.playerId !== playerId &&
  state.seats.includes(playerId) &&
  !state.finishedOrder.includes(playerId);
