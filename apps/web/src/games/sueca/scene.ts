import type { CardInstance, PlayerId, Suit } from '@cardroom/game-core';
import {
  nextSeat,
  type ClosedTrick,
  type CutFrom,
  type HandSummary,
  type LivePhase,
  type Phase,
  type Seat,
  type SuecaEvent,
  type SuecaView,
  type Team,
} from '@cardroom/sueca';
import type { CardSize, EnterFrom, FlightRequest } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/** UI §14: 40 cards dealt 30 ms apart. */
export const DEAL_STAGGER_S = 0.03;

export const ANCHORS = {
  deck: 'sueca:deck',
  seat: (seat: Seat) => `sueca:seat:${seat}`,
  trick: (seat: Seat) => `sueca:trick:${seat}`,
  pile: (team: Team) => `sueca:pile:${team}`,
} as const;

export interface SceneCard {
  card: CardInstance;
  enter?: EnterFrom;
}

export interface TrickCard {
  seat: Seat;
  card: CardInstance;
  enter?: EnterFrom;
}

export interface SeatScene {
  seat: Seat;
  playerId: PlayerId;
  team: Team;
  handCount: number;
  absent: boolean;
}

export interface TrumpScene {
  suit: Suit;
  /** `null` once its holder played it. */
  card: CardInstance | null;
  holder: Seat;
  /** Just turned over on the deck, or lying beside its holder (UI §3, §4). */
  at: 'deck' | 'holder';
  faceDown: boolean;
}

/**
 * What the Sueca table shows. It starts equal to a server view and is advanced
 * event by event, so every move animates before the next view is committed.
 */
export interface Scene extends BaseScene {
  seq: number;
  phase: Phase;
  pausedFrom: LivePhase | null;
  mySeat: Seat | null;
  myTeam: Team | null;
  /** In the order of play. */
  seats: SeatScene[];
  current: Seat | null;
  hand: SceneCard[];
  legal: string[];
  handNumber: number;
  dealer: Seat;
  cutter: Seat;
  /** The deck parts while the cut is made (UI §3). */
  cutting: CutFrom | null;
  trump: TrumpScene | null;
  trick: TrickCard[];
  trickWinner: Seat | null;
  tricksWon: Record<Team, number>;
  tricksPlayed: number;
  lastTrickAvailable: boolean;
  lastTrickView: ClosedTrick | null;
  games: Record<Team, number>;
  targetGames: number;
  matchesWon: Record<Team, number>;
  /** The hand's result on screen (UI §8). */
  summary: HandSummary | null;
  history: HandSummary[];
  absent: Seat[];
  winner: Team | null;
}

export type Fx =
  | { kind: 'handStarted'; hand: number; dealer: Seat; cutter: Seat }
  | { kind: 'cut'; cutter: Seat; from: CutFrom }
  | { kind: 'played'; seat: Seat }
  | { kind: 'trickWon'; winner: Seat }
  | { kind: 'collected'; team: Team }
  | { kind: 'handEnded'; summary: HandSummary }
  | { kind: 'finished'; winner: Team };

export function sceneFromView(matchId: string, seq: number, view: SuecaView, previous?: Scene | null): Scene {
  const sameMatch = previous?.matchId === matchId;
  const previousHand = new Map((sameMatch ? previous.hand : []).map((c) => [c.card.uid, c]));
  const previousTrick = new Map((sameMatch ? previous.trick : []).map((t) => [t.card.uid, t]));
  const current = view.seats.find((s) => s.isCurrent)?.seat ?? null;
  return {
    matchId,
    seq,
    // A deal started by the events keeps running across the commit.
    dealing: sameMatch ? previous.dealing : false,
    phase: view.phase,
    pausedFrom: view.pausedFrom,
    mySeat: view.mySeat,
    myTeam: view.myTeam,
    seats: view.seats.map(({ seat, playerId, team, handCount, absent }) => ({
      seat,
      playerId,
      team,
      handCount,
      absent,
    })),
    current,
    hand: view.myHand.map((card) => previousHand.get(card.uid) ?? { card }),
    legal: view.legalCardUids,
    handNumber: view.handNumber,
    dealer: view.dealer,
    cutter: view.cutter,
    cutting: null,
    trump: view.trump ? { ...view.trump, at: 'holder', faceDown: false } : null,
    trick: view.trick.plays.map((play) => previousTrick.get(play.card.uid) ?? { ...play }),
    trickWinner: view.trickWinner,
    tricksWon: view.tricksWon,
    tricksPlayed: view.tricksPlayed,
    lastTrickAvailable: view.lastTrickAvailable,
    lastTrickView: view.lastTrickView,
    games: view.games,
    targetGames: view.targetGames,
    matchesWon: view.matchesWon,
    summary: view.handSummary,
    history: view.history,
    absent: view.absent,
    winner: view.winner,
  };
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

/** Deal order from the dealer's right, the dealer last (rules §6). */
export function dealOffset(seat: Seat, dealer: Seat): number {
  return [1, 2, 3, 0].findIndex((steps) => nextSeat(dealer, steps) === seat);
}

/** When the `index`-th card of a seat leaves the deck, one card at a time around the table. */
export const dealDelaySeconds = (index: number, seat: Seat, dealer: Seat): number =>
  (index * 4 + dealOffset(seat, dealer)) * DEAL_STAGGER_S;

export const dealDurationMs = (): number => Math.round(39 * DEAL_STAGGER_S * 1000) + 320;

export interface AnimationOptions {
  /** Size of the cards on the table; collected tricks shrink from it. */
  trickSize: CardSize;
}

/** Advances the scene by one domain event and describes how to animate it. */
export function applyEvent(
  scene: Scene,
  event: SuecaEvent,
  options: AnimationOptions = { trickSize: 'md' },
): Step<Scene, Fx> | Step<Scene, Fx>[] {
  switch (event.type) {
    case 'HandStarted':
      return step(
        {
          ...scene,
          phase: 'CUT',
          handNumber: event.hand,
          dealer: event.dealer,
          cutter: event.cutter,
          current: event.cutter,
          cutting: null,
          trump: null,
          hand: [],
          legal: [],
          seats: scene.seats.map((seat) => ({ ...seat, handCount: 0 })),
          trick: [],
          trickWinner: null,
          tricksWon: { A: 0, B: 0 },
          tricksPlayed: 0,
          lastTrickAvailable: false,
          lastTrickView: null,
          summary: null,
        },
        300,
        [],
        [{ kind: 'handStarted', hand: event.hand, dealer: event.dealer, cutter: event.cutter }],
      );

    case 'CutChosen':
      return step(
        { ...scene, cutting: event.from, current: null },
        420,
        [],
        [{ kind: 'cut', cutter: event.cutter, from: event.from }],
      );

    case 'TrumpRevealed': {
      // The chosen card turns over on the deck, then slides to its holder (UI §3: 600 ms).
      const trump: TrumpScene = {
        suit: event.card.suit as Suit,
        card: event.card,
        holder: event.holder,
        at: 'deck',
        faceDown: true,
      };
      const onDeck = { ...scene, trump };
      return [
        step(onDeck, 60),
        step({ ...onDeck, trump: { ...trump, faceDown: false } }, 460),
        step({ ...onDeck, cutting: null, trump: { ...trump, faceDown: false, at: 'holder' } }, 600),
      ];
    }

    case 'CardsDealt': {
      // Hidden hands fly in as backs; the viewer's own cards deal themselves once the view lands.
      const flights: FlightRequest[] = scene.seats.flatMap(({ seat }) => {
        if (seat === scene.mySeat) return [];
        // The dealer's tenth card is the trump card, already beside them.
        const count = (event.counts[seat] ?? 0) - (seat === scene.dealer ? 1 : 0);
        return Array.from({ length: count }, (_, card) => ({
          from: ANCHORS.deck,
          to: ANCHORS.seat(seat),
          size: options.trickSize,
          toSize: 'xs' as const,
          kind: 'deal' as const,
          delay: dealDelaySeconds(card, seat, scene.dealer),
        }));
      });
      return step(
        {
          ...scene,
          phase: 'PLAYING',
          dealing: true,
          seats: scene.seats.map((seat) => ({ ...seat, handCount: event.counts[seat.seat] ?? 0 })),
          current: nextSeat(scene.dealer),
        },
        60,
        flights,
      );
    }

    case 'CardPlayed': {
      const { seat, card } = event;
      let next: Scene = {
        ...scene,
        seats: scene.seats.map((s) =>
          s.seat === seat ? { ...s, handCount: Math.max(0, s.handCount - 1) } : s,
        ),
      };
      let trickCard: TrickCard = { seat, card };
      if (seat === scene.mySeat) {
        // Shared layoutId: the card glides out of the hand.
        next = { ...next, hand: next.hand.filter((c) => c.card.uid !== card.uid) };
      } else if (scene.trump?.card?.uid !== card.uid) {
        // Others' cards come from their seat; the face-up trump glides from beside its holder (shared layoutId).
        trickCard = { ...trickCard, enter: { from: ANCHORS.seat(seat), kind: 'play' } };
      }
      if (next.trump?.card?.uid === card.uid) next = { ...next, trump: { ...next.trump, card: null } };
      const trick = [...next.trick, trickCard];
      const complete = trick.length === 4;
      return step(
        { ...next, phase: 'PLAYING', trick, legal: [], current: complete ? null : nextSeat(seat) },
        complete ? 420 : 300,
        [],
        [{ kind: 'played', seat }],
      );
    }

    case 'TrickWon':
      return step(
        { ...scene, phase: 'TRICK_DONE', trickWinner: event.winner, current: null },
        450,
        [],
        [{ kind: 'trickWon', winner: event.winner }],
      );

    case 'TrickCollected': {
      // The four cards slide together to the winners' pile, face down (UI §6: 350 ms).
      const flights: FlightRequest[] = scene.trick.map((t, i) => ({
        cardId: t.card.id,
        from: ANCHORS.trick(t.seat),
        to: ANCHORS.pile(event.team),
        size: options.trickSize,
        toSize: 'xs',
        kind: 'pickUp',
        delay: i * 0.02,
      }));
      return step(
        {
          ...scene,
          phase: event.next ? 'PLAYING' : scene.phase,
          trick: [],
          trickWinner: null,
          tricksWon: { ...scene.tricksWon, [event.team]: scene.tricksWon[event.team] + 1 },
          tricksPlayed: scene.tricksPlayed + 1,
          current: event.next,
        },
        380,
        flights,
        [{ kind: 'collected', team: event.team }],
      );
    }

    case 'LastTrickViewed':
      return step(scene, 0);

    case 'HandEnded': {
      const { summary } = event;
      return step(
        {
          ...scene,
          phase: 'HAND_SUMMARY',
          current: null,
          summary,
          history: [...scene.history, summary],
          games: { A: scene.games.A + summary.gamesAwarded.A, B: scene.games.B + summary.gamesAwarded.B },
          lastTrickAvailable: false,
          lastTrickView: null,
        },
        400,
        [],
        [{ kind: 'handEnded', summary }],
      );
    }

    case 'GamePaused':
      return step(
        {
          ...scene,
          phase: 'PAUSED',
          pausedFrom: scene.phase === 'PAUSED' ? scene.pausedFrom : (scene.phase as LivePhase),
          absent: [...scene.absent.filter((s) => s !== event.seat), event.seat],
          current: null,
          legal: [],
        },
        0,
      );

    case 'GameResumed': {
      const absent = scene.absent.filter((s) => s !== event.seat);
      const back = absent.length === 0 && scene.pausedFrom !== null;
      return step(
        {
          ...scene,
          absent,
          phase: back ? (scene.pausedFrom as LivePhase) : scene.phase,
          pausedFrom: back ? null : scene.pausedFrom,
        },
        0,
      );
    }

    case 'MatchFinished':
      return step(
        { ...scene, phase: 'FINISHED', current: null, winner: event.winner, games: event.games },
        300,
        [],
        [{ kind: 'finished', winner: event.winner }],
      );
  }
}
