'use client';

import type { PlayerId } from '@cardroom/game-core';
import {
  powerOf,
  type GringoAction,
  type GringoClientAction,
  type GringoEvent,
  type GringoView,
} from '@cardroom/gringo';
import type { RoomPlayer } from '@cardroom/shared';
import { CARD_WIDTH, cardHeight } from '@cardroom/ui';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { Confetti } from '../desconfia/confetti';
import type { Bubble } from '../desconfia/seat';
import { tableGeometry } from '../fodinha/layout';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useTableLayout, useViewport } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { Center } from './center';
import { POWER_LABEL, POWER_PROMPT, POWER_RANKS, listNames, missing, points, slotLabel } from './copy';
import type { SlotMode } from './grid';
import { gringoSizes, seatBox, type Sizes } from './layout';
import { applyEvent, dealDurationMs, mySeat, sceneFromView, type Fx, type Scene } from './scene';
import { Seat, type Stamp } from './seat';
import { ActionBar, MyGrid } from './self-area';

const BUBBLE_MS = 1600;
const STAMP_MS = 1500;
const BOTTOM_ROW: ReadonlySet<number> = new Set([2, 3]);
const NONE: ReadonlySet<number> = new Set();

/** Olive felt (UI §1). */
const FELT = { '--color-felt': '#3b4a2a' } as CSSProperties;

export function useGringoSizes(playerCount: number): Sizes {
  const layout = useTableLayout();
  const { height } = useViewport();
  return useMemo(() => gringoSizes(layout, height, playerCount), [layout, height, playerCount]);
}

/** "Ana espreitou a carta [2] de Bruno." — from the viewer's point of view (UI §5). */
export function peekCaption(
  playerId: PlayerId,
  owner: PlayerId,
  index: number,
  selfId: string,
  nameOf: (id: PlayerId) => string,
): string {
  const whose = owner === playerId ? (playerId === selfId ? 'tua' : 'sua') : null;
  const card = whose
    ? `a ${whose} carta ${slotLabel(index)}`
    : `a carta ${slotLabel(index)} de ${owner === selfId ? 'ti' : nameOf(owner)}`;
  return playerId === selfId ? `Espreitaste ${card}.` : `${nameOf(playerId)} espreitou ${card}.`;
}

/** "Ana trocou a sua [1] com a [2] de Carla." */
export function swapCaption(
  playerId: PlayerId,
  myIndex: number,
  owner: PlayerId,
  theirIndex: number,
  selfId: string,
  nameOf: (id: PlayerId) => string,
): string {
  const theirs = `a ${slotLabel(theirIndex)} de ${owner === selfId ? 'ti' : nameOf(owner)}`;
  return playerId === selfId
    ? `Trocaste a tua ${slotLabel(myIndex)} com ${theirs}.`
    : `${nameOf(playerId)} trocou a sua ${slotLabel(myIndex)} com ${theirs}.`;
}

export function GringoTable({ room, selfId, sendAction }: GameTableProps) {
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = useCallback(
    (id: PlayerId) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Alguém')),
    [players, selfId],
  );
  const sizes = useGringoSizes(room.players.length);

  const [ticker, setTicker] = useState<{ text: string; key: number } | null>(null);
  const tickerTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string, ms = 2200) => {
    window.clearTimeout(tickerTimer.current);
    setTicker({ text, key: Date.now() });
    tickerTimer.current = window.setTimeout(() => setTicker(null), ms);
  }, []);

  const timers = useRef(new Map<string, number>());
  const later = useCallback((key: string, ms: number, run: () => void) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.set(key, window.setTimeout(run, ms));
  }, []);
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const say = useCallback(
    (playerId: PlayerId, text: string, tone: Bubble['tone'] = 'claim') => {
      setBubbles((current) => ({ ...current, [playerId]: { key: Date.now() + Math.random(), text, tone } }));
      later(`bubble:${playerId}`, BUBBLE_MS, () => setBubbles(({ [playerId]: _gone, ...rest }) => rest));
    },
    [later],
  );
  const [stamps, setStamps] = useState<Record<string, Stamp>>({});
  const stampOn = useCallback(
    (playerId: PlayerId, index: number, hit: boolean) => {
      setStamps((current) => ({ ...current, [playerId]: { key: Date.now(), hit, index } }));
      later(`stamp:${playerId}`, STAMP_MS, () => setStamps(({ [playerId]: _gone, ...rest }) => rest));
    },
    [later],
  );
  const [confetti, setConfetti] = useState<number | null>(null);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      window.clearTimeout(tickerTimer.current);
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, []);

  const onFx = useCallback(
    (fx: Fx) => {
      const me = (id: PlayerId) => id === selfId;
      switch (fx.kind) {
        case 'peekOver':
          announce('As cartas voltam a ficar viradas para baixo — agora é de memória!', 2400);
          break;
        case 'turn':
        case 'drew':
          if (fx.kind === 'drew') playSound('pickUp');
          break;
        case 'gringo':
          playSound('gringo');
          say(fx.playerId, 'Gringo!', 'doubt');
          announce(
            fx.remaining.length === 0
              ? `${me(fx.playerId) ? 'Disseste' : `${nameOf(fx.playerId)} disse`} Gringo!`
              : `Gringo! Última volta: ${missing(fx.remaining.map((id) => (me(id) ? 'tu' : nameOf(id))))}`,
            2800,
          );
          break;
        case 'discarded':
          playSound('play');
          break;
        case 'power':
          if (!me(fx.playerId)) announce(`${nameOf(fx.playerId)} vai ${POWER_LABEL[fx.power]}…`, 2000);
          break;
        case 'powerSkipped':
          if (!me(fx.playerId)) announce(`${nameOf(fx.playerId)} não usou o poder`, 1400);
          break;
        case 'peeked':
          announce(peekCaption(fx.playerId, fx.owner, fx.index, selfId, nameOf), 2600);
          break;
        case 'swapped':
          playSound('play');
          announce(swapCaption(fx.playerId, fx.myIndex, fx.owner, fx.theirIndex, selfId, nameOf), 2600);
          break;
        case 'kept':
          announce(me(fx.playerId) ? 'Não trocaste.' : `${nameOf(fx.playerId)} não trocou.`, 1600);
          break;
        case 'snapOpen':
          break;
        case 'snapHit':
          playSound('snap');
          stampOn(fx.playerId, fx.index, true);
          announce(
            me(fx.playerId)
              ? `Bateste a tua ${slotLabel(fx.index)}!`
              : `${nameOf(fx.playerId)} bateu a ${slotLabel(fx.index)}!`,
            1800,
          );
          break;
        case 'snapMiss':
          playSound('doubt');
          stampOn(fx.playerId, fx.index, false);
          announce(
            `${me(fx.playerId) ? 'Erraste' : `${nameOf(fx.playerId)} errou`}${fx.penalty ? ' — leva mais uma carta' : ''}`,
            2000,
          );
          break;
        case 'out':
          announce(
            me(fx.playerId) ? 'Ficaste sem cartas!' : `${nameOf(fx.playerId)} ficou sem cartas!`,
            2200,
          );
          break;
        case 'passed':
          say(fx.playerId, 'Passo');
          break;
        case 'finished': {
          const best = fx.scores[fx.winners[0] ?? ''] ?? 0;
          if (fx.winners.includes(selfId)) setConfetti(Date.now());
          playSound(fx.winners.includes(selfId) ? 'yourTurn' : 'pickUp');
          announce(
            fx.winners.length > 1
              ? `Empate a ${points(best)}: ${listNames(fx.winners.map((id) => (me(id) ? 'tu' : nameOf(id))))}`
              : fx.winners[0] === selfId
                ? `Ganhaste com ${points(best)} pontos!`
                : `${nameOf(fx.winners[0] ?? '')} ganha com ${points(best)} pontos`,
            5000,
          );
          break;
        }
      }
    },
    [announce, nameOf, say, selfId, stampOn],
  );

  const choreography = useMemo<Choreography<GringoView, GringoEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent,
      isOpeningDeal: (message) => message.seq === 0,
      dealDurationMs,
    }),
    [],
  );
  const { scene, validActions, timer, animating } = useDirector<
    GringoView,
    GringoAction,
    GringoEvent,
    Scene,
    Fx
  >(choreography, onFx);

  const myTurn = !animating && validActions.some((a) => a.type === 'DRAW' || a.type === 'PASS');
  useEffect(() => {
    if (myTurn) playSound('yourTurn');
  }, [myTurn]);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center" style={FELT}>
        <p className="animate-pulse text-ivory/70">A baralhar…</p>
      </div>
    );
  }
  return (
    <GringoTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      validActions={validActions as GringoClientAction[]}
      timer={timer}
      animating={animating}
      ticker={ticker?.text ?? null}
      bubbles={bubbles}
      stamps={stamps}
      confetti={confetti}
      nameOf={nameOf}
      sendAction={sendAction}
    />
  );
}

export interface GringoTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  validActions: GringoClientAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  ticker: string | null;
  bubbles: Record<string, Bubble>;
  stamps: Record<string, Stamp>;
  confetti: number | null;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
}

const key = (owner: PlayerId, index: number) => `${owner}:${index}`;

interface Picks {
  key: string;
  /** Jack: the viewer's card and the other player's, in whichever order they were tapped. */
  mine: number | null;
  theirs: { owner: PlayerId; index: number } | null;
  /** A snap waiting for its confirming second tap (UI §6). */
  armed: number | null;
}

export function GringoTableView({
  scene,
  selfId,
  players,
  sizes,
  validActions,
  timer,
  animating,
  ticker,
  bubbles,
  stamps,
  confetti,
  nameOf,
  sendAction,
}: GringoTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const [sending, setSending] = useState(false);
  const [picks, setPicks] = useState<Picks>({ key: '', mine: null, theirs: null, armed: null });

  const canAct = !animating && !sending;
  const actions = useMemo(() => (canAct ? validActions : []), [canAct, validActions]);
  const has = (type: GringoClientAction['type']) => actions.some((a) => a.type === type);
  const find = <T extends GringoClientAction['type']>(type: T) =>
    actions.find((a): a is Extract<GringoClientAction, { type: T }> => a.type === type);

  const swapInto = useMemo(
    () => new Set(actions.flatMap((a) => (a.type === 'SWAP_DRAWN' ? [a.index] : []))),
    [actions],
  );
  const snaps = useMemo(
    () => new Map(actions.flatMap((a) => (a.type === 'SNAP' ? [[a.index, a] as const] : []))),
    [actions],
  );
  const peeks = useMemo(
    () =>
      new Map(actions.flatMap((a) => (a.type === 'POWER_PEEK' ? [[key(a.owner, a.index), a] as const] : []))),
    [actions],
  );
  const blind = useMemo(() => actions.filter((a) => a.type === 'POWER_BLIND_SWAP'), [actions]);
  const blindMine = useMemo(() => new Set(blind.map((a) => a.myIndex)), [blind]);
  const blindTheirs = useMemo(() => new Set(blind.map((a) => key(a.owner, a.theirIndex))), [blind]);
  const kingSwaps = useMemo(
    () =>
      new Set(
        actions.flatMap((a) =>
          a.type === 'POWER_SWAP_DECISION' && a.swap && a.myIndex !== undefined ? [a.myIndex] : [],
        ),
      ),
    [actions],
  );
  const discardPlain = actions.find((a) => a.type === 'DISCARD_DRAWN' && !a.usePower);
  const discardPower = actions.find((a) => a.type === 'DISCARD_DRAWN' && a.usePower);
  const keep = actions.find((a) => a.type === 'POWER_SWAP_DECISION' && !a.swap);
  const skip = find('POWER_SKIP');

  // Choices in progress belong to one decision: a new one starts clean.
  const decisionKey = `${scene.matchId}:${scene.turn}:${scene.phase}:${scene.power?.step ?? ''}:${scene.snap?.discardId ?? ''}`;
  const current =
    picks.key === decisionKey ? picks : { key: decisionKey, mine: null, theirs: null, armed: null };

  const send = useCallback(
    async (action: GringoClientAction) => {
      if (!canAct) return;
      setSending(true);
      const ack = await sendAction(action);
      setSending(false);
      if (!ack.ok) toast.error(describeError(ack.error));
    },
    [canAct, sendAction],
  );

  const pickBlind = (mine: number | null, theirs: Picks['theirs']) => {
    if (mine !== null && theirs) {
      setPicks({ key: decisionKey, mine: null, theirs: null, armed: null });
      void send({ type: 'POWER_BLIND_SWAP', myIndex: mine, owner: theirs.owner, theirIndex: theirs.index });
      return;
    }
    setPicks({ key: decisionKey, mine, theirs, armed: null });
  };

  const myMode = (index: number): SlotMode => {
    if (snaps.has(index)) return current.armed === index ? 'armed' : 'target';
    if (swapInto.has(index) || kingSwaps.has(index) || peeks.has(key(selfId, index))) return 'target';
    if (blindMine.has(index)) return current.mine === index ? 'selected' : 'target';
    return 'none';
  };
  const onMine = (index: number) => {
    const snap = snaps.get(index);
    if (snap) {
      if (current.armed === index) {
        setPicks({ key: decisionKey, mine: null, theirs: null, armed: null });
        void send(snap);
      } else setPicks({ ...current, armed: index });
      return;
    }
    if (swapInto.has(index)) return void send({ type: 'SWAP_DRAWN', index });
    if (kingSwaps.has(index)) return void send({ type: 'POWER_SWAP_DECISION', swap: true, myIndex: index });
    const peek = peeks.get(key(selfId, index));
    if (peek) return void send(peek);
    if (blindMine.has(index)) pickBlind(current.mine === index ? null : index, current.theirs);
  };
  const theirMode =
    (owner: PlayerId) =>
    (index: number): SlotMode => {
      if (peeks.has(key(owner, index))) return 'target';
      if (blindTheirs.has(key(owner, index))) {
        return current.theirs?.owner === owner && current.theirs.index === index ? 'selected' : 'target';
      }
      return 'none';
    };
  const onTheirs = (owner: PlayerId) => (index: number) => {
    const peek = peeks.get(key(owner, index));
    if (peek) return void send(peek);
    if (blindTheirs.has(key(owner, index))) {
      const same = current.theirs?.owner === owner && current.theirs.index === index;
      pickBlind(current.mine, same ? null : { owner, index });
    }
  };

  const me = mySeat(scene);
  const opponents = useMemo(() => {
    const at = scene.seats.findIndex((s) => s.id === selfId);
    return at < 0 ? scene.seats : [...scene.seats.slice(at + 1), ...scene.seats.slice(0, at)];
  }, [scene.seats, selfId]);
  const theirBox = seatBox(sizes.theirs);
  const centerCard = useMemo(
    () => ({ width: CARD_WIDTH[sizes.center] * 3 + 40, height: cardHeight(sizes.center) + 40 }),
    [sizes.center],
  );
  const geometry = useMemo(
    () =>
      sizes.strip
        ? null
        : tableGeometry({
            arena: arena ?? { width: 0, height: 0 },
            seatIds: scene.seats.map((s) => s.id),
            selfId,
            seat: theirBox,
            card: centerCard,
          }),
    [arena, centerCard, scene.seats, selfId, sizes.strip, theirBox],
  );
  const stripHeight = theirBox.height + 16;
  const center = useMemo(() => {
    if (!arena) return null;
    const half = cardHeight(sizes.center) / 2;
    if (!geometry) return { x: arena.width / 2, y: stripHeight + (arena.height - stripHeight) / 2 };
    // Grids are taller than the other games' seats: keep the middle (and the snap ring with its
    // "Bater?" over the discard pile) clear of the topmost one.
    const top = Math.min(...[...geometry.seats.values()].map((p) => p.y));
    const ring = half * 1.64 + 28;
    const below = top + (theirBox.height * geometry.seatScale) / 2 + ring;
    const lowest = arena.height - half - 48;
    return { x: geometry.center.x, y: Math.min(lowest, Math.max(geometry.center.y, below)) };
  }, [arena, geometry, sizes.center, stripHeight, theirBox.height]);

  const target = scene.power?.target ?? null;
  const watchedIn = (owner: PlayerId) => (target?.owner === owner ? target.index : null);
  const finalOf = (id: PlayerId) =>
    scene.final ? { total: scene.final.scores[id] ?? 0, winner: scene.final.winners.includes(id) } : null;
  const deal = scene.dealing ? scene : null;
  const redKing = scene.final ? scene.rules.redKingValue : null;
  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;
  const memorising = scene.phase === 'INITIAL_PEEK' && me !== undefined && !me.peekDone;
  const myRaised = memorising ? BOTTOM_ROW : NONE;
  const gringoBy = scene.gringo?.calledBy ?? null;

  const seatFor = (seat: (typeof opponents)[number]) => (
    <Seat
      seat={seat}
      player={players.get(seat.id)}
      size={sizes.theirs}
      deal={deal}
      isTurn={scene.turnPlayerId === seat.id && scene.phase !== 'FINISHED'}
      timer={timer && timer.playerIds.includes(seat.id) ? timer : null}
      bubble={bubbles[seat.id] ?? null}
      gringo={gringoBy === seat.id}
      lastTurn={scene.gringo?.remaining.includes(seat.id) ?? false}
      peeking={scene.phase === 'INITIAL_PEEK'}
      watched={watchedIn(seat.id)}
      stamp={stamps[seat.id] ?? null}
      final={finalOf(seat.id)}
      redKingValue={redKing}
      modeOf={theirMode(seat.id)}
      onSelect={onTheirs(seat.id)}
    />
  );

  const hint =
    current.armed !== null && snaps.has(current.armed)
      ? `Toca outra vez para bater a ${slotLabel(current.armed)}`
      : current.mine !== null
        ? 'Agora toca numa carta de outro jogador'
        : current.theirs
          ? 'Agora toca numa carta tua'
          : null;

  const message = statusMessage(scene, selfId, actions, nameOf);
  const highlight = actions.length > 0;
  const canGringo = has('CALL_GRINGO');
  const turnsLeft = scene.gringoTurnsLeft;
  const myDrawTurn = has('DRAW') || has('PASS');

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden" style={FELT}>
      <TimeWarning timer={scene.phase === 'INITIAL_PEEK' ? null : pendingTimer} />
      <Banner scene={scene} nameOf={nameOf} selfId={selfId} />

      <div ref={arenaRef} className="relative min-h-0 flex-1">
        {sizes.strip && (
          <div className="scrollbar-none absolute inset-x-0 top-0 z-10 flex gap-2 overflow-x-auto px-2 pt-1">
            {opponents.map((seat) => (
              <div key={seat.id} className="shrink-0">
                {seatFor(seat)}
              </div>
            ))}
          </div>
        )}
        {arena && center && (
          <Center
            scene={scene}
            center={center}
            size={sizes.center}
            caption={ticker}
            onDraw={has('DRAW') ? () => void send({ type: 'DRAW' }) : null}
          />
        )}
        {geometry &&
          opponents.map((seat) => {
            const point = geometry.seats.get(seat.id);
            if (!point) return null;
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
                {seatFor(seat)}
              </div>
            );
          })}
        {confetti !== null && <Confetti key={confetti} burst={confetti} />}
      </div>

      <div className="relative z-20 flex shrink-0 flex-col items-center gap-1.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {me && (
          <MyGrid
            seat={me}
            size={sizes.mine}
            deal={deal}
            modeOf={myMode}
            onSelect={onMine}
            raised={myRaised}
            watched={watchedIn(me.id)}
            stamp={stamps[me.id] ?? null}
            redKingValue={redKing}
            memorise={memorising ? pendingTimer : null}
            hint={hint}
          />
        )}
        <ActionBar
          scene={scene}
          player={players.get(selfId)}
          message={message}
          highlight={highlight}
          timer={pendingTimer}
          bubble={bubbles[selfId] ?? null}
          gringo={gringoBy === selfId}
          final={finalOf(selfId)}
        >
          {has('PEEK_DONE') && <Button onClick={() => void send({ type: 'PEEK_DONE' })}>Memorizei</Button>}
          {canGringo && (
            <Button variant="danger" onClick={() => void send({ type: 'CALL_GRINGO' })}>
              Gringo!
            </Button>
          )}
          {myDrawTurn && !canGringo && turnsLeft !== null && turnsLeft > 0 && (
            <span className="flex items-center justify-center whitespace-nowrap rounded-xl bg-black/25 px-3 text-xs text-ivory/60">
              Gringo · {turnsLeft === 1 ? 'falta 1 volta' : `faltam ${turnsLeft} voltas`}
            </span>
          )}
          {has('DRAW') && <Button onClick={() => void send({ type: 'DRAW' })}>Tirar carta</Button>}
          {has('PASS') && (
            <Button variant="secondary" onClick={() => void send({ type: 'PASS' })}>
              Passar
            </Button>
          )}
          {discardPlain && (
            <Button variant={discardPower ? 'secondary' : 'primary'} onClick={() => void send(discardPlain)}>
              Descartar
            </Button>
          )}
          {discardPower && scene.drawn?.face && (
            <PowerButton label={powerOfDrawn(scene)} onClick={() => void send(discardPower)} />
          )}
          {skip && (
            <Button variant="secondary" onClick={() => void send(skip)}>
              Não usar
            </Button>
          )}
          {keep && (
            <Button variant="secondary" onClick={() => void send(keep)}>
              Não trocar
            </Button>
          )}
        </ActionBar>
      </div>
    </div>
  );
}

/** The power of the card the viewer holds, for its button ("Descartar e espreitar…"). */
function powerOfDrawn(scene: Scene): string {
  const face = scene.drawn?.face;
  const type = face ? powerOf(face, scene.rules.powerSet) : null;
  return type ? POWER_LABEL[type] : 'usar o poder';
}

function PowerButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 480, damping: 28 }}
    >
      <Button onClick={onClick} className="w-full">
        <span aria-hidden="true">✨</span> Descartar e {label}
      </Button>
    </motion.div>
  );
}

/** Rules of the room, and the last round after a "Gringo" (UI §7). */
function Banner({ scene, nameOf, selfId }: { scene: Scene; nameOf: (id: string) => string; selfId: string }) {
  const { rules, gringo } = scene;
  const notes = [
    `Poderes ${POWER_RANKS[rules.powerSet]}`,
    `Rei ♥♦ ${points(rules.redKingValue)}`,
    rules.gringoEnabled
      ? `Gringo a partir de ${rules.gringoMinTurns} ${rules.gringoMinTurns === 1 ? 'volta' : 'voltas'}`
      : 'Sem Gringo',
    rules.decks === 2 ? '2 baralhos' : null,
  ].filter((note): note is string => note !== null);
  const remaining = gringo?.remaining.map((id) => (id === selfId ? 'tu' : nameOf(id))) ?? [];
  return (
    <div className="relative z-30 flex shrink-0 flex-col gap-1 px-3 pt-2">
      <div className="flex items-center gap-1.5 overflow-hidden">
        <span className="whitespace-nowrap rounded-full bg-black/35 px-2.5 py-0.5 text-xs font-semibold text-ivory/85 backdrop-blur-sm">
          {scene.phase === 'INITIAL_PEEK' ? 'A memorizar' : `Vez ${Math.max(1, scene.turn)}`}
        </span>
        <div className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          {notes.map((note) => (
            <span
              key={note}
              className="whitespace-nowrap rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-ivory/60"
            >
              {note}
            </span>
          ))}
        </div>
      </div>
      <AnimatePresence>
        {gringo && scene.phase !== 'FINISHED' && (
          <motion.p
            key="gringo"
            role="status"
            className="flex items-center justify-center gap-2 self-center rounded-full bg-danger/90 px-3 py-1 text-xs font-bold text-white shadow-lg"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <span className="font-display font-black uppercase tracking-wide">
              Gringo de {gringo.calledBy === selfId ? 'ti' : nameOf(gringo.calledBy)}
            </span>
            <span className="opacity-90">
              {remaining.length > 0 ? `Última volta · ${missing(remaining)}` : 'Acabou a volta'}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

function statusMessage(
  scene: Scene,
  selfId: string,
  actions: readonly GringoClientAction[],
  nameOf: (id: string) => string,
): string {
  const me = mySeat(scene);
  const can = (type: GringoClientAction['type']) => actions.some((a) => a.type === type);
  const turnPlayer = scene.turnPlayerId;
  const mine = turnPlayer === selfId;
  const name = turnPlayer ? nameOf(turnPlayer) : '';
  switch (scene.phase) {
    case 'FINISHED': {
      const final = scene.final;
      if (!final) return 'Fim do jogo';
      const best = points(final.scores[final.winners[0] ?? ''] ?? 0);
      if (final.winners.includes(selfId)) {
        return final.winners.length > 1
          ? `Empate a ${best} — ganhaste! 🎉`
          : `Ganhaste com ${best} pontos! 🎉`;
      }
      return `Fim — ${listNames(final.winners.map(nameOf))} ${final.winners.length > 1 ? 'ganham' : 'ganha'} com ${best}`;
    }
    case 'INITIAL_PEEK':
      return me?.peekDone ? 'À espera que os outros memorizem…' : 'Memoriza as tuas cartas [3] e [4]!';
    case 'SNAP_WINDOW': {
      const result = scene.snap?.result;
      if (result) {
        const who = result.playerId === selfId;
        if (result.hit) return who ? 'Bateste!' : `${nameOf(result.playerId)} bateu!`;
        return who ? 'Erraste — levas mais uma carta' : `${nameOf(result.playerId)} errou`;
      }
      if (can('SNAP')) return 'Bater? Toca duas vezes numa carta tua igual à do descarte';
      return 'Alguém bate?';
    }
    case 'TURN_DRAW':
      if (!mine) return `Vez de ${name}`;
      if (me && me.cardCount === 0) return 'Não tens cartas — podes dizer Gringo';
      return can('CALL_GRINGO')
        ? 'A tua vez · tira uma carta, ou diz Gringo'
        : 'A tua vez · toca no baralho para tirar uma carta';
    case 'TURN_DECIDE':
      return mine ? 'Troca com uma carta tua, ou descarta' : `${name} tirou uma carta…`;
    case 'POWER': {
      const power = scene.power;
      if (!power) return '…';
      if (!mine) {
        return power.step === 'PEEKED' && power.target
          ? `${name} está a espreitar…`
          : `${name} vai ${POWER_LABEL[power.type]}…`;
      }
      if (power.step === 'PEEKED') {
        return power.type === 'PEEK_AND_SWAP' ? 'Trocas por uma tua? Toca nela, ou não troques' : 'Memoriza!';
      }
      return POWER_PROMPT[power.type];
    }
  }
}
