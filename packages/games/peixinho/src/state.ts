import type { Card, PlayerId, StandardRank } from '@cardroom/game-core';
import type { PeixinhoState } from './types';

/** Every seat has a hand (possibly empty) from setup on. */
export const handOf = (state: Pick<PeixinhoState, 'hands'>, playerId: PlayerId): Card[] =>
  state.hands[playerId] as Card[];

/** Every seat has a (possibly empty) list of peixinhos from setup on. */
export const peixinhosOf = (state: Pick<PeixinhoState, 'peixinhos'>, playerId: PlayerId): StandardRank[] =>
  state.peixinhos[playerId] as StandardRank[];

/** Player on turn (asking, or fishing after "Vai à pesca!"), `null` once the game is over. */
export const currentPlayerId = (state: PeixinhoState): PlayerId | null =>
  state.phase === 'PLAYING' ? (state.seats[state.currentIndex] as PlayerId) : null;

/** Out of cards with nothing left to fish: skipped, and nobody may ask them (rules §6). */
export const isOut = (state: PeixinhoState, playerId: PlayerId): boolean =>
  state.phase === 'PLAYING' && handOf(state, playerId).length === 0 && state.pond.length === 0;

/** Other players who still hold cards: the only ones who may be asked (rules §4). */
export const opponentsWithCards = (state: PeixinhoState, playerId: PlayerId): PlayerId[] =>
  state.seats.filter((id) => id !== playerId && handOf(state, id).length > 0);
