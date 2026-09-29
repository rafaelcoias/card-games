'use client';

import type { ConfigValue } from '@cardroom/game-core';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { GAME_CLIENTS, findGameClient } from '@/games/registry';
import { describeError } from '@/lib/errors';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';

export function CreateRoomDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { createRoom } = useRoomCommands();
  const [gameId, setGameId] = useState(GAME_CLIENTS[0]?.id ?? 'mexicana');
  const game = findGameClient(gameId) ?? GAME_CLIENTS[0];
  const [maxPlayers, setMaxPlayers] = useState(game?.defaultMaxPlayers ?? 4);
  const [isPrivate, setIsPrivate] = useState(true);
  const [settings, setSettings] = useState<Record<string, ConfigValue>>({});
  const [loading, setLoading] = useState(false);

  if (!game) return null;
  const playerCounts = Array.from(
    { length: game.maxPlayers - game.minPlayers + 1 },
    (_, i) => game.minPlayers + i,
  );
  const valueOf = (key: string): ConfigValue | undefined =>
    settings[`${game.id}:${key}`] ?? game.defaults[key];
  const config = Object.fromEntries(
    game.settings.map((s) => [s.key, valueOf(s.key)] as const).filter(([, v]) => v !== undefined),
  ) as Record<string, ConfigValue>;
  const tableError = game.validateTable(config, maxPlayers);

  async function submit() {
    if (!game || tableError) return;
    setLoading(true);
    const ack = await createRoom({ gameId: game.id, maxPlayers, isPrivate, config });
    setLoading(false);
    if (!ack.ok) {
      toast.error(describeError(ack.error));
      return;
    }
    useRealtime.getState().enterRoom(ack.data.room, ack.data.chat);
    onClose();
    router.push(`/room/${ack.data.room.code}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nova sala"
      description="Escolhe o jogo e as regras da mesa."
      wide
    >
      <div className="flex flex-col gap-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Jogo</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {GAME_CLIENTS.map((g) => (
              <label
                key={g.id}
                className={clsx(
                  'cursor-pointer rounded-xl border p-3 transition-colors',
                  g.id === gameId ? 'border-gold/70 bg-gold/8' : 'border-line-strong hover:border-white/25',
                )}
              >
                <input
                  type="radio"
                  name="game"
                  value={g.id}
                  checked={g.id === gameId}
                  onChange={() => {
                    setGameId(g.id);
                    setMaxPlayers(g.defaultMaxPlayers);
                  }}
                  className="sr-only"
                />
                <span className="block font-semibold">{g.name}</span>
                <span className="mt-0.5 block text-sm text-muted">{g.tagline}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Segmented
          legend="Jogadores"
          options={playerCounts.map((n) => ({ label: `${n}`, value: n }))}
          value={maxPlayers}
          onChange={setMaxPlayers}
        />

        {game.settings.map((setting) => (
          <Segmented
            key={`${game.id}-${setting.key}`}
            legend={setting.label}
            help={setting.help}
            options={setting.options.map((option) => ({
              ...option,
              // Options that could never seat this many players (e.g. not enough cards).
              disabled: game.validateTable({ ...config, [setting.key]: option.value }, maxPlayers) !== null,
            }))}
            value={valueOf(setting.key)}
            onChange={(value) => setSettings((s) => ({ ...s, [`${game.id}:${setting.key}`]: value }))}
          />
        ))}

        {tableError && (
          <p className="-mt-3 text-sm text-danger" role="alert">
            {tableError.message}
          </p>
        )}

        <Segmented
          legend="Visibilidade"
          options={[
            { label: 'Privada (só com código)', value: 0 },
            { label: 'Pública', value: 1 },
          ]}
          value={isPrivate ? 0 : 1}
          onChange={(v) => setIsPrivate(v === 0)}
        />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={loading} disabled={tableError !== null}>
            Criar sala
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Segmented<T extends ConfigValue>({
  legend,
  help,
  options,
  value,
  onChange,
}: {
  legend: string;
  help?: string;
  options: readonly { label: string; value: T; disabled?: boolean }[];
  value: T | undefined;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-ink/60 p-1">
        {options.map((option) => (
          <label
            key={String(option.value)}
            className={clsx(
              'flex min-h-9 min-w-11 flex-1 items-center justify-center rounded-lg px-3 py-1.5 text-center text-sm font-medium leading-tight transition-colors',
              option.value === value ? 'bg-surface-3 text-ivory shadow' : 'text-muted',
              option.disabled
                ? 'cursor-not-allowed line-through opacity-40'
                : option.value !== value && 'cursor-pointer hover:text-ivory',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={legend}
              checked={option.value === value}
              disabled={option.disabled && option.value !== value}
              onChange={() => onChange(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      {help && <p className="mt-1.5 text-xs text-subtle">{help}</p>}
    </fieldset>
  );
}
