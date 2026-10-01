import type { PlayerId } from '@cardroom/game-core';
import { compareCards } from './rules';
import { currentPlayerId, handOf } from './state';
import type { DesconfiaState, DesconfiaView } from './types';

/**
 * Filtered projection of the state (rules §8): the viewer's own hand, counts
 * for everyone else and for the pile, and each play as who / how many / which
 * rank — never its cards, unless it was doubted (`lastReveal`).
 * Spectators see no hand at all.
 */
export function getPlayerView(state: DesconfiaState, viewerId: PlayerId | null): DesconfiaView {
  const self = viewerId !== null && state.seats.includes(viewerId) ? viewerId : null;
  return {
    phase: state.phase,
    selfId: self,
    me: self ? { id: self, hand: [...handOf(state, self)].sort(compareCards) } : null,
    seats: state.seats.map((id) => {
      const finished = state.finishedOrder.indexOf(id);
      return {
        id,
        handCount: handOf(state, id).length,
        finishedPosition: finished >= 0 ? finished + 1 : null,
      };
    }),
    currentPlayerId: currentPlayerId(state),
    pileCount: state.pile.reduce((sum, play) => sum + play.cards.length, 0),
    claimRank: state.claimRank,
    pilePlays: state.pile.map(({ playId, playerId, cards, claimRank }) => ({
      playId,
      playerId,
      count: cards.length,
      claimRank,
    })),
    doubtWindow: state.doubtWindow ? { ...state.doubtWindow } : null,
    lastReveal: state.lastReveal ? { ...state.lastReveal, cards: [...state.lastReveal.cards] } : null,
    removed: state.removed.map((r) => ({ ...r })),
    finishedOrder: [...state.finishedOrder],
    doubtMinWindowMs: state.config.doubtMinWindowMs,
    lastCardWindowMs: state.config.lastCardWindowMs,
    playUntilEnd: state.config.playUntilEnd,
  };
}

export function getSpectatorView(state: DesconfiaState): DesconfiaView {
  return getPlayerView(state, null);
}
