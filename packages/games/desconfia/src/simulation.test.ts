import {
  JOKER,
  STANDARD_RANKS,
  SYSTEM_PLAYER_ID,
  createSeededRng,
  pickOne,
  shuffle,
  type PlayerId,
  type Rng,
  type StandardRank,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { desconfia } from './module';
import { config } from './test-utils';
import type { DesconfiaAction, DesconfiaState } from './types';

const GAMES = Number(process.env.DESCONFIA_SIMULATIONS ?? 10_000);
const MAX_ACTIONS = 20_000;

interface Temper {
  /** Chance of lying when the truth is possible. */
  lie: number;
  /** Chance, per opportunity, that someone doubts the open play. */
  doubt: number;
}

/** A play by a simple bot: the truth when it can (unless it feels like lying), else a lie. */
function botPlay(state: DesconfiaState, playerId: PlayerId, temper: Temper, rng: Rng): DesconfiaAction {
  const hand = state.hands[playerId]!;
  const byRank = (rank: StandardRank) => hand.filter((c) => c.rank === rank || c.rank === JOKER);
  const naturals = hand.filter((c) => c.rank !== JOKER).map((c) => c.rank as StandardRank);
  const claimRank: StandardRank =
    state.claimRank ?? (naturals.length > 0 ? pickOne(naturals, rng) : pickOne(STANDARD_RANKS, rng));
  const truth = byRank(claimRank);
  if (truth.length > 0 && rng.nextInt(1000) >= temper.lie * 1000) {
    return {
      type: 'PLAY',
      cardIds: truth.slice(0, 1 + rng.nextInt(truth.length)).map((c) => c.id),
      claimRank,
    };
  }
  const count = 1 + rng.nextInt(Math.min(3, hand.length));
  return {
    type: 'PLAY',
    cardIds: shuffle(hand, rng)
      .slice(0, count)
      .map((c) => c.id),
    claimRank,
  };
}

function assertInvariants(state: DesconfiaState, game: string): void {
  const inHands = state.seats.reduce((sum, id) => sum + state.hands[id]!.length, 0);
  const onPile = state.pile.reduce((sum, p) => sum + p.cards.length, 0);
  if (inHands + onPile + 4 * state.removed.length !== 54) throw new Error(`${game}: conservation broken`);
  const all = [...state.seats.flatMap((id) => state.hands[id]!), ...state.pile.flatMap((p) => p.cards)].map(
    (c) => c.id,
  );
  if (new Set(all).size !== all.length) throw new Error(`${game}: duplicated card`);
  for (const id of state.seats) {
    for (const rank of STANDARD_RANKS) {
      if (state.hands[id]!.filter((c) => c.rank === rank).length >= 4)
        throw new Error(`${game}: ${id} holds four ${rank}`);
    }
  }
  if ((state.claimRank === null) !== (state.pile.length === 0))
    throw new Error(`${game}: claim rank out of step`);
  if (new Set(state.removed.map((r) => r.rank)).size !== state.removed.length)
    throw new Error(`${game}: rank removed twice`);
  for (const id of state.finishedOrder) {
    if (state.hands[id]!.length > 0) throw new Error(`${game}: ${id} finished with cards`);
  }
  if (state.phase === 'PLAYING' && !state.doubtWindow?.lastCard) {
    const current = state.seats[state.currentIndex] as PlayerId;
    if (state.finishedOrder.includes(current)) throw new Error(`${game}: a finished player is on turn`);
    if (state.hands[current]!.length === 0) throw new Error(`${game}: ${current} on turn without cards`);
  }
  if (state.phase === 'FINISHED' && state.finishedOrder.length === 0)
    throw new Error(`${game}: finished without a winner`);
}

function simulate(seed: string): { actions: number; state: DesconfiaState } {
  const rng = createSeededRng(seed);
  const count = 3 + rng.nextInt(6);
  const players = Array.from({ length: count }, (_, i) => `bot${i}`);
  const temper: Temper = { lie: rng.nextInt(60) / 100, doubt: (5 + rng.nextInt(40)) / 100 };
  let state = desconfia.setup(players, config({ playUntilEnd: rng.nextInt(4) === 0 }), rng);
  let scheduled: DesconfiaAction | null = null;
  let actions = 0;
  assertInvariants(state, seed);

  while (!desconfia.isFinished(state)) {
    if (++actions > MAX_ACTIONS) throw new Error(`Game ${seed} lasted more than ${MAX_ACTIONS} actions`);
    const doubters = state.seats.filter((id) =>
      desconfia.getValidActions(state, id).some((a) => a.type === 'DOUBT'),
    );
    const pending = desconfia.getPendingPlayers(state);
    let actor: PlayerId;
    let action: DesconfiaAction | null;
    if (doubters.length > 0 && rng.nextInt(1000) < temper.doubt * 1000) {
      actor = pickOne(doubters, rng);
      action = { type: 'DOUBT', playId: state.doubtWindow!.playId };
    } else if (pending.length === 1) {
      actor = pending[0] as PlayerId;
      // Occasionally let the clock run out, through either path the server may use.
      const roll = rng.nextInt(40);
      if (roll === 0) [actor, action] = [SYSTEM_PLAYER_ID, { type: 'SYS_TIMEOUT' }];
      else if (roll === 1) action = desconfia.getDefaultAction(state, actor);
      else action = botPlay(state, actor, temper, rng);
    } else {
      // Nobody owes a play: the server applies what the engine scheduled.
      if (pending.length > 1 || !scheduled) throw new Error(`Game ${seed} stalled`);
      [actor, action] = [SYSTEM_PLAYER_ID, scheduled];
    }
    if (!action) throw new Error(`Game ${seed}: no action for ${actor}`);
    const result = desconfia.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`Game ${seed}: ${action.type} rejected (${result.error.code})`);
    state = result.state;
    scheduled = (result.schedule?.[0]?.action as DesconfiaAction | undefined) ?? null;
    assertInvariants(state, seed);
  }
  return { actions, state };
}

const CHUNK = 500;
const chunks = Array.from({ length: Math.ceil(GAMES / CHUNK) }, (_, i) => i * CHUNK);
const lengths: number[] = [];

describe(`simulation of ${GAMES} random games`, () => {
  it.each(chunks)('games %i+ keep every invariant and always end', async (first) => {
    for (let i = first; i < Math.min(first + CHUNK, GAMES); i++) {
      const { actions, state } = simulate(`game-${i}`);
      lengths.push(actions);
      if (i % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
      const { standings } = desconfia.getResult(state);
      expect(standings[0]).toMatchObject({ outcome: 'WINNER', position: 1, score: 0 });
      expect(standings.filter((s) => s.outcome === 'WINNER')).toHaveLength(1);
      expect(standings).toHaveLength(state.seats.length);
    }
  });

  it('reports how long matches last', () => {
    const max = Math.max(...lengths);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // Reported on purpose (07 §10): how long random matches last.
    console.warn(`Desconfia: ${lengths.length} games, actions max ${max}, mean ${mean.toFixed(1)}`);
    expect(max).toBeLessThan(MAX_ACTIONS);
  });
});
