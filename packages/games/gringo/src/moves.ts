import type { PlayerId } from '@cardroom/game-core';
import { powerOf } from './rules';
import {
  canCallGringo,
  currentPlayerId,
  filledIndexes,
  giverOf,
  hasCards,
  powerUsable,
  targetsOf,
} from './state';
import type { GringoAction, GringoClientAction, GringoState, PowerState } from './types';

/** Every slot of the other players that holds a card. */
function otherSlots(state: GringoState, playerId: PlayerId): { owner: PlayerId; index: number }[] {
  return targetsOf(state, playerId).flatMap((owner) =>
    filledIndexes(state, owner).map((index) => ({ owner, index })),
  );
}

/** What a player may do now, every option spelled out (the client reads its choices from this list). */
export function getValidActions(state: GringoState, playerId: PlayerId): GringoClientAction[] {
  if (!state.seats.includes(playerId)) return [];
  if (state.phase === 'INITIAL_PEEK') {
    return state.peekDone.includes(playerId) ? [] : [{ type: 'PEEK_DONE' }];
  }
  if (state.phase === 'SNAP_WINDOW') {
    const window = state.snap;
    if (!window || window.result) return [];
    const { discardId } = window;
    const mine = filledIndexes(state, playerId).map((index) => ({ owner: playerId, index }));
    // Another player's card needs one of one's own to give in its place.
    const theirs = mine.length > 0 ? otherSlots(state, playerId) : [];
    return [...mine, ...theirs].map(({ owner, index }): GringoClientAction => ({
      type: 'SNAP',
      discardId,
      owner,
      index,
    }));
  }
  if (state.phase === 'SNAP_GIVE') {
    return giverOf(state) === playerId
      ? filledIndexes(state, playerId).map((index): GringoClientAction => ({ type: 'SNAP_GIVE', index }))
      : [];
  }
  if (currentPlayerId(state) !== playerId) return [];
  const mine = filledIndexes(state, playerId);

  switch (state.phase) {
    case 'TURN_DRAW': {
      const gringo: GringoClientAction[] = canCallGringo(state) ? [{ type: 'CALL_GRINGO' }] : [];
      return mine.length > 0 ? [{ type: 'DRAW' }, ...gringo] : [...gringo, { type: 'PASS' }];
    }
    case 'TURN_DECIDE': {
      const power = state.drawn ? powerOf(state.drawn, state.config.powerSet) : null;
      const withPower: GringoClientAction[] =
        power && powerUsable(state, playerId, power) ? [{ type: 'DISCARD_DRAWN', usePower: true }] : [];
      return [
        ...mine.map((index): GringoClientAction => ({ type: 'SWAP_DRAWN', index })),
        { type: 'DISCARD_DRAWN', usePower: false },
        ...withPower,
      ];
    }
    case 'POWER':
      return state.power ? powerActions(state, playerId, state.power, mine) : [];
    case 'FINISHED':
      return [];
  }
}

function powerActions(
  state: GringoState,
  playerId: PlayerId,
  power: PowerState,
  mine: readonly number[],
): GringoClientAction[] {
  if (power.step === 'PEEKED') {
    if (power.type !== 'PEEK_AND_SWAP') return [{ type: 'POWER_PEEK_DONE' }];
    return [
      { type: 'POWER_SWAP_DECISION', swap: false },
      ...mine.map((myIndex): GringoClientAction => ({ type: 'POWER_SWAP_DECISION', swap: true, myIndex })),
    ];
  }
  const skip: GringoClientAction = { type: 'POWER_SKIP' };
  switch (power.type) {
    case 'PEEK_OWN':
      return [
        ...mine.map((index): GringoClientAction => ({ type: 'POWER_PEEK', owner: playerId, index })),
        skip,
      ];
    case 'PEEK_OTHER':
    case 'PEEK_AND_SWAP':
      return [
        ...otherSlots(state, playerId).map(({ owner, index }): GringoClientAction => ({
          type: 'POWER_PEEK',
          owner,
          index,
        })),
        skip,
      ];
    case 'BLIND_SWAP':
      return [
        ...mine.flatMap((myIndex) =>
          otherSlots(state, playerId).map(({ owner, index }): GringoClientAction => ({
            type: 'POWER_BLIND_SWAP',
            myIndex,
            owner,
            theirIndex: index,
          })),
        ),
        skip,
      ];
  }
}

/**
 * Rules §12, per player: memorised; let the turn go or draw; discard the drawn
 * card without its power; give up the power; keep one's cards after a king's
 * peek; after snapping another's card, give them one's first card.
 */
export function getDefaultAction(state: GringoState, playerId: PlayerId): GringoClientAction | null {
  if (state.phase === 'INITIAL_PEEK') {
    return state.seats.includes(playerId) && !state.peekDone.includes(playerId)
      ? { type: 'PEEK_DONE' }
      : null;
  }
  if (state.phase === 'SNAP_GIVE') {
    const [first] = filledIndexes(state, playerId);
    return giverOf(state) === playerId && first !== undefined ? { type: 'SNAP_GIVE', index: first } : null;
  }
  if (currentPlayerId(state) !== playerId) return null;
  switch (state.phase) {
    case 'TURN_DRAW':
      return hasCards(state, playerId) ? { type: 'DRAW' } : { type: 'PASS' };
    case 'TURN_DECIDE':
      return { type: 'DISCARD_DRAWN', usePower: false };
    case 'POWER':
      if (state.power?.step === 'CHOOSE') return { type: 'POWER_SKIP' };
      return state.power?.type === 'PEEK_AND_SWAP' ? { type: 'POWER_SWAP_DECISION', swap: false } : null;
    case 'SNAP_WINDOW':
    case 'FINISHED':
      return null;
  }
}

/** A power's peek on screen: nobody owes anything, the engine ends it by itself (or the player, earlier). */
const peekShowing = (state: GringoState): boolean =>
  state.phase === 'POWER' && state.power?.step === 'PEEKED' && state.power.type !== 'PEEK_AND_SWAP';

/** Who owes a decision: everyone still memorising, the player on turn, or a snapper owing a card. */
export function getPendingPlayers(state: GringoState): PlayerId[] {
  if (state.phase === 'INITIAL_PEEK') return state.seats.filter((id) => !state.peekDone.includes(id));
  const current = currentPlayerId(state) ?? giverOf(state);
  return current && !peekShowing(state) ? [current] : [];
}

/**
 * Rules §12: 10 s to memorise, 30 s to draw and to decide, 20 s for a power,
 * 10 s to choose the card given after a snap. The snap window runs on its own.
 */
export function getTimeoutMs(state: GringoState): number | null {
  if (getPendingPlayers(state).length === 0) return null;
  const { config } = state;
  switch (state.phase) {
    case 'INITIAL_PEEK':
      return config.initialPeekMs;
    case 'POWER':
      return config.powerTimeoutMs;
    case 'SNAP_GIVE':
      return config.giveTimeoutMs;
    case 'TURN_DRAW':
    case 'TURN_DECIDE':
    case 'SNAP_WINDOW':
    case 'FINISHED':
      return config.turnTimeoutMs;
  }
}

/** The initial peek ends for everyone at once; a turn's clock plays the whole default (draw and discard). */
export function getTimeoutAction(state: GringoState): GringoAction | null {
  if (getPendingPlayers(state).length === 0) return null;
  return state.phase === 'INITIAL_PEEK' ? { type: 'SYS_INITIAL_PEEK_END' } : { type: 'SYS_TIMEOUT' };
}
