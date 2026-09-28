import { createSeededRng, createShoe, shuffle, type CardInstance, type Rng } from '@cardroom/game-core';
import type { BlackjackConfig, BlackjackEvent, BlackjackState } from './types';

/**
 * Orders cards into a shoe. The default shuffles them; tests inject one that
 * stacks the deck. `shoe` counts the shuffles of the session (0 = first shoe).
 */
export type Shuffler = (
  cards: readonly CardInstance[],
  rng: Rng,
  context: { shoe: number },
) => CardInstance[];

export const randomShuffler: Shuffler = (cards, rng) => shuffle(cards, rng);

/**
 * Every shoe is shuffled by a PRNG keyed by the session's secret seed (drawn
 * from the server's DRBG) and the shoe number, so a session replays from its
 * seed and action log while no client can predict the order.
 */
export const shoeRng = (seed: string, shoe: number): Rng => createSeededRng(`${seed}:shoe:${shoe}`);

/** The cut card goes after `penetration` of the shoe: the round that deals past it is the last one. */
export const cutIndexFor = (config: Pick<BlackjackConfig, 'penetration'>, size: number): number =>
  Math.floor(size * config.penetration);

/** A full, freshly shuffled shoe (mutates and returns `draft`). */
export function reshuffle(draft: BlackjackState, shuffler: Shuffler): BlackjackState {
  const cards = createShoe({ decks: draft.config.decks });
  draft.shoe = shuffler(cards, shoeRng(draft.seed, draft.shuffles), { shoe: draft.shuffles });
  draft.shuffles += 1;
  draft.shoeIndex = 0;
  draft.cutIndex = cutIndexFor(draft.config, draft.shoe.length);
  draft.cutCardReached = false;
  draft.discard = [];
  return draft;
}

/**
 * Takes the next card of the shoe (mutates `draft`). Passing the cut card only
 * flags the shoe for a shuffle after the round (rules §2). If the shoe ever runs
 * dry mid-round — deep penetration, a full table and many splits — the discards
 * are shuffled back in as a reserve (09 §7).
 */
export function drawCard(draft: BlackjackState, shuffler: Shuffler, events: BlackjackEvent[]): CardInstance {
  if (draft.shoeIndex >= draft.shoe.length) {
    if (draft.discard.length === 0) throw new Error('The shoe and the discard pile are both empty');
    draft.shoe = shuffler(draft.discard, shoeRng(draft.seed, draft.shuffles), { shoe: draft.shuffles });
    draft.shuffles += 1;
    draft.shoeIndex = 0;
    draft.cutIndex = draft.shoe.length;
    draft.discard = [];
    draft.cutCardReached = true;
    events.push({ type: 'ShoeShuffled', decks: draft.config.decks, reason: 'RESERVE' });
  }
  const card = draft.shoe[draft.shoeIndex] as CardInstance;
  draft.shoeIndex += 1;
  if (!draft.cutCardReached && draft.shoeIndex > draft.cutIndex) {
    draft.cutCardReached = true;
    events.push({ type: 'CutCardReached' });
  }
  return card;
}
