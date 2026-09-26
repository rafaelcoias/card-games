import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/app-shell';
import { ServerUnavailable } from '@/components/app/server-unavailable';
import { loadMe } from '@/lib/auth/server-api';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const result = await loadMe();
  if (result.kind === 'signed-out') redirect('/login');
  if (result.kind === 'unavailable') return <ServerUnavailable />;
  if (!result.me.profile) redirect('/onboarding');
  return <AppShell profile={result.me.profile}>{children}</AppShell>;
}
