import { SHIPS, WINTER } from '../tuning.ts';

export const winterLoss = (upkeep: number | null): number =>
  upkeep === null
    ? WINTER.lossWithout
    : WINTER.loss - WINTER.perUpkeep * upkeep;

export const wintered = (level: number, loss: number): number =>
  Math.max(SHIPS.leastLevel, level - loss);
