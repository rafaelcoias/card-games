'use client';

import {
  SYSTEM_PLAYER_ID,
  createSeededRng,
  createShoe,
  shuffle,
  type CardInstance,
} from '@cardroom/game-core';
import {
  GRID_SIZE,
  createGringoModule,
  gringoConfigSchema,
  scheduleFor,
  type Dealer,
  type GringoAction,
  type GringoClientAction,
  type GringoConfig,
  type GringoState,
} from '@cardroom/gringo';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import type { Bubble } from '@/games/desconfia/seat';
import { sceneFromView, type Scene } from '@/games/gringo/scene';
import type { Stamp } from '@/games/gringo/seat';
import { GringoTableView, peekCaption, swapCaption, useGringoSizes } from '@/games/gringo/table';

const NAMES = ['tu', 'ana', 'bruno', 'carla', 'duarte', 'eva', 'filipa', 'gil', 'helena', 'ivo'];
const ME = 'tu';
const names = (id: string) => (id === ME ? 'Tu' : id);

/** Plays the scenario's moves on a real engine; `deckTop` comes off the deck first. */
interface Driver {
  state: GringoState;
  act(action: GringoAction, by?: string): void;
  /** Lets whoever is on turn draw and discard, until it is the viewer's turn. */
  untilMine(): void;
}

interface Scenario {
  label: string;
  players: number;
  config?: Partial<GringoConfig>;
  deckTop?: string[];
  /** Straight after the deal (no move at all). */
  play?: (t: Driver) => void;
  dress?: (
    scene: Scene,
    state: GringoState,
  ) => {
    scene?: Scene;
    bubbles?: Record<string, Bubble>;
    stamps?: Record<string, Stamp>;
    ticker?: string;
  };
}

const card = (id: string): CardInstance => {
  const shoe = createShoe({ decks: 1, jokers: 2 });
  return shoe.find((c) => c.id === id) as CardInstance;
};

/** The shoe shuffled, `top` set aside for the top of the deck. */
const stackedDealer =
  (top: readonly string[]): Dealer =>
  ({ seats, decks, rng }) => {
    const wanted = top.map(card);
    const uids = new Set(wanted.map((c) => c.uid));
    const rest = shuffle(
      createShoe({ decks, jokers: 2 }).filter((c) => !uids.has(c.uid)),
      rng,
    );
    const grids = Object.fromEntries(seats.map((id) => [id, rest.splice(0, GRID_SIZE)]));
    return { grids, deck: [...wanted, ...rest] };
  };

/** Draw, discard, nobody snaps. */
function plainTurn(t: Driver): void {
  const by = t.state.seats[t.state.currentIndex] as string;
  t.act({ type: 'DRAW' }, by);
  t.act({ type: 'DISCARD_DRAWN', usePower: false }, by);
  t.act({ type: 'SYS_SNAP_WINDOW_CLOSED', discardId: t.state.snap?.discardId ?? 0 });
}

function build(scenario: Scenario): GringoState {
  const engine = createGringoModule(stackedDealer(scenario.deckTop ?? []));
  const players = NAMES.slice(0, scenario.players);
  const config = gringoConfigSchema.parse(scenario.config ?? {});
  const setup = engine.setup(players, config, createSeededRng(`dev-${scenario.label}`));
  const driver: Driver = {
    state: { ...setup, currentIndex: players.indexOf(ME) },
    act(action, by = SYSTEM_PLAYER_ID) {
      const result = engine.applyAction(this.state, action, by);
      if (!result.ok) throw new Error(`${scenario.label}: ${action.type} → ${result.error.code}`);
      this.state = result.state;
    },
    untilMine() {
      for (let guard = 0; guard < 50 && this.state.seats[this.state.currentIndex] !== ME; guard++) {
        plainTurn(this);
      }
    },
  };
  scenario.play?.(driver);
  return driver.state;
}

const started = (t: Driver) => t.act({ type: 'SYS_INITIAL_PEEK_END' });
const drawFor = (t: Driver) => {
  started(t);
  t.act({ type: 'DRAW' }, ME);
};
/** The viewer draws the card on top and discards it with its power. */
const powerOn = (t: Driver) => {
  drawFor(t);
  t.act({ type: 'DISCARD_DRAWN', usePower: true }, ME);
};
const firstFilled = (state: GringoState, owner: string) =>
  state.grids[owner]?.find((s) => s.card)?.index ?? 0;

const SCENARIOS: Scenario[] = [
  { label: 'Espreitar inicial', players: 4 },
  { label: 'A tua vez', players: 4, config: { gringoEnabled: true, gringoMinTurns: 3 }, play: started },
  { label: 'Carta tirada', players: 4, deckTop: ['3H'], play: drawFor },
  { label: 'Carta com poder', players: 4, deckTop: ['10S'], play: drawFor },
  { label: 'Espreitar outro', players: 4, deckTop: ['10S'], play: powerOn },
  {
    label: 'A espreitar',
    players: 4,
    deckTop: ['QH'],
    play: (t) => {
      powerOn(t);
      t.act({ type: 'POWER_PEEK', owner: ME, index: 1 }, ME);
    },
    dress: () => ({ ticker: peekCaption(ME, ME, 1, ME, names) }),
  },
  { label: 'Trocar às cegas', players: 4, deckTop: ['JD'], play: powerOn },
  {
    label: 'Rei: trocar?',
    players: 4,
    deckTop: ['KC'],
    play: (t) => {
      powerOn(t);
      t.act({ type: 'POWER_PEEK', owner: 'ana', index: 2 }, ME);
    },
  },
  {
    label: 'Espreitam-te',
    players: 4,
    deckTop: ['5D', '10C', '5S', '10D'],
    play: (t) => {
      started(t);
      plainTurn(t);
      const by = t.state.seats[t.state.currentIndex] as string;
      t.act({ type: 'DRAW' }, by);
      t.act({ type: 'DISCARD_DRAWN', usePower: by !== ME }, by);
      if (t.state.power) t.act({ type: 'POWER_PEEK', owner: ME, index: 3 }, by);
    },
    dress: (_, state) => {
      const by = state.seats[state.currentIndex] as string;
      return { ticker: peekCaption(by, ME, 3, ME, names) };
    },
  },
  {
    label: 'Janela de bater',
    players: 4,
    deckTop: ['7H'],
    play: (t) => {
      drawFor(t);
      t.act({ type: 'DISCARD_DRAWN', usePower: false }, ME);
    },
  },
  {
    label: 'Bateu!',
    players: 4,
    deckTop: ['8H'],
    play: (t) => {
      drawFor(t);
      t.act({ type: 'DISCARD_DRAWN', usePower: false }, ME);
      // Whoever holds an 8 snaps it (else Ana tries one blindly).
      const holder =
        t.state.seats.find((id) => t.state.grids[id]?.some((s) => s.card?.rank === '8')) ?? 'ana';
      const slot =
        t.state.grids[holder]?.find((s) => s.card?.rank === '8')?.index ?? firstFilled(t.state, holder);
      t.act({ type: 'SNAP', discardId: t.state.snap?.discardId ?? 0, index: slot }, holder);
    },
    dress: (_, state) => {
      const result = state.snap?.result;
      return result
        ? { stamps: { [result.playerId]: { key: 1, hit: result.hit, index: result.index } } }
        : {};
    },
  },
  {
    label: 'Errou!',
    players: 4,
    deckTop: ['9H'],
    play: (t) => {
      drawFor(t);
      t.act({ type: 'DISCARD_DRAWN', usePower: false }, ME);
      const slot = t.state.grids[ME]?.find((s) => s.card && s.card.rank !== '9')?.index ?? 0;
      t.act({ type: 'SNAP', discardId: t.state.snap?.discardId ?? 0, index: slot }, ME);
    },
    dress: (_, state) => {
      const result = state.snap?.result;
      return result
        ? {
            stamps: { [result.playerId]: { key: 1, hit: result.hit, index: result.index } },
            ticker: 'Erraste — levas mais uma carta',
          }
        : {};
    },
  },
  {
    label: 'Troca às cegas',
    players: 4,
    deckTop: ['JC'],
    play: (t) => {
      powerOn(t);
      t.act({ type: 'POWER_BLIND_SWAP', myIndex: 0, owner: 'bruno', theirIndex: 1 }, ME);
    },
    dress: () => ({ ticker: swapCaption(ME, 0, 'bruno', 1, ME, names) }),
  },
  {
    label: 'Gringo',
    players: 4,
    config: { gringoEnabled: true, gringoMinTurns: 1 },
    play: (t) => {
      started(t);
      for (let i = 0; i < 4; i++) plainTurn(t);
      t.untilMine();
      t.act({ type: 'CALL_GRINGO' }, ME);
      plainTurn(t);
    },
  },
  {
    label: 'Revelação final',
    players: 4,
    config: { gringoEnabled: true, gringoMinTurns: 1 },
    play: (t) => {
      started(t);
      for (let i = 0; i < 4; i++) plainTurn(t);
      t.untilMine();
      t.act({ type: 'CALL_GRINGO' }, ME);
      for (let i = 0; i < 4 && t.state.phase !== 'FINISHED'; i++) plainTurn(t);
    },
  },
  {
    label: '10 jogadores',
    players: 10,
    play: (t) => {
      started(t);
      for (let i = 0; i < 9; i++) plainTurn(t);
      t.untilMine();
    },
  },
];

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/gringo`: fixed Gringo tables (from the real engine) for visual approval without playing. */
export function GringoPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const sizes = useGringoSizes(scenario.players);
  const engine = useMemo(() => createGringoModule(), []);

  const { scene, validActions, timer, players, bubbles, stamps, ticker } = useMemo(() => {
    const state = build(scenario);
    const view = engine.getPlayerView(state, ME);
    const pending = engine.getPendingPlayers(state);
    const ms = engine.getTimeoutMs(state) ?? scheduleFor(state)[0]?.delayMs ?? null;
    const roomPlayers: RoomPlayer[] = state.seats.map((id, seat) => ({
      id,
      username: id,
      avatarUrl: null,
      seat,
      ready: true,
      connected: id !== 'eva',
      away: false,
      guest: false,
      voice: false,
    }));
    const base = sceneFromView(`dev-${scenario.label}`, 1, view);
    const dressed = scenario.dress?.(base, state) ?? {};
    return {
      scene: dressed.scene ?? base,
      validActions: engine.getValidActions(state, ME) as GringoClientAction[],
      timer:
        pending.length > 0 && ms !== null
          ? { remainingMs: ms * 0.7, totalMs: ms, playerIds: pending, receivedAt: shownAt }
          : null,
      players: new Map(roomPlayers.map((p) => [p.id, p])),
      bubbles: dressed.bubbles ?? {},
      stamps: dressed.stamps ?? {},
      ticker: dressed.ticker ?? null,
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
              <GringoTableView
                key={scenario.label}
                scene={scene}
                selfId={ME}
                players={players}
                sizes={sizes}
                validActions={validActions}
                timer={timer}
                animating={false}
                ticker={ticker}
                bubbles={bubbles}
                stamps={stamps}
                confetti={null}
                nameOf={names}
                sendAction={noop}
              />
            </LayoutGroup>
          </FlightLayer>
        </div>
      </div>
    </AnchorProvider>
  );
}
