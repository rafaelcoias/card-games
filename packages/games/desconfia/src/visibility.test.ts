/**
 * Hidden information must never leave the server (07 §7): every view is
 * serialised exactly as it would travel over the socket and searched for card
 * ids, and so is every event (they are broadcast to the whole room).
 */
import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  pickOne,
  shuffle,
  type PlayerId,
  type Rng,
} from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { desconfia } from './module';
import { config } from './test-utils';
import type { DesconfiaAction, DesconfiaEvent, DesconfiaState } from './types';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte'];
const CARD_ID = /"(?:(?:10|[2-9JQKA])[SHDC]|JK[12])"/g;

const wire = (state: DesconfiaState, viewer: PlayerId | null) =>
  JSON.stringify(
    viewer === null ? desconfia.getSpectatorView(state) : desconfia.getPlayerView(state, viewer),
  );

/** Throws on any card a viewer should not see: other hands (bar a revealed play) and the pile. */
function assertNoLeaks(state: DesconfiaState): void {
  const revealed = new Set(state.lastReveal?.cards.map((c) => c.id) ?? []);
  for (const viewer of [...state.seats, null]) {
    const seen = new Set((wire(state, viewer).match(CARD_ID) ?? []).map((m) => m.slice(1, -1)));
    const own = new Set(viewer ? state.hands[viewer]!.map((c) => c.id) : []);
    for (const id of seen) {
      if (!own.has(id) && !revealed.has(id)) throw new Error(`${viewer ?? 'spectator'} sees ${id}`);
    }
    for (const play of state.pile) {
      for (const card of play.cards) {
        if (seen.has(card.id)) throw new Error(`${viewer ?? 'spectator'} sees ${card.id} in the pile`);
      }
    }
  }
}

/** Plays carry counts only; only the doubted play is turned over. */
function assertEventsClean(before: DesconfiaState, events: readonly DesconfiaEvent[]): void {
  for (const event of events) {
    if (event.type === 'Revealed') {
      expect(event.cards.map((c) => c.id)).toEqual(before.pile.at(-1)?.cards.map((c) => c.id));
    } else if (event.type !== 'PeixinhoRemoved') {
      expect(JSON.stringify(event).match(CARD_ID)).toBeNull();
    }
  }
}

/** Plays 1–3 random cards, lying or not, and doubts now and then. */
function step(
  state: DesconfiaState,
  rng: Rng,
  scheduled: DesconfiaAction | null,
): [DesconfiaAction, PlayerId] {
  const doubters = state.seats.filter((id) =>
    desconfia.getValidActions(state, id).some((a) => a.type === 'DOUBT'),
  );
  if (doubters.length > 0 && rng.nextInt(3) === 0) {
    const id = pickOne(doubters, rng);
    return [{ type: 'DOUBT', playId: state.doubtWindow!.playId }, id];
  }
  const pending = desconfia.getPendingPlayers(state)[0];
  if (!pending) return [scheduled as DesconfiaAction, SYSTEM_PLAYER_ID];
  const hand = state.hands[pending]!;
  const count = 1 + rng.nextInt(Math.min(3, hand.length));
  const chosen = shuffle(hand, rng).slice(0, count);
  const claimRank = state.claimRank ?? pickOne(['2', '7', 'K'] as const, rng);
  return [{ type: 'PLAY', cardIds: chosen.map((c) => c.id), claimRank }, pending];
}

function play(
  seed: string,
  onStep: (before: DesconfiaState, after: DesconfiaState, events: readonly DesconfiaEvent[]) => void,
) {
  const rng = createSeededRng(seed);
  let state = desconfia.setup(PLAYERS, config(), rng);
  let scheduled: DesconfiaAction | null = null;
  for (let guard = 0; guard < 4000 && !desconfia.isFinished(state); guard++) {
    const [action, actor] = step(state, rng, scheduled);
    const result = desconfia.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
    onStep(state, result.state, result.events);
    state = result.state;
    // Only after a play is nobody on the clock: then the server applies what the engine scheduled.
    scheduled = (result.schedule?.[0]?.action as DesconfiaAction | undefined) ?? null;
  }
  return state;
}

describe('hidden information (07 §7)', () => {
  it('no view names a card of another hand or of the pile, bar a revealed play; events stay clean', () => {
    let steps = 0;
    let reveals = 0;
    for (const seed of ['v1', 'v2', 'v3', 'v4']) {
      const state = play(seed, (before, after, events) => {
        assertNoLeaks(after);
        assertEventsClean(before, events);
        if (events.some((e) => e.type === 'Revealed')) reveals += 1;
        steps += 1;
      });
      expect(state.phase).toBe('FINISHED');
    }
    expect(steps).toBeGreaterThan(100);
    expect(reveals).toBeGreaterThan(10);
  });

  it('a play is public as who, how many and which rank — never its cards', () => {
    const state = desconfia.setup(PLAYERS, config(), createSeededRng('public'));
    const starter = state.seats[state.currentIndex] as PlayerId;
    const cards = state.hands[starter]!.slice(0, 3).map((c) => c.id);
    const result = desconfia.applyAction(state, { type: 'PLAY', cardIds: cards, claimRank: '5' }, starter);
    if (!result.ok) throw new Error(result.error.code);
    for (const viewer of PLAYERS) {
      const view = desconfia.getPlayerView(result.state, viewer);
      expect(view.pilePlays).toEqual([{ playId: 1, playerId: starter, count: 3, claimRank: '5' }]);
      expect(view.pileCount).toBe(3);
      expect(view.lastReveal).toBeNull();
      if (viewer !== starter)
        for (const id of cards) expect(wire(result.state, viewer)).not.toContain(`"${id}"`);
    }
    const spectator = desconfia.getSpectatorView(result.state);
    expect(spectator.me).toBeNull();
    expect(spectator.seats.map((s) => s.handCount)).toEqual(
      PLAYERS.map((id) => result.state.hands[id]!.length),
    );
  });
});
