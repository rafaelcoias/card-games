'use client';

import type { HighCardAction, HighCardView } from '@cardroom/high-card';
import { Card, CardFan, MotionCard } from '@cardroom/ui';
import clsx from 'clsx';
import { useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { describeError } from '@/lib/errors';
import { toast } from '@/lib/toast';
import { TurnRing } from '../shared/turn-ring';
import { useLatestGameView } from '../shared/use-game-view';
import { useTableLayout } from '../shared/use-media';
import type { GameTableProps } from '../types';

/** Minimal table for the "highest card" test game. */
export function HighCardTable({ room, selfId, sendAction }: GameTableProps) {
  const message = useLatestGameView<HighCardView, HighCardAction>();
  const layout = useTableLayout();
  const [sending, setSending] = useState(false);
  if (!message) return <div className="felt h-full" />;

  const { view, validActions } = message;
  const playable = new Set(validActions.map((a) => a.cardId));
  const nameOf = (id: string) => room.players.find((p) => p.id === id)?.username ?? '—';

  const play = async (cardId: string) => {
    if (sending || !playable.has(cardId)) return;
    setSending(true);
    const ack = await sendAction({ type: 'PLAY_CARD', cardId });
    setSending(false);
    if (!ack.ok) toast.error(describeError(ack.error));
  };

  return (
    <div className="felt flex h-full flex-col items-center justify-between gap-6 overflow-hidden px-4 py-6">
      <div className="text-center">
        <p className="font-display text-2xl font-semibold">
          Ronda {Math.min(view.round, view.rounds)} de {view.rounds}
        </p>
        <p className="text-sm text-ivory/70">
          Todos jogam uma carta ao mesmo tempo — a mais alta ganha a ronda.
        </p>
      </div>

      <div className="flex flex-wrap items-start justify-center gap-6">
        {view.seats.map((seat) => {
          const lastCard = view.lastRound?.plays[seat.id];
          const won = view.lastRound?.winners.includes(seat.id);
          return (
            <div key={seat.id} className="flex flex-col items-center gap-2">
              <TurnRing active={!seat.hasCommitted && view.phase === 'PLAYING'} timer={null} size={44}>
                <Avatar name={nameOf(seat.id)} size={44} />
              </TurnRing>
              <p className="text-sm font-semibold">
                {seat.id === selfId ? 'Tu' : nameOf(seat.id)} ·{' '}
                <span className="text-gold">{seat.score} pts</span>
              </p>
              <div
                className={clsx(
                  'rounded-[var(--radius-card)]',
                  won && 'ring-2 ring-gold ring-offset-2 ring-offset-felt',
                )}
              >
                {seat.hasCommitted ? (
                  <Card faceDown size="sm" label="Carta jogada" />
                ) : lastCard ? (
                  <Card id={lastCard.id} size="sm" />
                ) : (
                  <div className="cr-slot" style={{ width: 56, height: 78 }} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-3">
        <p className="text-sm text-ivory/80" role="status">
          {view.phase === 'FINISHED'
            ? 'Fim da partida'
            : playable.size > 0
              ? 'Escolhe a tua carta'
              : 'À espera dos outros jogadores…'}
        </p>
        <CardFan
          items={view.hand}
          size={layout === 'desktop' ? 'lg' : 'md'}
          getKey={(c) => c.id}
          renderItem={(card, placement) => (
            <MotionCard
              id={card.id}
              size={layout === 'desktop' ? 'lg' : 'md'}
              layoutId={`hc-${card.id}`}
              rotate={placement.rotate}
              interactive={playable.size > 0}
              state={playable.size === 0 ? 'normal' : 'playable'}
              onClick={() => void play(card.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void play(card.id);
                }
              }}
            />
          )}
        />
      </div>
    </div>
  );
}
