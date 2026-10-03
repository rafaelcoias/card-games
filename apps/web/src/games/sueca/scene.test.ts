import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, type ScheduledAction } from '@cardroom/game-core';
import { sueca, suecaConfigSchema, type Seat, type SuecaAction, type SuecaState } from '@cardroom/sueca';
import { describe, expect, it } from 'vitest';
import { handVerdict, pair, pointsLine } from './copy';
import { seatAt, sideOf, tableGeometry } from './layout';
import { applyEvent, dealDelaySeconds, dealOffset, sceneFromView, type Scene } from './scene';

const ME = 'ana';
const SEATING: Record<Seat, string> = { S: ME, E: 'bruno', N: 'carla', W: 'duarte' };
const PLAYERS = Object.values(SEATING);

/** Plays a match with random legal moves; after every action the animated scene must agree with the view. */
function run(seed: string, check: (animated: Scene, committed: Scene, action: SuecaAction) => void): Scene {
  const rng = createSeededRng(seed);
  let state: SuecaState = sueca.setup(PLAYERS, suecaConfigSchema.parse({ targetGames: 2 }), rng, {
    seating: SEATING,
  });
  let scene = sceneFromView('m', 0, sueca.getPlayerView(state, ME));
  let schedule: readonly ScheduledAction[] = [];
  for (let seq = 1; !sueca.isFinished(state); seq++) {
    const pending = sueca.getPendingPlayers(state);
    const actor = pending[0] ?? SYSTEM_PLAYER_ID;
    const action: SuecaAction = pending[0]
      ? pickOne(
          sueca.getValidActions(state, actor).filter((a) => a.type !== 'VIEW_LAST_TRICK'),
          rng,
        )
      : ((schedule[0] as ScheduledAction).action as SuecaAction);
    const result = sueca.applyAction(state, action, actor);
    if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
    state = result.state;
    schedule = result.schedule ?? [];
    let animated = scene;
    for (const event of result.events) animated = [applyEvent(animated, event)].flat().at(-1)!.scene;
    const committed = sceneFromView('m', seq, sueca.getPlayerView(state, ME), animated);
    check(animated, committed, action);
    scene = committed;
  }
  return scene;
}

describe('sueca scene', () => {
  it('animates to exactly what the server says, step after step', () => {
    let checked = 0;
    const last = run('scene-1', (animated, committed) => {
      expect(animated.phase).toBe(committed.phase);
      expect(animated.trick.map((t) => t.card.uid)).toEqual(committed.trick.map((t) => t.card.uid));
      expect(animated.tricksWon).toEqual(committed.tricksWon);
      expect(animated.games).toEqual(committed.games);
      expect(animated.dealer).toBe(committed.dealer);
      expect(animated.trump?.card?.uid ?? null).toBe(committed.trump?.card?.uid ?? null);
      expect(animated.seats.map((s) => s.handCount)).toEqual(committed.seats.map((s) => s.handCount));
      // The viewer's own cards come from the view: none appears or vanishes on the way.
      if (committed.phase === 'PLAYING') {
        expect([...animated.hand.map((c) => c.card.uid)].sort()).toEqual(
          [...committed.hand.map((c) => c.card.uid)]
            .filter((uid) => animated.hand.some((c) => c.card.uid === uid))
            .sort(),
        );
      }
      checked += 1;
    });
    expect(last.phase).toBe('FINISHED');
    expect(checked).toBeGreaterThan(80);
  });

  it('keeps card identities across a commit, so nothing that stayed put remounts', () => {
    run('scene-2', (animated, committed) => {
      for (const card of committed.hand) {
        const before = animated.hand.find((c) => c.card.uid === card.card.uid);
        if (before) expect(card).toBe(before);
      }
      for (const play of committed.trick) {
        const before = animated.trick.find((t) => t.card.uid === play.card.uid);
        if (before) expect(play).toBe(before);
      }
    });
  });

  it('turns the trump over on the deck, then lays it beside the dealer', () => {
    const state = sueca.setup(PLAYERS, suecaConfigSchema.parse({}), createSeededRng('trump'), {
      seating: SEATING,
    });
    const scene = sceneFromView('m', 0, sueca.getPlayerView(state, ME));
    const result = sueca.applyAction(state, { type: 'CHOOSE_CUT', from: 'TOP' }, state.seats[state.cutter]);
    if (!result.ok) throw new Error(result.error.code);
    const revealed = result.events.find((e) => e.type === 'TrumpRevealed');
    const steps = [applyEvent(scene, revealed!)].flat();
    expect(steps.map((s) => [s.scene.trump?.at, s.scene.trump?.faceDown])).toEqual([
      ['deck', true],
      ['deck', false],
      ['holder', false],
    ]);
  });
});

describe('sueca layout', () => {
  it('puts you at the bottom, your partner on top and the next to play on your right', () => {
    expect(sideOf('S', 'S')).toBe('bottom');
    expect(sideOf('E', 'S')).toBe('right');
    expect(sideOf('N', 'S')).toBe('top');
    expect(sideOf('W', 'S')).toBe('left');
    expect(sideOf('S', 'E')).toBe('left');
    expect(seatAt('top', 'W')).toBe('E');
    expect(seatAt('right', null)).toBe('E');
  });

  it('keeps the cross clear of the side seats', () => {
    const g = tableGeometry({ width: 390, height: 600 }, 'ms', true);
    expect(g.trick.left.x - 34).toBeGreaterThanOrEqual(g.seats.left.x + 42 - 1);
    expect(g.trick.right.x + 34).toBeLessThanOrEqual(g.seats.right.x - 42 + 1);
    expect(g.trick.top.y).toBeLessThan(g.center.y);
    expect(g.trick.bottom.y).toBeGreaterThan(g.center.y);
  });

  it('deals one card at a time from the dealer’s right, the dealer last', () => {
    expect([1, 2, 3, 0].map((i) => dealOffset((['S', 'E', 'N', 'W'] as const)[i] as Seat, 'S'))).toEqual([
      0, 1, 2, 3,
    ]);
    expect(dealDelaySeconds(1, 'E', 'S')).toBeCloseTo(4 * 0.03);
  });
});

describe('sueca copy', () => {
  const summary = (A: number, gamesA: number, gamesB: number) => ({
    hand: 1,
    points: { A, B: 120 - A },
    gamesAwarded: { A: gamesA, B: gamesB },
    tricks: { A: 5, B: 5 },
    dealer: 'S' as const,
    trumpSuit: 'D' as const,
  });

  it('reads a hand from the viewer’s side', () => {
    expect(pointsLine(summary(79, 1, 0), 'A')).toBe('Nós 79 · Eles 41');
    expect(pointsLine(summary(79, 1, 0), 'B')).toBe('Nós 41 · Eles 79');
    expect(handVerdict(summary(79, 1, 0), 'A')).toBe('Ganhámos 1 jogo');
    expect(handVerdict(summary(29, 0, 2), 'A')).toBe('Eles ganham 2 jogos');
    expect(handVerdict(summary(60, 0, 0), 'B')).toBe('60–60 · ninguém pontua');
    expect(handVerdict(summary(120, 4, 0), 'A')).toBe('Bandeira! Ganhámos 4 jogos');
    expect(handVerdict(summary(0, 0, 4), 'A')).toBe('Bandeira! Eles ganham 4 jogos');
    expect(handVerdict(summary(95, 2, 0), null)).toBe('Equipa A ganha 2 jogos');
  });

  it('names pairs without articles', () => {
    expect(pair(['Ana', 'Carla'])).toBe('Ana e Carla');
    expect(pair(['Ana'])).toBe('Ana');
  });
});
