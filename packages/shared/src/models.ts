import type { DomainEvent, GameRanking } from '@cardroom/game-core';

export type RoomStatus = 'OPEN' | 'PLAYING' | 'CLOSED';

export interface RoomPlayer {
  id: string;
  username: string;
  avatarUrl: string | null;
  seat: number;
  ready: boolean;
  /** Socket currently attached. */
  connected: boolean;
  /** Grace period expired (or left mid-game): the server plays default actions for them. */
  away: boolean;
}

export interface RankedPlayer extends GameRanking {
  username: string;
}

export interface MatchResult {
  matchId: string;
  rankings: RankedPlayer[];
  /** `true` when the match ended because every remaining player was away. */
  aborted: boolean;
}

export interface RoomState {
  id: string;
  code: string;
  gameId: string;
  gameName: string;
  hostId: string;
  isPrivate: boolean;
  maxPlayers: number;
  status: RoomStatus;
  players: RoomPlayer[];
  config: Record<string, unknown>;
  matchId: string | null;
  lastResult: MatchResult | null;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  username: string;
  text: string;
  at: number;
}

export interface JoinedRoom {
  room: RoomState;
  chat: ChatMessage[];
}

export interface TurnTimer {
  /** Remaining time measured on the server when the message was emitted (skew-free). */
  remainingMs: number;
  totalMs: number;
  playerIds: string[];
}

export interface GameViewMessage<View = unknown, Action = unknown> {
  roomId: string;
  matchId: string;
  gameId: string;
  seq: number;
  view: View;
  validActions: Action[];
  timer: TurnTimer | null;
  /** Full resync (join/reconnect): render without animating from the previous view. */
  snapshot: boolean;
}

export interface GameEventsMessage<Event extends DomainEvent = DomainEvent> {
  roomId: string;
  matchId: string;
  seq: number;
  events: Event[];
}

export interface PublicRoomSummary {
  code: string;
  gameId: string;
  gameName: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}

export interface GameCatalogEntry {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

export interface GameStats {
  played: number;
  /** Finished first. */
  wins: number;
  /** Finished last (in Mexicana: the loser). */
  losses: number;
}

export interface PlayerStats extends GameStats {
  byGame: Record<string, GameStats>;
}

export interface ProfileDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: string;
  stats: PlayerStats;
}

export interface MeResponse {
  userId: string;
  email: string | null;
  profile: ProfileDto | null;
}

export interface MatchHistoryEntry {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: string;
  finishedAt: string | null;
  position: number | null;
  players: { username: string; position: number | null }[];
}

/** Where an online player currently is. */
export type PresenceStatus = 'lobby' | 'room' | 'playing';

export interface OnlinePlayer {
  id: string;
  username: string;
  avatarUrl: string | null;
  status: PresenceStatus;
  /** Game of the room they are in, if any. */
  gameName: string | null;
  /** Only for public rooms (private codes are never exposed). */
  roomCode: string | null;
}

export interface PresenceSnapshot {
  count: number;
  players: OnlinePlayer[];
}

export interface PlayerSummary {
  id: string;
  username: string;
  avatarUrl: string | null;
  stats: PlayerStats;
  online: boolean;
}

export interface PlayerProfile extends PlayerSummary {
  createdAt: string;
  presence: OnlinePlayer | null;
  recentMatches: MatchHistoryEntry[];
}
