import { createSeededRng, type CardId } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { mexicana, mexicanaActionSchema, mexicanaConfigSchema } from './module';
import { buildState, current, eventTypes, expectError, expectOk, ids, play } from './test-utils';
import type { MexicanaState } from './types';

const config = mexicanaConfigSchema.parse({});

function freshGame(players = ['a', 'b', 'c'], seed = 'seed'): MexicanaState {
  return mexicana.setup(players, config, createSeededRng(seed));
}

function chooseAll(state: MexicanaState): MexicanaState {
  let next = state;
  for (const id of next.turnOrder) {
    next = expectOk(mexicana.applyAction(next, mexicana.getDefaultAction(next, id)!, id)).state;
  }
  return next;
}

describe('setup', () => {
  it('deals 3 face-down and 6 in hand to each player from a 54-card deck', () => {
    const state = freshGame();
    for (const id of state.turnOrder) {
      const p = state.players[id]!;
      expect(p.faceDown.filter(Boolean)).toHaveLength(3);
      expect(p.hand).toHaveLength(6);
      expect(p.faceUp).toEqual([null, null, null]);
    }
    expect(state.drawPile).toHaveLength(54 - 27);
    expect(state.phase).toBe('CHOOSING');
  });

  it('with 6 players the draw pile starts empty', () => {
    expect(freshGame(['a', 'b', 'c', 'd', 'e', 'f']).drawPile).toHaveLength(0);
  });

  it('is deterministic for a given rng seed', () => {
    expect(freshGame(['a', 'b'], 'x')).toEqual(freshGame(['a', 'b'], 'x'));
    expect(freshGame(['a', 'b'], 'x')).not.toEqual(freshGame(['a', 'b'], 'y'));
  });

  it('rejects invalid player lists', () => {
    expect(() => freshGame(['solo'])).toThrow(RangeError);
    expect(() => freshGame(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toThrow(RangeError);
    expect(() => freshGame(['a', 'a'])).toThrow(/Duplicate/);
  });

  it('the loser of the previous match starts', () => {
    const previousResult = {
      standings: [
        { playerId: 'a', position: 1, outcome: 'WINNER' as const },
        { playerId: 'b', position: 2, outcome: 'PLACED' as const },
        { playerId: 'c', position: 3, outcome: 'LOSER' as const },
      ],
    };
    for (const seed of ['1', '2', '3', '4']) {
      const state = mexicana.setup(['a', 'b', 'c'], config, createSeededRng(seed), { previousResult });
      expect(state.turnOrder[state.currentIndex]).toBe('c');
    }
  });

  it('falls back to a random starter when the loser left the room', () => {
    const previousResult = { standings: [{ playerId: 'gone', position: 2, outcome: 'LOSER' as const }] };
    const starters = new Set(
      ['1', '2', '3', '4', '5', '6', '7', '8'].map((seed) => {
        const s = mexicana.setup(['a', 'b', 'c'], config, createSeededRng(seed), { previousResult });
        return s.turnOrder[s.currentIndex];
      }),
    );
    expect(starters.size).toBeGreaterThan(1);
  });
});

describe('choosing face-up cards', () => {
  it('moves the chosen cards to the table and starts once everyone chose', () => {
    let state = freshGame(['a', 'b']);
    const chosen = ids(state.players.a!.hand.slice(0, 3)) as [CardId, CardId, CardId];
    const first = expectOk(mexicana.applyAction(state, { type: 'CHOOSE_FACE_UP', cardIds: chosen }, 'a'));
    state = first.state;
    expect(ids(state.players.a!.faceUp.filter((c) => c !== null))).toEqual(chosen);
    expect(state.players.a!.hand).toHaveLength(3);
    expect(state.phase).toBe('CHOOSING');
    expect(mexicana.getPendingPlayers(state)).toEqual(['b']);
    expect(mexicana.getCurrentPlayer(state)).toBeNull();

    const { state: started, events } = expectOk(
      mexicana.applyAction(state, mexicana.getDefaultAction(state, 'b')!, 'b'),
    );
    expect(started.phase).toBe('PLAYING');
    expect(eventTypes(events)).toEqual(['FaceUpChosen', 'PlayStarted']);
  });

  it('auto-choice picks the three highest cards (joker highest)', () => {
    const state = freshGame(['a', 'b']);
    state.players.a!.hand = buildState({
      players: { x: { hand: ['2C', 'JK1', '9D', 'AS', '4H', 'KD'] } },
    }).players.x!.hand;
    const action = mexicana.getDefaultAction(state, 'a');
    expect(action).toEqual({ type: 'CHOOSE_FACE_UP', cardIds: ['JK1', 'AS', 'KD'] });
  });

  it('validates the choice', () => {
    const state = freshGame(['a', 'b']);
    const hand = ids(state.players.a!.hand);
    const choose = (cardIds: string[]) =>
      mexicana.applyAction(
        state,
        { type: 'CHOOSE_FACE_UP', cardIds: cardIds as [CardId, CardId, CardId] },
        'a',
      );
    expectError(choose([hand[0]!, hand[0]!, hand[1]!]), 'INVALID_CARDS');
    expectError(choose([hand[0]!, hand[1]!, ids(state.players.b!.hand)[0]!]), 'INVALID_CARDS');
    const done = expectOk(choose(hand.slice(0, 3))).state;
    expectError(
      mexicana.applyAction(
        done,
        { type: 'CHOOSE_FACE_UP', cardIds: hand.slice(3, 6) as [CardId, CardId, CardId] },
        'a',
      ),
      'ALREADY_CHOSEN',
    );
    expect(mexicana.getValidActions(done, 'a')).toEqual([]);
    expect(mexicana.getDefaultAction(done, 'a')).toBeNull();
  });

  it('offers the 20 possible choices as valid actions', () => {
    expect(mexicana.getValidActions(freshGame(), 'a')).toHaveLength(20);
  });

  it('refuses choosing after the game started and playing before it', () => {
    const state = freshGame(['a', 'b']);
    expectError(mexicana.applyAction(state, { type: 'PICK_UP_PILE' }, 'a'), 'WRONG_PHASE');
    const started = chooseAll(state);
    expectError(
      mexicana.applyAction(started, { type: 'CHOOSE_FACE_UP', cardIds: ['2C', '3C', '4C'] }, 'a'),
      'WRONG_PHASE',
    );
  });
});

describe('turn rules', () => {
  it('rejects unknown players and out-of-turn actions', () => {
    const state = buildState({ players: { p1: { hand: ['5H'] }, p2: { hand: ['6H'] } } });
    expectError(play(state, 'ghost', '5H'), 'UNKNOWN_PLAYER');
    expectError(play(state, 'p2', '6H'), 'NOT_YOUR_TURN');
  });

  it('the first player may play any card', () => {
    const state = buildState({ players: { p1: { hand: ['AH', '4C'] }, p2: { hand: ['6H'] } } });
    expectOk(play(state, 'p1', 'AH'));
  });

  it('requires equal or higher, jumps allowed', () => {
    const state = buildState({
      players: { p1: { hand: ['9H', '4C', '4D'] }, p2: { hand: ['6H'] } },
      discard: ['4S'],
    });
    expectOk(play(state, 'p1', '4C'));
    expectOk(play(state, 'p1', '9H'));
    const higher = buildState({
      players: { p1: { hand: ['4C', 'KD'] }, p2: { hand: ['6H'] } },
      discard: ['5S'],
    });
    expectError(play(higher, 'p1', '4C'), 'ILLEGAL_PLAY');
  });

  it('plays several cards of the same rank at once, never mixed', () => {
    const state = buildState({ players: { p1: { hand: ['5H', '5S', '6D', 'KC'] }, p2: { hand: ['6H'] } } });
    const next = expectOk(play(state, 'p1', '5H', '5S')).state;
    expect(ids(next.discardPile)).toEqual(['5H', '5S']);
    expectError(play(state, 'p1', '5H', '6D'), 'MIXED_RANKS');
    expectError(play(state, 'p1', '5H', '5H'), 'INVALID_CARDS');
    expectError(play(state, 'p1'), 'INVALID_CARDS');
    expectError(play(state, 'p1', '9C'), 'INVALID_CARDS');
  });

  it('refills the hand to 3 from the draw pile after playing', () => {
    const state = buildState({
      players: { p1: { hand: ['5H', '5S', '6D'] }, p2: { hand: ['6H'] } },
      draw: ['2C', '3C', '4C'],
    });
    const { state: next, events } = expectOk(play(state, 'p1', '5H', '5S'));
    expect(ids(next.players.p1!.hand)).toEqual(['6D', '4C', '3C']);
    expect(ids(next.drawPile)).toEqual(['2C']);
    expect(events).toContainEqual({ type: 'CardsDrawn', playerId: 'p1', count: 2 });
  });

  it('skips finished players when passing the turn', () => {
    const state = buildState({
      players: { p1: { hand: ['5H', '9C'] }, p2: { finishedPosition: 1 }, p3: { hand: ['6H'] } },
    });
    expect(current(expectOk(play(state, 'p1', '5H')).state)).toBe('p3');
  });
});

describe('layers', () => {
  it('face-up cards are played only after the hand is empty, one at a time', () => {
    const state = buildState({
      players: { p1: { faceUp: ['9H', '9S', null], faceDown: ['2C'] }, p2: { hand: ['6H'] } },
    });
    expectError(play(state, 'p1', '9H', '9S'), 'INVALID_CARDS');
    const { state: next, events } = expectOk(play(state, 'p1', '9H'));
    expect(events[0]).toMatchObject({ type: 'CardsPlayed', source: 'faceUp' });
    expect(next.players.p1!.faceUp).toEqual([null, next.players.p1!.faceUp[1], null]);
  });

  it('face-up cards cannot be played while holding a hand', () => {
    const state = buildState({ players: { p1: { hand: ['4C'], faceUp: ['9H'] }, p2: { hand: ['6H'] } } });
    expectError(play(state, 'p1', '9H'), 'INVALID_CARDS');
  });

  it('only face-down plays are valid once hand and face-up are gone', () => {
    const state = buildState({
      players: { p1: { faceDown: ['4C', null, 'KD'] }, p2: { hand: ['6H'] } },
      discard: ['AS'],
    });
    expect(mexicana.getValidActions(state, 'p1')).toEqual([
      { type: 'PLAY_FACE_DOWN', position: 0 },
      { type: 'PLAY_FACE_DOWN', position: 2 },
    ]);
    expectError(play(state, 'p1', '4C'), 'MUST_PLAY_FACE_DOWN');
    expectError(mexicana.applyAction(state, { type: 'PLAY_FACE_DOWN', position: 1 }, 'p1'), 'INVALID_SLOT');
    expectError(mexicana.applyAction(state, { type: 'PICK_UP_PILE' }, 'p1'), 'PICK_UP_NOT_ALLOWED');
  });

  it('face-down plays are refused while other layers remain', () => {
    const state = buildState({ players: { p1: { faceUp: ['9H'], faceDown: ['4C'] }, p2: { hand: ['6H'] } } });
    expectError(mexicana.applyAction(state, { type: 'PLAY_FACE_DOWN', position: 0 }, 'p1'), 'INVALID_SLOT');
  });

  it('after picking up, the hand must be emptied before returning to the table', () => {
    const state = buildState({
      players: { p1: { faceUp: ['4H'] }, p2: { hand: ['6H', '6C'] } },
      discard: ['KS'],
    });
    const next = expectOk(mexicana.applyAction(state, { type: 'PICK_UP_PILE' }, 'p1')).state;
    const back = { ...next, currentIndex: 0 };
    expect(mexicana.getValidActions(back, 'p1')).toEqual([{ type: 'PLAY_CARDS', cardIds: ['KS'] }]);
  });
});

describe('finishing', () => {
  it('awards positions in order and the last player loses', () => {
    const state = buildState({
      players: { p1: { hand: ['KH'] }, p2: { hand: ['4C'] }, p3: { hand: ['AS'] } },
      current: 'p1',
    });
    const s1 = expectOk(play(state, 'p1', 'KH'));
    expect(s1.events).toContainEqual({ type: 'PlayerFinished', playerId: 'p1', position: 1 });
    expect(current(s1.state)).toBe('p2');

    const s2 = expectOk(mexicana.applyAction(s1.state, { type: 'PICK_UP_PILE' }, 'p2'));
    const s3 = expectOk(play(s2.state, 'p3', 'AS'));
    expect(eventTypes(s3.events)).toEqual([
      'CardsPlayed',
      'PlayerFinished',
      'PlayerFinished',
      'GameFinished',
    ]);
    expect(s3.state.phase).toBe('FINISHED');
    expect(mexicana.isFinished(s3.state)).toBe(true);
    expect(mexicana.getResult(s3.state)).toEqual({
      standings: [
        { playerId: 'p1', position: 1, outcome: 'WINNER' },
        { playerId: 'p3', position: 2, outcome: 'PLACED' },
        { playerId: 'p2', position: 3, outcome: 'LOSER' },
      ],
    });
    expect(mexicana.getPendingPlayers(s3.state)).toEqual([]);
    expect(mexicana.getTimeoutMs(s3.state)).toBeNull();
    expect(mexicana.getDefaultAction(s3.state, 'p2')).toBeNull();
    expectError(play(s3.state, 'p2', '4C'), 'WRONG_PHASE');
  });
});

describe('views', () => {
  it('never leak hidden information', () => {
    const state = chooseAll(freshGame(['a', 'b', 'c']));
    const view = mexicana.getPlayerView(state, 'a');
    const json = JSON.stringify(view);
    for (const other of ['b', 'c']) {
      for (const c of state.players[other]!.hand) expect(json).not.toContain(`"${c.id}"`);
    }
    for (const id of state.turnOrder) {
      for (const c of state.players[id]!.faceDown) expect(json).not.toContain(`"${c!.id}"`);
    }
    for (const c of state.drawPile) expect(json).not.toContain(`"${c.id}"`);
    expect(view.hand).toEqual(state.players.a!.hand);
    expect(view.seats.map((s) => s.handCount)).toEqual([3, 3, 3]);
    expect(view.seats[0]!.faceDown).toEqual([true, true, true]);
    expect(view.drawPileCount).toBe(state.drawPile.length);
  });

  it('spectators see no hand', () => {
    const view = mexicana.getSpectatorView(chooseAll(freshGame()));
    expect(view.selfId).toBeNull();
    expect(view.hand).toEqual([]);
  });
});

describe('module metadata', () => {
  it('exposes timers per phase', () => {
    const state = freshGame();
    expect(mexicana.getTimeoutMs(state)).toBe(30_000);
    expect(mexicana.getTimeoutMs(chooseAll(state))).toBe(30_000);
    expect(mexicana.getPendingPlayers(state)).toEqual(['a', 'b', 'c']);
    expect(mexicana.getPendingPlayers(chooseAll(state))).toEqual([
      mexicana.getCurrentPlayer(chooseAll(state)),
    ]);
  });

  it('client schema rejects server-only and malformed actions', () => {
    expect(mexicanaActionSchema.safeParse({ type: 'TIMEOUT_PICK_UP' }).success).toBe(false);
    expect(mexicanaActionSchema.safeParse({ type: 'PLAY_CARDS', cardIds: ['ZZ'] }).success).toBe(false);
    expect(mexicanaActionSchema.safeParse({ type: 'PLAY_FACE_DOWN', position: 3 }).success).toBe(false);
    expect(mexicanaActionSchema.safeParse({ type: 'PICK_UP_PILE', extra: 1 }).success).toBe(false);
    expect(mexicanaActionSchema.safeParse({ type: 'PLAY_CARDS', cardIds: ['10H', 'JK2'] }).success).toBe(
      true,
    );
  });

  it('config has sensible defaults and bounds', () => {
    expect(config).toEqual({ turnTimeoutMs: 30_000, chooseTimeoutMs: 30_000 });
    expect(mexicanaConfigSchema.safeParse({ turnTimeoutMs: 1 }).success).toBe(false);
  });
});
