'use client';

import type { CardInstance, DomainEvent } from '@cardroom/game-core';
import {
  rulesBadge,
  type PepeClientAction,
  type PepeEvent,
  type PepeView,
  type PileIndex,
} from '@cardroom/pepe-rapido';
import type { ErrorPayload, GameViewMessage, RoomPlayer } from '@cardroom/shared';
import {
  CARD_WIDTH,
  Card,
  MotionCard,
  cardHeight,
  stableJitter,
  useAnchorRef,
  useFlights,
  type CardSize,
} from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { describeError } from '@/lib/errors';
import { gameFeed } from '@/lib/realtime/game-feed';
import { toast } from '@/lib/toast';
import { Confetti } from '../desconfia/confetti';
import { playSound } from '../shared/sounds';
import { useElementSize } from '../shared/use-element-size';
import { useLatestGameView } from '../shared/use-game-view';
import { useOptimisticActions } from '../shared/use-optimistic';
import type { GameTableProps } from '../types';
import { pepeSizes, type PepeSizes } from './layout';
import { canPlayCentre, moveFor, pilesFor, sceneOf, type Scene, type Target } from './scene';

/** Blue felt (UI §1). */
const FELT = { '--color-felt': '#1E3A5F' } as CSSProperties;
/** A refused card goes back in 180 ms with a little shake, without a word (kit 04). */
const SHAKE = { x: [0, -7, 7, -4, 4, 0], transition: { duration: 0.18 } };
/** Codes that only mean "the other player was faster": the card goes back, nothing is said. */
const RACE_CODES = new Set(['TOP_CHANGED', 'CARD_MOVED', 'WRONG_PHASE', 'INVALID_MOVE', 'EMPTY_PILE']);
const DOUBLE_TAP_MS = 320;

const anchor = {
  reserve: (playerId: string) => `pepe-reserve:${playerId}`,
  pile: (pile: PileIndex) => `pepe-pile:${pile}`,
  side: (playerId: string) => `pepe-side:${playerId}`,
};

type Message = GameViewMessage<PepeView, PepeClientAction>;

export function PepeTable({ room, selfId, sendAction }: GameTableProps) {
  const message = useLatestGameView<PepeView, PepeClientAction>();
  const live = message && message.matchId === room.matchId ? message : null;
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const launch = useFlights();
  const [confetti, setConfetti] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const [shake, setShake] = useState<{ uid: string; key: number } | null>(null);
  const [recycles, setRecycles] = useState(0);

  // Events: sounds, the piles flying to their new owners, the round banner, confetti.
  useEffect(
    () =>
      gameFeed.subscribe((update) => {
        for (const event of update.events as (DomainEvent & PepeEvent)[]) {
          switch (event.type) {
            case 'Played':
              if (event.playerId !== selfId) playSound('play');
              break;
            case 'Flipped':
              playSound('flip');
              break;
            case 'Recycled':
              setRecycles((n) => n + 1);
              break;
            case 'PileChosen': {
              playSound('pickUp');
              const view = update.message.view as PepeView;
              const other = view.sides.find((s) => s.id !== event.playerId)?.id ?? '';
              const to = (pile: number) => anchor.side(pile === event.pile ? event.playerId : other);
              launch(
                [0, 1].flatMap((pile) =>
                  Array.from({ length: 5 }, (_, i) => ({
                    from: anchor.pile(pile as PileIndex),
                    to: to(pile),
                    size: 'sm' as const,
                    kind: 'pickUp' as const,
                    delay: i * 0.04,
                  })),
                ),
              );
              break;
            }
            case 'RoundSetUp':
              setBanner({ text: `Ronda ${event.round}`, key: Date.now() });
              playSound('handEnd');
              break;
            case 'GameWon':
              playSound('win');
              setConfetti(Date.now());
              break;
            case 'Grouped':
            case 'MovedToEmpty':
            case 'FlipRequested':
            case 'Stalled':
            case 'CountdownStarted':
            case 'ColumnsEmptied':
            case 'Deadlocked':
              break;
          }
        }
      }),
    [launch, selfId],
  );
  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 1600);
    return () => window.clearTimeout(timer);
  }, [banner]);

  const onRefused = useCallback((action: PepeClientAction, error: ErrorPayload) => {
    if ('cardUid' in action) setShake({ uid: action.cardUid, key: Date.now() });
    playSound('reject');
    if (!RACE_CODES.has(error.code)) toast.error(describeError(error));
  }, []);
  const send = useCallback((action: PepeClientAction) => sendAction(action), [sendAction]);
  const { pending, dispatch } = useOptimisticActions(send, live?.seq ?? 0, onRefused);

  if (!live) {
    return (
      <div className="felt flex h-full items-center justify-center" style={FELT}>
        <p className="animate-pulse text-ivory/70">A baralhar…</p>
      </div>
    );
  }
  return (
    <PepeTableView
      message={live}
      pendingActions={pending.map((p) => p.action)}
      players={players}
      selfId={selfId}
      dispatch={dispatch}
      shake={shake}
      banner={banner?.text ?? null}
      confetti={confetti}
      historyReset={recycles}
    />
  );
}

export interface PepeTableViewProps {
  message: Message;
  pendingActions: PepeClientAction[];
  players: Map<string, RoomPlayer>;
  selfId: string;
  dispatch: (action: PepeClientAction) => void;
  shake: { uid: string; key: number } | null;
  banner: string | null;
  confetti: number | null;
  /** Bumped when the centre went back under the columns: the piles start afresh. */
  historyReset: number;
}

export function PepeTableView({
  message,
  pendingActions,
  players,
  selfId,
  dispatch,
  shake,
  banner,
  confetti,
  historyReset,
}: PepeTableViewProps) {
  const { view } = message;
  const { config } = view;
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const sizes = useMemo(() => pepeSizes(arena?.width ?? 360, arena?.height ?? 600), [arena]);
  const scene = useMemo(() => sceneOf(view, pendingActions), [view, pendingActions]);
  const me = view.sides[0];
  const them = view.sides[1];
  const myPile = me.pile;
  const theirPile = them.pile;
  const nameOf = (id: string) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Adversário'));
  const opponent = nameOf(them.id);
  const live = view.phase === 'PLAYING' || view.phase === 'STALLED';

  const [selected, setSelected] = useState<{ column: number; at: number } | null>(null);
  const selectedColumn = selected && scene.mine[selected.column]?.top ? selected.column : null;
  const [dragging, setDragging] = useState<number | null>(null);
  const active = dragging ?? selectedColumn;

  const { history, seen } = useTableMemory(scene, historyReset);

  const targets = useRef(new Map<string, HTMLElement>());
  const registerTarget = useCallback(
    (key: string) => (element: HTMLElement | null) => {
      if (element) targets.current.set(key, element);
      else targets.current.delete(key);
    },
    [],
  );

  const tryMove = (column: number, target: Target): boolean => {
    const action = live ? moveFor(scene, column, target, config) : null;
    if (!action) return false;
    if (action.type === 'PLAY_TO_CENTRE') playSound('play');
    dispatch(action);
    setSelected(null);
    return true;
  };

  const autoPlay = (column: number) => {
    const [pile] = pilesFor(scene, column, config, theirPile);
    return pile !== undefined && tryMove(column, { kind: 'pile', pile });
  };

  const onCardTap = (column: number) => {
    if (!live) return;
    const now = performance.now();
    if (selected?.column === column && now - selected.at < DOUBLE_TAP_MS) {
      if (!autoPlay(column)) setSelected(null);
      return;
    }
    if (
      selectedColumn !== null &&
      selectedColumn !== column &&
      tryMove(selectedColumn, { kind: 'column', column })
    ) {
      return;
    }
    setSelected(
      selected?.column === column && now - selected.at >= DOUBLE_TAP_MS ? null : { column, at: now },
    );
  };

  const onDrop = (column: number, point: { x: number; y: number }) => {
    setDragging(null);
    for (const [key, element] of targets.current) {
      const r = element.getBoundingClientRect();
      const margin = 14;
      if (point.x < r.left - margin || point.x > r.right + margin) continue;
      if (point.y < r.top - margin || point.y > r.bottom + margin) continue;
      const [kind, index] = key.split(':');
      const target: Target =
        kind === 'pile'
          ? { kind: 'pile', pile: Number(index) as PileIndex }
          : { kind: 'column', column: Number(index) };
      if (target.kind === 'column' && target.column === column) continue;
      if (tryMove(column, target)) return;
    }
  };

  const onPileTap = (pile: PileIndex) => {
    if (view.canChoosePile) {
      dispatch({ type: 'CHOOSE_PILE', pile });
      return;
    }
    if (selectedColumn !== null) tryMove(selectedColumn, { kind: 'pile', pile });
  };

  const fitsPile = (pile: PileIndex) =>
    active !== null && live && moveFor(scene, active, { kind: 'pile', pile }, config) !== null;
  const fitsColumn = (column: number) =>
    active !== null && live && moveFor(scene, active, { kind: 'column', column }, config) !== null;

  const timer = useCountdown(message);
  const canFlip = live && view.flipRequired.includes(selfId) && !scene.wantsFlip;
  const flipRequired = view.flipRequired;
  const status = statusLine(view, scene, selfId, opponent, canPlayCentre(scene, config));
  const pilesOrder: PileIndex[] = [theirPile, myPile];

  // Space presses "Virar" (UI §4: always at hand).
  useEffect(() => {
    if (!canFlip) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [role="button"], button')) return;
      event.preventDefault();
      dispatch({ type: 'REQUEST_FLIP' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canFlip, dispatch]);

  return (
    <div className="felt relative flex h-full select-none flex-col overflow-hidden" style={FELT}>
      <div className="relative z-20 flex shrink-0 items-center gap-2 px-3 pt-2 text-xs">
        <span className="rounded-full bg-black/30 px-2.5 py-0.5 font-semibold text-ivory/85">
          Ronda {view.round}
        </span>
        <span
          className="ml-auto rounded-full bg-black/30 px-2.5 py-0.5 text-ivory/70"
          title="Regras desta partida"
        >
          {rulesBadge(config)}
        </span>
      </div>

      <div
        ref={arenaRef}
        className="relative flex min-h-0 flex-1 flex-col items-center justify-evenly px-3 py-2"
      >
        {arena && (
          <>
            <Side
              side={them}
              columns={scene.theirs}
              size={sizes.theirs}
              sizes={sizes}
              name={opponent}
              player={players.get(them.id)}
              flipNeeded={flipRequired.includes(them.id)}
              phase={view.phase}
              opponent
            />

            <div className="flex w-full flex-col items-center gap-2">
              <div className="flex items-center justify-center gap-4">
                <Reserve side={them} size={sizes.theirs} label={opponent} />
                {pilesOrder.map((pile) => (
                  <Pile
                    key={pile}
                    pile={pile}
                    size={sizes.mine}
                    top={scene.tops[pile]}
                    history={history[pile]}
                    count={view.centre[pile].count}
                    owner={pile === myPile ? me.id : them.id}
                    fromReserve={(uid) => !seen.has(uid)}
                    fits={fitsPile(pile)}
                    choosing={view.phase === 'CHOOSING_PILE'}
                    canChoose={view.canChoosePile}
                    targetRef={registerTarget(`pile:${pile}`)}
                    onTap={() => onPileTap(pile)}
                  />
                ))}
                <Reserve side={me} size={sizes.theirs} label="Tu" />
              </div>
              <div className="flex min-h-14 flex-col items-center justify-center gap-1">
                {live && (
                  <FlipButton
                    canFlip={canFlip}
                    waiting={scene.wantsFlip}
                    required={flipRequired.includes(selfId)}
                    stalled={view.phase === 'STALLED'}
                    autoFlip={config.autoFlip}
                    timer={view.phase === 'STALLED' ? timer : null}
                    onFlip={() => dispatch({ type: 'REQUEST_FLIP' })}
                  />
                )}
                <p className="min-h-5 text-center text-sm text-ivory/85" role="status" aria-live="polite">
                  {status}
                </p>
              </div>
              <AnimatePresence>
                {view.phase === 'COUNTDOWN' && timer && (
                  <CountdownOverlay key={`count-${view.flips}`} remainingMs={timer.remainingMs} />
                )}
              </AnimatePresence>
            </div>

            <Side
              side={me}
              columns={scene.mine}
              size={sizes.mine}
              sizes={sizes}
              name="Tu"
              player={players.get(selfId)}
              flipNeeded={flipRequired.includes(selfId)}
              phase={view.phase}
              interactive={live}
              selected={selectedColumn}
              dragging={dragging}
              fitsColumn={fitsColumn}
              shake={shake}
              registerTarget={registerTarget}
              onCardTap={onCardTap}
              onCardKey={(column, key) => {
                if (key === 'Enter' || key === ' ') onCardTap(column);
                else if (key === 'ArrowUp') autoPlay(column);
              }}
              onDragStart={(column) => {
                setSelected(null);
                setDragging(column);
              }}
              onDrop={onDrop}
            />
          </>
        )}
        <AnimatePresence>
          {banner && (
            <motion.div
              key={banner}
              className="pointer-events-none absolute inset-x-0 top-1/2 z-40 flex -translate-y-1/2 justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="rounded-2xl bg-black/55 px-6 py-3 font-display text-3xl font-semibold text-gold shadow-xl">
                {banner}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {confetti !== null && <Confetti key={confetti} burst={confetti} />}
      </div>
    </div>
  );
}

interface Memory {
  key: string;
  /** The last few tops of each pile, as drawn, so a covered card stays visible underneath. */
  history: [CardInstance[], CardInstance[]];
  /** Cards seen on top of a column: a centre top never seen there was turned over from a reserve. */
  seen: ReadonlySet<string>;
}

function remember(memory: Memory, scene: Scene, key: string): Memory {
  const fresh = memory.key !== key;
  const history = fresh ? [[], []] : memory.history;
  let changed = fresh;
  const piles = history.map((list, i) => {
    const top = scene.view.centre[i]?.top ?? null;
    if (!top) return list.length === 0 ? list : ((changed = true), []);
    if (list.at(-1)?.uid === top.uid) return list;
    changed = true;
    return [...list, top].slice(-4);
  }) as Memory['history'];
  const tops = [...scene.mine, ...scene.theirs].flatMap((c) => (c.top ? [c.top.uid] : []));
  const unseen = tops.filter((uid) => !memory.seen.has(uid));
  if (!changed && unseen.length === 0) return memory;
  return {
    key,
    history: piles,
    seen: unseen.length > 0 ? new Set([...memory.seen, ...unseen]) : memory.seen,
  };
}

/** What the table remembers between views (React's derived-state pattern: updated while rendering). */
function useTableMemory(scene: Scene, reset: number): Memory {
  const key = `${scene.view.round}:${reset}`;
  const [memory, setMemory] = useState<Memory>(() =>
    remember({ key, history: [[], []], seen: new Set() }, scene, key),
  );
  const next = remember(memory, scene, key);
  if (next !== memory) setMemory(next);
  return next;
}

interface Countdown {
  remainingMs: number;
  totalMs: number;
}

/** The platform's clock for the current phase, counting down from when its view arrived. */
function useCountdown(message: Message): Countdown | null {
  const [now, setNow] = useState(() => performance.now());
  const timer = message.timer;
  useEffect(() => {
    if (!timer) return;
    const id = window.setInterval(() => setNow(performance.now()), 100);
    return () => window.clearInterval(id);
  }, [timer]);
  if (!timer) return null;
  const elapsed = Math.max(0, now - gameFeed.arrivalOf(message));
  return { remainingMs: Math.max(0, timer.remainingMs - elapsed), totalMs: timer.totalMs };
}

function statusLine(
  view: PepeView,
  scene: Scene,
  selfId: string,
  opponent: string,
  canPlay: boolean,
): string {
  const them = view.sides[1];
  switch (view.phase) {
    case 'COUNTDOWN':
      return view.round > 1 || view.flips > 1
        ? 'Prontos…'
        : 'Prontos? Assim que virarem, joga o mais depressa que puderes!';
    case 'ROUND_SETUP':
      return `A preparar a ronda ${view.round}…`;
    case 'CHOOSING_PILE':
      return view.canChoosePile
        ? 'Esvaziaste as colunas! Escolhe o monte que queres levar.'
        : `${opponent} esvaziou as colunas e está a escolher um monte…`;
    case 'FINISHED':
      if (view.deadlock && !view.winner) return 'Ninguém consegue jogar: empate.';
      if (view.deadlock) {
        return view.winner === selfId
          ? 'Ninguém consegue jogar — ganhas por teres menos cartas! 🎉'
          : `Ninguém consegue jogar — ${opponent} ganha por ter menos cartas.`;
      }
      return view.winner === selfId
        ? 'Ficaste sem cartas — ganhaste! 🎉'
        : `${opponent} ficou sem cartas e ganhou.`;
    case 'STALLED':
    case 'PLAYING': {
      if (!view.flipRequired.includes(selfId)) {
        return view.phase === 'STALLED'
          ? `Não tens reserva: espera que ${opponent} vire.`
          : canPlay
            ? ''
            : 'Sem reserva: só vira o outro.';
      }
      if (scene.wantsFlip) return `À espera de ${opponent}…`;
      if (them.wantsFlip) return `${opponent} quer virar.`;
      if (view.phase === 'STALLED') {
        return view.config.autoFlip
          ? 'Ninguém pode jogar — a virar sozinho…'
          : 'Ninguém pode jogar: carrega em Virar.';
      }
      return '';
    }
  }
}

interface SideProps {
  side: PepeView['sides'][number];
  columns: Scene['mine'];
  size: CardSize;
  sizes: PepeSizes;
  name: string;
  player: RoomPlayer | undefined;
  flipNeeded: boolean;
  phase: PepeView['phase'];
  opponent?: boolean;
  interactive?: boolean;
  selected?: number | null;
  dragging?: number | null;
  fitsColumn?: (column: number) => boolean;
  shake?: { uid: string; key: number } | null;
  registerTarget?: (key: string) => (element: HTMLElement | null) => void;
  onCardTap?: (column: number) => void;
  onCardKey?: (column: number, key: string) => void;
  onDragStart?: (column: number) => void;
  onDrop?: (column: number, point: { x: number; y: number }) => void;
}

/** Five columns in a row (UI §1): the other player's on top, compact; yours at the bottom. */
function Side(props: SideProps) {
  const { side, columns, size, sizes, name, player, opponent = false } = props;
  const sideRef = useAnchorRef<HTMLDivElement>(anchor.side(side.id));
  const away = player?.connected === false;
  const label = (
    <div className="flex items-center gap-2 text-xs text-ivory/80">
      <span className={clsx('font-semibold', away && 'opacity-50')}>{name}</span>
      {away && <span className="rounded-full bg-danger/20 px-1.5 text-danger">desligado</span>}
      {side.wantsFlip && props.phase !== 'COUNTDOWN' && (
        <span className="rounded-full bg-gold/20 px-1.5 text-gold">quer virar</span>
      )}
      {side.totalCount !== null && (
        <span className="tabular-nums text-ivory/60">{side.totalCount} cartas</span>
      )}
    </div>
  );
  return (
    <div ref={sideRef} className="flex flex-col items-center gap-1">
      {opponent && label}
      <div className="flex items-start" style={{ gap: sizes.gap }}>
        {columns.map((column, i) => (
          <Column
            key={i}
            index={i}
            column={column}
            size={size}
            peek={sizes.peek(size)}
            mirrored={opponent}
            interactive={props.interactive ?? false}
            selected={props.selected === i}
            dragging={props.dragging === i}
            fits={props.fitsColumn?.(i) ?? false}
            shake={props.shake && column.top?.uid === props.shake.uid ? props.shake.key : null}
            targetRef={props.registerTarget?.(`col:${i}`)}
            onTap={() => props.onCardTap?.(i)}
            onKey={(key) => props.onCardKey?.(i, key)}
            onDragStart={() => props.onDragStart?.(i)}
            onDrop={(point) => props.onDrop?.(i, point)}
          />
        ))}
      </div>
      {!opponent && label}
    </div>
  );
}

interface ColumnProps {
  index: number;
  column: Scene['mine'][number];
  size: CardSize;
  peek: number;
  mirrored: boolean;
  interactive: boolean;
  selected: boolean;
  dragging: boolean;
  fits: boolean;
  shake: number | null;
  targetRef?: (element: HTMLElement | null) => void;
  onTap: () => void;
  onKey: (key: string) => void;
  onDragStart: () => void;
  onDrop: (point: { x: number; y: number }) => void;
}

/**
 * A column: the face-down cards show as thin edges (UI §1), the top card
 * nearest the centre. Yours can be dragged, tapped (then a target tapped) or
 * tapped twice to go to the pile where it fits.
 */
function Column({
  index,
  column,
  size,
  peek,
  mirrored,
  interactive,
  selected,
  dragging,
  fits,
  shake,
  targetRef,
  onTap,
  onKey,
  onDragStart,
  onDrop,
}: ColumnProps) {
  const reduced = useReducedMotion() ?? false;
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const backs = column.hidden;
  const total = height + 4 * peek;
  // Mirrored (the other player): edges above, the top card below, nearest the centre.
  const backY = (k: number) => (mirrored ? (column.hidden - 1 - k) * peek : (k + 1) * peek);
  const topY = mirrored ? column.hidden * peek : 0;
  const top = column.top;

  return (
    <div
      ref={targetRef}
      className={clsx(
        'relative rounded-lg transition-shadow',
        fits && 'shadow-[0_0_0_2px_rgb(232_193_112/0.85)]',
      )}
      style={{ width, height: total }}
      data-pepe-column={index}
    >
      {!top && column.hidden === 0 && (
        <div
          className="absolute rounded-lg border border-dashed border-ivory/20"
          style={{ width, height, top: mirrored ? 0 : 0 }}
          aria-hidden="true"
        />
      )}
      {Array.from({ length: backs }, (_, k) => (
        <div key={`back-${k}`} className="absolute left-0" style={{ top: backY(k), zIndex: 1 }}>
          <Card faceDown size={size} label="" />
        </div>
      ))}
      {top && (
        <motion.div
          key={top.uid}
          layoutId={`pepe-${top.uid}`}
          className={clsx('absolute left-0 touch-none', interactive && 'cursor-grab active:cursor-grabbing')}
          style={{ top: topY, zIndex: dragging ? 50 : 2 }}
          initial={reduced ? false : { rotateY: 90 }}
          animate={
            shake !== null && !reduced
              ? { ...SHAKE, rotateY: 0, y: 0 }
              : { rotateY: 0, x: 0, y: selected ? (mirrored ? 8 : -10) : 0 }
          }
          transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
          drag={interactive}
          dragSnapToOrigin
          dragElastic={0.9}
          dragMomentum={false}
          whileDrag={{ scale: 1.08, zIndex: 50 }}
          onDragStart={onDragStart}
          onDragEnd={(event) => {
            const e = event as PointerEvent;
            onDrop({ x: e.clientX, y: e.clientY });
          }}
          onTap={interactive ? onTap : undefined}
          role={interactive ? 'button' : undefined}
          tabIndex={interactive ? 0 : undefined}
          aria-pressed={interactive ? selected : undefined}
          aria-label={interactive ? `${cardName(top)}, coluna ${index + 1}` : undefined}
          onKeyDown={interactive ? (e) => onKey(e.key) : undefined}
          data-pepe-card={top.uid}
        >
          <Card
            id={top.id}
            size={size}
            state={selected ? 'selected' : 'normal'}
            label={interactive ? '' : undefined}
          />
        </motion.div>
      )}
    </div>
  );
}

function cardName(card: CardInstance): string {
  const names: Record<string, string> = { A: 'Ás', J: 'Valete', Q: 'Dama', K: 'Rei', JOKER: 'Joker' };
  const suits: Record<string, string> = { S: 'espadas', H: 'copas', D: 'ouros', C: 'paus' };
  const rank = names[card.rank] ?? card.rank;
  return card.suit ? `${rank} de ${suits[card.suit]}` : rank;
}

interface PileProps {
  pile: PileIndex;
  size: CardSize;
  top: CardInstance | null;
  history: CardInstance[];
  count: number | null;
  owner: string;
  fromReserve: (uid: string) => boolean;
  fits: boolean;
  choosing: boolean;
  canChoose: boolean;
  targetRef: (element: HTMLElement | null) => void;
  onTap: () => void;
}

/**
 * A centre pile: the cards that were covered stay a little askew underneath.
 * With hidden counts both piles look equally thick (UI §1); with counts on,
 * the thickness follows and a counter shows under it.
 */
function Pile({
  pile,
  size,
  top,
  history,
  count,
  owner,
  fromReserve,
  fits,
  choosing,
  canChoose,
  targetRef,
  onTap,
}: PileProps) {
  const anchorRef = useAnchorRef<HTMLButtonElement>(anchor.pile(pile));
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const under = history.filter((c) => c.uid !== top?.uid).slice(-3);
  const thickness = count === null ? 3 : Math.min(6, Math.ceil(count / 6));
  return (
    <div className="flex flex-col items-center gap-1">
      <motion.button
        type="button"
        ref={(element) => {
          anchorRef(element);
          targetRef(element);
        }}
        onClick={onTap}
        disabled={!canChoose && !fits}
        aria-label={
          canChoose ? `Levar o monte ${pile === 0 ? 'da esquerda' : 'da direita'}` : 'Monte central'
        }
        animate={{ scale: choosing ? 1.06 : 1 }}
        className={clsx(
          'relative rounded-xl transition-shadow disabled:cursor-default',
          fits && 'shadow-[0_0_0_3px_rgb(232_193_112/0.9)]',
          canChoose && 'cursor-pointer shadow-[0_0_0_3px_rgb(232_193_112/0.9)] hover:brightness-110',
        )}
        style={{ width, height }}
      >
        {Array.from({ length: thickness }, (_, i) => (
          <div
            key={`edge-${i}`}
            className="absolute rounded-lg bg-black/30"
            style={{ inset: 0, transform: `translate(${(i + 1) * 1.5}px, ${(i + 1) * 1.5}px)` }}
            aria-hidden="true"
          />
        ))}
        {!top && (
          <div
            className="absolute inset-0 rounded-lg border border-dashed border-ivory/25"
            aria-hidden="true"
          />
        )}
        {under.map((card) => (
          <div
            key={card.uid}
            className="absolute inset-0"
            style={{ transform: `rotate(${Math.round(stableJitter(card.uid) * 9)}deg)` }}
            aria-hidden="true"
          >
            <Card id={card.id} size={size} label="" />
          </div>
        ))}
        {top && (
          <div className="absolute inset-0" style={{ zIndex: 5 }}>
            <MotionCard
              key={top.uid}
              id={top.id}
              size={size}
              layoutId={`pepe-${top.uid}`}
              rotate={Math.round(stableJitter(top.uid) * 6)}
              enter={fromReserve(top.uid) ? { from: anchor.reserve(owner), kind: 'draw' } : undefined}
            />
          </div>
        )}
      </motion.button>
      {count !== null && <span className="text-xs tabular-nums text-ivory/70">{count}</span>}
    </div>
  );
}

/** A reserve, face down beside the piles; its thickness shows only when the room shows its count. */
function Reserve({ side, size, label }: { side: PepeView['sides'][number]; size: CardSize; label: string }) {
  const ref = useAnchorRef<HTMLDivElement>(anchor.reserve(side.id));
  const width = CARD_WIDTH[size];
  const height = cardHeight(size);
  const layers = !side.hasReserve
    ? 0
    : side.reserveCount === null
      ? 3
      : Math.max(1, Math.min(6, Math.ceil(side.reserveCount / 4)));
  return (
    <div className="flex flex-col items-center gap-1" aria-label={`Reserva: ${label}`}>
      <div ref={ref} className="relative" style={{ width, height }}>
        {layers === 0 && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg border border-dashed border-ivory/20 px-1 text-center text-[10px] text-ivory/50">
            sem reserva
          </div>
        )}
        {Array.from({ length: layers }, (_, i) => (
          <div key={i} className="absolute left-0" style={{ top: -i * 1.5, left: i * 1.5 }}>
            <Card faceDown size={size} label="" />
          </div>
        ))}
      </div>
      <span className="text-[11px] tabular-nums text-ivory/60">
        {side.reserveCount !== null ? `${side.reserveCount}` : side.hasReserve ? ' ' : ''}
      </span>
    </div>
  );
}

function FlipButton({
  canFlip,
  waiting,
  required,
  stalled,
  autoFlip,
  timer,
  onFlip,
}: {
  canFlip: boolean;
  waiting: boolean;
  required: boolean;
  stalled: boolean;
  autoFlip: boolean;
  timer: Countdown | null;
  onFlip: () => void;
}) {
  const reduced = useReducedMotion() ?? false;
  const progress = autoFlip && timer ? 1 - timer.remainingMs / Math.max(1, timer.totalMs) : null;
  const label = !required ? 'Sem reserva' : waiting ? 'À espera…' : 'Virar';
  return (
    <motion.button
      type="button"
      onClick={onFlip}
      disabled={!canFlip}
      aria-keyshortcuts="Space"
      className={clsx(
        'relative min-h-12 min-w-36 overflow-hidden rounded-full px-6 font-display text-lg font-semibold shadow-lg transition-colors',
        canFlip ? 'bg-gold text-ink hover:brightness-110' : 'bg-black/35 text-ivory/60',
      )}
      animate={stalled && canFlip && !reduced ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={stalled && canFlip ? { duration: 0.9, repeat: Infinity } : { duration: 0.15 }}
    >
      {progress !== null && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 bg-white/30"
          style={{ width: `${Math.min(100, progress * 100)}%` }}
        />
      )}
      <span className="relative">{label}</span>
    </motion.button>
  );
}

/** 3-2-1 over the piles (UI §4). */
function CountdownOverlay({ remainingMs }: { remainingMs: number }) {
  const n = Math.max(1, Math.ceil(remainingMs / 1000));
  useEffect(() => {
    playSound('tick');
  }, [n]);
  return (
    <motion.div
      className="pointer-events-none absolute inset-x-0 top-1/2 z-30 flex -translate-y-1/2 justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.4 }}
    >
      <AnimatePresence mode="popLayout">
        <motion.span
          key={n}
          className="font-display text-7xl font-bold text-gold drop-shadow-[0_4px_12px_rgb(0_0_0/0.6)]"
          initial={{ scale: 1.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {n}
        </motion.span>
      </AnimatePresence>
    </motion.div>
  );
}
