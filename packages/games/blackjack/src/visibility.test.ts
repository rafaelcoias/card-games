/**
 * Hidden information must never leave the server (01 #2, 09 §6): every view and
 * every event is serialised exactly as it would travel over the socket, and the
 * only card instances allowed in it are cards lying face up on the table.
 */
import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, type PlayerId, type Rng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from './engine';
import { handValue } from './rules';
import { blackjack } from './module';
import { config } from './test-utils';
import type { BlackjackAction, BlackjackConfig, BlackjackEvent, BlackjackState } from './types';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte', 'eva', 'filipa', 'gil'];

const uidsIn = (json: string): string[] => [...json.matchAll(/"uid":"([^"]+)"/g)].map((m) => m[1] as string);

/** Cards anyone at the table can see right now. */
function faceUp(state: BlackjackState): Set<string> {
  const players = state.seats.flatMap((seat) => seat.hands.flatMap((hand) => hand.cards));
  const dealer = state.dealer.cards.filter(
    (_, i) => i !== 1 || state.dealer.holeRevealed || state.config.holeCard === 'EUROPEAN',
  );
  return new Set([...players, ...dealer].map((card) => card.uid));
}

function assertNoLeaks(state: BlackjackState, events: readonly BlackjackEvent[]): void {
  const visible = faceUp(state);
  const hole = state.dealer.cards[1];
  const holeHidden = state.config.holeCard === 'PEEK' && hole !== undefined && !state.dealer.holeRevealed;
  for (const viewer of [...state.seats.map((s) => s.playerId), null]) {
    const view = viewer ? blackjack.getPlayerView(state, viewer) : blackjack.getSpectatorView(state);
    const json = JSON.stringify(view);
    for (const uid of uidsIn(json)) {
      if (!visible.has(uid)) throw new Error(`${viewer ?? 'spectator'} sees ${uid} in ${state.phase}`);
    }
    if (json.includes(state.seed)) throw new Error('Seed leaked');
    if (holeHidden && view.dealer.cards[1] !== null) throw new Error('Hole card shown');
  }
  // Events are broadcast to the whole room: they may only name cards that are face up after them.
  for (const uid of uidsIn(JSON.stringify(events))) {
    if (!visible.has(uid)) throw new Error(`An event names ${uid}`);
  }
  if (holeHidden && JSON.stringify(events).includes(`"${hole.uid}"`))
    throw new Error('Hole card in an event');
}

/** A random but legal player: varied bets, every decision, insurance both ways. */
function chooseAction(state: BlackjackState, playerId: PlayerId, rng: Rng): BlackjackAction | null {
  const actions = blackjack.getValidActions(state, playerId).filter((a) => a.type !== 'SIT_OUT');
  const bet = actions.find((a) => a.type === 'PLACE_BET');
  if (bet) {
    const seat = state.seats.find((s) => s.playerId === playerId)!;
    const top = Math.min(state.config.maxBet, seat.stack);
    const steps = Math.floor((top - state.config.minBet) / 10);
    return { type: 'PLACE_BET', amount: state.config.minBet + 10 * rng.nextInt(steps + 1) };
  }
  return actions.length > 0 ? pickOne(actions, rng) : null;
}

function playChecked(seed: string, cfg: Partial<BlackjackConfig>, rounds: number): number {
  const rng = createSeededRng(seed);
  let state = blackjack.setup(PLAYERS, config(cfg), rng);
  assertNoLeaks(state, []);
  let checked = 0;
  while (state.roundsDealt < rounds || state.phase !== 'BETTING') {
    const pending = blackjack.getPendingPlayers(state);
    let actor: PlayerId = SYSTEM_PLAYER_ID;
    let action: BlackjackAction | null;
    if (pending.length > 0) {
      actor = pickOne(pending, rng);
      action = chooseAction(state, actor, rng);
    } else {
      action = (scheduleFor(state)[0]?.action as BlackjackAction | undefined) ?? null;
    }
    if (!action) throw new Error(`Stalled in ${state.phase}`);
    const result = blackjack.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${actor} ${action.type}: ${result.error.code}`);
    state = result.state;
    assertNoLeaks(state, result.events);
    checked += 1;
  }
  return checked;
}

describe('hidden information (09 §6)', () => {
  it('the hole card is face down until revealed and dealt as a blank', () => {
    const state = blackjack.setup(['a'], config(), createSeededRng('hole'));
    const dealt = blackjack.applyAction(state, { type: 'PLACE_BET', amount: 10 }, 'a');
    if (!dealt.ok) throw new Error(dealt.error.code);
    const hole = dealt.state.dealer.cards[1]!;
    const holeEvent = dealt.events.filter((e) => e.type === 'CardDealt').at(-1);
    expect(holeEvent).toEqual({ type: 'CardDealt', to: { kind: 'DEALER' }, card: null });
    const view = blackjack.getPlayerView(dealt.state, 'a');
    expect(view.dealer.cards[1]).toBeNull();
    expect(view.dealer.total).toBe(handValue([dealt.state.dealer.cards[0]!]).total); // the up card alone
    expect(JSON.stringify(view)).not.toContain(hole.uid);
    expect(view.shoe.remaining).toBe(312 - 4);
  });

  it('seven players, 300 rounds of the American table: no view or event ever leaks a card', () => {
    expect(playChecked('american', {}, 300)).toBeGreaterThan(3000);
  });

  it('the European table and a short, deep shoe leak nothing either', () => {
    expect(
      playChecked('european', { holeCard: 'EUROPEAN', decks: 1, penetration: 0.85 }, 150),
    ).toBeGreaterThan(1500);
  });
});
