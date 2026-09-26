import type { PlayerId } from '@cardroom/game-core';
import { effectiveTopRank } from './rules';
import { currentPlayerId } from './state';
import type { MexicanaSeatView, MexicanaState, MexicanaView } from './types';

/**
 * Filtered projection of the state. Hands of other players are reduced to a
 * count, face-down cards to occupancy flags and the draw pile to its size.
 */
export function getPlayerView(state: MexicanaState, viewerId: PlayerId | null): MexicanaView {
  const seats: MexicanaSeatView[] = state.turnOrder.map((id) => {
    const player = state.players[id];
    if (!player) throw new Error(`Inconsistent state: missing player ${id}`);
    return {
      id,
      handCount: player.hand.length,
      faceUp: [...player.faceUp],
      faceDown: player.faceDown.map((slot) => slot !== null),
      hasChosenFaceUp: player.hasChosenFaceUp,
      finishedPosition: player.finishedPosition,
    };
  });

  const self = viewerId ? state.players[viewerId] : undefined;
  return {
    phase: state.phase,
    selfId: self ? viewerId : null,
    hand: self ? [...self.hand] : [],
    seats,
    currentPlayerId: currentPlayerId(state),
    discardPile: [...state.discardPile],
    drawPileCount: state.drawPile.length,
    burnPileCount: state.burnPile.length,
    restriction: state.restriction,
    effectiveRank: effectiveTopRank(state.discardPile, state.rules),
    sameRankRun: state.sameRankRun,
  };
}

export function getSpectatorView(state: MexicanaState): MexicanaView {
  return getPlayerView(state, null);
}
