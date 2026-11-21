// What the report measures (PLAN section 5), of any set of matches: one
// planet's, or a pool's. Each figure is of the matches together (the damage of
// all their ships over all their minutes afloat, not a mean of each match's
// ratio, so a short match counts for what it lasted), with its standard error
// by the jackknife over whole matches: a match's ships fought each other and
// are not apart. The persona rating spread is rate.ts's own, its error from
// rate.ts's bootstrap.
//
// Node only (tools/).

import type { ShipResult } from './metrics.ts';
import { keptOf, KEPT, type Kept } from './planets.ts';
import { GROUPINGS, rate } from './rate.ts';
import type { Result } from './run.ts';

/** A figure and its standard error (NaN: one match, no error to be had). */
export interface Measure {
  v: number;
  se: number;
}

/** A metric: its key, how it reads, which way is better, and whether changes are gated on it. */
export interface Metric {
  key: string;
  label: string;
  unit: string;
  digits: number;
  better: 'up' | 'down';
  gate: boolean;
  of: (rs: readonly Result[]) => Measure;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const ships = (rs: readonly Result[]) => rs.flatMap((r) => r.ships);
/** Minutes afloat, over every ship of the matches. */
const minutes = (rs: readonly Result[]) =>
  sum(ships(rs).map((s) => s.afloat)) / 60;

/** `f` of all of `rs`, its error by leaving out one match at a time. */
export function jackknife(
  rs: readonly Result[],
  f: (rs: readonly Result[]) => number
): Measure {
  const v = f(rs),
    n = rs.length;
  if (n < 2) return { v, se: NaN };
  const out = rs.map((_, i) => f(rs.filter((_, k) => k !== i))),
    m = sum(out) / n;
  return {
    v,
    se: Math.sqrt(((n - 1) / n) * sum(out.map((x) => (x - m) ** 2))),
  };
}

/** Damage her balls and rams dealt (hull and shield), every ship's. */
const dealt = (rs: readonly Result[]) =>
  sum(ships(rs).map((s) => s.fighting.dealt + s.fighting.rammed));
const hull = (rs: readonly Result[]) =>
  sum(ships(rs).map((s) => s.mended.hull));
/** Shield given back: by her stores, and by her water. */
const shield = (rs: readonly Result[]) =>
  sum(ships(rs).map((s) => s.mended.shield + s.regained));
const perShip = (rs: readonly Result[], f: (s: ShipResult) => number) =>
  sum(ships(rs).map(f)) / Math.max(1, ships(rs).length);

/**
 * How far apart the personas sail, 0 (all alike) to 1. Each persona's ships
 * pooled: her share of time afloat in each mode, and her shots a minute
 * afloat. For each pair of personas, the mean of two distances, each 0 to 1:
 * the share of time spent in different modes (total variation: half the sum of
 * the shares' differences), and how far apart their rates of fire are,
 * |a − b| / (a + b). The figure is the mean over pairs. Both parts are
 * unitless and bounded, so neither drowns the other, and a persona that only
 * shoots more (or only roams more) still counts as apart.
 */
export function distinctness(rs: readonly Result[]): number {
  const by = new Map<string, { modes: Map<string, number>; shots: number }>();
  for (const s of ships(rs)) {
    if (s.player) continue;
    const p = by.get(s.persona) ?? { modes: new Map(), shots: 0 };
    by.set(s.persona, p);
    for (const [m, t] of Object.entries(s.modes))
      p.modes.set(m, (p.modes.get(m) ?? 0) + (t ?? 0));
    p.shots += sum(Object.values(s.fighting.shots).map((n) => n ?? 0));
  }
  const ps = [...by.values()]
    .map((p) => ({ ...p, afloat: sum([...p.modes.values()]) }))
    .filter((p) => p.afloat > 0);
  const modes = [...new Set(ps.flatMap((p) => [...p.modes.keys()]))];
  let total = 0,
    pairs = 0;
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i],
        b = ps[j];
      const tv =
          sum(
            modes.map((m) =>
              Math.abs(
                (a.modes.get(m) ?? 0) / a.afloat -
                  (b.modes.get(m) ?? 0) / b.afloat
              )
            )
          ) / 2,
        ra = a.shots / a.afloat,
        rb = b.shots / b.afloat,
        fire = ra + rb > 0 ? Math.abs(ra - rb) / (ra + rb) : 0;
      total += (tv + fire) / 2;
      pairs++;
    }
  return pairs ? total / pairs : 0;
}

/**
 * The persona rating spread (P6): the strongest persona's θ less the
 * weakest's (rate.ts), its error the two's errors put together as if apart
 * (they are not quite: θ is centred on the groups' mean).
 */
function spread(rs: readonly Result[]): Measure {
  const r = rate(rs, GROUPINGS.persona, 100).sort((a, b) => a.theta - b.theta);
  if (r.length < 2) return { v: 0, se: NaN };
  const lo = r[0],
    hi = r[r.length - 1];
  return { v: hi.theta - lo.theta, se: Math.hypot(hi.se, lo.se) };
}

export const METRICS: readonly Metric[] = [
  {
    key: 'dealt',
    label: 'Damage dealt a minute, a ship afloat',
    unit: 'hp/min',
    digits: 2,
    better: 'up',
    gate: true,
    of: (rs) => jackknife(rs, (q) => dealt(q) / minutes(q)),
  },
  {
    key: 'mended',
    label: 'Hull mended a minute, a ship afloat',
    unit: 'hp/min',
    digits: 3,
    better: 'up',
    gate: false,
    of: (rs) => jackknife(rs, (q) => hull(q) / minutes(q)),
  },
  {
    key: 'shielded',
    label: 'Shield restored a minute, a ship afloat (stores and water)',
    unit: 'hp/min',
    digits: 3,
    better: 'up',
    gate: false,
    of: (rs) => jackknife(rs, (q) => shield(q) / minutes(q)),
  },
  {
    // all a ship is given back against all blows took: the damage dealt is
    // to hull and shield alike, so the healing set against it is too
    key: 'sustain',
    label: 'Sustain: hull mended and shield restored ÷ damage dealt',
    unit: '',
    digits: 3,
    better: 'up',
    gate: false,
    of: (rs) =>
      jackknife(rs, (q) => (hull(q) + shield(q)) / Math.max(1e-9, dealt(q))),
  },
  {
    key: 'lull',
    label:
      'Longest lull: no blow struck anywhere, after 30 s (mean of matches)',
    unit: 's',
    digits: 1,
    better: 'down',
    gate: true,
    of: (rs) => jackknife(rs, (q) => sum(q.map((r) => r.lull)) / q.length),
  },
  {
    key: 'distinct',
    label: 'Persona distinctness (time in mode, shots a minute; 0 to 1)',
    unit: '',
    digits: 3,
    better: 'up',
    gate: true,
    of: (rs) => jackknife(rs, distinctness),
  },
  {
    // stuck in any mode but claim (metrics.ts pinned: circling in claim is
    // on purpose)
    key: 'stuck',
    label: 'Stuck a ship (pinned: in every mode but claim)',
    unit: 's',
    digits: 2,
    better: 'down',
    gate: false,
    of: (rs) => jackknife(rs, (q) => perShip(q, (s) => s.pinned)),
  },
  {
    key: 'aground',
    label: 'Aground a ship',
    unit: 's',
    digits: 2,
    better: 'down',
    gate: false,
    of: (rs) => jackknife(rs, (q) => perShip(q, (s) => s.aground)),
  },
  {
    // of the ships that fell under LOW hull, those that then sank a ship or
    // rose back over BACK (metrics.ts)
    key: 'comeback',
    label: 'Comebacks: of ships fallen under 30 hull, the share that came back',
    unit: '',
    digits: 3,
    better: 'up',
    gate: true,
    of: (rs) =>
      jackknife(rs, (q) => {
        const low = ships(q).filter((s) => s.low !== null);
        return low.filter((s) => s.comeback).length / Math.max(1, low.length);
      }),
  },
  {
    // with any zone faulted (sim/faults.ts), however long she was afloat
    key: 'faulted',
    label: 'Faulted a ship (any zone)',
    unit: 's',
    digits: 1,
    better: 'down',
    gate: false,
    of: (rs) => jackknife(rs, (q) => perShip(q, (s) => s.faulted ?? 0)),
  },
  {
    key: 'watered',
    label: 'Hull her own water mended a minute, a ship afloat',
    unit: 'hp/min',
    digits: 3,
    better: 'up',
    gate: false,
    of: (rs) =>
      jackknife(
        rs,
        (q) => sum(ships(q).map((s) => s.watered ?? 0)) / minutes(q)
      ),
  },
  {
    key: 'spread',
    label: 'Persona rating spread (strongest θ − weakest)',
    unit: 'θ',
    digits: 3,
    better: 'down',
    gate: false,
    of: spread,
  },
];

export type Values = Record<string, Measure>;

/** A planet's matches measured. */
export interface PlanetRow {
  planet: number;
  kept: Kept | null;
  matches: number;
  values: Values;
}

/** The worst planet of a set for one metric: which, and its figure. */
export interface Worst extends Measure {
  planet: number;
}

/** A run measured: planet by planet, each set pooled, and each set's worst planet by each metric. */
export interface Measured {
  planets: PlanetRow[];
  pooled: Partial<Record<Kept, Values>>;
  worst: Partial<Record<Kept, Record<string, Worst>>>;
}

const valuesOf = (rs: readonly Result[]): Values =>
  Object.fromEntries(METRICS.map((m) => [m.key, m.of(rs)]));

/** Every metric of `results`, by planet, by set pooled, and each set's worst planet. */
export function measured(results: readonly Result[]): Measured {
  const seeds = [...new Set(results.map((r) => r.spec.planet ?? NaN))];
  const planets = seeds.map((planet): PlanetRow => {
    const rs = results.filter((r) => (r.spec.planet ?? NaN) === planet);
    return {
      planet,
      kept: keptOf(planet),
      matches: rs.length,
      values: valuesOf(rs),
    };
  });
  const out: Measured = { planets, pooled: {}, worst: {} };
  for (const k of KEPT) {
    const rows = planets.filter((p) => p.kept === k);
    if (!rows.length) continue;
    out.pooled[k] = valuesOf(
      results.filter((r) => keptOf(r.spec.planet ?? NaN) === k)
    );
    out.worst[k] = Object.fromEntries(
      METRICS.map((m) => {
        const w = rows.reduce((a, b) =>
          (
            m.better === 'up'
              ? b.values[m.key].v < a.values[m.key].v
              : b.values[m.key].v > a.values[m.key].v
          )
            ? b
            : a
        );
        return [m.key, { planet: w.planet, ...w.values[m.key] }];
      })
    );
  }
  return out;
}
