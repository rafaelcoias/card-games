import { describe, expect, it } from 'vitest';
import { AppError } from '../common/app-error';
import {
  addMember,
  appendChat,
  assertCanKick,
  assertCanStart,
  isEmpty,
  markPresent,
  purgeLeftMembers,
  removeMember,
  toRoomState,
} from './room.logic';
import type { RoomRecord, SessionRecord } from './room.model';

function room(overrides: Partial<RoomRecord> = {}): RoomRecord {
  return {
    id: 'r1',
    code: 'ABCDEF',
    gameId: 'mexicana',
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

const profile = (id: string) => ({ id, username: id.toUpperCase(), avatarUrl: null });

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

  it('passes the host role to the next player in seat order', () => {
    const r = withMembers('a', 'b', 'c');
    r.hostId = 'b';
    removeMember(r, 'b');
    expect(r.hostId).toBe('c');
    removeMember(r, 'c');
    expect(r.hostId).toBe('a');
    removeMember(r, 'a');
    expect(isEmpty(r)).toBe(true);
  });

  it('keeps a leaver seated as away while a match runs, then purges them', () => {
    const r = withMembers('a', 'b', 'c');
    r.status = 'PLAYING';
    r.session = session(['a', 'b', 'c']);
    removeMember(r, 'a');
    expect(r.members.find((m) => m.id === 'a')).toMatchObject({ left: true, away: true, connected: false });
    expect(r.hostId).toBe('b');
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
    expect(state).toMatchObject({ gameName: 'Mexicana', matchId: null, code: 'ABCDEF' });
    expect(Object.keys(state.players[0]!)).not.toContain('disconnectedAt');
  });
});
