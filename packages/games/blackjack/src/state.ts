import type { PlayerId } from '@cardroom/game-core';
import { isPair, netChips } from './rules';
import type { BlackjackConfig, BlackjackState, Chips, Decision, Hand, Phase, Seat } from './types';

export const findSeat = (state: BlackjackState, playerId: PlayerId): Seat | undefined =>
  state.seats.find((seat) => seat.playerId === playerId);

export function seatOf(state: BlackjackState, seatIndex: number): Seat {
  const seat = state.seats.find((s) => s.seatIndex === seatIndex);
  if (!seat) throw new Error(`No player in seat ${seatIndex}`);
  return seat;
}

/** The hand on turn, if any. */
export function currentHand(state: BlackjackState): Hand | null {
  const turn = state.turn;
  if (state.phase !== 'PLAYER_TURNS' || !turn) return null;
  return seatOf(state, turn.seatIndex).hands[turn.handIndex] ?? null;
}

/** Player deciding the hand on turn. */
export function currentPlayerId(state: BlackjackState): PlayerId | null {
  if (state.phase !== 'PLAYER_TURNS' || !state.turn) return null;
  return seatOf(state, state.turn.seatIndex).playerId;
}

/** Phases the dealer runs alone, on a timer of their own (05 §2). */
export const isAutomaticPhase = (phase: Phase): boolean =>
  phase === 'DEALING' ||
  phase === 'PEEK' ||
  phase === 'DEALER_TURN' ||
  phase === 'SETTLEMENT' ||
  phase === 'SHUFFLING';

/** Seats still expected to bet (those who cannot afford the minimum may rebuy first). */
export function bettingPending(state: BlackjackState): Seat[] {
  if (state.phase !== 'BETTING') return [];
  const { minBet, allowRebuy } = state.config;
  return state.seats.filter(
    (seat) => !seat.sittingOut && seat.bet === null && (seat.stack >= minBet || allowRebuy),
  );
}

/** Rules §5.4: what the hand on turn may do. */
export function canDecide(state: BlackjackState, seat: Seat, decision: Decision): boolean {
  const hand = currentHand(state);
  if (!hand || state.turn?.seatIndex !== seat.seatIndex) return false;
  const { config } = state;
  const firstTwo = hand.cards.length === 2;
  switch (decision) {
    case 'HIT':
    case 'STAND':
      return true;
    case 'DOUBLE':
      return firstTwo && seat.stack >= hand.bet && (!hand.fromSplit || config.doubleAfterSplit);
    case 'SPLIT':
      return (
        isPair(hand.cards, config.splitTensByValue) &&
        seat.hands.length < config.maxHands &&
        seat.stack >= hand.bet
      );
    case 'SURRENDER':
      return config.surrender && firstTwo && !hand.fromSplit && seat.hands.length === 1;
  }
}

/** Chips of a seat on the felt and not settled yet: its bet, its hands, its insurance. */
export function chipsInPlay(seat: Seat): Chips {
  const hands = seat.hands.reduce((sum, hand) => sum + (hand.outcome === null ? hand.bet : 0), 0);
  const insurance =
    seat.insurance?.decision === 'TAKEN' && seat.insurance.payout === null ? seat.insurance.amount : 0;
  return (seat.bet ?? 0) + hands + insurance;
}

/** Session balance: everything the player holds (on the felt too) minus everything they bought in. */
export const seatNet = (seat: Seat, config: BlackjackConfig): Chips =>
  netChips({ stack: seat.stack + chipsInPlay(seat), rebuys: seat.rebuys }, config);

export const DECISIONS: readonly Decision[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER'];

export const allowedDecisions = (state: BlackjackState, seat: Seat): Set<Decision> =>
  new Set(DECISIONS.filter((decision) => canDecide(state, seat, decision)));
