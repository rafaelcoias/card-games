import { createSeededRng, pickOne, type Card, type Rng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { mexicana, mexicanaConfigSchema } from './module';
import { cardCount, occupied } from './state';
import type { MexicanaState } from './types';

const GAMES = Number(process.env.MEXICANA_SIMULATIONS ?? 10_000);
// Random bots pick up the pile a lot (median ≈ 450 actions, long tail ≈ 7k); a real loop never ends.
const MAX_ACTIONS = 50_000;
const config = mexicanaConfigSchema.parse({});

function allCards(state: MexicanaState): Card[] {
  const onTable = Object.values(state.players).flatMap((p) => [
    ...p.hand,
    ...occupied(p.faceUp),
    ...occupied(p.faceDown),
  ]);
  return [...onTable, ...state.drawPile, ...state.discardPile, ...state.burnPile];
}

function assertInvariants(state: MexicanaState): void {
  const cards = allCards(state);
  if (cards.length !== 54) throw new Error(`Card count drifted to ${cards.length}`);
  if (new Set(cards.map((c) => c.id)).size !== 54) throw new Error('Duplicated card');
  if (state.pendingSkips !== 0) throw new Error('Skips leaked between turns');

  const finished = Object.values(state.players).filter((p) => p.finishedPosition !== null);
  const positions = finished.map((p) => p.finishedPosition).sort();
  if (positions.some((pos, i) => pos !== i + 1)) throw new Error('Non-contiguous finishing positions');

  for (const p of Object.values(state.players)) {
    if (p.finishedPosition !== null && cardCount(p) > 0 && state.phase !== 'FINISHED') {
      throw new Error('Finished player still holds cards');
    }
  }
  if (state.phase === 'PLAYING') {
    const current = mexicana.getCurrentPlayer(state);
    if (!current || state.players[current]?.finishedPosition !== null)
      throw new Error('Invalid current player');
    for (const p of Object.values(state.players)) {
      if (p.finishedPosition === null && p.hand.length === 0 && state.drawPile.length > 0) {
        throw new Error('Empty hand while the draw pile has cards');
      }
    }
  }
}

/** Random bot; occasionally lets the timer expire to exercise the default action path. */
function chooseAction(state: MexicanaState, playerId: string, rng: Rng) {
  if (rng.nextInt(50) === 0) return mexicana.getDefaultAction(state, playerId);
  const actions = mexicana.getValidActions(state, playerId);
  return actions.length > 0 ? pickOne(actions, rng) : null;
}

function simulate(seed: string): { actions: number; state: MexicanaState } {
  const rng = createSeededRng(seed);
  const playerCount = 2 + rng.nextInt(5);
  const players = Array.from({ length: playerCount }, (_, i) => `bot${i}`);
  let state = mexicana.setup(players, config, rng);
  let actions = 0;

  while (!mexicana.isFinished(state)) {
    if (++actions > MAX_ACTIONS) throw new Error(`Game ${seed} did not finish within ${MAX_ACTIONS} actions`);
    const pending = mexicana.getPendingPlayers(state);
    if (pending.length === 0) throw new Error(`Game ${seed} stalled with nobody to act`);
    const actor = pickOne(pending, rng);
    const action = chooseAction(state, actor, rng);
    if (!action) throw new Error(`Game ${seed}: pending player ${actor} has no action`);
    const result = mexicana.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`Game ${seed}: valid action rejected (${result.error.code})`);
    state = result.state;
    assertInvariants(state);
  }
  return { actions, state };
}

// Chunked so a single test never monopolises the worker for long.
const CHUNK = 250;
const chunks = Array.from({ length: Math.ceil(GAMES / CHUNK) }, (_, i) => i * CHUNK);

describe(`simulation of ${GAMES} random games`, () => {
  it.each(chunks)('games %i+ always terminate in a valid final state', async (first) => {
    for (let i = first; i < Math.min(first + CHUNK, GAMES); i++) {
      const { state } = simulate(`game-${i}`);
      if (i % 25 === 0) await new Promise((resolve) => setImmediate(resolve));
      const result = mexicana.getResult(state);
      expect(result.standings.map((r) => r.position)).toEqual(state.turnOrder.map((_, idx) => idx + 1));
    }
  });
});
