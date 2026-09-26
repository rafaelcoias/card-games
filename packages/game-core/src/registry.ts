import type { AnyGameModule, DomainEvent, GameModule } from './game-module';

export interface GameSummary {
  readonly id: string;
  readonly name: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
}

/** Holds game modules by id. The platform core only ever talks to this. */
export class GameRegistry {
  private readonly modules = new Map<string, AnyGameModule>();

  register<S, A, C, V, E extends DomainEvent>(module: GameModule<S, A, C, V, E>): this {
    if (this.modules.has(module.id)) {
      throw new Error(`Game "${module.id}" is already registered`);
    }
    this.modules.set(module.id, module);
    return this;
  }

  get(id: string): AnyGameModule | undefined {
    return this.modules.get(id);
  }

  require(id: string): AnyGameModule {
    const module = this.modules.get(id);
    if (!module) throw new Error(`Unknown game "${id}"`);
    return module;
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }

  list(): GameSummary[] {
    return [...this.modules.values()].map(({ id, name, minPlayers, maxPlayers }) => ({
      id,
      name,
      minPlayers,
      maxPlayers,
    }));
  }
}
