'use client';

import { compareCards } from '@cardroom/peixinho';
import type { StandardRank } from '@cardroom/game-core';
import type { RoomPlayer } from '@cardroom/shared';
import { Card, CARD_WIDTH, cardHeight, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import {
  forwardRef,
  memo,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TurnRing, useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { useElementWidth } from '../shared/use-element-width';
import { Bucket } from './bucket';
import { plural, rankPlural } from './copy';
import { placeHand } from './layout';
import { ANCHORS, DEAL_STAGGER_S, type Scene, type SceneCard } from './scene';
import { SpeechBubble, type Bubble } from './seat';

const GUTTER = 12;
/** Pointer travel that turns a press into a drag. */
const DRAG_THRESHOLD = 8;

export interface HandProps {
  cards: readonly SceneCard[];
  size: CardSize;
  dealing: boolean;
  /** Ranks the viewer may ask for now; `null` when it is not their turn to ask. */
  askable: ReadonlySet<StandardRank> | null;
  selectedRank: StandardRank | null;
  onSelectRank: (rank: StandardRank | null) => void;
  /** A card dragged onto a seat (UI §2 shortcut): `targetId` is `null` when dropped elsewhere. */
  onDrop: (rank: StandardRank, targetId: string | null) => void;
  onDragOver: (targetId: string | null) => void;
}

/** The viewer's hand in a fan, grouped by rank with a count per group (UI §1). */
export const Hand = memo(function Hand({
  cards,
  size,
  dealing,
  askable,
  selectedRank,
  onSelectRank,
  onDrop,
  onDragOver,
}: HandProps) {
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const handAnchor = useAnchorRef<HTMLDivElement>(ANCHORS.selfHand);
  const ghost = useRef<GhostHandle>(null);
  const justDragged = useRef(false);
  const sorted = useMemo(() => [...cards].sort((a, b) => compareCards(a.card, b.card)), [cards]);
  const available = measured === null ? undefined : Math.max(0, measured - GUTTER);
  const { placed, badges, total, flat } = placeHand(sorted, size, available);
  const height = cardHeight(size);
  const counts = new Map(badges.map((b) => [b.rank, b.count]));

  const choose = (rank: StandardRank) => {
    if (justDragged.current || !askable?.has(rank)) return;
    onSelectRank(selectedRank === rank ? null : rank);
  };

  /** Press, then move past the threshold: a ghost card follows the pointer to a seat. */
  const startDrag = (event: ReactPointerEvent, card: SceneCard['card']) => {
    if (!askable?.has(card.rank as StandardRank) || event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const targetAt = (x: number, y: number) =>
      document
        .elementsFromPoint(x, y)
        .map((el) => el.closest('[data-ask-target]'))
        .find((el) => el !== null)
        ?.getAttribute('data-ask-target') ?? null;
    const move = (e: PointerEvent) => {
      if (!dragging && Math.hypot(e.clientX - start.x, e.clientY - start.y) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        ghost.current?.show(card.id, size);
      }
      ghost.current?.move(e.clientX, e.clientY);
      onDragOver(targetAt(e.clientX, e.clientY));
    };
    const end = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!dragging) return;
      // The click that follows a drag must not toggle the rank.
      justDragged.current = true;
      window.setTimeout(() => (justDragged.current = false), 0);
      ghost.current?.hide();
      onDragOver(null);
      onDrop(card.rank as StandardRank, e.type === 'pointerup' ? targetAt(e.clientX, e.clientY) : null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  return (
    <div ref={measureRef} className="w-full">
      <div
        className={flat ? 'scrollbar-none overflow-x-auto px-1 pb-1 pt-4' : 'flex justify-center pt-4'}
        role="group"
        aria-label={`A tua mão: ${plural(cards.length, 'carta', 'cartas')}`}
        style={{ minHeight: height + 30 }}
      >
        <div
          ref={handAnchor}
          className="relative flex-none"
          style={{ width: total, height: height + (flat ? 0 : 14) }}
        >
          {placed.map(({ item, left, rotate, y }, index) => {
            const rank = item.card.rank as StandardRank;
            const canAsk = askable?.has(rank) ?? false;
            const selected = selectedRank === rank;
            const count = counts.get(rank);
            return (
              <HandCard
                key={item.card.id}
                item={item}
                size={size}
                style={{ left, top: y, zIndex: index + 1, touchAction: canAsk && !flat ? 'none' : undefined }}
                rotate={rotate}
                enter={
                  dealing ? { from: ANCHORS.pond, kind: 'deal', delay: index * DEAL_STAGGER_S } : item.enter
                }
                interactive={askable !== null}
                lifted={selected}
                state={askable === null ? 'normal' : selected ? 'selected' : canAsk ? 'playable' : 'disabled'}
                label={`${rankPlural(rank)}${count ? ` (${count})` : ''}`}
                onClick={() => choose(rank)}
                onPointerDown={(event) => startDrag(event, item.card)}
              />
            );
          })}
          {/* Above every card, so no group hides the count of the one before it. */}
          {badges.map((badge) => (
            <span
              key={badge.rank}
              aria-hidden="true"
              className={clsx(
                'pointer-events-none absolute z-[60] -translate-x-1/2 rounded-full bg-ink px-1.5 text-[11px] font-bold leading-5 shadow ring-1 transition-transform duration-150',
                selectedRank === badge.rank ? 'text-gold-strong ring-gold' : 'text-gold ring-gold/60',
              )}
              style={{
                left: badge.x,
                top: badge.top - 12,
                transform: `translateY(${selectedRank === badge.rank ? -12 : 0}px)`,
              }}
            >
              ×{badge.count}
            </span>
          ))}
        </div>
      </div>
      <DragGhost ref={ghost} />
    </div>
  );
});

function HandCard({
  item,
  size,
  style,
  rotate,
  enter,
  interactive,
  lifted,
  state,
  label,
  onClick,
  onPointerDown,
}: {
  item: SceneCard;
  size: CardSize;
  style: React.CSSProperties;
  rotate: number;
  enter: SceneCard['enter'];
  interactive: boolean;
  lifted: boolean;
  state: 'normal' | 'selected' | 'playable' | 'disabled';
  label: string;
  onClick: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.handCard(item.card.id));
  return (
    <div ref={anchorRef} data-hand-card className="absolute" style={style} onPointerDown={onPointerDown}>
      <MotionCard
        id={item.card.id}
        size={size}
        layoutId={`card-${item.card.id}`}
        enter={enter}
        rotate={rotate}
        lifted={lifted}
        interactive={interactive}
        state={state}
        label={label}
        onClick={onClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick();
          }
        }}
      />
    </div>
  );
}

interface GhostHandle {
  show(cardId: string, size: CardSize): void;
  move(x: number, y: number): void;
  hide(): void;
}

/** The card under the finger while dragging it to a seat (its hand copy stays put). */
const DragGhost = forwardRef<GhostHandle>(function DragGhost(_, ref) {
  const [ghost, setGhost] = useState<{ cardId: string; size: CardSize; x: number; y: number } | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      show: (cardId, size) => setGhost({ cardId, size, x: -999, y: -999 }),
      move: (x, y) => setGhost((g) => (g ? { ...g, x, y } : g)),
      hide: () => setGhost(null),
    }),
    [],
  );
  if (!ghost || typeof document === 'undefined') return null;
  const width = CARD_WIDTH[ghost.size];
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-[70] drop-shadow-2xl"
      style={{
        left: ghost.x - width / 2,
        top: ghost.y - cardHeight(ghost.size) * 0.8,
        transform: 'rotate(6deg) scale(1.06)',
      }}
    >
      <Card id={ghost.cardId} size={ghost.size} label="" />
    </div>,
    document.body,
  );
});

export interface ActionBarProps {
  scene: Scene;
  player: RoomPlayer | undefined;
  message: string;
  highlight: boolean;
  timer: TimerLike | null;
  /** "Pedir Setes a Ana" once both are chosen; `null` hides the button. */
  askLabel: string | null;
  canAsk: boolean;
  /** Offered while fishing, for who does not want to tap the pond. */
  canFish: boolean;
  busy: boolean;
  bubble: Bubble | null;
  onAsk: () => void;
  onFish: () => void;
}

/** The viewer's own seat (UI §2): bucket, avatar with the timer, status, and the confirm button. */
export function ActionBar({
  scene,
  player,
  message,
  highlight,
  timer,
  askLabel,
  canAsk,
  canFish,
  busy,
  bubble,
  onAsk,
  onFish,
}: ActionBarProps) {
  const seconds = useSecondsLeft(timer);
  const selfId = scene.selfId ?? 'self';
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(selfId));
  const me = scene.seats.find((s) => s.id === scene.selfId);
  const winner = scene.phase === 'FINISHED' && scene.winners.includes(selfId);
  return (
    <div className="relative flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-black/30 px-3 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div ref={anchorRef} className="relative shrink-0">
          <TurnRing active={highlight} timer={timer} size={38}>
            <Avatar
              name={player?.username ?? 'Eu'}
              src={player?.avatarUrl}
              size={38}
              dimmed={me?.out}
              className={clsx(winner && 'ring-gold!')}
            />
          </TurnRing>
          <SpeechBubble bubble={bubble} placement="above" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={clsx('truncate text-sm font-semibold', highlight ? 'text-gold' : 'text-ivory')}
            role="status"
          >
            {message}
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <Bucket playerId={selfId} peixinhos={me?.peixinhos ?? []} highlight={winner} />
            {seconds !== null && (
              <span className={clsx('text-xs tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>
                {seconds}s
              </span>
            )}
          </div>
        </div>
      </div>
      {askLabel !== null && (
        <Button onClick={onAsk} disabled={!canAsk || busy} className="max-sm:w-full">
          {askLabel}
        </Button>
      )}
      {canFish && (
        <Button variant="secondary" onClick={onFish} disabled={busy} className="max-sm:w-full">
          🎣 Pescar ao calhas
        </Button>
      )}
    </div>
  );
}
