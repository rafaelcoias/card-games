import { createSeededRng, pickOne } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { highCard, highCardConfigSchema, type HighCardState } from './high-card';

const config = highCardConfigSchema.parse({ rounds: 3 });

function start(players = ['a', 'b']): HighCardState {
  return highCard.setup(players, config, createSeededRng('hc'));
}

describe('high-card', () => {
  it('deals one card per round, sorted', () => {
    const state = start();
    expect(state.hands.a).toHaveLength(3);
    expect(highCard.getPendingPlayers(state)).toEqual(['a', 'b']);
    expect(highCard.getCurrentPlayer(state)).toBeNull();
    expect(highCard.getTimeoutMs(state)).toBe(30_000);
  });

  it('keeps commitments hidden until the round resolves', () => {
    const state = start();
    const first = highCard.applyAction(state, highCard.getDefaultAction(state, 'a')!, 'a');
    if (!first.ok) throw new Error(first.error.code);
    const viewForB = highCard.getPlayerView(first.state, 'b');
    expect(viewForB.seats.find((s) => s.id === 'a')?.hasCommitted).toBe(true);
    expect(JSON.stringify(viewForB)).not.toContain(state.hands.a![0]!.id);
    expect(highCard.getValidActions(first.state, 'a')).toEqual([]);
    expect(
      highCard.applyAction(first.state, { type: 'PLAY_CARD', cardId: state.hands.a![1]!.id }, 'a'),
    ).toMatchObject({
      ok: false,
      error: { code: 'ALREADY_PLAYED' },
    });
  });

  it('plays to completion and ranks by score', () => {
    const rng = createSeededRng('play');
    let state = start(['a', 'b', 'c']);
    let rounds = 0;
    while (!highCard.isFinished(state)) {
      const actor = pickOne(highCard.getPendingPlayers(state), rng);
      const result = highCard.applyAction(state, pickOne(highCard.getValidActions(state, actor), rng), actor);
      if (!result.ok) throw new Error(result.error.code);
      if (result.events.some((e) => e.type === 'RoundResolved')) rounds += 1;
      state = result.state;
    }
    expect(rounds).toBe(3);
    const { standings } = highCard.getResult(state);
    expect(standings.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(standings.map((r) => r.outcome)).toEqual(['WINNER', 'PLACED', 'LOSER']);
    const scores = standings.map((r) => state.scores[r.playerId]!);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
    expect(highCard.getTimeoutMs(state)).toBeNull();
    expect(highCard.getDefaultAction(state, 'a')).toBeNull();
    expect(highCard.applyAction(state, { type: 'PLAY_CARD', cardId: 'AS' }, 'a')).toMatchObject({
      ok: false,
    });
  });

  it('awards a point to every tied winner', () => {
    const state: HighCardState = {
      ...start(),
      hands: { a: [{ id: 'KS', rank: 'K', suit: 'S' }], b: [{ id: 'KH', rank: 'K', suit: 'H' }] },
      rounds: 1,
    };
    const r1 = highCard.applyAction(state, { type: 'PLAY_CARD', cardId: 'KS' }, 'a');
    if (!r1.ok) throw new Error();
    const r2 = highCard.applyAction(r1.state, { type: 'PLAY_CARD', cardId: 'KH' }, 'b');
    if (!r2.ok) throw new Error();
    expect(r2.state.lastRound?.winners).toEqual(['a', 'b']);
    expect(r2.state.scores).toEqual({ a: 1, b: 1 });
  });

  it('rejects unknown players and cards', () => {
    const state = start();
    expect(highCard.applyAction(state, { type: 'PLAY_CARD', cardId: 'AS' }, 'zz')).toMatchObject({
      ok: false,
    });
    expect(highCard.applyAction(state, { type: 'PLAY_CARD', cardId: 'XX' }, 'a')).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CARDS' },
    });
    expect(highCard.getSpectatorView(state).selfId).toBeNull();
  });
});
