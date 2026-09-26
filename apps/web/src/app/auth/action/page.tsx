import type { Metadata } from 'next';
import { ActionHandler } from '@/components/auth/action-handler';
import { Logo } from '@/components/ui/logo';

export const metadata: Metadata = { title: 'Conta' };

export default async function AuthActionPage({ searchParams }: PageProps<'/auth/action'>) {
  const params = await searchParams;
  const mode = typeof params.mode === 'string' ? params.mode : null;
  const oobCode = typeof params.oobCode === 'string' ? params.oobCode : null;
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="panel w-full max-w-[420px] p-6 sm:p-8">
        <h1 className="mb-4 font-display text-3xl font-semibold tracking-tight">
          {mode === 'resetPassword'
            ? 'Nova palavra-passe'
            : mode === 'verifyEmail'
              ? 'Confirmar e-mail'
              : 'Entrar'}
        </h1>
        <ActionHandler mode={mode} oobCode={oobCode} />
      </div>
    </main>
  );
}
