/**
 * `05-GUIAO-DE-PARTIDA.md` as an executable test: Ana, Bruno, Carla and Duarte
 * (clockwise), maxPoints 5, maxHandSize 5, Ana starts. Whoever starts a round
 * opens every one of its tricks.
 * Rounds 1, 2, 3 and 9 use the exact cards of the script; rounds 4–8 use hands
 * where one player takes every trick, with bids chosen to produce the failures listed.
 */
import type { PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { Table, eventTypes } from './test-utils';

const PLAYERS = ['ana', 'bruno', 'carla', 'duarte'];

/** `winner` holds the top cards and takes every trick; the others hold low cards of distinct ranks. */
function sweep(winner: PlayerId, size: number): Record<PlayerId, string[]> {
  const top = ['AD', 'KS', 'QS', 'JS', '10S'].slice(0, size);
  const lows = [
    ['2C', '3C', '4C', '5C', '6C'],
    ['2D', '3D', '4D', '5D', '6D'],
    ['2H', '3H', '4H', '5H', '6H'],
  ];
  const others = PLAYERS.filter((p) => p !== winner);
  const hands: Record<PlayerId, string[]> = { [winner]: top };
  others.forEach((p, i) => {
    hands[p] = (lows[i] as string[]).slice(0, size);
  });
  return hands;
}

const DEAL = {
  1: { ana: ['7C'], bruno: ['KS'], carla: ['3H'], duarte: ['KD'] },
  2: { ana: ['AS', '2C'], bruno: ['AD', '4S'], carla: ['9H', '9C'], duarte: ['QS', '5D'] },
  3: {
    ana: ['8D', '7H', '4D'],
    bruno: ['KH', '5S', '3S'],
    carla: ['JH', '6S', '2D'],
    duarte: ['JS', '10C', '3C'],
  },
  4: sweep('duarte', 4),
  5: sweep('bruno', 5),
  6: sweep('carla', 4),
  7: sweep('duarte', 3),
  8: sweep('ana', 2),
  9: { ana: ['10H'], bruno: ['4C'], carla: ['QD'], duarte: ['2S'] },
};

const points = (t: Table) => PLAYERS.map((p) => t.state.points[p]);

/** Plays a swept round: everybody plays their cards in hand order. */
function playSweep(t: Table, bids: Record<PlayerId, number>): Table {
  t.bid(bids);
  while (t.state.phase === 'PLAYING' || t.state.phase === 'TRICK_RESOLVED') {
    if (t.state.phase === 'TRICK_RESOLVED') {
      t.system('SYS_RESOLVE_TRICK_DONE');
      continue;
    }
    const playerId = t.current as PlayerId;
    t.apply({ type: 'PLAY_CARD', cardId: (t.state.hands[playerId] as { id: string }[])[0]!.id }, playerId);
  }
  return t;
}

function playUpToRound9(): Table {
  const t = Table.scripted(PLAYERS, DEAL, { maxPoints: 5, maxHandSize: 5 }, 0);

  // Round 1 — blind, worth 1. Everybody bids 0; the kings tie, nobody takes the trick.
  expect(t.state).toMatchObject({ round: 1, handSize: 1, carry: 0 });
  t.bid({ ana: 0, bruno: 0, carla: 0, duarte: 0 }).blindTrick();
  expect(t.state.history.at(-1)?.rows.every((r) => !r.failed)).toBe(true);
  expect(t.state.carry).toBe(1);
  expect(points(t)).toEqual([0, 0, 0, 0]);

  // Round 2 — 2 cards, Bruno starts, worth 2.
  t.nextRound();
  expect(t.state).toMatchObject({ round: 2, handSize: 2, carry: 1 });
  expect(t.current).toBe('bruno');
  t.bid({ bruno: 1, carla: 0, duarte: 1, ana: 1 });
  t.trick(['bruno', '4S'], ['carla', '9H'], ['duarte', 'QS'], ['ana', 'AS']);
  expect(t.state.lastTrick?.winner).toBe('ana');
  expect(t.current).toBe('bruno');
  t.trick(['bruno', 'AD'], ['carla', '9C'], ['duarte', '5D'], ['ana', '2C']);
  expect(t.state.lastTrick?.winner).toBe('bruno');
  expect(t.state.history.at(-1)).toMatchObject({ round: 2, value: 2, carryAfter: 0 });
  expect(points(t)).toEqual([0, 0, 0, 2]);

  // Round 3 — 3 cards, Carla starts, worth 1. The jacks tie; Carla opens again.
  t.nextRound();
  expect(t.current).toBe('carla');
  t.bid({ carla: 1, duarte: 1, ana: 0, bruno: 1 });
  t.trick(['carla', 'JH'], ['duarte', 'JS'], ['ana', '8D'], ['bruno', '5S']);
  expect(t.state.lastTrick?.winner).toBeNull();
  expect(t.current).toBe('carla');
  t.trick(['carla', '2D'], ['duarte', '10C'], ['ana', '4D'], ['bruno', 'KH']);
  expect(t.state.lastTrick?.winner).toBe('bruno');
  expect(t.current).toBe('carla');
  t.trick(['carla', '6S'], ['duarte', '3C'], ['ana', '7H'], ['bruno', '3S']);
  expect(t.state.lastTrick?.winner).toBe('ana');
  const round3 = t.state.history.at(-1);
  expect(round3?.rows.map((r) => [r.playerId, r.won, r.failed])).toEqual([
    ['ana', 1, true],
    ['bruno', 1, false],
    ['carla', 0, true],
    ['duarte', 0, true],
  ]);
  expect(round3?.rows.reduce((sum, r) => sum + r.won, 0)).toBe(2); // one trick tied
  expect(points(t)).toEqual([1, 0, 1, 3]);

  // Rounds 4–8.
  const summary: [number, PlayerId, Record<PlayerId, number>, number[], number][] = [
    [4, 'duarte', { duarte: 4, ana: 0, bruno: 1, carla: 0 }, [1, 1, 1, 3], 0],
    [5, 'ana', { ana: 1, bruno: 5, carla: 0, duarte: 0 }, [2, 1, 1, 3], 0],
    [6, 'bruno', { bruno: 0, carla: 4, duarte: 0, ana: 0 }, [2, 1, 1, 3], 1],
    [7, 'carla', { carla: 1, duarte: 3, ana: 0, bruno: 0 }, [2, 1, 3, 3], 0],
    [8, 'duarte', { duarte: 1, ana: 1, bruno: 1, carla: 1 }, [3, 2, 4, 4], 0],
  ];
  const values = [1, 1, 1, 2, 1];
  summary.forEach(([round, starter, bids, expected, carryAfter], i) => {
    t.nextRound();
    expect(t.state.round).toBe(round);
    expect(t.state.seats[t.state.starterIndex]).toBe(starter);
    expect(1 + t.state.carry).toBe(values[i]);
    playSweep(t, bids);
    expect(points(t)).toEqual(expected);
    expect(t.state.carry).toBe(carryAfter);
  });

  // Round 9 — blind again, Ana starts, worth 1.
  t.nextRound();
  expect(t.state).toMatchObject({ round: 9, handSize: 1, carry: 0 });
  expect(t.current).toBe('ana');
  return t;
}

describe('example match (05-GUIAO-DE-PARTIDA)', () => {
  it('round 1 is blind: everybody sees the other cards but not their own', () => {
    const t = Table.scripted(PLAYERS, DEAL, {}, 0);
    const seen = (viewer: string) => {
      const view = t.module.getPlayerView(t.state, viewer);
      return {
        own: view.me?.hand,
        others: view.seats.flatMap((s) => s.visibleHand ?? []).map((c) => c.id),
      };
    };
    expect(seen('ana')).toEqual({ own: null, others: ['KS', '3H', 'KD'] });
    expect(seen('bruno')).toEqual({ own: null, others: ['7C', '3H', 'KD'] });
    expect(seen('carla')).toEqual({ own: null, others: ['7C', 'KS', 'KD'] });
    expect(seen('duarte')).toEqual({ own: null, others: ['7C', 'KS', '3H'] });
  });

  it('plays rounds 1–9 exactly as scripted: Duarte loses, the others survive', () => {
    const t = playUpToRound9();
    t.bid({ ana: 0, bruno: 0, carla: 1, duarte: 1 });
    expect(t.state.bids).toEqual({ ana: 0, bruno: 0, carla: 1, duarte: 1 });
    t.system('SYS_AUTO_PLAY');
    t.system('SYS_AUTO_PLAY');
    t.system('SYS_AUTO_PLAY');
    const last = t.system('SYS_AUTO_PLAY');
    expect(last.events).toContainEqual({ type: 'TrickResolved', winner: 'carla', tiedPlayerIds: [] });
    const end = t.system('SYS_RESOLVE_TRICK_DONE');
    expect(eventTypes(end.events)).toEqual(['TrickCleared', 'RoundScored', 'GameFinished']);

    expect(points(t)).toEqual([3, 2, 4, 5]);
    expect(t.state.phase).toBe('FINISHED');
    expect(t.module.isFinished(t.state)).toBe(true);
    expect(t.state.losers).toEqual(['duarte']);
    expect(end.events.at(-1)).toEqual({
      type: 'GameFinished',
      losers: ['duarte'],
      survivors: ['ana', 'bruno', 'carla'],
      points: { ana: 3, bruno: 2, carla: 4, duarte: 5 },
    });
    expect(t.module.getResult(t.state).standings).toEqual([
      { playerId: 'bruno', outcome: 'SURVIVOR', score: 2 },
      { playerId: 'ana', outcome: 'SURVIVOR', score: 3 },
      { playerId: 'carla', outcome: 'SURVIVOR', score: 4 },
      { playerId: 'duarte', outcome: 'LOSER', score: 5 },
    ]);
    expect(t.state.history).toHaveLength(9);
  });

  it('variant: had Carla bid 0 in round 9, Carla and Duarte would both lose', () => {
    const t = playUpToRound9();
    t.bid({ ana: 0, bruno: 0, carla: 0, duarte: 1 }).blindTrick();
    expect(points(t)).toEqual([3, 2, 5, 5]);
    expect(t.state.losers).toEqual(['carla', 'duarte']);
    const outcomes = t.module.getResult(t.state).standings.map((s) => [s.playerId, s.outcome]);
    expect(outcomes).toEqual([
      ['bruno', 'SURVIVOR'],
      ['ana', 'SURVIVOR'],
      ['carla', 'LOSER'],
      ['duarte', 'LOSER'],
    ]);
  });
});
