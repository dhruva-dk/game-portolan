// The shipwright: builds a ship of any form in the captain's two pigments — hull, castles, planking, wales, gunports
// and guns, channels, deadeyes and chainplates, masts, tops, yards, sails, and every rope — as three draws: the
// wood (hull and spars, yards riding bones), the sails (shaped on the GPU from the rig state) and the rigging (inked
// ribbons). Ship.setRig is the one way the ships-alive package moves it. Ornament and emblems come in through
// ShipOptions.ornament and Ship.setEmblem.
import * as THREE from 'three';
import { box, grid, lathe, sweep, tube, type Sink } from '../craft.ts';
import { inkMaterial, linearVec, transmittanceVec, type Style } from '../../style/glsl.ts';
import type { RGB } from '../../style/palette.ts';
import { HullForm, type FormName } from './forms.ts';
import { Rig, SAIL_GLSL, type RigState } from './rig.ts';

/** Material zones of the wood mesh. HULL is planking below the paint line and the captain's primary above it. */
export const ZONE = { HULL: 0, PAINT: 1, TRIM: 2, TAR: 3, DECK: 4, SPAR: 5, IRON: 6, DARK: 7, GLASS: 8, GILT: 9 } as const;
const MAX_YARDS = 10, MAX_SAILS = 10;
const TH = 0.05; // bulwark thickness

/** Where carved ornament goes (part B of the shipwright fills them): centre, outward normal, up, size. */
export interface OrnamentPanel { kind: 'transom' | 'quarter' | 'taffrail' | 'beak'; centre: THREE.Vector3; normal: THREE.Vector3; up: THREE.Vector3; width: number; height: number }

/** Accumulates the wood mesh: position, normal, uv (hatch coordinates: across, along the grain), aInfo (zone, bone). */
export class ShipMesher implements Sink {
  zone: number = ZONE.HULL;
  bone = 0;
  xf: THREE.Matrix4 | null = null;
  uv: (p: THREE.Vector3, s: number, t: number) => readonly [number, number] = (p) => [p.y, p.z];
  private readonly pos: number[] = [];
  private readonly nrm: number[] = [];
  private readonly uvs: number[] = [];
  private readonly info: number[] = [];
  private readonly idx: number[] = [];
  private readonly nm = new THREE.Matrix3();
  private readonly p = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  get count(): number { return this.pos.length / 3; }
  get triangles(): number { return this.idx.length; }

  vert(p: THREE.Vector3, n: THREE.Vector3, s: number, t: number): number {
    const q = this.p.copy(p), m = this.n.copy(n);
    if (this.xf) { q.applyMatrix4(this.xf); m.applyMatrix3(this.nm.getNormalMatrix(this.xf)).normalize(); }
    this.pos.push(q.x, q.y, q.z);
    this.nrm.push(m.x, m.y, m.z);
    this.uvs.push(...this.uv(q, s, t));
    this.info.push(this.zone, this.bone);
    return this.count - 1;
  }
  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }
  /** Mirrors vertices from v0 and triangles from i0 onward to the starboard side. */
  mirror(v0: number, i0: number): void {
    const n = this.count, off = n - v0;
    for (let v = v0; v < n; v++) {
      this.pos.push(-this.pos[3 * v], this.pos[3 * v + 1], this.pos[3 * v + 2]);
      this.nrm.push(-this.nrm[3 * v], this.nrm[3 * v + 1], this.nrm[3 * v + 2]);
      this.uvs.push(this.uvs[2 * v], this.uvs[2 * v + 1]);
      this.info.push(this.info[2 * v], this.info[2 * v + 1]);
    }
    for (let i = i0, e = this.idx.length; i < e; i += 3) this.idx.push(this.idx[i] + off, this.idx[i + 2] + off, this.idx[i + 1] + off);
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(this.info, 2));
    g.setIndex(this.idx);
    return g;
  }
}

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const range = (n: number, a = 0, b = 1) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
/** A frame at p whose +y is `up` and +z faces `normal` (for boxes and lathes set on the hull). */
const frame = (p: THREE.Vector3, normal: THREE.Vector3, up = V(0, 1, 0)) => {
  const z = normal.clone().normalize(), x = new THREE.Vector3().crossVectors(up, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
};
const along = (p: THREE.Vector3, axis: THREE.Vector3) => new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), axis.clone().normalize())).setPosition(p);

/** Stations along the hull, denser where the castles break. */
function stations(f: HullForm, n: number): number[] {
  const us = new Set<number>(range(n));
  for (const d of f.s.decks) for (const b of [d.from, d.to]) if (b > 0 && b < 1) for (let k = -3; k <= 3; k++) us.add(Math.min(1, Math.max(0, b + k * 0.0075)));
  return [...us].sort((a, b) => a - b);
}
/** Exposed deck regions: contiguous runs of the same uppermost deck. */
function regions(f: HullForm): { a: number; b: number; rise: number }[] {
  const cuts = [...new Set([0, 1, ...f.s.decks.flatMap((d) => [d.from, d.to])])].sort((a, b) => a - b), out: { a: number; b: number; rise: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1], rise = f.level((a + b) / 2), last = out[out.length - 1];
    if (last && last.rise === rise) last.b = b;
    else out.push({ a, b, rise });
  }
  return out;
}

/** The hull: skin, transom, decks, bulwarks, castles, rails, wales, ports and guns, head, fittings. */
function buildHull(m: ShipMesher, rig: Rig, detail: number, panels: OrnamentPanel[]): void {
  const f = rig.hull, s = f.s, yk = f.yk, H = f.strakeH, us = stations(f, Math.round(28 + 44 * detail)), qs = range(Math.round(12 + 18 * detail));
  const plank = (p: THREE.Vector3) => [f.strake(f.uAt(p.z, p.y), p.y) * H, p.z] as const;
  const v0 = m.count, i0 = m.triangles;
  // outer skin (port half; everything to the mirror is built on the port side)
  m.zone = ZONE.HULL;
  m.uv = plank;
  grid(m, qs, us, (q, u, o) => f.at(u, yk + q * (f.rail(u) - yk), o));
  // transom: planked athwartships, bulging gently aft
  let yt = yk;
  while (f.half(0, yt) < 0.03 * s.beam) yt += 0.01;
  m.zone = ZONE.PAINT;
  m.uv = (p) => [p.y, p.x];
  grid(m, range(Math.round(6 + 6 * detail), yt, f.railAft), range(8), (y, sx, o) => {
    const x = sx * f.half(0, y);
    return o.set(x, y, f.zAft(y) - 0.035 * (1 - sx * sx));
  });
  // decks, inner bulwarks and the bulkheads where one deck steps up to the next
  const regs = regions(f);
  for (const r of regs) {
    const ru = [r.a, ...us.filter((u) => u > r.a && u < r.b), r.b];
    m.zone = ZONE.PAINT;
    m.uv = (p) => [p.y, p.z];
    grid(m, ru, range(2), (u, t, o) => { const y0 = f.deck(u, r.rise), y = y0 + t * (f.rail(u) - y0); return o.set(f.half(u, y) - TH, y, f.z(u, y)); });
    m.zone = ZONE.DECK;
    m.uv = (p) => [p.x, p.z];
    grid(m, ru, range(Math.round(2 + 4 * detail)), (u, sx, o) => { const y = f.deck(u, r.rise); return o.set(sx * (f.half(u, y) - TH), y + 0.02 * (1 - sx * sx), f.z(u, y)); });
  }
  for (let i = 0; i + 1 < regs.length; i++) {
    const a = regs[i], b = regs[i + 1], ub = a.b, lo = Math.min(a.rise, b.rise), hi = Math.max(a.rise, b.rise), aftHigh = a.rise > b.rise;
    const y0 = f.deck(ub, lo), y1 = f.deck(ub, hi);
    m.zone = ZONE.PAINT;
    m.uv = (p) => [p.y, p.x];
    const face = (sx: number, t: number, o: THREE.Vector3) => { const y = y0 + t * (y1 - y0); return o.set(sx * (f.half(ub, y) - TH), y, f.z(ub, y)); };
    if (aftHigh) grid(m, range(2), range(2), face);
    else grid(m, range(2), range(2), (t, sx, o) => face(sx, t, o));
    // a breastwork rail along the break and a dark doorway into the castle
    const fwd = aftHigh ? 1 : -1, yr = y1 + s.bulwark * 0.9, hw = f.half(ub, yr) - TH;
    m.zone = ZONE.TRIM;
    tube(m, [V(0, yr, f.z(ub, yr) + fwd * 0.012), V(hw, yr, f.z(ub, yr) + fwd * 0.012)], () => 0.018, 5);
    if (y1 - y0 > 0.22) {
      const dh = (y1 - y0) * 0.72, dx = Math.min(0.3, hw * 0.45);
      m.zone = ZONE.DARK;
      m.xf = new THREE.Matrix4().makeTranslation(dx, y0 + dh / 2, f.z(ub, y0) + fwd * 0.012);
      box(m, 0.13, dh, 0.012);
      m.xf = null;
    }
  }
  // rail caps along the sheer, castles included
  m.zone = ZONE.TRIM;
  m.uv = (p, sl) => [p.y * 3, sl];
  const railPath = us.map((u) => { const y = f.rail(u); return V(f.half(u, y) - TH / 2, y, f.z(u, y)); });
  const railSide = us.map((u) => f.normal(u, f.rail(u), V()).setY(0).normalize());
  sweep(m, railPath, railSide, [-0.04, -0.004, 0.04, -0.004, 0.04, 0.022, -0.04, 0.022], true);
  // wales: heavy tarred bands following the sheer, and the paint line's moulding in the trim pigment
  for (const [k, zone, h] of [...s.wales.map((k) => [k, ZONE.TAR, 0.42] as const), [s.paintFrom, ZONE.TRIM, 0.22] as const]) {
    m.zone = zone;
    const wu = us.filter((u) => u < 0.995 && f.half(u, f.strakeY(u, k)) > 0.02);
    const path = wu.map((u) => f.at(u, f.strakeY(u, k), V())), side = wu.map((u) => f.normal(u, f.strakeY(u, k), V()));
    const hh = h * H, t = zone === ZONE.TAR ? 0.03 : 0.016;
    sweep(m, path, side, [-0.01, -hh, t * 0.8, -hh, t, -hh * 0.4, t, hh * 0.4, t * 0.8, hh, -0.01, hh], false);
  }
  // fashion pieces down the transom corners
  m.zone = ZONE.TRIM;
  const fy = range(10, yt, f.railAft);
  sweep(m, fy.map((y) => V(f.half(0, y), y, f.zAft(y))), fy.map(() => V(1, 0, -0.6).normalize()), [-0.03, -0.03, 0.045, -0.03, 0.045, 0.04, -0.03, 0.04], true);
  // gunports: dark openings framed in trim, lids hinged up, and the guns run out
  for (const p of f.gunports()) {
    const u = f.uAt(p.z, p.y), n = f.normal(u, p.y, V()), ph = 1.25 * H;
    m.zone = ZONE.DARK;
    m.xf = frame(p.clone().addScaledVector(n, 0.004), n);
    box(m, 0.15, ph, 0.012);
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
    lathe(m, [[0, -0.06], [0.03, -0.06], [0.026, 0.05], [0.023, 0.13], [0.03, 0.14], [0.028, 0.165], [0.016, 0.165], [0.016, 0.1]], Math.round(6 + 4 * detail));
    m.xf = null;
  }
  // the stern: transom panel, taffrail and quarter panels for the carver
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

  // centreline timbers: keel, stem with its head, sternpost, rudder
  m.zone = ZONE.TAR;
  m.uv = (p, sl) => [p.x * 3, sl];
  const keel = [...range(16).map((u) => V(0, yk + 0.01, f.z(u, yk))), ...range(10, yk, f.railFwd + 0.16).slice(1).map((y) => V(0, y, f.zFwd(Math.min(y, f.railFwd)) + 0.015))];
  sweep(m, keel, keel.map(() => V(1, 0, 0)), [-0.03, -0.03, 0.03, -0.03, 0.03, 0.03, -0.03, 0.03], true);
  const post = range(8, yk, f.railAft * 0.85).map((y) => V(0, y, f.zAft(y) - 0.02));
  sweep(m, post, post.map(() => V(1, 0, 0)), [-0.035, -0.04, 0.035, -0.04, 0.035, 0.02, -0.035, 0.02], true);
  m.zone = ZONE.PAINT;
  const rud = range(6, yk + 0.02, f.s.tuck + 0.28).map((y) => V(0, y, f.zAft(y) - 0.07));
  sweep(m, rud, rud.map(() => V(1, 0, 0)), [-0.025, 0.04, 0.025, 0.04, 0.025, -0.08 - 0.05 * s.beam, -0.025, -0.08 - 0.05 * s.beam], true);
  // the beakhead: a grating platform out past the stem with head rails sweeping up to it
  if (s.beak > 0) {
    const yb = f.sheer(1) * 0.78, base = V(0, yb, f.zFwd(yb)), tip = base.clone().add(V(0, 0.12 * s.beak, s.beak));
    m.zone = ZONE.TRIM;
    tube(m, range(6).map((t) => base.clone().lerp(tip, t).add(V(0, -0.06 * Math.sin(Math.PI * t), 0))), (i) => 0.07 - 0.008 * i, 6, { caps: [null, 0.02] });
    m.zone = ZONE.PAINT;
    for (const side of [1, -1]) for (const dy of [0.14, 0.26]) {
      const a = f.at(0.9, yb + dy, V()), b = tip.clone().add(V(0, dy * 0.6, -0.05));
      a.x *= side;
      tube(m, range(6).map((t) => a.clone().lerp(b, t).add(V(side * 0.06 * Math.sin(Math.PI * t), 0, 0))), () => 0.016, 4);
    }
    panels.push({ kind: 'beak', centre: tip.clone(), normal: V(0, 0, 1), up: V(0, 1, 0), width: 0.16, height: 0.2 });
  }
  // channels, deadeyes, lanyards' blocks and chainplates
  m.uv = (p) => [p.y * 4, p.z];
  for (const c of rig.channels) {
    m.zone = ZONE.TRIM;
    m.xf = new THREE.Matrix4().makeTranslation((c.a.x + c.b.x) / 2, c.a.y, (c.a.z + c.b.z) / 2);
    box(m, 0.13, 0.03, c.a.distanceTo(c.b));
  }
  for (const d of rig.deadeyes) {
    m.zone = ZONE.TAR;
    for (const p of [d.at, d.up]) {
      m.xf = frame(p, d.normal);
      m.xf.multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
      lathe(m, [[0, -0.012], [0.03, -0.012], [0.034, 0], [0.03, 0.012], [0, 0.012]], 7);
    }
    m.zone = ZONE.IRON;
    m.xf = null;
    tube(m, [d.at.clone().add(V(0, -0.02, 0)), d.foot], () => 0.008, 3);
  }
  // stern lanterns on the taffrail
  for (let k = 0; k < s.lanterns; k++) {
    const x = s.lanterns === 1 ? 0 : (k - (s.lanterns - 1) / 2) * f.half(0, f.railAft) * 1.2, y = f.railAft + 0.04;
    m.xf = new THREE.Matrix4().makeTranslation(x, y, f.zAft(f.railAft) - 0.03);
    m.zone = ZONE.IRON;
    tube(m, [V(0, 0, 0), V(0, 0.16, 0)], () => 0.01, 4);
    m.zone = ZONE.GLASS;
    lathe(m, [[0, 0.16], [0.05, 0.17], [0.065, 0.24], [0.05, 0.31], [0, 0.31]], 6);
    m.zone = ZONE.GILT;
    lathe(m, [[0.05, 0.31], [0.03, 0.35], [0, 0.38]], 6);
  }
  // deck furniture: the capstan abaft the mainmast and a main hatch
  const um = s.gunSpan[0] - 0.05, yd = f.deck(um);
  m.zone = ZONE.SPAR;
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
  m.uv = (p) => [p.y, p.z];
}

/** Masts, tops, caps, crosstrees, the bowsprit and the yards (each riding its bone). */
function buildSpars(m: ShipMesher, rig: Rig, detail: number): void {
  const seg = Math.round(5 + 5 * detail);
  m.uv = (_p, sl, t) => [sl * 0.3, t];
  for (const mast of rig.masts) {
    m.zone = ZONE.SPAR;
    for (const sec of mast.sections) {
      const a = mast.foot.clone().addScaledVector(mast.axis, (sec.from - mast.foot.y) / mast.axis.y).addScaledVector(mast.fwd, sec.zOff);
      const b = mast.foot.clone().addScaledVector(mast.axis, (sec.to - mast.foot.y) / mast.axis.y).addScaledVector(mast.fwd, sec.zOff);
      tube(m, range(4).map((t) => a.clone().lerp(b, t)), (i) => sec.r0 + ((sec.r1 - sec.r0) * i) / 4, seg, { caps: [null, 0] });
    }
    if (mast.spec.kind !== 'square') continue;
    const spec = mast.spec, at = (h: number, z = 0) => mast.foot.clone().addScaledVector(mast.axis, (h - mast.foot.y) / mast.axis.y).addScaledVector(mast.fwd, z);
    m.zone = ZONE.TRIM;
    m.xf = along(at(spec.top), mast.axis);
    lathe(m, [[spec.r * 0.9, -0.05], [mast.top, 0.0], [mast.top, 0.08], [mast.top - 0.025, 0.08], [mast.top - 0.025, 0.03], [spec.r, 0.03]], Math.round(8 + 6 * detail));
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
    // thickest at the slings, tapering to the yardarms
    const xs = range(8, y.a, y.b);
    tube(m, xs.map((x) => V(x, 0, 0)), (i) => y.r * (1 - 0.55 * (xs[i] < 0 ? xs[i] / y.a : xs[i] / y.b) ** 2), seg, { caps: [0, 0] });
  });
  m.bone = 0;
}

// ---- materials ----------------------------------------------------------------------------------------------

const BONES_GLSL = /* glsl */ `
uniform mat4 uYard[${MAX_YARDS}];
mat4 boneMatrix(float bone) { return bone < 0.5 ? mat4(1.0) : uYard[int(bone + 0.5) - 1]; }
`;

const WOOD_VERT = /* glsl */ `
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

const WOOD_FRAG = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec3 vAnchorN;
in vec2 vUv;
in float vZone;
uniform vec3 uPrimary;   // linear
uniform vec3 uPrimaryT;  // transmittance
uniform vec3 uAccent;
uniform vec3 uAccentT;
uniform vec2 uDensity;   // primary, accent wash densities
uniform float uStrake;   // plank width (one strake)
uniform float uPaintFrom;
uniform float uLantern;
const vec3 OAK_T = ${glsl(transmittanceVec([0x87 / 255, 0x61 / 255, 0x3d / 255]))};
const vec3 DECK_T = ${glsl(transmittanceVec([0xc8 / 255, 0xa2 / 255, 0x6c / 255]))};
const vec3 TAR_T = ${glsl(transmittanceVec([0x2a / 255, 0x21 / 255, 0x1c / 255]))};
const vec3 SPAR_T = ${glsl(transmittanceVec([0xd0 / 255, 0x9b / 255, 0x45 / 255]))};
// an ink line of ~0.7 px along integer values of x (x in line spacings), fading out as the lines crowd together
float seam(float x, float fw) {
  float d = abs(fract(x + 0.5) - 0.5) / max(fw, 1e-4);
  return (1.0 - smoothstep(0.35, 1.0, d)) * (1.0 - smoothstep(0.25, 0.45, fw));
}
void main() {
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
    // plank seams along the strakes, butts staggered from strake to strake
    float row = floor(strake), butt = vUv.y / 1.35 + fract(row * 0.37);
    lines = max(seam(strake, fs), seam(butt, fwidth(butt)) * step(abs(fract(strake) - 0.5), 0.47));
  } else if (zone == 1) {
    col = teamBody(uPrimary, uPrimaryT, uDensity.x * (1.0 + 0.6 * pool) * granulation(q, uDensity.x));
    lines = seam(strake, fs) * 0.6;
  } else if (zone == 2) {
    col = teamBody(uAccent, uAccentT, uDensity.y * (1.0 + 0.6 * pool) * granulation(q, uDensity.y));
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
    // horn panes lit from within: a candle glaze that brightens in battle and gutters when the hull is low
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

const SAIL_VERT = /* glsl */ `
${BONES_GLSL}
${SAIL_GLSL}
uniform vec4 uSailA[${MAX_SAILS}];
uniform vec4 uSailB[${MAX_SAILS}];
uniform vec4 uSailC[${MAX_SAILS}];
uniform vec4 uSailD[${MAX_SAILS}]; // lowers, emblem, cloths, band
uniform vec4 uSailState[${MAX_SAILS}];
uniform vec2 uSailFx[${MAX_SAILS}];
uniform float uTime; // the style's render clock
in vec2 aSail; // sail, yard
out vec3 vWorld;
out vec3 vNormal;
out vec3 vAnchor;
out vec2 vUv;
flat out vec4 vInfo; // cloths, band, reefs taken in, torn
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
  vEmblem = D.y;
  vSail = aSail.x;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const SAIL_FRAG = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec3 vAnchor;
in vec2 vUv;
flat in vec4 vInfo;
flat in float vEmblem;
flat in float vSail;
uniform sampler2D tEmblem;
uniform float uEmblemOn;
uniform vec3 uAccent;
uniform vec3 uAccentT;
uniform float uAccentDensity;
const vec3 CANVAS_T = ${glsl(transmittanceVec([0xd0 / 255, 0x9b / 255, 0x45 / 255]))};
void main() {
  // tears: rents where the cloth is weakest, their ragged edges inked by the composite
  vec4 g = texture(tPaper, vUv * vec2(0.55, 0.42) + vSail * 0.37);
  if (vInfo.w > 0.0 && g.b + 0.25 * g.r < vInfo.w * 0.62 + 0.08) discard;
  float facing = gl_FrontFacing ? 1.0 : -1.0;
  vec3 n = normalize(vNormal) * facing, v = normalize(cameraPosition - vWorld);
  Paper q = paperAt(vAnchor, vec3(0.0, 0.0, 1.0), 0.25);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v)));
  // sunlight through the cloth from behind lifts the shade
  tone *= 1.0 - 0.3 * smoothstep(0.0, 0.6, -ndl);
  vec3 col = wash(parchment(q), CANVAS_T, 0.2 * (1.0 + washPool(n, v, q)) * granulation(q, 0.3));
  if (uEmblemOn > 0.5 && vEmblem > 0.5) {
    vec2 eu = (vUv - vec2(0.5, 0.5)) / vec2(0.62, 0.62) + 0.5;
    float a = all(greaterThan(eu, vec2(0.0))) && all(lessThan(eu, vec2(1.0))) ? texture(tEmblem, eu).a : 0.0;
    col = mix(col, teamBody(uAccent, uAccentT, uAccentDensity), a);
  }
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  // seams between the cloths, the reef bands and their points: short ties hanging in pairs on each cloth
  float x = vUv.x * vInfo.x, fx = fwidth(x), lines = (1.0 - smoothstep(0.3, 1.0, abs(fract(x + 0.5) - 0.5) / max(fx, 1e-4))) * (1.0 - smoothstep(0.2, 0.4, fx)) * 0.55;
  for (int k = 1; k <= 2; k++) {
    float vb = vInfo.y * float(k);
    if (vInfo.y <= 0.0 || vb <= vInfo.z + 1e-3) continue;
    float dv = (vUv.y - vb) / max(fwidth(vUv.y), 1e-5);
    lines = max(lines, (1.0 - smoothstep(0.3, 1.0, abs(dv))) * 0.6);
    float tie = abs(fract(x * 2.0 + 0.25) - 0.5) / max(fx * 2.0, 1e-4), drop = (vUv.y - vb) / max(fwidth(vUv.y), 1e-5);
    lines = max(lines, (1.0 - smoothstep(0.4, 1.0, tie)) * step(-2.0, drop) * step(drop, 7.0) * (1.0 - smoothstep(0.2, 0.4, fx)));
  }
  col = mix(col, hatchInk(0.5), lines);
  vec2 hc = vec2(vUv.x * 3.0, vUv.y * 3.0), hdx = dFdx(hc), hdy = dFdy(hc);
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone * 0.92, vSail * 5.3));
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.6 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, 11.0));
  }
  writeInk(col, n);
}
`;

const ROPE_VERT = /* glsl */ `
in vec3 aB;
in vec3 aCorner; // end (0 a, 1 b), side (-1, 1), tarred
in float aR;
uniform vec2 uViewport; // render target size, px
uniform float uRenderPx; // the style's render px per CSS px
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
  // a rope thinner than the pen is drawn at the pen's width, lighter in proportion, so it fades with distance
  vHalf = 0.5 * max(wpx, minPx);
  vAlpha = (aR > 0.0 && dot(position - aB, position - aB) > 1e-8) ? min(1.0, wpx / minPx) : 0.0;
  float ext = vHalf + 1.0;
  vAcross = aCorner.y * ext;
  c.xy += vec2(-d.y, d.x) * aCorner.y * ext * 2.0 / uViewport * c.w;
  gl_Position = c;
}
`;

const ROPE_FRAG = /* glsl */ `
in float vAcross;
in float vHalf;
in float vAlpha;
in float vTar;
void main() {
  float cover = clamp(vHalf + 0.5 - abs(vAcross), 0.0, 1.0) * vAlpha;
  if (cover <= 0.0) discard;
  // tarred standing rigging in iron-gall, the running rigging's hemp in a lighter sepia
  writeVeil(mix(wash(uPaper, SEPIA_T, 1.8), uInk, vTar), cover * mix(0.85, 1.0, vTar));
}
`;

function glsl(v: THREE.Vector3): string {
  return `vec3(${v.x.toFixed(5)}, ${v.y.toFixed(5)}, ${v.z.toFixed(5)})`;
}
/** Wash density for a team pigment: dark pigments laid thinner so they keep their hatching. */
function density(c: RGB): number {
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return Math.min(1.1, Math.max(0.6, 0.5 + 0.8 * l));
}

export interface ShipOptions {
  form: FormName;
  /** The captain's two pigments: the upper works in the first, rails, mouldings, lids and the emblem in the second. */
  pigments: readonly [RGB, RGB];
  /** Tessellation, 1 for the hero view; lower for distant ships. */
  detail?: number;
  /** Carves ornament into the wood mesh at the panels (the carver: part B of the shipwright). */
  ornament?: (mesher: ShipMesher, panels: readonly OrnamentPanel[]) => void;
}

/** A ship, built once per captain; setRig moves its yards, sails and running rigging. */
export class Ship extends THREE.Group {
  readonly rig: Rig;
  readonly panels: OrnamentPanel[] = [];
  readonly triangles: number;
  private readonly yardU: THREE.Matrix4[] = Array.from({ length: MAX_YARDS }, () => new THREE.Matrix4());
  private readonly sailState: THREE.Vector4[] = Array.from({ length: MAX_SAILS }, () => new THREE.Vector4());
  private readonly sailFx: THREE.Vector2[] = Array.from({ length: MAX_SAILS }, () => new THREE.Vector2());
  private readonly sailU: Record<string, THREE.IUniform>;
  private readonly ropeEnds: Float32Array;
  private readonly ropeA: THREE.BufferAttribute;
  private readonly ropeB: THREE.BufferAttribute;
  private readonly order: number[];
  private tack = '';

  constructor(style: Style, o: ShipOptions) {
    super();
    const rig = (this.rig = new Rig(o.form)), detail = o.detail ?? 1, f = rig.hull;
    const [primary, accent] = o.pigments, yards = { value: this.yardU };
    // wood: hull, fittings and spars in one mesh
    const wm = new ShipMesher();
    buildHull(wm, rig, detail, this.panels);
    o.ornament?.(wm, this.panels);
    buildSpars(wm, rig, detail);
    const wood = new THREE.Mesh(wm.build(), inkMaterial(style, {
      vertexShader: WOOD_VERT, fragmentShader: WOOD_FRAG, side: THREE.DoubleSide,
      uniforms: {
        uYard: yards, uPrimary: { value: linearVec(primary) }, uPrimaryT: { value: transmittanceVec(primary) },
        uAccent: { value: linearVec(accent) }, uAccentT: { value: transmittanceVec(accent) },
        uDensity: { value: new THREE.Vector2(density(primary), density(accent)) },
        uStrake: { value: f.strakeH }, uPaintFrom: { value: f.s.paintFrom }, uLantern: { value: 0.35 },
      },
    }));
    // sails: a grid per sail in cloth coordinates; the shape is made in the vertex shader
    const pos: number[] = [], uvs: number[] = [], info: number[] = [], idx: number[] = [];
    rig.sails.forEach((s, i) => {
      const nu = Math.max(6, Math.round(s.cloths * (1 + detail))), nv = Math.round(6 + 10 * detail), base = pos.length / 3;
      for (let j = 0; j <= nv; j++) for (let k = 0; k <= nu; k++) { pos.push(0, 0, 0); uvs.push(k / nu, j / nv); info.push(i, s.yard); }
      for (let j = 0; j < nv; j++) for (let k = 0; k < nu; k++) { const a = base + j * (nu + 1) + k, b = a + nu + 1; idx.push(a, a + 1, b + 1, a, b + 1, b); }
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    sg.setAttribute('aSail', new THREE.Float32BufferAttribute(info, 2));
    sg.setIndex(idx);
    const top = Math.max(...rig.masts.map((m) => m.sections[m.sections.length - 1].to));
    const sphere = new THREE.Sphere(V(0, top / 2, 0), Math.hypot(f.L / 2 + (f.s.sprit?.len ?? 0), top / 2) + 0.5);
    sg.boundingSphere = sphere;
    const pad = <T>(a: T[], n: number, z: () => T) => [...a, ...Array.from({ length: n - a.length }, z)];
    const v4 = (x: number, y: number, z: number, w: number) => new THREE.Vector4(x, y, z, w);
    this.sailU = {
      uYard: yards, uSailState: { value: this.sailState }, uSailFx: { value: this.sailFx },
      uSailA: { value: pad(rig.sails.map((s) => v4(s.h0[0], s.h0[1], s.h1[0], s.h1[1])), MAX_SAILS, () => v4(0, 0, 0, 0)) },
      uSailB: { value: pad(rig.sails.map((s) => v4(s.f0[0], s.f0[1], s.f1[0], s.f1[1])), MAX_SAILS, () => v4(0, 0, 0, 0)) },
      uSailC: { value: pad(rig.sails.map((s) => v4(s.roach, s.belly, s.band, s.reefs)), MAX_SAILS, () => v4(0, 0, 0, 0)) },
      uSailD: { value: pad(rig.sails.map((s) => v4(s.lowers ? 1 : 0, s.emblem ? 1 : 0, s.cloths, s.band)), MAX_SAILS, () => v4(0, 0, 0, 0)) },
      tEmblem: { value: null }, uEmblemOn: { value: 0 },
      uAccent: { value: linearVec(accent) }, uAccentT: { value: transmittanceVec(accent) }, uAccentDensity: { value: density(accent) },
    };
    const sails = new THREE.Mesh(sg, inkMaterial(style, { vertexShader: SAIL_VERT, fragmentShader: SAIL_FRAG, side: THREE.DoubleSide, uniforms: this.sailU }));
    // rigging: a ribbon per rope, standing rigging first so the running part updates as one range
    this.order = [...rig.ropes.keys()].sort((a, b) => Number(rig.ropes[b].standing) - Number(rig.ropes[a].standing));
    const n = rig.ropes.length, corner: number[] = [], radius: number[] = [], ri: number[] = [];
    this.order.forEach((r, j) => {
      for (const [e, sd] of [[0, -1], [0, 1], [1, 1], [1, -1]]) { corner.push(e, sd, rig.ropes[r].tar ? 1 : 0); radius.push(rig.ropes[r].r); }
      ri.push(4 * j, 4 * j + 1, 4 * j + 2, 4 * j, 4 * j + 2, 4 * j + 3);
    });
    const rg = new THREE.BufferGeometry();
    this.ropeA = new THREE.BufferAttribute(new Float32Array(12 * n), 3).setUsage(THREE.DynamicDrawUsage);
    this.ropeB = new THREE.BufferAttribute(new Float32Array(12 * n), 3).setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', this.ropeA);
    rg.setAttribute('aB', this.ropeB);
    rg.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 3));
    rg.setAttribute('aR', new THREE.Float32BufferAttribute(radius, 1));
    rg.setIndex(ri);
    rg.boundingSphere = sphere;
    this.ropeEnds = new Float32Array(6 * n);
    const viewport = { value: new THREE.Vector2(1, 1) };
    const ropes = new THREE.Mesh(rg, inkMaterial(style, { vertexShader: ROPE_VERT, fragmentShader: ROPE_FRAG, veil: true, side: THREE.DoubleSide, uniforms: { uViewport: viewport } }));
    ropes.onBeforeRender = (renderer) => {
      const t = renderer.getRenderTarget();
      if (t) viewport.value.set(t.width, t.height);
      else renderer.getDrawingBufferSize(viewport.value);
    };
    this.add(wood, sails, ropes);
    this.triangles = (wm.triangles + idx.length + ri.length) / 3;
    this.setRig(rig.state());
  }

  /** Brace the yards, set, reef, fill, shiver, slacken and tear the sails, and lead the running rigging to match. */
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

  /** The emblem on the mainsail: a texture whose alpha is the emblem's coverage, laid in the second pigment. */
  setEmblem(texture: THREE.Texture | null): void {
    this.sailU.tEmblem.value = texture;
    this.sailU.uEmblemOn.value = texture ? 1 : 0;
  }
}

