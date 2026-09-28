import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/app-shell';
import { ServerUnavailable } from '@/components/app/server-unavailable';
import { loadMe, needsUsername } from '@/lib/auth/server-api';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const result = await loadMe();
  if (result.kind === 'signed-out') redirect('/login');
  if (result.kind === 'unavailable') return <ServerUnavailable />;
  // No profile yet, or a guest who just created an account and has to claim a username.
  if (!result.me.profile || needsUsername(result.me)) redirect('/onboarding');
  return <AppShell profile={result.me.profile}>{children}</AppShell>;
}
