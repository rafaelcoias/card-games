'use client';

import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, type Rng } from '@cardroom/game-core';
import {
  createOlhoModule,
  olhoConfigSchema,
  scheduleFor,
  type OlhoAction,
  type OlhoClientAction,
  type OlhoConfig,
  type OlhoState,
  type Role,
} from '@cardroom/olho';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { CUT_STAMP } from '@/games/olho/copy';
import { sceneFromView } from '@/games/olho/scene';
import type { Bubble } from '@/games/olho/seat';
import { OlhoTableView, closedCaption, useOlhoSizes } from '@/games/olho/table';

const NAMES = ['tu', 'ana', 'bruno', 'carla', 'duarte', 'eva', 'filipa', 'gil'];
const ME = 'tu';
const engine = createOlhoModule();

interface Dressing {
  ticker?: string;
  stamp?: string;
  bubbles?: Record<string, Bubble>;
  seals?: Record<string, number>;
}

interface Scenario {
  label: string;
  players: number;
  config?: Partial<OlhoConfig>;
  /** Plays (with bots) until this holds. */
  until: (state: OlhoState) => boolean;
  /** Roles going into game 2, to stage an exchange. */
  roles?: Record<string, Role>;
  /** What an animation would show at that instant. */
  dress?: (state: OlhoState) => Dressing;
}

/**
 * Bots: open with the lowest card (or pair), follow with the lowest play that
 * beats, escape when they can, and pass now and then — the plays a real table sees.
 */
function botAction(state: OlhoState, playerId: string, rng: Rng): OlhoAction | null {
  const actions = engine.getValidActions(state, playerId);
  if (actions.length === 0) return null;
  const escape = actions.find((a) => a.type === 'ESCAPE');
  if (escape) return escape;
  const back = actions.find((a) => a.type === 'RETURN_CARDS');
  if (back) return back;
  const plays = actions.filter((a): a is Extract<OlhoClientAction, { type: 'PLAY' }> => a.type === 'PLAY');
  const pass = actions.find((a) => a.type === 'PASS');
  if (pass && (plays.length === 0 || rng.nextInt(5) === 0)) return pass;
  const pairs = plays.filter((a) => a.cardIds.length === 2);
  if (state.trick.count === null && pairs.length > 0 && rng.nextInt(2) === 0) return pairs[0] ?? null;
  return plays[0] ?? pickOne(actions, rng);
}

function step(state: OlhoState, rng: Rng): OlhoState | null {
  const pending = engine.getPendingPlayers(state);
  let actor = SYSTEM_PLAYER_ID as string;
  let action: OlhoAction | null | undefined;
  if (pending.length > 0) {
    actor = pickOne(pending, rng);
    action = botAction(state, actor, rng);
  } else action = scheduleFor(state)[0]?.action as OlhoAction | undefined;
  if (!action) return null;
  const result = engine.applyAction(state, action, actor);
  return result.ok ? result.state : null;
}

const onTurn = (s: OlhoState) => engine.getCurrentPlayer(s) === ME;
const names = (id: string) => (id === ME ? 'Tu' : id);

const SCENARIOS: Scenario[] = [
  {
    label: 'Abrir',
    players: 4,
    until: (s) => onTurn(s) && s.trick.count === null && s.trick.number > 1,
  },
  {
    label: 'Seguir com par',
    players: 4,
    until: (s) => onTurn(s) && s.trick.count === 2 && s.trick.topRank !== '2' && !s.trick.skip,
  },
  {
    label: 'Salto com escape',
    players: 5,
    config: { escapeTimeoutMs: 15_000 },
    until: (s) => s.trick.skip?.targetId === ME,
  },
  {
    label: 'Saltado',
    players: 5,
    until: (s) => !!s.trick.skip && s.trick.skip.targetId !== ME && s.trick.plays.length >= 2,
    dress: (s) => ({ seals: { [s.trick.skip!.targetId]: 1 } }),
  },
  {
    label: 'Quatro iguais',
    players: 4,
    until: (s) => s.trick.closing?.reason === 'FOUR_IN_A_ROW',
    dress: (s) => ({
      stamp: CUT_STAMP.FOUR_IN_A_ROW,
      ticker: closedCaption(
        {
          kind: 'closed',
          winnerId: s.trick.closing!.winnerId,
          leaderId: s.trick.closing!.winnerId,
          reason: 'FOUR_IN_A_ROW',
          last: null,
        },
        ME,
        names,
      ),
    }),
  },
  {
    label: 'Joker',
    players: 4,
    until: (s) => s.trick.closing?.reason === 'JOKER' && s.trick.plays.length >= 3,
    dress: () => ({ stamp: CUT_STAMP.JOKER }),
  },
  {
    label: 'Ninguém bateu',
    players: 4,
    until: (s) => s.trick.closing?.reason === 'ALL_PASSED' && s.trick.plays.length >= 3,
    dress: (s) => {
      const last = s.trick.plays.at(-1)!;
      return {
        ticker: closedCaption(
          {
            kind: 'closed',
            winnerId: last.playerId,
            leaderId: last.playerId,
            reason: 'ALL_PASSED',
            last: { rank: last.cards[0]!.rank, count: last.cards.length },
          },
          ME,
          names,
        ),
      };
    },
  },
  {
    label: 'Troca (Presidente)',
    players: 4,
    config: { exchangeTimeoutMs: 60_000 },
    roles: { tu: 'PRESIDENTE', ana: 'VICE_PRESIDENTE', bruno: 'VICE_OLHO', carla: 'OLHO' },
    until: (s) => s.phase === 'EXCHANGE' && s.exchange?.stage === 'RETURNING',
  },
  {
    label: 'Troca (Olho)',
    players: 4,
    roles: { tu: 'OLHO', ana: 'PRESIDENTE', bruno: 'VICE_PRESIDENTE', carla: 'VICE_OLHO' },
    until: (s) => s.phase === 'EXCHANGE' && s.exchange?.stage === 'RETURNING',
  },
  { label: 'Resumo', players: 5, until: (s) => s.phase === 'GAME_SUMMARY' },
  {
    label: 'Bloqueado',
    players: 4,
    config: { allowFinishWithPower: false },
    until: (s) => s.blocked.length > 0 && s.phase === 'PLAYING' && !s.trick.closing,
  },
  {
    label: '8 jogadores',
    players: 8,
    until: (s) => onTurn(s) && s.trick.plays.length >= 3 && !s.trick.skip,
  },
];

function build(scenario: Scenario): OlhoState {
  const players = NAMES.slice(0, scenario.players);
  const config = olhoConfigSchema.parse(scenario.config ?? {});
  const rng = createSeededRng(`dev-olho-${scenario.label}`);
  let state = engine.setup(players, config, rng);
  if (scenario.roles) {
    // Straight to game 2 with the roles of the scenario.
    for (let guard = 0; guard < 4000 && state.phase !== 'GAME_SUMMARY'; guard++) {
      const next = step(state, rng);
      if (!next) break;
      state = next;
    }
    const roles = scenario.roles;
    state = {
      ...state,
      roster: state.roster.map((p) => ({ ...p, role: roles[p.playerId] ?? null })),
      lastGame: state.lastGame && {
        ...state.lastGame,
        order: [...state.lastGame.order].sort((a, b) => rank(roles[a]) - rank(roles[b])),
      },
    };
  }
  for (let guard = 0; guard < 6000 && !scenario.until(state); guard++) {
    const next = step(state, rng);
    if (!next) break;
    state = next;
  }
  return state;
}

const ROLE_RANK: Record<Role, number> = {
  PRESIDENTE: 0,
  VICE_PRESIDENTE: 1,
  NEUTRO: 2,
  VICE_OLHO: 3,
  OLHO: 4,
};
const rank = (role: Role | undefined) => (role ? ROLE_RANK[role] : 2);

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/olho`: fixed Olho tables (from the real engine) for visual approval without playing. */
export function OlhoPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake turn timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const sizes = useOlhoSizes(scenario.players);

  const { scene, validActions, timer, players, dressing } = useMemo(() => {
    const state = build(scenario);
    const view = engine.getPlayerView(state, ME);
    const pending = engine.getPendingPlayers(state);
    const roomPlayers: RoomPlayer[] = state.roster.map((p) => ({
      id: p.playerId,
      username: p.playerId,
      avatarUrl: null,
      seat: p.seatIndex,
      ready: true,
      connected: p.playerId !== 'eva',
      away: false,
      guest: false,
      voice: false,
      waiting: false,
    }));
    const timeout = engine.getTimeoutMs(state);
    return {
      scene: sceneFromView(`dev-${scenario.label}`, 1, view),
      validActions: engine.getValidActions(state, ME) as OlhoClientAction[],
      timer:
        pending.length > 0 && timeout
          ? { remainingMs: timeout * 0.7, totalMs: timeout, playerIds: pending, receivedAt: shownAt }
          : null,
      players: new Map(roomPlayers.map((p) => [p.id, p])),
      dressing: scenario.dress?.(state) ?? {},
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
              <OlhoTableView
                key={scenario.label}
                scene={scene}
                selfId={ME}
                players={players}
                sizes={sizes}
                validActions={validActions}
                timer={timer}
                animating={false}
                ticker={dressing.ticker ?? null}
                stamp={dressing.stamp ? { text: dressing.stamp, key: 1 } : null}
                bubbles={dressing.bubbles ?? {}}
                seals={dressing.seals ?? {}}
                confetti={null}
                nameOf={names}
                sendAction={noop}
                rememberReturn={() => undefined}
              />
            </LayoutGroup>
          </FlightLayer>
        </div>
      </div>
    </AnchorProvider>
  );
}
