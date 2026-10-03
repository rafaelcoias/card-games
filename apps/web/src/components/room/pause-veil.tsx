'use client';

import type { GamePause, RoomState } from '@cardroom/shared';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/errors';
import type { RoomCommands } from '@/lib/realtime/socket-provider';
import { toast } from '@/lib/toast';

/** "1:45". */
const clock = (ms: number) => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;

/**
 * A table that stops for a player who dropped (core §2, UI §11): a dark veil
 * with who it waits for and for how long. Once the wait is over, the host
 * chooses to wait 2 more minutes or to end the match without a result.
 */
export function PauseVeil({
  pause,
  receivedAt,
  room,
  selfId,
  onDecide,
}: {
  pause: GamePause | null;
  /** `performance.now()` when the pause's message arrived (its time counts down from there). */
  receivedAt: number;
  room: Pick<RoomState, 'players' | 'hostId'>;
  selfId: string;
  onDecide: RoomCommands['decidePause'];
}) {
  const [now, setNow] = useState(() => performance.now());
  const [busy, setBusy] = useState<'WAIT' | 'END' | null>(null);
  useEffect(() => {
    if (!pause || pause.expired) return;
    const id = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [pause]);

  const decide = async (decision: 'WAIT' | 'END') => {
    setBusy(decision);
    const ack = await onDecide(decision);
    setBusy(null);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const missing = names(
    (pause?.playerIds ?? []).map((id) => room.players.find((p) => p.id === id)?.username ?? 'um jogador'),
  );
  const several = (pause?.playerIds.length ?? 0) > 1;
  const isHost = room.hostId === selfId;
  const left = pause ? pause.remainingMs - (now - receivedAt) : 0;

  return (
    <AnimatePresence>
      {pause && (
        <motion.div
          key="pause"
          className="absolute inset-0 z-[45] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          role="alertdialog"
          aria-label={`À espera de ${missing}`}
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface/95 px-6 py-5 text-center shadow-2xl">
            {pause.expired ? (
              <>
                <p className="font-display text-xl font-semibold">
                  {missing} ainda não {several ? 'voltaram' : 'voltou'}
                </p>
                {isHost ? (
                  <>
                    <p className="mt-1.5 text-sm text-muted">
                      Podes esperar mais um pouco, ou terminar a partida sem resultado (não conta para as
                      estatísticas de ninguém).
                    </p>
                    <div className="mt-4 flex flex-col gap-2 whitespace-nowrap sm:flex-row sm:justify-center">
                      <Button
                        onClick={() => void decide('WAIT')}
                        loading={busy === 'WAIT'}
                        disabled={busy !== null}
                      >
                        Esperar mais 2 min
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => void decide('END')}
                        loading={busy === 'END'}
                        disabled={busy !== null}
                      >
                        Terminar sem resultado
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="mt-1.5 text-sm text-muted">
                    O anfitrião decide se espera mais ou se termina a partida sem resultado.
                  </p>
                )}
              </>
            ) : (
              <>
                <p className="font-display text-xl font-semibold">
                  À espera de {missing}…{' '}
                  <span className="tabular-nums text-gold" aria-hidden="true">
                    {clock(left)}
                  </span>
                </p>
                <p className="mt-1.5 text-sm text-muted">
                  A mesa fica parada até {several ? 'voltarem' : 'voltar'}: ninguém joga por ninguém.
                </p>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
