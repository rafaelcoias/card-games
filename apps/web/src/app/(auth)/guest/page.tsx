import type { Metadata } from 'next';
import { GuestForm } from '@/components/auth/guest-form';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Jogar como convidado' };

export default async function GuestPage({ searchParams }: PageProps<'/guest'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  return (
    <>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Jogar como convidado</h1>
      <p className="mt-1.5 text-sm text-muted">
        Sem conta nem palavra-passe: escolhe um nome e senta-te à mesa. Se criares conta mais tarde, ficas com
        o teu histórico.
      </p>
      <div className="mt-6">
        <GuestForm next={next} />
      </div>
    </>
  );
}
