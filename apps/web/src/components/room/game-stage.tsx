'use client';

import type { MatchResult, PlayerStanding, RoomState } from '@cardroom/shared';
import { AnchorProvider, FlightLayer } from '@cardroom/ui';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { findGameClient } from '@/games/registry';
import { formatScore, signedChips } from '@/games/score';
import type { GameClientDefinition, ResultStyle } from '@/games/types';
import { useSoundPreference } from '@/games/shared/sounds';
import { describeError } from '@/lib/errors';
import { gameFeed } from '@/lib/realtime/game-feed';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';
import { ChatBubbles } from './chat-bubbles';
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
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [ending, setEnding] = useState(false);
  // After the final result there is nothing to abandon: leave without asking.
  const matchOver = result !== null;
  const game = findGameClient(room.gameId);
  const Table = game?.Table;
  const shownResult = useDelayed(result, game?.resultDelayMs ?? 0);
  // A session table (blackjack) is left like a café table, and only the host closes it.
  const session = room.lifecycle === 'SESSION';
  const leaveLabel = session ? 'Sair da mesa' : 'Sair da partida';

  const endSession = async () => {
    setEnding(true);
    const ack = await commands.endMatch();
    setEnding(false);
    setConfirmEnd(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const leave = async () => {
    setLeaving(true);
    const ack = await commands.leaveRoom();
    setLeaving(false);
    if (!ack.ok) {
      toast.error(describeError(ack.error));
      return;
    }
    setConfirmLeave(false);
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
          {session && room.hostId === selfId && !matchOver && (
            <Button size="sm" variant="secondary" onClick={() => setConfirmEnd(true)}>
              Terminar<span className="hidden sm:inline">&nbsp;sessão</span>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => (matchOver ? void leave() : setConfirmLeave(true))}
            aria-label={leaveLabel}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M13 13l3-3-3-3M16 10H8" />
            </svg>
            <span className="sm:hidden">Sair</span>
            <span className="hidden sm:inline">{leaveLabel}</span>
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

        <ChatBubbles selfId={selfId} chatOpen={chatOpen} onOpenChat={() => setChatOpen(true)} />

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

      <ResultsModal
        result={shownResult}
        style={game?.resultStyle ?? 'placement'}
        game={game}
        selfId={selfId}
        leaving={leaving}
        onClose={() => useRealtime.getState().setResult(null)}
        onLeave={() => void leave()}
      />

      <Modal
        open={confirmLeave}
        onClose={() => !leaving && setConfirmLeave(false)}
        title={`${leaveLabel}?`}
        description={
          session ? (
            <>
              Se tiveres cartas na mesa, as tuas mãos ficam e são pagas normalmente. O teu saldo conta para o
              resultado da sessão, e podes voltar à mesa enquanto houver lugar.
            </>
          ) : (
            <>
              A partida continua sem ti: a partir de agora o servidor faz as jogadas automáticas por ti até ao
              fim, por isso é quase certo ficares em <strong className="text-ivory">último lugar</strong>.
            </>
          )
        }
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmLeave(false)} disabled={leaving}>
            Continuar a jogar
          </Button>
          <Button variant="danger" onClick={() => void leave()} loading={leaving}>
            {leaveLabel}
          </Button>
        </div>
      </Modal>

      <Modal
        open={confirmEnd}
        onClose={() => !ending && setConfirmEnd(false)}
        title="Terminar a sessão?"
        description="A ronda em curso acaba normalmente; depois a mesa fecha e cada um fica com o seu saldo."
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setConfirmEnd(false)} disabled={ending}>
            Continuar
          </Button>
          <Button variant="danger" onClick={() => void endSession()} loading={ending}>
            Terminar sessão
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

/** `value` once it has been set for `delayMs` (goes back to `null` immediately). */
function useDelayed<T>(value: T | null, delayMs: number): T | null {
  const [matured, setMatured] = useState<T | null>(null);
  useEffect(() => {
    if (value === null || delayMs === 0) return;
    const timer = window.setTimeout(() => setMatured(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  if (value === null || delayMs === 0) return value;
  return matured === value ? value : null;
}

const MEDALS = ['🥇', '🥈', '🥉'];

interface ResultsModalProps {
  result: MatchResult | null;
  style: ResultStyle;
  game: GameClientDefinition | undefined;
  selfId: string;
  leaving: boolean;
  onClose: () => void;
  onLeave: () => void;
}

function ResultsModal({ result, style, game, selfId, leaving, onClose, onLeave }: ResultsModalProps) {
  const standings = result?.standings ?? [];
  const mine = standings.find((s) => s.playerId === selfId);
  const losers = standings.filter((s) => s.outcome === 'LOSER');
  const name = (s: PlayerStanding) => (s.playerId === selfId ? 'Tu' : s.username);

  let title = '';
  let description: string | undefined;
  if (style === 'chips') {
    const net = mine?.score ?? 0;
    title = !mine
      ? 'Sessão terminada'
      : net > 0
        ? `Ficaste a ganhar ${net}! 🎉`
        : net < 0
          ? `Ficaste a perder ${-net}`
          : 'Ficaste como começaste';
    description = result?.aborted
      ? 'Ninguém chegou a jogar uma ronda.'
      : 'Saldo de cada um, com as recompras descontadas. Fichas virtuais, sem valor real.';
  } else if (result?.aborted) title = 'Partida interrompida';
  else if (style === 'survival') title = mine?.outcome === 'LOSER' ? 'Perdeste…' : 'Sobreviveste! 🎉';
  else if (mine?.outcome === 'LOSER') title = 'Ficaste em último…';
  else if (mine?.outcome === 'WINNER')
    title =
      standings.filter((s) => s.outcome === 'WINNER').length > 1 ? 'Empate — ganhaste! 🎉' : 'Ganhaste! 🎉';
  else if (result) title = `Terminaste em ${mine?.position ?? '?'}.º`;

  const nextStarter =
    losers.length === 1
      ? `${name(losers[0] as PlayerStanding)} ${losers[0]?.playerId === selfId ? 'começas' : 'começa'} a próxima partida.`
      : losers.length > 1
        ? 'Um dos perdedores, à sorte, começa a próxima partida.'
        : game?.resultNote;

  return (
    <Modal
      open={result !== null}
      onClose={onClose}
      title={title}
      description={description ?? (result?.aborted ? 'Todos os jogadores restantes saíram.' : nextStarter)}
    >
      {result && !result.aborted && style === 'chips' && (
        <ol className="flex flex-col gap-2">
          {standings.map((s) => {
            const score = s.score ?? 0;
            return (
              <li
                key={s.playerId}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${s.playerId === selfId ? 'bg-gold/15' : 'bg-surface-2'}`}
              >
                <span className="w-8 tabular-nums text-subtle">{s.position}.º</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s.username}
                  {s.playerId === selfId && <span className="text-subtle"> (tu)</span>}
                </span>
                <span
                  className={`font-semibold tabular-nums ${score > 0 ? 'text-success' : score < 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {signedChips(score)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {result && !result.aborted && style === 'placement' && (
        <ol className="flex flex-col gap-2">
          {standings.map((s) => (
            <li
              key={s.playerId}
              className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${s.playerId === selfId ? 'bg-gold/15' : 'bg-surface-2'}`}
            >
              <span className="w-8 text-lg" aria-hidden="true">
                {MEDALS[(s.position ?? 0) - 1] ?? ''}
              </span>
              <span className="w-8 tabular-nums text-subtle">{s.position}.º</span>
              <span className="font-medium">{s.username}</span>
              {game?.scoreUnit && s.score !== undefined && (
                <span className="ml-auto text-sm tabular-nums text-muted">{formatScore(game, s.score)}</span>
              )}
              {s.outcome === 'LOSER' && <span className="ml-auto text-xs text-danger">perdeu</span>}
            </li>
          ))}
        </ol>
      )}
      {result && !result.aborted && style === 'survival' && (
        <div className="flex flex-col gap-4">
          <SurvivalGroup
            title={losers.length === 1 ? 'Perdeu' : 'Perderam'}
            tone="loser"
            standings={losers}
            selfId={selfId}
          />
          <SurvivalGroup
            title="Sobreviveram"
            tone="survivor"
            standings={standings.filter((s) => s.outcome !== 'LOSER')}
            selfId={selfId}
          />
        </div>
      )}
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onLeave} loading={leaving}>
          Voltar ao lobby
        </Button>
        <Button onClick={onClose}>Voltar à sala</Button>
      </div>
    </Modal>
  );
}

/** Losers (highlighted, with their points) or survivors of a game without winners. */
function SurvivalGroup({
  title,
  tone,
  standings,
  selfId,
}: {
  title: string;
  tone: 'loser' | 'survivor';
  standings: PlayerStanding[];
  selfId: string;
}) {
  if (standings.length === 0) return null;
  return (
    <section>
      <h3
        className={`mb-2 text-xs font-bold uppercase tracking-[0.14em] ${tone === 'loser' ? 'text-danger' : 'text-success'}`}
      >
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5">
        {standings.map((s) => (
          <li
            key={s.playerId}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${
              tone === 'loser' ? 'bg-danger/12 ring-1 ring-danger/40' : 'bg-surface-2'
            } ${s.playerId === selfId ? 'font-semibold' : ''}`}
          >
            <span aria-hidden="true">{tone === 'loser' ? '💀' : '🛡️'}</span>
            <span className="min-w-0 flex-1 truncate">
              {s.username}
              {s.playerId === selfId && <span className="text-subtle"> (tu)</span>}
            </span>
            <span className={`tabular-nums ${tone === 'loser' ? 'text-danger' : 'text-muted'}`}>
              {s.score ?? 0} {s.score === 1 ? 'ponto' : 'pontos'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
