import type { PlayerId } from '@cardroom/game-core';
import type { FodinhaState } from './types';

/** Player on turn to bid or play, `null` while the server is pausing between steps. */
export const currentPlayerId = (state: FodinhaState): PlayerId | null =>
  state.phase === 'BIDDING' || state.phase === 'PLAYING' ? (state.seats[state.currentIndex] ?? null) : null;

/** One-card rounds are played blind: you see every card but your own (rules §6). */
export const isBlind = (state: Pick<FodinhaState, 'handSize'>): boolean => state.handSize === 1;
