import {
  STANDARD_RANKS,
  createDeck,
  createRankComparator,
  fail,
  ok,
  placedStandings,
  shuffle,
  type Card,
  type ConfigField,
  type GameModule,
  type GameResult,
  type PlayerId,
} from '@cardroom/game-core';
import { z } from 'zod';

export const HIGH_CARD_ID = 'high-card';

export interface HighCardConfig {
  rounds: number;
  turnTimeoutMs: number;
}

export interface HighCardState {
  phase: 'PLAYING' | 'FINISHED';
  players: PlayerId[];
  round: number;
  rounds: number;
  hands: Record<PlayerId, Card[]>;
  /** Cards committed this round; hidden from others until everyone has played. */
  committed: Record<PlayerId, Card | null>;
  scores: Record<PlayerId, number>;
  lastRound: RoundOutcome | null;
  turnTimeoutMs: number;
}

export interface RoundOutcome {
  round: number;
  plays: Record<PlayerId, Card>;
  winners: PlayerId[];
}

export type HighCardAction = { type: 'PLAY_CARD'; cardId: string };

export type HighCardEvent =
  | { type: 'CardCommitted'; playerId: PlayerId }
  | { type: 'RoundResolved'; outcome: RoundOutcome }
  | { type: 'GameFinished' };

export interface HighCardView {
  phase: HighCardState['phase'];
  selfId: PlayerId | null;
  round: number;
  rounds: number;
  hand: Card[];
  seats: { id: PlayerId; score: number; handCount: number; hasCommitted: boolean }[];
  lastRound: RoundOutcome | null;
}

export const highCardConfigSchema = z.object({
  rounds: z.number().int().min(1).max(8).default(5),
  turnTimeoutMs: z.number().int().min(5_000).max(120_000).default(30_000),
});

const TIMER_OPTIONS = [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 }));

export const highCardConfigUi: ConfigField[] = [
  { key: 'rounds', label: 'Rondas', options: [3, 5, 7].map((n) => ({ label: `${n}`, value: n })) },
  { key: 'turnTimeoutMs', label: 'Tempo por ronda', options: TIMER_OPTIONS },
];

const actionSchema = z.strictObject({ type: z.literal('PLAY_CARD'), cardId: z.string().min(2).max(3) });

const compareRanks = createRankComparator(STANDARD_RANKS);

function resolveRound(state: HighCardState): RoundOutcome {
  const plays = state.committed as Record<PlayerId, Card>;
  let best: Card | null = null;
  for (const id of state.players) {
    const card = plays[id] as Card;
    if (!best || compareRanks(card.rank, best.rank) > 0) best = card;
  }
  const winners = state.players.filter(
    (id) => compareRanks((plays[id] as Card).rank, (best as Card).rank) === 0,
  );
  return { round: state.round, plays: { ...plays }, winners };
}

function getResult(state: HighCardState): GameResult {
  const ordered = [...state.players].sort((a, b) => (state.scores[b] ?? 0) - (state.scores[a] ?? 0));
  return { standings: placedStandings(ordered) };
}

function pending(state: HighCardState): PlayerId[] {
  return state.phase === 'PLAYING' ? state.players.filter((id) => state.committed[id] === null) : [];
}

function view(state: HighCardState, viewerId: PlayerId | null): HighCardView {
  const hand = viewerId ? state.hands[viewerId] : undefined;
  return {
    phase: state.phase,
    selfId: hand ? viewerId : null,
    round: state.round,
    rounds: state.rounds,
    hand: [...(hand ?? [])],
    seats: state.players.map((id) => ({
      id,
      score: state.scores[id] ?? 0,
      handCount: state.hands[id]?.length ?? 0,
      hasCommitted: state.committed[id] !== null,
    })),
    lastRound: state.lastRound,
  };
}

export const highCard: GameModule<
  HighCardState,
  HighCardAction,
  HighCardConfig,
  HighCardView,
  HighCardEvent
> = {
  id: HIGH_CARD_ID,
  name: 'Carta Mais Alta',
  minPlayers: 2,
  maxPlayers: 6,
  configSchema: highCardConfigSchema,
  configUi: highCardConfigUi,
  actionSchema,

  setup(players, config, rng) {
    let deck = shuffle(createDeck({ jokers: 0 }), rng);
    const hands: Record<PlayerId, Card[]> = {};
    for (const id of players) {
      hands[id] = deck.slice(0, config.rounds).sort((a, b) => compareRanks(a.rank, b.rank));
      deck = deck.slice(config.rounds);
    }
    return {
      phase: 'PLAYING',
      players: [...players],
      round: 1,
      rounds: config.rounds,
      hands,
      committed: Object.fromEntries(players.map((id) => [id, null])),
      scores: Object.fromEntries(players.map((id) => [id, 0])),
      lastRound: null,
      turnTimeoutMs: config.turnTimeoutMs,
    };
  },

  applyAction(state, action, playerId) {
    const hand = state.hands[playerId];
    if (!hand) return fail('UNKNOWN_PLAYER', 'Player is not part of this game');
    if (state.phase !== 'PLAYING') return fail('WRONG_PHASE', 'The game is over');
    if (state.committed[playerId]) return fail('ALREADY_PLAYED', 'You already played this round');
    const card = hand.find((c) => c.id === action.cardId);
    if (!card) return fail('INVALID_CARDS', 'That card is not in your hand');

    const next: HighCardState = {
      ...state,
      hands: { ...state.hands, [playerId]: hand.filter((c) => c.id !== card.id) },
      committed: { ...state.committed, [playerId]: card },
      scores: { ...state.scores },
    };
    const events: HighCardEvent[] = [{ type: 'CardCommitted', playerId }];
    if (pending(next).length > 0) return ok(next, events);

    const outcome = resolveRound(next);
    for (const id of outcome.winners) next.scores[id] = (next.scores[id] ?? 0) + 1;
    next.lastRound = outcome;
    next.committed = Object.fromEntries(next.players.map((id) => [id, null]));
    events.push({ type: 'RoundResolved', outcome });
    if (next.round >= next.rounds) {
      next.phase = 'FINISHED';
      events.push({ type: 'GameFinished' });
    } else {
      next.round += 1;
    }
    return ok(next, events);
  },

  getPlayerView: view,
  getSpectatorView: (state) => view(state, null),

  getValidActions(state, playerId) {
    if (!pending(state).includes(playerId)) return [];
    return (state.hands[playerId] ?? []).map((card) => ({ type: 'PLAY_CARD', cardId: card.id }));
  },

  getDefaultAction(state, playerId) {
    if (!pending(state).includes(playerId)) return null;
    const lowest = state.hands[playerId]?.[0];
    return lowest ? { type: 'PLAY_CARD', cardId: lowest.id } : null;
  },

  getCurrentPlayer: () => null,
  getPendingPlayers: pending,
  getTimeoutMs: (state) => (state.phase === 'PLAYING' ? state.turnTimeoutMs : null),
  isFinished: (state) => state.phase === 'FINISHED',
  getResult,
};
