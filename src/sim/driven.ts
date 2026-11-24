import type { DriverStats } from './race.ts';
import type { Temper } from './temper.ts';

export const DRIVER = {
  reach: 0.8,
  notice: 0.3,
  run: 0.3,
  margin: 0.5,
  tire: 4,
} as const;

export const lean = (stat: number) =>
  (Math.max(0, Math.min(20, stat)) - 10) / 10;

const moved = (q: number, stat: number) => {
  const by = DRIVER.reach * lean(stat);
  return by >= 0 ? q + (1 - q) * by : q * (1 + by);
};

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
