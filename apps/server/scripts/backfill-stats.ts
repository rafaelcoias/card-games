/**
 * One-off: compute `profiles/{uid}.stats` from each player's match history.
 * New matches keep the counters up to date on their own; run this once after
 * introducing stats (or with --force to recompute everyone).
 *
 *   pnpm --filter @cardroom/server backfill:stats [--force]
 *
 * Uses the same env as the server (apps/server/.env or the process env).
 */
import { existsSync } from 'node:fs';
import { accumulateStats } from '@cardroom/shared';
import { loadEnv } from '../src/config/env';
import { createFirebaseApp, createFirestore } from '../src/firebase/firebase';
import type { HistoryDoc, ProfileDoc } from '../src/persistence/models';

async function main(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const force = process.argv.includes('--force');
  const db = createFirestore(createFirebaseApp(loadEnv()));

  const profiles = await db.collection('profiles').get();
  let updated = 0;
  for (const doc of profiles.docs) {
    const profile = doc.data() as ProfileDoc;
    if (profile.stats && !force) continue;
    const history = await doc.ref.collection('history').get();
    const stats = accumulateStats(
      history.docs.map((h) => {
        const entry = h.data() as HistoryDoc;
        return {
          gameId: entry.gameId,
          position: entry.position,
          playerCount: entry.players.length,
          aborted: entry.aborted,
        };
      }),
    );
    // Replace (not merge) the whole stats map so a recompute never double counts.
    await doc.ref.update({ stats });
    updated += 1;
    console.log(`${profile.username}: ${stats.played} played, ${stats.wins} wins, ${stats.losses} losses`);
  }
  console.log(`Done: ${updated} of ${profiles.size} profiles updated.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
