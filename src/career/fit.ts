import type { GunKind } from '../sim/kinds.ts';
import type { ShipValues } from '../sim/setup.ts';
import { LEVEL_SPAN, LEVEL_VALUES, MECHANIC_VALUES } from './tuning.ts';

type LevelValue = keyof typeof LEVEL_VALUES;
type MechanicValue = keyof typeof MECHANIC_VALUES;

export type FittedLevels = Readonly<
  Record<(typeof LEVEL_VALUES)[LevelValue]['line'], number>
>;

export type MechanicStats = Readonly<
  Record<(typeof MECHANIC_VALUES)[MechanicValue]['stat'], number>
>;

export function shipValues(
  levels: FittedLevels,
  gun: GunKind,
  mechanic: MechanicStats | null
): ShipValues {
  const leveled = (value: LevelValue): number => {
    const { line, atZero, atHundred } = LEVEL_VALUES[value];
    const f =
      (levels[line] - LEVEL_SPAN.least) / (LEVEL_SPAN.most - LEVEL_SPAN.least);
    return atZero * (1 - f) + atHundred * f;
  };
  const tended = (value: MechanicValue): number => {
    const { stat, none, base, perPoint } = MECHANIC_VALUES[value];
    return mechanic === null ? none : base + perPoint * mechanic[stat];
  };
  return {
    topSpeed: leveled('topSpeed'),
    gather: leveled('gather'),
    turnRate: leveled('turnRate'),
    hullPoints: leveled('hullPoints'),
    spreadFactor: leveled('spreadFactor'),
    reloadFactor: leveled('reloadFactor'),
    gun,
    damageFactor: leveled('damageFactor'),
    assistCone: leveled('assistCone'),
    gustCapacity: leveled('gustCapacity'),
    shieldRate: tended('shieldRate'),
    healTime: tended('healTime'),
    healFactor: tended('healFactor'),
  };
}
