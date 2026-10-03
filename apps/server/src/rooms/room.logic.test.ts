import { describe, expect, it } from 'vitest';
import { AppError } from '../common/app-error';
import {
  acceptsPlayers,
  addMember,
  allSeatsTaken,
  appendChat,
  applySettings,
  assertCanConfigure,
  assertCanKick,
  assertCanStart,
  hostGone,
  isEmpty,
  markPresent,
  purgeLeftMembers,
  removeMember,
  shuffleSeats,
  startsByItself,
  swapSeats,
  takeSeat,
  toRoomState,
  upgradeRoom,
} from './room.logic';
import type { RoomRecord, SessionRecord } from './room.model';

function room(overrides: Partial<RoomRecord> = {}): RoomRecord {
  return {
    id: 'r1',
    code: 'ABCDEF',
    gameId: 'mexicana',
    lifecycle: 'MATCH',
    hostId: 'a',
    isPrivate: false,
    maxPlayers: 4,
    status: 'OPEN',
    config: {},
    createdAt: 0,
    members: [],
    chat: [],
    session: null,
    lastResult: null,
    ...overrides,
  };
}

const profile = (id: string) => ({ id, username: id.toUpperCase(), avatarUrl: null, guest: false });

function withMembers(...ids: string[]): RoomRecord {
  const r = room({ hostId: ids[0] });
  for (const id of ids) addMember(r, profile(id));
  return r;
}

const session = (players: string[]): SessionRecord => ({
  matchId: 'm',
  gameId: 'mexicana',
  seed: 's',
  state: {},
  seq: 0,
  players,
  usernames: Object.fromEntries(players.map((id) => [id, id.toUpperCase()])),
  config: {},
  startedAt: 0,
  deadline: null,
  timerTotalMs: null,
  timerToken: 0,
});

function expectCode(fn: () => unknown, code: string): void {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('room membership', () => {
  it('assigns the lowest free seat and enforces capacity', () => {
    const r = withMembers('a', 'b', 'c');
    removeMember(r, 'b');
    expect(addMember(r, profile('d')).seat).toBe(1);
    addMember(r, profile('e'));
    expectCode(() => addMember(r, profile('f')), 'ROOM_FULL');
  });

  it('refuses joining while a match runs', () => {
    const r = withMembers('a', 'b');
    r.status = 'PLAYING';
    expectCode(() => addMember(r, profile('c')), 'ROOM_IN_PROGRESS');
  });

  it('a running session table takes players; a running match does not', () => {
    const table = withMembers('a', 'b');
    table.lifecycle = 'SESSION';
    table.status = 'PLAYING';
    expect(acceptsPlayers(table)).toBe(true);
    expect(addMember(table, profile('c')).seat).toBe(2);
    table.maxPlayers = 3;
    expectCode(() => addMember(table, profile('d')), 'ROOM_FULL');
    const match = withMembers('a', 'b');
    match.status = 'PLAYING';
    expect(acceptsPlayers(match)).toBe(false);
    table.status = 'CLOSED';
    expect(acceptsPlayers(table)).toBe(false);
  });

  it('keeps leavers who still hold a seat at a session table', () => {
    const r = withMembers('a', 'b', 'c');
    r.lifecycle = 'SESSION';
    r.status = 'PLAYING';
    r.session = session(['a', 'b', 'c']);
    removeMember(r, 'b');
    removeMember(r, 'c');
    expect(purgeLeftMembers(r, ['a', 'b'])).toBe(true); // c's seat is free, b's hand is still in play
    expect(r.members.map((m) => m.id)).toEqual(['a', 'b']);
    expect(purgeLeftMembers(r, ['a', 'b'])).toBe(false);
  });

  it('never passes the host role on: a room whose host is gone is to be closed', () => {
    const r = withMembers('a', 'b', 'c');
    expect(hostGone(r)).toBe(false);
    removeMember(r, 'a');
    expect(r.hostId).toBe('a');
    expect(hostGone(r)).toBe(true);
    removeMember(r, 'b');
    removeMember(r, 'c');
    expect(isEmpty(r)).toBe(true);
  });

  it('counts a host who stayed away past their grace period as gone, until they return', () => {
    const r = withMembers('a', 'b');
    r.status = 'PLAYING';
    r.session = session(['a', 'b']);
    Object.assign(r.members[0]!, { connected: false, away: true });
    expect(hostGone(r)).toBe(true);
    markPresent(r.members[0]!);
    expect(hostGone(r)).toBe(false);
  });

  it('keeps a leaver seated as away while a match runs, then purges them', () => {
    const r = withMembers('a', 'b', 'c');
    r.status = 'PLAYING';
    r.session = session(['a', 'b', 'c']);
    r.members[0]!.voice = true;
    removeMember(r, 'a');
    expect(r.members.find((m) => m.id === 'a')).toMatchObject({
      left: true,
      away: true,
      connected: false,
      voice: false,
    });
    expect(hostGone(r)).toBe(true);
    purgeLeftMembers(r);
    expect(r.members.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('restores presence on return', () => {
    const r = withMembers('a');
    const member = r.members[0]!;
    Object.assign(member, { connected: false, away: true, left: true, disconnectedAt: 5 });
    markPresent(member);
    expect(member).toMatchObject({ connected: true, away: false, left: false, disconnectedAt: null });
  });

  it('refuses unknown members', () => {
    expectCode(() => removeMember(withMembers('a'), 'zz'), 'NOT_IN_ROOM');
  });
});

describe('starting', () => {
  it('requires host, player count and readiness', () => {
    const r = withMembers('a', 'b');
    expectCode(() => assertCanStart(r, 'b', 2, 6), 'NOT_HOST');
    expectCode(() => assertCanStart(r, 'a', 2, 6), 'NOT_READY');
    r.members[1]!.ready = true;
    expect(() => assertCanStart(r, 'a', 2, 6)).not.toThrow();
    expectCode(() => assertCanStart(r, 'a', 3, 6), 'PLAYER_COUNT');
    r.members[1]!.connected = false;
    expectCode(() => assertCanStart(r, 'a', 2, 6), 'NOT_READY');
    r.status = 'PLAYING';
    expectCode(() => assertCanStart(r, 'a', 2, 6), 'ROOM_IN_PROGRESS');
  });

  it('starts a rematch by itself once everyone, host included, wants to play again', () => {
    const r = withMembers('a', 'b', 'c');
    r.members[1]!.ready = true;
    r.members[2]!.ready = true;
    expect(startsByItself(r, 2, 6)).toBe(false); // the host has not said it yet
    r.members[0]!.ready = true;
    expect(startsByItself(r, 2, 6)).toBe(true);
    expect(startsByItself(r, 4, 6)).toBe(false);
    r.members[2]!.connected = false;
    expect(startsByItself(r, 2, 6)).toBe(false);
  });
});

describe('named seats (teams)', () => {
  const seatsOf = (r: RoomRecord) => Object.fromEntries(r.members.map((m) => [m.id, m.seat]));

  it('lets a player move to a free seat, never onto a taken one', () => {
    const r = withMembers('a', 'b', 'c');
    takeSeat(r, 'b', 3, 4);
    expect(seatsOf(r)).toEqual({ a: 0, b: 3, c: 2 });
    expect(r.members.map((m) => m.id)).toEqual(['a', 'c', 'b']);
    takeSeat(r, 'b', 3, 4);
    expectCode(() => takeSeat(r, 'b', 0, 4), 'SEAT_TAKEN');
    expectCode(() => takeSeat(r, 'b', 4, 4), 'VALIDATION');
    expectCode(() => takeSeat(r, 'z', 1, 4), 'NOT_IN_ROOM');
    // The next to arrive takes the lowest free seat.
    expect(addMember(r, profile('d')).seat).toBe(1);
  });

  it('lets the host swap two seats, taken or free', () => {
    const r = withMembers('a', 'b', 'c');
    swapSeats(r, 'a', 0, 1, 4);
    expect(seatsOf(r)).toEqual({ a: 1, b: 0, c: 2 });
    swapSeats(r, 'a', 2, 3, 4);
    expect(seatsOf(r)).toEqual({ a: 1, b: 0, c: 3 });
    expectCode(() => swapSeats(r, 'b', 0, 1, 4), 'NOT_HOST');
  });

  it('draws everyone a seat', () => {
    const r = withMembers('a', 'b', 'c', 'd');
    shuffleSeats(r, 'a', 4, (max) => max - 1);
    expect(Object.values(seatsOf(r)).sort()).toEqual([0, 1, 2, 3]);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      shuffleSeats(r, 'a', 4, (max) => Math.floor(Math.random() * max));
      seen.add(JSON.stringify(seatsOf(r)));
    }
    expect(seen.size).toBeGreaterThan(5);
    expectCode(() => shuffleSeats(r, 'b', 4, () => 0), 'NOT_HOST');
  });

  it('only changes seats between matches', () => {
    const r = withMembers('a', 'b');
    r.status = 'PLAYING';
    expectCode(() => takeSeat(r, 'b', 3, 4), 'ROOM_IN_PROGRESS');
    expectCode(() => swapSeats(r, 'a', 0, 1, 4), 'ROOM_IN_PROGRESS');
    expectCode(() => shuffleSeats(r, 'a', 4, () => 0), 'ROOM_IN_PROGRESS');
  });

  it('starts only with every seat taken', () => {
    const r = withMembers('a', 'b', 'c', 'd');
    for (const m of r.members) m.ready = true;
    expect(allSeatsTaken(r, 4)).toBe(true);
    expect(() => assertCanStart(r, 'a', 4, 4, 4)).not.toThrow();
    expect(startsByItself(r, 4, 4, 4)).toBe(true);
    removeMember(r, 'c');
    expect(allSeatsTaken(r, 4)).toBe(false);
    r.maxPlayers = 5;
    addMember(r, profile('e'));
    takeSeat(r, 'e', 4, 5);
    expect(allSeatsTaken(r, 4)).toBe(false);
    expectCode(() => assertCanStart(r, 'a', 4, 4, 4), 'SEATS_MISSING');
    for (const m of r.members) m.ready = true;
    expect(startsByItself(r, 4, 4, 4)).toBe(false);
  });
});

describe('changing the game', () => {
  const blackjack = {
    gameId: 'blackjack',
    lifecycle: 'SESSION' as const,
    isPrivate: true,
    maxPlayers: 3,
    config: { decks: 6 },
  };

  it('is for the host, between matches, and must still seat everyone', () => {
    const r = withMembers('a', 'b', 'c');
    expectCode(() => assertCanConfigure(r, 'b', 4), 'NOT_HOST');
    expectCode(() => assertCanConfigure(r, 'a', 2), 'PLAYER_COUNT');
    expect(() => assertCanConfigure(r, 'a', 3)).not.toThrow();
    r.status = 'PLAYING';
    expectCode(() => assertCanConfigure(r, 'a', 4), 'ROOM_IN_PROGRESS');
  });

  it('starts a new sequence with another game, closes up the seats and asks everyone again', () => {
    const r = withMembers('a', 'b', 'c', 'd');
    removeMember(r, 'b');
    r.members.forEach((m) => (m.ready = true));
    r.lastResult = { matchId: 'm', aborted: false, standings: [] };
    applySettings(r, blackjack);
    expect(r).toMatchObject({ ...blackjack, lastResult: null });
    expect(r.members.map((m) => [m.id, m.seat, m.ready])).toEqual([
      ['a', 0, false],
      ['c', 1, false],
      ['d', 2, false],
    ]);
  });

  it('keeps the sequence when only the rules of the same game change', () => {
    const r = withMembers('a', 'b');
    r.lastResult = { matchId: 'm', aborted: false, standings: [] };
    applySettings(r, { ...blackjack, gameId: 'mexicana', lifecycle: 'MATCH' });
    expect(r.lastResult).not.toBeNull();
  });
});

describe('kicking', () => {
  it('lets the host kick others, and only disconnected players mid-match', () => {
    const r = withMembers('a', 'b');
    expectCode(() => assertCanKick(r, 'b', 'a'), 'NOT_HOST');
    expectCode(() => assertCanKick(r, 'a', 'a'), 'CANNOT_KICK');
    expect(assertCanKick(r, 'a', 'b').id).toBe('b');
    r.status = 'PLAYING';
    expectCode(() => assertCanKick(r, 'a', 'b'), 'CANNOT_KICK');
    r.members[1]!.connected = false;
    expect(assertCanKick(r, 'a', 'b').id).toBe('b');
  });
});

describe('projection', () => {
  it('bounds chat history and exposes public state only', () => {
    const r = withMembers('a');
    for (let i = 0; i < 60; i++)
      appendChat(r, { id: `${i}`, playerId: 'a', username: 'A', text: 'hi', at: i });
    expect(r.chat).toHaveLength(50);
    expect(r.chat[0]!.id).toBe('10');
    const state = toRoomState(r, 'Mexicana');
    expect(state).toMatchObject({ gameName: 'Mexicana', lifecycle: 'MATCH', matchId: null, code: 'ABCDEF' });
    expect(Object.keys(state.players[0]!)).not.toContain('disconnectedAt');
  });

  it('starts with the microphone off, also for members saved before voice existed', () => {
    const r = withMembers('a', 'b');
    r.members[0]!.voice = true;
    delete r.members[1]!.voice;
    expect(toRoomState(r, 'Mexicana').players.map((p) => p.voice)).toEqual([true, false]);
    expect(addMember(r, profile('c')).voice).toBe(false);
  });
});

describe('upgradeRoom', () => {
  it('turns legacy rankings into standings with outcomes', () => {
    const legacy = room({
      lastResult: {
        matchId: 'm1',
        aborted: false,
        rankings: [
          { playerId: 'a', username: 'A', position: 1 },
          { playerId: 'b', username: 'B', position: 2 },
          { playerId: 'c', username: 'C', position: 3 },
        ],
      } as unknown as RoomRecord['lastResult'],
    });
    expect(upgradeRoom(legacy).lastResult).toEqual({
      matchId: 'm1',
      aborted: false,
      standings: [
        { playerId: 'a', username: 'A', position: 1, outcome: 'WINNER' },
        { playerId: 'b', username: 'B', position: 2, outcome: 'PLACED' },
        { playerId: 'c', username: 'C', position: 3, outcome: 'LOSER' },
      ],
    });
  });

  it('gives rooms saved before sessions existed a lifecycle, and their match the usernames', () => {
    const saved = withMembers('a', 'b');
    saved.session = session(['a', 'b']);
    const legacy = structuredClone(saved) as unknown as Record<string, unknown> & {
      session: Record<string, unknown>;
    };
    delete legacy.lifecycle;
    delete legacy.session.usernames;
    expect(upgradeRoom(legacy as unknown as RoomRecord)).toEqual(saved);
  });

  it('leaves current rooms untouched', () => {
    const current = room({
      lastResult: {
        matchId: 'm2',
        aborted: false,
        standings: [{ playerId: 'a', username: 'A', outcome: 'SURVIVOR', score: 2 }],
      },
    });
    expect(upgradeRoom(structuredClone(current))).toEqual(current);
    expect(upgradeRoom(room()).lastResult).toBeNull();
  });
});
