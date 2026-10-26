import { damage } from './combat.ts';
import { HALF_PI, PI, addScaled, dacos, dcos, dot, dsin, dtan, normalize, set, v3, type V3 } from './math.ts';
import { TERRITORY } from './sphere.ts';
import { CAUSE, SHIPS, TICK, afloat, type MatchState } from './state.ts';
import { STORM } from './tables.ts';
import { swallow } from './territory.ts';

export interface Calm {
  at: V3;
  r: number;
  cos: number;
}

export const newCalm = (): Calm => ({ at: v3(0, 0, 1), r: PI, cos: -1 });

export interface StormView {
  phase: number;
  calm: Calm;
  next: Calm;
  announced: boolean;
  toMove: number;
  toHold: number;
  rate: number;
}

export const newStormView = (): StormView => ({
  phase: 0, calm: newCalm(), next: newCalm(), announced: false, toMove: 0, toHold: 0, rate: 0,
});

const PHASES = STORM.phases;
const W = v3(), FROM = newCalm(), TO = newCalm();

function begun(t: number): number {
  let k = 0;
  while (k < PHASES.length && t >= PHASES[k].move) k++;
  return k;
}

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

export function calmAt(state: MatchState, t: number, out: Calm): Calm {
  const k = begun(t);
  if (k === 0) return planned(state, 0, out);
  const p = PHASES[k - 1], s = (t - p.move) / p.sweep;
  if (s >= 1) return planned(state, k, out);
  const a = planned(state, k - 1, FROM).at, b = planned(state, k, TO).at, c = Math.max(-1, Math.min(1, dot(a, b)));
  const d = dacos(c) * s;
  if (d > 0) {
    normalize(addScaled(W, b, a, -c));
    const cd = dcos(d), sd = dsin(d);
    set(out.at, a.x * cd + W.x * sd, a.y * cd + W.y * sd, a.z * cd + W.z * sd);
  } else set(out.at, a.x, a.y, a.z);
  out.r = FROM.r + (TO.r - FROM.r) * s;
  out.cos = dcos(out.r);
  return out;
}

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

export const inStorm = (state: MatchState, p: V3): boolean => dot(p, calmNow(state).at) < NOW.cos;

export function stormView(state: MatchState, out: StormView): StormView {
  const t = state.tick * TICK, k = begun(t), now = calmNow(state);
  set(out.calm.at, now.at.x, now.at.y, now.at.z);
  out.calm.r = now.r;
  out.calm.cos = now.cos;
  out.phase = k;
  out.rate = k > 0 ? PHASES[k - 1].rate : 0;
  const sweeping = k > 0 && t < PHASES[k - 1].move + PHASES[k - 1].sweep;
  const heard = k === 0 ? STORM.announce : PHASES[k - 1].move + PHASES[k - 1].sweep;
  const ahead = sweeping ? k - 1 : k;
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

const N = TERRITORY.n, LOG = TERRITORY.log, ROWS = 6 * N, PER = Math.ceil(ROWS / STORM.scan);
const G = Float64Array.from({ length: N }, (_, i) => dtan((((i + 0.5) / N) * 2 - 1) * (PI / 4)));
const G2 = G.map((g) => g * g);
const FACE_N = [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)];
const FACE_U = [v3(0, 0, -1), v3(0, 0, 1), v3(1, 0, 0), v3(1, 0, 0), v3(1, 0, 0), v3(-1, 0, 0)];
const FACE_V = [v3(0, 1, 0), v3(0, 1, 0), v3(0, 0, -1), v3(0, 0, 1), v3(0, 1, 0), v3(0, 1, 0)];
const FOUND = new Int32Array(N);
const ORDER = new Int32Array(SHIPS);

function scan(state: MatchState, calm: Calm): void {
  const from = (state.tick % STORM.scan) * PER, to = Math.min(ROWS, from + PER), c = calm.at, k = calm.cos;
  const owner = state.owner, convex = calm.r <= HALF_PI;
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
  const calm = calmNow(state), k = begun(state.tick * TICK);
  if (k === 0) return;
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
