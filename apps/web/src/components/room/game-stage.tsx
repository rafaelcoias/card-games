'use client';

import type { MatchResult, RoomState } from '@cardroom/shared';
import { AnchorProvider, FlightLayer } from '@cardroom/ui';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { findGameClient } from '@/games/registry';
import { useSoundPreference } from '@/games/shared/sounds';
import { describeError } from '@/lib/errors';
import { gameFeed } from '@/lib/realtime/game-feed';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';
import { ChatPanel } from './chat-panel';

/** Full-screen table for a running match, with chat drawer and end-of-match results. */
export function GameStage({ room, selfId }: { room: RoomState; selfId: string }) {
  const router = useRouter();
  const commands = useRoomCommands();
  const result = useRealtime((s) => s.result);
  const unread = useRealtime((s) => s.unreadChat);
  const sound = useSoundPreference();
  const [chatOpen, setChatOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const game = findGameClient(room.gameId);
  const Table = game?.Table;

  const leave = async () => {
    const ack = await commands.leaveRoom();
    if (!ack.ok) {
      toast.error(describeError(ack.error));
      return;
    }
    useRealtime.getState().leaveRoom();
    gameFeed.reset();
    router.push('/lobby');
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-felt-deep">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 bg-black/35 px-3 backdrop-blur-sm">
        <span className="font-display text-lg font-semibold">{room.gameName}</span>
        <span className="rounded-md bg-black/30 px-2 py-0.5 font-mono text-xs tracking-[0.2em] text-ivory/70">
          {room.code}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton label={sound.enabled ? 'Desligar sons' : 'Ligar sons'} onClick={sound.toggle}>
            {sound.enabled ? '🔊' : '🔇'}
          </IconButton>
          <IconButton label="Chat" onClick={() => setChatOpen((o) => !o)} badge={chatOpen ? 0 : unread}>
            💬
          </IconButton>
          <Button size="sm" variant="ghost" onClick={() => setConfirmLeave(true)}>
            Sair
          </Button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <AnchorProvider>
          <FlightLayer>
            <LayoutGroup>
              {Table ? (
                <Table room={room} selfId={selfId} sendAction={commands.sendAction} />
              ) : (
                <p className="p-8">Jogo não suportado neste cliente.</p>
              )}
            </LayoutGroup>
          </FlightLayer>
        </AnchorProvider>

        <AnimatePresence>
          {chatOpen && (
            <motion.div
              className="absolute inset-y-0 right-0 z-50 w-full max-w-sm p-2"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <div className="relative h-full">
                <ChatPanel className="h-full" />
                <button
                  type="button"
                  onClick={() => setChatOpen(false)}
                  className="absolute right-3 top-2.5 rounded-lg px-2 text-muted hover:text-ivory"
                  aria-label="Fechar chat"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ResultsModal result={result} selfId={selfId} onClose={() => useRealtime.getState().setResult(null)} />

      <Modal
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        title="Sair da partida?"
        description="A partida continua sem ti: o servidor joga por ti a ação automática (apanhar a pilha) até ao fim."
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
            Ficar
          </Button>
          <Button variant="danger" onClick={() => void leave()}>
            Sair
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  badge = 0,
  children,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="relative inline-flex size-9 items-center justify-center rounded-lg text-lg hover:bg-white/10"
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

const MEDALS = ['🥇', '🥈', '🥉'];

function ResultsModal({
  result,
  selfId,
  onClose,
}: {
  result: MatchResult | null;
  selfId: string;
  onClose: () => void;
}) {
  const mine = result?.rankings.find((r) => r.playerId === selfId);
  const last = result?.rankings.at(-1);
  const title = !result
    ? ''
    : result.aborted
      ? 'Partida interrompida'
      : mine?.playerId === last?.playerId
        ? 'Ficaste em último…'
        : mine?.position === 1
          ? 'Ganhaste! 🎉'
          : `Terminaste em ${mine?.position ?? '?'}.º`;

  return (
    <Modal
      open={result !== null}
      onClose={onClose}
      title={title}
      description={
        result?.aborted
          ? 'Todos os jogadores restantes saíram.'
          : last
            ? `${last.playerId === selfId ? 'Tu começas' : `${last.username} começa`} a próxima partida.`
            : undefined
      }
    >
      {result && !result.aborted && (
        <ol className="flex flex-col gap-2">
          {result.rankings.map((r) => (
            <li
              key={r.playerId}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${r.playerId === selfId ? 'bg-gold/15' : 'bg-surface-2'}`}
            >
              <span className="w-8 text-lg" aria-hidden="true">
                {MEDALS[r.position - 1] ?? ''}
              </span>
              <span className="w-8 tabular-nums text-subtle">{r.position}.º</span>
              <span className="font-medium">{r.username}</span>
              {r.playerId === last?.playerId && <span className="ml-auto text-xs text-danger">perdeu</span>}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Voltar à sala</Button>
      </div>
    </Modal>
  );
}
