import type { CardInstance, PlayerId } from '@cardroom/game-core';
import { handValue, isNatural, netChips } from './rules';
import { allowedDecisions, currentHand, currentPlayerId, findSeat, seatNet } from './state';
import { basicStrategy, hintsSupported } from './strategy';
import type {
  BlackjackState,
  BlackjackView,
  Decision,
  DealerView,
  HandView,
  SeatView,
  SessionRow,
} from './types';

/**
 * Filtered projection of the state. Players' cards are all face up (as at a
 * casino), so the only secrets are the dealer's hole card — shown as `null`
 * until it is turned over — and the shoe, of which only counts are sent.
 */
export function getPlayerView(state: BlackjackState, viewerId: PlayerId | null): BlackjackView {
  const self = viewerId !== null && findSeat(state, viewerId) ? viewerId : null;
  const { config } = state;
  const seats: SeatView[] = state.seats.map((seat) => ({
    seatIndex: seat.seatIndex,
    playerId: seat.playerId,
    stack: seat.stack,
    rebuys: seat.rebuys,
    net: seatNet(seat, config),
    bet: seat.bet,
    lastBet: seat.lastBet,
    insurance: seat.insurance ? { ...seat.insurance } : null,
    hands: seat.hands.map((hand): HandView => ({
      ...hand,
      cards: [...hand.cards],
      ...handValue(hand.cards),
    })),
    sittingOut: seat.sittingOut,
    leaving: seat.leaving,
    roundsPlayed: seat.roundsPlayed,
  }));
  return {
    phase: state.phase,
    selfId: self,
    round: state.round,
    roundsDealt: state.roundsDealt,
    dealerName: state.dealerName,
    rules: { ...config },
    dealer: dealerView(state),
    seats,
    turn: state.turn ? { ...state.turn } : null,
    shoe: {
      remaining: state.shoe.length - state.shoeIndex,
      total: state.shoe.length,
      cutAt: state.shoe.length - state.cutIndex,
      cutCardReached: state.cutCardReached,
    },
    discardCount: state.discard.length,
    endRequested: state.endRequested,
    hint: self ? hintFor(state, self) : null,
    session: sessionRows(state),
  };
}

export function getSpectatorView(state: BlackjackState): BlackjackView {
  return getPlayerView(state, null);
}

function dealerView(state: BlackjackState): DealerView {
  const { cards, holeRevealed } = state.dealer;
  const hidden = state.config.holeCard === 'PEEK' && !holeRevealed && cards.length > 1;
  const shown: (CardInstance | null)[] = cards.map((card, i) => (hidden && i === 1 ? null : card));
  const visible = shown.filter((card): card is CardInstance => card !== null);
  const value = handValue(visible);
  return {
    cards: shown,
    total: visible.length > 0 ? value.total : null,
    soft: value.soft,
    blackjack: !hidden && isNatural(cards),
    busted: value.total > 21,
  };
}

/** Basic-strategy advice (06), only for the viewer on turn at a table whose rules the chart covers. */
function hintFor(state: BlackjackState, viewerId: PlayerId): Decision | null {
  const { config } = state;
  if (!config.hintsEnabled || !hintsSupported(config) || currentPlayerId(state) !== viewerId) return null;
  const hand = currentHand(state);
  const seat = findSeat(state, viewerId);
  const up = state.dealer.cards[0];
  if (!hand || !seat || !up) return null;
  return basicStrategy(hand.cards, up, allowedDecisions(state, seat), config.splitTensByValue);
}

/** Everyone who sat down this session, best net first (the session result, rebuys discounted). */
export function sessionRows(state: BlackjackState): SessionRow[] {
  const { config } = state;
  const rows: SessionRow[] = [
    ...state.seats.map((seat) => ({
      playerId: seat.playerId,
      stack: seat.stack,
      rebuys: seat.rebuys,
      net: seatNet(seat, config),
      roundsPlayed: seat.roundsPlayed,
      seated: true,
    })),
    ...state.departed.map((player) => ({ ...player, net: netChips(player, config), seated: false })),
  ];
  return rows.sort((a, b) => b.net - a.net);
}
