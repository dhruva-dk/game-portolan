// The wind: the old game's field of slowly turning swirls over the sphere, with gusts drifting through it,
// calm water in the lee of islands, and weather systems bending it.
import { PI, cross, dcos, dot, dsin, hash32, length, normalize, rngDir, rngFrom, rngRange, set, v3, type Rng, type V3 } from './math.ts';
import { R, advance } from './sphere.ts';
import { STREAM, TICK, type MatchState, type WindGust } from './state.ts';
import { GUSTS, WIND } from './tables.ts';
import { bend, newSky, skyAt, type Sky } from './weather.ts';
import { heightAt } from './world/index.ts';

interface Swirl { readonly axis: V3; readonly spin: V3; readonly drift: number; readonly amp: number; readonly freq: number; readonly phase: number }
interface Field { readonly seed: number; readonly swirls: readonly Swirl[]; readonly mean: number }

let field: Field | null = null;

/** The match's swirls, drawn from its seed. Not part of the state: they follow from the seed alone. */
function fieldOf(seed: number): Field {
  if (field && field.seed === seed) return field;
  const rng = rngFrom(hash32(seed, 0x77696e64)), swirls: Swirl[] = [];
  for (let k = 0; k < WIND.terms; k++) {
    swirls.push({
      axis: rngDir(rng, v3()), spin: rngDir(rng, v3()), drift: rngRange(rng, WIND.drift[0], WIND.drift[1]),
      amp: rngRange(rng, 0.6, 1), freq: rngRange(rng, WIND.freq[0], WIND.freq[1]), phase: rngRange(rng, 0, 2 * PI),
    });
  }
  const made: Field = { seed, swirls, mean: 1 };
  const N = 642, p = v3(), w = v3();
  let sum = 0;
  for (let k = 0; k < N; k++) {
    const z = 1 - (2 * k + 1) / N, r = Math.sqrt(1 - z * z), lon = k * 2.399963229728653;
    sum += swirl(made, 0, set(p, r * dcos(lon), r * dsin(lon), z), w);
  }
  field = { seed, swirls, mean: sum / N };
  return field;
}

const AXES = Array.from({ length: WIND.terms }, () => v3());
let axesOf: Field | null = null, axesTime = Number.NaN;

function turnAxes(f: Field, t: number): void {
  if (f === axesOf && t === axesTime) return;
  axesOf = f;
  axesTime = t;
  for (let k = 0; k < WIND.terms; k++) {
    const { axis: d, spin: s, drift } = f.swirls[k], a = drift * t, c = dcos(a), sn = dsin(a), sd = dot(s, d) * (1 - c);
    set(AXES[k], d.x * c + (s.y * d.z - s.z * d.y) * sn + s.x * sd, d.y * c + (s.z * d.x - s.x * d.z) * sn + s.y * sd,
      d.z * c + (s.x * d.y - s.y * d.x) * sn + s.z * sd);
  }
}

function swirl(f: Field, t: number, p: V3, out: V3): number {
  turnAxes(f, t);
  set(out, 0, 0, 0);
  for (let k = 0; k < WIND.terms; k++) {
    const s = f.swirls[k], d = AXES[k], c = (s.amp * s.freq * dcos(s.freq * dot(p, d) + s.phase)) / f.mean;
    out.x += c * (p.y * d.z - p.z * d.y);
    out.y += c * (p.z * d.x - p.x * d.z);
    out.z += c * (p.x * d.y - p.y * d.x);
  }
  return length(out);
}

/** The swirl field's direction at p, scaled to the mean wind speed. */
export function breeze(state: MatchState, p: V3, out: V3): V3 {
  const m = swirl(fieldOf(state.seed), state.tick * TICK, p, out), s = m > 0 ? WIND.speed / m : 0;
  return set(out, out.x * s, out.y * s, out.z * s);
}

export interface Wind {
  /** Where the wind blows to, m/s. */
  readonly v: V3;
  /** 1 is a fair breeze; less in a calm or a lee, more in a squall or a gust. */
  strength: number;
  /** How settled the direction is. */
  steady: number;
  gust: number;
  /** The lee factor: 1 in the open, less behind land. */
  lee: number;
}

export function newWind(): Wind {
  return { v: v3(), strength: 0, steady: 0, gust: 0, lee: 1 };
}

const SKY: Sky = newSky(), UP = v3(), PROBE = v3(), T = v3();

export function windAt(state: MatchState, p: V3, out: Wind): Wind {
  const m = swirl(fieldOf(state.seed), state.tick * TICK, p, out.v);
  skyAt(state, p, SKY);
  out.gust = gustAt(state, p);
  out.steady = Math.min(1, m / WIND.lull);
  out.lee = m > 0 ? leeAt(p, set(UP, -out.v.x / m, -out.v.y / m, -out.v.z / m)) : 1;
  out.strength = (1 + GUSTS.strength * out.gust) * SKY.wind * out.lee;
  const s = m > 0 ? (WIND.speed * out.strength) / m : 0;
  set(out.v, out.v.x * s, out.v.y * s, out.v.z * s);
  bend(state, p, out.v);
  return out;
}

/** Calm in the lee of land: the nearer the land upwind, the stiller the water. */
function leeAt(p: V3, upwind: V3): number {
  for (let k = 0; k < WIND.lee.length; k++) {
    advance(p, upwind, WIND.lee[k], PROBE, T);
    if (heightAt(PROBE) > 1) return WIND.still + ((1 - WIND.still) * k) / WIND.lee.length;
  }
  return 1;
}

export function gustAt(state: MatchState, p: V3): number {
  let g = 0;
  for (const gust of state.gusts) {
    if (gust.life === 0) continue;
    const q = 1 - (R * R * (2 - 2 * dot(p, gust.at))) / (gust.r * gust.r);
    if (q > 0) g = Math.max(g, dsin((PI * gust.age) / gust.life) * q * q);
  }
  return g;
}

const DRIFT = v3();

/** Moves the wind gusts on, and starts new ones where old ones die. */
export function stir(state: MatchState): void {
  const rng = state.rng[STREAM.wind], f = fieldOf(state.seed), t = state.tick * TICK;
  for (const gust of state.gusts) {
    if (gust.age >= gust.life) {
      spawn(rng, gust);
      continue;
    }
    gust.age += TICK;
    if (swirl(f, t, gust.at, DRIFT) > 0) advance(gust.at, normalize(DRIFT), WIND.speed * GUSTS.drift * TICK, gust.at, DRIFT);
  }
}

function spawn(rng: Rng, gust: WindGust): void {
  const first = gust.life === 0;
  rngDir(rng, gust.at);
  gust.r = rngRange(rng, GUSTS.radius[0], GUSTS.radius[1]);
  gust.life = rngRange(rng, GUSTS.life[0], GUSTS.life[1]);
  gust.age = first ? rngRange(rng, 0, gust.life) : 0;
}

export function newGusts(): WindGust[] {
  return Array.from({ length: GUSTS.count }, () => ({ at: v3(0, 0, 1), age: 0, life: 0, r: 0 }));
}

/** The swirl around a point, for weather systems that spin the wind. */
export function spinAround(centre: V3, p: V3, out: V3): V3 {
  cross(out, centre, p);
  const l = length(out);
  return l > 1e-9 ? set(out, out.x / l, out.y / l, out.z / l) : set(out, 0, 0, 0);
}

