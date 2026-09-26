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
import type { Timestamp } from 'firebase-admin/firestore';

export type RoomStatus = 'OPEN' | 'PLAYING' | 'CLOSED';

export interface ProfileDoc {
  username: string;
  usernameLower: string;
  avatarUrl: string | null;
  createdAt: Timestamp;
}

export interface ProfileRecord {
  id: string;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
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
  seat: number;
  finalPosition: number | null;
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

export interface HistoryDoc {
  matchId: string;
  gameId: string;
  startedAt: Timestamp;
  finishedAt: Timestamp;
  position: number | null;
  aborted: boolean;
  players: { username: string; position: number | null }[];
}
