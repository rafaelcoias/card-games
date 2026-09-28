'use client';

import { Card, CARD_WIDTH, cardHeight, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ANCHORS, type Scene } from './scene';

/** The dealer (UI §7): name, speech bubble, cards and total; the hole card lifts its corner when they peek. */
export function DealerArea({
  scene,
  size,
  speech,
}: {
  scene: Pick<Scene, 'dealer' | 'dealerName' | 'peek' | 'phase'>;
  size: CardSize;
  speech: { text: string; key: number } | null;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.dealer);
  const { dealer } = scene;
  const width = CARD_WIDTH[size];
  const total =
    dealer.total === null
      ? null
      : dealer.busted
        ? 'REBENTOU'
        : dealer.blackjack
          ? 'BLACKJACK'
          : dealer.soft && dealer.total < 17 && dealer.cards.every((c) => c.card)
            ? `${dealer.total - 10} / ${dealer.total}`
            : String(dealer.total);

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center gap-2">
        <span
          className="inline-flex size-9 items-center justify-center rounded-full bg-[#101a14] text-base font-bold text-gold ring-2 ring-gold/50"
          aria-hidden="true"
        >
          {scene.dealerName.slice(0, 1)}
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">{scene.dealerName}</p>
          <p className="text-[10px] uppercase tracking-[0.18em] text-ivory/60">Banca</p>
        </div>
        {/* Beside the dealer; under the name on phones, where the side has no room. */}
        <div className="pointer-events-none absolute left-full top-0 z-40 ml-2 max-sm:left-1/2 max-sm:top-full max-sm:ml-0 max-sm:mt-1 max-sm:-translate-x-1/2">
          <AnimatePresence>
            {speech && (
              <motion.p
                key={speech.key}
                role="status"
                className="w-max max-w-[220px] rounded-2xl rounded-tl-sm bg-ivory px-3 py-1.5 text-sm font-medium text-ink shadow-lg max-sm:rounded-tl-2xl"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                {speech.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div
        ref={anchorRef}
        className="relative flex items-end justify-center"
        style={{ minHeight: cardHeight(size), minWidth: width * 2 }}
        aria-label={`Cartas da banca${total ? `: ${total}` : ''}`}
        role="group"
      >
        {dealer.cards.map((c, i) => (
          <div key={c.key} style={{ marginLeft: i === 0 ? 0 : -width * 0.35 }}>
            {i === 1 && !c.card ? (
              <HoleCard size={size} peek={scene.peek} enter={c.enter} />
            ) : (
              <MotionCard id={c.card?.id} faceDown={!c.card} size={size} enter={c.enter} />
            )}
          </div>
        ))}
      </div>
      <span
        className={clsx(
          'min-h-5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums leading-none',
          total === null
            ? 'invisible'
            : dealer.busted
              ? 'bg-danger text-white'
              : dealer.blackjack
                ? 'bg-gold text-gold-ink'
                : 'bg-black/45 text-ivory',
        )}
      >
        {total ?? '—'}
      </span>
    </div>
  );
}

/** The face-down card; on a peek it tips up at the corner for a moment and settles back. */
function HoleCard({
  size,
  peek,
  enter,
}: {
  size: CardSize;
  peek: number;
  enter: Parameters<typeof MotionCard>[0]['enter'];
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div
      key={peek}
      style={{ transformOrigin: 'bottom left', transformPerspective: 600 }}
      initial={false}
      animate={peek > 0 && !reduced ? { rotateX: [0, -24, 0], rotate: [0, -4, 0] } : undefined}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      <MotionCard faceDown size={size} enter={enter} label="Carta tapada da banca" />
    </motion.div>
  );
}

/**
 * The shoe (UI §1, §9): a discreet bar of cards left with the cut card marked;
 * it riffles while the dealer shuffles.
 */
export function Shoe({ scene, size }: { scene: Pick<Scene, 'shoe' | 'phase'>; size: CardSize }) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.shoe);
  const reduced = useReducedMotion() ?? false;
  const { remaining, total, cutAt, cutCardReached } = scene.shoe;
  const shuffling = scene.phase === 'SHUFFLING';
  const width = CARD_WIDTH[size];
  return (
    <div className="flex flex-col items-center gap-1" title={`${remaining} cartas no sapato`}>
      <div ref={anchorRef} className="relative" style={{ width: width + 10, height: cardHeight(size) }}>
        {shuffling && !reduced ? (
          <>
            {[0, 1].map((side) => (
              <motion.div
                key={side}
                className="absolute top-0"
                style={{ left: 5 }}
                animate={{
                  x: side === 0 ? [0, -16, 0, -16, 0] : [0, 16, 0, 16, 0],
                  rotate: side === 0 ? [0, -6, 0, -6, 0] : [0, 6, 0, 6, 0],
                }}
                transition={{ duration: 2, ease: 'easeInOut' }}
              >
                <Card faceDown size={size} label="" />
              </motion.div>
            ))}
          </>
        ) : (
          <div className="absolute inset-0 rounded-lg bg-[#2a1a10] shadow-[inset_0_2px_6px_rgb(0_0_0/0.6)] ring-1 ring-black/40">
            <div className="absolute right-1 top-1 -rotate-3">
              <Card faceDown size={size} label="" style={{ width: width - 4 }} />
            </div>
          </div>
        )}
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-black/40" aria-hidden="true">
        <motion.div
          className="h-full bg-ivory/70"
          initial={false}
          animate={{ width: `${(remaining / Math.max(1, total)) * 100}%` }}
          transition={{ duration: shuffling ? 1.8 : 0.3 }}
        />
        <span
          className="absolute inset-y-0 w-0.5 bg-danger"
          style={{ left: `${(cutAt / Math.max(1, total)) * 100}%` }}
        />
      </div>
      <span
        className={clsx(
          'text-[10px] font-semibold uppercase tracking-wide',
          cutCardReached ? 'text-danger' : 'text-ivory/55',
        )}
      >
        {shuffling ? 'A baralhar…' : cutCardReached ? 'Carta de corte' : 'Sapato'}
      </span>
    </div>
  );
}

/** Discard tray: cards of finished rounds, face down, with a count. */
export function Discard({ count, size }: { count: number; size: CardSize }) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.discard);
  const width = CARD_WIDTH[size];
  const layers = Math.min(5, Math.ceil(count / 20));
  return (
    <div className="flex flex-col items-center gap-1" title={`${count} cartas no descarte`}>
      <div ref={anchorRef} className="relative" style={{ width: width + 10, height: cardHeight(size) }}>
        {Array.from({ length: layers }, (_, i) => (
          <div
            key={i}
            className="absolute"
            style={{ left: 5 + i, top: -i * 2, transform: `rotate(${(i % 2 ? 1 : -1) * 3}deg)` }}
          >
            <Card faceDown size={size} label="" />
          </div>
        ))}
        {layers === 0 && <div className="cr-slot absolute inset-x-1 inset-y-0" />}
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ivory/55">
        Descarte · {count}
      </span>
    </div>
  );
}

/** Rules printed in an arc on the felt (UI §1). */
export function FeltPrint({ text, width }: { text: string; width: number }) {
  const height = Math.max(40, width * 0.16);
  const id = 'bj-felt-arc';
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="pointer-events-none select-none"
      aria-label={text}
      role="img"
    >
      <defs>
        <path
          id={id}
          d={`M ${width * 0.06} ${height * 0.2} Q ${width / 2} ${height * 1.25} ${width * 0.94} ${height * 0.2}`}
        />
      </defs>
      <text
        fill="rgb(244 239 227 / 0.38)"
        fontSize={Math.max(9, Math.min(15, width / 62))}
        fontWeight={700}
        letterSpacing="0.18em"
      >
        <textPath href={`#${id}`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
    </svg>
  );
}
