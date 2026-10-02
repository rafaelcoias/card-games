'use client';

import type { CardId, PlayerId, Rank } from '@cardroom/game-core';
import type { OlhoAction, OlhoClientAction, OlhoEvent, OlhoView } from '@cardroom/olho';
import type { RoomPlayer } from '@cardroom/shared';
import { CARD_WIDTH, cardHeight } from '@cardroom/ui';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { Confetti } from '../desconfia/confetti';
import { tableGeometry, type Box } from '../fodinha/layout';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useTableLayout, useViewport } from '../shared/use-media';
import type { GameTableProps } from '../types';
import { CUT_STAMP, ROLE_LABEL, comboWithArticle, ordinal, plural, playLabel } from './copy';
import { olhoSizes, type SeatVariant, type Sizes } from './layout';
import { Banner, ExchangeOverlay, Scoreboard, SummaryOverlay } from './panels';
import { applyEvent, dealDurationMs, sceneFromView, type Fx, type Scene } from './scene';
import { Seat, type Bubble } from './seat';
import { ActionBar, EscapePanel, Hand } from './self-area';
import { Center } from './trick';

const SEAT_BOX: Record<SeatVariant, Box> = {
  regular: { width: 180, height: 84 },
  compact: { width: 116, height: 112 },
};

const BUBBLE_MS = 1500;
const SEAL_MS = 900;

/** Names of everyone seen at a table, kept after they leave (the scoreboard still lists them). */
const KNOWN_NAMES = new Map<PlayerId, string>();

/** Petrol-blue felt (UI §1). */
const FELT = { '--color-felt': '#163a4a' } as CSSProperties;

export function useOlhoSizes(playerCount: number): Sizes {
  const layout = useTableLayout();
  const { height } = useViewport();
  return useMemo(() => olhoSizes(layout, height, playerCount), [layout, height, playerCount]);
}

/** "Abres tu." / "Abre Bruno." */
const opener = (leaderId: PlayerId | null, selfId: string, nameOf: (id: PlayerId) => string) =>
  !leaderId ? '' : leaderId === selfId ? 'Abres tu.' : `Abre ${nameOf(leaderId)}.`;

/** What a closed trick reads like (UI §4, §5): "Ninguém bateu o Rei de Bruno. Abre Bruno." */
export function closedCaption(
  fx: Extract<Fx, { kind: 'closed' }>,
  selfId: string,
  nameOf: (id: PlayerId) => string,
) {
  const next = opener(fx.leaderId, selfId, nameOf);
  if (fx.reason !== 'ALL_PASSED') {
    return fx.winnerId === selfId ? `Cortaste! ${next}` : `${nameOf(fx.winnerId)} corta. ${next}`;
  }
  if (fx.winnerId === selfId) return `Ninguém bateu a tua jogada. ${next}`;
  const what = fx.last ? comboWithArticle(fx.last.rank, fx.last.count) : 'a jogada';
  return `Ninguém bateu ${what} de ${nameOf(fx.winnerId)}. ${next}`;
}

export function OlhoTable({ room, selfId, sendAction }: GameTableProps) {
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  useEffect(() => {
    for (const p of room.players) KNOWN_NAMES.set(p.id, p.username);
  }, [room.players]);
  const nameOf = useCallback(
    (id: PlayerId) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? KNOWN_NAMES.get(id) ?? 'Alguém')),
    [players, selfId],
  );

  const [ticker, setTicker] = useState<{ text: string; key: number } | null>(null);
  const tickerTimer = useRef<number | undefined>(undefined);
  const announce = useCallback((text: string, ms = 2200) => {
    window.clearTimeout(tickerTimer.current);
    setTicker({ text, key: Date.now() });
    tickerTimer.current = window.setTimeout(() => setTicker(null), ms);
  }, []);

  const [stamp, setStamp] = useState<{ text: string; key: number } | null>(null);
  const stampTimer = useRef<number | undefined>(undefined);
  const [bubbles, setBubbles] = useState<Record<string, Bubble>>({});
  const [seals, setSeals] = useState<Record<string, number>>({});
  const timers = useRef(new Map<string, number>());
  const later = useCallback((key: string, ms: number, run: () => void) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.set(key, window.setTimeout(run, ms));
  }, []);
  const say = useCallback(
    (playerId: PlayerId, text: string, tone: Bubble['tone'] = 'say') => {
      setBubbles((current) => ({ ...current, [playerId]: { key: Date.now() + Math.random(), text, tone } }));
      later(`bubble:${playerId}`, BUBBLE_MS, () => setBubbles(({ [playerId]: _gone, ...rest }) => rest));
    },
    [later],
  );
  const [confetti, setConfetti] = useState<number | null>(null);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      window.clearTimeout(tickerTimer.current);
      window.clearTimeout(stampTimer.current);
      for (const timer of pending.values()) window.clearTimeout(timer);
    };
  }, []);

  // The viewer's returned cards are never broadcast: the table remembers what it sent.
  const returned = useRef<CardId[] | null>(null);
  const sizes = useOlhoSizes(room.players.length);

  const onFx = useCallback(
    (fx: Fx) => {
      const me = (id: PlayerId) => id === selfId;
      switch (fx.kind) {
        case 'dealt':
          announce(
            fx.exchange
              ? `Jogo ${fx.gameNumber} · troca de cartas`
              : `Jogo ${fx.gameNumber} · ${fx.leaderId ? (me(fx.leaderId) ? 'começas tu' : `começa ${nameOf(fx.leaderId)}`) : ''}`,
            2400,
          );
          break;
        case 'given':
        case 'returned':
          if (me(fx.giver) || me(fx.receiver)) playSound('pickUp');
          break;
        case 'exchangeDone':
          announce(`Troca feita · ${me(fx.leaderId) ? 'começas tu' : `começa ${nameOf(fx.leaderId)}`}`);
          break;
        case 'played':
          playSound('play');
          if (fx.escape) say(fx.playerId, 'Também tenho!');
          break;
        case 'passed':
          say(fx.playerId, 'Passo');
          break;
        case 'skipPending':
          if (!me(fx.targetId)) announce(`${nameOf(fx.targetId)} pode escapar ao salto…`, 1800);
          break;
        case 'skipped':
          playSound('skip');
          setSeals((current) => ({ ...current, [fx.playerId]: Date.now() }));
          later(`seal:${fx.playerId}`, SEAL_MS, () => setSeals(({ [fx.playerId]: _gone, ...rest }) => rest));
          announce(me(fx.playerId) ? 'Perdes a vez' : `${nameOf(fx.playerId)} perde a vez`, 1400);
          break;
        case 'cut':
          playSound('burn');
          window.clearTimeout(stampTimer.current);
          setStamp({ text: CUT_STAMP[fx.reason], key: Date.now() });
          stampTimer.current = window.setTimeout(() => setStamp(null), 1300);
          break;
        case 'closed':
          announce(closedCaption(fx, selfId, nameOf), 2000);
          break;
        case 'cleared':
          break;
        case 'finished':
          if (me(fx.playerId) && fx.position === 1) setConfetti(Date.now());
          announce(
            me(fx.playerId)
              ? `Ficaste sem cartas — ${ordinal(fx.position)} lugar!`
              : `${nameOf(fx.playerId)} ficou sem cartas — ${ordinal(fx.position)}`,
            2400,
          );
          break;
        case 'blocked':
          announce(
            me(fx.playerId)
              ? 'Só te resta um 2/joker e não podes acabar com ele: passas até ao fim'
              : `${nameOf(fx.playerId)} só tem um 2/joker: passa até ao fim`,
            2600,
          );
          break;
        case 'gameEnded': {
          const role = fx.summary.roles[selfId];
          playSound(role === 'PRESIDENTE' || role === 'VICE_PRESIDENTE' ? 'yourTurn' : 'pickUp');
          break;
        }
        case 'joined':
          if (!me(fx.playerId)) announce(`${nameOf(fx.playerId)} senta-se à mesa — joga no próximo jogo`);
          break;
        case 'leaving':
          announce(`${nameOf(fx.playerId)} saiu — fica em ${ordinal(fx.position)}`);
          break;
        case 'waiting':
          announce('À espera de mais jogadores (mínimo 3)', 3000);
          break;
        case 'left':
        case 'sessionFinished':
          break;
      }
    },
    [announce, later, nameOf, say, selfId],
  );

  const choreography = useMemo<Choreography<OlhoView, OlhoEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent: (scene, event) =>
        applyEvent(scene, event, {
          ownReturn: () => returned.current,
          handSize: sizes.hand,
          trickSize: sizes.trick,
        }),
      isOpeningDeal: (message) => message.seq === 0,
      dealDurationMs,
    }),
    [sizes.hand, sizes.trick],
  );
  const { scene, validActions, timer, animating } = useDirector<OlhoView, OlhoAction, OlhoEvent, Scene, Fx>(
    choreography,
    onFx,
  );

  const myDecision = validActions.length > 0 && !animating;
  useEffect(() => {
    if (myDecision) playSound('yourTurn');
  }, [myDecision]);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center" style={FELT}>
        <p className="animate-pulse text-ivory/70">A baralhar…</p>
      </div>
    );
  }
  return (
    <OlhoTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      validActions={validActions as OlhoClientAction[]}
      timer={timer}
      animating={animating}
      ticker={ticker?.text ?? null}
      stamp={stamp}
      bubbles={bubbles}
      seals={seals}
      confetti={confetti}
      nameOf={nameOf}
      sendAction={sendAction}
      rememberReturn={(ids) => (returned.current = ids)}
    />
  );
}

export interface OlhoTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  validActions: OlhoClientAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  ticker: string | null;
  stamp: { text: string; key: number } | null;
  bubbles: Record<string, Bubble>;
  /** Seats just skipped (keyed per skip). */
  seals: Record<string, number>;
  confetti: number | null;
  nameOf: (id: string) => string;
  sendAction: GameTableProps['sendAction'];
  /** Called with the cards given back in the exchange just before they are sent. */
  rememberReturn: (cardIds: CardId[]) => void;
}

const NONE: ReadonlySet<string> = new Set();

export function OlhoTableView({
  scene,
  selfId,
  players,
  sizes,
  validActions,
  timer,
  animating,
  ticker,
  stamp,
  bubbles,
  seals,
  confetti,
  nameOf,
  sendAction,
  rememberReturn,
}: OlhoTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState<{ key: string; cards: ReadonlySet<string> }>({
    key: '',
    cards: NONE,
  });
  const [scoresOpen, setScoresOpen] = useState(false);
  const [dismissedSummary, setDismissedSummary] = useState<number | null>(null);

  const seatIds = useMemo(() => scene.seats.map((s) => s.id), [scene.seats]);
  const trickCard = useMemo(
    () => ({ width: CARD_WIDTH[sizes.trick], height: cardHeight(sizes.trick) }),
    [sizes.trick],
  );
  const geometry = useMemo(
    () =>
      tableGeometry({
        arena: arena ?? { width: 0, height: 0 },
        seatIds,
        selfId,
        seat: SEAT_BOX[sizes.seat],
        card: trickCard,
      }),
    [arena, seatIds, selfId, sizes.seat, trickCard],
  );

  const canAct = !animating && !sending;
  const actions = useMemo(() => (canAct ? validActions : []), [canAct, validActions]);
  const escape = actions.find((a) => a.type === 'ESCAPE');
  const accept = actions.find((a) => a.type === 'ACCEPT_SKIP');
  const giveBack = actions.find((a) => a.type === 'RETURN_CARDS');
  const canPass = actions.some((a) => a.type === 'PASS');
  const rankOf = useMemo(() => new Map(scene.hand.map((c) => [c.card.id, c.card.rank])), [scene.hand]);
  /** Every (rank → sizes) the viewer may play now. */
  const options = useMemo(() => {
    const map = new Map<Rank, Set<number>>();
    for (const action of actions) {
      if (action.type !== 'PLAY') continue;
      const rank = rankOf.get(action.cardIds[0] ?? '');
      if (!rank) continue;
      map.set(rank, (map.get(rank) ?? new Set()).add(action.cardIds.length));
    }
    return map;
  }, [actions, rankOf]);
  const playing = options.size > 0 || canPass;
  const returning = giveBack !== undefined;
  const returnCount = giveBack?.cardIds.length ?? 0;

  // One selection per decision; it only keeps cards still in hand.
  const decisionKey = `${scene.matchId}:${scene.gameNumber}:${scene.phase}:${scene.trick.number}:${scene.trick.plays.length}`;
  const current = selection.key === decisionKey ? selection.cards : NONE;
  const selected = useMemo(() => new Set([...current].filter((id) => rankOf.has(id))), [current, rankOf]);
  const selectedRank = selected.size > 0 ? (rankOf.get([...selected][0] as string) ?? null) : null;

  const onToggle = useCallback(
    (cardId: string) => {
      const rank = rankOf.get(cardId);
      if (!rank) return;
      setSelection((s) => {
        const base = s.key === decisionKey ? new Set(s.cards) : new Set<string>();
        if (base.has(cardId)) {
          base.delete(cardId);
          return { key: decisionKey, cards: base };
        }
        if (returning) {
          // Give back any cards: the oldest pick makes room once the number is reached.
          const picks = [...base, cardId].slice(-Math.max(1, returnCount));
          return { key: decisionKey, cards: new Set(picks) };
        }
        const sameRank = [...base].every((id) => rankOf.get(id) === rank);
        if (base.size > 0 && sameRank) return { key: decisionKey, cards: new Set([...base, cardId]) };
        // A new rank: pick as many as the smallest play allowed (a pair on pairs), the tapped card first.
        const want = Math.min(...(options.get(rank) ?? new Set([1])));
        const others = scene.hand
          .filter((c) => c.card.rank === rank && c.card.id !== cardId)
          .map((c) => c.card.id);
        return { key: decisionKey, cards: new Set([cardId, ...others].slice(0, want)) };
      });
    },
    [decisionKey, options, rankOf, returnCount, returning, scene.hand],
  );

  const send = async (action: OlhoClientAction) => {
    if (!canAct) return;
    setSending(true);
    const ack = await sendAction(action);
    setSending(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const validPlay = selectedRank !== null && (options.get(selectedRank)?.has(selected.size) ?? false);
  const play = () => {
    if (!validPlay) return;
    const cardIds = [...selected];
    setSelection({ key: decisionKey, cards: NONE });
    void send({ type: 'PLAY', cardIds });
  };
  const doReturn = () => {
    if (selected.size !== returnCount) return;
    const cardIds = [...selected];
    rememberReturn(cardIds);
    setSelection({ key: decisionKey, cards: NONE });
    void send({ type: 'RETURN_CARDS', cardIds });
  };

  const pendingTimer = timer && timer.playerIds.includes(selfId) ? timer : null;
  const myPoints = scene.session.find((r) => r.playerId === selfId)?.points ?? null;
  const playableRanks = useMemo(() => new Set(options.keys()), [options]);
  const highlight = useMemo(
    () =>
      new Set(
        scene.exchange?.mine?.side === 'RECEIVER' && scene.exchange.stage !== 'DONE'
          ? (scene.exchange.mine.given ?? []).map((c) => c.id)
          : [],
      ),
    [scene.exchange],
  );
  const showSummary =
    scene.phase === 'GAME_SUMMARY' &&
    scene.lastGame !== null &&
    scene.lastGame.gameNumber !== dismissedSummary;

  let playButton: { label: string; ready: boolean } | null = null;
  if (playing) {
    if (selectedRank === null) playButton = { label: 'Escolhe as cartas', ready: false };
    else if (validPlay)
      playButton = { label: playLabel(scene.trick, selectedRank, selected.size), ready: true };
    else {
      const counts = [...(options.get(selectedRank) ?? [])];
      playButton = {
        label:
          counts.length === 1
            ? `Escolhe ${plural(counts[0] as number, 'carta', 'cartas')}`
            : 'Jogada inválida',
        ready: false,
      };
    }
  }

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden" style={FELT}>
      <TimeWarning timer={pendingTimer} />
      <Banner scene={scene} myPoints={myPoints} onShowScores={() => setScoresOpen(true)} />

      <div ref={arenaRef} className="relative min-h-0 flex-1">
        {arena && (
          <Center
            scene={scene}
            center={geometry.center}
            radii={geometry.radii}
            size={sizes.trick}
            caption={ticker}
            stamp={stamp}
            nameOf={nameOf}
          />
        )}
        {arena &&
          scene.seats.map((seat) => {
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
                <Seat
                  seat={seat}
                  player={players.get(seat.id)}
                  isTurn={scene.currentPlayerId === seat.id}
                  timer={timer && timer.playerIds.includes(seat.id) ? timer : null}
                  variant={sizes.seat}
                  bubble={bubbles[seat.id] ?? null}
                  skipPending={scene.trick.skip?.targetId === seat.id}
                  skipped={seals[seat.id] ?? null}
                />
              </div>
            );
          })}
        <ExchangeOverlay exchange={scene.exchange} nameOf={nameOf} timer={timer} />
        <SummaryOverlay
          summary={showSummary ? scene.lastGame : null}
          session={scene.session}
          nameOf={nameOf}
          selfId={selfId}
          onClose={() => setDismissedSummary(scene.lastGame?.gameNumber ?? null)}
        />
        {confetti !== null && <Confetti key={confetti} burst={confetti} />}
      </div>

      <div className="relative z-20 flex shrink-0 flex-col items-center gap-1.5 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <AnimatePresence>
          {scene.skipPrompt && escape && accept && (
            <EscapePanel
              key={`${scene.trick.number}:${scene.trick.plays.length}`}
              rank={scene.skipPrompt.rank}
              count={scene.skipPrompt.count}
              timer={pendingTimer}
              busy={!canAct}
              onEscape={() => void send(escape)}
              onAccept={() => void send(accept)}
            />
          )}
        </AnimatePresence>
        {scene.me?.waiting ? (
          <p className="rounded-2xl bg-black/30 px-4 py-3 text-center text-sm text-ivory/80 backdrop-blur-sm">
            Sentaste-te a meio de um jogo: recebes cartas no próximo, sem cargo.
          </p>
        ) : (
          <Hand
            cards={scene.hand}
            size={sizes.hand}
            scene={scene}
            selectable={(playing || returning) && !sending}
            playable={returning ? null : playableRanks}
            selected={playing || returning ? selected : NONE}
            highlight={highlight}
            onToggle={onToggle}
          />
        )}
        <ActionBar
          scene={scene}
          player={players.get(selfId)}
          message={statusMessage(scene, selfId, { playing, returning, returnCount }, nameOf)}
          highlight={playing || returning || !!escape}
          timer={pendingTimer}
          bubble={bubbles[selfId] ?? null}
        >
          {returning ? (
            <Button onClick={doReturn} disabled={selected.size !== returnCount || !canAct}>
              {selected.size === returnCount
                ? `Devolver ${plural(returnCount, 'carta', 'cartas')}`
                : `Escolhe ${returnCount}`}
            </Button>
          ) : playing ? (
            <>
              {canPass && (
                <Button variant="secondary" onClick={() => void send({ type: 'PASS' })} disabled={!canAct}>
                  Passar
                </Button>
              )}
              {playButton && (
                <Button onClick={play} disabled={!playButton.ready || !canAct}>
                  {playButton.label}
                </Button>
              )}
            </>
          ) : null}
        </ActionBar>
      </div>

      <Scoreboard
        open={scoresOpen}
        onClose={() => setScoresOpen(false)}
        rows={scene.session}
        games={scene.gamesCompleted}
        nameOf={nameOf}
        selfId={selfId}
      />
    </div>
  );
}

function statusMessage(
  scene: Scene,
  selfId: string,
  turn: { playing: boolean; returning: boolean; returnCount: number },
  nameOf: (id: string) => string,
): string {
  const me = scene.seats.find((s) => s.id === selfId);
  const current = scene.currentPlayerId;
  switch (scene.phase) {
    case 'FINISHED':
      return 'Sessão terminada';
    case 'WAITING':
      return 'À espera de mais jogadores — são precisos 3';
    case 'GAME_SUMMARY': {
      const role = scene.lastGame?.roles[selfId];
      return role ? `Fim do jogo — no próximo és ${ROLE_LABEL[role]}` : 'Fim do jogo';
    }
    case 'EXCHANGE': {
      const mine = scene.exchange?.mine;
      if (turn.returning)
        return `Escolhe ${plural(turn.returnCount, 'carta', 'cartas')} para devolver a ${nameOf(mine?.partnerId ?? '')}`;
      if (mine?.side === 'GIVER') return 'O servidor escolheu as tuas melhores cartas';
      return 'Troca de cartas em curso…';
    }
    case 'PLAYING':
      break;
  }
  if (scene.me?.waiting) return 'Entras no próximo jogo';
  if (me?.leaving) return 'Saíste deste jogo';
  if (me?.finishedPosition) return `Ficaste em ${ordinal(me.finishedPosition)} — os outros continuam`;
  if (me?.blocked) return 'Só te resta um 2/joker — passas até ao fim';
  if (scene.skipPrompt) return 'Escapa ao salto ou perde a vez';
  if (turn.playing) {
    const { count, topRank } = scene.trick;
    if (count === null || topRank === null) return 'A tua vez · abre a vaza';
    return `A tua vez · bate ${comboWithArticle(topRank, count)} ou passa`;
  }
  if (me?.passed) return 'Passaste — à espera do fim da vaza';
  if (scene.trick.closing)
    return scene.trick.closing.reason === 'ALL_PASSED' ? 'Vaza fechada' : 'Corte! Vaza fechada';
  return current ? `Vez de ${nameOf(current)}` : '…';
}
