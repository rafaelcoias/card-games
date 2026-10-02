/**
 * Hidden information must never leave the server (requirement 2, 07 §8):
 * every view is serialised exactly as it would travel over the socket and
 * searched for card ids. A viewer may see their own hand, the cards on the
 * trick (face up for all) and, in an exchange, the cards they swapped —
 * nothing else. Events go to the whole room, so only plays carry cards.
 */
import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, shuffle, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from './engine';
import { olho } from './module';
import { handOf } from './state';
import { config } from './test-utils';
import type { OlhoAction, OlhoEvent, OlhoState } from './types';

const CARD_ID = /"(?:(?:10|[2-9JQKA])[SHDC]|JK[12])"/g;

const wire = (state: OlhoState, viewer: PlayerId | null) =>
  JSON.stringify(viewer === null ? olho.getSpectatorView(state) : olho.getPlayerView(state, viewer));

function assertNoLeaks(state: OlhoState): void {
  const onTrick = state.trick.plays.flatMap((p) => p.cards.map((c) => c.id));
  for (const viewer of [...olho.getSeatedPlayers!(state), null]) {
    const allowed = new Set(onTrick);
    if (viewer) {
      for (const card of handOf(state, viewer)) allowed.add(card.id);
      const pair = state.exchange?.pairs.find((p) => p.giver === viewer || p.receiver === viewer);
      const arrived = pair?.giver === viewer || state.exchange?.stage !== 'DEALT';
      if (pair && arrived) for (const card of [...pair.given, ...(pair.returned ?? [])]) allowed.add(card.id);
    }
    const seen = (wire(state, viewer).match(CARD_ID) ?? []).map((m) => m.slice(1, -1));
    for (const id of seen) {
      if (!allowed.has(id)) throw new Error(`${viewer ?? 'spectator'} sees ${id}`);
    }
    const prompt = viewer ? olho.getPlayerView(state, viewer).skipPrompt : null;
    if (prompt && state.trick.skip?.targetId !== viewer)
      throw new Error(`${viewer} sees someone else's skip`);
  }
}

function assertEventsClean(events: readonly OlhoEvent[]): void {
  for (const event of events) {
    if (event.type === 'Played' || event.type === 'Escaped') continue;
    expect(JSON.stringify(event).match(CARD_ID)).toBeNull();
  }
}

function playSession(seed: string): number {
  const rng = createSeededRng(seed);
  const players = Array.from({ length: 3 + rng.nextInt(6) }, (_, i) => `p${i}`);
  let state = olho.setup(players, config({ allowFinishWithPower: rng.nextInt(2) === 0 }), rng);
  let checked = 0;
  while (state.gamesCompleted < 3) {
    assertNoLeaks(state);
    checked += 1;
    const pending = olho.getPendingPlayers(state);
    let actor: PlayerId = SYSTEM_PLAYER_ID;
    let action: OlhoAction | undefined;
    if (pending.length > 0) {
      actor = pickOne(pending, rng);
      const options = olho.getValidActions(state, actor);
      action = pickOne(options, rng);
      if (action.type === 'RETURN_CARDS') {
        const cards = shuffle(handOf(state, actor), rng).slice(0, action.cardIds.length);
        action = { type: 'RETURN_CARDS', cardIds: cards.map((c) => c.id) };
      }
    } else {
      action = scheduleFor(state)[0]?.action as OlhoAction | undefined;
    }
    if (!action) throw new Error(`${seed}: stalled`);
    const result = olho.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${seed}: ${result.error.code}`);
    assertEventsClean(result.events);
    state = result.state;
  }
  return checked;
}

describe('hidden information', () => {
  it('no view ever shows a card its viewer may not see, and only plays carry cards', () => {
    let checked = 0;
    for (let i = 0; i < 40; i++) checked += playSession(`leaks-${i}`);
    expect(checked).toBeGreaterThan(5_000);
  });
});
