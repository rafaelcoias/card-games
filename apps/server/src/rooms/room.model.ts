import type { Lifecycle } from '@cardroom/game-core';
import type { ChatMessage, MatchResult, RoomCloseReason, RoomStatus } from '@cardroom/shared';

export interface RoomMember {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** Playing as a guest (absent on members saved before guests existed). */
  guest?: boolean;
  seat: number;
  ready: boolean;
  connected: boolean;
  /** Plays by default actions (grace expired or left mid-game). */
  away: boolean;
  /** Left while a match was running; removed from the room when it ends. */
  left: boolean;
  /** Identifies the disconnection a grace timer belongs to. */
  disconnectedAt: number | null;
  /** Microphone on in the voice chat (absent on members saved before voice existed). */
  voice?: boolean;
}

export interface SessionRecord {
  matchId: string;
  gameId: string;
  seed: string;
  /** Opaque, JSON-serialisable engine state. */
  state: unknown;
  /** Number of actions applied so far. */
  seq: number;
  /**
   * Engine player ids, in seat order: fixed for a MATCH, kept in step with the
   * table for a SESSION (people sit down and get up while it runs).
   */
  players: string[];
  /** Everyone who played in this match; SESSION players who got up are no longer members. */
  usernames: Record<string, string>;
  /** A SESSION game was asked to end (it closes once the round in play is settled). */
  endRequested?: boolean;
  config: Record<string, unknown>;
  startedAt: number;
  deadline: number | null;
  timerTotalMs: number | null;
  /** Bumped whenever the deadline changes so stale timers can be ignored. */
  timerToken: number;
  /**
   * Games played with the account's chips: what each account holds as last
   * written to its profile, so only what changed is written again.
   */
  wallets?: Record<string, number>;
  /** Games that pause for a missing player: the table is waiting (absent on older records). */
  pause?: SessionPause | null;
  /** Bumped whenever the pause's deadline changes, so stale pause timers can be ignored. */
  pauseToken?: number;
}

export interface SessionPause {
  /** Who the table waits for. */
  playerIds: string[];
  /** When the wait is over and the host may decide. */
  until: number;
  totalMs: number;
  /** The wait is over: the host chooses to wait longer or to end the match. */
  expired: boolean;
  /** The decision clock that was running when the table stopped; it picks up from here. */
  frozen: { remainingMs: number; totalMs: number } | null;
}

/** Everything the server knows about a live room. Stored as one Redis value. */
export interface RoomRecord {
  id: string;
  code: string;
  gameId: string;
  /** Copied from the game so the room store can tell which running rooms still take players. */
  lifecycle: Lifecycle;
  hostId: string;
  isPrivate: boolean;
  maxPlayers: number;
  status: RoomStatus;
  config: Record<string, unknown>;
  createdAt: number;
  members: RoomMember[];
  chat: ChatMessage[];
  session: SessionRecord | null;
  lastResult: MatchResult | null;
  /**
   * The room closes as soon as the game in play ends (it reached its maximum
   * age mid-game). Absent on rooms saved before rooms could close.
   */
  closing?: RoomCloseReason | null;
}

export const CHAT_HISTORY = 50;

/** No room lives longer than this: its chat must not outlast the evening it was played in. */
export const ROOM_MAX_AGE_MS = 12 * 60 * 60 * 1000;
