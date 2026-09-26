import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ServerUnavailable } from '@/components/app/server-unavailable';
import { ProfileForm } from '@/components/profile/profile-form';
import { Logo } from '@/components/ui/logo';
import { loadMe } from '@/lib/auth/server-api';

export const metadata: Metadata = { title: 'Escolhe o teu nome' };

export default async function OnboardingPage() {
  const result = await loadMe();
  if (result.kind === 'signed-out') redirect('/login');
  if (result.kind === 'unavailable') return <ServerUnavailable />;
  if (result.me.profile) redirect('/lobby');

  return (
    <main className="app-backdrop flex min-h-dvh flex-col items-center px-4 py-10 sm:justify-center">
      <div className="mb-8">
        <Logo />
      </div>
      <div className="panel w-full max-w-[420px] p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Como te chamam à mesa?</h1>
        <p className="mt-1.5 text-sm text-muted">
          É o nome que os outros jogadores vão ver. Podes mudá-lo depois.
        </p>
        <div className="mt-6">
          <ProfileForm submitLabel="Começar a jogar" redirectTo="/lobby" />
        </div>
      </div>
    </main>
  );
}
