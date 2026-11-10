// The Storm: the first safe circle covers half the planet; over seven phases it waits, then closes to the next
// circle, each wholly inside the last, down to a final circle that lies within one region and takes in some of
// its land. Each region hosts the finale about equally often. Outside the circle the Storm wears at the hull only,
// and it washes away the ink it passes over.
import { hurt } from './harm.ts';
import { HALF_PI, PI, addScaled, dacos, dcos, dot, dsin, dtan, fmix32, normalize, rngFloat, rngRange, set, v3, type Rng, type V3 } from './math.ts';
import { openAt } from './nav.ts';
import { R, TERRITORY, along, tangentAt } from './sphere.ts';
import { CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, emit, type MatchState } from './state.ts';
import { STORM, ZONES } from './tables.ts';
import { swallow } from './territory.ts';
import { BLEND, CENTRES, REGIONS, heightAt, regionMix } from './world/index.ts';

export const LAST = STORM.phases.length;

export interface Calm {
  at: V3;
  /** Radius in metres along the surface. */
  r: number;
  cos: number;
}

export function newCalm(): Calm {
  return { at: v3(0, 0, 1), r: ZONES[0], cos: 0 };
}

/** The region that hosts this seed's finale: every run of 16 seeds visits each region once, in a scrambled order. */
export function finaleRegion(seed: number): number {
  return ((fmix32(seed >>> 4) + (seed & 15)) & 15) % REGIONS.length;
}

/**
 * Plans the circles for a match: the final one first, inside the finale region with land in it, then each wider
 * one around the one inside it.
 */
export function planStorm(state: MatchState): void {
  const rng = state.rng[STREAM.storm], s = state.storm;
  s.region = finaleRegion(state.seed);
  s.phase = 0;
  s.shrinking = false;
  s.start = Math.round(STORM.first / TICK);
  const n = ZONES.length;
  s.centres = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 1 }));
  const final = finalCentre(rng, s.region);
  const last = n - 2;
  set(s.centres[last], final.x, final.y, final.z);
  set(s.centres[n - 1], final.x, final.y, final.z);
  const t = v3();
  for (let k = last - 1; k >= 0; k--) {
    const inner = s.centres[k + 1], slack = ZONES[k] - ZONES[k + 1];
    tangentAt(inner, rngRange(rng, -PI, PI), t);
    along(inner, t, slack * Math.sqrt(rngFloat(rng)) * 0.9, s.centres[k]);
  }
}

const P = v3(), T = v3(), Q = v3(), MIX = { a: 0, b: 0, t: 0 };

/** A point in the region, a full circle's width clear of its borders, with land inside the final circle. */
function finalCentre(rng: Rng, region: number): V3 {
  const r = ZONES[ZONES.length - 2], c = CENTRES[region], out = v3();
  let fallback = false;
  for (let tries = 0; tries < 400; tries++) {
    tangentAt(c, rngRange(rng, -PI, PI), T);
    along(c, T, rngRange(rng, 0, tries < 200 ? 160 : 260), P);
    if (!inside(P, region, r)) continue;
    if (!openAt(P)) continue;
    if (!landWithin(P, r * 0.8)) continue;
    set(out, P.x, P.y, P.z);
    return out;
  }
  // the region's centre always qualifies in the placeholder world: an island with water round it
  fallback = true;
  tangentAt(c, 0, T);
  for (let d = 0; d < 200 && fallback; d += 4) {
    along(c, T, d, P);
    if (inside(P, region, r) && openAt(P) && landWithin(P, r * 0.8)) fallback = false;
  }
  if (fallback) set(P, c.x, c.y, c.z);
  return set(out, P.x, P.y, P.z);
}

/** True when a circle of radius r at p lies wholly in the region. */
export function inside(p: V3, region: number, r: number): boolean {
  regionMix(p, MIX);
  if (MIX.a !== region || MIX.t > 0) return false;
  // the blend band only reaches BLEND metres; check the rim further out than that
  if (r <= BLEND) return true;
  for (let k = 0; k < 8; k++) {
    tangentAt(p, (k * PI) / 4, T);
    along(p, T, r, Q);
    regionMix(Q, MIX);
    if (MIX.a !== region) return false;
  }
  return true;
}

/** Some land within r of p. */
export function landWithin(p: V3, r: number): boolean {
  if (heightAt(p) > 0) return true;
  for (let ring = 1; ring <= 4; ring++) {
    const d = (r * ring) / 4, n = 6 * ring;
    for (let k = 0; k < n; k++) {
      tangentAt(p, (2 * PI * k) / n, T);
      if (heightAt(along(p, T, d, Q)) > 0) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- the clock

const W = v3();

/** Seconds since the Storm's clock started. */
const clock = (state: MatchState): number => Math.max(0, (state.tick - state.storm.start) * TICK);

/** Which phase is running at storm time t, whether it is closing, and how far through that part it is. */
export function phaseAt(t: number): { k: number; closing: boolean; f: number; left: number } {
  let s = 0;
  for (let k = 0; k < LAST; k++) {
    const p = STORM.phases[k], wait = p.wait, shrink = p.shrink;
    if (t < s + wait) return { k, closing: false, f: (t - s) / wait, left: s + wait - t };
    s += wait;
    if (t < s + shrink) return { k, closing: true, f: (t - s) / shrink, left: s + shrink - t };
    s += shrink;
  }
  return { k: LAST, closing: false, f: 1, left: 0 };
}

/** The phase running now: 0 for the first, up to LAST once the Storm has closed. */
export const stormPhase = (state: MatchState): number => phaseAt(clock(state)).k;

/** The safe circle at storm time t. */
export function calmAt(state: MatchState, t: number, out: Calm): Calm {
  const ph = phaseAt(t), c = state.storm.centres;
  if (!ph.closing) {
    const z = Math.min(ph.k, ZONES.length - 1);
    set(out.at, c[z].x, c[z].y, c[z].z);
    out.r = ZONES[z];
  } else {
    const a = c[ph.k], b = c[ph.k + 1], cs = Math.max(-1, Math.min(1, dot(a, b))), d = dacos(cs) * ph.f;
    if (d > 1e-9) {
      normalize(addScaled(W, b, a, -cs));
      const cd = dcos(d), sd = dsin(d);
      set(out.at, a.x * cd + W.x * sd, a.y * cd + W.y * sd, a.z * cd + W.z * sd);
    } else set(out.at, a.x, a.y, a.z);
    out.r = ZONES[ph.k] + (ZONES[ph.k + 1] - ZONES[ph.k]) * ph.f;
  }
  out.cos = dcos(out.r / R);
  return out;
}

const NOW = newCalm();
let nowOf: MatchState | null = null, nowTick = -1;

export function calmNow(state: MatchState): Calm {
  if (nowOf !== state || nowTick !== state.tick) {
    calmAt(state, clock(state), NOW);
    nowOf = state;
    nowTick = state.tick;
  }
  return NOW;
}

/** Whether the Storm hurts yet: the first circle is only a warning, until it first starts to close. */
export const stormBites = (state: MatchState): boolean => state.tick >= state.storm.start && (state.storm.phase > 0 || state.storm.shrinking);

export const inStorm = (state: MatchState, p: V3): boolean => dot(p, calmNow(state).at) < calmNow(state).cos;

/** Metres from p to the edge of the safe circle: positive inside. */
export const toEdge = (state: MatchState, p: V3): number => {
  const c = calmNow(state);
  return c.r - R * dacos(Math.max(-1, Math.min(1, dot(p, c.at))));
};

/** The Storm's damage a second, past the shield. */
export function stormDamage(state: MatchState): number {
  const t = clock(state), ph = phaseAt(t);
  if (ph.k < LAST) return STORM.phases[ph.k].damage;
  let total = 0;
  for (const p of STORM.phases) total += p.wait + p.shrink;
  return STORM.phases[LAST - 1].damage + STORM.rise * Math.floor((t - total) / STORM.every + 1);
}

export interface StormView {
  phase: number;
  closing: boolean;
  /** Seconds until the next change: the wait ending or the closing ending. */
  left: number;
  calm: Calm;
  /** The circle it is closing to, or will close to next. */
  next: Calm;
  damage: number;
  region: number;
}

export function newStormView(): StormView {
  return { phase: 0, closing: false, left: 0, calm: newCalm(), next: newCalm(), damage: 0, region: 0 };
}

export function stormView(state: MatchState, out: StormView): StormView {
  const t = clock(state), ph = phaseAt(t), c = calmNow(state);
  out.phase = ph.k;
  out.closing = ph.closing;
  out.left = ph.left;
  set(out.calm.at, c.at.x, c.at.y, c.at.z);
  out.calm.r = c.r;
  out.calm.cos = c.cos;
  const z = Math.min(ph.k + 1, ZONES.length - 1), n = state.storm.centres[z];
  set(out.next.at, n.x, n.y, n.z);
  out.next.r = ZONES[z];
  out.next.cos = dcos(ZONES[z] / R);
  out.damage = stormDamage(state);
  out.region = state.storm.region;
  return out;
}

// ---------------------------------------------------------------- the tick

const N = TERRITORY.n, LOG = TERRITORY.log, ROWS = 6 * N, PER = Math.ceil(ROWS / STORM.scan);
const G = Float64Array.from({ length: N }, (_, i) => dtan((((i + 0.5) / N) * 2 - 1) * (PI / 4)));
const G2 = G.map((g) => g * g);
const FACE_N = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
const FACE_U = [v3(0, 0, -1), v3(0, 0, 1), v3(1, 0, 0), v3(1, 0, 0), v3(1, 0, 0), v3(-1, 0, 0)];
const FACE_V = [v3(0, 1, 0), v3(0, 1, 0), v3(0, 0, -1), v3(0, 0, 1), v3(0, 1, 0), v3(0, 1, 0)];
const FOUND = new Int32Array(N);

/** Washes the ink outside the circle, a few rows of the grid a tick. */
function scan(state: MatchState, calm: Calm): void {
  const from = (state.tick % STORM.scan) * PER, to = Math.min(ROWS, from + PER), c = calm.at, k = calm.cos;
  const owner = state.owner, convex = calm.r / R <= HALF_PI;
  for (let row = from; row < to; row++) {
    const f = row >> LOG, j = row & (N - 1), n = FACE_N[f], ev = FACE_V[f];
    const a = dot(n, c) + G[j] * dot(ev, c), b = dot(FACE_U[f], c), q = 1 + G2[j];
    if (convex && a + G[0] * b >= k * Math.sqrt(q + G2[0]) && a + G[N - 1] * b >= k * Math.sqrt(q + G2[N - 1])) continue;
    const base = (f << (2 * LOG)) + (j << LOG);
    let m = 0;
    for (let i = 0; i < N; i++) {
      if (owner[base + i] !== 0 && a + G[i] * b < k * Math.sqrt(q + G2[i])) FOUND[m++] = base + i;
    }
    if (m > 0) swallow(state, FOUND.subarray(0, m));
  }
}

export function storm(state: MatchState): void {
  const s = state.storm, t = clock(state), ph = phaseAt(t);
  if (state.tick === s.start || ph.k !== s.phase || ph.closing !== s.shrinking) {
    if (ph.k < LAST) {
      const z = ph.closing ? ph.k + 1 : ph.k;
      emit(state, ph.closing ? EVENT.stormShrink : EVENT.stormWait, -1, -1, s.centres[Math.min(z, s.centres.length - 1)], {
        item: ph.k, amount: ph.left, y: ZONES[Math.min(ph.k + 1, ZONES.length - 1)],
      });
    }
    s.phase = ph.k;
    s.shrinking = ph.closing;
  }
  // the first circle is only a warning: the Storm bites once it first starts to close
  if (!stormBites(state)) return;
  const calm = calmNow(state), hurtNow = stormDamage(state) * TICK;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (ship.phase !== PHASE.sea || dot(ship.pos, calm.at) >= calm.cos) continue;
    hurt(state, i, hurtNow, -1, CAUSE.storm, ship.pos, 0);
  }
  if (calm.r < ZONES[0]) scan(state, calm);
}
