import * as THREE from 'three';
import { box, grid, lathe, sweep, tube } from '../craft.ts';
import { inkMaterial, linearVec, transmittanceVec, type Style } from '../../style/glsl.ts';
import type { RGB } from '../../style/palette.ts';
import type { FormName, HullForm } from './forms.ts';
import { Rig, SAIL_GLSL, type MastLayout, type RigState, type RopeLayout } from './rig.ts';
import { ShipMesher, V, ZONE, along, frame, range, type OrnamentPanel } from './mesher.ts';
import { carve, type CarveLevel } from './ornament.ts';
import { emblemRect, emblemTexture, type EmblemName } from './emblems.ts';

export { ShipMesher, ZONE, type OrnamentPanel } from './mesher.ts';

export const LODS = ['hero', 'mid', 'far'] as const;
export type Lod = (typeof LODS)[number];
export const LOD_BUDGET: Record<Lod, number> = { hero: 56_000, mid: 16_000, far: 4_000 };
export const FLEET_TRIANGLES = 150_000;
export const LOD_PX = { hero: 230, mid: 64 } as const;
const LOD_HYSTERESIS = 0.85, LOD_FADE = 0.4;

interface LodSpec { detail: number; spread: number; stride: number; guns: boolean; fittings: 0 | 1 | 2; carve: CarveLevel }
const SPEC: Record<Lod, LodSpec> = {
  hero: { detail: 1, spread: 3, stride: 1, guns: true, fittings: 2, carve: 2 },
  mid: { detail: 0.25, spread: 2, stride: 2, guns: true, fittings: 1, carve: 1 },
  far: { detail: 0, spread: 1, stride: 3, guns: false, fittings: 0, carve: 0 },
};
export type Carver = (mesher: ShipMesher, panels: readonly OrnamentPanel[], level: CarveLevel, form: FormName) => void;

const MAX_YARDS = 10, MAX_SAILS = 10, MAX_FLAGS = 6, FLAG_NU = 14, FLAG_NV = 2, FLAG_TRIS = 2 * FLAG_NU * FLAG_NV;
const TH = 0.05;
const TMP = new THREE.Vector3();

export interface FlagSpec { root: THREE.Vector3; length: number; width: number; taper: number; swallow: number; kind: 0 | 1 | 2 }
const mastHead = (m: MastLayout) => { const sec = m.sections[m.sections.length - 1]; return m.foot.clone().addScaledVector(m.axis, (sec.to - m.foot.y) / m.axis.y).addScaledVector(m.fwd, sec.zOff); };
const ensignRoot = (f: HullForm) => V(0, f.railAft + 0.62, f.zAft(f.railAft) - 0.16);
function flagSpecs(rig: Rig): FlagSpec[] {
  const L = rig.hull.L, tops = rig.masts.map(mastHead), main = tops.reduce((b, t, i) => (t.y > tops[b].y ? i : b), 0);
  return [
    ...tops.map((t, i): FlagSpec => ({ root: t.add(V(0, 0.12, 0)), length: (i === main ? 0.3 : 0.2) * L, width: 0.032 * L, taper: 0.12, swallow: 0.25, kind: i === main ? 2 : 0 })),
    { root: ensignRoot(rig.hull), length: 0.13 * L, width: 0.085 * L, taper: 1, swallow: 0, kind: 1 },
  ];
}
const ropeKind = (r: RopeLayout) => (!r.standing ? 2 : r.r <= 0.005 ? 1 : 0);

function stations(f: HullForm, n: number, spread: number): number[] {
  const us = new Set<number>(range(n));
  for (const d of f.s.decks) for (const b of [d.from, d.to]) if (b > 0 && b < 1) for (let k = -spread; k <= spread; k++) us.add(Math.min(1, Math.max(0, b + k * 0.0075)));
  return [...us].sort((a, b) => a - b);
}
function regions(f: HullForm): { a: number; b: number; rise: number }[] {
  const cuts = [...new Set([0, 1, ...f.s.decks.flatMap((d) => [d.from, d.to])])].sort((a, b) => a - b), out: { a: number; b: number; rise: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], rise = f.level((a + b) / 2), last = out[out.length - 1];
    if (last && last.rise === rise) last.b = b;
    else out.push({ a, b, rise });
  }
  return out;
}

function buildHull(m: ShipMesher, rig: Rig, L: LodSpec, panels: OrnamentPanel[]): void {
  const f = rig.hull, s = f.s, yk = f.yk, H = f.strakeH, d = L.detail, us = stations(f, Math.round(14 + 58 * d), L.spread), qs = range(Math.round(6 + 24 * d));
  const plank = (p: THREE.Vector3) => [f.strake(f.uAt(p.z, p.y), p.y) * H, p.z] as const;
  const v0 = m.count, i0 = m.triangles;
  m.zone = ZONE.HULL;
  m.uv = plank;
  grid(m, qs, us, (q, u, o) => f.at(u, yk + q * (f.rail(u) - yk), o));
  let yt = yk;
  while (f.half(0, yt) < 0.03 * s.beam) yt += 0.01;
  m.zone = ZONE.PAINT;
  m.uv = (p) => [p.y, p.x];
  grid(m, range(Math.round(3 + 9 * d), yt, f.railAft), range(Math.round(4 + 4 * d)), (y, sx, o) => {
    const x = sx * f.half(0, y);
    return o.set(x, y, f.zAft(y) - 0.035 * (1 - sx * sx));
  });
  const regs = regions(f);
  for (const r of regs) {
    const ru = [r.a, ...us.filter((u) => u > r.a && u < r.b), r.b];
    m.zone = ZONE.PAINT;
    m.uv = (p) => [p.y, p.z];
    grid(m, ru, range(d > 0 ? 2 : 1), (u, t, o) => { const y0 = f.deck(u, r.rise), y = y0 + t * (f.rail(u) - y0); return o.set(f.half(u, y) - TH, y, f.z(u, y)); });
    m.zone = ZONE.DECK;
    m.uv = (p) => [p.x, p.z];
    grid(m, ru, range(Math.round(2 + 4 * d)), (u, sx, o) => { const y = f.deck(u, r.rise); return o.set(sx * (f.half(u, y) - TH), y + 0.02 * (1 - sx * sx), f.z(u, y)); });
  }
  for (let i = 0; i + 1 < regs.length; i++) {
    const a = regs[i], b = regs[i + 1], ub = a.b, lo = Math.min(a.rise, b.rise), hi = Math.max(a.rise, b.rise), aftHigh = a.rise > b.rise;
    const y0 = f.deck(ub, lo), y1 = f.deck(ub, hi);
    m.zone = ZONE.PAINT;
    m.uv = (p) => [p.y, p.x];
    const face = (sx: number, t: number, o: THREE.Vector3) => { const y = y0 + t * (y1 - y0); return o.set(sx * (f.half(ub, y) - TH), y, f.z(ub, y)); };
    if (aftHigh) grid(m, range(2), range(2), face);
    else grid(m, range(2), range(2), (t, sx, o) => face(sx, t, o));
    const fwd = aftHigh ? 1 : -1, yr = y1 + s.bulwark * 0.9, hw = f.half(ub, yr) - TH;
    m.zone = ZONE.TRIM;
    tube(m, [V(0, yr, f.z(ub, yr) + fwd * 0.012), V(hw, yr, f.z(ub, yr) + fwd * 0.012)], () => 0.018, d > 0 ? 5 : 3);
    if (y1 - y0 > 0.22) {
      const dh = (y1 - y0) * 0.72, dx = Math.min(0.3, hw * 0.45);
      m.zone = ZONE.DARK;
      m.xf = new THREE.Matrix4().makeTranslation(dx, y0 + dh / 2, f.z(ub, y0) + fwd * 0.012);
      box(m, 0.13, dh, 0.012);
      m.xf = null;
    }
  }
  m.zone = ZONE.TRIM;
  m.uv = (p, sl) => [p.y * 3, sl];
  const railPath = us.map((u) => { const y = f.rail(u); return V(f.half(u, y) - TH / 2, y, f.z(u, y)); });
  const railSide = us.map((u) => f.normal(u, f.rail(u), V()).setY(0).normalize());
  sweep(m, railPath, railSide, [-0.04, -0.004, 0.04, -0.004, 0.04, 0.022, -0.04, 0.022], true);
  for (const [k, zone, h] of [...s.wales.map((k) => [k, ZONE.TAR, 0.42] as const), [s.paintFrom, ZONE.TRIM, 0.22] as const]) {
    m.zone = zone;
    const wu = us.filter((u, i) => (i % L.stride === 0 || i === us.length - 2) && u < 0.995 && f.half(u, f.strakeY(u, k)) > 0.02);
    const path = wu.map((u) => f.at(u, f.strakeY(u, k), V())), side = wu.map((u) => f.normal(u, f.strakeY(u, k), V()));
    const hh = h * H, t = zone === ZONE.TAR ? 0.03 : 0.016;
    sweep(m, path, side, d > 0 ? [-0.01, -hh, t * 0.8, -hh, t, -hh * 0.4, t, hh * 0.4, t * 0.8, hh, -0.01, hh] : [-0.01, -hh, t, -hh * 0.6, t, hh * 0.6, -0.01, hh], false);
  }
  m.zone = ZONE.TRIM;
  const fy = range(d > 0 ? 10 : 3, yt, f.railAft);
  sweep(m, fy.map((y) => V(f.half(0, y), y, f.zAft(y))), fy.map(() => V(1, 0, -0.6).normalize()), [-0.03, -0.03, 0.045, -0.03, 0.045, 0.04, -0.03, 0.04], true);
  for (const p of f.gunports()) {
    const u = f.uAt(p.z, p.y), n = f.normal(u, p.y, V()), ph = 1.25 * H;
    m.zone = ZONE.DARK;
    m.xf = frame(p.clone().addScaledVector(n, 0.004), n);
    box(m, 0.15, ph, 0.012);
    if (L.guns) {
      m.zone = ZONE.TRIM;
      for (const [dx, dy, w, hgt] of [[0, ph / 2 + 0.012, 0.19, 0.024], [0, -ph / 2 - 0.012, 0.19, 0.024], [0.087, 0, 0.022, ph], [-0.087, 0, 0.022, ph]]) {
        m.xf = frame(p, n).multiply(new THREE.Matrix4().makeTranslation(dx, dy, 0.012));
        box(m, w, hgt, 0.024);
      }
      m.zone = ZONE.PAINT;
      m.xf = frame(p, n).multiply(new THREE.Matrix4().makeTranslation(0, ph / 2 + 0.02, 0.02)).multiply(new THREE.Matrix4().makeRotationX(-1.1)).multiply(new THREE.Matrix4().makeTranslation(0, ph / 2, 0.008));
      box(m, 0.15, ph, 0.016);
      m.zone = ZONE.IRON;
      m.xf = frame(p, n).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      lathe(m, [[0, -0.06], [0.03, -0.06], [0.026, 0.05], [0.023, 0.13], [0.03, 0.14], [0.028, 0.165], [0.016, 0.165], [0.016, 0.1]], Math.round(6 + 4 * d));
    }
    m.xf = null;
  }
  if (L.fittings) for (let k = 0; k < (s.guns >= 3 ? 2 : 1); k++) {
    const u = 0.9 + 0.025 * k, y = f.strakeY(u, s.wales[s.wales.length - 1]) + 1.6 * H, p = f.at(u, y, V()), n = f.normal(u, y, V());
    m.xf = frame(p, n).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    m.zone = ZONE.TRIM;
    lathe(m, [[0.026, 0], [0.046, 0.004], [0.044, 0.014], [0.026, 0.018]], 8);
    m.zone = ZONE.DARK;
    lathe(m, [[0, 0.01], [0.027, 0.01]], 8);
    m.xf = null;
  }
  const ym = (yt + f.railAft) / 2 + 0.1 * (f.railAft - yt);
  panels.push({ kind: 'transom', centre: V(0, ym, f.zAft(ym) - 0.04), normal: V(0, 0, -1), up: V(0, 1, 0), width: f.half(0, ym) * 1.5, height: (f.railAft - yt) * 0.45 });
  panels.push({ kind: 'taffrail', centre: V(0, f.railAft - 0.06, f.zAft(f.railAft) - 0.04), normal: V(0, 0, -1), up: V(0, 1, 0), width: f.half(0, f.railAft) * 1.7, height: 0.12 });
  for (const side of [1, -1]) {
    const u = 0.06, y = (f.deck(u) + f.rail(u)) / 2, p = f.at(u, y, V()), n = f.normal(u, y, V());
    p.x *= side;
    n.x *= side;
    panels.push({ kind: 'quarter', centre: p, normal: n, up: V(0, 1, 0), width: 0.3 * f.L / 5, height: (f.rail(u) - f.deck(u)) * 0.7 });
  }
  m.mirror(v0, i0);

  m.zone = ZONE.TAR;
  m.uv = (p, sl) => [p.x * 3, sl];
  const keel = [...range(d > 0 ? 16 : 6).map((u) => V(0, yk + 0.01, f.z(u, yk))), ...range(d > 0 ? 10 : 4, yk, f.railFwd + 0.16).slice(1).map((y) => V(0, y, f.zFwd(Math.min(y, f.railFwd)) + 0.015))];
  sweep(m, keel, keel.map(() => V(1, 0, 0)), [-0.03, -0.03, 0.03, -0.03, 0.03, 0.03, -0.03, 0.03], true);
  const post = range(d > 0 ? 8 : 3, yk, f.railAft * 0.85).map((y) => V(0, y, f.zAft(y) - 0.02));
  sweep(m, post, post.map(() => V(1, 0, 0)), [-0.035, -0.04, 0.035, -0.04, 0.035, 0.02, -0.035, 0.02], true);
  m.zone = ZONE.PAINT;
  const rud = range(d > 0 ? 6 : 2, yk + 0.02, f.s.tuck + 0.28).map((y) => V(0, y, f.zAft(y) - 0.07));
  sweep(m, rud, rud.map(() => V(1, 0, 0)), [-0.025, 0.04, 0.025, 0.04, 0.025, -0.08 - 0.05 * s.beam, -0.025, -0.08 - 0.05 * s.beam], true);
  if (L.fittings) {
    m.zone = ZONE.IRON;
    for (let k = 0; k < 3; k++) {
      const y = yk + 0.1 + (k * (s.tuck + 0.2 - yk)) / 3;
      m.xf = new THREE.Matrix4().makeTranslation(0, y, f.zAft(y) - 0.045);
      box(m, 0.064, 0.022, 0.13);
    }
    m.xf = null;
  }
  if (s.beak > 0) {
    const yb = f.sheer(1) * 0.78, base = V(0, yb, f.zFwd(yb)), tip = base.clone().add(V(0, 0.12 * s.beak, s.beak));
    m.zone = ZONE.TRIM;
    tube(m, range(6).map((t) => base.clone().lerp(tip, t).add(V(0, -0.06 * Math.sin(Math.PI * t), 0))), (i) => 0.07 - 0.008 * i, d > 0 ? 6 : 4, { caps: [null, 0.02] });
    m.zone = ZONE.PAINT;
    if (d > 0) for (const side of [1, -1]) for (const dy of [0.14, 0.26]) {
      const a = f.at(0.9, yb + dy, V()), b = tip.clone().add(V(0, dy * 0.6, -0.05));
      a.x *= side;
      tube(m, range(6).map((t) => a.clone().lerp(b, t).add(V(side * 0.06 * Math.sin(Math.PI * t), 0, 0))), () => 0.016, 4);
    }
    panels.push({ kind: 'beak', centre: tip.clone(), normal: V(0, 0, 1), up: V(0, 1, 0), width: 0.16, height: 0.2 });
  } else panels.push({ kind: 'stem', centre: V(0, f.railFwd + 0.14, f.zFwd(f.railFwd) + 0.03), normal: V(0, 0, 1), up: V(0, 1, 0), width: 0.2, height: 0.25 });
  m.uv = (p) => [p.y * 4, p.z];
  for (const c of rig.channels) {
    m.zone = ZONE.TRIM;
    m.xf = new THREE.Matrix4().makeTranslation((c.a.x + c.b.x) / 2, c.a.y, (c.a.z + c.b.z) / 2);
    box(m, 0.13, 0.03, c.a.distanceTo(c.b));
  }
  if (L.fittings) for (const de of rig.deadeyes) {
    m.zone = ZONE.TAR;
    for (const p of [de.at, de.up]) {
      m.xf = frame(p, de.normal);
      if (L.fittings === 2) lathe(m, [[0, -0.012], [0.03, -0.012], [0.034, 0], [0.03, 0.012], [0, 0.012]], 7, 0, 2 * Math.PI);
      else box(m, 0.06, 0.06, 0.024);
    }
    m.zone = ZONE.IRON;
    m.xf = null;
    tube(m, [de.at.clone().add(V(0, -0.02, 0)), de.foot], () => 0.008, 3);
  }
  if (L.fittings) for (let k = 0; k < s.lanterns; k++) {
    const x = s.lanterns === 1 ? 0 : (k - (s.lanterns - 1) / 2) * f.half(0, f.railAft) * 1.2, y = f.railAft + 0.04;
    m.xf = new THREE.Matrix4().makeTranslation(x, y, f.zAft(f.railAft) - 0.03);
    m.zone = ZONE.IRON;
    tube(m, [V(0, 0, 0), V(0, 0.16, 0)], () => 0.01, 4);
    m.zone = ZONE.GLASS;
    lathe(m, [[0, 0.16], [0.05, 0.17], [0.065, 0.24], [0.05, 0.31], [0, 0.31]], 6);
    m.zone = ZONE.GILT;
    lathe(m, [[0.05, 0.31], [0.03, 0.35], [0, 0.38]], 6);
  }
  m.xf = null;
  m.zone = ZONE.SPAR;
  tube(m, [V(0, f.railAft - 0.02, f.zAft(f.railAft) - 0.04), ensignRoot(f).add(V(0, 0.03, 0))], () => 0.013, d > 0 ? 5 : 3, { caps: [null, 0] });
  if (L.fittings === 2) {
    const um = s.gunSpan[0] - 0.05, yd = f.deck(um);
    m.xf = new THREE.Matrix4().makeTranslation(0, yd, f.z(um, yd));
    lathe(m, [[0, 0], [0.09, 0], [0.07, 0.04], [0.06, 0.14], [0.08, 0.15], [0.08, 0.19], [0, 0.2]], 8);
    const uh = (s.gunSpan[0] + s.gunSpan[1]) / 2 + 0.03, yh = f.deck(uh);
    m.zone = ZONE.TRIM;
    m.xf = new THREE.Matrix4().makeTranslation(0, yh + 0.035, f.z(uh, yh));
    box(m, s.beam * 0.36, 0.07, 0.36);
    m.zone = ZONE.DARK;
    m.xf = new THREE.Matrix4().makeTranslation(0, yh + 0.072, f.z(uh, yh));
    box(m, s.beam * 0.3, 0.004, 0.3);
    m.xf = null;
  }
  m.uv = (p) => [p.y, p.z];
}

function buildSpars(m: ShipMesher, rig: Rig, L: LodSpec): void {
  const d = L.detail, seg = Math.round(4 + 6 * d);
  m.uv = (_p, sl, t) => [sl * 0.3, t];
  for (const mast of rig.masts) {
    m.zone = ZONE.SPAR;
    for (const sec of mast.sections) {
      const a = mast.foot.clone().addScaledVector(mast.axis, (sec.from - mast.foot.y) / mast.axis.y).addScaledVector(mast.fwd, sec.zOff);
      const b = mast.foot.clone().addScaledVector(mast.axis, (sec.to - mast.foot.y) / mast.axis.y).addScaledVector(mast.fwd, sec.zOff);
      const k = d > 0 ? 4 : 1;
      tube(m, range(k).map((t) => a.clone().lerp(b, t)), (i) => sec.r0 + ((sec.r1 - sec.r0) * i) / k, seg, { caps: [null, 0] });
    }
    const head = mastHead(mast);
    tube(m, [head, head.clone().add(V(0, 0.15, 0))], () => 0.012, 4, { caps: [null, 0] });
    if (L.fittings) {
      m.zone = ZONE.GILT;
      m.xf = new THREE.Matrix4().makeTranslation(head.x, head.y + 0.15, head.z);
      lathe(m, [[0, -0.02], [0.022, -0.012], [0.024, 0.006], [0.014, 0.022], [0, 0.026]], 6);
      m.xf = null;
    }
    if (mast.spec.kind !== 'square') continue;
    const spec = mast.spec, at = (h: number, z = 0) => mast.foot.clone().addScaledVector(mast.axis, (h - mast.foot.y) / mast.axis.y).addScaledVector(mast.fwd, z);
    m.zone = ZONE.TRIM;
    m.xf = along(at(spec.top), mast.axis);
    lathe(m, [[spec.r * 0.9, -0.05], [mast.top, 0.0], [mast.top, 0.08], [mast.top - 0.025, 0.08], [mast.top - 0.025, 0.03], [spec.r, 0.03]], Math.round(6 + 8 * d));
    spec.heads.forEach((h, k) => {
      const below = mast.sections[k], zc = (below.zOff + mast.sections[k + 1].zOff) / 2;
      m.zone = ZONE.TAR;
      m.xf = along(at(below.to - 0.02, zc), mast.axis);
      box(m, 0.08 + below.r1 * 2, 0.05, below.r1 * 2 + mast.sections[k + 1].r0 * 2 + 0.05);
      if (k < spec.heads.length - 1) {
        m.zone = ZONE.SPAR;
        m.xf = along(at(h, mast.sections[k + 1].zOff), mast.axis);
        box(m, mast.top * 1.2, 0.025, 0.05);
      }
    });
    m.xf = null;
  }
  if (rig.sprit) {
    const sp = rig.sprit;
    m.zone = ZONE.SPAR;
    tube(m, range(4).map((t) => sp.heel.clone().addScaledVector(sp.dir, sp.len * t)), (i) => sp.r * (1 - 0.12 * i), seg, { caps: [null, 0] });
  }
  rig.yards.forEach((y, k) => {
    m.bone = k + 1;
    m.zone = ZONE.SPAR;
    const xs = range(d > 0 ? 8 : 2, y.a, y.b);
    tube(m, xs.map((x) => V(x, 0, 0)), (i) => y.r * (1 - 0.55 * (xs[i] < 0 ? xs[i] / y.a : xs[i] / y.b) ** 2), seg, { caps: [0, 0] });
  });
  m.bone = 0;
}

function sailGeometry(rig: Rig, d: number): { g: THREE.BufferGeometry; n: number } {
  const pos: number[] = [], uvs: number[] = [], info: number[] = [], idx: number[] = [];
  rig.sails.forEach((s, i) => {
    const nu = Math.max(4, Math.round(s.cloths * (0.5 + 1.5 * d))), nv = Math.round(4 + 12 * d), base = pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let k = 0; k <= nu; k++) { pos.push(0, 0, 0); uvs.push(k / nu, j / nv); info.push(i, s.yard); }
    for (let j = 0; j < nv; j++) for (let k = 0; k < nu; k++) { const a = base + j * (nu + 1) + k, b = a + nu + 1; idx.push(a, a + 1, b + 1, a, b + 1, b); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('aSail', new THREE.Float32BufferAttribute(info, 2));
  g.setIndex(idx);
  return { g, n: idx.length };
}

export interface Level { wood: THREE.BufferGeometry; sails: THREE.BufferGeometry; panels: OrnamentPanel[]; triangles: number }
export function buildLevel(rig: Rig, lod: Lod, carver: Carver = carve): Level {
  const L = SPEC[lod], m = new ShipMesher(), panels: OrnamentPanel[] = [];
  buildHull(m, rig, L, panels);
  carver(m, panels, L.carve, rig.hull.name);
  buildSpars(m, rig, L);
  const sails = sailGeometry(rig, L.detail), ropes = lod === 'far' ? rig.ropes.filter((r) => ropeKind(r) === 0).length : rig.ropes.length;
  return { wood: m.build(), sails: sails.g, panels, triangles: (m.triangles + sails.n) / 3 + 2 * ropes + FLAG_TRIS * flagSpecs(rig).length };
}

const BONES_GLSL =  `
uniform mat4 uYard[${MAX_YARDS}];
mat4 boneMatrix(float bone) { return bone < 0.5 ? mat4(1.0) : uYard[int(bone + 0.5) - 1]; }
`;

const DISSOLVE_GLSL =  `
uniform vec2 uDissolve;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
void dissolve() {
  ivec2 c = ivec2(gl_FragCoord.xy) & 3;
  float b = (BAYER[c.y * 4 + c.x] + 0.5) / 16.0;
  if (b < uDissolve.x || b >= uDissolve.y) discard;
}
`;

const WOOD_VERT =  `
${BONES_GLSL}
in vec2 aInfo;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAnchor;
out vec3 vAnchorN;
out vec2 vUv;
out float vZone;
void main() {
  mat4 b = modelMatrix * boneMatrix(aInfo.y);
  vec4 w = b * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(b) * normal);
  vAnchor = position;
  vAnchorN = normal;
  vUv = uv;
  vZone = aInfo.x;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WOOD_FRAG =  `
${DISSOLVE_GLSL}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec3 vAnchorN;
in vec2 vUv;
in float vZone;
uniform vec3 uPrimary;
uniform vec3 uPrimaryT;
uniform vec3 uAccent;
uniform vec3 uAccentT;
uniform vec2 uDensity;
uniform float uStrake;
uniform float uPaintFrom;
uniform float uLantern;
const vec3 OAK_T = ${glsl(transmittanceVec([0x87 / 255, 0x61 / 255, 0x3d / 255]))};
const vec3 DECK_T = ${glsl(transmittanceVec([0xc8 / 255, 0xa2 / 255, 0x6c / 255]))};
const vec3 TAR_T = ${glsl(transmittanceVec([0x2a / 255, 0x21 / 255, 0x1c / 255]))};
const vec3 SPAR_T = ${glsl(transmittanceVec([0xd0 / 255, 0x9b / 255, 0x45 / 255]))};
float seam(float x, float fw) {
  float d = abs(fract(x + 0.5) - 0.5) / max(fw, 1e-4);
  return (1.0 - smoothstep(0.35, 1.0, d)) * (1.0 - smoothstep(0.25, 0.45, fw));
}
float treenail(float strake, float along, float fs) {
  vec2 d = vec2((fract(strake) - 0.5) * uStrake, (fract(along / 0.42 + 0.5) - 0.5) * 0.42);
  float r = length(d), fw = fwidth(r);
  return (1.0 - smoothstep(0.011 - fw, 0.011 + fw, r)) * (1.0 - smoothstep(0.08, 0.25, fs));
}
vec3 teamGlaze(vec3 paper, vec3 lin, vec3 t, float d, float pool, Paper q, float keep) {
  return mix(glaze(paper, t, d, pool, q), lin, keep);
}
void main() {
  dissolve();
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 n = normalize(vNormal) * facing, an = normalize(vAnchorN) * facing;
  vec3 v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vAnchor, an, 0.3);
  vec2 hc = vUv, hdx = dFdx(hc), hdy = dFdy(hc);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v))), pool = washPool(n, v, q);
  int zone = int(vZone + 0.5);
  float strake = vUv.x / uStrake, fs = fwidth(strake), lines = 0.0;
  if (zone == 0 && strake >= uPaintFrom) zone = 1;
  vec3 paper = parchment(q), col;
  if (zone == 0) {
    col = wash(paper, OAK_T, 0.8 * (1.0 + pool) * granulation(q, 0.8));
    float row = floor(strake), butt = vUv.y / 1.35 + fract(row * 0.37);
    lines = max(seam(strake, fs), seam(butt, fwidth(butt)) * step(abs(fract(strake) - 0.5), 0.47));
    lines = max(lines, treenail(strake, vUv.y, fs) * 0.9);
  } else if (zone == 1) {
    col = teamGlaze(paper, uPrimary, uPrimaryT, uDensity.x * granulation(q, uDensity.x), pool, q, 0.3);
    lines = max(seam(strake, fs) * 0.6, treenail(strake, vUv.y, fs) * 0.45);
  } else if (zone == 2) {
    col = teamGlaze(paper, uAccent, uAccentT, uDensity.y * granulation(q, uDensity.y), pool, q, 0.4);
  } else if (zone == 3) {
    col = wash(paper, TAR_T, 0.75 * (1.0 + pool) * granulation(q, 0.9));
  } else if (zone == 4) {
    col = wash(paper, DECK_T, 0.55 * (1.0 + 0.5 * pool));
    lines = seam(vUv.x / uStrake, fwidth(vUv.x / uStrake)) * 0.7;
  } else if (zone == 5) {
    col = wash(paper, SPAR_T, 0.6 * (1.0 + pool) * granulation(q, 0.6));
  } else if (zone == 6) {
    col = wash(paper, TAR_T, 1.0 * (1.0 + 0.5 * pool));
  } else if (zone == 7) {
    col = wash(paper, TAR_T, 1.5);
    tone = max(tone, 0.85);
  } else if (zone == 8) {
    col = mix(wash(paper, SPAR_T, 0.35), vec3(1.0, 0.78, 0.38), uLantern * (0.4 + 0.6 * uNight));
    tone *= 1.0 - uLantern;
  } else {
    col = goldLeaf(n, v, vec3(0.0, 1.0, 0.0), vAnchor, an);
    tone *= 0.6;
  }
  if (zone != 9 && zone != 8) col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  col = mix(col, hatchInk(0.55), lines * 0.75);
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone, vZone * 3.7));
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.65 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, 11.0));
  }
  writeInk(col, n);
}
`;

const SAIL_VERT =  `
${BONES_GLSL}
${SAIL_GLSL}
uniform vec4 uSailA[${MAX_SAILS}];
uniform vec4 uSailB[${MAX_SAILS}];
uniform vec4 uSailC[${MAX_SAILS}];
uniform vec4 uSailD[${MAX_SAILS}];
uniform vec4 uSailState[${MAX_SAILS}];
uniform vec2 uSailFx[${MAX_SAILS}];
uniform float uTime;
in vec2 aSail;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAnchor;
out vec2 vUv;
flat out vec4 vInfo;
flat out vec3 vDim;
flat out float vEmblem;
flat out float vSail;
void main() {
  int i = int(aSail.x + 0.5);
  vec4 A = uSailA[i], B = uSailB[i], C = uSailC[i], D = uSailD[i], st = uSailState[i];
  vec2 fx = uSailFx[i];
  float u = clamp(uv.x, 0.002, 0.998), v = uv.y, e = 0.01;
  vec3 p = sailLocal(A, B, C, D.x, st, fx, u, v, uTime);
  vec3 du = sailLocal(A, B, C, D.x, st, fx, min(u + e, 1.0), v, uTime) - sailLocal(A, B, C, D.x, st, fx, max(u - e, 0.0), v, uTime);
  vec3 dv = sailLocal(A, B, C, D.x, st, fx, u, min(v + e, 1.0), uTime) - sailLocal(A, B, C, D.x, st, fx, u, max(v - e, 0.0), uTime);
  mat4 b = modelMatrix * boneMatrix(aSail.y + 1.0);
  vec4 w = b * vec4(p, 1.0);
  vec3 nl = cross(du, dv);
  vNormal = normalize(mat3(b) * (dot(nl, nl) > 1e-12 ? nl : vec3(0.0, 0.0, 1.0)));
  vWorld = w.xyz;
  vAnchor = vec3(uv * vec2(abs(A.z - A.x) + 0.5, abs(A.y - B.y) + 0.5), aSail.x * 3.1);
  vUv = uv;
  vInfo = vec4(D.z, D.w, min(st.y, C.w), fx.y);
  vDim = vec3(abs(A.z - A.x), abs(B.z - B.x), 0.5 * (abs(A.y - B.y) + abs(A.w - B.w)));
  vEmblem = D.y;
  vSail = aSail.x;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SAIL_FRAG =  `
${DISSOLVE_GLSL}
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec2 vUv;
flat in vec4 vInfo;
flat in vec3 vDim;
flat in float vEmblem;
flat in float vSail;
uniform sampler2D tEmblem;
uniform float uEmblemOn;
uniform vec4 uEmblemCell;
uniform vec3 uPrimary;
uniform vec3 uPrimaryT;
uniform vec3 uAccent;
uniform vec3 uAccentT;
uniform vec2 uDensity;
const vec3 CANVAS_T = ${glsl(transmittanceVec([0xd0 / 255, 0x9b / 255, 0x45 / 255]))};
void main() {
  dissolve();
  vec4 g = texture(tPaper, vUv * vec2(0.55, 0.42) + vSail * 0.37);
  if (vInfo.w > 0.0 && g.b + 0.25 * g.r < vInfo.w * 0.62 + 0.08) discard;
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 n = normalize(vNormal) * facing, v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vAnchor, vec3(0.0, 0.0, 1.0), 0.25);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v)));
  tone *= 1.0 - 0.3 * smoothstep(0.0, 0.6, -ndl);
  vec3 col = glaze(parchment(q), CANVAS_T, 0.22 * granulation(q, 0.45), washPool(n, v, q), q);
  vec4 emb = vec4(0.0);
  if (uEmblemOn > 0.5 && vEmblem > 0.5) {
    float cy = vDim.y < 0.15 * vDim.x ? 0.36 : 0.5, w = mix(vDim.x, vDim.y, vUv.y), s = 0.66 * min(mix(vDim.x, vDim.y, cy), vDim.z);
    vec2 e = clamp(vec2((vUv.x - 0.5) * w, (cy - vUv.y) * vDim.z) / max(s, 1e-3) + 0.5, 0.0, 1.0);
    emb = texture(tEmblem, uEmblemCell.xy + e * uEmblemCell.zw);
    col = mix(col, mix(glaze(col, uPrimaryT, uDensity.x, 0.0, q), uPrimary, 0.35), emb.r);
    col = mix(col, mix(glaze(parchment(q), uAccentT, uDensity.y, 0.0, q), uAccent, 0.5), emb.g);
  }
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  float x = vUv.x * vInfo.x, fx = fwidth(x), lines = (1.0 - smoothstep(0.3, 1.0, abs(fract(x + 0.5) - 0.5) / max(fx, 1e-4))) * (1.0 - smoothstep(0.2, 0.4, fx)) * 0.55;
  for (int k = 1; k <= 2; k++) {
    float vb = vInfo.y * float(k);
    if (vInfo.y <= 0.0 || vb <= vInfo.z + 1e-3) continue;
    float dv = (vUv.y - vb) / max(fwidth(vUv.y), 1e-5);
    lines = max(lines, (1.0 - smoothstep(0.3, 1.0, abs(dv))) * 0.6);
    float tie = abs(fract(x * 2.0 + 0.25) - 0.5) / max(fx * 2.0, 1e-4), drop = (vUv.y - vb) / max(fwidth(vUv.y), 1e-5);
    lines = max(lines, (1.0 - smoothstep(0.4, 1.0, tie)) * step(-2.0, drop) * step(drop, 7.0) * (1.0 - smoothstep(0.2, 0.4, fx)));
  }
  float eu = min(vUv.x, 1.0 - vUv.x) / max(fwidth(vUv.x), 1e-5), ev = min(vUv.y, 1.0 - vUv.y) / max(fwidth(vUv.y), 1e-5);
  lines = max(lines, (1.0 - smoothstep(0.8, 2.0, min(eu, ev))) * 0.9);
  col = mix(col, hatchInk(0.5), lines);
  col = mix(col, hatchInk(0.85), emb.b * 0.9);
  vec2 hc = vec2(vUv.x * 3.0, vUv.y * 3.0), hdx = dFdx(hc), hdy = dFdy(hc);
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone * 0.92, vSail * 5.3));
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.6 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, 11.0));
  }
  writeInk(col, n);
}
`;

const ROPE_VERT =  `
in vec3 aB;
in vec3 aCorner;
in float aR;
in float aKind;
uniform vec2 uViewport;
uniform float uRenderPx;
uniform float uThin;
out float vAcross;
out float vHalf;
out float vAlpha;
out float vTar;
void main() {
  vTar = aCorner.z;
  vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec4 b = projectionMatrix * modelViewMatrix * vec4(aB, 1.0);
  vec4 c = aCorner.x > 0.5 ? b : a;
  vec2 d = b.xy / b.w * uViewport - a.xy / a.w * uViewport;
  d = dot(d, d) > 1e-6 ? normalize(d) : vec2(1.0, 0.0);
  float pxWorld = 2.0 * c.w / (projectionMatrix[1][1] * uViewport.y);
  float wpx = 2.0 * aR / pxWorld, minPx = 0.75 * uRenderPx;
  vHalf = 0.5 * max(wpx, minPx);
  vAlpha = (aR > 0.0 && dot(position - aB, position - aB) > 1e-8) ? min(1.0, wpx / minPx) * (aKind > 0.5 ? uThin : 1.0) : 0.0;
  float ext = vHalf + 1.0;
  vAcross = aCorner.y * ext;
  c.xy += vec2(-d.y, d.x) * aCorner.y * ext * 2.0 / uViewport * c.w;
  gl_Position = c;
}
`;

const ROPE_FRAG =  `
in float vAcross;
in float vHalf;
in float vAlpha;
in float vTar;
void main() {
  float cover = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0) * vAlpha;
  if (cover <= 0.0) discard;
  writeVeil(mix(wash(uPaper, SEPIA_T, 1.8), uInk, vTar), cover * mix(0.85, 1.0, vTar));
}
`;

const FLAG_VERT =  `
uniform vec4 uFlagRoot[${MAX_FLAGS}];
uniform vec4 uFlagShape[${MAX_FLAGS}];
uniform vec3 uWind;
uniform float uFlagTime;
in float aFlag;
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAnchor;
out vec2 vUv;
flat out vec4 vShape;
void main() {
  int i = int(aFlag + 0.5);
  vec4 R = uFlagRoot[i], S = uFlagShape[i];
  float u = uv.x, k = clamp(uWind.z, 0.0, 1.0), L = R.w * (0.75 + 0.25 * k), a = (0.05 + 0.07 * k) * L;
  float ph = 7.0 * u - uFlagTime * (3.0 + 7.0 * k) + float(i) * 1.9;
  float x = u * L * (1.0 - 0.5 * (1.0 - k)), y = (uv.y - 0.5) * S.x * mix(1.0, S.y, u) - (1.0 - k) * 0.55 * L * u * u, z = a * u * sin(ph);
  float dz = a * (sin(ph) + 7.0 * u * cos(ph)) / max(L, 1e-3);
  vec2 d = dot(uWind.xy, uWind.xy) > 1e-8 ? normalize(uWind.xy) : vec2(0.0, -1.0);
  vec3 p = R.xyz + vec3(x * d.x - z * d.y, y, x * d.y + z * d.x);
  vec3 nl = normalize(vec3(-dz * d.x - d.y, 0.0, -dz * d.y + d.x));
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNormal = normalize(mat3(modelMatrix) * nl);
  vAnchor = vec3(uv * vec2(L, S.x), float(i) * 2.3);
  vUv = uv;
  vShape = S;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const FLAG_FRAG =  `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec2 vUv;
flat in vec4 vShape;
uniform vec3 uPrimary;
uniform vec3 uPrimaryT;
uniform vec3 uAccent;
uniform vec3 uAccentT;
uniform vec2 uDensity;
uniform float uLeader;
void main() {
  float u = vUv.x, sw = vShape.z;
  if (sw > 0.0 && u > 1.0 - sw && abs(vUv.y - 0.5) < 0.5 * (u - 1.0 + sw) / sw) discard;
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 n = normalize(vNormal) * facing, v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vAnchor, vec3(0.0, 0.0, 1.0), 0.25);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v)));
  vec3 paper = parchment(q);
  vec3 prim = mix(glaze(paper, uPrimaryT, uDensity.x, 0.0, q), uPrimary, 0.4), acc = mix(glaze(paper, uAccentT, uDensity.y, 0.0, q), uAccent, 0.45);
  vec3 col = vShape.w > 0.5 && vShape.w < 1.5 ? (((u < 0.5) != (vUv.y < 0.5)) ? prim : acc) : (abs(vUv.y - 0.5) < 0.17 || u < 0.08 ? acc : prim);
  if (vShape.w > 1.5 && uLeader > 0.5) {
    col = goldLeaf(n, v, vec3(0.0, 1.0, 0.0), vAnchor, n);
    tone *= 0.6;
  } else col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  vec2 hc = vUv * vec2(6.0, 1.0);
  col = mix(col, hatchInk(tone), hatching(hc, dFdx(hc), dFdy(hc), tone * 0.9, 7.0));
  writeInk(col, n);
}
`;

function glsl(v: THREE.Vector3): string {
  return `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
}
function density(c: RGB): number {
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Math.min(1.1, Math.max(0.6, 0.5 + 0.8 * l));
}

export interface ShipOptions {
  form: FormName;
  pigments: readonly [RGB, RGB];
  lods?: readonly Lod[];
  detail?: number;
  ornament?: Carver;
}

interface LevelMeshes { wood: THREE.Mesh; sails: THREE.Mesh; triangles: number; dissolve: THREE.Vector2 }

export class Ship extends THREE.Group {
  readonly rig: Rig;
  readonly panels: OrnamentPanel[] = [];
  readonly flags: readonly FlagSpec[];
  readonly height: number;
  private readonly levels: (LevelMeshes | null)[];
  private cur = 0;
  private prev = -1;
  private fade = 1;
  private fadeTime = LOD_FADE;
  private readonly yardU: THREE.Matrix4[] = Array.from({ length: MAX_YARDS }, () => new THREE.Matrix4());
  private readonly sailState: THREE.Vector4[] = Array.from({ length: MAX_SAILS }, () => new THREE.Vector4());
  private readonly sailFx: THREE.Vector2[] = Array.from({ length: MAX_SAILS }, () => new THREE.Vector2());
  private readonly sailU: Record<string, THREE.IUniform>;
  private readonly flagU: Record<string, THREE.IUniform>;
  private readonly thin = { value: 1 };
  private readonly ropes: THREE.Mesh;
  private readonly heavy: number;
  private readonly ropeEnds: Float32Array;
  private readonly ropeA: THREE.BufferAttribute;
  private readonly ropeB: THREE.BufferAttribute;
  private readonly order: number[];
  private tack = '';

  constructor(style: Style, o: ShipOptions) {
    super();
    const rig = (this.rig = new Rig(o.form)), f = rig.hull;
    const want = o.lods ?? (o.detail === undefined ? LODS : [o.detail >= 0.6 ? 'hero' : o.detail >= 0.15 ? 'mid' : 'far'] as const);
    const [primary, accent] = o.pigments, yards = { value: this.yardU };
    const team = {
      uPrimary: { value: linearVec(primary) }, uPrimaryT: { value: transmittanceVec(primary) },
      uAccent: { value: linearVec(accent) }, uAccentT: { value: transmittanceVec(accent) },
      uDensity: { value: new THREE.Vector2(density(primary), density(accent)) },
    };
    const woodM = inkMaterial(style, {
      vertexShader: WOOD_VERT, fragmentShader: WOOD_FRAG, side: THREE.DoubleSide,
      uniforms: { ...team, uDissolve: { value: new THREE.Vector2(0, 2) }, uYard: yards, uStrake: { value: f.strakeH }, uPaintFrom: { value: f.s.paintFrom }, uLantern: { value: 0.35 } },
    });
    const pad = <T>(a: T[], n: number, z: () => T) => [...a, ...Array.from({ length: n - a.length }, z)];
    const v4 = (x: number, y: number, z: number, w: number) => new THREE.Vector4(x, y, z, w), zero = () => v4(0, 0, 0, 0);
    this.sailU = {
      ...team, uDissolve: { value: new THREE.Vector2(0, 2) },
      uYard: yards, uSailState: { value: this.sailState }, uSailFx: { value: this.sailFx },
      uSailA: { value: pad(rig.sails.map((s) => v4(s.h0[0], s.h0[1], s.h1[0], s.h1[1])), MAX_SAILS, zero) },
      uSailB: { value: pad(rig.sails.map((s) => v4(s.f0[0], s.f0[1], s.f1[0], s.f1[1])), MAX_SAILS, zero) },
      uSailC: { value: pad(rig.sails.map((s) => v4(s.roach, s.belly, s.band, s.reefs)), MAX_SAILS, zero) },
      uSailD: { value: pad(rig.sails.map((s) => v4(s.lowers ? 1 : 0, s.emblem ? 1 : 0, s.cloths, s.band)), MAX_SAILS, zero) },
      tEmblem: { value: null }, uEmblemOn: { value: 0 }, uEmblemCell: { value: new THREE.Vector4() },
    };
    const sailM = inkMaterial(style, { vertexShader: SAIL_VERT, fragmentShader: SAIL_FRAG, side: THREE.DoubleSide, inkWeight: 1.3, uniforms: this.sailU });
    this.flags = flagSpecs(rig);
    const top = Math.max(...this.flags.map((k) => k.root.y));
    this.height = top - f.yk;
    const sphere = new THREE.Sphere(V(0, top / 2, 0), Math.hypot(f.L / 2 + (f.s.sprit?.len ?? 0), top / 2) + 1);
    this.levels = LODS.map((lod) => {
      if (!want.includes(lod)) return null;
      const lv = buildLevel(rig, lod, o.ornament);
      if (!this.panels.length) this.panels.push(...lv.panels);
      lv.sails.boundingSphere = sphere;
      const meshes: LevelMeshes = { wood: new THREE.Mesh(lv.wood, woodM), sails: new THREE.Mesh(lv.sails, sailM), triangles: lv.triangles, dissolve: new THREE.Vector2(0, 2) };
      for (const mesh of [meshes.wood, meshes.sails]) {
        mesh.onBeforeRender = (_r, _s, _c, _g, mat) => {
          const sm = mat as THREE.ShaderMaterial;
          sm.uniforms.uDissolve.value.copy(meshes.dissolve);
          sm.uniformsNeedUpdate = true;
        };
        this.add(mesh);
      }
      return meshes;
    });
    this.cur = LODS.indexOf(want[0]);
    this.order = [...rig.ropes.keys()].sort((a, b) => ropeKind(rig.ropes[a]) - ropeKind(rig.ropes[b]));
    this.heavy = rig.ropes.filter((r) => ropeKind(r) === 0).length;
    const n = rig.ropes.length, corner: number[] = [], radius: number[] = [], kind: number[] = [], ri: number[] = [];
    this.order.forEach((r, j) => {
      for (const [e, sd] of [[0, -1], [0, 1], [1, 1], [1, -1]]) { corner.push(e, sd, rig.ropes[r].tar ? 1 : 0); radius.push(rig.ropes[r].r); kind.push(ropeKind(rig.ropes[r])); }
      ri.push(4 * j, 4 * j + 1, 4 * j + 2, 4 * j, 4 * j + 2, 4 * j + 3);
    });
    const rg = new THREE.BufferGeometry();
    this.ropeA = new THREE.BufferAttribute(new Float32Array(12 * n), 3).setUsage(THREE.DynamicDrawUsage);
    this.ropeB = new THREE.BufferAttribute(new Float32Array(12 * n), 3).setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', this.ropeA);
    rg.setAttribute('aB', this.ropeB);
    rg.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 3));
    rg.setAttribute('aR', new THREE.Float32BufferAttribute(radius, 1));
    rg.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    rg.setIndex(ri);
    rg.boundingSphere = sphere;
    this.ropeEnds = new Float32Array(6 * n);
    const viewport = { value: new THREE.Vector2(1, 1) };
    this.ropes = new THREE.Mesh(rg, inkMaterial(style, { vertexShader: ROPE_VERT, fragmentShader: ROPE_FRAG, veil: true, side: THREE.DoubleSide, uniforms: { uViewport: viewport, uThin: this.thin } }));
    this.ropes.onBeforeRender = (renderer) => {
      const t = renderer.getRenderTarget();
      if (t) viewport.value.set(t.width, t.height);
      else renderer.getDrawingBufferSize(viewport.value);
    };
    const fp: number[] = [], fuv: number[] = [], fi: number[] = [], fidx: number[] = [];
    this.flags.forEach((_, i) => {
      const base = fi.length;
      for (let j = 0; j <= FLAG_NV; j++) for (let k = 0; k <= FLAG_NU; k++) { fp.push(0, 0, 0); fuv.push(k / FLAG_NU, j / FLAG_NV); fi.push(i); }
      for (let j = 0; j < FLAG_NV; j++) for (let k = 0; k < FLAG_NU; k++) { const a = base + j * (FLAG_NU + 1) + k, b = a + FLAG_NU + 1; fidx.push(a, a + 1, b + 1, a, b + 1, b); }
    });
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(fuv, 2));
    fg.setAttribute('aFlag', new THREE.Float32BufferAttribute(fi, 1));
    fg.setIndex(fidx);
    fg.boundingSphere = sphere;
    this.flagU = {
      ...team, uLeader: { value: 0 }, uWind: { value: new THREE.Vector3(0, -1, 0.6) }, uFlagTime: { value: 0 },
      uFlagRoot: { value: pad(this.flags.map((k) => v4(k.root.x, k.root.y, k.root.z, k.length)), MAX_FLAGS, zero) },
      uFlagShape: { value: pad(this.flags.map((k) => v4(k.width, k.taper, k.swallow, k.kind)), MAX_FLAGS, zero) },
    };
    const flags = new THREE.Mesh(fg, inkMaterial(style, { vertexShader: FLAG_VERT, fragmentShader: FLAG_FRAG, side: THREE.DoubleSide, uniforms: this.flagU }));
    this.add(this.ropes, flags);
    this.applyLod();
    this.setRig(rig.state());
  }

  get lod(): Lod { return LODS[this.cur]; }
  get triangles(): number {
    const lv = this.levels, out = this.prev >= 0 && this.fade < 1 ? lv[this.prev]!.triangles : 0;
    return lv[this.cur]!.triangles + out;
  }
  get lodTriangles(): number[] { return this.levels.map((l) => l?.triangles ?? 0); }

  setLod(lod: Lod, fade = LOD_FADE): void {
    let i = LODS.indexOf(lod);
    while (!this.levels[i]) i += i < this.cur ? 1 : -1;
    if (i === this.cur) return;
    this.prev = fade > 0 ? this.cur : -1;
    this.cur = i;
    this.fade = fade > 0 ? 0 : 1;
    this.fadeTime = fade;
    this.applyLod();
  }
  advance(dt: number): void {
    if (this.fade >= 1) return;
    this.fade = Math.min(1, this.fade + dt / this.fadeTime);
    this.applyLod();
  }
  screenPx(camera: THREE.PerspectiveCamera, heightCss: number): number {
    const dist = Math.max(1e-3, this.getWorldPosition(TMP).distanceTo(camera.position));
    return ((this.height * this.scale.y * camera.zoom) / (2 * dist * Math.tan((camera.fov * Math.PI) / 360))) * heightCss;
  }
  private applyLod(): void {
    const fading = this.prev >= 0 && this.fade < 1;
    this.levels.forEach((l, i) => {
      if (!l) return;
      l.wood.visible = l.sails.visible = i === this.cur || (fading && i === this.prev);
      if (i === this.cur) l.dissolve.set(0, fading ? this.fade : 2);
      else l.dissolve.set(this.fade, 2);
    });
    const to = this.lod === 'far' ? 0 : 1, from = fading && LODS[this.prev] === 'far' ? 0 : 1;
    this.thin.value = fading ? from + (to - from) * this.fade : to;
    this.ropes.geometry.setDrawRange(0, to === 0 && !fading ? 6 * this.heavy : Infinity);
    if (!fading) this.prev = -1;
  }

  setRig(st: RigState, time = 0): void {
    const rig = this.rig;
    rig.yards.forEach((_, k) => rig.yardMatrix(st, k, this.yardU[k]));
    st.sails.forEach((s, i) => { this.sailState[i].set(s.set, s.reef, s.fill, s.slack); this.sailFx[i].set(s.shiver, s.torn); });
    const tack = rig.masts.map((_, i) => (st.brace[i] >= 0 ? '+' : '-')).join('');
    const all = tack !== this.tack, standingCount = rig.ropes.filter((r) => r.standing).length;
    this.tack = tack;
    rig.ropeEnds(st, time, this.ropeEnds, all ? null : false);
    const a = this.ropeA.array as Float32Array, b = this.ropeB.array as Float32Array, e = this.ropeEnds;
    for (let j = all ? 0 : standingCount; j < this.order.length; j++) {
      const r = 6 * this.order[j];
      for (let c = 0; c < 4; c++) for (let x = 0; x < 3; x++) { a[12 * j + 3 * c + x] = e[r + x]; b[12 * j + 3 * c + x] = e[r + 3 + x]; }
    }
    for (const attr of [this.ropeA, this.ropeB]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(all ? 0 : 12 * standingCount, 12 * (this.order.length - (all ? 0 : standingCount)));
      attr.needsUpdate = true;
    }
  }

  setEmblem(name: EmblemName | null): void {
    this.sailU.tEmblem.value = name ? emblemTexture() : null;
    this.sailU.uEmblemOn.value = name ? 1 : 0;
    if (name) (this.sailU.uEmblemCell.value as THREE.Vector4).copy(emblemRect(name));
  }
  setWind(toward: number, strength: number, time: number): void {
    (this.flagU.uWind.value as THREE.Vector3).set(Math.sin(toward), Math.cos(toward), strength);
    this.flagU.uFlagTime.value = time;
  }
  setLeader(on: boolean): void {
    this.flagU.uLeader.value = on ? 1 : 0;
  }
}

export function chooseLods(px: readonly number[], tris: readonly (readonly number[])[], current: readonly number[], budget = FLEET_TRIANGLES): number[] {
  const want: number[] = px.map((p, i) => { const h = (l: number) => (current[i] <= l ? LOD_HYSTERESIS : 1); return p >= LOD_PX.hero * h(0) ? 0 : p >= LOD_PX.mid * h(1) ? 1 : 2; });
  let total = want.reduce((s, l, i) => s + tris[i][l], 0);
  const bySize = [...px.keys()].sort((a, b) => px[a] - px[b]), largest = bySize.splice(-1);
  for (const group of [bySize, largest]) for (let l = 0; l < 2; l++) for (const i of group) if (total > budget && want[i] === l) { total += tris[i][l + 1] - tris[i][l]; want[i] = l + 1; }
  return want;
}
export function fleetLods(ships: readonly Ship[], camera: THREE.PerspectiveCamera, heightCss: number, dt: number): number {
  const lv = chooseLods(ships.map((s) => s.screenPx(camera, heightCss)), ships.map((s) => s.lodTriangles), ships.map((s) => LODS.indexOf(s.lod)));
  ships.forEach((s, i) => { s.setLod(LODS[lv[i]]); s.advance(dt); });
  return ships.reduce((t, s) => t + s.triangles, 0);
}
