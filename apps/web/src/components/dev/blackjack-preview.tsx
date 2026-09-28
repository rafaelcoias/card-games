'use client';

import {
  blackjackConfigSchema,
  createBlackjackModule,
  randomShuffler,
  type BlackjackAction,
  type BlackjackClientAction,
  type BlackjackConfig,
  type BlackjackModule,
  type BlackjackState,
  type Shuffler,
} from '@cardroom/blackjack';
import { SYSTEM_PLAYER_ID, createSeededRng, type ScheduledAction } from '@cardroom/game-core';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { BlackjackTableView, useBlackjackSizes } from '@/games/blackjack/table';
import { sceneFromView } from '@/games/blackjack/scene';

const ME = 'tu';
const NAMES = ['ana', 'bruno', ME, 'carla', 'duarte', 'eva', 'filipa'];

/** The first shoe deals `order` first (card ids), then the rest shuffled; later shoes are random. */
function stacked(order: readonly string[]): Shuffler {
  return (cards, rng, context) => {
    const rest = randomShuffler(cards, rng, context);
    if (context.shoe > 0) return rest;
    const top = order.map(
      (id) =>
        rest.splice(
          rest.findIndex((c) => c.id === id),
          1,
        )[0]!,
    );
    return [...top, ...rest];
  };
}

/** Plays a table step by step, the way the server would, for a fixed picture. */
class Table {
  state: BlackjackState;
  private schedule: readonly ScheduledAction[] = [];

  constructor(
    readonly engine: BlackjackModule,
    players: string[],
    config: Partial<BlackjackConfig>,
  ) {
    this.state = engine.setup(players, blackjackConfigSchema.parse(config), createSeededRng('dev-blackjack'));
  }

  act(playerId: string, action: BlackjackAction): this {
    const result = this.engine.applyAction(this.state, action, playerId);
    if (!result.ok) throw new Error(`${playerId} ${action.type}: ${result.error.code}`);
    this.state = result.state;
    this.schedule = result.schedule ?? [];
    return this;
  }

  /**
   * The dealer's automatic steps, until `stop` holds, someone owes a decision,
   * the round is settled or nothing is scheduled.
   */
  run(stop: (s: BlackjackState) => boolean = () => false): this {
    for (let guard = 0; guard < 200 && !stop(this.state); guard++) {
      const next = this.schedule[0];
      if (!next || this.state.phase === 'SETTLEMENT') break;
      if (this.engine.getPendingPlayers(this.state).length > 0) break;
      this.act(SYSTEM_PLAYER_ID, next.action as BlackjackAction);
    }
    return this;
  }

  bets(amounts: Record<string, number>): this {
    for (const [playerId, amount] of Object.entries(amounts))
      this.act(playerId, { type: 'PLACE_BET', amount });
    return this.run();
  }

  play(playerId: string, ...decisions: ('HIT' | 'STAND' | 'DOUBLE' | 'SPLIT' | 'SURRENDER')[]): this {
    for (const type of decisions) this.act(playerId, { type });
    return this.run();
  }
}

interface Scenario {
  label: string;
  build: () => BlackjackState;
}

const table = (players: number, order: string[] = [], config: Partial<BlackjackConfig> = {}) =>
  new Table(createBlackjackModule(stacked(order)), NAMES.slice(0, players), config);

const SCENARIOS: Scenario[] = [
  {
    label: 'Apostas',
    build: () => {
      const t = table(4);
      t.act('ana', { type: 'PLACE_BET', amount: 50 }).act('carla', { type: 'PLACE_BET', amount: 120 });
      return t.state;
    },
  },
  {
    label: 'A tua vez · dica',
    build: () =>
      table(4, ['9S', 'KH', '10C', '5D', '10S', '9D', '6C', '6H', '5C', '7H', '4C'], { hintsEnabled: true })
        .bets({ ana: 50, bruno: 100, tu: 100, carla: 30 })
        .play('ana', 'STAND')
        .play('bruno', 'HIT', 'STAND').state,
  },
  {
    label: 'Separação em 3 mãos',
    build: () =>
      table(4, ['KS', '9H', '8S', 'AD', '6D', '9C', '7H', '8H', '3S', '10H', '3D', 'KC', '8D', '2C'])
        .bets({ ana: 50, bruno: 50, tu: 100, carla: 20 })
        .play('ana', 'STAND')
        .play('bruno', 'STAND')
        .play(ME, 'SPLIT', 'DOUBLE', 'SPLIT').state,
  },
  {
    label: 'Seguro',
    build: () =>
      table(4, ['10S', '5H', 'KD', 'AC', 'AS', '9S', '6H', '7C', 'QH', '8D'])
        .bets({ ana: 100, bruno: 50, tu: 100, carla: 40 })
        .act('ana', { type: 'INSURANCE', take: true })
        .act('bruno', { type: 'INSURANCE', take: false }).state,
  },
  {
    label: 'Even money',
    build: () =>
      table(3, ['10S', '5H', 'AD', 'AS', '9S', '6H', 'KC', '8D']).bets({ ana: 100, bruno: 50, tu: 60 }).state,
  },
  {
    label: 'A banca espreita',
    build: () =>
      table(3, ['10S', '5H', '9D', 'KC', '9S', '6H', '9C', '8D'])
        .bets({ ana: 100, bruno: 50, tu: 60 })
        .run((s) => s.phase === 'PEEK').state,
  },
  {
    label: 'A banca joga',
    build: () =>
      table(3, ['10S', '10H', '9D', '6C', '9S', 'KH', '9C', '5D', '2D', '3H'])
        .bets({ ana: 100, bruno: 50, tu: 60 })
        .play('ana', 'STAND')
        .play('bruno', 'STAND')
        .play(ME, 'STAND')
        .run((s) => s.phase === 'DEALER_TURN' && s.dealer.cards.length === 3).state,
  },
  {
    label: 'Liquidação',
    build: () =>
      table(5, ['AS', '10H', '5C', '10D', '10S', '10C', 'KH', '6D', '6S', '7H', '6C', '7D', 'KD', 'QS'])
        .bets({ ana: 100, bruno: 50, tu: 100, carla: 40, duarte: 60 })
        .play('bruno', 'HIT')
        .play(ME, 'DOUBLE')
        .play('carla', 'STAND')
        .play('duarte', 'SURRENDER').state,
  },
  {
    label: 'Baralhar',
    build: () => {
      const t = table(3, [], { decks: 1, penetration: 0.6, insurance: false });
      for (let round = 0; round < 20 && !t.state.cutCardReached; round++) {
        t.bets({ ana: 20, bruno: 20, tu: 20 });
        for (
          let player = t.engine.getCurrentPlayer(t.state);
          player;
          player = t.engine.getCurrentPlayer(t.state)
        ) {
          t.play(player, 'STAND');
        }
        if (!t.state.cutCardReached) t.act(SYSTEM_PLAYER_ID, { type: 'SYS_NEXT_ROUND' });
      }
      return t.act(SYSTEM_PLAYER_ID, { type: 'SYS_NEXT_ROUND' }).state;
    },
  },
  {
    label: 'Mesa cheia',
    build: () => {
      const t = table(7, [], { insurance: false });
      t.bets(Object.fromEntries(NAMES.map((id, i) => [id, 20 + 30 * i])));
      while (t.state.phase === 'PLAYER_TURNS' && t.engine.getCurrentPlayer(t.state) !== ME) {
        t.play(t.engine.getCurrentPlayer(t.state) as string, 'STAND');
      }
      return t.state;
    },
  },
  {
    label: 'Sem fichas',
    build: () => {
      const t = table(3);
      t.state.seats.find((s) => s.playerId === ME)!.stack = 0;
      return t.state;
    },
  },
  {
    label: 'Entrou a meio',
    build: () =>
      table(2, ['10S', '5H', '9D', '6C', '8S'])
        .bets({ ana: 100, bruno: 50 })
        .act(SYSTEM_PLAYER_ID, { type: 'SYS_PLAYER_JOINED', playerId: ME, seatIndex: 4 }).state,
  },
];

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/blackjack`: fixed blackjack tables (from the real engine) for visual approval without playing. */
export function BlackjackPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const sizes = useBlackjackSizes();
  const engine = useMemo(() => createBlackjackModule(), []);

  const { scene, validActions, timer, players } = useMemo(() => {
    const state = scenario.build();
    const view = engine.getPlayerView(state, ME);
    const pending = engine.getPendingPlayers(state);
    const roomPlayers: RoomPlayer[] = state.seats.map((seat) => ({
      id: seat.playerId,
      username: seat.playerId,
      avatarUrl: null,
      seat: seat.seatIndex,
      ready: true,
      connected: seat.playerId !== 'eva',
      away: false,
      guest: false,
    }));
    return {
      scene: sceneFromView(`dev-${scenario.label}`, 1, view),
      validActions: engine.getValidActions(state, ME) as BlackjackClientAction[],
      timer:
        pending.length > 0
          ? { remainingMs: 12_000, totalMs: 20_000, playerIds: pending, receivedAt: shownAt }
          : null,
      players: new Map(roomPlayers.map((p) => [p.id, p])),
    };
  }, [scenario, engine, shownAt]);

  return (
    <AnchorProvider>
      <CardSprite />
      <div className="fixed inset-0 flex flex-col bg-felt-deep">
        <header className="flex shrink-0 items-center gap-3 overflow-x-auto border-b border-black/30 bg-black/40 px-3 py-2">
          <Logo />
          <nav className="flex gap-1" aria-label="Estados">
            {SCENARIOS.map((s, i) => (
              <button
                key={s.label}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setShownAt(performance.now());
                }}
                className={clsx(
                  'whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold',
                  i === index ? 'bg-surface-3 text-ivory' : 'text-muted hover:text-ivory',
                )}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </header>
        <div className="relative min-h-0 flex-1">
          <FlightLayer>
            <LayoutGroup>
              <BlackjackTableView
                key={scenario.label}
                scene={scene}
                selfId={ME}
                players={players}
                sizes={sizes}
                validActions={validActions}
                timer={timer}
                animating={false}
                speech={index === 0 ? { text: 'Façam as vossas apostas.', key: 1 } : null}
                notice={null}
                nameOf={(id) => (id === ME ? 'Tu' : id)}
                sendAction={noop}
              />
            </LayoutGroup>
          </FlightLayer>
        </div>
      </div>
    </AnchorProvider>
  );
}
