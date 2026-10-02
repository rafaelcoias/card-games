import { blackjack } from '@cardroom/blackjack';
import { desconfia } from '@cardroom/desconfia';
import { fodinha } from '@cardroom/fodinha';
import { GameRegistry } from '@cardroom/game-core';
// High Card is retired: Peixinho took its place. Uncomment (here and in the web registry) to bring it back.
// import { highCard } from '@cardroom/high-card';
import { mexicana } from '@cardroom/mexicana';
import { olho } from '@cardroom/olho';
import { peixinho } from '@cardroom/peixinho';

/**
 * Composition root for games: the only place that knows concrete modules.
 * Adding a game = adding a package and one `register` call.
 */
export function createGameRegistry(): GameRegistry {
  const registry = new GameRegistry().register(mexicana).register(fodinha).register(blackjack);
  registry.register(peixinho).register(desconfia).register(olho);
  // registry.register(highCard);
  return registry;
}
