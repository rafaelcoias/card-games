'use client';

import type { RoomPlayer } from '@cardroom/shared';
import {
  CardFan,
  CARD_WIDTH,
  cardHeight,
  fanStep,
  fanWidth,
  MotionCard,
  useAnchorRef,
  type CardSize,
} from '@cardroom/ui';
import clsx from 'clsx';
import { motion, useReducedMotion } from 'motion/react';
import { useState, type KeyboardEvent } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { TurnRing, useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { useElementWidth } from '../shared/use-element-width';
import { BidChip, PointsPips } from './badges';
import { atRisk, bidsBalance, plural } from './copy';
import { ANCHORS, dealDelaySeconds, type Scene, type SceneCard } from './scene';

const OVERLAP = 0.5;
const FAN_GUTTER = 12;

/** Avatar that doubles as the viewer's seat anchor (collected tricks fly here). */
function SelfAvatar({
  scene,
  player,
  active,
  timer,
}: {
  scene: Scene;
  player: RoomPlayer | undefined;
  active: boolean;
  timer: TimerLike | null;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.seat(scene.selfId ?? 'self'));
  const me = scene.seats.find((s) => s.id === scene.selfId);
  return (
    <div ref={anchorRef} className="shrink-0">
      <TurnRing active={active} timer={timer} size={38}>
        <Avatar
          name={player?.username ?? 'Eu'}
          src={player?.avatarUrl}
          size={38}
          className={clsx(me && atRisk(me.points, scene.maxPoints) && 'ring-danger!')}
        />
      </TurnRing>
    </div>
  );
}

export interface HandProps {
  cards: SceneCard[];
  size: CardSize;
  scene: Scene;
  selfIndex: number;
  playable: ReadonlySet<string> | null;
  selected: string | null;
  onSelect: (cardId: string | null) => void;
  onPlay: (cardId: string) => void;
}

/** The viewer's hand: tap to pick a card, tap it again (or press Jogar) to play it. */
export function Hand({ cards, size, scene, selfIndex, playable, selected, onSelect, onPlay }: HandProps) {
  const [measureRef, measured] = useElementWidth<HTMLDivElement>();
  const available = measured === null ? undefined : Math.max(0, measured - FAN_GUTTER);
  const scroll =
    available !== undefined &&
    fanWidth(cards.length, size, fanStep(cards.length, size, OVERLAP, available)) > available;

  const onKeyDown = (cardId: string) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (selected === cardId) onPlay(cardId);
      else onSelect(cardId);
    } else if (event.key === 'Escape') onSelect(null);
  };

  return (
    <div ref={measureRef} className="w-full">
      <div
        className={scroll ? 'scrollbar-none overflow-x-auto px-1 pb-1 pt-4' : 'flex justify-center pt-4'}
        role="group"
        aria-label={`A tua mão: ${plural(cards.length, 'carta', 'cartas')}`}
        style={{ minHeight: cardHeight(size) + 30 }}
      >
        <CardFan
          items={cards}
          size={size}
          flat={scroll}
          overlap={OVERLAP}
          maxWidth={scroll ? undefined : available}
          getKey={(c) => c.card.id}
          renderItem={({ card, enter }, placement, index) => {
            const canPlay = playable?.has(card.id) ?? false;
            const isSelected = selected === card.id;
            return (
              <div data-hand-card>
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
                  interactive={playable !== null}
                  state={
                    playable === null ? 'normal' : isSelected ? 'selected' : canPlay ? 'playable' : 'disabled'
                  }
                  onClick={() => {
                    if (!canPlay) return;
                    if (isSelected) onPlay(card.id);
                    else onSelect(card.id);
                  }}
                  onKeyDown={onKeyDown(card.id)}
                />
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}

/** Blind round: your own card, face down, raised "on your forehead" (UI §3). */
export function BlindCard({
  present,
  size,
  scene,
  selfIndex,
}: {
  present: boolean;
  size: CardSize;
  scene: Scene;
  selfIndex: number;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.selfBlind);
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="flex flex-col items-center gap-1 pt-2" style={{ minHeight: cardHeight(size) + 28 }}>
      <div ref={anchorRef} style={{ width: CARD_WIDTH[size], height: cardHeight(size) }}>
        {present && (
          <motion.div
            animate={reduced ? undefined : { y: [0, -4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          >
            <MotionCard
              faceDown
              size={size}
              label="A tua carta, virada para baixo"
              enter={
                scene.dealing
                  ? { from: ANCHORS.deck, kind: 'deal', delay: dealDelaySeconds(0, selfIndex, scene) }
                  : undefined
              }
            />
          </motion.div>
        )}
      </div>
      <p className="text-xs italic text-ivory/60">
        {present ? 'A tua carta — não a podes ver' : 'A tua carta já está na mesa'}
      </p>
    </div>
  );
}

export interface BidPanelProps {
  scene: Scene;
  player: RoomPlayer | undefined;
  validBids: ReadonlySet<number>;
  timer: TimerLike | null;
  busy: boolean;
  onBid: (bid: number) => void;
}

/**
 * Your turn to bid (UI §4): big buttons 0…N; the first tap picks, the second
 * confirms. With the last-bidder rule, the forbidden value is struck through.
 */
export function BidPanel({ scene, player, validBids, timer, busy, onBid }: BidPanelProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const seconds = useSecondsLeft(timer);
  const balance = bidsBalance(scene.bidsSum, scene.handSize);
  const options = Array.from({ length: scene.handSize + 1 }, (_, bid) => bid);
  const choice = picked !== null && validBids.has(picked) ? picked : null;

  return (
    <motion.div
      className="w-full max-w-3xl rounded-2xl bg-black/35 px-3 py-2.5 backdrop-blur-sm"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      role="group"
      aria-label="Aposta"
    >
      <div className="flex items-center gap-3">
        <SelfAvatar scene={scene} player={player} active timer={timer} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gold">A tua vez · quantas vazas vais fazer?</p>
          <p className="text-xs text-ivory/70">
            Apostas {scene.bidsSum} / {plural(scene.handSize, 'vaza', 'vazas')} ·{' '}
            <span
              className={
                balance.tone === 'over' ? 'text-danger' : balance.tone === 'even' ? 'text-success' : ''
              }
            >
              {balance.text}
            </span>
            {seconds !== null && (
              <span className={clsx('ml-2 tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/50')}>
                {seconds}s
              </span>
            )}
          </p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {options.map((bid) => {
          const allowed = validBids.has(bid);
          return (
            <button
              key={bid}
              type="button"
              disabled={!allowed || busy}
              aria-pressed={choice === bid}
              title={allowed ? `Apostar ${bid}` : 'O último a apostar não pode fechar a soma'}
              onClick={() => (choice === bid ? onBid(bid) : setPicked(bid))}
              className={clsx(
                'h-10 min-w-10 flex-1 rounded-xl text-lg font-bold tabular-nums transition-colors sm:h-11 sm:flex-none sm:px-4',
                choice === bid
                  ? 'bg-gold text-gold-ink shadow-[0_0_0_2px_rgb(0_0_0/0.35)]'
                  : allowed
                    ? 'bg-white/10 text-ivory hover:bg-white/20'
                    : 'cursor-not-allowed bg-white/5 text-ivory/30 line-through',
              )}
            >
              {bid}
            </button>
          );
        })}
        <Button
          className={clsx('ml-auto sm:basis-auto', options.length > 3 && 'basis-full')}
          disabled={choice === null || busy}
          onClick={() => choice !== null && onBid(choice)}
        >
          {choice === null ? 'Escolhe a aposta' : `Apostar ${choice}`}
        </Button>
      </div>
    </motion.div>
  );
}

export interface ActionBarProps {
  scene: Scene;
  player: RoomPlayer | undefined;
  message: string;
  highlight: boolean;
  timer: TimerLike | null;
  canPlay: boolean;
  busy: boolean;
  onPlay: () => void;
}

/** The viewer's own seat: status line, timer, pips and bid (UI §5, §8). */
export function ActionBar({
  scene,
  player,
  message,
  highlight,
  timer,
  canPlay,
  busy,
  onPlay,
}: ActionBarProps) {
  const seconds = useSecondsLeft(timer);
  const me = scene.seats.find((s) => s.id === scene.selfId);
  return (
    <div className="flex w-full max-w-3xl items-center gap-3 rounded-2xl bg-black/30 px-3 py-2 backdrop-blur-sm">
      <SelfAvatar scene={scene} player={player} active={highlight} timer={timer} />
      <div className="min-w-0 flex-1">
        <p
          className={clsx('truncate text-sm font-semibold', highlight ? 'text-gold' : 'text-ivory')}
          role="status"
        >
          {message}
        </p>
        <div className="mt-0.5 flex items-center gap-2">
          {me && <PointsPips points={me.points} max={scene.maxPoints} />}
          {seconds !== null && (
            <span className={clsx('text-xs tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>
              {seconds}s
            </span>
          )}
        </div>
      </div>
      {me && (
        <BidChip
          bid={me.bid}
          won={me.tricksWon}
          tricksLeft={scene.handSize - scene.tricksPlayed}
          playing={scene.phase !== 'BIDDING'}
          bidding={false}
        />
      )}
      {canPlay && (
        <Button onClick={onPlay} disabled={busy}>
          Jogar
        </Button>
      )}
    </div>
  );
}
