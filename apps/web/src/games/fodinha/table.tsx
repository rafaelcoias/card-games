'use client';

import type { FodinhaAction, FodinhaEvent, FodinhaView } from '@cardroom/fodinha';
import type { RoomPlayer } from '@cardroom/shared';
import { CARD_WIDTH, cardHeight, type CardSize } from '@cardroom/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useMediaQuery, useTableLayout, useViewportHeight, type TableLayout } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { plural, sortHand } from './copy';
import { tableGeometry, type Box } from './layout';
import { LastTrickPopover, RoundSummaryOverlay } from './round-summary';
import { RoundBanner } from './round-banner';
import { applyEvent, dealDurationMs, sceneFromView, type Fx, type Scene } from './scene';
import { Scoreboard } from './scoreboard';
import { Seat, type SeatVariant } from './seat';
import { ActionBar, BidPanel, BlindCard, Hand } from './self-area';
import { TrickArea } from './trick-area';

export interface Sizes {
  seat: SeatVariant;
  /** Opponents' face-up cards in blind rounds. */
  opponentCard: CardSize;
  trick: CardSize;
  hand: CardSize;
  /** The viewer's own face-down card in blind rounds. */
  blind: CardSize;
}

const SEAT_BOX: Record<SeatVariant, Box> = {
  regular: { width: 210, height: 88 },
  compact: { width: 100, height: 100 },
};

/** Up to 10 seats: compact seats and smaller cards as the table fills up (UI §1). */
export function useFodinhaSizes(layout: TableLayout, playerCount: number): Sizes {
  const height = useViewportHeight();
  const roomy = useMediaQuery('(min-height: 900px)');
  const opponents = playerCount - 1;
  const seat: SeatVariant =
    opponents > (layout === 'desktop' ? 6 : layout === 'tablet' ? 4 : 2) ? 'compact' : 'regular';
  const trick: CardSize =
    layout === 'desktop'
      ? playerCount <= 6
        ? 'md'
        : 'sm'
      : layout === 'tablet' || playerCount <= 6
        ? 'sm'
        : 'xs';
  const hand: CardSize =
    layout === 'desktop'
      ? roomy
        ? 'lg'
        : 'ml'
      : layout === 'tablet'
        ? 'ml'
        : height === 'tall'
          ? 'md'
          : height === 'medium'
            ? 'ms'
            : 'sm';
  const blind: CardSize = layout === 'phone' ? (height === 'short' ? 'xs' : 'sm') : hand;
  return { seat, opponentCard: seat === 'compact' ? 'xs' : 'sm', trick, hand, blind };
}

export function FodinhaTable({ room, selfId, sendAction }: GameTableProps) {
  const layout = useTableLayout();
  const sizes = useFodinhaSizes(layout, room.players.length);
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
  useEffect(() => () => window.clearTimeout(tickerTimer.current), []);

  const onFx = useCallback(
    (fx: Fx) => {
      switch (fx.kind) {
        case 'roundStarted':
          announce(
            fx.blind
              ? 'Às cegas — vês as cartas dos outros, não a tua'
              : `Ronda ${fx.round} · ${plural(fx.handSize, 'carta', 'cartas')} · começa ${nameOf(fx.starterId)}`,
            fx.blind ? 3000 : 2200,
          );
          break;
        case 'played':
          playSound('play');
          break;
        case 'trick':
          if (fx.winner === selfId) playSound('pickUp');
          break;
        case 'roundScored':
          if (fx.summary.rows.some((r) => r.playerId === selfId && r.failed)) playSound('burn');
          break;
        case 'bid':
        case 'finished':
          break;
      }
    },
    [announce, nameOf, selfId],
  );

  const choreography = useMemo<Choreography<FodinhaView, FodinhaEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent: (scene, event) => applyEvent(scene, event, { trickSize: sizes.trick }),
      isOpeningDeal: (message) => message.seq === 0 && message.view.phase === 'BIDDING',
      dealDurationMs,
    }),
    [sizes.trick],
  );
  const { scene, validActions, timer, animating } = useDirector<
    FodinhaView,
    FodinhaAction,
    FodinhaEvent,
    Scene,
    Fx
  >(choreography, onFx);

  const myTurn = !!scene && scene.currentPlayerId === selfId && validActions.length > 0 && !animating;
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
    <FodinhaTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      validActions={validActions}
      timer={timer}
      animating={animating}
      ticker={ticker?.text ?? null}
      nameOf={nameOf}
      sendAction={sendAction}
    />
  );
}

export interface FodinhaTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  validActions: FodinhaAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  ticker: string | null;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
}

export function FodinhaTableView({
  scene,
  selfId,
  players,
  sizes,
  validActions,
  timer,
  animating,
  ticker,
  nameOf,
  sendAction,
}: FodinhaTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState<{ key: string; id: string | null }>({ key: '', id: null });
  const [lastTrickOpen, setLastTrickOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [dismissedSummary, setDismissedSummary] = useState<string | null>(null);

  const seatIds = useMemo(() => scene.seats.map((s) => s.id), [scene.seats]);
  const selfIndex = seatIds.indexOf(selfId);
  const geometry = useMemo(
    () =>
      tableGeometry({
        arena: arena ?? { width: 0, height: 0 },
        seatIds,
        selfId,
        seat: SEAT_BOX[sizes.seat],
        card: { width: CARD_WIDTH[sizes.trick], height: cardHeight(sizes.trick) },
      }),
    [arena, seatIds, selfId, sizes.seat, sizes.trick],
  );

  const bids = useMemo(
    () => new Set(validActions.flatMap((a) => (a.type === 'PLACE_BID' ? [a.bid] : []))),
    [validActions],
  );
  const playable = useMemo(
    () => new Set(validActions.flatMap((a) => (a.type === 'PLAY_CARD' ? [a.cardId] : []))),
    [validActions],
  );
  const canAct = !animating && !sending;
  const myBidTurn = canAct && scene.phase === 'BIDDING' && bids.size > 0;
  const myPlayTurn = canAct && scene.phase === 'PLAYING' && playable.size > 0;

  // One selection per trick decision.
  const decisionKey = `${scene.matchId}:${scene.round}:${scene.tricksPlayed}`;
  const selected =
    selection.key === decisionKey && selection.id && playable.has(selection.id) ? selection.id : null;

  const send = async (action: FodinhaAction) => {
    if (!canAct) return;
    setSending(true);
    const ack = await sendAction(action);
    setSending(false);
    setSelection({ key: '', id: null });
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const hand = useMemo(() => sortHand(scene.hand), [scene.hand]);
  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;
  const summaryKey = scene.summary ? `${scene.matchId}:${scene.summary.round}` : null;
  const points = useMemo(() => Object.fromEntries(scene.seats.map((s) => [s.id, s.points])), [scene.seats]);

  const caption = scene.trickOutcome
    ? scene.trickOutcome.winner
      ? `${nameOf(scene.trickOutcome.winner)} ${scene.trickOutcome.winner === selfId ? 'ganhas' : 'ganha'} a vaza`
      : 'Empate — ninguém ganha'
    : ticker;

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden">
      <TimeWarning timer={pendingTimer} />
      <RoundBanner
        scene={scene}
        lastTrickOpen={lastTrickOpen}
        onShowLastTrick={() => setLastTrickOpen((o) => !o)}
        onShowScores={() => setScoresOpen(true)}
      />
      <LastTrickPopover
        trick={scene.lastTrick}
        open={lastTrickOpen}
        nameOf={nameOf}
        onClose={() => setLastTrickOpen(false)}
      />

      <div ref={arenaRef} className="relative min-h-0 flex-1">
        {arena &&
          scene.seats.map((seat, seatIndex) => {
            const point = geometry.seats.get(seat.id);
            if (!point) return null;
            const isTurn = scene.currentPlayerId === seat.id;
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
                  seatIndex={seatIndex}
                  scene={scene}
                  player={players.get(seat.id)}
                  isTurn={isTurn}
                  timer={timer && timer.playerIds.includes(seat.id) ? timer : null}
                  variant={sizes.seat}
                  cardSize={sizes.opponentCard}
                />
              </div>
            );
          })}
        {arena && <TrickArea scene={scene} geometry={geometry} size={sizes.trick} caption={caption} />}
      </div>

      <div className="relative z-20 flex shrink-0 flex-col items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {scene.blind ? (
          <BlindCard present={scene.selfBlindCard} size={sizes.blind} scene={scene} selfIndex={selfIndex} />
        ) : (
          <Hand
            cards={hand}
            size={sizes.hand}
            scene={scene}
            selfIndex={selfIndex}
            playable={myPlayTurn ? playable : null}
            selected={selected}
            onSelect={(id) => setSelection({ key: decisionKey, id })}
            onPlay={(cardId) => void send({ type: 'PLAY_CARD', cardId })}
          />
        )}
        {myBidTurn ? (
          <BidPanel
            key={decisionKey}
            scene={scene}
            player={players.get(selfId)}
            validBids={bids}
            timer={pendingTimer}
            busy={!canAct}
            onBid={(bid) => void send({ type: 'PLACE_BID', bid })}
          />
        ) : (
          <ActionBar
            scene={scene}
            player={players.get(selfId)}
            message={statusMessage(scene, selfId, myPlayTurn, nameOf)}
            highlight={myPlayTurn}
            timer={pendingTimer}
            canPlay={myPlayTurn && selected !== null}
            busy={!canAct}
            onPlay={() => selected && void send({ type: 'PLAY_CARD', cardId: selected })}
          />
        )}
      </div>

      <RoundSummaryOverlay
        summary={summaryKey !== null && summaryKey !== dismissedSummary ? scene.summary : null}
        points={points}
        nameOf={nameOf}
        selfId={selfId}
        onClose={() => setDismissedSummary(summaryKey)}
      />
      <Scoreboard
        open={scoresOpen}
        onClose={() => setScoresOpen(false)}
        history={scene.history}
        seatIds={seatIds}
        points={points}
        maxPoints={scene.maxPoints}
        nameOf={nameOf}
        selfId={selfId}
      />
    </div>
  );
}

function statusMessage(
  scene: Scene,
  selfId: string,
  myPlayTurn: boolean,
  nameOf: (id: string) => string,
): string {
  const me = scene.seats.find((s) => s.id === selfId);
  const current = scene.currentPlayerId;
  switch (scene.phase) {
    case 'FINISHED':
      return scene.losers.includes(selfId) ? 'Fim da partida — perdeste' : 'Fim da partida — sobreviveste!';
    case 'ROUND_SCORED':
      return 'Fim da ronda';
    case 'TRICK_RESOLVED':
      return scene.trickOutcome?.winner
        ? `${nameOf(scene.trickOutcome.winner)} ${scene.trickOutcome.winner === selfId ? 'ganhas' : 'ganha'} a vaza`
        : 'Empate — ninguém ganha a vaza';
    case 'BIDDING':
      if (me?.bid !== null && me?.bid !== undefined) return `Apostaste ${me.bid} — à espera dos outros`;
      return current && current !== selfId ? `Vez de ${nameOf(current)} apostar` : 'A tua vez de apostar';
    case 'PLAYING':
      if (scene.blind) return 'Às cegas — as cartas vão para a mesa sozinhas';
      if (myPlayTurn) return 'A tua vez · toca numa carta e depois em Jogar';
      return current ? `Vez de ${nameOf(current)}` : 'A ver quem leva a vaza…';
  }
}
