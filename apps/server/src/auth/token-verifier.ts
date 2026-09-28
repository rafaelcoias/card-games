import { ErrorCode } from '@cardroom/shared';
import type { Auth } from 'firebase-admin/auth';
import { AppError } from '../common/app-error';

export interface AuthIdentity {
  userId: string;
  email: string | null;
  /** Firebase anonymous sign-in: a guest playing under a temporary name. */
  guest: boolean;
}

/** Turns a bearer token into an identity; throws `UNAUTHORIZED` otherwise. */
export abstract class TokenVerifier {
  abstract verify(token: string): Promise<AuthIdentity>;
}

/**
 * Firebase ID tokens, sent by the browser (socket handshake / REST) and by the
 * web server during SSR (from the session cookie, which holds the same token).
 */
export class FirebaseTokenVerifier extends TokenVerifier {
  constructor(private readonly auth: Auth) {
    super();
  }

  async verify(token: string): Promise<AuthIdentity> {
    try {
      const decoded = await this.auth.verifyIdToken(token);
      return {
        userId: decoded.uid,
        email: decoded.email ?? null,
        guest: decoded.firebase.sign_in_provider === 'anonymous',
      };
    } catch {
      throw new AppError(ErrorCode.Unauthorized, 'Invalid or expired session');
    }
  }
}
