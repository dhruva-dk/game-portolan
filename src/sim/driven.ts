// A driver's stats on her bot (race.ts Driver): the
// temperament her seed and her persona draw (temper.ts), moved by her nine
// stats. Her persona and her brain are untouched; a driver of ten in every
// stat is the bot of that seed and persona, to the bit.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import type { DriverStats } from '../race.ts';
import type { Temper } from './temper.ts';

/**
 * What a driver's stats (race.ts DriverStats, each 0…20) make of the
 * temperament her seed draws. Ten in a stat leaves what it moves as drawn. Of
 * a share (0…1), a stat over ten takes it `reach` of the way to 1 at twenty,
 * one under ten `reach` of the way to 0 at nought; of a length (metres, hull),
 * a stat moves it by that share of itself at twenty, and as much the other way
 * at nought. Starting values.
 *
 *   gunnery     her gunner's hand (Temper.gunnery)
 *   helm        her helm (Temper.helm)
 *   lookout     her lookout (Temper.lookout), and how far off she notices a
 *               ship (`notice` more of it)
 *   nerve       how readily she fights and her mood (fight, aggro), and the
 *               hull she runs below (`run` less of it)
 *   stormcraft  the water she keeps inside the storm's edge (`margin` more of
 *               it: she turns for the calm sooner, and is caught out less)
 *   stamina     her gunnery and her helm as stats, `tire` points more by the
 *               race's end at twenty and as many fewer at nought, moving
 *               evenly from its midpoint
 *   seamanship  the hull her zones fault at (`seamanship` less of each band at
 *               twenty: play/fitted.ts)
 *
 * Her skill at all else goes with the mean of her gunnery, helm and lookout.
 * Her consistency and her feedback are the career's to read: her form is on
 * her card already.
 */
export const DRIVER = {
  reach: 0.8,
  notice: 0.3,
  run: 0.3,
  margin: 0.5,
  tire: 4,
  seamanship: 0.25,
} as const;

/** A stat as a lean: −1 at nought, 0 at ten, 1 at twenty. */
export const lean = (stat: number) =>
  (Math.max(0, Math.min(20, stat)) - 10) / 10;

/** The share `q` (0…1) as a stat moves it (DRIVER.reach). */
const moved = (q: number, stat: number) => {
  const by = DRIVER.reach * lean(stat);
  return by >= 0 ? q + (1 - q) * by : q * (1 + by);
};

/**
 * The temperament `t` (her seed's and her persona's) as a driver of `stats`
 * has it, in a race whose storm has closed by `length` seconds (DRIVER).
 */
export function driven<T extends Temper>(
  t: T,
  stats: DriverStats,
  length: number
): T {
  const tire = DRIVER.tire * lean(stats.stamina),
    trades = (stats.gunnery + stats.helm + stats.lookout) / 3;
  return {
    ...t,
    fight: moved(t.fight, stats.nerve),
    aggro: moved(t.aggro, stats.nerve),
    run: t.run * (1 - DRIVER.run * lean(stats.nerve)),
    notice: t.notice * (1 + DRIVER.notice * lean(stats.lookout)),
    margin: t.margin * (1 + DRIVER.margin * lean(stats.stormcraft)),
    skill: moved(t.skill, trades),
    gunnery: moved(t.gunnery, stats.gunnery),
    helm: moved(t.helm, stats.helm),
    lookout: moved(t.lookout, stats.lookout),
    ...(tire !== 0 && {
      late: {
        from: length / 2,
        to: length,
        gunnery: moved(t.gunnery, stats.gunnery + tire),
        helm: moved(t.helm, stats.helm + tire),
      },
    }),
  };
}
