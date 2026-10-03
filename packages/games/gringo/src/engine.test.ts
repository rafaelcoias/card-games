import { SYSTEM_PLAYER_ID, createSeededRng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { gringo, gringoActionSchema, gringoConfigSchema } from './module';
import { PACE, deckCount, points, powerOf, standings } from './rules';
import { Table, card, config, eventTypes, expectError, queuedRng } from './test-utils';

const GRIDS = {
  ana: ['9C', 'KH', '2D', '7S'],
  bruno: ['4H', 'JC', 'AS', '10D'],
  carla: ['6D', 'JK1', 'QS', '3C'],
};

/** Past the initial peek, Ana on turn, with `deck` on top of the deck. */
const table = (deck: string[], cfg = {}, options = {}) => Table.started(GRIDS, deck, cfg, options);

/** Draws and discards; whenever the card matches one of Bruno's, Bruno snaps it. */
function plainTurn(t: Table): void {
  const player = t.current as string;
  t.draw(player);
  t.discard(player);
  const top = t.state.discard.at(-1);
  const match = t.state.grids.bruno?.find((s) => s.card && s.card.rank === top?.rank);
  if (match) t.snap('bruno', match.index);
  t.closeWindow();
}

/**
 * Bruno (second seat) holds 4♥ 5♦ 6♣ 7♠ and the deck brings the other suit of
 * each, in between his own draws: he snaps all four and is out of cards when
 * Ana's 4th turn ends. `more` follows on the deck (nothing else).
 */
function emptyBruno(others: Record<string, string[]>, more: string[], cfg = {}): Table {
  const [first, ...rest] = Object.entries(others);
  const t = Table.started(
    Object.fromEntries([first!, ['bruno', ['4H', '5D', '6C', '7S']], ...rest]),
    ['4D', '8C', '5H', '8D', '6S', '8H', '7H', ...more],
    cfg,
    { fill: false },
  );
  while (t.grid('bruno').some((c) => c !== null)) plainTurn(t);
  return t;
}

describe('setup (07 §1)', () => {
  it('deals four cards each, in fixed slots 0–3, and leaves the rest of the shoe in the deck', () => {
    const state = gringo.setup(['a', 'b', 'c'], config(), createSeededRng('deal'));
    for (const id of state.seats) {
      expect(state.grids[id]?.map((s) => s.index)).toEqual([0, 1, 2, 3]);
      expect(state.grids[id]?.every((s) => s.card !== null)).toBe(true);
    }
    expect(state.deck).toHaveLength(54 - 12);
    expect(state.phase).toBe('INITIAL_PEEK');
    expect(state.discard).toEqual([]);
  });

  it('plays with two decks from 7 players on, unless the room says otherwise', () => {
    const seven = Array.from({ length: 7 }, (_, i) => `p${i}`);
    expect(gringo.setup(seven, config(), createSeededRng('7')).deck).toHaveLength(108 - 28);
    expect(gringo.setup(seven, config({ decks: 1 }), createSeededRng('7')).deck).toHaveLength(54 - 28);
    expect(gringo.setup(['a', 'b'], config({ decks: 2 }), createSeededRng('2')).deck).toHaveLength(108 - 8);
    expect(deckCount({ decks: 'AUTO' }, 6)).toBe(1);
    const shoe = gringo.setup(seven, config(), createSeededRng('7'));
    const uids = [...shoe.deck, ...Object.values(shoe.grids).flatMap((g) => g.map((s) => s.card!))].map(
      (c) => c.uid,
    );
    expect(new Set(uids).size).toBe(108);
  });

  it('starts with a random player and rejects bad tables', () => {
    expect(Table.scripted(GRIDS, [], {}, { starter: 2 }).state.currentIndex).toBe(2);
    expect(() => gringo.setup(['a'], config(), queuedRng())).toThrow(RangeError);
    expect(() =>
      gringo.setup(
        Array.from({ length: 11 }, (_, i) => `${i}`),
        config(),
        queuedRng(),
      ),
    ).toThrow(RangeError);
    expect(() => gringo.setup(['a', 'a'], config(), queuedRng())).toThrow('Duplicate');
  });

  it('shows each player their bottom row during the initial peek, until they memorise it', () => {
    const t = Table.scripted(GRIDS, []);
    const faces = (viewer: string) =>
      t.module
        .getPlayerView(t.state, viewer)
        .seats.flatMap((s) => s.grid.map((slot) => slot.card?.id ?? null));
    expect(faces('ana')).toEqual([null, null, '2D', '7S', ...Array<null>(8).fill(null)]);
    expect(t.module.getPendingPlayers(t.state)).toEqual(['ana', 'bruno', 'carla']);
    expect(t.module.getTimeoutMs(t.state)).toBe(10_000);
    expect(t.module.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_INITIAL_PEEK_END' });
    expect(t.current).toBeNull();

    t.apply({ type: 'PEEK_DONE' }, 'ana');
    expect(faces('ana').every((c) => c === null)).toBe(true);
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([]);
    expectError(t.try({ type: 'PEEK_DONE' }, 'ana'), 'ALREADY_DONE');
    expect(t.module.getPendingPlayers(t.state)).toEqual(['bruno', 'carla']);
    t.apply({ type: 'PEEK_DONE' }, 'bruno');
    // The last one to memorise starts the game.
    const last = t.apply({ type: 'PEEK_DONE' }, 'carla');
    expect(eventTypes(last.events)).toEqual(['PeekDone', 'InitialPeekEnded', 'TurnStarted']);
    expect(t.state.phase).toBe('TURN_DRAW');
    expect(t.current).toBe('ana');
    expect(faces('carla').every((c) => c === null)).toBe(true);
    expectError(t.try({ type: 'PEEK_DONE' }, 'bruno'), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_INITIAL_PEEK_END' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });
});

describe('a turn (07 §2)', () => {
  it('rejects playing out of turn, drawing twice and deciding before drawing', () => {
    const t = table(['5H']);
    expectError(t.try({ type: 'DRAW' }, 'bruno'), 'NOT_YOUR_TURN');
    expectError(t.try({ type: 'SWAP_DRAWN', index: 0 }, 'ana'), 'WRONG_PHASE');
    expectError(t.try({ type: 'DISCARD_DRAWN', usePower: false }, 'ana'), 'WRONG_PHASE');
    t.draw('ana');
    expectError(t.try({ type: 'DRAW' }, 'ana'), 'WRONG_PHASE');
    expectError(t.try({ type: 'PASS' }, 'ana'), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_PEEK_END' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'DRAW' }, 'nobody'), 'UNKNOWN_PLAYER');
    expectError(t.try({ type: 'DRAW' }, SYSTEM_PLAYER_ID), 'UNKNOWN_PLAYER');
    expectError(t.try({ type: 'SYS_TIMEOUT' }, 'ana'), 'SYSTEM_ONLY');
  });

  it('swaps the drawn card into the exact slot and sends the old one to the discard pile', () => {
    const t = table(['5H']);
    const drew = t.draw('ana');
    expect(drew.events).toEqual([{ type: 'Drew', playerId: 'ana', deckCount: t.state.deck.length }]);
    expect(t.module.getPlayerView(t.state, 'ana').drawn?.id).toBe('5H');
    expect(t.module.getPlayerView(t.state, 'bruno')).toMatchObject({ drawn: null, drawnBy: 'ana' });
    expectError(t.try({ type: 'SWAP_DRAWN', index: 9 }, 'ana'), 'EMPTY_SLOT');
    const swap = t.swap('ana', 2);
    expect(eventTypes(swap.events)).toEqual(['Swapped', 'SnapWindowOpened']);
    expect(t.grid('ana')).toEqual(['9C', 'KH', '5H', '7S']);
    expect(t.state.discard.map((c) => c.id)).toEqual(['2D']);
    expect(t.state.drawn).toBeNull();
    expect(swap.schedule).toEqual([
      { action: { type: 'SYS_SNAP_WINDOW_CLOSED', discardId: 1 }, delayMs: 3000 },
    ]);
  });

  it('discards with or without the power, and only a drawn and discarded card has one', () => {
    const t = table(['QH', 'QD']);
    t.draw('ana');
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([
      { type: 'SWAP_DRAWN', index: 0 },
      { type: 'SWAP_DRAWN', index: 1 },
      { type: 'SWAP_DRAWN', index: 2 },
      { type: 'SWAP_DRAWN', index: 3 },
      { type: 'DISCARD_DRAWN', usePower: false },
      { type: 'DISCARD_DRAWN', usePower: true },
    ]);
    const plain = t.discard('ana');
    expect(plain.events[0]).toMatchObject({ type: 'DiscardedDrawn', power: null });
    expect(t.state.phase).toBe('SNAP_WINDOW');
    t.closeWindow();
    // Bruno swaps the queen of diamonds in, then swaps it out next time: no power from a grid.
    t.draw('bruno');
    t.swap('bruno', 0);
    expect(t.state.power).toBeNull();
    expect(t.state.phase).toBe('SNAP_WINDOW');
  });

  it('maps both power sets', () => {
    expect(['10', 'J', 'Q', 'K', '7', 'A'].map((rank) => powerOf({ rank } as never, 'FIGURAS'))).toEqual([
      'PEEK_OTHER',
      'BLIND_SWAP',
      'PEEK_OWN',
      'PEEK_AND_SWAP',
      null,
      null,
    ]);
    expect(['7', '8', '9', '10', 'J', 'K'].map((rank) => powerOf({ rank } as never, 'SETE_A_DEZ'))).toEqual([
      'PEEK_OTHER',
      'BLIND_SWAP',
      'PEEK_OWN',
      'PEEK_AND_SWAP',
      null,
      null,
    ]);
  });
});

describe('powers (07 §3)', () => {
  it('a 10 looks at another player’s card, for the player alone and only during the peek', () => {
    const t = table(['10S']);
    t.draw('ana');
    t.discard('ana', true);
    expect(t.module.getPendingPlayers(t.state)).toEqual(['ana']);
    expect(t.module.getTimeoutMs(t.state)).toBe(20_000);
    expectError(t.try({ type: 'POWER_PEEK', owner: 'ana', index: 0 }, 'ana'), 'WRONG_TARGET');
    expectError(t.try({ type: 'POWER_PEEK', owner: 'zoe', index: 0 }, 'ana'), 'UNKNOWN_TARGET');
    expectError(
      t.try({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'bruno', theirIndex: 0 }, 'ana'),
      'WRONG_PHASE',
    );
    const peek = t.apply({ type: 'POWER_PEEK', owner: 'carla', index: 1 }, 'ana');
    expect(peek.events).toEqual([{ type: 'Peeked', playerId: 'ana', owner: 'carla', index: 1 }]);
    expect(t.module.getPlayerView(t.state, 'ana').peek?.card.id).toBe('JK1');
    expect(t.module.getPlayerView(t.state, 'ana').seats[2]?.grid[1]?.card?.id).toBe('JK1');
    for (const other of ['bruno', 'carla']) {
      const view = t.module.getPlayerView(t.state, other);
      expect(view.peek).toBeNull();
      expect(view.power).toMatchObject({
        playerId: 'ana',
        step: 'PEEKED',
        target: { owner: 'carla', index: 1 },
      });
      expect(JSON.stringify(view)).not.toContain('JK1');
    }
    // While the card is shown, nobody owes anything: the engine ends it (the player may, earlier).
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getTimeoutMs(t.state)).toBeNull();
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([{ type: 'POWER_PEEK_DONE' }]);
    expect(t.module.getValidActions(t.state, 'bruno')).toEqual([]);
    expect(t.module.getDefaultAction(t.state, 'ana')).toBeNull();
    expectError(t.try({ type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    t.tick();
    expect(t.module.getPlayerView(t.state, 'ana').peek).toBeNull();
    expect(t.state.phase).toBe('SNAP_WINDOW');
  });

  it('a queen looks at one of the player’s own cards', () => {
    const t = table(['QH']);
    t.draw('ana');
    t.discard('ana', true);
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([
      { type: 'POWER_PEEK', owner: 'ana', index: 0 },
      { type: 'POWER_PEEK', owner: 'ana', index: 1 },
      { type: 'POWER_PEEK', owner: 'ana', index: 2 },
      { type: 'POWER_PEEK', owner: 'ana', index: 3 },
      { type: 'POWER_SKIP' },
    ]);
    expectError(t.try({ type: 'POWER_PEEK', owner: 'bruno', index: 0 }, 'ana'), 'WRONG_TARGET');
    t.apply({ type: 'POWER_PEEK', owner: 'ana', index: 0 }, 'ana');
    expect(t.module.getPlayerView(t.state, 'ana').peek?.card.id).toBe('9C');
    expect(t.module.getPlayerView(t.state, 'carla').peek).toBeNull();
    expectError(t.try({ type: 'POWER_PEEK_DONE' }, 'bruno'), 'NOT_YOUR_TURN');
    const done = t.apply({ type: 'POWER_PEEK_DONE' }, 'ana');
    expect(eventTypes(done.events)).toEqual(['PeekEnded', 'SnapWindowOpened']);
    expect(t.module.getPlayerView(t.state, 'ana').peek).toBeNull();
    expectError(t.try({ type: 'POWER_PEEK_DONE' }, 'ana'), 'NOT_YOUR_TURN');
  });

  it('gives the table time to follow a swap before the snap window counts', () => {
    const t = table(['JH']);
    t.draw('ana');
    t.discard('ana', true);
    expectError(t.try({ type: 'POWER_PEEK_DONE' }, 'ana'), 'WRONG_PHASE');
    const swap = t.apply({ type: 'POWER_BLIND_SWAP', myIndex: 3, owner: 'bruno', theirIndex: 0 }, 'ana');
    expect(swap.schedule).toEqual([
      { action: { type: 'SYS_SNAP_WINDOW_CLOSED', discardId: 1 }, delayMs: PACE.swap + 3000 },
    ]);

    const kept = table(['KS']);
    kept.draw('ana');
    kept.discard('ana', true);
    kept.apply({ type: 'POWER_PEEK', owner: 'carla', index: 1 }, 'ana');
    expect(kept.module.getValidActions(kept.state, 'ana')).not.toContainEqual({ type: 'POWER_PEEK_DONE' });
    const decided = kept.apply({ type: 'POWER_SWAP_DECISION', swap: false }, 'ana');
    expect(decided.schedule?.[0]?.delayMs).toBe(3000);
  });

  it('a jack swaps two cards to each other’s exact slot, and nobody learns a value', () => {
    const t = table(['JH']);
    t.draw('ana');
    t.discard('ana', true);
    expect(t.module.getValidActions(t.state, 'ana')).toHaveLength(4 * 8 + 1);
    expectError(t.try({ type: 'POWER_PEEK', owner: 'bruno', index: 0 }, 'ana'), 'WRONG_PHASE');
    expectError(
      t.try({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'ana', theirIndex: 1 }, 'ana'),
      'WRONG_TARGET',
    );
    expectError(
      t.try({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'bruno', theirIndex: 7 }, 'ana'),
      'EMPTY_SLOT',
    );
    expectError(
      t.try({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'x', theirIndex: 0 }, 'ana'),
      'UNKNOWN_TARGET',
    );
    const swap = t.apply({ type: 'POWER_BLIND_SWAP', myIndex: 3, owner: 'bruno', theirIndex: 0 }, 'ana');
    expect(swap.events[0]).toEqual({
      type: 'BlindSwapped',
      playerId: 'ana',
      myIndex: 3,
      owner: 'bruno',
      theirIndex: 0,
    });
    expect(t.grid('ana')).toEqual(['9C', 'KH', '2D', '4H']);
    expect(t.grid('bruno')).toEqual(['7S', 'JC', 'AS', '10D']);
    for (const viewer of ['ana', 'bruno', 'carla']) {
      const seats = t.module.getPlayerView(t.state, viewer).seats;
      expect(seats.flatMap((s) => s.grid).every((slot) => slot.card === null)).toBe(true);
    }
  });

  it('a king looks, then swaps or leaves it', () => {
    const swapped = table(['KS']);
    swapped.draw('ana');
    swapped.discard('ana', true);
    expectError(swapped.try({ type: 'POWER_SWAP_DECISION', swap: true, myIndex: 0 }, 'ana'), 'WRONG_PHASE');
    swapped.apply({ type: 'POWER_PEEK', owner: 'carla', index: 1 }, 'ana');
    expect(swapped.module.getTimeoutMs(swapped.state)).toBe(20_000);
    expectError(swapped.try({ type: 'POWER_SWAP_DECISION', swap: true }, 'ana'), 'EMPTY_SLOT');
    expectError(swapped.try({ type: 'POWER_SKIP' }, 'ana'), 'WRONG_PHASE');
    const decided = swapped.apply({ type: 'POWER_SWAP_DECISION', swap: true, myIndex: 0 }, 'ana');
    expect(decided.events[0]).toEqual({
      type: 'PeekSwapDecided',
      playerId: 'ana',
      swapped: true,
      myIndex: 0,
      owner: 'carla',
      theirIndex: 1,
    });
    expect(swapped.grid('ana')[0]).toBe('JK1');
    expect(swapped.grid('carla')[1]).toBe('9C');

    const kept = table(['KS']);
    kept.draw('ana');
    kept.discard('ana', true);
    kept.apply({ type: 'POWER_PEEK', owner: 'carla', index: 1 }, 'ana');
    kept.apply({ type: 'POWER_SWAP_DECISION', swap: false }, 'ana');
    expect(kept.grid('carla')[1]).toBe('JK1');
    expect(kept.state.phase).toBe('SNAP_WINDOW');
  });

  it('may be given up, and is ignored when its time runs out', () => {
    const skipped = table(['10S']);
    skipped.draw('ana');
    skipped.discard('ana', true);
    const skip = skipped.apply({ type: 'POWER_SKIP' }, 'ana');
    expect(eventTypes(skip.events)).toEqual(['PowerSkipped', 'SnapWindowOpened']);

    const late = table(['KS']);
    late.draw('ana');
    late.discard('ana', true);
    expect(late.module.getTimeoutAction?.(late.state)).toEqual({ type: 'SYS_TIMEOUT' });
    late.system({ type: 'SYS_TIMEOUT' });
    expect(late.state.phase).toBe('SNAP_WINDOW');

    const kingLate = table(['KS']);
    kingLate.draw('ana');
    kingLate.discard('ana', true);
    kingLate.apply({ type: 'POWER_PEEK', owner: 'bruno', index: 0 }, 'ana');
    kingLate.system({ type: 'SYS_TIMEOUT' });
    expect(kingLate.grid('bruno')[0]).toBe('4H');
    expect(kingLate.last?.events[0]).toMatchObject({ type: 'PeekSwapDecided', swapped: false });
  });

  it('cannot target a player without cards, nor an empty slot', () => {
    // Bruno snaps away all four of his cards; then nobody may target him.
    const t = emptyBruno({ ana: ['9C', 'KH', '2D', '7D'] }, ['10S', '10C']);
    expect(t.grid('bruno')).toEqual([null, null, null, null]);
    expect(t.current).toBe('ana');
    t.draw('ana');
    expect(t.state.drawn?.id).toBe('10S');
    expect(t.module.getValidActions(t.state, 'ana')).not.toContainEqual({
      type: 'DISCARD_DRAWN',
      usePower: true,
    });
    expectError(t.try({ type: 'DISCARD_DRAWN', usePower: true }, 'ana'), 'NO_TARGET');
  });
});

describe('snapping (07 §4)', () => {
  /** Ana discards the drawn card: the window is open on it. */
  const open = (top: string, deck: string[] = []) => {
    const t = table([top, ...deck], {}, { fill: false });
    t.draw('ana');
    t.discard('ana');
    return t;
  };

  it('a good snap empties the slot and puts the card on the discard pile, without a new window', () => {
    const t = open('6H');
    const hit = t.snap('carla', 0);
    expect(hit.events).toEqual([
      {
        type: 'SnapSucceeded',
        discardId: 1,
        playerId: 'carla',
        index: 0,
        card: card('6D'),
      },
    ]);
    expect(t.grid('carla')).toEqual([null, 'JK1', 'QS', '3C']);
    expect(t.state.discard.map((c) => c.id)).toEqual(['6H', '6D']);
    expect(t.state.snap?.discardId).toBe(1);
    expect(hit.schedule).toEqual([
      { action: { type: 'SYS_SNAP_WINDOW_CLOSED', discardId: 1 }, delayMs: PACE.snapHit },
    ]);
    expect(t.module.getValidActions(t.state, 'bruno')).toEqual([]);
    const view = t.module.getPlayerView(t.state, 'bruno');
    expect(view.seats[2]?.grid[0]).toEqual({ index: 0, empty: true, card: null });
    expect(view.snap).toMatchObject({ open: false, result: { playerId: 'carla', hit: true } });
  });

  it('a power card snapped away has no power', () => {
    const t = open('10S', ['QC']);
    t.snap('bruno', 3);
    t.closeWindow();
    expect(t.state.power).toBeNull();
    expect(t.state.phase).toBe('TURN_DRAW');
  });

  it('a missed snap is shown, goes back to its slot, and a penalty card comes face down in a new slot', () => {
    const t = open('8H', ['5C', '5S']);
    const miss = t.snap('bruno', 1);
    expect(miss.events).toEqual([
      expect.objectContaining({ type: 'SnapFailed', playerId: 'bruno', index: 1, penaltyIndex: 4 }),
    ]);
    expect(t.grid('bruno')).toEqual(['4H', 'JC', 'AS', '10D', '5C']);
    expect(t.state.grids.bruno?.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    for (const viewer of ['ana', 'bruno', 'carla']) {
      const grid = t.module.getPlayerView(t.state, viewer).seats[1]?.grid;
      expect(grid?.[1]?.card?.id).toBe('JC');
      expect(grid?.[4]).toEqual({ index: 4, empty: false, card: null });
    }
    t.closeWindow();
    expect(t.module.getPlayerView(t.state, 'ana').seats[1]?.grid[1]?.card).toBeNull();
  });

  it('a missed snap with an empty deck brings no penalty', () => {
    const t = open('8H');
    expect(t.state.deck).toHaveLength(0);
    t.snap('bruno', 1);
    expect(t.state.snap?.result?.penaltyIndex).toBeNull();
    expect(t.grid('bruno')).toHaveLength(4);
  });

  it('takes one snap per discard: a second, a late one or one on an empty slot is rejected', () => {
    const t = open('6H', ['5C']);
    expectError(t.try({ type: 'SNAP', discardId: 2, index: 0 }, 'carla'), 'SNAP_CLOSED');
    expectError(t.try({ type: 'SNAP', discardId: 1, index: 9 }, 'carla'), 'EMPTY_SLOT');
    t.snap('carla', 0);
    expectError(t.try({ type: 'SNAP', discardId: 1, index: 1 }, 'bruno'), 'SNAP_TAKEN');
    expectError(t.try({ type: 'SNAP', discardId: 1, index: 0 }, 'carla'), 'SNAP_TAKEN');
    t.closeWindow();
    expectError(t.try({ type: 'SNAP', discardId: 1, index: 0 }, 'bruno'), 'SNAP_CLOSED');
    expectError(t.try({ type: 'SYS_SNAP_WINDOW_CLOSED', discardId: 1 }, SYSTEM_PLAYER_ID), 'STALE_WINDOW');
  });

  it('five simultaneous snaps: exactly one counts', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f'];
    const grids = Object.fromEntries(
      players.map((id, i) => [id, [`${i + 2}S`, `${i + 2}H`, `${i + 2}D`, `${i + 2}C`]]),
    );
    const t = Table.started(grids, ['9C']);
    // The 9♣ is on the discard pile; five players snap their first card at once.
    t.draw('a');
    t.discard('a');
    const results = ['b', 'c', 'd', 'e', 'f'].map((id) => {
      const result = t.try({ type: 'SNAP', discardId: 1, index: 0 }, id);
      if (result.ok) t.state = result.state;
      return result.ok;
    });
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('matches on rank: a red king snaps a black king, a joker a joker; the player on turn may snap too', () => {
    const kings = Table.started({ ana: ['KS', '2C', '3C', '4C'], bruno: ['5C', '6C', '7C', '8C'] }, ['KH']);
    kings.draw('ana');
    kings.discard('ana');
    expect(kings.snap('ana', 0).events[0]?.type).toBe('SnapSucceeded');

    const jokers = Table.started({ ana: ['2C', '3C', '4C', '5C'], bruno: ['JK2', '6C', '7C', '8C'] }, [
      'JK1',
    ]);
    jokers.draw('ana');
    jokers.discard('ana');
    expect(jokers.snap('bruno', 0).events[0]?.type).toBe('SnapSucceeded');
  });

  it('the next player draws only when the window closes', () => {
    const t = open('8H', ['5C']);
    expect(t.current).toBeNull();
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getTimeoutMs(t.state)).toBeNull();
    expectError(t.try({ type: 'DRAW' }, 'bruno'), 'NOT_YOUR_TURN');
    const close = t.closeWindow();
    expect(eventTypes(close.events)).toEqual(['SnapWindowClosed', 'TurnStarted']);
    expect(t.current).toBe('bruno');
  });
});

describe('fixed positions (07 §5)', () => {
  it('never renumbers a grid: empty slots stay, penalties take the next index, never a reused one', () => {
    const t = Table.started({ ana: ['9C', 'KH', '2D', '7S'], bruno: ['4H', 'JC', 'AS', '10D'] }, [
      '8H',
      '5C',
      '3S',
      '6C',
      '2H',
      '9S',
    ]);
    t.draw('ana');
    t.discard('ana');
    t.snap('bruno', 0); // miss: penalty in slot 4
    t.closeWindow();
    t.draw('bruno');
    t.discard('bruno'); // the 3♠
    t.snap('bruno', 4); // the penalty card was the 5♣: miss, penalty in slot 5
    t.closeWindow();
    expect(t.state.grids.bruno?.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5]);
    t.draw('ana');
    t.discard('ana'); // the 2♥
    t.snap('ana', 2); // the 2♦: a hit, slot 2 stays as an empty slot
    t.closeWindow();
    expect(t.state.grids.ana?.map((s) => [s.index, s.card?.id ?? null])).toEqual([
      [0, '9C'],
      [1, 'KH'],
      [2, null],
      [3, '7S'],
    ]);
    expect(t.module.getPlayerView(t.state, 'bruno').seats[0]?.grid.map((s) => s.empty)).toEqual([
      false,
      false,
      true,
      false,
    ]);
  });
});

describe('Gringo (07 §6)', () => {
  const turn = (t: Table) => {
    const player = t.current as string;
    t.draw(player);
    t.discard(player);
    t.closeWindow();
  };

  it('is only possible once everyone has played enough turns, before drawing, once', () => {
    const t = table([], { gringoEnabled: true, gringoMinTurns: 2 });
    expect(t.module.getPlayerView(t.state, 'ana').gringoTurnsLeft).toBe(2);
    expectError(t.try({ type: 'CALL_GRINGO' }, 'ana'), 'GRINGO_TOO_SOON');
    for (let i = 0; i < 5; i++) turn(t);
    expect(t.current).toBe('carla');
    expect(t.module.getPlayerView(t.state, 'ana').gringoTurnsLeft).toBe(1); // Carla has 1 turn
    expectError(t.try({ type: 'CALL_GRINGO' }, 'carla'), 'GRINGO_TOO_SOON');
    turn(t);
    expect(t.module.getPlayerView(t.state, 'ana').gringoTurnsLeft).toBe(0);
    t.draw('ana');
    expectError(t.try({ type: 'CALL_GRINGO' }, 'ana'), 'WRONG_PHASE');
    t.discard('ana');
    t.closeWindow();
    expectError(t.try({ type: 'CALL_GRINGO' }, 'carla'), 'NOT_YOUR_TURN');
    t.apply({ type: 'CALL_GRINGO' }, 'bruno');
    expect(t.module.getPlayerView(t.state, 'ana').gringoTurnsLeft).toBeNull();
    expectError(t.try({ type: 'CALL_GRINGO' }, 'bruno'), 'GRINGO_ALREADY_CALLED');
    // Bruno plays, then Carla and Ana once each: then it ends.
    turn(t);
    turn(t);
    expect(t.state.phase).toBe('TURN_DRAW');
    turn(t);
    expect(t.state.phase).toBe('FINISHED');
    expect(t.state.endReason).toBe('GRINGO');
    expect(t.state.turnsPlayed).toEqual({ ana: 4, bruno: 3, carla: 3 });
  });

  it('is never possible with the option off', () => {
    const t = table([], { gringoEnabled: false, gringoMinTurns: 1 });
    for (let i = 0; i < 6; i++) turn(t);
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([{ type: 'DRAW' }]);
    expect(t.module.getPlayerView(t.state, 'ana').gringoTurnsLeft).toBeNull();
  });

  it('a player without cards is skipped, but called on turn to say it once it may be said', () => {
    const t = emptyBruno(
      { ana: ['9C', 'KH', '2D', '7D'], carla: ['6H', 'JK1', 'QS', '3C'] },
      ['9H', '9D', '10C', '10H', 'JD', 'JS', 'QC', 'QD', '2S', '2H', '3S', '3H'],
      { gringoEnabled: true, gringoMinTurns: 5 },
    );
    expect(t.grid('bruno')).toEqual([null, null, null, null]);
    // Too soon for "Gringo": Bruno is skipped until Ana and Carla have played 5 turns each.
    const seen: string[] = [];
    while (t.current !== 'bruno') {
      seen.push(t.current as string);
      plainTurn(t);
    }
    expect(seen).toEqual(['carla', 'ana', 'carla', 'ana', 'carla', 'ana']);
    expect(t.state.turnsPlayed).toMatchObject({ ana: 6, carla: 5 });
    expect(t.module.getValidActions(t.state, 'bruno')).toEqual([{ type: 'CALL_GRINGO' }, { type: 'PASS' }]);
    expectError(t.try({ type: 'DRAW' }, 'bruno'), 'NO_CARDS_LEFT');
    expect(t.module.getDefaultAction(t.state, 'bruno')).toEqual({ type: 'PASS' });
    const call = t.apply({ type: 'CALL_GRINGO' }, 'bruno');
    expect(eventTypes(call.events)).toEqual(['GringoCalled', 'TurnStarted']);
    expect(t.current).toBe('carla');
    turn(t);
    expect(t.current).toBe('ana');
    turn(t);
    expect(t.state.phase).toBe('FINISHED');
    expect(t.module.getResult(t.state).standings[0]).toMatchObject({
      playerId: 'bruno',
      score: 0,
      outcome: 'WINNER',
    });
  });

  it('a player without cards may also let the turn go, or time out', () => {
    const t = emptyBruno({ ana: ['9C', 'KH', '2D', '7D'] }, ['9H', '9D', '10C', '10H'], {
      gringoEnabled: true,
      gringoMinTurns: 1,
    });
    expect(t.current).toBe('bruno');
    const pass = t.apply({ type: 'PASS' }, 'bruno');
    expect(eventTypes(pass.events)).toEqual(['TurnPassed', 'TurnStarted']);
    turn(t);
    expect(t.current).toBe('bruno');
    t.system({ type: 'SYS_TIMEOUT' });
    expect(t.current).toBe('ana');
  });
});

describe('the end and the points (07 §7)', () => {
  it('ends as soon as the deck is empty at the end of a turn', () => {
    const t = Table.started(GRIDS, ['5H', '5C'], {}, { fill: false });
    t.draw('ana');
    t.discard('ana');
    t.closeWindow();
    t.draw('bruno');
    t.discard('bruno');
    const end = t.closeWindow();
    expect(eventTypes(end.events)).toEqual(['SnapWindowClosed', 'GameFinished']);
    expect(t.state.endReason).toBe('DECK');
    expectError(t.try({ type: 'DRAW' }, 'carla'), 'GAME_OVER');
    expect(t.module.isFinished(t.state)).toBe(true);
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([]);
    expect(t.module.getDefaultAction(t.state, 'ana')).toBeNull();
  });

  it('a penalty that empties the deck ends the game after that turn', () => {
    const t = Table.started(GRIDS, ['5H', '5C'], {}, { fill: false });
    t.draw('ana');
    t.discard('ana');
    t.snap('carla', 0);
    expect(t.state.deck).toHaveLength(0);
    t.closeWindow();
    expect(t.state.phase).toBe('FINISHED');
  });

  it('counts ace 1, numbers, jack 11, queen 12, black king 13, red king −3 or −1, joker 0', () => {
    const value = (rank: string, suit: string | null, red: -3 | -1 = -3) =>
      points({ rank, suit } as never, red);
    expect(value('A', 'S')).toBe(1);
    expect(value('7', 'H')).toBe(7);
    expect(value('10', 'C')).toBe(10);
    expect(value('J', 'D')).toBe(11);
    expect(value('Q', 'S')).toBe(12);
    expect(value('K', 'S')).toBe(13);
    expect(value('K', 'C')).toBe(13);
    expect(value('K', 'H')).toBe(-3);
    expect(value('K', 'D', -1)).toBe(-1);
    expect(value('JOKER', null)).toBe(0);
  });

  it('the fewest points win, and equal points share the place', () => {
    expect(standings({ a: 5, b: -3, c: 5, d: 9 }, ['a', 'b', 'c', 'd'])).toEqual([
      { playerId: 'b', position: 1, outcome: 'WINNER', score: -3 },
      { playerId: 'a', position: 2, outcome: 'PLACED', score: 5 },
      { playerId: 'c', position: 2, outcome: 'PLACED', score: 5 },
      { playerId: 'd', position: 4, outcome: 'PLACED', score: 9 },
    ]);
    expect(standings({ a: 4, b: 4 }, ['a', 'b']).map((s) => s.outcome)).toEqual(['WINNER', 'WINNER']);
  });
});

describe('timeouts (rules §12)', () => {
  it('a turn not drawn yet draws and discards, without the power', () => {
    const t = table(['10S']);
    expect(t.module.getTimeoutMs(t.state)).toBe(30_000);
    expect(t.module.getDefaultAction(t.state, 'ana')).toEqual({ type: 'DRAW' });
    const late = t.system({ type: 'SYS_TIMEOUT' });
    expect(eventTypes(late.events)).toEqual(['Drew', 'DiscardedDrawn', 'SnapWindowOpened']);
    expect(late.events[1]).toMatchObject({ power: null });
    expect(t.state.turnsPlayed.ana).toBe(1);
  });

  it('a drawn card is discarded without its power', () => {
    const t = table(['10S']);
    t.draw('ana');
    expect(t.module.getDefaultAction(t.state, 'ana')).toEqual({ type: 'DISCARD_DRAWN', usePower: false });
    t.system({ type: 'SYS_TIMEOUT' });
    expect(t.state.power).toBeNull();
    expect(t.state.phase).toBe('SNAP_WINDOW');
    expectError(t.try({ type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expect(t.module.getTimeoutAction?.(t.state)).toBeNull();
  });
});

describe('schemas', () => {
  it('validate the room settings and client actions', () => {
    expect(gringoConfigSchema.parse({})).toEqual({
      redKingValue: -3,
      powerSet: 'FIGURAS',
      gringoEnabled: false,
      gringoMinTurns: 5,
      snapWindowMs: 3000,
      decks: 'AUTO',
      initialPeekMs: 10_000,
      turnTimeoutMs: 30_000,
      powerTimeoutMs: 20_000,
    });
    expect(gringoConfigSchema.safeParse({ redKingValue: -2 }).success).toBe(false);
    expect(gringoConfigSchema.safeParse({ snapWindowMs: 10_000 }).success).toBe(false);
    expect(gringoActionSchema.safeParse({ type: 'SNAP', discardId: 3, index: 1 }).success).toBe(true);
    expect(gringoActionSchema.safeParse({ type: 'SYS_TIMEOUT' }).success).toBe(false);
    expect(gringoActionSchema.safeParse({ type: 'DRAW', extra: 1 }).success).toBe(false);
  });
});
