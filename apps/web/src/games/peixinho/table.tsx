'use client';

import type { StandardRank } from '@cardroom/game-core';
import type { PeixinhoAction, PeixinhoEvent, PeixinhoView } from '@cardroom/peixinho';
import type { RoomPlayer } from '@cardroom/shared';
import { CARD_WIDTH, cardHeight, useFlights } from '@cardroom/ui';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { tableGeometry, type Box } from '../fodinha/layout';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useTableLayout, useViewport } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { answerLine, listNames, rankPlural } from './copy';
import { peixinhoSizes, type SeatVariant, type Sizes } from './layout';
import { MemoryList, MemoryPopover, ScoreBanner } from './memory';
import { Pond } from './pond';
import {
  ANCHORS,
  applyEvent,
  dealDurationMs,
  DEAL_STAGGER_S,
  sceneFromView,
  type Fx,
  type Scene,
} from './scene';
import { Seat, type Bubble, type TargetState } from './seat';
import { ActionBar, Hand } from './self-area';

const SEAT_BOX: Record<SeatVariant, Box> = {
  regular: { width: 180, height: 104 },
  compact: { width: 112, height: 132 },
};

/** Bubbles stay up long enough to read (UI §9: 900 ms for the answer, a little more to breathe). */
const BUBBLE_MS = 1700;

/** Teal felt: the lake's table, told apart from the other games at a glance (UI §1). */
const FELT = { '--color-felt': '#1d5c63' } as CSSProperties;

export function usePeixinhoSizes(playerCount: number): Sizes {
  const layout = useTableLayout();
  const { height } = useViewport();
  return useMemo(() => peixinhoSizes(layout, height, playerCount), [layout, height, playerCount]);
}

export function PeixinhoTable({ room, selfId, sendAction }: GameTableProps) {
  const layout = useTableLayout();
  const sizes = usePeixinhoSizes(room.players.length);
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = useCallback(
    (id: string) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Alguém')),
    [players, selfId],
  );

  const [ticker, setTicker] = useState<{ text: string; key: number } | null>(null);
  const tickerTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string, ms = 2000) => {
    window.clearTimeout(tickerTimer.current);
    setTicker({ text, key: Date.now() });
    tickerTimer.current = window.setTimeout(() => setTicker(null), ms);
  }, []);

  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const bubbleTimers = useRef(new Map<string, number>());
  const say = useCallback((playerId: string, text: string, tone: Bubble['tone']) => {
    window.clearTimeout(bubbleTimers.current.get(playerId));
    setBubbles((current) => ({ ...current, [playerId]: { key: Date.now() + Math.random(), text, tone } }));
    bubbleTimers.current.set(
      playerId,
      window.setTimeout(() => {
        setBubbles(({ [playerId]: _gone, ...rest }) => rest);
      }, BUBBLE_MS),
    );
  }, []);
  useEffect(() => {
    const timers = bubbleTimers.current;
    return () => {
      window.clearTimeout(tickerTimer.current);
      for (const timer of timers.values()) window.clearTimeout(timer);
    };
  }, []);

  const onFx = useCallback(
    (fx: Fx) => {
      const me = (id: string) => id === selfId;
      switch (fx.kind) {
        case 'asked':
          say(
            fx.askerId,
            me(fx.targetId)
              ? `Tens ${rankPlural(fx.rank)}?`
              : `${nameOf(fx.targetId)}, tens ${rankPlural(fx.rank)}?`,
            'ask',
          );
          playSound('play');
          break;
        case 'given':
          say(fx.from, answerLine(fx.count), 'yes');
          if (me(fx.to)) playSound('pickUp');
          break;
        case 'goFish':
          say(fx.targetId, answerLine(null), 'no');
          if (fx.pondEmpty) announce('O lago está vazio — passa a vez');
          else if (me(fx.askerId) && fx.awaitingPick) announce('Vai à pesca! Toca numa carta do lago', 2600);
          break;
        case 'fished':
          if (fx.caught) {
            playSound('splash');
            announce(
              me(fx.playerId)
                ? 'Pescaste o que pediste! Jogas outra vez.'
                : `${nameOf(fx.playerId)} pescou o que pediu! Joga outra vez.`,
              2400,
            );
          } else announce(me(fx.playerId) ? 'Não era o que pediste — passa a vez' : 'Passa a vez', 1400);
          break;
        case 'peixinho': {
          playSound('splash');
          const again = fx.extraTurn ? (me(fx.playerId) ? ' Jogas outra vez.' : ' Joga outra vez.') : '';
          announce(`Peixinho de ${rankPlural(fx.rank)}!${again}`, 2400);
          break;
        }
        case 'refilled':
          announce(
            me(fx.playerId)
              ? `Sem cartas — vais buscar ${fx.count}`
              : `${nameOf(fx.playerId)} sem cartas — vai buscar ${fx.count}`,
          );
          break;
        case 'out':
          announce(
            me(fx.playerId)
              ? 'Estás fora de jogo — o lago acabou'
              : `${nameOf(fx.playerId)} está fora de jogo`,
          );
          break;
        case 'finished': {
          const names = fx.winners.map(nameOf);
          announce(
            fx.winners.length > 1
              ? `Empate: ${listNames(names)}!`
              : me(fx.winners[0] ?? '')
                ? 'Ganhaste! 🎉'
                : `${names[0]} ganha!`,
            5000,
          );
          break;
        }
        case 'passed':
          break;
      }
    },
    [announce, nameOf, say, selfId],
  );

  const choreography = useMemo<Choreography<PeixinhoView, PeixinhoEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent: (scene, event) =>
        applyEvent(scene, event, {
          handSize: sizes.hand,
          pondSize: sizes.pond,
          showcaseSize: sizes.showcase,
        }),
      isOpeningDeal: (message) => message.seq === 0,
      dealDurationMs,
    }),
    [sizes.hand, sizes.pond, sizes.showcase],
  );
  const { scene, validActions, timer, animating } = useDirector<
    PeixinhoView,
    PeixinhoAction,
    PeixinhoEvent,
    Scene,
    Fx
  >(choreography, onFx);

  const myTurn = !!scene && scene.currentPlayerId === selfId && validActions.length > 0 && !animating;
  useEffect(() => {
    if (myTurn) playSound('yourTurn');
  }, [myTurn]);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center" style={FELT}>
        <p className="animate-pulse text-ivory/70">A encher o lago…</p>
      </div>
    );
  }
  return (
    <PeixinhoTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      memoryDocked={layout === 'desktop'}
      validActions={validActions}
      timer={timer}
      animating={animating}
      ticker={ticker?.text ?? null}
      bubbles={bubbles}
      nameOf={nameOf}
      sendAction={sendAction}
    />
  );
}

export interface PeixinhoTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  /** Desktop: the table's memory sits in a side panel instead of a pop-over. */
  memoryDocked: boolean;
  validActions: PeixinhoAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  ticker: string | null;
  bubbles: Record<string, Bubble>;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
}

interface Selection {
  key: string;
  target: string | null;
  rank: StandardRank | null;
}

export function PeixinhoTableView({
  scene,
  selfId,
  players,
  sizes,
  memoryDocked,
  validActions,
  timer,
  animating,
  ticker,
  bubbles,
  nameOf,
  sendAction,
}: PeixinhoTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState<Selection>({ key: '', target: null, rank: null });
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const launchFlights = useFlights();

  const seatIds = useMemo(() => scene.seats.map((s) => s.id), [scene.seats]);
  const pondCard = useMemo(
    () => ({ width: CARD_WIDTH[sizes.pond], height: cardHeight(sizes.pond) }),
    [sizes.pond],
  );
  const geometry = useMemo(
    () =>
      tableGeometry({
        arena: arena ?? { width: 0, height: 0 },
        seatIds,
        selfId,
        seat: SEAT_BOX[sizes.seat],
        card: pondCard,
      }),
    [arena, seatIds, selfId, sizes.seat, pondCard],
  );
  // The pond fills the middle of the table, clear of the seats.
  const pondRadii = useMemo(
    () => ({
      x: Math.round(Math.max(40, Math.min(200, geometry.radii.x * 0.42))),
      y: Math.round(Math.max(24, Math.min(92, geometry.radii.y * 0.3))),
    }),
    [geometry.radii.x, geometry.radii.y],
  );

  const asks = useMemo(() => validActions.filter((a) => a.type === 'ASK'), [validActions]);
  const targets = useMemo(() => new Set(asks.map((a) => a.targetId)), [asks]);
  const ranks = useMemo(() => new Set(asks.map((a) => a.rank)), [asks]);
  const fishing = validActions.some((a) => a.type === 'FISH');
  const canAct = !animating && !sending;
  const asking = canAct && asks.length > 0;

  // One selection per decision; a single choice is made for you.
  const decisionKey = `${scene.matchId}:${scene.seq}`;
  const current = selection.key === decisionKey ? selection : { key: decisionKey, target: null, rank: null };
  const target =
    current.target && targets.has(current.target)
      ? current.target
      : targets.size === 1
        ? [...targets][0]!
        : null;
  const rank =
    current.rank && ranks.has(current.rank) ? current.rank : ranks.size === 1 ? [...ranks][0]! : null;
  const update = useCallback(
    (patch: Partial<Omit<Selection, 'key'>>) =>
      setSelection((s) => ({
        ...(s.key === decisionKey ? s : { target: null, rank: null }),
        ...patch,
        key: decisionKey,
      })),
    [decisionKey],
  );
  const onSelectRank = useCallback((next: StandardRank | null) => update({ rank: next }), [update]);
  const onTarget = useCallback(
    (id: string) => update({ target: target === id && targets.size > 1 ? null : id }),
    [target, targets.size, update],
  );
  const onDrop = useCallback(
    (dropped: StandardRank, on: string | null) =>
      update(on && targets.has(on) ? { rank: dropped, target: on } : { rank: dropped }),
    [targets, update],
  );

  const send = async (action: PeixinhoAction) => {
    if (!canAct) return;
    setSending(true);
    const ack = await sendAction(action);
    setSending(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  // The opening deal: backs fly from the pond to every opponent (the viewer's own cards deal themselves).
  const dealtFor = useRef<string | null>(null);
  useEffect(() => {
    if (!scene.dealing || !arena || dealtFor.current === scene.matchId) return;
    dealtFor.current = scene.matchId;
    const opponents = scene.seats.filter((s) => s.id !== selfId);
    launchFlights(
      opponents.flatMap((seat, seatIndex) =>
        Array.from({ length: seat.handCount }, (_, card) => ({
          from: ANCHORS.pond,
          to: ANCHORS.seat(seat.id),
          size: sizes.pond,
          toSize: 'xs' as const,
          kind: 'deal' as const,
          delay: (card * opponents.length + seatIndex) * DEAL_STAGGER_S * 0.5,
        })),
      ),
    );
  }, [scene.dealing, scene.matchId, scene.seats, arena, selfId, launchFlights, sizes.pond]);

  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;
  const me = scene.seats.find((s) => s.id === selfId);
  const finished = scene.phase === 'FINISHED';
  const memoryShown = scene.tableMemory !== 'NONE';
  const scores = scene.seats.map((s) => ({
    id: s.id,
    name: nameOf(s.id),
    count: s.peixinhos.length,
    self: s.id === selfId,
    winner: finished && scene.winners.includes(s.id),
  }));
  const memoryList = { entries: scene.askLog, memory: scene.tableMemory, selfId, nameOf };

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden" style={FELT}>
      <TimeWarning timer={pendingTimer} />
      <ScoreBanner
        total={scene.peixinhosTotal}
        scores={scores}
        memoryButton={
          memoryShown && !memoryDocked ? { open: memoryOpen, onToggle: () => setMemoryOpen((o) => !o) } : null
        }
      />
      {memoryShown && !memoryDocked && (
        <MemoryPopover open={memoryOpen} onClose={() => setMemoryOpen(false)} {...memoryList} />
      )}

      <div className="flex min-h-0 flex-1">
        <div ref={arenaRef} className="relative min-h-0 flex-1">
          {arena && (
            <Pond
              scene={scene}
              center={geometry.center}
              radii={pondRadii}
              size={sizes.pond}
              showcaseSize={sizes.showcase}
              pickable={fishing && canAct}
              onPick={(slot) => void send({ type: 'FISH', pondPosition: slot })}
              caption={ticker}
            />
          )}
          {arena &&
            scene.seats.map((seat) => {
              const point = geometry.seats.get(seat.id);
              if (!point) return null;
              const targetState: TargetState =
                !asking || !targets.has(seat.id)
                  ? 'none'
                  : dragOver === seat.id
                    ? 'hovered'
                    : target === seat.id
                      ? 'selected'
                      : 'available';
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
                    player={players.get(seat.id)}
                    isTurn={scene.currentPlayerId === seat.id}
                    timer={timer && timer.playerIds.includes(seat.id) ? timer : null}
                    variant={sizes.seat}
                    target={targetState}
                    onTarget={onTarget}
                    bubble={bubbles[seat.id] ?? null}
                    winner={finished && scene.winners.includes(seat.id)}
                    finished={finished}
                  />
                </div>
              );
            })}
        </div>
        {memoryShown && memoryDocked && (
          <aside className="flex w-64 shrink-0 flex-col py-3 pr-3">
            <MemoryList {...memoryList} className="max-h-full rounded-2xl bg-black/20 p-2.5" />
          </aside>
        )}
      </div>

      <div className="relative z-20 flex shrink-0 flex-col items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Hand
          cards={scene.hand}
          size={sizes.hand}
          dealing={scene.dealing}
          askable={asking ? ranks : null}
          selectedRank={asking ? rank : null}
          onSelectRank={onSelectRank}
          onDrop={onDrop}
          onDragOver={setDragOver}
        />
        <ActionBar
          scene={scene}
          player={players.get(selfId)}
          message={statusMessage(scene, selfId, { asking, fishing, target, rank }, nameOf)}
          highlight={asking || (fishing && canAct)}
          timer={pendingTimer}
          askLabel={
            asks.length > 0
              ? target && rank
                ? `Pedir ${rankPlural(rank)} a ${nameOf(target)}`
                : 'Escolhe jogador e valor'
              : null
          }
          canAsk={asking && target !== null && rank !== null}
          canFish={fishing}
          busy={!canAct || me?.out === true}
          bubble={bubbles[selfId] ?? null}
          onAsk={() => target && rank && void send({ type: 'ASK', targetId: target, rank })}
          onFish={() => void send({ type: 'FISH' })}
        />
      </div>
    </div>
  );
}

function statusMessage(
  scene: Scene,
  selfId: string,
  turn: { asking: boolean; fishing: boolean; target: string | null; rank: StandardRank | null },
  nameOf: (id: string) => string,
): string {
  const me = scene.seats.find((s) => s.id === selfId);
  if (scene.phase === 'FINISHED') {
    if (!scene.winners.includes(selfId))
      return `Fim — ${scene.winners.length > 1 ? 'ganharam' : 'ganhou'} ${listNames(scene.winners.map(nameOf))}`;
    return scene.winners.length > 1 ? 'Fim — empate, ganhaste também!' : 'Fim — ganhaste! 🎉';
  }
  if (me?.out) return 'Estás fora de jogo — o lago acabou';
  if (turn.fishing) return 'Vai à pesca! Toca numa carta do lago';
  const fishing = scene.awaitingFish;
  if (fishing && fishing.askerId !== selfId) return `${nameOf(fishing.askerId)} vai à pesca…`;
  if (turn.asking) {
    if (turn.target && turn.rank)
      return `A tua vez · pedir ${rankPlural(turn.rank)} a ${nameOf(turn.target)}?`;
    if (turn.target) return `A tua vez · que valor pedes a ${nameOf(turn.target)}?`;
    if (turn.rank) return `A tua vez · a quem pedes ${rankPlural(turn.rank)}?`;
    return 'A tua vez · toca num jogador e num valor da tua mão';
  }
  const current = scene.currentPlayerId;
  if (current === selfId) return 'A tua vez…';
  return current ? `Vez de ${nameOf(current)}` : '…';
}
