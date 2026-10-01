'use client';

import type { DesconfiaAction, DesconfiaEvent, DesconfiaView } from '@cardroom/desconfia';
import type { CardId, StandardRank } from '@cardroom/game-core';
import type { RoomPlayer } from '@cardroom/shared';
import { CARD_WIDTH, cardHeight } from '@cardroom/ui';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { tableGeometry, type Box } from '../fodinha/layout';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useTableLayout, useViewport } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { Confetti } from './confetti';
import { claimLine, rankPlural } from './copy';
import { desconfiaSizes, type SeatVariant, type Sizes } from './layout';
import { Center, RemovedStrip } from './pile';
import { applyEvent, dealDurationMs, sceneFromView, type Fx, type Scene } from './scene';
import { Seat, type Bubble } from './seat';
import { ActionBar, ClaimPicker, DoubtButton, Hand, truthfulRank } from './self-area';

const SEAT_BOX: Record<SeatVariant, Box> = {
  regular: { width: 170, height: 72 },
  compact: { width: 110, height: 104 },
};

/** Bubbles stay up long enough to read. */
const BUBBLE_MS = 1800;

/** Dark bordeaux felt: a table for bluffing (UI §1). */
const FELT = { '--color-felt': '#5a1e2b' } as CSSProperties;

export function useDesconfiaSizes(playerCount: number): Sizes {
  const layout = useTableLayout();
  const { height } = useViewport();
  return useMemo(() => desconfiaSizes(layout, height, playerCount), [layout, height, playerCount]);
}

/** "Carla acertou. Recomeça Carla." — from the viewer's point of view (UI §6). */
export function verdictCaption(
  truthful: boolean,
  authorId: string,
  doubterId: string,
  selfId: string,
  nameOf: (id: string) => string,
): string {
  const starter = truthful ? authorId : doubterId;
  const restart = starter === selfId ? 'Recomeças tu.' : `Recomeça ${nameOf(starter)}.`;
  if (doubterId === selfId)
    return `${truthful ? 'Erraste — era verdade' : 'Acertaste — era mentira'}! ${restart}`;
  return `${nameOf(doubterId)} ${truthful ? 'errou — era verdade' : 'acertou — era mentira'}. ${restart}`;
}

export function DesconfiaTable({ room, selfId, sendAction }: GameTableProps) {
  const sizes = useDesconfiaSizes(room.players.length);
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = useCallback(
    (id: string) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Alguém')),
    [players, selfId],
  );

  const [ticker, setTicker] = useState<{ text: string; key: number } | null>(null);
  const tickerTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string, ms = 2200) => {
    window.clearTimeout(tickerTimer.current);
    setTicker({ text, key: Date.now() });
    tickerTimer.current = window.setTimeout(() => setTicker(null), ms);
  }, []);

  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const bubbleTimers = useRef(new Map<string, number>());
  const say = useCallback((playerId: string, text: string, tone: Bubble['tone']) => {
    window.clearTimeout(bubbleTimers.current.get(playerId));
    setBubbles((current) => ({ ...current, [playerId]: { key: Date.now() + Math.random(), text, tone } }));
    bubbleTimers.current.set(
      playerId,
      window.setTimeout(() => setBubbles(({ [playerId]: _gone, ...rest }) => rest), BUBBLE_MS),
    );
  }, []);
  const [confetti, setConfetti] = useState<number | null>(null);
  useEffect(() => {
    const timers = bubbleTimers.current;
    return () => {
      window.clearTimeout(tickerTimer.current);
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  // The viewer's own cards are never broadcast: the table remembers what it sent, so they glide from the hand.
  const sent = useRef<CardId[] | null>(null);

  const onFx = useCallback(
    (fx: Fx) => {
      const me = (id: string) => id === selfId;
      switch (fx.kind) {
        case 'played':
          say(fx.playerId, claimLine(fx.count, fx.claimRank), 'claim');
          playSound('play');
          if (fx.lastCard) {
            announce(
              me(fx.playerId)
                ? 'Última carta! Se ninguém desconfiar, ganhas.'
                : `Última carta de ${nameOf(fx.playerId)}! Alguém desconfia?`,
              fx.windowMs,
            );
          }
          break;
        case 'doubt':
          say(fx.doubterId, 'Desconfia!', 'doubt');
          playSound('doubt');
          break;
        case 'verdict':
          playSound(fx.truthful ? 'pickUp' : 'burn');
          announce(verdictCaption(fx.truthful, fx.authorId, fx.doubterId, selfId, nameOf), 2600);
          break;
        case 'pileTaken':
          if (me(fx.playerId)) playSound('pickUp');
          break;
        case 'peixinho':
          playSound('splash');
          announce(`Peixinho de ${rankPlural(fx.rank)} — fora de jogo`, 2400);
          break;
        case 'won':
          if (fx.position === 1) setConfetti(Date.now());
          announce(
            me(fx.playerId)
              ? fx.position === 1
                ? 'Ficaste sem cartas — ganhaste! 🎉'
                : `Ficaste sem cartas: ${fx.position}.º lugar`
              : `${nameOf(fx.playerId)} ficou sem cartas${fx.position === 1 ? ' e ganha!' : ` · ${fx.position}.º`}`,
            3000,
          );
          break;
        case 'finished': {
          const winner = fx.finishedOrder[0];
          if (winner) announce(me(winner) ? 'Ganhaste! 🎉' : `${nameOf(winner)} ganha!`, 5000);
          break;
        }
        case 'newPile':
          break;
      }
    },
    [announce, nameOf, say, selfId],
  );

  const choreography = useMemo<Choreography<DesconfiaView, DesconfiaEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent: (scene, event) =>
        applyEvent(scene, event, { ownPlay: () => sent.current, handSize: sizes.hand, pileSize: sizes.pile }),
      isOpeningDeal: (message) => message.seq === 0,
      dealDurationMs,
    }),
    [sizes.hand, sizes.pile],
  );
  const { scene, validActions, timer, animating } = useDirector<
    DesconfiaView,
    DesconfiaAction,
    DesconfiaEvent,
    Scene,
    Fx
  >(choreography, onFx);

  const canPlay = validActions.some((a) => a.type === 'PLAY') && !animating;
  useEffect(() => {
    if (canPlay) playSound('yourTurn');
  }, [canPlay]);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center" style={FELT}>
        <p className="animate-pulse text-ivory/70">A baralhar…</p>
      </div>
    );
  }
  return (
    <DesconfiaTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      validActions={validActions}
      timer={timer}
      animating={animating}
      ticker={ticker?.text ?? null}
      bubbles={bubbles}
      confetti={confetti}
      nameOf={nameOf}
      sendAction={sendAction}
      rememberPlay={(ids) => (sent.current = ids)}
    />
  );
}

export interface DesconfiaTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  validActions: DesconfiaAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  ticker: string | null;
  bubbles: Record<string, Bubble>;
  confetti: number | null;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
  /** Called with the cards of a play just before it is sent. */
  rememberPlay: (cardIds: CardId[]) => void;
}

interface Selection {
  key: string;
  cards: ReadonlySet<string>;
  claim: StandardRank | null;
}

const NO_CARDS: ReadonlySet<string> = new Set();

export function DesconfiaTableView({
  scene,
  selfId,
  players,
  sizes,
  validActions,
  timer,
  animating,
  ticker,
  bubbles,
  confetti,
  nameOf,
  sendAction,
  rememberPlay,
}: DesconfiaTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState<Selection>({ key: '', cards: NO_CARDS, claim: null });

  const seatIds = useMemo(() => scene.seats.map((s) => s.id), [scene.seats]);
  const pileCard = useMemo(
    () => ({ width: CARD_WIDTH[sizes.pile], height: cardHeight(sizes.pile) }),
    [sizes.pile],
  );
  const geometry = useMemo(
    () =>
      tableGeometry({
        arena: arena ?? { width: 0, height: 0 },
        seatIds,
        selfId,
        seat: SEAT_BOX[sizes.seat],
        card: pileCard,
      }),
    [arena, seatIds, selfId, sizes.seat, pileCard],
  );

  const canAct = !animating && !sending;
  const doubt = canAct ? validActions.find((a) => a.type === 'DOUBT') : undefined;
  const canPlay = canAct && validActions.some((a) => a.type === 'PLAY');
  const finished = scene.phase === 'FINISHED';
  const myTurn = !finished && scene.currentPlayerId === selfId;

  // One selection per turn: it survives the 2 s wait, and only keeps cards still in hand.
  const turnKey = `${scene.matchId}:${scene.currentPlayerId}:${scene.pilePlays.at(-1)?.playId ?? 'new'}`;
  const current = selection.key === turnKey ? selection : { key: turnKey, cards: NO_CARDS, claim: null };
  const inHand = useMemo(() => new Set(scene.hand.map((c) => c.card.id)), [scene.hand]);
  const selected = useMemo(
    () => new Set([...current.cards].filter((id) => inHand.has(id))),
    [current.cards, inHand],
  );
  const suggested = truthfulRank(scene.hand, selected);
  const claim = scene.claimRank ?? current.claim ?? suggested;

  const onToggle = useCallback(
    (cardId: string) =>
      setSelection((s) => {
        const base = s.key === turnKey ? s : { key: turnKey, cards: NO_CARDS, claim: null };
        const cards = new Set(base.cards);
        if (cards.has(cardId)) cards.delete(cardId);
        else cards.add(cardId);
        return { ...base, cards };
      }),
    [turnKey],
  );
  const onClaim = (rank: StandardRank) =>
    setSelection((s) => ({ ...(s.key === turnKey ? s : { key: turnKey, cards: NO_CARDS }), claim: rank }));

  const send = async (action: DesconfiaAction) => {
    if (!canAct) return;
    setSending(true);
    const ack = await sendAction(action);
    setSending(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };
  const play = () => {
    if (!canPlay || selected.size === 0 || !claim) return;
    const cardIds = [...selected];
    rememberPlay(cardIds);
    setSelection({ key: turnKey, cards: NO_CARDS, claim: null });
    void send({ type: 'PLAY', cardIds, claimRank: claim });
  };
  const onDoubt = () => {
    if (doubt) void send(doubt);
  };

  const waiting =
    myTurn && scene.doubtWindow && !scene.doubtWindow.minElapsed && !scene.doubtWindow.lastCard
      ? { key: scene.doubtWindow.playId, ms: scene.doubtMinWindowMs }
      : null;
  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;
  const playLabel =
    selected.size === 0
      ? 'Escolhe as cartas'
      : !claim
        ? 'Escolhe o valor'
        : `Jogar ${selected.size} como ${rankPlural(claim)}`;

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden" style={FELT}>
      <TimeWarning timer={pendingTimer} />
      <div className="relative z-30 flex shrink-0 items-center gap-2 px-3 pt-2">
        <RemovedStrip ranks={scene.removed.map((r) => r.rank)} />
        {scene.playUntilEnd && (
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-xs text-ivory/70 backdrop-blur-sm">
            Até ao fim
          </span>
        )}
      </div>

      <div ref={arenaRef} className="relative min-h-0 flex-1">
        {arena && (
          <Center
            scene={scene}
            center={geometry.center}
            pileSize={sizes.pile}
            revealSize={sizes.reveal}
            nameOf={nameOf}
            caption={ticker}
          />
        )}
        {arena &&
          scene.seats.map((seat) => {
            const point = geometry.seats.get(seat.id);
            if (!point) return null;
            return (
              <div
                key={seat.id}
                className="absolute z-10"
                style={{
                  left: point.x,
                  top: point.y,
                  transform: `translate(-50%, -50%) scale(${geometry.seatScale})`,
                }}
              >
                <Seat
                  seat={seat}
                  player={players.get(seat.id)}
                  isTurn={scene.currentPlayerId === seat.id}
                  timer={timer && timer.playerIds.includes(seat.id) ? timer : null}
                  variant={sizes.seat}
                  bubble={bubbles[seat.id] ?? null}
                  winner={scene.finishedOrder[0] === seat.id}
                />
              </div>
            );
          })}
        {confetti !== null && <Confetti key={confetti} burst={confetti} />}
      </div>

      <div className="relative z-20 flex shrink-0 flex-col items-center gap-1.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="pointer-events-none absolute -top-14 left-0 right-0 flex justify-center">
          <div className="pointer-events-auto">
            <AnimatePresence>
              {doubt && <DoubtButton key="doubt" onDoubt={onDoubt} label="Desconfia!" />}
            </AnimatePresence>
          </div>
        </div>
        <Hand
          cards={scene.hand}
          size={sizes.hand}
          dealing={scene.dealing}
          selectable={myTurn && !sending}
          selected={selected}
          onToggle={onToggle}
        />
        {myTurn && scene.claimRank === null && scene.hand.length > 0 && (
          <ClaimPicker value={claim} truthful={suggested} onChange={onClaim} />
        )}
        <ActionBar
          scene={scene}
          player={players.get(selfId)}
          message={statusMessage(
            scene,
            selfId,
            { canPlay, waiting: waiting !== null, canDoubt: !!doubt, claim },
            nameOf,
          )}
          highlight={canPlay}
          timer={pendingTimer}
          bubble={bubbles[selfId] ?? null}
          play={
            myTurn
              ? {
                  label: playLabel,
                  ready: canPlay && selected.size > 0 && claim !== null,
                  waiting,
                  busy: !canAct,
                  onPlay: play,
                }
              : null
          }
        />
      </div>
    </div>
  );
}

function statusMessage(
  scene: Scene,
  selfId: string,
  turn: { canPlay: boolean; waiting: boolean; canDoubt: boolean; claim: StandardRank | null },
  nameOf: (id: string) => string,
): string {
  const me = scene.seats.find((s) => s.id === selfId);
  if (scene.phase === 'FINISHED') {
    const winner = scene.finishedOrder[0];
    return winner === selfId
      ? 'Fim — ganhaste! 🎉'
      : `Fim — ${winner ? `ganhou ${nameOf(winner)}` : 'partida terminada'}`;
  }
  if (me?.finishedPosition) return `Ficaste sem cartas (${me.finishedPosition}.º) — os outros continuam`;
  if (scene.reveal) {
    const { doubterId, authorId } = scene.reveal;
    if (doubterId === selfId) return `Desconfiaste de ${nameOf(authorId)} — a ver as cartas…`;
    return `${nameOf(doubterId)} desconfiou de ${authorId === selfId ? 'ti' : nameOf(authorId)} — a ver as cartas…`;
  }
  const window = scene.doubtWindow;
  if (window?.lastCard) {
    return window.playerId === selfId
      ? 'Última carta! Se ninguém desconfiar, ganhas.'
      : `Última carta de ${nameOf(window.playerId)}! Desconfias?`;
  }
  if (scene.currentPlayerId === selfId) {
    if (turn.waiting) return 'A tua vez — espera um instante: ainda podem desconfiar';
    if (scene.claimRank) return `A tua vez · tens de anunciar ${rankPlural(scene.claimRank)}`;
    return 'A tua vez · pilha nova: escolhe as cartas e o valor';
  }
  const current = scene.currentPlayerId;
  const waiting = current ? `Vez de ${nameOf(current)}` : '…';
  return turn.canDoubt ? `${waiting} · podes desconfiar` : waiting;
}
