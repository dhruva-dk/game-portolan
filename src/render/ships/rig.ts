import * as THREE from 'three';
import { HullForm, type FormName, type LateenMastSpec, type MastSpec, type SquareMastSpec } from './forms.ts';

export interface SailState { set: number; reef: number; fill: number; slack: number; shiver: number; torn: number }
export interface RigState { brace: number[]; sails: SailState[] }
export type Canvas = 'full' | 'plain' | 'reefed';

export interface MastSection { from: number; to: number; r0: number; r1: number; zOff: number }
export interface MastLayout {
  spec: MastSpec;
  foot: THREE.Vector3;
  axis: THREE.Vector3;
  fwd: THREE.Vector3;
  sections: MastSection[];
  sail: number;
  braceMin: number; braceMax: number;
  top: number;
}
export interface YardLayout { mast: number; kind: 'square' | 'lateen' | 'sprit'; h: number; a: number; b: number; r: number }
export interface SailLayout {
  mast: number; yard: number; kind: 'square' | 'lateen';
  h0: readonly [number, number]; h1: readonly [number, number]; f0: readonly [number, number]; f1: readonly [number, number];
  roach: number; belly: number; band: number; reefs: number; lowers: boolean; light: boolean;
  cloths: number;
  emblem: boolean;
}
export type Anchor = { hull: THREE.Vector3 } | { yard: number; p: THREE.Vector3 } | { sail: number; u: number; v: number };
export interface RopeLayout { a: Anchor; b: Anchor; r: number; tar: boolean; standing: boolean; weather?: { mast: number; side: number } }
export interface Spar { a: THREE.Vector3; b: THREE.Vector3; r: number; owner: number }

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const LATEEN_BRACE: readonly [number, number] = [0.18, 0.95];
const SQUARE_BRACE_MARGIN = 0.9;
const SHROUD_AFT = 0.3, SHROUD_STEP = 0.12;
const RATLINE_STEP = 0.13;

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _y = new THREE.Matrix4(), _v = V(), _w = V(), _ax = V();

export function sailLocal(s: SailLayout, st: SailState, u: number, v: number, time: number, o: THREE.Vector3): THREE.Vector3 {
  const PI = Math.PI, su = Math.sin(PI * u);
  const hx = s.h0[0] + (s.h1[0] - s.h0[0]) * u, hy = s.h0[1] + (s.h1[1] - s.h0[1]) * u;
  let fx = s.f0[0] + (s.f1[0] - s.f0[0]) * u, fy = s.f0[1] + (s.f1[1] - s.f0[1]) * u + s.roach * su;
  const vr = Math.min(st.reef, s.reefs) * s.band;
  if (s.lowers) fy += vr * (s.h0[1] - s.f0[1]);
  else { fx = hx + (1 - vr) * (fx - hx); fy = hy + (1 - vr) * (fy - hy); }
  const vv = Math.min(Math.max((v - vr) / (1 - vr), 0), 1), set = st.set, vs = vv * set;
  let x = hx + (fx - hx) * vs, y = hy + (fy - hy) * vs, z = 0;
  const d = Math.hypot(fx - hx, fy - hy) * su * set;
  const bel = st.fill * (1 - st.slack) * s.belly * d * Math.sin(0.75 * PI * vv);
  z += bel + st.slack * 0.02 * d * vv * (1 + Math.sin(PI * 7 * u)) + st.shiver * 0.03 * d * Math.sin(PI * vv) * (0.5 + 0.5 * Math.sin(time * 38 + u * 11 - vv * 7));
  y += 0.6 * bel * vv * vv - st.slack * 0.07 * d * vv;
  const g = vr > 0 ? Math.min(Math.max((vr - v) / 0.04, 0), 1) : 0;
  y += 0.035 * g;
  z += 0.045 * g;
  const k = Math.min(Math.max(set / 0.25, 0), 1), f = k * k * (3 - 2 * k);
  return o.set(hx * 0.97 + (x - hx * 0.97) * f, hy + 0.04 + 0.02 * Math.sin(PI * v) + (y - hy - 0.04 - 0.02 * Math.sin(PI * v)) * f,
    0.05 + 0.025 * Math.cos(PI * v) + (z - 0.05 - 0.025 * Math.cos(PI * v)) * f);
}

export const SAIL_GLSL =  `
vec3 sailLocal(vec4 A, vec4 B, vec4 C, float lowers, vec4 st, vec2 fx, float u, float v, float time) {
  const float PI = 3.14159265;
  float su = sin(PI * u);
  float hx = mix(A.x, A.z, u), hy = mix(A.y, A.w, u);
  float fxx = mix(B.x, B.z, u), fy = mix(B.y, B.w, u) + C.x * su;
  float vr = min(st.y, C.w) * C.z;
  if (lowers > 0.5) fy += vr * (A.y - B.y);
  else { fxx = hx + (1.0 - vr) * (fxx - hx); fy = hy + (1.0 - vr) * (fy - hy); }
  float vv = clamp((v - vr) / (1.0 - vr), 0.0, 1.0), set = st.x, vs = vv * set;
  float x = hx + (fxx - hx) * vs, y = hy + (fy - hy) * vs, z = 0.0;
  float d = length(vec2(fxx - hx, fy - hy)) * su * set;
  float bel = st.z * (1.0 - st.w) * C.y * d * sin(0.75 * PI * vv);
  z += bel + st.w * 0.02 * d * vv * (1.0 + sin(PI * 7.0 * u)) + fx.x * 0.03 * d * sin(PI * vv) * (0.5 + 0.5 * sin(time * 38.0 + u * 11.0 - vv * 7.0));
  y += 0.6 * bel * vv * vv - st.w * 0.07 * d * vv;
  float g = vr > 0.0 ? clamp((vr - v) / 0.04, 0.0, 1.0) : 0.0;
  y += 0.035 * g;
  z += 0.045 * g;
  float f = smoothstep(0.0, 0.25, set);
  return mix(vec3(hx * 0.97, hy + 0.04 + 0.02 * sin(PI * v), 0.05 + 0.025 * cos(PI * v)), vec3(x, y, z), f);
}
`;

export function trim(rig: Rig, state: RigState, windFrom: number): RigState {
  const side = windFrom >= 0 ? 1 : -1, a = Math.min(Math.abs(windFrom), Math.PI);
  rig.masts.forEach((m, i) => {
    const want = m.spec.kind === 'square' ? (Math.PI - a) / 2 : a / 2;
    state.brace[i] = side * Math.min(Math.max(want, m.braceMin), m.braceMax);
  });
  return state;
}

export class Rig {
  readonly hull: HullForm;
  readonly masts: MastLayout[] = [];
  readonly yards: YardLayout[] = [];
  readonly sails: SailLayout[] = [];
  readonly ropes: RopeLayout[] = [];
  readonly sprit: { heel: THREE.Vector3; dir: THREE.Vector3; r: number; len: number } | null = null;
  readonly deadeyes: { at: THREE.Vector3; up: THREE.Vector3; foot: THREE.Vector3; normal: THREE.Vector3 }[] = [];
  readonly channels: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
  private readonly stays: [THREE.Vector3, THREE.Vector3][][] = [];

  constructor(name: FormName) {
    const f = (this.hull = new HullForm(name)), s = f.s;
    if (s.sprit) {
      const yh = f.railFwd + 0.04, heel = V(0, yh, f.zFwd(yh) - 0.35);
      this.sprit = { heel, dir: V(0, Math.sin(s.sprit.angle), Math.cos(s.sprit.angle)), r: 0.045 + 0.012 * s.sprit.len, len: s.sprit.len };
    }
    s.masts.forEach((spec) => this.masts.push(this.layMast(spec)));
    this.masts.forEach((m, i) => (m.spec.kind === 'square' ? this.raiseSquare(i) : this.raiseLateen(i)));
    if (this.sprit && s.sprit) this.raiseSprit(s.sprit.yard);
    const courses = this.sails.filter((sl) => sl.kind === 'square' && sl.reefs === 1 && !sl.lowers);
    const area = (sl: SailLayout) => Math.abs((sl.h1[0] - sl.h0[0]) * (sl.f1[1] - sl.h0[1]));
    (courses.length ? courses : this.sails).reduce((a, b) => (area(b) > area(a) ? b : a)).emblem = true;
  }

  private axisPoint(m: MastLayout, h: number, zOff = 0, o = V()): THREE.Vector3 {
    return o.copy(m.foot).addScaledVector(m.axis, (h - m.foot.y) / m.axis.y).addScaledVector(m.fwd, zOff);
  }
  private radius(m: MastLayout, h: number): { r: number; zOff: number } {
    for (const sec of m.sections) if (h <= sec.to + 1e-6) return { r: sec.r0 + ((sec.r1 - sec.r0) * (h - sec.from)) / (sec.to - sec.from), zOff: sec.zOff };
    const sec = m.sections[m.sections.length - 1];
    return { r: sec.r1, zOff: sec.zOff };
  }

  private layMast(spec: MastSpec): MastLayout {
    const f = this.hull, yd = f.deck(spec.u), foot = V(0, yd, f.z(spec.u, yd));
    const axis = V(0, Math.cos(spec.rake), -Math.sin(spec.rake)), fwd = V(0, Math.sin(spec.rake), Math.cos(spec.rake));
    const sections: MastSection[] = [{ from: yd - 0.2, to: spec.kind === 'square' ? spec.top + 0.32 : spec.top + 0.05, r0: spec.r, r1: spec.r * 0.72, zOff: 0 }];
    if (spec.kind === 'square') {
      let zOff = 0, prev = sections[0], r = spec.r * 0.62;
      spec.heads.forEach((head, k) => {
        zOff += prev.r1 + r + 0.006;
        prev = { from: (k ? spec.heads[k - 1] : spec.top) - 0.32, to: head + 0.06, r0: r, r1: r * 0.7, zOff };
        sections.push(prev);
        r *= 0.58;
      });
    }
    return { spec, foot, axis, fwd, sections, sail: 0, braceMin: 0, braceMax: 0, top: spec.kind === 'square' ? 0.1 + spec.r * 2.3 : 0 };
  }

  private raiseSquare(mi: number): void {
    const m = this.masts[mi], spec = m.spec as SquareMastSpec, f = this.hull;
    const hs = [spec.top - 0.3, ...spec.heads.map((h, k) => h - (k === spec.heads.length - 1 ? 0.4 : 0.24))];
    const yr = spec.yards.map((half) => 0.022 + half * 0.026);
    m.sail = Math.max(...hs.map((h, k) => { const q = this.radius(m, h); return q.zOff + q.r + yr[k] + 0.008; }));
    const footY = f.rail(spec.u) + 0.28;
    hs.forEach((h, k) => {
      const yi = this.yards.push({ mast: mi, kind: 'square', h, a: -spec.yards[k], b: spec.yards[k], r: yr[k] }) - 1;
      const head = spec.yards[k] * 0.96, below = k ? spec.yards[k - 1] * 0.94 : spec.yards[0] * 1.02;
      const depth = (h - (k ? hs[k - 1] : footY)) / m.axis.y;
      const clear = k ? m.top * (k === 1 ? 1 : 0.6) + 0.06 : 0, over = k === 1 ? 0.28 : 0.3, uEdge = 0.5 + clear / (2 * below);
      const lift = k ? (((k === 1 ? spec.top : spec.heads[0]) + over - hs[k - 1]) / m.axis.y) / Math.sin(Math.PI * Math.min(uEdge, 0.95)) : 0;
      this.sails.push({
        mast: mi, yard: yi, kind: 'square', h0: [-head, -yr[k]], h1: [head, -yr[k]], f0: [-below, -depth], f1: [below, -depth],
        roach: lift, belly: k ? 0.15 : 0.17, band: k === 1 ? 0.13 : 0.12, reefs: k === 1 ? 2 : k ? 0 : 1, lowers: k > 0,
        light: k === 2, cloths: Math.max(4, Math.round((2 * below) / 0.2)), emblem: false,
      });
    });
    const ych = f.sheer(spec.u) - 0.05, n = spec.shrouds;
    const z0 = m.foot.z - SHROUD_AFT, z1 = z0 - (n - 1) * SHROUD_STEP;
    const xch = Math.max(f.half(f.uAt(z0, ych), ych), f.half(f.uAt(z1, ych), ych)) + 0.1;
    for (const side of [1, -1]) {
      const hound = this.axisPoint(m, spec.top - 0.1).add(V(side * (spec.r * 0.75 + 0.01), 0, -spec.r * 0.4));
      const ups: THREE.Vector3[] = [];
      for (let j = 0; j < n; j++) {
        const z = z0 - j * SHROUD_STEP, lower = V(side * xch, ych + 0.03, z), upper = lower.clone().lerp(hound, 0.12 / lower.distanceTo(hound));
        this.deadeyes.push({ at: lower, up: upper, foot: V(side * (f.half(f.uAt(z, ych - 0.3), ych - 0.3) + 0.02), ych - 0.3, z), normal: V(side, 0, 0) });
        this.rope({ hull: lower }, { hull: upper }, 0.006, true, true);
        this.rope({ hull: upper }, { hull: hound }, 0.013, true, true);
        ups.push(upper);
      }
      this.channels.push({ a: V(side * (xch - 0.06), ych, z0 + 0.1), b: V(side * (xch - 0.06), ych, z1 - 0.1) });
      this.ratlines(ups, hound, 0.11);
      spec.heads.forEach((head, k) => {
        const q = this.radius(m, head - 0.12), th = this.axisPoint(m, head - 0.12, q.zOff).add(V(side * (q.r + 0.008), 0, -q.r * 0.4));
        const base = k ? this.axisPoint(m, spec.heads[0], this.radius(m, spec.heads[0]).zOff) : this.axisPoint(m, spec.top + 0.05);
        const rim = k ? m.top * 0.6 : m.top, legs: THREE.Vector3[] = [];
        for (let j = 0; j < (k ? 1 : n > 4 ? 3 : 2); j++) {
          const a = (k ? 1.75 : 1.85 + j * 0.32);
          legs.push(base.clone().add(V(side * rim * Math.sin(a), 0, rim * Math.cos(a))));
        }
        legs.forEach((p) => {
          this.rope({ hull: p }, { hull: th }, 0.009, true, true);
          if (!k) this.rope({ hull: p }, { hull: this.axisPoint(m, spec.top - 0.45).add(V(side * spec.r, 0, 0)) }, 0.007, true, true);
        });
        if (!k && legs.length > 1) this.ratlines(legs, th, 0.07);
      });
    }
    m.braceMax = Math.atan((m.sail + SHROUD_AFT - 0.06) / xch) * SQUARE_BRACE_MARGIN;
    const next = this.hull.s.masts.length > mi + 1 ? this.masts[mi + 1] : null, sp = this.sprit;
    const heads = [spec.top + 0.14, ...spec.heads.map((h, k) => h + (k < spec.heads.length - 1 ? 0.2 : 0.03))];
    const stays: [THREE.Vector3, THREE.Vector3][] = (this.stays[mi] = []);
    heads.forEach((h, k) => {
      const q = this.radius(m, h), from = this.axisPoint(m, h, q.zOff + q.r);
      let to: THREE.Vector3 | null = null;
      if (next) {
        const nh = k === 0 ? next.foot.y + 0.35 : next.spec.kind === 'square' ? [next.spec.top, ...next.spec.heads][k - 1] : -1;
        if (nh > 0) { const nq = this.radius(next, nh); to = this.axisPoint(next, nh, nq.zOff - nq.r - (k === 1 ? next.top * 0.8 : 0)); }
      } else if (sp) to = sp.heel.clone().addScaledVector(sp.dir, sp.len * (k ? 0.97 : 0.33));
      if (to) { this.rope({ hull: from }, { hull: to }, k ? 0.011 : 0.016, true, true); stays[k] = [from, to]; }
    });
    hs.forEach((_, k) => {
      const yi = this.yards.length - hs.length + k, cap = k ? spec.heads[k - 1] : spec.top + 0.3;
      const capP = this.axisPoint(m, cap, this.radius(m, cap).zOff);
      this.rope({ hull: capP }, { yard: yi, p: V(0, 0.03, 0) }, 0.009, false, false);
      for (const side of [1, -1]) {
        this.rope({ hull: capP }, { yard: yi, p: V(side * spec.yards[k] * 0.97, 0.01, -yr[k]) }, 0.006, false, false);
        this.rope({ yard: yi, p: V(side * spec.yards[k], 0, 0) }, { hull: this.braceLead(mi, k, side) }, 0.006, false, false);
      }
    });
    const ci = this.sails.length - hs.length;
    for (const [side, u] of [[1, 1], [-1, 0]] as const) {
      const zs = m.foot.z - 0.95, zt = m.foot.z + 0.7;
      const ys = f.rail(f.uAt(zs, f.railAft)), yt = f.rail(f.uAt(zt, f.railFwd));
      const xs = f.half(f.uAt(zs, ys), ys) + 0.02, xt = f.half(f.uAt(zt, yt), yt) + 0.02;
      this.rope({ sail: ci, u, v: 1 }, { hull: V(side * xs, ys, zs) }, 0.007, false, false);
      this.rope({ sail: ci, u, v: 1 }, { hull: V(side * xt, yt, zt) }, 0.007, false, false);
    }
  }

  private braceLead(mi: number, k: number, side: number): THREE.Vector3 {
    const stays = this.stays[mi - 1], aft = this.masts[mi - 1], f = this.hull;
    if (stays?.[k]) return stays[k][0].clone().lerp(stays[k][1], 0.3);
    if (aft?.spec.kind === 'lateen') {
      const h = Math.min(aft.spec.sling + 0.35 + 0.15 * k, aft.spec.top - 0.15);
      return this.axisPoint(aft, h, this.radius(aft, h).r + 0.01).add(V(side * 0.03, 0, 0));
    }
    const u = 0.06 + 0.04 * k, y = f.rail(u) + 0.05;
    return V(side * (f.half(u, y) + 0.02), y, f.z(u, y));
  }
  private raiseLateen(mi: number): void {
    const m = this.masts[mi], spec = m.spec as LateenMastSpec, f = this.hull;
    const r = 0.02 + spec.len * 0.009, q = this.radius(m, spec.sling);
    m.sail = q.r + r + 0.008;
    m.braceMin = LATEEN_BRACE[0];
    m.braceMax = LATEEN_BRACE[1];
    const a = -spec.fore * spec.len, b = (1 - spec.fore) * spec.len;
    const yi = this.yards.push({ mast: mi, kind: 'lateen', h: spec.sling, a, b, r }) - 1;
    const dz = spec.clew, dy = m.foot.y + spec.clewY - spec.sling, c = Math.cos(spec.tilt), s = Math.sin(spec.tilt);
    const cx = dz * c + dy * s, cy = -dz * s + dy * c;
    this.sails.push({
      mast: mi, yard: yi, kind: 'lateen', h0: [a * 0.98, -r], h1: [b * 0.98, -r], f0: [a * 0.98, -r], f1: [cx, cy],
      roach: 0, belly: 0.14, band: 0.16, reefs: 1, lowers: false, light: false, cloths: Math.max(5, Math.round(spec.len / 0.22)), emblem: false,
    });
    for (const side of [1, -1]) {
      const hound = this.axisPoint(m, spec.top - 0.08).add(V(side * (spec.r * 0.75 + 0.01), 0, -spec.r * 0.4)), ups: THREE.Vector3[] = [];
      for (let j = 0; j < spec.shrouds; j++) {
        const z = m.foot.z - 0.32 - j * 0.2, u = f.uAt(z, f.rail(spec.u)), y = f.rail(u) - 0.02;
        const lower = V(side * (f.half(u, y) + 0.03), y, z), upper = lower.clone().lerp(hound, 0.14 / lower.distanceTo(hound));
        this.rope({ hull: lower }, { hull: upper }, 0.006, true, true, { mast: mi, side });
        this.rope({ hull: upper }, { hull: hound }, 0.012, true, true, { mast: mi, side });
        ups.push(upper);
      }
      if (ups.length > 1) this.ratlines(ups, hound, 0.11, { mast: mi, side });
    }
    const head = this.axisPoint(m, spec.top - 0.02);
    this.rope({ hull: head }, { yard: yi, p: V(0, r, 0) }, 0.01, false, false);
    const zs = m.foot.z - spec.clew - 0.35, us = f.uAt(zs, f.railAft), ys = f.rail(us);
    for (const side of [1, -1]) this.rope({ sail: this.sails.length - 1, u: 1, v: 1 }, { hull: V(side * (f.half(us, ys) + 0.02), ys, zs) }, 0.007, false, false, { mast: mi, side: -side });
    const zt = m.foot.z + spec.fore * spec.len * Math.cos(spec.tilt) * 0.9, ut = f.uAt(zt, f.deck(spec.u));
    this.rope({ yard: yi, p: V(a, 0, 0) }, { hull: V(0, f.deck(ut) + 0.05, zt) }, 0.008, false, false);
  }

  private raiseSprit(half: number): void {
    const sp = this.sprit!, fore = this.masts.length - 1, r = 0.02 + half * 0.026;
    const h = sp.heel.y + sp.dir.y * sp.len * 0.8 - sp.r - r - 0.01;
    const yi = this.yards.push({ mast: fore, kind: 'sprit', h, a: -half, b: half, r }) - 1;
    const depth = h - (this.hull.railFwd + 0.05);
    this.sails.push({
      mast: fore, yard: yi, kind: 'square', h0: [-half * 0.95, -r], h1: [half * 0.95, -r], f0: [-half * 1.05, -depth], f1: [half * 1.05, -depth],
      roach: 0, belly: 0.15, band: 0, reefs: 0, lowers: false, light: true, cloths: Math.max(4, Math.round((2 * half) / 0.2)), emblem: false,
    });
    const f = this.hull, u = 0.93, y = f.rail(u);
    for (const side of [1, -1]) this.rope({ sail: this.sails.length - 1, u: side > 0 ? 1 : 0, v: 1 }, { hull: V(side * (f.half(u, y) + 0.02), y, f.z(u, y)) }, 0.006, false, false);
    this.rope({ hull: sp.heel.clone().addScaledVector(sp.dir, sp.len * 0.8) }, { yard: yi, p: V(0, r, 0) }, 0.008, false, false);
  }

  private rope(a: Anchor, b: Anchor, r: number, tar: boolean, standing: boolean, weather?: { mast: number; side: number }): void {
    this.ropes.push({ a, b, r, tar, standing, weather });
  }
  private ratlines(ups: THREE.Vector3[], hound: THREE.Vector3, minGap: number, weather?: { mast: number; side: number }): void {
    const sorted = [...ups].sort((p, q) => q.z - p.z);
    const len = sorted[0].distanceTo(hound);
    for (let d = 0.1; d < len; d += RATLINE_STEP) {
      const t = d / len, pts = sorted.map((p) => p.clone().lerp(hound, t));
      if (pts[0].distanceTo(pts[pts.length - 1]) < minGap * (pts.length - 1)) break;
      for (let j = 0; j + 1 < pts.length; j++) this.rope({ hull: pts[j] }, { hull: pts[j + 1] }, 0.0045, true, true, weather);
    }
  }

  ropeShown(rope: RopeLayout, st: RigState): boolean {
    return !rope.weather || rope.weather.side === (st.brace[rope.weather.mast] >= 0 ? -1 : 1);
  }

  yardMatrix(st: RigState, k: number, o: THREE.Matrix4): THREE.Matrix4 {
    const y = this.yards[k], m = this.masts[y.mast], b = st.brace[y.mast] ?? 0;
    if (y.kind === 'sprit') {
      const sp = this.sprit!, p = sp.heel.clone().addScaledVector(sp.dir, sp.len * 0.8);
      return o.makeRotationY(b * 0.8).setPosition(p.x, y.h, p.z);
    }
    const sign = b >= 0 ? 1 : -1, mag = Math.min(Math.max(Math.abs(b), m.braceMin), m.braceMax);
    let h = y.h;
    if (y.kind === 'square') {
      const sail = this.sails.find((s) => s.yard === k)!;
      if (sail.lowers) h -= Math.min(st.sails[this.sails.indexOf(sail)].reef, sail.reefs) * sail.band * (sail.h0[1] - sail.f0[1]) * m.axis.y;
    }
    this.axisPoint(m, h, 0, _ax);
    o.makeRotationX(-m.spec.rake).setPosition(_ax);
    if (y.kind === 'square') return o.multiply(_r.makeRotationY(sign * mag)).multiply(_m.makeTranslation(0, 0, m.sail));
    const t = (m.spec as LateenMastSpec).tilt, c = Math.cos(t), s = Math.sin(t);
    o.multiply(_r.makeRotationY(-sign * mag)).multiply(_m.makeTranslation(sign * m.sail, 0, 0));
    return o.multiply(_m.set(0, 0, sign, 0, s, c, 0, 0, -c, s, 0, 0, 0, 0, 0, 1));
  }

  sailPoint(st: RigState, i: number, u: number, v: number, time: number, o: THREE.Vector3, yard?: THREE.Matrix4): THREE.Vector3 {
    const s = this.sails[i];
    return sailLocal(s, st.sails[i], u, v, time, o).applyMatrix4(yard ?? this.yardMatrix(st, s.yard, _y));
  }

  anchor(a: Anchor, st: RigState, time: number, o: THREE.Vector3): THREE.Vector3 {
    if ('hull' in a) return o.copy(a.hull);
    if ('yard' in a) return o.copy(a.p).applyMatrix4(this.yardMatrix(st, a.yard, _y));
    return this.sailPoint(st, a.sail, a.u, a.v, time, o);
  }

  ropeEnds(st: RigState, time: number, out: Float32Array, standing: boolean | null = null): void {
    this.ropes.forEach((rp, i) => {
      if (standing !== null && rp.standing !== standing) return;
      this.anchor(rp.a, st, time, _v);
      if (this.ropeShown(rp, st)) this.anchor(rp.b, st, time, _w);
      else _w.copy(_v);
      _v.toArray(out, 6 * i);
      _w.toArray(out, 6 * i + 3);
    });
  }

  spars(st: RigState): Spar[] {
    const out: Spar[] = [];
    this.masts.forEach((m) => {
      for (const sec of m.sections) out.push({ a: this.axisPoint(m, sec.from, sec.zOff), b: this.axisPoint(m, sec.to, sec.zOff), r: sec.r0, owner: -1 });
      if (m.spec.kind !== 'square') return;
      const spec = m.spec;
      [[spec.top + 0.05, m.top], ...spec.heads.slice(0, -1).map((h) => [h, m.top * 0.6])].forEach(([h, rad]) => {
        const c = this.axisPoint(m, h);
        for (let k = 0; k < 8; k++) {
          const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
          out.push({ a: c.clone().add(V(rad * Math.sin(a0), 0, rad * Math.cos(a0))), b: c.clone().add(V(rad * Math.sin(a1), 0, rad * Math.cos(a1))), r: 0.03, owner: -1 });
        }
      });
    });
    this.yards.forEach((y, k) => {
      const mx = this.yardMatrix(st, k, new THREE.Matrix4());
      out.push({ a: V(y.a, 0, 0).applyMatrix4(mx), b: V(y.b, 0, 0).applyMatrix4(mx), r: y.r, owner: k });
    });
    if (this.sprit) out.push({ a: this.sprit.heel.clone(), b: this.sprit.heel.clone().addScaledVector(this.sprit.dir, this.sprit.len), r: this.sprit.r, owner: -1 });
    return out;
  }

  state(canvas: Canvas = 'plain', windFrom = 2.2, fill = 0.7): RigState {
    const st: RigState = {
      brace: this.masts.map(() => 0),
      sails: this.sails.map((s) => {
        const furl = canvas !== 'full' && s.light, reef = canvas === 'reefed' ? Math.min(s.reefs, s.kind === 'square' && s.lowers ? 2 : 1) : 0;
        return { set: furl ? 0 : 1, reef, fill, slack: 0, shiver: 0, torn: 0 };
      }),
    };
    return trim(this, st, windFrom);
  }
}
