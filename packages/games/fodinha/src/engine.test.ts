import { SYSTEM_PLAYER_ID, createSeededRng, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { fodinha, fodinhaActionSchema, fodinhaConfigSchema } from './module';
import { AUTO_PLAY_DELAY_MS, FIRST_AUTO_PLAY_DELAY_MS, ROUND_SUMMARY_MS, TRICK_PAUSE_MS } from './rules';
import { Table, cards, config, eventTypes, expectError, expectOk, queuedRng } from './test-utils';
import type { FodinhaConfig, FodinhaState } from './types';

const P3 = ['a', 'b', 'c'];
const P4 = ['a', 'b', 'c', 'd'];

describe('setup and table size', () => {
  it('accepts 2–10 players and rejects 11', () => {
    const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    expect(() => fodinha.setup(players(1), config(), createSeededRng('x'))).toThrow(RangeError);
    expect(() => fodinha.setup(players(11), config(), createSeededRng('x'))).toThrow(RangeError);
    expect(fodinha.setup(players(10), config(), createSeededRng('x')).seats).toHaveLength(10);
  });

  it('rejects tables that need more than 52 cards (10 × 6 = 60)', () => {
    const ten = Array.from({ length: 10 }, (_, i) => `p${i}`);
    expect(() => fodinha.setup(ten, config({ maxHandSize: 6 }), createSeededRng('x'))).toThrow(/52/);
    expect(fodinha.validateTable?.(config({ maxHandSize: 6 }), 10)).toMatchObject({ code: 'TOO_MANY_CARDS' });
    expect(fodinha.validateTable?.(config({ maxHandSize: 5 }), 10)).toBeNull();
  });

  it('rejects duplicate players', () => {
    expect(() => fodinha.setup(['a', 'a'], config(), createSeededRng('x'))).toThrow(/Duplicate/);
  });

  it('starts round 1 with one blind card each, bidding from a random starter', () => {
    const starters = new Set<PlayerId>();
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const state = fodinha.setup(P4, config(), createSeededRng(seed));
      expect(state).toMatchObject({ phase: 'BIDDING', round: 1, handSize: 1, carry: 0, tricksPlayed: 0 });
      expect(Object.values(state.hands).map((h) => h.length)).toEqual([1, 1, 1, 1]);
      expect(state.currentIndex).toBe(state.starterIndex);
      starters.add(state.seats[state.starterIndex] as PlayerId);
    }
    expect(starters.size).toBeGreaterThan(1);
  });

  it('deals distinct cards and a different deck every round', () => {
    const t = new Table(fodinha, P4, { maxHandSize: 5 });
    const hands: string[][] = [];
    for (let round = 1; round <= 5; round++) {
      const dealt = Object.values(t.state.hands)
        .flat()
        .map((c) => c.id);
      expect(new Set(dealt).size).toBe(4 * round);
      hands.push(dealt);
      while (t.state.phase === 'BIDDING') t.apply({ type: 'PLACE_BID', bid: 0 }, t.current as PlayerId);
      while (t.state.phase !== 'ROUND_SCORED' && t.state.phase !== 'FINISHED') {
        if (t.state.phase === 'TRICK_RESOLVED') t.system('SYS_RESOLVE_TRICK_DONE');
        else if (round === 1) t.system('SYS_AUTO_PLAY');
        else {
          const id = t.current as PlayerId;
          t.apply({ type: 'PLAY_CARD', cardId: t.state.hands[id]![0]!.id }, id);
        }
      }
      if (t.state.phase === 'FINISHED') break;
      t.nextRound();
    }
    expect(new Set(hands.map((h) => h.join()))).toHaveProperty('size', hands.length);
  });

  it('one of the previous losers starts the next match (open point #4)', () => {
    const previousResult = {
      standings: [
        { playerId: 'a', outcome: 'SURVIVOR' as const, score: 1 },
        { playerId: 'b', outcome: 'LOSER' as const, score: 5 },
        { playerId: 'c', outcome: 'SURVIVOR' as const, score: 2 },
      ],
    };
    for (const seed of ['1', '2', '3']) {
      const state = fodinha.setup(P3, config(), createSeededRng(seed), { previousResult });
      expect(state.seats[state.starterIndex]).toBe('b');
    }
    const twoLosers = {
      standings: [
        { playerId: 'a', outcome: 'LOSER' as const, score: 5 },
        { playerId: 'b', outcome: 'SURVIVOR' as const, score: 1 },
        { playerId: 'c', outcome: 'LOSER' as const, score: 6 },
      ],
    };
    const starters = new Set(
      ['1', '2', '3', '4', '5', '6', '7', '8'].map((seed) => {
        const s = fodinha.setup(P3, config(), createSeededRng(seed), { previousResult: twoLosers });
        return s.seats[s.starterIndex];
      }),
    );
    expect(starters).toEqual(new Set(['a', 'c']));
  });

  it('falls back to a random starter when the losers left', () => {
    const previousResult = { standings: [{ playerId: 'gone', outcome: 'LOSER' as const, score: 5 }] };
    const state = fodinha.setup(P3, config(), queuedRng(2), { previousResult });
    expect(state.seats[state.starterIndex]).toBe('c');
  });

  it('config schema applies the defaults of the rules and open points', () => {
    expect(fodinhaConfigSchema.parse({})).toEqual({
      maxPoints: 5,
      maxHandSize: 5,
      turnTimeoutMs: 30_000,
      lastBidderRestriction: false,
    });
    // Rooms saved when the trick leader was configurable still load; the old keys are dropped.
    expect(fodinhaConfigSchema.parse({ trickLeader: 'TRICK_WINNER', tieLeader: 'SAME_LEADER' })).toEqual(
      fodinhaConfigSchema.parse({}),
    );
    expect(fodinhaConfigSchema.safeParse({ maxHandSize: 8 }).success).toBe(false);
    expect(fodinhaConfigSchema.safeParse({ maxPoints: 2 }).success).toBe(false);
  });

  it('the client action schema accepts bids and cards but never system actions', () => {
    expect(fodinhaActionSchema.safeParse({ type: 'PLACE_BID', bid: 2 }).success).toBe(true);
    expect(fodinhaActionSchema.safeParse({ type: 'PLAY_CARD', cardId: 'AD' }).success).toBe(true);
    expect(fodinhaActionSchema.safeParse({ type: 'PLAY_CARD', cardId: 'JK1' }).success).toBe(false);
    expect(fodinhaActionSchema.safeParse({ type: 'PLACE_BID', bid: 1.5 }).success).toBe(false);
    expect(fodinhaActionSchema.safeParse({ type: 'SYS_NEXT_ROUND' }).success).toBe(false);
    expect(fodinhaActionSchema.safeParse({ type: 'SYS_TIMEOUT' }).success).toBe(false);
  });
});

describe('starter rotation (rules §5)', () => {
  it('moves one seat clockwise every round (last seat → first) and opens every trick', () => {
    const t = new Table(fodinha, P3, { maxHandSize: 3, maxPoints: 15 }, 1);
    const starters: PlayerId[] = [];
    for (let round = 1; round <= 7 && t.state.phase !== 'FINISHED'; round++) {
      starters.push(t.state.seats[t.state.starterIndex] as PlayerId);
      expect(t.current).toBe(starters.at(-1));
      while (t.state.phase === 'BIDDING') t.apply({ type: 'PLACE_BID', bid: 0 }, t.current as PlayerId);
      while (t.state.phase === 'PLAYING' || t.state.phase === 'TRICK_RESOLVED') {
        if (t.state.phase === 'TRICK_RESOLVED') t.system('SYS_RESOLVE_TRICK_DONE');
        else if (t.state.handSize === 1) t.system('SYS_AUTO_PLAY');
        else {
          const id = t.current as PlayerId;
          if (t.state.trick.plays.length === 0) expect(id).toBe(starters.at(-1));
          t.apply({ type: 'PLAY_CARD', cardId: t.state.hands[id]![0]!.id }, id);
        }
      }
      if (t.state.phase === 'ROUND_SCORED') t.nextRound();
    }
    expect(starters.slice(0, 5)).toEqual(['b', 'c', 'a', 'b', 'c']);
  });
});

/**
 * A fresh round where the first player bids first and everyone holds the given
 * cards (any hand size: rounds are only ever dealt by the engine in the real game).
 */
function tableWith(hands: Record<PlayerId, string[]>, cfg: Partial<FodinhaConfig> = {}): Table {
  const players = Object.keys(hands);
  const t = new Table(fodinha, players, cfg, 0);
  t.state = {
    ...t.state,
    handSize: (hands[players[0] as PlayerId] ?? []).length,
    hands: Object.fromEntries(players.map((id) => [id, cards(...(hands[id] ?? []))])),
  };
  return t;
}

describe('bidding (rules §7)', () => {
  it('goes clockwise from the starter; only the player on turn may bid', () => {
    const t = tableWith({ a: ['2C', '3C', '4C'], b: ['5C', '6C', '7C'], c: ['8C', '9C', '10C'] });
    expect(t.current).toBe('a');
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 1 }, 'b'), 'NOT_YOUR_TURN');
    const placed = t.apply({ type: 'PLACE_BID', bid: 2 }, 'a');
    expect(placed.events).toEqual([{ type: 'BidPlaced', playerId: 'a', bid: 2, bidsSum: 2 }]);
    expect(t.current).toBe('b');
    expect(fodinha.getTimeoutMs(t.state)).toBe(30_000);
    expect(fodinha.getPendingPlayers(t.state)).toEqual(['b']);
  });

  it('bids are integers between 0 and the hand size', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['5C', '6C'], c: ['8C', '9C'] });
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 3 }, 'a'), 'INVALID_BID');
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: -1 }, 'a'), 'INVALID_BID');
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 0.5 }, 'a'), 'INVALID_BID');
    expect(fodinha.getValidActions(t.state, 'a')).toEqual(
      [0, 1, 2].map((bid) => ({ type: 'PLACE_BID', bid })),
    );
    expect(fodinha.getValidActions(t.state, 'b')).toEqual([]);
  });

  it('a bid is locked once placed', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['5C', '6C'], c: ['8C', '9C'] });
    t.apply({ type: 'PLACE_BID', bid: 1 }, 'a');
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 0 }, 'a'), 'ALREADY_BID');
  });

  it('cards cannot be played while bidding', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['5C', '6C'], c: ['8C', '9C'] });
    expectError(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: '2C' }, 'a'), 'WRONG_PHASE');
  });

  it('after the last bid the starter opens the first trick', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['5C', '6C'], c: ['8C', '9C'] });
    t.bid({ a: 1, b: 1, c: 1 });
    expect(t.state.phase).toBe('PLAYING');
    expect(t.current).toBe('a');
    expect(t.last?.schedule).toBeUndefined();
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 1 }, 'a'), 'WRONG_PHASE');
  });

  it('with the last-bidder restriction, only the bid closing the sum is forbidden', () => {
    const t = tableWith(
      { a: ['2C', '3C', '4C'], b: ['5C', '6C', '7C'], c: ['8C', '9C', '10C'] },
      { lastBidderRestriction: true },
    );
    t.apply({ type: 'PLACE_BID', bid: 1 }, 'a');
    // Not the last one: everything allowed, even bids that could later close the sum.
    expect(fodinha.getValidActions(t.state, 'b')).toHaveLength(4);
    t.apply({ type: 'PLACE_BID', bid: 1 }, 'b');
    const valid = fodinha.getValidActions(t.state, 'c').map((a) => (a.type === 'PLACE_BID' ? a.bid : -1));
    expect(valid).toEqual([0, 2, 3]);
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 1 }, 'c'), 'FORBIDDEN_BID');
    expectOk(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 3 }, 'c'));
  });

  it('without the restriction the last bidder may close the sum', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['5C', '6C'], c: ['8C', '9C'] });
    t.bid({ a: 1, b: 0 });
    expect(fodinha.getValidActions(t.state, 'c')).toHaveLength(3);
    expectOk(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 1 }, 'c'));
  });
});

describe('playing tricks (rules §8)', () => {
  const hands = { a: ['KC', '2H', '3D'], b: ['KS', 'AH', '4D'], c: ['5C', '6H', 'AD'] };

  it('rejects cards not in hand, out-of-turn plays and unknown players', () => {
    const t = tableWith(hands);
    t.bid({ a: 0, b: 1, c: 1 });
    expectError(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: 'AS' }, 'a'), 'INVALID_CARD');
    expectError(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: 'KS' }, 'b'), 'NOT_YOUR_TURN');
    expectError(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: 'KC' }, 'zed'), 'UNKNOWN_PLAYER');
    expect(fodinha.getValidActions(t.state, 'a')).toEqual(
      ['KC', '2H', '3D'].map((cardId) => ({ type: 'PLAY_CARD', cardId })),
    );
  });

  it('any card may be played: no need to follow suit (open point #3)', () => {
    const t = tableWith(hands);
    t.bid({ a: 0, b: 1, c: 1 });
    t.apply({ type: 'PLAY_CARD', cardId: 'KC' }, 'a');
    expectOk(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: 'AH' }, 'b'));
  });

  it('the last card resolves the trick and schedules a pause before clearing it', () => {
    const t = tableWith(hands);
    t.bid({ a: 0, b: 1, c: 1 });
    t.apply({ type: 'PLAY_CARD', cardId: 'KC' }, 'a');
    t.apply({ type: 'PLAY_CARD', cardId: 'AH' }, 'b');
    const last = t.apply({ type: 'PLAY_CARD', cardId: '5C' }, 'c');
    expect(eventTypes(last.events)).toEqual(['CardPlayed', 'TrickResolved']);
    expect(last.schedule).toEqual([{ action: { type: 'SYS_RESOLVE_TRICK_DONE' }, delayMs: TRICK_PAUSE_MS }]);
    expect(t.state.phase).toBe('TRICK_RESOLVED');
    expect(t.state.tricksWon).toEqual({ a: 0, b: 1, c: 0 });
    // Nobody is on the clock while the trick is shown.
    expect(fodinha.getCurrentPlayer(t.state)).toBeNull();
    expect(fodinha.getPendingPlayers(t.state)).toEqual([]);
    expect(fodinha.getTimeoutMs(t.state)).toBeNull();
    expectError(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: '2H' }, 'a'), 'WRONG_PHASE');

    const cleared = t.system('SYS_RESOLVE_TRICK_DONE');
    expect(cleared.events).toEqual([{ type: 'TrickCleared', winner: 'b', nextLeaderId: 'a' }]);
    expect(t.state.lastTrick).toMatchObject({ winner: 'b' });
    expect(t.state.trick.plays).toEqual([]);
  });

  it('after a trick won by someone else, the round starter opens again (rules §8)', () => {
    const t = tableWith(hands);
    t.bid({ a: 0, b: 1, c: 1 });
    t.trick(['a', '2H'], ['b', 'AH'], ['c', '6H']);
    expect(t.state.lastTrick?.winner).toBe('b');
    expect(t.current).toBe('a');
  });

  it('after a tied trick, the round starter opens again', () => {
    const t = tableWith({ a: ['2C', '3H'], b: ['KS', '4H'], c: ['KD', '5H'] });
    t.bid({ a: 0, b: 0, c: 0 });
    t.trick(['a', '2C'], ['b', 'KS'], ['c', 'KD']);
    expect(t.state.lastTrick?.winner).toBeNull();
    expect(t.current).toBe('a');
  });
});

describe('scoring (rules §10)', () => {
  /** Two-player, two-card rounds where `a` always holds the two strongest cards. */
  function twoCardRound(bids: { a: number; b: number }, carry = 0, pts = { a: 0, b: 0 }): Table {
    const t = tableWith({ a: ['AD', 'KS'], b: ['2C', '3C'] }, { maxPoints: 15 });
    t.state = { ...t.state, carry, points: { ...pts } };
    t.bid(bids);
    t.trick(['a', 'AD'], ['b', '2C']);
    t.trick(['a', 'KS'], ['b', '3C']);
    return t;
  }

  it('an exact bid costs nothing; missing by more or by less costs the round value', () => {
    const t = twoCardRound({ a: 2, b: 0 });
    expect(t.state.points).toEqual({ a: 0, b: 0 });
    expect(twoCardRound({ a: 1, b: 1 }).state.points).toEqual({ a: 1, b: 1 });
    expect(twoCardRound({ a: 0, b: 2 }).state.points).toEqual({ a: 1, b: 1 });
  });

  it('when nobody fails the value carries over: 1 → 2 → 3', () => {
    const first = twoCardRound({ a: 2, b: 0 });
    expect(first.state.carry).toBe(1);
    expect(first.state.phase).toBe('ROUND_SCORED');
    expect(first.last?.schedule).toEqual([{ action: { type: 'SYS_NEXT_ROUND' }, delayMs: ROUND_SUMMARY_MS }]);
    expect(twoCardRound({ a: 2, b: 0 }, 1).state.carry).toBe(2);
    const third = twoCardRound({ a: 2, b: 1 }, 2);
    expect(third.state.history.at(-1)).toMatchObject({ value: 3, carryAfter: 0 });
    expect(third.state.points).toEqual({ a: 0, b: 3 });
  });

  it('everyone who fails takes the value, and the carry resets', () => {
    const t = twoCardRound({ a: 0, b: 1 }, 1);
    expect(t.state.points).toEqual({ a: 2, b: 2 });
    expect(t.state.carry).toBe(0);
    expect(t.state.history.at(-1)?.rows).toEqual([
      { playerId: 'a', bid: 0, won: 2, failed: true, pointsAdded: 2 },
      { playerId: 'b', bid: 1, won: 0, failed: true, pointsAdded: 2 },
    ]);
  });

  it('the next round starts with the new value, the next starter and fresh bids', () => {
    const t = twoCardRound({ a: 2, b: 0 });
    const next = t.nextRound().last;
    expect(next?.events[0]).toEqual({
      type: 'RoundStarted',
      round: 2,
      handSize: 2,
      value: 2,
      starterId: 'b',
      blind: false,
    });
    expect(next?.events[1]).toEqual({ type: 'CardsDealt', counts: { a: 2, b: 2 } });
    expect(t.state.bids).toEqual({ a: null, b: null });
    expect(t.state.tricksWon).toEqual({ a: 0, b: 0 });
    expect(t.state.lastTrick).toBeNull();
  });
});

describe('end of the match (rules §11)', () => {
  function finalRound(pts: Record<PlayerId, number>, bids: Record<PlayerId, number>, carry = 0) {
    const t = tableWith({ a: ['AD'], b: ['2C'], c: ['3C'] });
    t.state = { ...t.state, points: pts, carry };
    t.bid(bids).blindTrick();
    return t;
  }

  it('reaching maxPoints finishes the match with one loser', () => {
    const t = finalRound({ a: 0, b: 4, c: 0 }, { a: 1, b: 1, c: 0 });
    expect(t.state.phase).toBe('FINISHED');
    expect(t.state.losers).toEqual(['b']);
    expect(fodinha.getResult(t.state).standings).toEqual([
      { playerId: 'a', outcome: 'SURVIVOR', score: 0 },
      { playerId: 'c', outcome: 'SURVIVOR', score: 0 },
      { playerId: 'b', outcome: 'LOSER', score: 5 },
    ]);
    expect(fodinha.getPendingPlayers(t.state)).toEqual([]);
    expect(fodinha.getTimeoutMs(t.state)).toBeNull();
    expect(t.last?.schedule).toBeUndefined();
  });

  it('two players reaching it in the same round both lose', () => {
    const t = finalRound({ a: 0, b: 4, c: 4 }, { a: 1, b: 1, c: 1 });
    expect(t.state.losers).toEqual(['b', 'c']);
  });

  it('going past the limit loses too (4 + 3 = 7)', () => {
    const t = finalRound({ a: 0, b: 4, c: 0 }, { a: 1, b: 1, c: 0 }, 2);
    expect(t.state.points.b).toBe(7);
    expect(t.state.losers).toEqual(['b']);
  });

  it('nothing is accepted once finished', () => {
    const t = finalRound({ a: 0, b: 4, c: 0 }, { a: 1, b: 1, c: 0 });
    expectError(fodinha.applyAction(t.state, { type: 'SYS_NEXT_ROUND' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(fodinha.applyAction(t.state, { type: 'PLACE_BID', bid: 0 }, 'a'), 'WRONG_PHASE');
    expect(fodinha.getValidActions(t.state, 'a')).toEqual([]);
    expect(fodinha.getDefaultAction(t.state, 'a')).toBeNull();
  });
});

describe('system actions and time (04 §2, open points #5 and #6)', () => {
  it('system actions from players are rejected', () => {
    const t = tableWith({ a: ['2C'], b: ['3C'], c: ['4C'] });
    for (const type of [
      'SYS_RESOLVE_TRICK_DONE',
      'SYS_NEXT_ROUND',
      'SYS_TIMEOUT',
      'SYS_AUTO_PLAY',
    ] as const) {
      expectError(fodinha.applyAction(t.state, { type }, 'a'), 'SYSTEM_ONLY');
    }
  });

  it('system actions out of their phase are rejected', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['4C', '5C'], c: ['6C', '7C'] });
    const sys = (state: FodinhaState, type: 'SYS_RESOLVE_TRICK_DONE' | 'SYS_NEXT_ROUND' | 'SYS_AUTO_PLAY') =>
      fodinha.applyAction(state, { type }, SYSTEM_PLAYER_ID);
    expectError(sys(t.state, 'SYS_RESOLVE_TRICK_DONE'), 'WRONG_PHASE');
    expectError(sys(t.state, 'SYS_NEXT_ROUND'), 'WRONG_PHASE');
    expectError(sys(t.state, 'SYS_AUTO_PLAY'), 'WRONG_PHASE');
    t.bid({ a: 0, b: 0, c: 0 });
    // Not a blind round: nothing is played automatically.
    expectError(sys(t.state, 'SYS_AUTO_PLAY'), 'WRONG_PHASE');
  });

  it('SYS_TIMEOUT while bidding bids 0 for the player on turn', () => {
    const t = tableWith({ a: ['2C', '3C'], b: ['4C', '5C'], c: ['6C', '7C'] });
    expect(fodinha.getDefaultAction(t.state, 'a')).toEqual({ type: 'PLACE_BID', bid: 0 });
    expect(fodinha.getDefaultAction(t.state, 'b')).toBeNull();
    const result = t.system('SYS_TIMEOUT');
    expect(result.events).toEqual([{ type: 'BidPlaced', playerId: 'a', bid: 0, bidsSum: 0 }]);
  });

  it('SYS_TIMEOUT bids the lowest allowed value when 0 is forbidden', () => {
    const t = tableWith(
      { a: ['2C', '3C'], b: ['4C', '5C'], c: ['6C', '7C'] },
      { lastBidderRestriction: true },
    );
    t.bid({ a: 2, b: 0 });
    expect(fodinha.getDefaultAction(t.state, 'c')).toEqual({ type: 'PLACE_BID', bid: 1 });
    t.system('SYS_TIMEOUT');
    expect(t.state.bids.c).toBe(1);
  });

  it('SYS_TIMEOUT while playing plays the lowest card', () => {
    const t = tableWith({ a: ['KC', '2D', 'AD'], b: ['4C', '5C', '6C'], c: ['7C', '8C', '9C'] });
    t.bid({ a: 0, b: 0, c: 0 });
    expect(fodinha.getDefaultAction(t.state, 'a')).toEqual({ type: 'PLAY_CARD', cardId: '2D' });
    const result = t.system('SYS_TIMEOUT');
    expect(result.events[0]).toMatchObject({ type: 'CardPlayed', playerId: 'a', card: { id: '2D' } });
  });

  it('SYS_TIMEOUT with nobody on the clock is rejected', () => {
    const t = tableWith({ a: ['2C'], b: ['3C'], c: ['4C'] });
    t.bid({ a: 0, b: 0, c: 0 });
    expectError(fodinha.applyAction(t.state, { type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });

  it('blind rounds are played by the server, in order, 700 ms apart', () => {
    const t = tableWith({ a: ['2C'], b: ['3C'], c: ['4C'] });
    t.bid({ a: 0, b: 0 });
    const lastBid = t.apply({ type: 'PLACE_BID', bid: 1 }, 'c');
    expect(lastBid.schedule).toEqual([
      { action: { type: 'SYS_AUTO_PLAY' }, delayMs: FIRST_AUTO_PLAY_DELAY_MS },
    ]);
    // No decision exists: no valid actions, no timer, the card cannot be played by hand.
    expect(fodinha.getCurrentPlayer(t.state)).toBe('a');
    expect(fodinha.getValidActions(t.state, 'a')).toEqual([]);
    expect(fodinha.getPendingPlayers(t.state)).toEqual([]);
    expect(fodinha.getTimeoutMs(t.state)).toBeNull();
    expect(fodinha.getDefaultAction(t.state, 'a')).toBeNull();
    expectError(fodinha.applyAction(t.state, { type: 'PLAY_CARD', cardId: '2C' }, 'a'), 'BLIND_ROUND');

    const first = t.system('SYS_AUTO_PLAY');
    expect(first.events).toEqual([
      { type: 'CardPlayed', playerId: 'a', card: { id: '2C', rank: '2', suit: 'C' } },
    ]);
    expect(first.schedule).toEqual([{ action: { type: 'SYS_AUTO_PLAY' }, delayMs: AUTO_PLAY_DELAY_MS }]);
    t.system('SYS_AUTO_PLAY');
    const last = t.system('SYS_AUTO_PLAY');
    expect(eventTypes(last.events)).toEqual(['CardPlayed', 'TrickResolved']);
    expect(last.schedule?.[0]?.action).toEqual({ type: 'SYS_RESOLVE_TRICK_DONE' });
  });
});

describe('module wiring', () => {
  it('uses the room settings for the turn timer', () => {
    const state = fodinha.setup(P3, config({ turnTimeoutMs: 45_000 }), createSeededRng('t'));
    expect(fodinha.getTimeoutMs(state)).toBe(45_000);
  });

  it('spectators get a view without any hand', () => {
    const state = fodinha.setup(P3, config(), createSeededRng('s'));
    const view = fodinha.getSpectatorView(state);
    expect(view.me).toBeNull();
    expect(view.selfId).toBeNull();
    expect(view.seats.every((s) => s.visibleHand === null)).toBe(true);
  });
});
