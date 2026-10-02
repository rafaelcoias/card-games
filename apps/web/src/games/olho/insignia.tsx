import type { Role } from '@cardroom/olho';
import clsx from 'clsx';
import { ROLE_LABEL } from './copy';

/** Badge colours per role: gold and silver at the top, grey in the middle, deep red at the bottom. */
const TONE: Readonly<Record<Role, string>> = {
  PRESIDENTE: 'bg-[#3a2c0c] text-gold ring-gold/70',
  VICE_PRESIDENTE: 'bg-[#2a2f33] text-[#d7dde2] ring-[#c3cbd2]/60',
  NEUTRO: 'bg-black/50 text-ivory/60 ring-white/20',
  VICE_OLHO: 'bg-[#3a1717] text-[#f2a3a3] ring-[#f0686b]/45',
  OLHO: 'bg-[#4a1212] text-[#ffb4b4] ring-[#f0686b]/80',
};

function Glyph({ role }: { role: Role }) {
  switch (role) {
    case 'PRESIDENTE':
      return (
        <path
          d="M3 17h18l-1.6-9.2-4.6 4-2.8-6.3-2.8 6.3-4.6-4z M4 19.2h16"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      );
    case 'VICE_PRESIDENTE':
      return (
        <path
          d="M6 16h12l-1.2-6.4-3.3 2.8L12 8l-1.5 4.4-3.3-2.8z M7 18h10"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      );
    case 'NEUTRO':
      return <circle cx="12" cy="12" r="4.6" fill="currentColor" />;
    case 'VICE_OLHO':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <path d="M7 12c1.6-2.4 3.2-3.4 5-3.4s3.4 1 5 3.4c-1.6 2.4-3.2 3.4-5 3.4S8.6 14.4 7 12z" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </g>
      );
    case 'OLHO':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2.5 12c2.8-4.4 5.9-6.4 9.5-6.4s6.7 2 9.5 6.4c-2.8 4.4-5.9 6.4-9.5 6.4S5.3 16.4 2.5 12z" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" stroke="none" />
        </g>
      );
  }
}

/** The insignia of a role (UI §1): discreet, round, with the role as its accessible name. */
export function RoleBadge({ role, size = 20, className }: { role: Role; size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label={ROLE_LABEL[role]}
      title={ROLE_LABEL[role]}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center rounded-full ring-1',
        TONE[role],
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.72} height={size * 0.72} aria-hidden="true">
        <Glyph role={role} />
      </svg>
    </span>
  );
}

/** Insignia and name, for tables and summaries. */
export function RoleTag({ role, className }: { role: Role | null; className?: string }) {
  if (!role) return <span className={clsx('text-xs text-subtle', className)}>sem cargo</span>;
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <RoleBadge role={role} size={18} />
      <span className="text-xs font-semibold">{ROLE_LABEL[role]}</span>
    </span>
  );
}
