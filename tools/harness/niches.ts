// The guns' niches (PLAN.md W2): each kind's damage a second by range, as its
// tables have it (src/sim/handling.ts GUNS, a gun's rarity GUN, its fall-off
// src/sim/gun.ts), and, given a run, as the bots got it: each kind's shots home
// by range band and the damage a shot did.
//   node tools/harness/niches.ts [results.jsonl]
//
// On paper a gun fires its magazine, each shot wound up, the interval apart,
// and reloads: its damage over that, every ball home, at the range's fall-off.
// What it gets in a match is that times the share of its shots home there.
//
// Node only (tools/).

import { readFileSync } from 'node:fs';
import { KINDS, type GunKind } from '../../src/kinds.ts';
import { damageOf, falloff, reloadOf } from '../../src/sim/gun.ts';
import { GUNS } from '../../src/sim/handling.ts';
import { BANDS } from './metrics.ts';
import type { Result } from './run.ts';

/** The ranges the map is taken at, m. */
export const RANGES = [20, 50, 70, 100, 150, 200, 240] as const;

/**
 * Damage a second a gun of `kind` and `rarity` deals at `metres`, every ball
 * home, firing and reloading without a pause; 0 past its range or inside its
 * least.
 */
export function paper(kind: GunKind, rarity: number, metres: number): number {
  const g = GUNS[kind];
  if (metres > g.range || metres < g.least) return 0;
  const cycle =
    g.mag * g.windup + (g.mag - 1) * g.interval + reloadOf({ kind, rarity });
  return (
    (g.mag * g.pellets * damageOf({ kind, rarity }) * falloff(kind, metres)) /
    cycle
  );
}

/** Each kind's shots home by band, and damage a shot, over `results`. */
export function measured(results: readonly Result[]) {
  return KINDS.map((kind) => {
    const band = Object.fromEntries(
      BANDS.map((b) => [b, { shots: 0, hits: 0 }])
    );
    let shots = 0,
      dealt = 0;
    for (const r of results) {
      const k = r.shots.kind[kind];
      if (!k?.bands) continue;
      shots += k.shots;
      dealt += k.dealt;
      for (const b of BANDS) {
        band[b].shots += k.bands[b].shots;
        band[b].hits += k.bands[b].hits;
      }
    }
    return { kind, shots, perShot: shots ? dealt / shots : 0, band };
  });
}

if (import.meta.main) {
  const pad = (s: string | number, n = 7) => String(s).padStart(n);
  console.log(
    'damage a second on paper, common / legendary, by range (m):\n' +
      `  ${'gun'.padEnd(9)}${RANGES.map((r) => pad(r, 11)).join('')}`
  );
  for (const k of KINDS)
    console.log(
      `  ${k.padEnd(9)}` +
        RANGES.map((r) =>
          pad(`${paper(k, 0, r).toFixed(0)}/${paper(k, 4, r).toFixed(0)}`, 11)
        ).join('')
    );
  const file = process.argv[2];
  if (file) {
    const results: Result[] = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    console.log(
      `\nover ${results.length} matches: shots, damage a shot, and shots home by band` +
        ' (close to 70 m, mid to 150, far beyond: metrics.ts BANDS):'
    );
    for (const m of measured(results)) {
      if (!m.shots) continue;
      const home = BANDS.map((b) => {
        const c = m.band[b];
        return `${b} ${c.shots ? ((100 * c.hits) / c.shots).toFixed(0) : '–'}% of ${c.shots}`;
      });
      console.log(
        `  ${m.kind.padEnd(9)} ${pad(m.shots)} shots, ${m.perShot.toFixed(1)} a shot; ${home.join(', ')}`
      );
    }
  }
}
