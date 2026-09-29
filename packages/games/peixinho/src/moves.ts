import { createSeededRng, pickOne, STANDARD_RANKS, type PlayerId } from '@cardroom/game-core';
import { FISH_TIMEOUT_MS, ranksIn } from './rules';
import { currentPlayerId, handOf, opponentsWithCards } from './state';
import type { PeixinhoClientAction, PeixinhoState } from './types';

/** Only the player on turn has choices: every rank they hold × every opponent with cards, or a spot of the pond. */
export function getValidActions(state: PeixinhoState, playerId: PlayerId): PeixinhoClientAction[] {
  if (currentPlayerId(state) !== playerId) return [];
  if (state.awaitingFish) return state.pondSlots.map((slot) => ({ type: 'FISH', pondPosition: slot }));
  const ranks = ranksIn(handOf(state, playerId));
  return opponentsWithCards(state, playerId).flatMap((targetId) =>
    ranks.map((rank) => ({ type: 'ASK' as const, targetId, rank })),
  );
}

/**
 * Timer expiry (open point #6): fish from the top, or ask for the rank you hold
 * most of (the lowest on ties) from a random opponent. The draw is keyed by the
 * match's secret seed, so the engine stays deterministic.
 */
export function getDefaultAction(state: PeixinhoState, playerId: PlayerId): PeixinhoClientAction | null {
  if (currentPlayerId(state) !== playerId) return null;
  if (state.awaitingFish) return { type: 'FISH' };
  const hand = handOf(state, playerId);
  const count = (rank: string) => hand.filter((c) => c.rank === rank).length;
  const rank = [...STANDARD_RANKS].sort((a, b) => count(b) - count(a))[0];
  const targets = opponentsWithCards(state, playerId);
  if (!rank || count(rank) === 0 || targets.length === 0) return null;
  const rng = createSeededRng(`${state.seed}:timeout:${state.actionCount}`);
  return { type: 'ASK', targetId: pickOne(targets, rng), rank };
}

/** Who owes a decision (drives the turn timer and away-player automation). */
export function getPendingPlayers(state: PeixinhoState): PlayerId[] {
  const current = currentPlayerId(state);
  return current ? [current] : [];
}

/** 30 s per ask (rules §9); a short window to tap the pond after "Vai à pesca!". */
export function getTimeoutMs(state: PeixinhoState): number | null {
  if (!currentPlayerId(state)) return null;
  return state.awaitingFish ? FISH_TIMEOUT_MS : state.config.turnTimeoutMs;
}
