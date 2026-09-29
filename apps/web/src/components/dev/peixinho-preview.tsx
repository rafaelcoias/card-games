'use client';

import { SYSTEM_PLAYER_ID, createSeededRng, pickOne } from '@cardroom/game-core';
import {
  createPeixinhoModule,
  peixinhoConfigSchema,
  type PeixinhoAction,
  type PeixinhoConfig,
  type PeixinhoState,
} from '@cardroom/peixinho';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { answerLine, rankPlural } from '@/games/peixinho/copy';
import { sceneFromView, type Scene } from '@/games/peixinho/scene';
import type { Bubble } from '@/games/peixinho/seat';
import { PeixinhoTableView, usePeixinhoSizes } from '@/games/peixinho/table';
import { useTableLayout } from '@/games/shared/use-media';

const NAMES = ['tu', 'ana', 'bruno', 'carla', 'duarte', 'eva'];
const ME = 'tu';

interface Scenario {
  label: string;
  players: number;
  config?: Partial<PeixinhoConfig>;
  /** Plays the match (with bots) until this holds. */
  until: (state: PeixinhoState) => boolean;
  /** Touches applied to the scene: what an animation would show at that instant. */
  dress?: (
    scene: Scene,
    state: PeixinhoState,
  ) => { scene?: Scene; bubbles?: Record<string, Bubble>; ticker?: string };
}

const current = (s: PeixinhoState) => (s.phase === 'PLAYING' ? s.seats[s.currentIndex] : undefined);
const bubble = (text: string, tone: Bubble['tone']): Bubble => ({ key: 1, text, tone });

const SCENARIOS: Scenario[] = [
  {
    label: 'Pedir',
    players: 4,
    until: (s) => current(s) === ME && !s.awaitingFish && s.askLog.length >= 4,
  },
  {
    label: '"Tenho! Toma 2."',
    players: 4,
    until: (s) => current(s) === ME && !s.awaitingFish && s.askLog.length >= 2,
    dress: () => ({
      bubbles: { ana: bubble(answerLine(2), 'yes'), [ME]: bubble('Ana, tens Setes?', 'ask') },
    }),
  },
  {
    label: '"Vai à pesca!"',
    players: 4,
    until: (s) => s.awaitingFish?.askerId === ME,
    dress: (_, state) => ({
      bubbles: { [state.awaitingFish?.targetId ?? 'ana']: bubble(answerLine(null), 'no') },
      ticker: 'Vai à pesca! Toca numa carta do lago',
    }),
  },
  {
    label: 'Pescou o pedido',
    players: 3,
    until: (s) => s.lastFish?.caughtAsked === true && s.lastFish.playerId !== ME,
    dress: (_, state) => ({ ticker: `${state.lastFish?.playerId} pescou o que pediu! Joga outra vez.` }),
  },
  {
    label: 'Peixinho',
    players: 4,
    until: (s) => current(s) === ME && !s.awaitingFish && s.askLog.length >= 6,
    dress: (scene) => ({
      scene: {
        ...scene,
        showcase: {
          key: 1,
          playerId: 'bruno',
          rank: '7',
          cards: ['7S', '7H', '7C', '7D'].map((id) => ({
            card: { id, rank: '7' as const, suit: id.slice(-1) as 'S' | 'H' | 'C' | 'D' },
          })),
        },
      },
      ticker: `Peixinho de ${rankPlural('7')}! Joga outra vez.`,
    }),
  },
  {
    label: 'Reposição',
    players: 3,
    until: (s) => s.askLog.length > 3 && s.seats.some((id) => (s.hands[id]?.length ?? 0) === 4 && id !== ME),
    dress: () => ({ ticker: 'ana sem cartas — vai buscar 4' }),
  },
  {
    label: 'Fora de jogo',
    players: 4,
    until: (s) => s.pond.length === 0 && s.seats.some((id) => (s.hands[id]?.length ?? 0) === 0),
  },
  {
    label: 'Fim',
    players: 4,
    until: (s) => s.phase === 'FINISHED',
  },
  {
    label: '6 jogadores',
    players: 6,
    config: { tableMemory: 'FULL' },
    until: (s) => current(s) === ME && !s.awaitingFish && s.askLog.length >= 8,
  },
  {
    label: '2 jogadores · sem memória',
    players: 2,
    config: { tableMemory: 'NONE' },
    until: (s) => current(s) === ME && !s.awaitingFish && s.askLog.length >= 3,
  },
];

function build(scenario: Scenario): PeixinhoState {
  const engine = createPeixinhoModule();
  const players = NAMES.slice(0, scenario.players);
  const config = peixinhoConfigSchema.parse(scenario.config ?? {});
  const rng = createSeededRng(`dev-${scenario.label}`);
  let state = engine.setup(players, config, rng);
  for (let guard = 0; guard < 2000 && !scenario.until(state) && state.phase === 'PLAYING'; guard++) {
    const actor = current(state) as string;
    const valid = engine.getValidActions(state, actor);
    const action: PeixinhoAction = valid.length > 0 ? pickOne(valid, rng) : { type: 'SYS_TIMEOUT' };
    const result = engine.applyAction(state, action, valid.length > 0 ? actor : SYSTEM_PLAYER_ID);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/peixinho`: fixed Peixinho tables (from the real engine) for visual approval without playing. */
export function PeixinhoPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake turn timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const layout = useTableLayout();
  const sizes = usePeixinhoSizes(scenario.players);
  const engine = useMemo(() => createPeixinhoModule(), []);

  const { scene, validActions, timer, players, bubbles, ticker } = useMemo(() => {
    const state = build(scenario);
    const view = engine.getPlayerView(state, ME);
    const pending = engine.getPendingPlayers(state);
    const roomPlayers: RoomPlayer[] = state.seats.map((id, seat) => ({
      id,
      username: id,
      avatarUrl: null,
      seat,
      ready: true,
      connected: id !== 'eva',
      away: false,
      guest: false,
    }));
    const base = sceneFromView(`dev-${scenario.label}`, 1, view);
    const dressed = scenario.dress?.(base, state) ?? {};
    return {
      scene: dressed.scene ?? base,
      validActions: engine.getValidActions(state, ME),
      timer:
        pending.length > 0
          ? {
              remainingMs: state.awaitingFish ? 4_000 : 21_000,
              totalMs: engine.getTimeoutMs(state) ?? 30_000,
              playerIds: pending,
              receivedAt: shownAt,
            }
          : null,
      players: new Map(roomPlayers.map((p) => [p.id, p])),
      bubbles: dressed.bubbles ?? {},
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
              <PeixinhoTableView
                key={scenario.label}
                scene={scene}
                selfId={ME}
                players={players}
                sizes={sizes}
                memoryDocked={layout === 'desktop'}
                validActions={validActions}
                timer={timer}
                animating={false}
                ticker={ticker}
                bubbles={bubbles}
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
