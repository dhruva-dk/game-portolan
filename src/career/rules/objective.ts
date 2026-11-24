import type { ShipResult } from '../../sim/result.ts';
import type { Objective } from '../state.ts';
import { SPONSORS } from '../tuning.ts';
import { meanShare } from './race-money.ts';

export function objectiveMet(
  objective: Objective,
  ships: readonly ShipResult[],
  samples: readonly number[]
): boolean {
  switch (objective) {
    case 'top10':
      return ships.some((ship) => ship.place <= SPONSORS.topPlaces);
    case 'sinkTwo':
      return (
        ships.reduce((sum, ship) => sum + ship.sinkings, 0) >= SPONSORS.sinkings
      );
    case 'sea':
      return meanShare(samples) >= SPONSORS.seaShare;
    case 'bothAfloat':
      return ships.every((ship) => ship.afloatAtPhaseFour);
  }
}
