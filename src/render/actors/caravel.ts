// The hero ship, ported from the rewrite's caravel: a crewless spirit caravel, every plank lofted in code. A lacquered
// hull stepping up into a forecastle and a tall sterncastle, painted castles, wales and gunports, a stern gallery with
// its windows lit by the wisp that sails her, the great spirit lantern over the taffrail, and three lateen masts
// (fore-and-aft sails, so they sit edge-on to the chase camera and never hide what is ahead). A swivel turret in the
// waist wears whichever weapon is in hand; the broadside fires from the gunports. The figurehead is its own piece, so
// it can be swapped, and the sail carries the captain's emblem from the cosmetics library.
//
// Everything here is in the ship's own frame: +y up, +z toward the bow, +x to port. ships.ts places it on the sphere.
import * as THREE from 'three';
import { emblemRoundel } from '../cosmetics/emblems.ts';
import { patch, type ActorTextures } from './common.ts';
import { sharedUniforms } from '../planet.ts';
import type { Figurehead, Look } from './cosmetics.ts';
import { WEAPONS, type Weapon } from './view.ts';

// ---------------------------------------------------------------- the hull's lines

/** s runs from the stern (0) to the bow (1); heights are over the hull's origin, the waterline a little above it. */
export const SHIP = { length: 18, beam: 5.4, radius: 5.2, turretZ: 2.6, perch: new THREE.Vector3() };
const L = SHIP.length, B = SHIP.beam, WL = 0.3, YB = WL + 0.9;
const V3 = THREE.Vector3;
const sm = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const zAt = (s: number) => (s - 0.5) * L;
const sAt = (z: number) => clamp(z / L + 0.5, 0, 1);

/** The waist's sheer: the rail low amidships, lifting to either end and more to the bow. */
const sheer = (s: number) => 2.2 + 1.6 * (s - 0.5) ** 2 + 0.3 * sm(0.7, 1, s);
const mainDeck = (s: number) => sheer(s) - 0.95;
/** The decks, stern to bow: poop, quarterdeck, waist, forecastle, each standing this far over the main deck. */
const DECKS = [{ a: 0, b: 0.11, rise: 2.6 }, { a: 0.11, b: 0.28, rise: 1.45 }, { a: 0.28, b: 0.8, rise: 0 }, { a: 0.8, b: 1, rise: 1.3 }];
const riseAt = (s: number) => DECKS.find((d) => s <= d.b)!.rise;
const deckAt = (s: number) => mainDeck(s) + riseAt(s);
/** The rail: the waist's sheer stepping up over each castle in a short sweep. */
const STEPS: [number, number][] = [[0.1, 0.13], [0.272, 0.305], [0.775, 0.808]];
const rail = (s: number) => sheer(s) + 1.15 * (1 - sm(0.1, 0.13, s)) + 1.45 * (1 - sm(0.272, 0.305, s)) + 1.3 * sm(0.775, 0.808, s);
/** The keel: deep under the sternpost, rising into the forefoot. */
const keel = (s: number) => -1.45 * (1 - 0.85 * sm(0.72, 1, s) ** 1.4) * (1 - 0.3 * (1 - sm(0, 0.12, s)));
/** Half-beam at the widest, just above the water. */
const halfBeam = (s: number) => (B / 2) * (s < 0.5 ? 0.74 + 0.26 * sm(0, 0.5, s) : Math.max(0.035, Math.cos(((s - 0.5) / 0.5) * Math.PI / 2) ** 0.62));
/** How sharply the bilge pinches toward the keel: a fine run aft, a fuller entry forward. */
const fine = (s: number) => 1 + 2.4 * (1 - sm(0, 0.32, s)) + 1.2 * sm(0.62, 1, s);
/** Half-breadth of the skin at a height: a round bilge below the widest, tumblehome above it. */
function halfAt(s: number, y: number): number {
  const hb = halfBeam(s);
  if (y > YB) return hb * (1 - 0.045 * (y - YB) ** 1.2);
  const k = keel(s), q = clamp((y - k) / (YB - k), 0, 1);
  return hb * Math.sqrt(1 - (1 - q) ** 2) ** fine(s);
}
/** Where along the ship a point of the skin lies: the stern's counter overhangs aft, the stem rakes forward. */
const zOf = (s: number, y: number) => zAt(s) - 0.3 * Math.max(0, y - WL) * (1 - sm(0, 0.07, s)) + 0.35 * Math.max(0, y - keel(s)) * sm(0.9, 1, s);
const onSkin = (s: number, y: number, side: number, out = new V3()) => out.set(side * halfAt(s, y), y, zOf(s, y));
/** A point on the skin: station s, t from keel (0) to rail (1), rows gathered toward the bilge. */
const skin = (s: number, t: number, side: number) => { const k = keel(s); return onSkin(s, k + (rail(s) - k) * t ** 1.3, side); };
/** The skin's outward normal. */
function hullNormal(s: number, y: number, side: number): THREE.Vector3 {
  const ds = onSkin(s + 0.004, y, 1).sub(onSkin(s - 0.004, y, 1)), dy = onSkin(s, y + 0.02, 1).sub(onSkin(s, y - 0.02, 1));
  const n = dy.cross(ds).normalize();
  n.x *= side;
  return n;
}
export const deckHeight = (z: number) => deckAt(sAt(z));

/** The masts, aft to forward is not their order here: fore, main, mizzen, each with its lateen yard. */
interface Mast { s: number; h: number; r: number; top: number; cross: number; angle: number; yard: number; at: number; clew: [number, number]; swing: number }
const MASTS: Mast[] = [
  { s: 0.856, h: 13, r: 0.2, top: 0.66, cross: 10.2, angle: 50, yard: 13, at: 0.36, clew: [3.7, 5.3], swing: 0.9 },
  { s: 0.44, h: 17.5, r: 0.27, top: 0.68, cross: 11.5, angle: 52, yard: 18, at: 0.3, clew: [-4.2, 4.5], swing: 1 },
  { s: 0.17, h: 9.8, r: 0.17, top: 0, cross: 8.6, angle: 48, yard: 10.5, at: 0.3, clew: [-8.9, 6.1], swing: 1.1 },
];
const mastZ = (m: Mast) => zAt(m.s), mastTop = (m: Mast) => deckAt(m.s) + m.h;
/** A lateen's corners in the ship's side plane (z, y): tack forward and low, peak aft and high, clew below the peak. */
function lateen(m: Mast): { T: THREE.Vector2; P: THREE.Vector2; C: THREE.Vector2 } {
  const a = (m.angle * Math.PI) / 180, d = new THREE.Vector2(Math.cos(a), -Math.sin(a)), o = new THREE.Vector2(mastZ(m), m.cross);
  return { T: o.clone().addScaledVector(d, m.yard * m.at), P: o.clone().addScaledVector(d, -m.yard * (1 - m.at)), C: new THREE.Vector2(...m.clew) };
}
SHIP.perch.set(0, mastTop(MASTS[1]) + 0.45, mastZ(MASTS[1]));
const STERN_Y = rail(0), STERN_Z = zOf(0, STERN_Y), BOWSPRIT = new V3(0, rail(1) + 2.5, zAt(1) + 5.6);

// ---------------------------------------------------------------- geometry builder

/** Parts index the body material's looks. */
const P = { hull: 0, gold: 1, bulwark: 2, deck: 3, accent: 6, wood: 7, rope: 8, tar: 9, wisp: 11, bronze: 12, iron: 13, glass: 14 } as const;

class Builder {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; part: number[] = []; aux: number[] = []; idx: number[] = [];
  add(g: THREE.BufferGeometry, part: number, m?: THREE.Matrix4, uvm?: (u: number, v: number) => [number, number], aux = 0): this {
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), t = g.getAttribute('uv'), ax = g.getAttribute('aAux');
    const base = this.pos.length / 3;
    const nm = m ? new THREE.Matrix3().getNormalMatrix(m) : null;
    const v = new V3(), nn = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      nn.fromBufferAttribute(n, i);
      if (m) { v.applyMatrix4(m); nn.applyMatrix3(nm!).normalize(); }
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(nn.x, nn.y, nn.z);
      const [u, w] = t ? (uvm ? uvm(t.getX(i), t.getY(i)) : [t.getX(i), t.getY(i)]) : [0, 0];
      this.uv.push(u, w);
      this.part.push(part);
      this.aux.push(ax ? ax.getX(i) : aux);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(this.part, 1));
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(this.aux, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/** A surface from a grid of points (rows along one direction), with uvs and an optional aux value per point. */
function surface(rows: THREE.Vector3[][], uvs: [number, number][][], flip: boolean, aux?: number[][]): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], ax: number[] = [], idx: number[] = [];
  const nr = rows.length, nc = rows[0].length;
  rows.forEach((row, i) => row.forEach((p, j) => { pos.push(p.x, p.y, p.z); uv.push(...uvs[i][j]); ax.push(aux ? aux[i][j] : 0); }));
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < nc - 1; j++) {
    const a = i * nc + j, b = a + 1, c = a + nc, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAux', new THREE.Float32BufferAttribute(ax, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) =>
  new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(s, s, s));
const MS = (x: number, y: number, z: number, rx: number, ry: number, rz: number, sx: number, sy: number, sz: number) =>
  new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
/** A frame on a surface: z out along the normal, y as near to up as it can be. */
function frame(p: THREE.Vector3, n: THREE.Vector3): THREE.Matrix4 {
  const z = n.clone().normalize(), x = new V3(0, 1, 0).cross(z).normalize(), y = z.clone().cross(x);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(p);
}

/** A cylinder from a to b. */
function rod(b: Builder, a: THREE.Vector3, c: THREE.Vector3, r0: number, r1: number, part: number, sides = 6): void {
  const len = a.distanceTo(c);
  const g = new THREE.CylinderGeometry(r1, r0, len, sides, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), c.clone().sub(a).normalize());
  const m = new THREE.Matrix4().compose(a.clone().lerp(c, 0.5), q, new V3(1, 1, 1));
  b.add(g, part, m, (u, v) => [v * len * 0.3, u * 0.25]);
}

/** A smooth tube through points. */
function tube(b: Builder, pts: THREE.Vector3[], r: number, part: number, sides = 6, segs = pts.length): void {
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, r, sides, false), part, undefined, (u, v) => [u * 20, v]);
}

function lantern(b: Builder, at: THREE.Vector3, size: number, segs = 10): void {
  const pts = [0, 0.2, 0.45, 0.5, 0.45, 0.2, 0].map((r, i) => new THREE.Vector2(Math.max(0.001, r * size), (i / 6 - 0.5) * size * 1.3));
  b.add(new THREE.LatheGeometry(pts, segs), P.wisp, M(at.x, at.y, at.z));
  b.add(new THREE.CylinderGeometry(size * 0.22, size * 0.22, size * 0.12, 8), P.gold, M(at.x, at.y + size * 0.68, at.z));
  b.add(new THREE.CylinderGeometry(size * 0.22, size * 0.22, size * 0.12, 8), P.gold, M(at.x, at.y - size * 0.68, at.z));
  b.add(new THREE.ConeGeometry(size * 0.3, size * 0.4, 8), P.gold, M(at.x, at.y + size * 0.92, at.z));
}

/** A window lit from within, in a gilt frame, on a face whose frame is `m`; seen from afar, just the light. */
function pane(b: Builder, m: THREE.Matrix4, w: number, h: number, hi: boolean): void {
  b.add(new THREE.BoxGeometry(w, h, 0.09), P.glass, m);
  if (!hi) return;
  b.add(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05), P.gold, m);
  b.add(new THREE.BoxGeometry(w + 0.04, 0.04, 0.11), P.gold, m);
  b.add(new THREE.BoxGeometry(0.04, h, 0.11), P.gold, m);
}

/** The hull and everything fixed to it; `hi` for ships near the camera, otherwise a lighter cut for the distance. */
function hullGeometry(hi: boolean): THREE.BufferGeometry {
  const b = new Builder();
  const NS = hi ? 44 : 22, NP = hi ? 14 : 7;
  // stations: closer at the ends, and close through each step of the rail so the castles' sweeps stay smooth
  const st = new Set<number>(Array.from({ length: NS + 1 }, (_, i) => 0.5 - 0.5 * Math.cos((Math.PI * i) / NS)));
  for (const [a, c] of STEPS) for (let k = 0, n = hi ? 6 : 3; k <= n; k++) st.add(a + ((c - a) * k) / n);
  for (const d of DECKS) st.add(d.b);
  const stations = [...st].sort((a, c) => a - c);
  const h = (s: number, y: number) => y - mainDeck(s);
  for (const side of [-1, 1]) {
    // the skin, keel to rail; aux carries the height over the main deck's line, so the paint follows the sheer
    const rows = stations.map((s) => Array.from({ length: NP + 1 }, (_, j) => skin(s, j / NP, side)));
    const uvs = rows.map((row) => row.map((p) => [p.z / 3.6, p.y / 3.6] as [number, number]));
    const aux = rows.map((row, i) => row.map((p) => h(stations[i], p.y)));
    b.add(surface(rows, uvs, side > 0, aux), P.hull);
    // the rail's cap, gilt
    const top = stations.map((s) => skin(s, 1, side));
    const inner = top.map((p) => p.clone().setX(p.x - side * Math.min(0.16, Math.abs(p.x) * 0.9)));
    b.add(surface(stations.map((_, i) => [top[i], top[i].clone().setY(top[i].y + 0.06), inner[i].clone().setY(inner[i].y + 0.06)]), stations.map((s) => [[s * 8, 0], [s * 8, 0.1], [s * 8, 0.2]]), side > 0), P.gold);
    // the bulwarks inside, deck by deck
    for (const d of DECKS) {
      const ss = stations.filter((s) => s >= d.a && s <= d.b);
      const rowsIn = ss.map((s) => {
        const yr = rail(s), yd = mainDeck(s) + d.rise, inset = (y: number) => Math.max(0.02, halfAt(s, y) - 0.16);
        return [new V3(side * inset(yr), yr, zOf(s, yr)), new V3(side * inset(yd), yd, zOf(s, yd))];
      });
      b.add(surface(rowsIn, rowsIn.map((r) => r.map((p) => [p.z / 3.6, p.y / 3.6] as [number, number])), side > 0), P.bulwark);
    }
    // the wales: tarred strakes under the gun deck's band and along the waist's rail
    for (const [hw, r] of [[-0.3, 0.1], [0.92, 0.08]] as const) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 44; i++) {
        const s = 0.004 + (0.982 * i) / 44, y = mainDeck(s) + hw;
        pts.push(onSkin(s, y, side).add(new V3(side * r * 0.4, 0, 0)));
      }
      tube(b, pts, r, P.tar, hi ? 5 : 4, hi ? 44 : 16);
    }
    // gunports in the band, lids propped open, a bronze muzzle in each
    for (const s of [0.36, 0.47, 0.58, 0.69]) {
      const y = mainDeck(s) + 0.3, p = onSkin(s, y, side), f = frame(p, hullNormal(s, y, side));
      b.add(new THREE.BoxGeometry(0.58, 0.5, 0.1), P.iron, f);
      if (!hi) continue;
      b.add(new THREE.BoxGeometry(0.72, 0.64, 0.05), P.gold, f);
      b.add(new THREE.BoxGeometry(0.62, 0.54, 0.05), P.accent, f.clone().multiply(M(0, 0.28, 0.06)).multiply(M(0, 0, 0, 1.2)).multiply(M(0, 0.27, 0.025)));
      b.add(new THREE.LatheGeometry([[0.001, -0.1], [0.12, -0.1], [0.11, 0.2], [0.095, 0.48], [0.13, 0.5], [0.13, 0.6], [0.06, 0.6], [0.06, 0.35]].map(([r, yy]) => new THREE.Vector2(r, yy)), 8), P.bronze, f.clone().multiply(M(0, 0, 0, Math.PI / 2)));
    }
  }
  // the decks, cambered, one for each level
  for (const d of DECKS) {
    const ss = stations.filter((s) => s >= d.a && s <= d.b);
    const rows = ss.map((s) => {
      const y = mainDeck(s) + d.rise, w = Math.max(0.02, halfAt(s, y) - 0.16), z = zOf(s, y);
      return [new V3(-w, y, z), new V3(0, y + Math.min(0.08, w * 0.04), z), new V3(w, y, z)];
    });
    b.add(surface(rows, rows.map((r) => r.map((p) => [p.z / 4, p.x / 4] as [number, number])), false), P.deck);
  }
  // the breaks between the decks: bulkheads with a door and lit windows, a balustrade along the higher deck's edge
  for (let i = 0; i + 1 < DECKS.length; i++) {
    const s = DECKS[i].b, lo = Math.min(DECKS[i].rise, DECKS[i + 1].rise), up = Math.max(DECKS[i].rise, DECKS[i + 1].rise);
    const aftHigh = DECKS[i].rise > DECKS[i + 1].rise, y0 = mainDeck(s) + lo, y1 = mainDeck(s) + up, fz = aftHigh ? 1 : -1;
    const w = (y: number) => Math.max(0.02, halfAt(s, y) - 0.16);
    const rows = [y0, y1].map((y) => [new V3(-w(y), y, zOf(s, y)), new V3(w(y), y, zOf(s, y))]);
    b.add(surface(rows, rows.map((r) => r.map((p) => [p.x / 3.6, p.y / 3.6] as [number, number])), aftHigh), P.accent);
    const face = (x: number, y: number) => frame(new V3(x, y, zOf(s, y) + fz * 0.03), new V3(0, 0, fz));
    const ht = y1 - y0;
    b.add(new THREE.BoxGeometry(0.8, ht * 0.78, 0.08), P.iron, face(0, y0 + ht * 0.39));
    b.add(new THREE.BoxGeometry(0.94, 0.07, 0.1), P.gold, face(0, y0 + ht * 0.78));
    for (const x of [-1, 1]) pane(b, face(x * Math.min(1.25, w(y0) * 0.55), y0 + ht * 0.55), 0.42, Math.min(0.55, ht * 0.4), hi);
    const yb = y1 + 0.85, zb = zOf(s, y1) - fz * 0.12, wb = w(y1) - 0.02;
    rod(b, new V3(-wb, yb, zb), new V3(wb, yb, zb), 0.05, 0.05, P.gold, hi ? 6 : 4);
    if (hi) for (let k = 0, n = Math.max(3, Math.round(wb * 2 / 0.42)); k <= n; k++) {
      const x = -wb + (2 * wb * k) / n;
      b.add(new THREE.CylinderGeometry(0.035, 0.05, 0.82, 5, 1, true), P.gold, M(x, y1 + 0.42, zb));
    }
  }
  // the transom: a fan across the stern's profile, its top closed, painted like the sides
  {
    const ring: THREE.Vector3[] = [];
    for (let j = NP; j >= 0; j--) ring.push(skin(0, j / NP, -1));
    for (let j = 1; j <= NP; j++) ring.push(skin(0, j / NP, 1));
    const cy = (keel(0) + STERN_Y) / 2, c = new V3(0, cy, zOf(0, cy));
    const pos: number[] = [c.x, c.y, c.z], uv: number[] = [0, c.y / 3.6], ax: number[] = [h(0, c.y)];
    for (const p of ring) { pos.push(p.x, p.y, p.z); uv.push(p.x / 3.6, p.y / 3.6); ax.push(h(0, p.y)); }
    const idx: number[] = [];
    for (let i = 1; i < ring.length; i++) idx.push(0, i + 1, i);
    idx.push(0, 1, ring.length);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('aAux', new THREE.Float32BufferAttribute(ax, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    b.add(g, P.hull);
    // the taffrail's inside face, and a gilt cap across it
    const yd = deckAt(0), wt = (y: number) => Math.max(0.02, halfAt(0, y) - 0.05);
    const rows = [STERN_Y, yd].map((y) => [new V3(-wt(y), y, zOf(0, y) + 0.12), new V3(wt(y), y, zOf(0, y) + 0.12)]);
    b.add(surface(rows, rows.map((r) => r.map((p) => [p.x / 3.6, p.y / 3.6] as [number, number])), false), P.bulwark);
    rod(b, new V3(-wt(STERN_Y), STERN_Y + 0.04, STERN_Z + 0.05), new V3(wt(STERN_Y), STERN_Y + 0.04, STERN_Z + 0.05), 0.08, 0.08, P.gold, 6);
    // a carved arch over the taffrail
    const arch: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) { const x = (i / 12 * 2 - 1) * wt(STERN_Y) * 0.85; arch.push(new V3(x, STERN_Y + 0.08 + 0.55 * Math.cos((x / (wt(STERN_Y) * 0.85)) * Math.PI / 2), STERN_Z - 0.02)); }
    tube(b, arch, 0.07, P.gold, hi ? 6 : 4, hi ? 12 : 6);
    // the stern's windows: the great cabin's row behind a gallery, and the gunroom's below
    const n = new V3(0, -0.29, -0.96).normalize();
    const onTransom = (x: number, y: number, out = 0.04) => frame(new V3(x, y, zOf(0, y)).addScaledVector(n, out), n);
    for (const x of [-1.24, -0.62, 0, 0.62, 1.24]) pane(b, onTransom(x, 3.72), 0.42, 0.56, hi);
    for (const x of [-0.9, -0.3, 0.3, 0.9]) pane(b, onTransom(x, 2.15), 0.34, 0.36, hi);
    const yg = 3.12, zg = zOf(0, yg) - 0.3, wg = halfAt(0, yg) * 0.92;
    b.add(new THREE.BoxGeometry(wg * 2, 0.1, 0.62), P.accent, M(0, yg, zg + 0.04));
    b.add(new THREE.BoxGeometry(wg * 2 + 0.06, 0.06, 0.66), P.gold, M(0, yg - 0.07, zg + 0.04));
    rod(b, new V3(-wg, yg + 0.48, zg - 0.24), new V3(wg, yg + 0.48, zg - 0.24), 0.04, 0.04, P.gold, 6);
    if (hi) for (let k = 0; k <= 10; k++) b.add(new THREE.CylinderGeometry(0.025, 0.04, 0.44, 5, 1, true), P.gold, M(-wg + (2 * wg * k) / 10, yg + 0.26, zg - 0.24));
    // the stern lanterns, the great one in the middle
    for (const x of [-1, 0, 1]) {
      const big = x === 0, base = new V3(x * wt(STERN_Y) * 0.8, STERN_Y + (big ? 0.6 : 0.1), STERN_Z - 0.05);
      const at = base.clone().add(new V3(0, big ? 0.85 : 0.6, -0.35));
      rod(b, base, at.clone().add(new V3(0, -0.4, 0)), 0.05, 0.04, P.gold, 5);
      lantern(b, at, big ? 0.85 : 0.55, hi ? 10 : 6);
    }
    // the rudder, hung on the sternpost
    const k0 = keel(0);
    b.add(new THREE.BoxGeometry(0.16, WL + 0.8 - k0, 0.9), P.wood, M(0, (k0 + WL + 0.8) / 2, zAt(0) - 0.25));
    // the ensign's staff
    rod(b, new V3(0, STERN_Y - 0.6, STERN_Z + 0.35), new V3(0, STERN_Y + 2.9, STERN_Z - 0.35), 0.06, 0.04, P.wood, 6);
    b.add(new THREE.SphereGeometry(0.1, 8, 6), P.gold, M(0, STERN_Y + 2.95, STERN_Z - 0.36));
  }
  // the stem, the beakhead and its gilt gull, and the bowsprit
  {
    const stem: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) { const y = keel(1) + ((rail(1) + 0.3 - keel(1)) * i) / 10; stem.push(new V3(0, y, zOf(1, y) + 0.06)); }
    tube(b, stem, 0.14, P.tar, hi ? 6 : 4);
    const yb = mainDeck(1) + 0.1, z0 = zOf(1, yb), len = 2.6;
    const beak = new THREE.BoxGeometry(0.9, 0.26, len, 1, 1, 4);
    const bp = beak.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) { const t = bp.getZ(i) / len + 0.5; bp.setX(i, bp.getX(i) * (1 - 0.85 * t)); bp.setY(i, bp.getY(i) + t * t * 0.35); }
    beak.computeVertexNormals();
    b.add(beak, P.accent, M(0, yb, z0 + len / 2 - 0.2));
    if (hi) for (const x of [-1, 1]) tube(b, [0, 0.33, 0.66, 1].map((t) => new V3(x * 0.45 * (1 - 0.85 * t), yb + 0.2 + t * t * 0.35, z0 - 0.2 + t * len)), 0.04, P.gold, 5);
    rod(b, new V3(0, deckAt(0.95) + 0.25, zOf(0.95, deckAt(0.95))), BOWSPRIT, 0.2, 0.09, P.wood, 8);
  }
  // the masts: fighting tops on fore and main, shrouds with ratlines down to the chains
  for (const m of MASTS) {
    const z = mastZ(m), d = deckAt(m.s), top = mastTop(m);
    rod(b, new V3(0, d - 0.2, z), new V3(0, top, z), m.r, m.r * 0.45, P.wood, hi ? 10 : 5);
    b.add(new THREE.SphereGeometry(m.r * 0.8, 8, 6), P.gold, M(0, top + 0.05, z));
    const yt = m.top ? d + m.h * m.top : d + m.h * 0.78, rt = m.top ? 0.95 : 0.3;
    if (m.top) {
      const n = hi ? 14 : 7;
      b.add(new THREE.CylinderGeometry(rt, rt * 0.75, 0.16, n), P.wood, M(0, yt, z));
      b.add(new THREE.CylinderGeometry(rt, rt, 0.55, n, 1, true), P.wood, M(0, yt + 0.3, z));
      if (hi) b.add(new THREE.TorusGeometry(rt, 0.045, 5, 18), P.gold, M(0, yt + 0.58, z, Math.PI / 2));
    } else b.add(new THREE.CylinderGeometry(m.r * 1.6, m.r * 1.6, 0.25, 8), P.wood, M(0, yt, z));
    const spread = m.h > 15 ? [-1.9, -0.95, 0, 0.95] : m.h > 12 ? [-1.4, -0.45, 0.5] : [-1.1, -0.1];
    for (const side of [-1, 1]) {
      const lines = spread.map((dz) => {
        const s = sAt(z + dz), yr = rail(s) - 0.15;
        return [new V3(side * rt * 0.85, yt - 0.05, z + dz * 0.15), onSkin(s, yr, side).add(new V3(side * 0.14, 0, 0))] as const;
      });
      for (const [a, c] of lines) rod(b, a, c, 0.028, 0.028, P.rope, hi ? 4 : 3);
      // ratlines, rung by rung between neighbouring shrouds
      if (hi) for (let i = 0; i + 1 < lines.length; i++) {
        const [a0, c0] = lines[i], [a1, c1] = lines[i + 1];
        for (let y = Math.max(c0.y, c1.y) + 0.5; y < yt - 0.4; y += 0.5) {
          const p0 = c0.clone().lerp(a0, (y - c0.y) / (a0.y - c0.y)), p1 = c1.clone().lerp(a1, (y - c1.y) / (a1.y - c1.y));
          rod(b, p0, p1, 0.014, 0.014, P.rope, 3);
        }
      }
    }
  }
  // the forestay, from the fore's head out to the bowsprit
  rod(b, new V3(0, mastTop(MASTS[0]) - 0.5, mastZ(MASTS[0])), BOWSPRIT.clone().add(new V3(0, 0.1, -0.3)), 0.035, 0.035, P.rope, 4);
  // small things on deck: a hatch grating, a capstan on the quarterdeck, casks by the mainmast, the turret's ring
  {
    const s = 0.53, y = deckAt(s);
    b.add(new THREE.BoxGeometry(1.6, 0.3, 1.9), P.wood, M(0, y + 0.15, zAt(s)));
    b.add(new THREE.BoxGeometry(1.36, 0.06, 1.66), P.iron, M(0, y + 0.31, zAt(s)));
    const sc = 0.22;
    b.add(new THREE.CylinderGeometry(0.38, 0.46, 0.85, 10), P.wood, M(0, deckAt(sc) + 0.42, zAt(sc)));
    b.add(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 10), P.gold, M(0, deckAt(sc) + 0.88, zAt(sc)));
    const stt = sAt(SHIP.turretZ);
    b.add(new THREE.TorusGeometry(1.15, 0.12, hi ? 6 : 4, hi ? 20 : 10), P.gold, M(0, deckAt(stt) + 0.08, SHIP.turretZ, Math.PI / 2));
    if (!hi) return b.build();
    const cask = new THREE.LatheGeometry([[0.001, -0.4], [0.3, -0.4], [0.36, -0.2], [0.38, 0], [0.36, 0.2], [0.3, 0.4], [0.001, 0.4]].map(([r, yy]) => new THREE.Vector2(r, yy)), 9);
    const sm0 = MASTS[1].s - 0.06;
    for (const [x, dz] of [[-1.35, 0], [-1.3, 0.8], [1.35, 0.3]]) b.add(cask, P.wood, M(x, deckAt(sm0) + 0.4, zAt(sm0) + dz));
    for (const [x, dz] of [[-1.35, 0], [-1.3, 0.8], [1.35, 0.3]]) for (const yy of [-0.25, 0.25]) b.add(new THREE.TorusGeometry(0.37, 0.025, 4, 10), P.iron, M(x, deckAt(sm0) + 0.4 + yy, zAt(sm0) + dz, Math.PI / 2));
  }
  return b.build();
}

// ---------------------------------------------------------------- figureheads

/** Where the figurehead sits: at the beakhead's tip, leaning out over the sea. */
function figureheadFrame(): THREE.Matrix4 {
  const yb = mainDeck(1) + 0.1, z0 = zOf(1, yb), len = 2.6;
  return M(0, yb + 0.55, z0 + len - 0.1, -0.3);
}

/** The carved piece on the beakhead, by kind; all gilt, the orb a lantern of the ship's wisp. */
function figureheadGeometry(kind: Figurehead): THREE.BufferGeometry {
  const b = new Builder(), g = figureheadFrame();
  const at = (m: THREE.Matrix4) => g.clone().multiply(m);
  switch (kind) {
    case 'gull':
      // a gull, wings raised, leaning into the sea
      b.add(new THREE.SphereGeometry(1, 12, 8), P.gold, at(MS(0, 0, 0, 0, 0, 0, 0.3, 0.28, 0.72)));
      b.add(new THREE.SphereGeometry(0.21, 10, 8), P.gold, at(M(0, 0.24, 0.62)));
      b.add(new THREE.ConeGeometry(0.07, 0.36, 8), P.gold, at(M(0, 0.21, 0.94, Math.PI / 2)));
      for (const x of [-1, 1]) {
        b.add(new THREE.BoxGeometry(1.5, 0.05, 0.5), P.gold, at(M(x * 0.82, 0.32, -0.12, 0, x * 0.4, x * 0.5)));
        b.add(new THREE.BoxGeometry(0.8, 0.04, 0.36), P.gold, at(M(x * 1.62, 0.78, -0.42, 0, x * 0.7, x * 0.75)));
      }
      b.add(new THREE.ConeGeometry(0.22, 0.6, 6), P.gold, at(M(0, 0, -0.85, -Math.PI / 2)));
      break;
    case 'whale':
      // a whale breaching up the stem, flukes curled under the beak
      b.add(new THREE.SphereGeometry(1, 14, 10), P.gold, at(MS(0, 0.1, 0.1, -0.5, 0, 0, 0.38, 0.36, 0.95)));
      b.add(new THREE.SphereGeometry(1, 10, 8), P.gold, at(MS(0, 0.55, 0.85, -0.5, 0, 0, 0.28, 0.24, 0.4)));
      for (const x of [-1, 1]) b.add(new THREE.BoxGeometry(0.7, 0.05, 0.3), P.gold, at(M(x * 0.42, -0.08, 0.35, 0.2, x * 0.5, x * 0.4)));
      b.add(new THREE.BoxGeometry(1.2, 0.06, 0.4), P.gold, at(M(0, -0.45, -0.85, 0.6)));
      break;
    case 'star':
      // an eight-rayed star on a short post
      b.add(new THREE.CylinderGeometry(0.06, 0.08, 0.7, 6), P.gold, at(M(0, 0, -0.1)));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, l = i % 2 ? 0.45 : 0.75;
        b.add(new THREE.ConeGeometry(0.09, l, 4), P.gold, at(M(Math.sin(a) * l * 0.5, 0.55 + Math.cos(a) * l * 0.5, 0.1, 0, 0, -a)));
      }
      b.add(new THREE.SphereGeometry(0.16, 10, 8), P.gold, at(M(0, 0.55, 0.1)));
      break;
    case 'orb':
      // a caged orb of the ship's own spirit light
      b.add(new THREE.SphereGeometry(0.36, 16, 12), P.wisp, at(M(0, 0.3, 0.15)));
      for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(0.4, 0.025, 5, 20), P.gold, at(M(0, 0.3, 0.15, 0, (i * Math.PI) / 4)));
      b.add(new THREE.ConeGeometry(0.16, 0.5, 8), P.gold, at(M(0, -0.25, 0.1, Math.PI)));
      break;
    case 'ram':
      // a bronze ram's spike, low at the cutwater
      b.add(new THREE.ConeGeometry(0.35, 2.4, 8), P.bronze, at(M(0, -0.7, 0.6, Math.PI / 2 + 0.3)));
      b.add(new THREE.TorusGeometry(0.34, 0.06, 6, 14), P.gold, at(M(0, -0.85, 0.05, 0.3)));
      break;
    case 'sun':
      // a rayed sun disc facing ahead
      b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 18), P.gold, at(M(0, 0.4, 0.2, Math.PI / 2)));
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.add(new THREE.ConeGeometry(0.08, 0.4, 4), P.gold, at(M(Math.sin(a) * 0.6, 0.4 + Math.cos(a) * 0.6, 0.2, 0, 0, -a)));
      }
      break;
    case 'none':
      b.add(new THREE.SphereGeometry(0.12, 8, 6), P.gold, at(M(0, -0.2, -0.3)));
      break;
  }
  return b.build();
}

// ---------------------------------------------------------------- sails

/**
 * The cloth: three lateens and their yards (which swing round their masts), the masthead pennants and the ensign.
 * uv runs tack (0) to leech (1) and foot (0) to yard (1); aPlane is the flat sail about its middle, in sail widths;
 * aRig is the mast it swings round, its size, and its share of the swing.
 */
function sailGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], kind: number[] = [], plane: number[] = [], rig: number[] = [], idx: number[] = [];
  const grid = (k: number, at: (u: number, v: number) => THREE.Vector3, nu: number, nv: number, r: [number, number, number], flat: (p: THREE.Vector3, u: number, v: number) => [number, number]) => {
    const base = pos.length / 3;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = at(u, v);
      pos.push(p.x, p.y, p.z); uv.push(u, v); kind.push(k); plane.push(...flat(p, u, v)); rig.push(...r);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  };
  for (const m of MASTS) {
    const { T, P: Pk, C } = lateen(m), z = mastZ(m), size = m.yard * 0.5;
    const cz = (T.x + Pk.x + C.x) / 3, cy = (T.y + Pk.y + C.y) / 3;
    const at = (a: THREE.Vector2) => new V3(0, a.y, a.x);
    // the sail: hung from the yard, its foot from the tack to the clew
    grid(0, (u, v) => at(T.clone().lerp(C, u).lerp(T.clone().lerp(Pk, u), v)), 12, 10, [z, size, m.swing], (p) => [(p.z - cz) / size, (p.y - cy) / size]);
    // the yard, tapering from the slings to either end
    const y0 = at(T).add(at(T).sub(at(Pk)).setLength(0.5)), y1 = at(Pk).add(at(Pk).sub(at(T)).setLength(0.35));
    const ax = y1.clone().sub(y0), n1 = new V3(1, 0, 0), n2 = ax.clone().cross(n1).normalize();
    grid(1, (u, v) => {
      const r = 0.07 + 0.11 * Math.sin(Math.PI * clamp((u - 0.02) / 0.96, 0, 1)) ** 0.6, a = v * Math.PI * 2;
      return y0.clone().addScaledVector(ax, u).addScaledVector(n1, Math.cos(a) * r).addScaledVector(n2, Math.sin(a) * r);
    }, 10, 6, [z, 0, m.swing], () => [0, 0]);
    // a pennant streaming from the masthead
    const top = mastTop(m), len = m.h > 15 ? 6.5 : 4.2, w = m.h > 15 ? 0.6 : 0.45;
    grid(2, (u, v) => new V3(0, top - 0.25 - v * w * (1 - u * 0.85), z - 0.1 - u * len), 16, 2, [z, 1, 0], (_, u, v) => [u * 2 - 1, v - 0.5]);
  }
  // the ensign, flown from the staff over the stern
  const fy = STERN_Y + 2.75, fz = STERN_Z - 0.4;
  grid(3, (u, v) => new V3(0, fy - v * 1.5, fz - u * 2.4), 14, 6, [fz, 0.8, 0], (_, u, v) => [(u - 0.5) * 3, (0.5 - v) * 1.875]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aPlane', new THREE.Float32BufferAttribute(plane, 2));
  g.setAttribute('aRig', new THREE.Float32BufferAttribute(rig, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

const SAIL_VERT_HEAD = /* glsl */ `
attribute float aKind;
attribute vec2 aPlane;
attribute vec3 aRig;
uniform float uFill, uSide, uBoom, uLuff, uFlag;
${sharedUniforms('float', 'uTime')}
varying vec2 vSailUv;
varying vec2 vPlane;
varying float vKind;
varying float vSize;
varying vec2 vNdc;
varying vec3 vSailW;
`;
const SAIL_VERT = /* glsl */ `
vSailUv = uv;
vPlane = aPlane;
vKind = aKind;
vSize = aRig.y;
float u = uv.x, v = uv.y;
if (aKind < 1.5) {
  // a lateen (0) or its yard (1): hung on the lee side of the mast, the cloth bellying out between yard and foot and
  // flogging when she is slow, the whole swinging round the mast with the sheet
  float belly = aKind < 0.5 ? sin(3.14159 * v) * (0.3 + 0.7 * sin(3.14159 * pow(u, 0.75))) * aRig.y * 0.13 : 0.0;
  float flog = aKind < 0.5 ? sin(uTime * 9.0 + u * 9.0 + v * 4.0) * 0.16 * u * (1.0 - v) * uLuff : 0.0;
  transformed.x += uSide * (0.38 + belly * uFill) + flog;
  float a = uBoom * aRig.z, c = cos(a), s = sin(a);
  vec2 rz = vec2(transformed.x, transformed.z - aRig.x);
  transformed.x = rz.x * c + rz.y * s;
  transformed.z = -rz.x * s + rz.y * c + aRig.x;
} else {
  // the pennants (2) and the ensign (3) stream down the wind that she feels, swung round their staffs
  float w = aKind < 2.5
    ? sin(uTime * 7.0 - u * 7.0) * 0.35 * u + sin(uTime * 11.0 - u * 13.0) * 0.12 * u
    : sin(uTime * 5.5 - u * 5.0) * 0.3 * u + sin(uTime * 9.0 - u * 9.0 + v * 2.0) * 0.08 * u;
  transformed.x += w;
  transformed.y -= u * u * (aKind < 2.5 ? 0.4 : 0.25);
  float c = cos(uFlag), s = sin(uFlag);
  vec2 rz = vec2(transformed.x, transformed.z - aRig.x);
  transformed.x = rz.x * c + rz.y * s;
  transformed.z = -rz.x * s + rz.y * c + aRig.x;
}
`;

/** The cloth's normals turned with it: the lateens round their masts, the flags round their staffs. */
const SAIL_NORMAL = /* glsl */ `
{
  float a = aKind < 1.5 ? uBoom * aRig.z : uFlag, c = cos(a), s = sin(a);
  objectNormal = vec3(objectNormal.x * c + objectNormal.z * s, objectNormal.y, -objectNormal.x * s + objectNormal.z * c);
}
`;

const SAIL_FRAG_HEAD = /* glsl */ `
uniform sampler2D uLinen, uSailNoise, uEmblemAtlas;
uniform vec3 uSailA, uSailB, uTrimC;
uniform vec4 uEmblemRect;
uniform float uPattern, uEmblem, uDamage, uFade;
varying vec2 vSailUv;
varying vec2 vPlane;
varying float vKind;
varying float vSize;
varying vec2 vNdc;
varying vec3 vSailW;
const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
// the emblem's roundel: r the field, g the charge, b the ink
vec3 emblemAt(vec2 p) {
  vec2 q = p / 0.3 * 0.5 + 0.5;
  if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) return vec3(0.0);
  return texture2D(uEmblemAtlas, uEmblemRect.xy + q * uEmblemRect.zw).rgb;
}
`;
const SAIL_FRAG = /* glsl */ `
vec2 su = vSailUv, sp = vPlane;
float k = vKind;
vec3 sc;
if (k > 0.5 && k < 1.5) {
  // the yards: oiled spars
  sc = vec3(0.13, 0.085, 0.05) * (0.8 + 0.4 * texture2D(uLinen, su * vec2(6.0, 1.0)).r);
} else {
  vec3 lin = texture2D(uLinen, sp * vSize * 0.3).rgb;
  vec3 base = k > 1.5 ? uSailB : uSailA;
  float m = sp.y * vSize;
  if (k < 0.5) {
    if (uPattern > 0.5 && uPattern < 1.5) base = mod(floor(m / 2.4 + 0.5), 2.0) < 0.5 ? uSailA : uSailB;
    else if (uPattern > 1.5 && uPattern < 2.5) base = su.x > 0.8 || su.y < 0.1 ? uSailB : uSailA;
    else if (uPattern > 2.5 && uPattern < 3.5) base = abs(sp.x) < 0.14 ? uSailB : uSailA;
    else if (uPattern > 3.5 && uPattern < 4.5) base = (sp.x > 0.0) == (sp.y > 0.0) ? uSailB : uSailA;
    else if (uPattern > 4.5) base = mod(floor((sp.y - abs(sp.x) * 0.8) * vSize / 2.2), 2.0) < 0.5 ? uSailA : uSailB;
  }
  sc = base * (0.62 + 0.55 * lin);
  // the emblem, on the lateens and the ensign: its roundel in the trim, the charge in the second colour, inked
  if ((k < 0.5 || k > 2.5) && uEmblem > -0.5) {
    vec2 ep = (sp - vec2(0.0, k < 0.5 ? 0.12 : 0.0)) * (k < 0.5 ? 1.0 : 0.62);
    vec3 e = emblemAt(ep);
    vec3 field = mix(uTrimC, base, 0.35) * (0.7 + 0.4 * lin);
    vec3 charge = (k < 0.5 ? uSailB : uSailA) * (0.7 + 0.4 * lin);
    if (dot(charge - field, charge - field) < 0.02) charge = vec3(0.08);
    sc = mix(sc, field, e.r * 0.92);
    sc = mix(sc, charge, e.g);
    sc = mix(sc, vec3(0.05, 0.04, 0.035), e.b * 0.85);
  }
  // the cloths' seams run down the sail; bolt-ropes round the edges
  if (k < 0.5) sc *= 1.0 - 0.13 * smoothstep(0.05, 0.0, abs(fract(sp.x * vSize / 0.95) - 0.5) - 0.44);
  float hem = k < 0.5 ? min(min(su.y, 1.0 - su.y) * 6.0, 1.0 - su.x) : min(min(su.x, 1.0 - su.x), min(su.y, 1.0 - su.y));
  sc *= mix(0.68, 1.0, smoothstep(0.0, 0.03, hem));
}
// shot through: holes grow with damage, their edges scorched
float hn = texture2D(uSailNoise, sp * vec2(0.7, 1.1) + vKind * 0.37).r;
float cut = (k > 0.5 && k < 1.5) ? -1.0 : uDamage * 0.62 - 0.05;
if (hn < cut) discard;
sc *= mix(1.0, 0.25, smoothstep(cut + 0.06, cut, hn) * step(0.0, cut));
// the player's own sail thins where it would hide the way ahead
// (round the crosshair only, so the rest of the rig stays solid)
if (uFade > 0.0) {
  ivec2 fc = ivec2(mod(gl_FragCoord.xy, 4.0));
  float f = uFade * (1.0 - smoothstep(0.16, 0.5, length(vNdc * vec2(1.0, 0.75))));
  if ((BAYER[fc.x + fc.y * 4] + 0.5) / 16.0 < f) discard;
}
diffuseColor.rgb = sc;
`;

// ---------------------------------------------------------------- turrets

/** Each turret: a swivel base and a barrel that pitches; `muzzle` is the barrel's tip in barrel space. */
export function turretGeometry(kind: Weapon): { base: THREE.BufferGeometry; barrel: THREE.BufferGeometry; pivot: number; muzzle: number } {
  const base = new Builder(), barrel = new Builder();
  base.add(new THREE.CylinderGeometry(0.95, 1.1, 0.35, 16), P.iron, M(0, 0.17, 0));
  base.add(new THREE.CylinderGeometry(0.98, 0.98, 0.08, 16), P.gold, M(0, 0.36, 0));
  const lathe = (profile: [number, number][], part: number, m: THREE.Matrix4) =>
    barrel.add(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 16), part, m, (u, v) => [u, v]);
  const along = M(0, 0, 0, Math.PI / 2); // lathe y onto +z
  let pivot = 1.0, muzzle = 3;
  switch (kind) {
    case 'cannon': {
      base.add(new THREE.BoxGeometry(0.24, 1.0, 1.2), P.wood, M(-0.5, 0.85, 0));
      base.add(new THREE.BoxGeometry(0.24, 1.0, 1.2), P.wood, M(0.5, 0.85, 0));
      lathe([[0.001, -0.95], [0.2, -0.95], [0.3, -0.8], [0.34, -0.5], [0.3, 0.2], [0.26, 1.6], [0.24, 2.45], [0.32, 2.55], [0.34, 2.75], [0.22, 2.8], [0.18, 2.5]], P.bronze, along);
      for (const z of [-0.6, 0.3, 1.5]) barrel.add(new THREE.TorusGeometry(0.31, 0.05, 6, 16), P.gold, M(0, 0, z));
      barrel.add(new THREE.SphereGeometry(0.17, 10, 8), P.bronze, M(0, 0, -1.05));
      pivot = 1.05; muzzle = 2.8;
      break;
    }
    case 'scatter': {
      base.add(new THREE.BoxGeometry(1.1, 0.7, 0.9), P.wood, M(0, 0.7, -0.1));
      lathe([[0.001, -0.7], [0.3, -0.7], [0.36, -0.4], [0.28, 0.4], [0.32, 1.1], [0.5, 1.55], [0.66, 1.75], [0.5, 1.72], [0.36, 1.4]], P.bronze, along);
      barrel.add(new THREE.TorusGeometry(0.66, 0.06, 6, 20), P.gold, M(0, 0, 1.74));
      pivot = 1.0; muzzle = 1.75;
      break;
    }
    case 'harpoon': {
      base.add(new THREE.BoxGeometry(0.5, 0.9, 0.6), P.wood, M(0, 0.75, 0));
      barrel.add(new THREE.BoxGeometry(0.34, 0.26, 3.0), P.wood, M(0, 0, 0.6));
      for (const side of [-1, 1]) {
        const arc = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 1.7), new THREE.Vector3(side * 0.9, 0, 1.75), new THREE.Vector3(side * 1.6, 0, 1.3)]);
        barrel.add(new THREE.TubeGeometry(arc, 10, 0.07, 6, false), P.iron);
        rod(barrel, new THREE.Vector3(side * 1.6, 0.03, 1.3), new THREE.Vector3(0, 0.03, -0.4), 0.015, 0.015, P.rope, 3);
      }
      rod(barrel, new THREE.Vector3(0, 0.2, -0.6), new THREE.Vector3(0, 0.2, 2.6), 0.06, 0.06, P.iron, 6);
      barrel.add(new THREE.ConeGeometry(0.16, 0.6, 6), P.gold, M(0, 0.2, 2.9, Math.PI / 2));
      pivot = 1.15; muzzle = 3.2;
      break;
    }
    case 'mortar': {
      base.add(new THREE.CylinderGeometry(0.85, 0.95, 0.6, 12), P.iron, M(0, 0.55, 0));
      lathe([[0.001, -0.6], [0.5, -0.6], [0.62, -0.3], [0.6, 0.6], [0.7, 0.8], [0.72, 0.95], [0.5, 0.95], [0.46, 0.6]], P.bronze, along);
      barrel.add(new THREE.TorusGeometry(0.64, 0.07, 6, 18), P.gold, M(0, 0, 0.25));
      pivot = 1.1; muzzle = 0.95;
      break;
    }
    case 'repeater': {
      base.add(new THREE.BoxGeometry(0.9, 0.8, 1.0), P.iron, M(0, 0.75, 0));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        rod(barrel, new THREE.Vector3(Math.cos(a) * 0.22, Math.sin(a) * 0.22, -0.4), new THREE.Vector3(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 2.3), 0.075, 0.065, P.bronze, 8);
      }
      for (const z of [0.1, 1.2, 2.1]) barrel.add(new THREE.TorusGeometry(0.3, 0.05, 6, 16), P.gold, M(0, 0, z));
      barrel.add(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 12), P.iron, M(0, 0, -0.6, Math.PI / 2));
      pivot = 1.05; muzzle = 2.3;
      break;
    }
    case 'broadside': {
      // the guns are in the ports; the ring carries a gilt sighting post (and the loot token is a short gun)
      base.add(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 8), P.wood, M(0, 0.9, 0));
      base.add(new THREE.SphereGeometry(0.2, 10, 8), P.gold, M(0, 1.65, 0));
      lathe([[0.001, -0.5], [0.22, -0.5], [0.26, -0.3], [0.2, 0.6], [0.18, 1.1], [0.24, 1.15], [0.24, 1.3], [0.12, 1.3]], P.bronze, along);
      pivot = 0.4; muzzle = 1.3;
      break;
    }
  }
  return { base: base.build(), barrel: barrel.build(), pivot, muzzle };
}

// ---------------------------------------------------------------- materials

const BODY_HEAD = /* glsl */ `
uniform vec3 uHull, uAccent, uTrim, uWisp;
uniform float uHit, uDamage;
${sharedUniforms('float', 'uNight', 'uTime')}
uniform sampler2D uDeckMap, uDeckN, uDmgNoise;
varying float vPart;
varying float vAux;
varying vec3 vLP;
float bPart; float bRough; float bMetal; float bNs;
`;
const BODY_MAP = /* glsl */ `
bPart = floor(vPart + 0.5);
vec3 wood = texture2D(map, vMapUv).rgb;
float lum = dot(wood, vec3(0.3, 0.55, 0.15));
vec3 col = wood; bRough = 0.75; bMetal = 0.0; bNs = 1.0;
vec3 emit = vec3(0.0);
if (bPart < 0.5 || bPart == 2.0 || bPart == 6.0) {
  // lacquer over planks: the grain shows through the gloss
  vec3 lac = bPart == 6.0 ? uAccent : uHull;
  col = lac * (0.55 + 1.3 * lum);
  bRough = 0.32 + lum * 0.3;
  if (bPart == 2.0) { col *= 0.7; bRough = 0.6; }
  if (bPart < 0.5) {
    // vAux is the height over the main deck's line, so the paint follows the sheer
    float h = vAux, wl = vLP.y;
    // the gun deck's band between the wales, in the accent
    float band = smoothstep(-0.36, -0.33, h) * (1.0 - smoothstep(0.86, 0.89, h));
    col = mix(col, uAccent * (0.55 + 1.3 * lum), band);
    // the castles' sides: a gilt lattice over the lacquer
    float q = vLP.z + vLP.x;
    vec2 dl = fract(vec2(q + h * 1.3, q - h * 1.3) * 0.5) - 0.5;
    float gold = smoothstep(0.98, 1.04, h) * smoothstep(0.035, 0.0, min(abs(dl.x), abs(dl.y))) * 0.85;
    // gilt mouldings: one under the band, one at the water
    gold += smoothstep(0.035, 0.0, abs(h + 0.5)) + smoothstep(0.045, 0.0, abs(wl - ${(WL + 0.05).toFixed(2)}));
    col = mix(col, uTrim, clamp(gold, 0.0, 1.0));
    bMetal = clamp(gold, 0.0, 1.0) * 0.9;
    // below the water: dark copper sheathing
    float bottom = smoothstep(${(WL - 0.02).toFixed(2)}, ${(WL - 0.06).toFixed(2)}, wl);
    col = mix(col, vec3(0.13, 0.17, 0.15) * (0.5 + lum), bottom);
    bRough = mix(bRough, 0.55, bottom);
  }
} else if (bPart == 1.0) { col = uTrim; bMetal = 0.95; bRough = 0.28; bNs = 0.0; }
else if (bPart == 3.0) { col = texture2D(uDeckMap, vMapUv).rgb * vec3(1.05, 0.95, 0.85); bRough = 0.7; }
else if (bPart == 7.0) { col = wood * vec3(0.55, 0.45, 0.38); bRough = 0.8; }
else if (bPart == 8.0) { col = vec3(0.16, 0.12, 0.09); bRough = 0.95; bNs = 0.0; }
else if (bPart == 9.0) { col = vec3(0.045, 0.035, 0.03) * (0.6 + lum); bRough = 0.45; }
else if (bPart == 14.0) {
  // windows, lit by the wisp and a warmer lamp behind
  col = vec3(0.02); bRough = 0.15; bNs = 0.0;
  float flick = 0.9 + 0.1 * sin(uTime * 5.0 + vLP.x * 4.0 + vLP.z);
  emit += (uWisp * (0.45 + 2.2 * uNight) + vec3(1.0, 0.55, 0.22) * (0.2 + 0.9 * uNight)) * flick;
}
else if (bPart == 11.0) {
  col = uWisp * 0.4; bRough = 0.6; bNs = 0.0;
  float flick = 0.85 + 0.15 * sin(uTime * 7.0 + vLP.y * 3.0) * sin(uTime * 3.1);
  emit += uWisp * (1.6 + 3.0 * uNight) * flick;
}
else if (bPart == 12.0) { col = vec3(0.62, 0.42, 0.22) * (0.8 + 0.4 * lum); bMetal = 1.0; bRough = 0.32; bNs = 0.3; }
else if (bPart == 13.0) { col = vec3(0.08, 0.085, 0.09); bMetal = 0.7; bRough = 0.45; bNs = 0.3; }
// scorched where she has been hurt, embers in the worst of it
if (uDamage > 0.0 && bPart != 11.0) {
  float dn = texture2D(uDmgNoise, vLP.xz * 0.11 + vLP.y * 0.07).r * 0.7 + texture2D(uDmgNoise, vLP.zy * 0.3).g * 0.3;
  float ch = smoothstep(1.02 - uDamage * 0.75, 1.1 - uDamage * 0.75, dn);
  col *= 1.0 - ch * 0.82;
  bRough = mix(bRough, 0.95, ch);
  emit += vec3(1.0, 0.32, 0.06) * pow(ch, 6.0) * uDamage * (1.5 + sin(uTime * 5.0 + dn * 20.0));
}
emit += vec3(1.0, 0.9, 0.8) * uHit * 0.8;
diffuseColor.rgb = col;
totalEmissiveRadiance += emit;
`;


interface Uniforms { [k: string]: THREE.IUniform }

/** Ragged holes for shot-through sails, from the shared noise. */
function sailNoise(noise: THREE.DataTexture): THREE.DataTexture {
  const N = 128, data = new Uint8Array(N * N * 4), src = noise.image.data as Uint8Array;
  for (let i = 0; i < N * N; i++) {
    const x = i % N, y = Math.floor(i / N);
    let v = 0;
    for (let k = 0; k < 6; k++) {
      const cx = ((Math.sin(k * 12.9898) * 43758.5453) % 1 + 1) % 1 * N, cy = ((Math.sin(k * 78.233) * 12345.678) % 1 + 1) % 1 * N;
      const d = Math.hypot(((x - cx + N * 1.5) % N) - N / 2, ((y - cy + N * 1.5) % N) - N / 2) / (N * 0.18);
      v = Math.max(v, 1 - d);
    }
    const n = src[((y * 2) % 256) * 256 * 4 + ((x * 2) % 256) * 4 + 3] / 255;
    data[i * 4] = Math.max(0, Math.min(255, (1 - v * 0.8 - n * 0.35 + 0.15) * 255));
    data[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Everything the fleet shares: the geometry, built once, and the textures. */
export class Kit {
  readonly hull = hullGeometry(true);
  readonly hullFar = hullGeometry(false);
  readonly sails = sailGeometry();
  readonly turrets = new Map<Weapon, ReturnType<typeof turretGeometry>>();
  private readonly heads = new Map<Figurehead, THREE.BufferGeometry>();
  envMap: THREE.Texture | null = null;
  readonly tex: ActorTextures;
  readonly sailNoise: THREE.Texture;
  private readonly emblems = new Map<string, THREE.DataTexture>();
  constructor(tex: ActorTextures) {
    this.tex = tex;
    this.sailNoise = sailNoise(tex.noise);
    for (const k of WEAPONS) this.turrets.set(k, turretGeometry(k));
  }
  figurehead(kind: Figurehead): THREE.BufferGeometry {
    let g = this.heads.get(kind);
    if (!g) this.heads.set(kind, (g = figureheadGeometry(kind)));
    return g;
  }
  /** One emblem's roundel from the cosmetics library (r the field, g the charge, b the ink), drawn when first worn. */
  emblem(id: string): THREE.DataTexture {
    let t = this.emblems.get(id);
    if (!t) {
      const N = 128;
      t = new THREE.DataTexture(emblemRoundel(id, N), N, N, THREE.RGBAFormat);
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 4;
      t.needsUpdate = true;
      this.emblems.set(id, t);
    }
    return t;
  }
  bodyMaterial(u: Uniforms): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ map: this.tex.hull_d, normalMap: this.tex.hull_n, roughness: 0.7, metalness: 0, envMap: this.envMap, envMapIntensity: 1 });
    m.normalScale.set(0.8, 0.8);
    return patch(m, 'actor-ship-body', (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aAux;\nvarying float vPart;\nvarying float vAux;\nvarying vec3 vLP;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPart = aPart;\nvAux = aAux;\nvLP = position;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\n' + BODY_HEAD)
        .replace('#include <map_fragment>', BODY_MAP)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = bRough;')
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = bMetal;')
        .replace('#include <normal_fragment_maps>', /* glsl */ `
          vec3 mapN = (bPart == 3.0 ? texture2D(uDeckN, vNormalMapUv).xyz : texture2D(normalMap, vNormalMapUv).xyz) * 2.0 - 1.0;
          mapN.xy *= normalScale * bNs;
          normal = normalize(tbn * mapN);`);
    });
  }
  sailMaterial(u: Uniforms): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, side: THREE.DoubleSide, envMap: this.envMap, envMapIntensity: 0.4 });
    return patch(m, 'actor-ship-sail', (s) => {
      Object.assign(s.uniforms, u);
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\n' + SAIL_VERT_HEAD)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + SAIL_NORMAL)
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SAIL_VERT)
        .replace('#include <project_vertex>', '#include <project_vertex>\nvNdc = gl_Position.xy / gl_Position.w;\nvSailW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\n' + SAIL_FRAG_HEAD + '\nuniform vec3 uSunColor;\n' + sharedUniforms('vec3', 'uSunDir'))
        .replace('#include <map_fragment>', SAIL_FRAG)
        .replace('#include <opaque_fragment>', /* glsl */ `
          // light through the cloth
          vec3 vd = normalize(vSailW - cameraPosition);
          outgoingLight += diffuseColor.rgb * uSunColor * pow(max(dot(vd, uSunDir), 0.0), 2.0) * 0.55;
          #include <opaque_fragment>`);
    });
  }
}

// ---------------------------------------------------------------- one ship

/** The ship's state in her own frame, worked out by the fleet from the view and the sphere. */
export interface Pose {
  speed: number;
  turn: number; // radians per second, positive to port
  aimYaw: number; // the turret's bearing off the bow, positive to port
  aimPitch: number; // barrel elevation, radians
  hp: number; // 0..1
  sink: number; // 0 afloat .. 1 gone
  boost: number; // 0..1, the gust
  hit: number; // flash, decays
  alt: number; // height above the sea: the Gale, the glide, the gust's hop
  dive: number; // 0 level .. 1 nose down, falling fast
  wind: number; // the way the wind blows, as an angle off her bow (0 from dead astern)
  windSpeed: number; // m/s
  night: number; // 0 day .. 1 night, where she is
  flip: number; // extra roll, radians: tossed over by the breach
}

/** The great spirit lantern over the taffrail, in ship space: where its glow is drawn. */
export const LANTERN = new V3(0, STERN_Y + 0.6 + 0.85, STERN_Z - 0.05 - 0.35);
/** The wisp that rides the main truck at night, in ship space: high enough to show as far off as her masts do. */
export const MASTHEAD = new V3(0, mastTop(MASTS[1]) + 0.3, mastZ(MASTS[1]));

/** The broadside's gun muzzles in ship space, four a side (x > 0 port, x < 0 starboard), and the way each points. */
export const GUNPORTS: { pos: THREE.Vector3; dir: THREE.Vector3 }[] = [];
for (const side of [1, -1]) for (const s of [0.36, 0.47, 0.58, 0.69]) {
  const y = mainDeck(s) + 0.3, n = hullNormal(s, y, side);
  GUNPORTS.push({ pos: onSkin(s, y, side).addScaledVector(n, 0.6), dir: n.setY(0).normalize() });
}

export class ShipModel {
  readonly root = new THREE.Group();
  readonly body = new THREE.Group();
  readonly turret = new THREE.Group();
  readonly barrel = new THREE.Group();
  readonly u: Uniforms;
  weapon: Weapon = 'cannon';
  look: Look;
  private readonly hull: THREE.Mesh;
  private readonly head: THREE.Mesh;
  private readonly turretBase: THREE.Mesh;
  private readonly barrelMesh: THREE.Mesh;
  private readonly mats: THREE.Material[];
  private muzzleZ = 3;
  private readonly kit: Kit;
  private bob = { y: 0, pitch: 0, roll: 0, heel: 0 };
  private spin = 0;
  recoil = 0;
  boom = 0;
  private lee = 1;
  /** The player's own sail thins round the crosshair, 0..1. */
  fade = 0;

  constructor(kit: Kit, look: Look) {
    this.kit = kit;
    this.look = look;
    this.u = {
      uHull: { value: new THREE.Color(look.hull) }, uAccent: { value: new THREE.Color(look.accent) }, uTrim: { value: new THREE.Color(look.trim) },
      uWisp: { value: new THREE.Color(look.wisp) }, uHit: { value: 0 }, uDamage: { value: 0 }, uNight: { value: 0 },
      uDeckMap: { value: kit.tex.deck_d }, uDeckN: { value: kit.tex.deck_n }, uDmgNoise: { value: kit.tex.noise },
      uSailA: { value: new THREE.Color(look.sail) }, uSailB: { value: new THREE.Color(look.sail2) }, uTrimC: { value: new THREE.Color(look.trim) },
      uPattern: { value: look.pattern }, uEmblem: { value: look.emblem ? 0 : -1 }, uEmblemAtlas: { value: kit.emblem(look.emblem ?? 'gull') }, uEmblemRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uLinen: { value: kit.tex.linen_d }, uSailNoise: { value: kit.sailNoise },
      uFill: { value: 0.6 }, uSide: { value: 1 }, uBoom: { value: 0 }, uLuff: { value: 0 }, uFlag: { value: 0 }, uFade: { value: 0 },
    };
    const body = kit.bodyMaterial(this.u), sail = kit.sailMaterial(this.u);
    const hull = this.hull = new THREE.Mesh(kit.hull, body);
    hull.castShadow = hull.receiveShadow = true;
    this.head = new THREE.Mesh(kit.figurehead(look.figurehead), body);
    this.head.castShadow = true;
    const sails = new THREE.Mesh(kit.sails, sail);
    sails.castShadow = true;
    sails.receiveShadow = true;
    const depth = patch(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide }), 'actor-ship-sail-depth', (s) => {
      Object.assign(s.uniforms, this.u);
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\n' + SAIL_VERT_HEAD).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SAIL_VERT);
    });
    sails.customDepthMaterial = depth;
    this.mats = [body, sail, depth];
    this.turretBase = new THREE.Mesh(undefined, body);
    this.barrelMesh = new THREE.Mesh(undefined, body);
    this.turretBase.castShadow = this.barrelMesh.castShadow = true;
    this.turret.add(this.turretBase, this.barrel);
    this.barrel.add(this.barrelMesh);
    this.turret.position.set(0, deckHeight(SHIP.turretZ), SHIP.turretZ);
    this.body.add(hull, this.head, sails, this.turret);
    this.root.add(this.body);
    this.root.matrixAutoUpdate = false;
    this.setLook(look);
    this.setWeapon('cannon');
  }

  setLook(look: Look): void {
    const u = this.u;
    this.look = look;
    u.uHull.value.setHex(look.hull); u.uAccent.value.setHex(look.accent); u.uTrim.value.setHex(look.trim); u.uTrimC.value.setHex(look.trim);
    u.uWisp.value.setHex(look.wisp); u.uSailA.value.setHex(look.sail); u.uSailB.value.setHex(look.sail2);
    u.uPattern.value = look.pattern;
    u.uEmblem.value = look.emblem ? 0 : -1;
    if (look.emblem) u.uEmblemAtlas.value = this.kit.emblem(look.emblem);
    this.head.geometry = this.kit.figurehead(look.figurehead);
  }

  /** Far from the camera, the lighter cut of the hull. */
  set far(on: boolean) {
    this.hull.geometry = on ? this.kit.hullFar : this.kit.hull;
  }

  setWeapon(kind: Weapon): void {
    this.weapon = kind;
    const t = this.kit.turrets.get(kind)!;
    this.turretBase.geometry = t.base;
    this.barrelMesh.geometry = t.barrel;
    this.barrelMesh.visible = kind !== 'broadside';
    this.barrel.position.set(0, t.pivot, 0);
    this.muzzleZ = t.muzzle;
  }

  /** The muzzle in world space, and the direction it points. */
  muzzle(pos: THREE.Vector3, dir?: THREE.Vector3): THREE.Vector3 {
    this.barrel.updateWorldMatrix(true, false);
    pos.set(0, 0, this.muzzleZ).applyMatrix4(this.barrel.matrixWorld);
    if (dir) dir.set(0, 0, 1).transformDirection(this.barrel.matrixWorld);
    return pos;
  }

  /** A point given in ship space, in world space (riding with the hull's roll and pitch). */
  toWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.body.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(this.body.matrixWorld);
  }

  /** A direction given in ship space, in world space. */
  dirToWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    this.body.updateWorldMatrix(true, false);
    return out.copy(local).transformDirection(this.body.matrixWorld);
  }

  /**
   * One frame. `height(lx, lz)` is the sea's height over its mean at a point given in the ship's frame, so she rides
   * the swell under bow, stern and both rails.
   */
  update(p: Pose, t: number, dt: number, height: (lx: number, lz: number) => number): void {
    const b = this.bob;
    const k = Math.min(1, dt * 4);
    if (p.alt > 3) {
      // aloft: the sail is a wing; bank into turns, nose down in a dive
      b.y += (p.alt + Math.sin(t * 1.3) * 0.4 - b.y) * k;
      b.pitch += (0.08 + p.dive * 0.35 + Math.sin(t * 0.9) * 0.03 - b.pitch) * k;
      b.roll += (Math.sin(t * 0.7) * 0.05 - b.roll) * k;
      b.heel += (-p.turn * 0.4 - b.heel) * Math.min(1, dt * 2.5);
    } else {
      // ride the swell: sample under bow, stern and both rails
      const hb = height(0, 6), hs = height(0, -6), hp = height(2.2, 0), hst = height(-2.2, 0);
      b.y += ((hb + hs + hp + hst) / 4 + p.alt - b.y) * Math.min(1, dt * (p.alt > 0.05 ? 12 : 4));
      b.pitch += (-Math.atan2(hb - hs, 12) * 0.9 - p.speed * 0.004 - (p.alt > 0.2 ? 0.12 : 0) - b.pitch) * k;
      b.roll += (Math.atan2(hp - hst, 4.4) * 0.8 - b.roll) * k;
      b.heel += (p.turn * Math.min(1, p.speed / 14) * 0.35 - b.heel) * Math.min(1, dt * 2.5);
    }
    // sinking: down by the stern, rolling over
    const s = p.sink;
    this.body.position.y = b.y - s * s * 9 - s * 0.6;
    this.body.rotation.set(b.pitch - s * 0.32, 0, b.roll + b.heel + s * 0.55 + p.flip, 'YXZ');
    // the yards hang on the lee side and are sheeted to the wind: eased right out running before it, hauled in close
    // as she points up, until head to wind the cloth lifts and shakes. Bringing the wind across the stern gybes them.
    const off = Math.abs(p.wind), aloft = p.alt > 3;
    if (Math.sin(p.wind) * this.lee < -0.2) this.lee = -this.lee;
    // (your own, seen from the chase camera, is kept sheeted closer so the cloth stays edge-on and out of the view)
    const sheet = (0.6 - 0.42 * THREE.MathUtils.smoothstep(off, 0.5, 2.7)) * (this.fade > 0 ? 0.45 : 1);
    const want = aloft ? 0.15 * this.lee : -this.lee * sheet - p.turn * 0.15 + Math.sin(t * 0.3) * 0.04;
    this.boom += (want - this.boom) * Math.min(1, dt * 1.4);
    const u = this.u;
    u.uBoom.value = this.boom;
    u.uSide.value += ((this.boom >= 0 ? -1 : 1) - u.uSide.value) * Math.min(1, dt * 3);
    // the cloth fills with the wind's strength and her way, and slats in irons or a calm
    const irons = aloft ? 0 : THREE.MathUtils.smoothstep(off, 2.55, 3.0);
    const strength = THREE.MathUtils.clamp(p.windSpeed / 10, 0.2, 1.3);
    const fill = aloft ? 1.25 : THREE.MathUtils.clamp(0.15 + p.speed / 20 + strength * 0.55, 0.2, 1.25) * (1 - irons * 0.6) + p.boost * 0.35;
    u.uFill.value += (fill - u.uFill.value) * Math.min(1, dt * 2);
    u.uLuff.value = aloft ? 0 : Math.max(THREE.MathUtils.clamp(1 - p.windSpeed / 3, 0, 1) * 0.8, irons * 0.8, THREE.MathUtils.clamp(1 - p.speed / 4, 0, 1) * 0.4);
    // the flags: the true wind less her own way through the water
    const ax = Math.sin(p.wind) * p.windSpeed, az = Math.cos(p.wind) * p.windSpeed - (aloft ? 20 : p.speed);
    const flag = Math.atan2(ax, az) - Math.PI;
    u.uFlag.value += Math.atan2(Math.sin(flag - u.uFlag.value), Math.cos(flag - u.uFlag.value)) * Math.min(1, dt * 3);
    u.uDamage.value = THREE.MathUtils.clamp((1 - p.hp) * 1.15 - 0.1, 0, 1) + s * 0.3;
    u.uHit.value = p.hit;
    u.uNight.value = p.night;
    u.uFade.value = this.fade;
    // the turret: yaw relative to the hull, then elevation; the repeater's barrels spin
    let dy = p.aimYaw - this.turret.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.turret.rotation.y += dy * Math.min(1, dt * 14);
    this.barrel.rotation.x = -p.aimPitch;
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.barrelMesh.position.z = -this.recoil * 0.5;
    if (this.weapon === 'repeater') {
      this.spin += dt * (2 + this.recoil * 40);
      this.barrelMesh.rotation.z = this.spin;
    } else this.barrelMesh.rotation.z = 0;
  }

  dispose(): void {
    for (const m of this.mats) m.dispose();
  }
}
