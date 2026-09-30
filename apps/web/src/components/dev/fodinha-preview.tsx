'use client';

import {
  createFodinhaModule,
  fodinhaConfigSchema,
  shuffledDealer,
  type Dealer,
  type FodinhaConfig,
  type FodinhaState,
} from '@cardroom/fodinha';
import { SYSTEM_PLAYER_ID, createSeededRng, parseCardId, type Card } from '@cardroom/game-core';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { FodinhaTableView, useFodinhaSizes } from '@/games/fodinha/table';
import { sceneFromView } from '@/games/fodinha/scene';
import { useTableLayout } from '@/games/shared/use-media';

const NAMES = ['tu', 'ana', 'bruno', 'carla', 'duarte', 'eva', 'filipa', 'gil', 'helena', 'ivo'];
const ME = 'tu';

/** Fixed hands for some rounds (the rest are shuffled deterministically). */
function dealer(rounds: Record<number, Record<string, string[]>> = {}): Dealer {
  return (input) => {
    const scripted = rounds[input.round];
    if (!scripted) return shuffledDealer(input);
    return Object.fromEntries(
      input.seats.map((id) => [id, (scripted[id] ?? []).map((cid) => parseCardId(cid) as Card)]),
    );
  };
}

interface Scenario {
  label: string;
  players: number;
  config?: Partial<FodinhaConfig>;
  deal?: Record<number, Record<string, string[]>>;
  /** Plays the match (with simple bots) until this holds. */
  until: (state: FodinhaState) => boolean;
  /** Bid for a player (default: seat index mod 2). */
  bid?: (playerId: string, state: FodinhaState) => number;
}

const current = (s: FodinhaState) =>
  s.phase === 'BIDDING' || s.phase === 'PLAYING' ? s.seats[s.currentIndex] : undefined;

const SCENARIOS: Scenario[] = [
  {
    label: 'Às cegas · aposta',
    players: 5,
    until: (s) => s.phase === 'BIDDING' && current(s) === ME,
  },
  {
    label: 'Às cegas · a jogar',
    players: 5,
    until: (s) => s.phase === 'PLAYING' && s.handSize === 1 && s.trick.plays.length === 2,
  },
  {
    label: 'Aposta · restrição',
    players: 4,
    config: { lastBidderRestriction: true, maxPoints: 15 },
    until: (s) =>
      s.handSize >= 3 &&
      s.phase === 'BIDDING' &&
      current(s) === ME &&
      s.seats.filter((id) => s.bids[id] === null).length === 1,
  },
  {
    label: 'A jogar',
    players: 4,
    until: (s) => s.round === 4 && s.phase === 'PLAYING' && current(s) === ME && s.trick.plays.length > 0,
  },
  {
    label: 'Vaza ganha',
    players: 4,
    until: (s) => s.phase === 'TRICK_RESOLVED' && s.trick.outcome?.winner != null && s.handSize > 1,
  },
  {
    label: 'Empate',
    players: 4,
    deal: { 1: { tu: ['7C'], ana: ['KS'], bruno: ['3H'], carla: ['KD'] } },
    bid: () => 0,
    until: (s) => s.phase === 'TRICK_RESOLVED',
  },
  {
    label: 'Resumo da ronda',
    players: 5,
    until: (s) => s.phase === 'ROUND_SCORED' && s.round === 3,
  },
  {
    label: 'Acumulado',
    players: 4,
    deal: { 1: { tu: ['7C'], ana: ['KS'], bruno: ['3H'], carla: ['KD'] } },
    bid: () => 0,
    until: (s) => s.round === 2 && s.phase === 'BIDDING' && current(s) === ME,
  },
  {
    label: 'Fim',
    players: 4,
    config: { maxPoints: 3 },
    until: (s) => s.phase === 'FINISHED',
  },
  {
    label: '10 · às cegas',
    players: 10,
    until: (s) => s.phase === 'BIDDING' && current(s) === ME,
  },
  {
    label: '10 · a jogar',
    players: 10,
    config: { maxPoints: 15 },
    until: (s) => s.round === 4 && s.phase === 'PLAYING' && current(s) === ME,
  },
];

function build(scenario: Scenario): FodinhaState {
  const engine = createFodinhaModule(dealer(scenario.deal));
  const players = NAMES.slice(0, scenario.players);
  const config = fodinhaConfigSchema.parse({ maxPoints: 7, ...scenario.config });
  let state = engine.setup(players, config, createSeededRng(`dev-${scenario.label}`));
  for (let guard = 0; guard < 2000 && !scenario.until(state); guard++) {
    const actor = current(state);
    let action: Parameters<typeof engine.applyAction>[1];
    let by: string = SYSTEM_PLAYER_ID;
    if (state.phase === 'BIDDING' && actor) {
      const valid = engine.getValidActions(state, actor).map((a) => (a.type === 'PLACE_BID' ? a.bid : 0));
      const wanted = scenario.bid?.(actor, state) ?? state.seats.indexOf(actor) % 2;
      action = { type: 'PLACE_BID', bid: valid.includes(wanted) ? wanted : (valid[0] ?? 0) };
      by = actor;
    } else if (state.phase === 'PLAYING' && state.handSize === 1) action = { type: 'SYS_AUTO_PLAY' };
    else if (state.phase === 'PLAYING' && actor) {
      action = engine.getDefaultAction(state, actor) ?? { type: 'SYS_TIMEOUT' };
      by = actor;
    } else if (state.phase === 'TRICK_RESOLVED') action = { type: 'SYS_RESOLVE_TRICK_DONE' };
    else if (state.phase === 'ROUND_SCORED') action = { type: 'SYS_NEXT_ROUND' };
    else break;
    const result = engine.applyAction(state, action, by);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/fodinha`: fixed Fodinha tables (from the real engine) for visual approval without playing. */
export function FodinhaPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake turn timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const layout = useTableLayout();
  const sizes = useFodinhaSizes(layout, scenario.players);
  const engine = useMemo(() => createFodinhaModule(), []);

  const { scene, validActions, timer, players } = useMemo(() => {
    const state = build(scenario);
    const view = engine.getPlayerView(state, ME);
    const pending = engine.getPendingPlayers(state);
    const roomPlayers: RoomPlayer[] = state.seats.map((id, seat) => ({
      id,
      username: id,
      avatarUrl: null,
      seat,
      ready: true,
      connected: id !== 'gil',
      away: false,
      guest: false,
      voice: false,
    }));
    return {
      scene: sceneFromView(`dev-${scenario.label}`, 1, view),
      validActions: engine.getValidActions(state, ME),
      timer:
        pending.length > 0
          ? { remainingMs: 21_000, totalMs: 30_000, playerIds: pending, receivedAt: shownAt }
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
              <FodinhaTableView
                key={scenario.label}
                scene={scene}
                selfId={ME}
                players={players}
                sizes={sizes}
                validActions={validActions}
                timer={timer}
                animating={false}
                ticker={null}
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
