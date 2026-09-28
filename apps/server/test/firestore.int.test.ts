/**
 * Firestore repositories against the Emulator Suite (`pnpm emulators`):
 *   pnpm --filter @cardroom/server test:int
 */
import { randomUUID } from 'node:crypto';
import { deleteApp, type App } from 'firebase-admin/app';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
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

describe('guest profiles', () => {
  it('keep a temporary name that reserves nothing and cannot copy an account’s name', async () => {
    const [owner, guest, other] = [randomUUID(), randomUUID(), randomUUID()];
    const taken = unique('owner');
    await profiles.upsert(owner, { username: taken, avatarUrl: null });

    expect(await profiles.upsertGuest(guest, { username: taken.toUpperCase(), avatarUrl: null })).toBeNull();
    const name = unique('visita');
    expect(await profiles.upsertGuest(guest, { username: name, avatarUrl: null })).toMatchObject({
      username: name,
      guest: true,
    });
    // Nothing reserved: another guest, and later an account, can use the same name.
    expect((await db.collection('usernames').doc(name.toLowerCase()).get()).exists).toBe(false);
    expect(await profiles.upsertGuest(other, { username: name, avatarUrl: null })).not.toBeNull();
    expect(await profiles.findByUsername(name)).toBeNull();
    // Guests stay out of the player directory.
    expect((await profiles.search(name.slice(0, 8), 20)).map((p) => p.id)).not.toContain(guest);
  });

  it('become regular players when they create an account, without touching anyone else’s claim', async () => {
    const [guest, owner] = [randomUUID(), randomUUID()];
    const guestName = unique('conv');
    await profiles.upsertGuest(guest, { username: guestName, avatarUrl: null });
    // Someone registers the guest's name in the meantime.
    await profiles.upsert(owner, { username: guestName, avatarUrl: null });

    const chosen = unique('conta');
    expect(await profiles.upsert(guest, { username: chosen, avatarUrl: null })).toMatchObject({
      username: chosen,
      guest: false,
    });
    expect((await profiles.findByUsername(chosen))?.id).toBe(guest);
    expect((await profiles.findByUsername(guestName))?.id).toBe(owner);
  });
});

describe('player directory', () => {
  it('finds players by case-insensitive username prefix and by activity', async () => {
    const tag = randomUUID().slice(0, 6);
    const [a, b, c] = [randomUUID(), randomUUID(), randomUUID()];
    await profiles.upsert(a, { username: `Zed${tag}_one`, avatarUrl: null });
    await profiles.upsert(b, { username: `zed${tag}_two`, avatarUrl: null });
    await profiles.upsert(c, { username: `other${tag}`, avatarUrl: null });

    const found = await profiles.search(`ZED${tag}`, 10);
    expect(found.map((p) => p.id).sort()).toEqual([a, b].sort());
    expect(found[0]?.stats).toEqual({ played: 0, wins: 0, losses: 0, byGame: {} });
    expect((await profiles.findByUsername(`ZED${tag}_ONE`))?.id).toBe(a);
    expect(await profiles.findByUsername('nobody_here_xyz')).toBeNull();

    await db
      .collection('profiles')
      .doc(c)
      .update({ stats: { played: 999, wins: 0, losses: 0, byGame: {} } });
    expect((await profiles.mostActive(1))[0]?.id).toBe(c);
  });
});

describe('MatchesRepository', () => {
  it('records a match, its ordered action log and each player history', async () => {
    const roomId = randomUUID();
    const matchId = randomUUID();
    const [p1, p2] = [randomUUID(), randomUUID()];
    await profiles.upsert(p1, { username: unique('ana'), avatarUrl: null });
    await profiles.upsert(p2, { username: unique('rui'), avatarUrl: null });
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
        { profileId: p1, username: 'ana', seat: 0, guest: false },
        { profileId: p2, username: 'rui', seat: 1, guest: false },
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
        { playerId: p2, position: 1, outcome: 'WINNER' },
        { playerId: p1, position: 2, outcome: 'LOSER' },
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
      {
        profileId: p1,
        username: 'ana',
        seat: 0,
        finalPosition: 2,
        outcome: 'LOSER',
        score: null,
        guest: false,
      },
      {
        profileId: p2,
        username: 'rui',
        seat: 1,
        finalPosition: 1,
        outcome: 'WINNER',
        score: null,
        guest: false,
      },
    ]);

    const history = await matches.historyFor(p2, 10);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ id: matchId, gameId: 'mexicana', position: 1, outcome: 'WINNER' });
    expect(history[0]?.players).toEqual([
      { username: 'ana', position: 2, outcome: 'LOSER', score: null, guest: false },
      { username: 'rui', position: 1, outcome: 'WINNER', score: null, guest: false },
    ]);
    expect((await db.collection('rooms').doc(roomId).get()).get('status')).toBe('OPEN');

    // Stat counters were incremented atomically with the result (1st = win, last = loss).
    expect((await profiles.find(p2))?.stats).toEqual({
      played: 1,
      wins: 1,
      losses: 0,
      byGame: { mexicana: { played: 1, wins: 1, losses: 0 } },
    });
    expect((await profiles.find(p1))?.stats).toMatchObject({ played: 1, wins: 0, losses: 1 });
  });

  it('records Fodinha outcomes and scores, and reads history written before outcomes existed', async () => {
    const matchId = randomUUID();
    const [p1, p2, p3] = [randomUUID(), randomUUID(), randomUUID()];
    for (const [id, name] of [
      [p1, 'eva'],
      [p2, 'rui'],
      [p3, 'ze'],
    ] as const) {
      await profiles.upsert(id, { username: unique(name), avatarUrl: null });
    }
    await matches.create({
      id: matchId,
      roomId: randomUUID(),
      gameId: 'fodinha',
      seed: 'cd'.repeat(32),
      config: { maxPoints: 5 },
      startedAt: new Date(),
      players: [
        { profileId: p1, username: 'eva', seat: 0, guest: false },
        { profileId: p2, username: 'rui', seat: 1, guest: false },
        { profileId: p3, username: 'ze', seat: 2, guest: false },
      ],
    });
    await matches.finish(
      matchId,
      [
        { playerId: p2, outcome: 'SURVIVOR', score: 1 },
        { playerId: p3, outcome: 'SURVIVOR', score: 3 },
        { playerId: p1, outcome: 'LOSER', score: 5 },
      ],
      false,
    );

    const [entry] = await matches.historyFor(p1, 10);
    expect(entry).toMatchObject({ gameId: 'fodinha', position: null, outcome: 'LOSER', score: 5 });
    expect(entry?.players).toContainEqual({
      username: 'rui',
      position: null,
      outcome: 'SURVIVOR',
      score: 1,
      guest: false,
    });
    // Survivors neither win nor lose; reaching the limit is a loss.
    expect((await profiles.find(p1))?.stats.byGame.fodinha).toEqual({ played: 1, wins: 0, losses: 1 });
    expect((await profiles.find(p2))?.stats.byGame.fodinha).toEqual({ played: 1, wins: 0, losses: 0 });

    // A history entry from before outcomes were stored: derived from positions.
    await db
      .collection('profiles')
      .doc(p2)
      .collection('history')
      .doc('legacy')
      .set({
        matchId: 'legacy',
        gameId: 'mexicana',
        startedAt: Timestamp.fromDate(new Date(0)),
        finishedAt: Timestamp.fromDate(new Date(1000)),
        position: 3,
        aborted: false,
        players: [
          { username: 'a', position: 1 },
          { username: 'b', position: 2 },
          { username: 'rui', position: 3 },
        ],
      });
    const legacy = (await matches.historyFor(p2, 10)).find((m) => m.id === 'legacy');
    expect(legacy).toMatchObject({ position: 3, outcome: 'LOSER', score: null });
    expect(legacy?.players.map((p) => p.outcome)).toEqual(['WINNER', 'PLACED', 'LOSER']);
  });

  it('adds players who sat down mid-session, and records the session for everyone', async () => {
    const matchId = randomUUID();
    const [host, late] = [randomUUID(), randomUUID()];
    await profiles.upsert(host, { username: unique('ana'), avatarUrl: null });
    await profiles.upsert(late, { username: unique('eva'), avatarUrl: null });
    await matches.create({
      id: matchId,
      roomId: randomUUID(),
      gameId: 'blackjack',
      seed: 'ef'.repeat(32),
      config: { decks: 6 },
      startedAt: new Date(),
      players: [{ profileId: host, username: 'ana', seat: 0, guest: false }],
    });
    await matches.addPlayer(matchId, { profileId: late, username: 'eva', seat: 3, guest: false });

    const match = (await db.collection('matches').doc(matchId).get()).data();
    expect(match?.playerIds).toEqual([host, late]);
    await matches.finish(
      matchId,
      [
        { playerId: late, outcome: 'PLACED', position: 1, score: 40 },
        { playerId: host, outcome: 'PLACED', position: 2, score: -40 },
      ],
      false,
    );
    const [entry] = await matches.historyFor(late, 10);
    expect(entry).toMatchObject({ gameId: 'blackjack', position: 1, outcome: 'PLACED', score: 40 });
    expect(entry?.players).toHaveLength(2);
    // A session counts as played, never as a win or a loss.
    expect((await profiles.find(late))?.stats.byGame.blackjack).toEqual({ played: 1, wins: 0, losses: 0 });
  });
});
