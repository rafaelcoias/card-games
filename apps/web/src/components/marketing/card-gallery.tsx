'use client';

import { createDeck } from '@cardroom/game-core';
import { AnchorProvider, Card, CardSprite, MotionCard, type CardSize, type CardState } from '@cardroom/ui';
import clsx from 'clsx';
import { useState } from 'react';
import { Logo } from '@/components/ui/logo';

const DECK = createDeck({ jokers: 2 });
const SIZES: CardSize[] = ['sm', 'md', 'lg'];
const STATES: { state: CardState; label: string; lifted?: boolean }[] = [
  { state: 'normal', label: 'Normal' },
  { state: 'playable', label: 'Jogável' },
  { state: 'selected', label: 'Selecionada', lifted: true },
  { state: 'disabled', label: 'Não jogável' },
];

/** `/dev/cards`: the full deck in every size and state, for visual approval. */
export function CardGallery() {
  const [size, setSize] = useState<CardSize>('md');
  const [flipped, setFlipped] = useState(false);

  return (
    <AnchorProvider>
      <CardSprite />
      <div className="felt min-h-dvh">
        <header className="sticky top-0 z-10 border-b border-black/30 bg-black/40 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
            <Logo />
            <span className="text-sm text-ivory/70">Baralho: 54 cartas + verso</span>
            <div
              className="ml-auto flex items-center gap-1 rounded-xl bg-black/30 p-1"
              role="radiogroup"
              aria-label="Tamanho"
            >
              {SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={size === s}
                  onClick={() => setSize(s)}
                  className={clsx(
                    'rounded-lg px-3 py-1 text-sm font-semibold',
                    size === s ? 'bg-ivory text-ink' : 'text-ivory/80',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-8">
          <section aria-labelledby="deck">
            <h2 id="deck" className="mb-4 font-display text-2xl font-semibold">
              Todas as cartas
            </h2>
            <ul className="flex flex-wrap gap-3">
              {DECK.map((card) => (
                <li key={card.id} className="flex flex-col items-center gap-1">
                  <Card id={card.id} size={size} />
                  <span className="font-mono text-[11px] text-ivory/60">{card.id}</span>
                </li>
              ))}
              <li className="flex flex-col items-center gap-1">
                <Card faceDown size={size} />
                <span className="font-mono text-[11px] text-ivory/60">verso</span>
              </li>
            </ul>
          </section>

          <section aria-labelledby="states" className="mt-12">
            <h2 id="states" className="mb-4 font-display text-2xl font-semibold">
              Estados
            </h2>
            <div className="flex flex-wrap items-end gap-8">
              {STATES.map(({ state, label, lifted }) => (
                <div key={state} className="flex flex-col items-center gap-2">
                  <MotionCard
                    id="QH"
                    size={size}
                    state={state}
                    lifted={lifted}
                    interactive={state !== 'normal'}
                  />
                  <span className="text-sm text-ivory/70">{label}</span>
                </div>
              ))}
              <div className="flex flex-col items-center gap-2">
                <MotionCard
                  id="10S"
                  faceDown={!flipped}
                  size={size}
                  interactive
                  onClick={() => setFlipped((f) => !f)}
                />
                <span className="text-sm text-ivory/70">A revelar (clica)</span>
              </div>
            </div>
          </section>

          <section aria-labelledby="sizes" className="mt-12">
            <h2 id="sizes" className="mb-4 font-display text-2xl font-semibold">
              Tamanhos
            </h2>
            <div className="flex flex-wrap items-end gap-6">
              {(['xs', 'sm', 'md', 'lg'] as CardSize[]).map((s) => (
                <div key={s} className="flex flex-col items-center gap-2">
                  <Card id="AS" size={s} />
                  <span className="font-mono text-xs text-ivory/60">{s}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </AnchorProvider>
  );
}
