// WP27 fixtures shared by tests/ui/results.test.ts and the shots page: a finished match made up as result() reports one,
// and a career whose chart is inked to a fraction with some regions named.
import type { Career } from '../../src/career/state.ts';
import type { MatchResult } from '../../src/sim/end.ts';
import { EVENT, SHIPS } from '../../src/sim/state.ts';
import { FITTING } from '../../src/sim/tables.ts';
import { regionCells } from '../../src/ui/careerChart.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';

/** A finished match with the player at `place`: it broke off, closed loops, lost a trail to ship 3, chose long guns, broke ship 6's trail, sank ship 4, and (placed) was sunk by ship 5. */
export function madeMatch(place: number): MatchResult {
  const order = Array.from({ length: SHIPS - 1 }, (_, i) => i + 1);
  order.splice(place - 1, 0, 0);
  const ships = order.map((ship, idx) => ({
    ship, place: idx + 1, tick: ship === 0 && idx > 0 ? 3600 + (SHIPS - idx) * 10 : 9000 - idx * 700, by: idx === 0 ? -1 : ship === 0 ? 5 : ship === 4 ? 0 : idx % 3 === 0 ? -1 : order[0] === 0 ? order[1] : order[0],
    cause: idx === 0 ? -1 : idx % 3 === 0 ? 5 : 0, claimed: 900 - idx * 70, sank: ship === 0 ? 1 : idx === 0 ? 2 : 0, bank: 400 - idx * 30, treasure: 200 - idx * 15,
  })).sort((a, b) => a.ship - b.ship);
  const me = ships[0];
  const timeline = [
    { tick: 140, kind: EVENT.home, ship: 0, by: -1, amount: 310 },
    { tick: 900, kind: EVENT.loop, ship: 0, by: -1, amount: 420 },
    { tick: 1500, kind: EVENT.broken, ship: 0, by: 3, amount: 40 },
    { tick: 2100, kind: EVENT.chosen, ship: 0, by: FITTING.longGuns, amount: 3 },
    { tick: 2500, kind: EVENT.broken, ship: 6, by: 0, amount: 25 },
    { tick: 2900, kind: EVENT.loop, ship: 0, by: -1, amount: 260 },
    { tick: 3400, kind: EVENT.sunk, ship: 4, by: 0, amount: 0 },
    ...(place > 1 ? [{ tick: me.tick, kind: EVENT.sunk, ship: 0, by: 5, amount: 0 }] : []),
  ];
  return { order, ships, timeline, ticks: 9000 };
}

/** Ink `fraction` of the career's chart, region by region (the frontier ragged where it stops), and name the first `named` regions touched. */
export function inkChart(c: Career, fraction: number, named: number): void {
  const region = regionCells(), want = Math.round(fraction * region.length);
  let n = 0, k = 0;
  const order = REGIONS.map((_, i) => i).sort((a, b) => ((a * 7) % REGIONS.length) - ((b * 7) % REGIONS.length));
  for (const r of order) {
    if (n >= want) break;
    for (let cell = 0; cell < region.length && n < want; cell++) {
      if (region[cell] !== r) continue;
      c.chart.seen[cell >> 3] |= 1 << (cell & 7);
      n++;
    }
    if (k < named) c.chart.named[r] = { match: k, tick: 100 + k };
    c.profile.breakOff[r] = k % 3;
    k++;
  }
}
