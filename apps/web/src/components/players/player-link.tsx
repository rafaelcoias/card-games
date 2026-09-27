import clsx from 'clsx';
import Link from 'next/link';
import type { ReactNode } from 'react';

export function playerHref(username: string): string {
  return `/players/${encodeURIComponent(username)}`;
}

/** Username that opens the player's public profile. */
export function PlayerLink({
  username,
  className,
  children,
}: {
  username: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Link
      href={playerHref(username)}
      className={clsx('rounded-sm hover:text-gold hover:underline hover:underline-offset-2', className)}
    >
      {children ?? username}
    </Link>
  );
}
