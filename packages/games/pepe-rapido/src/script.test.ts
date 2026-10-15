import { createSeededRng, createShoe, type CardInstance } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { setup } from './engine';
import { getTimeoutAction, getTimeoutMs } from './moves';
import { resultOf } from './rules';
import {
  ANA,
  BRUNO,
  allCards,
  card,
  config,
  group,
  ok,
  play,
  refused,
  stateWith,
  sys,
  topOf,
} from './test-utils';
import type { PepeState } from './types';
import { getPlayerView } from './view';

/** The kit's scenarios (05), with injected states; columns A1…A5 are indexes 0…4, piles E/D are 0/1. */
describe('Pepe Rápido — scenarios (kit 05)', () => {
  it('C1: a simple play turns the card underneath face up', () => {
    const s = stateWith({
      centre: [['7S'], ['JD']],
      ana: { columns: [['3D'], [], ['2C', '8H']] },
      bruno: { columns: [['10C']] },
    });
    const { state, events } = ok(s, ANA, play(s, ANA, 2, 0));
    expect(state.centre[0].at(-1)?.id).toBe('8H');
    expect(topOf(state, ANA, 2)).toBe('2C');
    expect(events[0]).toMatchObject({
      type: 'Played',
      playerId: ANA,
      column: 2,
      pile: 0,
      revealed: card('2C'),
    });
  });

  it('C2: the ace goes on a king only while they link up', () => {
    const spec = { centre: [['KC'], ['5D']] as [string[], string[]], ana: { columns: [['AD'], ['9S']] } };
    ok(stateWith(spec), ANA, play(stateWith(spec), ANA, 0, 0));
    const unlinked = stateWith({ ...spec, config: { aceKingWrap: false } });
    refused(unlinked, ANA, play(unlinked, ANA, 0, 0), 'INVALID_MOVE');
  });

  it('C3: a joker goes on anything, and anything on a joker', () => {
    const s = stateWith({
      centre: [['2S'], ['5H']],
      ana: { columns: [[], [], [], ['QS']] },
      bruno: { columns: [['8D'], ['JK1']] },
    });
    const { state } = ok(s, BRUNO, play(s, BRUNO, 1, 1));
    expect(state.centre[1].at(-1)?.id).toBe('JK1');
    const after = ok(state, ANA, play(state, ANA, 3, 1)).state;
    expect(after.centre[1].at(-1)?.id).toBe('QS');
  });

  it('C4: grouping equal ranks frees the card underneath; a joker groups both ways', () => {
    const s = stateWith({
      centre: [['2S'], ['2H']],
      ana: { columns: [['JK2'], ['4D', '9C'], ['6S'], [], ['9H']] },
    });
    const { state, events } = ok(s, ANA, group(s, ANA, 1, 4));
    expect(state.areas[ANA]?.columns[4]?.map((c) => c.id)).toEqual(['9H', '9C']);
    expect(topOf(state, ANA, 1)).toBe('4D');
    expect(events[0]).toMatchObject({ type: 'Grouped', from: 1, to: 4, revealed: card('4D') });
    ok(s, ANA, group(s, ANA, 0, 2));
    ok(s, ANA, group(s, ANA, 2, 0));
  });

  it('C5: a card moves into an empty column', () => {
    const s = stateWith({
      centre: [['2S'], ['2H']],
      ana: { columns: [[], ['5S'], ['QC'], ['3H', '10D']] },
    });
    const { state, events } = ok(s, ANA, group(s, ANA, 3, 0, 'MOVE_TO_EMPTY'));
    expect(topOf(state, ANA, 0)).toBe('10D');
    expect(topOf(state, ANA, 3)).toBe('3H');
    expect(events[0]).toMatchObject({ type: 'MovedToEmpty', from: 3, to: 0, revealed: card('3H') });
  });

  it('C6: two plays on the same pile: the first to arrive counts, the other is refused', () => {
    const s = stateWith({
      centre: [['6D'], ['KH']],
      ana: { columns: [[], ['7C'], ['2H']] },
      bruno: { columns: [[], [], ['5S'], ['9C']] },
    });
    const anaPlay = play(s, ANA, 1, 0);
    const brunoPlay = play(s, BRUNO, 2, 0);
    const { state } = ok(s, ANA, anaPlay);
    expect(state.centre[0].at(-1)?.id).toBe('7C');
    // Bruno saw the 6 of diamonds; even though a 5 no longer fits anyway, the reason is the race.
    refused(state, BRUNO, brunoPlay, 'TOP_CHANGED');
    expect(topOf(state, BRUNO, 2)).toBe('5S');
  });

  it('C7: nobody can play → stall; both press Virar → countdown → each turns a card over', () => {
    const s = stateWith({
      centre: [['2S'], ['2H']],
      ana: { columns: [['3C'], ['7D']], reserve: ['KS'] },
      bruno: { columns: [['9S'], ['QH']], reserve: ['4D'] },
    });
    const stalled = ok(s, ANA, play(s, ANA, 0, 0));
    expect(stalled.state.phase).toBe('STALLED');
    expect(stalled.events.map((e) => e.type)).toEqual(['Played', 'Stalled']);
    const first = ok(stalled.state, ANA, { type: 'REQUEST_FLIP' });
    expect(first.state.phase).toBe('STALLED');
    const both = ok(first.state, BRUNO, { type: 'REQUEST_FLIP' });
    expect(both.state.phase).toBe('COUNTDOWN');
    expect(getTimeoutMs(both.state)).toBe(3000);
    const flipped = sys(both.state, getTimeoutAction(both.state)!);
    expect(flipped.state.centre.map((p) => p.at(-1)?.id)).toEqual(['KS', '4D']);
    expect(flipped.events).toContainEqual({ type: 'Flipped', cards: [card('KS'), card('4D')] });
  });

  it('C8: the round ends blind; piles are shared out as the rules say and nothing is lost', () => {
    const deck = createShoe({ decks: 1, jokers: 2 });
    const take = (ids: string[]) => ids.map((id) => deck.find((c) => c.id === id) as CardInstance);
    const named = new Set(['8H', '7S']);
    const rest = deck.filter((c) => !named.has(c.id));
    const [anaReserve, brunoCols, brunoReserve, pileE, pileD] = [4, 6, 3, 7, 32].reduce<CardInstance[][]>(
      (parts, n) => {
        const used = parts.flat().length;
        return [...parts, rest.slice(used, used + n)];
      },
      [],
    );
    const s: PepeState = {
      ...stateWith(),
      areas: {
        [ANA]: { columns: [take(['8H']), [], [], [], []], reserve: anaReserve!, wantsFlip: false },
        [BRUNO]: {
          columns: [brunoCols!.slice(0, 1), brunoCols!.slice(1, 3), brunoCols!.slice(3, 6), [], []],
          reserve: brunoReserve!,
          wantsFlip: false,
        },
      },
      centre: [[...pileE!, ...take(['7S'])], pileD!],
    };
    expect(allCards(s)).toHaveLength(54);

    const ended = ok(s, ANA, play(s, ANA, 0, 0));
    expect(ended.state.phase).toBe('CHOOSING_PILE');
    expect(ended.state.centre.map((p) => p.length)).toEqual([9, 32]);
    // Blind by default: Ana sees no count before choosing.
    expect(getPlayerView(ended.state, ANA).centre.map((p) => p.count)).toEqual([null, null]);
    refused(ended.state, BRUNO, { type: 'CHOOSE_PILE', pile: 1 }, 'NOT_ROUND_WINNER');
    refused(ended.state, BRUNO, play(ended.state, BRUNO, 0, 1), 'WRONG_PHASE');

    const chosen = ok(ended.state, ANA, { type: 'CHOOSE_PILE', pile: 0 });
    const ana = chosen.state.areas[ANA]!;
    const bruno = chosen.state.areas[BRUNO]!;
    expect(ana.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 3]);
    expect(ana.reserve).toHaveLength(0);
    expect(bruno.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5]);
    expect(bruno.reserve).toHaveLength(26);
    expect(chosen.state.round).toBe(2);
    expect(chosen.state.phase).toBe('ROUND_SETUP');
    expect(allCards(chosen.state)).toHaveLength(54);
    expect(new Set(allCards(chosen.state).map((c) => c.uid)).size).toBe(54);
    expect(chosen.schedule).toEqual([{ action: { type: 'SYS_ROUND_SETUP_DONE', round: 2 }, delayMs: 2200 }]);

    const counting = sys(chosen.state, { type: 'SYS_ROUND_SETUP_DONE', round: 2 }).state;
    expect(counting.phase).toBe('COUNTDOWN');
    // C9 follows: only Bruno has a reserve, so only Bruno turns over.
    const flipped = sys(counting, getTimeoutAction(counting)!);
    expect(flipped.events).toContainEqual({ type: 'Flipped', cards: [null, bruno.reserve.at(-1)] });
    expect(flipped.state.centre[0]).toHaveLength(0);
  });

  it('C9: with one reserve, only its owner flips (and only they need to press Virar)', () => {
    const s = stateWith({
      phase: 'STALLED',
      centre: [['2S'], ['2H']],
      ana: { columns: [['7D']] },
      bruno: { columns: [['9S']], reserve: ['3C', '4C'] },
    });
    refused(s, ANA, { type: 'REQUEST_FLIP' }, 'NO_RESERVE');
    const { state } = ok(s, BRUNO, { type: 'REQUEST_FLIP' });
    expect(state.phase).toBe('COUNTDOWN');
    const flipped = sys(state, { type: 'SYS_COUNTDOWN_DONE', flip: state.flips });
    expect(flipped.state.centre.map((p) => p.at(-1)?.id)).toEqual(['2S', '4C']);
    expect(flipped.events).toContainEqual({ type: 'Flipped', cards: [null, card('4C')] });
  });

  it('C10: emptying the columns without a reserve wins the game', () => {
    const s = stateWith({
      centre: [['5S'], ['KD']],
      ana: { columns: [[], [], ['6C']] },
      bruno: { columns: [['2D'], ['8C']], reserve: ['QC'] },
    });
    const { state, events } = ok(s, ANA, play(s, ANA, 2, 0));
    expect(state.phase).toBe('FINISHED');
    expect(state.winner).toBe(ANA);
    expect(events.map((e) => e.type)).toEqual(['Played', 'ColumnsEmptied', 'GameWon']);
    expect(resultOf(state).standings).toEqual([
      { playerId: ANA, outcome: 'WINNER', position: 1, score: 0 },
      { playerId: BRUNO, outcome: 'LOSER', position: 2, score: 3 },
    ]);
    refused(state, BRUNO, play(state, BRUNO, 1, 1), 'GAME_OVER');
  });

  it('C11: by default no view tells how many cards a centre pile has, or what is face down', () => {
    const s = setup([ANA, BRUNO], config(), createSeededRng('c11'));
    const flipped = sys(s, { type: 'SYS_COUNTDOWN_DONE', flip: s.flips }).state;
    for (const id of [ANA, BRUNO]) {
      const view = getPlayerView(flipped, id);
      expect(view.centre.every((p) => p.count === null)).toBe(true);
      expect(view.sides[1].totalCount).toBeNull();
      expect(view.sides[1].reserveCount).toBeNull();
      const json = JSON.stringify(view);
      const hidden = flipped.areas[id]!.columns.flatMap((c) => c.slice(0, -1));
      for (const c of [...hidden, ...flipped.areas[id]!.reserve]) expect(json).not.toContain(`"${c.uid}"`);
    }
  });

  it('C12: only up: one above, the ace on the king, never the king on the ace', () => {
    const only = { direction: 'UP_ONLY' as const };
    const s = stateWith({
      config: only,
      centre: [['7S'], ['KC']],
      ana: { columns: [['AH'], ['8D'], ['6C']] },
    });
    ok(s, ANA, play(s, ANA, 1, 0));
    refused(s, ANA, play(s, ANA, 2, 0), 'INVALID_MOVE');
    ok(s, ANA, play(s, ANA, 0, 1));
    const ace = stateWith({ config: only, centre: [['AH'], ['2S']], ana: { columns: [['KS'], ['9D']] } });
    refused(ace, ANA, play(ace, ANA, 0, 0), 'INVALID_MOVE');
  });

  it('C13: without jokers, 52 cards: 26 each, 15 in columns and 11 in reserve', () => {
    const s = setup([ANA, BRUNO], config({ jokers: false }), createSeededRng('c13'));
    expect(allCards(s)).toHaveLength(52);
    for (const id of [ANA, BRUNO]) {
      expect(s.areas[id]!.columns.map((c) => c.length)).toEqual([1, 2, 3, 4, 5]);
      expect(s.areas[id]!.reserve).toHaveLength(11);
    }
    expect(allCards(s).some((c) => c.rank === 'JOKER')).toBe(false);
  });

  it('C14: counts show only where the room allows them', () => {
    const spec = {
      phase: 'CHOOSING_PILE' as const,
      roundWinner: ANA,
      centre: [['2S', '3S', '4S'], ['5H']] as [string[], string[]],
      ana: { reserve: ['KD', 'QD'] },
      bruno: { columns: [['9C', '8C']], reserve: ['7C'] },
    };
    const open = stateWith({ ...spec, config: { showCentreCounts: true, showOpponentCounts: true } });
    const anaView = getPlayerView(open, ANA);
    expect(anaView.centre.map((p) => p.count)).toEqual([3, 1]);
    expect(anaView.sides[1]).toMatchObject({ id: BRUNO, totalCount: 3, reserveCount: 1, hasReserve: true });
    expect(anaView.sides[0].reserveCount).toBe(2);
    expect(anaView.canChoosePile).toBe(true);

    const closed = stateWith({ ...spec, config: { showOwnReserveCount: false } });
    const hidden = getPlayerView(closed, ANA);
    expect(hidden.sides[0].reserveCount).toBeNull();
    expect(hidden.sides[1]).toMatchObject({ totalCount: null, reserveCount: null, hasReserve: true });
    expect(getPlayerView(closed, BRUNO).canChoosePile).toBe(false);
  });

  it('C15: grouping and moving can be switched off', () => {
    const s = stateWith({
      config: { grouping: false, moveToEmpty: false },
      centre: [['2S'], ['2H']],
      ana: { columns: [[], ['4D', '9C'], [], [], ['9H']] },
    });
    refused(s, ANA, group(s, ANA, 1, 4), 'GROUPING_OFF');
    refused(s, ANA, group(s, ANA, 1, 0, 'MOVE_TO_EMPTY'), 'MOVE_OFF');
  });

  it('C16: with "vira sozinho" a stall flips by itself, unless someone can play meanwhile', () => {
    const spec = {
      config: { autoFlip: true },
      phase: 'STALLED' as const,
      centre: [['2S'], ['2H']] as [string[], string[]],
      ana: { columns: [['5D', '9C'], [], [], [], ['9H']], reserve: ['KS'] },
      bruno: { columns: [['10S']], reserve: ['4D'] },
    };
    const s = stateWith(spec);
    expect(getTimeoutMs(s)).toBe(2000);
    const auto = sys(s, getTimeoutAction(s)!);
    expect(auto.state.phase).toBe('COUNTDOWN');
    const flipped = sys(auto.state, getTimeoutAction(auto.state)!);
    expect(flipped.state.centre.map((p) => p.at(-1)?.id)).toEqual(['KS', '4D']);

    // Ana groups the 9s: the 3 underneath fits the 2s, so the stall (and its automatic flip) is over.
    const grouped = ok(
      stateWith({ ...spec, ana: { ...spec.ana, columns: [['3D', '9C'], [], [], [], ['9H']] } }),
      ANA,
      {
        type: 'GROUP',
        cardUid: '9C#0',
        fromColumn: 0,
        toColumn: 4,
      },
    );
    expect(grouped.state.phase).toBe('PLAYING');
    expect(getTimeoutAction(grouped.state)).toBeNull();
    expect(getTimeoutMs(grouped.state)).toBeNull();
    refused(grouped.state, '__system__', { type: 'SYS_AUTO_FLIP' }, 'STALE');
  });
});
