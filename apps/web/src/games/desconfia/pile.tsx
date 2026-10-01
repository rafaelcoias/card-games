'use client';

import type { StandardRank } from '@cardroom/game-core';
import { Card, CARD_WIDTH, cardHeight, MotionCard, useAnchorRef, type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { memo, useEffect, useState, type CSSProperties } from 'react';
import { claimLine, plural, rankPlural } from './copy';
import { pileSpot } from './layout';
import { ANCHORS, pileLayoutId, type PileCard, type RevealScene, type Scene } from './scene';

interface Point {
  x: number;
  y: number;
}

export interface CenterProps {
  scene: Pick<
    Scene,
    | 'matchId'
    | 'pile'
    | 'claimRank'
    | 'pilePlays'
    | 'doubtWindow'
    | 'reveal'
    | 'showcase'
    | 'lastCardWindowMs'
    | 'phase'
  >;
  center: Point;
  pileSize: CardSize;
  revealSize: CardSize;
  nameOf: (id: string) => string;
  caption: string | null;
}

/** The middle of the table (UI §1, §4, §6, §8): what the pile is in, the pile, the reveal and the caption. */
export function Center({ scene, center, pileSize, revealSize, nameOf, caption }: CenterProps) {
  const width = CARD_WIDTH[pileSize];
  const height = cardHeight(pileSize);
  const spread = width * 0.55;
  const top = center.y - height / 2 - spread * 0.55 - 10;
  const bottom = center.y + height / 2 + spread * 0.55 + 8;
  const recent = scene.pilePlays.slice(-3).reverse();
  const lastCard = scene.doubtWindow?.lastCard ? scene.doubtWindow : null;

  return (
    <>
      {/* Hidden while cards are shown over the pile, and once the game is over. */}
      {!scene.reveal && !scene.showcase && scene.phase === 'PLAYING' && (
        <ClaimBanner rank={scene.claimRank} at={{ x: center.x, y: top }} empty={scene.pile.length === 0} />
      )}
      <Pile scene={scene} center={center} size={pileSize} spread={spread} />
      {lastCard && (
        <LastCardRing
          key={lastCard.playId}
          center={center}
          radius={Math.max(width, height) * 0.95}
          ms={scene.lastCardWindowMs}
        />
      )}
      {recent.length > 0 && (
        <ol
          className="pointer-events-none absolute z-[2] flex -translate-x-1/2 flex-col items-center gap-0.5"
          style={{ left: center.x, top: bottom + 26 }}
          aria-label="Últimas jogadas desta pilha"
        >
          {recent.map((play, i) => (
            <li
              key={play.playId}
              className={clsx(
                'whitespace-nowrap rounded-full px-2 text-[11px] leading-5 tabular-nums',
                i === 0 ? 'bg-black/40 font-semibold text-ivory' : 'text-ivory/55',
              )}
            >
              {nameOf(play.playerId)} · {claimLine(play.count, play.claimRank)}
            </li>
          ))}
        </ol>
      )}
      <Stage scene={scene} at={{ x: center.x, y: center.y - height * 0.15 }} size={revealSize} />
      <Caption text={caption} at={{ x: center.x, y: bottom + (recent.length > 0 ? 14 : 22) }} />
    </>
  );
}

/** "A pilha está em Setes" — or a new pile, any rank (UI §1). */
function ClaimBanner({ rank, at, empty }: { rank: StandardRank | null; at: Point; empty: boolean }) {
  return (
    <div
      className="pointer-events-none absolute z-[3] -translate-x-1/2 -translate-y-full"
      style={{ left: at.x, top: at.y }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={rank ?? 'free'}
          className={clsx(
            'whitespace-nowrap rounded-full px-3 py-1 text-sm shadow-lg backdrop-blur-sm',
            rank ? 'bg-black/50 text-ivory' : 'bg-white/10 text-ivory/80',
          )}
          initial={{ opacity: 0, y: 6, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
        >
          {rank ? (
            <>
              A pilha está em <strong className="font-display text-base text-gold">{rankPlural(rank)}</strong>
            </>
          ) : empty ? (
            'Pilha nova · valor livre'
          ) : (
            'Valor livre'
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/** Face-down, messy, with a big count (UI §1). Registers the pile anchor. */
function Pile({
  scene,
  center,
  size,
  spread,
}: {
  scene: Pick<Scene, 'matchId' | 'pile'>;
  center: Point;
  size: CardSize;
  spread: number;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.pile);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const count = scene.pile.length;
  return (
    <>
      <div
        ref={anchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ left: center.x - width / 2, top: center.y - height / 2, width, height }}
      >
        {count === 0 && <div className="cr-slot size-full opacity-60" />}
      </div>
      {scene.pile.map((entry) => (
        <PileCardView
          key={entry.key}
          entry={entry}
          matchId={scene.matchId}
          center={center}
          size={size}
          spread={spread}
        />
      ))}
      {count > 0 && (
        <motion.span
          key={count}
          role="status"
          aria-label={`Pilha: ${plural(count, 'carta', 'cartas')}`}
          className="pointer-events-none absolute z-[4] flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink/85 font-display text-lg font-semibold tabular-nums text-ivory shadow-lg ring-2 ring-white/15"
          style={{ left: center.x + width / 2 + 4, top: center.y + height / 2 - 4 }}
          initial={{ scale: 1.35 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        >
          {count}
        </motion.span>
      )}
    </>
  );
}

const PileCardView = memo(function PileCardView({
  entry,
  matchId,
  center,
  size,
  spread,
}: {
  entry: PileCard;
  matchId: string;
  center: Point;
  size: CardSize;
  spread: number;
}) {
  const spot = pileSpot(matchId, entry.key, spread);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: center.x + spot.x - width / 2, top: center.y + spot.y - height / 2 }}
    >
      <MotionCard
        id={entry.card?.id}
        faceDown
        size={size}
        layoutId={pileLayoutId(entry)}
        enter={entry.enter}
        rotate={spot.rotate}
        label=""
      />
    </div>
  );
});

/**
 * The 3 s of a last card (UI §8): a ring that empties around the pile while
 * anyone may still doubt it.
 */
function LastCardRing({ center, radius, ms }: { center: Point; radius: number; ms: number }) {
  const reduced = useReducedMotion() ?? false;
  const box = radius * 2 + 8;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg
      aria-hidden="true"
      width={box}
      height={box}
      className="pointer-events-none absolute z-[1] -rotate-90"
      style={{ left: center.x - box / 2, top: center.y - box / 2 }}
    >
      <circle cx={box / 2} cy={box / 2} r={radius} fill="none" stroke="rgb(0 0 0 / 0.3)" strokeWidth={5} />
      <circle
        cx={box / 2}
        cy={box / 2}
        r={radius}
        fill="none"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={circumference}
        className="stroke-gold"
        style={
          {
            strokeDashoffset: 0,
            animation: reduced ? undefined : `cr-countdown ${ms}ms linear forwards`,
            '--cr-from': '0px',
            '--cr-to': `${circumference}px`,
          } as CSSProperties
        }
      />
    </svg>
  );
}

/**
 * Over the pile: a doubted play lifting out, turning over one card after the
 * other and stamped TRUE or LIE (UI §6); or four of a kind on their way out (UI §7).
 */
function Stage({
  scene,
  at,
  size,
}: {
  scene: Pick<Scene, 'reveal' | 'showcase'>;
  at: Point;
  size: CardSize;
}) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.reveal);
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const reveal = scene.reveal;
  const showcase = scene.showcase;
  const count = reveal?.cards.length ?? showcase?.cards.length ?? 0;
  const step = width * (count > 6 ? 0.32 : 0.6);
  const offset = (i: number) => (i - (count - 1) / 2) * step;
  return (
    <div
      ref={anchorRef}
      className="pointer-events-none absolute z-30"
      style={{ left: at.x - width / 2, top: at.y - height / 2, width, height }}
    >
      {reveal?.cards.map((c, i) => (
        <div
          key={c.key}
          className="absolute left-0 top-0"
          style={{ transform: `translate(${offset(i)}px, -18px)` }}
        >
          <RevealCard
            card={c}
            index={i}
            size={size}
            stage={reveal.stage}
            rotate={(i - (count - 1) / 2) * 5}
          />
        </div>
      ))}
      {showcase?.cards.map(({ card, enter }, i) => (
        <div
          key={`${showcase.key}:${card.id}`}
          className="absolute left-0 top-0"
          style={{ transform: `translateX(${offset(i)}px)` }}
        >
          <MotionCard
            id={card.id}
            size={size}
            layoutId={`card-${card.id}`}
            enter={enter}
            rotate={(i - 1.5) * 9}
          />
        </div>
      ))}
      <AnimatePresence>
        {reveal?.stage === 'stamp' && <Stamp key={reveal.playId} truthful={reveal.truthful} />}
      </AnimatePresence>
    </div>
  );
}

/** Turns over `80 ms × index` after the flip starts (UI §10). */
function RevealCard({
  card,
  index,
  size,
  stage,
  rotate,
}: {
  card: RevealScene['cards'][number];
  index: number;
  size: CardSize;
  stage: RevealScene['stage'];
  rotate: number;
}) {
  const [faceUp, setFaceUp] = useState(false);
  useEffect(() => {
    if (stage === 'lift') return;
    const timer = window.setTimeout(() => setFaceUp(true), stage === 'flip' ? index * 80 : 0);
    return () => window.clearTimeout(timer);
  }, [stage, index]);
  return (
    <MotionCard id={card.card.id} faceDown={!faceUp} size={size} layoutId={card.layoutId} rotate={rotate} />
  );
}

/** VERDADE! in green or MENTIRA! in red, slammed on top of the cards (UI §6). */
function Stamp({ truthful }: { truthful: boolean }) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.p
      role="status"
      className={clsx(
        'absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg border-[3px] px-3 py-0.5 font-display text-2xl font-black uppercase tracking-wider shadow-2xl',
        truthful ? 'border-success bg-success/20 text-success' : 'border-danger bg-danger/20 text-danger',
      )}
      style={{ textShadow: '0 2px 8px rgb(0 0 0 / 0.6)', backdropFilter: 'blur(2px)' }}
      initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 2.2, rotate: -14 }}
      animate={{ opacity: 1, scale: 1, rotate: -8 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
    >
      {truthful ? 'Verdade!' : 'Mentira!'}
    </motion.p>
  );
}

/** Short announcements under the pile ("Carla acertou. Recomeça a Carla."). */
function Caption({ text, at }: { text: string | null; at: Point }) {
  return (
    <div
      className="pointer-events-none absolute z-40 flex -translate-x-1/2 -translate-y-1/2 justify-center"
      style={{ left: at.x, top: at.y }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait">
        {text && (
          <motion.p
            key={text}
            className="w-max max-w-[min(88vw,26rem)] rounded-2xl bg-black/65 px-3 py-1 text-center text-sm font-semibold text-ivory shadow-lg backdrop-blur-sm"
            initial={{ opacity: 0, y: 6, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.18 }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/** "Fora de jogo" (UI §1): the ranks already out in peixinhos. Registers where removed cards fly to. */
export function RemovedStrip({ ranks }: { ranks: readonly StandardRank[] }) {
  const anchorRef = useAnchorRef<HTMLDivElement>(ANCHORS.removed);
  return (
    <div
      ref={anchorRef}
      className="flex shrink-0 items-center gap-1 rounded-full bg-black/30 py-0.5 pl-2.5 pr-1 text-xs backdrop-blur-sm"
      title="Valores que já saíram em peixinho"
    >
      <span className="text-ivory/60">Fora de jogo</span>
      {ranks.length === 0 ? (
        <span className="px-1 text-ivory/40">—</span>
      ) : (
        <AnimatePresence initial={false}>
          {ranks.map((rank) => (
            <motion.span
              key={rank}
              initial={{ scale: 1.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 20 }}
              aria-label={rankPlural(rank)}
            >
              <Card id={`${rank}S`} size="xs" label="" style={{ width: 16, height: 22, borderRadius: 3 }} />
            </motion.span>
          ))}
        </AnimatePresence>
      )}
    </div>
  );
}
