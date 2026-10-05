import type { Card, CardId, PlayerId, Rank } from '@cardroom/game-core';
import {
  lowestCards,
  type CloseReason,
  type CutReason,
  type GameSummary,
  type OlhoEvent,
  type OlhoExchangeView,
  type OlhoRules,
  type OlhoSeatView,
  type OlhoSessionRow,
  type OlhoTrickView,
  type OlhoView,
  type Phase,
  type Role,
  type TrickPlay,
} from '@cardroom/olho';
import type { CardSize, EnterFrom, FlightRequest } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/**
 * What the Olho table currently shows. It starts equal to a server view and
 * is advanced event by event, so every play, skip, cut and swap animates
 * before the next authoritative view is committed.
 */
export interface SceneCard {
  card: Card;
  enter?: EnterFrom;
}

export type SeatScene = OlhoSeatView;

export interface PlayScene extends TrickPlay {
  /** `game:trick:index`: stable across commits. */
  key: string;
  /** Others' cards fly in from their seat; the viewer's glide out of the hand (shared layout id). */
  enter?: EnterFrom;
}

export interface TrickScene extends Omit<OlhoTrickView, 'plays'> {
  plays: PlayScene[];
}

export interface Scene extends BaseScene {
  seq: number;
  phase: Phase;
  selfId: PlayerId | null;
  displayName: string;
  rules: OlhoRules;
  gameNumber: number;
  gamesCompleted: number;
  hand: SceneCard[];
  me: { role: Role | null; waiting: boolean } | null;
  seats: SeatScene[];
  waiting: PlayerId[];
  currentPlayerId: PlayerId | null;
  trick: TrickScene;
  /** A cleared trick sliding off to the discard pile (keyed so each one re-triggers). */
  clearing: { key: number; plays: PlayScene[] } | null;
  discardCount: number;
  skipPrompt: OlhoView['skipPrompt'];
  exchange: OlhoExchangeView | null;
  lastGame: GameSummary | null;
  session: OlhoSessionRow[];
  /** Anchors the viewer's next new cards come from (an exchange): they arrive with the view. */
  incoming: string[];
}

export type Fx =
  | { kind: 'dealt'; gameNumber: number; exchange: boolean; leaderId: PlayerId | null }
  | { kind: 'given'; giver: PlayerId; receiver: PlayerId; count: number }
  | { kind: 'returned'; giver: PlayerId; receiver: PlayerId; count: number; auto: boolean }
  | { kind: 'exchangeDone'; leaderId: PlayerId }
  | { kind: 'played'; playerId: PlayerId; rank: Rank; count: number; escape: boolean }
  | { kind: 'passed'; playerId: PlayerId }
  | { kind: 'skipPending'; targetId: PlayerId; rank: Rank; count: number }
  | { kind: 'skipped'; playerId: PlayerId }
  | { kind: 'cut'; playerId: PlayerId; reason: CutReason }
  | {
      kind: 'closed';
      winnerId: PlayerId;
      leaderId: PlayerId | null;
      reason: CloseReason;
      last: { rank: Rank; count: number } | null;
    }
  | { kind: 'cleared'; leaderId: PlayerId }
  | { kind: 'finished'; playerId: PlayerId; position: number }
  | { kind: 'blocked'; playerId: PlayerId }
  | { kind: 'gameEnded'; summary: GameSummary }
  | { kind: 'joined'; playerId: PlayerId }
  | { kind: 'leaving'; playerId: PlayerId; position: number }
  | { kind: 'left'; playerId: PlayerId }
  | { kind: 'waiting'; seated: number }
  | { kind: 'sessionFinished' };

export const ANCHORS = {
  deck: 'deck',
  discard: 'discard',
  trick: 'trick',
  selfHand: 'self-hand',
  seat: (playerId: PlayerId) => `seat:${playerId}`,
} as const;

const playKey = (gameNumber: number, trickNumber: number, index: number) =>
  `${gameNumber}:${trickNumber}:${index}`;

export function sceneFromView(matchId: string, seq: number, view: OlhoView, previous?: Scene | null): Scene {
  const sameMatch = previous?.matchId === matchId;
  const previousHand = new Map((sameMatch ? previous.hand : []).map((c) => [c.card.id, c]));
  const previousPlays = new Map((sameMatch ? previous.trick.plays : []).map((p) => [p.key, p]));
  const incoming = sameMatch ? [...previous.incoming] : [];
  let arrivals = 0;
  const hand = (view.me?.hand ?? []).map((card): SceneCard => {
    const known = previousHand.get(card.id);
    if (known) return known;
    const from = incoming.shift();
    return from ? { card, enter: { from, kind: 'pickUp', delay: 0.08 * arrivals++ } } : { card };
  });
  const plays = view.trick.plays.map((play, i): PlayScene => {
    const key = playKey(view.gameNumber, view.trick.number, i);
    const known = previousPlays.get(key);
    return known && known.cards[0]?.id === play.cards[0]?.id ? known : { ...play, key };
  });
  return {
    matchId,
    seq,
    // A deal started by the events keeps running across the commit.
    dealing: sameMatch ? previous.dealing : false,
    phase: view.phase,
    selfId: view.selfId,
    displayName: view.displayName,
    rules: view.rules,
    gameNumber: view.gameNumber,
    gamesCompleted: view.gamesCompleted,
    hand,
    me: view.me ? { role: view.me.role, waiting: view.me.waiting } : null,
    seats: view.seats.map((seat) => ({ ...seat })),
    waiting: [...view.waiting],
    currentPlayerId: view.currentPlayerId,
    trick: { ...view.trick, plays },
    clearing: null,
    discardCount: view.discardCount,
    skipPrompt: view.skipPrompt,
    exchange: view.exchange,
    lastGame: view.lastGame,
    session: view.session,
    incoming: [],
  };
}

function withSeat(scene: Scene, playerId: PlayerId, update: (seat: SeatScene) => SeatScene): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.id === playerId ? update(seat) : seat)) };
}

/**
 * Best guess of who plays next (the view confirms it on commit): clockwise,
 * still in the trick. Back at whoever played last, the trick is over only if
 * nobody else is still in it (a skipped player is).
 */
export function nextInTrick(scene: Pick<Scene, 'seats' | 'trick'>, from: PlayerId): PlayerId | null {
  const n = scene.seats.length;
  const index = scene.seats.findIndex((s) => s.id === from);
  const stillIn = (seat: SeatScene) =>
    !(seat.handCount === 0 || seat.blocked || seat.leaving || scene.trick.passed.includes(seat.id));
  for (let step = 1; step < n; step++) {
    const seat = scene.seats[(index + step) % n] as SeatScene;
    if (!stillIn(seat)) continue;
    if (seat.id !== scene.trick.lastPlayerId) return seat.id;
    return scene.seats.some((other) => other.id !== seat.id && stillIn(other)) ? seat.id : null;
  }
  return null;
}

const step = (
  scene: Scene,
  waitMs: number,
  flights: FlightRequest[] = [],
  fx: Fx[] = [],
): Step<Scene, Fx> => ({
  scene,
  waitMs,
  flights,
  fx,
});

const freshTrick = (number: number, leaderId: PlayerId | null): TrickScene => ({
  number,
  isFirstOfGame: number === 1,
  leaderId,
  count: null,
  topRank: null,
  plays: [],
  passed: [],
  sameRankRun: null,
  skip: null,
  closing: null,
  lastPlayerId: null,
});

let clearingKey = 0;

export interface AnimationOptions {
  /** Cards the viewer just gave back in the exchange (never broadcast), so they fly from the hand. */
  ownReturn: () => readonly CardId[] | null;
  handSize: CardSize;
  trickSize: CardSize;
}

const DEFAULT_OPTIONS: AnimationOptions = { ownReturn: () => null, handSize: 'md', trickSize: 'sm' };

/** Advances the scene by one domain event and describes how to animate it (UI §9 timings). */
export function applyEvent(
  scene: Scene,
  event: OlhoEvent,
  options: AnimationOptions = DEFAULT_OPTIONS,
): Step<Scene, Fx> | Step<Scene, Fx>[] {
  const isSelf = (playerId: PlayerId) => playerId === scene.selfId;
  const backs = (from: string, to: string, count: number, size: CardSize = 'sm'): FlightRequest[] =>
    Array.from({ length: count }, (_, i) => ({
      from,
      to,
      size,
      toSize: 'xs',
      kind: 'play',
      delay: i * 0.12,
    }));

  switch (event.type) {
    case 'GameDealt': {
      const order = Object.keys(event.counts);
      const known = new Map(scene.seats.map((s) => [s.id, s]));
      const seats = order.map((id, seatIndex): SeatScene => ({
        ...(known.get(id) ?? { id, seatIndex, role: null, points: 0 }),
        handCount: event.counts[id] ?? 0,
        passed: false,
        finishedPosition: null,
        blocked: false,
        leaving: false,
      }));
      const stagger = dealStaggerSeconds(order.length, event.counts);
      const flights = order.flatMap((id, seatIndex) =>
        isSelf(id)
          ? []
          : Array.from({ length: event.counts[id] ?? 0 }, (_, card) => ({
              from: ANCHORS.deck,
              to: ANCHORS.seat(id),
              size: options.trickSize,
              toSize: 'xs' as const,
              kind: 'deal' as const,
              delay: (card * order.length + seatIndex) * stagger,
            })),
      );
      clearingKey += 1;
      return step(
        {
          ...scene,
          phase: event.exchange.length > 0 ? 'EXCHANGE' : 'PLAYING',
          gameNumber: event.gameNumber,
          hand: [],
          seats,
          waiting: scene.waiting.filter((id) => !order.includes(id)),
          currentPlayerId: event.leaderId,
          trick: freshTrick(1, event.leaderId),
          clearing: scene.trick.plays.length > 0 ? { key: clearingKey, plays: scene.trick.plays } : null,
          discardCount: 0,
          skipPrompt: null,
          exchange: null,
          dealing: true,
          incoming: [],
        },
        80,
        flights,
        [
          {
            kind: 'dealt',
            gameNumber: event.gameNumber,
            exchange: event.exchange.length > 0,
            leaderId: event.leaderId,
          },
        ],
      );
    }

    case 'ExchangeGiven':
    case 'ExchangeReturned': {
      const given = event.type === 'ExchangeGiven';
      const from = given ? event.giver : event.receiver;
      const to = given ? event.receiver : event.giver;
      let next: Scene = scene;
      let flights: FlightRequest[];
      if (isSelf(from)) {
        // The viewer's own cards: they know them, so they fly face up from the hand.
        const sent = given
          ? (scene.exchange?.mine?.given ?? []).map((c) => c.id)
          : event.type === 'ExchangeReturned' && event.auto
            ? lowestCards(
                scene.hand.map((c) => c.card),
                event.count,
              ).map((c) => c.id)
            : [...(options.ownReturn() ?? [])];
        const leaving = scene.hand.filter((c) => sent.includes(c.card.id));
        next = { ...next, hand: next.hand.filter((c) => !sent.includes(c.card.id)) };
        flights = leaving.map((c, i) => ({
          cardId: c.card.id,
          from: ANCHORS.selfHand,
          to: ANCHORS.seat(to),
          size: options.handSize,
          toSize: 'xs' as const,
          kind: 'play' as const,
          delay: i * 0.12,
        }));
        if (flights.length === 0) flights = backs(ANCHORS.selfHand, ANCHORS.seat(to), event.count);
      } else if (isSelf(to)) {
        next = {
          ...next,
          incoming: [...next.incoming, ...Array.from({ length: event.count }, () => ANCHORS.seat(from))],
        };
        flights = [];
      } else {
        flights = backs(ANCHORS.seat(from), ANCHORS.seat(to), event.count);
      }
      next = withSeat(next, from, (seat) => ({
        ...seat,
        handCount: Math.max(0, seat.handCount - event.count),
      }));
      next = withSeat(next, to, (seat) => ({ ...seat, handCount: seat.handCount + event.count }));
      if (next.exchange) {
        next = {
          ...next,
          exchange: {
            ...next.exchange,
            stage: given ? 'RETURNING' : next.exchange.stage,
            pairs: next.exchange.pairs.map((p) =>
              !given && p.giver === event.giver && p.receiver === event.receiver
                ? { ...p, returned: true }
                : p,
            ),
          },
        };
      }
      const fx: Fx = given
        ? { kind: 'given', giver: event.giver, receiver: event.receiver, count: event.count }
        : {
            kind: 'returned',
            giver: event.giver,
            receiver: event.receiver,
            count: event.count,
            auto: event.auto,
          };
      return step(next, 250 + 250 * event.count, flights, [fx]);
    }

    case 'ExchangeDone':
      return step(
        {
          ...scene,
          phase: 'PLAYING',
          currentPlayerId: event.leaderId,
          trick: { ...scene.trick, leaderId: event.leaderId },
          exchange: scene.exchange ? { ...scene.exchange, stage: 'DONE' } : null,
        },
        250,
        [],
        [{ kind: 'exchangeDone', leaderId: event.leaderId }],
      );

    case 'Played':
    case 'Escaped': {
      const { playerId, cards } = event;
      const rank = (cards[0] as Card).rank;
      const escape = event.type === 'Escaped';
      const key = playKey(scene.gameNumber, scene.trick.number, scene.trick.plays.length);
      let next: Scene = scene;
      let play: PlayScene = { key, playerId, cards: [...cards], escape };
      if (isSelf(playerId)) {
        const ids = new Set(cards.map((c) => c.id));
        next = { ...next, hand: next.hand.filter((c) => !ids.has(c.card.id)) };
      } else {
        next = withSeat(next, playerId, (seat) => ({
          ...seat,
          handCount: Math.max(0, seat.handCount - cards.length),
        }));
        play = { ...play, enter: { from: ANCHORS.seat(playerId), kind: 'play' } };
      }
      const run = scene.trick.sameRankRun;
      const trick: TrickScene = {
        ...next.trick,
        leaderId: next.trick.leaderId ?? playerId,
        plays: [...next.trick.plays, play],
        count: cards.length,
        topRank: rank,
        lastPlayerId: playerId,
        skip: null,
        sameRankRun:
          rank === 'JOKER'
            ? null
            : run?.rank === rank
              ? { rank, cards: run.cards + cards.length }
              : { rank, cards: cards.length },
      };
      const moved = { ...next, trick };
      return step(
        { ...moved, currentPlayerId: nextInTrick(moved, playerId), skipPrompt: null },
        escape ? 380 : 320,
        [],
        [{ kind: 'played', playerId, rank, count: cards.length, escape }],
      );
    }

    case 'Passed': {
      const passed = withSeat(scene, event.playerId, (seat) => ({ ...seat, passed: true }));
      const next = {
        ...passed,
        trick: { ...passed.trick, passed: [...passed.trick.passed, event.playerId] },
      };
      return step(
        { ...next, currentPlayerId: nextInTrick(next, event.playerId) },
        220,
        [],
        [{ kind: 'passed', playerId: event.playerId }],
      );
    }

    case 'SkipPending':
      return step(
        {
          ...scene,
          currentPlayerId: event.targetId,
          trick: { ...scene.trick, skip: { targetId: event.targetId, rank: event.rank, count: event.count } },
        },
        250,
        [],
        [{ kind: 'skipPending', targetId: event.targetId, rank: event.rank, count: event.count }],
      );

    case 'Skipped': {
      const next = { ...scene, trick: { ...scene.trick, skip: null }, skipPrompt: null };
      return step(
        { ...next, currentPlayerId: nextInTrick(next, event.playerId) },
        700,
        [],
        [{ kind: 'skipped', playerId: event.playerId }],
      );
    }

    case 'Cut':
      return step(
        { ...scene, currentPlayerId: null },
        900,
        [],
        [{ kind: 'cut', playerId: event.playerId, reason: event.reason }],
      );

    case 'TrickClosed': {
      const last = scene.trick.plays.at(-1);
      return step(
        {
          ...scene,
          currentPlayerId: null,
          trick: {
            ...scene.trick,
            skip: null,
            closing: { reason: event.reason, winnerId: event.winnerId },
          },
        },
        event.reason === 'ALL_PASSED' ? 500 : 150,
        [],
        [
          {
            kind: 'closed',
            winnerId: event.winnerId,
            leaderId: event.leaderId,
            reason: event.reason,
            last: last ? { rank: (last.cards[0] as Card).rank, count: last.cards.length } : null,
          },
        ],
      );
    }

    case 'TrickCleared': {
      clearingKey += 1;
      const cleared = scene.trick.plays.reduce((sum, p) => sum + p.cards.length, 0);
      return step(
        {
          ...scene,
          seats: scene.seats.map((seat) => ({ ...seat, passed: false })),
          trick: freshTrick(event.number, event.leaderId),
          clearing: { key: clearingKey, plays: scene.trick.plays },
          discardCount: scene.discardCount + cleared,
          currentPlayerId: event.leaderId,
          exchange: scene.exchange?.stage === 'DONE' ? null : scene.exchange,
        },
        420,
        [],
        [{ kind: 'cleared', leaderId: event.leaderId }],
      );
    }

    case 'PlayerFinished':
      return step(
        withSeat(scene, event.playerId, (seat) => ({ ...seat, finishedPosition: event.position })),
        350,
        [],
        [{ kind: 'finished', playerId: event.playerId, position: event.position }],
      );

    case 'PlayerBlocked':
      return step(
        withSeat(scene, event.playerId, (seat) => ({ ...seat, blocked: true })),
        300,
        [],
        [{ kind: 'blocked', playerId: event.playerId }],
      );

    case 'GameEnded': {
      const { summary, points } = event;
      return step(
        {
          ...scene,
          phase: 'GAME_SUMMARY',
          currentPlayerId: null,
          lastGame: summary,
          gamesCompleted: scene.gamesCompleted + 1,
          trick: { ...scene.trick, skip: null, closing: null },
          exchange: null,
          skipPrompt: null,
          seats: scene.seats.map((seat) => ({
            ...seat,
            points: points[seat.id] ?? seat.points + (summary.pointsDelta[seat.id] ?? 0),
            role: summary.roles[seat.id] ?? seat.role,
            finishedPosition: summary.order.indexOf(seat.id) + 1 || seat.finishedPosition,
          })),
          me:
            scene.me && scene.selfId
              ? { ...scene.me, role: summary.roles[scene.selfId] ?? scene.me.role }
              : scene.me,
        },
        650,
        [],
        [{ kind: 'gameEnded', summary }],
      );
    }

    case 'PlayerJoined':
      return step(
        scene.seats.some((s) => s.id === event.playerId) || scene.waiting.includes(event.playerId)
          ? withSeat(scene, event.playerId, (seat) => ({ ...seat, leaving: false }))
          : { ...scene, waiting: [...scene.waiting, event.playerId] },
        0,
        [],
        [{ kind: 'joined', playerId: event.playerId }],
      );

    case 'PlayerLeaving':
      return step(
        withSeat(scene, event.playerId, (seat) => ({
          ...seat,
          leaving: true,
          finishedPosition: event.position,
        })),
        300,
        [],
        [{ kind: 'leaving', playerId: event.playerId, position: event.position }],
      );

    case 'PlayerLeft':
      return step(
        {
          ...scene,
          seats: scene.seats.filter((s) => s.id !== event.playerId),
          waiting: scene.waiting.filter((id) => id !== event.playerId),
        },
        0,
        [],
        [{ kind: 'left', playerId: event.playerId }],
      );

    case 'WaitingForPlayers':
      return step(
        { ...scene, phase: 'WAITING', currentPlayerId: null },
        0,
        [],
        [{ kind: 'waiting', seated: event.seated }],
      );

    case 'SessionFinished':
      return step(
        { ...scene, phase: 'FINISHED', currentPlayerId: null },
        200,
        [],
        [{ kind: 'sessionFinished' }],
      );
  }
}

/** UI §9: 25 ms between cards, compressed so even a full deal lasts about a second and a half. */
export function dealStaggerSeconds(seatCount: number, counts: Record<PlayerId, number> | number): number {
  const total = typeof counts === 'number' ? counts : Object.values(counts).reduce((sum, n) => sum + n, 0);
  return Math.min(0.025, 1.4 / Math.max(1, total || seatCount));
}

/** Delay of one card of the deal: round-robin, one card per seat at a time. */
export function dealDelaySeconds(cardIndex: number, seatIndex: number, scene: Pick<Scene, 'seats'>): number {
  const total = scene.seats.reduce((sum, s) => sum + s.handCount, 0);
  return (cardIndex * scene.seats.length + seatIndex) * dealStaggerSeconds(scene.seats.length, total);
}

export function dealDurationMs(scene: Pick<Scene, 'seats' | 'hand' | 'selfId'>): number {
  const selfIndex = Math.max(
    0,
    scene.seats.findIndex((s) => s.id === scene.selfId),
  );
  const longest = Math.max(scene.hand.length, ...scene.seats.map((s) => s.handCount));
  const last = dealDelaySeconds(Math.max(0, longest - 1), Math.max(selfIndex, scene.seats.length - 1), scene);
  return Math.round(last * 1000) + 280;
}
