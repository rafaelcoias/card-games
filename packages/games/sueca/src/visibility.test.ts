/**
 * Hidden information never leaves the server (07 §10): every view and every
 * event is serialised exactly as it would travel over the socket and searched
 * for the cards of other hands. The trump card is the one exception, public
 * until its holder plays it.
 */
import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, type ScheduledAction } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { sueca } from './module';
import { PLAY_ORDER } from './rules';
import { config } from './test-utils';
import type { Seat, SuecaAction, SuecaEvent, SuecaState } from './types';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte'];
const mentions = (json: string, uid: string) => json.includes(`"${uid}"`);

/** Cards a viewer may not know: every other hand, minus the face-up trump card. */
function hiddenFrom(state: SuecaState, viewer: Seat | null): string[] {
  const publicTrump = state.trumpCard && !state.trumpCardPlayed ? state.trumpCard.uid : null;
  return PLAY_ORDER.filter((seat) => seat !== viewer)
    .flatMap((seat) => state.hands[seat].map((c) => c.uid))
    .filter((uid) => uid !== publicTrump);
}

function assertViews(state: SuecaState): void {
  for (const viewer of [...PLAYERS, null]) {
    const view = viewer === null ? sueca.getSpectatorView(state) : sueca.getPlayerView(state, viewer);
    const json = JSON.stringify(view);
    const seat = view.mySeat;
    for (const uid of hiddenFrom(state, seat)) {
      if (mentions(json, uid)) throw new Error(`${viewer ?? 'spectator'} sees ${uid} in ${state.phase}`);
    }
    if (seat) {
      expect(view.myHand.map((c) => c.uid).sort()).toEqual(state.hands[seat].map((c) => c.uid).sort());
      if (view.lastTrickView && !state.lastTrickShown[seat]) throw new Error('A look outlived its time');
    }
    for (const other of view.seats) {
      if ('cards' in other || 'hand' in other) throw new Error('A seat carries cards');
    }
    // Points stay hidden while a hand is played: only finished hands are summed up.
    const live = state.phase === 'PLAYING' || state.phase === 'TRICK_DONE' || state.phase === 'CUT';
    if (live && view.handSummary !== null) throw new Error('Points shown during a hand');
    if (json.includes('wonCards')) throw new Error('Won cards in a view');
    if (state.trumpCard) {
      expect(view.trump?.card?.uid ?? null).toBe(state.trumpCardPlayed ? null : state.trumpCard.uid);
    }
  }
}

/** Events go to the whole room: only played cards and the trump card may be in them. */
function assertEvents(before: SuecaState, after: SuecaState, events: readonly SuecaEvent[]): void {
  const json = JSON.stringify(events);
  const hidden = PLAY_ORDER.flatMap((seat) => after.hands[seat].map((c) => c.uid)).filter(
    (uid) => uid !== after.trumpCard?.uid,
  );
  for (const uid of hidden) {
    if (mentions(json, uid)) throw new Error(`An event names ${uid}, still in a hand (${before.phase})`);
  }
}

function play(seed: string): number {
  const rng = createSeededRng(seed);
  let state = sueca.setup(PLAYERS, config({ targetGames: 1 + rng.nextInt(3) }), rng);
  let schedule: readonly ScheduledAction[] = [];
  let steps = 0;
  while (!sueca.isFinished(state)) {
    let actor = SYSTEM_PLAYER_ID;
    let action: SuecaAction;
    const pending = sueca.getPendingPlayers(state);
    const looker = pickOne(PLAYERS, rng);
    const looks = sueca.getValidActions(state, looker).filter((a) => a.type === 'VIEW_LAST_TRICK');
    if (looks.length > 0 && rng.nextInt(6) === 0) [actor, action] = [looker, looks[0] as SuecaAction];
    else if (pending.length > 0) {
      actor = pending[0] as string;
      action = pickOne(
        sueca.getValidActions(state, actor).filter((a) => a.type !== 'VIEW_LAST_TRICK'),
        rng,
      );
    } else action = (schedule[0] as ScheduledAction).action as SuecaAction;
    const result = sueca.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${seed}: ${action.type} refused (${result.error.code})`);
    assertEvents(state, result.state, result.events);
    state = result.state;
    schedule = result.schedule ?? [];
    assertViews(state);
    steps += 1;
  }
  return steps;
}

describe('hidden information', () => {
  it('no view and no event ever names a card of another hand (200 matches)', () => {
    let steps = 0;
    for (let i = 0; i < 200; i++) steps += play(`visibility-${i}`);
    expect(steps).toBeGreaterThan(200 * 40);
  });
});
