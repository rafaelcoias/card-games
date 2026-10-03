import { SYSTEM_PLAYER_ID, createSeededRng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { olho, resultOf } from './module';
import { PACE } from './rules';
import { Table, config, eventTypes, expectError, queuedRng } from './test-utils';
import type { OlhoState } from './types';

const sortedIds = (...list: string[]) => [...list].sort();
const noPowerBan = { firstTrickNoPower: false };

describe('deal and start (07 §1)', () => {
  it.each([3, 4, 5, 6, 7, 8])('deals all 54 cards to %i players, at most one apart', (n) => {
    const players = Array.from({ length: n }, (_, i) => `p${i}`);
    const state = olho.setup(players, config(), createSeededRng(`deal-${n}`));
    const sizes = players.map((id) => state.hands[id]!.length);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(54);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(new Set(players.flatMap((id) => state.hands[id]!.map((c) => c.id))).size).toBe(54);
    expect(state.phase).toBe('PLAYING');
    expect(state.gameNumber).toBe(1);
    const holder = players.find((id) => state.hands[id]!.some((c) => c.id === '3C'));
    expect(olho.getCurrentPlayer(state)).toBe(holder);
  });

  it('draws who gets the extra cards, game after game', () => {
    const players = ['a', 'b', 'c', 'd'];
    const extra = new Set<string>();
    for (let game = 0; game < 30; game++) {
      const state = olho.setup(players, config(), createSeededRng(`extra-${game}`));
      for (const id of players) if (state.hands[id]!.length === 14) extra.add(id);
    }
    expect([...extra].sort()).toEqual(players);
  });

  it('keeps room seats: clockwise is seat order', () => {
    const state = olho.setup(['x', 'y', 'z'], config(), queuedRng(), { seats: [5, 0, 2] });
    expect(state.seats).toEqual(['y', 'z', 'x']);
    expect(() => olho.setup(['x', 'y', 'z'], config(), queuedRng(), { seats: [0, 0, 1] })).toThrow();
    expect(() => olho.setup(['x', 'y'], config(), queuedRng())).toThrow(RangeError);
    expect(() => olho.setup(['x', 'x', 'y'], config(), queuedRng())).toThrow();
  });

  it('opens with the next player able to when the 3♣ is missing and the first may only play 2s/jokers', () => {
    const t = Table.scripted([{ a: ['2S', 'JK1'], b: ['4D', '5D'], c: ['6D', '7D'] }]);
    expect(t.current).toBe('b');
  });

  it('lifts the first-trick ban when nobody could open otherwise (tiny decks only)', () => {
    const t = Table.scripted([{ a: ['2S', 'JK1'], b: ['2H', '2D'], c: ['JK2', '2C'] }]);
    expect(t.state.trick.isFirstOfGame).toBe(false);
    expect(t.current).toBe('a');
  });
});

describe('turns and passing', () => {
  const hands = {
    a: ['3C', '8S', 'KH'],
    b: ['4C', '9S', 'QH'],
    c: ['5C', '6D', 'AH'],
    d: ['6C', '7D', 'JH'],
  };

  it('rejects malformed plays and plays out of turn', () => {
    const t = Table.scripted([hands]);
    expectError(t.try({ type: 'PASS' }, 'a'), 'MUST_OPEN');
    expectError(t.try({ type: 'PLAY', cardIds: ['4C'] }, 'b'), 'NOT_YOUR_TURN');
    expectError(t.try({ type: 'PLAY', cardIds: ['KS'] }, 'a'), 'INVALID_CARD');
    expectError(t.try({ type: 'PLAY', cardIds: ['3C', '3C'] }, 'a'), 'INVALID_CARD');
    expectError(t.try({ type: 'PLAY', cardIds: ['3C', '8S'] }, 'a'), 'MIXED_RANKS');
    expectError(t.try({ type: 'PLAY', cardIds: ['3C'] }, 'nobody'), 'NOT_SEATED');
    expectError(t.try({ type: 'PLAY', cardIds: ['3C'] }, SYSTEM_PLAYER_ID), 'NOT_SEATED');
    expectError(t.try({ type: 'SYS_NEXT_GAME' }, 'a'), 'SYSTEM_ONLY');
    expectError(t.try({ type: 'ESCAPE', cardIds: ['3C'] }, 'a'), 'NO_SKIP');
    expectError(t.try({ type: 'ACCEPT_SKIP' }, 'a'), 'NO_SKIP');
    expectError(t.try({ type: 'RETURN_CARDS', cardIds: ['3C'] }, 'a'), 'NO_EXCHANGE');
  });

  it('keeps whoever passed out of the trick', () => {
    const t = Table.scripted([hands]);
    t.play('a', '3C');
    t.pass('b');
    t.play('c', '5C');
    t.play('d', '6C');
    t.play('a', '8S');
    expect(t.current).toBe('c');
    expectError(t.try({ type: 'PLAY', cardIds: ['9S'] }, 'b'), 'NOT_YOUR_TURN');
    expect(t.module.getValidActions(t.state, 'c')).toEqual([
      { type: 'PLAY', cardIds: ['AH'] },
      { type: 'PASS' },
    ]);
    expect(t.module.getValidActions(t.state, 'b')).toEqual([]);
    expect(t.module.getDefaultAction(t.state, 'c')).toEqual({ type: 'PASS' });
    expect(t.module.getDefaultAction(t.state, 'b')).toBeNull();
    expect(t.module.getTimeoutMs(t.state)).toBe(30_000);
    expect(t.module.getPlayerView(t.state, 'a').seats.find((s) => s.id === 'b')?.passed).toBe(true);
  });

  it('closes when everyone else passed and the last to play opens (with a pause)', () => {
    const t = Table.scripted([hands]);
    t.play('a', '3C');
    t.play('b', '4C');
    t.play('c', '5C');
    t.play('d', 'JH');
    t.pass('a');
    t.pass('b');
    const closed = t.pass('c');
    expect(closed.events.at(-1)).toEqual({
      type: 'TrickClosed',
      winnerId: 'd',
      leaderId: 'd',
      reason: 'ALL_PASSED',
    });
    expect(closed.schedule).toEqual([{ action: { type: 'SYS_CLOSE_TRICK' }, delayMs: PACE.close }]);
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getTimeoutMs(t.state)).toBeNull();
    expectError(t.try({ type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    const cleared = t.clear();
    expect(cleared.events).toEqual([{ type: 'TrickCleared', number: 2, leaderId: 'd' }]);
    expect(t.state.discard).toHaveLength(4);
    expect(t.state.trick).toMatchObject({ number: 2, isFirstOfGame: false, plays: [], passed: [] });
    expect(t.current).toBe('d');
    expectError(t.try({ type: 'SYS_CLOSE_TRICK' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });

  it('plays the lowest card allowed when the opener runs out of time, and passes for a follower', () => {
    const t = Table.scripted([hands]);
    t.system({ type: 'SYS_TIMEOUT' });
    expect(t.state.trick.plays[0]?.cards.map((c) => c.id)).toEqual(['3C']);
    t.system({ type: 'SYS_TIMEOUT' });
    expect(t.state.trick.passed).toEqual(['b']);
  });
});

describe('skips (07 §3)', () => {
  it('skips the next player without the card; they stay in the trick', () => {
    const t = Table.scripted([
      { a: ['3C', '5S', 'KH'], b: ['5H', '9S', 'QH'], c: ['4D', '6D', 'AH'], d: ['7C', '8D', 'JH'] },
    ]);
    t.play('a', '5S');
    const equal = t.play('b', '5H');
    expect(eventTypes(equal.events)).toEqual(['Played', 'Skipped']);
    expect(equal.events[1]).toEqual({ type: 'Skipped', playerId: 'c' });
    expect(t.current).toBe('d');
    expect(t.state.trick.passed).toEqual([]);
    t.play('d', '8D');
    t.play('a', 'KH');
    t.pass('b');
    expect(t.current).toBe('c');
    t.play('c', 'AH');
  });

  it('lets the target escape with the same card, or be skipped; nothing else', () => {
    const hands = {
      a: ['3C', '5S', 'KH'],
      b: ['5H', '9S', 'QH'],
      c: ['5D', '6D', 'AH'],
      d: ['7C', '8D', 'JH'],
    };
    const t = Table.scripted([hands]);
    t.play('a', '5S');
    const pending = t.play('b', '5H');
    expect(pending.events.at(-1)).toEqual({ type: 'SkipPending', targetId: 'c', rank: '5', count: 1 });
    expect(t.current).toBe('c');
    expect(t.module.getValidActions(t.state, 'c')).toEqual([
      { type: 'ESCAPE', cardIds: ['5D'] },
      { type: 'ACCEPT_SKIP' },
    ]);
    expect(t.module.getTimeoutMs(t.state)).toBe(5_000);
    expect(t.module.getDefaultAction(t.state, 'c')).toEqual({ type: 'ACCEPT_SKIP' });
    expect(t.module.getPlayerView(t.state, 'c').skipPrompt).toEqual({ rank: '5', count: 1 });
    expect(t.module.getPlayerView(t.state, 'd').skipPrompt).toBeNull();
    expect(t.module.getPlayerView(t.state, 'd').trick.skip).toEqual({ targetId: 'c', rank: '5', count: 1 });
    expectError(t.try({ type: 'PLAY', cardIds: ['AH'] }, 'c'), 'ESCAPE_OR_SKIP');
    expectError(t.try({ type: 'PASS' }, 'c'), 'ESCAPE_OR_SKIP');
    expectError(t.try({ type: 'ESCAPE', cardIds: ['6D'] }, 'c'), 'ESCAPE_SAME_CARD');
    expectError(t.try({ type: 'ESCAPE', cardIds: ['9S'] }, 'c'), 'INVALID_CARD');

    // Escaping is a play of the same card: it skips the next one in turn.
    const escaped = Table.scripted([hands]);
    escaped.play('a', '5S');
    escaped.play('b', '5H');
    const chain = escaped.escape('c', '5D');
    expect(eventTypes(chain.events)).toEqual(['Escaped', 'Skipped']);
    expect(chain.events[1]).toEqual({ type: 'Skipped', playerId: 'd' });
    expect(escaped.current).toBe('a');
    expect(escaped.state.trick.sameRankRun).toEqual({ rank: '5', cards: 3 });

    // Letting it happen, or the 5 s running out, skips the target only.
    const accepted = Table.scripted([hands]);
    accepted.play('a', '5S');
    accepted.play('b', '5H');
    expect(accepted.acceptSkip('c').events).toEqual([{ type: 'Skipped', playerId: 'c' }]);
    expect(accepted.current).toBe('d');
    const timedOut = Table.scripted([hands]);
    timedOut.play('a', '5S');
    timedOut.play('b', '5H');
    timedOut.system({ type: 'SYS_TIMEOUT' });
    expect(timedOut.current).toBe('d');
  });

  it('always skips with sameCardEscape off', () => {
    const t = Table.scripted(
      [{ a: ['3C', '5S', 'KH'], b: ['5H', '9S', 'QH'], c: ['5D', '6D', 'AH'], d: ['7C', '8D', 'JH'] }],
      { sameCardEscape: false },
    );
    t.play('a', '5S');
    expect(t.play('b', '5H').events.at(-1)).toEqual({ type: 'Skipped', playerId: 'c' });
    expect(t.current).toBe('d');
  });

  it('skips on equal pairs too (count 2)', () => {
    const t = Table.scripted([{ a: ['3C', '9S', '9H'], b: ['9D', '9C', 'QH'], c: ['4D', '6D', 'AH'] }], {
      fourOfAKindCuts: false,
    });
    t.play('a', '9S', '9H');
    const equal = t.play('b', '9D', '9C');
    expect(equal.events.at(-1)).toEqual({ type: 'Skipped', playerId: 'c' });
    expect(t.current).toBe('a');
    // Back to whoever played last through a pass: the trick is theirs.
    const closed = t.pass('a');
    expect(closed.events.at(-1)).toMatchObject({ type: 'TrickClosed', winnerId: 'b' });
  });

  it('never skips on 2s: a 2 cannot answer a 2, only more 2s or a joker', () => {
    const t = Table.scripted(
      [{ a: ['3C', '2S', '9S'], b: ['2H', '2D', '4H'], c: ['2C', '6D', '5S'] }],
      noPowerBan,
    );
    t.play('a', '3C');
    t.play('b', '4H');
    t.play('c', '5S');
    t.play('a', '2S');
    expectError(t.try({ type: 'PLAY', cardIds: ['2H'] }, 'b'), 'NOT_ENOUGH_TWOS');
    const beaten = t.play('b', '2H', '2D');
    expect(eventTypes(beaten.events)).not.toContain('SkipPending');
    expect(eventTypes(beaten.events)).not.toContain('Skipped');
    expect(t.current).toBe('c');
  });
});

describe('cuts (07 §4)', () => {
  it('cuts with a joker; the cutter opens the next trick', () => {
    const t = Table.scripted(
      [{ a: ['3C', '8S', 'KH'], b: ['JK1', '4D', '9H'], c: ['5C', '6D', '7D'] }],
      noPowerBan,
    );
    t.play('a', '3C');
    const cut = t.play('b', 'JK1');
    expect(cut.events).toEqual([
      { type: 'Played', playerId: 'b', cards: [expect.objectContaining({ id: 'JK1' })] },
      { type: 'Cut', playerId: 'b', reason: 'JOKER' },
      { type: 'TrickClosed', winnerId: 'b', leaderId: 'b', reason: 'JOKER' },
    ]);
    expect(t.state.trick.sameRankRun).toBeNull();
    expect(cut.schedule).toEqual([{ action: { type: 'SYS_CLOSE_TRICK' }, delayMs: PACE.cut }]);
    t.clear();
    expect(t.current).toBe('b');
  });

  it('cuts with four of a kind at once, even with fourOfAKindCuts off', () => {
    const t = Table.scripted(
      [{ a: ['3C', '5S', '5H', '5D', '5C', '8S'], b: ['4D', '9H'], c: ['6D', '7D'] }],
      { fourOfAKindCuts: false },
    );
    expect(t.play('a', '5S', '5H', '5D', '5C').events).toContainEqual({
      type: 'Cut',
      playerId: 'a',
      reason: 'QUAD',
    });
    t.clear();
    expect(t.current).toBe('a');
  });

  it('cuts with four 2s at once on a single card', () => {
    const t = Table.scripted(
      [{ a: ['3C', '9S', 'KH'], b: ['2S', '2H', '2D', '2C', '4D'], c: ['6D', '7D'] }],
      noPowerBan,
    );
    t.play('a', '9S');
    expect(t.play('b', '2S', '2H', '2D', '2C').events).toContainEqual({
      type: 'Cut',
      playerId: 'b',
      reason: 'QUAD',
    });
  });

  it('cuts with four of a rank in a row over plays (pair + pair), before any skip', () => {
    const t = Table.scripted([{ a: ['3C', '7S', '7H'], b: ['7D', '7C', '9H'], c: ['6D', '8D'] }]);
    t.play('a', '7S', '7H');
    const four = t.play('b', '7D', '7C');
    expect(eventTypes(four.events)).toEqual(['Played', 'Cut', 'TrickClosed']);
    expect(four.events[1]).toEqual({ type: 'Cut', playerId: 'b', reason: 'FOUR_IN_A_ROW' });
  });

  it('lets 2s beat a play without closing the trick: a joker can still take it', () => {
    const t = Table.scripted([{ a: ['3C', '9S', 'KH'], b: ['2S', '4D'], c: ['JK1', '6D'] }], noPowerBan);
    t.play('a', '9S');
    t.play('b', '2S');
    expect(t.state.trick).toMatchObject({ count: 1, topRank: '2', closing: null });
    expect(t.current).toBe('c');
    expect(t.play('c', 'JK1').events).toContainEqual({ type: 'Cut', playerId: 'c', reason: 'JOKER' });
  });

  it('turns a trick of pairs into single cards after a single 2', () => {
    const t = Table.scripted([{ a: ['3C', 'KS', 'KH'], b: ['2S', '4D'], c: ['AD', 'AC', '6D'] }], noPowerBan);
    t.play('a', 'KS', 'KH');
    t.play('b', '2S');
    expect(t.state.trick.count).toBe(1);
    expect(t.module.getValidActions(t.state, 'c')).toEqual([{ type: 'PASS' }]);
  });
});

describe('closing and who opens (07 §5)', () => {
  it('passes the opening to the next player in the game when the cutter just ran out of cards', () => {
    const t = Table.scripted([{ a: ['3C', 'JK1'], b: ['4D', '5D'], c: ['6D', '7D'] }], noPowerBan);
    t.play('a', '3C');
    t.play('b', '4D');
    t.play('c', '6D');
    const out = t.play('a', 'JK1');
    expect(out.events).toContainEqual({ type: 'PlayerFinished', playerId: 'a', position: 1 });
    expect(out.events.at(-1)).toEqual({ type: 'TrickClosed', winnerId: 'a', leaderId: 'b', reason: 'JOKER' });
    t.clear();
    expect(t.current).toBe('b');
  });
});

describe('finishing, roles and points (07 §6)', () => {
  it('ranks five players and gives P, VP, N, VO, O', () => {
    const t = Table.scripted([{ a: ['3C'], b: ['4C'], c: ['5C'], d: ['6C'], e: ['7C'] }]);
    for (const [id, card] of [
      ['a', '3C'],
      ['b', '4C'],
      ['c', '5C'],
      ['d', '6C'],
    ] as const) {
      t.play(id, card);
    }
    expect(t.state.phase).toBe('GAME_SUMMARY');
    expect(t.state.lastGame?.roles).toEqual({
      a: 'PRESIDENTE',
      b: 'VICE_PRESIDENTE',
      c: 'NEUTRO',
      d: 'VICE_OLHO',
      e: 'OLHO',
    });
    expect(t.state.roster.map((p) => p.points)).toEqual([2, 1, 0, -1, -2]);
    expect(t.last?.schedule).toEqual([{ action: { type: 'SYS_NEXT_GAME' }, delayMs: PACE.summary }]);
    expect(t.module.getCurrentPlayer(t.state)).toBeNull();
    expectError(t.try({ type: 'PLAY', cardIds: ['7C'] }, 'e'), 'WRONG_PHASE');
  });

  it('adds points up over games and counts Presidentes and Olhos', () => {
    const t = new Table(olho, olho.setup(['a', 'b', 'c', 'd'], config(), createSeededRng('points')));
    t.autoUntil((s) => s.gamesCompleted === 3);
    const rows = t.module.getPlayerView(t.state, 'a').session;
    expect(rows.reduce((sum, r) => sum + r.points, 0)).toBe(0);
    expect(rows.every((r) => r.gamesPlayed === 3)).toBe(true);
    expect(rows.reduce((sum, r) => sum + r.presidentCount, 0)).toBe(3);
    expect(rows.reduce((sum, r) => sum + r.olhoCount, 0)).toBe(3);
    expect(rows.map((r) => r.points)).toEqual([...rows.map((r) => r.points)].sort((x, y) => y - x));
  });

  it('with allowFinishWithPower off, refuses a last 2 and blocks whoever keeps one; the opening moves on', () => {
    const t = Table.scripted([{ a: ['3C', '2S', '2H'], b: ['4D', '9D'], c: ['6D', '7D'] }], {
      ...noPowerBan,
      allowFinishWithPower: false,
    });
    t.play('a', '3C');
    t.play('b', '4D');
    t.play('c', '6D');
    expectError(t.try({ type: 'PLAY', cardIds: ['2S', '2H'] }, 'a'), 'CANNOT_FINISH_WITH_POWER');
    expect(t.play('a', '2S').events).toContainEqual({ type: 'PlayerBlocked', playerId: 'a' });
    t.pass('b');
    t.pass('c');
    t.clear();
    expect(t.current).toBe('b');
    expect(t.module.getPlayerView(t.state, 'c').seats[0]).toMatchObject({ id: 'a', blocked: true });
  });

  it('ends when everyone holding cards is blocked: fewer cards first, ties drawn from the seed', () => {
    const play = () => {
      const t = Table.scripted([{ a: ['3C', '4C'], b: ['2S', '5D'], c: ['JK1', '6D'] }], {
        ...noPowerBan,
        allowFinishWithPower: false,
      });
      t.play('a', '3C');
      t.play('b', '5D');
      t.play('c', '6D');
      t.pass('a');
      t.clear();
      expect(t.current).toBe('a');
      t.play('a', '4C');
      return t.state;
    };
    const state = play();
    expect(state.phase).toBe('GAME_SUMMARY');
    const order = state.lastGame?.order ?? [];
    expect(order[0]).toBe('a');
    expect(order.slice(1).sort()).toEqual(['b', 'c']);
    expect(play().lastGame?.order).toEqual(order);
  });
});

/** Game 1 with three players ends a, c, b: Ana Presidente, Carla Neutra, Bruno Olho. */
const THREE: Record<string, string[]>[] = [
  { a: ['3C'], b: ['4C', '5C'], c: ['6C', '7C', '8C'] },
  { a: ['3D', '4D', '5D'], b: ['JK1', '2S', '6S'], c: ['7S', '8S', '9S'] },
];

function throughGameOne(t: Table): void {
  t.play('a', '3C');
  t.play('b', '4C');
  t.play('c', '6C');
  t.pass('b');
  t.clear();
  t.play('c', '7C');
  t.pass('b');
  t.clear();
  t.play('c', '8C');
  expect(t.state.lastGame?.order).toEqual(['a', 'c', 'b']);
}

describe('the exchange (07 §7)', () => {
  it('with three players only the Olho and the Presidente swap; any cards may go back', () => {
    const t = Table.scripted(THREE);
    throughGameOne(t);
    const dealt = t.runScheduled();
    expect(dealt.events[0]).toMatchObject({
      type: 'GameDealt',
      leaderId: null,
      exchange: [{ giver: 'b', receiver: 'a', count: 2 }],
    });
    expect(dealt.schedule).toEqual([{ action: { type: 'SYS_EXCHANGE_GIVE' }, delayMs: PACE.exchangeGive }]);
    expect(t.module.getPlayerView(t.state, 'b').exchange?.mine).toMatchObject({
      side: 'GIVER',
      partnerId: 'a',
      given: [{ id: 'JK1' }, { id: '2S' }],
      mustReturn: false,
    });
    expect(t.module.getPlayerView(t.state, 'a').exchange?.mine).toMatchObject({
      side: 'RECEIVER',
      given: null,
    });
    expect(t.module.getPlayerView(t.state, 'c').exchange?.mine).toBeNull();
    expectError(t.try({ type: 'PLAY', cardIds: ['7S'] }, 'c'), 'WRONG_PHASE');
    expectError(t.try({ type: 'RETURN_CARDS', cardIds: ['3D', '4D'] }, 'a'), 'NO_EXCHANGE');
    expectError(t.try({ type: 'SYS_EXCHANGE_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');

    t.runScheduled();
    expect(t.hand('a')).toEqual(sortedIds('3D', '4D', '5D', 'JK1', '2S'));
    expect(t.module.getPlayerView(t.state, 'a').exchange?.mine).toMatchObject({
      given: [{ id: 'JK1' }, { id: '2S' }],
      mustReturn: true,
    });
    expect(t.module.getValidActions(t.state, 'a')).toEqual([{ type: 'RETURN_CARDS', cardIds: ['3D', '4D'] }]);
    expect(t.module.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_EXCHANGE_TIMEOUT' });
    expectError(t.try({ type: 'RETURN_CARDS', cardIds: ['3D'] }, 'a'), 'RETURN_COUNT');
    expectError(t.try({ type: 'RETURN_CARDS', cardIds: ['9S', '3D'] }, 'a'), 'INVALID_CARD');
    expectError(t.try({ type: 'RETURN_CARDS', cardIds: ['7S'] }, 'c'), 'NO_EXCHANGE');

    const done = t.giveBack('a', 'JK1', '3D');
    expect(eventTypes(done.events)).toEqual(['ExchangeReturned', 'ExchangeDone']);
    expect(done.events[1]).toEqual({ type: 'ExchangeDone', leaderId: 'b' });
    expect(t.hand('b')).toEqual(sortedIds('6S', 'JK1', '3D'));
    expect(t.current).toBe('b');
    expect(t.module.getPlayerView(t.state, 'b').exchange).toMatchObject({
      stage: 'DONE',
      mine: { returned: [{ id: 'JK1' }, { id: '3D' }] },
    });
    // The recap goes with the first trick.
    t.play('b', '3D');
    t.pass('c');
    t.pass('a');
    t.clear();
    expect(t.state.exchange).toBeNull();
  });

  it('gives back the lowest cards when the time runs out', () => {
    const t = Table.scripted(THREE);
    throughGameOne(t);
    t.runScheduled();
    t.runScheduled();
    const timeout = t.system({ type: 'SYS_EXCHANGE_TIMEOUT' });
    expect(timeout.events[0]).toEqual({
      type: 'ExchangeReturned',
      giver: 'b',
      receiver: 'a',
      count: 2,
      auto: true,
    });
    expect(t.hand('b')).toEqual(sortedIds('6S', '3D', '4D'));
    expect(t.state.phase).toBe('PLAYING');
  });
});

describe('the session (07 §9)', () => {
  it('seats a newcomer for the next game, without a role', () => {
    const t = Table.scripted([
      { a: ['3C'], b: ['4C', '5C'], c: ['6C', '7C', '8C'] },
      { a: ['3D', '4D'], b: ['5D', '6D'], c: ['7D', '8D'], e: ['9D', '10D'] },
    ]);
    const joined = t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'e', seatIndex: 5 });
    expect(joined.events).toEqual([{ type: 'PlayerJoined', playerId: 'e', seatIndex: 5 }]);
    expect(t.module.getSeatedPlayers?.(t.state)).toEqual(['a', 'b', 'c', 'e']);
    const view = t.module.getPlayerView(t.state, 'e');
    expect(view.me).toEqual({ id: 'e', hand: [], role: null, waiting: true });
    expect(view.seats.map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(view.waiting).toEqual(['e']);
    expectError(t.try({ type: 'PASS' }, 'e'), 'NEXT_GAME');
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'e', seatIndex: 6 }, SYSTEM_PLAYER_ID),
      'ALREADY_SEATED',
    );
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'f', seatIndex: 1 }, SYSTEM_PLAYER_ID),
      'SEAT_TAKEN',
    );
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'f', seatIndex: 9 }, SYSTEM_PLAYER_ID),
      'INVALID_SEAT',
    );

    t.autoUntil((s) => s.gameNumber === 2);
    expect(t.state.seats).toEqual(['a', 'b', 'c', 'e']);
    expect(t.state.waiting).toEqual([]);
    expect(t.module.getPlayerView(t.state, 'e').me?.role).toBeNull();
    expect(t.state.exchange?.pairs.every((p) => p.giver !== 'e' && p.receiver !== 'e')).toBe(true);
  });

  it('passes for whoever leaves mid-game, gives them the worst free place and frees the seat at the end', () => {
    const t = Table.scripted([
      { a: ['3C', '9S', 'KH'], b: ['4D', '10S', 'QH'], c: ['5D', 'JS', 'AH'], d: ['6D', '8S', '7H'] },
      { b: ['3H', '4H'], c: ['5H', '6H'], e: ['7S', '8H'] },
    ]);
    t.play('a', '3C');
    t.play('b', '4D');
    const away = t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'd' });
    expect(away.events).toEqual([{ type: 'PlayerLeaving', playerId: 'd', position: 4 }]);
    expect(t.current).toBe('c');
    t.play('c', '5D');
    expect(t.current).toBe('a'); // Duarte is passed over
    const current = t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    expect(current.events).toEqual([{ type: 'PlayerLeaving', playerId: 'a', position: 3 }]);
    expect(t.current).toBe('b');
    expect(t.module.getSeatedPlayers?.(t.state)).toEqual(['a', 'b', 'c', 'd']);
    expect(t.module.getPlayerView(t.state, 'b').seats.find((s) => s.id === 'd')).toMatchObject({
      leaving: true,
      finishedPosition: 4,
    });
    expect(t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' }).events).toEqual([]);

    t.pass('b');
    t.clear();
    t.autoUntil((s) => s.phase === 'GAME_SUMMARY');
    expect(t.state.lastGame?.order).toEqual(['c', 'b', 'a', 'd']);
    expect(t.last?.events.filter((e) => e.type === 'PlayerLeft')).toEqual([
      { type: 'PlayerLeft', playerId: 'd' },
      { type: 'PlayerLeft', playerId: 'a' },
    ]);
    expect(t.module.getSeatedPlayers?.(t.state)).toEqual(['b', 'c']);

    // Two left: the table waits for a third player.
    const waiting = t.runScheduled();
    expect(waiting.events).toEqual([{ type: 'WaitingForPlayers', seated: 2 }]);
    expect(t.state.phase).toBe('WAITING');
    expect(waiting.schedule).toBeUndefined();
    expectError(t.try({ type: 'SYS_NEXT_GAME' }, SYSTEM_PLAYER_ID), 'NOT_ENOUGH_PLAYERS');
    const joined = t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'e', seatIndex: 3 });
    expect(joined.schedule).toEqual([{ action: { type: 'SYS_NEXT_GAME' }, delayMs: PACE.waiting }]);
    t.runScheduled();
    // Nobody to swap with (the Olho and the Vice-olho left); the worst placed still here opens.
    expect(t.state.phase).toBe('PLAYING');
    expect(t.state.seats).toEqual(['b', 'c', 'e']);
    expect(t.current).toBe('b');
  });

  it('ends the game at once when the last opponent leaves', () => {
    const t = Table.scripted([{ a: ['3C', '9S'], b: ['4D', '10S'], c: ['5D', 'JS'] }]);
    t.play('a', '3C');
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'b' });
    const end = t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'c' });
    expect(eventTypes(end.events)).toEqual(['PlayerLeaving', 'GameEnded', 'PlayerLeft', 'PlayerLeft']);
    expect(t.state.lastGame?.order).toEqual(['a', 'c', 'b']);
  });

  it('takes back someone who left and returns before the game ends', () => {
    const t = Table.scripted([
      { a: ['3C', '9S', 'KH'], b: ['4D', '10S', 'QH'], c: ['5D', 'JS', 'AH'], d: ['6D', '8S', '7H'] },
    ]);
    t.play('a', '3C');
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'd' });
    const back = t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'd', seatIndex: 3 });
    expect(back.events).toEqual([{ type: 'PlayerJoined', playerId: 'd', seatIndex: 3 }]);
    expect(t.state.leaving).toEqual([]);
    t.play('b', '4D');
    t.play('c', '5D');
    expect(t.current).toBe('d');
  });

  it('frees a seat at once between games, and keeps the points of whoever comes back', () => {
    const t = Table.scripted(THREE);
    throughGameOne(t);
    expect(t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' }).events).toEqual([
      { type: 'PlayerLeft', playerId: 'a' },
    ]);
    expect(t.state.seats).toEqual(['b', 'c']);
    expectError(t.try({ type: 'SYS_PLAYER_LEFT', playerId: 'a' }, SYSTEM_PLAYER_ID), 'NOT_SEATED');
    t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'a', seatIndex: 4 });
    expect(t.state.roster.find((p) => p.playerId === 'a')).toMatchObject({
      points: 2,
      role: null,
      seatIndex: 4,
      seated: true,
    });
    expect(t.state.waiting).toEqual(['a']);
  });

  it('lets a waiting newcomer get up before playing; they have no result', () => {
    const t = Table.scripted(THREE);
    t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'e', seatIndex: 5 });
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'e' });
    expect(t.state.waiting).toEqual([]);
    throughGameOne(t);
    t.system({ type: 'SYS_END_SESSION' });
    expect(t.module.getResult(t.state).standings.map((s) => s.playerId)).toEqual(['a', 'c', 'b']);
  });

  it('ends the session when the host says so: the game in play does not count', () => {
    const t = Table.scripted(THREE);
    throughGameOne(t);
    t.runScheduled();
    t.runScheduled();
    const end = t.system({ type: 'SYS_END_SESSION' });
    expect(end.events).toEqual([{ type: 'SessionFinished', games: 1 }]);
    expect(end.schedule).toBeUndefined();
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getResult(t.state).standings).toEqual([
      { playerId: 'a', position: 1, outcome: 'WINNER', score: 2 },
      { playerId: 'c', position: 2, outcome: 'PLACED', score: 0 },
      { playerId: 'b', position: 3, outcome: 'LOSER', score: -2 },
    ]);
    expectError(t.try({ type: 'SYS_END_SESSION' }, SYSTEM_PLAYER_ID), 'SESSION_OVER');
    expectError(t.try({ type: 'PASS' }, 'a'), 'SESSION_OVER');
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'z', seatIndex: 6 }, SYSTEM_PLAYER_ID),
      'SESSION_OVER',
    );
  });

  it('has no result before a game is completed, and no winner when everyone is level', () => {
    const t = Table.scripted(THREE);
    t.system({ type: 'SYS_END_SESSION' });
    expect(t.module.getResult(t.state).standings).toEqual([]);

    const level: OlhoState = {
      ...t.state,
      roster: t.state.roster.map((p) => ({ ...p, points: 0, gamesPlayed: 1 })),
    };
    expect(resultOf(level).standings.map((s) => s.outcome)).toEqual(['PLACED', 'PLACED', 'PLACED']);
    expect(resultOf(level).standings.map((s) => s.position)).toEqual([1, 1, 1]);
  });

  it('gives back the lowest cards for a receiver who leaves during the exchange', () => {
    const t = Table.scripted(THREE);
    throughGameOne(t);
    t.runScheduled();
    t.runScheduled();
    const left = t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    expect(eventTypes(left.events)).toEqual(['PlayerLeaving', 'ExchangeReturned', 'ExchangeDone']);
    expect(t.state.phase).toBe('PLAYING');
  });

  it('lets a receiver who left before the cards arrive give back the lowest ones at once', () => {
    const t = Table.scripted(THREE);
    throughGameOne(t);
    t.runScheduled();
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    const given = t.system({ type: 'SYS_EXCHANGE_GIVE' });
    expect(eventTypes(given.events)).toEqual(['ExchangeGiven', 'ExchangeReturned', 'ExchangeDone']);
  });
});

describe('module wiring', () => {
  it('validates client actions with the schema and leaves system actions out', () => {
    const { actionSchema } = olho;
    expect(actionSchema.safeParse({ type: 'PLAY', cardIds: ['7S', '7H'] }).success).toBe(true);
    expect(actionSchema.safeParse({ type: 'PLAY', cardIds: [] }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'PLAY', cardIds: ['7X'] }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'RETURN_CARDS', cardIds: ['7S', '7H', '7D'] }).success).toBe(false);
    expect(actionSchema.safeParse({ type: 'SYS_NEXT_GAME' }).success).toBe(false);
    expect(olho.configSchema.parse({})).toEqual({
      displayName: 'Olho',
      allowFinishWithPower: true,
      fourOfAKindCuts: true,
      sameCardEscape: true,
      firstTrickNoPower: true,
      turnTimeoutMs: 30_000,
      escapeTimeoutMs: 5_000,
      exchangeTimeoutMs: 20_000,
    });
    expect(olho.lifecycle).toBe('SESSION');
    expect([olho.minPlayers, olho.maxPlayers]).toEqual([3, 8]);
  });

  it('shows spectators no hand', () => {
    const t = Table.scripted(THREE);
    const view = t.module.getSpectatorView(t.state);
    expect(view.selfId).toBeNull();
    expect(view.me).toBeNull();
    expect(view.rules).not.toHaveProperty('displayName');
    expect(view.displayName).toBe('Olho');
  });
});
