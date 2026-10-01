'use client';

import { SYSTEM_PLAYER_ID, createSeededRng, pickOne, shuffle } from '@cardroom/game-core';
import {
  createDesconfiaModule,
  desconfiaConfigSchema,
  isTruthful,
  type DesconfiaAction,
  type DesconfiaConfig,
  type DesconfiaState,
} from '@cardroom/desconfia';
import type { RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useMemo, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { claimLine, rankPlural } from '@/games/desconfia/copy';
import { sceneFromView, type Scene } from '@/games/desconfia/scene';
import type { Bubble } from '@/games/desconfia/seat';
import { DesconfiaTableView, useDesconfiaSizes, verdictCaption } from '@/games/desconfia/table';

const NAMES = ['tu', 'ana', 'bruno', 'carla', 'duarte', 'eva', 'filipa', 'gil'];
const ME = 'tu';

interface Scenario {
  label: string;
  players: number;
  config?: Partial<DesconfiaConfig>;
  /** Plays the match (with bots) until this holds. */
  until: (state: DesconfiaState) => boolean;
  /** Bots do not doubt (to keep a pile growing). */
  quiet?: boolean;
  /** Straight after the deal, with the viewer on turn. */
  start?: boolean;
  /** What an animation would show at that instant. */
  dress?: (
    scene: Scene,
    state: DesconfiaState,
  ) => { scene?: Scene; bubbles?: Record<string, Bubble>; ticker?: string };
}

const current = (s: DesconfiaState) =>
  s.phase === 'PLAYING' && !s.doubtWindow?.lastCard ? s.seats[s.currentIndex] : undefined;
const bubble = (text: string, tone: Bubble['tone']): Bubble => ({ key: 1, text, tone });
const names = (id: string) => (id === ME ? 'Tu' : id);

/** The last play turned over at the stamp, still above the pile (UI §6). */
function revealing(scene: Scene, state: DesconfiaState, doubterId: string): Scene {
  const last = state.pile.at(-1);
  if (!last) return scene;
  const entries = scene.pile.filter((p) => p.playId === last.playId);
  return {
    ...scene,
    doubtWindow: null,
    pile: scene.pile.filter((p) => p.playId !== last.playId),
    reveal: {
      playId: last.playId,
      authorId: last.playerId,
      doubterId,
      claimRank: last.claimRank,
      truthful: isTruthful(last.cards, last.claimRank),
      cards: last.cards.map((card, i) => ({
        key: entries[i]?.key ?? `${i}`,
        card,
        layoutId: `x-${card.id}`,
      })),
      stage: 'stamp',
    },
  };
}

function revealScenario(label: string, truthful: boolean): Scenario {
  return {
    label,
    players: 4,
    quiet: true,
    until: (s) => {
      const last = s.pile.at(-1);
      return (
        s.pile.length >= 3 &&
        !!last &&
        last.playerId !== ME &&
        isTruthful(last.cards, last.claimRank) === truthful
      );
    },
    dress: (scene, state) => ({
      scene: revealing(scene, state, ME),
      bubbles: { [ME]: bubble('Desconfia!', 'doubt') },
      ticker: verdictCaption(truthful, state.pile.at(-1)!.playerId, ME, ME, names),
    }),
  };
}

const SCENARIOS: Scenario[] = [
  { label: 'Pilha nova', players: 4, start: true, until: () => true },
  {
    label: 'Pilha em curso',
    players: 4,
    quiet: true,
    until: (s) => current(s) === ME && s.pile.length >= 3 && !!s.doubtWindow?.minElapsed,
  },
  {
    label: 'À espera (2 s)',
    players: 4,
    quiet: true,
    until: (s) => current(s) === ME && s.pile.length >= 2 && s.doubtWindow?.minElapsed === false,
    dress: (_, state) => {
      const last = state.pile.at(-1)!;
      return { bubbles: { [last.playerId]: bubble(claimLine(last.cards.length, last.claimRank), 'claim') } };
    },
  },
  {
    label: 'Desconfiar',
    players: 5,
    quiet: true,
    until: (s) => !!s.doubtWindow && s.doubtWindow.playerId !== ME && current(s) !== ME && s.pile.length >= 4,
    dress: (_, state) => {
      const last = state.pile.at(-1)!;
      return { bubbles: { [last.playerId]: bubble(claimLine(last.cards.length, last.claimRank), 'claim') } };
    },
  },
  revealScenario('Mentira!', false),
  revealScenario('Verdade!', true),
  {
    label: 'Peixinho',
    players: 4,
    until: (s) => s.removed.length >= 1 && current(s) === ME,
    dress: (scene, state) => {
      const rank = state.removed.at(-1)!.rank;
      const cards = (['S', 'H', 'C', 'D'] as const).map((suit) => ({
        card: { id: `${rank}${suit}`, rank, suit },
      }));
      return {
        scene: { ...scene, showcase: { key: 1, playerId: state.removed.at(-1)!.playerId, rank, cards } },
        ticker: `Peixinho de ${rankPlural(rank)} — fora de jogo`,
      };
    },
  },
  {
    label: 'Última carta',
    players: 4,
    quiet: true,
    until: (s) => !!s.doubtWindow?.lastCard,
    dress: (_, state) => {
      const author = state.doubtWindow?.playerId;
      if (!author) return {};
      return {
        ticker:
          author === ME
            ? 'Última carta! Se ninguém desconfiar, ganhas.'
            : `Última carta de ${author}! Alguém desconfia?`,
      };
    },
  },
  { label: 'Fim', players: 4, until: (s) => s.phase === 'FINISHED' },
  {
    label: '8 jogadores',
    players: 8,
    quiet: true,
    until: (s) => current(s) === ME && s.pile.length >= 5 && !!s.doubtWindow?.minElapsed,
  },
];

/** Bots: the truth when they can (a lie one time in three), and a doubt now and then unless `quiet`. */
function build(scenario: Scenario): DesconfiaState {
  const engine = createDesconfiaModule();
  const players = NAMES.slice(0, scenario.players);
  const config = desconfiaConfigSchema.parse(scenario.config ?? {});
  const rng = createSeededRng(`dev-${scenario.label}`);
  let state = engine.setup(players, config, rng);
  if (scenario.start) return { ...state, currentIndex: players.indexOf(ME) };
  let scheduled: DesconfiaAction | null = null;
  for (let guard = 0; guard < 3000 && !scenario.until(state) && state.phase === 'PLAYING'; guard++) {
    const doubters = state.seats.filter((id) =>
      engine.getValidActions(state, id).some((a) => a.type === 'DOUBT'),
    );
    const actor = current(state);
    let action: DesconfiaAction;
    let by = SYSTEM_PLAYER_ID as string;
    if (!scenario.quiet && doubters.length > 0 && rng.nextInt(4) === 0) {
      by = pickOne(doubters, rng);
      action = { type: 'DOUBT', playId: state.doubtWindow!.playId };
    } else if (actor && engine.getPendingPlayers(state).length > 0) {
      const hand = state.hands[actor]!;
      const claimRank =
        state.claimRank ??
        pickOne(
          hand.filter((c) => c.rank !== 'JOKER'),
          rng,
        )?.rank ??
        '2';
      const truth = hand.filter((c) => c.rank === claimRank || c.rank === 'JOKER');
      const cards =
        truth.length > 0 && rng.nextInt(3) > 0 ? truth : shuffle(hand, rng).slice(0, 1 + rng.nextInt(2));
      action = { type: 'PLAY', cardIds: cards.map((c) => c.id), claimRank: claimRank as never };
      by = actor;
    } else if (scheduled) action = scheduled;
    else break;
    const result = engine.applyAction(state, action, by);
    if (!result.ok) break;
    state = result.state;
    scheduled = (result.schedule?.[0]?.action as DesconfiaAction | undefined) ?? null;
  }
  return state;
}

const noop = () => Promise.resolve({ ok: true as const, data: undefined });

/** `/dev/desconfia`: fixed Desconfia tables (from the real engine) for visual approval without playing. */
export function DesconfiaPreview() {
  const [index, setIndex] = useState(0);
  // When the current state was put on screen: its fake turn timer counts down from here.
  const [shownAt, setShownAt] = useState(() => performance.now());
  const scenario = SCENARIOS[index] as Scenario;
  const sizes = useDesconfiaSizes(scenario.players);
  const engine = useMemo(() => createDesconfiaModule(), []);

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
      voice: false,
    }));
    const base = sceneFromView(`dev-${scenario.label}`, 1, view);
    const dressed = scenario.dress?.(base, state) ?? {};
    return {
      scene: dressed.scene ?? base,
      validActions: dressed.scene?.reveal ? [] : engine.getValidActions(state, ME),
      timer:
        pending.length > 0
          ? { remainingMs: 21_000, totalMs: 30_000, playerIds: pending, receivedAt: shownAt }
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
              <DesconfiaTableView
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
                confetti={null}
                nameOf={names}
                sendAction={noop}
                rememberPlay={() => undefined}
              />
            </LayoutGroup>
          </FlightLayer>
        </div>
      </div>
    </AnchorProvider>
  );
}
