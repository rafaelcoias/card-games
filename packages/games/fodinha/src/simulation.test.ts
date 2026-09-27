import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  pickOne,
  type PlayerId,
  type Rng,
  type ScheduledAction,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { fodinha } from './module';
import { fitsInDeck } from './rules';
import { config } from './test-utils';
import type { FodinhaAction, FodinhaConfig, FodinhaState } from './types';

const GAMES = Number(process.env.FODINHA_SIMULATIONS ?? 10_000);
const MAX_ROUNDS = 200;

/** Random table: 2–10 players and a random legal set of variants. */
function randomTable(rng: Rng): { players: PlayerId[]; cfg: FodinhaConfig } {
  const count = 2 + rng.nextInt(9);
  const hands = [3, 4, 5, 6, 7].filter((size) => fitsInDeck(count, size));
  const cfg = config({
    maxHandSize: pickOne(hands, rng),
    lastBidderRestriction: rng.nextInt(2) === 0,
  });
  return { players: Array.from({ length: count }, (_, i) => `bot${i}`), cfg };
}

/** Cards dealt this round that are either still in a hand or already on the table. */
function assertInvariants(state: FodinhaState, previousPoints: Record<PlayerId, number>): void {
  const n = state.seats.length;
  const inHands = state.seats.flatMap((id) => state.hands[id] ?? []);
  const shownTricks = state.phase === 'TRICK_RESOLVED' ? state.tricksPlayed - 1 : state.tricksPlayed;
  const played = shownTricks * n + state.trick.plays.length;
  if (inHands.length + played !== n * state.handSize) {
    throw new Error(
      `Round ${state.round}: ${inHands.length} in hands + ${played} played ≠ ${n}×${state.handSize}`,
    );
  }
  const onTable = [...inHands, ...state.trick.plays.map((p) => p.card)].map((c) => c.id);
  if (new Set(onTable).size !== onTable.length) throw new Error('Duplicated card');

  const won = state.seats.reduce((sum, id) => sum + (state.tricksWon[id] ?? 0), 0);
  if (won > state.tricksPlayed) throw new Error('More tricks won than played');
  if (state.tricksPlayed > state.handSize) throw new Error('More tricks than cards');

  for (const id of state.seats) {
    if ((state.points[id] ?? 0) < (previousPoints[id] ?? 0)) throw new Error('Points decreased');
  }
  if (state.carry < 0) throw new Error('Negative carry');
  if (state.phase === 'BIDDING' || state.phase === 'PLAYING') {
    const pending = fodinha.getPendingPlayers(state);
    if (pending.length > 1) throw new Error('Several players on the clock');
  }
}

function simulate(seed: string): { rounds: number; state: FodinhaState } {
  const rng = createSeededRng(seed);
  const { players, cfg } = randomTable(rng);
  let state = fodinha.setup(players, cfg, rng);
  let scheduled: readonly ScheduledAction[] = [];

  while (!fodinha.isFinished(state)) {
    if (state.round > MAX_ROUNDS) throw new Error(`Game ${seed} lasted more than ${MAX_ROUNDS} rounds`);
    const pending = fodinha.getPendingPlayers(state);
    let actor: PlayerId;
    let action: FodinhaAction | null;
    if (pending.length > 0) {
      actor = pending[0] as PlayerId;
      // Occasionally let the clock run out, through either path the server may use.
      const roll = rng.nextInt(40);
      if (roll === 0) [actor, action] = [SYSTEM_PLAYER_ID, { type: 'SYS_TIMEOUT' }];
      else if (roll === 1) action = fodinha.getDefaultAction(state, actor);
      else action = pickOne(fodinha.getValidActions(state, actor), rng);
    } else {
      // Nobody owes a decision: the server applies what the engine scheduled.
      if (scheduled.length !== 1) throw new Error(`Game ${seed} stalled in ${state.phase}`);
      [actor, action] = [SYSTEM_PLAYER_ID, (scheduled[0] as ScheduledAction).action as FodinhaAction];
    }
    if (!action) throw new Error(`Game ${seed}: no action for ${actor}`);
    const result = fodinha.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`Game ${seed}: ${action.type} rejected (${result.error.code})`);
    const before = state.points;
    state = result.state;
    scheduled = result.schedule ?? [];
    assertInvariants(state, before);
  }
  return { rounds: state.round, state };
}

const CHUNK = 500;
const chunks = Array.from({ length: Math.ceil(GAMES / CHUNK) }, (_, i) => i * CHUNK);
const lengths: number[] = [];

describe(`simulation of ${GAMES} random games`, () => {
  it.each(chunks)('games %i+ keep every invariant and always end', async (first) => {
    for (let i = first; i < Math.min(first + CHUNK, GAMES); i++) {
      const { rounds, state } = simulate(`game-${i}`);
      lengths.push(rounds);
      if (i % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
      const { standings } = fodinha.getResult(state);
      expect(standings.filter((s) => s.outcome === 'LOSER').length).toBeGreaterThan(0);
      for (const s of standings) {
        expect((s.score ?? 0) >= state.config.maxPoints).toBe(s.outcome === 'LOSER');
      }
    }
  });

  it('reports how long matches last', () => {
    const max = Math.max(...lengths);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // Reported on purpose (07 §9): how long random matches last.
    console.warn(`Fodinha: ${lengths.length} games, rounds max ${max}, mean ${mean.toFixed(1)}`);
    expect(max).toBeLessThan(MAX_ROUNDS);
  });
});
