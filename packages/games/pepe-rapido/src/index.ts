export { PEPE_ID, createPepeModule, pepeActionSchema, pepeRapido } from './module';
export type { PepeModule } from './module';
export {
  PRESETS,
  applyPreset,
  normalisePreset,
  pepeConfigSchema,
  pepeConfigUi,
  rulesBadge,
  validatePepeConfig,
} from './config';
export { setup, shuffledDealer, type DealInput, type Dealer } from './engine';
export {
  COLUMN_COUNT,
  COLUMN_SIZES,
  MAX_IDLE_RECYCLES,
  canGroup,
  fitsCentre,
  layOut,
  rankValue,
  resolveRace,
  type RaceOutcome,
} from './rules';
export type * from './types';
