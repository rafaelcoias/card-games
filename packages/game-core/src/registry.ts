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
    if (module.lifecycle === 'SESSION' && !module.getSeatedPlayers) {
      throw new Error(`Session game "${module.id}" must implement getSeatedPlayers`);
    }
    if (module.seating) assertSeating(module);
    if (module.disconnectPolicy === 'PAUSE' && module.lifecycle !== 'MATCH') {
      // A session table goes on while people come and go: nothing to wait for.
      throw new Error(`Only MATCH games can pause for a missing player ("${module.id}")`);
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

/** Every named seat is taken at the start, so the seats are exactly the table's size; teams use them all once. */
function assertSeating(module: AnyGameModule): void {
  const { seats, teams } = module.seating as NonNullable<AnyGameModule['seating']>;
  if (new Set(seats).size !== seats.length || seats.length === 0) {
    throw new Error(`Game "${module.id}" declares duplicate or no seats`);
  }
  if (module.minPlayers !== seats.length || module.maxPlayers !== seats.length) {
    throw new Error(`Game "${module.id}" seats exactly ${seats.length}: set min and max players to it`);
  }
  if (teams) {
    const inTeams = Object.values(teams).flat();
    if (inTeams.length !== seats.length || !seats.every((seat) => inTeams.includes(seat))) {
      throw new Error(`Game "${module.id}": every seat belongs to exactly one team`);
    }
  }
}
