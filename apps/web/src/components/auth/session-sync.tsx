'use client';

import { onIdTokenChanged } from 'firebase/auth';
import { useEffect, useRef } from 'react';
import { firebaseAuth } from '@/lib/firebase/client';

/**
 * Keeps the httpOnly session cookie in step with Firebase: every time the SDK
 * issues a new ID token (sign-in, hourly refresh) it is sent to the server; when
 * the user signs out everywhere else, the cookie is cleared.
 */
export function SessionSync() {
  const lastToken = useRef<string | null>(null);

  useEffect(() => {
    const auth = firebaseAuth();
    return onIdTokenChanged(auth, (user) => {
      if (!user) {
        // Also covers a stale cookie left behind while the SDK has no user.
        void fetch('/api/auth/session', { method: 'DELETE' });
        lastToken.current = null;
        return;
      }
      void user.getIdToken().then((idToken) => {
        if (idToken === lastToken.current) return;
        lastToken.current = idToken;
        void fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });
      });
    });
  }, []);

  return null;
}
