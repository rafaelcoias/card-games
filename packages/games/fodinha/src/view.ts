import type { PlayerId } from '@cardroom/game-core';
import { bidsSum, roundValue } from './rules';
import { currentPlayerId, isBlind } from './state';
import type { FodinhaSeatView, FodinhaState, FodinhaView } from './types';

/**
 * Filtered projection of the state (rules §6):
 * - normal rounds: the viewer's own hand only; everyone else is a card count;
 * - blind rounds: every other player's card, but NEVER the viewer's own.
 * Spectators see no hand at all.
 */
export function getPlayerView(state: FodinhaState, viewerId: PlayerId | null): FodinhaView {
  const blind = isBlind(state);
  const self = viewerId !== null && state.seats.includes(viewerId) ? viewerId : null;

  const seats: FodinhaSeatView[] = state.seats.map((id, index) => {
    const hand = state.hands[id] ?? [];
    return {
      id,
      handCount: hand.length,
      visibleHand: blind && self !== null && id !== self ? [...hand] : null,
      bid: state.bids[id] ?? null,
      tricksWon: state.tricksWon[id] ?? 0,
      points: state.points[id] ?? 0,
      isStarter: index === state.starterIndex,
    };
  });

  const ownHand = self ? (state.hands[self] ?? []) : [];
  return {
    phase: state.phase,
    selfId: self,
    round: state.round,
    handSize: state.handSize,
    roundValue: roundValue(state.carry),
    carry: state.carry,
    blind,
    maxPoints: state.config.maxPoints,
    maxHandSize: state.config.maxHandSize,
    lastBidderRestriction: state.config.lastBidderRestriction,
    me: self ? { id: self, hand: blind ? null : [...ownHand], handCount: ownHand.length } : null,
    seats,
    starterId: state.seats[state.starterIndex] as PlayerId,
    currentPlayerId: currentPlayerId(state),
    leaderId: state.seats[state.trick.leaderIndex] as PlayerId,
    bidsSum: bidsSum(state),
    trick: state.trick.plays.map((play) => ({ ...play })),
    trickOutcome: state.trick.outcome ? { ...state.trick.outcome } : null,
    tricksPlayed: state.tricksPlayed,
    lastTrick: state.lastTrick ? { ...state.lastTrick, plays: [...state.lastTrick.plays] } : null,
    history: state.history.map((summary) => ({ ...summary, rows: [...summary.rows] })),
    losers: [...state.losers],
  };
}

export function getSpectatorView(state: FodinhaState): FodinhaView {
  return getPlayerView(state, null);
}
