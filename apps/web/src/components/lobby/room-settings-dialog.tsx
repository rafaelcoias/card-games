'use client';

import { matchingPreset, type ConfigField, type ConfigValue } from '@cardroom/game-core';
import type { RoomState } from '@cardroom/shared';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { GAME_CLIENTS, findGameClient } from '@/games/registry';
import type { GameClientDefinition } from '@/games/types';
import { describeError } from '@/lib/errors';
import { useRoomCommands } from '@/lib/realtime/socket-provider';
import { useRealtime } from '@/lib/realtime/store';
import { toast } from '@/lib/toast';

export interface RoomSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  /** The room whose game and rules the host changes between matches; a new room when absent. */
  room?: RoomState;
}

/** Settings are kept per game, so going back to a game finds its choices as they were left. */
const settingKey = (gameId: string, key: string) => `${gameId}:${key}`;

/**
 * Picks the game of a room (UI: a grid of names, a line about the one
 * chosen) and its visibility — public by default. The rules are the game's
 * defaults unless the host opens "Personalizar". Mount it again (a new `key`)
 * each time it opens, so it starts from the room as it is.
 */
export function RoomSettingsDialog({ open, onClose, room }: RoomSettingsDialogProps) {
  const router = useRouter();
  const { createRoom, configureRoom } = useRoomCommands();
  const seated = room?.players.length ?? 1;
  const [gameId, setGameId] = useState(room?.gameId ?? GAME_CLIENTS[0]?.id ?? 'mexicana');
  const [isPrivate, setIsPrivate] = useState(room?.isPrivate ?? false);
  const [customising, setCustomising] = useState(false);
  const [maxPlayersByGame, setMaxPlayersByGame] = useState<Record<string, number>>(
    room ? { [room.gameId]: room.maxPlayers } : {},
  );
  const [settings, setSettings] = useState<Record<string, ConfigValue>>(() =>
    room
      ? Object.fromEntries(
          Object.entries(room.config).map(([key, value]) => [
            settingKey(room.gameId, key),
            value as ConfigValue,
          ]),
        )
      : {},
  );
  const [loading, setLoading] = useState(false);

  const game = findGameClient(gameId) ?? GAME_CLIENTS[0];
  if (!game) return null;

  const maxPlayers = Math.min(
    game.maxPlayers,
    maxPlayersByGame[game.id] ?? Math.max(game.defaultMaxPlayers, seated),
  );
  const valueOf = (key: string): ConfigValue | undefined =>
    settings[settingKey(game.id, key)] ?? game.defaults[key];
  const config = Object.fromEntries(
    game.settings.map((s) => [s.key, valueOf(s.key)] as const).filter(([, v]) => v !== undefined),
  ) as Record<string, ConfigValue>;
  const tableError = game.validateTable(config, maxPlayers);
  const customised =
    maxPlayersByGame[game.id] !== undefined ||
    game.settings.some((s) => settings[settingKey(game.id, s.key)] !== undefined);
  const gameChanged = room !== undefined && game.id !== room.gameId;
  /**
   * A setting chosen by hand. A preset also sets the settings it names; any
   * other change turns each preset into the option the settings now match
   * (or its "custom" value).
   */
  const choose = (key: string, value: ConfigValue) => {
    const field = game.settings.find((s) => s.key === key);
    const next: Record<string, ConfigValue> = { ...config, [key]: value };
    Object.assign(next, field?.presets?.[String(value)] ?? {});
    for (const preset of game.settings) {
      if (preset.presets && preset.key !== key) next[preset.key] = matchingPreset(preset, next);
    }
    setSettings((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(next).map(([k, v]) => [settingKey(game.id, k), v])),
    }));
  };
  const prominent = game.settings.filter((s) => s.prominent);
  const groups = groupSettings(game.settings.filter((s) => !s.prominent));
  const playerCounts = Array.from(
    { length: game.maxPlayers - game.minPlayers + 1 },
    (_, i) => game.minPlayers + i,
  );

  async function submit() {
    if (!game || tableError) return;
    setLoading(true);
    const payload = { gameId: game.id, maxPlayers, isPrivate, config };
    if (room) {
      const ack = await configureRoom(payload);
      setLoading(false);
      if (!ack.ok) return void toast.error(describeError(ack.error));
      if (gameChanged) toast.success(`A sala passou para ${game.name}`);
      onClose();
      return;
    }
    const ack = await createRoom(payload);
    setLoading(false);
    if (!ack.ok) return void toast.error(describeError(ack.error));
    useRealtime.getState().enterRoom(ack.data.room, ack.data.chat);
    onClose();
    router.push(`/room/${ack.data.room.code}`);
  }

  const submitLabel = !room ? 'Criar sala' : gameChanged ? `Mudar para ${game.name}` : 'Guardar';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={room ? 'Mudar o jogo' : 'Nova sala'}
      description={
        room ? 'Os mesmos jogadores, outro jogo ou outras regras.' : 'Escolhe o jogo e cria a mesa.'
      }
      wide
      fullScreenOnMobile
      footer={
        <div className="flex flex-col gap-3">
          <AnimatePresence initial={false}>
            {gameChanged && room?.lastResult && (
              <motion.p
                key="warning"
                role="alert"
                className="rounded-xl border border-gold/30 bg-gold/10 px-3 py-2 text-sm text-ivory/90"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                Mudar de jogo recomeça a mesa: a última partida e a sequência do {room.gameName} (quem começa,
                cargos, continuidade da sessão) perdem-se. Os jogadores ficam na sala.
              </motion.p>
            )}
          </AnimatePresence>
          <div className="flex gap-2 sm:justify-end">
            <Button variant="ghost" onClick={onClose} className="max-sm:flex-1">
              Cancelar
            </Button>
            <Button
              onClick={() => void submit()}
              loading={loading}
              disabled={tableError !== null}
              className="max-sm:flex-[2]"
            >
              {submitLabel}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-6">
        <section>
          <GamePicker value={game.id} seated={seated} onChange={setGameId} />
          <GameBlurb game={game} />
        </section>

        {prominent.map((setting) => (
          <PresetCards
            key={`${game.id}-${setting.key}`}
            setting={setting}
            value={valueOf(setting.key)}
            onChange={(value) => choose(setting.key, value)}
          />
        ))}

        <Segmented
          legend="Visibilidade"
          options={[
            { label: 'Pública', value: false },
            { label: 'Privada', value: true },
          ]}
          value={isPrivate}
          onChange={setIsPrivate}
          help={
            isPrivate
              ? 'Só entra quem tiver o código ou o link.'
              : 'Aparece na lista de salas: qualquer pessoa pode entrar.'
          }
        />

        <section className="rounded-2xl border border-line bg-ink/30">
          <button
            type="button"
            onClick={() => setCustomising((on) => !on)}
            aria-expanded={customising}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors hover:bg-white/3"
          >
            <span className="flex-1">
              <span className="block text-sm font-semibold">Personalizar</span>
              <span className="block text-xs text-subtle">
                {customised ? 'Regras à tua medida' : 'Regras padrão'} · até {maxPlayers} jogadores
              </span>
            </span>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={clsx('size-5 text-muted transition-transform', customising && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 8l5 5 5-5" />
            </svg>
          </button>
          <AnimatePresence initial={false}>
            {customising && (
              <motion.div
                key={game.id}
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <div className="flex flex-col gap-5 border-t border-line px-4 pb-4 pt-4">
                  <Segmented
                    legend="Jogadores"
                    options={playerCounts.map((n) => ({ label: `${n}`, value: n, disabled: n < seated }))}
                    value={maxPlayers}
                    onChange={(n) => setMaxPlayersByGame((m) => ({ ...m, [game.id]: n }))}
                  />
                  {groups.map(({ group, settings: fields }) => (
                    <div key={group ?? ''} className="flex flex-col gap-5">
                      {group && (
                        <p className="-mb-2 text-xs font-bold uppercase tracking-[0.14em] text-subtle">
                          {group}
                        </p>
                      )}
                      {fields.map((setting) => (
                        <Segmented
                          key={`${game.id}-${setting.key}`}
                          legend={setting.label}
                          help={setting.help}
                          options={setting.options.map((option) => ({
                            ...option,
                            // Options that could never be played here (e.g. not enough cards, rules that lock).
                            disabled:
                              game.validateTable({ ...config, [setting.key]: option.value }, maxPlayers) !==
                              null,
                          }))}
                          value={valueOf(setting.key)}
                          onChange={(value) => choose(setting.key, value)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {tableError && (
            <p className="border-t border-line px-4 py-3 text-sm text-danger" role="alert">
              {tableError.message}
            </p>
          )}
        </section>
      </div>
    </Modal>
  );
}

/** Settings in their groups, in the order the game lists them (ungrouped ones first). */
function groupSettings(fields: readonly ConfigField[]): { group?: string; settings: ConfigField[] }[] {
  const groups: { group?: string; settings: ConfigField[] }[] = [];
  for (const field of fields) {
    const last = groups.at(-1);
    if (last && last.group === field.group) last.settings.push(field);
    else groups.push({ group: field.group, settings: [field] });
  }
  return groups;
}

/** A game's presets as big cards, always in sight: each says in a line what it changes. */
function PresetCards({
  setting,
  value,
  onChange,
}: {
  setting: ConfigField;
  value: ConfigValue | undefined;
  onChange: (value: ConfigValue) => void;
}) {
  const id = useId();
  // The "custom" option is a state the host reaches by changing a setting, not a card to pick.
  const options = setting.options.filter((o) => o.value !== setting.customValue || o.value === value);
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className="mb-2 text-sm font-medium">
        {setting.label}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => onChange(option.value)}
              className={clsx(
                'flex min-h-20 flex-col items-start justify-center gap-1 rounded-xl border px-3 py-2.5 text-left transition-colors',
                checked
                  ? 'border-gold/70 bg-gold/10 shadow-[0_0_0_1px_rgb(232_193_112/0.35)_inset]'
                  : 'border-line-strong bg-surface-2/60 hover:border-white/25 hover:bg-surface-2',
              )}
            >
              <span
                className={clsx('font-display text-base font-semibold', checked ? 'text-gold' : 'text-ivory')}
              >
                {option.label}
              </span>
              {option.hint && <span className="text-xs leading-snug text-subtle">{option.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Just the names, two or three to a row; a game that cannot seat everyone here is greyed out. */
function GamePicker({
  value,
  seated,
  onChange,
}: {
  value: string;
  seated: number;
  onChange: (gameId: string) => void;
}) {
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className="mb-2 text-sm font-medium">
        Jogo
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GAME_CLIENTS.map((g) => {
          const checked = g.id === value;
          const tooSmall = seated > g.maxPlayers;
          return (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={tooSmall}
              onClick={() => onChange(g.id)}
              title={tooSmall ? `Até ${g.maxPlayers} jogadores` : undefined}
              className={clsx(
                'flex h-16 items-center justify-center rounded-xl border px-3 text-center font-display text-lg font-semibold tracking-tight transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                checked
                  ? 'border-gold/70 bg-gold/10 text-gold shadow-[0_0_0_1px_rgb(232_193_112/0.35)_inset]'
                  : 'border-line-strong bg-surface-2/60 text-ivory hover:border-white/25 hover:bg-surface-2',
              )}
            >
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A line about the chosen game, under the grid. */
function GameBlurb({ game }: { game: GameClientDefinition }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={game.id}
        className="mt-3 rounded-xl bg-white/3 px-4 py-3"
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.15 }}
        aria-live="polite"
      >
        <p className="text-sm text-ivory/90">{game.tagline}</p>
        <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs text-subtle">
          <span className="rounded-full bg-white/5 px-2 py-0.5">
            {game.minPlayers === game.maxPlayers
              ? `${game.minPlayers} jogadores`
              : `${game.minPlayers}–${game.maxPlayers} jogadores`}
          </span>
          {game.lifecycle === 'SESSION' && (
            <span className="rounded-full bg-white/5 px-2 py-0.5">Mesa contínua</span>
          )}
        </p>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * One choice among a few, as a row of buttons (`role="radio"`). Real buttons,
 * not labels over hidden inputs: a tap lands where it looks, and focusing a
 * hidden input never scrolls the dialog away under the finger.
 */
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
  const id = useId();
  return (
    <div role="radiogroup" aria-labelledby={id}>
      <p id={id} className="mb-2 text-sm font-medium">
        {legend}
      </p>
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-ink/60 p-1">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              disabled={option.disabled && !checked}
              onClick={() => onChange(option.value)}
              className={clsx(
                'flex min-h-10 min-w-11 flex-1 items-center justify-center rounded-lg px-3 py-1.5 text-center text-sm font-medium leading-tight transition-colors',
                checked ? 'bg-surface-3 text-ivory shadow' : 'text-muted hover:text-ivory',
                option.disabled && 'line-through opacity-40 disabled:cursor-not-allowed',
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {help && <p className="mt-1.5 text-xs text-subtle">{help}</p>}
    </div>
  );
}
