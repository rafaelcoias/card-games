import type { DomainEvent, GameStanding, Lifecycle, Outcome } from '@cardroom/game-core';

export type RoomStatus = 'OPEN' | 'PLAYING' | 'CLOSED';

/**
 * Why a room closed for everyone: its host is gone (left, or disconnected for
 * good), or it reached its maximum age. A closed room, and its chat, are gone.
 */
export type RoomCloseReason = 'HOST_LEFT' | 'EXPIRED';

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
  /** Playing as a guest: a temporary name, no account and no public profile. */
  guest: boolean;
  /** Microphone on: talking in the room's voice chat. */
  voice: boolean;
}

export interface PlayerStanding extends GameStanding {
  username: string;
}

export interface MatchResult {
  matchId: string;
  /** Every player, best first (empty when aborted). */
  standings: PlayerStanding[];
  /** `true` when the match ended because every remaining player was away. */
  aborted: boolean;
}

export interface RoomState {
  id: string;
  code: string;
  gameId: string;
  gameName: string;
  /** `SESSION` tables take players while they run and end when the host says so. */
  lifecycle: Lifecycle;
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

/** ICE servers for the voice chat's peer connections (STUN, plus TURN when configured). */
export interface VoiceConfig {
  iceServers: { urls: string[]; username?: string; credential?: string }[];
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
  /** A SESSION table already running, with a free seat to join straight away. */
  inProgress: boolean;
}

export interface GameCatalogEntry {
  id: string;
  name: string;
  minPlayers: number;
  maxPlayers: number;
}

export interface GameStats {
  played: number;
  /** Outcome WINNER (finished first). */
  wins: number;
  /** Outcome LOSER (Mexicana: last one left; Fodinha: reached the points limit). */
  losses: number;
}

export interface PlayerStats extends GameStats {
  byGame: Record<string, GameStats>;
}

export interface ProfileDto {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** A guest's temporary name: not reserved and without a public profile. */
  guest: boolean;
  createdAt: string;
  stats: PlayerStats;
  /** The account's chips for Blackjack (virtual, without value; everyone can see them). */
  chips: number;
}

export interface MeResponse {
  userId: string;
  email: string | null;
  /** Signed in without an account (Firebase anonymous sign-in). */
  guest: boolean;
  profile: ProfileDto | null;
}

export interface MatchHistoryPlayer {
  username: string;
  /** Played as a guest (no public profile to link to). */
  guest: boolean;
  position: number | null;
  outcome: Outcome | null;
  score: number | null;
}

export interface MatchHistoryEntry {
  id: string;
  gameId: string;
  gameName: string;
  startedAt: string;
  finishedAt: string | null;
  /** The viewer's own result in this match. */
  position: number | null;
  outcome: Outcome | null;
  score: number | null;
  players: MatchHistoryPlayer[];
}

/** Where an online player currently is. */
export type PresenceStatus = 'lobby' | 'room' | 'playing';

export interface OnlinePlayer {
  id: string;
  username: string;
  avatarUrl: string | null;
  guest: boolean;
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
  /** The account's chips for Blackjack. */
  chips: number;
  online: boolean;
}

export interface PlayerProfile extends PlayerSummary {
  createdAt: string;
  presence: OnlinePlayer | null;
  recentMatches: MatchHistoryEntry[];
}
