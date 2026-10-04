'use client';

import { SYSTEM_PLAYER_ID, createSeededRng, type PlayerId, type ScheduledAction } from '@cardroom/game-core';
import {
  PLAY_ORDER,
  sueca,
  suecaConfigSchema,
  type Seat,
  type SuecaAction,
  type SuecaClientAction,
  type SuecaState,
} from '@cardroom/sueca';
import type { GamePause, RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { PauseVeil } from '@/components/room/pause-veil';
import { SeatPicker } from '@/components/room/seat-picker';
import { Logo } from '@/components/ui/logo';
import { findGameClient } from '@/games/registry';
import { sceneFromView } from '@/games/sueca/scene';
import { SuecaTableView, useSuecaSizes } from '@/games/sueca/table';

const ME = 'tu';
const SEATS: Record<Seat, PlayerId> = { S: ME, E: 'ana', N: 'bruno', W: 'carla' };
const PLAYERS = PLAY_ORDER.map((seat) => SEATS[seat]);

interface Scenario {
  label: string;
  /** Who deals the first hand. */
  dealer: Seat;
  targetGames?: number;
  /** Plays the match (the clock's card for everyone) until this holds. */
  until: (state: SuecaState) => boolean;
  /** Then, a last move. */
  then?: { action: SuecaAction; by: PlayerId };
  pause?: { playerIds: PlayerId[]; expired: boolean };
  /** The room before the match: choosing seats. */
  lobby?: boolean;
}

const current = (s: SuecaState) => sueca.getCurrentPlayer(s);
const tricks = (s: SuecaState) => s.tricksWon.A + s.tricksWon.B;

const SCENARIOS: Scenario[] = [
  { label: 'Sala · lugares', dealer: 'S', until: () => true, lobby: true },
  { label: 'Cortas tu', dealer: 'E', until: (s) => s.phase === 'CUT' },
  { label: 'Outro corta', dealer: 'S', until: (s) => s.phase === 'CUT' },
  {
    label: 'A tua vez',
    dealer: 'N',
    until: (s) => s.phase === 'PLAYING' && tricks(s) === 2 && current(s) === ME && s.trick.plays.length === 2,
  },
  {
    label: 'Trunfo à vista',
    dealer: 'E',
    until: (s) => s.phase === 'PLAYING' && tricks(s) === 1 && current(s) === ME,
  },
  { label: 'Dás tu', dealer: 'S', until: (s) => s.phase === 'PLAYING' && current(s) === ME },
  { label: 'Vaza fechada', dealer: 'W', until: (s) => s.phase === 'TRICK_DONE' && tricks(s) === 4 },
  {
    label: 'Última vaza',
    dealer: 'W',
    until: (s) => s.phase === 'PLAYING' && tricks(s) === 5 && s.trick.plays.length === 1,
    then: { action: { type: 'VIEW_LAST_TRICK' }, by: ME },
  },
  { label: 'Resumo da mão', dealer: 'N', until: (s) => s.phase === 'HAND_SUMMARY' && s.handNumber === 2 },
  {
    label: 'Pausa',
    dealer: 'W',
    until: (s) => s.phase === 'PLAYING' && tricks(s) === 3 && s.trick.plays.length === 2,
    then: { action: { type: 'SYS_PAUSE', playerId: 'bruno' }, by: SYSTEM_PLAYER_ID },
    pause: { playerIds: ['bruno'], expired: false },
  },
  {
    label: 'Pausa · decidir',
    dealer: 'W',
    until: (s) => s.phase === 'PLAYING' && tricks(s) === 3 && s.trick.plays.length === 2,
    then: { action: { type: 'SYS_PAUSE', playerId: 'ana' }, by: SYSTEM_PLAYER_ID },
    pause: { playerIds: ['ana'], expired: true },
  },
  { label: 'Fim', dealer: 'S', targetGames: 2, until: (s) => s.phase === 'FINISHED' },
];

function build(scenario: Scenario): SuecaState {
  const config = suecaConfigSchema.parse({ targetGames: scenario.targetGames ?? 4 });
  let state = sueca.setup(PLAYERS, config, createSeededRng(`dev-${scenario.label}`), { seating: SEATS });
  // The first dealer is drawn at setup; the scenario picks its own.
  state = {
    ...state,
    dealer: scenario.dealer,
    cutter: PLAY_ORDER[(PLAY_ORDER.indexOf(scenario.dealer) + 3) % 4] as Seat,
  };
  let schedule: readonly ScheduledAction[] = [];
  for (let guard = 0; guard < 3000 && !scenario.until(state); guard++) {
    // Whoever is on turn lets the clock play; otherwise the server's next step.
    const actor = current(state);
    const action = actor
      ? sueca.getDefaultAction(state, actor)
      : (schedule[0]?.action as SuecaAction | undefined);
    if (!action) break;
    const result = sueca.applyAction(state, action, actor ?? SYSTEM_PLAYER_ID);
    if (!result.ok) break;
    state = result.state;
    schedule = result.schedule ?? [];
  }
  if (scenario.then) {
    const result = sueca.applyAction(state, scenario.then.action, scenario.then.by);
    if (result.ok) state = result.state;
  }
  return state;
}

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/sueca`: fixed Sueca tables (from the real engine) for visual approval without playing. */
export function SuecaPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake timers count down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const sizes = useSuecaSizes();
  const seating = findGameClient('sueca')?.seating;

  const { scene, validActions, timer, players } = useMemo(() => {
    const state = build(scenario);
    const view = sueca.getPlayerView(state, ME);
    const pending = sueca.getPendingPlayers(state);
    const total = state.phase === 'CUT' ? 15_000 : 30_000;
    const roomPlayers: RoomPlayer[] = PLAYERS.map((id, seat) => ({
      id,
      username: id,
      avatarUrl: null,
      seat,
      ready: id !== 'carla',
      connected: !scenario.pause?.playerIds.includes(id),
      away: false,
      guest: false,
      voice: false,
      waiting: false,
    }));
    return {
      scene: sceneFromView(`dev-${scenario.label}`, 1, view),
      validActions: sueca.getValidActions(state, ME) as SuecaClientAction[],
      timer:
        pending.length > 0 && !scenario.pause
          ? { remainingMs: total * 0.7, totalMs: total, playerIds: pending, receivedAt: shownAt }
          : null,
      players: new Map(roomPlayers.map((p) => [p.id, p])),
    };
  }, [scenario, shownAt]);

  const pause: GamePause | null = scenario.pause
    ? { ...scenario.pause, remainingMs: 105_000, totalMs: 120_000 }
    : null;
  const room = { players: [...players.values()], hostId: ME };

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
          {scenario.lobby && seating ? (
            <div className="app-backdrop h-full overflow-y-auto p-4">
              <div className="panel mx-auto max-w-xl p-5">
                <SeatPicker
                  room={{ ...room, players: room.players.filter((p) => p.id !== 'bruno') }}
                  selfId={ME}
                  seating={seating}
                  isHost
                  onKick={() => undefined}
                  commands={{ takeSeat: noop, swapSeats: noop, shuffleSeats: noop }}
                />
              </div>
            </div>
          ) : (
            <FlightLayer>
              <LayoutGroup>
                <SuecaTableView
                  key={scenario.label}
                  scene={scene}
                  selfId={ME}
                  players={players}
                  sizes={sizes}
                  validActions={validActions}
                  timer={timer}
                  animating={false}
                  nameOf={(id) => (id === ME ? 'Tu' : id)}
                  sendAction={noop}
                />
              </LayoutGroup>
            </FlightLayer>
          )}
          <PauseVeil pause={pause} receivedAt={shownAt} room={room} selfId={ME} onDecide={noop} />
        </div>
      </div>
    </AnchorProvider>
  );
}
