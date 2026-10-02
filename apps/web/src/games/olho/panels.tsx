'use client';

import type { Card as CardModel, PlayerId } from '@cardroom/game-core';
import {
  POINTS,
  type GameSummary,
  type OlhoExchangeView,
  type OlhoSessionRow,
  type Role,
} from '@cardroom/olho';
import { Card } from '@cardroom/ui';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useSecondsLeft, type TimerLike } from '../shared/turn-ring';
import { ROLE_LABEL, ordinal, plural, signedPoints } from './copy';
import { RoleBadge, RoleTag } from './insignia';
import type { Scene } from './scene';

const pairRoles = (count: number): [Role, Role] =>
  count === 2 ? ['OLHO', 'PRESIDENTE'] : ['VICE_OLHO', 'VICE_PRESIDENTE'];

function MiniCards({ cards }: { cards: readonly CardModel[] }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {cards.map((card) => (
        <Card key={card.id} id={card.id} size="xs" />
      ))}
    </span>
  );
}

/**
 * The exchange (UI §7), over a dimmed table: who gives what to whom. The two
 * players of a pair see their cards; everyone else only the arrows.
 */
export function ExchangeOverlay({
  exchange,
  nameOf,
  timer,
}: {
  exchange: OlhoExchangeView | null;
  nameOf: (id: PlayerId) => string;
  timer: TimerLike | null;
}) {
  const seconds = useSecondsLeft(timer);
  const visible = exchange !== null && exchange.stage !== 'DONE';
  const mine = exchange?.mine ?? null;
  return (
    <AnimatePresence>
      {visible && exchange && (
        <motion.div
          key="exchange"
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.section
            className="panel w-full max-w-md p-4"
            initial={{ y: 14, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            aria-label="Troca de cartas"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="font-display text-xl font-semibold">Troca de cartas</h3>
              {seconds !== null && exchange.stage === 'RETURNING' && (
                <span className={clsx('text-sm tabular-nums', seconds <= 5 ? 'text-danger' : 'text-muted')}>
                  {seconds}s
                </span>
              )}
            </div>
            <ul className="mt-3 flex flex-col gap-2">
              {exchange.pairs.map((pair) => {
                const [giverRole, receiverRole] = pairRoles(pair.count);
                return (
                  <li
                    key={pair.giver}
                    className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm"
                  >
                    <RoleBadge role={giverRole} size={20} />
                    <span className="min-w-0 truncate font-semibold">{nameOf(pair.giver)}</span>
                    <motion.span
                      aria-hidden="true"
                      className="text-gold"
                      animate={pair.returned ? { x: 0 } : { x: [0, 4, 0] }}
                      transition={{ duration: 1, repeat: pair.returned ? 0 : Infinity }}
                    >
                      ⇄
                    </motion.span>
                    <RoleBadge role={receiverRole} size={20} />
                    <span className="min-w-0 truncate font-semibold">{nameOf(pair.receiver)}</span>
                    <span className="ml-auto whitespace-nowrap text-xs text-muted">
                      {pair.returned ? '✓ trocado' : plural(pair.count, 'carta', 'cartas')}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 text-sm leading-relaxed text-ivory/85">
              {!mine ? (
                <p>Troca de cartas em curso…</p>
              ) : mine.side === 'GIVER' ? (
                <>
                  <div>
                    {exchange.stage === 'DEALT'
                      ? `${mine.count === 1 ? 'A tua melhor carta vai' : `As tuas ${mine.count} melhores vão`} para ${nameOf(mine.partnerId)}:`
                      : `O servidor entregou ${mine.count === 1 ? 'a tua melhor carta' : `as tuas ${mine.count} melhores`} a ${nameOf(mine.partnerId)}:`}{' '}
                    {mine.given && <MiniCards cards={mine.given} />}
                  </div>
                  <div className="mt-1.5">
                    {mine.returned ? (
                      <>
                        Recebeste de volta: <MiniCards cards={mine.returned} />
                      </>
                    ) : (
                      `À espera de que ${nameOf(mine.partnerId)} escolha o que te devolve…`
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    {mine.given ? (
                      <>
                        Recebeste de {nameOf(mine.partnerId)}: <MiniCards cards={mine.given} />
                      </>
                    ) : (
                      `Vais receber ${mine.count === 1 ? 'a melhor carta' : `as ${mine.count} melhores cartas`} de ${nameOf(mine.partnerId)}…`
                    )}
                  </div>
                  <div className={clsx('mt-1.5', mine.mustReturn && 'font-semibold text-gold')}>
                    {mine.returned ? (
                      <>
                        Devolveste: <MiniCards cards={mine.returned} />
                      </>
                    ) : mine.mustReturn ? (
                      `Escolhe na tua mão ${plural(mine.count, 'carta', 'cartas')} para devolver.`
                    ) : (
                      'Já a chegar…'
                    )}
                  </div>
                </>
              )}
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** End of a game (UI §6): the order, the new roles and the points, for 4 s. */
export function SummaryOverlay({
  summary,
  session,
  nameOf,
  selfId,
  onClose,
}: {
  summary: GameSummary | null;
  session: readonly OlhoSessionRow[];
  nameOf: (id: PlayerId) => string;
  selfId: string;
  onClose: () => void;
}) {
  const totals = new Map(session.map((r) => [r.playerId, r.points]));
  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          key={summary.gameNumber}
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/40 p-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="panel w-full max-w-sm cursor-pointer p-4"
            initial={{ y: 16, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            role="dialog"
            aria-label={`Fim do jogo ${summary.gameNumber}`}
          >
            <h3 className="font-display text-xl font-semibold">Fim do jogo {summary.gameNumber}</h3>
            <ol className="mt-3 flex flex-col gap-1.5">
              {summary.order.map((id, i) => {
                const role = summary.roles[id] as Role;
                const delta = summary.pointsDelta[id] ?? 0;
                return (
                  <motion.li
                    key={id}
                    className={clsx(
                      'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm',
                      id === selfId ? 'bg-gold/15' : 'bg-surface-2',
                    )}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 * i, duration: 0.2 }}
                  >
                    <span className="w-7 tabular-nums text-subtle">{ordinal(i + 1)}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(id)}</span>
                    <RoleTag role={role} />
                    <span
                      className={clsx(
                        'w-8 text-right font-bold tabular-nums',
                        delta > 0 ? 'text-success' : delta < 0 ? 'text-danger' : 'text-muted',
                      )}
                    >
                      {signedPoints(delta)}
                    </span>
                    <span className="w-8 text-right text-xs tabular-nums text-subtle">
                      {signedPoints(totals.get(id) ?? 0)}
                    </span>
                  </motion.li>
                );
              })}
            </ol>
            <p className="mt-3 text-center text-xs text-muted">A distribuir o próximo jogo…</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The session scoreboard (UI §8): role, points, and how often each one was Presidente or Olho. */
export function Scoreboard({
  open,
  onClose,
  rows,
  games,
  nameOf,
  selfId,
}: {
  open: boolean;
  onClose: () => void;
  rows: readonly OlhoSessionRow[];
  games: number;
  nameOf: (id: PlayerId) => string;
  selfId: string;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          className="absolute inset-y-0 right-0 z-50 flex w-full max-w-md flex-col p-2"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          aria-label="Marcador da sessão"
        >
          <div className="panel flex min-h-0 flex-1 flex-col p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-semibold">Marcador</h3>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 text-muted hover:text-ivory"
                aria-label="Fechar marcador"
              >
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              {plural(games, 'jogo terminado', 'jogos terminados')} ·{' '}
              {(Object.keys(POINTS) as Role[])
                .map((role) => `${ROLE_LABEL[role]} ${signedPoints(POINTS[role])}`)
                .join(' · ')}
            </p>
            <div className="mt-3 min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="py-1 font-semibold">Jogador</th>
                    <th className="py-1 font-semibold">Cargo</th>
                    <th className="py-1 text-right font-semibold">Pontos</th>
                    <th className="py-1 text-right font-semibold" title="Vezes Presidente">
                      <RoleBadge role="PRESIDENTE" size={16} className="ml-auto" />
                    </th>
                    <th className="py-1 text-right font-semibold" title="Vezes Olho">
                      <RoleBadge role="OLHO" size={16} className="ml-auto" />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.playerId}
                      className={clsx(
                        'border-t border-line',
                        row.playerId === selfId && 'text-gold',
                        !row.seated && 'opacity-60',
                      )}
                    >
                      <td className="max-w-36 truncate py-1.5 font-medium">
                        {nameOf(row.playerId)}
                        {!row.seated && <span className="text-xs text-subtle"> · saiu</span>}
                      </td>
                      <td className="py-1.5">
                        {row.role ? (
                          <RoleBadge role={row.role} size={18} />
                        ) : (
                          <span className="text-xs text-subtle">—</span>
                        )}
                      </td>
                      <td
                        className={clsx(
                          'py-1.5 text-right font-semibold tabular-nums',
                          row.points > 0 ? 'text-success' : row.points < 0 ? 'text-danger' : 'text-ivory/70',
                        )}
                      >
                        {signedPoints(row.points)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-ivory/70">{row.presidentCount}</td>
                      <td className="py-1.5 text-right tabular-nums text-ivory/70">{row.olhoCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Top strip: which game and trick, the rules that differ, and the scoreboard button. */
export function Banner({
  scene,
  myPoints,
  onShowScores,
}: {
  scene: Scene;
  myPoints: number | null;
  onShowScores: () => void;
}) {
  const { rules } = scene;
  const notes = [
    !rules.allowFinishWithPower && 'Não se acaba com 2/joker',
    !rules.fourOfAKindCuts && 'Quatro seguidos não cortam',
    !rules.sameCardEscape && 'Sem escapar ao salto',
    !rules.firstTrickNoPower && '2 e joker logo na 1.ª vaza',
  ].filter((note): note is string => typeof note === 'string');
  return (
    <div className="relative z-30 flex shrink-0 items-center gap-2 px-3 pt-2">
      <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-xs font-semibold text-ivory/85 backdrop-blur-sm">
        {scene.displayName} · Jogo {Math.max(1, scene.gameNumber)}
        {scene.phase === 'PLAYING' && ` · Vaza ${scene.trick.number}`}
      </span>
      <div className="hidden min-w-0 flex-1 gap-1 overflow-hidden sm:flex">
        {notes.map((note) => (
          <span
            key={note}
            className="whitespace-nowrap rounded-full bg-black/25 px-2 py-0.5 text-[11px] text-ivory/60"
          >
            {note}
          </span>
        ))}
      </div>
      <button
        type="button"
        onClick={onShowScores}
        className="ml-auto flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 text-xs font-semibold text-ivory backdrop-blur-sm hover:bg-black/50"
      >
        <RoleBadge role="PRESIDENTE" size={16} />
        Marcador
        {myPoints !== null && (
          <span
            className={clsx(
              'tabular-nums',
              myPoints > 0 ? 'text-success' : myPoints < 0 ? 'text-danger' : 'text-ivory/60',
            )}
          >
            {signedPoints(myPoints)}
          </span>
        )}
      </button>
    </div>
  );
}
