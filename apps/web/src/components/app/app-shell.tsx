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
import { GuestTag } from '@/components/players/player-link';
import { SocketProvider } from '@/lib/realtime/socket-provider';
import { ConnectionStatus } from './connection-status';
import { ProfileProvider } from './profile-context';
import { ResumeRoomBanner } from './resume-room-banner';

const NAV = [
  { href: '/lobby', label: 'Salas' },
  { href: '/players', label: 'Jogadores' },
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
              <NavLinks pathname={pathname} className="ml-2 hidden items-center gap-1 sm:flex" />
              <div className="ml-auto flex items-center gap-3">
                <ConnectionStatus />
                <Link
                  href="/profile"
                  className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-white/5"
                >
                  <Avatar name={profile.username} src={profile.avatarUrl} size={30} />
                  <span className="hidden text-sm font-medium sm:inline">{profile.username}</span>
                  {profile.guest && <GuestTag className="hidden sm:inline" />}
                </Link>
                <SignOutButton guest={profile.guest} />
              </div>
            </div>
            {/* Phones: the same links as a tab row under the header. */}
            <NavLinks
              pathname={pathname}
              className="grid grid-cols-3 gap-1 border-t border-line px-2 py-1.5 sm:hidden"
              itemClassName="text-center"
            />
          </header>
          <ResumeRoomBanner />
          <main className="flex-1">{children}</main>
        </div>
      </SocketProvider>
    </ProfileProvider>
  );
}

function NavLinks({
  pathname,
  className,
  itemClassName,
}: {
  pathname: string;
  className: string;
  itemClassName?: string;
}) {
  return (
    <nav aria-label="Principal" className={className}>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              active ? 'bg-white/8 text-ivory' : 'text-muted hover:text-ivory',
              itemClassName,
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
