'use client';

import type { CardId } from '@cardroom/game-core';
import type { MexicanaAction } from '@cardroom/mexicana';
import type { RoomPlayer } from '@cardroom/shared';
import { type CardSize } from '@cardroom/ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { TurnRing, useSecondsLeft } from '../shared/turn-ring';
import { useTableLayout, useViewportHeight, type TableLayout } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { CenterArea } from './center';
import { indexActions, ordinal, restrictionHint, selectionKey, sortHand } from './copy';
import { Hand } from './hand';
import { OpponentSeat } from './opponent-seat';
import type { Fx, Scene } from './scene';
import { TableCards } from './table-cards';
import { useDirector, type TimerSnapshot } from './use-director';

interface Sizes {
  hand: CardSize;
  selfTable: CardSize;
  opponents: CardSize;
  center: CardSize;
}

/**
 * Card sizes per screen. Phones use every bit of height they have: the hand
 * (what you read most) gets the biggest cards, opponents' table cards grow
 * when there are few of them to fit in one row.
 */
function useTableSizes(layout: TableLayout, opponentCount: number): Sizes {
  const height = useViewportHeight();
  const fewOpponents = opponentCount <= 2;
  if (layout === 'desktop') return { hand: 'lg', selfTable: 'md', opponents: 'sm', center: 'md' };
  if (layout === 'tablet') return { hand: 'ml', selfTable: 'md', opponents: 'sm', center: 'md' };
  const opponents = fewOpponents ? 'sm' : 'xs';
  switch (height) {
    case 'tall':
      return { hand: 'ml', selfTable: 'md', opponents, center: 'md' };
    case 'medium':
      return { hand: 'md', selfTable: 'ms', opponents, center: 'ms' };
    case 'short':
      return { hand: 'md', selfTable: 'sm', opponents: 'xs', center: 'sm' };
  }
}

export function MexicanaTable({ room, selfId, sendAction }: GameTableProps) {
  const layout = useTableLayout();
  const sizes = useTableSizes(layout, room.players.length - 1);
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = useCallback(
    (id: string) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Alguém')),
    [players, selfId],
  );

  const [ticker, setTicker] = useState<{ text: string; key: number } | null>(null);
  const [skipped, setSkipped] = useState<Record<string, number>>({});
  const tickerTimer = useRef<number | undefined>(undefined);

  const announce = useCallback((text: string) => {
    window.clearTimeout(tickerTimer.current);
    setTicker({ text, key: Date.now() });
    tickerTimer.current = window.setTimeout(() => setTicker(null), 2400);
  }, []);

  const onFx = useCallback(
    (fx: Fx) => {
      switch (fx.kind) {
        case 'played':
          playSound('play');
          break;
        case 'burn':
          playSound('burn');
          announce('🔥 A pilha foi queimada!');
          break;
        case 'skip': {
          const key = Date.now();
          setSkipped((s) => ({ ...s, [fx.playerId]: key }));
          window.setTimeout(
            () => setSkipped((s) => (s[fx.playerId] === key ? omit(s, fx.playerId) : s)),
            900,
          );
          announce(fx.playerId === selfId ? 'Foste saltado!' : `${nameOf(fx.playerId)} foi saltado`);
          break;
        }
        case 'pickUp':
          playSound('pickUp');
          announce(
            `${nameOf(fx.playerId)} ${fx.playerId === selfId ? 'apanhaste' : 'apanhou'} ${fx.count} ${fx.count === 1 ? 'carta' : 'cartas'}`,
          );
          break;
        case 'finished':
          announce(
            `${nameOf(fx.playerId)} ${fx.playerId === selfId ? 'terminaste' : 'terminou'} em ${ordinal(fx.position)}`,
          );
          break;
        case 'started':
          announce(fx.playerId === selfId ? 'Começas tu!' : `Começa ${nameOf(fx.playerId)}`);
          break;
      }
    },
    [announce, nameOf, selfId],
  );

  const { scene, validActions, timer, animating } = useDirector(onFx);

  useEffect(() => () => window.clearTimeout(tickerTimer.current), []);

  const myTurn = !!scene && scene.currentPlayerId === selfId && validActions.length > 0 && !animating;
  useEffect(() => {
    if (myTurn) playSound('yourTurn');
  }, [myTurn]);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center">
        <p className="animate-pulse text-ivory/70">A preparar a mesa…</p>
      </div>
    );
  }

  return (
    <TableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      layout={layout}
      validActions={validActions}
      timer={timer}
      animating={animating}
      ticker={ticker?.text ?? null}
      skipped={skipped}
      nameOf={nameOf}
      sendAction={sendAction}
    />
  );
}

interface TableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  layout: TableLayout;
  validActions: MexicanaAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  ticker: string | null;
  skipped: Record<string, number>;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
}

function TableView({
  scene,
  selfId,
  players,
  sizes,
  layout,
  validActions,
  timer,
  animating,
  ticker,
  skipped,
  nameOf,
  sendAction,
}: TableViewProps) {
  const index = useMemo(() => indexActions(validActions), [validActions]);
  // Selection survives other players' moves during the simultaneous choosing phase,
  // but resets for every new turn decision while playing.
  const decisionKey =
    scene.phase === 'CHOOSING' ? `${scene.matchId}:choosing` : `${scene.matchId}:${scene.seq}`;
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: '', ids: [] });
  const inHand = useMemo(() => new Set(scene.hand.map((c) => c.card.id)), [scene.hand]);
  const selectedIds = useMemo(
    () => (selection.key === decisionKey ? selection.ids.filter((id) => inHand.has(id)) : []),
    [selection, decisionKey, inHand],
  );
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const [sending, setSending] = useState(false);

  const selfIndex = scene.seats.findIndex((s) => s.id === selfId);
  const selfSeat = scene.seats[selfIndex];
  const opponents =
    selfIndex >= 0 ? [...scene.seats.slice(selfIndex + 1), ...scene.seats.slice(0, selfIndex)] : scene.seats;
  const choosing = scene.phase === 'CHOOSING';
  const hand = useMemo(() => sortHand(scene.hand), [scene.hand]);
  const canAct = !animating && !sending;

  const deal = (seatId: string) =>
    scene.dealing
      ? { seatIndex: scene.seats.findIndex((s) => s.id === seatId), seatCount: scene.seats.length }
      : null;

  const send = async (action: MexicanaAction) => {
    if (!canAct) return;
    setSending(true);
    const ack = await sendAction(action);
    setSending(false);
    setSelection({ key: '', ids: [] });
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const cardRank = (id: string) => hand.find((c) => c.card.id === id)?.card.rank;

  // Functional update: rapid taps within one frame must all count.
  const toggle = (id: string) =>
    setSelection((previous) => {
      const current = previous.key === decisionKey ? previous.ids : [];
      let ids: string[];
      if (current.includes(id)) ids = current.filter((x) => x !== id);
      else if (choosing) ids = current.length >= 3 ? current : [...current, id];
      else
        ids = current.length > 0 && cardRank(current[0] as string) === cardRank(id) ? [...current, id] : [id];
      return { key: decisionKey, ids };
    });

  const selectionPlayable = selectedIds.length > 0 && index.plays.has(selectionKey(selectedIds));
  const submit = () => {
    if (choosing) {
      if (selectedIds.length === 3)
        void send({ type: 'CHOOSE_FACE_UP', cardIds: selectedIds as [CardId, CardId, CardId] });
      return;
    }
    if (selectionPlayable) void send({ type: 'PLAY_CARDS', cardIds: selectedIds });
  };

  const isMyTurn = myTurnIn(scene, selfId, validActions);
  const handLayerActive = !choosing && isMyTurn && hand.length > 0;
  const selectable: ReadonlySet<string> | null = choosing
    ? index.canChoose
      ? new Set(hand.map((c) => c.card.id))
      : null
    : handLayerActive && canAct
      ? index.playable
      : null;

  const tableLayer: 'faceUp' | 'faceDown' | null =
    !choosing && canAct && isMyTurn && hand.length === 0
      ? index.faceDownPositions.size > 0
        ? 'faceDown'
        : 'faceUp'
      : null;

  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;

  return (
    <div
      className="felt relative flex h-full flex-col overflow-hidden"
      onKeyDown={(e) => {
        if (e.key === 'Escape') setSelection({ key: '', ids: [] });
      }}
    >
      <TimeWarning timer={pendingTimer} />

      {/* Opponents */}
      <div
        className={clsx(
          'flex shrink-0 gap-2 px-3 pt-3',
          layout === 'phone'
            ? 'scrollbar-none overflow-x-auto'
            : 'flex-wrap items-start justify-center gap-x-6',
        )}
      >
        {opponents.map((seat, i) => (
          <div
            key={seat.id}
            style={layout === 'desktop' ? { marginTop: arcOffset(i, opponents.length) } : undefined}
          >
            <OpponentSeat
              seat={seat}
              player={players.get(seat.id)}
              isTurn={scene.currentPlayerId === seat.id || (choosing && !seat.hasChosenFaceUp)}
              choosing={choosing}
              timer={timer && timer.playerIds.includes(seat.id) ? timer : null}
              skippedKey={skipped[seat.id] ?? null}
              compact={layout === 'phone'}
              cardSize={sizes.opponents}
              deal={deal(seat.id)}
            />
          </div>
        ))}
      </div>

      {/* Center */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <CenterArea scene={scene} size={sizes.center} ticker={ticker} />
      </div>

      {/* Self */}
      {selfSeat && (
        <div className="relative flex shrink-0 flex-col items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="relative">
            <TableCards
              seat={selfSeat}
              size={sizes.selfTable}
              deal={deal(selfId)}
              interactiveLayer={tableLayer}
              playableFaceUp={index.playable}
              playableFaceDown={index.faceDownPositions}
              onPlayFaceUp={(card) => void send({ type: 'PLAY_CARDS', cardIds: [card.id] })}
              onPlayFaceDown={(position) => void send({ type: 'PLAY_FACE_DOWN', position })}
            />
          </div>
          <Hand
            cards={hand}
            size={sizes.hand}
            selected={selected}
            selectable={selectable}
            deal={deal(selfId)}
            reclick={choosing ? 'toggle' : 'submit'}
            onToggle={toggle}
            onSubmit={submit}
          />
          <ActionBar
            scene={scene}
            selfId={selfId}
            player={players.get(selfId)}
            timer={pendingTimer}
            isMyTurn={isMyTurn}
            choosing={choosing}
            chosen={!!selfSeat.hasChosenFaceUp}
            selectedCount={selectedIds.length}
            selectionPlayable={selectionPlayable}
            canPickUp={index.canPickUp}
            tableLayer={tableLayer}
            busy={!canAct}
            onSubmit={submit}
            onPickUp={() => void send({ type: 'PICK_UP_PILE' })}
            currentName={scene.currentPlayerId ? nameOf(scene.currentPlayerId) : null}
          />
        </div>
      )}
    </div>
  );
}

function myTurnIn(scene: Scene, selfId: string, validActions: MexicanaAction[]): boolean {
  return scene.phase === 'PLAYING' && scene.currentPlayerId === selfId && validActions.length > 0;
}

/** Seats along a gentle arc: edges sit lower than the middle. */
function arcOffset(index: number, count: number): number {
  if (count <= 2) return 0;
  const t = index / (count - 1) - 0.5;
  return Math.round(t * t * 4 * 28);
}

function omit<T extends Record<string, unknown>>(record: T, key: string): T {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

interface ActionBarProps {
  scene: Scene;
  selfId: string;
  player: RoomPlayer | undefined;
  timer: TimerSnapshot | null;
  isMyTurn: boolean;
  choosing: boolean;
  chosen: boolean;
  selectedCount: number;
  selectionPlayable: boolean;
  canPickUp: boolean;
  tableLayer: 'faceUp' | 'faceDown' | null;
  busy: boolean;
  onSubmit: () => void;
  onPickUp: () => void;
  currentName: string | null;
}

function ActionBar({
  scene,
  selfId,
  player,
  timer,
  isMyTurn,
  choosing,
  chosen,
  selectedCount,
  selectionPlayable,
  canPickUp,
  tableLayer,
  busy,
  onSubmit,
  onPickUp,
  currentName,
}: ActionBarProps) {
  const seconds = useSecondsLeft(timer);
  const finishedPosition = scene.seats.find((s) => s.id === selfId)?.finishedPosition ?? null;

  let message: string;
  if (finishedPosition) message = `Terminaste em ${ordinal(finishedPosition)} lugar — boa!`;
  else if (choosing)
    message = chosen ? 'À espera que os outros escolham…' : 'Escolhe 3 cartas para ficarem viradas para cima';
  else if (!isMyTurn) message = currentName ? `Vez de ${currentName}` : 'À espera…';
  else if (canPickUp) message = 'Não tens jogada válida — apanha a pilha';
  else if (tableLayer === 'faceDown') message = 'Vira uma carta escondida — às cegas!';
  else if (tableLayer === 'faceUp')
    message = `Joga uma carta visível · ${restrictionHint(scene.restriction, scene.effectiveRank)}`;
  else message = restrictionHint(scene.restriction, scene.effectiveRank);

  const showTimer = (isMyTurn || (choosing && !chosen)) && seconds !== null;

  return (
    <div className="flex w-full max-w-3xl items-center gap-3 rounded-2xl bg-black/30 px-3 py-2 backdrop-blur-sm">
      <TurnRing active={isMyTurn || (choosing && !chosen)} timer={timer} size={36}>
        <Avatar name={player?.username ?? 'Eu'} src={player?.avatarUrl} size={36} />
      </TurnRing>
      <div className="min-w-0 flex-1">
        <p
          className={clsx('truncate text-sm font-semibold', isMyTurn ? 'text-gold' : 'text-ivory')}
          role="status"
        >
          {isMyTurn && !canPickUp ? 'A tua vez · ' : ''}
          {message}
        </p>
        {showTimer && (
          <p className={clsx('text-xs tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>
            {seconds}s restantes
          </p>
        )}
      </div>
      {choosing && !chosen && (
        <Button onClick={onSubmit} disabled={selectedCount !== 3 || busy}>
          Confirmar ({selectedCount}/3)
        </Button>
      )}
      {isMyTurn && canPickUp && (
        <Button variant="danger" onClick={onPickUp} disabled={busy}>
          Apanhar a pilha
        </Button>
      )}
      {isMyTurn && !canPickUp && !tableLayer && (
        <Button onClick={onSubmit} disabled={!selectionPlayable || busy}>
          {selectedCount > 1 ? `Jogar ${selectedCount}` : 'Jogar'}
        </Button>
      )}
    </div>
  );
}
