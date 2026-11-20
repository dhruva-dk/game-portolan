// A harness run summed up. Brain by brain: how much her bots were pinned (stuck
// in any mode but claim) and aground, how soon they armed, where they placed,
// how they fought and what they took up, the water they held, the share of their
// time in each mode, and what a step cost. Persona by persona (sim/persona.ts),
// over every brain: where they placed, how they fought, and their water. Over
// the matches: their types, how ships went down, the shots by range, gun and
// rarity and how many struck home, the guns' longest silence, the loot, and the
// share of ships afloat armed at 30, 60 and 120 s. Against the first brain
// named, each other's difference in pinned seconds a ship, match by match (the
// same matches), with a 95% interval bootstrapped over the matches.
//
// Node only (tools/).

import { KINDS } from '../../src/kinds.ts';
import { random } from '../../src/world/random.ts';
import { BANDS, HELD, type Count, type ShipResult } from './metrics.ts';
import type { Result } from './run.ts';

const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const at = (xs: readonly number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};
const pc = (n: number, of: number) =>
  of ? `${((100 * n) / of).toFixed(0)}%` : '-';

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

/** Counts by key summed over `each`, as "key n%" of the whole, most first. */
function tally(each: readonly Partial<Record<string, number>>[]): string {
  const all = new Map<string, number>();
  let total = 0;
  for (const e of each)
    for (const [k, n] of Object.entries(e)) {
      all.set(k, (all.get(k) ?? 0) + (n ?? 0));
      total += n ?? 0;
    }
  return [...all]
    .sort((x, y) => y[1] - x[1])
    .map(([k, n]) => `${k} ${pc(n, total)}`)
    .join(' ');
}

/** A set of ships' fighting: shots, hits, damage and kills, a ship. */
function fought(ships: readonly ShipResult[]): string {
  const shots = sum(ships.map((s) => sum(Object.values(s.fighting.shots)))),
    hits = sum(ships.map((s) => s.fighting.hits)),
    n = ships.length;
  return (
    `${(shots / n).toFixed(1)} shots a ship, ${pc(hits, shots)} home; ` +
    `dealt ${mean(ships.map((s) => s.fighting.dealt)).toFixed(0)} hp ` +
    `(+${mean(ships.map((s) => s.fighting.rammed)).toFixed(0)} rammed), ` +
    `took ${mean(ships.map((s) => s.fighting.taken)).toFixed(0)}; ` +
    `${mean(ships.map((s) => s.fighting.kills)).toFixed(2)} kills`
  );
}

/** A set of ships' water: their share at each of HELD and at the end, a ship. */
function water(ships: readonly ShipResult[]): string {
  const share = (f: (s: ShipResult) => number) =>
    `${(100 * mean(ships.map(f))).toFixed(3)}%`;
  return [
    ...HELD.map((t, i) => `${t} s ${share((s) => s.held[i])}`),
    `end ${share((s) => s.share)}`,
  ].join(', ');
}

/** The figures of one brain's ships. */
function figures(ships: readonly ShipResult[]) {
  const armed = ships.flatMap((s) => (s.armed === null ? [] : [s.armed])),
    second = ships.flatMap((s) => (s.second === null ? [] : [s.second]));
  return {
    ships: ships.length,
    pinned: mean(ships.map((s) => s.pinned)),
    everPinned: ships.filter((s) => s.pinned > 0).length / ships.length,
    aground: mean(ships.map((s) => s.aground)),
    claimStuck: mean(ships.map((s) => s.stuck.claim ?? 0)),
    armed: armed.length / ships.length,
    armedMedian: at(armed, 0.5),
    armed90: at(armed, 0.9),
    second: second.length / ships.length,
    secondMedian: at(second, 0.5),
    place: mean(ships.map((s) => s.place)),
    why: tally(ships.map((s) => s.why)),
    pinnedBy: tally(ships.map((s) => s.stuck)),
    speed: mean(ships.map((s) => s.speed)),
    modes: tally(ships.map((s) => s.modes)),
    hand: tally(ships.map((s) => s.hand)),
    guns: mean(ships.map((s) => s.took.guns)),
    stores: mean(ships.map((s) => s.took.stores)),
    rarest: mean(ships.map((s) => s.took.rarest)),
    loops: mean(ships.map((s) => s.loops)),
    regained: mean(ships.map((s) => s.regained)),
  };
}

/** Each brain's ships summed up. */
function byBrain(results: readonly Result[], names: readonly string[]) {
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
      `  armed ${(100 * f.armed).toFixed(0)}%, median ${f.armedMedian} s, 90% by ${f.armed90} s; ` +
        `a second kind ${(100 * f.second).toFixed(0)}%, median ${f.secondMedian} s; place ${f.place.toFixed(1)}`,
      `  fought: ${fought(ships)}`,
      `  took up ${f.guns.toFixed(1)} guns (rarest ${f.rarest.toFixed(1)} on average) and ${f.stores.toFixed(1)} stores; ` +
        `${f.loops.toFixed(1)} loops closed, ${f.regained.toFixed(0)} hp of shield from her water`,
      `  water: ${water(ships)}`,
      `  in hand: ${f.hand}`,
      `  time: ${f.modes}`,
      `  stuck by mode: ${f.pinnedBy}`,
      `  pinned, her mind showing: ${f.why}`
    );
  }
  return lines;
}

/** Each persona's ships, over every brain, summed up (sim/persona.ts). */
function byPersona(results: readonly Result[]) {
  const ships = results.flatMap((r) => r.ships),
    personas = [...new Set(ships.map((s) => s.persona))].sort();
  const lines = ['by persona:'];
  for (const p of personas) {
    const of = ships.filter((s) => s.persona === p),
      armed = of.flatMap((s) => (s.armed === null ? [] : [s.armed]));
    lines.push(
      `  ${p.padEnd(11)} ${String(of.length).padStart(4)} ships, place ${mean(of.map((s) => s.place)).toFixed(1)}, ` +
        `won ${pc(of.filter((s) => s.place === 1).length, of.length)}, armed median ${at(armed, 0.5)} s, ` +
        `pinned ${mean(of.map((s) => s.pinned)).toFixed(1)} s`,
      `  ${''.padEnd(11)} ${fought(of)}; water at the end ${(100 * mean(of.map((s) => s.share))).toFixed(3)}%`
    );
  }
  return lines;
}

/** Hits of shots, as "n shots m% home". */
const rate = (c: Count) => `${c.shots} shots ${pc(c.hits, c.shots)} home`;

/** The matches summed up: their types, endings, shooting, quiet and loot. */
function overMatches(results: readonly Result[]) {
  const n = results.length,
    types = tally(results.map((r) => ({ [r.type]: 1 }))),
    causes = tally(results.map((r) => r.causes));
  const band = BANDS.map((b) => {
    const c = { shots: 0, hits: 0 };
    for (const r of results) {
      c.shots += r.shots.band[b].shots;
      c.hits += r.shots.band[b].hits;
    }
    return `${b} ${rate(c)}`;
  });
  const kind = KINDS.flatMap((k) => {
    const c = { shots: 0, hits: 0, balls: 0, fell: 0 };
    for (const r of results) {
      const x = r.shots.kind[k];
      if (!x) continue;
      c.shots += x.shots;
      c.hits += x.hits;
      c.balls += x.balls;
      c.fell += x.fell;
    }
    return c.shots
      ? [
          `${k} ${rate(c)} (${pc(c.balls - c.fell, c.balls)} of balls not short)`,
        ]
      : [];
  });
  const rarities = [
    ...new Set(results.flatMap((r) => Object.keys(r.shots.rarity))),
  ].sort();
  const rarity = rarities.map((k) => {
    const c = { shots: 0, hits: 0 };
    for (const r of results) {
      const x = r.shots.rarity[Number(k)];
      if (!x) continue;
      c.shots += x.shots;
      c.hits += x.hits;
    }
    return `${k}: ${rate(c)}`;
  });
  // the share of ships afloat at each mark that were armed by it
  const armedBy = [30, 60, 120].map((t) => {
    const up = results.flatMap((r) =>
      r.ships.filter((s) => !s.sunk || s.sunk.time > t)
    );
    const armed = up.filter((s) => s.armed !== null && s.armed <= t).length;
    return `${t} s ${pc(armed, up.length)}`;
  });
  const quiet = results.map((r) => r.quiet);
  return [
    `over ${n} matches: ${types}; ships went down by ${causes}`,
    `  shots by range: ${band.join(', ')}`,
    `  by gun: ${kind.join(', ')}`,
    `  by rarity: ${rarity.join(', ')}`,
    `  armed, of ships afloat: ${armedBy.join(', ')}; the guns' longest silence after 30 s, median ${at(quiet, 0.5).toFixed(0)} s, most ${Math.max(...quiet).toFixed(0)} s`,
    `  loot: ${mean(results.map((r) => r.loot.start)).toFixed(0)} pieces at the start, ` +
      `${mean(results.map((r) => r.loot.shallow)).toFixed(1)} too shoal to reach; ${mean(results.map((r) => r.loot.end)).toFixed(0)} at the end`,
  ];
}

export function summary(results: readonly Result[]): string {
  const names = [...new Set(results.flatMap((r) => r.spec.brains))];
  const lines = [
    ...byBrain(results, names),
    ...byPersona(results),
    ...overMatches(results),
  ];
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
