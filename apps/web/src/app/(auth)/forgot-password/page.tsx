import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Recuperar palavra-passe' };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Recuperar acesso</h1>
      <p className="mt-1.5 text-sm text-muted">Enviamos-te um link para definires uma nova palavra-passe.</p>
      <div className="mt-6">
        <ForgotPasswordForm />
      </div>
    </>
  );
}
