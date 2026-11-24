import { CONTRACTS } from '../tuning.ts';

export const releaseCost = (wage: number, racesLeft: number): number =>
  Math.ceil(CONTRACTS.releaseShare * wage * racesLeft);
