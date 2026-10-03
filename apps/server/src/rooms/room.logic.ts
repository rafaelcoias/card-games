import { outcomeForPosition } from '@cardroom/game-core';
import { ErrorCode, type ChatMessage, type MatchResult, type RoomState } from '@cardroom/shared';
import { AppError } from '../common/app-error';
import { CHAT_HISTORY, type RoomMember, type RoomRecord, type SessionRecord } from './room.model';

/** Pure room rules. The service wraps them with locking, persistence and emission. */

export interface MemberProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
  guest: boolean;
}

export function findMember(room: RoomRecord, userId: string): RoomMember | undefined {
  return room.members.find((m) => m.id === userId);
}

export function requireMember(room: RoomRecord, userId: string): RoomMember {
  const member = findMember(room, userId);
  if (!member) throw new AppError(ErrorCode.NotInRoom, 'You are not in this room');
  return member;
}

export function requireHost(room: RoomRecord, userId: string): void {
  if (room.hostId !== userId) throw new AppError(ErrorCode.NotHost, 'Only the host can do that');
}

function lowestFreeSeat(room: RoomRecord): number {
  const taken = new Set(room.members.map((m) => m.seat));
  let seat = 0;
  while (taken.has(seat)) seat++;
  return seat;
}

/** Rooms in the lobby take players, and so do running SESSION tables (they sit down mid-session). */
export function acceptsPlayers(room: RoomRecord): boolean {
  return room.status === 'OPEN' || (room.status === 'PLAYING' && room.lifecycle === 'SESSION');
}

export function addMember(room: RoomRecord, profile: MemberProfile): RoomMember {
  if (!acceptsPlayers(room))
    throw new AppError(ErrorCode.RoomInProgress, 'A match is already running in this room');
  if (room.members.length >= room.maxPlayers) throw new AppError(ErrorCode.RoomFull, 'The room is full');
  const member: RoomMember = {
    ...profile,
    seat: lowestFreeSeat(room),
    ready: false,
    connected: true,
    away: false,
    left: false,
    disconnectedAt: null,
    voice: false,
  };
  room.members.push(member);
  room.members.sort((a, b) => a.seat - b.seat);
  return member;
}

/** Marks a returning member as present again (reconnect or re-entering a running match). */
export function markPresent(member: RoomMember): void {
  member.connected = true;
  member.away = false;
  member.left = false;
  member.disconnectedAt = null;
}

/**
 * Removes a member. During a match the seat is kept (flagged `left` + `away`)
 * so the engine can keep playing default actions for them until it ends.
 * The host role never passes on: a room whose host is gone closes.
 */
export function removeMember(room: RoomRecord, userId: string): void {
  const member = requireMember(room, userId);
  if (room.session?.players.includes(userId)) {
    member.left = true;
    member.away = true;
    member.connected = false;
    member.ready = false;
    member.voice = false;
  } else {
    room.members = room.members.filter((m) => m.id !== userId);
  }
}

/**
 * Drops members who left, except those still seated (a SESSION table frees a
 * leaver's seat when the round in play ends). Returns whether anyone went.
 */
export function purgeLeftMembers(room: RoomRecord, stillSeated: readonly string[] = []): boolean {
  const before = room.members.length;
  room.members = room.members.filter((m) => !m.left || stillSeated.includes(m.id));
  return room.members.length !== before;
}

/** The host left, or stayed disconnected past their grace period: the room is theirs, so it closes. */
export function hostGone(room: RoomRecord): boolean {
  const host = findMember(room, room.hostId);
  return !host || host.left || host.away;
}

/**
 * A rematch: once everyone at the table, host included, says they want to
 * play again (is ready), the next match starts by itself.
 */
export function startsByItself(
  room: RoomRecord,
  minPlayers: number,
  maxPlayers: number,
  seatCount?: number,
): boolean {
  const count = room.members.length;
  return (
    room.status === 'OPEN' &&
    count >= minPlayers &&
    count <= maxPlayers &&
    (seatCount === undefined || allSeatsTaken(room, seatCount)) &&
    room.members.every((m) => m.ready && m.connected)
  );
}

/** Games with named seats (and so teams): a match starts only with every seat taken. */
export function allSeatsTaken(room: RoomRecord, seatCount: number): boolean {
  const taken = new Set(room.members.map((m) => m.seat));
  return Array.from({ length: seatCount }, (_, seat) => seat).every((seat) => taken.has(seat));
}

function assertSeatsChange(room: RoomRecord, seatCount: number, ...seats: number[]): void {
  if (room.status !== 'OPEN')
    throw new AppError(ErrorCode.RoomInProgress, 'Seats only change between matches');
  if (seats.some((seat) => seat < 0 || seat >= Math.min(seatCount, room.maxPlayers))) {
    throw new AppError(ErrorCode.Validation, 'No such seat at this table');
  }
}

/** A player moves to a free seat of the table (games with named seats). */
export function takeSeat(room: RoomRecord, userId: string, seat: number, seatCount: number): void {
  assertSeatsChange(room, seatCount, seat);
  const member = requireMember(room, userId);
  if (member.seat === seat) return;
  if (room.members.some((m) => m.seat === seat))
    throw new AppError(ErrorCode.SeatTaken, 'That seat is taken');
  member.seat = seat;
  room.members.sort((a, b) => a.seat - b.seat);
}

/** Host: whoever sits in seat `a` goes to `b` and the other way round (either may be free). */
export function swapSeats(room: RoomRecord, hostId: string, a: number, b: number, seatCount: number): void {
  requireHost(room, hostId);
  assertSeatsChange(room, seatCount, a, b);
  const inA = room.members.find((m) => m.seat === a);
  const inB = room.members.find((m) => m.seat === b);
  if (inA) inA.seat = b;
  if (inB) inB.seat = a;
  room.members.sort((x, y) => x.seat - y.seat);
}

/** Host: everyone gets a seat drawn at random (and with it a partner). `draw(n)` is uniform in `[0, n)`. */
export function shuffleSeats(
  room: RoomRecord,
  hostId: string,
  seatCount: number,
  draw: (maxExclusive: number) => number,
): void {
  requireHost(room, hostId);
  assertSeatsChange(room, seatCount);
  const seats = Array.from({ length: Math.min(seatCount, room.maxPlayers) }, (_, seat) => seat);
  for (let i = seats.length - 1; i > 0; i--) {
    const j = draw(i + 1);
    [seats[i], seats[j]] = [seats[j] as number, seats[i] as number];
  }
  room.members.forEach((member, i) => {
    member.seat = seats[i] as number;
  });
  room.members.sort((a, b) => a.seat - b.seat);
}

export function assertCanConfigure(room: RoomRecord, userId: string, maxPlayers: number): void {
  requireHost(room, userId);
  if (room.status !== 'OPEN') {
    throw new AppError(ErrorCode.RoomInProgress, 'The game can only change between matches');
  }
  if (room.members.length > maxPlayers) {
    throw new AppError(ErrorCode.PlayerCount, `There are already ${room.members.length} players here`);
  }
}

/**
 * Another game, or other rules, for the same players: like a new room. A new
 * game starts a new sequence (no previous result decides who starts), seats
 * close up so they fit the new table, and everyone confirms again.
 */
export function applySettings(
  room: RoomRecord,
  settings: Pick<RoomRecord, 'gameId' | 'lifecycle' | 'isPrivate' | 'maxPlayers' | 'config'>,
): void {
  if (settings.gameId !== room.gameId) room.lastResult = null;
  Object.assign(room, settings);
  room.members.sort((a, b) => a.seat - b.seat);
  room.members.forEach((member, seat) => {
    member.seat = seat;
    member.ready = false;
  });
}

export function isEmpty(room: RoomRecord): boolean {
  return room.members.every((m) => m.left);
}

export function assertCanStart(
  room: RoomRecord,
  userId: string,
  minPlayers: number,
  maxPlayers: number,
  seatCount?: number,
): void {
  requireHost(room, userId);
  if (room.status !== 'OPEN') throw new AppError(ErrorCode.RoomInProgress, 'A match is already running');
  const count = room.members.length;
  if (count < minPlayers || count > maxPlayers) {
    throw new AppError(ErrorCode.PlayerCount, `This game needs ${minPlayers}–${maxPlayers} players`);
  }
  if (seatCount !== undefined && !allSeatsTaken(room, seatCount)) {
    throw new AppError(ErrorCode.SeatsMissing, 'Every seat must be taken');
  }
  const waiting = room.members.filter((m) => m.id !== room.hostId && (!m.ready || !m.connected));
  if (waiting.length > 0) {
    throw new AppError(ErrorCode.NotReady, `Waiting for: ${waiting.map((m) => m.username).join(', ')}`);
  }
}

export function assertCanKick(room: RoomRecord, hostId: string, targetId: string): RoomMember {
  requireHost(room, hostId);
  if (targetId === hostId) throw new AppError(ErrorCode.CannotKick, 'You cannot kick yourself');
  const target = requireMember(room, targetId);
  if (room.status === 'PLAYING' && target.connected) {
    throw new AppError(ErrorCode.CannotKick, 'During a match only disconnected players can be removed');
  }
  return target;
}

export function appendChat(room: RoomRecord, message: ChatMessage): void {
  room.chat = [...room.chat, message].slice(-CHAT_HISTORY);
}

/**
 * Rooms saved before results carried outcomes hold `rankings` (positions only).
 * Upgrades them in place when loaded, so a deploy never breaks live rooms.
 */
export function upgradeRoom(room: RoomRecord): RoomRecord {
  const legacy = room as LegacyRoom;
  legacy.lifecycle ??= 'MATCH';
  if (legacy.session) {
    legacy.session.usernames ??= Object.fromEntries(room.members.map((m) => [m.id, m.username]));
  }
  const saved: LegacyMatchResult | null = room.lastResult;
  if (saved && !saved.standings) {
    const rankings = saved.rankings ?? [];
    room.lastResult = {
      matchId: saved.matchId,
      aborted: saved.aborted,
      standings: rankings.map((r) => ({ ...r, outcome: outcomeForPosition(r.position, rankings.length) })),
    };
  }
  return room;
}

/** A room saved before sessions existed: no lifecycle, and matches without usernames. */
type LegacyRoom = Omit<RoomRecord, 'lifecycle' | 'session'> & {
  lifecycle?: RoomRecord['lifecycle'];
  session: (Omit<SessionRecord, 'usernames'> & { usernames?: SessionRecord['usernames'] }) | null;
};

/** A `MatchResult` as it may have been saved by an older server. */
interface LegacyMatchResult extends Omit<MatchResult, 'standings'> {
  standings?: MatchResult['standings'];
  rankings?: { playerId: string; username: string; position: number }[];
}

export function toRoomState(room: RoomRecord, gameName: string): RoomState {
  return {
    id: room.id,
    code: room.code,
    gameId: room.gameId,
    gameName,
    lifecycle: room.lifecycle,
    hostId: room.hostId,
    isPrivate: room.isPrivate,
    maxPlayers: room.maxPlayers,
    status: room.status,
    players: room.members.map((m) => ({
      id: m.id,
      username: m.username,
      avatarUrl: m.avatarUrl,
      seat: m.seat,
      ready: m.ready,
      connected: m.connected,
      away: m.away,
      guest: m.guest === true,
      voice: m.voice === true,
    })),
    config: room.config,
    matchId: room.session?.matchId ?? null,
    lastResult: room.lastResult,
  };
}
