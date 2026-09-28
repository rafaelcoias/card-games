/**
 * Firestore data model (all writes go through the Admin SDK; clients have no
 * direct database access — see firestore.rules):
 *
 *   profiles/{uid}                        ProfileDoc
 *   profiles/{uid}/history/{matchId}      HistoryDoc   (denormalised, written when a match ends)
 *   usernames/{usernameLower}             { uid }      (uniqueness index)
 *   rooms/{roomId}                        RoomDoc
 *   matches/{matchId}                     MatchDoc
 *   matches/{matchId}/actions/{seq}       ActionDoc    (ordered log → replay with the seed)
 *
 * Live room/match state is NOT here: it lives in Redis while a table is active.
 */
import type { Outcome } from '@cardroom/game-core';
import type { PlayerStats } from '@cardroom/shared';
import type { Timestamp } from 'firebase-admin/firestore';

export type RoomStatus = 'OPEN' | 'PLAYING' | 'CLOSED';

export interface ProfileDoc {
  username: string;
  usernameLower: string;
  /** Guests keep a temporary name that is not reserved in `usernames`. */
  guest?: boolean;
  avatarUrl: string | null;
  createdAt: Timestamp;
  /** Counters maintained atomically when matches end. */
  stats?: PlayerStats;
}

export interface ProfileRecord {
  id: string;
  username: string;
  avatarUrl: string | null;
  guest: boolean;
  createdAt: Date;
  stats: PlayerStats;
}

export interface RoomDoc {
  code: string;
  gameId: string;
  hostId: string;
  isPrivate: boolean;
  maxPlayers: number;
  status: RoomStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface MatchPlayerDoc {
  profileId: string;
  username: string;
  guest?: boolean;
  seat: number;
  finalPosition: number | null;
  /** Absent on matches recorded before outcomes existed (derive from `finalPosition`). */
  outcome?: Outcome | null;
  score?: number | null;
}

export interface MatchDoc {
  roomId: string;
  gameId: string;
  seed: string;
  config: Record<string, unknown>;
  startedAt: Timestamp;
  finishedAt: Timestamp | null;
  aborted: boolean;
  players: MatchPlayerDoc[];
  playerIds: string[];
}

export interface ActionDoc {
  seq: number;
  profileId: string;
  action: unknown;
  automatic: boolean;
  at: Timestamp;
}

export interface HistoryPlayerDoc {
  username: string;
  guest?: boolean;
  position: number | null;
  /** Absent on entries written before outcomes existed (derive from `position`). */
  outcome?: Outcome | null;
  score?: number | null;
}

export interface HistoryDoc {
  matchId: string;
  gameId: string;
  startedAt: Timestamp;
  finishedAt: Timestamp;
  position: number | null;
  outcome?: Outcome | null;
  score?: number | null;
  aborted: boolean;
  players: HistoryPlayerDoc[];
}
