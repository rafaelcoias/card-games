import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  createShoe,
  pickOne,
  type CardInstance,
} from '@cardroom/game-core';
import {
  createGringoModule,
  gringo,
  gringoConfigSchema,
  PACE,
  scheduleFor,
  type Dealer,
  type GringoAction,
  type GringoState,
} from '@cardroom/gringo';
import { describe, expect, it } from 'vitest';
import { peekCaption, swapCaption } from './table';
import { gridBox, slotCell } from './layout';
import { applyEvent, sceneFromView, type Scene } from './scene';

const ME = 'ana';
const SEATS = [ME, 'bruno', 'carla'];

const shoe = createShoe({ decks: 1, jokers: 2 });
const card = (id: string) => shoe.find((c) => c.id === id) as CardInstance;

/** Fixed grids, then `top` on the deck, then the rest of the shoe. */
const dealer =
  (grids: Record<string, string[]>, top: string[]): Dealer =>
  () => {
    const used = new Set([...Object.values(grids).flat(), ...top]);
    return {
      grids: Object.fromEntries(Object.entries(grids).map(([id, ids]) => [id, ids.map(card)])),
      deck: [...top.map(card), ...shoe.filter((c) => !used.has(c.id))],
    };
  };

const GRIDS = {
  ana: ['9C', 'KH', '2D', '7S'],
  bruno: ['4H', 'JC', 'AS', '10D'],
  carla: ['6D', 'JK1', 'QS', '3C'],
};

class Run {
  readonly engine;
  state: GringoState;
  scene: Scene;
  seq = 0;

  constructor(top: string[], config = {}) {
    this.engine = createGringoModule(dealer(GRIDS, top));
    this.state = this.engine.setup(SEATS, gringoConfigSchema.parse(config), { nextInt: () => 0 });
    this.scene = sceneFromView('m', 0, this.engine.getPlayerView(this.state, ME));
  }

  /** Applies an action, animates its events, and checks the scene against the committed view. */
  act(action: GringoAction, by: string = SYSTEM_PLAYER_ID): Scene {
    const result = this.engine.applyAction(this.state, action, by);
    if (!result.ok) throw new Error(`${action.type}: ${result.error.code}`);
    this.state = result.state;
    let scene = this.scene;
    for (const event of result.events) {
      const steps = [applyEvent(scene, event)].flat();
      scene = steps.at(-1)!.scene;
    }
    const animated = scene;
    const committed = sceneFromView('m', ++this.seq, this.engine.getPlayerView(this.state, ME), animated);
    // What the animation ends on agrees with the server: the same cards in the same slots.
    for (const seat of committed.seats) {
      const before = animated.seats.find((s) => s.id === seat.id)!;
      expect(before.slots.map((s) => [s.index, s.token !== null])).toEqual(
        seat.slots.map((s) => [s.index, s.token !== null]),
      );
      // Tokens survive the commit: nothing that stayed put remounts (and jumps).
      expect(seat.slots.map((s) => s.token)).toEqual(before.slots.map((s) => s.token));
    }
    expect(committed.discard.top?.token).toBe(animated.discard.top?.token ?? committed.discard.top?.token);
    this.scene = committed;
    return animated;
  }

  tokenAt(owner: string, index: number) {
    return this.scene.seats.find((s) => s.id === owner)?.slots.find((s) => s.index === index)?.token;
  }
}

describe('gringo scene', () => {
  it('shows the viewer their bottom row during the initial peek, then turns it down', () => {
    const run = new Run([]);
    const mine = run.scene.seats.find((s) => s.id === ME)!;
    expect(mine.slots.map((s) => s.face?.id ?? null)).toEqual([null, null, '2D', '7S']);
    const after = run.act({ type: 'PEEK_DONE' }, ME);
    expect(after.seats.find((s) => s.id === ME)!.slots.every((s) => s.face === null)).toBe(true);
  });

  it('a drawn card glides into the slot, and the old one glides face up to the discard pile', () => {
    const run = new Run(['5H']);
    run.act({ type: 'SYS_INITIAL_PEEK_END' });
    const before = run.tokenAt(ME, 2);
    run.act({ type: 'DRAW' }, ME);
    expect(run.scene.drawn?.face?.id).toBe('5H');
    const drawnToken = run.scene.drawn!.token;
    const animated = run.act({ type: 'SWAP_DRAWN', index: 2 }, ME);
    expect(animated.seats[0]!.slots[2]!.token).toBe(drawnToken);
    expect(animated.discard.top).toMatchObject({ token: before, card: { id: '2D' } });
    expect(animated.snap).toMatchObject({ open: true });
  });

  it('a blind swap trades the tokens of the two slots, so both cards glide', () => {
    const run = new Run(['JH']);
    run.act({ type: 'SYS_INITIAL_PEEK_END' });
    run.act({ type: 'DRAW' }, ME);
    run.act({ type: 'DISCARD_DRAWN', usePower: true }, ME);
    const mine = run.tokenAt(ME, 0);
    const theirs = run.tokenAt('carla', 1);
    run.act({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'carla', theirIndex: 1 }, ME);
    expect(run.tokenAt(ME, 0)).toBe(theirs);
    expect(run.tokenAt('carla', 1)).toBe(mine);
  });

  it('marks both slots before a swap moves them, fills the server lead, and clears the marks next turn', () => {
    const run = new Run(['JH']);
    run.act({ type: 'SYS_INITIAL_PEEK_END' });
    run.act({ type: 'DRAW' }, ME);
    run.act({ type: 'DISCARD_DRAWN', usePower: true }, ME);
    const mine = run.tokenAt(ME, 0);
    const steps = [
      applyEvent(run.scene, {
        type: 'BlindSwapped',
        playerId: ME,
        myIndex: 0,
        owner: 'carla',
        theirIndex: 1,
      }),
    ].flat();
    const marks = [
      { owner: ME, index: 0 },
      { owner: 'carla', index: 1 },
    ];
    // Beat one: the slots light up while the cards are still in place.
    expect(steps[0]!.scene.moved).toEqual(marks);
    expect(steps[0]!.scene.seats[0]!.slots[0]!.token).toBe(mine);
    expect(steps.reduce((ms, s) => ms + s.waitMs, 0)).toBe(PACE.swap);

    run.act({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'carla', theirIndex: 1 }, ME);
    expect(run.scene.moved).toEqual(marks);
    run.act({ type: 'SYS_SNAP_WINDOW_CLOSED', discardId: run.state.snap!.discardId });
    expect(run.scene.moved).toEqual([]);
  });

  it('a missed snap is shown, then goes back down while the penalty card comes in', () => {
    const run = new Run(['8H', '5C']);
    run.act({ type: 'SYS_INITIAL_PEEK_END' });
    run.act({ type: 'DRAW' }, ME);
    run.act({ type: 'DISCARD_DRAWN', usePower: false }, ME);
    const result = run.engine.applyAction(run.state, { type: 'SNAP', discardId: 1, index: 1 }, 'bruno');
    if (!result.ok) throw new Error('snap');
    const steps = [applyEvent(run.scene, result.events[0]!)].flat();
    expect(steps).toHaveLength(2);
    expect(steps[0]!.waitMs).toBe(1500);
    expect(steps[0]!.scene.seats[1]!.slots[1]!.face?.id).toBe('JC');
    expect(steps[1]!.scene.seats[1]!.slots[1]!.face).toBeNull();
    expect(steps[1]!.scene.seats[1]!.slots.at(-1)).toMatchObject({ index: 4, face: null });
  });

  it('a good snap empties the slot and its card lands on the discard pile', () => {
    const run = new Run(['10S', '5C']);
    run.act({ type: 'SYS_INITIAL_PEEK_END' });
    run.act({ type: 'DRAW' }, ME);
    run.act({ type: 'DISCARD_DRAWN', usePower: false }, ME);
    const token = run.tokenAt('bruno', 3);
    const animated = run.act({ type: 'SNAP', discardId: 1, index: 3 }, 'bruno');
    expect(animated.seats[1]!.slots[3]).toMatchObject({ token: null, face: null });
    expect(animated.discard.top).toMatchObject({ token, card: { id: '10D' } });
    expect(animated.discard.under.map((c) => c.id)).toEqual(['10S']);
  });

  it('turns every grid over at the end, one player after the other', () => {
    const run = new Run(['5H', '5C'], {});
    run.act({ type: 'SYS_INITIAL_PEEK_END' });
    const state = run.engine.applyAction(
      { ...run.state, deck: run.state.deck.slice(0, 1) },
      { type: 'DRAW' },
      ME,
    );
    if (!state.ok) throw new Error('draw');
    run.state = state.state;
    run.act({ type: 'DISCARD_DRAWN', usePower: false }, ME);
    const result = run.engine.applyAction(
      run.state,
      { type: 'SYS_SNAP_WINDOW_CLOSED', discardId: 1 },
      SYSTEM_PLAYER_ID,
    );
    if (!result.ok) throw new Error('close');
    const finished = result.events.find((e) => e.type === 'GameFinished')!;
    const steps = [applyEvent(run.scene, finished)].flat();
    expect(steps).toHaveLength(SEATS.length + 1);
    expect(steps[0]!.scene.seats[0]!.slots.every((s) => s.face !== null)).toBe(true);
    expect(steps[0]!.scene.seats[1]!.slots.every((s) => s.face === null)).toBe(true);
    expect(steps.at(-1)!.scene.final?.winners).toEqual(
      finished.type === 'GameFinished' ? finished.winners : [],
    );
  });

  it('agrees with the server over whole random games', () => {
    for (let game = 0; game < 40; game++) {
      const rng = createSeededRng(`scene-${game}`);
      const run = new Run([], { gringoEnabled: game % 2 === 0, gringoMinTurns: 1 });
      let guard = 0;
      while (run.state.phase !== 'FINISHED' && guard++ < 2000) {
        const snappers = SEATS.filter((id) =>
          gringo.getValidActions(run.state, id).some((a) => a.type === 'SNAP'),
        );
        const pending = gringo.getPendingPlayers(run.state);
        if (snappers.length > 0 && rng.nextInt(4) === 0) {
          const id = pickOne(snappers, rng);
          run.act(pickOne(gringo.getValidActions(run.state, id), rng), id);
        } else if (pending.length > 0) {
          const id = pickOne(pending, rng);
          run.act(pickOne(gringo.getValidActions(run.state, id), rng), id);
        } else {
          run.act(scheduleFor(run.state)[0]!.action as GringoAction);
        }
      }
      expect(run.state.phase).toBe('FINISHED');
    }
  });
});

describe('gringo layout and copy', () => {
  it('keeps [1] [2] on top, [3] [4] below, and penalties in new columns to the right', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(slotCell)).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
      { col: 2, row: 0 },
      { col: 2, row: 1 },
      { col: 3, row: 0 },
    ]);
    expect(gridBox(3, 'md').width).toBeLessThan(gridBox(4, 'md').width);
  });

  it('reads the public captions from the viewer’s side (UI §5)', () => {
    const name = (id: string) => (id === ME ? 'Tu' : id);
    expect(peekCaption('bruno', 'carla', 1, ME, name)).toBe('bruno espreitou a carta [2] de carla.');
    expect(peekCaption(ME, 'bruno', 0, ME, name)).toBe('Espreitaste a carta [1] de bruno.');
    expect(peekCaption('bruno', ME, 3, ME, name)).toBe('bruno espreitou a carta [4] de ti.');
    expect(peekCaption('bruno', 'bruno', 2, ME, name)).toBe('bruno espreitou a sua carta [3].');
    expect(swapCaption('bruno', 0, 'carla', 1, ME, name)).toBe('bruno trocou a sua [1] com a [2] de carla.');
    expect(swapCaption(ME, 3, 'bruno', 0, ME, name)).toBe('Trocaste a tua [4] com a [1] de bruno.');
  });
});
