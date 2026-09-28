import { parseCardId, type Card } from '@cardroom/game-core';
import type { MexicanaView } from '@cardroom/mexicana';
import { describe, expect, it } from 'vitest';
import { ANCHORS, applyEvent, sceneFromView, type Scene } from './scene';

const c = (id: string): Card => parseCardId(id) as Card;

function view(overrides: Partial<MexicanaView> = {}): MexicanaView {
  return {
    phase: 'PLAYING',
    selfId: 'me',
    hand: [c('5H'), c('9S')],
    seats: [
      {
        id: 'me',
        handCount: 2,
        faceUp: [c('KD'), null, null],
        faceDown: [true, true, false],
        hasChosenFaceUp: true,
        finishedPosition: null,
      },
      {
        id: 'op',
        handCount: 3,
        faceUp: [c('4C'), null, null],
        faceDown: [true, true, true],
        hasChosenFaceUp: true,
        finishedPosition: null,
      },
    ],
    currentPlayerId: 'me',
    discardPile: [c('3D')],
    drawPileCount: 10,
    burnPileCount: 0,
    restriction: 'none',
    effectiveRank: null,
    sameRankRun: 0,
    ...overrides,
  };
}

const seat = (scene: Scene, id: string) => scene.seats.find((s) => s.id === id)!;

describe('sceneFromView', () => {
  it('mirrors the view, hiding face-down cards', () => {
    const scene = sceneFromView('m1', 3, view());
    expect(scene.hand.map((h) => h.card.id)).toEqual(['5H', '9S']);
    expect(seat(scene, 'op').faceDown).toEqual(['hidden', 'hidden', 'hidden']);
    expect(seat(scene, 'me').faceDown).toEqual(['hidden', 'hidden', null]);
  });

  it('marks never-seen hand cards as drawn from the stock', () => {
    const previous = sceneFromView('m1', 3, view());
    const next = sceneFromView('m1', 4, view({ hand: [c('5H'), c('9S'), c('QC')] }), previous);
    expect(next.hand.find((h) => h.card.id === 'QC')?.enter?.from).toBe(ANCHORS.draw);
    expect(next.hand.find((h) => h.card.id === '5H')?.enter).toBeUndefined();
  });

  it('keeps pile entries (and their entrance metadata) stable', () => {
    const previous = sceneFromView('m1', 3, view());
    const played = applyEvent(previous, {
      type: 'CardsPlayed',
      playerId: 'op',
      cards: [c('7S')],
      source: 'hand',
    }).scene;
    const next = sceneFromView('m1', 4, view({ discardPile: [c('3D'), c('7S')] }), played);
    expect(next.discard.at(-1)).toBe(played.discard.at(-1));
  });
});

describe('applyEvent', () => {
  const base = () => sceneFromView('m1', 3, view());

  it('moves my played cards from hand to pile (shared layout, no flight)', () => {
    const step = applyEvent(base(), {
      type: 'CardsPlayed',
      playerId: 'me',
      cards: [c('9S')],
      source: 'hand',
    });
    expect(step.scene.hand.map((h) => h.card.id)).toEqual(['5H']);
    expect(step.scene.discard.at(-1)).toEqual({ card: c('9S'), enter: undefined });
    expect(step.fx).toContainEqual({ kind: 'played', playerId: 'me', cards: [c('9S')] });
  });

  it("flies an opponent's hidden-hand card in from their seat", () => {
    const step = applyEvent(base(), {
      type: 'CardsPlayed',
      playerId: 'op',
      cards: [c('JH')],
      source: 'hand',
    });
    expect(seat(step.scene, 'op').handCount).toBe(2);
    expect(step.scene.discard.at(-1)?.enter?.from).toBe(ANCHORS.seat('op'));
  });

  it('reveals then plays a face-down card from its slot', () => {
    const revealed = applyEvent(base(), {
      type: 'CardRevealed',
      playerId: 'op',
      slot: 1,
      card: c('10C'),
      playable: true,
    });
    expect(seat(revealed.scene, 'op').faceDown[1]).toEqual(c('10C'));
    const played = applyEvent(revealed.scene, {
      type: 'CardsPlayed',
      playerId: 'op',
      cards: [c('10C')],
      source: 'faceDown',
      slot: 1,
    });
    expect(seat(played.scene, 'op').faceDown[1]).toBeNull();
    expect(played.scene.discard.at(-1)?.enter?.from).toBe(ANCHORS.slot('op', 1));
  });

  it('burns the pile into the burn animation', () => {
    const step = applyEvent(base(), { type: 'PileBurned', playerId: 'me', reason: 'burnCard', count: 1 });
    expect(step.scene.discard).toEqual([]);
    expect(step.scene.burning?.cards).toEqual([c('3D')]);
    expect(step.scene.burnCount).toBe(1);
  });

  it('picks the pile up into my hand, or flies it to an opponent', () => {
    const mine = applyEvent(base(), {
      type: 'PilePickedUp',
      playerId: 'me',
      cards: [c('3D')],
      reason: 'noValidPlay',
    });
    expect(mine.scene.hand.map((h) => h.card.id)).toEqual(['5H', '9S', '3D']);
    expect(mine.flights).toEqual([]);

    const theirs = applyEvent(base(), {
      type: 'PilePickedUp',
      playerId: 'op',
      cards: [c('3D')],
      reason: 'timeout',
    });
    expect(seat(theirs.scene, 'op').handCount).toBe(4);
    expect(theirs.flights).toHaveLength(1);
    expect(theirs.flights[0]).toMatchObject({ cardId: '3D', from: ANCHORS.discard, to: ANCHORS.seat('op') });
  });

  it('sends a failed face-down reveal to the hand from its slot', () => {
    const revealed = applyEvent(base(), {
      type: 'CardRevealed',
      playerId: 'me',
      slot: 0,
      card: c('4S'),
      playable: false,
    }).scene;
    const step = applyEvent(revealed, {
      type: 'PilePickedUp',
      playerId: 'me',
      cards: [c('3D'), c('4S')],
      reason: 'faceDownFailed',
    });
    expect(seat(step.scene, 'me').faceDown[0]).toBeNull();
    expect(step.scene.hand.find((h) => h.card.id === '4S')?.enter?.from).toBe(ANCHORS.slot('me', 0));
  });

  it('takes an unplayable face-up card along with the pile, from its slot', () => {
    const mine = applyEvent(base(), {
      type: 'PilePickedUp',
      playerId: 'me',
      cards: [c('3D'), c('KD')],
      reason: 'noValidPlay',
      faceUpSlot: 0,
    });
    expect(seat(mine.scene, 'me').faceUp).toEqual([null, null, null]);
    // Shared layoutId: the card glides from the table into the hand, no flight.
    expect(mine.scene.hand.find((h) => h.card.id === 'KD')).toEqual({ card: c('KD') });
    expect(mine.flights).toEqual([]);

    const theirs = applyEvent(base(), {
      type: 'PilePickedUp',
      playerId: 'op',
      cards: [c('3D'), c('4C')],
      reason: 'timeout',
      faceUpSlot: 0,
    });
    expect(seat(theirs.scene, 'op').faceUp).toEqual([null, null, null]);
    expect(seat(theirs.scene, 'op').handCount).toBe(5);
    expect(theirs.flights.map((f) => [f.cardId, f.from])).toEqual([
      ['3D', ANCHORS.discard],
      ['4C', ANCHORS.slot('op', 0)],
    ]);
  });

  it('draws for opponents with flights, and silently for me', () => {
    const theirs = applyEvent(base(), { type: 'CardsDrawn', playerId: 'op', count: 2 });
    expect(theirs.flights).toHaveLength(2);
    expect(seat(theirs.scene, 'op').handCount).toBe(5);
    expect(theirs.scene.drawCount).toBe(8);
    const mine = applyEvent(base(), { type: 'CardsDrawn', playerId: 'me', count: 1 });
    expect(mine.flights).toEqual([]);
    expect(mine.scene.drawCount).toBe(9);
  });

  it('reports skips, finishes and the start', () => {
    expect(applyEvent(base(), { type: 'PlayerSkipped', playerId: 'op', by: 'me' }).fx).toEqual([
      { kind: 'skip', playerId: 'op' },
    ]);
    const finished = applyEvent(base(), { type: 'PlayerFinished', playerId: 'me', position: 1 });
    expect(seat(finished.scene, 'me').finishedPosition).toBe(1);
    const started = applyEvent(
      { ...base(), phase: 'CHOOSING' },
      { type: 'PlayStarted', startingPlayerId: 'op' },
    );
    expect(started.scene.phase).toBe('PLAYING');
    expect(started.scene.currentPlayerId).toBe('op');
    expect(applyEvent(base(), { type: 'GameFinished', loserId: 'op' }).scene.phase).toBe('FINISHED');
  });

  it('moves my chosen face-up cards out of the hand', () => {
    const choosing = sceneFromView('m1', 0, view({ phase: 'CHOOSING', hand: [c('5H'), c('9S'), c('AS')] }));
    const step = applyEvent(choosing, { type: 'FaceUpChosen', playerId: 'me', cards: [c('AS')] });
    expect(step.scene.hand.map((h) => h.card.id)).toEqual(['5H', '9S']);
    expect(seat(step.scene, 'me').faceUp).toEqual([c('AS')]);
  });
});
