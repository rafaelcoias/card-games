import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, type PlayerId, type Rng } from '@cardroom/game-core';
import { pepeConfigSchema, validatePepeConfig } from './config';
import { applyAction, setup } from './engine';
import { getDefaultAction, getPendingPlayers, getTimeoutAction, getValidActions } from './moves';
import { cardsOf } from './rules';
import { ANA, BRUNO, allCards } from './test-utils';
import type { PepeAction, PepeClientAction, PepeConfig, PepeEvent, PepeState } from './types';
import { getPlayerView } from './view';

/**
 * Simulation harness (kit 07 §10), shared by the `simulation-*.test.ts` files so
 * that Vitest runs them in parallel. `PEPE_SIMULATION_GAMES` shortens the runs
 * (the kit asks for 10 000 games per preset and 10 000 with random rooms).
 */
export const BASE = pepeConfigSchema.parse({});
export const GAMES = Number(process.env.PEPE_SIMULATION_GAMES ?? 10_000);
const MAX_ROUNDS = 200;
const MAX_STEPS = 60_000;

/** Bots: a fast one and a slow one; each tick, each acts with its own probability. */
const SPEED: Record<PlayerId, number> = { [ANA]: 0.9, [BRUNO]: 0.45 };
/** Codes a bot may get back when the other was faster or the phase moved on under it. */
const RACE_CODES = new Set(['TOP_CHANGED', 'WRONG_PHASE', 'GAME_OVER', 'ALREADY_REQUESTED', 'NO_RESERVE']);

/** Plays to the centre when it can (mostly), else groups or moves now and then, else asks to flip. */
function botChoice(state: PepeState, playerId: PlayerId, rng: Rng): PepeClientAction | null {
  const actions = getValidActions(state, playerId);
  if (actions.length === 0) return null;
  const plays = actions.filter((a) => a.type === 'PLAY_TO_CENTRE');
  const moves = actions.filter((a) => a.type === 'GROUP' || a.type === 'MOVE_TO_EMPTY');
  const choose = actions.filter((a) => a.type === 'CHOOSE_PILE');
  if (choose.length > 0) return pickOne(choose, rng);
  if (plays.length > 0 && rng.nextInt(100) < 85) return pickOne(plays, rng);
  if (moves.length > 0 && rng.nextInt(100) < 50) return pickOne(moves, rng);
  if (plays.length > 0) return pickOne(plays, rng);
  return actions.find((a) => a.type === 'REQUEST_FLIP') ?? null;
}

/** Any room the lobby accepts (the one rule set that locks almost every game is refused there). */
export function randomConfig(rng: Rng): PepeConfig {
  const flag = () => rng.nextInt(2) === 1;
  const config = pepeConfigSchema.parse({
    direction: flag() ? 'UP_DOWN' : 'UP_ONLY',
    jokers: flag(),
    aceKingWrap: flag(),
    grouping: flag(),
    moveToEmpty: flag(),
    showCentreCounts: flag(),
    showOwnReserveCount: flag(),
    showOpponentCounts: flag(),
    countdownMs: 1000 * (1 + rng.nextInt(5)),
    autoFlip: flag(),
    autoFlipDelayMs: 1000 * (1 + rng.nextInt(5)),
  });
  return validatePepeConfig(config) ? { ...config, aceKingWrap: true } : config;
}

interface Outcome {
  rounds: number;
  steps: number;
  deadlock: boolean;
  refusals: number;
}

/** Contract §7 and C11: nothing face down, no count the room hides — in any view or event. */
function checkVisibility(state: PepeState, events: readonly PepeEvent[]): void {
  const visible = new Set<string>();
  for (const id of state.players)
    for (const column of state.areas[id]!.columns) {
      const top = column.at(-1);
      if (top) visible.add(top.uid);
    }
  for (const pile of state.centre) if (pile.at(-1)) visible.add(pile.at(-1)!.uid);
  const hidden = allCards(state).filter((c) => !visible.has(c.uid));
  const payloads = [...state.players.map((id) => getPlayerView(state, id)), ...events];
  for (const payload of payloads) {
    const json = JSON.stringify(payload);
    for (const c of hidden) {
      // Events may name a card that was turned over and covered within the same action (none do today).
      if (json.includes(`"${c.uid}"`)) throw new Error(`${c.uid} leaked in ${json.slice(0, 200)}`);
    }
  }
  for (const id of state.players) {
    const view = getPlayerView(state, id);
    if (!state.config.showCentreCounts && view.centre.some((p) => p.count !== null))
      throw new Error('centre count');
    if (
      !state.config.showOpponentCounts &&
      (view.sides[1].totalCount !== null || view.sides[1].reserveCount !== null)
    )
      throw new Error('opponent count');
    if (!state.config.showOwnReserveCount && view.sides[0].reserveCount !== null)
      throw new Error('own reserve');
  }
}

/** Every step: 54 (or 52) cards, none twice. `deep`: also what the views show of the columns. */
function checkInvariants(state: PepeState, deckSize: number, deep: boolean): void {
  const all = allCards(state);
  if (all.length !== deckSize) throw new Error(`${all.length} cards instead of ${deckSize}`);
  if (new Set(all.map((c) => c.uid)).size !== deckSize) throw new Error('duplicate card');
  if (state.phase === 'FINISHED' && !state.deadlock) {
    const winner = state.areas[state.winner!]!;
    if (cardsOf(winner) !== 0) throw new Error('a winner with cards');
  }
  if (!deep) return;
  if (!state.config.jokers && all.some((c) => c.rank === 'JOKER')) throw new Error('joker without jokers');
  for (const id of state.players) {
    const view = getPlayerView(state, id);
    for (const side of view.sides) {
      // Each column shows its top card, or is empty.
      for (const column of side.columns) {
        if (column.top === null && column.hiddenCount > 0) throw new Error('hidden cards without a top');
      }
    }
  }
}

function simulate(seed: string, config: PepeConfig, visibility: boolean): Outcome {
  const rng = createSeededRng(seed);
  let state = setup([ANA, BRUNO], config, createSeededRng(`${seed}:deal`));
  const deckSize = config.jokers ? 54 : 52;
  checkInvariants(state, deckSize, visibility);
  let refusals = 0;
  let steps = 0;

  const apply = (action: PepeAction, actor: PlayerId): boolean => {
    const result = applyAction(state, action, actor);
    steps += 1;
    if (!result.ok) {
      if (!RACE_CODES.has(result.error.code))
        throw new Error(`${actor} ${action.type}: ${result.error.code}`);
      refusals += 1;
      return false;
    }
    state = result.state;
    checkInvariants(state, deckSize, visibility);
    if (visibility) checkVisibility(state, result.events);
    return true;
  };

  while (state.phase !== 'FINISHED') {
    if (steps > MAX_STEPS) throw new Error(`no end after ${MAX_STEPS} steps (round ${state.round})`);
    if (state.round > MAX_ROUNDS) break;
    switch (state.phase) {
      case 'COUNTDOWN':
      case 'ROUND_SETUP':
        apply(
          getTimeoutAction(state) ?? { type: 'SYS_ROUND_SETUP_DONE', round: state.round },
          SYSTEM_PLAYER_ID,
        );
        continue;
      case 'CHOOSING_PILE': {
        // Sometimes the chooser lets the clock run out.
        const chooser = state.roundWinner!;
        const action =
          rng.nextInt(10) === 0 ? getDefaultAction(state, chooser) : botChoice(state, chooser, rng);
        apply(action!, chooser);
        continue;
      }
      case 'PLAYING':
      case 'STALLED': {
        // Both bots look at the same table, then their actions reach the server in a random order.
        const before = state;
        const intents = [ANA, BRUNO]
          .filter((id) => rng.nextInt(100) < SPEED[id]! * 100)
          .map((id) => ({ id, action: botChoice(before, id, rng) }))
          .filter((intent): intent is { id: PlayerId; action: PepeClientAction } => intent.action !== null);
        if (rng.nextInt(2) === 1) intents.reverse();
        for (const { id, action } of intents) apply(action, id);
        if (intents.length === 0 || rng.nextInt(40) === 0) {
          // The clock: a stall (or an unanswered "Virar") runs out now and then.
          const timeout = getTimeoutAction(state);
          const pending = getPendingPlayers(state);
          if (timeout && rng.nextInt(4) === 0) apply(timeout, SYSTEM_PLAYER_ID);
          else if (pending.length > 0 && rng.nextInt(4) === 0) {
            const fallback = getDefaultAction(state, pending[0]!);
            if (fallback) apply(fallback, pending[0]!);
          }
        }
        continue;
      }
    }
  }
  return { rounds: state.round, steps, deadlock: state.deadlock, refusals };
}

export function run(label: string, configFor: (i: number, rng: Rng) => PepeConfig, games: number) {
  const rng = createSeededRng(`configs:${label}`);
  const outcomes: Outcome[] = [];
  for (let i = 0; i < games; i++) {
    outcomes.push(simulate(`${label}:${i}`, configFor(i, rng), i < 200));
  }
  const unfinished = outcomes.filter((o) => o.rounds > MAX_ROUNDS).length;
  const mean = outcomes.reduce((sum, o) => sum + o.rounds, 0) / games;
  const deadlocks = outcomes.filter((o) => o.deadlock).length;
  const races = outcomes.reduce((sum, o) => sum + o.refusals, 0);
  // eslint-disable-next-line no-console -- the kit asks to report the average number of rounds
  console.info(
    `${label}: ${games} games · ${mean.toFixed(2)} rounds on average · ${deadlocks} stalemates · ${races} refused races · ${unfinished} over ${MAX_ROUNDS} rounds`,
  );
  return { unfinished, races, mean };
}
