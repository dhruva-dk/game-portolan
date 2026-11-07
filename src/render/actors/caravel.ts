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
import { type ActorTextures } from './common.ts';
import { hullNodeMaterial, iceNodeMaterial, ropeNodeMaterial, sailNodeMaterial } from './tsl/caravel.ts';
import { drawnUniforms } from './tsl/kit.ts';
import { Cloth, ropeGeometry, type ClothGrid, type ClothRope } from './cloth.ts';
import type { Figurehead, Look } from './cosmetics.ts';
import { WEAPONS, type Weapon } from './view.ts';

// ---------------------------------------------------------------- the hull's lines

/** s runs from the stern (0) to the bow (1); heights are over the hull's origin, the waterline a little above it. */
/** The waterline over the keel, in ship space. */
export const WL = 0.3;

export const SHIP = { length: 18, beam: 5.4, radius: 5.2, turretZ: 2.6, perch: new THREE.Vector3() };
const L = SHIP.length, B = SHIP.beam, YB = WL + 0.9;
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
  pos: number[] = []; nor: number[] = []; uv: number[] = []; part: number[] = []; aux: number[] = []; main: number[] = []; idx: number[] = [];
  /** 1 while the mainmast and its rigging are added: the part that falls when it is shot away. */
  mainmast = 0;
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
      this.main.push(this.mainmast);
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
    g.setAttribute('aMain', new THREE.Float32BufferAttribute(this.main, 1));
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
    b.mainmast = m === MASTS[1] ? 1 : 0;
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
  b.mainmast = 0;
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
 * aRig is the mast it swings round, its size, and its share of the swing (cloth.ts adds the cloth particle to it).
 */
function sailGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], kind: number[] = [], plane: number[] = [], rig: number[] = [], main: number[] = [], idx: number[] = [];
  const grids: ClothGrid[] = [];
  let onMain = 0, mastR = 0;
  const grid = (k: number, at: (u: number, v: number) => THREE.Vector3, nu: number, nv: number, r: [number, number, number], flat: (p: THREE.Vector3, u: number, v: number) => [number, number]) => {
    const base = pos.length / 3;
    grids.push({ kind: k, base, nu, nv, mastR });
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, p = at(u, v);
      pos.push(p.x, p.y, p.z); uv.push(u, v); kind.push(k); plane.push(...flat(p, u, v)); rig.push(...r); main.push(onMain);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, e = c + 1;
      idx.push(a, b, c, b, e, c);
    }
  };
  for (const m of MASTS) {
    const { T, P: Pk, C } = lateen(m), z = mastZ(m), size = m.yard * 0.5;
    onMain = m === MASTS[1] ? 1 : 0;
    mastR = m.r;
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
  onMain = 0;
  // the ensign, flown from the staff over the stern
  const fy = STERN_Y + 2.75, fz = STERN_Z - 0.4;
  grid(3, (u, v) => new V3(0, fy - v * 1.5, fz - u * 2.4), 14, 6, [fz, 0.8, 0], (_, u, v) => [(u - 0.5) * 3, (0.5 - v) * 1.875]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aPlane', new THREE.Float32BufferAttribute(plane, 2));
  g.setAttribute('aRig', new THREE.Float32BufferAttribute(rig, 3));
  g.setAttribute('aMain', new THREE.Float32BufferAttribute(main, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  g.userData.grids = grids;
  return g;
}

/**
 * The running rigging, as ropes the cloth hangs (cloth.ts): each lateen's sheet, from its clew to the lee rail a little
 * aft of it, and its two vangs, from the peak down to her rail on either quarter, which hold the yard's upper end.
 */
function riggingGeometry(): THREE.BufferGeometry {
  const ropes: ClothRope[] = [];
  const railAt = (z: number, side: number) => {
    const s = clamp(sAt(z), 0.03, 0.97), y = rail(s);
    return new V3(side * (Math.abs(onSkin(s, y, 1).x) + 0.04), y + 0.12, zAt(s));
  };
  for (const m of MASTS) {
    const { P: Pk, C } = lateen(m), main = m === MASTS[1] ? 1 : 0, mz = mastZ(m);
    ropes.push({ from: new V3(0, C.y, C.x), to: railAt(C.x - 1.8, 1), lee: true, mastZ: mz, swing: m.swing, slack: 1.04, radius: 0.032, main });
    for (const side of [-1, 1]) {
      ropes.push({ from: new V3(0, Pk.y, Pk.x), to: railAt(Pk.x + 1.5, side), lee: false, mastZ: mz, swing: m.swing, slack: 1.06, radius: 0.024, main });
    }
  }
  return ropeGeometry(ropes);
}

// ---------------------------------------------------------------- ice

/**
 * The icicles that grow where spray and snow freeze and drip: down both sides from under the rail's cap, under the
 * bowsprit, and along the stern gallery's edge. Each is a thin five-sided cone hung from its root. Every vertex sits at
 * the root; aIce holds its offset from the root at full growth (xyz) and the share of ice at which that icicle starts
 * to grow (w), so they come one by one as the ice builds, the bow's first and longest, where the spray flies.
 */
function icicleGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], grow: number[] = [], idx: number[] = [];
  let seed = 90731;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const SIDES = 5;
  const hang = (root: THREE.Vector3, len: number, r: number, start: number) => {
    const base = pos.length / 3, lean = (rnd() - 0.5) * 0.06, leanZ = (rnd() - 0.5) * 0.06;
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      pos.push(root.x, root.y, root.z);
      nor.push(Math.cos(a) * 0.97, 0.24, Math.sin(a) * 0.97);
      grow.push(Math.cos(a) * r, 0, Math.sin(a) * r, start);
    }
    // a tip for each face, so each face keeps its own normal down to the point
    for (let k = 0; k < SIDES; k++) {
      const a = ((k + 0.5) / SIDES) * Math.PI * 2;
      pos.push(root.x, root.y, root.z);
      nor.push(Math.cos(a) * 0.9, -0.44, Math.sin(a) * 0.9);
      grow.push(lean * len, -len, leanZ * len, start);
      idx.push(base + k, base + ((k + 1) % SIDES), base + SIDES + k);
    }
  };
  // under the rail's cap, both sides, bow to stern: longer and sooner forward
  for (const side of [-1, 1]) {
    for (let s = 0.02; s < 0.985; s += 0.009 + rnd() * 0.008) {
      if (rnd() < 0.25) continue;
      const root = skin(s, 1, side).add(new V3(side * 0.025, -0.005, 0));
      const fwd = sm(0.2, 1, s);
      hang(root, (0.08 + rnd() * rnd() * 0.6) * (0.6 + 0.8 * fwd), 0.02 + rnd() * 0.025, clamp(0.12 + rnd() * 0.62 - fwd * 0.18, 0.02, 0.85));
    }
  }
  // under the bowsprit
  const foot = new V3(0, deckAt(0.95) + 0.25, zOf(0.95, deckAt(0.95)));
  for (let t = 0.04; t < 0.94; t += 0.04 + rnd() * 0.04) {
    const at = foot.clone().lerp(BOWSPRIT, t), r = 0.2 + (0.09 - 0.2) * t;
    hang(at.add(new V3((rnd() - 0.5) * r, -r * 0.92, 0)), 0.1 + rnd() * rnd() * 0.7, 0.02 + rnd() * 0.02, clamp(0.08 + rnd() * 0.5, 0.02, 0.8));
  }
  // along the stern gallery's aft edge
  const yg = 3.12, zg = zOf(0, yg) - 0.3, wg = halfAt(0, yg) * 0.92;
  for (let x = -wg + 0.05; x < wg - 0.05; x += 0.1 + rnd() * 0.12) {
    hang(new V3(x, yg - 0.1, zg + 0.04 - 0.3), 0.06 + rnd() * rnd() * 0.4, 0.015 + rnd() * 0.015, clamp(0.2 + rnd() * 0.65, 0.02, 0.9));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aIce', new THREE.Float32BufferAttribute(grow, 4));
  g.setIndex(idx);
  // (the vertices all sit at their roots: the bounds are the hull's, so the icicles are culled with her)
  g.boundingSphere = new THREE.Sphere(new V3(0, 2, 1), 13);
  return g;
}

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
    case 'chain': {
      // a short, wide-mouthed gun on a heavy carriage, its bore oval to take the two halves; chain coiled by the trunnions
      base.add(new THREE.BoxGeometry(0.26, 0.9, 1.3), P.wood, M(-0.55, 0.8, 0));
      base.add(new THREE.BoxGeometry(0.26, 0.9, 1.3), P.wood, M(0.55, 0.8, 0));
      base.add(new THREE.TorusGeometry(0.28, 0.06, 5, 12), P.iron, M(-0.55, 1.3, -0.45, Math.PI / 2));
      base.add(new THREE.TorusGeometry(0.22, 0.06, 5, 12), P.iron, M(-0.55, 1.38, -0.45, Math.PI / 2));
      lathe([[0.001, -0.85], [0.24, -0.85], [0.34, -0.7], [0.38, -0.4], [0.34, 0.4], [0.33, 1.4], [0.44, 1.55], [0.46, 1.75], [0.3, 1.75], [0.26, 1.5]], P.iron, MS(0, 0, 0, Math.PI / 2, 0, 0, 1.25, 1, 0.85));
      for (const z of [-0.4, 0.6]) barrel.add(new THREE.TorusGeometry(0.4, 0.05, 6, 16), P.gold, MS(0, 0, z, 0, 0, 0, 1.2, 0.85, 1));
      pivot = 1.1; muzzle = 1.75;
      break;
    }
    case 'heated': {
      // a long gun beside the furnace its shot is heated in: an iron brazier on legs, its coals aglow
      base.add(new THREE.BoxGeometry(0.24, 1.0, 1.2), P.wood, M(-0.5, 0.85, 0));
      base.add(new THREE.BoxGeometry(0.24, 1.0, 1.2), P.wood, M(0.5, 0.85, 0));
      base.add(new THREE.CylinderGeometry(0.42, 0.3, 0.45, 10, 1, true), P.iron, M(1.15, 1.05, -0.55));
      base.add(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 10), P.wisp, M(1.15, 1.2, -0.55));
      for (const a of [0, 2.1, 4.2]) base.add(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 4), P.iron, M(1.15 + Math.cos(a) * 0.28, 0.5, -0.55 + Math.sin(a) * 0.28));
      lathe([[0.001, -0.95], [0.2, -0.95], [0.3, -0.8], [0.33, -0.5], [0.29, 0.3], [0.24, 1.9], [0.22, 2.75], [0.3, 2.85], [0.32, 3.05], [0.2, 3.1], [0.16, 2.8]], P.iron, along);
      for (const z of [-0.6, 0.5, 1.8]) barrel.add(new THREE.TorusGeometry(0.3, 0.05, 6, 16), P.bronze, M(0, 0, z));
      pivot = 1.05; muzzle = 3.1;
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

/** Texels across an emblem's roundel. */
const EMBLEM_SIZE = 128;

/** Everything the fleet shares: the geometry, built once, the textures and the materials. */
export class Kit {
  readonly hull = hullGeometry(true);
  readonly hullFar = hullGeometry(false);
  readonly sails = sailGeometry();
  readonly rigging = riggingGeometry();
  readonly icicles = icicleGeometry();
  readonly turrets = new Map<Weapon, ReturnType<typeof turretGeometry>>();
  private readonly heads = new Map<Figurehead, THREE.BufferGeometry>();
  envMap: THREE.Texture | null = null;
  readonly tex: ActorTextures;
  readonly sailNoise: THREE.Texture;
  /** Every ship's sails and flags, simulated together. */
  readonly cloth: Cloth;
  private readonly emblems = new Map<string, THREE.DataTexture>();
  /** The roundels the emblem worker has painted, by emblem. */
  readonly #painted = new Map<string, Uint8Array>();
  #materials: ReturnType<Kit['materials']> | null = null;
  constructor(tex: ActorTextures) {
    this.tex = tex;
    this.sailNoise = sailNoise(tex.noise);
    this.cloth = new Cloth(this.sails, this.rigging, this.sailNoise);
    for (const k of WEAPONS) this.turrets.set(k, turretGeometry(k));
    if (typeof Worker !== 'undefined') {
      const w = new Worker(new URL('../cosmetics/emblem-worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<[string, Uint8Array][]>) => {
        for (const [id, px] of e.data) this.#painted.set(id, px);
        w.terminate();
      };
      w.postMessage(EMBLEM_SIZE);
    }
  }
  /** The materials every ship is drawn with, made from the first ship's uniforms and reading each ship's own as she
   *  is drawn: built once for every ship, where a ship's own were 8 builds each (with their shadows' as the sun draws
   *  them), some 160 as a match began. */
  materials(u: Uniforms): { body: THREE.Material; sail: THREE.Material; rope: THREE.Material; ice: THREE.Material } {
    if (!this.#materials) {
      const shared = drawnUniforms(u);
      this.#materials = {
        body: hullNodeMaterial(shared, this.tex), sail: sailNodeMaterial(shared, this.tex, this.sailNoise, this.cloth),
        rope: ropeNodeMaterial(shared, this.cloth), ice: iceNodeMaterial(shared),
      };
    }
    return this.#materials;
  }

  figurehead(kind: Figurehead): THREE.BufferGeometry {
    let g = this.heads.get(kind);
    if (!g) this.heads.set(kind, (g = figureheadGeometry(kind)));
    return g;
  }
  /** One emblem's roundel from the cosmetics library (r the field, g the charge, b the ink), as the emblem worker
   *  painted it, or painted here if it has not yet. */
  emblem(id: string): THREE.DataTexture {
    let t = this.emblems.get(id);
    if (!t) {
      const N = EMBLEM_SIZE;
      t = new THREE.DataTexture(this.#painted.get(id) ?? emblemRoundel(id, N), N, N, THREE.RGBAFormat);
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.anisotropy = 4;
      t.needsUpdate = true;
      this.emblems.set(id, t);
    }
    return t;
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
  torn: number; // 0 whole canvas .. 1 in rags
  mast: 'up' | 'down' | 'jury';
  flood: number; // 0 dry .. 1 full
  listTo: number; // the side she lists to, +1 starboard
  irons: number; // 1 in irons, the canvas shaking
  lurch: number; // 1 as a thrown gybe slams the yards across, falling to 0
  roll: number; // the seaway's roll the gunners feel, radians, positive with her starboard side down
  ice: number; // 0 clear .. 1 iced up: the ice falling snow has built on her, which slows her turning
}

/** Shot holes and burns a hull keeps, the oldest giving way to the newest. */
export const HOLES = 16;

/** The great spirit lantern over the taffrail, in ship space: where its glow is drawn. */
export const LANTERN = new V3(0, STERN_Y + 0.6 + 0.85, STERN_Z - 0.05 - 0.35);
/** The wisp that rides the main truck at night, in ship space: high enough to show as far off as her masts do. */
export const MASTHEAD = new V3(0, mastTop(MASTS[1]) + 0.3, mastZ(MASTS[1]));
/** The mainmast's foot on the deck, which it falls about, and its height over it. */
export const MAIN_FOOT = new V3(0, deckAt(MASTS[1].s), mastZ(MASTS[1]));
export const MAIN_HEIGHT = MASTS[1].h;
/** The mainmast's fall, in seconds: tipping slowly, then all at once to the water. */
const FALL = { time: 1.5, lie: 2.6, sink: 5, gone: 8, angle: Math.PI / 2 + 0.16, jury: 0.58, sway: 1.2 } as const;

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
  private readonly icicles: THREE.Mesh;
  private muzzleZ = 3;
  private readonly kit: Kit;
  private bob = { y: 0, pitch: 0, roll: 0, heel: 0 };
  private spin = 0;
  recoil = 0;
  boom = 0;
  private lee = 1;
  /** The player's own sail thins round the crosshair, 0..1. */
  fade = 0;
  /** The mainmast: seconds since it began to fall (-1 standing), the side it went (+1 starboard), and the jury mast. */
  private fell = -1;
  private fellTo = 1;
  private jury = 0;
  private mastState: Pose['mast'] = 'up';
  private flood = 0;
  /** Holes laid so far (the next goes in this slot of the ring), and her hull at the last frame. */
  private holes = 0;
  private lastHp = 1;
  /** Set for the frame the fallen mast strikes the water, with where its head hit in ship space. */
  landed = false;
  readonly landedAt = new V3();
  /** Her slot in the fleet's cloth, and where her hull was and how fast it went last frame (to feel her motion). */
  private readonly slot: number;
  private readonly was = { at: new V3(), v: new V3(), felt: new V3(), seen: false };

  constructor(kit: Kit, look: Look) {
    this.kit = kit;
    this.look = look;
    this.u = {
      uHull: { value: new THREE.Color(look.hull) }, uAccent: { value: new THREE.Color(look.accent) }, uTrim: { value: new THREE.Color(look.trim) },
      uWisp: { value: new THREE.Color(look.wisp) }, uHit: { value: 0 }, uHitAt: { value: new THREE.Vector3(0, -99, 0) }, uDamage: { value: 0 }, uNight: { value: 0 },
      uDeckMap: { value: kit.tex.deck_d }, uDeckN: { value: kit.tex.deck_n }, uDmgNoise: { value: kit.tex.noise },
      uSailA: { value: new THREE.Color(look.sail) }, uSailB: { value: new THREE.Color(look.sail2) }, uTrimC: { value: new THREE.Color(look.trim) },
      uPattern: { value: look.pattern }, uEmblem: { value: look.emblem ? 0 : -1 }, uEmblemAtlas: { value: kit.emblem(look.emblem ?? 'gull') }, uEmblemRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uLinen: { value: kit.tex.linen_d }, uSailNoise: { value: kit.sailNoise },
      uFill: { value: 0.6 }, uSide: { value: 1 }, uBoom: { value: 0 }, uLuff: { value: 0 }, uFade: { value: 0 },
      uMast: { value: new THREE.Vector4(0, 1, 0, 0) }, uTorn: { value: 0 }, uClothSlot: { value: 0 }, uWet: { value: 0.2 },
      uIce: { value: 0 },
      // where she has been shot through and burnt, in hull space: centre, and radius (negative for a burn)
      uHoles: { value: Array.from({ length: HOLES }, () => new THREE.Vector4(0, -99, 0, 0)) },
    };
    this.slot = this.u.uClothSlot.value = kit.cloth.acquire();
    const { body, sail, rope, ice } = kit.materials(this.u);
    const hull = this.hull = new THREE.Mesh(kit.hull, body);
    hull.castShadow = hull.receiveShadow = true;
    this.head = new THREE.Mesh(kit.figurehead(look.figurehead), body);
    this.head.castShadow = true;
    const sails = new THREE.Mesh(kit.sails, sail);
    sails.castShadow = true;
    sails.receiveShadow = true;
    const rigging = new THREE.Mesh(kit.rigging, rope);
    rigging.castShadow = true;
    this.icicles = new THREE.Mesh(kit.icicles, ice);
    this.icicles.visible = false;
    // the node material's own motion and holes are used for its shadow
    this.turretBase = new THREE.Mesh(undefined, body);
    this.barrelMesh = new THREE.Mesh(undefined, body);
    this.turretBase.castShadow = this.barrelMesh.castShadow = true;
    this.turret.add(this.turretBase, this.barrel);
    this.barrel.add(this.barrelMesh);
    this.turret.position.set(0, deckHeight(SHIP.turretZ), SHIP.turretZ);
    this.body.add(hull, this.head, sails, rigging, this.turret, this.icicles);
    // the kit's materials read her own uniforms from whichever of her parts they draw
    for (const m of [hull, this.head, sails, rigging, this.icicles, this.turretBase, this.barrelMesh]) m.userData.u = this.u;
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

  /**
   * Where a shot went into her, given in world space: the hit's glow, and a hole that stays (a burn, for heated
   * shot), laid on her skin where the shot struck. Returns her side's outward normal there, in world space, for
   * what is knocked out of it.
   */
  struck(world: THREE.Vector3, burn = false, big = 1): THREE.Vector3 {
    this.hull.updateWorldMatrix(true, false);
    const local = this.hull.worldToLocal((this.u.uHitAt.value as THREE.Vector3).copy(world)).clone();
    // onto her side: the station along her and the side it came in, its height held between keel and rail; a shot
    // that came down over the rail lands on the deck where it struck
    const s = sAt(local.z), side = local.x >= 0 ? 1 : -1;
    const onSide = local.y < rail(s) + 0.2;
    const y = clamp(local.y, keel(s) + 0.4, rail(s) - 0.15);
    const at = onSide ? onSkin(s, y, side) : local;
    const n = onSide ? hullNormal(s, y, side) : new V3(0, 1, 0);
    const holes = this.u.uHoles.value as THREE.Vector4[];
    holes[this.holes++ % HOLES].set(at.x, at.y, at.z, (burn ? -1.5 : 0.45) * (0.75 + big * 0.35));
    return n.transformDirection(this.hull.matrixWorld);
  }

  /** Holes patched as she is repaired: the oldest go first, as many as the share of her hull mended. */
  private patchHoles(mended: number): void {
    const holes = this.u.uHoles.value as THREE.Vector4[];
    let n = Math.round(mended * HOLES * 1.2);
    for (let k = 0; k < HOLES && n > 0; k++) {
      const h = holes[(this.holes + k) % HOLES];
      if (h.w !== 0) { h.set(0, -99, 0, 0); n--; }
    }
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

  /** The mainmast goes over the side, toward `side` (+1 starboard). */
  mastFall(side: number): void {
    this.fell = 0;
    this.fellTo = side >= 0 ? 1 : -1;
    this.jury = 0;
    this.mastState = 'down';
  }

  /**
   * The mainmast this frame, into uMast: (angle it has fallen through about her length, positive to starboard; its
   * scale about the foot, under a jury rig or gone; how far it has sunk; how far it has drifted aft).
   */
  private rig(state: Pose['mast'], dt: number): void {
    const u = this.u.uMast.value as THREE.Vector4;
    this.landed = false;
    if (state === 'down' && this.mastState !== 'down') {
      // seen down without seeing it go (a ship come into sight that way): it is already gone
      this.fell = FALL.gone;
      this.mastState = 'down';
    }
    if (state !== 'down') {
      if (state === 'jury' && this.mastState !== 'jury') this.jury = 0;
      this.mastState = state;
      this.fell = -1;
      this.jury = state === 'jury' ? Math.min(FALL.sway, this.jury + dt) : 0;
      const k = THREE.MathUtils.smoothstep(this.jury, 0, FALL.sway);
      u.set(0, state === 'jury' ? FALL.jury * k : 1, 0, 0);
      return;
    }
    const was = this.fell;
    this.fell += dt;
    const t = this.fell;
    // it tips like a felled tree, slowly and then all at once, and comes to lie a little past level on the water
    const tip = Math.min(1, t / FALL.time);
    const angle = FALL.angle * tip * tip * (1 + 0.04 * Math.sin(Math.min(1, Math.max(0, t - FALL.time)) * 9) * Math.exp(-(t - FALL.time) * 2));
    if (was < FALL.time && t >= FALL.time) {
      this.landed = true;
      this.landedAt.set(-this.fellTo * MAIN_HEIGHT * 0.85, 0, MAIN_FOOT.z);
    }
    // lying in the water, it drags astern of her and settles; then it is gone
    const lie = Math.max(0, t - FALL.time);
    const sink = lie > FALL.lie ? (lie - FALL.lie) * 0.9 : 0;
    u.set(angle * this.fellTo, t > FALL.gone ? 0 : 1, sink, Math.min(lie * 3.5, 30));
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
      b.roll += (Math.atan2(hp - hst, 4.4) * 0.8 + p.roll - b.roll) * k;
      b.heel += (p.turn * Math.min(1, p.speed / 14) * 0.35 - b.heel) * Math.min(1, dt * 2.5);
      // a thrown gybe: the yards' weight coming across throws her over toward the new lee, and she rocks back
      if (p.lurch > 0) b.roll += Math.sin(p.lurch * Math.PI * 3) * p.lurch * -this.lee * 0.11 * Math.min(1, dt * 30);
    }
    // water in her: she settles and lists to the side it came in
    this.flood += (p.flood - this.flood) * Math.min(1, dt * 0.8);
    const settle = this.flood * 0.85, list = p.listTo * this.flood * 0.24;
    // sinking: down by the stern, rolling over
    const s = p.sink;
    this.body.position.y = b.y - s * s * 9 - s * 0.6 - settle;
    this.body.rotation.set(b.pitch - s * 0.32 - this.flood * 0.03, 0, b.roll + b.heel + s * 0.55 + p.flip + list, 'YXZ');
    this.rig(p.mast, dt);
    this.u.uTorn.value = p.torn;
    if (p.hp > this.lastHp + 0.01) this.patchHoles(p.hp - this.lastHp);
    this.lastHp = p.hp;
    // the yards hang on the lee side and are sheeted to the wind: eased right out running before it, hauled in close
    // as she points up, until head to wind the cloth lifts and shakes. Bringing the wind across the stern gybes them.
    const off = Math.abs(p.wind), aloft = p.alt > 3;
    if (Math.sin(p.wind) * this.lee < -0.2) this.lee = -this.lee;
    // (your own, seen from the chase camera, is kept sheeted closer so the cloth stays edge-on and out of the view)
    const sheet = (0.6 - 0.42 * THREE.MathUtils.smoothstep(off, 0.5, 2.7)) * (this.fade > 0 ? 0.45 : 1);
    const want = aloft ? 0.15 * this.lee : -this.lee * sheet - p.turn * 0.15 + Math.sin(t * 0.3) * 0.04;
    // (thrown across in a gybe, they come all at once)
    this.boom += (want - this.boom) * Math.min(1, dt * (1.4 + p.lurch * 9));
    const u = this.u;
    u.uBoom.value = this.boom;
    u.uSide.value += ((this.boom >= 0 ? -1 : 1) - u.uSide.value) * Math.min(1, dt * 3);
    // the cloth fills with the wind's strength and her way, and slats in irons or a calm
    const irons = aloft ? 0 : Math.max(THREE.MathUtils.smoothstep(off, 2.55, 3.0), p.irons);
    const strength = THREE.MathUtils.clamp(p.windSpeed / 10, 0.2, 1.3);
    const fill = aloft ? 1.25 : THREE.MathUtils.clamp(0.15 + p.speed / 20 + strength * 0.55, 0.2, 1.25) * (1 - irons * 0.6) + p.boost * 0.35;
    u.uFill.value += (fill - u.uFill.value) * Math.min(1, dt * 2);
    // (iced canvas is stiff: it lifts and shakes less)
    u.uLuff.value = (aloft ? 0 : Math.max(THREE.MathUtils.clamp(1 - p.windSpeed / 3, 0, 1) * 0.8, irons * 0.8, THREE.MathUtils.clamp(1 - p.speed / 4, 0, 1) * 0.4)) * (1 - 0.6 * p.ice);
    // the flags: the true wind less her own way through the water
    const ax = Math.sin(p.wind) * p.windSpeed, az = Math.cos(p.wind) * p.windSpeed - (aloft ? 20 : p.speed);
    u.uDamage.value = THREE.MathUtils.clamp((1 - p.hp) * 1.15 - 0.1, 0, 1) + s * 0.3;
    // how high the sea and her bow wave wet her sides: up quickly as she drives into it, drying slowly
    const reach = aloft ? 0 : THREE.MathUtils.clamp(p.speed / 16, 0, 1) * 0.8 + Math.max(0, -b.pitch) * 3 + Math.abs(b.roll) * 1.5;
    u.uWet.value += (reach - u.uWet.value) * Math.min(1, dt * (reach > u.uWet.value ? 3 : 0.15));
    this.cloth(p, ax, az, dt);
    u.uHit.value = p.hit;
    u.uNight.value = p.night;
    u.uIce.value = p.ice;
    this.icicles.visible = p.ice > 0.02;
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

  /**
   * Her cloth this frame, all in her own heeled and pitching frame. The lateens are given a wind that fills them to
   * the lee as full as she is sailing (the game's ships go faster than any wind would drive them, so the wind the
   * sails feel is the one that would), with the apparent wind running along the cloth from luff to leech; when she
   * is in irons or becalmed it runs along them gusting and they lift and shake. The flags fly in the apparent wind
   * itself. What the cloth feels besides is gravity less her own acceleration: the swell's heave, the turn, the
   * jolt of a hit or a landing.
   */
  private cloth(p: Pose, ax: number, az: number, dt: number): void {
    const u = this.u, w = this.was;
    const local = CLOTH_Q.copy(this.body.quaternion).invert();
    const a = this.boom, n = CLOTH_N.set(Math.cos(a), 0, -Math.sin(a)), along = CLOTH_T.set(Math.sin(a), 0, Math.cos(a));
    const side = u.uSide.value as number, fill = u.uFill.value as number, luff = u.uLuff.value as number;
    const strength = fill * 8 * (1 - luff * 0.85);
    const run = Math.min(-3 - luff * p.windSpeed * 0.6, ax * along.x + az * along.z);
    const sail = CLOTH_S.copy(n).multiplyScalar(side * strength).addScaledVector(along, run).applyQuaternion(local);
    const flag = CLOTH_F.set(ax, 0, az).applyQuaternion(local);
    // her hull's acceleration, from where it has been the last frames, lagged a little so the swell's noise is felt
    // as a sway and not as a buzz; a jump (she has been moved) lays the cloth out afresh
    this.body.updateWorldMatrix(true, false);
    const at = CLOTH_A.setFromMatrixPosition(this.body.matrixWorld);
    const up = CLOTH_U.setFromMatrixColumn(this.root.matrixWorld, 1).normalize();
    if (dt > 0) {
      const v = CLOTH_V.copy(at).sub(w.at).divideScalar(dt);
      if (!w.seen || v.length() > 80) {
        this.kit.cloth.reset(this.slot);
        w.felt.set(0, 0, 0);
        v.set(0, 0, 0);
      } else {
        const acc = CLOTH_W.copy(v).sub(w.v).divideScalar(dt).clampLength(0, 14);
        w.felt.lerp(acc, Math.min(1, dt * 6));
      }
      w.v.copy(v);
      w.at.copy(at);
      w.seen = true;
    }
    const q = CLOTH_Q2.setFromRotationMatrix(this.body.matrixWorld).invert();
    const g = CLOTH_G.copy(up).multiplyScalar(-9.81).sub(w.felt).applyQuaternion(q);
    this.kit.cloth.set(this.slot, a, side, sail, 0.1 + luff * 0.55, flag, g, p.torn, u.uDamage.value as number, dt);
  }

  dispose(): void {
    // the renderer keeps what it drew each part with until the part itself is let go
    this.root.traverse((o) => o.dispose());
    this.kit.cloth.release(this.slot);
  }
}

const CLOTH_Q = new THREE.Quaternion(), CLOTH_Q2 = new THREE.Quaternion();
const CLOTH_N = new V3(), CLOTH_T = new V3(), CLOTH_S = new V3(), CLOTH_F = new V3(), CLOTH_A = new V3(), CLOTH_U = new V3();
const CLOTH_V = new V3(), CLOTH_W = new V3(), CLOTH_G = new V3();
