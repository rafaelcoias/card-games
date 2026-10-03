import type { PlayerId } from '@cardroom/game-core';
import { randomCut } from './engine';
import { timeoutCard } from './rules';
import { canViewLastTrick, currentPlayerId, currentSeat, legalFor, seatOf } from './state';
import type { SuecaAction, SuecaClientAction, SuecaState } from './types';

/**
 * What a player may do now: the cutter picks top or bottom; the player on
 * turn plays one of their legal cards (contract §5); anyone may look at the
 * last trick once per hand.
 */
export function getValidActions(state: SuecaState, playerId: PlayerId): SuecaClientAction[] {
  const seat = seatOf(state, playerId);
  if (!seat) return [];
  const actions: SuecaClientAction[] = [];
  if (state.phase === 'CUT' && state.cutter === seat) {
    actions.push({ type: 'CHOOSE_CUT', from: 'TOP' }, { type: 'CHOOSE_CUT', from: 'BOTTOM' });
  }
  for (const card of legalFor(state, seat)) actions.push({ type: 'PLAY', cardUid: card.uid });
  if (canViewLastTrick(state, seat)) actions.push({ type: 'VIEW_LAST_TRICK' });
  return actions;
}

/** Timer expiry (rules §12): a random cut; the legal card worth least (open point #5). */
export function getDefaultAction(state: SuecaState, playerId: PlayerId): SuecaClientAction | null {
  if (currentPlayerId(state) !== playerId) return null;
  if (state.phase === 'CUT') return { type: 'CHOOSE_CUT', from: randomCut(state) };
  const seat = currentSeat(state);
  const legal = seat ? legalFor(state, seat) : [];
  return legal.length > 0 ? { type: 'PLAY', cardUid: timeoutCard(legal, state.trumpSuit).uid } : null;
}

/** The cutter, or the player on turn; nobody while a trick is shown, between hands or in a pause. */
export function getPendingPlayers(state: SuecaState): PlayerId[] {
  const current = currentPlayerId(state);
  return current ? [current] : [];
}

/** Rules §12: 15 s to cut, 30 s to play. */
export function getTimeoutMs(state: SuecaState): number | null {
  if (state.phase === 'CUT') return state.config.cutTimeoutMs;
  if (state.phase === 'PLAYING') return state.config.turnTimeoutMs;
  return null;
}

/** The server closes an expired decision with a system action, so the log says it was the clock. */
export function getTimeoutAction(state: SuecaState): SuecaAction | null {
  if (state.phase === 'CUT') return { type: 'SYS_CUT_TIMEOUT' };
  if (state.phase === 'PLAYING') return { type: 'SYS_TURN_TIMEOUT' };
  return null;
}
