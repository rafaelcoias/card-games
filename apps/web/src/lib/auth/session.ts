import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { SESSION_COOKIE, verifyIdToken } from './id-token';

export interface ServerSession {
  userId: string;
  email: string | null;
  guest: boolean;
  /** Firebase ID token — also what the game server expects as bearer token. */
  accessToken: string;
}

/** Signed-in user for this request (memoised per request). */
export const getServerSession = cache(async (): Promise<ServerSession | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const identity = await verifyIdToken(token);
  return identity
    ? { userId: identity.userId, email: identity.email, guest: identity.guest, accessToken: token }
    : null;
});
