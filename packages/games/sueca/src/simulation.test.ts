/**
 * 07 §12: random legal bots play 100,000 hands (`SUECA_SIMULATION_HANDS`
 * shortens it). At every step: 40 cards, no card twice; every card played was
 * legal (and every illegal one is refused); 10 tricks and 120 points a hand;
 * matches end. Bots also look at the last trick, let the clock run out and
 * drop out and come back, so pauses land in every phase.
 */
import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  pickOne,
  type PlayerId,
  type Rng,
  type ScheduledAction,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { sueca } from './module';
import { PLAY_ORDER, TOTAL_POINTS, TRICKS_PER_HAND, legalCards, sumPoints } from './rules';
import { currentSeat } from './state';
import { config } from './test-utils';
import type { SuecaAction, SuecaState } from './types';

const HANDS = Number(process.env.SUECA_SIMULATION_HANDS ?? 100_000);
const PLAYERS = ['p0', 'p1', 'p2', 'p3'];
/** Far more than any match needs (a match to 10 games takes at most 10 hands that score). */
const MAX_HANDS_PER_MATCH = 200;

function assertInvariants(state: SuecaState): void {
  const inHands = PLAY_ORDER.flatMap((seat) => state.hands[seat]);
  const cards = [
    ...inHands,
    ...state.trick.plays.map((p) => p.card),
    ...state.wonCards.A,
    ...state.wonCards.B,
  ];
  const phase = state.phase === 'PAUSED' ? state.pausedFrom : state.phase;
  const dealt = phase !== 'CUT';
  if (cards.length !== (dealt ? 40 : 0)) throw new Error(`${cards.length} cards in ${state.phase}`);
  if (new Set(cards.map((c) => c.uid)).size !== cards.length) throw new Error('A card is in two places');
  const tricks = state.tricksWon.A + state.tricksWon.B;
  if (state.wonCards.A.length + state.wonCards.B.length !== tricks * 4)
    throw new Error('Tricks and cards differ');
  if (tricks > TRICKS_PER_HAND) throw new Error('More than 10 tricks');
  if (dealt && phase !== 'HAND_SUMMARY' && state.phase !== 'FINISHED') {
    // Everyone holds as many cards as tricks are left (minus what is on the table).
    for (const seat of PLAY_ORDER) {
      const played = state.trick.plays.some((p) => p.seat === seat) ? 1 : 0;
      if (state.hands[seat].length + played !== TRICKS_PER_HAND - tricks)
        throw new Error(`${seat} has a wrong hand`);
    }
  }
  if (state.phase === 'PLAYING' && state.trick.plays.length >= 4) throw new Error('A full trick still open');
  if (state.trumpCard && !state.trumpCardPlayed && !state.hands[state.dealer].includes(state.trumpCard)) {
    throw new Error('The trump card left the dealer without being played');
  }
  for (const hand of state.history) {
    if (hand.points.A + hand.points.B !== TOTAL_POINTS) throw new Error('A hand is not worth 120');
    if (hand.tricks.A + hand.tricks.B !== TRICKS_PER_HAND) throw new Error('A hand without 10 tricks');
  }
  if (state.phase === 'HAND_SUMMARY' && sumPoints(state.wonCards.A) + sumPoints(state.wonCards.B) !== 120) {
    throw new Error('Points lost');
  }
}

/** A card that is not legal now, if the player on turn holds one. */
function illegalCard(state: SuecaState): string | null {
  const seat = currentSeat(state);
  if (state.phase !== 'PLAYING' || !seat) return null;
  const legal = new Set(legalCards(state.hands[seat], state.trick.plays));
  return state.hands[seat].find((c) => !legal.has(c))?.uid ?? null;
}

interface MatchStats {
  hands: number;
  actions: number;
}

function simulate(seed: string): MatchStats {
  const rng: Rng = createSeededRng(seed);
  let state = sueca.setup(PLAYERS, config({ targetGames: 1 + rng.nextInt(10) }), rng);
  let schedule: readonly ScheduledAction[] = [];
  let actions = 0;
  const away = new Set<PlayerId>();

  const apply = (action: SuecaAction, actor: PlayerId) => {
    const before = state;
    const result = sueca.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${seed}: ${action.type} by ${actor} refused (${result.error.code})`);
    if (action.type === 'PLAY') {
      const seat = currentSeat(before);
      const hand = seat ? before.hands[seat] : [];
      const legal = legalCards(hand, before.trick.plays).map((c) => c.uid);
      if (!legal.includes(action.cardUid)) throw new Error(`${seed}: an illegal card was played`);
    }
    state = result.state;
    schedule = result.schedule ?? [];
    actions += 1;
    assertInvariants(state);
  };

  while (!sueca.isFinished(state)) {
    if (state.history.length > MAX_HANDS_PER_MATCH) throw new Error(`${seed} never ends`);
    const roll = rng.nextInt(100);
    // Someone drops, or someone who dropped comes back.
    if (roll < 2 && state.phase !== 'FINISHED') {
      const player = pickOne(PLAYERS, rng);
      if (away.has(player)) {
        away.delete(player);
        apply({ type: 'SYS_RESUME', playerId: player }, SYSTEM_PLAYER_ID);
      } else {
        away.add(player);
        apply({ type: 'SYS_PAUSE', playerId: player }, SYSTEM_PLAYER_ID);
      }
      continue;
    }
    if (state.phase === 'PAUSED') {
      const back = pickOne([...away], rng);
      away.delete(back);
      apply({ type: 'SYS_RESUME', playerId: back }, SYSTEM_PLAYER_ID);
      continue;
    }
    // A tampered client tries an illegal card: refused, nothing changes.
    const illegal = roll < 6 ? illegalCard(state) : null;
    if (illegal) {
      const actor = sueca.getCurrentPlayer(state) as PlayerId;
      const result = sueca.applyAction(state, { type: 'PLAY', cardUid: illegal }, actor);
      if (result.ok || result.error.code !== 'MUST_FOLLOW_SUIT')
        throw new Error(`${seed}: illegal card accepted`);
      continue;
    }
    const looker = pickOne(PLAYERS, rng);
    if (roll < 10 && sueca.getValidActions(state, looker).some((a) => a.type === 'VIEW_LAST_TRICK')) {
      apply({ type: 'VIEW_LAST_TRICK' }, looker);
      continue;
    }
    const pending = sueca.getPendingPlayers(state);
    if (pending.length > 0) {
      const actor = pending[0] as PlayerId;
      // Sometimes the clock runs out, through either path the server may use.
      if (roll < 13) apply(sueca.getTimeoutAction?.(state) as SuecaAction, SYSTEM_PLAYER_ID);
      else if (roll < 15) apply(sueca.getDefaultAction(state, actor) as SuecaAction, actor);
      else {
        const moves = sueca.getValidActions(state, actor).filter((a) => a.type !== 'VIEW_LAST_TRICK');
        apply(pickOne(moves, rng), actor);
      }
      continue;
    }
    // Nobody owes a move: the server applies what the engine scheduled (the first one due).
    const next = [...schedule].sort((a, b) => a.delayMs - b.delayMs)[0];
    if (!next) throw new Error(`${seed} stalled in ${state.phase}`);
    apply(next.action as SuecaAction, SYSTEM_PLAYER_ID);
  }
  const target = state.config.targetGames;
  expect(Math.max(state.games.A, state.games.B)).toBeGreaterThanOrEqual(target);
  expect(Math.min(state.games.A, state.games.B)).toBeLessThan(target);
  expect(sueca.getResult(state).standings).toHaveLength(4);
  return { hands: state.history.length, actions };
}

describe(`simulation of ${HANDS} hands`, () => {
  const stats: MatchStats[] = [];

  it('keeps every invariant and every match ends', async () => {
    let hands = 0;
    for (let i = 0; hands < HANDS; i++) {
      const result = simulate(`sueca-${i}`);
      stats.push(result);
      hands += result.hands;
      if (i % 200 === 0) await new Promise((resolve) => setImmediate(resolve));
    }
    expect(hands).toBeGreaterThanOrEqual(HANDS);
  });

  it('reports how long matches last', () => {
    const hands = stats.map((s) => s.hands);
    const total = hands.reduce((a, b) => a + b, 0);
    // Reported on purpose (07 §12).
    console.warn(
      `Sueca: ${stats.length} matches, ${total} hands, hands per match max ${Math.max(...hands)}, mean ${(total / stats.length).toFixed(1)}`,
    );
    expect(Math.max(...hands)).toBeLessThan(MAX_HANDS_PER_MATCH);
  });
});
