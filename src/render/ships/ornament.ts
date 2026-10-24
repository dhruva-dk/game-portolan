// The carver: the stern ornament every ship carries (scrollwork, knots, waves and sunbursts) cut in relief into the
// shipwright's panels, painted in the captain's second pigment, inked by the composite like any other form, and picked
// out in gold leaf, the only thing on a ship that shines; stern windows behind a balustraded gallery and domed quarter
// galleries on the carrack and the galleon, a quarter badge on the lighter forms, and a fiddlehead scroll at the stem
// or the beak (never a face). Richness follows the form (the pinnace plainest, the galleon richest) and the level of
// detail (0 far, 1 mid, 2 hero).
import * as THREE from 'three';
import { box, lathe, tube } from '../craft.ts';
import type { FormName } from './forms.ts';
import { V, ZONE, frame, range, type OrnamentPanel, type ShipMesher } from './mesher.ts';

export type CarveLevel = 0 | 1 | 2;
type P2 = readonly [number, number];
const TAU = 2 * Math.PI;
const RICH: Record<FormName, number> = { pinnace: 0, caravel: 1, carrack: 2, galleon: 3 };

/** A panel's own coordinates: u across it (forward, on the centreline), v up, r out of the surface. */
interface Plane { at(u: number, v: number, r?: number): THREE.Vector3; n: THREE.Vector3; up: THREE.Vector3; w: number; h: number }
function plane(p: OrnamentPanel): Plane {
  const centre = p.kind === 'beak' || p.kind === 'stem';
  const x = centre ? p.normal.clone() : new THREE.Vector3().crossVectors(p.up, p.normal).normalize(), n = centre ? V(1, 0, 0) : p.normal.clone();
  return { at: (u, v, r = 0) => p.centre.clone().addScaledVector(x, u).addScaledVector(p.up, v).addScaledVector(n, r), n, up: p.up, w: p.width, h: p.height };
}
/** A part set upright on the panel, +z out of it. */
const on = (pl: Plane, u: number, v: number, r: number) => frame(pl.at(u, v, r), pl.n, pl.up);
/** A lathe's axis out of the panel. */
const axial = (pl: Plane, u: number, v: number, r: number) => frame(pl.at(u, v, r), pl.up, pl.n);
const flat = (r: number) => () => r;
const swell = (rr: number) => (t: number) => rr * (0.35 + 0.65 * Math.sin(Math.PI * t));

function strand(m: ShipMesher, pl: Plane, pts: readonly P2[], r: (t: number) => number, seg: number, lift: (t: number) => number, closed = false): void {
  const n = pts.length - 1;
  tube(m, pts.map(([u, v], i) => pl.at(u, v, lift(i / n))), (i) => r(i / n), seg, closed ? {} : { caps: [0, 0] });
}
/** A volute from its outer end at angle a0 about (cu, cv), winding `turns` in direction dir as it tightens. */
const volute = (cu: number, cv: number, R: number, a0: number, dir: number, turns: number, n: number): P2[] =>
  range(n).map((t) => { const a = a0 + dir * t * turns * TAU, r = R * (1 - 0.72 * t); return [cu + r * Math.cos(a), cv + r * Math.sin(a)] as const; });
/** An S-scroll: two volutes wound the same way on a swelling spine; sx mirrors it. */
const sScroll = (cu: number, cv: number, w: number, R: number, sx: number, n: number): P2[] =>
  [...volute(-w / 2, R, R, -Math.PI / 2, -1, 1.2, n).reverse(), ...volute(w / 2, -R, R, Math.PI / 2, -1, 1.2, n)].map(([u, v]) => [cu + sx * u, cv + v] as const);
/** A C-scroll: two volutes wound against each other, opening upward (sv = −1 downward). */
const cScroll = (cu: number, cv: number, w: number, R: number, sv: number, n: number): P2[] =>
  [...volute(-w / 2, R, R, -Math.PI / 2, -1, 1.1, n).reverse(), ...volute(w / 2, R, R, -Math.PI / 2, 1, 1.1, n)].map(([u, v]) => [cu + u, cv + sv * v] as const);
/** Breaking waves: a looped trochoid, every crest curling over. */
function waves(u0: number, u1: number, v: number, amp: number, n: number): P2[] {
  const k = Math.max(2, Math.round((u1 - u0) / (amp * 2.6))), a = (u1 - u0) / (k * TAU);
  return range(k * n).map((t) => { const th = t * k * TAU; return [u0 + a * th - amp * 0.75 * Math.sin(th), v + amp * 0.5 * Math.cos(th)] as const; });
}
/** A cable moulding: two strands laid up round each other. */
function cable(m: ShipMesher, pl: Plane, u0: number, u1: number, v: number, rr: number, seg: number, per: number): void {
  const k = Math.max(3, Math.round((u1 - u0) / (rr * 5)));
  for (const ph of [0, Math.PI]) strand(m, pl, range(k * per).map((t) => [u0 + (u1 - u0) * t, v + rr * Math.cos(t * k * TAU + ph)] as const), flat(rr * 0.8), seg, (t) => rr * (1.1 + Math.sin(t * k * TAU + ph)));
}
/** A figure-of-eight knot, its strand passing over and then under where it crosses. */
function knot(m: ShipMesher, pl: Plane, cu: number, cv: number, A: number, rr: number, seg: number, n: number): void {
  strand(m, pl, range(n).map((t) => { const s = t * TAU, d = 1 + Math.sin(s) ** 2; return [cu + (A * Math.cos(s)) / d, cv + (A * Math.sin(s) * Math.cos(s)) / d] as const; }), flat(rr), seg, (t) => rr * (1.4 + 0.9 * Math.sin(t * TAU)), true);
}
/** A sunburst in gold leaf: a domed boss and rays, straight and flaming by turns. */
function sunburst(m: ShipMesher, pl: Plane, cu: number, cv: number, R: number, rays: number, seg: number): void {
  m.zone = ZONE.GILT;
  m.xf = axial(pl, cu, cv, 0.004);
  lathe(m, [[0, R * 0.2], [R * 0.2, R * 0.17], [R * 0.32, R * 0.07], [R * 0.36, 0]], seg + 2);
  m.xf = null;
  for (let k = 0; k < rays; k++) {
    const a = (k / rays) * TAU, c = Math.cos(a), s = Math.sin(a), long = k % 2 === 0, r1 = R * (long ? 1 : 0.74);
    const pts = range(long ? 1 : 4).map((t) => { const r = R * 0.42 + (r1 - R * 0.42) * t, w = long ? 0 : 0.07 * R * Math.sin(t * TAU); return [cu + c * r - s * w, cv + s * r + c * w] as const; });
    strand(m, pl, pts, (t) => R * 0.075 * (1 - 0.7 * t), 3, flat(0.005));
  }
}
/** A gilt boss: a volute's eye, a finial. */
function boss(m: ShipMesher, pl: Plane, u: number, v: number, r: number, lift: number, seg: number): void {
  m.zone = ZONE.GILT;
  m.xf = axial(pl, u, v, lift);
  lathe(m, [[0, -r], [r * 0.7, -r * 0.7], [r, 0], [r * 0.7, r * 0.7], [0, r]], seg);
  m.xf = null;
}
/** A row of lights: horn panes (they glow with the lanterns), mullions, sill and lintel. */
function windows(m: ShipMesher, pl: Plane, u0: number, u1: number, v: number, h: number, k: number, r: number): void {
  const w = (u1 - u0) / k;
  m.zone = ZONE.GLASS;
  for (let i = 0; i < k; i++) { m.xf = on(pl, u0 + w * (i + 0.5), v, r); box(m, w * 0.8, h, 0.012); }
  m.zone = ZONE.TRIM;
  for (let i = 0; i <= k; i++) { m.xf = on(pl, u0 + w * i, v, r + 0.006); box(m, w * 0.18, h * 1.1, 0.022); }
  for (const dv of [-0.58, 0.58]) { m.xf = on(pl, (u0 + u1) / 2, v + dv * h, r + 0.006); box(m, u1 - u0 + w * 0.2, h * 0.14, 0.026); }
  m.xf = null;
}
/** A stern walk: a platform out from the stern, turned balusters and a rail, breaking waves along its fascia. */
function gallery(m: ShipMesher, pl: Plane, u0: number, u1: number, v: number, h: number, depth: number, n: number, seg: number, per: number): void {
  m.zone = ZONE.PAINT;
  m.xf = on(pl, (u0 + u1) / 2, v, depth / 2);
  box(m, u1 - u0, 0.04, depth);
  m.zone = ZONE.TRIM;
  for (let i = 0; i <= n; i++) {
    m.xf = on(pl, u0 + ((u1 - u0) * i) / n, v + 0.02, depth * 0.9);
    lathe(m, [[0, 0], [0.015, 0], [0.01, h * 0.22], [0.018, h * 0.52], [0.009, h * 0.84], [0.013, h], [0, h]], seg);
  }
  m.xf = null;
  tube(m, [pl.at(u0, v + h + 0.01, depth * 0.9), pl.at(u1, v + h + 0.01, depth * 0.9)], flat(0.017), seg, { caps: [0, 0] });
  strand(m, pl, waves(u0 + 0.03, u1 - 0.03, v - 0.05, 0.05, per), flat(0.01), seg, flat(depth + 0.004));
}
function transom(m: ShipMesher, pl: Plane, rich: number, level: CarveLevel, seg: number): void {
  const w = pl.w, h = pl.h, n = level === 2 ? 12 : 6, per = level === 2 ? 14 : 7;
  if (level === 0) return sunburst(m, pl, 0, h * 0.2, h * 0.3, 0, 3);
  if (rich >= 2) {
    windows(m, pl, -w * 0.36, w * 0.36, -h * 0.3, h * 0.3, rich + 2, 0.006);
    if (level === 2) gallery(m, pl, -w * 0.46, w * 0.46, -h * 0.52, h * 0.34, 0.13, rich * 3 + 5, seg, per);
    else { m.zone = ZONE.TRIM; strand(m, pl, waves(-w * 0.4, w * 0.4, -h * 0.56, h * 0.1, per), flat(h * 0.02), seg, flat(0.008)); }
    sunburst(m, pl, 0, h * 0.3, h * 0.25, level === 2 ? 16 : 8, seg);
    m.zone = ZONE.TRIM;
    for (const sx of [1, -1]) strand(m, pl, sScroll(sx * w * 0.27, h * 0.3, w * 0.15, h * 0.075, sx, n), swell(h * 0.032), seg, flat(0.008));
    if (level === 2) for (const sx of [1, -1]) for (const [du, dv] of [[-w * 0.075, h * 0.075], [w * 0.075, -h * 0.075]]) boss(m, pl, sx * (w * 0.27 + du), h * 0.3 + dv, h * 0.022, 0.012, seg);
  } else {
    sunburst(m, pl, 0, h * 0.12, h * 0.32, rich && level === 2 ? 12 : 8, seg);
    m.zone = ZONE.TRIM;
    if (rich) for (const sx of [1, -1]) strand(m, pl, sScroll(sx * w * 0.3, h * 0.12, w * 0.14, h * 0.09, sx, n), swell(h * 0.035), seg, flat(0.008));
    strand(m, pl, waves(-w * 0.4, w * 0.4, -h * 0.4, h * 0.14, per), flat(h * 0.022), seg, flat(0.008));
  }
}
function taffrail(m: ShipMesher, pl: Plane, rich: number, level: CarveLevel, seg: number): void {
  if (level === 0) return;
  const w = pl.w, h = pl.h, per = level === 2 ? 8 : 4;
  m.zone = ZONE.TRIM;
  cable(m, pl, -w * 0.42, w * 0.42, h * 0.1, h * 0.12, seg, per);
  for (const sx of [1, -1]) strand(m, pl, volute(sx * w * 0.46, 0, h * 0.42, Math.PI / 2, -sx, 1.25, per + 2), (t) => h * 0.13 * (1 - 0.6 * t), seg, flat(0.01));
  if (rich >= 1 && level === 2) { m.zone = ZONE.GILT; knot(m, pl, 0, -h * 0.25, h * 0.85, h * 0.07, seg, 28); }
}
/** A domed quarter gallery with two lights, a pendant below and a gilt finial. */
function quarterGallery(m: ShipMesher, pl: Plane, level: CarveLevel, seg: number): void {
  const w = pl.w, h = pl.h, d = w * 0.42;
  m.zone = ZONE.PAINT;
  m.xf = on(pl, 0, 0, d / 2);
  box(m, w, h, d);
  m.xf = null;
  windows(m, pl, -w * 0.36, w * 0.36, h * 0.06, h * 0.46, 2, d);
  m.zone = ZONE.TRIM;
  m.xf = on(pl, 0, h / 2, d * 0.5);
  lathe(m, [[w * 0.5, 0], [w * 0.45, h * 0.12], [w * 0.28, h * 0.34], [w * 0.1, h * 0.44], [0, h * 0.46]], seg + 2);
  m.xf = on(pl, 0, -h / 2, d * 0.5);
  lathe(m, [[0, -h * 0.42], [w * 0.08, -h * 0.36], [w * 0.28, -h * 0.18], [w * 0.45, -h * 0.04], [w * 0.5, 0]], seg + 2);
  m.xf = null;
  boss(m, pl, 0, h * 0.98, 0.03, d * 0.5, seg);
  if (level === 2) { m.zone = ZONE.TRIM; strand(m, pl, cScroll(0, -h * 0.4, w * 0.5, h * 0.06, 1, 7), swell(0.014), seg, flat(d + 0.004)); }
}
/** A quarter badge: two C-scrolls framing a small sunburst. */
function badge(m: ShipMesher, pl: Plane, level: CarveLevel, seg: number): void {
  const w = pl.w, h = pl.h, n = level === 2 ? 7 : 4;
  m.zone = ZONE.TRIM;
  for (const sv of [1, -1]) strand(m, pl, cScroll(0, sv * h * 0.05, w * 0.5, h * 0.14, sv, n), swell(0.016), seg, flat(0.008));
  sunburst(m, pl, 0, 0, h * 0.24, level === 2 ? 10 : 6, seg);
}
/** The head: a fiddlehead scroll curling up and aft from the stem or the beak, a gilt eye at its heart. */
function head(m: ShipMesher, pl: Plane, big: boolean, level: CarveLevel, seg: number): void {
  const R = big ? 0.11 : 0.075, n = level === 2 ? 12 : 6;
  m.zone = ZONE.TRIM;
  const lead = range(3).map((t) => [0.01 * t, -2.4 * R * (1 - t)] as const).slice(0, -1);
  strand(m, pl, [...lead, ...volute(-R, 0, R, 0, 1, 1.35, n)], (t) => R * (0.36 - 0.24 * t), seg, flat(0));
  if (level === 2) boss(m, pl, -R, 0, R * 0.22, 0, seg);
}

/** The default carver (ShipOptions.ornament): fills the panels the shipwright left for it. */
export function carve(m: ShipMesher, panels: readonly OrnamentPanel[], level: CarveLevel, form: FormName): void {
  const rich = RICH[form], seg = level === 2 ? 6 : 4;
  for (const p of panels) {
    const pl = plane(p);
    if (p.kind === 'transom') transom(m, pl, rich, level, seg);
    else if (p.kind === 'taffrail') taffrail(m, pl, rich, level, seg);
    else if (level === 0) continue;
    else if (p.kind === 'quarter') { if (rich >= 2) quarterGallery(m, pl, level, seg); else badge(m, pl, level, seg); }
    else head(m, pl, p.kind === 'beak', level, seg);
  }
  m.zone = ZONE.HULL;
  m.xf = null;
}
