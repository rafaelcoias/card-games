import clsx from 'clsx';

/** Square header button: an icon with an accessible label, an optional unread badge and an "on" state. */
export function IconButton({
  label,
  onClick,
  badge = 0,
  active = false,
  disabled = false,
  size = 'md',
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
  /** Highlights a live toggle (the microphone while it is on). */
  active?: boolean;
  disabled?: boolean;
  /** `lg` matches the height of large buttons (the room's share code). */
  size?: 'md' | 'lg';
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={clsx(
        'relative inline-flex items-center justify-center rounded-lg text-lg disabled:opacity-60',
        size === 'lg' ? 'size-12' : 'size-9',
        active ? 'bg-gold/20 text-gold hover:bg-gold/30' : 'hover:bg-white/10',
        className,
      )}
    >
      <span aria-hidden="true">{children}</span>
      {badge > 0 && (
        <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-danger px-1 text-[10px] font-bold leading-4 text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
