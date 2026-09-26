import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from 'jose';
import { publicEnv } from '../env';

export const SESSION_COOKIE = '__session';

export interface Identity {
  userId: string;
  email: string | null;
  /** Seconds since epoch. */
  expiresAt: number;
}

export interface VerifierOptions {
  projectId: string;
  /** Google's signing keys (injectable for tests). */
  keys: JWTVerifyGetKey;
  /** Accept the Auth emulator's unsigned tokens (never in production). */
  emulator: boolean;
}

/**
 * Verifies Firebase ID tokens against Google's public keys — the web tier needs
 * no service account. Emulator tokens are unsigned, so they are only accepted
 * when explicitly allowed.
 */
export function createIdTokenVerifier({ projectId, keys, emulator }: VerifierOptions) {
  const issuer = `https://securetoken.google.com/${projectId}`;
  return async function verify(token: string): Promise<Identity | null> {
    try {
      let payload: JWTPayload;
      if (emulator) {
        payload = decodeJwt(token);
        if (payload.iss !== issuer || payload.aud !== projectId) return null;
        if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
      } else {
        ({ payload } = await jwtVerify(token, keys, { issuer, audience: projectId, algorithms: ['RS256'] }));
      }
      if (!payload.sub || !payload.exp) return null;
      return {
        userId: payload.sub,
        email: typeof payload.email === 'string' ? payload.email : null,
        expiresAt: payload.exp,
      };
    } catch {
      return null;
    }
  };
}

export const verifyIdToken = createIdTokenVerifier({
  projectId: publicEnv.firebase.projectId,
  // Firebase signs ID tokens with these rotating keys (fetched lazily and cached by jose).
  keys: createRemoteJWKSet(
    new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'),
  ),
  emulator: Boolean(publicEnv.authEmulatorHost) && process.env.NODE_ENV !== 'production',
});
