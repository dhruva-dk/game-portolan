// Who hits what (PLAN A2): shots home by who laid the gun, its kind and the
// range, over a run's matches (metrics.ts ShipResult aim). Who: a stand-in for
// a player (player.ts, `--players`), or a bot by her gunner's skill, in thirds
// of its range: green, fair, or sharp, and of the sharp the best (0.9 and
// up). The fair test of the assist (A3): a player's assisted rate no higher
// than the best bots' at any range, with each gun. Like with like: a stand-in
// sails her bot's persona and fights where it fights, so set her beside the
// very ships she takes, sailed by their bots in a run of the same matches
// without stand-ins, and of the personas whose bots reach 0.9 (hunter,
// brawler):
//   node tools/harness/aim.ts run.jsonl [another.jsonl ...]
//   node tools/harness/aim.ts with.jsonl --against without.jsonl
//     --personas hunter,brawler
// Each file its own table (a run with the assist, and one `--rules noAssist`).
// A rate's ± is its binomial standard error, shots taken as independent (they
// are not quite: a ship's shots share her captain).
//
// Node only (tools/).

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { KINDS, type GunKind } from '../../src/kinds.ts';
import { BANDS, type Band, type Count, type ShipResult } from './metrics.ts';
import type { Result } from './run.ts';

export const WHO = ['player', 'green', 'fair', 'sharp', 'best'] as const;
type Who = (typeof WHO)[number];

/**
 * A bot's skill is 0.15–1, by her style (sim/temper.ts SKILL): its thirds, and
 * of the sharp, the best (the assist's gate, PLAN A3: a player no better than
 * the best bots).
 */
const FAIR = 0.15 + 0.85 / 3,
  SHARP = 0.15 + (2 * 0.85) / 3,
  BEST = 0.9;

/** Who laid her gun: a stand-in, or a bot by her skill. */
const whoOf = (s: ShipResult): Who =>
  s.player
    ? 'player'
    : s.skill < FAIR
      ? 'green'
      : s.skill < SHARP
        ? 'fair'
        : s.skill < BEST
          ? 'sharp'
          : 'best';

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

/**
 * Of a run's matches, only the ships of `personas` (all if none): a stand-in
 * sails her bot's persona, so a fair test sets her beside bots of the same.
 */
const of = (results: readonly Result[], personas: readonly string[]) =>
  personas.length
    ? results.map((r) => ({
        ...r,
        ships: r.ships.filter((s) => personas.includes(s.persona)),
      }))
    : results;

/**
 * Of a run without stand-ins, the ships a run of the same matches with
 * `--players k` gives to stand-ins (run.ts: (id + match) % k = 0), sailed by
 * their own bots: the like to set beside them.
 */
const slots = (results: readonly Result[], k: number) =>
  results.map((r) => ({
    ...r,
    ships: r.ships.filter((s) => (s.id + r.spec.match) % k === 0),
  }));

const read = (file: string): Result[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

if (import.meta.main) {
  // node aim.ts with-players.jsonl [--against without.jsonl] [--every 8]
  //   [--personas hunter,brawler]: --against sets the stand-ins beside the
  //   same ships sailed by their bots (A3's fair test, like with like)
  const { values: a, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      against: { type: 'string' },
      every: { type: 'string', default: '8' },
      personas: { type: 'string', default: '' },
    },
  });
  const personas = a.personas ? a.personas.split(',') : [];
  for (const file of positionals) {
    const results = of(read(file), personas);
    const r = rates(results);
    if (a.against) {
      const b = rates(of(slots(read(a.against), Number(a.every)), personas));
      for (const w of WHO.slice(1)) r[w] = b[w];
    }
    if (personas.length) console.log(`  of ${personas.join(', ')} only`);
    if (a.against)
      console.log(`  bots: the stand-ins' own ships in ${a.against}`);
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
    // true lays as many ahead of her middle as astern (of this run's ships
    // alone, so not beside another's)
    if (a.against) continue;
    const fell = astern(results);
    console.log(
      '  balls come down astern of a ship under way, of those about her, close / mid / far:'
    );
    for (const w of WHO)
      console.log(
        `    ${w.padEnd(7)}${BANDS.map((b) => {
          const f = fell.get(`${w} ${b}`) ?? { astern: 0, all: 0 };
          return shown({ shots: f.all, hits: f.astern });
        }).join('')}`
      );
  }
}

/**
 * Of the balls each who laid on a ship under way, by the range they were
 * fired at, how many came down about her and how many of those astern of her
 * middle: keyed `who band`.
 */
export function astern(results: readonly Result[]) {
  const out = new Map<string, { astern: number; all: number }>();
  for (const r of results)
    for (const s of r.ships)
      for (const b of BANDS) {
        const f = s.fell?.[b];
        if (!f) continue;
        const key = `${whoOf(s)} ${b}`,
          to = out.get(key) ?? { astern: 0, all: 0 };
        to.astern += f.astern;
        to.all += f.astern + f.ahead;
        out.set(key, to);
      }
  return out;
}
