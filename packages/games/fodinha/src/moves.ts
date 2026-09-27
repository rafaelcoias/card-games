import type { PlayerId } from '@cardroom/game-core';
import { compareCards, validBids } from './rules';
import { currentPlayerId, isBlind } from './state';
import type { FodinhaClientAction, FodinhaState } from './types';

/** Only the player on turn has choices; blind cards are played by the server. */
export function getValidActions(state: FodinhaState, playerId: PlayerId): FodinhaClientAction[] {
  if (currentPlayerId(state) !== playerId) return [];
  if (state.phase === 'BIDDING') return validBids(state, playerId).map((bid) => ({ type: 'PLACE_BID', bid }));
  if (state.phase === 'PLAYING' && !isBlind(state)) {
    return (state.hands[playerId] ?? []).map((card) => ({ type: 'PLAY_CARD', cardId: card.id }));
  }
  return [];
}

/** Timer expiry (open point #5): bid 0 — or the lowest allowed bid — and play the lowest card. */
export function getDefaultAction(state: FodinhaState, playerId: PlayerId): FodinhaClientAction | null {
  if (currentPlayerId(state) !== playerId) return null;
  if (state.phase === 'BIDDING') {
    const bid = validBids(state, playerId)[0];
    return bid === undefined ? null : { type: 'PLACE_BID', bid };
  }
  if (state.phase === 'PLAYING' && !isBlind(state)) {
    const lowest = [...(state.hands[playerId] ?? [])].sort(compareCards)[0];
    return lowest ? { type: 'PLAY_CARD', cardId: lowest.id } : null;
  }
  return null;
}

/** Who owes a decision (drives the turn timer and away-player automation). */
export function getPendingPlayers(state: FodinhaState): PlayerId[] {
  const current = currentPlayerId(state);
  if (!current) return [];
  if (state.phase === 'PLAYING' && isBlind(state)) return [];
  return [current];
}

export function getTimeoutMs(state: FodinhaState): number | null {
  return getPendingPlayers(state).length > 0 ? state.config.turnTimeoutMs : null;
}
