import { SYSTEM_PLAYER_ID, createSeededRng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { randomCut, shuffledDealer } from './engine';
import { sueca } from './module';
import { PACE } from './rules';
import {
  SEATING,
  Table,
  config,
  expectError,
  eventTypes,
  queuedRng,
  uid,
  type StackedHand,
} from './test-utils';
import type { Seat, SuecaState } from './types';

/** Every hand dealt with the same stacked deck: South holds the four aces, spades are trumps. */
const SWEEP: StackedHand = {
  hands: {
    S: ['AS', '7S', 'KS', 'JS', 'QS', 'AH', 'AC', 'AD', '7H', '7C'],
    E: ['6S', '5S', '4S', '3S', '2S', 'KH', 'JH', 'QH', '6H', '5H'],
    N: ['7D', 'KD', 'JD', 'QD', '6D', '5D', '4D', '3D', '2D', '4H'],
    W: ['KC', 'JC', 'QC', '6C', '5C', '4C', '3C', '2C', '3H', '2H'],
  },
  trump: 'AS',
  from: 'TOP',
};

/** South deals the stacked first hand (so South holds the trump card); later hands are shuffled. */
function stackedTable(stack: StackedHand = SWEEP, targetGames = 4): Table {
  return new Table({ firstDealer: 'S', stacks: { 1: stack }, config: { targetGames } });
}

/** Cuts from the top and lets the clock play the whole hand. */
function playHand(t: Table): void {
  t.cut('TOP');
  t.playOut();
}

const view = (t: Table, playerId: string) => t.module.getPlayerView(t.state, playerId);
const cardCount = (s: SuecaState) =>
  Object.values(s.hands).flat().length + s.trick.plays.length + s.wonCards.A.length + s.wonCards.B.length;

describe('setup', () => {
  it('seats the players where they chose and starts with the cut', () => {
    const t = new Table({ firstDealer: 'E' });
    expect(t.state.seats).toEqual(SEATING);
    expect(t.state).toMatchObject({ phase: 'CUT', handNumber: 1, dealer: 'E', cutter: 'S' });
    expect(t.module.getCurrentPlayer(t.state)).toBe('ana');
    expect(cardCount(t.state)).toBe(0);
  });

  it('draws the first dealer (open point #8)', () => {
    const dealers = new Set(
      Array.from(
        { length: 40 },
        (_, i) => sueca.setup(['a', 'b', 'c', 'd'], config(), createSeededRng(`d${i}`)).dealer,
      ),
    );
    expect(dealers.size).toBe(4);
  });

  it('without seats, takes the players in the order of play', () => {
    const state = sueca.setup(['a', 'b', 'c', 'd'], config(), queuedRng(0));
    expect(state.seats).toEqual({ S: 'a', E: 'b', N: 'c', W: 'd' });
  });

  it('refuses anything but four different players in four seats', () => {
    expect(() => sueca.setup(['a', 'b', 'c'], config(), queuedRng())).toThrow(RangeError);
    expect(() => sueca.setup(['a', 'b', 'c', 'c'], config(), queuedRng())).toThrow(/Duplicate/);
    expect(() =>
      sueca.setup(['a', 'b', 'c', 'd'], config(), queuedRng(), { seating: { S: 'a', E: 'b', N: 'c' } }),
    ).toThrow(/Every seat/);
    expect(() =>
      sueca.setup(['a', 'b', 'c', 'd'], config(), queuedRng(), {
        seating: { S: 'a', E: 'b', N: 'c', W: 'x' },
      }),
    ).toThrow(/Every seat/);
  });
});

describe('the deck and the deal', () => {
  it('has 40 cards without 8, 9, 10 or jokers', () => {
    const deck = shuffledDealer({ handNumber: 1, dealer: 'S', seed: 'x' });
    expect(deck).toHaveLength(40);
    expect(new Set(deck.map((c) => c.uid)).size).toBe(40);
    expect(deck.some((c) => ['8', '9', '10', 'JOKER'].includes(c.rank))).toBe(false);
    expect(shuffledDealer({ handNumber: 2, dealer: 'S', seed: 'x' })).not.toEqual(deck);
  });

  it.each(['TOP', 'BOTTOM'] as const)(
    'cut %s: that card of the shuffled deck is the dealer’s trump',
    (from) => {
      const t = new Table({ firstDealer: 'N' });
      const deck = shuffledDealer({ handNumber: 1, dealer: 'N', seed: t.state.seed });
      t.cut(from);
      const expected = from === 'TOP' ? deck[0] : deck[39];
      expect(t.state.trumpCard).toEqual(expected);
      expect(t.state.trumpSuit).toBe(expected?.suit);
      expect(t.state.hands.N).toContainEqual(expected);
      for (const seat of ['S', 'E', 'N', 'W'] as const) expect(t.state.hands[seat]).toHaveLength(10);
      expect(cardCount(t.state)).toBe(40);
      expect(t.state.cutFrom).toBe(from);
      // The one on the dealer's right opens.
      expect(t.state.trick.leader).toBe('W');
    },
  );

  it('only the cutter cuts, and only during the cut', () => {
    const t = new Table({ firstDealer: 'S' });
    expectError(t.try({ type: 'CHOOSE_CUT', from: 'TOP' }, 'ana'), 'NOT_CUTTER');
    expectError(t.try({ type: 'PLAY', cardUid: uid('AS') }, 'duarte'), 'WRONG_PHASE');
    t.cut('TOP');
    expectError(t.try({ type: 'CHOOSE_CUT', from: 'TOP' }, 'duarte'), 'WRONG_PHASE');
  });

  it('a cut that times out picks top or bottom from the seed', () => {
    const t = new Table({ firstDealer: 'S' });
    const expected = randomCut(t.state);
    expect(t.module.getDefaultAction(t.state, 'duarte')).toEqual({ type: 'CHOOSE_CUT', from: expected });
    expect(t.module.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_CUT_TIMEOUT' });
    t.system({ type: 'SYS_CUT_TIMEOUT' });
    expect(t.state.cutFrom).toBe(expected);
    const draws = new Set(Array.from({ length: 30 }, (_, i) => randomCut({ seed: `s${i}`, handNumber: 1 })));
    expect(draws).toEqual(new Set(['TOP', 'BOTTOM']));
  });

  it('refuses a deck that is not 40 different cards', () => {
    const bad = new Table({
      firstDealer: 'S',
      stacks: { 1: { ...SWEEP, hands: { ...SWEEP.hands, E: [...SWEEP.hands.E.slice(0, 9), 'AS'] } } },
    });
    expect(() => bad.cut('TOP')).toThrow();
  });
});

describe('turns and timers', () => {
  it('rotates the deal, the cut and the lead counter-clockwise from hand to hand', () => {
    const t = stackedTable(SWEEP, 10);
    const seen: [Seat, Seat, Seat][] = [];
    for (let hand = 0; hand < 4; hand++) {
      seen.push([t.state.dealer, t.state.cutter, t.state.trick.leader]);
      playHand(t);
      t.system({ type: 'SYS_NEXT_HAND' });
    }
    expect(seen).toEqual([
      ['S', 'W', 'E'],
      ['E', 'S', 'N'],
      ['N', 'E', 'W'],
      ['W', 'N', 'S'],
    ]);
  });

  it('only the player on turn plays, and the winner of a trick leads the next', () => {
    const t = stackedTable();
    t.cut('TOP');
    expectError(t.try({ type: 'PLAY', cardUid: uid('AS') }, 'ana'), 'NOT_YOUR_TURN');
    expectError(t.try({ type: 'PLAY', cardUid: uid('KD') }, 'bruno'), 'INVALID_CARD');
    t.trick(['E', '6H'], ['N', '4H'], ['W', '2H'], ['S', 'AH']);
    expect(t.state.trick.leader).toBe('S');
    expect(t.module.getCurrentPlayer(t.state)).toBe('ana');
  });

  it('times the cut (15 s) and each play (30 s); nothing between', () => {
    const t = stackedTable();
    expect(t.module.getTimeoutMs(t.state)).toBe(15_000);
    expect(t.module.getPendingPlayers(t.state)).toEqual(['duarte']);
    t.cut('TOP');
    expect(t.module.getTimeoutMs(t.state)).toBe(30_000);
    expect(t.module.getPendingPlayers(t.state)).toEqual(['bruno']);
    t.play('E', '6H');
    t.play('N', '4H');
    t.play('W', '2H');
    t.play('S', 'AH');
    expect(t.state.phase).toBe('TRICK_DONE');
    expect(t.module.getTimeoutMs(t.state)).toBeNull();
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getTimeoutAction?.(t.state)).toBeNull();
    expect(t.module.getDefaultAction(t.state, 'bruno')).toBeNull();
  });

  it('plays the legal card worth least when time runs out (open point #5)', () => {
    const t = stackedTable();
    t.cut('TOP');
    // Bruno opens: of 6S 5S 4S 3S 2S KH JH QH 6H 5H, a 2 is the weakest card without points.
    expect(t.module.getDefaultAction(t.state, 'bruno')).toEqual({ type: 'PLAY', cardUid: uid('2S') });
    t.play('E', 'KH');
    // Carla must follow hearts with the 4♥.
    expect(t.module.getDefaultAction(t.state, 'carla')).toEqual({ type: 'PLAY', cardUid: uid('4H') });
    expect(t.module.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_TURN_TIMEOUT' });
    t.system({ type: 'SYS_TURN_TIMEOUT' });
    expect(t.state.trick.plays.at(-1)?.card.id).toBe('4H');
  });

  it('keeps a full trick on the table 1.2 s, then collects it', () => {
    const t = stackedTable();
    t.cut('TOP');
    for (const [seat, id] of [
      ['E', 'KH'],
      ['N', '4H'],
      ['W', '3H'],
    ] as const)
      t.play(seat, id);
    const done = t.play('S', 'AH');
    expect(eventTypes(done.events)).toEqual(['CardPlayed', 'TrickWon']);
    expect(done.events[1]).toEqual({ type: 'TrickWon', winner: 'S', team: 'A' });
    expect(done.schedule).toEqual([{ action: { type: 'SYS_TRICK_SHOWN' }, delayMs: PACE.trickShown }]);
    // Tricks count once collected.
    expect(t.state.tricksWon).toEqual({ A: 0, B: 0 });
    const collected = t.system({ type: 'SYS_TRICK_SHOWN' });
    expect(collected.events).toEqual([{ type: 'TrickCollected', winner: 'S', team: 'A', next: 'S' }]);
    expect(t.state.tricksWon).toEqual({ A: 1, B: 0 });
    expect(t.state.wonCards.A.map((c) => c.id)).toEqual(['KH', '4H', '3H', 'AH']);
    expectError(t.try({ type: 'SYS_TRICK_SHOWN' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });
});

describe('scoring and the match', () => {
  it('adds every hand’s 120 points and ends at the games of the match', () => {
    const t = stackedTable(SWEEP, 4);
    playHand(t);
    const first = t.state.history[0];
    expect((first?.points.A ?? 0) + (first?.points.B ?? 0)).toBe(120);
    while (t.state.phase !== 'FINISHED') {
      expect(t.state.phase).toBe('HAND_SUMMARY');
      expect(t.last?.schedule).toEqual([{ action: { type: 'SYS_NEXT_HAND' }, delayMs: PACE.handSummary }]);
      t.system({ type: 'SYS_NEXT_HAND' });
      playHand(t);
    }
    expect(t.state.winner).not.toBeNull();
    const winner = t.state.winner as 'A' | 'B';
    expect(t.state.games[winner]).toBeGreaterThanOrEqual(4);
    expect(eventTypes(t.last?.events ?? []).slice(-2)).toEqual(['HandEnded', 'MatchFinished']);
    expect(t.module.isFinished(t.state)).toBe(true);
    expect(t.module.getValidActions(t.state, 'ana')).toEqual([]);
    expectError(t.try({ type: 'SYS_NEXT_HAND' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });

  it.each([1, 4, 10])('a match to %i games ends as soon as a team gets there', (target) => {
    const t = new Table({ firstDealer: 'S', config: { targetGames: target } });
    let hands = 0;
    for (; t.state.phase !== 'FINISHED'; hands++) {
      if (t.state.phase === 'HAND_SUMMARY') t.system({ type: 'SYS_NEXT_HAND' });
      t.system({ type: 'SYS_CUT_TIMEOUT' });
      t.playOut();
      const { A, B } = t.state.games;
      if (!t.module.isFinished(t.state)) expect(Math.max(A, B)).toBeLessThan(target);
    }
    expect(Math.max(t.state.games.A, t.state.games.B)).toBeGreaterThanOrEqual(target);
    expect(t.state.history).toHaveLength(hands);
  });

  it('gives both partners of the winning team the win, with their games as score', () => {
    const t = new Table({ firstDealer: 'S', config: { targetGames: 1 } });
    while (t.state.phase !== 'FINISHED') {
      if (t.state.phase === 'HAND_SUMMARY') t.system({ type: 'SYS_NEXT_HAND' });
      t.system({ type: 'SYS_CUT_TIMEOUT' });
      t.playOut();
    }
    const winner = t.state.winner as 'A' | 'B';
    const result = t.module.getResult(t.state);
    const winners = winner === 'A' ? ['ana', 'carla'] : ['bruno', 'duarte'];
    expect(result.standings.filter((s) => s.outcome === 'WINNER').map((s) => s.playerId)).toEqual(winners);
    expect(result.standings.filter((s) => s.outcome === 'LOSER')).toHaveLength(2);
    expect(result.standings[0]?.score).toBe(t.state.games[winner]);
    expect(result.summary).toMatchObject({
      winner,
      teams: { A: ['ana', 'carla'], B: ['bruno', 'duarte'] },
      targetGames: 1,
      hands: t.state.history,
    });
  });

  it('has no result before the end', () => {
    expect(new Table().module.getResult(new Table().state)).toEqual({ standings: [] });
  });

  it('keeps the matches each pair won in the room (rules §10)', () => {
    const finish = (previousResult: ReturnType<typeof sueca.getResult> | null) => {
      const t = new Table({ firstDealer: 'S', config: { targetGames: 1 }, previousResult });
      while (t.state.phase !== 'FINISHED') {
        if (t.state.phase === 'HAND_SUMMARY') t.system({ type: 'SYS_NEXT_HAND' });
        t.system({ type: 'SYS_CUT_TIMEOUT' });
        t.playOut();
      }
      return t;
    };
    const first = finish(null);
    const firstWinner = first.state.winner as 'A' | 'B';
    expect(first.module.getPlayerView(first.state, 'ana').matchesWon).toEqual(
      firstWinner === 'A' ? { A: 1, B: 0 } : { A: 0, B: 1 },
    );
    const second = finish(first.module.getResult(first.state));
    expect(view(second, 'ana').matchesWon.A + view(second, 'ana').matchesWon.B).toBe(2);
    // A pair that never played here starts at zero; garbage in an old summary is ignored.
    const odd = new Table({ previousResult: { standings: [], summary: { tally: [{ players: ['x'] }, 3] } } });
    expect(odd.state.tally).toEqual([]);
    expect(new Table({ previousResult: { standings: [], summary: { tally: 'no' } } }).state.tally).toEqual(
      [],
    );
  });
});

describe('the last trick (rules §9)', () => {
  function afterFirstTrick(): Table {
    const t = stackedTable();
    t.cut('TOP');
    t.trick(['E', 'KH'], ['N', '4H'], ['W', '3H'], ['S', 'AH']);
    return t;
  }

  it('is not there before the first trick is collected', () => {
    const t = stackedTable();
    t.cut('TOP');
    expect(view(t, 'ana').lastTrickAvailable).toBe(false);
    expectError(t.try({ type: 'VIEW_LAST_TRICK' }, 'ana'), 'NO_LAST_TRICK');
  });

  it('shows the last closed trick to whoever asks, once per hand, for 3 s', () => {
    const t = afterFirstTrick();
    expect(view(t, 'carla').lastTrickAvailable).toBe(true);
    expect(t.module.getValidActions(t.state, 'carla')).toEqual([{ type: 'VIEW_LAST_TRICK' }]);
    const looked = t.apply({ type: 'VIEW_LAST_TRICK' }, 'carla');
    expect(looked.events).toEqual([{ type: 'LastTrickViewed', seat: 'N' }]);
    expect(looked.schedule).toEqual([
      { action: { type: 'SYS_HIDE_LAST_TRICK', seat: 'N' }, delayMs: PACE.lastTrick },
    ]);
    const shown = view(t, 'carla').lastTrickView;
    expect(shown?.winner).toBe('S');
    expect(shown?.plays.map((p) => [p.seat, p.card.id])).toEqual([
      ['E', 'KH'],
      ['N', '4H'],
      ['W', '3H'],
      ['S', 'AH'],
    ]);
    // Only Carla sees it; nobody's look is used up but hers.
    expect(view(t, 'ana').lastTrickView).toBeNull();
    expect(view(t, 'ana').lastTrickAvailable).toBe(true);
    expect(view(t, 'carla').lastTrickAvailable).toBe(false);
    expectError(t.try({ type: 'VIEW_LAST_TRICK' }, 'carla'), 'LAST_TRICK_USED');
    t.system({ type: 'SYS_HIDE_LAST_TRICK', seat: 'N' });
    expect(view(t, 'carla').lastTrickView).toBeNull();
    expectError(t.try({ type: 'SYS_HIDE_LAST_TRICK', seat: 'N' }, SYSTEM_PLAYER_ID), 'NOT_SHOWN');
  });

  it('keeps showing the trick it was asked for, while play goes on', () => {
    const t = afterFirstTrick();
    t.apply({ type: 'VIEW_LAST_TRICK' }, 'ana');
    t.play('S', 'AS');
    const playing = t.last;
    // The look's clock is re-armed with each step, so it always ends.
    expect(playing?.schedule).toContainEqual({
      action: { type: 'SYS_HIDE_LAST_TRICK', seat: 'S' },
      delayMs: 3000,
    });
    t.play('E', '2S');
    t.play('N', '2D');
    t.play('W', '2C');
    t.system({ type: 'SYS_TRICK_SHOWN' });
    expect(t.state.lastTrick?.winner).toBe('S');
    expect(view(t, 'ana').lastTrickView?.plays.map((p) => p.card.id)).toEqual(['KH', '4H', '3H', 'AH']);
  });

  it('may be looked at while a full trick waits on the table', () => {
    const t = afterFirstTrick();
    for (const [seat, id] of [
      ['S', '7H'],
      ['E', 'JH'],
      ['N', '2D'],
      ['W', '2H'],
    ] as const)
      t.play(seat, id);
    expect(t.state.phase).toBe('TRICK_DONE');
    const looked = t.apply({ type: 'VIEW_LAST_TRICK' }, 'bruno');
    expect(looked.schedule).toContainEqual({ action: { type: 'SYS_TRICK_SHOWN' }, delayMs: PACE.trickShown });
  });

  it('comes back with every hand', () => {
    const t = stackedTable();
    t.cut('TOP');
    t.trick(['E', 'KH'], ['N', '4H'], ['W', '3H'], ['S', 'AH']);
    t.apply({ type: 'VIEW_LAST_TRICK' }, 'ana');
    t.playOut();
    expect(t.state.lastTrickShown).toEqual({});
    expectError(t.try({ type: 'VIEW_LAST_TRICK' }, 'bruno'), 'WRONG_PHASE');
    t.system({ type: 'SYS_NEXT_HAND' });
    expect(t.state.lastTrickViewsUsed).toEqual({ S: 0, E: 0, N: 0, W: 0 });
  });
});

describe('table talk (rules §11)', () => {
  it('closes the chat while a hand is played and opens it between hands and at the end', () => {
    const t = stackedTable(SWEEP, 1);
    const open = () => t.module.isChatOpen?.(t.state);
    expect(open()).toBe(false);
    t.cut('TOP');
    expect(open()).toBe(false);
    for (const [seat, id] of [
      ['E', 'KH'],
      ['N', '4H'],
      ['W', '3H'],
      ['S', 'AH'],
    ] as const)
      t.play(seat, id);
    expect(t.state.phase).toBe('TRICK_DONE');
    expect(open()).toBe(false);
    expect(view(t, 'ana').chatEnabled).toBe(false);
    t.system({ type: 'SYS_TRICK_SHOWN' });
    t.playOut();
    expect(t.state.phase).toBe('FINISHED');
    expect(open()).toBe(true);
    expect(view(t, 'ana').chatEnabled).toBe(true);
  });

  it('is open in the summary between hands', () => {
    const t = stackedTable(SWEEP, 10);
    playHand(t);
    expect(t.state.phase).toBe('HAND_SUMMARY');
    expect(t.module.isChatOpen?.(t.state)).toBe(true);
    expect(view(t, 'bruno').handSummary).toEqual(t.state.history[0]);
  });
});

describe('waiting for a player who dropped (core §2)', () => {
  it('stops the table, refuses every move, and picks up where it was', () => {
    const t = stackedTable();
    t.cut('TOP');
    t.play('E', 'KH');
    const paused = t.system({ type: 'SYS_PAUSE', playerId: 'carla' });
    expect(paused.events).toEqual([{ type: 'GamePaused', seat: 'N' }]);
    expect(t.state).toMatchObject({ phase: 'PAUSED', pausedFrom: 'PLAYING', absent: ['N'] });
    expect(t.module.getCurrentPlayer(t.state)).toBeNull();
    expect(t.module.getPendingPlayers(t.state)).toEqual([]);
    expect(t.module.getTimeoutMs(t.state)).toBeNull();
    expect(t.module.getTimeoutAction?.(t.state)).toBeNull();
    expect(t.module.getValidActions(t.state, 'carla')).toEqual([]);
    expect(paused.schedule).toBeUndefined();
    expectError(t.try({ type: 'PLAY', cardUid: uid('4H') }, 'carla'), 'PAUSED');
    expectError(t.try({ type: 'VIEW_LAST_TRICK' }, 'ana'), 'PAUSED');
    expectError(t.try({ type: 'SYS_TURN_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expect(view(t, 'ana').absent).toEqual(['N']);
    expect(view(t, 'ana').seats.find((s) => s.seat === 'N')?.absent).toBe(true);

    const resumed = t.system({ type: 'SYS_RESUME', playerId: 'carla' });
    expect(resumed.events).toEqual([{ type: 'GameResumed', seat: 'N' }]);
    expect(t.state).toMatchObject({ phase: 'PLAYING', pausedFrom: null, absent: [] });
    expect(t.module.getCurrentPlayer(t.state)).toBe('carla');
    t.play('N', '4H');
  });

  it('waits for everyone who dropped', () => {
    const t = stackedTable();
    t.system({ type: 'SYS_PAUSE', playerId: 'duarte' });
    t.system({ type: 'SYS_PAUSE', playerId: 'ana' });
    expectError(t.try({ type: 'SYS_PAUSE', playerId: 'ana' }, SYSTEM_PLAYER_ID), 'ALREADY_ABSENT');
    t.system({ type: 'SYS_RESUME', playerId: 'duarte' });
    expect(t.state.phase).toBe('PAUSED');
    expectError(t.try({ type: 'SYS_RESUME', playerId: 'duarte' }, SYSTEM_PLAYER_ID), 'NOT_ABSENT');
    t.system({ type: 'SYS_RESUME', playerId: 'ana' });
    expect(t.state.phase).toBe('CUT');
    expect(t.module.getPendingPlayers(t.state)).toEqual(['duarte']);
  });

  it('re-arms what a pause interrupted: a full trick, the summary', () => {
    const t = stackedTable();
    t.cut('TOP');
    for (const [seat, id] of [
      ['E', 'KH'],
      ['N', '4H'],
      ['W', '3H'],
      ['S', 'AH'],
    ] as const)
      t.play(seat, id);
    t.system({ type: 'SYS_PAUSE', playerId: 'bruno' });
    expectError(t.try({ type: 'SYS_TRICK_SHOWN' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    const back = t.system({ type: 'SYS_RESUME', playerId: 'bruno' });
    expect(back.schedule).toEqual([{ action: { type: 'SYS_TRICK_SHOWN' }, delayMs: PACE.trickShown }]);
    t.system({ type: 'SYS_TRICK_SHOWN' });
    t.playOut();
    t.system({ type: 'SYS_PAUSE', playerId: 'ana' });
    // A pause between hands keeps the chat open and the summary on screen.
    expect(t.module.isChatOpen?.(t.state)).toBe(true);
    expect(view(t, 'carla').handSummary).not.toBeNull();
    const resumed = t.system({ type: 'SYS_RESUME', playerId: 'ana' });
    expect(resumed.schedule).toEqual([{ action: { type: 'SYS_NEXT_HAND' }, delayMs: PACE.handSummary }]);
  });

  it('ends a look at the last trick', () => {
    const t = stackedTable();
    t.cut('TOP');
    t.trick(['E', 'KH'], ['N', '4H'], ['W', '3H'], ['S', 'AH']);
    t.apply({ type: 'VIEW_LAST_TRICK' }, 'bruno');
    t.system({ type: 'SYS_PAUSE', playerId: 'ana' });
    expect(view(t, 'bruno').lastTrickView).toBeNull();
  });

  it('cannot pause a finished match, nor for a stranger', () => {
    const t = stackedTable(SWEEP, 1);
    expectError(t.try({ type: 'SYS_PAUSE', playerId: 'zé' }, SYSTEM_PLAYER_ID), 'UNKNOWN_PLAYER');
    expectError(t.try({ type: 'SYS_RESUME', playerId: 'zé' }, SYSTEM_PLAYER_ID), 'UNKNOWN_PLAYER');
    playHand(t);
    expect(t.state.phase).toBe('FINISHED');
    expectError(t.try({ type: 'SYS_PAUSE', playerId: 'ana' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });

  it('waits as long as the room says before the host decides', () => {
    expect(sueca.getPauseGraceMs?.(stackedTable().state)).toBe(120_000);
    const t = new Table({ config: { disconnectGraceMs: 300_000 } });
    expect(sueca.getPauseGraceMs?.(t.state)).toBe(300_000);
  });
});

describe('guards', () => {
  it('keeps system actions to the server and the table to its players', () => {
    const t = stackedTable();
    expectError(t.try({ type: 'SYS_CUT_TIMEOUT' }, 'ana'), 'SYSTEM_ONLY');
    expectError(t.try({ type: 'CHOOSE_CUT', from: 'TOP' }, 'zé'), 'UNKNOWN_PLAYER');
    expectError(t.try({ type: 'SYS_TURN_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expect(t.module.getValidActions(t.state, 'zé')).toEqual([]);
  });

  it('accepts only well-formed client actions', () => {
    const parse = (action: unknown) => sueca.actionSchema.safeParse(action).success;
    expect(parse({ type: 'PLAY', cardUid: 'AS#0' })).toBe(true);
    expect(parse({ type: 'PLAY', cardUid: '10S#0' })).toBe(false);
    expect(parse({ type: 'PLAY', cardUid: 'AS' })).toBe(false);
    expect(parse({ type: 'CHOOSE_CUT', from: 'MIDDLE' })).toBe(false);
    expect(parse({ type: 'SYS_NEXT_HAND' })).toBe(false);
    expect(parse({ type: 'VIEW_LAST_TRICK', extra: 1 })).toBe(false);
  });

  it('shows a spectator no hand at all', () => {
    const t = stackedTable();
    t.cut('TOP');
    const spectator = sueca.getSpectatorView(t.state);
    expect(spectator.mySeat).toBeNull();
    expect(spectator.myHand).toEqual([]);
    expect(spectator.legalCardUids).toEqual([]);
    expect(spectator.lastTrickAvailable).toBe(false);
  });
});
