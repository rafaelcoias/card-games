'use client';

import type { PlayerId } from '@cardroom/game-core';
import type { Seat, SuecaAction, SuecaClientAction, SuecaEvent, SuecaView, Team } from '@cardroom/sueca';
import type { RoomPlayer } from '@cardroom/shared';
import { cardHeight } from '@cardroom/ui';
import { AnimatePresence } from 'motion/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { playSound } from '../shared/sounds';
import { TimeWarning } from '../shared/time-warning';
import { useDirector, type Choreography, type TimerSnapshot } from '../shared/use-director';
import { useElementSize } from '../shared/use-element-size';
import { useTableLayout, useViewport } from '../shared/use-media';
import type { GameTableProps } from '../types';
import {
  Caption,
  CutChoice,
  Deck,
  LastTrickButton,
  LastTrickOverlay,
  Pile,
  Trick,
  TrumpCard,
} from './center';
import { TEAM_COLOR } from './copy';
import { Hand } from './hand';
import { seatAt, suecaSizes, tableGeometry, type Side, type Sizes } from './layout';
import { HandSummaryPanel, HistoryPanel, ScoreCorner, TrumpCorner } from './panels';
import { applyEvent, dealDurationMs, sceneFromView, type Fx, type Scene } from './scene';
import { NameTag, OpponentSeat } from './seat';

/** UI §7: a look at the last trick lasts 3 s. */
const LOOK_MS = 3000;

export function useSuecaSizes(): Sizes {
  const layout = useTableLayout();
  const { height } = useViewport();
  return useMemo(() => suecaSizes(layout, height), [layout, height]);
}

export function SuecaTable({ room, selfId, sendAction }: GameTableProps) {
  const players = useMemo(() => new Map(room.players.map((p) => [p.id, p])), [room.players]);
  const nameOf = useCallback(
    (id: PlayerId) => (id === selfId ? 'Tu' : (players.get(id)?.username ?? 'Alguém')),
    [players, selfId],
  );
  const sizes = useSuecaSizes();

  // Sound is off by default, and Sueca keeps to three soft cues (UI §13).
  const onFx = useCallback((fx: Fx) => {
    if (fx.kind === 'played') playSound('play');
    else if (fx.kind === 'collected') playSound('pickUp');
    else if (fx.kind === 'handEnded') playSound('handEnd');
  }, []);

  const choreography = useMemo<Choreography<SuecaView, SuecaEvent, Scene, Fx>>(
    () => ({
      fromView: sceneFromView,
      applyEvent: (scene, event) => applyEvent(scene, event, { trickSize: sizes.trick }),
      // A match opens with the cut: the cards are dealt by the events that follow it.
      isOpeningDeal: () => false,
      dealDurationMs,
    }),
    [sizes.trick],
  );
  const { scene, validActions, timer, animating } = useDirector<
    SuecaView,
    SuecaAction,
    SuecaEvent,
    Scene,
    Fx
  >(choreography, onFx);

  if (!scene) {
    return (
      <div className="felt flex h-full items-center justify-center">
        <p className="animate-pulse text-ivory/70">A baralhar…</p>
      </div>
    );
  }
  return (
    <SuecaTableView
      scene={scene}
      selfId={selfId}
      players={players}
      sizes={sizes}
      validActions={validActions as SuecaClientAction[]}
      timer={timer}
      animating={animating}
      nameOf={nameOf}
      sendAction={sendAction}
    />
  );
}

export interface SuecaTableViewProps {
  scene: Scene;
  selfId: string;
  players: Map<string, RoomPlayer>;
  sizes: Sizes;
  validActions: SuecaClientAction[];
  timer: TimerSnapshot | null;
  animating: boolean;
  nameOf: (id: PlayerId) => string;
  sendAction: GameTableProps['sendAction'];
}

const OTHERS: readonly Exclude<Side, 'bottom'>[] = ['left', 'top', 'right'];

/**
 * A real Sueca table, without noise (UI): you at the bottom, your partner at
 * the top, the trick in a cross, the trump in a corner, the score in the other.
 */
export function SuecaTableView({
  scene,
  selfId,
  players,
  sizes,
  validActions,
  timer,
  animating,
  nameOf,
  sendAction,
}: SuecaTableViewProps) {
  const [arenaRef, arena] = useElementSize<HTMLDivElement>();
  const geometry = useMemo(
    () => (arena ? tableGeometry(arena, sizes.trick, sizes.compact) : null),
    [arena, sizes.trick, sizes.compact],
  );
  const [sending, setSending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dismissedSummary, setDismissedSummary] = useState<string | null>(null);
  const [lookOver, setLookOver] = useState<string | null>(null);

  const { mySeat, myTeam } = scene;
  const seatInfo = (seat: Seat) => scene.seats.find((s) => s.seat === seat);
  const playerAt = (seat: Seat) => seatInfo(seat)?.playerId ?? '';
  const nameAt = (seat: Seat) => nameOf(playerAt(seat));
  const phase = scene.phase === 'PAUSED' ? scene.pausedFrom : scene.phase;

  const canAct = !animating && !sending && scene.phase !== 'PAUSED';
  const plays = canAct ? validActions.filter((a) => a.type === 'PLAY') : [];
  const playable = plays.length > 0 ? new Set(plays.map((a) => a.cardUid)) : null;
  const canCut = canAct && validActions.some((a) => a.type === 'CHOOSE_CUT');
  const canLook =
    canAct && scene.lastTrickAvailable && validActions.some((a) => a.type === 'VIEW_LAST_TRICK');

  const send = async (action: SuecaClientAction) => {
    if (!canAct) return;
    setSending(true);
    const ack = await sendAction(action);
    setSending(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  const timerFor = (seat: Seat): TimerSnapshot | null =>
    timer && scene.current === seat && timer.playerIds.includes(playerAt(seat)) ? timer : null;
  const myTimer = mySeat ? timerFor(mySeat) : null;

  // The look at the last trick ends after 3 s here, whatever the server's clock (UI §7).
  const look = scene.lastTrickView;
  const lookKey = look
    ? `${scene.matchId}:${scene.handNumber}:${look.plays.map((p) => p.card.uid).join()}`
    : null;
  useEffect(() => {
    if (!lookKey) return;
    const id = window.setTimeout(() => setLookOver(lookKey), LOOK_MS);
    return () => window.clearTimeout(id);
  }, [lookKey]);

  const summaryKey = scene.summary ? `${scene.matchId}:${scene.summary.hand}` : null;
  const showSummary =
    summaryKey !== null &&
    summaryKey !== dismissedSummary &&
    (phase === 'HAND_SUMMARY' || phase === 'FINISHED');

  const us: Team = myTeam ?? 'A';
  const them: Team = us === 'A' ? 'B' : 'A';
  const partnerColor = myTeam ? TEAM_COLOR[myTeam] : null;
  const trumpInMyHand = !!scene.trump?.card && scene.hand.some((c) => c.card.uid === scene.trump?.card?.uid);
  // UI §3: everyone else sees who is cutting.
  const caption =
    phase === 'CUT' && !scene.cutting && scene.cutter !== mySeat
      ? `${nameAt(scene.cutter)} está a cortar…`
      : null;

  return (
    <div className="felt relative flex h-full flex-col overflow-hidden">
      <TimeWarning timer={myTimer} />
      <TrumpCorner suit={scene.trump?.suit ?? null} />
      <ScoreCorner
        games={scene.games}
        targetGames={scene.targetGames}
        myTeam={myTeam}
        matchesWon={scene.matchesWon}
        onOpen={() => setHistoryOpen(true)}
      />

      <div ref={arenaRef} className="relative min-h-0 flex-1">
        {geometry && (
          <>
            {OTHERS.map((side) => {
              const seat = seatAt(side, mySeat);
              const info = seatInfo(seat);
              const point = geometry.seats[side];
              const player = players.get(info?.playerId ?? '');
              return (
                <div
                  key={side}
                  className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: point.x, top: point.y, maxWidth: sizes.compact ? 96 : 160 }}
                >
                  <OpponentSeat
                    seat={seat}
                    name={player?.username ?? nameAt(seat)}
                    handCount={info?.handCount ?? 0}
                    active={scene.current === seat}
                    timer={timerFor(seat)}
                    dealer={scene.dealer === seat}
                    teamColor={side === 'top' ? partnerColor : null}
                    absent={info?.absent ?? false}
                    compact={sizes.compact}
                    vertical={false}
                  />
                </div>
              );
            })}

            <Deck
              at={geometry.center}
              size={sizes.trick}
              visible={
                phase === 'CUT' || scene.cutting !== null || scene.trump?.at === 'deck' || scene.dealing
              }
              parted={scene.cutting !== null}
            />
            {canCut && (
              <CutChoice
                at={geometry.center}
                size={sizes.trick}
                timer={myTimer}
                busy={!canAct}
                onChoose={(from) => void send({ type: 'CHOOSE_CUT', from })}
              />
            )}
            <Trick
              trick={scene.trick}
              winner={scene.trickWinner}
              mySeat={mySeat}
              geometry={geometry}
              size={sizes.trick}
            />
            {!trumpInMyHand && (
              <TrumpCard trump={scene.trump} mySeat={mySeat} geometry={geometry} size={sizes.trick} />
            )}
            <Pile team={us} count={scene.tricksWon[us]} at={geometry.piles.us} ours />
            <Pile team={them} count={scene.tricksWon[them]} at={geometry.piles.them} ours={false} />
            <AnimatePresence>
              {canLook && (
                <LastTrickButton
                  key="look"
                  at={geometry.piles.us}
                  busy={!canAct}
                  onClick={() => void send({ type: 'VIEW_LAST_TRICK' })}
                />
              )}
            </AnimatePresence>
            <LastTrickOverlay
              trick={lookKey !== null && lookKey !== lookOver ? look : null}
              mySeat={mySeat}
              size={sizes.trick}
              center={geometry.center}
              nameOf={nameAt}
            />
            <Caption
              text={caption}
              at={{ x: geometry.center.x, y: geometry.center.y + cardHeight(sizes.trick) / 2 + 24 }}
            />
            <HandSummaryPanel
              summary={showSummary ? scene.summary : null}
              myTeam={myTeam}
              games={scene.games}
              targetGames={scene.targetGames}
              onClose={() => setDismissedSummary(summaryKey)}
            />
          </>
        )}
      </div>

      {mySeat && (
        <div className="relative z-20 flex shrink-0 flex-col items-center gap-1 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <NameTag
              name={players.get(selfId)?.username ?? 'Tu'}
              active={scene.current === mySeat}
              timer={myTimer}
              dealer={scene.dealer === mySeat}
              teamColor={partnerColor}
              absent={false}
              label="Tu"
            />
            {playable && (
              <span className="text-xs font-semibold text-gold" role="status">
                A tua vez
              </span>
            )}
          </div>
          <Hand
            cards={scene.hand}
            size={sizes.hand}
            mySeat={mySeat}
            dealer={scene.dealer}
            dealing={scene.dealing}
            playable={playable}
            trumpUid={scene.trump?.holder === mySeat && scene.trump.card ? scene.trump.card.uid : null}
            onPlay={(cardUid) => void send({ type: 'PLAY', cardUid })}
          />
        </div>
      )}

      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        hands={scene.history}
        myTeam={myTeam}
        score={scene.games}
        targetGames={scene.targetGames}
        dealerName={nameAt}
      />
    </div>
  );
}
