'use client';

import { applyActionCode, confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { firebaseAuth } from '@/lib/firebase/client';
import { authErrorMessage } from '@/lib/firebase/errors';
import { EmailLinkCompletion } from './email-link';

type State =
  | { kind: 'loading' }
  | { kind: 'resetForm'; email: string }
  | { kind: 'done'; message: string }
  | { kind: 'error'; message: string };

/**
 * Branded handler for Firebase e-mail actions (set it as the "Action URL" in
 * Firebase → Authentication → Templates): password reset, e-mail verification
 * and passwordless sign-in links.
 */
export function ActionHandler({ mode, oobCode }: { mode: string | null; oobCode: string | null }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!oobCode || mode === 'signIn') return;
    const auth = firebaseAuth();
    if (mode === 'resetPassword') {
      verifyPasswordResetCode(auth, oobCode)
        .then((email) => setState({ kind: 'resetForm', email }))
        .catch((error: unknown) => setState({ kind: 'error', message: authErrorMessage(error) }));
    } else if (mode === 'verifyEmail') {
      applyActionCode(auth, oobCode)
        .then(() => setState({ kind: 'done', message: 'E-mail confirmado. Obrigado!' }))
        .catch((error: unknown) => setState({ kind: 'error', message: authErrorMessage(error) }));
    }
  }, [mode, oobCode]);

  if (mode === 'signIn') return <EmailLinkCompletion next="/lobby" />;
  if (!oobCode) return <Result tone="error" message="Link inválido." />;
  if (mode !== 'resetPassword' && mode !== 'verifyEmail')
    return <Result tone="error" message="Ação desconhecida." />;

  async function onReset(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) return;
    setSaving(true);
    try {
      await confirmPasswordReset(firebaseAuth(), oobCode as string, password);
      setState({ kind: 'done', message: 'Palavra-passe alterada. Já podes entrar.' });
    } catch (error) {
      setState({ kind: 'error', message: authErrorMessage(error) });
    }
    setSaving(false);
  }

  switch (state.kind) {
    case 'loading':
      return (
        <div className="flex items-center justify-center gap-3 py-8 text-sm text-muted" role="status">
          <Spinner className="size-4" /> Um momento…
        </div>
      );
    case 'resetForm':
      return (
        <form onSubmit={onReset} className="flex flex-col gap-4">
          <p className="text-sm text-muted">
            Nova palavra-passe para <strong className="text-ivory">{state.email}</strong>
          </p>
          <Field
            label="Nova palavra-passe"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint="Mínimo 8 caracteres."
          />
          <Button type="submit" size="lg" loading={saving} disabled={password.length < 8}>
            Guardar
          </Button>
        </form>
      );
    case 'done':
      return <Result tone="success" message={state.message} />;
    case 'error':
      return <Result tone="error" message={state.message} />;
  }
}

function Result({ tone, message }: { tone: 'success' | 'error'; message: string }) {
  return (
    <div className="flex flex-col gap-4">
      <p
        role={tone === 'error' ? 'alert' : 'status'}
        className={
          tone === 'error'
            ? 'rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger'
            : 'rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm'
        }
      >
        {message}
      </p>
      <Link href="/login" className="font-semibold text-gold hover:text-gold-strong">
        Ir para entrar →
      </Link>
    </div>
  );
}
