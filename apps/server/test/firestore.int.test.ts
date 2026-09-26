/**
 * Firestore repositories against the Emulator Suite (`pnpm emulators`):
 *   pnpm --filter @cardroom/server test:int
 */
import { randomUUID } from 'node:crypto';
import { deleteApp, type App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env';
import { createFirebaseApp, createFirestore } from '../src/firebase/firebase';
import { ActionLog } from '../src/persistence/action-log';
import { MatchesRepository, ProfilesRepository, RoomsRepository } from '../src/persistence/repositories';

const emulator = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

let app: App;
let db: Firestore;
let profiles: ProfilesRepository;
let rooms: RoomsRepository;
let matches: MatchesRepository;
let actionLog: ActionLog;

beforeAll(() => {
  const env = loadEnv({
    FIREBASE_PROJECT_ID: 'demo-cardroom',
    FIRESTORE_EMULATOR_HOST: emulator,
    NODE_ENV: 'test',
  });
  process.env.FIRESTORE_EMULATOR_HOST = emulator;
  app = createFirebaseApp(env);
  db = createFirestore(app);
  profiles = new ProfilesRepository(db);
  rooms = new RoomsRepository(db);
  actionLog = new ActionLog(db);
  matches = new MatchesRepository(db, actionLog);
});

afterAll(async () => {
  await actionLog.onApplicationShutdown();
  await deleteApp(app);
});

const unique = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`;

describe('ProfilesRepository', () => {
  it('creates, reads and updates a profile', async () => {
    const id = randomUUID();
    const name = unique('ana');
    const created = await profiles.upsert(id, { username: name, avatarUrl: null });
    expect(created).toMatchObject({ id, username: name, avatarUrl: null });
    expect(created?.createdAt).toBeInstanceOf(Date);

    const updated = await profiles.upsert(id, { username: name, avatarUrl: 'https://example.com/a.png' });
    expect(updated?.avatarUrl).toBe('https://example.com/a.png');
    expect(await profiles.find(randomUUID())).toBeNull();
  });

  it('keeps usernames unique (case-insensitive) and frees the old one on rename', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const name = unique('Rui');
    expect(await profiles.upsert(a, { username: name, avatarUrl: null })).not.toBeNull();
    expect(await profiles.upsert(b, { username: name.toLowerCase(), avatarUrl: null })).toBeNull();

    const renamed = unique('rui2');
    expect(await profiles.upsert(a, { username: renamed, avatarUrl: null })).not.toBeNull();
    expect(await profiles.upsert(b, { username: name, avatarUrl: null })).not.toBeNull();
  });
});

describe('MatchesRepository', () => {
  it('records a match, its ordered action log and each player history', async () => {
    const roomId = randomUUID();
    const matchId = randomUUID();
    const [p1, p2] = [randomUUID(), randomUUID()];
    await rooms.create({
      id: roomId,
      code: 'ABCDEF',
      gameId: 'mexicana',
      hostId: p1,
      isPrivate: true,
      maxPlayers: 2,
    });
    await matches.create({
      id: matchId,
      roomId,
      gameId: 'mexicana',
      seed: 'ab'.repeat(32),
      config: { turnTimeoutMs: 30_000 },
      startedAt: new Date(),
      players: [
        { profileId: p1, username: 'ana', seat: 0 },
        { profileId: p2, username: 'rui', seat: 1 },
      ],
    });
    for (let seq = 1; seq <= 12; seq++) {
      matches.appendAction({
        matchId,
        seq,
        profileId: seq % 2 ? p1 : p2,
        action: { type: 'PICK_UP_PILE' },
        automatic: seq === 5,
      });
    }
    await matches.finish(
      matchId,
      [
        { playerId: p2, position: 1 },
        { playerId: p1, position: 2 },
      ],
      false,
    );
    await rooms.setStatus(roomId, 'OPEN');

    const actions = await db.collection('matches').doc(matchId).collection('actions').orderBy('seq').get();
    expect(actions.docs.map((d) => d.get('seq') as number)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 1),
    );
    expect(actions.docs[4]?.get('automatic')).toBe(true);

    const match = (await db.collection('matches').doc(matchId).get()).data();
    expect(match?.players).toEqual([
      { profileId: p1, username: 'ana', seat: 0, finalPosition: 2 },
      { profileId: p2, username: 'rui', seat: 1, finalPosition: 1 },
    ]);

    const history = await matches.historyFor(p2, 10);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: matchId, gameId: 'mexicana', position: 1 });
    expect(history[0]?.players).toEqual([
      { username: 'ana', position: 2 },
      { username: 'rui', position: 1 },
    ]);
    expect((await db.collection('rooms').doc(roomId).get()).get('status')).toBe('OPEN');
  });
});
