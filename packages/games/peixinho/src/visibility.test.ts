/**
 * Hidden information must never leave the server (07 §7): every view is
 * serialised exactly as it would travel over the socket and searched for card
 * ids, and so is every event (they are broadcast to the whole room).
 */
import { createSeededRng, pickOne, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { peixinho } from './module';
import { MEMORY_LAST } from './rules';
import { config } from './test-utils';
import type { PeixinhoEvent, PeixinhoState, TableMemory } from './types';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte'];

const wire = (state: PeixinhoState, viewer: PlayerId | null) =>
  JSON.stringify(viewer === null ? peixinho.getSpectatorView(state) : peixinho.getPlayerView(state, viewer));
const mentions = (json: string, cardId: string) => json.includes(`"${cardId}"`);

/** Throws on any leak in the current state, for every viewer and for spectators. */
function assertNoLeaks(state: PeixinhoState): void {
  const publicFish = state.lastFish?.caughtAsked ? state.lastFish.card.id : null;
  for (const viewer of [...state.seats, null]) {
    const json = wire(state, viewer);
    for (const owner of state.seats) {
      for (const card of state.hands[owner] ?? []) {
        const visible = owner === viewer || card.id === publicFish;
        if (mentions(json, card.id) !== visible) {
          throw new Error(`${viewer ?? 'spectator'} ${visible ? 'misses' : 'sees'} ${owner}'s ${card.id}`);
        }
      }
    }
    for (const card of state.pond) {
      if (mentions(json, card.id)) throw new Error(`${viewer ?? 'spectator'} sees ${card.id} in the pond`);
    }
  }
}

/** A fished card only travels in an event when it is the rank asked; refills carry counts only. */
function assertEventsClean(events: readonly PeixinhoEvent[]): void {
  for (const event of events) {
    if (event.type === 'Fished' && !event.caughtAsked) expect(event.card).toBeNull();
    if (event.type === 'Fished' && event.caughtAsked) expect(event.card?.rank).toBe(event.rank);
    if (event.type === 'Refilled' || event.type === 'PlayerOut' || event.type === 'TurnPassed') {
      expect(JSON.stringify(event)).not.toMatch(/"(?:10|[2-9JQKA])[SHDC]"/);
    }
  }
}

function play(
  seed: string,
  memory: TableMemory,
  onStep: (state: PeixinhoState, events: readonly PeixinhoEvent[]) => void,
) {
  const rng = createSeededRng(seed);
  let state = peixinho.setup(PLAYERS, config({ tableMemory: memory }), rng);
  onStep(state, []);
  while (!peixinho.isFinished(state)) {
    const actor = peixinho.getPendingPlayers(state)[0] as PlayerId;
    const action = pickOne(peixinho.getValidActions(state, actor), rng);
    const result = peixinho.applyAction(state, action, actor);
    if (!result.ok) throw new Error(result.error.code);
    state = result.state;
    onStep(state, result.events);
  }
  return state;
}

describe('hidden information (07 §7)', () => {
  it('no view ever names a card of another hand or of the pond; events stay clean', () => {
    let steps = 0;
    let caught = 0;
    for (const seed of ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']) {
      play(seed, 'FULL', (state, events) => {
        assertNoLeaks(state);
        assertEventsClean(events);
        if (events.some((e) => e.type === 'Fished' && e.caughtAsked)) caught += 1;
        steps += 1;
      });
    }
    expect(steps).toBeGreaterThan(300);
    expect(caught).toBeGreaterThan(0);
  });

  it('a fished card reaches only its fisher, unless it is the rank asked', () => {
    let checked = 0;
    play('fish', 'LAST_5', (state) => {
      const fish = state.lastFish;
      if (!fish) return;
      for (const viewer of state.seats) {
        const seen = peixinho.getPlayerView(state, viewer).lastFish;
        expect(seen?.card?.id ?? null).toBe(
          fish.caughtAsked || viewer === fish.playerId ? fish.card.id : null,
        );
      }
      checked += 1;
    });
    expect(checked).toBeGreaterThan(0);
  });

  it('the ask history follows the table memory setting', () => {
    for (const memory of ['NONE', 'LAST_5', 'FULL'] as const) {
      const state = play(`memory-${memory}`, memory, () => undefined);
      const log = peixinho.getPlayerView(state, 'ana').askLog;
      const expected =
        memory === 'NONE'
          ? 0
          : memory === 'LAST_5'
            ? Math.min(MEMORY_LAST, state.askLog.length)
            : state.askLog.length;
      expect(log).toHaveLength(expected);
      if (memory !== 'NONE') expect(log.at(-1)).toEqual(state.askLog.at(-1));
      expect(peixinho.getPlayerView(state, 'ana').tableMemory).toBe(memory);
    }
  });

  it('spectators see counts only', () => {
    const state = peixinho.setup(PLAYERS, config(), createSeededRng('spectator'));
    const view = peixinho.getSpectatorView(state);
    expect(view.me).toBeNull();
    expect(view.selfId).toBeNull();
    expect(view.seats.map((s) => s.handCount)).toEqual(PLAYERS.map((id) => state.hands[id]?.length));
    expect(view.pondCount).toBe(32);
  });
});
