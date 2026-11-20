// Ratings from where ships placed: each group's strength (by persona, brain,
// or anything a ship is told apart by), fitted to the order ships went down in.
//   node tools/harness/rate.ts results.jsonl [--by persona|brain|type-persona|gun]
// (gun: the kind she held longest. Ships carry the gun they find, so a gun's
// rating is of the ships that kept it, not of the gun alone.)
//
// The model (Plackett–Luce, worst first): each sinking is the one ship, of
// those still afloat, that was to go next, chosen with odds e^−θ of her group;
// so θ is how well a group lasts, and e^(θa − θb) the odds a ship of group a
// outlasts one of b, the two alone. Ships afloat at the end gave no sinking and
// need no order among them. Fitted by Hunter's MM steps (2004), each group's
// e^−θ its sinkings over the sum, over sinkings, of its share of the afloat
// weighted; θ centred on the groups' mean. Standard errors by the bootstrap
// over whole matches (a match's ships are not apart: they fought each other),
// seeded, the same each run.
//
// Node only (tools/).

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { random } from '../../src/world/random.ts';
import type { ShipResult } from './metrics.ts';
import type { Result } from './run.ts';

/** A group's rating: θ (0 the mean of groups), its standard error, its ships. */
export interface Rating {
  group: string;
  theta: number;
  se: number;
  ships: number;
}

/** A match as the fit sees it: each ship's group index, in the order they sank; and the groups afloat at the end. */
interface Order {
  sank: number[];
  left: number[];
}

/** θ for each group (centred) from these matches; MM steps till still. */
function fit(orders: readonly Order[], groups: number): number[] {
  const w = new Array<number>(groups).fill(1),
    losses = new Array<number>(groups).fill(0);
  for (const o of orders) for (const g of o.sank) losses[g]++;
  for (let it = 0; it < 500; it++) {
    const denom = new Array<number>(groups).fill(0);
    for (const o of orders) {
      // the afloat before each sinking: every ship of the match, less those sunk
      const n = new Array<number>(groups).fill(0);
      for (const g of o.sank) n[g]++;
      for (const g of o.left) n[g]++;
      for (const k of o.sank) {
        let s = 0;
        for (let g = 0; g < groups; g++) s += n[g] * w[g];
        for (let g = 0; g < groups; g++) denom[g] += n[g] / s;
        n[k]--;
      }
    }
    let moved = 0;
    for (let g = 0; g < groups; g++) {
      // a group that never sank lasts without bound: held at a floor
      const next = denom[g] > 0 ? Math.max(losses[g], 0.5) / denom[g] : w[g];
      moved = Math.max(moved, Math.abs(Math.log(next / w[g])));
      w[g] = next;
    }
    // e^−θ: normalised to a geometric mean of 1
    const mean = w.reduce((a, x) => a + Math.log(x), 0) / groups;
    for (let g = 0; g < groups; g++) w[g] = Math.exp(Math.log(w[g]) - mean);
    if (moved < 1e-9) break;
  }
  return w.map((x) => -Math.log(x));
}

/**
 * Each group's rating over `results`, a ship's group by `groupOf`, with
 * standard errors over `boot` resamples of the matches.
 */
export function rate(
  results: readonly Result[],
  groupOf: (s: ShipResult, r: Result) => string,
  boot = 200
): Rating[] {
  const names = [
    ...new Set(results.flatMap((r) => r.ships.map((s) => groupOf(s, r)))),
  ].sort();
  const index = new Map(names.map((n, i) => [n, i]));
  const orders: Order[] = results.map((r) => {
    const g = (s: ShipResult) => index.get(groupOf(s, r))!;
    const sunk = r.ships
      .filter((s) => s.sunk)
      .sort((a, b) => b.place - a.place);
    return { sank: sunk.map(g), left: r.ships.filter((s) => !s.sunk).map(g) };
  });
  const theta = fit(orders, names.length);
  const u = random(0x7a7e),
    draws: number[][] = [];
  for (let b = 0; b < boot; b++) {
    const pick = orders.map(() => orders[Math.floor(u() * orders.length)]);
    draws.push(fit(pick, names.length));
  }
  const ships = (n: string) =>
    results.reduce(
      (k, r) => k + r.ships.filter((s) => groupOf(s, r) === n).length,
      0
    );
  return names.map((group, i) => {
    const m = draws.reduce((a, d) => a + d[i], 0) / boot;
    const se = Math.sqrt(
      draws.reduce((a, d) => a + (d[i] - m) ** 2, 0) / Math.max(1, boot - 1)
    );
    return { group, theta: theta[i], se, ships: ships(group) };
  });
}

/** Ratings as lines, strongest first, with each one's distance from the median in standard errors. */
export function ratings(rs: readonly Rating[]): string[] {
  const sorted = [...rs].sort((a, b) => b.theta - a.theta),
    thetas = sorted.map((r) => r.theta).sort((a, b) => a - b),
    median =
      thetas.length % 2
        ? thetas[thetas.length >> 1]
        : (thetas[thetas.length / 2 - 1] + thetas[thetas.length / 2]) / 2;
  return sorted.map(
    (r) =>
      `  ${r.group.padEnd(22)} θ ${r.theta >= 0 ? '+' : ''}${r.theta.toFixed(3)} ± ${r.se.toFixed(3)}` +
      ` (${((r.theta - median) / Math.max(r.se, 1e-9)).toFixed(1)} se from the median; ${r.ships} ships)`
  );
}

/** How a ship is grouped, by name. */
export const GROUPINGS: Readonly<
  Record<string, (s: ShipResult, r: Result) => string>
> = {
  persona: (s) => s.persona,
  brain: (s) => s.brain,
  'type-persona': (s, r) => `${r.type}: ${s.persona}`,
  // the gun she had in hand longest (none: she never held one)
  gun: (s) =>
    Object.entries(s.hand).reduce(
      (best, [k, t]) => ((t ?? 0) > best.t ? { k, t: t ?? 0 } : best),
      { k: 'none', t: 0 }
    ).k,
};

if (import.meta.main) {
  const { values: a, positionals } = parseArgs({
    allowPositionals: true,
    options: { by: { type: 'string', default: 'persona' } },
  });
  const by = GROUPINGS[a.by];
  if (!by || !positionals[0])
    throw new Error(
      `usage: rate.ts results.jsonl ... [--by ${Object.keys(GROUPINGS).join('|')}]`
    );
  // several runs rated as one (each its own matches: 1-64 and 65-128, say)
  const results: Result[] = positionals.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l))
  );
  console.log(`ratings by ${a.by} over ${results.length} matches:`);
  for (const l of ratings(rate(results, by))) console.log(l);
}
