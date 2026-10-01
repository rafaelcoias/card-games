import type { Card, CardId, PlayerId, StandardRank } from '@cardroom/game-core';
import type {
  DesconfiaEvent,
  DesconfiaView,
  DoubtWindow,
  Phase,
  PublicPlay,
  Removed,
} from '@cardroom/desconfia';
import type { CardSize, EnterFrom, FlightRequest } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/**
 * What the Desconfia table currently shows. It starts equal to a server view
 * and is advanced event by event, so every play, doubt and reveal animates
 * before the next authoritative view is committed.
 */
export interface SceneCard {
  card: Card;
  enter?: EnterFrom;
}

export interface SeatScene {
  id: PlayerId;
  handCount: number;
  finishedPosition: number | null;
}

/** One face-down card of the pile. Its face is known only for the viewer's own plays. */
export interface PileCard {
  /** `${playId}:${index}`: stable across commits. */
  key: string;
  playId: number;
  card: Card | null;
  enter?: EnterFrom;
}

/** A doubted play on its way to the truth: lifted, turned over, then stamped (UI §6). */
export interface RevealScene {
  playId: number;
  authorId: PlayerId;
  doubterId: PlayerId;
  claimRank: StandardRank;
  truthful: boolean;
  /** Same keys as the pile cards they were, so they glide out of it. */
  cards: { key: string; card: Card; layoutId: string }[];
  stage: 'lift' | 'flip' | 'stamp';
}

/** Four of a kind fanned out in the middle before they leave the game (UI §7). */
export interface Showcase {
  key: number;
  playerId: PlayerId;
  rank: StandardRank;
  cards: SceneCard[];
}

export interface Scene extends BaseScene {
  seq: number;
  phase: Phase;
  selfId: PlayerId | null;
  hand: SceneCard[];
  seats: SeatScene[];
  currentPlayerId: PlayerId | null;
  pile: PileCard[];
  claimRank: StandardRank | null;
  pilePlays: PublicPlay[];
  doubtWindow: DoubtWindow | null;
  reveal: RevealScene | null;
  showcase: Showcase | null;
  removed: Removed[];
  finishedOrder: PlayerId[];
  doubtMinWindowMs: number;
  lastCardWindowMs: number;
  playUntilEnd: boolean;
  /** Anchors the viewer's next unseen cards come from (a pile taken): they arrive with the view. */
  incoming: string[];
}

export type Fx =
  /** `windowMs`: how long a last card stays open to doubts. */
  | {
      kind: 'played';
      playerId: PlayerId;
      count: number;
      claimRank: StandardRank;
      lastCard: boolean;
      windowMs: number;
    }
  | { kind: 'doubt'; doubterId: PlayerId; authorId: PlayerId }
  | { kind: 'verdict'; truthful: boolean; authorId: PlayerId; doubterId: PlayerId }
  | { kind: 'pileTaken'; playerId: PlayerId; count: number }
  | { kind: 'peixinho'; playerId: PlayerId; rank: StandardRank }
  | { kind: 'newPile'; starterId: PlayerId }
  | { kind: 'won'; playerId: PlayerId; position: number }
  | { kind: 'finished'; finishedOrder: PlayerId[] };

export const ANCHORS = {
  pile: 'pile',
  reveal: 'reveal',
  removed: 'removed',
  seat: (playerId: PlayerId) => `seat:${playerId}`,
  selfHand: 'self-hand',
} as const;

/** The layout id a card of the pile glides with: its own face when known, else its place in the pile. */
export const pileLayoutId = (entry: Pick<PileCard, 'key' | 'card'>) =>
  entry.card ? `card-${entry.card.id}` : `pile-${entry.key}`;

export function sceneFromView(
  matchId: string,
  seq: number,
  view: DesconfiaView,
  previous?: Scene | null,
): Scene {
  const sameMatch = previous?.matchId === matchId;
  const previousHand = new Map((sameMatch ? previous.hand : []).map((c) => [c.card.id, c]));
  const previousPile = new Map((sameMatch ? previous.pile : []).map((p) => [p.key, p]));
  const incoming = sameMatch ? [...previous.incoming] : [];
  let arrivals = 0;
  const hand = (view.me?.hand ?? []).map((card): SceneCard => {
    const known = previousHand.get(card.id);
    if (known) return known;
    const from = incoming.shift();
    return from
      ? { card, enter: { from, kind: 'pickUp', delay: Math.min(0.6, 0.03 * arrivals++) } }
      : { card };
  });
  const pile = view.pilePlays.flatMap((play) =>
    Array.from({ length: play.count }, (_, i): PileCard => {
      const key = `${play.playId}:${i}`;
      return previousPile.get(key) ?? { key, playId: play.playId, card: null };
    }),
  );
  return {
    matchId,
    seq,
    // A deal started by the view keeps running across the commit.
    dealing: sameMatch ? previous.dealing : false,
    phase: view.phase,
    selfId: view.selfId,
    hand,
    seats: view.seats.map((seat) => ({ ...seat })),
    currentPlayerId: view.currentPlayerId,
    pile,
    claimRank: view.claimRank,
    pilePlays: view.pilePlays,
    doubtWindow: view.doubtWindow,
    reveal: null,
    showcase: null,
    removed: view.removed,
    finishedOrder: view.finishedOrder,
    doubtMinWindowMs: view.doubtMinWindowMs,
    lastCardWindowMs: view.lastCardWindowMs,
    playUntilEnd: view.playUntilEnd,
    incoming: [],
  };
}

function withSeat(scene: Scene, playerId: PlayerId, update: (seat: SeatScene) => SeatScene): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.id === playerId ? update(seat) : seat)) };
}

/** Next player still in the game, clockwise (the view confirms it on commit). */
function nextActive(scene: Scene, playerId: PlayerId): PlayerId | null {
  const n = scene.seats.length;
  const from = scene.seats.findIndex((s) => s.id === playerId);
  for (let step = 1; step < n; step++) {
    const seat = scene.seats[(from + step) % n] as SeatScene;
    if (seat.finishedPosition === null) return seat.id;
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

let showcaseKey = 0;

export interface AnimationOptions {
  /** Cards the viewer just sent in a play, so their own cards (never broadcast) glide from the hand. */
  ownPlay: () => readonly CardId[] | null;
  handSize: CardSize;
  pileSize: CardSize;
}

const DEFAULT_OPTIONS: AnimationOptions = { ownPlay: () => null, handSize: 'md', pileSize: 'sm' };

/** Advances the scene by one domain event and describes how to animate it (UI §10 timings). */
export function applyEvent(
  scene: Scene,
  event: DesconfiaEvent,
  options: AnimationOptions = DEFAULT_OPTIONS,
): Step<Scene, Fx> | Step<Scene, Fx>[] {
  const isSelf = (playerId: PlayerId) => playerId === scene.selfId;

  switch (event.type) {
    case 'Played': {
      const { playId, playerId, count, claimRank, lastCard } = event;
      let next: Scene = scene;
      let entries: PileCard[];
      const sent = isSelf(playerId) ? options.ownPlay() : null;
      const own = sent?.length === count ? scene.hand.filter((c) => sent.includes(c.card.id)) : [];
      if (own.length === count) {
        // The viewer's own cards: they glide out of the hand (shared layout id) and land face down.
        entries = own.map(({ card }, i) => ({ key: `${playId}:${i}`, playId, card }));
        next = { ...next, hand: next.hand.filter((c) => !sent!.includes(c.card.id)) };
      } else {
        const from = ANCHORS.seat(playerId);
        entries = Array.from({ length: count }, (_, i) => ({
          key: `${playId}:${i}`,
          playId,
          card: null,
          enter: { from, kind: 'play', delay: i * 0.05 },
        }));
        if (!isSelf(playerId)) {
          next = withSeat(next, playerId, (seat) => ({
            ...seat,
            handCount: Math.max(0, seat.handCount - count),
          }));
        }
      }
      return step(
        {
          ...next,
          pile: [...next.pile, ...entries],
          claimRank,
          pilePlays: [...next.pilePlays, { playId, playerId, count, claimRank }],
          doubtWindow: { playId, playerId, minElapsed: false, lastCard },
          currentPlayerId: lastCard ? null : nextActive(scene, playerId),
          reveal: null,
        },
        420,
        [],
        [{ kind: 'played', playerId, count, claimRank, lastCard, windowMs: scene.lastCardWindowMs }],
      );
    }

    case 'WindowMinElapsed':
      return step(
        {
          ...scene,
          currentPlayerId: event.nextPlayerId,
          doubtWindow: scene.doubtWindow ? { ...scene.doubtWindow, minElapsed: true } : null,
        },
        0,
      );

    case 'DoubtCalled':
      return step(
        { ...scene, doubtWindow: null },
        550,
        [],
        [{ kind: 'doubt', doubterId: event.doubterId, authorId: event.authorId }],
      );

    case 'Revealed': {
      // The last play's cards come out of the pile in the order they were laid.
      const theirs = scene.pile.filter((p) => p.playId === event.playId);
      const cards = event.cards.map((card, i) => {
        const entry = theirs[i];
        return {
          key: entry?.key ?? `${event.playId}:${i}`,
          card,
          layoutId: entry ? pileLayoutId(entry) : `card-${card.id}`,
        };
      });
      const reveal: RevealScene = {
        playId: event.playId,
        authorId: event.authorId,
        doubterId: event.doubterId,
        claimRank: event.claimRank,
        truthful: event.truthful,
        cards,
        stage: 'lift',
      };
      const pile = scene.pile.filter((p) => p.playId !== event.playId);
      const lifted = { ...scene, pile, reveal };
      return [
        step(lifted, 380),
        step({ ...lifted, reveal: { ...reveal, stage: 'flip' } }, 400 + 80 * cards.length),
        step(
          { ...lifted, reveal: { ...reveal, stage: 'stamp' } },
          900,
          [],
          [
            {
              kind: 'verdict',
              truthful: event.truthful,
              authorId: event.authorId,
              doubterId: reveal.doubterId,
            },
          ],
        ),
      ];
    }

    case 'PileTaken': {
      const { playerId, count } = event;
      const to = isSelf(playerId) ? ANCHORS.selfHand : ANCHORS.seat(playerId);
      const hidden = scene.pile.map((p, i) => ({
        cardId: null,
        from: ANCHORS.pile,
        to,
        size: options.pileSize,
        toSize: isSelf(playerId) ? undefined : ('xs' as const),
        kind: 'pickUp' as const,
        delay: Math.min(0.3, i * 0.012),
      }));
      const shown = (scene.reveal?.cards ?? []).map((c, i) => ({
        cardId: c.card.id,
        from: ANCHORS.reveal,
        to,
        size: options.pileSize,
        toSize: isSelf(playerId) ? undefined : ('xs' as const),
        kind: 'pickUp' as const,
        delay: i * 0.04,
      }));
      let next: Scene = {
        ...scene,
        pile: [],
        reveal: null,
        pilePlays: [],
        claimRank: null,
        doubtWindow: null,
      };
      if (isSelf(playerId))
        next = {
          ...next,
          incoming: [...next.incoming, ...Array.from({ length: count }, () => ANCHORS.pile)],
        };
      else next = withSeat(next, playerId, (seat) => ({ ...seat, handCount: seat.handCount + count }));
      return step(next, 520, [...shown, ...hidden], [{ kind: 'pileTaken', playerId, count }]);
    }

    case 'PeixinhoRemoved': {
      const { playerId, rank, cards } = event;
      const ids = new Set(cards.map((c) => c.id));
      let next = scene;
      let fanned: SceneCard[];
      if (isSelf(playerId)) {
        const inHand = new Set(scene.hand.map((c) => c.card.id));
        fanned = cards.map((card, i) =>
          inHand.has(card.id)
            ? { card }
            : { card, enter: { from: ANCHORS.pile, kind: 'draw', delay: i * 0.05 } },
        );
        const unseen = cards.filter((c) => !inHand.has(c.id)).length;
        next = {
          ...next,
          hand: next.hand.filter((c) => !ids.has(c.card.id)),
          // Those cards came with the pile: the view will not bring them.
          incoming: next.incoming.slice(0, Math.max(0, next.incoming.length - unseen)),
        };
      } else {
        fanned = cards.map((card, i) => ({
          card,
          enter: { from: ANCHORS.seat(playerId), kind: 'play', delay: i * 0.05 },
        }));
        next = withSeat(next, playerId, (seat) => ({ ...seat, handCount: Math.max(0, seat.handCount - 4) }));
      }
      showcaseKey += 1;
      const fan = step(
        { ...next, showcase: { key: showcaseKey, playerId, rank, cards: fanned } },
        650,
        [],
        [{ kind: 'peixinho', playerId, rank }],
      );
      const gone = step(
        { ...next, showcase: null, removed: [...next.removed, { rank, playerId }] },
        420,
        cards.map((card, i) => ({
          cardId: card.id,
          from: ANCHORS.reveal,
          to: ANCHORS.removed,
          size: options.pileSize,
          toSize: 'xs',
          kind: 'pickUp',
          delay: i * 0.04,
        })),
      );
      return [fan, gone];
    }

    case 'NewPile':
      return step(
        { ...scene, currentPlayerId: event.starterId, claimRank: null, pilePlays: [], doubtWindow: null },
        250,
        [],
        [{ kind: 'newPile', starterId: event.starterId }],
      );

    case 'TurnPassed':
      return step({ ...scene, currentPlayerId: event.to, doubtWindow: null }, 200);

    case 'PlayerWon':
      return step(
        withSeat(
          { ...scene, finishedOrder: [...scene.finishedOrder, event.playerId], doubtWindow: null },
          event.playerId,
          (seat) => ({ ...seat, finishedPosition: event.position }),
        ),
        400,
        [],
        [{ kind: 'won', playerId: event.playerId, position: event.position }],
      );

    case 'GameFinished':
      return step(
        { ...scene, phase: 'FINISHED', currentPlayerId: null, doubtWindow: null },
        300,
        [],
        [{ kind: 'finished', finishedOrder: event.finishedOrder }],
      );
  }
}

/** The viewer's own cards of the deal, one after another, the whole hand in about a second. */
export function dealStaggerSeconds(handLength: number): number {
  return Math.min(0.06, 1.2 / Math.max(1, handLength));
}

export function dealDurationMs(scene: Pick<Scene, 'hand'>): number {
  return Math.round(Math.max(0, scene.hand.length - 1) * dealStaggerSeconds(scene.hand.length) * 1000) + 260;
}
