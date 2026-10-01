'use client';

import { compareCards } from '@cardroom/desconfia';
import { JOKER, STANDARD_RANKS, type StandardRank } from '@cardroom/game-core';
import type { RoomPlayer } from '@cardroom/shared';
import {
  CardFan,
  cardHeight,
  fanStep,
  fanWidth,
  MotionCard,
  rankLabel,
  useAnchorRef,
  type CardSize,
} from '@cardroom/ui';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useMemo, type KeyboardEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TurnRing, useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { useElementWidth } from '../shared/use-element-width';
import { plural, rankPlural } from './copy';
import { ANCHORS, dealStaggerSeconds, type Scene, type SceneCard } from './scene';
import { SpeechBubble, type Bubble } from './seat';

const OVERLAP = 0.55;
const FAN_GUTTER = 12;

export interface HandProps {
  cards: readonly SceneCard[];
  size: CardSize;
  dealing: boolean;
  /** `false` when it is not the viewer's turn: the hand is just shown. */
  selectable: boolean;
  selected: ReadonlySet<string>;
  onToggle: (cardId: string) => void;
}

/** The viewer's hand, by rank with the jokers last (UI §2); tap to raise or lower a card. */
export const Hand = memo(function Hand({ cards, size, dealing, selectable, selected, onToggle }: HandProps) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.selfHand);
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const sorted = useMemo(() => [...cards].sort((a, b) => compareCards(a.card, b.card)), [cards]);
  const available = measured === null ? undefined : Math.max(0, measured - FAN_GUTTER);
  const scroll =
    available !== undefined &&
    fanWidth(sorted.length, size, fanStep(sorted.length, size, OVERLAP, available)) > available;
  const stagger = dealStaggerSeconds(sorted.length);

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
            return (
              <div data-hand-card>
                <MotionCard
                  id={card.id}
                  size={size}
                  layoutId={`card-${card.id}`}
                  enter={dealing ? { from: ANCHORS.pile, kind: 'deal', delay: index * stagger } : enter}
                  rotate={placement.rotate}
                  lifted={isSelected}
                  interactive={selectable}
                  state={!selectable ? 'normal' : isSelected ? 'selected' : 'playable'}
                  onClick={() => selectable && onToggle(card.id)}
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

/** On a new pile, the 13 ranks to claim (UI §3); the truthful one, when there is one, is marked. */
export function ClaimPicker({
  value,
  truthful,
  onChange,
}: {
  value: StandardRank | null;
  truthful: StandardRank | null;
  onChange: (rank: StandardRank) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Valor a anunciar"
      className="grid w-full max-w-3xl grid-cols-7 gap-1 sm:grid-cols-13"
    >
      {STANDARD_RANKS.map((rank) => (
        <button
          key={rank}
          type="button"
          role="radio"
          aria-checked={value === rank}
          aria-label={rankPlural(rank)}
          title={rankPlural(rank)}
          onClick={() => onChange(rank)}
          className={clsx(
            'relative h-9 rounded-lg text-sm font-bold transition-colors',
            value === rank
              ? 'bg-gold text-gold-ink shadow-[0_0_0_2px_rgb(0_0_0/0.35)]'
              : 'bg-white/10 text-ivory hover:bg-white/20',
          )}
        >
          {rank === '10' ? '10' : rankLabel(rank).length > 2 ? rank : rankLabel(rank)}
          {truthful === rank && value !== rank && (
            <span className="absolute right-1 top-1 size-1.5 rounded-full bg-success" aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  );
}

/** The rank the selected cards truly are, when they all agree (jokers fit anything). */
export function truthfulRank(
  cards: readonly SceneCard[],
  selected: ReadonlySet<string>,
): StandardRank | null {
  const ranks = new Set(
    cards
      .filter((c) => selected.has(c.card.id) && c.card.rank !== JOKER)
      .map((c) => c.card.rank as StandardRank),
  );
  return ranks.size === 1 ? ([...ranks][0] as StandardRank) : null;
}

/**
 * "Desconfia!" (UI §5): big, red, pulsing, for whoever may doubt while the
 * window is open. Space does the same.
 */
export function DoubtButton({ onDoubt, label }: { onDoubt: () => void; label: string }) {
  const reduced = useReducedMotion() ?? false;
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== ' ' || event.repeat || target?.closest('input, textarea, [contenteditable="true"]'))
        return;
      event.preventDefault();
      onDoubt();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDoubt]);
  return (
    <motion.button
      type="button"
      onClick={onDoubt}
      aria-keyshortcuts="Space"
      title={`${label} (Espaço)`}
      className="rounded-2xl bg-danger px-7 py-2.5 font-display text-xl font-black uppercase tracking-wide text-white shadow-[0_8px_30px_rgb(240_104_107/0.45)] ring-2 ring-white/20 hover:brightness-110 active:scale-95"
      initial={{ opacity: 0, scale: 0.7, y: 10 }}
      animate={reduced ? { opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: [1, 1.05, 1], y: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={
        reduced
          ? { duration: 0.15 }
          : { scale: { duration: 1.1, repeat: Infinity }, default: { duration: 0.2 } }
      }
    >
      {label}
    </motion.button>
  );
}

export interface ActionBarProps {
  scene: Scene;
  player: RoomPlayer | undefined;
  message: string;
  highlight: boolean;
  timer: TimerLike | null;
  bubble: Bubble | null;
  /** The confirm button: "Jogar 3 como Setes" (UI §3); `null` when it is not the viewer's turn. */
  play: {
    label: string;
    ready: boolean;
    /** The others may still doubt: the button fills up over this many ms, keyed by the play it waits on. */
    waiting: { key: number; ms: number } | null;
    busy: boolean;
    onPlay: () => void;
  } | null;
}

/** The viewer's own seat: avatar with the timer, status, cards held and the play button. */
export function ActionBar({ scene, player, message, highlight, timer, bubble, play }: ActionBarProps) {
  const seconds = useSecondsLeft(timer);
  const selfId = scene.selfId ?? 'self';
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(selfId));
  const me = scene.seats.find((s) => s.id === scene.selfId);
  const winner = scene.finishedOrder[0] === selfId;
  return (
    // Above the fanned cards, so the viewer's own bubble is never hidden behind them.
    <div className="relative z-[70] flex w-full max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-black/30 px-3 py-2 backdrop-blur-sm">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div ref={anchorRef} className="relative shrink-0">
          <TurnRing active={highlight} timer={timer} size={38}>
            <Avatar
              name={player?.username ?? 'Eu'}
              src={player?.avatarUrl}
              size={38}
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
          <p className="mt-0.5 flex items-center gap-2 text-xs text-ivory/60">
            {me?.finishedPosition ? (
              <span className="font-semibold text-gold">{me.finishedPosition}.º · sem cartas</span>
            ) : (
              <span className="tabular-nums">
                {plural(me?.handCount ?? scene.hand.length, 'carta', 'cartas')}
              </span>
            )}
            {seconds !== null && (
              <span className={clsx('tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>
                {seconds}s
              </span>
            )}
          </p>
        </div>
      </div>
      {play && (
        <Button
          onClick={play.onPlay}
          disabled={!play.ready || play.busy || play.waiting !== null}
          className="relative overflow-hidden max-sm:w-full"
        >
          {play.waiting && (
            <motion.span
              key={play.waiting.key}
              aria-hidden="true"
              className="absolute inset-y-0 left-0 bg-white/25"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: play.waiting.ms / 1000, ease: 'linear' }}
            />
          )}
          <span className="relative">{play.label}</span>
        </Button>
      )}
    </div>
  );
}
