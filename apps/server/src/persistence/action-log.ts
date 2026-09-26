import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { FIRESTORE } from '../firebase/firebase';
import type { ActionDoc } from './models';

interface PendingAction {
  matchId: string;
  seq: number;
  profileId: string;
  action: unknown;
  automatic: boolean;
  at: Date;
}

const FLUSH_INTERVAL_MS = 500;
const MAX_BATCH = 400; // Firestore allows 500 writes per batch.

/**
 * Write-behind buffer for the per-match action log. Gameplay never waits on
 * Firestore: actions are queued in memory and written in batches every
 * ~500 ms, on match end and on shutdown. Documents are keyed by the zero-padded
 * `seq`, so ordering is preserved even when several server instances write
 * parts of the same match.
 */
@Injectable()
export class ActionLog implements OnApplicationShutdown {
  private readonly logger = new Logger(ActionLog.name);
  private pending: PendingAction[] = [];
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> = Promise.resolve();

  constructor(@Inject(FIRESTORE) private readonly db: Firestore) {}

  append(entry: Omit<PendingAction, 'at'>): void {
    this.pending.push({ ...entry, at: new Date() });
    this.timer ??= setTimeout(() => void this.flush(), FLUSH_INTERVAL_MS);
  }

  /** Writes everything queued (optionally only for one match) and waits for it. */
  async flush(matchId?: string): Promise<void> {
    if (this.timer && !matchId) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const take = matchId ? this.pending.filter((a) => a.matchId === matchId) : this.pending;
    this.pending = matchId ? this.pending.filter((a) => a.matchId !== matchId) : [];
    // Chain writes so a match-end flush never overtakes an earlier periodic one.
    this.inFlight = this.inFlight.then(() => this.write(take));
    await this.inFlight;
    if (!this.timer && this.pending.length > 0) {
      this.timer = setTimeout(() => void this.flush(), FLUSH_INTERVAL_MS);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.flush();
  }

  private async write(actions: PendingAction[]): Promise<void> {
    for (let i = 0; i < actions.length; i += MAX_BATCH) {
      const batch = this.db.batch();
      for (const a of actions.slice(i, i + MAX_BATCH)) {
        const doc: ActionDoc = {
          seq: a.seq,
          profileId: a.profileId,
          action: a.action,
          automatic: a.automatic,
          at: Timestamp.fromDate(a.at),
        };
        batch.set(
          this.db
            .collection('matches')
            .doc(a.matchId)
            .collection('actions')
            .doc(String(a.seq).padStart(6, '0')),
          doc,
        );
      }
      try {
        await batch.commit();
      } catch (error) {
        this.logger.error({ err: error, count: actions.length }, 'Failed to persist action log batch');
      }
    }
  }
}
