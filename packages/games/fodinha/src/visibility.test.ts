/**
 * Hidden information must never leave the server (07 §2): every view is
 * serialised exactly as it would travel over the socket and searched for card ids.
 */
import { createSeededRng, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { fodinha } from './module';
import { Table, config } from './test-utils';
import type { FodinhaEvent, FodinhaState } from './types';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte', 'eva'];

const wire = (state: FodinhaState, viewer: PlayerId) => JSON.stringify(fodinha.getPlayerView(state, viewer));
const mentions = (json: string, cardId: string) => json.includes(`"${cardId}"`);
const handIds = (state: FodinhaState, playerId: PlayerId) => (state.hands[playerId] ?? []).map((c) => c.id);

/** Throws on any leak in the current state, for every viewer. */
function assertNoLeaks(state: FodinhaState): void {
  const blind = state.handSize === 1;
  for (const viewer of state.seats) {
    const json = wire(state, viewer);
    const view = fodinha.getPlayerView(state, viewer);
    for (const owner of state.seats) {
      for (const id of handIds(state, owner)) {
        const visible = owner === viewer ? !blind : blind;
        if (mentions(json, id) !== visible) {
          throw new Error(`Round ${state.round}: ${viewer} ${visible ? 'misses' : 'sees'} ${owner}'s ${id}`);
        }
      }
    }
    if (blind && view.me?.hand !== null) throw new Error('Own hand exposed in a blind round');
    if (view.seats.find((s) => s.id === viewer)?.visibleHand !== null)
      throw new Error('Own seat shows cards');
    if (!blind && view.seats.some((s) => s.visibleHand !== null))
      throw new Error('Hands shown outside blind');
  }
}

/** Plays whole rounds with simple bots, checking every intermediate state. */
function playChecked(seed: string, rounds: number, onEvents: (events: readonly FodinhaEvent[]) => void) {
  const t = new Table(fodinha, PLAYERS, { maxHandSize: 5, maxPoints: 15 }, 0);
  t.state = fodinha.setup(PLAYERS, config({ maxHandSize: 5, maxPoints: 15 }), createSeededRng(seed));
  const seenRounds: number[] = [];
  assertNoLeaks(t.state);
  while (t.state.round <= rounds && t.state.phase !== 'FINISHED') {
    if (!seenRounds.includes(t.state.round)) seenRounds.push(t.state.round);
    const current = t.current;
    let events: readonly FodinhaEvent[];
    if (t.state.phase === 'BIDDING')
      events = t.apply({ type: 'PLACE_BID', bid: 0 }, current as PlayerId).events;
    else if (t.state.phase === 'PLAYING' && t.state.handSize === 1) events = t.system('SYS_AUTO_PLAY').events;
    else if (t.state.phase === 'PLAYING') {
      const cardId = handIds(t.state, current as PlayerId)[0] as string;
      events = t.apply({ type: 'PLAY_CARD', cardId }, current as PlayerId).events;
    } else if (t.state.phase === 'TRICK_RESOLVED') events = t.system('SYS_RESOLVE_TRICK_DONE').events;
    else events = t.system('SYS_NEXT_ROUND').events;
    onEvents(events);
    assertNoLeaks(t.state);
  }
  return seenRounds;
}

describe('hidden information (07 §2)', () => {
  it('blind round: my own card is absent from my view, everyone else’s is present', () => {
    const state = fodinha.setup(PLAYERS, config(), createSeededRng('blind'));
    expect(state.handSize).toBe(1);
    for (const viewer of PLAYERS) {
      const view = fodinha.getPlayerView(state, viewer);
      expect(view.blind).toBe(true);
      expect(view.me).toEqual({ id: viewer, hand: null, handCount: 1 });
      const json = wire(state, viewer);
      expect(mentions(json, handIds(state, viewer)[0] as string)).toBe(false);
      for (const other of PLAYERS.filter((p) => p !== viewer)) {
        expect(mentions(json, handIds(state, other)[0] as string)).toBe(true);
      }
    }
  });

  it('normal rounds: no card of another player’s hand appears in my view', () => {
    const t = new Table(fodinha, PLAYERS, { maxHandSize: 5 }, 0);
    while (t.state.phase === 'BIDDING') t.apply({ type: 'PLACE_BID', bid: 0 }, t.current as PlayerId);
    t.blindTrick().nextRound();
    expect(t.state.handSize).toBe(2);
    for (const viewer of PLAYERS) {
      const json = wire(t.state, viewer);
      for (const other of PLAYERS) {
        for (const id of handIds(t.state, other)) expect(mentions(json, id)).toBe(other === viewer);
      }
    }
  });

  it('every state of 12 rounds (incl. the blind round 9) leaks nothing; events never carry dealt cards', () => {
    const dealtEvents: FodinhaEvent[] = [];
    const rounds = playChecked('long', 12, (events) => {
      for (const e of events) if (e.type === 'CardsDealt' || e.type === 'RoundStarted') dealtEvents.push(e);
    });
    expect(rounds).toContain(9);
    expect(dealtEvents.length).toBeGreaterThan(0);
    for (const event of dealtEvents) {
      expect(JSON.stringify(event)).not.toMatch(/"(?:10|[2-9JQKA])[SHDC]"/);
      if (event.type === 'CardsDealt') expect(Object.values(event.counts).every(Number.isInteger)).toBe(true);
    }
  });

  it('round 9 is blind like round 1', () => {
    const t = new Table(fodinha, ['a', 'b'], { maxHandSize: 5, maxPoints: 15 }, 0);
    for (let round = 1; round < 9; round++) {
      while (t.state.phase === 'BIDDING') t.apply({ type: 'PLACE_BID', bid: 0 }, t.current as PlayerId);
      while (t.state.phase === 'PLAYING' || t.state.phase === 'TRICK_RESOLVED') {
        if (t.state.phase === 'TRICK_RESOLVED') t.system('SYS_RESOLVE_TRICK_DONE');
        else if (t.state.handSize === 1) t.system('SYS_AUTO_PLAY');
        else {
          const id = t.current as PlayerId;
          t.apply({ type: 'PLAY_CARD', cardId: handIds(t.state, id)[0] as string }, id);
        }
      }
      if (t.state.phase === 'FINISHED') return; // (cannot happen with maxPoints 15 in 8 rounds of 2 players)
      t.nextRound();
    }
    expect(t.state.round).toBe(9);
    const view = fodinha.getPlayerView(t.state, 'a');
    expect(view.blind).toBe(true);
    expect(view.me?.hand).toBeNull();
    expect(view.seats.find((s) => s.id === 'b')?.visibleHand).toHaveLength(1);
  });
});
