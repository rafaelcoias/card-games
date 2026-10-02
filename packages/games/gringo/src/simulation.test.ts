import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, type PlayerId, type Rng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from './engine';
import { gringo } from './module';
import { CARDS_PER_DECK, points } from './rules';
import { config } from './test-utils';
import type { GringoAction, GringoClientAction, GringoEvent, GringoState } from './types';

const GAMES = Number(process.env.GRINGO_SIMULATIONS ?? 10_000);
const MAX_ACTIONS = 5_000;

interface Temper {
  /** Remembers their own cards perfectly (else plays at random). */
  memory: boolean;
  /** Chance, per discard, that somebody tries a snap. */
  snap: number;
}

const value = (state: GringoState, card: { rank: string; suit: string | null } | null) =>
  card ? points(card as never, state.config.redKingValue) : 0;

/** A turn's decision: perfect memory keeps low cards and uses powers; otherwise anything valid. */
function decide(state: GringoState, playerId: PlayerId, temper: Temper, rng: Rng): GringoAction {
  const actions = gringo.getValidActions(state, playerId);
  if (!temper.memory || rng.nextInt(10) === 0) return pickOne(actions, rng);
  const grid = state.grids[playerId]!.filter((s) => s.card);
  const worst = grid.reduce((a, b) => (value(state, a.card) >= value(state, b.card) ? a : b), grid[0]!);
  if (state.phase === 'TURN_DRAW') {
    return actions.find((a) => a.type === 'CALL_GRINGO' && rng.nextInt(3) === 0) ?? actions[0]!;
  }
  if (state.phase === 'TURN_DECIDE') {
    if (value(state, state.drawn) < value(state, worst.card))
      return { type: 'SWAP_DRAWN', index: worst.index };
    return (
      actions.find((a) => a.type === 'DISCARD_DRAWN' && a.usePower) ??
      actions.find((a) => a.type === 'DISCARD_DRAWN')!
    );
  }
  return pickOne(actions, rng);
}

/** Who snaps the open discard, and which slot: a remembered match, or a blind guess. */
function snapper(state: GringoState, temper: Temper, rng: Rng): [PlayerId, GringoClientAction] | null {
  const window = state.snap;
  if (!window || window.result || rng.nextInt(1000) >= temper.snap * 1000) return null;
  const top = state.discard.at(-1)!;
  const candidates = state.seats.filter((id) => gringo.getValidActions(state, id).length > 0);
  if (candidates.length === 0) return null;
  const playerId = pickOne(candidates, rng);
  const filled = state.grids[playerId]!.filter((s) => s.card);
  const match = temper.memory ? filled.find((s) => s.card!.rank === top.rank) : undefined;
  const slot = match ?? pickOne(filled, rng);
  return [playerId, { type: 'SNAP', discardId: window.discardId, index: slot.index }];
}

interface Audit {
  maxIndex: Map<PlayerId, number[]>;
  snaps: Map<number, number>;
}

function assertInvariants(
  state: GringoState,
  events: readonly GringoEvent[],
  audit: Audit,
  game: string,
): void {
  const cards = [
    ...state.seats.flatMap((id) => state.grids[id]!.flatMap((s) => (s.card ? [s.card] : []))),
    ...state.deck,
    ...state.discard,
    ...(state.drawn ? [state.drawn] : []),
  ];
  if (cards.length !== CARDS_PER_DECK * state.decks) throw new Error(`${game}: conservation broken`);
  if (new Set(cards.map((c) => c.uid)).size !== cards.length) throw new Error(`${game}: duplicated card`);

  for (const id of state.seats) {
    const indexes = state.grids[id]!.map((s) => s.index);
    const before = audit.maxIndex.get(id) ?? [];
    // Every index ever used is still there, in place; new ones only come after them.
    if (before.some((index, i) => indexes[i] !== index)) throw new Error(`${game}: ${id} grid renumbered`);
    if (indexes.some((index, i) => i > 0 && index <= indexes[i - 1]!))
      throw new Error(`${game}: indexes not increasing`);
    audit.maxIndex.set(id, indexes);
  }
  for (const event of events) {
    if (event.type === 'SnapSucceeded' || event.type === 'SnapFailed') {
      const count = (audit.snaps.get(event.discardId) ?? 0) + 1;
      if (count > 1) throw new Error(`${game}: two snaps on discard ${event.discardId}`);
      audit.snaps.set(event.discardId, count);
    }
  }
  if ((state.phase === 'TURN_DECIDE') !== (state.drawn !== null))
    throw new Error(`${game}: drawn card out of step`);
  if (state.phase === 'TURN_DRAW') {
    const current = state.seats[state.currentIndex]!;
    const holds = state.grids[current]!.some((s) => s.card);
    if (!holds && !gringo.getValidActions(state, current).some((a) => a.type === 'CALL_GRINGO'))
      throw new Error(`${game}: ${current} on turn without cards nor "Gringo"`);
    if (state.deck.length === 0) throw new Error(`${game}: a turn with an empty deck`);
  }
}

function simulate(seed: string): { actions: number; players: number } {
  const rng = createSeededRng(seed);
  const count = 2 + rng.nextInt(9);
  const players = Array.from({ length: count }, (_, i) => `bot${i}`);
  const temper: Temper = { memory: rng.nextInt(2) === 0, snap: rng.nextInt(80) / 100 };
  const cfg = config({
    gringoEnabled: rng.nextInt(2) === 0,
    gringoMinTurns: 1 + rng.nextInt(6),
    powerSet: rng.nextInt(2) === 0 ? 'FIGURAS' : 'SETE_A_DEZ',
    redKingValue: rng.nextInt(2) === 0 ? -3 : -1,
    decks: pickOne(['AUTO', 1, 2] as const, rng),
  });
  let state = gringo.setup(players, cfg, rng);
  const audit: Audit = { maxIndex: new Map(), snaps: new Map() };
  assertInvariants(state, [], audit, seed);
  let actions = 0;

  while (!gringo.isFinished(state)) {
    if (++actions > MAX_ACTIONS) throw new Error(`Game ${seed} lasted more than ${MAX_ACTIONS} actions`);
    const pending = gringo.getPendingPlayers(state);
    const scheduled = scheduleFor(state)[0]?.action as GringoAction | undefined;
    let actor: PlayerId = SYSTEM_PLAYER_ID;
    let action: GringoAction | null = null;
    const snap = snapper(state, temper, rng);
    if (snap) [actor, action] = snap;
    else if (state.phase === 'INITIAL_PEEK') {
      if (rng.nextInt(8) === 0) action = { type: 'SYS_INITIAL_PEEK_END' };
      else [actor, action] = [pickOne(pending, rng), { type: 'PEEK_DONE' }];
    } else if (pending.length === 1) {
      actor = pending[0]!;
      // Now and then the clock runs out, through either path the server may use.
      const roll = rng.nextInt(30);
      if (roll === 0) [actor, action] = [SYSTEM_PLAYER_ID, gringo.getTimeoutAction!(state)];
      else if (roll === 1) action = gringo.getDefaultAction(state, actor);
      else action = decide(state, actor, temper, rng);
    } else if (scheduled && pending.length === 0) action = scheduled;
    if (!action) throw new Error(`Game ${seed} stalled in ${state.phase}`);
    const result = gringo.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`Game ${seed}: ${action.type} rejected (${result.error.code})`);
    state = result.state;
    assertInvariants(state, result.events, audit, seed);
  }
  return { actions, players: count };
}

const CHUNK = 500;
const chunks = Array.from({ length: Math.ceil(GAMES / CHUNK) }, (_, i) => i * CHUNK);
const lengths = new Map<number, number[]>();

describe(`simulation of ${GAMES} random games`, () => {
  it.each(chunks)('games %i+ keep every invariant and always end', async (first) => {
    for (let i = first; i < Math.min(first + CHUNK, GAMES); i++) {
      const { actions, players } = simulate(`game-${i}`);
      lengths.set(players, [...(lengths.get(players) ?? []), actions]);
      if (i % 50 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
  });

  it('reports how long games last by table size', () => {
    const rows = [...lengths.entries()].sort(([a], [b]) => a - b);
    // Reported on purpose (07 §10): average duration by number of players.
    console.warn(
      `Gringo: ${rows.map(([n, list]) => `${n}p ${(list.reduce((a, b) => a + b, 0) / list.length).toFixed(0)}`).join(' · ')} actions on average`,
    );
    expect(Math.max(...rows.flatMap(([, list]) => list))).toBeLessThan(MAX_ACTIONS);
  });
});
