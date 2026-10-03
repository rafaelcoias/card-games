'use client';

import type { Suit } from '@cardroom/game-core';
import type { HandSummary, Seat, Team } from '@cardroom/sueca';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { Modal } from '@/components/ui/modal';
import { games, handVerdict, isRed, pointsLine, SUIT_NAME, SUIT_SYMBOL } from './copy';

const them = (team: Team): Team => (team === 'A' ? 'B' : 'A');

/** Top corner, always there and minimal: "Nós 1 · Eles 0", "a 4" (UI §9). Opens the hands played. */
export function ScoreCorner({
  games: score,
  targetGames,
  myTeam,
  matchesWon,
  onOpen,
}: {
  games: Record<Team, number>;
  targetGames: number;
  myTeam: Team | null;
  matchesWon: Record<Team, number>;
  onOpen: () => void;
}) {
  const us = myTeam ?? 'A';
  const tally = matchesWon.A + matchesWon.B > 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="absolute right-2 top-2 z-30 rounded-xl bg-black/30 px-3 py-1.5 text-right leading-tight hover:bg-black/45"
      aria-label={`Marcador: nós ${score[us]}, eles ${score[them(us)]}, partida a ${targetGames}. Ver as mãos`}
    >
      <span className="block text-sm font-semibold tabular-nums text-ivory">
        {myTeam ? 'Nós' : 'A'} {score[us]} · {myTeam ? 'Eles' : 'B'} {score[them(us)]}
      </span>
      <span className="block text-[11px] text-ivory/55">
        a {targetGames}
        {tally && (
          <span className="tabular-nums">
            {' '}
            · partidas {matchesWon[us]}–{matchesWon[them(us)]}
          </span>
        )}
      </span>
    </button>
  );
}

/** The trump suit, in a corner, for the whole hand: just the symbol, big, outlined (UI §4). */
export function TrumpCorner({ suit }: { suit: Suit | null }) {
  return (
    <AnimatePresence>
      {suit && (
        <motion.div
          key={suit}
          className="pointer-events-none absolute left-3 top-1 z-30 select-none"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          role="img"
          aria-label={`Trunfo: ${SUIT_NAME[suit]}`}
        >
          <span
            className={clsx('block text-5xl leading-none', isRed(suit) ? 'text-card-red/90' : 'text-ink/80')}
            style={{ WebkitTextStroke: '1.5px rgb(244 239 227 / 0.85)', paintOrder: 'stroke fill' }}
          >
            {SUIT_SYMBOL[suit]}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The end of a hand, sober, for 5 s or until tapped (UI §8). */
export function HandSummaryPanel({
  summary,
  myTeam,
  games: score,
  targetGames,
  onClose,
}: {
  summary: HandSummary | null;
  myTeam: Team | null;
  games: Record<Team, number>;
  targetGames: number;
  onClose: () => void;
}) {
  const us = myTeam ?? 'A';
  return (
    <AnimatePresence>
      {summary && (
        <motion.div
          key={summary.hand}
          className="absolute inset-0 z-40 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            role="status"
            className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/75 px-6 py-5 text-center shadow-2xl backdrop-blur-md"
            initial={{ scale: 0.94, y: 8 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-ivory/50">Mão {summary.hand}</p>
            <p className="mt-2 font-display text-3xl font-semibold tabular-nums">
              {pointsLine(summary, myTeam)}
            </p>
            <p
              className={clsx(
                'mt-1 text-base font-semibold',
                summary.gamesAwarded[us] > 0
                  ? 'text-gold'
                  : summary.gamesAwarded[them(us)] > 0
                    ? 'text-ivory/80'
                    : 'text-ivory/60',
              )}
            >
              {handVerdict(summary, myTeam)}
            </p>
            <p className="mt-3 border-t border-white/10 pt-3 text-sm tabular-nums text-ivory/70">
              {myTeam ? 'Nós' : 'A'} {score[us]} · {myTeam ? 'Eles' : 'B'} {score[them(us)]}{' '}
              <span className="text-ivory/45">(a {targetGames})</span>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Hands played: who dealt, the trump, the points and the games (UI §9). */
export function HandsTable({
  hands,
  myTeam,
  dealerName,
}: {
  hands: readonly HandSummary[];
  myTeam: Team | null;
  dealerName: (seat: Seat) => string;
}) {
  const us = myTeam ?? 'A';
  if (hands.length === 0) return <p className="text-sm text-muted">Ainda nenhuma mão terminou.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-subtle">
          <th className="py-1 pr-2 font-semibold">Mão</th>
          <th className="py-1 pr-2 font-semibold">Deu</th>
          <th className="py-1 pr-2 font-semibold">Trunfo</th>
          <th className="py-1 pr-2 text-right font-semibold">{myTeam ? 'Nós–Eles' : 'A–B'}</th>
          <th className="py-1 text-right font-semibold">Jogos</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {hands.map((hand) => {
          const mine = hand.gamesAwarded[us];
          const theirs = hand.gamesAwarded[them(us)];
          return (
            <tr key={hand.hand}>
              <td className="py-1.5 pr-2 tabular-nums text-subtle">{hand.hand}</td>
              <td className="max-w-24 truncate py-1.5 pr-2">{dealerName(hand.dealer)}</td>
              <td
                className={clsx(
                  'py-1.5 pr-2 text-lg leading-none',
                  isRed(hand.trumpSuit) ? 'text-card-red' : '',
                )}
              >
                <span aria-label={SUIT_NAME[hand.trumpSuit]}>{SUIT_SYMBOL[hand.trumpSuit]}</span>
              </td>
              <td className="py-1.5 pr-2 text-right tabular-nums">
                {hand.points[us]}–{hand.points[them(us)]}
              </td>
              <td
                className={clsx(
                  'py-1.5 text-right tabular-nums',
                  mine > 0 ? 'font-semibold text-gold' : theirs > 0 ? 'text-ivory/80' : 'text-subtle',
                )}
              >
                {mine > 0 ? `+${mine}` : theirs > 0 ? `−${theirs}` : '0'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** The match so far, in a panel that opens from the score (UI §9). */
export function HistoryPanel({
  open,
  onClose,
  hands,
  myTeam,
  score,
  targetGames,
  dealerName,
}: {
  open: boolean;
  onClose: () => void;
  hands: readonly HandSummary[];
  myTeam: Team | null;
  score: Record<Team, number>;
  targetGames: number;
  dealerName: (seat: Seat) => string;
}) {
  const us = myTeam ?? 'A';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${myTeam ? 'Nós' : 'A'} ${score[us]} · ${myTeam ? 'Eles' : 'B'} ${score[them(us)]}`}
      description={`Partida a ${games(targetGames)}.`}
    >
      <HandsTable hands={hands} myTeam={myTeam} dealerName={dealerName} />
    </Modal>
  );
}
