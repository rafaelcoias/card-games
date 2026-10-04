'use client';

import type { MatchResult, PlayerStanding, RoomPlayer, RoomState } from '@cardroom/shared';
import { AnchorProvider, FlightLayer } from '@cardroom/ui';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Modal } from '@/components/ui/modal';
import { findGameClient } from '@/games/registry';
import { formatScore, signedChips, signedPoints } from '@/games/score';
import type { GameClientDefinition, ResultStyle } from '@/games/types';
import { useSoundPreference } from '@/games/shared/sounds';
import { useLatestGameView } from '@/games/shared/use-game-view';
import { describeError } from '@/lib/errors';
import { gameFeed } from '@/lib/realtime/game-feed';
import { CLOSED_MESSAGE, useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';
import { ChatBubbles } from './chat-bubbles';
import { ChatPanel } from './chat-panel';
import { MicButton } from './mic-button';
import { PauseVeil } from './pause-veil';

/** Full-screen table for a running match, with chat drawer and end-of-match results. */
export function GameStage({ room, selfId }: { room: RoomState; selfId: string }) {
  const router = useRouter();
  const commands = useRoomCommands();
  const result = useRealtime((s) => s.result);
  const closed = useRealtime((s) => s.closed);
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
  const table = useMemo(() => tableRoom(room, result), [room, result]);
  const shownResult = useDelayed(result, game?.resultDelayMs ?? 0);
  // A session table (blackjack) is left like a café table, and only the host closes it.
  const session = room.lifecycle === 'SESSION';
  const leaveLabel = session ? 'Sair da mesa' : 'Sair da partida';
  // Some games close the chat while a hand is played, and stop for a player who dropped.
  const live = useLatestGameView();
  const current = !matchOver && live !== null && live.matchId === room.matchId ? live : null;
  const chatLocked = current !== null && !current.chatOpen;
  const pause = current?.pause ?? null;
  const pauseArrival = current ? gameFeed.arrivalOf(current) : 0;

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

  /**
   * From the results to the room's lobby — or to the list of rooms, if the
   * room closed meanwhile. A host who had asked for a rematch takes it back:
   * in the lobby they start the match themselves.
   */
  const backToRoom = () => {
    if (closed) {
      void leave();
      return;
    }
    const me = room.players.find((p) => p.id === selfId);
    if (room.hostId === selfId && me?.ready) void commands.setReady(false);
    useRealtime.getState().setResult(null);
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-felt-deep">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-black/30 bg-black/35 px-3 backdrop-blur-sm">
        <span className="font-display text-lg font-semibold">{room.gameName}</span>
        <span className="rounded-md bg-black/30 px-2 py-0.5 font-mono text-xs tracking-[0.2em] text-ivory/70">
          {room.code}
        </span>
        <NextMatchQueue players={room.players.filter((p) => p.waiting)} />
        <div className="ml-auto flex items-center gap-1">
          <MicButton />
          <IconButton label={sound.enabled ? 'Desligar sons' : 'Ligar sons'} onClick={sound.toggle}>
            {sound.enabled ? '🔊' : '🔇'}
          </IconButton>
          <IconButton
            label={chatLocked ? 'Chat fechado: abre no fim da mão' : 'Chat'}
            onClick={() => setChatOpen((o) => !o)}
            badge={chatOpen || chatLocked ? 0 : unread}
            className={chatLocked ? 'opacity-60 grayscale' : undefined}
          >
            {chatLocked ? '🔒' : '💬'}
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
                <Table room={table} selfId={selfId} sendAction={commands.sendAction} />
              ) : (
                <p className="p-8">Jogo não suportado neste cliente.</p>
              )}
            </LayoutGroup>
          </FlightLayer>
        </AnchorProvider>

        <PauseVeil
          pause={pause}
          receivedAt={pauseArrival}
          room={room}
          selfId={selfId}
          onDecide={commands.decidePause}
        />

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
                <ChatPanel className="h-full" locked={chatLocked} />
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
        room={room}
        selfId={selfId}
        leaving={leaving}
        onClose={backToRoom}
        onLeave={() => void leave()}
      />

      <Modal
        open={confirmLeave}
        onClose={() => !leaving && setConfirmLeave(false)}
        title={`${leaveLabel}?`}
        description={
          session && game?.resultStyle === 'points' ? (
            <>
              Se estiveres a meio de um jogo, passas daqui em diante e ficas com o pior lugar ainda livre. Os
              teus pontos contam para o resultado da sessão, e podes voltar à mesa enquanto houver lugar.
            </>
          ) : session ? (
            <>
              Se tiveres cartas na mesa, as tuas mãos ficam e são pagas normalmente. O teu saldo conta para o
              resultado da sessão, e podes voltar à mesa enquanto houver lugar.
            </>
          ) : game?.pausesForMissing && room.hostId === selfId ? (
            <>
              A mesa não joga sem ti: a partida termina já,{' '}
              <strong className="text-ivory">sem resultado</strong>, e a sala fecha.
            </>
          ) : game?.pausesForMissing ? (
            <>
              A mesa fica parada à tua espera. Se não voltares a tempo, o anfitrião pode terminar a partida
              sem resultado.
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
        description={
          game?.resultStyle === 'points'
            ? 'A mesa fecha já: o jogo em curso não conta, e a classificação fica com os pontos dos jogos terminados.'
            : 'A ronda em curso acaba normalmente; depois a mesa fecha e cada um fica com o seu saldo.'
        }
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

/**
 * The room as the table sees it: the match's players only. Whoever came in
 * meanwhile stays off it (tables size themselves on their players), also
 * while the results show and they no longer wait.
 */
function tableRoom(room: RoomState, result: MatchResult | null): RoomState {
  const played = result?.standings.length ? new Set(result.standings.map((s) => s.playerId)) : null;
  const players = room.players.filter((p) => (played ? played.has(p.id) : !p.waiting));
  return players.length === room.players.length ? room : { ...room, players };
}

/** Whoever came in during the match: the table sees they are in for the next one. */
function NextMatchQueue({ players }: { players: RoomPlayer[] }) {
  if (players.length === 0) return null;
  const names = new Intl.ListFormat('pt-PT', { type: 'conjunction' }).format(players.map((p) => p.username));
  const label = `${names} ${players.length === 1 ? 'espera' : 'esperam'} pela próxima partida`;
  return (
    <span className="rounded-md bg-black/30 px-2 py-0.5 text-xs text-ivory/70" title={label}>
      <span aria-hidden="true">
        +{players.length}
        <span className="hidden sm:inline"> na próxima</span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
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
  room: RoomState;
  selfId: string;
  leaving: boolean;
  onClose: () => void;
  onLeave: () => void;
}

function ResultsModal({ result, style, game, room, selfId, leaving, onClose, onLeave }: ResultsModalProps) {
  const closed = useRealtime((s) => s.closed);
  const standings = result?.standings ?? [];
  const mine = standings.find((s) => s.playerId === selfId);
  const losers = standings.filter((s) => s.outcome === 'LOSER');
  const name = (s: PlayerStanding) => (s.playerId === selfId ? 'Tu' : s.username);

  let title = '';
  let description: string | undefined;
  if (result?.aborted && result.abortReason === 'HOST_ENDED') {
    title = 'Partida terminada sem resultado';
    description = 'O anfitrião terminou a partida: não conta para as estatísticas de ninguém.';
  } else if (style === 'teams') {
    const winners = standings.filter((s) => s.outcome === 'WINNER');
    const losers = standings.filter((s) => s.outcome === 'LOSER');
    const score = `${winners[0]?.score ?? 0} a ${losers[0]?.score ?? 0}`;
    title = result?.aborted
      ? 'Partida interrompida'
      : mine?.outcome === 'WINNER'
        ? 'Ganhámos! 🎉'
        : mine?.outcome === 'LOSER'
          ? 'Perdemos…'
          : 'Fim da partida';
    description = result?.aborted
      ? 'Todos os jogadores saíram.'
      : `Ganharam ${winners.map((s) => (s.playerId === selfId ? 'tu' : s.username)).join(' e ')} — ${score}`;
  } else if (style === 'chips') {
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
  } else if (style === 'points') {
    const winners = standings.filter((s) => s.outcome === 'WINNER').length;
    title = result?.aborted
      ? 'Sessão terminada'
      : !mine
        ? 'Sessão terminada'
        : mine.outcome === 'WINNER'
          ? winners > 1
            ? 'Empate no topo — ganhaste! 🎉'
            : 'Ganhaste a sessão! 🎉'
          : mine.outcome === 'LOSER'
            ? 'Ficaste em último…'
            : `Terminaste em ${mine.position ?? '?'}.º`;
    description = result?.aborted
      ? 'Nenhum jogo chegou ao fim.'
      : 'Pontos por jogo: Presidente +2 · Vice-Presidente +1 · Neutro 0 · Vice-olho −1 · Olho −2.';
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
      {result && !result.aborted && style === 'points' && (
        <ol className="flex flex-col gap-2">
          {standings.map((s) => {
            const score = s.score ?? 0;
            return (
              <li
                key={s.playerId}
                className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${s.playerId === selfId ? 'bg-gold/15' : 'bg-surface-2'}`}
              >
                <span className="w-6 text-lg" aria-hidden="true">
                  {s.outcome === 'WINNER' ? '👑' : s.outcome === 'LOSER' ? '👁️' : ''}
                </span>
                <span className="w-8 tabular-nums text-subtle">{s.position}.º</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s.username}
                  {s.playerId === selfId && <span className="text-subtle"> (tu)</span>}
                </span>
                <span
                  className={`font-semibold tabular-nums ${score > 0 ? 'text-success' : score < 0 ? 'text-danger' : 'text-muted'}`}
                >
                  {signedPoints(score)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {result && !result.aborted && style === 'teams' && (
        <TeamsStandings standings={standings} selfId={selfId} />
      )}
      {result && !result.aborted && game?.ResultDetails && (
        <game.ResultDetails result={result} selfId={selfId} />
      )}
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
      {closed ? (
        <>
          <p
            className="mt-5 rounded-xl border border-line bg-white/3 px-4 py-3 text-sm text-muted"
            role="status"
          >
            {CLOSED_MESSAGE[closed]}
          </p>
          <div className="mt-5 flex justify-end">
            <Button onClick={onLeave} loading={leaving} className="max-sm:w-full">
              Voltar às salas
            </Button>
          </div>
        </>
      ) : (
        <Rematch
          room={room}
          game={game}
          selfId={selfId}
          leaving={leaving}
          onClose={onClose}
          onLeave={onLeave}
        />
      )}
    </Modal>
  );
}

/**
 * "Jogar outra vez" straight from the results: everyone sees who is in, and
 * the next match starts by itself once the whole table is (UI: no trip back
 * to the lobby, no "Estou pronto").
 */
function Rematch({
  room,
  game,
  selfId,
  leaving,
  onClose,
  onLeave,
}: {
  room: RoomState;
  game: GameClientDefinition | undefined;
  selfId: string;
  leaving: boolean;
  onClose: () => void;
  onLeave: () => void;
}) {
  const commands = useRoomCommands();
  const [sending, setSending] = useState(false);
  const me = room.players.find((p) => p.id === selfId);
  const inForRematch = me?.ready === true;
  const missing = room.players.filter((p) => !p.ready);
  const tooFew = room.players.length < (game?.minPlayers ?? 2);

  const toggle = async () => {
    setSending(true);
    const ack = await commands.setReady(!inForRematch);
    setSending(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const status = tooFew
    ? 'Faltam jogadores para outra partida: volta à sala e partilha o código.'
    : !inForRematch
      ? 'Começa sozinha quando todos quiserem jogar outra vez.'
      : missing.length > 0
        ? `À espera de ${missing.map((p) => (p.id === selfId ? 'ti' : p.username)).join(', ')}…`
        : 'A começar…';

  return (
    <>
      {/* A label, not a heading: the dialog keeps a single title (the result). */}
      <section className="mt-5 rounded-xl bg-white/3 px-4 py-3" aria-labelledby="rematch-label">
        <p id="rematch-label" className="text-xs font-bold uppercase tracking-[0.14em] text-subtle">
          Jogar outra vez
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {room.players.map((p) => (
            <li
              key={p.id}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                p.ready ? 'bg-success/15 text-success' : 'bg-white/5 text-muted'
              }`}
            >
              <span aria-hidden="true">{p.ready ? '✓' : '…'}</span>
              {p.id === selfId ? 'Tu' : p.username}
              <span className="sr-only">{p.ready ? ' quer jogar outra vez' : ' ainda não respondeu'}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-subtle" role="status">
          {status}
        </p>
      </section>
      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={onLeave} loading={leaving}>
          Sair da sala
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Voltar à sala
        </Button>
        <Button
          variant={inForRematch ? 'secondary' : 'primary'}
          onClick={() => void toggle()}
          loading={sending}
          disabled={tooFew && !inForRematch}
        >
          {inForRematch ? 'Afinal, não' : 'Jogar outra vez'}
        </Button>
      </div>
    </>
  );
}

/** The two pairs of a team game, winners first, each with its games. */
function TeamsStandings({ standings, selfId }: { standings: PlayerStanding[]; selfId: string }) {
  const pairs = (['WINNER', 'LOSER'] as const).map((outcome) =>
    standings.filter((s) => s.outcome === outcome),
  );
  return (
    <ol className="flex flex-col gap-2">
      {pairs.map((pair, i) => {
        if (pair.length === 0) return null;
        const won = i === 0;
        const mine = pair.some((s) => s.playerId === selfId);
        const games = pair[0]?.score ?? 0;
        return (
          <li
            key={won ? 'winners' : 'losers'}
            className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${mine ? 'bg-gold/15' : 'bg-surface-2'}`}
          >
            <span className="w-6 text-lg" aria-hidden="true">
              {won ? '🏆' : ''}
            </span>
            <span className="min-w-0 flex-1 truncate font-medium">
              {pair.map((s) => (s.playerId === selfId ? `${s.username} (tu)` : s.username)).join(' e ')}
            </span>
            <span className={`font-semibold tabular-nums ${won ? 'text-gold' : 'text-muted'}`}>
              {games} {games === 1 ? 'jogo' : 'jogos'}
            </span>
          </li>
        );
      })}
    </ol>
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
