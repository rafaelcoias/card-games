import type { PlayerId } from '@cardroom/game-core';
import { PLAY_ORDER, legalCards, nextSeat, teamOf } from './rules';
import type { Seat, SuecaState, Team } from './types';

export function seatOf(state: Pick<SuecaState, 'seats'>, playerId: PlayerId): Seat | null {
  return PLAY_ORDER.find((seat) => state.seats[seat] === playerId) ?? null;
}

/** Who owes the next move: the cutter, or the next to play in the trick. */
export function currentSeat(state: SuecaState): Seat | null {
  if (state.phase === 'CUT') return state.cutter;
  if (state.phase === 'PLAYING') return nextSeat(state.trick.leader, state.trick.plays.length);
  return null;
}

export function currentPlayerId(state: SuecaState): PlayerId | null {
  const seat = currentSeat(state);
  return seat ? state.seats[seat] : null;
}

/** The cards the player on turn may play; nobody else may play any. */
export function legalFor(state: SuecaState, seat: Seat) {
  if (state.phase !== 'PLAYING' || currentSeat(state) !== seat) return [];
  return legalCards(state.hands[seat], state.trick.plays);
}

export const tricksPlayed = (state: Pick<SuecaState, 'tricksWon'>): number =>
  state.tricksWon.A + state.tricksWon.B;

/** Rules §9: once per hand, while the hand is played, when a trick has been closed. */
export function canViewLastTrick(state: SuecaState, seat: Seat): boolean {
  return (
    (state.phase === 'PLAYING' || state.phase === 'TRICK_DONE') &&
    state.lastTrick !== null &&
    state.lastTrickViewsUsed[seat] < 1
  );
}

/**
 * Rules §11: no table talk while a hand is played, so partners cannot signal —
 * the chat opens between hands and at the end (also while the table waits
 * for someone between hands).
 */
export function isChatOpen(state: SuecaState): boolean {
  const phase = state.phase === 'PAUSED' ? state.pausedFrom : state.phase;
  return phase === 'HAND_SUMMARY' || phase === 'FINISHED';
}

export function playersOf(state: Pick<SuecaState, 'seats'>, team: Team): PlayerId[] {
  return PLAY_ORDER.filter((seat) => teamOf(seat) === team).map((seat) => state.seats[seat]);
}
