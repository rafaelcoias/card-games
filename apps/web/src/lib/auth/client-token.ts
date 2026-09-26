'use client';

import { createApi } from '../api';
import { firebaseAuth } from '../firebase/client';

/**
 * Current Firebase ID token for calls to the game server (socket handshake and
 * REST). The SDK caches it and refreshes it transparently before it expires.
 */
export async function getAccessToken(options: { fresh?: boolean } = {}): Promise<string | null> {
  const auth = firebaseAuth();
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken(options.fresh ?? false) : null;
}

export const browserApi = createApi(() => getAccessToken());
