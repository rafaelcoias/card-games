import type { Card, CardId, PlayerId } from '@cardroom/game-core';
import { autoChooseScore, canPlayRank } from './rules';
import { activeLayer, currentPlayerId, occupied } from './state';
import type { MexicanaAction, MexicanaPlayerState, MexicanaState } from './types';

type PlayAction = Extract<MexicanaAction, { type: 'PLAY_CARDS' | 'PLAY_FACE_DOWN' }>;

/**
 * Every legal play for the current player. Hand plays include each non-empty
 * subset of same-rank cards (playing several is optional, rules §5.3).
 * Face-down cards are always "playable" — they are played blind.
 */
export function enumeratePlays(state: MexicanaState, playerId: PlayerId): PlayAction[] {
  if (state.phase !== 'PLAYING' || currentPlayerId(state) !== playerId) return [];
  const player = state.players[playerId];
  if (!player) return [];

  switch (activeLayer(player)) {
    case 'hand':
      return handPlays(state, player.hand);
    case 'faceUp':
      return occupied(player.faceUp)
        .filter((card) => canPlayRank(card.rank, state.discardPile, state.rules))
        .map((card) => ({ type: 'PLAY_CARDS', cardIds: [card.id] }));
    case 'faceDown':
      return player.faceDown.flatMap((slot, position) =>
        slot ? [{ type: 'PLAY_FACE_DOWN' as const, position }] : [],
      );
    case null:
      return [];
  }
}

function handPlays(state: MexicanaState, hand: readonly Card[]): PlayAction[] {
  const byRank = new Map<string, CardId[]>();
  for (const card of hand) {
    if (!canPlayRank(card.rank, state.discardPile, state.rules)) continue;
    byRank.set(card.rank, [...(byRank.get(card.rank) ?? []), card.id]);
  }
  return [...byRank.values()].flatMap((ids) =>
    nonEmptySubsets(ids).map((cardIds) => ({ type: 'PLAY_CARDS' as const, cardIds })),
  );
}

function nonEmptySubsets<T>(items: readonly T[]): T[][] {
  const subsets: T[][] = [];
  for (let mask = 1; mask < 1 << items.length; mask++) {
    subsets.push(items.filter((_, i) => (mask & (1 << i)) !== 0));
  }
  return subsets.sort((a, b) => a.length - b.length);
}

export function getValidActions(state: MexicanaState, playerId: PlayerId): MexicanaAction[] {
  const player = state.players[playerId];
  if (!player) return [];
  if (state.phase === 'CHOOSING') return player.hasChosenFaceUp ? [] : faceUpChoices(state, player);
  const plays = enumeratePlays(state, playerId);
  if (plays.length > 0) return plays;
  if (currentPlayerId(state) !== playerId) return [];
  const takeable = faceUpToTake(state, playerId);
  if (takeable.length === 0) return [{ type: 'PICK_UP_PILE' }];
  return takeable.map((card) => ({ type: 'PICK_UP_PILE', faceUpCardId: card.id }));
}

/**
 * Face-up cards the current player must choose from when picking up the pile:
 * all of them when only face-up cards are left and none can be played (the
 * chosen one goes to the hand with the pile, like a failed face-down reveal).
 * Empty in every other situation.
 */
export function faceUpToTake(state: MexicanaState, playerId: PlayerId): Card[] {
  if (state.phase !== 'PLAYING' || currentPlayerId(state) !== playerId) return [];
  const player = state.players[playerId];
  if (!player || activeLayer(player) !== 'faceUp') return [];
  if (enumeratePlays(state, playerId).length > 0) return [];
  return occupied(player.faceUp);
}

/** Default card to take along with the pile: the lowest in the hierarchy (slot order breaks ties). */
export function defaultFaceUpToTake(cards: readonly Card[]): Card | undefined {
  return [...cards].sort((a, b) => autoChooseScore(a.rank) - autoChooseScore(b.rank))[0];
}

function faceUpChoices(state: MexicanaState, player: MexicanaPlayerState): MexicanaAction[] {
  const ids = player.hand.map((card) => card.id);
  return nonEmptySubsets(ids)
    .filter((subset) => subset.length === state.rules.layerSize)
    .map((subset) => ({ type: 'CHOOSE_FACE_UP', cardIds: subset as [CardId, CardId, CardId] }));
}

/**
 * Timer expiry: auto-pick the highest face-up cards, or pick up the pile and
 * lose the turn (rules §8) — taking the lowest face-up card along when only
 * unplayable face-up cards are left.
 */
export function getDefaultAction(state: MexicanaState, playerId: PlayerId): MexicanaAction | null {
  const player = state.players[playerId];
  if (!player) return null;
  if (state.phase === 'CHOOSING') {
    if (player.hasChosenFaceUp) return null;
    const highest = [...player.hand]
      .sort((a, b) => autoChooseScore(b.rank) - autoChooseScore(a.rank))
      .slice(0, state.rules.layerSize)
      .map((card) => card.id);
    return { type: 'CHOOSE_FACE_UP', cardIds: highest as [CardId, CardId, CardId] };
  }
  if (state.phase !== 'PLAYING' || currentPlayerId(state) !== playerId) return null;
  const take = defaultFaceUpToTake(faceUpToTake(state, playerId));
  return take ? { type: 'TIMEOUT_PICK_UP', faceUpCardId: take.id } : { type: 'TIMEOUT_PICK_UP' };
}

export function getPendingPlayers(state: MexicanaState): PlayerId[] {
  switch (state.phase) {
    case 'CHOOSING':
      return state.turnOrder.filter((id) => !state.players[id]?.hasChosenFaceUp);
    case 'PLAYING': {
      const current = currentPlayerId(state);
      return current ? [current] : [];
    }
    case 'FINISHED':
      return [];
  }
}
