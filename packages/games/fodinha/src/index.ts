export {
  createFodinhaModule,
  fodinha,
  fodinhaActionSchema,
  fodinhaConfigSchema,
  fodinhaConfigUi,
  FODINHA_ID,
} from './module';
export type { FodinhaModule } from './module';
export { shuffledDealer, type Dealer, type DealInput } from './engine';
export {
  AUTO_PLAY_DELAY_MS,
  FIRST_AUTO_PLAY_DELAY_MS,
  ROUND_SUMMARY_MS,
  TRICK_PAUSE_MS,
  compareCards,
  handSizeCycle,
  handSizeForRound,
  resolveTrick,
  strength,
} from './rules';
export type * from './types';
