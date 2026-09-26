import clsx from 'clsx';

const PALETTE = ['#2f6f4f', '#8b3a3a', '#3a5a8b', '#7a5a1e', '#5b3a7a', '#1e6b6b', '#8b5a3a', '#4a6b2a'];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length] as string;
}

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  dimmed?: boolean;
}

/** Profile picture with a deterministic initials fallback. */
export function Avatar({ name, src, size = 40, className, dimmed }: AvatarProps) {
  return (
    <span
      className={clsx(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-ivory ring-2 ring-black/30',
        dimmed && 'opacity-50 grayscale',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name) }}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary user-provided hosts
        <img src={src} alt="" className="size-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        name.slice(0, 2).toUpperCase()
      )}
    </span>
  );
}
