// The storm (PROMPT.md, A match: The storm). It rises at its origin, anywhere on the planet, and closes in phases
// toward a final calm sea, anywhere too. The calm is a spherical cap: calm 0 is the whole sea but the origin's point,
// and each STORM phase sweeps it, centre along a great circle and radius alike, to the next calm of the plan
// (createMatch draws it: every calm inside the one before), so the storm only ever grows, from the origin's side.
// Each phase is announced before it moves (stormView: the HUD's dial and the renderer's horizon), sweeps, then holds.
// Inside it ships lose hull at the phase's rate (combat.ts damage), sails labour (sailing.ts trim) and sight drops
// (visibility.ts), and the sea it covers loses its owner (territory.ts swallow). The last phase closes the final calm
// itself, so whoever is still afloat founders: no match outlasts the storm.
import { damage } from './combat.ts';
import { HALF_PI, PI, addScaled, dacos, dcos, dot, dsin, dtan, normalize, set, v3, type V3 } from './math.ts';
import { TERRITORY } from './sphere.ts';
import { CAUSE, SHIPS, TICK, afloat, type MatchState } from './state.ts';
import { STORM } from './tables.ts';
import { swallow } from './territory.ts';

/** A calm: the storm-free cap round `at`, of angular radius r (π: the whole sphere); `cos` is cos r. */
export interface Calm {
  at: V3;
  r: number;
  cos: number;
}

export const newCalm = (): Calm => ({ at: v3(0, 0, 1), r: PI, cos: -1 });

/** The storm as the HUD's dial and the renderer show it. */
export interface StormView {
  /** Phases that have begun to move: 0 until the first does, STORM.phases.length once the last has. */
  phase: number;
  /** The calm now. */
  calm: Calm;
  /** The calm the announced (or sweeping) phase closes to; the calm now when none is announced. */
  next: Calm;
  /** Whether a phase is announced and not yet held: on the chart and the horizon from its announcement to its hold. */
  announced: boolean;
  /** Seconds until the announced phase moves (0 while it sweeps), and until it holds. */
  toMove: number;
  toHold: number;
  /** Hull a second lost inside the storm now. */
  rate: number;
}

export const newStormView = (): StormView => ({
  phase: 0, calm: newCalm(), next: newCalm(), announced: false, toMove: 0, toHold: 0, rate: 0,
});

const PHASES = STORM.phases;
const W = v3(), FROM = newCalm(), TO = newCalm();

/** Phases begun moving by match time t. */
function begun(t: number): number {
  let k = 0;
  while (k < PHASES.length && t >= PHASES[k].move) k++;
  return k;
}

/** Calm k of the plan into `out`: calm 0 the whole sea but the origin, calm k ≥ 1 the end of phase k's sweep. */
function planned(state: MatchState, k: number, out: Calm): Calm {
  const o = state.storm.origin;
  if (k === 0) {
    set(out.at, -o.x, -o.y, -o.z);
    out.r = PI;
  } else {
    const c = state.storm.calms[k - 1];
    set(out.at, c.at.x, c.at.y, c.at.z);
    out.r = c.r;
  }
  out.cos = dcos(out.r);
  return out;
}

/** The calm at match time t, into `out`: during phase k's sweep, centre and radius move evenly from calm k − 1 to calm k. */
export function calmAt(state: MatchState, t: number, out: Calm): Calm {
  const k = begun(t);
  if (k === 0) return planned(state, 0, out);
  const p = PHASES[k - 1], s = (t - p.move) / p.sweep;
  if (s >= 1) return planned(state, k, out);
  const a = planned(state, k - 1, FROM).at, b = planned(state, k, TO).at, c = Math.max(-1, Math.min(1, dot(a, b)));
  const d = dacos(c) * s;
  if (d > 0) {
    normalize(addScaled(W, b, a, -c)); // the tangent at a toward b
    const cd = dcos(d), sd = dsin(d);
    set(out.at, a.x * cd + W.x * sd, a.y * cd + W.y * sd, a.z * cd + W.z * sd);
  } else set(out.at, a.x, a.y, a.z);
  out.r = FROM.r + (TO.r - FROM.r) * s;
  out.cos = dcos(out.r);
  return out;
}

/** The calm now, worked out once a tick for every reader (the storm, the sails, the lookouts). */
const NOW = newCalm();
let nowOf: MatchState | null = null, nowTick = -1;

export function calmNow(state: MatchState): Calm {
  if (nowOf !== state || nowTick !== state.tick) {
    calmAt(state, state.tick * TICK, NOW);
    nowOf = state;
    nowTick = state.tick;
  }
  return NOW;
}

/** Whether p lies in the storm now. */
export const inStorm = (state: MatchState, p: V3): boolean => dot(p, calmNow(state).at) < NOW.cos;

/** The storm now, for the HUD's dial and the renderer, into `out`. */
export function stormView(state: MatchState, out: StormView): StormView {
  const t = state.tick * TICK, k = begun(t), now = calmNow(state);
  set(out.calm.at, now.at.x, now.at.y, now.at.z);
  out.calm.r = now.r;
  out.calm.cos = now.cos;
  out.phase = k;
  out.rate = k > 0 ? PHASES[k - 1].rate : 0;
  const sweeping = k > 0 && t < PHASES[k - 1].move + PHASES[k - 1].sweep;
  const heard = k === 0 ? STORM.announce : PHASES[k - 1].move + PHASES[k - 1].sweep;
  const ahead = sweeping ? k - 1 : k; // the phase on the chart: the sweeping one, else the next
  out.announced = ahead < PHASES.length && (sweeping || t >= heard);
  if (out.announced) {
    planned(state, ahead + 1, out.next);
    out.toMove = Math.max(0, PHASES[ahead].move - t);
    out.toHold = PHASES[ahead].move + PHASES[ahead].sweep - t;
  } else {
    set(out.next.at, now.at.x, now.at.y, now.at.z);
    out.next.r = now.r;
    out.next.cos = now.cos;
    out.toMove = 0;
    out.toHold = 0;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The territory scan. The cells of one face row lie on a great circle; the cell at column i has the unnormalised
// direction N + G[i]·EU + G[j]·EV for its face, so the test "its centre lies in the calm" is one multiply-add and a
// square root. Every STORM.scan ticks the scan passes over every row once, swallowing each held cell it finds in the
// storm: what the wall overruns, and anything claimed behind it.

const N = TERRITORY.n, LOG = TERRITORY.log, ROWS = 6 * N, PER = Math.ceil(ROWS / STORM.scan);
const G = Float64Array.from({ length: N }, (_, i) => dtan((((i + 0.5) / N) * 2 - 1) * (PI / 4)));
const G2 = G.map((g) => g * g);
/** By face, as gnomonicDir lays them out: the face's centre, and the directions of growing u and v. */
const FACE_N = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
const FACE_U = [v3(0, 0, -1), v3(0, 0, 1), v3(1, 0, 0), v3(1, 0, 0), v3(1, 0, 0), v3(-1, 0, 0)];
const FACE_V = [v3(0, 1, 0), v3(0, 1, 0), v3(0, 0, -1), v3(0, 0, 1), v3(0, 1, 0), v3(0, 1, 0)];
const FOUND = new Int32Array(N);
const ORDER = new Int32Array(SHIPS);

/** This tick's share of the scan: the held cells of its rows that lie in the storm lose their owners. */
function scan(state: MatchState, calm: Calm): void {
  const from = (state.tick % STORM.scan) * PER, to = Math.min(ROWS, from + PER), c = calm.at, k = calm.cos;
  const owner = state.owner, convex = calm.r <= HALF_PI;
  for (let row = from; row < to; row++) {
    const f = row >> LOG, j = row & (N - 1), n = FACE_N[f], ev = FACE_V[f];
    const a = dot(n, c) + G[j] * dot(ev, c), b = dot(FACE_U[f], c), q = 1 + G2[j];
    // A convex calm holding both ends of the row holds the arc between them: nothing in this row is in the storm.
    if (convex && a + G[0] * b >= k * Math.sqrt(q + G2[0]) && a + G[N - 1] * b >= k * Math.sqrt(q + G2[N - 1])) continue;
    const base = (f << (2 * LOG)) + (j << LOG);
    let m = 0;
    for (let i = 0; i < N; i++) {
      if (owner[base + i] !== 0 && a + G[i] * b < k * Math.sqrt(q + G2[i])) FOUND[m++] = base + i;
    }
    if (m > 0) swallow(state, FOUND.subarray(0, m));
  }
}

/**
 * The step's storm, after the territory is charted: ships in it lose the phase's hull a second, the one holding the
 * least sea first (then the poorer bank, then the lower index), so when the storm sinks the last two together the
 * greater captain is the one left afloat; then this tick's share of the territory scan.
 */
export function storm(state: MatchState): void {
  const calm = calmNow(state), k = begun(state.tick * TICK);
  if (k === 0) return; // calm 0: the storm is a bruise at its origin, over no sea yet
  let n = 0;
  for (let i = 0; i < SHIPS; i++) {
    const ship = state.ships[i];
    if (!afloat(ship) || dot(ship.pos, calm.at) >= calm.cos) continue;
    let at = n++;
    for (; at > 0; at--) {
      const o = state.ships[ORDER[at - 1]];
      if (!(ship.held < o.held || (ship.held === o.held && ship.bank < o.bank))) break;
      ORDER[at] = ORDER[at - 1];
    }
    ORDER[at] = i;
  }
  const hurt = PHASES[k - 1].rate * TICK;
  for (let m = 0; m < n; m++) damage(state, ORDER[m], hurt, -1, CAUSE.storm);
  scan(state, calm);
}
