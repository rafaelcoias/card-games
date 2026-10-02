import type { Card, PlayerId } from '@cardroom/game-core';
import { checkPlay, isPower, playOptions, type PlayContext } from './rules';
import type { OlhoState, SessionPlayer } from './types';

export const handOf = (state: Pick<OlhoState, 'hands'>, playerId: PlayerId): Card[] =>
  state.hands[playerId] ?? [];

export const rosterEntry = (
  state: Pick<OlhoState, 'roster'>,
  playerId: PlayerId,
): SessionPlayer | undefined => state.roster.find((p) => p.playerId === playerId);

/** Still playing this game: holds cards and has not left. */
export const inGame = (state: OlhoState, playerId: PlayerId): boolean =>
  state.seats.includes(playerId) &&
  handOf(state, playerId).length > 0 &&
  !state.bottomOrder.includes(playerId);

/**
 * Rules §9: with `allowFinishWithPower` off, a single 2 or joker can never be
 * played (it would end the hand), and hands never grow during a game.
 */
export function isBlocked(state: OlhoState, playerId: PlayerId): boolean {
  if (state.config.allowFinishWithPower) return false;
  const hand = handOf(state, playerId);
  return hand.length === 1 && isPower((hand[0] as Card).rank);
}

/** Takes turns: in the game and not blocked. */
export const canAct = (state: OlhoState, playerId: PlayerId): boolean =>
  inGame(state, playerId) && !isBlocked(state, playerId);

/** May still play in the current trick. */
export const inTrick = (state: OlhoState, playerId: PlayerId): boolean =>
  canAct(state, playerId) && !state.trick.passed.includes(playerId);

/** Seats clockwise after `from` (excluded), the next one first. */
export function seatsAfter(state: Pick<OlhoState, 'seats'>, from: PlayerId): PlayerId[] {
  const n = state.seats.length;
  const index = state.seats.indexOf(from);
  return Array.from({ length: n - 1 }, (_, step) => state.seats[(index + step + 1) % n] as PlayerId);
}

/** The next player clockwise who may still play in this trick (never `from` itself). */
export const nextInTrick = (state: OlhoState, from: PlayerId): PlayerId | null =>
  seatsAfter(state, from).find((id) => inTrick(state, id)) ?? null;

/** What a play of `playerId` is checked against now. */
export function playContext(state: OlhoState, playerId: PlayerId): PlayContext {
  return {
    count: state.trick.count,
    topRank: state.trick.topRank,
    isFirstOfGame: state.trick.isFirstOfGame,
    handSize: handOf(state, playerId).length,
    config: state.config,
  };
}

export const optionsFor = (state: OlhoState, playerId: PlayerId): Card[][] =>
  playOptions(playContext(state, playerId), handOf(state, playerId));

/** May open a trick: on turn order, and with at least one legal opening. */
export const canOpen = (state: OlhoState, playerId: PlayerId): boolean =>
  canAct(state, playerId) && optionsFor(state, playerId).length > 0;

/**
 * Whoever opens from `from` on: they themselves if they can, else the next
 * player clockwise who can (rules §8.5, §9). `null` when nobody can.
 */
export function openerFrom(state: OlhoState, from: PlayerId): PlayerId | null {
  const order = state.seats.includes(from) ? [from, ...seatsAfter(state, from)] : state.seats;
  return order.find((id) => canOpen(state, id)) ?? null;
}

/** The player on turn may open (no play on the table yet). */
export const isOpening = (state: OlhoState): boolean => state.trick.count === null;

/** Rules §8.3: the target escapes with the same card, as many, if the room allows it. */
export function canEscape(state: OlhoState, playerId: PlayerId): boolean {
  const skip = state.trick.skip;
  if (!skip || !state.config.sameCardEscape) return false;
  const same = handOf(state, playerId).filter((c) => c.rank === skip.rank);
  if (same.length < skip.count) return false;
  const play = same.slice(0, skip.count);
  return checkPlay({ ...playContext(state, playerId), count: null, topRank: null }, play) === null;
}

/** Where a player stands in this game: their place once out, or the place they took by leaving. */
export function positionOf(state: OlhoState, playerId: PlayerId): number | null {
  const finished = state.finishOrder.indexOf(playerId);
  if (finished >= 0) return finished + 1;
  const bottom = state.bottomOrder.indexOf(playerId);
  return bottom >= 0 ? state.seats.length - bottom : null;
}

export const currentPlayerId = (state: OlhoState): PlayerId | null =>
  state.phase === 'PLAYING' && !state.trick.closing ? state.currentPlayerId : null;

/** Receivers who still have to give cards back. */
export function pendingReturns(state: OlhoState): PlayerId[] {
  if (state.phase !== 'EXCHANGE' || state.exchange?.stage !== 'RETURNING') return [];
  return state.exchange.pairs.filter((p) => p.returned === null).map((p) => p.receiver);
}
