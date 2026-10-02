import type { PlayerId } from '@cardroom/game-core';
import { compareCards } from './rules';
import { currentPlayerId, handOf, isBlocked, inGame, positionOf, rosterEntry } from './state';
import type { OlhoExchangeView, OlhoSessionRow, OlhoState, OlhoView, SessionPlayer } from './types';

/**
 * Filtered projection of the state (requirement 2): the viewer's own hand and
 * counts for everyone else. Played cards are face up for all; the cards of an
 * exchange only reach its two players. Spectators see no hand at all.
 */
export function getPlayerView(state: OlhoState, viewerId: PlayerId | null): OlhoView {
  const entry = viewerId === null ? undefined : rosterEntry(state, viewerId);
  const self = entry?.seated ? (viewerId as PlayerId) : null;
  const { displayName, ...rules } = state.config;
  const trick = state.trick;
  const skip = trick.skip;
  return {
    phase: state.phase,
    displayName,
    rules,
    selfId: self,
    gameNumber: state.gameNumber,
    gamesCompleted: state.gamesCompleted,
    me: self
      ? {
          id: self,
          hand: [...handOf(state, self)].sort(compareCards),
          role: rosterEntry(state, self)?.role ?? null,
          waiting: state.waiting.includes(self),
        }
      : null,
    seats: state.seats.map((id) => {
      const player = rosterEntry(state, id) as SessionPlayer;
      return {
        id,
        seatIndex: player.seatIndex,
        handCount: handOf(state, id).length,
        role: player.role,
        points: player.points,
        passed: trick.passed.includes(id),
        finishedPosition: positionOf(state, id),
        blocked: inGame(state, id) && isBlocked(state, id),
        leaving: state.leaving.includes(id),
      };
    }),
    waiting: [...state.waiting],
    currentPlayerId: currentPlayerId(state),
    trick: {
      number: trick.number,
      isFirstOfGame: trick.isFirstOfGame,
      leaderId: trick.leaderId,
      count: trick.count,
      topRank: trick.topRank,
      plays: trick.plays.map((p) => ({ ...p, cards: [...p.cards] })),
      passed: [...trick.passed],
      sameRankRun: trick.sameRankRun ? { ...trick.sameRankRun } : null,
      skip: skip ? { ...skip } : null,
      lastPlayerId: trick.lastPlayerId,
      closing: trick.closing ? { ...trick.closing } : null,
    },
    discardCount: state.discard.length,
    skipPrompt:
      skip && self !== null && skip.targetId === self && currentPlayerId(state) === self
        ? { rank: skip.rank, count: skip.count }
        : null,
    exchange: exchangeView(state, self),
    lastGame: state.lastGame
      ? {
          ...state.lastGame,
          order: [...state.lastGame.order],
          roles: { ...state.lastGame.roles },
          pointsDelta: { ...state.lastGame.pointsDelta },
        }
      : null,
    session: sessionRows(state),
  };
}

export function getSpectatorView(state: OlhoState): OlhoView {
  return getPlayerView(state, null);
}

function exchangeView(state: OlhoState, self: PlayerId | null): OlhoExchangeView | null {
  const exchange = state.exchange;
  if (!exchange) return null;
  const pair = self ? exchange.pairs.find((p) => p.giver === self || p.receiver === self) : undefined;
  const giver = pair?.giver === self;
  // The receiver sees the cards once they have arrived; the giver knows their own best cards all along.
  const given = pair && (giver || exchange.stage !== 'DEALT') ? [...pair.given] : null;
  return {
    stage: exchange.stage,
    pairs: exchange.pairs.map((p) => ({
      giver: p.giver,
      receiver: p.receiver,
      count: p.count,
      returned: p.returned !== null,
    })),
    mine: pair
      ? {
          side: giver ? 'GIVER' : 'RECEIVER',
          partnerId: giver ? pair.receiver : pair.giver,
          count: pair.count,
          given,
          returned: pair.returned ? [...pair.returned] : null,
          mustReturn: !giver && exchange.stage === 'RETURNING' && pair.returned === null,
        }
      : null,
  };
}

/** Everyone who sat down this session, most points first (the session result). */
export function sessionRows(state: OlhoState): OlhoSessionRow[] {
  return state.roster
    .map((p) => ({
      playerId: p.playerId,
      points: p.points,
      gamesPlayed: p.gamesPlayed,
      presidentCount: p.presidentCount,
      olhoCount: p.olhoCount,
      role: p.role,
      seated: p.seated,
    }))
    .sort((a, b) => b.points - a.points || b.presidentCount - a.presidentCount);
}
