import {
  SYSTEM_PLAYER_ID,
  STANDARD_RANKS,
  createSeededRng,
  pickOne,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { peixinho } from './module';
import { TOTAL_PEIXINHOS } from './rules';
import { config } from './test-utils';
import type { PeixinhoAction, PeixinhoState, TableMemory } from './types';

const GAMES = Number(process.env.PEIXINHO_SIMULATIONS ?? 10_000);
const MAX_ACTIONS = 5000;

type Bot = 'random' | 'memory';

/** Random table: 2–6 players, random settings. Even games use random bots, odd ones memory bots. */
function randomTable(rng: Rng) {
  const count = 2 + rng.nextInt(5);
  const memory: TableMemory = pickOne(['NONE', 'LAST_5', 'FULL'] as const, rng);
  const cfg = config({ tableMemory: memory, pondPicking: rng.nextInt(2) === 0 });
  return { players: Array.from({ length: count }, (_, i) => `bot${i}`), cfg };
}

/**
 * Memory bot (07 §9): asks whoever was last heard asking for a rank it holds
 * — they must still have one — reading only the history its own view shows.
 */
function memoryChoice(state: PeixinhoState, actor: PlayerId, valid: PeixinhoAction[], rng: Rng) {
  const asks = valid.filter((a): a is Extract<PeixinhoAction, { type: 'ASK' }> => a.type === 'ASK');
  const log = peixinho.getPlayerView(state, actor).askLog;
  for (const entry of [...log].reverse()) {
    const hit = asks.find((a) => a.targetId === entry.askerId && a.rank === entry.rank);
    if (hit) return hit;
  }
  return pickOne(valid, rng);
}

function assertInvariants(state: PeixinhoState, game: string): void {
  const inHands = state.seats.reduce((sum, id) => sum + (state.hands[id]?.length ?? 0), 0);
  const laid = state.seats.reduce((sum, id) => sum + (state.peixinhos[id]?.length ?? 0), 0);
  if (inHands + state.pond.length + 4 * laid !== 52) throw new Error(`${game}: conservation broken`);
  if (state.pondSlots.length !== state.pond.length) throw new Error(`${game}: pond spots out of step`);
  const all = [...state.seats.flatMap((id) => state.hands[id] ?? []), ...state.pond].map((c) => c.id);
  if (new Set(all).size !== all.length) throw new Error(`${game}: duplicated card`);
  const laidRanks = state.seats.flatMap((id) => state.peixinhos[id] ?? []);
  if (new Set(laidRanks).size !== laidRanks.length) throw new Error(`${game}: a rank laid down twice`);
  for (const id of state.seats) {
    const hand = state.hands[id] ?? [];
    for (const rank of STANDARD_RANKS) {
      if (hand.filter((c) => c.rank === rank).length >= 4)
        throw new Error(`${game}: ${id} holds four ${rank}`);
      if (laidRanks.includes(rank) && hand.some((c) => c.rank === rank))
        throw new Error(`${game}: ${rank} both laid and in hand`);
    }
  }
  if (state.phase === 'PLAYING') {
    const current = state.seats[state.currentIndex] as PlayerId;
    if ((state.hands[current]?.length ?? 0) === 0)
      throw new Error(`${game}: ${current} on turn without cards`);
    if (peixinho.getValidActions(state, current).length === 0)
      throw new Error(`${game}: ${current} is stuck`);
    if (laid === TOTAL_PEIXINHOS) throw new Error(`${game}: 13 peixinhos but still playing`);
  } else if (laid !== TOTAL_PEIXINHOS || inHands + state.pond.length !== 0) {
    throw new Error(`${game}: finished with ${laid} peixinhos`);
  }
}

function simulate(seed: string, bot: Bot): { actions: number; state: PeixinhoState } {
  const rng = createSeededRng(seed);
  const { players, cfg } = randomTable(rng);
  let state = peixinho.setup(players, cfg, rng);
  assertInvariants(state, seed);
  let actions = 0;

  while (!peixinho.isFinished(state)) {
    if (++actions > MAX_ACTIONS) throw new Error(`Game ${seed} lasted more than ${MAX_ACTIONS} actions`);
    const pending = peixinho.getPendingPlayers(state);
    if (pending.length !== 1) throw new Error(`Game ${seed}: ${pending.length} players on the clock`);
    let actor = pending[0] as PlayerId;
    let action: PeixinhoAction | null;
    // Occasionally let the clock run out, through either path the server may use.
    const roll = rng.nextInt(30);
    if (roll === 0) [actor, action] = [SYSTEM_PLAYER_ID, { type: 'SYS_TIMEOUT' }];
    else if (roll === 1) action = peixinho.getDefaultAction(state, actor);
    else {
      const valid = peixinho.getValidActions(state, actor);
      action = bot === 'memory' ? memoryChoice(state, actor, valid, rng) : pickOne(valid, rng);
    }
    if (!action) throw new Error(`Game ${seed}: no action for ${actor}`);
    const result = peixinho.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`Game ${seed}: ${action.type} rejected (${result.error.code})`);
    state = result.state;
    assertInvariants(state, seed);
  }
  return { actions, state };
}

const CHUNK = 500;
const chunks = Array.from({ length: Math.ceil(GAMES / CHUNK) }, (_, i) => i * CHUNK);
const lengths: Record<Bot, number[]> = { random: [], memory: [] };

describe(`simulation of ${GAMES} random games`, () => {
  it.each(chunks)('games %i+ keep every invariant and always end', async (first) => {
    for (let i = first; i < Math.min(first + CHUNK, GAMES); i++) {
      const bot: Bot = i % 2 === 0 ? 'random' : 'memory';
      const { actions, state } = simulate(`game-${i}`, bot);
      lengths[bot].push(actions);
      if (i % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
      const { standings } = peixinho.getResult(state);
      expect(standings.reduce((sum, s) => sum + (s.score ?? 0), 0)).toBe(TOTAL_PEIXINHOS);
      const top = Math.max(...standings.map((s) => s.score ?? 0));
      for (const s of standings) expect(s.outcome === 'WINNER').toBe(s.score === top);
      expect(state.winners.length).toBeGreaterThan(0);
    }
  });

  it('reports how long matches last', () => {
    for (const bot of ['random', 'memory'] as const) {
      const list = lengths[bot];
      const max = Math.max(...list);
      const mean = list.reduce((a, b) => a + b, 0) / list.length;
      // Reported on purpose (07 §9): how long matches last, per kind of bot.
      console.warn(
        `Peixinho (${bot} bots): ${list.length} games, actions max ${max}, mean ${mean.toFixed(1)}`,
      );
      expect(max).toBeLessThan(MAX_ACTIONS);
    }
  });
});
