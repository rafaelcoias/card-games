/**
 * End-to-end protocol test against a RUNNING server backed by the Firebase
 * emulators (`pnpm emulators` + server with the emulator env):
 *   pnpm --filter @cardroom/server test:e2e
 * Four socket clients create/join a room, play a full Mexicana match, one of
 * them drops and reconnects mid-game, and the result must be persisted.
 */
import { randomUUID } from 'node:crypto';
import type { MexicanaAction, MexicanaView } from '@cardroom/mexicana';
import type {
  Ack,
  ClientToServerEvents,
  GameViewMessage,
  JoinedRoom,
  MatchHistoryEntry,
  MatchResult,
  ServerToClientEvents,
} from '@cardroom/shared';
import { io, type Socket } from 'socket.io-client';
import { afterAll, describe, expect, it } from 'vitest';

/** Comma-separated: with several URLs the players are spread across server instances. */
const SERVERS = (process.env.E2E_SERVER_URLS ?? 'http://localhost:4000').split(',').map((url) => url.trim());
const SERVER = SERVERS[0] as string;
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type View = GameViewMessage<MexicanaView, MexicanaAction>;

interface Bot {
  url: string;
  id: string;
  name: string;
  token: string;
  socket: ClientSocket;
  lastView: View | null;
  result: MatchResult | null;
  snapshots: number;
}

/** Creates a real user in the Auth emulator and returns its Firebase ID token. */
async function signUp(email: string): Promise<{ id: string; token: string }> {
  const response = await fetch(
    `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'secret123', returnSecureToken: true }),
    },
  );
  if (!response.ok) throw new Error(`Auth emulator signUp failed: ${await response.text()}`);
  const body = (await response.json()) as { localId: string; idToken: string };
  return { id: body.localId, token: body.idToken };
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SERVER}/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) throw new Error(`${path} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

function connect(bot: Pick<Bot, 'token' | 'url'>): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket: ClientSocket = io(bot.url, {
      transports: ['websocket'],
      auth: { token: bot.token },
      forceNew: true,
    });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

/** Deterministic, reasonable strategy: lowest single card, else blind card, else pick up. */
function chooseAction(view: View): MexicanaAction | null {
  const actions = view.validActions;
  if (actions.length === 0) return null;
  const choose = actions.find((a) => a.type === 'CHOOSE_FACE_UP');
  if (choose) return choose;
  const order = ['2', '3', '4', '5', '6', '7', '8', '9', 'J', 'Q', 'K', 'A', '10', 'JOKER'];
  const rankOf = (id: string) => (id.startsWith('JK') ? 'JOKER' : id.slice(0, -1));
  const singles = actions.filter(
    (a): a is Extract<MexicanaAction, { type: 'PLAY_CARDS' }> =>
      a.type === 'PLAY_CARDS' && a.cardIds.length === 1,
  );
  singles.sort((a, b) => order.indexOf(rankOf(a.cardIds[0]!)) - order.indexOf(rankOf(b.cardIds[0]!)));
  return singles[0] ?? actions.find((a) => a.type === 'PLAY_FACE_DOWN') ?? actions[0] ?? null;
}

/** Mirrors the web client: ignore stale views, one action in flight, re-evaluate after a rejection. */
function attach(bot: Bot): void {
  let inFlight = false;
  const act = () => {
    const view = bot.lastView;
    const action = view && chooseAction(view);
    if (!view || !action || inFlight) return;
    inFlight = true;
    const seq = view.seq;
    void bot.socket
      .timeout(8000)
      .emitWithAck('game:action', { action })
      .then((ack: Ack) => {
        if (ack.ok) return false;
        rejections.push(`${bot.name}@${seq}: ${ack.error.code}`);
        return ack.error.code === 'RATE_LIMITED';
      })
      .catch(() => false)
      .then((retry) => {
        inFlight = false;
        if (retry)
          setTimeout(act, 250); // back off, like a human clicking again
        else if (bot.lastView && bot.lastView.seq !== seq) act();
      });
  };
  bot.socket.on('game:view', (message) => {
    const view = message as View;
    if (view.snapshot) bot.snapshots += 1;
    const current = bot.lastView;
    if (current && current.matchId === view.matchId && view.seq < current.seq && !view.snapshot) return;
    bot.lastView = view;
    act();
  });
  bot.socket.on('game:finished', (result) => {
    bot.result = result;
  });
}

const waitFor = async (predicate: () => boolean, timeoutMs: number, label: string) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

const bots: Bot[] = [];
const rejections: string[] = [];

afterAll(() => {
  for (const bot of bots) bot.socket.disconnect();
});

describe('multiplayer Mexicana over Socket.IO', () => {
  it('four players complete a match, survive a reconnect and get it recorded', async () => {
    const run = randomUUID().slice(0, 6);
    for (let i = 0; i < 4; i++) {
      const name = `bot_${run}_${i}`;
      const { id, token } = await signUp(`${name}@example.com`);
      await api(token, '/me/profile', { method: 'PUT', body: JSON.stringify({ username: name }) });
      const url = SERVERS[i % SERVERS.length] as string;
      const bot: Bot = {
        url,
        id,
        name,
        token,
        socket: await connect({ token, url }),
        lastView: null,
        result: null,
        snapshots: 0,
      };
      attach(bot);
      bots.push(bot);
    }
    const [host, ...guests] = bots as [Bot, ...Bot[]];

    const created = (await host.socket.timeout(8000).emitWithAck('room:create', {
      gameId: 'mexicana',
      maxPlayers: 4,
      isPrivate: true,
      config: {},
    })) as Ack<JoinedRoom>;
    if (!created.ok) throw new Error(created.error.code);
    const code = created.data.room.code;

    for (const guest of guests) {
      const joined = (await guest.socket.timeout(8000).emitWithAck('room:join', { code })) as Ack<JoinedRoom>;
      expect(joined.ok).toBe(true);
      const ready = (await guest.socket.timeout(8000).emitWithAck('room:ready', { ready: true })) as Ack;
      expect(ready.ok).toBe(true);
    }
    const started = (await host.socket.timeout(8000).emitWithAck('room:start')) as Ack;
    expect(started).toEqual({ ok: true });

    // Mid-game: drop one player and come back; the server must resync them.
    await waitFor(() => (bots[2]?.lastView?.seq ?? 0) > 20, 60_000, 'some progress');
    const dropped = bots[2] as Bot;
    dropped.socket.disconnect();
    await new Promise((r) => setTimeout(r, 300));
    // Come back through another instance when there is one: state lives in Redis, not in memory.
    dropped.url = SERVERS[(SERVERS.indexOf(dropped.url) + 1) % SERVERS.length] as string;
    dropped.socket = await connect(dropped);
    attach(dropped);
    await waitFor(() => dropped.snapshots > 0, 10_000, 'reconnect snapshot');

    await waitFor(() => bots.every((b) => b.result !== null), 180_000, 'match end');
    // Rate-limited bot bursts are expected (and retried); anything else is worth seeing.
    if (rejections.length > 0) console.warn('rejected actions:', rejections);
    const result = host.result as MatchResult;
    expect(result.aborted).toBe(false);
    expect(result.rankings.map((r) => r.position)).toEqual([1, 2, 3, 4]);
    expect(new Set(result.rankings.map((r) => r.playerId))).toEqual(new Set(bots.map((b) => b.id)));

    // Each client only ever sees its own hand; other seats are reduced to counts.
    for (const bot of bots) {
      const view = bot.lastView?.view as MexicanaView;
      expect(view.selfId).toBe(bot.id);
      for (const seat of view.seats) expect(Object.keys(seat)).not.toContain('hand');
    }

    const history = await api<MatchHistoryEntry[]>(host.token, '/me/matches');
    const recorded = history.find((m) => m.id === result.matchId);
    expect(recorded).toBeDefined();
    expect(recorded?.players).toHaveLength(4);
    expect(recorded?.position).toBe(result.rankings.find((r) => r.playerId === host.id)?.position);
  });
});
