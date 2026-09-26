'use client';

import type { ProfileDto } from '@cardroom/shared';
import { CardSprite } from '@cardroom/ui';
import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { SignOutButton } from '@/components/auth/sign-out-button';
import { Avatar } from '@/components/ui/avatar';
import { Logo } from '@/components/ui/logo';
import { SocketProvider } from '@/lib/realtime/socket-provider';
import { ConnectionStatus } from './connection-status';
import { ProfileProvider } from './profile-context';
import { ResumeRoomBanner } from './resume-room-banner';

const NAV = [
  { href: '/lobby', label: 'Salas' },
  { href: '/profile', label: 'Perfil' },
];

export function AppShell({ profile, children }: { profile: ProfileDto; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ProfileProvider profile={profile}>
      <SocketProvider>
        <CardSprite />
        <div className="app-backdrop flex min-h-dvh flex-col">
          <header className="sticky top-0 z-30 border-b border-line bg-ink/75 backdrop-blur-md">
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
              <Logo href="/lobby" />
              <nav aria-label="Principal" className="ml-2 hidden items-center gap-1 sm:flex">
                {NAV.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={pathname.startsWith(item.href) ? 'page' : undefined}
                    className={clsx(
                      'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      pathname.startsWith(item.href)
                        ? 'bg-white/8 text-ivory'
                        : 'text-muted hover:text-ivory',
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <ConnectionStatus />
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-white/5"
                >
                  <Avatar name={profile.username} src={profile.avatarUrl} size={30} />
                  <span className="hidden text-sm font-medium sm:inline">{profile.username}</span>
                </Link>
                <SignOutButton />
              </div>
            </div>
          </header>
          <ResumeRoomBanner />
          <main className="flex-1">{children}</main>
        </div>
      </SocketProvider>
    </ProfileProvider>
  );
}
