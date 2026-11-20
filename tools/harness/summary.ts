// A harness run summed up, brain by brain: how much her bots were pinned (stuck
// in any mode but claim) and aground, how soon they armed, where they placed,
// the share of their time in each mode, and what a step cost. Against the first
// brain named, each other's difference in pinned seconds a ship, match by match
// (the same matches), with a 95% interval bootstrapped over the matches.
//
// Node only (tools/).

import { random } from '../../src/world/random.ts';
import type { ShipResult } from './metrics.ts';
import type { Result } from './run.ts';

const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const at = (xs: readonly number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};

/** The 2.5% and 97.5% of the mean of `xs` resampled, seeded (the same each run). */
function interval(xs: readonly number[]): [number, number] {
  const u = random(0x5eed),
    means: number[] = [];
  for (let i = 0; i < 2000; i++) {
    let s = 0;
    for (let k = 0; k < xs.length; k++) s += xs[Math.floor(u() * xs.length)];
    means.push(s / xs.length);
  }
  return [at(means, 0.025), at(means, 0.975)];
}

/** Counts by key summed over ships, as "key n%" of the whole, most first. */
function tally(each: readonly Partial<Record<string, number>>[]): string {
  const sum = new Map<string, number>();
  let total = 0;
  for (const e of each)
    for (const [k, n] of Object.entries(e)) {
      sum.set(k, (sum.get(k) ?? 0) + (n ?? 0));
      total += n ?? 0;
    }
  return [...sum]
    .sort((x, y) => y[1] - x[1])
    .map(([k, n]) => `${k} ${((100 * n) / Math.max(1, total)).toFixed(0)}%`)
    .join(' ');
}

/** The figures of one brain's ships. */
function figures(ships: readonly ShipResult[]) {
  const armed = ships.flatMap((s) => (s.armed === null ? [] : [s.armed]));
  const modes = new Map<string, number>();
  let total = 0;
  for (const s of ships)
    for (const [m, n] of Object.entries(s.modes)) {
      modes.set(m, (modes.get(m) ?? 0) + n);
      total += n;
    }
  return {
    ships: ships.length,
    pinned: mean(ships.map((s) => s.pinned)),
    everPinned: ships.filter((s) => s.pinned > 0).length / ships.length,
    aground: mean(ships.map((s) => s.aground)),
    claimStuck: mean(ships.map((s) => s.stuck.claim ?? 0)),
    armed: armed.length / ships.length,
    armedMedian: at(armed, 0.5),
    armed90: at(armed, 0.9),
    place: mean(ships.map((s) => s.place)),
    why: tally(ships.map((s) => s.why)),
    pinnedBy: tally(ships.map((s) => s.stuck)),
    speed: mean(ships.map((s) => s.speed)),
    modes: [...modes]
      .sort((x, y) => y[1] - x[1])
      .map(([m, n]) => `${m} ${((100 * n) / total).toFixed(0)}%`)
      .join(' '),
  };
}

export function summary(results: readonly Result[]): string {
  const names = [...new Set(results.flatMap((r) => r.spec.brains))];
  const lines: string[] = [];
  for (const name of names) {
    const ships = results.flatMap((r) =>
      r.ships.filter((s) => s.brain === name)
    );
    const f = figures(ships),
      runs = results.filter((r) => r.spec.brains.includes(name));
    lines.push(
      `${name}: ${f.ships} ships over ${runs.length} matches, ` +
        `${mean(runs.map((r) => r.msPerStep)).toFixed(2)} ms a step, ${mean(runs.map((r) => r.seconds)).toFixed(0)} s a match`,
      `  pinned ${f.pinned.toFixed(1)} s a ship (${(100 * f.everPinned).toFixed(0)}% ever), aground ${f.aground.toFixed(1)} s, ` +
        `circling in claim ${f.claimStuck.toFixed(1)} s; ${f.speed.toFixed(1)} m/s`,
      `  armed ${(100 * f.armed).toFixed(0)}%, median ${f.armedMedian} s, 90% by ${f.armed90} s; place ${f.place.toFixed(1)}`,
      `  time: ${f.modes}`,
      `  stuck by mode: ${f.pinnedBy}`,
      `  pinned, her mind showing: ${f.why}`
    );
  }
  // against the first, match by match (fleets of one brain each)
  const [first, ...rest] = names,
    pinnedIn = (r: Result) => mean(r.ships.map((s) => s.pinned));
  for (const name of rest) {
    const diffs: number[] = [];
    for (const r of results)
      if (r.spec.brains.length === 1 && r.spec.brains[0] === name) {
        const base = results.find(
          (q) =>
            q.spec.match === r.spec.match &&
            q.spec.brains.length === 1 &&
            q.spec.brains[0] === first
        );
        if (base) diffs.push(pinnedIn(r) - pinnedIn(base));
      }
    if (diffs.length < 2) continue;
    const [lo, hi] = interval(diffs);
    lines.push(
      `${name} − ${first}: pinned ${mean(diffs).toFixed(1)} s a ship [${lo.toFixed(1)}, ${hi.toFixed(1)}] over ${diffs.length} matches`
    );
  }
  // in mixed fleets, against the first, the place each brain's ships came to,
  // match by match (lower is better)
  const placeIn = (r: Result, name: string) =>
    mean(r.ships.filter((s) => s.brain === name).map((s) => s.place));
  for (const name of rest) {
    const diffs = results
      .filter(
        (r) => r.spec.brains.includes(name) && r.spec.brains.includes(first)
      )
      .map((r) => placeIn(r, name) - placeIn(r, first));
    if (diffs.length < 2) continue;
    const [lo, hi] = interval(diffs);
    lines.push(
      `${name} − ${first}: place ${mean(diffs).toFixed(2)} [${lo.toFixed(2)}, ${hi.toFixed(2)}] over ${diffs.length} mixed matches (lower is better)`
    );
  }
  return lines.join('\n');
}
