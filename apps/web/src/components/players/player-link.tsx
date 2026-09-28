import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function playerHref(username: string): string {
  return `/players/${encodeURIComponent(username)}`;
}

/** Small tag after a guest's name: a temporary name, not an account. */
export function GuestTag({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'rounded-full bg-white/8 px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-subtle',
        className,
      )}
      title="Joga como convidado"
    >
      convidado
    </span>
  );
}

/** Username that opens the player's public profile (guests have none: plain name and a tag). */
export function PlayerLink({
  username,
  guest = false,
  className,
  children,
}: {
  username: string;
  guest?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  if (guest) {
    return (
      <span className={className}>
        {children ?? username} <GuestTag />
      </span>
    );
  }
  return (
    <Link
      href={playerHref(username)}
      className={clsx('rounded-sm hover:text-gold hover:underline hover:underline-offset-2', className)}
    >
      {children ?? username}
    </Link>
  );
}
