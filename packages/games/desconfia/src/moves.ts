import {
  JOKER,
  STANDARD_RANKS,
  createSeededRng,
  pickOne,
  type PlayerId,
  type StandardRank,
} from '@cardroom/game-core';
import { canDoubt, canPlayNow, currentPlayerId, handOf } from './state';
import type { DesconfiaClientAction, DesconfiaState } from './types';

/**
 * Any set of cards in hand may be played, so plays cannot all be listed: the
 * list holds one single-card play per card (with a rank it may claim), which
 * tells the client it may play, plus the doubt it may call.
 */
export function getValidActions(state: DesconfiaState, playerId: PlayerId): DesconfiaClientAction[] {
  const actions: DesconfiaClientAction[] = [];
  if (canDoubt(state, playerId)) actions.push({ type: 'DOUBT', playId: state.doubtWindow!.playId });
  if (canPlayNow(state, playerId)) {
    for (const card of handOf(state, playerId)) {
      const claimRank = state.claimRank ?? (card.rank === JOKER ? STANDARD_RANKS[0] : card.rank);
      actions.push({ type: 'PLAY', cardIds: [card.id], claimRank });
    }
  }
  return actions;
}

/**
 * Timer expiry (open point #5): one card. On a pile with a rank, one of that
 * rank if there is one, else any card; on a new pile, any card claimed as what
 * it is (a joker, only when nothing else is left, claims a random rank). The
 * draw is keyed by the match's secret seed, so the engine stays deterministic.
 */
export function getDefaultAction(state: DesconfiaState, playerId: PlayerId): DesconfiaClientAction | null {
  if (!canPlayNow(state, playerId)) return null;
  const hand = handOf(state, playerId);
  if (hand.length === 0) return null;
  const rng = createSeededRng(`${state.seed}:timeout:${state.nextPlayId}`);
  if (state.claimRank !== null) {
    const matching = hand.filter((c) => c.rank === state.claimRank);
    const card = pickOne(matching.length > 0 ? matching : hand, rng);
    return { type: 'PLAY', cardIds: [card.id], claimRank: state.claimRank };
  }
  const naturals = hand.filter((c) => c.rank !== JOKER);
  const card = pickOne(naturals.length > 0 ? naturals : hand, rng);
  const claimRank: StandardRank = card.rank === JOKER ? pickOne(STANDARD_RANKS, rng) : card.rank;
  return { type: 'PLAY', cardIds: [card.id], claimRank };
}

/** Only the current player owes a decision, once the window's minimum has passed; doubts are optional. */
export function getPendingPlayers(state: DesconfiaState): PlayerId[] {
  const current = currentPlayerId(state);
  return current && canPlayNow(state, current) ? [current] : [];
}

/** 30 s per play (rules §9); no timer while the others may still doubt. */
export function getTimeoutMs(state: DesconfiaState): number | null {
  return getPendingPlayers(state).length > 0 ? state.config.turnTimeoutMs : null;
}
