import { SYSTEM_PLAYER_ID, createSeededRng, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { createDesconfiaModule, desconfia, desconfiaActionSchema, desconfiaConfigSchema } from './module';
import { isTruthful, standings } from './rules';
import { Table, cards, config, eventTypes, expectError, queuedRng, scriptedDealer } from './test-utils';
import type { DesconfiaEvent, DesconfiaState } from './types';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const find = <T extends DesconfiaEvent['type']>(events: readonly DesconfiaEvent[], type: T) =>
  events.filter((e): e is Extract<DesconfiaEvent, { type: T }> => e.type === type);

/** Three players with plain hands: a starts (3 of clubs). */
const basic = (cfg = {}) =>
  Table.scripted(
    {
      a: ['3C', '5S', '5H', '8C', 'KD', 'JK1'],
      b: ['4S', '6H', '6D', '9S', 'QC'],
      c: ['2S', '7H', '7D', '10C', 'AH'],
    },
    cfg,
  );

describe('setup (07 §1)', () => {
  it('deals all 54 cards, at most one apart, and the 3 of clubs starts', () => {
    for (let n = 2; n <= 8; n++) {
      const state = desconfia.setup(players(n), config(), createSeededRng(`deal-${n}`));
      const sizes = state.seats.map(
        (id) => state.hands[id]!.length + 4 * state.removed.filter((r) => r.playerId === id).length,
      );
      expect(sizes.reduce((a, b) => a + b, 0)).toBe(54);
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
      const all = state.seats.flatMap((id) => state.hands[id]!.map((c) => c.id));
      expect(new Set(all).size).toBe(all.length);
      const holder = state.seats[state.currentIndex] as PlayerId;
      const dealtHolder = state.seats.find(
        (id) =>
          state.hands[id]!.some((c) => c.id === '3C') ||
          state.removed.some((r) => r.rank === '3' && r.playerId === id),
      );
      expect(holder).toBe(dealtHolder);
    }
  });

  it('removes dealt peixinhos; the 3 of clubs still starts when it leaves in one', () => {
    const t = Table.scripted({
      a: ['4S', '5S'],
      b: ['3C', '3H', '3D', '3S', 'KD'],
      c: ['6S', 'JK1'],
    });
    expect(t.state.removed).toEqual([{ rank: '3', playerId: 'b' }]);
    expect(t.hand('b')).toEqual(['KD']);
    expect(t.current).toBe('b');
  });

  it('accepts 2–8 players and rejects a bad deal', () => {
    expect(() => desconfia.setup(players(1), config(), createSeededRng('x'))).toThrow(RangeError);
    expect(() => desconfia.setup(players(9), config(), createSeededRng('x'))).toThrow(RangeError);
    expect(() => desconfia.setup(['a', 'a'], config(), createSeededRng('x'))).toThrow(/Duplicate/);
    const twice = createDesconfiaModule(scriptedDealer({ a: ['2S'], b: ['2S'] }));
    expect(() => twice.setup(['a', 'b'], config(), queuedRng())).toThrow(/at most once/);
  });

  it('a hand made only of peixinhos is out of cards at once', () => {
    const t = Table.scripted({ a: ['9S', '9H', '9C', '9D'], b: ['2S'], c: ['3C'] }, { playUntilEnd: true });
    expect(t.state.finishedOrder).toEqual(['a']);
    expect(t.state.phase).toBe('PLAYING');
    expect(t.current).toBe('c');
    const solo = Table.scripted({ a: ['9S', '9H', '9C', '9D'], b: ['2S'] });
    expect(solo.state.phase).toBe('FINISHED');
    const starterOut = Table.scripted(
      { a: ['3C', '3H', '3D', '3S'], b: ['2S'], c: ['4S'] },
      { playUntilEnd: true },
    );
    expect(starterOut.current).toBe('b');
  });
});

describe('playing (07 §2)', () => {
  it('refuses out of turn, too soon, no cards, cards not held and a joker claim', () => {
    const t = basic();
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['4S'], claimRank: '4' }, 'b'),
      'NOT_YOUR_TURN',
    );
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: [], claimRank: '4' }, 'a'),
      'NO_CARDS',
    );
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['4S'], claimRank: '4' }, 'a'),
      'INVALID_CARD',
    );
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['3C', '3C'], claimRank: '3' }, 'a'),
      'INVALID_CARD',
    );
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['3C'], claimRank: 'JOKER' as never }, 'a'),
      'INVALID_CLAIM',
    );
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['3C'], claimRank: '3' }, 'z'),
      'UNKNOWN_PLAYER',
    );
    const played = t.apply({ type: 'PLAY', cardIds: ['3C'], claimRank: '3' }, 'a');
    expect(played.schedule).toEqual([
      { action: { type: 'SYS_WINDOW_MIN_ELAPSED', playId: 1 }, delayMs: 2000 },
    ]);
    expect(t.current).toBe('b');
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['4S'], claimRank: '3' }, 'b'),
      'TOO_SOON',
    );
    expect(desconfia.getPendingPlayers(t.state)).toEqual([]);
    expect(desconfia.getTimeoutMs(t.state)).toBeNull();
    t.minElapsed();
    expect(desconfia.getPendingPlayers(t.state)).toEqual(['b']);
    expect(desconfia.getTimeoutMs(t.state)).toBe(30_000);
  });

  it('keeps the rank of the pile; a new pile takes any rank', () => {
    const t = basic();
    t.play('a', ['5S'], 'Q');
    t.minElapsed();
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['4S'], claimRank: '4' }, 'b'),
      'WRONG_CLAIM',
    );
    t.play('b', ['4S'], 'Q');
    t.doubt('c'); // a lie: b takes the pile, c starts a new one with any rank
    expect(t.state.claimRank).toBeNull();
    t.play('c', ['2S'], 'A');
    expect(t.state.claimRank).toBe('A');
  });

  it('has no limit on the number of cards', () => {
    const t = Table.scripted({ a: ['3C', '4S', '5S', '6S', '7S', '8S', '9S', 'KD'], b: ['2S'] });
    const result = t.play('a', ['3C', '4S', '5S', '6S', '7S', '8S', '9S'], '9');
    expect(find(result.events, 'Played')[0]).toMatchObject({ count: 7, lastCard: false });
    expect(t.hand('a')).toEqual(['KD']);
  });
});

describe('truth and lies (07 §3)', () => {
  it('counts jokers as the rank claimed', () => {
    expect(isTruthful(cards('7S', '7H'), '7')).toBe(true);
    expect(isTruthful(cards('7S', 'JK1'), '7')).toBe(true);
    expect(isTruthful(cards('JK1', 'JK2'), '7')).toBe(true);
    expect(isTruthful(cards('7S', '8S', '7H'), '7')).toBe(false);
  });

  it('a rank already out in a peixinho is only true with jokers', () => {
    expect(isTruthful(cards('JK2'), '9')).toBe(true);
    expect(isTruthful(cards('JK2', '2S'), '9')).toBe(false);
  });
});

describe('doubting (07 §4)', () => {
  it('nobody doubts their own play; an old play id is rejected', () => {
    const t = basic();
    t.play('a', ['3C'], '3');
    expectError(desconfia.applyAction(t.state, { type: 'DOUBT', playId: 1 }, 'a'), 'CANNOT_DOUBT_SELF');
    expectError(desconfia.applyAction(t.state, { type: 'DOUBT', playId: 0 }, 'b'), 'DOUBT_CLOSED');
    expect(desconfia.getValidActions(t.state, 'c')).toEqual([{ type: 'DOUBT', playId: 1 }]);
    expect(desconfia.getValidActions(t.state, 'a')).toEqual([]);
  });

  it('only the first of two doubts on the same play counts', () => {
    const t = basic();
    t.play('a', ['3C'], '3');
    const before = t.state;
    t.doubt('b');
    expectError(desconfia.applyAction(t.state, { type: 'DOUBT', playId: 1 }, 'c'), 'DOUBT_CLOSED');
    expect(before.doubtWindow?.playId).toBe(1);
  });

  it('a lie sends the pile to the author and the doubter starts', () => {
    const t = basic();
    t.play('a', ['3C'], '3');
    t.play('b', ['4S', '6H'], '3');
    const result = t.doubt('c');
    expect(find(result.events, 'PileTaken')).toEqual([{ type: 'PileTaken', playerId: 'b', count: 3 }]);
    expect(t.hand('b')).toEqual(['3C', '4S', '6D', '6H', '9S', 'QC'].sort());
    expect(t.current).toBe('c');
    expect(t.state.claimRank).toBeNull();
    expect(t.state.pile).toEqual([]);
  });

  it('the truth sends the pile to the doubter and the author starts', () => {
    const t = basic();
    t.play('a', ['5S', 'JK1'], '5');
    const result = t.doubt('c');
    expect(find(result.events, 'NewPile')).toEqual([{ type: 'NewPile', starterId: 'a' }]);
    expect(t.hand('c')).toContain('JK1');
    expect(t.current).toBe('a');
  });

  it('the next player may doubt too; once they play, the old play is closed', () => {
    const t = basic();
    t.play('a', ['3C'], '3');
    t.play('b', ['4S'], '3');
    expectError(desconfia.applyAction(t.state, { type: 'DOUBT', playId: 1 }, 'c'), 'DOUBT_CLOSED');
    expect(desconfia.getValidActions(t.state, 'a')).toEqual([{ type: 'DOUBT', playId: 2 }]);
  });
});

describe('peixinhos (07 §5)', () => {
  it('taking the pile and joining four removes them; two at once are both removed', () => {
    const t = Table.scripted({
      a: ['9S', '9H', 'QS', 'QH', 'KD'],
      b: ['3C', '9C', '9D', 'QC', 'QD', '2S'],
    });
    t.play('b', ['9C', '9D', 'QC', 'QD'], '9'); // a lie nobody doubts
    t.play('a', ['9S', '9H', 'QS', 'QH'], '9'); // another lie: b doubts it
    const result = t.doubt('b');
    expect(find(result.events, 'PeixinhoRemoved').map((e) => e.rank)).toEqual(['9', 'Q']);
    expect(t.hand('a')).toEqual(['KD']);
    expect(t.state.removed.map((r) => r.rank)).toEqual(['9', 'Q']);
  });

  it('jokers never make or complete a peixinho', () => {
    const t = Table.scripted({ a: ['3C', '9S', '9H', '9C', 'JK1'], b: ['JK2', '2S'] });
    t.play('a', ['JK1'], '4');
    t.doubt('b'); // true: b takes the joker
    expect(t.state.removed).toEqual([]);
    expect(t.hand('a')).toEqual(['3C', '9C', '9H', '9S']);
  });
});

describe('the end (07 §6)', () => {
  it('a last card nobody doubts wins when its window closes', () => {
    const t = Table.scripted({ a: ['3C'], b: ['4S', '5S'], c: ['6S'] });
    const played = t.play('a', ['3C'], '3');
    expect(played.schedule).toEqual([
      { action: { type: 'SYS_LAST_CARD_WINDOW_CLOSED', playId: 1 }, delayMs: 3000 },
    ]);
    expect(t.current).toBeNull();
    expect(desconfia.getPendingPlayers(t.state)).toEqual([]);
    expectError(
      desconfia.applyAction(t.state, { type: 'PLAY', cardIds: ['4S'], claimRank: '3' }, 'b'),
      'LAST_CARD_OPEN',
    );
    expectError(
      desconfia.applyAction(t.state, { type: 'SYS_WINDOW_MIN_ELAPSED', playId: 1 }, SYSTEM_PLAYER_ID),
      'STALE_WINDOW',
    );
    const end = t.lastCardClosed();
    expect(eventTypes(end.events)).toEqual(['PlayerWon', 'GameFinished']);
    expect(t.state.phase).toBe('FINISHED');
    expect(desconfia.getValidActions(t.state, 'b')).toEqual([]);
    expectError(desconfia.applyAction(t.state, { type: 'DOUBT', playId: 1 }, 'b'), 'GAME_OVER');
    expectError(
      desconfia.applyAction(t.state, { type: 'SYS_LAST_CARD_WINDOW_CLOSED', playId: 1 }, SYSTEM_PLAYER_ID),
      'STALE_WINDOW',
    );
  });

  it('a last card that is doubted and true wins; a lie takes the pile and play goes on', () => {
    const truth = Table.scripted({ a: ['3C'], b: ['4S', '5S'] });
    truth.play('a', ['3C'], '3');
    truth.doubt('b');
    expect(truth.state.finishedOrder).toEqual(['a']);
    expect(truth.state.phase).toBe('FINISHED');

    const lie = Table.scripted({ a: ['3C'], b: ['4S', '5S'] });
    lie.play('a', ['3C'], '9');
    lie.doubt('b');
    expect(lie.state.phase).toBe('PLAYING');
    expect(lie.hand('a')).toEqual(['3C']);
    expect(lie.current).toBe('b');
  });

  it('playing to the end ranks everyone by when they finished; the last one loses', () => {
    const t = Table.scripted({ a: ['3C'], b: ['3H'], c: ['5S', '6S'] }, { playUntilEnd: true });
    t.play('a', ['3C'], '3');
    const first = t.lastCardClosed();
    expect(eventTypes(first.events)).toEqual(['PlayerWon', 'TurnPassed']);
    expect(t.state.phase).toBe('PLAYING');
    expect(t.current).toBe('b');
    expect(t.state.claimRank).toBe('3'); // the pile and its rank stay
    expectError(desconfia.applyAction(t.state, { type: 'DOUBT', playId: 1 }, 'a'), 'NOT_PLAYING');
    t.play('b', ['3H'], '3');
    t.doubt('c'); // true: c takes the pile, b is out
    expect(t.state.phase).toBe('FINISHED');
    expect(desconfia.getResult(t.state).standings).toEqual([
      { playerId: 'a', position: 1, outcome: 'WINNER', score: 0 },
      { playerId: 'b', position: 2, outcome: 'PLACED', score: 0 },
      { playerId: 'c', position: 3, outcome: 'LOSER', score: 4 },
    ]);
  });

  it('playing to the end, the next player opens a new pile after a winner leaves on a doubt', () => {
    const t = Table.scripted({ a: ['3C'], b: ['4S', '5S'], c: ['6S', '7S'] }, { playUntilEnd: true });
    t.play('a', ['3C'], '3');
    const result = t.doubt('c');
    expect(find(result.events, 'NewPile')).toEqual([{ type: 'NewPile', starterId: 'b' }]);
    expect(t.state.finishedOrder).toEqual(['a']);
  });

  it('a loser emptied by a peixinho is out of cards too', () => {
    const t = Table.scripted(
      { a: ['3C', '9S'], b: ['9H', '9C', '9D'], c: ['5S', '6S'] },
      { playUntilEnd: true },
    );
    t.play('a', ['9S'], '9'); // true: b doubts, takes the nine and completes four
    t.doubt('b');
    expect(t.state.finishedOrder).toEqual(['b']);
    expect(t.current).toBe('a');
  });

  it('ties for cards left share the place', () => {
    const state = Table.scripted({ a: ['3C'], b: ['4S', '5S'], c: ['6S', '7S'] }).state;
    const finished: DesconfiaState = { ...state, finishedOrder: ['a'], hands: { ...state.hands, a: [] } };
    expect(standings(finished).map((s) => [s.playerId, s.position, s.outcome])).toEqual([
      ['a', 1, 'WINNER'],
      ['b', 2, 'PLACED'],
      ['c', 2, 'PLACED'],
    ]);
  });
});

describe('timeouts and the server contract', () => {
  it('plays one card of the pile rank when there is one, else any (open point #5)', () => {
    const t = basic();
    t.play('a', ['5S'], '6');
    t.minElapsed();
    expect(desconfia.getDefaultAction(t.state, 'b')).toEqual({
      type: 'PLAY',
      cardIds: ['6H'],
      claimRank: '6',
    });
    expect(desconfia.getDefaultAction(t.state, 'b')?.type).toBe('PLAY');
    expect(desconfia.getDefaultAction(t.state, 'c')).toBeNull();
    const result = t.timeout();
    expect(find(result.events, 'Played')[0]).toMatchObject({ playerId: 'b', count: 1, claimRank: '6' });
    t.minElapsed();
    const any = desconfia.getDefaultAction(t.state, 'c');
    expect(any).toMatchObject({ type: 'PLAY', claimRank: '6' });
  });

  it('on a new pile claims what the card is; a lone joker claims some rank', () => {
    const t = Table.scripted({ a: ['3C', 'JK1'], b: ['4S'] });
    expect(desconfia.getDefaultAction(t.state, 'a')).toEqual({
      type: 'PLAY',
      cardIds: ['3C'],
      claimRank: '3',
    });
    const jokerOnly = Table.scripted({ a: ['JK1'], b: ['3C'] });
    jokerOnly.state = { ...jokerOnly.state, currentIndex: 0 };
    expect(desconfia.getDefaultAction(jokerOnly.state, 'a')).toMatchObject({
      type: 'PLAY',
      cardIds: ['JK1'],
    });
  });

  it('lists one single-card play per card, and only the server applies system actions', () => {
    const t = Table.scripted({ a: ['3C', 'JK1'], b: ['4S'] });
    expect(desconfia.getValidActions(t.state, 'a')).toEqual([
      { type: 'PLAY', cardIds: ['3C'], claimRank: '3' },
      { type: 'PLAY', cardIds: ['JK1'], claimRank: '2' },
    ]);
    expectError(desconfia.applyAction(t.state, { type: 'SYS_TIMEOUT' }, 'a'), 'SYSTEM_ONLY');
    const over = { ...t.state, phase: 'FINISHED' as const };
    expectError(desconfia.applyAction(over, { type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(
      desconfia.applyAction(over, { type: 'PLAY', cardIds: ['3C'], claimRank: '3' }, 'a'),
      'GAME_OVER',
    );
  });

  it('validates client actions and settings', () => {
    expect(
      desconfiaActionSchema.safeParse({ type: 'PLAY', cardIds: ['JK1', '10H'], claimRank: '7' }).success,
    ).toBe(true);
    expect(desconfiaActionSchema.safeParse({ type: 'PLAY', cardIds: [], claimRank: '7' }).success).toBe(
      false,
    );
    expect(
      desconfiaActionSchema.safeParse({ type: 'PLAY', cardIds: ['7S'], claimRank: 'JOKER' }).success,
    ).toBe(false);
    expect(desconfiaActionSchema.safeParse({ type: 'DOUBT', playId: 3 }).success).toBe(true);
    expect(desconfiaActionSchema.safeParse({ type: 'SYS_TIMEOUT' }).success).toBe(false);
    expect(desconfiaConfigSchema.parse({})).toEqual({
      turnTimeoutMs: 30_000,
      doubtMinWindowMs: 2_000,
      lastCardWindowMs: 3_000,
      playUntilEnd: false,
    });
    expect(desconfia.configUi.map((f) => f.key)).toEqual([
      'playUntilEnd',
      'doubtMinWindowMs',
      'turnTimeoutMs',
    ]);
  });
});
