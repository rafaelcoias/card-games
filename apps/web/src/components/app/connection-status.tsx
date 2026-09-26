'use client';

import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';

/** Small live indicator + blocking dialog when another tab took over the session. */
export function ConnectionStatus() {
  const status = useRealtime((s) => s.status);
  const { reconnect } = useRoomCommands();
  const label =
    status === 'connected'
      ? 'Ligado'
      : status === 'reconnecting'
        ? 'A religar…'
        : status === 'replaced'
          ? 'Sessão noutro separador'
          : 'A ligar…';
  const tone =
    status === 'connected' ? 'bg-success' : status === 'replaced' ? 'bg-danger' : 'bg-gold animate-pulse';

  return (
    <>
      <span className="flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
        <span className={`size-2 rounded-full ${tone}`} aria-hidden="true" />
        <span className="hidden md:inline">{label}</span>
      </span>
      <Modal
        open={status === 'replaced'}
        title="Estás a jogar noutro separador"
        description="Só pode haver uma ligação ativa por jogador. Queres continuar aqui?"
      >
        <div className="flex justify-end">
          <Button onClick={reconnect}>Usar este separador</Button>
        </div>
      </Modal>
    </>
  );
}
