'use client';

import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { publicEnv } from '@/lib/env';
import { establishSession, firebaseAuth } from '@/lib/firebase/client';
import { authErrorMessage } from '@/lib/firebase/errors';

export function RegisterForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      setError('A palavra-passe precisa de pelo menos 8 caracteres.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { user } = await createUserWithEmailAndPassword(firebaseAuth(), email.trim(), password);
      // Confirmation e-mail is courtesy only: playing does not require it.
      void sendEmailVerification(user, { url: new URL('/lobby', publicEnv.siteUrl).toString() }).catch(
        () => undefined,
      );
      await establishSession(user);
      router.replace('/onboarding');
      router.refresh();
    } catch (err) {
      setError(authErrorMessage(err, 'Não foi possível criar a conta.'));
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Field
        label="E-mail"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Palavra-passe"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        hint="Mínimo 8 caracteres."
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" loading={loading}>
        Criar conta
      </Button>
      <p className="text-center text-sm text-muted">
        Já tens conta?{' '}
        <Link href="/login" className="font-semibold text-gold hover:text-gold-strong">
          Entrar
        </Link>
      </p>
    </form>
  );
}
