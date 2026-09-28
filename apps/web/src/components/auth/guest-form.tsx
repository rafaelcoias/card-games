'use client';

import { usernameSchema } from '@cardroom/shared';
import { signInAnonymously } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { ApiError } from '@/lib/api';
import { browserApi } from '@/lib/auth/client-token';
import { establishSession, firebaseAuth } from '@/lib/firebase/client';
import { authErrorMessage } from '@/lib/firebase/errors';

/**
 * Play without an account: Firebase signs the visitor in anonymously (so the
 * session, the room links and the game server work as for everyone) and the
 * name they pick is used only while they play.
 */
export function GuestForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = usernameSchema.safeParse(name);
    if (!parsed.success) {
      setError('Usa 3 a 20 letras, números ou _ (sem espaços).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const auth = firebaseAuth();
      await auth.authStateReady();
      // A guest coming back to this form keeps the same identity (and history).
      const user = auth.currentUser?.isAnonymous ? auth.currentUser : (await signInAnonymously(auth)).user;
      await establishSession(user);
      await browserApi.updateProfile({ username: parsed.data, avatarUrl: null });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'USERNAME_TAKEN'
          ? 'Esse nome pertence a um jogador com conta. Escolhe outro.'
          : err instanceof ApiError
            ? 'Não foi possível entrar. Tenta de novo.'
            : authErrorMessage(err, 'Não foi possível entrar como convidado.'),
      );
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="Nome para esta sessão"
        autoComplete="nickname"
        autoFocus
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        hint="3 a 20 caracteres: letras, números ou _"
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={loading}>
        Jogar como convidado
      </Button>
      <p className="text-center text-sm text-muted">
        Preferes guardar o teu nome e o histórico?{' '}
        <Link href="/register" className="font-semibold text-gold hover:text-gold-strong">
          Criar conta
        </Link>
      </p>
    </form>
  );
}
