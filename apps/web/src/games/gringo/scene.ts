import type { CardInstance, PlayerId } from '@cardroom/game-core';
import {
  PACE,
  type GameEndReason,
  type GringoEvent,
  type GringoView,
  type Phase,
  type PowerType,
} from '@cardroom/gringo';
import type { EnterFrom } from '@cardroom/ui';
import type { BaseScene, Step } from '../shared/use-director';

/**
 * What the Gringo table shows. It starts equal to a server view and is
 * advanced event by event, so every draw, swap and snap animates before the
 * next authoritative view is committed.
 *
 * A face-down card never travels with anything that names it, so the table
 * tells cards apart with its own `token`s: a card keeps its token (and its
 * `layoutId`) when it moves between slots, to the discard pile or out of the
 * drawn spot, which is what makes every move glide (UI §2: "nada se reordena").
 */
export interface SlotScene {
  index: number;
  /** `null`: an empty slot (the card was snapped away). */
  token: string | null;
  /** The face, while the viewer may see it. */
  face: CardInstance | null;
  enter?: EnterFrom;
}

export interface SeatScene {
  id: PlayerId;
  slots: SlotScene[];
  cardCount: number;
  turnsPlayed: number;
  peekDone: boolean;
}

/** A position on the table: one slot of one player's grid. */
export interface SlotRef {
  owner: PlayerId;
  index: number;
}

export interface Scene extends BaseScene {
  seq: number;
  phase: Phase;
  selfId: PlayerId | null;
  seats: SeatScene[];
  turnPlayerId: PlayerId | null;
  turn: number;
  /** The card someone drew, hovering next to the deck (face up for them alone). */
  drawn: { token: string; face: CardInstance | null; by: PlayerId; enter?: EnterFrom } | null;
  deckCount: number;
  discard: {
    top: { token: string; card: CardInstance } | null;
    /** The cards just under the top one, for depth (oldest first). */
    under: CardInstance[];
    count: number;
  };
  power: GringoView['power'];
  peek: GringoView['peek'];
  /**
   * Slots whose card just changed (a swap, a drawn card put in): they stay
   * marked until the next turn, so everyone can follow what moved where.
   */
  moved: SlotRef[];
  snap: GringoView['snap'];
  gringo: GringoView['gringo'];
  gringoTurnsLeft: number | null;
  rules: GringoView['rules'];
  final: GringoView['final'];
}

export type Fx =
  | { kind: 'turn'; playerId: PlayerId }
  | { kind: 'peekOver' }
  | { kind: 'gringo'; playerId: PlayerId; remaining: PlayerId[] }
  | { kind: 'drew'; playerId: PlayerId }
  | { kind: 'discarded'; playerId: PlayerId; card: CardInstance; swappedIndex: number | null }
  | { kind: 'power'; playerId: PlayerId; power: PowerType }
  | { kind: 'powerSkipped'; playerId: PlayerId }
  | { kind: 'peeked'; playerId: PlayerId; owner: PlayerId; index: number }
  | {
      kind: 'swapped';
      playerId: PlayerId;
      myIndex: number;
      owner: PlayerId;
      theirIndex: number;
      blind: boolean;
    }
  | { kind: 'kept'; playerId: PlayerId; owner: PlayerId; theirIndex: number }
  | { kind: 'snapOpen'; discardId: number; ms: number }
  /** `owner`: whose card was snapped (the snapper's own, or another player's). */
  | { kind: 'snapHit'; playerId: PlayerId; owner: PlayerId; index: number; card: CardInstance }
  | {
      kind: 'snapMiss';
      playerId: PlayerId;
      owner: PlayerId;
      index: number;
      card: CardInstance;
      penalty: boolean;
    }
  | { kind: 'gave'; playerId: PlayerId; index: number; owner: PlayerId; ownerIndex: number }
  | { kind: 'out'; playerId: PlayerId }
  | { kind: 'passed'; playerId: PlayerId }
  | {
      kind: 'finished';
      reason: GameEndReason;
      scores: Record<PlayerId, number>;
      winners: PlayerId[];
    };

export const ANCHORS = {
  deck: 'deck',
  discard: 'discard',
  seat: (playerId: PlayerId) => `seat:${playerId}`,
} as const;

/** The shared-layout id of a card on the table. */
export const cardLayoutId = (token: string) => `gringo-${token}`;

let tokens = 0;
const newToken = () => `t${++tokens}`;

const DEAL_STAGGER_MS = 50;

/**
 * Two cards trading places, in three beats that fill the server's lead before
 * the snap window (`PACE.swap`): both slots light up, the cards glide across, they land.
 */
export const SWAP_BEATS = { mark: 700, glide: 1000, land: PACE.swap - 1700 } as const;
/** How long a card takes to glide between slots: slow enough to follow with the eye. */
export const SLOT_GLIDE_SECONDS = 0.8;

export function sceneFromView(
  matchId: string,
  seq: number,
  view: GringoView,
  previous?: Scene | null,
): Scene {
  const same = previous?.matchId === matchId ? previous : null;
  const seats = view.seats.map((seat): SeatScene => {
    const before = same?.seats.find((s) => s.id === seat.id);
    return {
      id: seat.id,
      cardCount: seat.cardCount,
      turnsPlayed: seat.turnsPlayed,
      peekDone: seat.peekDone,
      slots: seat.grid.map((slot): SlotScene => {
        if (slot.empty) return { index: slot.index, token: null, face: null };
        const known = before?.slots.find((s) => s.index === slot.index)?.token;
        return { index: slot.index, token: known ?? newToken(), face: slot.card };
      }),
    };
  });
  const top = view.discardTop;
  const previousTop = same?.discard.top ?? null;
  const keepTop = top && previousTop?.card.uid === top.uid ? previousTop : null;
  const under =
    same && previousTop && !keepTop
      ? [...same.discard.under, previousTop.card].slice(-2)
      : (same?.discard.under ?? []);
  return {
    matchId,
    seq,
    // A deal started by the view keeps running across the commit.
    dealing: same ? same.dealing : false,
    phase: view.phase,
    selfId: view.selfId,
    seats,
    turnPlayerId: view.turnPlayerId,
    turn: view.turn,
    drawn: view.drawnBy
      ? { token: same?.drawn?.token ?? newToken(), face: view.drawn, by: view.drawnBy }
      : null,
    deckCount: view.deckCount,
    discard: {
      top: top ? (keepTop ?? { token: `d-${top.uid}`, card: top }) : null,
      under: top ? under.filter((c) => c.uid !== top.uid) : [],
      count: view.discardCount,
    },
    power: view.power,
    peek: view.peek,
    moved: same?.moved ?? [],
    snap: view.snap,
    gringo: view.gringo,
    gringoTurnsLeft: view.gringoTurnsLeft,
    rules: view.rules,
    final: view.final,
  };
}

const step = (scene: Scene, waitMs: number, fx: Fx[] = []): Step<Scene, Fx> => ({
  scene,
  waitMs,
  flights: [],
  fx,
});

function withSeat(scene: Scene, playerId: PlayerId, update: (seat: SeatScene) => SeatScene): Scene {
  return { ...scene, seats: scene.seats.map((seat) => (seat.id === playerId ? update(seat) : seat)) };
}

function withSlot(
  scene: Scene,
  playerId: PlayerId,
  index: number,
  update: (slot: SlotScene) => SlotScene,
): Scene {
  return withSeat(scene, playerId, (seat) => ({
    ...seat,
    slots: seat.slots.map((slot) => (slot.index === index ? update(slot) : slot)),
  }));
}

const slotOf = (scene: Scene, playerId: PlayerId, index: number): SlotScene | undefined =>
  scene.seats.find((s) => s.id === playerId)?.slots.find((s) => s.index === index);

/** Every face turned back down (the viewer's memory takes over). */
const hideFaces = (scene: Scene): Scene => ({
  ...scene,
  seats: scene.seats.map((seat) => ({
    ...seat,
    slots: seat.slots.map((slot) => (slot.face ? { ...slot, face: null } : slot)),
  })),
});

/** A card reaches the top of the discard pile, keeping its token so it glides there. */
function toDiscard(scene: Scene, token: string, card: CardInstance): Scene['discard'] {
  const { top, under, count } = scene.discard;
  return {
    top: { token, card },
    under: top ? [...under, top.card].slice(-2) : under,
    count: count + 1,
  };
}

/** Two cards trade slots, face down: their tokens trade places and both glide (UI §5). */
function swapSlots(scene: Scene, a: [PlayerId, number], b: [PlayerId, number]): Scene {
  const first = slotOf(scene, ...a);
  const second = slotOf(scene, ...b);
  if (!first || !second) return scene;
  const moved = withSlot(scene, ...a, (slot) => ({
    ...slot,
    token: second.token,
    face: null,
    enter: undefined,
  }));
  return withSlot(moved, ...b, (slot) => ({ ...slot, token: first.token, face: null, enter: undefined }));
}

/**
 * A swap everyone can follow: the two slots light up first, then the cards
 * glide across, slowly, and the marks stay on them for the rest of the turn.
 */
function swapSteps(scene: Scene, a: [PlayerId, number], b: [PlayerId, number], fx: Fx): Step<Scene, Fx>[] {
  const marked: Scene = {
    ...scene,
    power: null,
    peek: null,
    moved: [
      { owner: a[0], index: a[1] },
      { owner: b[0], index: b[1] },
    ],
  };
  const swapped = swapSlots(marked, a, b);
  return [
    step(marked, SWAP_BEATS.mark, [fx]),
    step(swapped, SWAP_BEATS.glide),
    step(swapped, SWAP_BEATS.land),
  ];
}

/** Advances the scene by one domain event and describes how to present it (UI §10 timings). */
export function applyEvent(scene: Scene, event: GringoEvent): Step<Scene, Fx> | Step<Scene, Fx>[] {
  switch (event.type) {
    case 'PeekDone': {
      const seen = event.playerId === scene.selfId ? hideFaces(scene) : scene;
      return step(
        withSeat(seen, event.playerId, (seat) => ({ ...seat, peekDone: true })),
        0,
      );
    }

    case 'InitialPeekEnded':
      return step({ ...hideFaces(scene), phase: 'TURN_DRAW' }, 350, [{ kind: 'peekOver' }]);

    case 'TurnStarted':
      return step(
        {
          ...scene,
          phase: 'TURN_DRAW',
          turnPlayerId: event.playerId,
          turn: event.turn,
          power: null,
          peek: null,
          snap: null,
          moved: [],
        },
        150,
        [{ kind: 'turn', playerId: event.playerId }],
      );

    case 'GringoCalled':
      return step(
        {
          ...scene,
          gringo: { calledBy: event.playerId, remaining: event.remaining },
          gringoTurnsLeft: null,
        },
        900,
        [{ kind: 'gringo', playerId: event.playerId, remaining: event.remaining }],
      );

    case 'Drew':
      // It rises from the deck; the face comes with the view, for the player who drew it only (UI §4).
      return step(
        {
          ...scene,
          phase: 'TURN_DECIDE',
          deckCount: event.deckCount,
          drawn: {
            token: newToken(),
            face: null,
            by: event.playerId,
            enter: { from: ANCHORS.deck, kind: 'draw' },
          },
        },
        420,
        [{ kind: 'drew', playerId: event.playerId }],
      );

    case 'Swapped': {
      const { playerId, index, discarded, power } = event;
      const old = slotOf(scene, playerId, index);
      const drawn = scene.drawn;
      if (!old?.token || !drawn) return step(scene, 0);
      // The drawn card glides into the slot; the old one flies face up to the discard pile.
      const next = withSlot(scene, playerId, index, (slot) => ({
        ...slot,
        token: drawn.token,
        face: null,
        enter: undefined,
      }));
      const swapped: Scene = {
        ...next,
        drawn: null,
        discard: toDiscard(scene, old.token, discarded),
        moved: [{ owner: playerId, index }],
      };
      const fx: Fx[] = [{ kind: 'discarded', playerId, card: discarded, swappedIndex: index }];
      if (!power) return step(swapped, SLOT_GLIDE_SECONDS * 1000, fx);
      // The card that went out has a power: it is used (or let go) before the snap window.
      return step(
        { ...swapped, phase: 'POWER', power: { playerId, type: power, step: 'CHOOSE', target: null } },
        SLOT_GLIDE_SECONDS * 1000,
        [...fx, { kind: 'power', playerId, power }],
      );
    }

    case 'DiscardedDrawn': {
      const drawn = scene.drawn;
      const discard = toDiscard(scene, drawn?.token ?? `d-${event.card.uid}`, event.card);
      const fx: Fx[] = [
        { kind: 'discarded', playerId: event.playerId, card: event.card, swappedIndex: null },
      ];
      if (!event.power) return step({ ...scene, drawn: null, discard }, 480, fx);
      return step(
        {
          ...scene,
          drawn: null,
          discard,
          phase: 'POWER',
          power: { playerId: event.playerId, type: event.power, step: 'CHOOSE', target: null },
        },
        480,
        [...fx, { kind: 'power', playerId: event.playerId, power: event.power }],
      );
    }

    case 'PowerSkipped':
      return step({ ...scene, power: null }, 100, [{ kind: 'powerSkipped', playerId: event.playerId }]);

    case 'Peeked': {
      const { playerId, owner, index } = event;
      const power = scene.power ?? {
        playerId,
        type: 'PEEK_OTHER' as const,
        step: 'CHOOSE' as const,
        target: null,
      };
      return step({ ...scene, power: { ...power, step: 'PEEKED', target: { owner, index } } }, 350, [
        { kind: 'peeked', playerId, owner, index },
      ]);
    }

    case 'PeekEnded': {
      const target = scene.power?.target;
      const hidden = target
        ? withSlot(scene, target.owner, target.index, (slot) => ({ ...slot, face: null }))
        : scene;
      return step({ ...hidden, power: null, peek: null }, 250);
    }

    case 'BlindSwapped': {
      const { playerId, myIndex, owner, theirIndex } = event;
      return swapSteps(scene, [playerId, myIndex], [owner, theirIndex], {
        kind: 'swapped',
        playerId,
        myIndex,
        owner,
        theirIndex,
        blind: true,
      });
    }

    case 'PeekSwapDecided': {
      const { playerId, swapped, myIndex, owner, theirIndex } = event;
      if (!swapped || myIndex === null) {
        const hidden = withSlot(scene, owner, theirIndex, (slot) => ({ ...slot, face: null }));
        return step({ ...hidden, power: null, peek: null }, 200, [
          { kind: 'kept', playerId, owner, theirIndex },
        ]);
      }
      // The card looked at turns back down before it travels.
      const hidden = withSlot(scene, owner, theirIndex, (slot) => ({ ...slot, face: null }));
      return swapSteps(hidden, [playerId, myIndex], [owner, theirIndex], {
        kind: 'swapped',
        playerId,
        myIndex,
        owner,
        theirIndex,
        blind: false,
      });
    }

    case 'SnapWindowOpened':
      return step(
        {
          ...scene,
          phase: 'SNAP_WINDOW',
          power: null,
          peek: null,
          snap: { discardId: event.discardId, open: true, result: null },
        },
        0,
        [{ kind: 'snapOpen', discardId: event.discardId, ms: scene.rules.snapWindowMs }],
      );

    case 'SnapSucceeded': {
      const { playerId, owner, index, card, discardId } = event;
      const slot = slotOf(scene, owner, index);
      if (!slot?.token) return step(scene, 0);
      const emptied = withSeat(
        withSlot(scene, owner, index, (s) => ({ ...s, token: null, face: null, enter: undefined })),
        owner,
        (seat) => ({ ...seat, cardCount: Math.max(0, seat.cardCount - 1) }),
      );
      return step(
        {
          ...emptied,
          // Another player's card: the snapper now owes them one of theirs.
          phase: owner === playerId ? scene.phase : 'SNAP_GIVE',
          discard: toDiscard(scene, slot.token, card),
          snap: {
            discardId,
            open: false,
            result: { playerId, owner, index, card, hit: true, penaltyIndex: null, given: null },
          },
        },
        750,
        [{ kind: 'snapHit', playerId, owner, index, card }],
      );
    }

    case 'CardGiven': {
      const { playerId, index, owner, ownerIndex } = event;
      const given = slotOf(scene, playerId, index);
      if (!given?.token) return step(scene, 0);
      // The card glides, face down, from the snapper's slot into the gap.
      const moved = withSlot(
        withSlot(scene, playerId, index, (s) => ({ ...s, token: null, face: null, enter: undefined })),
        owner,
        ownerIndex,
        (s) => ({ ...s, token: given.token, face: null, enter: undefined }),
      );
      const counted = withSeat(
        withSeat(moved, playerId, (seat) => ({ ...seat, cardCount: Math.max(0, seat.cardCount - 1) })),
        owner,
        (seat) => ({ ...seat, cardCount: seat.cardCount + 1 }),
      );
      const result = scene.snap?.result;
      return step(
        {
          ...counted,
          phase: 'SNAP_WINDOW',
          snap: scene.snap && result ? { ...scene.snap, result: { ...result, given: index } } : scene.snap,
          moved: [{ owner, index: ownerIndex }],
        },
        SLOT_GLIDE_SECONDS * 1000 + 200,
        [{ kind: 'gave', playerId, index, owner, ownerIndex }],
      );
    }

    case 'SnapFailed': {
      const { playerId, owner, index, card, penaltyIndex, discardId } = event;
      // Shown to everyone for 1.5 s (UI §6)…
      const shown = withSlot(scene, owner, index, (slot) => ({ ...slot, face: card }));
      const result = { playerId, owner, index, card, hit: false, penaltyIndex, given: null };
      const reveal = step({ ...shown, snap: { discardId, open: false, result } }, 1500, [
        { kind: 'snapMiss', playerId, owner, index, card, penalty: penaltyIndex !== null },
      ]);
      // …then back down, and a penalty card comes in, face down, in a new slot of the snapper's grid.
      let back = withSlot(reveal.scene, owner, index, (slot) => ({ ...slot, face: null }));
      if (penaltyIndex !== null) {
        back = withSeat(back, playerId, (seat) => ({
          ...seat,
          cardCount: seat.cardCount + 1,
          slots: [
            ...seat.slots,
            {
              index: penaltyIndex,
              token: newToken(),
              face: null,
              enter: { from: ANCHORS.deck, kind: 'deal' },
            },
          ],
        }));
        back = { ...back, deckCount: Math.max(0, back.deckCount - 1) };
      }
      return [reveal, step(back, 500)];
    }

    case 'PlayerOut':
      return step(scene, 300, [{ kind: 'out', playerId: event.playerId }]);

    case 'SnapWindowClosed':
      return step({ ...scene, snap: null }, 0);

    case 'TurnPassed':
      return step(scene, 300, [{ kind: 'passed', playerId: event.playerId }]);

    case 'GameFinished': {
      // Every grid turns over, one player after the other (UI §8), then the totals.
      const steps: Step<Scene, Fx>[] = [];
      let current: Scene = {
        ...scene,
        phase: 'FINISHED',
        snap: null,
        power: null,
        peek: null,
        drawn: null,
        moved: [],
      };
      for (const seat of scene.seats) {
        const grid = event.grids[seat.id] ?? [];
        current = withSeat(current, seat.id, (s) => ({
          ...s,
          slots: s.slots.map((slot) => ({
            ...slot,
            face: grid.find((g) => g.index === slot.index)?.card ?? null,
          })),
        }));
        steps.push(step(current, 260));
      }
      const final = { reason: event.reason, scores: event.scores, winners: event.winners };
      steps.push(
        step({ ...current, final }, 600, [
          { kind: 'finished', reason: event.reason, scores: event.scores, winners: event.winners },
        ]),
      );
      return steps;
    }
  }
}

/** Where a slot's card comes from during the opening deal: one card per player at a time (UI §10). */
export function dealDelaySeconds(scene: Pick<Scene, 'seats'>, playerId: PlayerId, index: number): number {
  const seat = Math.max(
    0,
    scene.seats.findIndex((s) => s.id === playerId),
  );
  return ((Math.min(index, 3) * scene.seats.length + seat) * DEAL_STAGGER_MS) / 1000;
}

export function dealDurationMs(scene: Pick<Scene, 'seats'>): number {
  return 4 * scene.seats.length * DEAL_STAGGER_MS + 300;
}

/** The viewer's seat. */
export const mySeat = (scene: Pick<Scene, 'seats' | 'selfId'>): SeatScene | undefined =>
  scene.seats.find((s) => s.id === scene.selfId);
