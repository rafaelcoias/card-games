import type { ConfigField, GameModule, GameResult } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, setup, shuffledDealer, type Dealer } from './engine';
import { getDefaultAction, getPendingPlayers, getTimeoutMs, getValidActions } from './moves';
import { MAX_PLAYERS, MIN_PLAYERS, fitsInDeck } from './rules';
import { currentPlayerId } from './state';
import type { FodinhaAction, FodinhaConfig, FodinhaEvent, FodinhaState, FodinhaView } from './types';
import { getPlayerView, getSpectatorView } from './view';

export const FODINHA_ID = 'fodinha';

/** Room settings; ranges follow the closed open points #7 (hand 3–7) and #8 (points 3–15). */
export const fodinhaConfigSchema = z.object({
  maxPoints: z.number().int().min(3).max(15).default(5),
  maxHandSize: z.number().int().min(3).max(7).default(5),
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  lastBidderRestriction: z.boolean().default(false),
}) satisfies z.ZodType<FodinhaConfig>;

const TIMER_OPTIONS = [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 }));

export const fodinhaConfigUi: ConfigField[] = [
  {
    key: 'maxPoints',
    label: 'Perde quem chegar a',
    options: [3, 5, 7, 10, 15].map((n) => ({ label: `${n} pontos`, value: n })),
  },
  {
    key: 'maxHandSize',
    label: 'Mão máxima',
    help: 'As rondas sobem de 1 carta até este número e voltam a descer.',
    options: [3, 4, 5, 6, 7].map((n) => ({ label: `${n} cartas`, value: n })),
  },
  { key: 'turnTimeoutMs', label: 'Tempo por decisão', options: TIMER_OPTIONS },
  {
    key: 'lastBidderRestriction',
    label: 'Último a apostar',
    help: 'Com a restrição, a soma das apostas nunca pode igualar o número de vazas — alguém tem de falhar.',
    options: [
      { label: 'Aposta livre', value: false },
      { label: 'Não pode fechar a soma', value: true },
    ],
  },
];

const cardIdSchema = z.string().regex(/^(?:10|[2-9JQKA])[SHDC]$/, 'Invalid card id');

/** Actions accepted from clients. System actions (`SYS_*`) are deliberately absent. */
export const fodinhaActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PLACE_BID'), bid: z.number().int().min(0).max(10) }),
  z.strictObject({ type: z.literal('PLAY_CARD'), cardId: cardIdSchema }),
]);

/** No winners: whoever reached the limit lost, everyone else survived. Fewest points first. */
function getResult(state: FodinhaState): GameResult {
  const standings = state.seats
    .map((playerId, seat) => ({ playerId, seat, score: state.points[playerId] ?? 0 }))
    .sort((a, b) => a.score - b.score || a.seat - b.seat)
    .map(({ playerId, score }) => ({
      playerId,
      outcome: state.losers.includes(playerId) ? ('LOSER' as const) : ('SURVIVOR' as const),
      score,
    }));
  return { standings, summary: { rounds: state.round, maxPoints: state.config.maxPoints } };
}

export type FodinhaModule = GameModule<FodinhaState, FodinhaAction, FodinhaConfig, FodinhaView, FodinhaEvent>;

/** Builds the module; tests inject a dealer to play with fixed cards. */
export function createFodinhaModule(dealer: Dealer = shuffledDealer): FodinhaModule {
  return {
    id: FODINHA_ID,
    name: 'Fodinha',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'MATCH',
    configSchema: fodinhaConfigSchema,
    configUi: fodinhaConfigUi,
    actionSchema: fodinhaActionSchema,
    validateTable: (config, playerCount) =>
      fitsInDeck(playerCount, config.maxHandSize)
        ? null
        : {
            code: 'TOO_MANY_CARDS',
            message: `${playerCount} jogadores com mão máxima de ${config.maxHandSize} precisam de mais de 52 cartas`,
          },
    setup: (players, config, rng, options) => setup(players, config, rng, options, dealer),
    applyAction: (state, action, playerId) => applyAction(state, action, playerId, dealer),
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs,
    isFinished: (state) => state.phase === 'FINISHED',
    getResult,
  };
}

export const fodinha = createFodinhaModule();
