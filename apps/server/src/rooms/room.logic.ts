import { outcomeForPosition } from '@cardroom/game-core';
import { ErrorCode, type ChatMessage, type MatchResult, type RoomState } from '@cardroom/shared';
import { AppError } from '../common/app-error';
import { CHAT_HISTORY, type RoomMember, type RoomRecord } from './room.model';

/** Pure room rules. The service wraps them with locking, persistence and emission. */

export interface MemberProfile {
  id: string;
  username: string;
  avatarUrl: string | null;
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

export function addMember(room: RoomRecord, profile: MemberProfile): RoomMember {
  if (room.status !== 'OPEN')
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

/** Hands the host role to the next present member after `fromSeat`, wrapping around. */
function transferHostIfNeeded(room: RoomRecord, fromSeat: number): void {
  if (room.members.some((m) => m.id === room.hostId && !m.left)) return;
  const candidates = room.members.filter((m) => !m.left);
  const next = candidates.find((m) => m.seat > fromSeat) ?? candidates[0];
  if (next) room.hostId = next.id;
}

function hostSeat(room: RoomRecord): number {
  return findMember(room, room.hostId)?.seat ?? -1;
}

/**
 * Removes a member. During a match the seat is kept (flagged `left` + `away`)
 * so the engine can keep playing default actions for them until it ends.
 */
export function removeMember(room: RoomRecord, userId: string): void {
  const member = requireMember(room, userId);
  const seat = hostSeat(room);
  if (room.session?.players.includes(userId)) {
    member.left = true;
    member.away = true;
    member.connected = false;
    member.ready = false;
  } else {
    room.members = room.members.filter((m) => m.id !== userId);
  }
  transferHostIfNeeded(room, seat);
}

/** Drops members who left during the match that just ended. */
export function purgeLeftMembers(room: RoomRecord): void {
  const seat = hostSeat(room);
  room.members = room.members.filter((m) => !m.left);
  transferHostIfNeeded(room, seat);
}

export function isEmpty(room: RoomRecord): boolean {
  return room.members.every((m) => m.left);
}

export function assertCanStart(
  room: RoomRecord,
  userId: string,
  minPlayers: number,
  maxPlayers: number,
): void {
  requireHost(room, userId);
  if (room.status !== 'OPEN') throw new AppError(ErrorCode.RoomInProgress, 'A match is already running');
  const count = room.members.length;
  if (count < minPlayers || count > maxPlayers) {
    throw new AppError(ErrorCode.PlayerCount, `This game needs ${minPlayers}–${maxPlayers} players`);
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
    })),
    config: room.config,
    matchId: room.session?.matchId ?? null,
    lastResult: room.lastResult,
  };
}
