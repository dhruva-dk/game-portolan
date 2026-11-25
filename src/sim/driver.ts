import { clamp } from '../world/scalar.ts';
import type { DriverStats } from './setup.ts';
import type { Temper, Trick } from './temper.ts';
import { DRIVER, TRICKS } from './tuning.ts';

export const STEADY = {
  fight: 3.3 / 6,
  margin: 175 / 6,
  standoff: 1,
  loot: 3.35 / 6,
  mend: 60,
  claim: 3.45 / 6,
  skill: 3.65 / 6,
  aggro: 0.6,
} as const;

export const byStat = (
  [atLeast, atMost]: readonly [number, number],
  stat: number
): number => {
  const { least, most } = DRIVER.stat;
  return atLeast + (atMost - atLeast) * clamp((stat - least) / (most - least));
};

export const wanting = (x: number): number =>
  DRIVER.want.base + (DRIVER.want.slope * x) / DRIVER.want.over;

export function driver(stats: DriverStats): Temper {
  const { nerve, territory } = stats,
    on = (t: Trick) => stats[TRICKS[t].stat] >= TRICKS[t].needs;
  return {
    ...STEADY,
    gunnery: byStat(DRIVER.aim, stats.gunnery),
    react: byStat(DRIVER.react, stats.gunnery),
    helm: byStat(DRIVER.helm, stats.helm),
    run: byStat(DRIVER.breakOff, nerve),
    loop: byStat(DRIVER.loop, territory),
    setOff: byStat(DRIVER.setOff, stats.stormcraft),
    notice: byStat(DRIVER.notice, stats.lookout),
    wants: {
      storm: 1,
      heal: 1,
      loot: 1,
      roam: 1,
      fight: wanting(nerve),
      hunt: wanting(nerve),
      claim: wanting(territory),
      flee: wanting(DRIVER.want.flip - nerve),
    },
    tricks: {
      lead: on('lead'),
      returnFire: on('returnFire'),
      dodge: on('dodge'),
      outrun: on('outrun'),
      loops: on('loops'),
      healUnderFire: on('healUnderFire'),
    },
  };
}
