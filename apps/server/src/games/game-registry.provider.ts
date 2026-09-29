import { blackjack } from '@cardroom/blackjack';
import { fodinha } from '@cardroom/fodinha';
import { GameRegistry } from '@cardroom/game-core';
// High Card is retired: Peixinho took its place. Uncomment (here and in the web registry) to bring it back.
// import { highCard } from '@cardroom/high-card';
import { mexicana } from '@cardroom/mexicana';
import { peixinho } from '@cardroom/peixinho';

/**
 * Composition root for games: the only place that knows concrete modules.
 * Adding a game = adding a package and one `register` call.
 */
export function createGameRegistry(): GameRegistry {
  const registry = new GameRegistry().register(mexicana).register(fodinha).register(blackjack);
  registry.register(peixinho);
  // registry.register(highCard);
  return registry;
}
