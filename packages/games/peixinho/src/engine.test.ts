import { SYSTEM_PLAYER_ID, createSeededRng, type PlayerId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { createPeixinhoModule, peixinho, peixinhoActionSchema, peixinhoConfigSchema } from './module';
import { FISH_TIMEOUT_MS, handSizeFor, resultOf, splitPeixinhos, standings } from './rules';
import {
  Table,
  cards,
  config,
  craft,
  eventTypes,
  expectError,
  expectOk,
  queuedRng,
  restOfDeck,
  scriptedDealer,
} from './test-utils';
import type { PeixinhoEvent } from './types';

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const find = <T extends PeixinhoEvent['type']>(events: readonly PeixinhoEvent[], type: T) =>
  events.filter((e): e is Extract<PeixinhoEvent, { type: T }> => e.type === type);

describe('setup (07 §1)', () => {
  it('deals 7 cards to two players and 5 to three to six; the rest is the pond', () => {
    for (let n = 2; n <= 6; n++) {
      const state = peixinho.setup(players(n), config(), createSeededRng(`deal-${n}`));
      const size = handSizeFor(n);
      expect(size).toBe(n === 2 ? 7 : 5);
      const inHands = Object.values(state.hands).reduce((sum, h) => sum + h.length, 0);
      const laid = Object.values(state.peixinhos).flat().length * 4;
      expect(inHands + laid).toBe(n * size);
      expect(state.pond).toHaveLength(52 - n * size);
      expect(state.pondSlots).toHaveLength(state.pond.length);
      expect(state.pondSize).toBe(52 - n * size);
      const all = [...Object.values(state.hands).flat(), ...state.pond].map((c) => c.id);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('accepts 2–6 players', () => {
    expect(() => peixinho.setup(players(1), config(), createSeededRng('x'))).toThrow(RangeError);
    expect(() => peixinho.setup(players(7), config(), createSeededRng('x'))).toThrow(RangeError);
    expect(() => peixinho.setup(['a', 'a'], config(), createSeededRng('x'))).toThrow(/Duplicate/);
  });

  it('rejects a dealer that does not use one exact deck', () => {
    const short = createPeixinhoModule(() => ({ hands: { a: cards('2S'), b: cards('3S') }, pond: [] }));
    expect(() => short.setup(['a', 'b'], config(), queuedRng())).toThrow(/wrong hand size/);
    const doubled = createPeixinhoModule(({ seats }) => ({
      hands: Object.fromEntries(seats.map((id) => [id, cards('2S', '3S', '4S', '5S', '6S', '7S', '8S')])),
      pond: restOfDeck([]).slice(0, 38),
    }));
    expect(() => doubled.setup(['a', 'b'], config(), queuedRng())).toThrow(/exactly once/);
  });

  it('lays a dealt peixinho down at once, with no extra turn', () => {
    const t = Table.scripted(
      {
        a: ['9S', '9H', '9C', '9D', '2S'],
        b: ['3S', '3H', '4S', '4H', '5S'],
        c: ['6S', '6H', '7S', '7H', '8S'],
      },
      [],
      {},
      1,
    );
    expect(t.state.peixinhos.a).toEqual(['9']);
    expect(t.hand('a')).toEqual(['2S']);
    expect(t.current).toBe('b');
  });

  it('picks a random starter for the first match', () => {
    const starters = new Set<PlayerId>();
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const state = peixinho.setup(players(4), config(), createSeededRng(seed));
      starters.add(state.seats[state.currentIndex] as PlayerId);
    }
    expect(starters.size).toBeGreaterThan(1);
  });

  it('then whoever made the fewest peixinhos starts, drawn among ties (open point #4)', () => {
    const previous = (scores: Record<string, number>) => ({
      standings: Object.entries(scores).map(([playerId, score]) => ({
        playerId,
        outcome: 'PLACED' as const,
        score,
      })),
    });
    for (const seed of ['1', '2', '3']) {
      const state = peixinho.setup(players(3), config(), createSeededRng(seed), {
        previousResult: previous({ p0: 6, p1: 2, p2: 5 }),
      });
      expect(state.seats[state.currentIndex]).toBe('p1');
    }
    const tied = new Set<PlayerId>();
    for (const seed of ['1', '2', '3', '4', '5', '6', '7', '8']) {
      const state = peixinho.setup(players(3), config(), createSeededRng(seed), {
        previousResult: previous({ p0: 3, p1: 3, p2: 7, gone: 0 }),
      });
      tied.add(state.seats[state.currentIndex] as PlayerId);
    }
    expect([...tied].sort()).toEqual(['p0', 'p1']);
  });
});

describe('asking (07 §2)', () => {
  const t = () =>
    Table.scripted(
      {
        a: ['7S', '7H', 'KC', '3D', '9S'],
        b: ['7D', 'KH', 'KS', '2C', '5H'],
        c: ['7C', '3S', '3H', '4H', '9H'],
      },
      ['4C', 'KD'],
    );

  it('refuses out of turn, asking yourself, unknown players and ranks you do not hold', () => {
    const table = t();
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'a', rank: '7' }, 'b'),
      'NOT_YOUR_TURN',
    );
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'a', rank: '7' }, 'a'),
      'CANNOT_ASK_SELF',
    );
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'z', rank: '7' }, 'a'),
      'UNKNOWN_TARGET',
    );
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'b', rank: 'Q' }, 'a'),
      'RANK_NOT_IN_HAND',
    );
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'b', rank: '7' }, 'z'),
      'UNKNOWN_PLAYER',
    );
    expectError(peixinho.applyAction(table.state, { type: 'FISH' }, 'a'), 'NOT_FISHING');
  });

  it('refuses asking a player with no cards', () => {
    const table = Table.crafted({ hands: { a: ['7S'], b: [], c: ['8S'] }, pond: [] });
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'b', rank: '7' }, 'a'),
      'TARGET_EMPTY',
    );
  });

  it('takes every card of the rank (1, 2 or 3) and keeps the turn', () => {
    for (const count of [1, 2, 3]) {
      const given = ['8S', '8H', '8C'].slice(0, count);
      const table = Table.crafted({
        hands: { a: ['8D', '2S'], b: [...given, '3S'], c: ['4S'] },
        pond: ['5S'],
      });
      const result = table.ask('a', 'b', '8');
      expect(find(result.events, 'CardsGiven')[0]?.cards.map((c) => c.id)).toEqual(given);
      expect(table.hand('b')).toEqual(['3S']);
      expect(table.current).toBe('a');
      if (count === 3) expect(table.state.peixinhos.a).toEqual(['8']);
    }
  });

  it('lets only the player on turn fish, and never ask while fishing', () => {
    const table = t();
    table.ask('a', 'b', '3');
    expectError(
      peixinho.applyAction(table.state, { type: 'ASK', targetId: 'c', rank: '3' }, 'a'),
      'MUST_FISH',
    );
    expectError(peixinho.applyAction(table.state, { type: 'FISH' }, 'b'), 'NOT_YOUR_TURN');
    expectError(
      peixinho.applyAction(table.state, { type: 'FISH', pondPosition: 99 }, 'a'),
      'INVALID_POND_POSITION',
    );
  });
});

describe('fishing (07 §3)', () => {
  const HANDS = { a: ['3S', '9S', '9H', '9C'], b: ['2S', '4S'], c: ['5S', '6S'] };

  it('another rank passes the turn clockwise', () => {
    const t = Table.crafted({ hands: HANDS, pond: ['JD', 'QD'] });
    t.ask('a', 'b', '3');
    const fished = t.fish();
    expect(find(fished.events, 'Fished')[0]).toMatchObject({ caughtAsked: false, card: null });
    expect(find(fished.events, 'TurnPassed')[0]).toEqual({ type: 'TurnPassed', from: 'a', to: 'b' });
    expect(t.hand('a')).toContain('JD');
  });

  it('the rank asked is shown to everyone and keeps the turn', () => {
    const t = Table.crafted({ hands: HANDS, pond: ['3D', 'QD'] });
    t.ask('a', 'b', '3');
    const fished = t.fish();
    expect(find(fished.events, 'Fished')[0]).toMatchObject({ caughtAsked: true, card: { id: '3D' } });
    expect(t.current).toBe('a');
    expect(peixinho.getPlayerView(t.state, 'c').lastFish).toMatchObject({
      card: { id: '3D' },
      caughtAsked: true,
    });
  });

  it('another rank that completes a peixinho is laid down and keeps the turn', () => {
    const t = Table.crafted({ hands: HANDS, pond: ['9D', 'QD'] });
    t.ask('a', 'b', '3');
    const fished = t.fish();
    expect(find(fished.events, 'PeixinhoMade')[0]).toMatchObject({
      playerId: 'a',
      rank: '9',
      extraTurn: true,
    });
    expect(t.current).toBe('a');
    expect(t.state.askLog.at(-1)?.peixinhosMade).toEqual(['9']);
  });

  it('an empty pond passes the turn', () => {
    const t = Table.crafted({ hands: HANDS, pond: [] });
    const result = t.ask('a', 'b', '3');
    expect(eventTypes(result.events)).toEqual(['Asked', 'GoFish', 'TurnPassed']);
    expect(find(result.events, 'GoFish')[0]).toMatchObject({ pondEmpty: true, awaitingPick: false });
    expect(t.current).toBe('b');
  });

  it('any spot of the pond gives its top card; a timeout fishes on its own', () => {
    for (const spot of [0, 1, 2]) {
      const t = Table.crafted({ hands: HANDS, pond: ['JD', 'QD', 'KD'] });
      t.ask('a', 'b', '3');
      expect(peixinho.getValidActions(t.state, 'a')).toEqual(
        [0, 1, 2].map((p) => ({ type: 'FISH', pondPosition: p })),
      );
      t.fish(spot);
      expect(t.hand('a')).toContain('JD');
      expect(t.state.pondSlots).toEqual([0, 1, 2].filter((p) => p !== spot));
      expect(t.state.lastFish).toMatchObject({ slot: spot, card: { id: 'JD' } });
    }
    const t = Table.crafted({ hands: HANDS, pond: ['JD', 'QD'] });
    t.ask('a', 'b', '3');
    expect(peixinho.getTimeoutMs(t.state)).toBe(FISH_TIMEOUT_MS);
    expect(peixinho.getDefaultAction(t.state, 'a')).toEqual({ type: 'FISH' });
    t.timeout();
    expect(t.hand('a')).toContain('JD');
    expect(t.current).toBe('b');
  });

  it('without pond picking the top card is drawn at once', () => {
    const t = Table.crafted({ hands: HANDS, pond: ['JD', 'QD'], config: { pondPicking: false } });
    const result = t.ask('a', 'b', '3');
    expect(eventTypes(result.events)).toEqual(['Asked', 'GoFish', 'Fished', 'TurnPassed']);
    expect(find(result.events, 'GoFish')[0]?.awaitingPick).toBe(false);
    expect(t.state.awaitingFish).toBeNull();
  });
});

describe('peixinhos (07 §4)', () => {
  it('four by asking are laid down and keep the turn', () => {
    const t = Table.crafted({ hands: { a: ['QS', 'QH', '2S'], b: ['QC', 'QD', '3S'] }, pond: ['4S'] });
    const result = t.ask('a', 'b', 'Q');
    expect(find(result.events, 'PeixinhoMade')).toEqual([
      {
        type: 'PeixinhoMade',
        playerId: 'a',
        rank: 'Q',
        cards: cards('QS', 'QH', 'QC', 'QD'),
        extraTurn: true,
      },
    ]);
    expect(t.current).toBe('a');
  });

  it('two in one move: the ask completes one, the refill another', () => {
    const t = Table.crafted({
      hands: { a: ['QS', 'QH', 'QC'], b: ['QD', '3S'], c: ['4S'] },
      pond: ['JS', 'JH', 'JC', 'JD', '5S', '6S', '7S', '8S'],
    });
    const result = t.ask('a', 'b', 'Q');
    expect(find(result.events, 'PeixinhoMade').map((e) => e.rank)).toEqual(['Q', 'J']);
    expect(t.state.peixinhos.a).toEqual(['Q', 'J']);
    expect(t.hand('a')).toEqual(['5S', '6S', '7S', '8S'].sort());
    expect(t.state.askLog.at(-1)?.peixinhosMade).toEqual(['Q', 'J']);
  });

  it('splits every complete rank out of a hand', () => {
    const { hand, made } = splitPeixinhos(cards('2S', '2H', '2C', '2D', 'AS', 'AH', 'AC', 'AD', '5S'));
    expect(made.map((m) => m.rank)).toEqual(['2', 'A']);
    expect(hand.map((c) => c.id)).toEqual(['5S']);
  });
});

describe('running out of cards (07 §5)', () => {
  it('the asker empty after a peixinho draws 4 and goes on', () => {
    const t = Table.crafted({
      hands: { a: ['QS', 'QH', 'QC'], b: ['QD', '3S'], c: ['4S'] },
      pond: ['5S', '6S', '7S', '8S', '9S'],
    });
    const result = t.ask('a', 'b', 'Q');
    expect(find(result.events, 'Refilled')).toEqual([
      { type: 'Refilled', playerId: 'a', count: 4, slots: [1, 2, 3, 4] },
    ]);
    expect(t.state.pondSlots).toEqual([0]);
    expect(t.current).toBe('a');
  });

  it('the giver draws 4 at once, although it is not their turn', () => {
    const t = Table.crafted({
      hands: { a: ['QS', '2S'], b: ['QD'], c: ['4S'] },
      pond: ['5S', '6S', '7S', '8S'],
    });
    const result = t.ask('a', 'b', 'Q');
    expect(find(result.events, 'Refilled')[0]).toMatchObject({ playerId: 'b', count: 4 });
    expect(t.hand('b')).toEqual(['5S', '6S', '7S', '8S'].sort());
    expect(t.current).toBe('a');
  });

  it('with fewer than 4 left, draws what there is', () => {
    const t = Table.crafted({ hands: { a: ['QS', '2S'], b: ['QD'], c: ['4S'] }, pond: ['5S', '6S'] });
    t.ask('a', 'b', 'Q');
    expect(t.hand('b')).toEqual(['5S', '6S']);
    expect(t.state.pond).toHaveLength(0);
  });

  it('four of a kind in a refill are laid down and it draws again, with no extra turn for the giver', () => {
    const t = Table.crafted({
      hands: { a: ['QS', '2S'], b: ['QD'], c: ['4S'] },
      pond: ['JS', 'JH', 'JC', 'JD', '5S', '6S'],
    });
    const result = t.ask('a', 'b', 'Q');
    expect(find(result.events, 'PeixinhoMade')).toEqual([
      {
        type: 'PeixinhoMade',
        playerId: 'b',
        rank: 'J',
        cards: cards('JS', 'JH', 'JC', 'JD'),
        extraTurn: false,
      },
    ]);
    expect(t.hand('b')).toEqual(['5S', '6S']);
    expect(t.current).toBe('a');
  });

  it('no cards and an empty pond: out, skipped, and nobody may ask them', () => {
    const t = Table.crafted({ hands: { a: ['QS', '2S'], b: ['QD'], c: ['2H', '5S'], d: ['5H'] }, pond: [] });
    const result = t.ask('a', 'b', 'Q');
    expect(find(result.events, 'PlayerOut')).toEqual([{ type: 'PlayerOut', playerId: 'b' }]);
    expect(peixinho.getPlayerView(t.state, 'a').seats.find((s) => s.id === 'b')?.out).toBe(true);
    expectError(
      peixinho.applyAction(t.state, { type: 'ASK', targetId: 'b', rank: '2' }, 'a'),
      'TARGET_EMPTY',
    );
    expect(peixinho.getValidActions(t.state, 'a').map((a) => a.type === 'ASK' && a.targetId)).not.toContain(
      'b',
    );
    // a goes fishing in an empty pond: the turn skips b.
    t.ask('a', 'd', '2');
    expect(t.current).toBe('c');
  });
});

describe('the end (07 §6)', () => {
  it('finishes when the 13th peixinho is laid down', () => {
    const laid = { a: ['2', '3', '4', '5', '6', '7'] as const, b: ['8', '9', '10', 'J', 'Q', 'K'] as const };
    const t = Table.crafted({
      hands: { a: ['AS', 'AH', 'AC'], b: ['AD'] },
      pond: [],
      peixinhos: { a: [...laid.a], b: [...laid.b] },
    });
    const result = t.ask('a', 'b', 'A');
    expect(eventTypes(result.events).slice(-2)).toEqual(['PeixinhoMade', 'GameFinished']);
    expect(t.state.phase).toBe('FINISHED');
    expect(t.state.winners).toEqual(['a']);
    expect(t.current).toBeNull();
    expect(peixinho.isFinished(t.state)).toBe(true);
    expect(peixinho.getPendingPlayers(t.state)).toEqual([]);
    expect(peixinho.getTimeoutMs(t.state)).toBeNull();
    expect(peixinho.getValidActions(t.state, 'a')).toEqual([]);
    expectError(peixinho.applyAction(t.state, { type: 'ASK', targetId: 'b', rank: 'A' }, 'a'), 'GAME_OVER');
    expect(resultOf(t.state).standings).toEqual([
      { playerId: 'a', position: 1, outcome: 'WINNER', score: 7 },
      { playerId: 'b', position: 2, outcome: 'PLACED', score: 6 },
    ]);
  });

  it('a tie shares the victory (open point #5)', () => {
    const state = craft({
      hands: { a: [], b: [], c: [] },
      peixinhos: { a: ['2', '3', '4', '5', '6'], b: ['7', '8', '9', '10', 'J'], c: ['Q', 'K', 'A'] },
    });
    expect(standings(state)).toEqual([
      { playerId: 'a', position: 1, outcome: 'WINNER', score: 5 },
      { playerId: 'b', position: 1, outcome: 'WINNER', score: 5 },
      { playerId: 'c', position: 3, outcome: 'PLACED', score: 3 },
    ]);
    expect(peixinho.getResult(state).summary).toEqual({ peixinhos: state.peixinhos });
  });

  it('the last two players with cards play it out to the 13th peixinho', () => {
    const t = Table.crafted({
      hands: { a: ['QS', 'QH', 'QC'], b: ['QD'], c: ['5S', '5H'], d: ['5C', '5D'] },
      pond: [],
      peixinhos: { a: ['2', '3', '4'], b: ['6', '7', '8'], c: ['9', '10', 'J'], d: ['K', 'A'] },
    });
    // a completes the queens and is left with nothing, like b: both are out.
    const queens = t.ask('a', 'b', 'Q');
    expect(find(queens.events, 'PlayerOut').map((e) => e.playerId)).toEqual(['a', 'b']);
    expect(find(queens.events, 'TurnPassed')[0]).toEqual({ type: 'TurnPassed', from: 'a', to: 'c' });
    t.ask('c', 'd', '5');
    expect(t.state.phase).toBe('FINISHED');
    expect(t.state.winners).toEqual(['a', 'c']);
  });

  it('safety net: a table where nobody else can play ends instead of stalling', () => {
    // Hand-made, inconsistent tables (a real game never gets here, rules §7).
    const keep = Table.crafted({ hands: { a: ['KS', '2S'], b: ['KH'], c: ['2H'] }, pond: [] });
    keep.ask('a', 'b', 'K');
    keep.ask('a', 'c', '2');
    expect(keep.state.phase).toBe('FINISHED');
    const pass = Table.crafted({ hands: { a: ['QS', 'QH', 'QC'], b: ['QD'], c: ['5S', '5H'] }, pond: [] });
    pass.ask('a', 'b', 'Q');
    expect(pass.state.phase).toBe('FINISHED');
    expect(pass.last?.events.at(-1)).toMatchObject({ type: 'GameFinished', winners: ['a'] });
  });
});

describe('timeouts and the server contract', () => {
  it('asks for the rank you hold most of, from a random opponent (open point #6)', () => {
    const t = Table.crafted({ hands: { a: ['2S', '9S', '9H'], b: ['3S'], c: ['4S'] }, pond: ['5S'] });
    const targets = new Set<string>();
    for (let n = 0; n < 12; n++) {
      const action = peixinho.getDefaultAction({ ...t.state, actionCount: n }, 'a');
      expect(action).toMatchObject({ type: 'ASK', rank: '9' });
      if (action?.type === 'ASK') targets.add(action.targetId);
    }
    expect([...targets].sort()).toEqual(['b', 'c']);
    expect(peixinho.getDefaultAction(t.state, 'b')).toBeNull();
    expect(peixinho.getTimeoutMs(t.state)).toBe(30_000);
    expect(peixinho.getPendingPlayers(t.state)).toEqual(['a']);
    const result = t.timeout();
    expect(find(result.events, 'Asked')[0]?.rank).toBe('9');
  });

  it('only the server applies system actions', () => {
    const t = Table.crafted({ hands: { a: ['2S'], b: ['3S'] }, pond: [] });
    expectError(peixinho.applyAction(t.state, { type: 'SYS_TIMEOUT' }, 'a'), 'SYSTEM_ONLY');
    const over = { ...t.state, phase: 'FINISHED' as const };
    expectError(peixinho.applyAction(over, { type: 'SYS_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });

  it('lists every rank held × every opponent with cards', () => {
    const t = Table.crafted({ hands: { a: ['2S', '9S', '9H'], b: ['3S'], c: [] }, pond: ['5S'] });
    expect(peixinho.getValidActions(t.state, 'a')).toEqual([
      { type: 'ASK', targetId: 'b', rank: '2' },
      { type: 'ASK', targetId: 'b', rank: '9' },
    ]);
    expect(peixinho.getValidActions(t.state, 'b')).toEqual([]);
  });

  it('validates client actions and settings', () => {
    expect(peixinhoActionSchema.safeParse({ type: 'ASK', targetId: 'b', rank: '7' }).success).toBe(true);
    expect(peixinhoActionSchema.safeParse({ type: 'ASK', targetId: 'b', rank: 'JOKER' }).success).toBe(false);
    expect(peixinhoActionSchema.safeParse({ type: 'FISH', pondPosition: 3 }).success).toBe(true);
    expect(peixinhoActionSchema.safeParse({ type: 'FISH', pondPosition: -1 }).success).toBe(false);
    expect(peixinhoActionSchema.safeParse({ type: 'SYS_TIMEOUT' }).success).toBe(false);
    expect(peixinhoConfigSchema.parse({})).toEqual({
      turnTimeoutMs: 30_000,
      refillCount: 4,
      tableMemory: 'LAST_5',
      pondPicking: true,
    });
    expect(peixinho.configUi.map((f) => f.key)).toEqual(['tableMemory', 'pondPicking', 'turnTimeoutMs']);
  });

  it('builds with the shuffled dealer by default and a scripted one on demand', () => {
    const module = createPeixinhoModule(scriptedDealer({ a: ['2S'], b: ['3S'] }));
    expect(() => module.setup(['a', 'b'], config(), queuedRng())).toThrow(/wrong hand size/);
    expectOk(
      peixinho.applyAction(
        peixinho.setup(players(2), config(), createSeededRng('ok')),
        { type: 'SYS_TIMEOUT' },
        SYSTEM_PLAYER_ID,
      ),
    );
  });
});
