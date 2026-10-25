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
import { PIGMENTS } from '../../style/palette.ts';
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
/** Ground (u) above which a coral stands dry at mean tide: drawn as a low massive head, never a stalked table. */
const DRY = -0.05;
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
  const rnd = seeded(seed), b = new Brush(W.trunk), n = far ? 2 : young ? 4 : 7, bend = young ? 0.12 : 0.26 + 0.14 * rnd();
  const path: V[] = [], radii: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    path.push(vec(0.015 * Math.sin(t * 4 + seed), t, bend * t * t + 0.05 * t * Math.sin(t * 3 + seed)));
    radii.push((i === 0 ? 0.058 : 0.036 - 0.012 * t) * (young ? 1.5 : 1));
  }
  b.pick = (c) => (Math.floor(c.y * 26) % 2 ? W.trunk : W.scar);
  tube(b, path, radii, far ? 3 : 6);
  b.pick = null;
  const top = path[n], Y = vec(0, 1, 0), count = far ? 8 : young ? 9 : 12, L = young ? 0.62 : 0.5, SEG = far ? 2 : 5, fronds = laid(b);
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * TAU + 0.3 * rnd(), d = vec(Math.sin(phi), 0, Math.cos(phi) + 0.6).normalize(), age = k % 4;
    const droop = young ? 0.35 + 0.25 * age : 0.45 + 0.28 * age, rise = young ? 0.55 : 0.45 - 0.06 * age;
    const len = L * (0.85 + 0.3 * rnd()) * (age === 0 ? 0.8 : 1), side = vec().crossVectors(d, Y).normalize();
    b.wash = age === 3 && !young && k % 8 === 3 ? W.frondDead : age === 3 && k % 8 === 7 ? W.frondOld : age === 0 ? W.frondPale : W.frond;
    let prev = top.clone();
    for (let i = 1; i <= SEG; i++) {
      const s = i / SEG, p = top.clone().addScaledVector(d, len * s).addScaledVector(Y, len * (rise * s - droop * s * s));
      const w = len * 0.2 * (1 - 0.55 * s) * (i === 1 ? 0.6 : 1), mid = prev.clone().lerp(p, 0.5);
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
  return liftNormals(b.kit.build(), [lit]);
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

/** A brain coral 1 across, 0.2 tall, grown up to the low-water mark: a low dome whose meandering ridges show as bands
 *  of pale and deeper ochre, a living rim of rose, the dead crown of a micro-atoll greyed with algae. */
function massiveKit(seed: number, far = false): THREE.BufferGeometry {
  const rnd = seeded(seed), k = far ? 7 : 12, jit = Array.from({ length: 5 * k }, () => 0.88 + 0.24 * rnd()), b = new Brush(W.coral);
  const ph = rnd() * TAU;
  b.pick = (c, n) => {
    if (n.y < 0.25) return W.under;
    if (c.y > 0.17) return W.algae;
    const m = Math.sin(c.x * 26 + 2.2 * Math.sin(c.z * 19 + ph)) + 0.6 * Math.sin(c.z * 23 + ph);
    return c.y < 0.07 ? W.rose : m > 0.2 ? W.coralPale : W.coral;
  };
  const rings = far ? [0, 2, 4] : [0, 1, 2, 3, 4];
  b.kit.loft(rings.map((i) => ring(k, (j) => [-0.04, 0.06, 0.13, 0.18, 0.2][i] + 0.012 * Math.sin(j * 2.3 + i + seed), (j) => [0.5, 0.48, 0.4, 0.27, 0.1][i] * jit[i * k + j])));
  return b.kit.build();
}

/** A thicket of branching (staghorn) coral 1 across, ~0.26 tall: stout trunks forking twice, the growing tips pale,
 *  ochre and umber below where the light fails. */
function branchKit(seed: number, far = false): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.coral);
  b.pick = (c) => (c.y > 0.21 ? W.tip : c.y > 0.12 ? W.coralPale : c.y > 0.04 ? W.coral : W.under);
  const grow = (from: V, dir: V, len: number, r: number, depth: number): void => {
    const to = from.clone().addScaledVector(dir, len);
    stick(b, from, to, r, r * 0.7, depth === 0);
    if (depth === 0) return;
    for (const turn of [-0.55, 0.5 + 0.2 * rnd()]) {
      const d = dir.clone().applyAxisAngle(vec(0, 1, 0), turn * 1.4).add(vec(0, 0.35, 0)).normalize();
      grow(to, d.lerp(vec(dir.x, d.y, dir.z).normalize(), 0.3).normalize(), len * (0.65 + 0.15 * rnd()), r * 0.72, depth - 1);
    }
  };
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU + 0.6 * rnd(), out = 0.06 + 0.12 * rnd();
    grow(vec(out * Math.cos(a), -0.03, out * Math.sin(a)), vec(0.55 * Math.cos(a), 0.8, 0.55 * Math.sin(a)).normalize(), (0.12 + 0.04 * rnd()) * (far ? 1.6 : 1), 0.03, far ? 0 : 2);
  }
  return b.kit.build();
}

/** A table coral 1 across on its stalk, 0.2 tall: a plate ribbed out from its heart, its rim scalloped and pale, a
 *  smaller tier beneath it, umber in the shade under the plate. */
function tableKit(seed: number, far = false): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.under), k = far ? 8 : 14;
  tube(b, [vec(0, -0.04, 0), vec(0.01, 0.1, 0), vec(0.02, 0.16, 0)], [0.07, 0.05, 0.06], 5);
  for (const [y, R0, off] of ([[0.19, 0.5, 0], [0.1, 0.3, 0.12]] as const).slice(0, far ? 1 : 2)) {
    const top = vec(0.02 + off, y + 0.015, off * 0.5);
    const rim = ring(k, (j) => y - 0.02 + 0.012 * Math.sin(j * 1.7 + seed), (j) => R0 * (0.82 + 0.18 * Math.abs(Math.sin(j * 1.9 + seed)) + 0.08 * rnd()));
    for (const p of rim) p.add(vec(off, 0, off * 0.5));
    const lip = rim.map((p) => p.clone().sub(top).multiplyScalar(1.06).add(top).setY(p.y - 0.035));
    for (let j = 0; j < k; j++) {
      const a = rim[j], c = rim[(j + 1) % k];
      b.wash = j % 2 ? W.coral : W.coralPale;
      b.tri(top, c, a);
      b.wash = W.tip;
      b.tri(a, c, lip[(j + 1) % k]);
      b.wash = W.under;
      b.tri(a, lip[(j + 1) % k], lip[j]);
    }
  }
  return b.kit.build();
}

/** A reef-flat paving slab or beachrock slab 1 across, its facets mottled rose, ochre, grey and bleached. */
function slabKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 7, jit = Array.from({ length: k }, () => 0.65 + 0.5 * rnd()), b = new Brush(W.rock);
  b.pick = (c, n) => (n.y < 0.5 ? W.under : [W.rock, W.bleach, W.bleach, W.coral][Math.floor(hash(c.x + seed, c.z) * 4)]);
  b.kit.loft([ring(k, -0.06, (j) => 0.5 * jit[j]), ring(k, 0.07, (j) => 0.47 * jit[j]), ring(k, 0.1, (j) => 0.3 * jit[j])]);
  return b.kit.build();
}

/** A storm-thrown coral boulder 1 across: bleached rubble, grey where weathered, dark beneath. */
function boulderKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 10, jit = Array.from({ length: 4 * k }, () => 0.7 + 0.5 * rnd()), b = new Brush(W.bleach);
  b.pick = (c, n) => (n.y < 0 ? W.under : n.y < 0.45 && hash(c.x + seed, c.z) > 0.45 ? W.rock : W.bleach);
  b.kit.loft([ring(k, -0.1, (j) => 0.42 * jit[j]), ring(k, 0.12, (j) => 0.5 * jit[k + j]), ring(k, 0.3, (j) => 0.4 * jit[2 * k + j]), ring(k, 0.42, (j) => 0.16 * jit[3 * k + j])]);
  return b.kit.build();
}

/** A bleached driftwood log 1 long on x with its root stubs. */
function driftKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.drift);
  b.pick = (_c, n) => (n.y > 0.3 ? W.drift : W.driftDark);
  tube(b, [vec(-0.5, 0.03, 0), vec(-0.15, 0.05, 0.06), vec(0.2, 0.04, -0.03), vec(0.5, 0.03, 0.04)], [0.05, 0.055, 0.045, 0.03], 5);
  for (let k = 0; k < 4; k++) spike(b, vec(-0.5, 0.04, 0), vec(-0.62 - 0.08 * rnd(), 0.05 + 0.1 * rnd(), 0.3 * (rnd() - 0.5)), 0.02, k);
  return b.kit.build();
}

/** A channel withy 1.85 tall: a weathered driven pole under a broom topmark. */
function stakeKit(): THREE.BufferGeometry {
  const b = new Brush(W.pole);
  tube(b, [vec(0, -0.3, 0), vec(0.02, 1.6, 0)], [0.045, 0.03], 4);
  for (let k = 0; k < 4; k++) spike(b, vec(0.02, 1.45, 0), vec(0.02 + 0.16 * Math.cos(k * 1.6), 1.85, 0.16 * Math.sin(k * 1.6)), 0.015, k);
  return b.kit.build();
}

/** A hulk 1 long on x: keel, stem and sternpost, ribs broken off at different heights, a strake of planking on the low
 *  side, a mast stump; weed-green where the tide washes it. */
function hulkKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.timber), RIB = 10;
  b.pick = (c) => (c.y < 0.07 ? W.weed : W.timber);
  tube(b, [vec(-0.55, 0.02, 0), vec(0, -0.01, 0), vec(0.5, 0.03, 0)], [0.025, 0.03, 0.025], 4);
  spike(b, vec(0.5, 0, 0), vec(0.6, 0.38, 0), 0.03);
  spike(b, vec(-0.55, 0, 0), vec(-0.58, 0.34, 0), 0.03);
  for (let i = 0; i < RIB; i++) {
    const x = -0.45 + (0.9 * i) / (RIB - 1), beam = 0.2 * Math.sin(Math.PI * (0.15 + (0.7 * i) / (RIB - 1)));
    for (const sd of [-1, 1]) {
      const keep = 2 + Math.floor(rnd() * 3);
      const pts = [vec(x, 0, 0), vec(x, 0.06, sd * beam * 0.7), vec(x, 0.16, sd * beam), vec(x, 0.27, sd * beam * 1.02), vec(x, 0.36, sd * beam * 0.95)].slice(0, keep + 1);
      for (let j = 0; j + 1 < pts.length; j++) {
        const a = pts[j], c = pts[j + 1], dx = 0.014;
        b.tri(vec(a.x - dx, a.y, a.z), vec(c.x - dx, c.y, c.z), vec(c.x + dx, c.y, c.z));
        b.tri(vec(a.x - dx, a.y, a.z), vec(c.x + dx, c.y, c.z), vec(a.x + dx, a.y, a.z));
      }
    }
  }
  for (let i = 1; i < RIB - 2; i++) {
    const x0 = -0.45 + (0.9 * i) / (RIB - 1), x1 = x0 + 0.9 / (RIB - 1);
    b.tri(vec(x0, 0.06, -0.13), vec(x1, 0.06, -0.13), vec(x1, 0.15, -0.19));
    b.tri(vec(x0, 0.06, -0.13), vec(x1, 0.15, -0.19), vec(x0, 0.15, -0.19));
  }
  tube(b, [vec(0.05, 0, 0), vec(0.07, 0.55, 0.02)], [0.022, 0.016], 4);
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
  float h = mix(0.45, 1.0, rise) * mix(1.0, 0.3, slump) * (0.75 + 0.5 * lumps) * sqrt(1.0 - smoothstep(0.28, 0.5, abs(x)));
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
        if (Math.abs(coastAt(geo, dir)) < 1.2 && h > 0.1 && r > 0.8) place(plan.slabs, px, py, { sink: 0.05, fwd: out, tilt: 0.12, s: 0.9 + 0.8 * rnd(), sy: 1.4, hug: true, kitH: 0.1 });
        else if (seaward && r < 0.35) place(plan.slabs, px, py, { sink: 0.04, fwd: east, yaw, s: 0.6 + 0.7 * rnd(), sy: 1.2, hug: true, kitH: 0.1 });
        else if (seaward && windward && r < 0.6) place(plan.boulders, px, py, { sink: 0.1, fwd: east, yaw, tilt: 0.3 * (rnd() - 0.5), s: 0.3 + 0.55 * rnd(), kitH: 0.42 });
        else if (r < 0.62) {
          const k = rnd();
          if (k < 0.4) place(plan.heads, px, py, { sink: 0.08, fwd: east, yaw, s: 0.6 + rnd(), kitH: 0.46 });
          else if (k < 0.75) place(plan.branches, px, py, { sink: 0.05, fwd: east, yaw, s: 0.7 + 0.8 * rnd(), kitH: 0.45 });
          else place(plan.tables, px, py, { sink: 0.04, fwd: east, yaw, s: 0.7 + 0.7 * rnd(), kitH: 0.36 });
        }
      } else if (r < 0.5) {
        // the reef front: awash at low water, crossed at high, so every top stays under a keel then
        const k = rnd(), kind: [Part[], number, number] = k < 0.4 ? [plan.heads, 0.46, 0.08] : k < 0.75 ? [plan.branches, 0.45, 0.05] : [plan.tables, 0.36, 0.04];
        const s = Math.min(0.7 + 0.9 * rnd(), (BLOCK - 0.05 - (ground - kind[2])) / kind[1]);
        if (s >= 0.35) {
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
    const across = (d: number, sd: number, beyond: number): { x: number; y: number } | null => {
      const x0 = c.centre.x + (rc + d) * ux, y0 = c.centre.y + (rc + d) * uy;
      for (let t = CLEAR; t < 9; t += 0.25) {
        if (sim(x0 - sd * uy * t, y0 + sd * ux * t) < BLOCK) continue;
        const x = x0 - sd * uy * (t + beyond), y = y0 + sd * ux * (t + beyond);
        return sim(x, y) >= BLOCK ? { x, y } : null;
      }
      return null;
    };
    for (const d of c.great ? [3, 1, -1, -3, -5, -7].filter((d) => d >= -Math.min(8, 0.45 * rc)) : [1.5, -1]) {
      for (const sd of [-1, 1]) {
        const e = across(d, sd, 0.4);
        if (e && !open(e.x, e.y, 1.1)) place(plan.stakes, e.x, e.y, { sink: 0.3, fwd: tan(e.x, e.y, ux, uy), yaw: rnd() * TAU, tilt: 0.06 * (rnd() - 0.5), s: 1 + 0.25 * rnd(), kitH: 1.85 });
      }
    }
    const e = c.great ? across(0, 1, 1.4) : null;
    if (e && !open(e.x, e.y, 2.5)) {
      const p = place(plan.hulks, e.x, e.y, { sink: 0.12, fwd: tan(e.x, e.y, ux, uy), yaw: 0.4, tilt: 0.3, s: 3.4, kitH: 0.4 });
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
      for (const [back, tall] of [[0, 0.3 + 0.16 * sr()], [1.1, 0.16 + 0.08 * sr()]]) {
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
    // the reef's parts near the eye (the pavement only while dry: it goes under the drawn water, not through it); palms
    // in full near the eye, sketched beyond
    const near: [THREE.BufferGeometry, Part[], number, number, boolean][] = [
      // tables and thickets only where the water stands over them at mean tide; on the dry flat, low massive heads
      ...([[massiveKit, [...plan.heads, ...[...plan.branches, ...plan.tables].filter((p) => p.ground > DRY)], 2],
        [branchKit, plan.branches.filter((p) => p.ground <= DRY), 6], [tableKit, plan.tables.filter((p) => p.ground <= DRY), 7]] as [typeof massiveKit, Part[], number][])
        .flatMap(([kit, parts, seed]): [THREE.BufferGeometry, Part[], number, number, boolean][] => [
        [kit(seed), parts, 0, CORAL.drawn, false], [kit(seed, true), parts, CORAL.drawn, CORAL.near, false]]),
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
