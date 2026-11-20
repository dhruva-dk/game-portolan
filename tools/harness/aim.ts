// Who hits what (PLAN A2): shots home by who laid the gun, its kind and the
// range, over a run's matches (metrics.ts ShipResult aim). Who: a stand-in for
// a player (player.ts, `--players`), or a bot by her gunner's skill, in thirds
// of its range: green, fair, or sharp. The fair test of the assist (A3):
// a player's assisted rate no higher than the sharp bots' at any range.
//   node tools/harness/aim.ts run.jsonl [another.jsonl ...]
// Each file its own table (a run with the assist, and one `--rules noAssist`).
// A rate's ± is its binomial standard error, shots taken as independent (they
// are not quite: a ship's shots share her captain).
//
// Node only (tools/).

import { readFileSync } from 'node:fs';
import { KINDS, type GunKind } from '../../src/kinds.ts';
import { BANDS, type Band, type Count, type ShipResult } from './metrics.ts';
import type { Result } from './run.ts';

export const WHO = ['player', 'green', 'fair', 'sharp'] as const;
type Who = (typeof WHO)[number];

/** A bot's skill is 0.35–0.9 (sim/temper.ts): its thirds. */
const FAIR = 0.35 + 0.55 / 3,
  SHARP = 0.35 + (2 * 0.55) / 3;

/** Who laid her gun: a stand-in, or a bot by her skill. */
const whoOf = (s: ShipResult): Who =>
  s.player
    ? 'player'
    : s.skill < FAIR
      ? 'green'
      : s.skill < SHARP
        ? 'fair'
        : 'sharp';

type Rates = Record<Who, Record<GunKind | 'all', Record<Band, Count>>>;

/** Shots and those home by who, gun (and all guns) and range, over `results`. */
export function rates(results: readonly Result[]): Rates {
  const band = () =>
    Object.fromEntries(BANDS.map((b) => [b, { shots: 0, hits: 0 }])) as Record<
      Band,
      Count
    >;
  const kinds = () =>
    Object.fromEntries([...KINDS, 'all'].map((k) => [k, band()])) as Rates[Who];
  const out = Object.fromEntries(WHO.map((w) => [w, kinds()])) as Rates;
  for (const r of results)
    for (const s of r.ships) {
      const to = out[whoOf(s)];
      for (const k of KINDS) {
        const a = s.aim?.[k];
        if (!a) continue;
        for (const b of BANDS) {
          to[k][b].shots += a[b].shots;
          to[k][b].hits += a[b].hits;
          to.all[b].shots += a[b].shots;
          to.all[b].hits += a[b].hits;
        }
      }
    }
  return out;
}

/** A rate as `p% ±se (n)`, or a dash with too few shots to say. */
const shown = (c: Count) => {
  if (c.shots < 30) return '–'.padStart(16);
  const p = c.hits / c.shots,
    se = Math.sqrt((p * (1 - p)) / c.shots);
  return `${(100 * p).toFixed(0)}% ±${(100 * se).toFixed(0)} (${c.shots})`.padStart(
    16
  );
};

if (import.meta.main) {
  for (const file of process.argv.slice(2)) {
    const results: Result[] = readFileSync(file, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l));
    const r = rates(results);
    console.log(
      `${file}: ${results.length} matches; shots home by who laid the gun, close / mid / far:`
    );
    for (const k of ['all', ...KINDS] as const) {
      console.log(`  ${k}`);
      for (const w of WHO)
        console.log(
          `    ${w.padEnd(7)}${BANDS.map((b) => shown(r[w][k][b])).join('')}`
        );
    }
    // where the balls came down about a ship under way (A4): a gunner leading
    // true lays as many ahead of her middle as astern
    const fell = astern(results);
    console.log(
      '  balls come down astern of a ship under way, of those about her:'
    );
    for (const w of WHO)
      console.log(
        `    ${w.padEnd(7)}${shown({ shots: fell[w].all, hits: fell[w].astern })}`
      );
  }
}

/** Of the balls each who laid on a ship under way, how many came down astern of her middle. */
export function astern(results: readonly Result[]) {
  const out = Object.fromEntries(
    WHO.map((w) => [w, { astern: 0, all: 0 }])
  ) as Record<Who, { astern: number; all: number }>;
  for (const r of results)
    for (const s of r.ships) {
      if (!s.fell) continue;
      const to = out[whoOf(s)];
      to.astern += s.fell.astern;
      to.all += s.fell.astern + s.fell.ahead;
    }
  return out;
}
