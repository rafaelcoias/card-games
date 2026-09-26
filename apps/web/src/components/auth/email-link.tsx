'use client';

import { isSignInWithEmailLink, signInWithEmailLink } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { establishSession, firebaseAuth } from '@/lib/firebase/client';
import { authErrorMessage } from '@/lib/firebase/errors';

export const EMAIL_FOR_SIGN_IN = 'cardroom:emailForSignIn';

type State = { kind: 'working' } | { kind: 'askEmail' } | { kind: 'error'; message: string };

/** Completes a passwordless sign-in from the e-mailed link. */
export function EmailLinkCompletion({ next }: { next: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'working' });
  const [email, setEmail] = useState('');
  const started = useRef(false);

  const complete = async (address: string) => {
    setState({ kind: 'working' });
    try {
      const { user } = await signInWithEmailLink(firebaseAuth(), address, window.location.href);
      window.localStorage.removeItem(EMAIL_FOR_SIGN_IN);
      await establishSession(user);
      router.replace(next);
      router.refresh();
    } catch (error) {
      setState({ kind: 'error', message: authErrorMessage(error) });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const auth = firebaseAuth();
      await auth.authStateReady();
      if (!isSignInWithEmailLink(auth, window.location.href)) {
        setState({ kind: 'error', message: 'Este link de entrada não é válido.' });
        return;
      }
      const saved = window.localStorage.getItem(EMAIL_FOR_SIGN_IN);
      // Opened on another device: ask for the address to prevent session fixation.
      if (saved) await complete(saved);
      else setState({ kind: 'askEmail' });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once for the URL in the address bar
  }, []);

  if (state.kind === 'working') {
    return (
      <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted" role="status">
        <Spinner className="size-4" /> A entrar…
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div className="flex flex-col gap-4">
        <p
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {state.message}
        </p>
        <Link href="/login" className="font-semibold text-gold hover:text-gold-strong">
          ← Voltar a entrar
        </Link>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void complete(email.trim());
      }}
    >
      <p className="text-sm text-muted">Confirma o e-mail para onde enviámos o link.</p>
      <Field label="E-mail" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" size="lg">
        Entrar
      </Button>
    </form>
  );
}
