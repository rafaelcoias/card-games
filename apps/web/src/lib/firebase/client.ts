'use client';

import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth, type User } from 'firebase/auth';
import { publicEnv } from '../env';

let auth: Auth | null = null;

function app(): FirebaseApp {
  return getApps().length > 0 ? getApp() : initializeApp(publicEnv.firebase);
}

/** Lazily initialised Firebase Auth (connected to the local emulator when configured). */
export function firebaseAuth(): Auth {
  if (auth) return auth;
  auth = getAuth(app());
  auth.languageCode = 'pt';
  if (publicEnv.authEmulatorHost) {
    connectAuthEmulator(auth, `http://${publicEnv.authEmulatorHost}`, { disableWarnings: true });
  }
  return auth;
}

/**
 * Hands the user's ID token to our server, which stores it in an httpOnly
 * cookie so that server components and the route proxy know who is signed in.
 */
export async function establishSession(user: User): Promise<void> {
  const idToken = await user.getIdToken();
  const response = await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!response.ok) throw new Error('Could not establish the session');
}

export async function endSession(): Promise<void> {
  await Promise.allSettled([firebaseAuth().signOut(), fetch('/api/auth/session', { method: 'DELETE' })]);
}
