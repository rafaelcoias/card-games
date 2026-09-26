import type { Card, PlayerId } from '@cardroom/game-core';
import type { MexicanaPlayerState, MexicanaState, Slot } from './types';

/**
 * Structural copy used as the working draft of `applyAction`. Cards are
 * immutable values, so only the containers are copied.
 */
export function cloneState(state: MexicanaState): MexicanaState {
  const players: Record<PlayerId, MexicanaPlayerState> = {};
  for (const [id, p] of Object.entries(state.players)) {
    players[id] = { ...p, hand: [...p.hand], faceUp: [...p.faceUp], faceDown: [...p.faceDown] };
  }
  return {
    ...state,
    players,
    turnOrder: [...state.turnOrder],
    drawPile: [...state.drawPile],
    discardPile: [...state.discardPile],
    burnPile: [...state.burnPile],
  };
}

export function occupied(slots: readonly Slot[]): Card[] {
  return slots.filter((slot): slot is Card => slot !== null);
}

export function cardCount(player: MexicanaPlayerState): number {
  return player.hand.length + occupied(player.faceUp).length + occupied(player.faceDown).length;
}

export function currentPlayerId(state: MexicanaState): PlayerId | null {
  return state.phase === 'PLAYING' ? (state.turnOrder[state.currentIndex] ?? null) : null;
}

export function activePlayerIds(state: MexicanaState): PlayerId[] {
  return state.turnOrder.filter((id) => state.players[id]?.finishedPosition === null);
}

/** Index of the next player (after `fromIndex`, wrapping) who has not finished. */
export function nextActiveIndex(state: MexicanaState, fromIndex: number): number {
  const n = state.turnOrder.length;
  for (let step = 1; step <= n; step++) {
    const index = (fromIndex + step) % n;
    const id = state.turnOrder[index] as PlayerId;
    if (state.players[id]?.finishedPosition === null) return index;
  }
  return fromIndex;
}

/** Which layer the player must currently play from (rules §6). */
export function activeLayer(player: MexicanaPlayerState): 'hand' | 'faceUp' | 'faceDown' | null {
  if (player.hand.length > 0) return 'hand';
  if (occupied(player.faceUp).length > 0) return 'faceUp';
  if (occupied(player.faceDown).length > 0) return 'faceDown';
  return null;
}
