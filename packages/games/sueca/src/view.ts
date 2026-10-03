import type { PlayerId } from '@cardroom/game-core';
import { matchesWon } from './engine';
import { PLAY_ORDER, sortHand, teamOf } from './rules';
import { canViewLastTrick, currentSeat, isChatOpen, legalFor, seatOf, tricksPlayed } from './state';
import type { ClosedTrick, SuecaState, SuecaView } from './types';

const copyTrick = (trick: ClosedTrick): ClosedTrick => ({ winner: trick.winner, plays: [...trick.plays] });

/**
 * Filtered projection of the state (contract §6): the viewer's own hand only,
 * every other hand as a count; the trump card while it is face up; tricks
 * won but never points until the hand is over; the last trick only during
 * the viewer's own look at it. Spectators see no hand at all.
 */
export function getPlayerView(state: SuecaState, viewerId: PlayerId | null): SuecaView {
  const mySeat = viewerId === null ? null : seatOf(state, viewerId);
  const current = currentSeat(state);
  const shown = mySeat ? state.lastTrickShown[mySeat] : undefined;
  return {
    phase: state.phase,
    pausedFrom: state.pausedFrom,
    mySeat,
    myTeam: mySeat ? teamOf(mySeat) : null,
    seats: PLAY_ORDER.map((seat) => ({
      seat,
      playerId: state.seats[seat],
      team: teamOf(seat),
      handCount: state.hands[seat].length,
      isCurrent: current === seat,
      absent: state.absent.includes(seat),
    })),
    myHand: mySeat ? sortHand(state.hands[mySeat], state.trumpSuit) : [],
    legalCardUids: mySeat ? legalFor(state, mySeat).map((card) => card.uid) : [],
    handNumber: state.handNumber,
    dealer: state.dealer,
    cutter: state.cutter,
    cutFrom: state.cutFrom,
    trump:
      state.trumpSuit && state.trumpCard
        ? {
            suit: state.trumpSuit,
            card: state.trumpCardPlayed ? null : state.trumpCard,
            holder: state.dealer,
          }
        : null,
    trick: { leader: state.trick.leader, plays: [...state.trick.plays] },
    trickWinner: state.trickWinner,
    tricksPlayed: tricksPlayed(state),
    tricksWon: { ...state.tricksWon },
    lastTrickAvailable: mySeat !== null && canViewLastTrick(state, mySeat),
    lastTrickView: shown ? copyTrick(shown) : null,
    games: { ...state.games },
    targetGames: state.config.targetGames,
    handSummary:
      state.phase === 'HAND_SUMMARY' || state.phase === 'FINISHED' || state.pausedFrom === 'HAND_SUMMARY'
        ? (state.history.at(-1) ?? null)
        : null,
    history: [...state.history],
    chatEnabled: isChatOpen(state),
    absent: [...state.absent],
    winner: state.winner,
    matchesWon: matchesWon(state),
  };
}

export function getSpectatorView(state: SuecaState): SuecaView {
  return getPlayerView(state, null);
}
