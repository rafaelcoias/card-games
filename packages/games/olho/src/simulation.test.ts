/**
 * 07 §11: 10 000 games by random bots, 3 to 8 at the table, with every rule
 * option drawn at random. Escapes, passes and timeouts happen at random, and
 * in some sessions players get up and sit down mid-game. Every step keeps the
 * invariants; every game ends with all its roles handed out.
 */
import {
  JOKER,
  SYSTEM_PLAYER_ID,
  createSeededRng,
  pickOne,
  type Card,
  shuffle,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from './engine';
import { olho } from './module';
import { MIN_PLAYERS, SEAT_COUNT, isPower } from './rules';
import { canAct, handOf } from './state';
import { config } from './test-utils';
import type { OlhoAction, OlhoState } from './types';

const GAMES = Number(process.env.OLHO_SIMULATIONS ?? 10_000);
const GAMES_PER_SESSION = 2;
const MAX_ACTIONS_PER_GAME = 5_000;

function assertInvariants(state: OlhoState, label: string): void {
  const all = [
    ...Object.values(state.hands).flat(),
    ...state.trick.plays.flatMap((p) => p.cards),
    ...state.discard,
  ].map((c) => c.id);
  if (all.length !== 54) throw new Error(`${label}: ${all.length} cards instead of 54`);
  if (new Set(all).size !== 54) throw new Error(`${label}: a card is duplicated`);

  if (state.phase === 'PLAYING' && !state.trick.closing) {
    const current = state.currentPlayerId;
    if (!current) throw new Error(`${label}: nobody on turn`);
    if (handOf(state, current).length === 0) throw new Error(`${label}: ${current} on turn without cards`);
    if (state.trick.passed.includes(current)) throw new Error(`${label}: ${current} passed and is on turn`);
    if (!canAct(state, current)) throw new Error(`${label}: ${current} cannot act and is on turn`);
  }
  if (state.trick.isFirstOfGame && state.config.firstTrickNoPower) {
    for (const play of state.trick.plays) {
      if (play.cards.some((c) => c.rank === '2' || c.rank === JOKER))
        throw new Error(`${label}: a 2 or a joker in the first trick`);
    }
  }
  for (const id of state.finishOrder) {
    if (handOf(state, id).length > 0) throw new Error(`${label}: ${id} finished with cards`);
  }
  if (new Set(state.seats).size !== state.seats.length) throw new Error(`${label}: duplicated seat`);
}

/** A random legal decision: any play listed, any cards to give back, escape or not. */
function botAction(state: OlhoState, playerId: PlayerId, rng: Rng): OlhoAction | null {
  const actions = olho.getValidActions(state, playerId);
  if (actions.length === 0) return null;
  const action = pickOne(actions, rng);
  if (action.type === 'RETURN_CARDS') {
    const hand = shuffle(handOf(state, playerId), rng);
    return { type: 'RETURN_CARDS', cardIds: hand.slice(0, action.cardIds.length).map((c) => c.id) };
  }
  if (action.type === 'PLAY') {
    // Any cards of the rank will do, not just the lowest suits listed.
    const rank = state.hands[playerId]!.find((c) => c.id === action.cardIds[0])!.rank;
    const same = shuffle(
      handOf(state, playerId).filter((c) => c.rank === rank),
      rng,
    );
    return { type: 'PLAY', cardIds: same.slice(0, action.cardIds.length).map((c) => c.id) };
  }
  return action;
}

interface Outcome {
  games: number;
  actions: number[];
}

function simulate(seed: string): Outcome {
  const rng = createSeededRng(seed);
  const count = 3 + rng.nextInt(6);
  const players = Array.from({ length: count }, (_, i) => `bot${i}`);
  const cfg = config({
    allowFinishWithPower: rng.nextInt(3) > 0,
    fourOfAKindCuts: rng.nextInt(3) > 0,
    sameCardEscape: rng.nextInt(3) > 0,
    firstTrickNoPower: rng.nextInt(3) > 0,
  });
  const churn = rng.nextInt(4) === 0;
  let state = olho.setup(players, cfg, rng);
  let joiners = 0;
  let actionsThisGame = 0;
  const outcome: Outcome = { games: 0, actions: [] };
  assertInvariants(state, seed);

  const apply = (action: OlhoAction, actor: PlayerId) => {
    const result = olho.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${seed}: ${action.type} by ${actor} rejected (${result.error.code})`);
    const before = state.gamesCompleted;
    state = result.state;
    assertInvariants(state, `${seed}@${state.gameNumber}`);
    // With the option off, no hand ever ends on a 2 or a joker.
    let lastPlay: readonly Card[] = [];
    for (const event of result.events) {
      if (event.type === 'Played' || event.type === 'Escaped') lastPlay = event.cards;
      if (
        event.type === 'PlayerFinished' &&
        !cfg.allowFinishWithPower &&
        lastPlay.some((c) => isPower(c.rank))
      )
        throw new Error(`${seed}: ${event.playerId} finished with a 2 or a joker`);
    }
    if (state.gamesCompleted > before) {
      const last = state.lastGame!;
      if (
        last.order.length !== Object.keys(last.roles).length ||
        new Set(last.order).size !== last.order.length
      )
        throw new Error(`${seed}: roles missing`);
      if (last.order.length < MIN_PLAYERS) throw new Error(`${seed}: a game of ${last.order.length}`);
      outcome.games += 1;
      outcome.actions.push(actionsThisGame);
      actionsThisGame = 0;
    }
  };

  while (state.gamesCompleted < GAMES_PER_SESSION) {
    if (++actionsThisGame > MAX_ACTIONS_PER_GAME) throw new Error(`${seed}: a game never ended`);
    const seated = olho.getSeatedPlayers!(state);

    // Some sessions see people come and go, mid-game too.
    if (churn && rng.nextInt(60) === 0) {
      if (rng.nextInt(2) === 0 && seated.length > 1) {
        apply({ type: 'SYS_PLAYER_LEFT', playerId: pickOne(seated, rng) }, SYSTEM_PLAYER_ID);
        continue;
      }
      const taken = new Set(state.roster.filter((p) => p.seated).map((p) => p.seatIndex));
      const free = Array.from({ length: SEAT_COUNT }, (_, i) => i).filter((i) => !taken.has(i));
      if (free.length > 0 && seated.length < 8) {
        apply(
          { type: 'SYS_PLAYER_JOINED', playerId: `late${joiners++}`, seatIndex: pickOne(free, rng) },
          SYSTEM_PLAYER_ID,
        );
        continue;
      }
    }

    const pending = olho.getPendingPlayers(state);
    if (pending.length > 0) {
      const roll = rng.nextInt(30);
      const closing = olho.getTimeoutAction!(state);
      if (roll === 0 && closing) {
        apply(closing, SYSTEM_PLAYER_ID);
      } else if (roll === 1 && !closing) {
        apply({ type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID);
      } else {
        const actor = pickOne(pending, rng);
        const action = roll === 2 ? olho.getDefaultAction(state, actor) : botAction(state, actor, rng);
        if (!action) throw new Error(`${seed}: no action for ${actor}`);
        apply(action, actor);
      }
      continue;
    }
    const scheduled = scheduleFor(state)[0]?.action as OlhoAction | undefined;
    if (scheduled) {
      apply(scheduled, SYSTEM_PLAYER_ID);
      continue;
    }
    if (state.phase === 'WAITING') {
      const taken = new Set(state.roster.filter((p) => p.seated).map((p) => p.seatIndex));
      const seat = Array.from({ length: SEAT_COUNT }, (_, i) => i).find((i) => !taken.has(i));
      apply({ type: 'SYS_PLAYER_JOINED', playerId: `late${joiners++}`, seatIndex: seat! }, SYSTEM_PLAYER_ID);
      continue;
    }
    throw new Error(`${seed}: stalled in ${state.phase}`);
  }

  apply({ type: 'SYS_END_SESSION' }, SYSTEM_PLAYER_ID);
  const { standings } = olho.getResult(state);
  const scores = standings.map((s) => s.score ?? 0);
  if (scores.join() !== [...scores].sort((a, b) => b - a).join()) throw new Error(`${seed}: unsorted result`);
  if (scores.reduce((a, b) => a + b, 0) !== 0) throw new Error(`${seed}: points do not add up to zero`);
  return outcome;
}

const SESSIONS = Math.ceil(GAMES / GAMES_PER_SESSION);
const CHUNK = 250;
const chunks = Array.from({ length: Math.ceil(SESSIONS / CHUNK) }, (_, i) => i * CHUNK);
const lengths: number[] = [];

describe(`simulation of ${GAMES} random games`, () => {
  it.each(chunks)('sessions %i+ keep every invariant and every game ends with its roles', async (first) => {
    for (let i = first; i < Math.min(first + CHUNK, SESSIONS); i++) {
      const { games, actions } = simulate(`olho-${i}`);
      expect(games).toBe(GAMES_PER_SESSION);
      lengths.push(...actions);
      if (i % 25 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
  });

  it('reports how long games last', () => {
    const max = Math.max(...lengths);
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // Reported on purpose (07 §11): how long random games last.
    console.warn(`Olho: ${lengths.length} games, actions max ${max}, mean ${mean.toFixed(1)}`);
    expect(lengths.length).toBeGreaterThanOrEqual(GAMES);
    expect(max).toBeLessThan(MAX_ACTIONS_PER_GAME);
  });
});
