'use client';

import {
  createMexicanaModule,
  mexicanaConfigSchema,
  type MexicanaAction,
  type MexicanaState,
} from '@cardroom/mexicana';
import { createSeededRng } from '@cardroom/game-core';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { sceneFromView } from '@/games/mexicana/scene';
import { MexicanaTableView, useMexicanaSizes } from '@/games/mexicana/table';
import { useTableLayout } from '@/games/shared/use-media';

const ME = 'tu';
const NAMES = [ME, 'ana', 'bruno', 'carla', 'duarte', 'eva'];
const engine = createMexicanaModule();

const current = (s: MexicanaState) => (s.phase === 'PLAYING' ? s.turnOrder[s.currentIndex] : undefined);
const mine = (s: MexicanaState) => s.players[ME];

interface Scenario {
  label: string;
  players: number;
  /** Plays the match (simple bots: the smallest legal play, else pick up) until this holds. */
  until: (state: MexicanaState) => boolean;
}

const SCENARIOS: Scenario[] = [
  { label: 'Escolher visíveis', players: 4, until: (s) => s.phase === 'CHOOSING' },
  {
    label: 'A tua vez',
    players: 4,
    until: (s) => current(s) === ME && (mine(s)?.hand.length ?? 0) >= 4,
  },
  {
    label: 'Várias iguais',
    players: 3,
    until: (s) =>
      current(s) === ME &&
      engine.getValidActions(s, ME).some((a) => a.type === 'PLAY_CARDS' && a.cardIds.length >= 2),
  },
  {
    label: 'Visíveis',
    players: 3,
    until: (s) => current(s) === ME && mine(s)?.hand.length === 0 && mine(s)?.faceUp.some(Boolean) === true,
  },
  {
    label: 'Às cegas',
    players: 3,
    until: (s) =>
      current(s) === ME && mine(s)?.hand.length === 0 && mine(s)?.faceUp.every((c) => c === null) === true,
  },
  {
    label: '6 jogadores',
    players: 6,
    until: (s) => current(s) === ME && (mine(s)?.hand.length ?? 0) >= 3,
  },
];

function build(scenario: Scenario): MexicanaState {
  const players = NAMES.slice(0, scenario.players);
  let state = engine.setup(players, mexicanaConfigSchema.parse({}), createSeededRng(`dev-${scenario.label}`));
  for (let guard = 0; guard < 3000 && !scenario.until(state); guard++) {
    const actor =
      state.phase === 'CHOOSING'
        ? players.find((id) => engine.getValidActions(state, id).length > 0)
        : current(state);
    if (!actor) break;
    const actions = engine.getValidActions(state, actor);
    const action: MexicanaAction | undefined =
      actions.find((a) => a.type === 'CHOOSE_FACE_UP') ??
      actions.find((a) => a.type === 'PLAY_CARDS' || a.type === 'PLAY_FACE_DOWN') ??
      actions[0];
    if (!action) break;
    const result = engine.applyAction(state, action, actor);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/mexicana`: fixed Mexicana tables (from the real engine) for visual approval without playing. */
export function MexicanaPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake turn timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const layout = useTableLayout();
  const sizes = useMexicanaSizes(layout, scenario.players - 1);

  const { scene, validActions, timer, players } = useMemo(() => {
    const state = build(scenario);
    const pending = engine.getPendingPlayers(state);
    const roomPlayers: RoomPlayer[] = state.turnOrder.map((id, seat) => ({
      id,
      username: id,
      avatarUrl: null,
      seat,
      ready: true,
      connected: id !== 'duarte',
      away: false,
      guest: false,
      voice: false,
    }));
    return {
      scene: sceneFromView(`dev-${scenario.label}`, 1, engine.getPlayerView(state, ME)),
      validActions: engine.getValidActions(state, ME),
      timer:
        pending.length > 0
          ? { remainingMs: 21_000, totalMs: 30_000, playerIds: pending, receivedAt: shownAt }
          : null,
      players: new Map(roomPlayers.map((p) => [p.id, p])),
    };
  }, [scenario, shownAt]);

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
              <MexicanaTableView
                key={scenario.label}
                scene={scene}
                selfId={ME}
                players={players}
                sizes={sizes}
                layout={layout}
                validActions={validActions}
                timer={timer}
                animating={false}
                ticker={null}
                skipped={{}}
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
