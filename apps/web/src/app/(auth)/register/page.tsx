import type { Metadata } from 'next';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: 'Criar conta' };

export default function RegisterPage() {
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Criar conta</h1>
      <p className="mt-1.5 text-sm text-muted">Um minuto e estás a baralhar.</p>
      <div className="mt-6">
        <RegisterForm />
      </div>
    </>
  );
}
