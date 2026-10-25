// The Coral Atolls (WP17 part A): ring reefs round turquoise lagoons in tropical light, the Great Lagoon at their heart.
// The terrain draws the reef flats, motus and white beaches and the sea paints the floor; this module lays the
// clear turquoise water, the surf and the lace (sea.ts: one rule, SURF, for its shader and this plan) and this module
// draws what lives on the reefs, every piece placed from the sim's own heights so the drawn reef is exactly the reef a
// hull meets. On the reef flat (dry at low water, never passable):
// a pink algal ridge of mottled pavement on the seaward edge, a rampart of storm-thrown bleached coral boulders on the
// windward reefs, massive, branching and table corals across the flat, beachrock slabs tilted seaward along the motus'
// shores. On the reef front (awash at low
// water, crossed at high) corals whose tops stay under a keel at high water. On the motus: coconut groves broken by
// clearings (three kits, sketched beyond 45 u; the crowns swept to the lee of the trade wind, those on the beach crest
// leaning out over the sand), pandanus on stilt roots, beach scrub, bleached driftwood on the strandline. The channels
// are found by walking each reef's crest in the sim: no reef part lies within 1.6 u of one's centre line and the surf's
// own rule leaves it unbroken (tested across its width); every channel is staked on both sides with bare withies (the
// Great Lagoon's all through), and a hulk
// that missed the Great Lagoon's lies heeled on the reef flat beside its mouth.
// Hooks: `turtles` (WP23: lagoon water and nesting beaches), `fish` (WP23: over the reef-front corals), `seabirds`
// (WP23: palm crowns and the hulk), `voices` (WP28: the surf's places and loudness), `plan.channels`/`plan.sills`
// (the passes, for cameras and captures).
import * as THREE from 'three';
import { illustratedMaterial, inkMaterial, linearVec, type Style } from '../../style/glsl.ts';
import { mix, PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { coastAt, heightAt } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS, TIDE } from '../../sim/world/regions.ts';
import { seas, surfAt } from '../sea.ts';
import type { Swell } from '../swell.ts';
import { GROUND, terrains, type Ground, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, ring, seeded, vec, type V, washOf, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'coralAtolls');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI, DEG = Math.PI / 180;
/** Sim heights (u above mean sea): below LOW a hull floats at every tide, at or above BLOCK at none, above LAND dry at
 *  high water. */
export const LOW = -TIDE.amp - DRAFT, BLOCK = TIDE.amp - DRAFT, LAND = TIDE.amp + 0.15;
/** Grid step (u); reef corals and pavement drawn within `near` u of the eye (in full within `drawn`, the pandanus too),
 *  palms leaflet by leaflet within `leaflets`, in full within `palms`, sketched beyond; the trade wind's lee (chart). */
export const CORAL = { step: 1, near: 55, palms: 45, drawn: 24, leaflets: 14, lee: [-0.95, -0.3] as const } as const;
/** Clearance (u) of reef, surf and foam from a channel's centre line. */
export const CLEAR = 1.6;
/** Every reef-front coral's top lies at least this far under the lowest water (u). */
export const UNDER = -TIDE.amp - 0.12;
/** The motus' dressing grid (u). */
const MOTU = 0.6;

const W = {
  trunk: washOf(PIGMENTS.umber, 0.55), scar: washOf(PIGMENTS.sepia, 0.75),
  frond: washOf(PIGMENTS.malachite, 0.8), frondPale: washOf(PIGMENTS.verdigris, 0.7), frondOld: washOf(PIGMENTS.ochre, 0.75),
  frondDead: washOf(PIGMENTS.umber, 0.85), nut: washOf(PIGMENTS.ochre, 0.95),
  leaf: washOf(PIGMENTS.verdigris, 0.85), root: washOf(PIGMENTS.umber, 0.7), fruit: washOf(PIGMENTS.vermilion, 0.6),
  shrub: washOf(PIGMENTS.malachite, 0.9), shrubLit: washOf(PIGMENTS.verdigris, 0.6), shade: washOf(PIGMENTS.umber, 0.6),
  coral: washOf(PIGMENTS.ochre, 0.42), coralPale: washOf(PIGMENTS.ochre, 0.2), algae: washOf(PIGMENTS.verdigris, 0.3),
  rose: washOf(PIGMENTS.roseMadder, 0.3), tip: washOf(PIGMENTS.leadWhite, 0.9),
  table: washOf(PIGMENTS.verdigris, 0.55), under: washOf(PIGMENTS.sepia, 0.65),
  bleach: washOf(PIGMENTS.leadWhite, 0.65), rock: washOf(PIGMENTS.sepia, 0.45),
  sand: washOf(PIGMENTS.leadWhite, 0.75), sandEdge: washOf(PIGMENTS.ochre, 0.3),
  drift: washOf(PIGMENTS.leadWhite, 0.5), driftDark: washOf(PIGMENTS.sepia, 0.5),
  pole: washOf(PIGMENTS.sepia, 0.85),
  crownLit: washOf(mix(PIGMENTS.verdigris, PIGMENTS.ochre, 0.45), 0.5), crownSun: washOf(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.3), 0.6),
  crownShade: washOf(mix(PIGMENTS.malachite, PIGMENTS.indigo, 0.25), 0.8),
  // a grove seen from the sea at noon: silver-grey boles, the crowns sunlit through and their hanging fronds a cool green
  bole: washOf(mix(PIGMENTS.sepia, PIGMENTS.leadWhite, 0.45), 0.45), boleRing: washOf(PIGMENTS.sepia, 0.5),
  crownHang: washOf(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.3), 0.55), crownNoon: washOf(mix(PIGMENTS.verdigris, PIGMENTS.ochre, 0.62), 0.4),
  frondDry: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.25), 0.55),
  timber: washOf(PIGMENTS.sepia, 0.9), weed: washOf(PIGMENTS.verdigris, 0.95),
};

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A kit in the making: facets take `wash`, or `pick` from their centre and normal when set. */
class Brush {
  wash: Wash;
  pick: ((c: V, n: V) => Wash) | null = null;
  readonly kit: Kit;
  constructor(wash: Wash) {
    this.wash = wash;
    this.kit = new Kit((c, n) => (this.pick ? this.pick(c, n) : this.wash));
  }
  tri(a: V, b: V, c: V): void {
    this.kit.tri(a, b, c);
  }
}

function frame(t: V): [V, V] {
  const u = vec().crossVectors(t, Math.abs(t.x) < 0.7 ? vec(1, 0, 0) : vec(0, 1, 0)).normalize();
  return [u, vec().crossVectors(t, u)];
}

function tube(b: Brush, path: readonly V[], radii: readonly number[], sides: number): void {
  const rings: V[][] = [];
  for (let i = 0; i < path.length; i++) {
    const [u, w] = frame(vec().subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize());
    rings.push(Array.from({ length: sides }, (_, j) => {
      const a = (j / sides) * TAU;
      return path[i].clone().addScaledVector(u, radii[i] * Math.cos(a)).addScaledVector(w, radii[i] * Math.sin(a));
    }));
  }
  b.kit.loft(rings);
}

/** A three-sided spike from `a` (r wide) to `tip`. */
function spike(b: Brush, a: V, tip: V, r: number, turn = 0): void {
  const [u, w] = frame(vec().subVectors(tip, a).normalize());
  const f = [0, 1, 2].map((j) => a.clone().addScaledVector(u, r * Math.cos(turn + (j / 3) * TAU)).addScaledVector(w, r * Math.sin(turn + (j / 3) * TAU)));
  for (let j = 0; j < 3; j++) b.tri(f[j], f[(j + 1) % 3], tip);
}

/** The triangles laid so far by a brush. */
const laid = (b: Brush): number => (b.kit as unknown as { pos: number[] }).pos.length / 9;
/** A crown's normals: frond facets above its heart (y > topY) turned up, lit as the arching upper face; those hanging below
 *  turned down by `hang` < 0, so the crown's underside falls into shade (or out and up by `hang` ≥ 0, lit through). */
function crownNormals(g: THREE.BufferGeometry, [a0, a1]: [number, number], topY: number, hang = -0.6): THREE.BufferGeometry {
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute, pos = g.getAttribute('position') as THREE.BufferAttribute, f = vec();
  for (let t = a0; t < a1; t++) {
    const cy = (pos.getY(3 * t) + pos.getY(3 * t + 1) + pos.getY(3 * t + 2)) / 3, up = cy > topY - 0.03;
    f.fromBufferAttribute(nrm, 3 * t);
    if (f.y < 0 === (up || hang >= 0)) f.negate(); // (a crown lit through at noon: its hanging fronds face out and up)
    f.multiplyScalar(up ? 0.45 : 0.7).add(vec(0, up ? 1 : hang, 0)).normalize();
    for (let v = 0; v < 3; v++) nrm.setXYZ(3 * t + v, f.x, f.y, f.z);
  }
  return g;
}
/** Turn the normals of triangles [from, to) up toward the kit's +y, so foliage hangs lit as its upper face. */
function liftNormals(g: THREE.BufferGeometry, ranges: readonly [number, number][]): THREE.BufferGeometry {
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute, f = vec();
  for (const [a0, a1] of ranges) {
    for (let t = a0; t < a1; t++) {
      f.fromBufferAttribute(nrm, 3 * t);
      if (f.y < 0) f.negate();
      f.multiplyScalar(0.45).add(vec(0, 1, 0)).normalize();
      for (let v = 0; v < 3; v++) nrm.setXYZ(3 * t + v, f.x, f.y, f.z);
    }
  }
  return g;
}

/** An open three-sided stick from `a` (r0) to `b` (r1), closed in a blunt point when `cap`. */
function stick(br: Brush, a: V, b: V, r0: number, r1: number, cap: boolean): void {
  const [u, w] = frame(vec().subVectors(b, a).normalize());
  const at = (p: V, r: number, j: number): V => p.clone().addScaledVector(u, r * Math.cos((j / 3) * TAU)).addScaledVector(w, r * Math.sin((j / 3) * TAU));
  for (let j = 0; j < 3; j++) {
    const a0 = at(a, r0, j), a1 = at(a, r0, j + 1), b0 = at(b, r1, j), b1 = at(b, r1, j + 1);
    br.tri(a0, a1, b1);
    br.tri(a0, b1, b0);
    if (cap) br.tri(b0, b1, b.clone().addScaledVector(vec().subVectors(b, a).normalize(), r1 * 1.5));
  }
}

function blob(b: Brush, c: V, r: number): void {
  const p = [vec(r, 0, 0), vec(-r, 0, 0), vec(0, r, 0), vec(0, -r, 0), vec(0, 0, r), vec(0, 0, -r)].map((v) => v.add(c));
  for (const [i, j, k] of [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]]) b.tri(p[i], p[j], p[k]);
}

/** A coconut palm 1 tall: a ringed trunk with a swollen bole curving to +z, a crown of pinnate fronds swept to the lee
 *  (+z), fresh ones pale and upright, old ones yellowed and drooping, a dead one hanging, a cluster of nuts. */
function palmKit(seed: number, young: boolean, far = false): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.bole), n = far ? 2 : young ? 4 : 7, bend = young ? 0.12 : 0.26 + 0.14 * rnd();
  const path: V[] = [], radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push(vec(0.015 * Math.sin(t * 4 + seed), t, bend * t * t + 0.05 * t * Math.sin(t * 3 + seed)));
    radii.push((i === 0 ? 0.058 : 0.036 - 0.012 * t) * (young ? 1.5 : 1));
  }
  b.pick = (c) => (Math.floor(c.y * 26) % 3 ? W.bole : W.boleRing);
  tube(b, path, radii, far ? 3 : 6);
  b.pick = null;
  const top = path[n], Y = vec(0, 1, 0), count = far ? 8 : young ? 9 : 12, L = young ? 0.62 : 0.5, SEG = far ? 2 : 5, fronds = laid(b);
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * TAU + 0.3 * rnd(), d = vec(Math.sin(phi), 0, Math.cos(phi) + 0.6).normalize(), age = k % 4;
    const droop = young ? 0.35 + 0.25 * age : 0.45 + 0.28 * age, rise = young ? 0.55 : 0.45 - 0.06 * age;
    const len = L * (0.85 + 0.3 * rnd()) * (age === 0 ? 0.8 : 1), side = vec().crossVectors(d, Y).normalize();
    b.wash = age === 3 && !young && k % 8 === 3 ? W.frondDry : age === 3 && k % 8 === 7 ? W.frondOld : age === 0 ? W.frondPale : W.frond;
    const tone = b.wash, kept = tone === W.frondDry || tone === W.frondOld;
    let prev = top.clone();
    for (let i = 1; i <= SEG; i++) {
      const s = i / SEG, p = top.clone().addScaledVector(d, len * s).addScaledVector(Y, len * (rise * s - droop * s * s));
      const w = len * 0.2 * (1 - 0.55 * s) * (i === 1 ? 0.6 : 1), mid = prev.clone().lerp(p, 0.5);
      // the crown lit where it arches above its heart, shadowed where it hangs below
      if (!kept) b.wash = mid.y > top.y - 0.03 ? (age === 0 || far ? W.crownNoon : W.crownLit) : W.crownHang;
      // (far off the blades lie flatter, lit as a crown is seen from afar, not a dark fringe)
      const hang = vec(0, far ? -len * 0.02 : -len * 0.09, 0).addScaledVector(d, len * 0.05), low = vec(0, -len * 0.03, 0).add(hang);
      b.tri(prev, p, mid.clone().addScaledVector(side, w).add(hang));
      b.tri(p, prev, mid.clone().addScaledVector(side, -w).add(hang));
      b.tri(mid, p, p.clone().addScaledVector(side, 0.8 * w).add(low));
      b.tri(p, mid, p.clone().addScaledVector(side, -0.8 * w).add(low));
      prev = p;
    }
  }
  const lit: [number, number] = [fronds, laid(b)];
  b.wash = W.nut;
  for (let k = 0; k < (far ? 0 : young ? 2 : 5); k++) blob(b, top.clone().add(vec(0.035 * Math.cos(k * 2.4), -0.035 - 0.015 * (k % 2), 0.035 * Math.sin(k * 2.4))), 0.026);
  return crownNormals(b.kit.build(), lit, top.y, 0.35);
}

/** A coconut palm 1 tall drawn close, as an engraver draws one: a curved trunk swollen at the bole and ringed with leaf
 *  scars, a crown of pinnate fronds (a pale spear upright, the mature arching out and drooping, the old hanging
 *  yellowed, a dead one brown along the trunk), each rachis hung with leaflets folded down in a V, a cluster of nuts
 *  in the crown's heart, the fronds' undersides shaded by the hatching. Leans to +z. */
function palmNearKit(seed: number, young: boolean): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.trunk), n = young ? 6 : 9, bend = young ? 0.12 : 0.26 + 0.14 * rnd();
  const path: V[] = [], radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push(vec(0.015 * Math.sin(t * 4 + seed), t, bend * t * t + 0.05 * t * Math.sin(t * 3 + seed)));
    radii.push((i === 0 ? 0.064 : i === 1 ? 0.046 : 0.036 - 0.01 * t) * (young ? 1.5 : 1));
  }
  b.pick = (c) => (Math.floor(c.y * 34) % 3 === 0 ? W.scar : W.trunk);
  tube(b, path, radii, 7);
  b.pick = null;
  const top = path[n], Y = vec(0, 1, 0), count = young ? 11 : 15, L = young ? 0.62 : 0.52, SEG = 9;
  const lit: [number, number][] = [];
  const tris = (): number => laid(b);
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * TAU * 2.6 + 0.3 * rnd(), age = k === 0 ? -1 : k % 4;
    const d = vec(Math.sin(phi), 0, Math.cos(phi) + (age < 0 ? 0 : 0.5)).normalize();
    const droop = age < 0 ? 0.1 : young ? 0.35 + 0.25 * age : 0.55 + 0.45 * age, rise = age < 0 ? 0.9 : young ? 0.55 : 0.42 - 0.08 * age;
    const dead = age === 3 && !young && k % 8 === 3, len = L * (0.85 + 0.3 * rnd()) * (age < 0 ? 0.3 : age === 0 ? 0.85 : 1);
    const side = vec().crossVectors(d, Y).normalize(), wash = dead ? W.frondDead : age === 3 ? W.frondOld : age <= 0 ? W.frondPale : W.frond;
    const pts = Array.from({ length: SEG + 1 }, (_, i) => {
      const s = i / SEG;
      return top.clone().addScaledVector(d, len * s * (dead ? 0.4 : 1)).addScaledVector(Y, dead ? -len * 0.9 * s : len * (rise * s - droop * s * s));
    });
    // the rachis, a thin ribbon (the spear a furled blade)
    b.wash = age < 0 ? W.frondPale : W.frondOld;
    for (let i = 0; i < SEG; i++) {
      const w = (age < 0 ? 0.02 : 0.006) * (1 - i / SEG);
      b.tri(pts[i].clone().addScaledVector(side, w), pts[i + 1], pts[i].clone().addScaledVector(side, -w));
    }
    // the leaflets, one a side at every step, folded down from the rachis, longest mid-frond; lit as the frond's
    // upper face (their normals turned up), so they hang light against the sky, not as a dark fringe
    b.wash = wash;
    const from = tris();
    for (let i = 1; i <= SEG && age >= 0; i++) {
      const s = i / SEG, along = vec().subVectors(pts[i], pts[i - 1]).normalize();
      const ll = len * 0.34 * Math.sin(Math.PI * (0.12 + 0.8 * s)) * (0.8 + 0.4 * rnd());
      for (const sd of [-1, 1]) {
        const base = pts[i - 1].clone().lerp(pts[i], sd < 0 ? 0.3 : 0.7), fall = 0.35 + 0.6 * s + 0.35 * rnd() + (age === 3 ? 0.5 : 0);
        const dirL = side.clone().multiplyScalar(sd * Math.cos(fall)).addScaledVector(Y, -Math.sin(fall)).addScaledVector(along, 0.5).normalize();
        const tip = base.clone().addScaledVector(dirL, ll), half = along.clone().multiplyScalar(0.012 * len);
        b.wash = dead ? W.frondDead : (i + (sd > 0 ? 1 : 0)) % 3 === 0 ? (age === 3 ? W.frond : W.frondPale) : wash;
        b.tri(base.clone().sub(half), base.clone().add(half), tip);
      }
    }
    lit.push([from, tris()]);
  }
  b.wash = W.nut;
  for (let k = 0; k < (young ? 2 : 6); k++) blob(b, top.clone().add(vec(0.04 * Math.cos(k * 2.4), -0.04 - 0.02 * (k % 2), 0.04 * Math.sin(k * 2.4))), 0.03);
  return liftNormals(b.kit.build(), lit);
}

/** A pandanus ~0.9 tall drawn close: a leaning trunk ringed with scars on a cone of curved stilt roots, three limbs
 *  each crowned by a spiral tuft of long keeled strap leaves arching and drooping, one hung with its great segmented
 *  fruit, orange-red. */
function pandanusNearKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.trunk), Y = vec(0, 1, 0), foot = vec(0, 0.24, 0.04), fork = vec(0.02, 0.58, 0.12);
  b.pick = (c) => (Math.floor(c.y * 40) % 3 === 0 ? W.scar : W.trunk);
  tube(b, [foot, vec(0.01, 0.4, 0.08), fork], [0.042, 0.035, 0.03], 6);
  b.pick = null;
  b.wash = W.root;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU + 0.4 * rnd(), r = 0.16 + 0.08 * rnd(), from = vec(0, 0.12 + 0.12 * rnd(), 0.03);
    const end = vec(r * Math.cos(a), -0.02, r * Math.sin(a) + 0.04), knee = from.clone().lerp(end, 0.5).add(vec(0.25 * r * Math.cos(a), 0.05, 0.25 * r * Math.sin(a)));
    stick(b, from, knee, 0.013, 0.011, false);
    stick(b, knee, end, 0.011, 0.009, false);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + rnd(), end = fork.clone().add(vec(0.2 * Math.cos(a), 0.22 + 0.08 * rnd(), 0.2 * Math.sin(a)));
    b.wash = W.trunk;
    tube(b, [fork, fork.clone().lerp(end, 0.5).add(vec(0, 0.04, 0)), end], [0.024, 0.019, 0.015], 5);
    for (let j = 0; j < 20; j++) {
      const q = j * 2.4 + 0.2 * rnd(), up = 0.3 + 0.6 * rnd(), d = vec(Math.cos(q), 0, Math.sin(q)), len = 0.3 + 0.1 * rnd();
      const side = vec().crossVectors(d, Y).normalize();
      b.wash = j % 6 === 5 ? W.frondOld : j % 2 ? W.leaf : W.frond;
      let prev = end.clone(), w0 = 0.02;
      for (let i = 1; i <= 3; i++) {
        const s = i / 3, p = end.clone().addScaledVector(d, len * s).addScaledVector(Y, len * (up * s - (0.9 + up) * s * s));
        const w1 = 0.02 * (1 - 0.7 * s), keel = vec(0, -0.008, 0);
        b.tri(prev, p, prev.clone().addScaledVector(side, w0).add(keel));
        b.tri(p, p.clone().addScaledVector(side, w1).add(keel), prev.clone().addScaledVector(side, w0).add(keel));
        b.tri(p, prev, prev.clone().addScaledVector(side, -w0).add(keel));
        b.tri(p, prev.clone().addScaledVector(side, -w0).add(keel), p.clone().addScaledVector(side, -w1).add(keel));
        prev = p;
        w0 = w1;
      }
    }
    if (k === 0) {
      const c = end.clone().add(vec(0.02, -0.08, 0)), kf = 8;
      b.pick = (cc) => (Math.floor((Math.atan2(cc.z - c.z, cc.x - c.x) + Math.PI) * 2.5 + cc.y * 40) % 2 ? W.fruit : W.nut);
      b.kit.loft([-0.05, -0.03, 0.0, 0.03, 0.05].map((y, i) => ring(kf, y, () => 0.055 * [0.4, 0.85, 1, 0.85, 0.35][i]).map((p) => p.add(c))));
      b.pick = null;
    }
  }
  return b.kit.build();
}

/** A pandanus ~0.85 tall: a leaning trunk on splayed stilt roots, three limbs each crowned by a spiral tuft of strap
 *  leaves, one bearing its orange fruit. */
function pandanusKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.trunk), Y = vec(0, 1, 0), foot = vec(0, 0.2, 0.04), fork = vec(0.02, 0.55, 0.12);
  tube(b, [foot, vec(0.01, 0.38, 0.08), fork], [0.04, 0.034, 0.03], 5);
  b.wash = W.root;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.4 * rnd();
    spike(b, foot.clone().add(vec(0, 0.02 * k, 0)), vec(0.2 * Math.cos(a), 0, 0.2 * Math.sin(a) + 0.04), 0.012, a);
  }
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + rnd(), end = fork.clone().add(vec(0.2 * Math.cos(a), 0.22 + 0.08 * rnd(), 0.2 * Math.sin(a)));
    b.wash = W.trunk;
    tube(b, [fork, fork.clone().lerp(end, 0.5).add(vec(0, 0.04, 0)), end], [0.022, 0.018, 0.014], 4);
    for (let j = 0; j < 14; j++) {
      const q = (j / 14) * TAU + 0.2 * rnd(), up = 0.25 + 0.7 * rnd(), d = vec(Math.cos(q), 0, Math.sin(q));
      const side = vec().crossVectors(d, Y).normalize().multiplyScalar(0.018);
      const m = end.clone().addScaledVector(d, 0.14).addScaledVector(Y, 0.1 * up), tip = end.clone().addScaledVector(d, 0.3).addScaledVector(Y, 0.08 * up - 0.12);
      b.wash = j % 5 === 4 ? W.frondOld : j % 2 ? W.leaf : W.frond;
      b.tri(end, m.clone().add(side), m.clone().sub(side));
      b.tri(m.clone().add(side), tip, m.clone().sub(side));
    }
    if (k === 0) {
      b.wash = W.fruit;
      blob(b, end.clone().add(vec(0, -0.05, 0)), 0.05);
    }
  }
  return b.kit.build();
}

/** Beach scrub: a lumpy mound 1 across, lit on top, dark at its skirt. */
function shrubKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 9, jit = Array.from({ length: 4 * k }, () => 0.75 + 0.5 * rnd()), b = new Brush(W.shrub);
  b.pick = (c, n) => (n.y > 0.75 ? W.shrubLit : c.y < 0.1 ? W.shade : W.shrub);
  b.kit.loft([0, 0.2, 0.36, 0.46].map((y, i) => ring(k, y, (j) => [0.5, 0.48, 0.34, 0.12][i] * jit[i * k + j])));
  return b.kit.build();
}

/** Smooth a kit's normals where facets meet at a point, so a rounded form reads round: no facet steps, no polygon
 *  outline inked across it. */
function smooth(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute, nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const acc = new Map<string, V>(), f = vec(), key = (i: number): string => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), a = acc.get(k);
    f.fromBufferAttribute(nrm, i);
    if (a) a.add(f);
    else acc.set(k, f.clone());
  }
  for (let i = 0; i < pos.count; i++) {
    const a = acc.get(key(i))!;
    if (a.lengthSq() > 1e-6) nrm.setXYZ(i, ...(f.copy(a).normalize().toArray() as [number, number, number]));
  }
  return g;
}

/** The reef flat's dead stone: bleached rubble, cream and grey, weathered grey limestone, a cool shade beneath. */
const C = {
  shade: washOf(mix(PIGMENTS.sepia, PIGMENTS.ultramarine, 0.3), 0.45),
  rubble: washOf(mix(PIGMENTS.leadWhite, PIGMENTS.ochre, 0.15), 0.62), grey: washOf(mix(PIGMENTS.leadWhite, PIGMENTS.sepia, 0.3), 0.5),
};

/** A reef-flat paving slab or beachrock slab 1 across: a thin worn limestone plate bedded in the sand, its ragged edge
 *  barely proud of it, pale and smooth on top with grey pits and a weathered grey rim. */
function slabKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 12, jit = Array.from({ length: k }, (_, j) => 0.72 + 0.16 * Math.sin(j * 2.3 + seed) + 0.16 * rnd()), b = new Brush(C.rubble);
  b.pick = (c, n) => (n.y < 0.35 ? C.shade : Math.hypot(c.x, c.z) > 0.38 || hash(Math.floor(c.x * 9) + seed, Math.floor(c.z * 9)) > 0.86 ? C.grey : C.rubble);
  b.kit.loft([ring(k, -0.06, (j) => 0.46 * jit[j]), ring(k, 0.025, (j) => 0.5 * jit[j]), ring(k, 0.045, (j) => 0.42 * jit[j]), ring(k, 0.055, (j) => 0.26 * jit[j]), ring(k, 0.058, (j) => 0.1 * jit[j])]);
  return smooth(b.kit.build());
}

/** Storm-thrown coral rubble 1 across: a heap of bleached stones and broken branch, cream where lit, grey where
 *  weathered, cool beneath. */
function boulderKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(C.rubble), k = 8;
  b.pick = (c, n) => (n.y < 0.05 ? C.shade : n.y < 0.5 && hash(Math.floor(c.x * 12) + seed, Math.floor(c.z * 12)) > 0.5 ? C.grey : C.rubble);
  for (const [x, z, r, h] of [[0, 0, 0.3, 0.36], [-0.3, 0.12, 0.17, 0.2], [0.26, -0.2, 0.14, 0.16]] as const) {
    const jit = Array.from({ length: 3 * k }, () => 0.75 + 0.45 * rnd());
    b.kit.loft([ring(k, -0.08, (j) => r * 0.85 * jit[j]), ring(k, h * 0.45, (j) => r * jit[k + j]), ring(k, h * 0.85, (j) => r * 0.7 * jit[2 * k + j]), ring(k, h, () => r * 0.15)].map((rg) => rg.map((p) => p.add(vec(x, 0, z)))));
  }
  for (let i = 0; i < 2; i++) stick(b, vec(-0.1 + 0.2 * i, 0.03, 0.2 - 0.25 * i), vec(0.1 + 0.15 * rnd(), 0.05, -0.1 + 0.3 * rnd()), 0.025, 0.02, true);
  return smooth(b.kit.build());
}

/** A bleached driftwood log 1 long on x with its root stubs. */
function driftKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.drift);
  b.pick = (_c, n) => (n.y > 0.3 ? W.drift : W.driftDark);
  tube(b, [vec(-0.5, 0.03, 0), vec(-0.15, 0.05, 0.06), vec(0.2, 0.04, -0.03), vec(0.5, 0.03, 0.04)], [0.05, 0.055, 0.045, 0.03], 5);
  for (let k = 0; k < 4; k++) spike(b, vec(-0.5, 0.04, 0), vec(-0.62 - 0.08 * rnd(), 0.05 + 0.1 * rnd(), 0.3 * (rnd() - 0.5)), 0.02, k);
  return b.kit.build();
}

/** A channel withy 2 tall: a driven pole, its foot weed-green, under a tight broom topmark (a bundle of twigs bound on
 *  and splayed upward), dark against sea and sky so it reads as a mark. */
function stakeKit(): THREE.BufferGeometry {
  const b = new Brush(W.pole);
  b.pick = (c) => (c.y < 0.45 ? W.weed : W.pole);
  tube(b, [vec(0, -0.3, 0), vec(0.01, 0.8, 0), vec(0.02, 1.5, 0)], [0.04, 0.034, 0.026], 5);
  b.pick = null;
  for (let k = 0; k < 11; k++) {
    const a = k * 2.4, r = 0.1 + 0.09 * (((k * 7) % 3) / 2);
    spike(b, vec(0.02, 1.38, 0), vec(0.02 + r * Math.cos(a), 1.86 + 0.14 * (((k * 5) % 3) / 2), r * Math.sin(a)), 0.024, k);
  }
  blob(b, vec(0.02, 1.42, 0), 0.04); // the binding
  return b.kit.build();
}

/** A hulk 1 long on x (bow +x), heeled on its low side (−z) with its back broken: a canted keel, the stem standing and
 *  the sternpost snapped, curved frames rising from the keel to the turn of the bilge and broken off at different
 *  heights (shorter on the high side), the low side still planked in ragged strakes with gaps, a garboard strake left
 *  on the high side, a mast stump; weed-green where the tide washes it. Its shape reads as a hull's from any side. */
function hulkKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.timber), RIB = 11, DEPTH = 0.36;
  b.pick = (c) => (c.y < 0.06 ? W.weed : W.timber);
  // the hull's surface: x along it, u from the keel (0) to the gunwale (1), sd the side; the keel rises toward the bow
  // and the stern half sags where the back broke
  const beam = (x: number): number => 0.21 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(x) / 0.52, 2.4)));
  const at = (x: number, u: number, sd: number): V => {
    const z = sd * beam(x) * Math.sin(Math.min(1.2 * u, 1) * Math.PI * 0.5) * (1 - 0.06 * Math.max(0, u - 0.8) / 0.2);
    const rise = 0.14 * Math.max(0, x) ** 2, sag = x < -0.12 ? 0.22 * (x + 0.12) : 0;
    return vec(x, 0.02 + DEPTH * (0.6 * u + 0.4 * u * u) + rise + sag, z);
  };
  // keel, stem and the snapped sternpost
  tube(b, [-0.52, -0.3, -0.12, 0.1, 0.3, 0.5].map((x) => at(x, 0, 1)), [0.026, 0.03, 0.032, 0.03, 0.028, 0.025], 4);
  tube(b, [at(0.5, 0, 1), vec(0.56, 0.2, 0), vec(0.6, 0.42, 0), vec(0.58, 0.5, 0)], [0.026, 0.024, 0.022, 0.018], 4);
  tube(b, [at(-0.52, 0, 1), vec(-0.56, 0.08, 0), vec(-0.57, 0.17, 0.01)], [0.026, 0.024, 0.02], 4);
  // frames: curved ribs from the keel, broken off; the high side (+z) worse
  for (let i = 0; i < RIB; i++) {
    const x = -0.44 + (0.88 * i) / (RIB - 1);
    for (const sd of [-1, 1]) {
      const top = sd < 0 ? 0.65 + 0.35 * rnd() : 0.3 + 0.6 * rnd(), n = 4, pts: V[] = [];
      for (let k = 0; k <= n; k++) pts.push(at(x, (k / n) * top, sd));
      tube(b, pts, pts.map((_, k) => 0.015 - 0.004 * (k / n)), 3);
    }
  }
  // strakes of planking: the low side from the bilge to near the gunwale, ragged at their ends and broken into gaps;
  // a garboard strake on the high side
  const strake = (u0: number, u1: number, sd: number, from: number, to: number, gap: number): void => {
    for (let i = from; i < to; i++) {
      if (rnd() < gap) continue;
      const x0 = -0.44 + (0.88 * i) / (RIB - 1), x1 = -0.44 + (0.88 * (i + 1)) / (RIB - 1), lift = 0.004;
      const p = [at(x0, u0, sd), at(x1, u0, sd), at(x1, u1 - (i === to - 1 ? 0.06 * rnd() : 0), sd), at(x0, u1, sd)].map((v) => v.add(vec(0, 0, sd * lift)));
      b.tri(p[0], p[1], p[2]);
      b.tri(p[0], p[2], p[3]);
    }
  };
  for (const [u0, u1, from, to, gap] of [[0.05, 0.24, 0, RIB - 1, 0.05], [0.27, 0.45, 1, RIB - 2, 0.15], [0.48, 0.64, 2, RIB - 3, 0.3], [0.67, 0.8, 3, 7, 0.4]] as const) strake(u0, u1, -1, from, to, gap);
  strake(0.05, 0.22, 1, 2, RIB - 3, 0.35);
  tube(b, [at(0.08, 0.05, 1).setZ(0), vec(0.1, 0.62, 0.05)], [0.024, 0.016], 4);
  return b.kit.build();
}

/** A placed part: its matrix, foot point and direction, foot and drawn-ground heights, the sim's height there, and its
 *  top's height. */
/** The break's white water standing off the reef, 1 long (x −½…½) and 1 high, faced seaward (+z): a sheet bellied
 *  toward the sea and its top falling back over the reef. */
// The white water as a low bore lying along the reef: a grid along it (x) and across it (aU: 0 its front foot under
// the water, 0.3 the crest, 1 its spent tail on the reef; past 1 the spray flung off the crest). The vertex shader lays
// its section (BORE) as each set rears, spills and slumps; the rest shape here keeps the bounds. All within the kit's
// unit box (x and z in ±0.5), so a part's footprint is its scale. `spray` adds the spray's rows (near the eye only).
function spillKit(nx: number, nu: number, spray: boolean): THREE.BufferGeometry {
  const pos: number[] = [], us: number[] = [], rows = nu + (spray ? 2 : 0);
  const at = (i: number, j: number): void => {
    const x = i / nx - 0.5, u = j <= nu ? j / nu : 1 + (j - nu) * 0.25;
    const s = Math.max(0, (Math.min(u, 1) - 0.3) / 0.7), z = u < 0.3 ? 0.3 : 0.3 - 0.8 * s, y = u < 0.3 ? u / 0.3 : 1 - s;
    pos.push(x, y + Math.max(0, u - 1), z);
    us.push(u);
  };
  for (let j = 0; j < rows; j++) {
    if (spray && j === nu) continue; // the spray stands free of the tail
    for (let i = 0; i < nx; i++) for (const [a, b] of [[i, j], [i + 1, j], [i + 1, j + 1], [i, j], [i + 1, j + 1], [i, j + 1]]) at(a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aU', new THREE.Float32BufferAttribute(us, 1));
  return g;
}

const BORE = /* glsl */ `
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

const SPILL_VERT = /* glsl */ `
uniform float uSeaLevel, uTime;
in float aU;
varying vec3 vWorld, vN;
varying vec2 vAt; // u along the bore (offset per part) and up from the water
varying float vU, vPhase, vDist, vSeed, vEnd, vH;
${BORE}
// the bore's section at u, the crest at zc and its height h (kit units: z seaward, y up): a rounded front rolling down
// to its foot under the water, the white water behind it sloping away over the reef to a thin spent tail; past u = 1
// the spray, flung up and back off the crest
vec2 section(float u, float zc, float h) {
  if (u < 0.3) { float a = u / 0.3 * 1.5707963; return vec2(zc + 0.17 * cos(a), h * (-0.25 + 1.25 * sin(a))); }
  if (u > 1.0) { float s = u - 1.0; return vec2(zc - 0.12 - 0.5 * s, h * (1.0 + 1.6 * s)); }
  float s = (u - 0.3) / 0.7;
  return vec2(mix(zc, -0.5, s), h * mix(0.04, 1.0, (1.0 - s) * (1.0 - s) * (1.0 + 2.0 * s)));
}
vec3 shape(float x, float u, vec3 o, mat3 B, float ph, float set) {
  float rise = smoothstep(0.0, 0.14, ph), slump = smoothstep(0.16, 0.8, ph);
  // the crest rolls in over the reef as it spills; the line is lumpy along its length (the rolls of foam, the same
  // across neighbouring parts), its ends sink into the neighbours'
  float zc = mix(0.3, 0.02, slump);
  float lumps = n3((o + B * vec3(x, 0.0, 0.0)) * 2.2 + vec3(set * 3.1));
  float h = mix(0.6, 1.0, rise) * mix(1.0, 0.5, slump) * (0.75 + 0.5 * lumps) * sqrt(1.0 - smoothstep(0.28, 0.5, abs(x)));
  vec2 zy = section(u, zc, h);
  return vec3(x, zy.y, zy.x);
}
void main() {
  vEnd = position.x;
  vU = aU;
  mat4 M = modelMatrix * instanceMatrix;
  vec3 o = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vSeed = fract(sin(dot(floor(o * 4.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  // the sets peel along the reef (a slow drift of phase with place), each part a little apart from its neighbours
  vPhase = uTime / 7.5 + dot(o, vec3(0.031, 0.047, 0.023)) + 0.06 * vSeed;
  float ph = fract(vPhase), set = floor(vPhase);
  mat3 B = mat3(M);
  vec3 p = shape(position.x, aU, o, B, ph, set);
  vec3 px = shape(position.x + 0.02, aU, o, B, ph, set), pu = shape(position.x, aU + (aU < 1.0 ? 0.02 : 0.05), o, B, ph, set);
  vN = normalize(cross(B * (px - p), B * (pu - p)));
  vec4 wp = M * vec4(p, 1.0);
  wp.xyz += normalize(o) * uSeaLevel;
  float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
  vAt = vec2(position.x * sx + 7.0 * vSeed, p.y * sy);
  vH = sy;
  vWorld = wp.xyz;
  vDist = distance(wp.xyz, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SPILL_FRAG = /* glsl */ `
uniform vec3 uFoam, uFace;
varying vec3 vWorld, vN;
varying vec2 vAt;
varying float vU, vPhase, vDist, vSeed, vEnd, vH;
${BORE}
void main() {
  // a set: the crest rears green and spills (phase 0–0.14), the white water tumbles in over the reef and slumps (to
  // 0.8), then lies low and lacy until the next
  float ph = fract(vPhase), set = floor(vPhase), rise = smoothstep(0.0, 0.14, ph), slump = smoothstep(0.16, 0.8, ph);
  float u = vU, y = vAt.y, x = vAt.x;
  vec3 n = normalize(vN), v = normalize(cameraPosition - vWorld);
  float nv = abs(dot(n, v)), ndl = dot(n, uSun);
  float a;
  vec3 col;
  Paper q = paperPlain(vWorld, n);
  if (u > 1.0) {
    // spray: flecks flung off the spilling crest and carried back over it by the wind, gone as it slumps
    float s = (u - 1.0) / 0.5, fl = n3(vWorld * vec3(13.0, 6.0, 13.0) + vec3(0.0, -2.5 * uTime, set));
    a = smoothstep(0.74, 0.8, fl) * (1.0 - s) * rise * (1.0 - smoothstep(0.1, 0.45, ph)) * 0.85;
    col = mix(parchment(q), uFoam, 0.7);
  } else {
    // the white water in streaks along the reef, densest along the crest; ahead of it the face's water glazed green
    // with foam running down it; behind it lace opening into holes and threads, more as it slumps; its top and ends
    // ragged and soft, never a cut edge
    float along = vAt.x, lumpy = n3(vWorld * 9.0 + vec3(set));
    float streak = n3(vec3(along * 1.1, u * 7.0 + y * 5.0, set * 5.3 + vSeed)) + 0.45 * n3(vec3(along * 3.7, u * 19.0 + y * 13.0, set));
    float lace = n3(vWorld * 6.0 + vec3(0.3 * uTime, set, 0.0)) + 0.35 * n3(vWorld * 15.0 + vec3(set));
    float crest = smoothstep(0.08, 0.24, u) * (1.0 - smoothstep(0.42, 0.7, u));
    float tail = smoothstep(0.38, 0.7, u);
    float dense = mix(mix(0.62, 1.05, crest), 0.5, tail) - 0.3 * slump;
    float white = smoothstep(1.32 - dense - 0.06, 1.32 - dense + 0.06, 0.55 * streak + 0.45 * lace + 0.2 * crest);
    float face = (1.0 - rise * 0.7) * (1.0 - slump) * (1.0 - smoothstep(0.12, 0.3, u)) * smoothstep(-0.1, 0.05, y);
    float ragged = smoothstep(0.0, 0.3, nv + 0.35 * (lumpy - 0.5)) * (1.0 - smoothstep(0.3, 0.5, abs(vEnd) + 0.12 * (lumpy - 0.5)));
    a = max(white, 0.45 * face) * ragged * (1.0 - smoothstep(0.8, 1.0, u)) * smoothstep(-0.12, 0.0, y);
    // the paper left white with a body of lead white, a soft cool shade on the side from the sun and under the rolls,
    // hatched only in the deepest of it; the face's thin green glaze, hatched along its fall
    col = mix(parchment(q) * 1.02, uFoam, 0.6);
    float tone = lightTone(ndl, nv);
    col = mix(col, wash(col, uShade, 0.7), 0.55 * smoothstep(0.25, 0.9, tone));
    col = mix(col, uFace, (1.0 - white) * 0.8 + 0.25 * (1.0 - smoothstep(0.0, 0.08, y)));
    vec2 c = vec2(x * 9.0 + y * 4.0, y * 9.0 - x * 2.0);
    float hat = hatching(c, dFdx(c), dFdy(c), 0.5 * smoothstep(0.5, 1.0, tone) + 0.45 * face * (1.0 - white), 7.0);
    col = mix(col, hatchInk(0.3), 0.3 * hat);
    // a broken pen line now and then along the rolls' tops where the white water turns from the eye
    float edge = (1.0 - smoothstep(0.08, 0.2, nv)) * step(0.58, n3(vec3(x * 4.0, set, vSeed * 9.0))) * crest * white;
    col = mix(col, hatchInk(0.5), edge * 0.6);
  }
  if (a < 0.03) discard;
  writeVeil(col, min(a, 0.96) * (1.0 - smoothstep(40.0, 62.0, vDist)));
}`;

export interface Part { m: THREE.Matrix4; at: V; dir: V; base: number; ground: number; sim: number; top: number }
/** A pass through a reef ring (bearing in degrees from chart east, width u at the crest) and its centre line (outside
 *  in, 1 u apart). */
export interface Channel { reef: number; great: boolean; bearing: number; width: number; crest: { x: number; y: number }; centre: { x: number; y: number }; line: V[] }
export interface CoralPlan {
  palms: Part[][]; pandanus: Part[]; shrubs: Part[]; heads: Part[]; branches: Part[]; tables: Part[]; slabs: Part[];
  boulders: Part[]; drift: Part[]; stakes: Part[]; hulks: Part[];
  /** Where the surf breaks at mean tide (SURF's rule, 1 u apart). */
  surf: V[];
  /** The break standing up off the water near the eye: spilling white water along each exposed reef front (SURF's rule,
   *  ~0.9 u apart, faced seaward). */
  spill: Part[];
  /** Passes open at every tide; sills a hull clears only at high water. */
  channels: Channel[]; sills: Channel[];
  turtles: { swim: V[]; nest: V[] }; fish: V[]; seabirds: V[]; voices: { at: V; loud: number }[];
}

const surfaceOut = (): Surface => ({ height: 0, normal: vec(), up: 1, ground: GROUND.beach as Ground, region: RI });
/** The drawn ground's height at `dir` (what every part is seated on). */
export const groundAt = (field: TerrainField, dir: V): number => field.surface(dir, -10, surfaceOut()).height;

export function planCoral(field: TerrainField): CoralPlan {
  const geo = field.geo, rnd = seeded(717), S = surfaceOut(), lee = CORAL.lee, mark = REGION.landmark;
  const sim = (x: number, y: number): number => heightAt(geo, chartDir(RI, x, y));
  const tan = (x: number, y: number, dx: number, dy: number): V =>
    chartDir(RI, x + dx * 0.25, y + dy * 0.25).sub(chartDir(RI, x - dx * 0.25, y - dy * 0.25)).normalize();
  const plan: CoralPlan = {
    palms: [[], [], []], pandanus: [], shrubs: [], heads: [], branches: [], tables: [], slabs: [], boulders: [],
    drift: [], stakes: [], hulks: [], surf: [], spill: [], channels: [], sills: [], turtles: { swim: [], nest: [] }, fish: [],
    seabirds: [], voices: [],
  };
  const place = (list: Part[], x: number, y: number, o: { sink: number; fwd: V; yaw?: number; tilt?: number; s: number; sy?: number; sz?: number; hug?: boolean; kitH: number }): Part => {
    const dir = chartDir(RI, x, y), ground = field.surface(dir, -10, S).height, base = ground - o.sink, sy = o.sy ?? o.s;
    const up = o.hug && S.normal.lengthSq() > 0.25 && S.normal.dot(dir) > 0.6 ? S.normal.clone() : dir, at = lift(dir, base);
    const p: Part = { m: pose(new THREE.Matrix4(), at, up, o.fwd, o.yaw ?? 0, o.tilt ?? 0, o.s, sy, o.sz ?? o.s), at, dir, base, ground, sim: heightAt(geo, dir), top: base + o.kitH * sy };
    list.push(p);
    return p;
  };
  // the passes: walk each ring's crest in the sim; a run of bearings a hull clears at low water is a channel, one it
  // clears only at high water a sill
  REGION.strokes.forEach((s, si) => {
    if (s.k !== 'reef') return;
    const crest: number[] = [], rad: number[] = [];
    for (let b = 0; b < 360; b++) {
      // only the ring's own band (its ellipse ± its width), so a patch reef beyond the mouth is not taken for its crest
      const c = Math.cos(b * DEG), sn = Math.sin(b * DEG), lc = Math.cos((b - s.rot) * DEG), ls = Math.sin((b - s.rot) * DEG);
      const er = (s.rx * s.ry) / Math.sqrt(s.ry * s.ry * lc * lc + s.rx * s.rx * ls * ls), r0 = er - s.w - 3, r1 = er + s.w + 3;
      let best = -Infinity, br = r0;
      for (let rr = r0; rr <= r1; rr += 0.5) {
        const h = sim(s.x + rr * c, s.y + rr * sn);
        if (h > best) { best = h; br = rr; }
      }
      crest.push(best);
      rad.push(br);
    }
    const kinds: [(h: number) => boolean, Channel[], number][] = [[(h) => h < LOW, plan.channels, 2], [(h) => h >= LOW && h < BLOCK, plan.sills, 3]];
    for (const [pass, list, least] of kinds) {
      const start = crest.findIndex((h) => !pass(h));
      if (start < 0) continue;
      let run: number[] = [];
      const emit = (): void => {
        const mid = run[run.length >> 1], rc = rad[mid], width = run.length * DEG * rc;
        run = [];
        if (width < least) return;
        const c = Math.cos(mid * DEG), sn = Math.sin(mid * DEG), line: V[] = [];
        for (let d = 3; d >= -Math.min(8, 0.45 * rc); d--) line.push(chartDir(RI, s.x + (rc + d) * c, s.y + (rc + d) * sn));
        list.push({ reef: si, great: s.great, bearing: mid, width, crest: { x: s.x + rc * c, y: s.y + rc * sn }, centre: { x: s.x, y: s.y }, line });
      };
      for (let i = 1; i <= 360; i++) {
        const b = (start + i) % 360;
        if (pass(crest[b])) run.push(b);
        else if (run.length) emit();
      }
    }
  });
  // nothing of the reef within `CLEAR` u of a channel's centre line
  const lines = plan.channels.map((c) => {
    const rc = Math.hypot(c.crest.x - c.centre.x, c.crest.y - c.centre.y), ux = (c.crest.x - c.centre.x) / rc, uy = (c.crest.y - c.centre.y) / rc;
    const inner = Math.min(8, 0.45 * rc);
    return { x: c.centre.x + (rc - inner) * ux, y: c.centre.y + (rc - inner) * uy, ux, uy, len: inner + 3 };
  });
  const open = (x: number, y: number, r = CLEAR): boolean => lines.some((l) => {
    const t = Math.min(l.len, Math.max(0, (x - l.x) * l.ux + (y - l.y) * l.uy));
    return Math.hypot(x - l.x - t * l.ux, y - l.y - t * l.uy) < r;
  });
  for (let y = -66; y <= 66; y += CORAL.step) {
    for (let x = -66; x <= 66; x += CORAL.step) {
      const px = x + (rnd() - 0.5) * 0.9, py = y + (rnd() - 0.5) * 0.9, h = sim(px, py), r = rnd(), dir = chartDir(RI, px, py);
      if (surfAt(geo, dir, 0) > 0.5) plan.surf.push(dir);
      if (h < LOW) {
        if (h > -5 && Math.hypot(px - mark.x, py - mark.y) < mark.r - 2 && r < 0.05) plan.turtles.swim.push(dir);
        continue;
      }
      const ground = field.surface(dir, -10, S).height;
      const gx = sim(px + 0.7, py) - sim(px - 0.7, py), gy = sim(px, py + 0.7) - sim(px, py - 0.7), gl = Math.hypot(gx, gy);
      const ox = gl > 1e-4 ? -gx / gl : 1, oy = gl > 1e-4 ? -gy / gl : 0;
      const seaward = sim(px + 6 * ox, py + 6 * oy) < -6, out = tan(px, py, ox, oy), east = tan(px, py, 1, 0);
      const windward = -(ox * lee[0] + oy * lee[1]) > 0.3, yaw = rnd() * TAU;
      if (h > LAND) continue; // the motus are dressed below, on a finer grid
      // the reef: a hull grounds here at low water at least (and no part reaching within CLEAR of a channel's line)
      if (open(px, py, CLEAR + 0.9)) continue;
      if (h >= BLOCK) {
        if (Math.abs(coastAt(geo, dir)) < 1.2 && h > 0.1 && r > 0.8) place(plan.slabs, px, py, { sink: 0.03, fwd: out, tilt: 0.1, s: 0.4 + 0.35 * rnd(), hug: true, kitH: 0.06 });
        else if (seaward && r < 0.35) place(plan.slabs, px, py, { sink: 0.03, fwd: east, yaw, s: 0.3 + 0.3 * rnd(), hug: true, kitH: 0.06 });
        else if (seaward && windward && r < 0.6) place(plan.boulders, px, py, { sink: 0.1, fwd: east, yaw, tilt: 0.3 * (rnd() - 0.5), s: 0.22 + 0.2 * rnd(), kitH: 0.42 });
        // no living coral on the flat: it would stand at the waterline; dead rubble, bedded, a hand to a forearm across
        else if (r < 0.78) place(plan.boulders, px, py, { sink: 0.06, fwd: east, yaw, tilt: 0.2 * (rnd() - 0.5), s: 0.14 + 0.16 * rnd(), sy: 0.6 * (0.14 + 0.16 * rnd()), kitH: 0.42 });
      } else if (r < 0.5) {
        // the reef front: corals whose tops stay under the lowest water, so the sea paints them on its floor, seen through
        // the water and tinted by its depth (sea.ts); never drawn standing at or above the waterline
        const k = rnd(), kind: [Part[], number, number] = k < 0.4 ? [plan.heads, 0.46, 0.08] : k < 0.75 ? [plan.branches, 0.45, 0.05] : [plan.tables, 0.36, 0.04];
        const s = Math.min(0.7 + 0.9 * rnd(), (UNDER - (ground - kind[2])) / kind[1]);
        if (s >= 0.2) {
          const p = place(kind[0], px, py, { sink: kind[2], fwd: east, yaw, s, kitH: kind[1] });
          if (plan.fish.length < 160 && rnd() < 0.4) plan.fish.push(p.dir);
        }
      }
    }
  }
  // the motus, dressed on a finer grid: coconut groves broken by clearings (those on the beach crest leaning out over the
  // sand), pandanus inland, scrub beneath, drift and turtles' nests along the strand
  const lr = seeded(718);
  for (let y = -66; y <= 66; y += MOTU) {
    for (let x = -66; x <= 66; x += MOTU) {
      const px = x + (lr() - 0.5) * 0.8 * MOTU, py = y + (lr() - 0.5) * 0.8 * MOTU, r = lr(), q = lr();
      if (sim(px, py) <= LAND) continue;
      const dir = chartDir(RI, px, py);
      if (field.surface(dir, -10, S).up < 0.75) continue;
      const gx = sim(px + 0.7, py) - sim(px - 0.7, py), gy = sim(px, py + 0.7) - sim(px, py - 0.7), gl = Math.hypot(gx, gy);
      const ox = gl > 1e-4 ? -gx / gl : 1, oy = gl > 1e-4 ? -gy / gl : 0;
      const inland = -coastAt(geo, dir), leeFwd = tan(px, py, lee[0], lee[1]);
      const grove = 0.5 + 0.5 * Math.sin(0.8 * px + 2 * Math.sin(0.5 * py)) * Math.cos(0.6 * py - 1.7 * Math.sin(0.4 * px));
      if (inland < 0.5) {
        if (r < 0.1) place(plan.drift, px, py, { sink: 0.02, fwd: tan(px, py, -oy, ox), yaw: 0.6 * (lr() - 0.5), s: 0.8 + lr(), hug: true, kitH: 0.08 });
        else if (r > 0.93) plan.turtles.nest.push(dir);
        continue;
      }
      if (r < 0.4 + 0.45 * grove) {
        const young = lr() < 0.3, edge = inland < 2.5;
        const p = place(plan.palms[young ? 2 : lr() < 0.5 ? 0 : 1], px, py, {
          sink: 0.06, fwd: edge ? tan(px, py, 0.6 * ox + 0.4 * lee[0], 0.6 * oy + 0.4 * lee[1]) : leeFwd, yaw: 0.5 * (lr() - 0.5),
          tilt: edge ? 0.14 + 0.22 * lr() : 0.03 + 0.1 * lr(), s: young ? 1.1 + 0.6 * lr() : 2.2 + 1.3 * lr(), kitH: 1,
        });
        if (!young && plan.seabirds.length < 60 && lr() < 0.2) plan.seabirds.push(lift(dir, p.top));
      } else if (inland > 1.2 && r < 0.82) place(plan.pandanus, px, py, { sink: 0.05, fwd: leeFwd, yaw: lr() * TAU, tilt: 0.12 * lr(), s: 1.5 + 0.8 * lr(), kitH: 0.85 });
      else if (q < 0.5) place(plan.shrubs, px, py, { sink: 0.06, fwd: leeFwd, yaw: lr() * TAU, s: 0.7 + 0.8 * lr(), sy: 0.6 + 0.5 * lr(), kitH: 0.46 });
    }
  }
  // withies on the reef edge both sides of every channel (the Great Lagoon's staked all through), and the hulk that
  // missed the Great Lagoon's, heeled on the reef flat beside its mouth: each found by walking across the channel from
  // its centre line until the reef stops a keel at any tide
  for (const c of plan.channels) {
    const rc = Math.hypot(c.crest.x - c.centre.x, c.crest.y - c.centre.y), ux = (c.crest.x - c.centre.x) / rc, uy = (c.crest.y - c.centre.y) / rc;
    const across = (d: number, sd: number, beyond: number, edge: number): { x: number; y: number } | null => {
      const x0 = c.centre.x + (rc + d) * ux, y0 = c.centre.y + (rc + d) * uy;
      for (let t = CLEAR; t < 11; t += 0.25) {
        if (sim(x0 - sd * uy * t, y0 + sd * ux * t) < edge) continue;
        const x = x0 - sd * uy * (t + beyond), y = y0 + sd * ux * (t + beyond);
        return sim(x, y) >= edge ? { x, y } : null;
      }
      return null;
    };
    // the withies stand where a keel strikes at mean tide, through the mouth (outside the crest) and in, both sides,
    // tall enough to stand well clear of high water
    for (const d of c.great ? [8, 6, 4, 2, 0, -2, -4, -6].filter((d) => d >= -Math.min(8, 0.45 * rc)) : [1.5, -1]) {
      for (const sd of [-1, 1]) {
        const e = across(d, sd, 0.4, -DRAFT);
        if (!e || open(e.x, e.y, 1.1)) continue;
        const g = groundAt(field, chartDir(RI, e.x, e.y)), sc = 1 + 0.15 * rnd(), sy = Math.max(sc, (TIDE.amp + 0.9 - (g - 0.3)) / 2);
        place(plan.stakes, e.x, e.y, { sink: 0.3, fwd: tan(e.x, e.y, ux, uy), yaw: rnd() * TAU, tilt: 0.08 * (rnd() - 0.5), s: sc, sy, kitH: 2 });
      }
    }
    // the hulk lies across the reef beside the mouth, its bow toward the pass it missed, broadside to a ship coming in
    const e = c.great ? across(0, 1, 1.4, BLOCK) : null;
    if (e && !open(e.x, e.y, 2.5)) {
      const p = place(plan.hulks, e.x, e.y, { sink: 0.1, fwd: tan(e.x, e.y, uy, -ux), yaw: -0.45, tilt: 0.32, s: 3.4, kitH: 0.62 });
      plan.seabirds.push(lift(p.dir, p.top));
    }
  }
  // the break's white water standing off the reef front, on a fine grid thinned to ~0.9 u (none over a pass)
  const taken = new Set<string>(), sr = seeded(719);
  for (let y = -66; y <= 66; y += 0.45) {
    for (let x = -66; x <= 66; x += 0.45) {
      const px = x + (sr() - 0.5) * 0.4, py = y + (sr() - 0.5) * 0.4, dir = chartDir(RI, px, py);
      const c = coastAt(geo, dir);
      if (c < -0.1 || c > 1.1) continue;
      const loud = surfAt(geo, dir, 0);
      if (loud < 0.3 || open(px, py, CLEAR + 1.3)) continue;
      const key = `${Math.round(px / 0.9)},${Math.round(py / 0.9)}`;
      if (taken.has(key)) continue;
      taken.add(key);
      const gx = coastAt(geo, chartDir(RI, px + 0.5, py)) - coastAt(geo, chartDir(RI, px - 0.5, py));
      const gy = coastAt(geo, chartDir(RI, px, py + 0.5)) - coastAt(geo, chartDir(RI, px, py - 0.5)), gl = Math.hypot(gx, gy);
      if (gl < 1e-4) continue;
      // the break, and the spent white water rolling on over the reef behind it (lower, where the reef is awash)
      for (const [back, tall] of [[0, 0.42 + 0.22 * sr()], [1.1, 0.16 + 0.08 * sr()]]) {
        const bx = px - (back * gx) / gl, by = py - (back * gy) / gl, d = chartDir(RI, bx, by), ground = heightAt(geo, d);
        if (back > 0 && ground > TIDE.amp * 0.5) continue;
        const at = lift(d, -0.04), sy = tall * (0.6 + 0.4 * loud);
        plan.spill.push({ m: pose(new THREE.Matrix4(), at, d, tan(bx, by, gx / gl, gy / gl), 0.25 * (sr() - 0.5), 0, 1.5 + 0.6 * sr(), sy, 1 - 0.4 * Math.sign(back)), at, dir: d, base: -0.04, ground, sim: ground, top: sy });
      }
    }
  }
  // the surf's voices: its breakers binned 10 u apart, loudest where most break
  const bins = new Map<string, { at: V; n: number }>();
  for (const d of plan.surf) {
    const k = [d.x, d.y, d.z].map((v) => Math.round((v * R) / 10)).join(','), b = bins.get(k);
    if (b) { b.at.add(d); b.n++; } else bins.set(k, { at: d.clone(), n: 1 });
  }
  const most = Math.max(1, ...[...bins.values()].map((b) => b.n));
  plan.voices = [...bins.values()].map((b) => ({ at: b.at.normalize(), loud: b.n / most }));
  return plan;
}

export class CoralAtolls {
  readonly group = new THREE.Group();
  readonly plan: CoralPlan;
  /** WP23: turtles' lagoon water and nesting beaches, reef fish over the reef-front corals, seabirds' perches. */
  readonly turtles: { swim: readonly V[]; nest: readonly V[] };
  readonly fish: readonly V[];
  readonly seabirds: readonly V[];
  /** WP28: where the surf breaks and how loud (0–1). */
  readonly voices: readonly { at: V; loud: number }[];
  private readonly material: THREE.ShaderMaterial;
  private readonly spillMaterial: THREE.ShaderMaterial;
  private readonly fixed: Draw[];
  /** [draw, parts, from, to (u from the eye), drawn only while dry] */
  private readonly near: [Draw, Part[], number, number, boolean][];
  /** The break's draws (near, far): white water only where the reef under it is awash. */
  private readonly spills: Draw[];
  private drawn = NaN;
  private readonly swell: Swell;
  private readonly seen = vec(1e9, 0, 0);

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = (this.plan = planCoral(field));
    this.turtles = plan.turtles;
    this.fish = plan.fish;
    this.seabirds = plan.seabirds;
    this.voices = plan.voices;
    this.swell = swell;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -1;
    this.material.polygonOffsetUnits = -2;
    const fixed = (kit: THREE.BufferGeometry, parts: Part[]): Draw => new Draw(kit, this.material, parts.length).fill(parts.map((p) => p.m));
    this.fixed = [
      fixed(shrubKit(9), plan.shrubs),
      fixed(driftKit(4), plan.drift), fixed(stakeKit(), plan.stakes), fixed(hulkKit(8), plan.hulks),
    ];
    // the reef's parts near the eye (the pavement only while dry: it goes under the drawn water, not through it; the
    // reef-front corals are the sea's, painted on its floor under the water); palms in full near the eye, sketched beyond
    const near: [THREE.BufferGeometry, Part[], number, number, boolean][] = [
      [slabKit(12), plan.slabs, 0, CORAL.near, true], [boulderKit(13), plan.boulders, 0, CORAL.near, false],
      ...[11, 29, 23].flatMap((seed, k): [THREE.BufferGeometry, Part[], number, number, boolean][] => [
        [palmNearKit(seed, k === 2), plan.palms[k], 0, CORAL.leaflets, false], [palmKit(seed, k === 2), plan.palms[k], CORAL.leaflets, CORAL.palms, false],
        [palmKit(seed, k === 2, true), plan.palms[k], CORAL.palms, 1e4, false]]),
      [pandanusNearKit(5), plan.pandanus, 0, CORAL.drawn, false], [pandanusKit(5), plan.pandanus, CORAL.drawn, 1e4, false]];
    this.near = near.map(([kit, parts, from, to, dry]) => [new Draw(kit, this.material, parts.length), parts, from, to, dry]);
    // the break standing off the reef near the eye (past ~60 u the sea's own ribbon of white is the surf)
    this.spillMaterial = inkMaterial(style, { vertexShader: SPILL_VERT, fragmentShader: SPILL_FRAG, veil: true, side: THREE.DoubleSide,
      uniforms: { uSeaLevel: swell.uniforms.uSeaLevel, uFoam: { value: linearVec(PIGMENTS.leadWhite) }, uFace: { value: linearVec(PIGMENTS.verdigris) } } });
    this.spills = [new Draw(spillKit(10, 7, true), this.spillMaterial, plan.spill.length), new Draw(spillKit(5, 4, false), this.spillMaterial, plan.spill.length)];
    this.near.push([this.spills[0], plan.spill, 0, CORAL.drawn, false], [this.spills[1], plan.spill, CORAL.drawn, 62, false]);
    this.group.add(...this.draws.map((d) => d.mesh));
  }

  private get draws(): Draw[] {
    return [...this.fixed, ...this.near.map(([d]) => d)];
  }

  /** The reef's corals near the eye, the pavement only while the tide leaves it dry. */
  update(eye: V): void {
    this.group.visible = regionSeen(RI, eye, 90);
    if (!this.group.visible) return;
    const level = this.swell.uniforms.uSeaLevel.value as number;
    if (eye.distanceToSquared(this.seen) < 2.25 && Math.abs(level - this.drawn) < 0.01) return;
    this.seen.copy(eye);
    this.drawn = level;
    for (const [d, parts, from, to, dry] of this.near) {
      const wet = this.spills.includes(d);
      d.begin();
      for (const p of parts) {
        const r2 = eye.distanceToSquared(p.at);
        if (r2 >= from * from && r2 < to * to && (!dry || p.ground > level - 0.02) && (!wet || p.ground < level - 0.08)) d.add(p.m);
      }
      d.end();
    }
  }

  get triangles(): number {
    return this.group.visible ? this.draws.reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    this.material.dispose();
    this.spillMaterial.dispose();
    for (const d of this.draws) d.mesh.geometry.dispose();
  }
}

/** The composition root's Coral Atolls (MODULES): the reefs' surf, corals and foam, the motus' palms, the channels. */
export function createCoralAtolls(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createCoralAtolls: the sea and terrain are built first (MODULES order)');
  const coral = new CoralAtolls(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(coral.group);
  return {
    frame() {
      coral.update(ctx.camera.position);
    },
    dispose() {
      ctx.scene.remove(coral.group);
      coral.dispose();
    },
  };
}
