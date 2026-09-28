'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { endSession } from '@/lib/firebase/client';

/** Signs out; a guest is warned first, because a guest session cannot be resumed. */
export function SignOutButton({ guest = false }: { guest?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const signOut = () => {
    setBusy(true);
    void endSession().then(() => {
      router.replace('/');
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => (guest ? setConfirming(true) : signOut())}
        className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-ivory disabled:opacity-50"
      >
        Sair
      </button>
      <Modal
        open={confirming}
        onClose={() => !busy && setConfirming(false)}
        title="Sair do modo convidado?"
        description="Sem conta, não há como voltar a esta sessão: o teu nome e o teu histórico ficam para trás."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Link
            href="/register"
            onClick={() => setConfirming(false)}
            className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold text-gold hover:bg-white/5"
          >
            Criar conta
          </Link>
          <Button variant="danger" onClick={signOut} loading={busy}>
            Sair mesmo assim
          </Button>
        </div>
      </Modal>
    </>
  );
}
