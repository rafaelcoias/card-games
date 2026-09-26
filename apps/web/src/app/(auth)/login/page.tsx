import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getServerSession } from '@/lib/auth/session';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Entrar' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  if (await getServerSession()) redirect(next);

  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Bem-vindo de volta</h1>
      <p className="mt-1.5 text-sm text-muted">Entra para te sentares à mesa.</p>
      <div className="mt-6">
        <LoginForm next={next} />
      </div>
    </>
  );
}
