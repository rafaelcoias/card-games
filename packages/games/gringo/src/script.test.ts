/**
 * `05-GUIAO-DE-PARTIDA.md` as an executable test: Ana, Bruno and Carla
 * (clockwise), Gringo on from the first round, the default powers and a red
 * king worth −3. The snap windows and the peek are closed by the system
 * actions the server would apply on its own.
 */
import { describe, expect, it } from 'vitest';
import { PACE } from './rules';
import { Table, card, eventTypes } from './test-utils';
import type { GringoConfig } from './types';

const GRIDS = {
  ana: ['9C', 'KH', '2D', '7S'],
  bruno: ['4H', 'JC', 'AS', '10D'],
  carla: ['6D', 'JK1', 'QS', '3C'],
};
const DECK = ['10S', '5H', 'JD', '3H', 'JH', 'KD', '2C'];

const script = (cfg: Partial<GringoConfig> = {}) =>
  Table.scripted(GRIDS, DECK, { gringoEnabled: true, gringoMinTurns: 1, ...cfg });

/** The deal and the initial peek: each player sees only their own [3] and [4]. */
function dealt(cfg: Partial<GringoConfig> = {}): Table {
  const t = script(cfg);
  expect(t.state.phase).toBe('INITIAL_PEEK');
  for (const [id, cards] of Object.entries(GRIDS)) {
    const seen = t.module
      .getPlayerView(t.state, id)
      .seats.flatMap((s) => s.grid.flatMap((slot) => (slot.card ? [`${s.id}:${slot.card.id}`] : [])));
    expect(seen).toEqual([`${id}:${cards[2]}`, `${id}:${cards[3]}`]);
  }
  t.system({ type: 'SYS_INITIAL_PEEK_END' });
  expect(t.current).toBe('ana');
  return t;
}

/** Turns 1–3 of the script. */
function firstRound(t: Table): void {
  // Turn 1 — Ana draws the 10♠, discards it and looks at Bruno's [2]: the J♣, for her alone.
  t.draw('ana');
  t.discard('ana', true);
  expect(t.state.power).toMatchObject({ type: 'PEEK_OTHER', step: 'CHOOSE' });
  const peek = t.apply({ type: 'POWER_PEEK', owner: 'bruno', index: 1 }, 'ana');
  expect(peek.schedule).toEqual([{ action: { type: 'SYS_PEEK_END' }, delayMs: PACE.peek }]);
  expect(t.module.getPlayerView(t.state, 'ana').peek).toMatchObject({
    owner: 'bruno',
    index: 1,
    card: { id: 'JC' },
  });
  expect(t.module.getPlayerView(t.state, 'bruno').peek).toBeNull();
  t.tick();
  expect(t.state.phase).toBe('SNAP_WINDOW');
  // Bruno snaps his [4] (he knows it is the 10♦): right, the slot is empty.
  const snap = t.snap('bruno', 3);
  expect(eventTypes(snap.events)).toEqual(['SnapSucceeded']);
  expect(t.grid('bruno')).toEqual(['4H', 'JC', 'AS', null]);
  expect(t.try({ type: 'SNAP', discardId: 1, index: 0 }, 'carla')).toMatchObject({
    ok: false,
    error: { code: 'SNAP_TAKEN' },
  });
  t.tick();
  expect(t.current).toBe('bruno');

  // Turn 2 — Bruno draws the 5♥ and swaps it into [2]: the J♣ goes out, with no power.
  t.draw('bruno');
  const swap = t.swap('bruno', 1);
  expect(swap.events).toContainEqual(expect.objectContaining({ type: 'Swapped', discarded: card('JC') }));
  expect(t.state.power).toBeNull();
  // Carla snaps her [1] blindly: the 6♦, wrong. Shown to all, it goes back, and the J♦ comes in as [5].
  const miss = t.snap('carla', 0);
  expect(miss.events).toEqual([
    expect.objectContaining({
      type: 'SnapFailed',
      playerId: 'carla',
      index: 0,
      card: card('6D'),
      penaltyIndex: 4,
    }),
  ]);
  expect(t.module.getPlayerView(t.state, 'ana').seats[2]?.grid[0]?.card?.id).toBe('6D');
  expect(miss.schedule?.[0]?.delayMs).toBe(PACE.snapMiss);
  t.tick();
  expect(t.grid('bruno')).toEqual(['4H', '5H', 'AS', null]);
  expect(t.grid('carla')).toEqual(['6D', 'JK1', 'QS', '3C', 'JD']);
  expect(t.module.getPlayerView(t.state, 'carla').seats[2]?.grid.every((s) => s.card === null)).toBe(true);

  // Turn 3 — Carla draws the 3♥ and swaps out her Q♠. Nobody snaps.
  t.draw('carla');
  t.swap('carla', 2);
  expect(t.state.discard.at(-1)?.id).toBe('QS');
  t.closeWindow();
  expect(t.current).toBe('ana');
}

describe('example match (05-GUIAO-DE-PARTIDA)', () => {
  it('plays the script to Bruno winning with 3 points', () => {
    const t = dealt();
    firstRound(t);

    // Turn 4 — Ana says "Gringo", draws the J♥ and swaps her [1] with Carla's [2], unseen.
    expect(t.module.getValidActions(t.state, 'ana')).toContainEqual({ type: 'CALL_GRINGO' });
    const call = t.apply({ type: 'CALL_GRINGO' }, 'ana');
    expect(call.events).toEqual([{ type: 'GringoCalled', playerId: 'ana', remaining: ['bruno', 'carla'] }]);
    t.draw('ana');
    t.discard('ana', true);
    expect(t.state.power?.type).toBe('BLIND_SWAP');
    const blind = t.apply({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'carla', theirIndex: 1 }, 'ana');
    expect(JSON.stringify(blind.events.filter((e) => e.type === 'BlindSwapped'))).not.toMatch(/"id"/);
    expect(t.grid('ana')).toEqual(['JK1', 'KH', '2D', '7S']);
    expect(t.grid('carla')).toEqual(['6D', '9C', '3H', '3C', 'JD']);
    t.closeWindow();
    expect(t.state.gringo?.remaining).toEqual(['bruno', 'carla']);

    // Turn 5 — Bruno (last turn) keeps the K♦: it goes into [1] and the 4♥ goes out.
    t.draw('bruno');
    t.swap('bruno', 0);
    t.closeWindow();
    expect(t.state.gringo?.remaining).toEqual(['carla']);

    // Turn 6 — Carla (last turn) swaps the 2♣ into [5]; the J♦ goes out. The game ends.
    t.draw('carla');
    t.swap('carla', 4);
    const end = t.closeWindow();
    expect(t.state.phase).toBe('FINISHED');
    const finished = end.events.find((e) => e.type === 'GameFinished');
    expect(finished).toMatchObject({
      reason: 'GRINGO',
      scores: { ana: 6, bruno: 3, carla: 23 },
      winners: ['bruno'],
    });
    expect(t.grid('ana')).toEqual(['JK1', 'KH', '2D', '7S']);
    expect(t.grid('bruno')).toEqual(['KD', '5H', 'AS', null]);
    expect(t.grid('carla')).toEqual(['6D', '9C', '3H', '3C', '2C']);
    expect(t.module.getResult(t.state).standings).toEqual([
      { playerId: 'bruno', position: 1, outcome: 'WINNER', score: 3 },
      { playerId: 'ana', position: 2, outcome: 'PLACED', score: 6 },
      { playerId: 'carla', position: 3, outcome: 'PLACED', score: 23 },
    ]);
    // Everyone sees every card at the end.
    const view = t.module.getPlayerView(t.state, 'carla');
    expect(view.seats[0]?.grid.map((s) => s.card?.id)).toEqual(['JK1', 'KH', '2D', '7S']);
    expect(view.final).toMatchObject({ reason: 'GRINGO', winners: ['bruno'] });
  });

  it('variant: without Gringo, turns go on until the deck runs out', () => {
    const t = dealt({ gringoEnabled: false });
    firstRound(t);
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([{ type: 'DRAW' }]);
    expect(t.try({ type: 'CALL_GRINGO' }, 'ana')).toMatchObject({
      ok: false,
      error: { code: 'GRINGO_DISABLED' },
    });
    let turns = 0;
    while (t.state.phase !== 'FINISHED') {
      const player = t.current as string;
      t.draw(player);
      t.discard(player);
      t.closeWindow();
      turns += 1;
    }
    expect(t.state.deck).toHaveLength(0);
    expect(t.state.endReason).toBe('DECK');
    // 54 − 12 dealt − 3 drawn − 1 penalty = 38 more turns.
    expect(turns).toBe(38);
  });

  it('variant: a red king worth −1 makes it Ana 8, Bruno 5', () => {
    const t = dealt({ redKingValue: -1 });
    firstRound(t);
    t.apply({ type: 'CALL_GRINGO' }, 'ana');
    t.draw('ana');
    t.discard('ana', true);
    t.apply({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'carla', theirIndex: 1 }, 'ana');
    t.closeWindow();
    t.draw('bruno');
    t.swap('bruno', 0);
    t.closeWindow();
    t.draw('carla');
    t.swap('carla', 4);
    t.closeWindow();
    expect(t.module.getResult(t.state).standings.map((s) => [s.playerId, s.score])).toEqual([
      ['bruno', 5],
      ['ana', 8],
      ['carla', 23],
    ]);
  });

  it('variant: with 7 to 10, the 10♠ looks and may swap, and the J♥ has no power', () => {
    const t = dealt({ powerSet: 'SETE_A_DEZ' });
    t.draw('ana');
    t.discard('ana', true);
    expect(t.state.power?.type).toBe('PEEK_AND_SWAP');
    t.apply({ type: 'POWER_PEEK', owner: 'bruno', index: 1 }, 'ana');
    expect(t.last?.schedule).toBeUndefined(); // the king's step waits for a decision
    expect(t.module.getValidActions(t.state, 'ana')).toContainEqual({
      type: 'POWER_SWAP_DECISION',
      swap: false,
    });
    t.apply({ type: 'POWER_SWAP_DECISION', swap: false }, 'ana');
    t.closeWindow();
    for (const player of ['bruno', 'carla']) {
      t.draw(player);
      t.discard(player);
      t.closeWindow();
    }
    // Ana's next card is the 3♥, then Bruno's the J♥: no power to use.
    t.draw('ana');
    t.discard('ana');
    t.closeWindow();
    t.draw('bruno');
    expect(t.state.drawn?.id).toBe('JH');
    expect(t.module.getValidActions(t.state, 'bruno')).not.toContainEqual({
      type: 'DISCARD_DRAWN',
      usePower: true,
    });
    expect(t.try({ type: 'DISCARD_DRAWN', usePower: true }, 'bruno')).toMatchObject({
      ok: false,
      error: { code: 'NO_POWER' },
    });
  });
});
