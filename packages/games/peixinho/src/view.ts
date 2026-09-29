import type { PlayerId } from '@cardroom/game-core';
import { compareCards, totalPeixinhos, visibleLog } from './rules';
import { currentPlayerId, handOf, isOut, peixinhosOf } from './state';
import type { PeixinhoState, PeixinhoView } from './types';

/**
 * Filtered projection of the state (rules §8): the viewer's own hand only,
 * counts for everyone else and for the pond, and the fished card only to the
 * one who fished it — or to everyone when it was the rank asked.
 * Spectators see no hand at all.
 */
export function getPlayerView(state: PeixinhoState, viewerId: PlayerId | null): PeixinhoView {
  const self = viewerId !== null && state.seats.includes(viewerId) ? viewerId : null;
  const lastFish = state.lastFish;
  return {
    phase: state.phase,
    selfId: self,
    me: self ? { id: self, hand: [...handOf(state, self)].sort(compareCards) } : null,
    seats: state.seats.map((id) => ({
      id,
      handCount: handOf(state, id).length,
      peixinhos: [...peixinhosOf(state, id)],
      out: isOut(state, id),
    })),
    currentPlayerId: currentPlayerId(state),
    awaitingFish: state.awaitingFish ? { ...state.awaitingFish } : null,
    pondCount: state.pond.length,
    pondSize: state.pondSize,
    pondSlots: [...state.pondSlots],
    askLog: visibleLog(state.askLog, state.config.tableMemory),
    lastFish: lastFish
      ? {
          playerId: lastFish.playerId,
          caughtAsked: lastFish.caughtAsked,
          slot: lastFish.slot,
          card: lastFish.caughtAsked || lastFish.playerId === self ? lastFish.card : null,
        }
      : null,
    tableMemory: state.config.tableMemory,
    refillCount: state.config.refillCount,
    pondPicking: state.config.pondPicking,
    peixinhosTotal: totalPeixinhos(state),
    winners: [...state.winners],
  };
}

export function getSpectatorView(state: PeixinhoState): PeixinhoView {
  return getPlayerView(state, null);
}
