import type { Lifecycle } from '@cardroom/game-core';
import type { ChatMessage, MatchResult, RoomStatus } from '@cardroom/shared';

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
}

export const CHAT_HISTORY = 50;
