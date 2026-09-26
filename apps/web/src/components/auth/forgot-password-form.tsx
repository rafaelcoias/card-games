'use client';

import { sendPasswordResetEmail } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { publicEnv } from '@/lib/env';
import { firebaseAuth } from '@/lib/firebase/client';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    await sendPasswordResetEmail(firebaseAuth(), email.trim(), {
      url: new URL('/login', publicEnv.siteUrl).toString(),
    }).catch(() => undefined);
    // Same answer whether or not the account exists (no account enumeration).
    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/10 p-4 text-sm leading-relaxed">
        Se existir uma conta para <strong>{email}</strong>, vais receber um e-mail com o link.
      </div>
    );
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
      <Button type="submit" size="lg" loading={loading}>
        Enviar link
      </Button>
    </form>
  );
}
