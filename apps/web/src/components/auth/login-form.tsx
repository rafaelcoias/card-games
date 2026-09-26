'use client';

import clsx from 'clsx';
import { sendSignInLinkToEmail, signInWithEmailAndPassword } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { publicEnv } from '@/lib/env';
import { establishSession, firebaseAuth } from '@/lib/firebase/client';
import { authErrorMessage } from '@/lib/firebase/errors';
import { EMAIL_FOR_SIGN_IN } from './email-link';

type Mode = 'password' | 'magic';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resuming, setResuming] = useState(true);

  // Still signed in to Firebase but the session cookie expired: renew it silently.
  useEffect(() => {
    const auth = firebaseAuth();
    let active = true;
    void auth.authStateReady().then(async () => {
      if (!active) return;
      if (!auth.currentUser) {
        setResuming(false);
        return;
      }
      try {
        await establishSession(auth.currentUser);
        router.replace(next);
        router.refresh();
      } catch {
        if (active) setResuming(false);
      }
    });
    return () => {
      active = false;
    };
  }, [next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const auth = firebaseAuth();
    try {
      if (mode === 'password') {
        const { user } = await signInWithEmailAndPassword(auth, email.trim(), password);
        await establishSession(user);
        router.replace(next);
        router.refresh();
        return;
      }
      const url = new URL('/auth/email-link', publicEnv.siteUrl);
      url.searchParams.set('next', next);
      await sendSignInLinkToEmail(auth, email.trim(), { url: url.toString(), handleCodeInApp: true });
      window.localStorage.setItem(EMAIL_FOR_SIGN_IN, email.trim());
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    }
    setLoading(false);
  }

  if (resuming) {
    return (
      <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted" role="status">
        <Spinner className="size-4" /> A verificar a sessão…
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm leading-relaxed">
        Enviámos um link de entrada para <strong>{email}</strong>. Abre-o neste dispositivo para entrar.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Forma de entrar"
        className="grid grid-cols-2 rounded-xl bg-ink/60 p-1 text-sm"
      >
        {(['password', 'magic'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={clsx(
              'h-9 rounded-lg font-medium transition-colors',
              mode === m ? 'bg-surface-3 text-ivory shadow' : 'text-muted hover:text-ivory',
            )}
          >
            {m === 'password' ? 'Palavra-passe' : 'Link por e-mail'}
          </button>
        ))}
      </div>
      <Field
        label="E-mail"
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {mode === 'password' && (
        <Field
          label="Palavra-passe"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <Link href="/forgot-password" className="text-gold hover:text-gold-strong">
              Esqueci-me da palavra-passe
            </Link>
          }
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={loading}>
        {mode === 'password' ? 'Entrar' : 'Enviar link'}
      </Button>
      <p className="text-center text-sm text-muted">
        Ainda não tens conta?{' '}
        <Link href="/register" className="font-semibold text-gold hover:text-gold-strong">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
