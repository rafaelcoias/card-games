import type { PlayerId } from '@cardroom/game-core';
import { lowestCards } from './rules';
import { canEscape, currentPlayerId, handOf, isOpening, optionsFor, pendingReturns } from './state';
import type { OlhoAction, OlhoClientAction, OlhoState } from './types';

/**
 * What a player may do now. Plays are listed once per (rank, how many) with
 * the lowest suits of the rank — any cards of that rank and number are
 * accepted, so the client learns what is playable from this list. Giving
 * cards back is listed once, with the lowest cards, as a hint.
 */
export function getValidActions(state: OlhoState, playerId: PlayerId): OlhoClientAction[] {
  if (pendingReturns(state).includes(playerId)) {
    const pair = state.exchange?.pairs.find((p) => p.receiver === playerId);
    const cards = lowestCards(handOf(state, playerId), pair?.count ?? 0);
    return [{ type: 'RETURN_CARDS', cardIds: cards.map((c) => c.id) }];
  }
  if (currentPlayerId(state) !== playerId) return [];
  const skip = state.trick.skip;
  if (skip) {
    const escape: OlhoClientAction[] = canEscape(state, playerId)
      ? [
          {
            type: 'ESCAPE',
            cardIds: lowestCards(
              handOf(state, playerId).filter((c) => c.rank === skip.rank),
              skip.count,
            ).map((c) => c.id),
          },
        ]
      : [];
    return [...escape, { type: 'ACCEPT_SKIP' }];
  }
  const plays: OlhoClientAction[] = optionsFor(state, playerId).map((cards) => ({
    type: 'PLAY',
    cardIds: cards.map((c) => c.id),
  }));
  return isOpening(state) ? plays : [...plays, { type: 'PASS' }];
}

/**
 * Timer expiry (rules §12): pass — or, opening, the lowest card allowed; let
 * the skip happen; give back the lowest cards.
 */
export function getDefaultAction(state: OlhoState, playerId: PlayerId): OlhoClientAction | null {
  const actions = getValidActions(state, playerId);
  if (actions.length === 0) return null;
  const pick = (type: OlhoClientAction['type']) => actions.find((a) => a.type === type) ?? null;
  if (pick('RETURN_CARDS')) return pick('RETURN_CARDS');
  if (pick('ACCEPT_SKIP')) return pick('ACCEPT_SKIP');
  if (pick('PASS')) return pick('PASS');
  // Opening: options come weakest rank first, a single card first within a rank.
  const single = actions.find((a) => a.type === 'PLAY' && a.cardIds.length === 1);
  return single ?? actions[0] ?? null;
}

/** Who owes a decision: the player on turn, or the receivers of the exchange. */
export function getPendingPlayers(state: OlhoState): PlayerId[] {
  if (state.phase === 'EXCHANGE') return pendingReturns(state);
  const current = currentPlayerId(state);
  return current ? [current] : [];
}

/** Rules §12: 30 s per play, 5 s to escape a skip, 20 s to give cards back. */
export function getTimeoutMs(state: OlhoState): number | null {
  if (getPendingPlayers(state).length === 0) return null;
  const { config } = state;
  if (state.phase === 'EXCHANGE') return config.exchangeTimeoutMs;
  return state.trick.skip ? config.escapeTimeoutMs : config.turnTimeoutMs;
}

/** The exchange closes as a whole: whoever has not chosen gives back their lowest cards. */
export function getTimeoutAction(state: OlhoState): OlhoAction | null {
  return state.phase === 'EXCHANGE' && pendingReturns(state).length > 0
    ? { type: 'SYS_EXCHANGE_TIMEOUT' }
    : null;
}
