import { blackjack } from '@cardroom/blackjack';
import { fodinha } from '@cardroom/fodinha';
import { GameRegistry } from '@cardroom/game-core';
import { highCard } from '@cardroom/high-card';
import { mexicana } from '@cardroom/mexicana';

/**
 * Composition root for games: the only place that knows concrete modules.
 * Adding a game = adding a package and one `register` call.
 */
export function createGameRegistry(): GameRegistry {
  return new GameRegistry().register(mexicana).register(fodinha).register(blackjack).register(highCard);
}
