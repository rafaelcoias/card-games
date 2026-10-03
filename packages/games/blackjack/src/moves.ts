import type { PlayerId } from '@cardroom/game-core';
import { allowedDecisions, bettingPending, currentPlayerId, findSeat, isAutomaticPhase } from './state';
import type { BlackjackAction, BlackjackClientAction, BlackjackState, Seat } from './types';

/**
 * What a player may do now. Betting appears once, at the table minimum: any
 * multiple of 10 between the limits that fits the stack is accepted.
 */
export function getValidActions(state: BlackjackState, playerId: PlayerId): BlackjackClientAction[] {
  const seat = findSeat(state, playerId);
  if (!seat || state.phase === 'FINISHED') return [];
  const actions = [...phaseActions(state, seat)];
  if (!isAutomaticPhase(state.phase)) actions.push({ type: 'SIT_OUT', value: !seat.sittingOut });
  return actions;
}

function phaseActions(state: BlackjackState, seat: Seat): BlackjackClientAction[] {
  const { config } = state;
  if (state.phase === 'BETTING') {
    if (seat.bet !== null) return [{ type: 'CLEAR_BET' }];
    if (seat.sittingOut) return [];
    if (seat.stack >= config.minBet) return [{ type: 'PLACE_BET', amount: config.minBet }];
    return [{ type: 'REBUY' }];
  }
  if (state.phase === 'INSURANCE' && seat.insurance?.decision === 'PENDING') {
    const type = seat.insurance.evenMoney ? 'EVEN_MONEY' : 'INSURANCE';
    return [
      { type, take: true },
      { type, take: false },
    ];
  }
  if (state.phase === 'PLAYER_TURNS' && currentPlayerId(state) === seat.playerId) {
    return [...allowedDecisions(state, seat)].map((type) => ({ type }));
  }
  return [];
}

/** Who owes a decision (drives the phase timer and away-player automation). */
export function getPendingPlayers(state: BlackjackState): PlayerId[] {
  if (state.phase === 'BETTING') return bettingPending(state).map((seat) => seat.playerId);
  if (state.phase === 'INSURANCE') {
    return state.seats.filter((seat) => seat.insurance?.decision === 'PENDING').map((seat) => seat.playerId);
  }
  const current = currentPlayerId(state);
  return current ? [current] : [];
}

/** Rules 11 #12: bets 15 s, insurance 10 s, decisions 20 s. */
export function getTimeoutMs(state: BlackjackState): number | null {
  if (getPendingPlayers(state).length === 0) return null;
  const { config } = state;
  if (state.phase === 'BETTING') return config.betTimeoutMs;
  if (state.phase === 'INSURANCE') return config.insuranceTimeoutMs;
  return config.decisionTimeoutMs;
}

/** When the timer runs out the phase closes: no bet = out this round, no answer = no insurance, stand. */
export function getTimeoutAction(state: BlackjackState): BlackjackAction | null {
  if (getPendingPlayers(state).length === 0) return null;
  if (state.phase === 'BETTING') return { type: 'SYS_BETTING_CLOSED' };
  if (state.phase === 'INSURANCE') return { type: 'SYS_INSURANCE_CLOSED' };
  return { type: 'SYS_DECISION_TIMEOUT' };
}

/** Acting for one player: decline insurance, stand. There is no default bet. */
export function getDefaultAction(state: BlackjackState, playerId: PlayerId): BlackjackClientAction | null {
  if (!getPendingPlayers(state).includes(playerId)) return null;
  if (state.phase === 'PLAYER_TURNS') return { type: 'STAND' };
  if (state.phase === 'INSURANCE') {
    return {
      type: findSeat(state, playerId)?.insurance?.evenMoney ? 'EVEN_MONEY' : 'INSURANCE',
      take: false,
    };
  }
  return null;
}
