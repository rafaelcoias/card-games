import { placedStandings, type ConfigField, type GameModule, type GameResult } from '@cardroom/game-core';
import { z } from 'zod';
import { applyAction, MAX_PLAYERS, MIN_PLAYERS, setup } from './engine';
import { getDefaultAction, getPendingPlayers, getValidActions } from './moves';
import { DEFAULT_RULES } from './rules';
import { currentPlayerId } from './state';
import type {
  MexicanaAction,
  MexicanaConfig,
  MexicanaEvent,
  MexicanaRules,
  MexicanaState,
  MexicanaView,
} from './types';
import { getPlayerView, getSpectatorView } from './view';

export const MEXICANA_ID = 'mexicana';

export const mexicanaConfigSchema = z.object({
  turnTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
  chooseTimeoutMs: z.number().int().min(10_000).max(120_000).default(30_000),
});

const TIMER_OPTIONS = [15, 30, 45, 60].map((s) => ({ label: `${s}s`, value: s * 1000 }));

export const mexicanaConfigUi: ConfigField[] = [
  { key: 'turnTimeoutMs', label: 'Tempo por jogada', options: TIMER_OPTIONS },
];

const cardIdSchema = z.string().regex(/^(?:(?:10|[2-9JQKA])[SHDC]|JK[12])$/, 'Invalid card id');

/** Actions accepted from clients. `TIMEOUT_PICK_UP` is deliberately absent. */
export const mexicanaActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('CHOOSE_FACE_UP'),
    cardIds: z.tuple([cardIdSchema, cardIdSchema, cardIdSchema]),
  }),
  z.strictObject({ type: z.literal('PLAY_CARDS'), cardIds: z.array(cardIdSchema).min(1).max(8) }),
  z.strictObject({ type: z.literal('PLAY_FACE_DOWN'), position: z.number().int().min(0).max(2) }),
  z.strictObject({ type: z.literal('PICK_UP_PILE'), faceUpCardId: cardIdSchema.optional() }),
]);

/** Finishing order: first out wins, the last one left loses, everyone else is placed. */
function getResult(state: MexicanaState): GameResult {
  const finished = state.turnOrder
    .filter((playerId) => state.players[playerId]?.finishedPosition != null)
    .sort(
      (a, b) =>
        (state.players[a]?.finishedPosition as number) - (state.players[b]?.finishedPosition as number),
    );
  return { standings: placedStandings(finished) };
}

export type MexicanaModule = GameModule<
  MexicanaState,
  MexicanaAction,
  MexicanaConfig,
  MexicanaView,
  MexicanaEvent
>;

/** Builds the module; pass custom rules to create a variant without touching the engine. */
export function createMexicanaModule(rules: MexicanaRules = DEFAULT_RULES): MexicanaModule {
  return {
    id: MEXICANA_ID,
    name: 'Mexicana',
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    lifecycle: 'MATCH',
    configSchema: mexicanaConfigSchema,
    configUi: mexicanaConfigUi,
    actionSchema: mexicanaActionSchema,
    setup: (players, config, rng, options) => setup(players, config, rng, options, rules),
    applyAction,
    getPlayerView,
    getSpectatorView,
    getValidActions,
    getDefaultAction,
    getCurrentPlayer: currentPlayerId,
    getPendingPlayers,
    getTimeoutMs: (state) =>
      state.phase === 'CHOOSING'
        ? state.chooseTimeoutMs
        : state.phase === 'PLAYING'
          ? state.turnTimeoutMs
          : null,
    isFinished: (state) => state.phase === 'FINISHED',
    getResult,
  };
}

export const mexicana = createMexicanaModule();
