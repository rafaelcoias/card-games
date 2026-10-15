import { createSeededRng, type PlayerId } from '@cardroom/game-core';
import {
  COLUMN_COUNT,
  FLIP_REQUEST_TIMEOUT_MS,
  PILES,
  PILE_CHOICE_TIMEOUT_MS,
  STALL_TIMEOUT_MS,
  canGroup,
  fitsCentre,
  flipRequired,
} from './rules';
import type { PepeAction, PepeClientAction, PepeState, PileIndex } from './types';

const columns = Array.from({ length: COLUMN_COUNT }, (_, i) => i);

/** Every move a player may make now, spelled out (a handful: 5 columns, 2 piles). */
export function getValidActions(state: PepeState, playerId: PlayerId): PepeClientAction[] {
  const area = state.areas[playerId];
  if (!area || !state.players.includes(playerId)) return [];
  if (state.phase === 'CHOOSING_PILE') {
    return state.roundWinner === playerId ? PILES.map((pile) => ({ type: 'CHOOSE_PILE', pile })) : [];
  }
  if (state.phase !== 'PLAYING' && state.phase !== 'STALLED') return [];

  const actions: PepeClientAction[] = [];
  for (const column of columns) {
    const card = area.columns[column]?.at(-1);
    if (!card) continue;
    for (const pile of PILES) {
      const top = state.centre[pile].at(-1);
      if (top && fitsCentre(card, top, state.config)) {
        actions.push({ type: 'PLAY_TO_CENTRE', cardUid: card.uid, column, pile, expectedTopUid: top.uid });
      }
    }
    for (const to of columns) {
      if (to === column) continue;
      const target = area.columns[to]?.at(-1);
      if (target && canGroup(card, target, state.config)) {
        actions.push({ type: 'GROUP', cardUid: card.uid, fromColumn: column, toColumn: to });
      } else if (!target && state.config.moveToEmpty && (area.columns[column]?.length ?? 0) > 1) {
        actions.push({ type: 'MOVE_TO_EMPTY', cardUid: card.uid, fromColumn: column, toColumn: to });
      }
    }
  }
  if (flipRequired(state).includes(playerId) && !area.wantsFlip) actions.push({ type: 'REQUEST_FLIP' });
  return actions;
}

/**
 * Who owes something, which drives the platform's clock and its automation of
 * players who dropped: both during a countdown (it is the phase's clock), the
 * ones yet to press "Virar" during a stall or once the other pressed it, and
 * whoever chooses a pile. Plain play has no clock: there are no turns.
 */
export function getPendingPlayers(state: PepeState): PlayerId[] {
  switch (state.phase) {
    case 'COUNTDOWN':
      return [...state.players];
    case 'STALLED':
    case 'PLAYING': {
      const required = flipRequired(state);
      const asked = state.players.some((id) => state.areas[id]?.wantsFlip);
      if (state.phase === 'PLAYING' && !asked) return [];
      return required.filter((id) => !state.areas[id]?.wantsFlip);
    }
    case 'CHOOSING_PILE':
      return state.roundWinner ? [state.roundWinner] : [];
    case 'ROUND_SETUP':
    case 'FINISHED':
      return [];
  }
}

export function getTimeoutMs(state: PepeState): number | null {
  switch (state.phase) {
    case 'COUNTDOWN':
      return state.config.countdownMs;
    case 'STALLED':
      return state.config.autoFlip ? state.config.autoFlipDelayMs : STALL_TIMEOUT_MS;
    case 'PLAYING':
      return getPendingPlayers(state).length > 0 ? FLIP_REQUEST_TIMEOUT_MS : null;
    case 'CHOOSING_PILE':
      return PILE_CHOICE_TIMEOUT_MS;
    case 'ROUND_SETUP':
    case 'FINISHED':
      return null;
  }
}

/** Phases that end as a whole when their clock runs out: the countdown, and a stall (rules §6, autoFlip). */
export function getTimeoutAction(state: PepeState): PepeAction | null {
  if (state.phase === 'COUNTDOWN') return { type: 'SYS_COUNTDOWN_DONE', flip: state.flips };
  if (state.phase === 'STALLED') return { type: 'SYS_AUTO_FLIP' };
  return null;
}

/**
 * For a player whose clock ran out (or who dropped): agree to turn over, or
 * take a pile drawn with the match's secret seed (the choice is blind anyway).
 */
export function getDefaultAction(state: PepeState, playerId: PlayerId): PepeClientAction | null {
  if (state.phase === 'CHOOSING_PILE') {
    if (state.roundWinner !== playerId) return null;
    const pile = createSeededRng(`${state.seed}:pile:${state.round}`).nextInt(2) as PileIndex;
    return { type: 'CHOOSE_PILE', pile };
  }
  if (state.phase !== 'PLAYING' && state.phase !== 'STALLED') return null;
  return getPendingPlayers(state).includes(playerId) ? { type: 'REQUEST_FLIP' } : null;
}
