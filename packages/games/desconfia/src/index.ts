export {
  createDesconfiaModule,
  desconfia,
  desconfiaActionSchema,
  desconfiaConfigSchema,
  desconfiaConfigUi,
  DESCONFIA_ID,
} from './module';
export type { DesconfiaModule } from './module';
export { shuffledDealer, type DealInput, type Dealer } from './engine';
export { MAX_PLAYERS, MIN_PLAYERS, STARTER_CARD, compareCards, isTruthful } from './rules';
export type * from './types';
