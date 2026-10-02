/**
 * Hidden information never leaves the server (07 §8): every view is serialised
 * exactly as it would travel over the socket and searched for the cards its
 * viewer may not see, and so is every event (they reach the whole room).
 */
import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  pickOne,
  type CardInstance,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from './engine';
import { gringo } from './module';
import { INITIAL_PEEK_INDEXES } from './rules';
import { config } from './test-utils';
import type { GringoAction, GringoEvent, GringoState } from './types';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte'];
const UID = /"(?:(?:10|[2-9JQKA])[SHDC]|JK[12])#\d+"/g;

const wire = (state: GringoState, viewer: PlayerId | null) =>
  JSON.stringify(viewer === null ? gringo.getSpectatorView(state) : gringo.getPlayerView(state, viewer));

/** The cards a viewer may see right now (contract §6), by uid. */
function allowed(state: GringoState, viewer: PlayerId | null): Set<string> {
  const ok = new Set<string>(state.discard.map((c) => c.uid));
  const add = (card: CardInstance | null | undefined) => card && ok.add(card.uid);
  if (state.phase === 'FINISHED') {
    for (const id of state.seats) for (const slot of state.grids[id]!) add(slot.card);
  }
  const missed = state.snap?.result;
  if (missed && !missed.hit) add(missed.card);
  if (viewer === null) return ok;
  const onTurn = state.phase !== 'INITIAL_PEEK' && state.seats[state.currentIndex] === viewer;
  if (onTurn) add(state.drawn);
  if (state.phase === 'INITIAL_PEEK' && !state.peekDone.includes(viewer)) {
    for (const slot of state.grids[viewer]!) if (INITIAL_PEEK_INDEXES.includes(slot.index)) add(slot.card);
  }
  const peeked = state.power?.step === 'PEEKED' ? state.power.peeked : null;
  if (onTurn && peeked) add(state.grids[peeked.owner]!.find((s) => s.index === peeked.index)?.card);
  return ok;
}

function assertNoLeaks(state: GringoState): void {
  for (const viewer of [...state.seats, null]) {
    const json = wire(state, viewer);
    const permitted = allowed(state, viewer);
    for (const match of json.match(UID) ?? []) {
      const uid = match.slice(1, -1);
      if (!permitted.has(uid)) throw new Error(`${viewer ?? 'spectator'} sees ${uid} in ${state.phase}`);
    }
    // A face-down card travels without anything that names it.
    if (
      state.phase !== 'FINISHED' &&
      /"card":\{"id":"[^"]+","rank":"[^"]+","suit":[^,]+,"uid":"[^"]+"\}/.test(json)
    ) {
      const view = viewer === null ? gringo.getSpectatorView(state) : gringo.getPlayerView(state, viewer);
      for (const seat of view.seats) {
        for (const slot of seat.grid) if (slot.card) expect(permitted.has(slot.card.uid)).toBe(true);
      }
    }
  }
}

/** The events that carry a card: one that reaches the discard pile, a missed snap, the final grids. */
const FACE_UP_EVENTS = new Set<GringoEvent['type']>([
  'Swapped',
  'DiscardedDrawn',
  'SnapWindowOpened',
  'SnapSucceeded',
  'SnapFailed',
  'GameFinished',
]);

/** Events carry only cards face up for everyone; peeks and swaps name positions, never values. */
function assertEventsClean(before: GringoState, events: readonly GringoEvent[]): void {
  for (const event of events) {
    if (!FACE_UP_EVENTS.has(event.type)) {
      expect(JSON.stringify(event).match(UID), `${event.type} carries a card`).toBeNull();
    }
    if (event.type === 'Drew') expect(Object.keys(event)).toEqual(['type', 'playerId', 'deckCount']);
    if (event.type === 'DiscardedDrawn') expect(event.card.uid).toBe(before.drawn?.uid);
  }
}

function step(state: GringoState, rng: Rng): [GringoAction, PlayerId] {
  const snappers = state.seats.filter((id) =>
    gringo.getValidActions(state, id).some((a) => a.type === 'SNAP'),
  );
  if (snappers.length > 0 && rng.nextInt(3) === 0) {
    const id = pickOne(snappers, rng);
    return [pickOne(gringo.getValidActions(state, id), rng), id];
  }
  const pending = gringo.getPendingPlayers(state);
  if (pending.length > 0) {
    const id = pickOne(pending, rng);
    return [pickOne(gringo.getValidActions(state, id), rng), id];
  }
  return [scheduleFor(state)[0]!.action as GringoAction, SYSTEM_PLAYER_ID];
}

describe('hidden information', () => {
  it('no view nor event ever names a card its viewer may not see, over 300 random games', () => {
    let checked = 0;
    for (let game = 0; game < 300; game++) {
      const rng = createSeededRng(`leak-${game}`);
      const cfg = config({
        gringoEnabled: game % 2 === 0,
        gringoMinTurns: 1,
        powerSet: game % 3 === 0 ? 'SETE_A_DEZ' : 'FIGURAS',
      });
      let state = gringo.setup(PLAYERS.slice(0, 2 + (game % 3)), cfg, rng);
      assertNoLeaks(state);
      while (state.phase !== 'FINISHED') {
        const [action, actor] = step(state, rng);
        const result = gringo.applyAction(state, action, actor);
        if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
        assertEventsClean(state, result.events);
        state = result.state;
        assertNoLeaks(state);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(5_000);
  });

  it('the drawn card reaches the player on turn alone; others see that one is held', () => {
    const state = gringo.setup(PLAYERS, config(), createSeededRng('drawn'));
    let s = gringo.applyAction(state, { type: 'SYS_INITIAL_PEEK_END' }, SYSTEM_PLAYER_ID);
    if (!s.ok) throw new Error('peek');
    const current = s.state.seats[s.state.currentIndex]!;
    s = gringo.applyAction(s.state, { type: 'DRAW' }, current);
    if (!s.ok) throw new Error('draw');
    for (const id of PLAYERS) {
      const view = gringo.getPlayerView(s.state, id);
      expect(view.drawnBy).toBe(current);
      expect(view.drawn?.uid ?? null).toBe(id === current ? s.state.drawn?.uid : null);
    }
    expect(gringo.getSpectatorView(s.state).drawn).toBeNull();
    expect(gringo.getPlayerView(s.state, 'stranger').selfId).toBeNull();
  });
});
