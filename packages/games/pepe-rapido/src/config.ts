import { matchingPreset, type ConfigField, type GameError } from '@cardroom/game-core';
import { z } from 'zod';
import type { PepeConfig, Preset } from './types';

type PresetValues = Pick<
  PepeConfig,
  'direction' | 'jokers' | 'aceKingWrap' | 'grouping' | 'showCentreCounts' | 'autoFlip'
>;

/** Rules §9 "Predefinições rápidas": each fills these settings; anything else stays as it is. */
export const PRESETS: Readonly<Record<Exclude<Preset, 'PERSONALIZADO'>, PresetValues>> = {
  CLASSICO: {
    direction: 'UP_DOWN',
    jokers: true,
    aceKingWrap: true,
    grouping: true,
    showCentreCounts: false,
    autoFlip: false,
  },
  PURO: {
    direction: 'UP_DOWN',
    jokers: false,
    aceKingWrap: true,
    grouping: true,
    showCentreCounts: false,
    autoFlip: false,
  },
  INICIANTE: {
    direction: 'UP_ONLY',
    jokers: true,
    aceKingWrap: true,
    grouping: true,
    showCentreCounts: true,
    autoFlip: true,
  },
};

const seconds = (values: readonly number[]) => values.map((s) => ({ label: `${s}s`, value: s * 1000 }));
const yesNo = (yes: string, no: string) => [
  { label: yes, value: true },
  { label: no, value: false },
];

const RULES = 'Regras';
const INFO = 'Informação visível';
const PACE = 'Ritmo';
const MATCH = 'Partida';

/** Room settings (UI §6.1): three preset cards in sight, the rest under "Personalizar". */
export const pepeConfigUi: ConfigField[] = [
  {
    key: 'preset',
    label: 'Predefinição',
    prominent: true,
    options: [
      { label: 'Clássico', value: 'CLASSICO', hint: 'Acima e abaixo, com jokers, montes às cegas' },
      { label: 'Puro', value: 'PURO', hint: 'Como o clássico, mas sem jokers' },
      { label: 'Iniciante', value: 'INICIANTE', hint: 'Só acima, contagens à vista, vira sozinho' },
      { label: 'Personalizado', value: 'PERSONALIZADO', hint: 'As tuas regras' },
    ],
    presets: PRESETS,
    customValue: 'PERSONALIZADO',
  },
  {
    key: 'direction',
    label: 'Sentido das jogadas',
    group: RULES,
    help: 'Sobre um 7: um 6 ou um 8 (acima e abaixo), ou só um 8 (só acima).',
    options: [
      { label: 'Acima e abaixo', value: 'UP_DOWN' },
      { label: 'Só acima', value: 'UP_ONLY' },
    ],
  },
  {
    key: 'jokers',
    label: 'Jokers',
    group: RULES,
    help: 'O joker vale qualquer carta, e sobre ele vai qualquer uma.',
    options: yesNo('Com jokers (54)', 'Sem jokers (52)'),
  },
  {
    key: 'aceKingWrap',
    label: 'Ás e Rei',
    group: RULES,
    help: 'Ligados: sobre um Rei pode ir um Ás (e, acima e abaixo, um Rei sobre um Ás).',
    options: yesNo('Ligam-se', 'Não se ligam'),
  },
  {
    key: 'grouping',
    label: 'Agrupar iguais',
    group: RULES,
    help: 'Pôr uma carta sobre outra coluna do mesmo valor, para libertar a de baixo.',
    options: yesNo('Sim', 'Não'),
  },
  {
    key: 'moveToEmpty',
    label: 'Coluna vazia',
    group: RULES,
    help: 'Levar a carta de cima de outra coluna para uma coluna vazia.',
    options: yesNo('Pode-se ocupar', 'Fica vazia'),
  },
  {
    key: 'showCentreCounts',
    label: 'Cartas dos montes',
    group: INFO,
    help: 'Às cegas, quem acaba a ronda escolhe o monte sem saber quantas cartas tem.',
    options: yesNo('À vista', 'Às cegas'),
  },
  {
    key: 'showOwnReserveCount',
    label: 'A tua reserva',
    group: INFO,
    options: yesNo('Vês quantas tens', 'Escondida'),
  },
  {
    key: 'showOpponentCounts',
    label: 'Cartas do adversário',
    group: INFO,
    help: 'Escondidas, só se sabe se tem reserva.',
    options: yesNo('À vista', 'Escondidas'),
  },
  {
    key: 'countdownMs',
    label: 'Contagem antes de virar',
    group: PACE,
    options: seconds([1, 2, 3, 4, 5]),
  },
  {
    key: 'autoFlip',
    label: 'Quando ninguém pode jogar',
    group: PACE,
    options: [
      { label: 'Os dois carregam em Virar', value: false },
      { label: 'Vira sozinho', value: true },
    ],
  },
  {
    key: 'autoFlipDelayMs',
    label: 'Espera antes de virar sozinho',
    group: PACE,
    options: seconds([1, 2, 3, 4, 5]),
  },
  {
    key: 'rematch',
    label: 'Revanche',
    group: MATCH,
    help: 'Botão para jogar logo outra partida no fim.',
    options: yesNo('Sim', 'Não'),
  },
];

const presetField = pepeConfigUi[0] as ConfigField;

/**
 * A preset that does not match its settings any more is "Personalizado"
 * (contract §1), and settings that match a preset name it — so the room
 * always tells the truth whatever a client sent.
 */
export function normalisePreset(config: PepeConfig): PepeConfig {
  return { ...config, preset: matchingPreset(presetField, { ...config }) as Preset };
}

/** Contract §1: defaults are the classic preset. */
export const pepeConfigSchema = z
  .object({
    preset: z.enum(['CLASSICO', 'PURO', 'INICIANTE', 'PERSONALIZADO']).default('CLASSICO'),
    direction: z.enum(['UP_DOWN', 'UP_ONLY']).default('UP_DOWN'),
    jokers: z.boolean().default(true),
    aceKingWrap: z.boolean().default(true),
    grouping: z.boolean().default(true),
    moveToEmpty: z.boolean().default(true),
    showCentreCounts: z.boolean().default(false),
    showOwnReserveCount: z.boolean().default(true),
    showOpponentCounts: z.boolean().default(false),
    countdownMs: z.number().int().min(1_000).max(5_000).default(3_000),
    autoFlip: z.boolean().default(false),
    autoFlipDelayMs: z.number().int().min(1_000).max(5_000).default(2_000),
    rematch: z.boolean().default(true),
  })
  .transform(normalisePreset) satisfies z.ZodType<PepeConfig, unknown>;

/**
 * Rules that cannot be played out: only upwards, with the ace and the king
 * apart and no jokers, nothing ever goes on top of a king and no ace can ever
 * leave a column — almost every game would lock. Rooms refuse it (the lobby
 * greys out the options that would lead there).
 */
export function validatePepeConfig(
  config: Pick<PepeConfig, 'direction' | 'aceKingWrap' | 'jokers'>,
): GameError | null {
  if (config.direction === 'UP_ONLY' && !config.aceKingWrap && !config.jokers) {
    return {
      code: 'ACES_STUCK',
      message:
        'Só acima, sem jokers e sem ligar o Ás ao Rei, os Ases nunca saem: liga o Ás ao Rei ou junta os jokers.',
    };
  }
  return null;
}

/** The settings a preset fills, for clients that apply one by hand. */
export function applyPreset(config: PepeConfig, preset: Preset): PepeConfig {
  if (preset === 'PERSONALIZADO') return { ...config, preset };
  return { ...config, ...PRESETS[preset], preset };
}

/** Short summary of the rules in play, for the table's badge (UI §1): "↑↓ · com jokers". */
export function rulesBadge(config: Pick<PepeConfig, 'direction' | 'jokers'>): string {
  return `${config.direction === 'UP_DOWN' ? '↑↓' : 'só ↑'} · ${config.jokers ? 'com jokers' : 'sem jokers'}`;
}
