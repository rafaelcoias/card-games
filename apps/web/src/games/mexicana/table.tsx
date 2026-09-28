'use client';

import type { Card, CardId } from '@cardroom/game-core';
import type { MexicanaAction } from '@cardroom/mexicana';
import type { RoomPlayer } from '@cardroom/shared';
import { rankLabel } from '@cardroom/ui';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { TurnRing, useSecondsLeft } from '../shared/turn-ring';
import { useTableLayout, useViewport, type TableLayout } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { CenterArea } from './center';
import { indexActions, ordinal, restrictionHint, selectionKey, sortHand } from './copy';
import { Hand } from './hand';
import { fitMexicanaSizes, type Sizes } from './layout';
import { OpponentSeat } from './opponent-seat';
import type { Fx, Scene } from './scene';
import { TableCards } from './table-cards';
import { useDirector, type TimerSnapshot } from './use-director';

/** Card sizes fitted to the screen (see `fitMexicanaSizes`). */
export function useMexicanaSizes(layout: TableLayout, opponentCount: number): Sizes {
  const viewport = useViewport();
  return useMemo(
    () => fitMexicanaSizes(viewport, opponentCount, layout === 'phone'),
    [viewport, opponentCount, layout],
  );
}

export function MexicanaTable({ room, selfId, sendAction }: GameTableProps) {
  const layout = useTableLayout();
  const sizes = useMexicanaSizes(layout, room.players.length - 1);
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
    <MexicanaTableView
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

export interface MexicanaTableViewProps {
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

export function MexicanaTableView({
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
}: MexicanaTableViewProps) {
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

  // Playable cards of the selected rank, the selected ones first: how many can go down together.
  const selectedRank = !choosing && selectedIds[0] ? cardRank(selectedIds[0]) : undefined;
  const sameRank = selectedRank
    ? [
        ...selectedIds,
        ...hand
          .filter(
            (c) => c.card.rank === selectedRank && index.playable.has(c.card.id) && !selected.has(c.card.id),
          )
          .map((c) => c.card.id),
      ]
    : [];
  const playCount = (count: number) => {
    const cardIds = sameRank.slice(0, count);
    if (index.plays.has(selectionKey(cardIds))) void send({ type: 'PLAY_CARDS', cardIds });
  };

  /**
   * Tapping a selected card again plays the selection only when nothing could
   * join it; with more cards of that rank in hand it deselects instead, so a
   * second tap that lands on the same (overlapped) card never cuts a play short.
   */
  const tap = (id: string) => {
    if (choosing || !selected.has(id) || sameRank.length > selectedIds.length) toggle(id);
    else submit();
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

  // No face-up card can be played: tapping one picks up the pile with it.
  const mustTakeFaceUp = index.pickUpWith.size > 0;
  const playFaceUp = (card: Card) =>
    void send(
      mustTakeFaceUp
        ? { type: 'PICK_UP_PILE', faceUpCardId: card.id }
        : { type: 'PLAY_CARDS', cardIds: [card.id] },
    );

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
              faceUpIntent={mustTakeFaceUp ? 'pickUp' : 'play'}
              playableFaceUp={mustTakeFaceUp ? index.pickUpWith : index.playable}
              playableFaceDown={index.faceDownPositions}
              onPlayFaceUp={playFaceUp}
              onPlayFaceDown={(position) => void send({ type: 'PLAY_FACE_DOWN', position })}
            />
          </div>
          <Hand
            cards={hand}
            size={sizes.hand}
            selected={selected}
            selectable={selectable}
            deal={deal(selfId)}
            onTap={tap}
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
            count={
              handLayerActive && selectedRank && sameRank.length > 1
                ? {
                    rank: selectedRank,
                    available: sameRank.length,
                    selected: selectedIds.length,
                    onPlay: playCount,
                  }
                : null
            }
            canPickUp={index.canPickUp}
            mustTakeFaceUp={mustTakeFaceUp}
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
  /**
   * Several cards of the selected rank can go down together: big buttons pick
   * how many (in place of Jogar), so the play never depends on tapping small,
   * overlapping cards precisely.
   */
  count: CountChoice | null;
  canPickUp: boolean;
  mustTakeFaceUp: boolean;
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
  count,
  canPickUp,
  mustTakeFaceUp,
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
  else if (mustTakeFaceUp) message = 'Sem jogada — escolhe a visível que levas com a pilha';
  else if (tableLayer === 'faceDown') message = 'Vira uma carta escondida — às cegas!';
  else if (count) message = countQuestion(count.rank);
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
          {isMyTurn && !canPickUp && !mustTakeFaceUp && !count ? 'A tua vez · ' : ''}
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
      {isMyTurn && count && (
        <div className="flex shrink-0 gap-1.5" role="group" aria-label="Quantas cartas jogas">
          {Array.from({ length: count.available }, (_, i) => i + 1).map((n) => (
            <Button
              key={n}
              variant={n === count.selected ? 'primary' : 'secondary'}
              className="min-w-10 px-0 text-base tabular-nums sm:min-w-12"
              disabled={busy}
              onClick={() => count.onPlay(n)}
              aria-label={`Jogar ${n}`}
            >
              {n}
            </Button>
          ))}
        </div>
      )}
      {isMyTurn && !canPickUp && !mustTakeFaceUp && !tableLayer && !count && (
        <Button onClick={onSubmit} disabled={!selectionPlayable || busy}>
          {selectedCount > 1 ? `Jogar ${selectedCount}` : 'Jogar'}
        </Button>
      )}
    </div>
  );
}

interface CountChoice {
  rank: string;
  /** Playable cards of that rank in hand. */
  available: number;
  selected: number;
  onPlay: (count: number) => void;
}

function countQuestion(rank: string): string {
  if (rank === 'JOKER') return 'Quantos Jokers?';
  return `Quantas cartas de ${/^\d+$/.test(rank) ? rank : rankLabel(rank)}?`;
}
