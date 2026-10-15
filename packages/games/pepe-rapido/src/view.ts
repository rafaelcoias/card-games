import type { PlayerId } from '@cardroom/game-core';
import { cardsOf, flipRequired } from './rules';
import type { CentrePileView, PepeSideView, PepeState, PepeView, PileIndex, PlayerArea } from './types';

/**
 * Filtered projection (contract §7): top cards and stack thickness for both
 * players' columns; counts only where the room's options allow them — they
 * are `null` here, on the server, never merely hidden by the client.
 */
export function getPlayerView(state: PepeState, viewerId: PlayerId | null): PepeView {
  const self = viewerId !== null && state.players.includes(viewerId) ? viewerId : null;
  const order = self === state.players[1] ? [state.players[1], state.players[0]] : [...state.players];
  const { config } = state;

  const side = (id: PlayerId): PepeSideView => {
    const area = state.areas[id] as PlayerArea;
    const own = id === self;
    const reserveShown = own ? config.showOwnReserveCount : config.showOpponentCounts;
    return {
      id,
      pile: state.players.indexOf(id) as PileIndex,
      columns: area.columns.map((column) => ({
        top: column.at(-1) ?? null,
        hiddenCount: Math.max(0, column.length - 1),
      })),
      hasReserve: area.reserve.length > 0,
      reserveCount: reserveShown ? area.reserve.length : null,
      totalCount: !own && config.showOpponentCounts ? cardsOf(area) : null,
      wantsFlip: area.wantsFlip,
    };
  };

  const pile = (cards: PepeState['centre'][number]): CentrePileView => ({
    top: cards.at(-1) ?? null,
    count: config.showCentreCounts ? cards.length : null,
  });

  return {
    phase: state.phase,
    round: state.round,
    config: { ...config },
    selfId: self,
    sides: [side(order[0] as PlayerId), side(order[1] as PlayerId)],
    centre: [pile(state.centre[0]), pile(state.centre[1])],
    flipRequired: flipRequired(state),
    roundWinner: state.roundWinner,
    canChoosePile: state.phase === 'CHOOSING_PILE' && self !== null && state.roundWinner === self,
    flips: state.flips,
    winner: state.winner,
    deadlock: state.deadlock,
  };
}

export function getSpectatorView(state: PepeState): PepeView {
  return getPlayerView(state, null);
}
