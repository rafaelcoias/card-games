'use client';

import { IconButton } from '@/components/ui/icon-button';
import { Spinner } from '@/components/ui/spinner';
import { useMicToggle } from '@/lib/voice/use-mic-toggle';

/** Voice chat toggle: off by default, highlighted while the microphone is live. */
export function MicButton({ size, className }: { size?: 'md' | 'lg'; className?: string }) {
  const { micOn, busy, toggle } = useMicToggle();
  return (
    <IconButton
      label={micOn ? 'Desligar microfone' : 'Ligar microfone'}
      onClick={toggle}
      active={micOn}
      disabled={busy}
      size={size}
      className={className}
    >
      {busy ? <Spinner className="size-4" /> : <MicIcon off={!micOn} className="size-5" />}
    </IconButton>
  );
}

export function MicIcon({ off = false, className }: { off?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="7" y="2.5" width="6" height="10" rx="3" />
      <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v2.5" />
      {off && <path d="M3.5 3l13 14" />}
    </svg>
  );
}
