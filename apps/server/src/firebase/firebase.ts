import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { applicationDefault, cert, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { usesEmulators, type Env } from '../config/env';

export const FIREBASE_APP = Symbol('FIREBASE_APP');
export const FIRESTORE = Symbol('FIRESTORE');
export const FIREBASE_AUTH = Symbol('FIREBASE_AUTH');

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

/**
 * Accepts the service-account key exactly as downloaded from the Firebase
 * console: raw JSON, base64-encoded JSON (easier to paste into some hosting
 * dashboards) or, locally, a path to the .json file. Escaped newlines in the
 * private key are restored.
 */
export function parseServiceAccount(value: string | undefined): ServiceAccount | null {
  if (!value) return null;
  const trimmed = value.trim();
  const text = trimmed.startsWith('{')
    ? trimmed
    : trimmed.endsWith('.json')
      ? readFileSync(resolve(trimmed), 'utf8') // local development: path to the downloaded key
      : Buffer.from(trimmed, 'base64').toString('utf8');
  let json: ServiceAccountJson;
  try {
    json = JSON.parse(text) as ServiceAccountJson;
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is neither JSON nor base64-encoded JSON');
  }
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key');
  }
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key.replace(/\\n/g, '\n'),
  };
}

export function createFirebaseApp(env: Env): App {
  const account = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT);
  const projectId = env.FIREBASE_PROJECT_ID ?? account?.projectId;
  // Emulators need no credentials; elsewhere fall back to Application Default Credentials.
  const credential = account ? cert(account) : usesEmulators(env) ? undefined : applicationDefault();
  return initializeApp({ projectId, ...(credential ? { credential } : {}) }, 'cardroom-server');
}

export function createFirestore(app: App): Firestore {
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

export function createFirebaseAuth(app: App): Auth {
  return getAuth(app);
}
