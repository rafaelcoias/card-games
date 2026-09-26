import type { Metadata } from 'next';
import { EmailLinkCompletion } from '@/components/auth/email-link';
import { Logo } from '@/components/ui/logo';
import { safeNextPath } from '@/lib/navigation';

export const metadata: Metadata = { title: 'Entrar com link' };

export default async function EmailLinkPage({ searchParams }: PageProps<'/auth/email-link'>) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === 'string' ? params.next : null);
  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="panel w-full max-w-[420px] p-6 sm:p-8">
        <h1 className="mb-4 font-display text-3xl font-semibold tracking-tight">Entrar com link</h1>
        <EmailLinkCompletion next={next} />
      </div>
    </main>
  );
}
