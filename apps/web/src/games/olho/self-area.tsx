'use client';

import type { Rank } from '@cardroom/game-core';
import { compareCards } from '@cardroom/olho';
import type { RoomPlayer } from '@cardroom/shared';
import {
  CardFan,
  cardHeight,
  fanStep,
  fanWidth,
  MotionCard,
  useAnchorRef,
  type CardSize,
} from '@cardroom/ui';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { memo, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TurnRing, useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { useElementWidth } from '../shared/use-element-width';
import { comboName, oneOf, ordinal, plural, ROLE_LABEL, signedPoints } from './copy';
import { RoleBadge } from './insignia';
import { ANCHORS, dealDelaySeconds, type Scene, type SceneCard } from './scene';
import { SpeechBubble, type Bubble } from './seat';

const OVERLAP = 0.55;
const FAN_GUTTER = 12;
const SIZES_DOWN: readonly CardSize[] = ['xl', 'lg', 'ml', 'md', 'ms', 'sm'];

/**
 * Hands run from 6 to 18 cards: the largest size (up to `max`) whose fan fits
 * the width without scrolling, so a big hand shrinks a little instead of hiding.
 */
export function fittedSize(max: CardSize, count: number, available: number | undefined): CardSize {
  if (available === undefined) return max;
  const candidates = SIZES_DOWN.slice(Math.max(0, SIZES_DOWN.indexOf(max)));
  return (
    candidates.find((size) => fanWidth(count, size, fanStep(count, size, OVERLAP, available)) <= available) ??
    (candidates.at(-1) as CardSize)
  );
}

export interface HandProps {
  cards: readonly SceneCard[];
  size: CardSize;
  scene: Pick<Scene, 'dealing' | 'seats' | 'selfId'>;
  /** `false`: the hand is just shown. */
  selectable: boolean;
  /** Ranks that can be played now (others are dimmed); `null` when any card may be picked. */
  playable: ReadonlySet<Rank> | null;
  selected: ReadonlySet<string>;
  /** Cards that just arrived in the exchange, shown lit. */
  highlight: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
}

/** The viewer's hand, 3 → joker, grouped by rank (UI §2); tap to pick cards of one rank. */
export const Hand = memo(function Hand({
  cards,
  size: maxSize,
  scene,
  selectable,
  playable,
  selected,
  highlight,
  onToggle,
}: HandProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.selfHand);
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const sorted = useMemo(() => [...cards].sort((a, b) => compareCards(a.card, b.card)), [cards]);
  const available = measured === null ? undefined : Math.max(0, measured - FAN_GUTTER);
  const size = fittedSize(maxSize, sorted.length, available);
  const scroll =
    available !== undefined &&
    fanWidth(sorted.length, size, fanStep(sorted.length, size, OVERLAP, available)) > available;
  const selfIndex = Math.max(
    0,
    scene.seats.findIndex((s) => s.id === scene.selfId),
  );

  const onKeyDown = (cardId: string) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onToggle(cardId);
    }
  };

  return (
    <div ref={measureRef} className="w-full">
      <div
        ref={anchorRef}
        className={scroll ? 'scrollbar-none overflow-x-auto px-1 pb-1 pt-4' : 'flex justify-center pt-4'}
        role="group"
        aria-label={`A tua mão: ${plural(sorted.length, 'carta', 'cartas')}${selected.size > 0 ? `, ${selected.size} escolhidas` : ''}`}
        style={{ minHeight: cardHeight(size) + 30 }}
      >
        <CardFan
          items={sorted}
          size={size}
          flat={scroll}
          overlap={OVERLAP}
          maxWidth={scroll ? undefined : available}
          getKey={(c) => c.card.id}
          renderItem={({ card, enter }, placement, index) => {
            const isSelected = selected.has(card.id);
            const usable = selectable && (playable === null || playable.has(card.rank));
            return (
              <div
                data-hand-card
                className={clsx(
                  highlight.has(card.id) &&
                    !isSelected &&
                    'rounded-card shadow-[0_0_0_2px_rgb(95_196_134/0.9),0_0_16px_2px_rgb(95_196_134/0.45)]',
                )}
              >
                <MotionCard
                  id={card.id}
                  size={size}
                  layoutId={`card-${card.id}`}
                  enter={
                    scene.dealing
                      ? { from: ANCHORS.deck, kind: 'deal', delay: dealDelaySeconds(index, selfIndex, scene) }
                      : enter
                  }
                  rotate={placement.rotate}
                  lifted={isSelected}
                  interactive={selectable}
                  state={!selectable ? 'normal' : isSelected ? 'selected' : usable ? 'playable' : 'disabled'}
                  onClick={() => usable && onToggle(card.id)}
                  onKeyDown={onKeyDown(card.id)}
                />
              </div>
            );
          }}
        />
      </div>
    </div>
  );
});

export interface ActionBarProps {
  scene: Scene;
  player: RoomPlayer | undefined;
  message: string;
  highlight: boolean;
  timer: TimerLike | null;
  bubble: Bubble | null;
  children?: ReactNode;
}

/** The viewer's own seat (UI §2): avatar with the timer and role, status, and the buttons. */
export function ActionBar({ scene, player, message, highlight, timer, bubble, children }: ActionBarProps) {
  const seconds = useSecondsLeft(timer);
  const selfId = scene.selfId ?? 'self';
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(selfId));
  const me = scene.seats.find((s) => s.id === scene.selfId);
  const role = me?.role ?? scene.me?.role ?? null;
  const points = me?.points ?? scene.session.find((r) => r.playerId === scene.selfId)?.points ?? 0;
  const out = me?.finishedPosition !== null && me?.finishedPosition !== undefined && !me.leaving;
  return (
    // Above the fanned cards, so the viewer's own bubble is never hidden behind them.
    <div className="relative z-70 flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-black/30 px-3 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div ref={anchorRef} className="relative shrink-0">
          <TurnRing active={highlight} timer={timer} size={38}>
            <Avatar
              name={player?.username ?? 'Eu'}
              src={player?.avatarUrl}
              size={38}
              className={clsx(out && 'ring-gold!')}
            />
          </TurnRing>
          {role && <RoleBadge role={role} size={17} className="absolute -bottom-1 -left-1.5 shadow" />}
          <SpeechBubble bubble={bubble} placement="above" />
        </div>
        <div className="min-w-0 flex-1">
          <p
            className={clsx('truncate text-sm font-semibold', highlight ? 'text-gold' : 'text-ivory')}
            role="status"
          >
            {message}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-ivory/60">
            {out ? (
              <span className="font-semibold text-gold">
                {ordinal(me.finishedPosition as number)} · sem cartas
              </span>
            ) : (
              <span className="tabular-nums">
                {plural(me?.handCount ?? scene.hand.length, 'carta', 'cartas')}
              </span>
            )}
            {role && <span>{ROLE_LABEL[role]}</span>}
            <span
              className={clsx('tabular-nums', points > 0 ? 'text-success' : points < 0 ? 'text-danger' : '')}
            >
              {signedPoints(points)} pts
            </span>
            {seconds !== null && (
              <span className={clsx('tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>
                {seconds}s
              </span>
            )}
          </p>
        </div>
      </div>
      {children && <div className="flex gap-2 max-sm:w-full *:max-sm:flex-1">{children}</div>}
    </div>
  );
}

/** A bar that empties with the timer: started once per timer, so React does no per-frame work. */
function DrainBar({ timer }: { timer: TimerLike }) {
  const [remaining] = useState(() => Math.max(0, timer.remainingMs - (performance.now() - timer.receivedAt)));
  return (
    <motion.span
      aria-hidden="true"
      className="absolute inset-x-0 top-0 h-1 origin-left bg-gold-ink/50"
      initial={{ scaleX: remaining / timer.totalMs }}
      animate={{ scaleX: 0 }}
      transition={{ duration: remaining / 1000, ease: 'linear' }}
    />
  );
}

/**
 * UI §3: "Tens um 7. Jogas para não perderes a vez?" with the 5 s running —
 * the same card, as many as were played, or let the turn go.
 */
export function EscapePanel({
  rank,
  count,
  timer,
  busy,
  onEscape,
  onAccept,
}: {
  rank: Rank;
  count: number;
  timer: TimerLike | null;
  busy: boolean;
  onEscape: () => void;
  onAccept: () => void;
}) {
  const seconds = useSecondsLeft(timer);
  const what = count === 1 ? oneOf(rank) : comboName(rank, count);
  return (
    <motion.div
      role="alertdialog"
      aria-label="Escapar ao salto"
      className="relative z-71 flex w-full max-w-md flex-col items-center gap-2 overflow-hidden rounded-2xl bg-gold/95 px-4 py-3 text-gold-ink shadow-[0_10px_40px_rgb(232_193_112/0.35)]"
      initial={{ opacity: 0, y: 12, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 480, damping: 30 }}
    >
      {timer && <DrainBar key={timer.receivedAt} timer={timer} />}
      <p className="text-center text-base font-bold">
        Tens {what}. Jogas para não perderes a vez?
        {seconds !== null && <span className="ml-2 tabular-nums opacity-70">{seconds}s</span>}
      </p>
      <div className="flex w-full gap-2">
        <Button className="flex-1 bg-gold-ink! text-gold!" onClick={onEscape} disabled={busy}>
          Jogar {comboName(rank, count)}
        </Button>
        <Button variant="secondary" className="flex-1" onClick={onAccept} disabled={busy}>
          Perder a vez
        </Button>
      </div>
    </motion.div>
  );
}
