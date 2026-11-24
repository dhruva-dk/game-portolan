import { personName } from '../names.ts';
import { DRIVER_STATS, type Owner } from '../state.ts';
import { OWNERS } from '../tuning.ts';
import { drawnPeak } from './peak.ts';
import { portraitOf } from './person.ts';

export const generateOwner = (seed: string, id: number): Owner => ({
  id,
  name: personName(seed, id),
  portrait: portraitOf(seed, id),
  stats: drawnPeak(seed, id, DRIVER_STATS.length, OWNERS.level),
});
