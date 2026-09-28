'use client';

import type {
  BlackjackAction,
  BlackjackClientAction,
  BlackjackEvent,
  BlackjackView,
} from '@cardroom/blackjack';
import type { RoomPlayer } from '@cardroom/shared';
import { cardHeight, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useTableLayout, useViewport, type TableLayout, type Viewport } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { ActionBar, BettingPanel, InsurancePanel } from './controls';
import { feltPrint } from './copy';
import { DealerArea, Discard, FeltPrint, Shoe } from './dealer';
import { dealerLine } from './dealer-lines';
import { handBox } from './hand';
import { tableGeometry, visualSlot } from './layout';
import { applyEvent, sceneFromView, type Fx, type Scene, type SceneSeat } from './scene';
import { SeatSpot } from './seat';
import { SeatStrip } from './seat-strip';
import { SessionPanel } from './session-panel';

export interface Sizes {
  layout: TableLayout;
  seatCard: CardSize;
  selfCard: CardSize;
  dealerCard: CardSize;
  shoeCard: CardSize;
}

export function useBlackjackSizes(): Sizes {
  const layout = useTableLayout();
  const viewport = useViewport();
  return useMemo(() => blackjackSizes(layout, viewport), [layout, viewport]);
}

/** Cards grow with the screen: seven places must still fit across the half-moon. */
export function blackjackSizes(layout: TableLayout, { width, height }: Viewport): Sizes {
  if (layout === 'desktop') {
    if (width >= 1700 && height >= 1000)
      return { layout, seatCard: 'md', selfCard: 'ml', dealerCard: 'lg', shoeCard: 'sm' };
    if (width >= 1360 && height >= 850)
      return { layout, seatCard: 'ms', selfCard: 'md', dealerCard: 'ml', shoeCard: 'xs' };
    return { layout, seatCard: 'sm', selfCard: 'ms', dealerCard: 'md', shoeCard: 'xs' };
  }
  if (layout === 'tablet') {
    return height >= 1000
      ? { layout, seatCard: 'sm', selfCard: 'md', dealerCard: 'md', shoeCard: 'xs' }
      : { layout, seatCard: 'xs', selfCard: 'sm', dealerCard: 'sm', shoeCard: 'xs' };
  }
  return height >= 780
    ? { layout, seatCard: 'xs', selfCard: 'md', dealerCard: 'ms', shoeCard: 'xs' }
    : { layout, seatCard: 'xs', selfCard: 'ms', dealerCard: 'sm', shoeCard: 'xs' };
}

const SPEECH_MS = 2000;

export function BlackjackTable({ room, selfId, sendAction }: GameTableProps) {
  const sizes = useBlackjackSizes();
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = useCallback(
    (id: string) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Alguém')),
    [players, selfId],
  );

  const sceneRef = useRef<Scene | null>(null);
  const [speech, setSpeech] = useState<{ text: string; key: number } | null>(null);
  const [notice, setNotice] = useState<{ text: string; key: number } | null>(null);
  const lastLine = useRef<string | null>(null);
  const timers = useRef<{ speech?: number; notice?: number }>({});
  useEffect(
    () => () => {
      window.clearTimeout(timers.current.speech);
      window.clearTimeout(timers.current.notice);
    },
    [],
  );

  const onFx = useCallback(
    (fx: Fx) => {
      switch (fx.kind) {
        case 'card':
          playSound('play');
          break;
        case 'chips':
          break;
        case 'turn':
          break;
        case 'bust':
          playSound('burn');
          break;
        case 'settled':
          if (
            fx.tone === 'win' &&
            sceneRef.current?.seats.find((s) => s.seatIndex === fx.seatIndex)?.playerId === selfId
          ) {
            playSound('pickUp');
          }
          break;
        case 'dealer': {
          const scene = sceneRef.current;
          const nameOfSeat = (seatIndex: number) => {
            const playerId = scene?.seats.find((s) => s.seatIndex === seatIndex)?.playerId;
            return playerId === selfId ? 'tu' : playerId ? nameOf(playerId) : '';
          };
          const text = dealerLine(fx.event, fx.key, nameOfSeat, lastLine.current);
          if (!text) break;
          lastLine.current = text;
          window.clearTimeout(timers.current.speech);
          setSpeech({ text, key: Date.now() });
          timers.current.speech = window.setTimeout(() => setSpeech(null), SPEECH_MS);
          break;
        }
        case 'notice':
          window.clearTimeout(timers.current.notice);
          setNotice({ text: fx.text, key: Date.now() });
          timers.current.notice = window.setTimeout(() => setNotice(null), 3500);
          break;
      }
    },
    [nameOf, selfId],
  );

  const choreography = useMemo<Choreography<BlackjackView, BlackjackEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent,
      isOpeningDeal: () => false,
      dealDurationMs: () => 0,
    }),
    [],
  );
  const { scene, validActions, timer, animating } = useDirector<
    BlackjackView,
    BlackjackAction,
    BlackjackEvent,
    Scene,
    Fx
  >(choreography, onFx);
  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const myTurn =
    !!scene && scene.phase === 'PLAYER_TURNS' && !animating && validActions.some((a) => a.type === 'HIT');
  useEffect(() => {
    if (myTurn) playSound('yourTurn');
  }, [myTurn]);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center">
        <p className="animate-pulse text-ivory/70">A preparar a mesa…</p>
      </div>
    );
  }
  return (
    <BlackjackTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      validActions={validActions as BlackjackClientAction[]}
      timer={timer}
      animating={animating}
      speech={speech}
      notice={notice?.text ?? null}
      nameOf={nameOf}
      sendAction={sendAction}
    />
  );
}

export interface BlackjackTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  validActions: BlackjackClientAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  speech: { text: string; key: number } | null;
  notice: string | null;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
}

export function BlackjackTableView({
  scene,
  selfId,
  players,
  sizes,
  validActions,
  timer,
  animating,
  speech,
  notice,
  nameOf,
  sendAction,
}: BlackjackTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const [sending, setSending] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const me = scene.seats.find((seat) => seat.playerId === selfId) ?? null;
  const canAct = !animating && !sending;
  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;
  const phone = sizes.layout === 'phone';

  const send = useCallback(
    async (action: BlackjackClientAction) => {
      setSending(true);
      const ack = await sendAction(action);
      setSending(false);
      if (!ack.ok) toast.error(describeError(ack.error));
    },
    [sendAction],
  );
  const sendNow = useCallback((action: BlackjackClientAction) => void send(action), [send]);

  const seatTimer = (seat: SceneSeat) => (timer && timer.playerIds.includes(seat.playerId) ? timer : null);
  const others = scene.seats.filter((seat) => seat.playerId !== selfId);

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden">
      <TimeWarning timer={pendingTimer} />
      <Banner scene={scene} notice={notice} onShowSession={() => setSessionOpen(true)} />

      {phone ? (
        <div className="relative flex min-h-0 flex-1 flex-col items-center gap-2 overflow-hidden px-2 pt-1">
          <div className="flex w-full items-start justify-between">
            <Discard count={scene.discardCount} size={sizes.shoeCard} />
            <DealerArea scene={scene} size={sizes.dealerCard} speech={speech} />
            <Shoe scene={scene} size={sizes.shoeCard} />
          </div>
          <SeatStrip seats={others} scene={scene} nameOf={nameOf} players={players} timerFor={seatTimer} />
          <div className="mt-auto pb-1">
            {me && (
              <SeatSpot
                seat={me}
                scene={scene}
                player={players.get(selfId)}
                name={nameOf(selfId)}
                isSelf
                timer={seatTimer(me)}
                // Three or four split hands only fit across a phone a size smaller.
                cardSize={me.hands.length > 2 ? 'ms' : sizes.selfCard}
                variant="self"
              />
            )}
          </div>
        </div>
      ) : (
        <div ref={arenaRef} className="relative min-h-0 flex-1">
          {arena && (
            <ArcTable
              scene={scene}
              arena={arena}
              sizes={sizes}
              selfId={selfId}
              players={players}
              nameOf={nameOf}
              speech={speech}
              timerFor={seatTimer}
            />
          )}
        </div>
      )}

      <div className="relative z-20 flex shrink-0 flex-col items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Controls
          scene={scene}
          me={me}
          actions={validActions}
          timer={pendingTimer}
          busy={!canAct}
          nameOf={nameOf}
          send={sendNow}
        />
      </div>

      <SessionPanel
        open={sessionOpen}
        onClose={() => setSessionOpen(false)}
        rows={scene.session}
        rounds={scene.roundsDealt}
        startingStack={scene.rules.startingStack}
        nameOf={nameOf}
        selfId={selfId}
      />
    </div>
  );
}

/** Tablets and desktops: the dealer at the top, seven places on the half-moon (UI §1). */
function ArcTable({
  scene,
  arena,
  sizes,
  selfId,
  players,
  nameOf,
  speech,
  timerFor,
}: {
  scene: Scene;
  arena: { width: number; height: number };
  sizes: Sizes;
  selfId: string;
  players: Map<string, RoomPlayer>;
  nameOf: (id: string) => string;
  speech: { text: string; key: number } | null;
  timerFor: (seat: SceneSeat) => TimerSnapshot | null;
}) {
  const seatBox = handBox(3, sizes.seatCard);
  const geometry = tableGeometry(arena, {
    width: Math.max(150, seatBox.width * 1.6),
    height: seatBox.height + 120,
  });
  const selfSeat = scene.seats.find((s) => s.playerId === selfId)?.seatIndex ?? null;
  const { center, rx, ry } = geometry.arc;
  // The line on the felt in front of the places: the lower half of an ellipse inside the seats.
  const rail = (scale: number) =>
    `M ${center.x - rx * scale} ${center.y} A ${rx * scale} ${ry * scale * 0.85} 0 0 0 ${center.x + rx * scale} ${center.y}`;
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
        <path d={rail(0.7)} fill="none" stroke="rgb(244 239 227 / 0.14)" strokeWidth="2" />
        <path d={rail(0.66)} fill="none" stroke="rgb(244 239 227 / 0.07)" strokeWidth="1" />
      </svg>
      <div
        className="absolute z-20 flex items-start gap-6"
        style={{ left: geometry.dealer.x, top: 8, transform: 'translateX(-50%)' }}
      >
        <Discard count={scene.discardCount} size={sizes.shoeCard} />
        <DealerArea scene={scene} size={sizes.dealerCard} speech={speech} />
        <Shoe scene={scene} size={sizes.shoeCard} />
      </div>
      <div
        className="absolute"
        style={{
          left: geometry.arc.center.x,
          top: 8 + cardHeight(sizes.dealerCard) + 76,
          transform: 'translateX(-50%)',
        }}
      >
        <FeltPrint text={feltPrint(scene.rules)} width={Math.min(arena.width * 0.62, 620)} />
      </div>
      {scene.seats.map((seat) => {
        const point = geometry.slots[visualSlot(seat.seatIndex, selfSeat)];
        if (!point) return null;
        const isSelf = seat.playerId === selfId;
        return (
          <div
            key={seat.playerId}
            className="absolute z-10"
            style={{
              left: point.x,
              top: point.y,
              transform: `translate(-50%, -62%) scale(${geometry.seatScale * (isSelf ? 1.08 : 1)})`,
            }}
          >
            <SeatSpot
              seat={seat}
              scene={scene}
              player={players.get(seat.playerId)}
              name={nameOf(seat.playerId)}
              isSelf={isSelf}
              timer={timerFor(seat)}
              cardSize={isSelf ? sizes.selfCard : sizes.seatCard}
              variant={isSelf ? 'self' : 'arc'}
            />
          </div>
        );
      })}
    </>
  );
}

/** "Ronda 12 · Mesa 10–500 · 6 baralhos", the shoe and session notices, and the scoreboard button. */
function Banner({
  scene,
  notice,
  onShowSession,
}: {
  scene: Scene;
  notice: string | null;
  onShowSession: () => void;
}) {
  const { rules } = scene;
  return (
    <div className="relative z-30 flex shrink-0 items-start gap-2 px-3 pt-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="rounded-full bg-black/35 px-3 py-1 text-sm font-semibold backdrop-blur-sm">
          Ronda {scene.round} · Mesa {rules.minBet}–{rules.maxBet}
          <span className="hidden sm:inline">
            {' '}
            · {rules.decks} {rules.decks === 1 ? 'baralho' : 'baralhos'}
          </span>
        </span>
        <AnimatePresence initial={false}>
          {scene.shoe.cutCardReached && scene.phase !== 'SHUFFLING' && (
            <Pill key="cut" tone="danger">
              Última ronda do sapato
            </Pill>
          )}
          {scene.endRequested && scene.phase !== 'FINISHED' && (
            <Pill key="end" tone="gold">
              A sessão termina no fim desta ronda
            </Pill>
          )}
          {notice && (
            <Pill key={notice} tone="plain">
              {notice}
            </Pill>
          )}
        </AnimatePresence>
      </div>
      <button
        type="button"
        aria-label="Sessão"
        title="Sessão"
        onClick={onShowSession}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-black/35 text-sm backdrop-blur-sm hover:bg-black/55"
      >
        <span aria-hidden="true">📋</span>
      </button>
    </div>
  );
}

function Pill({ tone, children }: { tone: 'danger' | 'gold' | 'plain'; children: React.ReactNode }) {
  return (
    <motion.span
      className={clsx(
        'rounded-full px-2.5 py-0.5 text-xs font-bold',
        tone === 'danger' && 'bg-danger/85 text-white',
        tone === 'gold' && 'bg-gold text-gold-ink',
        tone === 'plain' && 'bg-black/45 text-ivory',
      )}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
    >
      {children}
    </motion.span>
  );
}

/** The bottom of the screen: whatever the viewer can do now, or what the table is waiting for. */
function Controls({
  scene,
  me,
  actions,
  timer,
  busy,
  nameOf,
  send,
}: {
  scene: Scene;
  me: SceneSeat | null;
  actions: BlackjackClientAction[];
  timer: TimerSnapshot | null;
  busy: boolean;
  nameOf: (id: string) => string;
  send: (action: BlackjackClientAction) => void;
}) {
  const sitOut = actions.find((a) => a.type === 'SIT_OUT');
  const has = (type: BlackjackClientAction['type']) => actions.some((a) => a.type === type);

  let main: React.ReactNode = null;
  if (me && scene.phase === 'BETTING' && !me.sittingOut) {
    main = (
      <BettingPanel
        seat={me}
        rules={scene.rules}
        actions={actions}
        timer={timer}
        busy={busy}
        roundKey={`${scene.matchId}:${scene.round}`}
        send={send}
      />
    );
  } else if (me && (has('INSURANCE') || has('EVEN_MONEY'))) {
    main = (
      <InsurancePanel
        amount={me.insurance?.amount ?? 0}
        evenMoney={me.insurance?.evenMoney ?? false}
        bet={me.hands[0]?.bet ?? 0}
        timer={timer}
        busy={busy}
        send={send}
      />
    );
  } else if (me && has('HIT')) {
    const handCount = me.hands.length;
    const title =
      handCount > 1 ? `A tua vez · mão ${(scene.turn?.handIndex ?? 0) + 1} de ${handCount}` : 'A tua vez';
    main = (
      <ActionBar actions={actions} hint={scene.hint} timer={timer} busy={busy} title={title} send={send} />
    );
  }

  return (
    <>
      {main ?? (
        <p
          className="w-full max-w-3xl rounded-2xl bg-black/30 px-3 py-2.5 text-center text-sm font-semibold backdrop-blur-sm"
          role="status"
        >
          {statusMessage(scene, me, nameOf)}
        </p>
      )}
      {sitOut?.type === 'SIT_OUT' && (
        <button
          type="button"
          disabled={busy}
          onClick={() => send(sitOut)}
          className={clsx(
            'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
            sitOut.value ? 'text-ivory/60 hover:text-ivory' : 'bg-gold text-gold-ink hover:bg-gold-strong',
          )}
        >
          {sitOut.value ? 'Ficar de fora nas próximas rondas' : 'Voltar à mesa'}
        </button>
      )}
    </>
  );
}

function statusMessage(scene: Scene, me: SceneSeat | null, nameOf: (id: string) => string): string {
  const onTurn = scene.turn ? scene.seats.find((s) => s.seatIndex === scene.turn?.seatIndex) : null;
  switch (scene.phase) {
    case 'FINISHED':
      return 'Sessão terminada';
    case 'SHUFFLING':
      return 'A banca está a baralhar o sapato…';
    case 'SETTLEMENT':
      return 'A banca está a pagar…';
    case 'DEALER_TURN':
      return `Joga a banca`;
    case 'PEEK':
      return 'A banca espreita a carta tapada…';
    case 'DEALING':
      return 'A distribuir…';
    case 'INSURANCE':
      return 'À espera das respostas ao seguro…';
    case 'PLAYER_TURNS':
      if (me && me.hands.length === 0) return 'Entras na próxima ronda';
      return onTurn ? `Vez de ${nameOf(onTurn.playerId)}` : 'À espera…';
    case 'BETTING':
      if (me?.sittingOut) return 'Estás de fora — voltas quando quiseres';
      return 'Apostas abertas';
  }
}
