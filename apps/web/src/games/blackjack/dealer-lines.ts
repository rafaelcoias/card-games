import type { BlackjackEvent } from '@cardroom/blackjack';

/**
 * What the dealer says (05 §3), as data: the engine only emits events and the
 * table picks a line. Short, in PT-PT, never mocking and never urging anyone to
 * bet more. `{nome}` is the player concerned.
 */
export const DEALER_LINES = {
  bettingOpened: ['Façam as vossas apostas.', 'Mesa aberta.', 'Apostas, por favor.'],
  bettingClosed: ['Apostas fechadas.', 'Não vai mais.'],
  playerBlackjack: ['Blackjack! Parabéns, {nome}.', 'Blackjack para {nome}.'],
  dealerBlackjack: ['Blackjack da casa. Lamento.', 'A casa tem blackjack.'],
  dealerBust: ['A casa rebentou. Pago a todos.', 'Rebentei. Pago a quem ficou.'],
  playerBust: ['Passou, {nome}.', 'Passou dos 21, {nome}.'],
  insurance: ['Seguro, alguém?', 'Ás à vista. Seguro?'],
  shuffle: ['Carta de corte. Vou baralhar.', 'Fim do sapato. A baralhar.'],
  lastRound: ['Última ronda deste sapato.'],
} as const;

type Topic = keyof typeof DEALER_LINES;

type Remark = { topic: Topic; chance: number; seatIndex?: number } | null;

/** Which topic an event raises, how likely the dealer is to say it, and about whom. */
const REMARKS: { [T in BlackjackEvent['type']]?: (event: Extract<BlackjackEvent, { type: T }>) => Remark } = {
  BettingOpened: () => ({ topic: 'bettingOpened', chance: 0.6 }),
  BettingClosed: () => ({ topic: 'bettingClosed', chance: 0.4 }),
  InsuranceOffered: () => ({ topic: 'insurance', chance: 1 }),
  DealerPeeked: (event) => (event.blackjack ? { topic: 'dealerBlackjack', chance: 1 } : null),
  DealerBusted: () => ({ topic: 'dealerBust', chance: 1 }),
  HandBusted: (event) => ({ topic: 'playerBust', chance: 0.5, seatIndex: event.seatIndex }),
  HandSettled: (event) =>
    event.outcome === 'BLACKJACK'
      ? { topic: 'playerBlackjack', chance: 1, seatIndex: event.seatIndex }
      : null,
  CutCardReached: () => ({ topic: 'lastRound', chance: 1 }),
  ShuffleStarted: () => ({ topic: 'shuffle', chance: 1 }),
};

function topicOf(event: BlackjackEvent): Remark {
  const remark = REMARKS[event.type] as ((event: BlackjackEvent) => Remark) | undefined;
  return remark ? remark(event) : null;
}

/** Stable value in [0, 1) from a string, so every client picks the same line. */
function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/**
 * The dealer's line for an event, or `null` when they stay quiet. Chosen from
 * `key` (match, sequence number, event index) so the whole table hears the same
 * words, and never the same line twice in a row.
 */
export function dealerLine(
  event: BlackjackEvent,
  key: string,
  nameOfSeat: (seatIndex: number) => string,
  previous: string | null,
): string | null {
  const said = topicOf(event);
  if (!said || hash(`${key}:say`) >= said.chance) return null;
  const lines: readonly string[] = DEALER_LINES[said.topic];
  let index = Math.floor(hash(key) * lines.length);
  const fill = (line: string) =>
    line.replace('{nome}', said.seatIndex === undefined ? '' : nameOfSeat(said.seatIndex));
  if (lines.length > 1 && fill(lines[index] as string) === previous) index = (index + 1) % lines.length;
  return fill(lines[index] as string);
}
