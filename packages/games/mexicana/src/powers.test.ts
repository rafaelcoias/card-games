import { describe, expect, it } from 'vitest';
import { mexicana } from './module';
import { buildState, card, current, eventTypes, expectError, expectOk, ids, play } from './test-utils';

/** Three players with enough spare cards that nobody finishes by accident. */
const table = (
  hand: string[],
  discard: string[] = [],
  extra: Partial<Parameters<typeof buildState>[0]> = {},
) =>
  buildState({
    players: {
      p1: { hand: [...hand, '9C'] },
      p2: { hand: ['4C', '4D'] },
      p3: { hand: ['6C', '6D'] },
    },
    discard,
    ...extra,
  });

describe('2 — reset', () => {
  it('can be played on anything, even an ace', () => {
    const { state } = expectOk(play(table(['2H'], ['AS']), 'p1', '2H'));
    expect(state.restriction).toBe('reset');
    expect(current(state)).toBe('p2');
  });

  it('lets the next player play any card', () => {
    const state = expectOk(play(table(['2H'], ['AS']), 'p1', '2H')).state;
    expect(expectOk(play(state, 'p2', '4C')).state.discardPile.at(-1)?.id).toBe('4C');
  });
});

describe('3 — mirror', () => {
  it('on an empty pile imposes nothing', () => {
    const state = expectOk(play(table(['3H']), 'p1', '3H')).state;
    expect(state.restriction).toBe('none');
    expect(mexicana.getPlayerView(state, 'p2').effectiveRank).toBeNull();
    expect(expectOk(play(state, 'p2', '4C')).ok).toBe(true);
  });

  it('on a 7 keeps the "7 or lower" restriction', () => {
    const state = expectOk(play(table(['3H'], ['7S']), 'p1', '3H')).state;
    expect(state.restriction).toBe('maxSeven');
    expect(mexicana.getPlayerView(state, 'p2').effectiveRank).toBe('7');
    expectOk(play(state, 'p2', '4C'));
  });

  it('on a 7 rejects cards above 7', () => {
    const state = buildState({
      players: { p1: { hand: ['3H', '9C'] }, p2: { hand: ['KC', 'KD'] }, p3: { hand: ['6C'] } },
      discard: ['7S'],
    });
    const after = expectOk(play(state, 'p1', '3H')).state;
    expectError(play(after, 'p2', 'KC'), 'ILLEGAL_PLAY');
  });

  it('on an 8 counts as an 8 and skips the next player', () => {
    const { state, events } = expectOk(play(table(['3H'], ['8S']), 'p1', '3H'));
    expect(events).toContainEqual({ type: 'PlayerSkipped', playerId: 'p2', by: 'p1' });
    expect(current(state)).toBe('p3');
    expect(mexicana.getPlayerView(state, 'p3').effectiveRank).toBe('8');
  });

  it('on a 3 on an 8 is still an 8', () => {
    const { state, events } = expectOk(play(table(['3H'], ['8S', '3C']), 'p1', '3H'));
    expect(events.filter((e) => e.type === 'PlayerSkipped')).toHaveLength(1);
    expect(current(state)).toBe('p3');
  });

  it('on a 3 over a normal card copies that card', () => {
    const state = expectOk(play(table(['3H'], ['9S', '3C']), 'p1', '3H')).state;
    expect(mexicana.getPlayerView(state, 'p2').effectiveRank).toBe('9');
    expectError(play(state, 'p2', '4C'), 'ILLEGAL_PLAY');
  });

  it('on a 2 counts as a reset', () => {
    const state = expectOk(play(table(['3H'], ['AS', '2C']), 'p1', '3H')).state;
    expect(state.restriction).toBe('reset');
    expectOk(play(state, 'p2', '4C'));
  });

  it('can be played on anything, including under a 7 restriction', () => {
    expectOk(play(table(['3H'], ['AS']), 'p1', '3H'));
    expectOk(play(table(['3H'], ['7S']), 'p1', '3H'));
  });
});

describe('7 — ceiling', () => {
  it('forces 7 or lower', () => {
    const state = expectOk(play(table(['7H'], ['5S']), 'p1', '7H')).state;
    expect(state.restriction).toBe('maxSeven');
    expectOk(play(state, 'p2', '4C'));
  });

  it('allows another 7 and the power cards', () => {
    const base = buildState({
      players: {
        p1: { hand: ['7H', '9C'] },
        p2: { hand: ['7C', '2D', '10S', 'JK1', 'QH', 'KD'] },
        p3: { hand: ['6C'] },
      },
    });
    const state = expectOk(play(base, 'p1', '7H')).state;
    for (const id of ['7C', '2D', '10S', 'JK1']) expectOk(play(state, 'p2', id));
    expectError(play(state, 'p2', 'QH'), 'ILLEGAL_PLAY');
    const actions = mexicana.getValidActions(state, 'p2');
    expect(actions.flatMap((a) => (a.type === 'PLAY_CARDS' ? a.cardIds : []))).not.toContain('KD');
  });
});

describe('8 — skip', () => {
  it('skips the next player', () => {
    const { state, events } = expectOk(play(table(['8H']), 'p1', '8H'));
    expect(eventTypes(events)).toContain('PlayerSkipped');
    expect(current(state)).toBe('p3');
  });

  it('N eights skip N players', () => {
    const state = buildState({
      players: {
        p1: { hand: ['8H', '8D', '9C'] },
        p2: { hand: ['4C'] },
        p3: { hand: ['6C'] },
        p4: { hand: ['5C'] },
      },
    });
    const { state: next, events } = expectOk(play(state, 'p1', '8H', '8D'));
    expect(
      events.filter((e) => e.type === 'PlayerSkipped').map((e) => e.type === 'PlayerSkipped' && e.playerId),
    ).toEqual(['p2', 'p3']);
    expect(current(next)).toBe('p4');
  });

  it('chains: the first non-skipped player playing an 8 skips the one after them', () => {
    const state = buildState({
      players: {
        p1: { hand: ['8H', '9C'] },
        p2: { hand: ['4C', '4D'] },
        p3: { hand: ['8C', '6C'] },
        p4: { hand: ['5C', '5D'] },
      },
    });
    const afterP1 = expectOk(play(state, 'p1', '8H')).state;
    expect(current(afterP1)).toBe('p3');
    const { state: afterP3, events } = expectOk(play(afterP1, 'p3', '8C'));
    expect(events).toContainEqual({ type: 'PlayerSkipped', playerId: 'p4', by: 'p3' });
    expect(current(afterP3)).toBe('p1');
  });

  it('with two players the skipper plays again', () => {
    const state = buildState({ players: { p1: { hand: ['8H', '9C'] }, p2: { hand: ['4C'] } } });
    expect(current(expectOk(play(state, 'p1', '8H')).state)).toBe('p1');
  });

  it('requires 8 or higher afterwards', () => {
    const state = expectOk(play(table(['8H']), 'p1', '8H')).state;
    expectError(play(state, 'p3', '6C'), 'ILLEGAL_PLAY');
  });
});

describe('10 and Joker — burn', () => {
  it.each(['10H', 'JK1'])('%s burns the pile and the same player goes again', (burner) => {
    const { state, events } = expectOk(play(table([burner], ['AS', 'KD']), 'p1', burner));
    expect(state.discardPile).toEqual([]);
    expect(ids(state.burnPile)).toEqual(['AS', 'KD', burner]);
    expect(events).toContainEqual({ type: 'PileBurned', playerId: 'p1', reason: 'burnCard', count: 3 });
    expect(current(state)).toBe('p1');
    expect(state.restriction).toBe('none');
  });

  it('can be played under a 7 restriction', () => {
    expectOk(play(table(['10H'], ['7S']), 'p1', '10H'));
  });

  it('two jokers together burn exactly once, like one joker', () => {
    const { state, events } = expectOk(play(table(['JK1', 'JK2'], ['QS']), 'p1', 'JK1', 'JK2'));
    expect(events.filter((e) => e.type === 'PileBurned')).toHaveLength(1);
    expect(current(state)).toBe('p1');
    expect(state.burnPile).toHaveLength(3);
  });

  it('clears pending skips', () => {
    const { state } = expectOk(play(table(['10H'], ['8S']), 'p1', '10H'));
    expect(state.pendingSkips).toBe(0);
    expect(current(state)).toBe('p1');
  });

  it('passes the turn if the burning card was the last one', () => {
    const state = buildState({
      players: { p1: { hand: ['10H'] }, p2: { hand: ['4C'] }, p3: { hand: ['6C'] } },
    });
    const { state: next, events } = expectOk(play(state, 'p1', '10H'));
    expect(eventTypes(events)).toEqual(['CardsPlayed', 'PileBurned', 'PlayerFinished']);
    expect(current(next)).toBe('p2');
  });
});

describe('four of a kind', () => {
  it('K,K,K,K across players burns and whoever played the fourth goes again', () => {
    const state = buildState({
      players: { p1: { hand: ['KH', '9C'] }, p2: { hand: ['4C'] } },
      discard: ['KS', 'KD', 'KC'],
    });
    const { state: next, events } = expectOk(play(state, 'p1', 'KH'));
    expect(events).toContainEqual({ type: 'PileBurned', playerId: 'p1', reason: 'fourOfAKind', count: 4 });
    expect(current(next)).toBe('p1');
  });

  it('four of a kind in one play burns', () => {
    const { events } = expectOk(play(table(['5H', '5S', '5D', '5C']), 'p1', '5H', '5S', '5D', '5C'));
    expect(eventTypes(events)).toContain('PileBurned');
  });

  it('K,K,K,3 does not burn', () => {
    const { state, events } = expectOk(play(table(['3H'], ['KS', 'KD', 'KC']), 'p1', '3H'));
    expect(eventTypes(events)).not.toContain('PileBurned');
    expect(state.sameRankRun).toBe(0);
  });

  it('K,K,K,3,K does not burn — the 3 breaks the run', () => {
    const state = buildState({
      players: { p1: { hand: ['KH', '9C'] }, p2: { hand: ['4C'] } },
      discard: ['KS', 'KD', 'KC', '3S'],
    });
    const { state: next, events } = expectOk(play(state, 'p1', 'KH'));
    expect(eventTypes(events)).not.toContain('PileBurned');
    expect(next.sameRankRun).toBe(1);
  });

  it('four 3s never burn', () => {
    const { events } = expectOk(play(table(['3H', '3S', '3D', '3C']), 'p1', '3H', '3S', '3D', '3C'));
    expect(eventTypes(events)).not.toContain('PileBurned');
  });
});

describe('face-down reveal', () => {
  const faceDownOnly = (slotCard: string, discard: string[]) =>
    buildState({
      players: { p1: { faceDown: [slotCard, '9C', '9D'] }, p2: { hand: ['4C'] }, p3: { hand: ['6C'] } },
      discard,
    });

  it('a revealed power card applies its power (10 burns and plays again)', () => {
    const { state, events } = expectOk(
      mexicana.applyAction(faceDownOnly('10S', ['AS']), { type: 'PLAY_FACE_DOWN', position: 0 }, 'p1'),
    );
    expect(eventTypes(events)).toEqual(['CardRevealed', 'CardsPlayed', 'PileBurned']);
    expect(current(state)).toBe('p1');
    expect(state.players.p1!.faceDown[0]).toBeNull();
  });

  it('a revealed 8 skips', () => {
    const { state } = expectOk(
      mexicana.applyAction(faceDownOnly('8S', ['5S']), { type: 'PLAY_FACE_DOWN', position: 0 }, 'p1'),
    );
    expect(current(state)).toBe('p3');
  });

  it('an invalid reveal goes to the hand with the pile and the turn is lost', () => {
    const { state, events } = expectOk(
      mexicana.applyAction(faceDownOnly('4S', ['KS', 'QD']), { type: 'PLAY_FACE_DOWN', position: 0 }, 'p1'),
    );
    expect(events[0]).toMatchObject({ type: 'CardRevealed', playable: false });
    expect(events[1]).toMatchObject({ type: 'PilePickedUp', reason: 'faceDownFailed' });
    expect(ids(state.players.p1!.hand).sort()).toEqual(['4S', 'KS', 'QD']);
    expect(state.discardPile).toEqual([]);
    expect(current(state)).toBe('p2');
  });
});

describe('picking up', () => {
  it('without a valid play: takes the whole pile and loses the turn', () => {
    const state = buildState({
      players: { p1: { hand: ['4H'] }, p2: { hand: ['5C'] }, p3: { hand: ['6C'] } },
      discard: ['9S', 'KS'],
    });
    expect(mexicana.getValidActions(state, 'p1')).toEqual([{ type: 'PICK_UP_PILE' }]);
    const { state: next, events } = expectOk(mexicana.applyAction(state, { type: 'PICK_UP_PILE' }, 'p1'));
    expect(ids(next.players.p1!.hand)).toEqual(['4H', '9S', 'KS']);
    expect(events).toEqual([
      { type: 'PilePickedUp', playerId: 'p1', cards: next.players.p1!.hand.slice(1), reason: 'noValidPlay' },
    ]);
    expect(current(next)).toBe('p2');
    expect(next.discardPile).toEqual([]);
  });

  it('is refused while a valid play exists', () => {
    const state = buildState({ players: { p1: { hand: ['KH'] }, p2: { hand: ['5C'] } }, discard: ['9S'] });
    expectError(mexicana.applyAction(state, { type: 'PICK_UP_PILE' }, 'p1'), 'PICK_UP_NOT_ALLOWED');
  });

  it('on timeout: the default action picks up the pile and loses the turn', () => {
    const state = buildState({ players: { p1: { hand: ['KH'] }, p2: { hand: ['5C'] } }, discard: ['9S'] });
    const action = mexicana.getDefaultAction(state, 'p1');
    expect(action).toEqual({ type: 'TIMEOUT_PICK_UP' });
    const { state: next, events } = expectOk(mexicana.applyAction(state, action!, 'p1'));
    expect(events[0]).toMatchObject({ type: 'PilePickedUp', reason: 'timeout' });
    expect(ids(next.players.p1!.hand)).toEqual(['KH', '9S']);
    expect(current(next)).toBe('p2');
  });

  it('ignores the face-up cards while a hand is held', () => {
    const state = buildState({
      players: { p1: { hand: ['4H'], faceUp: ['5S'] }, p2: { hand: ['5C'] } },
      discard: ['KS'],
    });
    expect(mexicana.getValidActions(state, 'p1')).toEqual([{ type: 'PICK_UP_PILE' }]);
    expectError(
      mexicana.applyAction(state, { type: 'PICK_UP_PILE', faceUpCardId: '5S' }, 'p1'),
      'INVALID_CARDS',
    );
    expect(mexicana.getDefaultAction(state, 'p1')).toEqual({ type: 'TIMEOUT_PICK_UP' });
  });

  it('clears restrictions and skips', () => {
    const state = buildState({ players: { p1: { hand: ['KH'] }, p2: { hand: ['5C'] } }, discard: ['7S'] });
    const next = expectOk(mexicana.applyAction(state, { type: 'TIMEOUT_PICK_UP' }, 'p1')).state;
    expect(next.restriction).toBe('none');
    expect(next.sameRankRun).toBe(0);
  });
});

describe('picking up with only face-up cards left', () => {
  /** p1 plays from the table: nothing beats the king (no 2, 3, 10 or joker face-up). */
  const stuck = (faceUp: (string | null)[] = ['9H', '4S', 'QC'], discard = ['KS']) =>
    buildState({
      players: { p1: { faceUp, faceDown: ['JD', 'JC', 'JH'] }, p2: { hand: ['5C'] }, p3: { hand: ['6C'] } },
      discard,
    });

  it('offers one pick-up per face-up card', () => {
    expect(mexicana.getValidActions(stuck(['9H', null, 'QC']), 'p1')).toEqual([
      { type: 'PICK_UP_PILE', faceUpCardId: '9H' },
      { type: 'PICK_UP_PILE', faceUpCardId: 'QC' },
    ]);
    expect(mexicana.getValidActions(stuck(), 'p2')).toEqual([]);
  });

  it('the chosen face-up card goes to the hand with the pile and the turn is lost', () => {
    const { state, events } = expectOk(
      mexicana.applyAction(stuck(), { type: 'PICK_UP_PILE', faceUpCardId: 'QC' }, 'p1'),
    );
    expect(events).toEqual([
      {
        type: 'PilePickedUp',
        playerId: 'p1',
        cards: [card('KS'), card('QC')],
        reason: 'noValidPlay',
        faceUpSlot: 2,
      },
    ]);
    expect(ids(state.players.p1!.hand).sort()).toEqual(['KS', 'QC']);
    expect(state.players.p1!.faceUp).toEqual([card('9H'), card('4S'), null]);
    expect(state.discardPile).toEqual([]);
    expect(current(state)).toBe('p2');
  });

  it('the choice is required and must be one of the face-up cards', () => {
    const state = stuck();
    expectError(mexicana.applyAction(state, { type: 'PICK_UP_PILE' }, 'p1'), 'FACE_UP_CARD_REQUIRED');
    expectError(
      mexicana.applyAction(state, { type: 'PICK_UP_PILE', faceUpCardId: 'JD' }, 'p1'),
      'INVALID_CARDS',
    );
  });

  it('is refused while any face-up card can be played', () => {
    const state = stuck(['9H', '2S', 'QC']);
    expectError(
      mexicana.applyAction(state, { type: 'PICK_UP_PILE', faceUpCardId: '9H' }, 'p1'),
      'PICK_UP_NOT_ALLOWED',
    );
  });

  it('taking the last face-up card leaves the face-down ones for later', () => {
    const { state } = expectOk(
      mexicana.applyAction(stuck([null, '4S', null]), { type: 'PICK_UP_PILE', faceUpCardId: '4S' }, 'p1'),
    );
    expect(state.players.p1!.faceUp).toEqual([null, null, null]);
    expect(state.players.p1!.faceDown.every((slot) => slot !== null)).toBe(true);
    expect(ids(state.players.p1!.hand).sort()).toEqual(['4S', 'KS']);
  });

  it('on timeout: the lowest face-up card goes along with the pile', () => {
    const state = stuck();
    const action = mexicana.getDefaultAction(state, 'p1');
    expect(action).toEqual({ type: 'TIMEOUT_PICK_UP', faceUpCardId: '4S' });
    const { state: next, events } = expectOk(mexicana.applyAction(state, action!, 'p1'));
    expect(events[0]).toMatchObject({ type: 'PilePickedUp', reason: 'timeout', faceUpSlot: 1 });
    expect(ids(next.players.p1!.hand).sort()).toEqual(['4S', 'KS']);

    const unnamed = expectOk(mexicana.applyAction(state, { type: 'TIMEOUT_PICK_UP' }, 'p1')).state;
    expect(unnamed.players.p1!.faceUp[1]).toBeNull();
  });

  it('on timeout with a playable face-up card: only the pile is taken', () => {
    const state = stuck(['9H', 'AS', 'QC']);
    expect(mexicana.getDefaultAction(state, 'p1')).toEqual({ type: 'TIMEOUT_PICK_UP' });
    const next = expectOk(mexicana.applyAction(state, { type: 'TIMEOUT_PICK_UP' }, 'p1')).state;
    expect(ids(next.players.p1!.hand)).toEqual(['KS']);
    expect(next.players.p1!.faceUp).toEqual([card('9H'), card('AS'), card('QC')]);
    expectError(
      mexicana.applyAction(state, { type: 'TIMEOUT_PICK_UP', faceUpCardId: '9H' }, 'p1'),
      'INVALID_CARDS',
    );
  });
});
