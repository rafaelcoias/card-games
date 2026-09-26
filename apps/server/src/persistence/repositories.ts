import { Inject, Injectable } from '@nestjs/common';
import type { GameRanking } from '@cardroom/game-core';
import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase';
import { ActionLog } from './action-log';
import type { HistoryDoc, MatchDoc, ProfileDoc, ProfileRecord, RoomDoc, RoomStatus } from './models';

const COLLECTIONS = {
  profiles: 'profiles',
  usernames: 'usernames',
  rooms: 'rooms',
  matches: 'matches',
  history: 'history',
} as const;

class UsernameTakenError extends Error {}

@Injectable()
export class ProfilesRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async find(id: string): Promise<ProfileRecord | null> {
    const snapshot = await this.db.collection(COLLECTIONS.profiles).doc(id).get();
    const data = snapshot.data() as ProfileDoc | undefined;
    return data ? toProfile(id, data) : null;
  }

  /**
   * Creates or updates a profile, reserving the username case-insensitively in
   * a transaction. Returns `null` when someone else already owns the username.
   */
  async upsert(
    id: string,
    input: { username: string; avatarUrl: string | null },
  ): Promise<ProfileRecord | null> {
    const profileRef = this.db.collection(COLLECTIONS.profiles).doc(id);
    const usernameLower = input.username.toLowerCase();
    const claimRef = this.db.collection(COLLECTIONS.usernames).doc(usernameLower);
    try {
      await this.db.runTransaction(async (tx) => {
        const [profileSnap, claimSnap] = await Promise.all([tx.get(profileRef), tx.get(claimRef)]);
        const claimOwner = (claimSnap.data() as { uid?: string } | undefined)?.uid;
        if (claimOwner && claimOwner !== id) throw new UsernameTakenError();

        const current = profileSnap.data() as ProfileDoc | undefined;
        if (current && current.usernameLower !== usernameLower) {
          tx.delete(this.db.collection(COLLECTIONS.usernames).doc(current.usernameLower));
        }
        tx.set(claimRef, { uid: id });
        tx.set(
          profileRef,
          {
            username: input.username,
            usernameLower,
            avatarUrl: input.avatarUrl,
            ...(current ? {} : { createdAt: FieldValue.serverTimestamp() }),
          },
          { merge: true },
        );
      });
    } catch (error) {
      if (error instanceof UsernameTakenError) return null;
      throw error;
    }
    return this.find(id);
  }
}

function toProfile(id: string, data: ProfileDoc): ProfileRecord {
  return {
    id,
    username: data.username,
    avatarUrl: data.avatarUrl ?? null,
    // Server timestamps are briefly null in the writer's own snapshot.
    createdAt: data.createdAt?.toDate() ?? new Date(),
  };
}

@Injectable()
export class RoomsRepository {
  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  async create(room: {
    id: string;
    code: string;
    gameId: string;
    hostId: string;
    isPrivate: boolean;
    maxPlayers: number;
  }): Promise<void> {
    const { id, ...fields } = room;
    const now = FieldValue.serverTimestamp();
    await this.db
      .collection(COLLECTIONS.rooms)
      .doc(id)
      .set({ ...fields, status: 'OPEN', createdAt: now, updatedAt: now } satisfies Record<
        keyof RoomDoc,
        unknown
      >);
  }

  async setStatus(id: string, status: RoomStatus): Promise<void> {
    await this.db
      .collection(COLLECTIONS.rooms)
      .doc(id)
      .set({ status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
}

export interface MatchHistoryRow {
  id: string;
  gameId: string;
  startedAt: Date;
  finishedAt: Date | null;
  position: number | null;
  players: { username: string; position: number | null }[];
}

@Injectable()
export class MatchesRepository {
  constructor(
    @Inject(FIRESTORE) private readonly db: Firestore,
    private readonly actionLog: ActionLog,
  ) {}

  async create(match: {
    id: string;
    roomId: string;
    gameId: string;
    seed: string;
    config: Record<string, unknown>;
    startedAt: Date;
    players: { profileId: string; username: string; seat: number }[];
  }): Promise<void> {
    const doc: MatchDoc = {
      roomId: match.roomId,
      gameId: match.gameId,
      seed: match.seed,
      config: match.config,
      startedAt: Timestamp.fromDate(match.startedAt),
      finishedAt: null,
      aborted: false,
      players: match.players.map((p) => ({ ...p, finalPosition: null })),
      playerIds: match.players.map((p) => p.profileId),
    };
    await this.db.collection(COLLECTIONS.matches).doc(match.id).set(doc);
  }

  /** Buffered: never blocks gameplay on a database round-trip. */
  appendAction(entry: {
    matchId: string;
    seq: number;
    profileId: string;
    action: unknown;
    automatic: boolean;
  }): void {
    this.actionLog.append(entry);
  }

  /** Records the outcome and writes each player's history entry atomically. */
  async finish(matchId: string, rankings: readonly GameRanking[], aborted: boolean): Promise<void> {
    await this.actionLog.flush(matchId);
    const matchRef = this.db.collection(COLLECTIONS.matches).doc(matchId);
    const snapshot = await matchRef.get();
    const match = snapshot.data() as MatchDoc | undefined;
    if (!match) return;

    const positions = new Map(rankings.map((r) => [r.playerId, r.position]));
    const players = match.players.map((p) => ({ ...p, finalPosition: positions.get(p.profileId) ?? null }));
    const finishedAt = Timestamp.now();
    const batch = this.db.batch();
    batch.update(matchRef, { players, finishedAt, aborted });
    for (const player of players) {
      const entry: HistoryDoc = {
        matchId,
        gameId: match.gameId,
        startedAt: match.startedAt,
        finishedAt,
        position: player.finalPosition,
        aborted,
        players: players.map((p) => ({ username: p.username, position: p.finalPosition })),
      };
      batch.set(
        this.db
          .collection(COLLECTIONS.profiles)
          .doc(player.profileId)
          .collection(COLLECTIONS.history)
          .doc(matchId),
        entry,
      );
    }
    await batch.commit();
  }

  async historyFor(profileId: string, limit: number): Promise<MatchHistoryRow[]> {
    const snapshot = await this.db
      .collection(COLLECTIONS.profiles)
      .doc(profileId)
      .collection(COLLECTIONS.history)
      .orderBy('finishedAt', 'desc')
      .limit(limit)
      .get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as HistoryDoc;
      return {
        id: data.matchId,
        gameId: data.gameId,
        startedAt: data.startedAt.toDate(),
        finishedAt: data.finishedAt.toDate(),
        position: data.position,
        players: data.players,
      };
    });
  }
}
