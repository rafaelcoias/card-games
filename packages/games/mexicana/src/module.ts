import type { GameModule, GameResult, PlayerId } from '@cardroom/game-core';
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

const cardIdSchema = z.string().regex(/^(?:(?:10|[2-9JQKA])[SHDC]|JK[12])$/, 'Invalid card id');

/** Actions accepted from clients. `TIMEOUT_PICK_UP` is deliberately absent. */
export const mexicanaActionSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('CHOOSE_FACE_UP'),
    cardIds: z.tuple([cardIdSchema, cardIdSchema, cardIdSchema]),
  }),
  z.strictObject({ type: z.literal('PLAY_CARDS'), cardIds: z.array(cardIdSchema).min(1).max(8) }),
  z.strictObject({ type: z.literal('PLAY_FACE_DOWN'), position: z.number().int().min(0).max(2) }),
  z.strictObject({ type: z.literal('PICK_UP_PILE') }),
]);

function getResult(state: MexicanaState): GameResult {
  const rankings = state.turnOrder
    .map((playerId) => ({ playerId, position: state.players[playerId]?.finishedPosition ?? null }))
    .filter((r): r is { playerId: PlayerId; position: number } => r.position !== null)
    .sort((a, b) => a.position - b.position);
  return { rankings };
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
    configSchema: mexicanaConfigSchema,
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
