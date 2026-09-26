'use client';

import {
  Card,
  CARD_WIDTH,
  cardHeight,
  DrawPile,
  MotionCard,
  pileOffset,
  pileRotation,
  useAnchorRef,
  type CardSize,
} from '@cardroom/ui';
import { AnimatePresence, motion } from 'motion/react';
import { restrictionBadge } from './copy';
import { ANCHORS, type Scene } from './scene';

const VISIBLE_PILE = 7;

export function CenterArea({ scene, size, ticker }: { scene: Scene; size: CardSize; ticker: string | null }) {
  return (
    <div className="relative flex flex-col items-center gap-3">
      <Ticker text={ticker} />
      <div className="flex items-end justify-center gap-6 sm:gap-10">
        <DrawPile
          count={scene.drawCount}
          size={size}
          anchorId={ANCHORS.draw}
          label={`Baralho: ${scene.drawCount} cartas`}
        />
        <DiscardPile scene={scene} size={size} />
        <BurnCounter count={scene.burnCount} size={size} />
      </div>
    </div>
  );
}

function DiscardPile({ scene, size }: { scene: Scene; size: CardSize }) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.discard);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const visible = scene.discard.slice(-VISIBLE_PILE);
  const hiddenBelow = scene.discard.length - visible.length;
  const top = scene.discard.at(-1);

  return (
    <div className="cr-stack">
      <div
        ref={anchorRef}
        className="relative"
        style={{ width, height }}
        role="group"
        aria-label={top ? `Pilha de descarte: ${scene.discard.length} cartas` : 'Pilha de descarte vazia'}
      >
        <div className="cr-slot absolute inset-0" aria-hidden="true" />
        {hiddenBelow > 0 && (
          <div className="absolute inset-0" aria-hidden="true">
            <Card faceDown size={size} style={{ transform: 'rotate(-2deg)' }} label="" />
          </div>
        )}
        {visible.map(({ card, enter }, i) => {
          const offset = pileOffset(card.id);
          return (
            <div
              key={card.id}
              className="absolute left-0 top-0"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, zIndex: i + 1 }}
            >
              <MotionCard
                id={card.id}
                size={size}
                layoutId={`card-${card.id}`}
                enter={enter}
                rotate={pileRotation(card.id)}
              />
            </div>
          );
        })}
        <BurnAnimation scene={scene} size={size} />
      </div>
      <PileBadges scene={scene} />
    </div>
  );
}

function PileBadges({ scene }: { scene: Scene }) {
  const badge = scene.discard.length > 0 ? restrictionBadge(scene.restriction, scene.effectiveRank) : 'Livre';
  const restricted = badge !== 'Livre';
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
          scene.restriction === 'maxSeven'
            ? 'bg-[#3a2a6b] text-[#d9ccff]'
            : restricted
              ? 'bg-black/35 text-ivory'
              : 'bg-black/20 text-ivory/70'
        }`}
      >
        {badge}
      </span>
      {scene.sameRankRun >= 2 && scene.discard.length > 0 && (
        <span
          className="rounded-full bg-gold/20 px-2 py-0.5 text-xs font-bold text-gold"
          title="Cartas iguais seguidas"
        >
          ×{scene.sameRankRun}
        </span>
      )}
    </div>
  );
}

/** Pile shrinks and fades with a short flash (spec: 360 ms, easeIn). */
function BurnAnimation({ scene, size }: { scene: Scene; size: CardSize }) {
  const burning = scene.burning;
  return (
    <AnimatePresence>
      {burning && (
        <motion.div
          key={burning.key}
          className="pointer-events-none absolute inset-0"
          style={{ zIndex: 50 }}
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: 0, scale: 0.55 }}
          transition={{ duration: 0.36, ease: 'easeIn' }}
        >
          {burning.cards.slice(-VISIBLE_PILE).map((card) => {
            const offset = pileOffset(card.id);
            return (
              <div
                key={card.id}
                className="absolute left-0 top-0"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) rotate(${pileRotation(card.id)}deg)`,
                }}
              >
                <Card id={card.id} size={size} label="" />
              </div>
            );
          })}
          <span
            className="absolute -inset-8 animate-flash rounded-full bg-[radial-gradient(circle,rgb(255_214_120/0.9),rgb(255_120_40/0.4)_45%,transparent_70%)]"
            aria-hidden="true"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BurnCounter({ count, size }: { count: number; size: CardSize }) {
  return (
    <div className="cr-stack" aria-label={`${count} cartas queimadas`} role="group">
      <div
        className="flex items-center justify-center rounded-[var(--radius-card)] border border-white/10 bg-black/20 text-2xl"
        style={{ width: CARD_WIDTH[size] * 0.7, height: cardHeight(size) * 0.7 }}
        aria-hidden="true"
      >
        🔥
      </div>
      <span className="cr-count" aria-hidden="true">
        {count}
      </span>
    </div>
  );
}

function Ticker({ text }: { text: string | null }) {
  return (
    <div className="h-7" aria-live="polite">
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="rounded-full bg-black/30 px-3 py-1 text-sm font-medium text-ivory/95 backdrop-blur-sm"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
