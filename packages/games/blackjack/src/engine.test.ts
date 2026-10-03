import { SYSTEM_PLAYER_ID, WALLET, createSeededRng } from '@cardroom/game-core';
import { describe, expect, it } from 'vitest';
import { scheduleFor } from './engine';
import { blackjack, blackjackActionSchema, blackjackConfigSchema, validateTable } from './module';
import { PACE } from './rules';
import { Table, config, eventTypes, expectError } from './test-utils';

const AB = ['a', 'b'];

/**
 * Two players, stacked deal: a1 b1 up a2 b2 hole, then `rest` (hits, dealer
 * cards). Bets 100 each unless given.
 */
function twoHands(
  a: [string, string],
  b: [string, string],
  dealer: [string, string],
  rest: string[] = [],
  cfg: Parameters<typeof Table.stacked>[2] = {},
): Table {
  const order = [a[0], b[0], dealer[0], a[1], b[1], dealer[1], ...rest];
  return Table.stacked(AB, order, cfg);
}

/** One player, stacked deal: p1 up p2 hole, then `rest`. */
function oneHand(
  p: [string, string],
  dealer: [string, string],
  rest: string[] = [],
  cfg: Parameters<typeof Table.stacked>[2] = {},
): Table {
  return Table.stacked(['a'], [p[0], dealer[0], p[1], dealer[1], ...rest], cfg);
}

describe('setup', () => {
  it('seats 1–7 players and refuses duplicates, bad seats and bad limits', () => {
    const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
    const rng = () => createSeededRng('x');
    expect(() => blackjack.setup([], config(), rng())).toThrow(RangeError);
    expect(() => blackjack.setup(players(8), config(), rng())).toThrow(RangeError);
    expect(blackjack.setup(players(7), config(), rng()).seats).toHaveLength(7);
    expect(() => blackjack.setup(['a', 'a'], config(), rng())).toThrow(/Duplicate/);
    expect(() => blackjack.setup(['a', 'b'], config(), rng(), { seats: [3, 3] })).toThrow(/seats/);
    expect(() => blackjack.setup(['a'], config(), rng(), { seats: [7] })).toThrow(/seats/);
    expect(() => blackjack.setup(['a'], config({ minBet: 100, maxBet: 50 }), rng())).toThrow(/mínima/);
  });

  it('keeps the room seats and opens the bets on a shuffled six-deck shoe', () => {
    const state = blackjack.setup(['a', 'b'], config(), createSeededRng('s'), {
      seats: [5, 2],
      wallets: { a: 1200, b: 800 },
    });
    // Everyone sits down with the chips of their account.
    expect(state.seats.map((s) => [s.seatIndex, s.playerId, s.stack, s.buyIn])).toEqual([
      [2, 'b', 800, 800],
      [5, 'a', 1200, 1200],
    ]);
    expect(blackjack.setup(['a'], config(), createSeededRng('s')).seats[0]?.stack).toBe(WALLET.start);
    expect(state).toMatchObject({ phase: 'BETTING', round: 1, shoeIndex: 0, cutIndex: 234, shuffles: 1 });
    expect(state.shoe).toHaveLength(312);
    expect(new Set(state.shoe.map((c) => c.uid)).size).toBe(312);
    expect(state.shoe.slice(0, 13).map((c) => c.id)).not.toEqual(['2S', '3S', '4S', '5S', '6S', '7S']);
    expect(['Rui', 'Sofia', 'Tiago', 'Marta', 'Nuno', 'Inês']).toContain(state.dealerName);
    expect(blackjack.getSeatedPlayers?.(state)).toEqual(['b', 'a']);
  });

  it('shuffles differently for different seeds', () => {
    const a = blackjack.setup(['a'], config(), createSeededRng('one'));
    const b = blackjack.setup(['a'], config(), createSeededRng('two'));
    expect(a.shoe.map((c) => c.uid)).not.toEqual(b.shoe.map((c) => c.uid));
  });
});

describe('bets (09 §4)', () => {
  it('refuses bets off the limits, off the 10s, above the stack, twice or out of phase', () => {
    const t = new Table(blackjack, AB, { maxBet: 500 }, { wallets: { a: 500, b: 500 } });
    expectError(t.try({ type: 'PLACE_BET', amount: 0 }, 'a'), 'INVALID_BET');
    expectError(t.try({ type: 'PLACE_BET', amount: 510 }, 'a'), 'INVALID_BET');
    expectError(t.try({ type: 'PLACE_BET', amount: 15 }, 'a'), 'INVALID_BET');
    expectError(t.try({ type: 'PLACE_BET', amount: 12.5 }, 'a'), 'INVALID_BET');
    expectError(t.try({ type: 'PLACE_BET', amount: 10 }, 'zed'), 'NOT_SEATED');
    expectError(t.try({ type: 'CLEAR_BET' }, 'a'), 'NO_BET');
    t.apply({ type: 'PLACE_BET', amount: 300 }, 'a');
    expectError(t.try({ type: 'PLACE_BET', amount: 10 }, 'a'), 'ALREADY_BET');
    expect(t.stack('a')).toBe(200);
    t.apply({ type: 'CLEAR_BET' }, 'a');
    expect(t.stack('a')).toBe(500);
    t.setStack('a', 40);
    expectError(t.try({ type: 'PLACE_BET', amount: 50 }, 'a'), 'NOT_ENOUGH_CHIPS');
  });

  it('only the server applies system actions', () => {
    const t = new Table(blackjack, AB);
    expectError(t.try({ type: 'SYS_BETTING_CLOSED' }, 'a'), 'SYSTEM_ONLY');
    expectError(t.try({ type: 'SYS_PEEK' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_DEAL_DONE' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_DEALER_STEP' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_NEXT_ROUND' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_SHUFFLE_DONE' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_INSURANCE_CLOSED' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
    expectError(t.try({ type: 'SYS_DECISION_TIMEOUT' }, SYSTEM_PLAYER_ID), 'WRONG_PHASE');
  });

  it('deals as soon as everyone has bet, and the betting timer deals whoever did', () => {
    const t = new Table(blackjack, ['a', 'b', 'c']);
    expect(blackjack.getPendingPlayers(t.state)).toEqual(['a', 'b', 'c']);
    expect(blackjack.getTimeoutMs(t.state)).toBe(15_000);
    expect(blackjack.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_BETTING_CLOSED' });
    expect(blackjack.getDefaultAction(t.state, 'a')).toBeNull();
    expect(blackjack.getValidActions(t.state, 'a')).toEqual([
      { type: 'PLACE_BET', amount: 10 },
      { type: 'SIT_OUT', value: true },
    ]);
    t.apply({ type: 'PLACE_BET', amount: 20 }, 'a');
    expect(blackjack.getValidActions(t.state, 'a')[0]).toEqual({ type: 'CLEAR_BET' });
    expect(blackjack.getPendingPlayers(t.state)).toEqual(['b', 'c']);
    const closed = t.system({ type: 'SYS_BETTING_CLOSED' });
    expect(closed.events[0]).toEqual({ type: 'BettingClosed', round: 1, seats: [0] });
    expect(t.state.phase).toBe('DEALING');
    expect(t.hands('b')).toEqual([]);
    expect(t.state.seats[0]).toMatchObject({ lastBet: 20, bet: null, roundsPlayed: 1 });
  });

  it('closing the bets with no bet keeps the table open', () => {
    const t = new Table(blackjack, AB);
    t.system({ type: 'SYS_BETTING_CLOSED' });
    expect(t.state).toMatchObject({ phase: 'BETTING', round: 1, roundsDealt: 0 });
  });

  it('rebuys one rebuy of the account (500) only when broke, before betting', () => {
    const t = new Table(blackjack, ['a']);
    expectError(t.try({ type: 'REBUY' }, 'a'), 'REBUY_NOT_NEEDED');
    t.setStack('a', 5);
    // Broke: still expected at the table, to rebuy first.
    expect(blackjack.getPendingPlayers(t.state)).toEqual(['a']);
    expect(blackjack.getValidActions(t.state, 'a')[0]).toEqual({ type: 'REBUY' });
    const rebought = t.apply({ type: 'REBUY' }, 'a');
    expect(rebought.events).toEqual([{ type: 'PlayerRebought', seatIndex: 0, stack: 505, rebuys: 1 }]);
    expect(blackjack.getWallets?.(t.state)).toEqual({ a: 505 });
    expect(t.state.seats[0]).toMatchObject({ buyIn: 1000, rebuys: 1 });
    expectError(t.try({ type: 'REBUY' }, 'a'), 'REBUY_NOT_NEEDED');
  });

  it('tells the server what each account holds, chips on the felt included', () => {
    const t = new Table(blackjack, AB, {}, { wallets: { a: 300, b: 2000 } });
    t.apply({ type: 'PLACE_BET', amount: 100 }, 'a');
    expect(t.stack('a')).toBe(200);
    expect(blackjack.getWallets?.(t.state)).toEqual({ a: 300, b: 2000 });
  });

  it('sitting out returns the bet and skips the deal until the player is back', () => {
    const t = new Table(blackjack, AB);
    t.apply({ type: 'PLACE_BET', amount: 50 }, 'a');
    const out = t.apply({ type: 'SIT_OUT', value: true }, 'a');
    expect(eventTypes(out.events)).toEqual(['BetCleared', 'PlayerSatOut']);
    expect(t.stack('a')).toBe(1000);
    expectError(t.try({ type: 'SIT_OUT', value: true }, 'a'), 'NO_CHANGE');
    expectError(t.try({ type: 'PLACE_BET', amount: 10 }, 'a'), 'SITTING_OUT');
    expect(blackjack.getPendingPlayers(t.state)).toEqual(['b']);
    t.apply({ type: 'PLACE_BET', amount: 10 }, 'b'); // the only one left: deals at once
    expect(t.state.phase).toBe('DEALING');
    expectError(t.try({ type: 'SIT_OUT', value: false }, 'a'), 'WRONG_PHASE'); // the dealer is dealing
    t.run();
    t.apply({ type: 'SIT_OUT', value: false }, 'a');
    expect(t.state.seats[0]?.sittingOut).toBe(false);
  });
});

describe('the deal (rules §5.2)', () => {
  it('goes player by player from the dealer’s left, up card, second cards, hole card face down', () => {
    const t = twoHands(['2S', '3S'], ['4S', '5S'], ['9D', '7C']);
    t.apply({ type: 'PLACE_BET', amount: 100 }, 'a');
    const dealt = t.apply({ type: 'PLACE_BET', amount: 100 }, 'b');
    const cardsDealt = dealt.events.filter((e) => e.type === 'CardDealt');
    expect(cardsDealt.map((e) => [e.to.kind === 'HAND' ? e.to.seatIndex : 'D', e.card?.id ?? null])).toEqual([
      [0, '2S'],
      [1, '4S'],
      ['D', '9D'],
      [0, '3S'],
      [1, '5S'],
      ['D', null],
    ]);
    expect(scheduleFor(t.state)).toEqual([{ action: { type: 'SYS_DEAL_DONE' }, delayMs: 7 * PACE.dealCard }]);
  });

  it('the European dealer takes one card now and the second at the end', () => {
    const t = oneHand(['10S', '7S'], ['9D', 'AC'], [], { holeCard: 'EUROPEAN' });
    t.bet({ a: 100 });
    expect(t.state.dealer.cards.map((c) => c.id)).toEqual(['9D']);
    expect(blackjack.getPlayerView(t.state, 'a').dealer.cards).toHaveLength(1);
    t.play('a', 'STAND');
    expect(t.state.dealer.cards.map((c) => c.id)).toEqual(['9D', 'AC']);
    expect(t.hands('a')[0]).toMatchObject({ outcome: 'LOSE', payout: 0 }); // 17 vs 20
  });
});

describe('insurance, even money and the peek (rules §5.3)', () => {
  it('offers insurance with an ace up, pays 2:1 on a dealer blackjack', () => {
    const t = twoHands(['10S', '9S'], ['AH', 'KH'], ['AD', 'QC']);
    t.bet({ a: 100, b: 100 });
    expect(t.state.phase).toBe('INSURANCE');
    expect(blackjack.getTimeoutMs(t.state)).toBe(10_000);
    expect(blackjack.getDefaultAction(t.state, 'a')).toEqual({ type: 'INSURANCE', take: false });
    expect(blackjack.getDefaultAction(t.state, 'b')).toEqual({ type: 'EVEN_MONEY', take: false });
    expectError(t.try({ type: 'EVEN_MONEY', take: true }, 'a'), 'NO_OFFER');
    expectError(t.try({ type: 'INSURANCE', take: true }, 'b'), 'NO_OFFER');
    t.apply({ type: 'INSURANCE', take: true }, 'a');
    expectError(t.try({ type: 'INSURANCE', take: false }, 'a'), 'NO_OFFER');
    expect(t.stack('a')).toBe(850);
    t.apply({ type: 'EVEN_MONEY', take: false }, 'b');
    t.run();
    expect(t.state.phase).toBe('SETTLEMENT');
    expect(t.stack('a')).toBe(1000); // lost 100, insurance 50 → 150
    expect(t.hands('b')[0]).toMatchObject({ outcome: 'PUSH', payout: 100 });
  });

  it('insurance is lost when the dealer has no blackjack, and the round goes on', () => {
    const t = oneHand(['10S', '9S'], ['AD', '7C']);
    t.bet({ a: 100 });
    t.apply({ type: 'INSURANCE', take: true }, 'a');
    const peek = t.system({ type: 'SYS_PEEK' });
    expect(eventTypes(peek.events)).toEqual(['DealerPeeked', 'InsuranceSettled', 'TurnStarted']);
    expect(t.state.seats[0]?.insurance).toMatchObject({ amount: 50, payout: 0 });
    expect(blackjack.getPlayerView(t.state, 'a').dealer.cards[1]).toBeNull();
    expect(t.stack('a')).toBe(850);
  });

  it('the timer declines whatever is left; nobody who cannot pay is asked', () => {
    const t = twoHands(['10S', '9S'], ['10H', '6H'], ['AD', '7C']);
    t.apply({ type: 'PLACE_BET', amount: 100 }, 'a');
    t.setStack('b', 100);
    t.apply({ type: 'PLACE_BET', amount: 100 }, 'b');
    t.run();
    expect(t.state.seats.map((s) => s.insurance?.decision ?? null)).toEqual(['PENDING', null]);
    expect(blackjack.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_INSURANCE_CLOSED' });
    const closed = t.system({ type: 'SYS_INSURANCE_CLOSED' });
    expect(eventTypes(closed.events)).toEqual(['InsuranceDeclined']);
    expect(t.state.phase).toBe('PEEK');
  });

  it('without insurance an ace still makes the dealer peek; a ten peeks too; a nine does not', () => {
    const noInsurance = oneHand(['10S', '9S'], ['AD', '7C'], [], { insurance: false });
    noInsurance.apply({ type: 'PLACE_BET', amount: 10 }, 'a');
    noInsurance.system({ type: 'SYS_DEAL_DONE' });
    expect(noInsurance.state.phase).toBe('PEEK');
    const ten = oneHand(['10S', '9S'], ['KD', 'AC']);
    ten.apply({ type: 'PLACE_BET', amount: 100 }, 'a');
    ten.system({ type: 'SYS_DEAL_DONE' });
    expect(ten.state.phase).toBe('PEEK');
    ten.run();
    expect(ten.state.phase).toBe('SETTLEMENT'); // dealer blackjack: lost before any decision
    expect(ten.hands('a')[0]).toMatchObject({
      cards: [expect.anything(), expect.anything()],
      outcome: 'LOSE',
    });
    const nine = oneHand(['10S', '9S'], ['9D', 'AC']);
    nine.bet({ a: 10 });
    expect(nine.state.phase).toBe('PLAYER_TURNS');
  });

  it('the European table takes doubles and splits on a late dealer blackjack; insurance pays then', () => {
    // No hole card: 5S, the ace up, 6S; then the double's 9H and, at the end, the dealer's KC.
    const table = Table.stacked(['a'], ['5S', 'AD', '6S', '9H', 'KC'], { holeCard: 'EUROPEAN' });
    table.bet({ a: 100 });
    expect(table.state.phase).toBe('INSURANCE');
    table.apply({ type: 'INSURANCE', take: true }, 'a');
    expect(table.state.phase).toBe('PLAYER_TURNS'); // no peek on a European table
    table.play('a', 'DOUBLE');
    expect(table.hands('a')[0]).toMatchObject({ bet: 200, outcome: 'LOSE', payout: 0 });
    expect(table.state.seats[0]?.insurance).toMatchObject({ amount: 50, payout: 150 });
    expect(table.stack('a')).toBe(1000 - 200 - 50 + 150);
  });
});

describe('decisions (09 §3)', () => {
  it('refuses decisions out of turn and moves that are not allowed', () => {
    const t = twoHands(['10S', '6S'], ['9H', '9D'], ['7C', '10C'], ['2C']);
    t.bet({ a: 100, b: 100 });
    expectError(t.try({ type: 'HIT' }, 'b'), 'NOT_YOUR_TURN');
    expectError(t.try({ type: 'SPLIT' }, 'a'), 'ILLEGAL_DECISION');
    expect(blackjack.getDefaultAction(t.state, 'a')).toEqual({ type: 'STAND' });
    expect(blackjack.getDefaultAction(t.state, 'b')).toBeNull();
    expect(blackjack.getTimeoutMs(t.state)).toBe(20_000);
    t.apply({ type: 'HIT' }, 'a');
    // Two cards only: no double or surrender after a hit.
    expectError(t.try({ type: 'DOUBLE' }, 'a'), 'ILLEGAL_DECISION');
    expectError(t.try({ type: 'SURRENDER' }, 'a'), 'ILLEGAL_DECISION');
    expect(blackjack.getValidActions(t.state, 'a').map((a) => a.type)).toEqual(['HIT', 'STAND', 'SIT_OUT']);
  });

  it('21 closes the hand by itself; a bust too', () => {
    const t = twoHands(['10S', '6S'], ['9H', '7D'], ['7C', '10C'], ['5C', '10H']);
    t.bet({ a: 100, b: 100 });
    const hit = t.apply({ type: 'HIT' }, 'a');
    expect(eventTypes(hit.events)).toEqual(['CardDealt', 'HandStood', 'TurnStarted']);
    expect(hit.events[1]).toMatchObject({ auto: true });
    t.apply({ type: 'HIT' }, 'b');
    expect(t.hands('b')[0]?.status).toBe('BUSTED');
  });

  it('the decision timer stands', () => {
    const t = oneHand(['10S', '6S'], ['7C', '10C']);
    t.bet({ a: 100 });
    expect(blackjack.getTimeoutAction?.(t.state)).toEqual({ type: 'SYS_DECISION_TIMEOUT' });
    const timeout = t.system({ type: 'SYS_DECISION_TIMEOUT' });
    expect(timeout.events[0]).toMatchObject({ type: 'HandStood', auto: true });
    expect(t.state.phase).toBe('DEALER_TURN');
  });

  it('double: two cards, enough chips, after a split only with DAS; exactly one card', () => {
    const t = oneHand(['5S', '6S'], ['7C', '10C'], ['2H', '3H']);
    t.bet({ a: 100 });
    t.play('a', 'DOUBLE');
    expect(t.hands('a')[0]).toMatchObject({ bet: 200, doubled: true });
    expect(t.hands('a')[0]?.cards).toHaveLength(3);

    const broke = oneHand(['5S', '6S'], ['7C', '10C']);
    broke.setStack('a', 150);
    broke.bet({ a: 100 });
    expect(blackjack.getValidActions(broke.state, 'a').map((a) => a.type)).not.toContain('DOUBLE');

    const noDas = oneHand(['8S', '8H'], ['7C', '10C'], ['3D', '3C'], { doubleAfterSplit: false });
    noDas.bet({ a: 100 });
    noDas.play('a', 'SPLIT');
    expect(noDas.hands('a')[0]?.cards.map((c) => c.id)).toEqual(['8S', '3D']);
    expectError(noDas.try({ type: 'DOUBLE' }, 'a'), 'ILLEGAL_DECISION');
  });

  it('split: J+Q by value (when enabled), up to four hands, enough chips', () => {
    const tens = oneHand(['JS', 'QH'], ['7C', '10C']);
    tens.bet({ a: 100 });
    expect(blackjack.getValidActions(tens.state, 'a').map((a) => a.type)).toContain('SPLIT');
    const strict = oneHand(['JS', 'QH'], ['7C', '10C'], [], { splitTensByValue: false });
    strict.bet({ a: 100 });
    expectError(strict.try({ type: 'SPLIT' }, 'a'), 'ILLEGAL_DECISION');

    const four = oneHand(['8S', '8H'], ['7C', '10C'], ['8D', '8C', '8S', '2D', '2S', '2H', '2C']);
    four.bet({ a: 100 });
    four.play('a', 'SPLIT', 'SPLIT', 'SPLIT');
    expect(four.hands('a')).toHaveLength(4);
    expect(four.hands('a')[0]?.cards.map((c) => c.id)).toEqual(['8S', '8S']);
    expectError(four.try({ type: 'SPLIT' }, 'a'), 'ILLEGAL_DECISION'); // a fifth hand
    expect(four.stack('a')).toBe(600);

    const poor = oneHand(['8S', '8H'], ['7C', '10C']);
    poor.setStack('a', 150);
    poor.bet({ a: 100 });
    expectError(poor.try({ type: 'SPLIT' }, 'a'), 'ILLEGAL_DECISION');
  });

  it('split aces: one card each, they stand, no resplit; A+K after a split pays 1:1', () => {
    const t = oneHand(['AS', 'AH'], ['7C', '10C'], ['KD', 'AC']);
    t.bet({ a: 100 });
    const split = t.apply({ type: 'SPLIT' }, 'a');
    expect(eventTypes(split.events)).toEqual([
      'HandSplit',
      'CardDealt',
      'HandStood',
      'CardDealt',
      'HandStood',
      'DealerTurnStarted',
    ]);
    expect(t.hands('a').map((h) => h.cards.map((c) => c.id))).toEqual([
      ['AS', 'KD'],
      ['AH', 'AC'],
    ]);
    t.run();
    expect(t.hands('a').map((h) => [h.outcome, h.payout])).toEqual([
      ['WIN', 200], // 21, not a blackjack
      ['LOSE', 0], // soft 12 vs 17
    ]);
  });

  it('surrender: first decision of the original hand only, half back', () => {
    const t = oneHand(['10S', '6S'], ['10C', '7C']);
    t.bet({ a: 100 });
    t.play('a', 'SURRENDER');
    expect(t.hands('a')[0]).toMatchObject({ status: 'SURRENDERED', outcome: 'SURRENDER', payout: 50 });
    expect(t.stack('a')).toBe(950);
    const off = oneHand(['10S', '6S'], ['10C', '7C'], [], { surrender: false });
    off.bet({ a: 100 });
    expectError(off.try({ type: 'SURRENDER' }, 'a'), 'ILLEGAL_DECISION');
    const split = oneHand(['8S', '8H'], ['10C', '7C'], ['8D']);
    split.bet({ a: 100 });
    split.play('a', 'SPLIT');
    expectError(split.try({ type: 'SURRENDER' }, 'a'), 'ILLEGAL_DECISION');
  });
});

describe('the dealer (09 §2)', () => {
  it('only turns the hole card when no hand is left to compare', () => {
    const t = twoHands(['10S', '6S'], ['9H', '7D'], ['7C', '6C'], ['KH', 'KD', '5C']);
    t.bet({ a: 100, b: 100 });
    t.play('a', 'HIT');
    t.play('b', 'SURRENDER');
    expect(t.state.phase).toBe('SETTLEMENT');
    expect(t.state.dealer.cards.map((c) => c.id)).toEqual(['7C', '6C']); // 13, but nothing to play for
  });

  it('hits soft 17 on an H17 table and stands on it otherwise', () => {
    const s17 = oneHand(['10S', '8S'], ['AC', '6C'], ['5D'], { insurance: false });
    s17.bet({ a: 100 });
    s17.play('a', 'STAND');
    expect(s17.state.dealer.cards).toHaveLength(2);
    const h17 = oneHand(['10S', '8S'], ['AC', '6C'], ['5D', '5H'], {
      insurance: false,
      dealerHitsSoft17: true,
    });
    h17.bet({ a: 100 });
    h17.play('a', 'STAND');
    // Soft 17 → hit: hard 12 → hit: hard 17 → stand.
    expect(h17.state.dealer.cards.map((c) => c.id)).toEqual(['AC', '6C', '5D', '5H']);
  });

  it('paces every step and re-arms it when something happens in between', () => {
    const t = oneHand(['10S', '8S'], ['9C', '6C'], ['2D', '3D']);
    t.bet({ a: 100 });
    t.apply({ type: 'STAND' }, 'a');
    expect(scheduleFor(t.state)).toEqual([{ action: { type: 'SYS_DEALER_STEP' }, delayMs: PACE.reveal }]);
    // Someone sits down while the dealer is about to turn the hole card: the step is scheduled again.
    const joined = t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'z', seatIndex: 4 });
    expect(joined.schedule).toEqual([{ action: { type: 'SYS_DEALER_STEP' }, delayMs: PACE.reveal }]);
    t.system({ type: 'SYS_DEALER_STEP' });
    expect(t.last?.schedule).toEqual([{ action: { type: 'SYS_DEALER_STEP' }, delayMs: PACE.dealerCard }]);
    t.run();
    expect(scheduleFor(t.state)).toEqual([
      { action: { type: 'SYS_NEXT_ROUND' }, delayMs: PACE.settleHand + PACE.summary },
    ]);
  });
});

describe('the shoe (09 §7)', () => {
  it('the cut card ends the shoe after the round in play, never in the middle', () => {
    const t = new Table(blackjack, ['a'], { decks: 1, penetration: 0.5 });
    let rounds = 0;
    while (!t.state.cutCardReached) {
      t.bet({ a: 10 });
      while (t.state.phase === 'PLAYER_TURNS') t.apply({ type: 'STAND' }, 'a');
      t.run();
      rounds += 1;
      if (!t.state.cutCardReached) t.nextRound();
    }
    expect(rounds).toBeGreaterThan(1);
    expect(t.log.filter((e) => e.type === 'CutCardReached')).toHaveLength(1);
    const cleared = t.system({ type: 'SYS_NEXT_ROUND' });
    expect(eventTypes(cleared.events)).toEqual(['ShuffleStarted']);
    expect(t.state.phase).toBe('SHUFFLING');
    expect(blackjack.getValidActions(t.state, 'a')).toEqual([]);
    expect(scheduleFor(t.state)).toEqual([{ action: { type: 'SYS_SHUFFLE_DONE' }, delayMs: PACE.shuffle }]);
    const shuffled = t.system({ type: 'SYS_SHUFFLE_DONE' });
    expect(eventTypes(shuffled.events)).toEqual(['ShoeShuffled', 'BettingOpened']);
    expect(t.state).toMatchObject({ phase: 'BETTING', shoeIndex: 0, cutCardReached: false, discard: [] });
  });

  it('a shoe that runs dry mid-round shuffles the discards in as a reserve', () => {
    const t = new Table(blackjack, ['a', 'b', 'c'], { decks: 1 });
    // Pretend 48 cards were already played: 4 are left, the deal needs 8.
    t.state = { ...t.state, shoeIndex: 48, cutIndex: 52, discard: t.state.shoe.slice(0, 48) };
    t.bet({ a: 10, b: 10, c: 10 });
    const reserve = t.log.find((e) => e.type === 'ShoeShuffled');
    expect(reserve).toEqual({ type: 'ShoeShuffled', decks: 1, reason: 'RESERVE' });
    expect(t.state.cutCardReached).toBe(true);
    while (t.state.phase !== 'SETTLEMENT') {
      if (t.state.phase === 'PLAYER_TURNS') t.apply({ type: 'STAND' }, blackjack.getCurrentPlayer(t.state)!);
      else if (t.state.phase === 'INSURANCE') t.system({ type: 'SYS_INSURANCE_CLOSED' });
      else t.run();
    }
    t.system({ type: 'SYS_NEXT_ROUND' });
    expect(t.state.phase).toBe('SHUFFLING');
  });
});

describe('a session (09 §8)', () => {
  it('someone who sits down mid-round plays from the next bets', () => {
    const t = oneHand(['10S', '6S'], ['7C', '10C']);
    t.bet({ a: 100 });
    const joined = t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'z', seatIndex: 3, wallet: 2500 });
    expect(joined.events).toEqual([{ type: 'PlayerJoined', seatIndex: 3, playerId: 'z', stack: 2500 }]);
    expect(blackjack.getPendingPlayers(t.state)).toEqual(['a']);
    expect(blackjack.getValidActions(t.state, 'z')).toEqual([{ type: 'SIT_OUT', value: true }]);
    t.play('a', 'STAND');
    t.nextRound();
    expect(blackjack.getPendingPlayers(t.state)).toEqual(['a', 'z']);
  });

  it('refuses taken, invalid and repeated seats', () => {
    const t = new Table(blackjack, AB);
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'z', seatIndex: 1 }, SYSTEM_PLAYER_ID),
      'SEAT_TAKEN',
    );
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'z', seatIndex: 7 }, SYSTEM_PLAYER_ID),
      'INVALID_SEAT',
    );
    expectError(
      t.try({ type: 'SYS_PLAYER_JOINED', playerId: 'a', seatIndex: 5 }, SYSTEM_PLAYER_ID),
      'ALREADY_SEATED',
    );
    expectError(t.try({ type: 'SYS_PLAYER_LEFT', playerId: 'z' }, SYSTEM_PLAYER_ID), 'NOT_SEATED');
  });

  it('leaving between rounds frees the seat at once, returns the bet and may start the deal', () => {
    const t = new Table(blackjack, ['a', 'b', 'c']);
    t.apply({ type: 'PLACE_BET', amount: 50 }, 'a');
    t.apply({ type: 'PLACE_BET', amount: 70 }, 'c');
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'c' });
    expect(t.state.departed).toEqual([
      { playerId: 'c', stack: 1000, buyIn: 1000, rebuys: 0, roundsPlayed: 0 },
    ]);
    const left = t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'b' });
    expect(eventTypes(left.events)).toContain('BettingClosed'); // only a was still in, and had bet
    expect(blackjack.getSeatedPlayers?.(t.state)).toEqual(['a']);
  });

  it('leaving mid-hand stands the hands, settles them and frees the seat when the round ends', () => {
    const t = twoHands(['10S', '6S'], ['9H', '9D'], ['7C', '10C'], ['2D']);
    t.bet({ a: 100, b: 100 });
    expect(blackjack.getCurrentPlayer(t.state)).toBe('a');
    const left = t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    expect(eventTypes(left.events)).toEqual(['PlayerLeaving', 'HandStood', 'TurnStarted']);
    expect(blackjack.getCurrentPlayer(t.state)).toBe('b');
    expect(t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' }).events).toEqual([]); // already on the way out
    t.play('b', 'SPLIT');
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'b' }); // the split hand gets its card and stands
    expect(t.hands('b').map((h) => h.cards.length)).toEqual([2, 2]);
    t.run();
    expect(t.hands('a')[0]).toMatchObject({ outcome: 'LOSE' });
    expect(blackjack.getSeatedPlayers?.(t.state)).toEqual(['a', 'b']);
    const cleared = t.system({ type: 'SYS_NEXT_ROUND' });
    expect(eventTypes(cleared.events)).toEqual(['PlayerLeft', 'PlayerLeft', 'BettingOpened']);
    expect(blackjack.getSeatedPlayers?.(t.state)).toEqual([]);
    expect(t.state.departed.map((p) => [p.playerId, p.stack, p.roundsPlayed])).toEqual([
      ['a', 900, 1],
      ['b', 800, 1],
    ]);
  });

  it('coming back keeps the chips: mid-round it cancels leaving, later it restores the stack', () => {
    const t = twoHands(['10S', '6S'], ['9H', '9D'], ['7C', '10C']);
    t.bet({ a: 100, b: 100 });
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'b' });
    t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'b', seatIndex: 6 });
    expect(t.state.seats[1]).toMatchObject({ seatIndex: 1, leaving: false });
    t.play('a', 'STAND');
    t.play('b', 'STAND'); // back in time to play the hand
    t.nextRound();
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'a', seatIndex: 4 });
    expect(t.state.seats.find((s) => s.playerId === 'a')).toMatchObject({
      seatIndex: 4,
      stack: 900,
      roundsPlayed: 1,
    });
    expect(t.state.departed).toEqual([]);
    // Back with what their account holds now: chips won elsewhere count as brought, not won here.
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'a' });
    t.system({ type: 'SYS_PLAYER_JOINED', playerId: 'a', seatIndex: 4, wallet: 1500 });
    expect(t.state.seats.find((s) => s.playerId === 'a')).toMatchObject({ stack: 1500, buyIn: 1600 });
    expect(blackjack.getPlayerView(t.state, 'a').seats.find((s) => s.playerId === 'a')?.net).toBe(-100);
  });

  it('leaving during insurance declines it', () => {
    const t = twoHands(['10S', '9S'], ['10H', '8H'], ['AD', '7C']);
    t.bet({ a: 100, b: 100 });
    t.apply({ type: 'INSURANCE', take: false }, 'a');
    t.system({ type: 'SYS_PLAYER_LEFT', playerId: 'b' });
    expect(t.state.phase).toBe('PEEK');
  });

  it('the host ends at once between rounds, or once the round in play is settled', () => {
    const now = new Table(blackjack, AB);
    now.apply({ type: 'PLACE_BET', amount: 40 }, 'a');
    const ended = now.system({ type: 'SYS_END_SESSION' });
    expect(eventTypes(ended.events)).toEqual(['SessionEnding', 'BetCleared', 'SessionFinished']);
    expect(now.stack('a')).toBe(1000);
    expect(blackjack.getValidActions(now.state, 'a')).toEqual([]);
    expect(blackjack.getPendingPlayers(now.state)).toEqual([]);
    expect(blackjack.getResult(now.state).standings).toEqual([]); // nobody played a round
    expectError(
      now.try({ type: 'SYS_PLAYER_JOINED', playerId: 'z', seatIndex: 3 }, SYSTEM_PLAYER_ID),
      'SESSION_OVER',
    );

    const later = oneHand(['10S', '9S'], ['7C', '10C']);
    later.bet({ a: 100 });
    expect(later.system({ type: 'SYS_END_SESSION' }).events).toEqual([
      { type: 'SessionEnding', afterRound: true },
    ]);
    expectError(later.try({ type: 'SYS_END_SESSION' }, SYSTEM_PLAYER_ID), 'SESSION_ENDING');
    later.play('a', 'STAND');
    const finished = later.system({ type: 'SYS_NEXT_ROUND' });
    expect(eventTypes(finished.events)).toEqual(['SessionFinished']);
    expect(blackjack.getResult(later.state)).toEqual({
      standings: [{ playerId: 'a', outcome: 'PLACED', position: 1, score: 100 }],
      summary: { rounds: 1 },
    });
  });

  it('ranks everyone who played, departed players included, rebuys discounted, ties shared', () => {
    const t = new Table(blackjack, ['a', 'b', 'c', 'd']);
    const seat = (id: string) => t.state.seats.find((s) => s.playerId === id)!;
    Object.assign(seat('a'), { stack: 1500, roundsPlayed: 3 });
    Object.assign(seat('b'), { stack: 900, rebuys: 1, roundsPlayed: 3 });
    Object.assign(seat('c'), { stack: 1500, roundsPlayed: 2 });
    t.state.departed.push({ playerId: 'e', stack: 200, buyIn: 1000, rebuys: 0, roundsPlayed: 1 });
    expect(blackjack.getResult(t.state).standings).toEqual([
      { playerId: 'a', outcome: 'PLACED', position: 1, score: 500 },
      { playerId: 'c', outcome: 'PLACED', position: 1, score: 500 },
      { playerId: 'b', outcome: 'PLACED', position: 3, score: -600 }, // 900 − 1000 brought − 500 rebought
      { playerId: 'e', outcome: 'PLACED', position: 4, score: -800 },
    ]);
  });
});

describe('module', () => {
  it('applies the defaults of the closed open points (11)', () => {
    expect(blackjackConfigSchema.parse({})).toEqual({
      decks: 6,
      penetration: 0.75,
      minBet: 10,
      maxBet: 500,
      dealerHitsSoft17: false,
      holeCard: 'PEEK',
      blackjackPayout: '3:2',
      doubleAfterSplit: true,
      maxHands: 4,
      splitTensByValue: true,
      surrender: true,
      insurance: true,
      hintsEnabled: false,
      betTimeoutMs: 15_000,
      decisionTimeoutMs: 20_000,
      insuranceTimeoutMs: 10_000,
    });
    expect(blackjackConfigSchema.safeParse({ blackjackPayout: '6:5' }).success).toBe(false);
    expect(blackjackConfigSchema.safeParse({ minBet: 15 }).success).toBe(false);
    expect(blackjackConfigSchema.safeParse({ minBet: 510 }).success).toBe(false);
    expect(blackjack).toMatchObject({ minPlayers: 1, maxPlayers: 7, lifecycle: 'SESSION' });
  });

  it('accepts client actions only', () => {
    expect(blackjackActionSchema.safeParse({ type: 'PLACE_BET', amount: 50 }).success).toBe(true);
    expect(blackjackActionSchema.safeParse({ type: 'SIT_OUT', value: true }).success).toBe(true);
    expect(blackjackActionSchema.safeParse({ type: 'SYS_PEEK' }).success).toBe(false);
    expect(
      blackjackActionSchema.safeParse({ type: 'SYS_PLAYER_JOINED', playerId: 'x', seatIndex: 0 }).success,
    ).toBe(false);
    expect(blackjackActionSchema.safeParse({ type: 'HIT', extra: 1 }).success).toBe(false);
  });

  it('flags settings that cannot work together', () => {
    expect(validateTable(config())).toBeNull();
    expect(validateTable(config({ minBet: 100, maxBet: 50 }))?.code).toBe('TABLE_LIMITS');
    expect(validateTable(config({ hintsEnabled: true, decks: 2 }))?.code).toBe('HINTS_UNSUPPORTED');
    expect(blackjack.validateTable?.(config({ hintsEnabled: true }), 7)).toBeNull();
  });

  it('spectators see the table like anyone else, without hints', () => {
    const t = new Table(blackjack, AB, { hintsEnabled: true });
    const view = blackjack.getSpectatorView(t.state);
    expect(view.selfId).toBeNull();
    expect(view.hint).toBeNull();
    expect(view.shoe).toEqual({ remaining: 312, total: 312, cutAt: 78, cutCardReached: false });
  });
});
