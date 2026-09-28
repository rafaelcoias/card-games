'use client';

import type { BlackjackClientAction, Decision } from '@cardroom/blackjack';
import clsx from 'clsx';
import { motion } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { Chip, ChipStack } from './chips';
import { DECISION_COPY, plural, type ChipValue } from './copy';
import type { SceneSeat } from './scene';

const RACK: readonly ChipValue[] = [10, 20, 50, 100, 500];

function Countdown({ timer }: { timer: TimerLike | null }) {
  const seconds = useSecondsLeft(timer);
  if (seconds === null) return null;
  return (
    <span className={clsx('tabular-nums', seconds <= 5 ? 'text-danger' : 'text-ivory/60')}>{seconds}s</span>
  );
}

const panel = 'w-full max-w-3xl rounded-2xl bg-black/40 px-3 py-2.5 backdrop-blur-sm';

export interface BettingPanelProps {
  seat: SceneSeat;
  rules: { minBet: number; maxBet: number; startingStack: number };
  actions: readonly BlackjackClientAction[];
  timer: TimerLike | null;
  busy: boolean;
  /** Resets the pile being built (one per round). */
  roundKey: string;
  send: (action: BlackjackClientAction) => void;
}

/**
 * Betting (UI §3): tap chips to build the bet, tap the pile to take the last
 * one back; clear, repeat or double the last bet; confirm. Rebuy when broke.
 */
export function BettingPanel({ seat, rules, actions, timer, busy, roundKey, send }: BettingPanelProps) {
  const [pile, setPile] = useState<{ key: string; chips: number[] }>({ key: roundKey, chips: [] });
  const chips = pile.key === roundKey ? pile.chips : [];
  const setChips = (next: number[]) => setPile({ key: roundKey, chips: next });
  const amount = chips.reduce((sum, value) => sum + value, 0);
  const ceiling = Math.min(rules.maxBet, seat.stack);
  const can = (type: BlackjackClientAction['type']) => actions.some((a) => a.type === type);
  const canBet = can('PLACE_BET');
  const valid = amount >= rules.minBet && amount <= ceiling;
  const last = seat.lastBet;

  if (can('REBUY')) {
    return (
      <div className={clsx(panel, 'flex flex-wrap items-center gap-3')} role="group" aria-label="Recompra">
        <p className="min-w-0 flex-1 text-sm">
          Ficaste sem fichas para a mínima ({rules.minBet}).{' '}
          {seat.rebuys > 0 && (
            <span className="text-ivory/60">Já recompraste {plural(seat.rebuys, 'vez', 'vezes')}.</span>
          )}
        </p>
        <Button disabled={busy} onClick={() => send({ type: 'REBUY' })}>
          Recomprar {rules.startingStack}
        </Button>
      </div>
    );
  }

  if (seat.bet !== null) {
    return (
      <div className={clsx(panel, 'flex items-center gap-3')} role="group" aria-label="Aposta">
        <ChipStack amount={seat.bet} size={26} />
        <p className="min-w-0 flex-1 text-sm">
          Apostaste <strong className="text-gold">{seat.bet}</strong> — à espera dos outros…{' '}
          <Countdown timer={timer} />
        </p>
        {can('CLEAR_BET') && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => send({ type: 'CLEAR_BET' })}>
            Alterar
          </Button>
        )}
      </div>
    );
  }

  if (!canBet) return null;
  const quick = (value: number | null) => value !== null && value >= rules.minBet && value <= ceiling;
  return (
    <motion.div
      className={panel}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      role="group"
      aria-label="Aposta"
    >
      <div className="flex items-center gap-2 text-xs text-ivory/75">
        <span className="font-semibold text-gold">Faz a tua aposta</span>
        <span>
          Mesa {rules.minBet}–{rules.maxBet} · tens {seat.stack}
        </span>
        <span className="ml-auto">
          <Countdown timer={timer} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5" role="group" aria-label="Fichas">
          {RACK.filter((value) => value <= rules.maxBet).map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`Juntar ${value}`}
              disabled={busy || amount + value > ceiling}
              onClick={() => setChips([...chips, value])}
              className="rounded-full transition-transform hover:-translate-y-0.5 active:scale-95 disabled:opacity-30"
            >
              <Chip value={value} size={38} />
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setChips(chips.slice(0, -1))}
          disabled={chips.length === 0}
          aria-label={`Aposta em construção: ${amount}. Tirar a última ficha`}
          className="flex min-w-16 items-center justify-center gap-1.5 rounded-xl bg-black/25 px-2 py-1 disabled:opacity-60"
        >
          {amount > 0 ? (
            <ChipStack amount={amount} size={22} />
          ) : (
            <span className="text-xs text-ivory/50">0</span>
          )}
          <span className="font-bold tabular-nums">{amount}</span>
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button variant="ghost" size="sm" disabled={busy || amount === 0} onClick={() => setChips([])}>
          Limpar
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || !quick(last)}
          onClick={() => last !== null && send({ type: 'PLACE_BET', amount: last })}
        >
          Repetir{last !== null ? ` ${last}` : ''}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={busy || last === null || !quick(last * 2)}
          onClick={() => last !== null && send({ type: 'PLACE_BET', amount: last * 2 })}
        >
          Dobrar{last !== null ? ` ${last * 2}` : ''}
        </Button>
        <Button
          className="ml-auto"
          disabled={busy || !valid}
          onClick={() => send({ type: 'PLACE_BET', amount })}
        >
          {valid ? `Apostar ${amount}` : amount === 0 ? 'Escolhe as fichas' : `Mínimo ${rules.minBet}`}
        </Button>
      </div>
    </motion.div>
  );
}

export interface ActionBarProps {
  actions: readonly BlackjackClientAction[];
  hint: Decision | null;
  timer: TimerLike | null;
  busy: boolean;
  title: string;
  send: (action: BlackjackClientAction) => void;
}

const DECISIONS: Decision[] = ['HIT', 'STAND', 'DOUBLE', 'SPLIT', 'SURRENDER'];

/**
 * Decisions (UI §5): big buttons, only the valid ones enabled; H S D P R on the
 * keyboard; the hint lights up the advised button for two seconds, on request only.
 */
export function ActionBar({ actions, hint, timer, busy, title, send }: ActionBarProps) {
  const allowed = useMemo(() => new Set(actions.map((a) => a.type)), [actions]);
  const [advice, setAdvice] = useState<Decision | null>(null);

  useEffect(() => {
    if (!advice) return;
    const t = window.setTimeout(() => setAdvice(null), 2000);
    return () => window.clearTimeout(t);
  }, [advice]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (busy || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;
      const decision = DECISIONS.find((d) => DECISION_COPY[d].key === event.key.toUpperCase());
      if (decision && allowed.has(decision)) {
        event.preventDefault();
        send({ type: decision });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [allowed, busy, send]);

  return (
    <motion.div
      className={panel}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      role="group"
      aria-label="Decisão"
    >
      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold text-gold">{title}</span>
        <span className="ml-auto text-xs">
          <Countdown timer={timer} />
        </span>
        {hint && (
          <button
            type="button"
            onClick={() => setAdvice(hint)}
            className="inline-flex size-8 items-center justify-center rounded-full bg-black/30 hover:bg-black/50"
            aria-label="Dica: jogada da estratégia básica"
            title="Dica"
          >
            💡
          </button>
        )}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {DECISIONS.map((decision) => {
          const enabled = allowed.has(decision) && !busy;
          return (
            <button
              key={decision}
              type="button"
              disabled={!enabled}
              onClick={() => send({ type: decision })}
              className={clsx(
                'flex h-12 flex-col items-center justify-center rounded-xl text-sm font-bold transition-colors sm:h-14 sm:text-base',
                enabled ? 'bg-ivory/12 text-ivory hover:bg-ivory/20' : 'bg-white/5 text-ivory/25',
                advice === decision && 'bg-gold! text-gold-ink! shadow-[0_0_18px_rgb(232_193_112/0.7)]',
              )}
            >
              {DECISION_COPY[decision].label}
              <span className="hidden text-[10px] font-medium opacity-60 sm:block">
                {DECISION_COPY[decision].key}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

export interface InsurancePanelProps {
  amount: number;
  evenMoney: boolean;
  bet: number;
  timer: TimerLike | null;
  busy: boolean;
  send: (action: BlackjackClientAction) => void;
}

/** Insurance / even money (UI §6): one question, two answers, a short countdown. */
export function InsurancePanel({ amount, evenMoney, bet, timer, busy, send }: InsurancePanelProps) {
  const type = evenMoney ? 'EVEN_MONEY' : 'INSURANCE';
  return (
    <motion.div
      className={clsx(panel, 'flex flex-wrap items-center gap-3')}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      role="group"
      aria-label={evenMoney ? 'Even money' : 'Seguro'}
    >
      <p className="min-w-0 flex-1 text-sm">
        {evenMoney ? (
          <>
            Tens blackjack e a banca mostra um Ás.{' '}
            <strong className="text-gold">Receber 1:1 já ({bet})?</strong>
          </>
        ) : (
          <>
            A banca mostra um Ás. <strong className="text-gold">Seguro por {amount}?</strong>{' '}
            <span className="text-ivory/60">Paga 2:1 se a banca tiver blackjack.</span>
          </>
        )}{' '}
        <Countdown timer={timer} />
      </p>
      <div className="flex gap-1.5">
        <Button variant="secondary" disabled={busy} onClick={() => send({ type, take: false })}>
          Não
        </Button>
        <Button disabled={busy} onClick={() => send({ type, take: true })}>
          Sim
        </Button>
      </div>
    </motion.div>
  );
}
