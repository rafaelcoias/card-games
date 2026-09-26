'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { endSession } from '@/lib/firebase/client';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void endSession().then(() => {
          router.replace('/');
          router.refresh();
        });
      }}
      className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ivory disabled:opacity-50"
    >
      Sair
    </button>
  );
}
