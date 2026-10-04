import type { PlayerId } from '@cardroom/game-core';
import { scoresOf } from './engine';
import { INITIAL_PEEK_INDEXES } from './rules';
import { cardCount, gridOf, gringoTurnsLeft, turnPlayerId } from './state';
import type { GringoState, GringoView, Slot } from './types';

/**
 * Whether `viewer` may see the face of `owner`'s card in `slot` right now
 * (contract §6): their own bottom row during the initial peek, the card they
 * look at with a power, a missed snap (shown to everyone), and every card at the end.
 */
function visible(state: GringoState, viewer: PlayerId | null, owner: PlayerId, slot: Slot): boolean {
  if (state.phase === 'FINISHED') return true;
  const missed = state.snap?.result;
  if (missed && !missed.hit && missed.owner === owner && missed.index === slot.index) return true;
  if (viewer === null) return false;
  if (state.phase === 'INITIAL_PEEK') {
    return viewer === owner && !state.peekDone.includes(viewer) && INITIAL_PEEK_INDEXES.includes(slot.index);
  }
  const peeked = state.power?.step === 'PEEKED' ? state.power.peeked : null;
  return (
    peeked !== null && viewer === turnPlayerId(state) && peeked.owner === owner && peeked.index === slot.index
  );
}

/**
 * Filtered projection of the state. A face-down card travels as "a card is
 * here" only — not even its `uid`, which would name it: the client tells
 * face-down cards apart by itself.
 */
export function getPlayerView(state: GringoState, viewerId: PlayerId | null): GringoView {
  const self = viewerId !== null && state.seats.includes(viewerId) ? viewerId : null;
  const turnPlayer = turnPlayerId(state);
  const onTurn = self !== null && self === turnPlayer;
  const power = state.power;
  const peeked = power?.step === 'PEEKED' ? power.peeked : null;
  const peekedCard =
    onTurn && peeked
      ? (gridOf(state, peeked.owner).find((slot) => slot.index === peeked.index)?.card ?? null)
      : null;
  const finished = state.phase === 'FINISHED';
  const scores = finished ? scoresOf(state) : null;
  const best = scores ? Math.min(...Object.values(scores)) : 0;

  return {
    phase: state.phase,
    selfId: self,
    seats: state.seats.map((id) => ({
      id,
      grid: gridOf(state, id).map((slot) => ({
        index: slot.index,
        empty: slot.card === null,
        card: slot.card && visible(state, self, id, slot) ? slot.card : null,
      })),
      cardCount: cardCount(state, id),
      turnsPlayed: state.turnsPlayed[id] ?? 0,
      peekDone: state.peekDone.includes(id),
    })),
    turnPlayerId: turnPlayer,
    turn: state.turn,
    drawnBy: state.drawn ? turnPlayer : null,
    drawn: onTurn ? state.drawn : null,
    deckCount: state.deck.length,
    discardTop: state.discard.at(-1) ?? null,
    discardCount: state.discard.length,
    power:
      power && turnPlayer
        ? { playerId: turnPlayer, type: power.type, step: power.step, target: peeked ? { ...peeked } : null }
        : null,
    peek: peeked && peekedCard ? { ...peeked, card: peekedCard } : null,
    snap: state.snap
      ? {
          discardId: state.snap.discardId,
          open: state.snap.result === null,
          result: state.snap.result ? { ...state.snap.result } : null,
        }
      : null,
    gringo: state.gringo ? { calledBy: state.gringo.calledBy, remaining: [...state.gringo.remaining] } : null,
    gringoTurnsLeft: gringoTurnsLeft(state),
    rules: {
      redKingValue: state.config.redKingValue,
      powerSet: state.config.powerSet,
      gringoEnabled: state.config.gringoEnabled,
      gringoMinTurns: state.config.gringoMinTurns,
      snapWindowMs: state.config.snapWindowMs,
      initialPeekMs: state.config.initialPeekMs,
      decks: state.decks,
    },
    final:
      scores && state.endReason
        ? {
            reason: state.endReason,
            scores,
            winners: state.seats.filter((id) => scores[id] === best),
          }
        : null,
  };
}

export function getSpectatorView(state: GringoState): GringoView {
  return getPlayerView(state, null);
}
