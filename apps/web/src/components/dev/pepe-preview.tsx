'use client';

import { SYSTEM_PLAYER_ID, createSeededRng, pickOne } from '@cardroom/game-core';
import {
  createPepeModule,
  pepeConfigSchema,
  type PepeAction,
  type PepeClientAction,
  type PepeConfig,
  type PepeState,
  type PepeView,
} from '@cardroom/pepe-rapido';
import type { Ack, GameViewMessage, RoomPlayer } from '@cardroom/shared';
import { AnchorProvider, CardSprite, FlightLayer } from '@cardroom/ui';
import clsx from 'clsx';
import { LayoutGroup } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Logo } from '@/components/ui/logo';
import { PepeTableView } from '@/games/pepe-rapido/table';
import { useOptimisticActions } from '@/games/shared/use-optimistic';

const ME = 'tu';
const BOT = 'bruno';
const engine = createPepeModule();

interface Scenario {
  label: string;
  config?: Partial<PepeConfig>;
  /** How fast Bruno plays (ms between moves); `null`: he never plays. */
  botMs: number | null;
  /** Plays the match (with bots on both sides) until this holds. */
  until?: (state: PepeState) => boolean;
}

const SCENARIOS: Scenario[] = [
  { label: 'Clássico', botMs: 1400 },
  {
    label: 'Iniciante',
    config: { preset: 'INICIANTE', direction: 'UP_ONLY', showCentreCounts: true, autoFlip: true },
    botMs: 1800,
  },
  { label: 'Adversário lento', botMs: 4000 },
  { label: 'Escolher monte', botMs: null, until: (s) => s.phase === 'CHOOSING_PILE' && s.roundWinner === ME },
  { label: 'Ronda 2', botMs: 1600, until: (s) => s.round === 2 && s.phase === 'COUNTDOWN' },
];

/** One step of play for anyone: a play to the centre when there is one, else a group, else "Virar". */
function botAction(state: PepeState, playerId: string, seed: string): PepeClientAction | null {
  const actions = engine.getValidActions(state, playerId);
  const rng = createSeededRng(seed);
  const plays = actions.filter((a) => a.type === 'PLAY_TO_CENTRE' || a.type === 'CHOOSE_PILE');
  if (plays.length > 0) return pickOne(plays, rng);
  const moves = actions.filter((a) => a.type === 'GROUP');
  if (moves.length > 0 && rng.nextInt(2) === 0) return pickOne(moves, rng);
  return actions.find((a) => a.type === 'REQUEST_FLIP') ?? null;
}

function build(scenario: Scenario): PepeState {
  const config = pepeConfigSchema.parse({ ...scenario.config });
  let state = engine.setup([ME, BOT], config, createSeededRng(`dev-pepe:${scenario.label}`));
  for (let step = 0; scenario.until && !scenario.until(state) && step < 5000; step++) {
    const timeout = engine.getTimeoutAction?.(state);
    const actor = step % 2 === 0 ? ME : BOT;
    const action: PepeAction | null =
      state.phase === 'ROUND_SETUP'
        ? { type: 'SYS_ROUND_SETUP_DONE', round: state.round }
        : timeout && state.phase === 'COUNTDOWN'
          ? timeout
          : botAction(state, actor, `${step}`);
    const isSystem = action?.type.startsWith('SYS_');
    const result = action ? engine.applyAction(state, action, isSystem ? SYSTEM_PLAYER_ID : actor) : null;
    if (result?.ok) state = result.state;
    else if (timeout) {
      const forced = engine.applyAction(state, timeout, SYSTEM_PLAYER_ID);
      if (forced.ok) state = forced.state;
    }
  }
  return state;
}

/** A table on the clock of its first phase (the countdown). */
function fresh(state: PepeState) {
  const timeout = engine.getTimeoutMs(state) ?? 0;
  return { state, seq: 1, deadline: timeout > 0 ? performance.now() + timeout : 0, total: timeout };
}

/**
 * A playable table against a bot, with the engine running in the page (dev
 * only): the server's clock, its latency (80 ms) and its refusals included.
 */
export function PepePreview() {
  const [index, setIndex] = useState(0);
  const scenario = SCENARIOS[index] as Scenario;
  const [game, setGame] = useState(() => fresh(build(scenario)));
  const stateRef = useRef(game);
  useEffect(() => {
    stateRef.current = game;
  });
  const [now, setNow] = useState(() => performance.now());

  const commitRef = useRef<((action: PepeAction, actor: string) => Ack) | null>(null);
  const commit = useCallback((action: PepeAction, actor: string): Ack => {
    const current = stateRef.current;
    const result = engine.applyAction(current.state, action, actor);
    if (!result.ok) return { ok: false, error: { code: result.error.code, message: result.error.message } };
    const before = engine.getPendingPlayers(current.state);
    const after = engine.getPendingPlayers(result.state);
    const reset = after.some((id) => !before.includes(id)) || actor === SYSTEM_PLAYER_ID;
    const timeout = engine.getTimeoutMs(result.state);
    const next = {
      state: result.state,
      seq: current.seq + 1,
      deadline: reset ? (timeout === null ? 0 : performance.now() + timeout) : current.deadline,
      total: reset ? (timeout ?? 0) : current.total,
    };
    stateRef.current = next;
    setGame(next);
    for (const { action: scheduled, delayMs } of result.schedule ?? []) {
      const seq = next.seq;
      window.setTimeout(() => {
        if (stateRef.current.seq === seq) commitRef.current?.(scheduled as PepeAction, SYSTEM_PLAYER_ID);
      }, delayMs);
    }
    return { ok: true, data: undefined };
  }, []);

  useEffect(() => {
    commitRef.current = commit;
  });

  // The clock and the bot.
  useEffect(() => {
    let lastBot = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      setNow(t);
      const current = stateRef.current;
      const { state } = current;
      if (state.phase === 'FINISHED') return;
      if (current.deadline > 0 && t >= current.deadline) {
        const closing = engine.getTimeoutAction?.(state);
        if (closing) commit(closing, SYSTEM_PLAYER_ID);
        else {
          for (const id of engine.getPendingPlayers(state)) {
            const fallback = engine.getDefaultAction(stateRef.current.state, id);
            if (fallback) commit(fallback, id);
          }
          if (stateRef.current === current) setGame({ ...current, deadline: 0 });
        }
        return;
      }
      if (scenario.botMs !== null && t - lastBot > scenario.botMs) {
        lastBot = t;
        const action = botAction(state, BOT, `${current.seq}:${Math.round(t)}`);
        if (action) commit(action, BOT);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [commit, scenario.botMs]);

  const send = useCallback(
    (action: PepeClientAction) =>
      new Promise<Ack>((resolve) => window.setTimeout(() => resolve(commit(action, ME)), 80)),
    [commit],
  );
  const { pending, dispatch } = useOptimisticActions(send, game.seq, () => undefined);

  const message = useMemo<GameViewMessage<PepeView, PepeClientAction>>(
    () => ({
      roomId: 'dev',
      matchId: `dev-${scenario.label}`,
      gameId: 'pepe-rapido',
      seq: game.seq,
      view: engine.getPlayerView(game.state, ME),
      validActions: engine.getValidActions(game.state, ME) as PepeClientAction[],
      timer:
        game.deadline > 0
          ? {
              remainingMs: Math.max(0, game.deadline - now),
              totalMs: game.total,
              playerIds: engine.getPendingPlayers(game.state),
            }
          : null,
      snapshot: false,
      chatOpen: true,
      pause: null,
    }),
    [game, now, scenario.label],
  );
  const players = useMemo(
    () =>
      new Map<string, RoomPlayer>(
        [ME, BOT].map((id, seat) => [
          id,
          {
            id,
            username: id,
            avatarUrl: null,
            seat,
            ready: true,
            connected: true,
            away: false,
            guest: false,
            voice: false,
            waiting: false,
          },
        ]),
      ),
    [],
  );

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
                  setGame(fresh(build(s)));
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
              <PepeTableView
                message={message}
                pendingActions={pending.map((p) => p.action)}
                players={players}
                selfId={ME}
                dispatch={dispatch}
                shake={null}
                banner={null}
                confetti={null}
                historyReset={0}
              />
            </LayoutGroup>
          </FlightLayer>
        </div>
      </div>
    </AnchorProvider>
  );
}
