/**
 * Shared plumbing for the protocol E2E suites: real users in the Auth emulator,
 * Socket.IO clients and bots that behave like the web client.
 */
import type {
  Ack,
  ClientToServerEvents,
  GameViewMessage,
  JoinedRoom,
  MatchResult,
  ServerToClientEvents,
} from '@cardroom/shared';
import { io, type Socket } from 'socket.io-client';
import { expect } from 'vitest';

/** Comma-separated: with several URLs the players are spread across server instances. */
export const SERVERS = (process.env.E2E_SERVER_URLS ?? 'http://localhost:4000')
  .split(',')
  .map((url) => url.trim());
const SERVER = SERVERS[0] as string;
const AUTH_EMULATOR = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Bot<View = unknown, Action = unknown> {
  url: string;
  id: string;
  name: string;
  token: string;
  socket: ClientSocket;
  lastView: GameViewMessage<View, Action> | null;
  result: MatchResult | null;
  snapshots: number;
}

/**
 * Creates a real user in the Auth emulator and returns its Firebase ID token.
 * Without an e-mail it is an anonymous user: a guest.
 */
async function signUp(email: string | null): Promise<{ id: string; token: string }> {
  const response = await fetch(
    `http://${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(
        email ? { email, password: 'secret123', returnSecureToken: true } : { returnSecureToken: true },
      ),
    },
  );
  if (!response.ok) throw new Error(`Auth emulator signUp failed: ${await response.text()}`);
  const body = (await response.json()) as { localId: string; idToken: string };
  return { id: body.localId, token: body.idToken };
}

export async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SERVER}/api${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...init.headers },
  });
  if (!response.ok) throw new Error(`${path} → ${response.status} ${await response.text()}`);
  return (await response.json()) as T;
}

export function connect(bot: Pick<Bot, 'token' | 'url'>): Promise<ClientSocket> {
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

/** Registers `count` users with profiles and connects them, spread over the servers. */
export async function createBots<View, Action>(
  prefix: string,
  count: number,
  options: { guests?: number } = {},
): Promise<Bot<View, Action>[]> {
  const bots: Bot<View, Action>[] = [];
  for (let i = 0; i < count; i++) {
    const name = `${prefix}_${i}`;
    // The last `guests` bots play without an account (anonymous sign-in).
    const guest = i >= count - (options.guests ?? 0);
    const { id, token } = await signUp(guest ? null : `${name}@example.com`);
    await api(token, '/me/profile', { method: 'PUT', body: JSON.stringify({ username: name }) });
    const url = SERVERS[i % SERVERS.length] as string;
    bots.push({
      url,
      id,
      name,
      token,
      socket: await connect({ token, url }),
      lastView: null,
      result: null,
      snapshots: 0,
    });
  }
  return bots;
}

/**
 * Mirrors the web client: ignore stale views, one action in flight, re-evaluate
 * after a rejection. `choose` picks the action for a view (or `null` to wait).
 */
export function attachBot<View, Action>(
  bot: Bot<View, Action>,
  choose: (view: GameViewMessage<View, Action>) => Action | null,
  rejections: string[],
  onView?: (message: GameViewMessage<View, Action>) => void,
): void {
  let inFlight = false;
  const act = () => {
    const view = bot.lastView;
    const action = view && choose(view);
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
    const view = message as GameViewMessage<View, Action>;
    onView?.(view);
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

/**
 * Host creates the room, guests join and get ready, host starts. Returns the
 * room code. `maxPlayers` leaves free seats (session tables take players later).
 */
export async function startMatch(
  bots: Bot[],
  gameId: string,
  config: Record<string, unknown> = {},
  maxPlayers = bots.length,
): Promise<string> {
  const [host, ...guests] = bots as [Bot, ...Bot[]];
  const created = (await host.socket.timeout(8000).emitWithAck('room:create', {
    gameId,
    maxPlayers,
    isPrivate: true,
    config,
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
  return code;
}

/** Drops the bot's socket and reconnects it (through another instance when there is one). */
export async function reconnect(bot: Bot, reattach: (bot: Bot) => void): Promise<void> {
  bot.socket.disconnect();
  await new Promise((r) => setTimeout(r, 300));
  // State lives in Redis, not in memory: any instance can take the player back.
  bot.url = SERVERS[(SERVERS.indexOf(bot.url) + 1) % SERVERS.length] as string;
  bot.socket = await connect(bot);
  reattach(bot);
}

export const waitFor = async (predicate: () => boolean, timeoutMs: number, label: string) => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
};
