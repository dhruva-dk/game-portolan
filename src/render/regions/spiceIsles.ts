// The Spice Isles (WP17 part B): five jungle islands crowded round one sound, Spice Harbour opening into it from the
// main island. The terrain draws the volcanic islands and their beaches and the shared flora their jungle; this module
// layers the forest and builds the harbour, every piece placed from the sim's own heights and seated on the drawn
// ground, none of it in a hull's water (tested). The forest: emergent trees standing out of the canopy on pale
// buttressed boles, their broad two-tiered crowns of billowing clumps hung with lianas; flowering trees in vermilion
// and in ochre, their blossom in soft dabs thickest on the crowns' sunlit tops, clustered into blooming groves (both the
// shared flora's rainforest kits, in its material); the forest's edge is the flora's strand. Spice Harbour, the region's mark from orbit: a cut-stone quay round the landward side of the anchorage
// (the mole and its lamp are structures.ts'), an apron of spice sacks and bales and drying beds heaped with mace,
// turmeric and cloves, and behind it a crescent of open godowns under hipped vermilion-tiled roofs, each on a masonry
// plinth, its bays stacked with sacks (well kept, of unknown origin, no doors, signs or dwellings, as the harbours are).
// Hooks: `birds` (WP23: perches in the emergents' and flowering crowns), `voices` (WP28: the jungle's chorus by place
// and loudness, and the harbour), `plan.quay`/`plan.berths` (the harbour's quay line and the water off it, for cameras,
// captures and the gull's landfall).
import * as THREE from 'three';
import { illustratedMaterial, transmittanceVec, type Style } from '../../style/glsl.ts';
import { mix, PIGMENTS, type RGB } from '../../style/palette.ts';
import { coastAt, heightAt } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS, TIDE } from '../../sim/world/regions.ts';
import { floraMaterial, kitGeometry, rainGeometry, type RainForm } from '../flora.ts';
import { seas } from '../sea.ts';
import { masonrySurface, MOLE } from '../structures.ts';
import type { Swell } from '../swell.ts';
import { beachTop, GROUND, SLOPES, terrains, type Ground, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, seeded, vec, type V, washOf, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'spiceIsles');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI, DEG = Math.PI / 180;
/** Sim heights (u): at or above BLOCK no hull floats at any tide; above LAND dry at high water. */
export const BLOCK = TIDE.amp - DRAFT, LAND = TIDE.amp + 0.15;
/** The quay's coping over mean sea (u); trees drawn whole within `near` u, sketched to `far`; the understory to `edge`. */
export const SPICE = { quay: TIDE.amp + 0.4, near: 64, far: 300, edge: 90, step: 1.3 } as const; // (S-025: the near kits across the harbour)

/** Capture 24's ships in Spice Harbour (chart x, y; bow toward x, y; detail): two lying along the quay at its berths,
 *  one warping in to the third, one in the mouth (the one standing in from the sound stood under the eye, only its mast tops in the frame, S-022); every hull's length floats at low
 *  water (regions test). */
export const SPICE_SHIPS: readonly (readonly [number, number, number, number, number])[] = [
  [-8.4, 6.3, -3, 6.5, 0.6], [-4.3, 3.8, -1.6, -0.4, 0.6], [-12, 3.6, -13, -1.4, 0.6], [-6.2, -3.5, -7, 3, 0.6],
];

const W = {
  bole: washOf(mix(PIGMENTS.sepia, PIGMENTS.leadWhite, 0.5), 0.5), boleDark: washOf(PIGMENTS.sepia, 0.7),
  liana: washOf(mix(PIGMENTS.umber, PIGMENTS.malachite, 0.4), 0.85),
  leaf: washOf(PIGMENTS.malachite, 0.85), leafLit: washOf(mix(PIGMENTS.verdigris, PIGMENTS.ochre, 0.4), 0.6),
  leafSun: washOf(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.35), 0.7), leafShade: washOf(mix(PIGMENTS.malachite, PIGMENTS.indigo, 0.3), 0.85),
  leafCool: washOf(PIGMENTS.verdigris, 0.8),
  bloom: washOf(PIGMENTS.vermilion, 0.7), bloomPale: washOf(mix(PIGMENTS.vermilion, PIGMENTS.roseMadder, 0.4), 0.5),
  gold: washOf(PIGMENTS.ochre, 0.85), goldPale: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.3), 0.6),
  tile: washOf(PIGMENTS.vermilion, 0.62), tileDark: washOf(mix(PIGMENTS.vermilion, PIGMENTS.umber, 0.45), 0.75),
  ridge: washOf(PIGMENTS.umber, 0.7), lime: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.55), 0.35),
  dark: washOf(mix(PIGMENTS.umber, PIGMENTS.indigo, 0.3), 0.9), timber: washOf(PIGMENTS.sepia, 0.8),
  stone: washOf(mix(PIGMENTS.ochre, PIGMENTS.sepia, 0.35), 0.45), stoneDark: washOf(mix(PIGMENTS.sepia, PIGMENTS.indigo, 0.2), 0.55),
  weed: washOf(mix(PIGMENTS.verdigris, PIGMENTS.umber, 0.4), 0.7),
  sack: washOf(mix(PIGMENTS.ochre, PIGMENTS.umber, 0.35), 0.55), sackPale: washOf(mix(PIGMENTS.ochre, PIGMENTS.leadWhite, 0.4), 0.45),
  bale: washOf(mix(PIGMENTS.umber, PIGMENTS.ochre, 0.3), 0.6), mat: washOf(mix(PIGMENTS.ochre, PIGMENTS.sepia, 0.2), 0.5),
  mace: washOf(PIGMENTS.vermilion, 0.85), clove: washOf(mix(PIGMENTS.umber, PIGMENTS.vermilion, 0.3), 0.9),
  rock: washOf(mix(PIGMENTS.sepia, PIGMENTS.indigo, 0.35), 0.6), rockLit: washOf(mix(PIGMENTS.sepia, PIGMENTS.ochre, 0.4), 0.45),
};

const hash = (x: number, y: number, z = 0): number => {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/** A kit in the making, its facets painted by `pick` (or `wash`); leaf masses remembered for their rounded normals. */
class Brush {
  wash: Wash;
  pick: ((c: V, n: V) => Wash) | null = null;
  readonly kit: Kit;
  readonly masses: { from: number; to: number; c: V; s: V }[] = [];
  n = 0;
  constructor(wash: Wash) {
    this.wash = wash;
    this.kit = new Kit((c, nn) => (this.pick ? this.pick(c, nn) : this.wash));
  }
  tri(a: V, b: V, c: V): void {
    this.kit.tri(a, b, c);
    this.n++;
  }
  quad(a: V, b: V, c: V, d: V): void {
    this.tri(a, b, c);
    this.tri(a, c, d);
  }
  /** A box of half-extents (x, y, z) at c turned `turn` about y. */
  box(c: V, x: number, y: number, z: number, turn = 0): void {
    const k = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => vec(i & 1 ? x : -x, i & 2 ? y : -y, i & 4 ? z : -z).applyAxisAngle(UP, turn).add(c));
    for (const [a, b, cc, d] of [[1, 3, 7, 5], [0, 4, 6, 2], [2, 6, 7, 3], [0, 1, 5, 4], [4, 5, 7, 6], [0, 2, 3, 1]]) this.quad(k[a], k[b], k[cc], k[d]);
  }
  /** A tapered tube along `path`. */
  tube(path: readonly V[], radii: readonly number[], sides: number): void {
    const rings: V[][] = path.map((p, i) => {
      const t = vec().subVectors(path[Math.min(i + 1, path.length - 1)], path[Math.max(i - 1, 0)]).normalize();
      const u = vec().crossVectors(t, Math.abs(t.x) < 0.7 ? vec(1, 0, 0) : vec(0, 1, 0)).normalize(), w = vec().crossVectors(t, u);
      return Array.from({ length: sides }, (_, j) => p.clone().addScaledVector(u, radii[i] * Math.cos((j / sides) * TAU)).addScaledVector(w, radii[i] * Math.sin((j / sides) * TAU)));
    });
    this.kit.loft(rings);
    this.n += 2 * sides * (path.length - 1) + 2 * sides;
  }
  /** A lumpy leaf mass (lon × lat facets) at c of radii s, its normals rounded from its centre once built. */
  mass(c: V, s: V, lon: number, lat: number, seed: number): void {
    const from = this.n, pt = (i: number, j: number): V => {
      const th = (j / lat) * Math.PI, ph = (i / lon) * TAU + 0.4 * j, k = j === 0 || j === lat ? 1 : 0.82 + 0.3 * hash(i % lon, j, seed);
      return vec(Math.sin(th) * Math.cos(ph) * s.x * k, Math.cos(th) * s.y * k, Math.sin(th) * Math.sin(ph) * s.z * k).add(c);
    };
    for (let j = 0; j < lat; j++) for (let i = 0; i < lon; i++) {
      const a = pt(i, j), b = pt(i + 1, j), d = pt(i, j + 1), e = pt(i + 1, j + 1);
      if (j > 0) this.tri(a, b, e);
      if (j < lat - 1) this.tri(a, e, d);
    }
    this.masses.push({ from, to: this.n, c: c.clone(), s: s.clone() });
  }
  build(): THREE.BufferGeometry {
    const g = this.kit.build(), pos = g.getAttribute('position') as THREE.BufferAttribute, nrm = g.getAttribute('normal') as THREE.BufferAttribute, p = vec();
    for (const m of this.masses) {
      for (let v = 3 * m.from; v < 3 * m.to; v++) {
        p.fromBufferAttribute(pos, v).sub(m.c).divide(m.s).normalize().multiplyScalar(0.75).add(vec(0, 0.35, 0)).normalize();
        nrm.setXYZ(v, p.x, p.y, p.z);
      }
    }
    return g;
  }
}
const UP = vec(0, 1, 0);

/** Foliage mottled as an engraver lays it: sunlit tops, cool sides, the underside in shade, varied leaf by leaf. */
const foliage = (c: V, n: V): Wash => {
  const h = hash(Math.round(c.x * 40), Math.round(c.y * 40), Math.round(c.z * 40));
  return n.y < -0.3 ? W.leafShade : n.y > 0.45 ? (h < 0.35 ? W.leafLit : h < 0.7 ? W.leafSun : W.leaf) : h < 0.25 ? W.leafCool : h < 0.5 ? W.leafShade : W.leaf;
};

/** The forest edge 1 tall: understory banked into a wall, broad leaves and lower masses. */
export function edgeKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.leaf);
  b.pick = foliage;
  for (let k = 0; k < 5; k++) {
    const x = (k - 2) * 0.32 + 0.1 * rnd(), s = 0.28 + 0.12 * rnd();
    b.mass(vec(x, 0.3 + 0.35 * rnd() * (k % 2), 0.12 * (rnd() - 0.5)), vec(s, s * (1.1 + 0.4 * rnd()), s * 0.8), 7, 4, seed + k);
  }
  return b.build();
}

/** A godown 1 u to the kit unit: a masonry plinth (sunk 1.2 u to meet any slope), open bays between timber posts on a
 *  lime-washed back wall, stacked sacks within, and a hipped roof of vermilion tiles in courses over deep eaves.
 *  2.8 u long (x), 1.8 u deep (z, its open front to +z). */
function godownKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.stone), L = 1.4, D = 0.9, H = 1.05;
  b.pick = (c, n) => (n.y > 0.5 ? W.stone : Math.floor((c.y + 2) * 7) % 2 ? W.stone : W.stoneDark);
  b.box(vec(0, -0.45, 0), L + 0.15, 0.75, D + 0.15);
  b.pick = null;
  b.wash = W.lime;
  b.box(vec(0, H / 2 + 0.3, -D + 0.06), L, H / 2, 0.06); // the back wall
  b.box(vec(-L + 0.06, H / 2 + 0.3, -0.25), 0.06, H / 2, D - 0.3); // the ends, open to the front
  b.box(vec(L - 0.06, H / 2 + 0.3, -0.25), 0.06, H / 2, D - 0.3);
  b.wash = W.dark;
  b.box(vec(0, H / 2 + 0.3, -D + 0.13), L - 0.1, H / 2 - 0.02, 0.01); // the shade inside
  b.wash = W.timber;
  for (let k = 0; k <= 4; k++) b.box(vec(-L + 0.08 + (k * (2 * L - 0.16)) / 4, H / 2 + 0.3, D - 0.08), 0.05, H / 2, 0.05);
  b.box(vec(0, H + 0.27, D - 0.08), L, 0.04, 0.06); // the plate
  for (let k = 0; k < 7; k++) { // sacks stacked in the bays
    b.pick = (c) => (hash(Math.round(c.x * 20), Math.round(c.y * 20), k) < 0.5 ? W.sack : W.sackPale);
    const x = -L + 0.35 + k * 0.37, layers = 1 + Math.floor(rnd() * 3);
    for (let l = 0; l < layers; l++) b.mass(vec(x + 0.05 * l, 0.4 + l * 0.16, -0.35 + 0.12 * rnd()), vec(0.16, 0.09, 0.12), 5, 3, k * 5 + l);
  }
  // the hipped roof: eaves overhanging all round, tiles in courses (alternate washes), a dark ridge
  const e = H + 0.3, t = e + 0.72, ex = L + 0.3, ez = D + 0.32, rx = ex - ez;
  b.pick = (c) => (Math.floor((c.y - e) * 14) % 2 ? W.tile : W.tileDark);
  const p = (x: number, y: number, z: number): V => vec(x, y, z);
  b.quad(p(-ex, e, ez), p(ex, e, ez), p(rx, t, 0), p(-rx, t, 0));
  b.quad(p(ex, e, -ez), p(-ex, e, -ez), p(-rx, t, 0), p(rx, t, 0));
  b.tri(p(ex, e, ez), p(ex, e, -ez), p(rx, t, 0));
  b.tri(p(-ex, e, -ez), p(-ex, e, ez), p(-rx, t, 0));
  b.pick = null;
  b.wash = W.ridge;
  b.box(vec(0, t, 0), rx + 0.05, 0.035, 0.04);
  for (const s of [-1, 1]) b.tube([p(s * rx, t, 0), p(s * ex, e, ez)], [0.03, 0.03], 3);
  return b.build();
}

/** A run of quay 1 long: a battered face from the bed up to a coping at y = 0 (its face to +z), its hearting behind;
 *  the courses, joints, wet band and weed are the masonry's drawing (structures.ts), at world scale whatever the run's
 *  stretch (stretched blocks read as planks, S-020). */
function quayKit(): THREE.BufferGeometry {
  const b = new Brush(W.stone);
  b.box(vec(0, -0.8, 0.3), 0.5, 0.8, 0.06);  // the face
  b.box(vec(0, -1.45, 0.36), 0.5, 0.15, 0.04); // the plinth course, set out at the foot
  b.box(vec(0, -0.03, 0.2), 0.5, 0.05, 0.18); // the coping, overhanging the face
  b.box(vec(0, -0.9, -0.12), 0.5, 0.82, 0.38); // the hearting
  return b.build();
}

/** A terrace's retaining wall 1 long, as the quay's run but battered (its face leaning back to the coping) and capped
 *  by a coping that projects over it, its shadow line under the lip (S-022: never a slatted crate). */
function wallKit(): THREE.BufferGeometry {
  const b = new Brush(W.stone), F = 0.36, B = 0.24; // the face's foot and head (z)
  b.quad(vec(-0.5, -1.6, F), vec(0.5, -1.6, F), vec(0.5, -0.08, B), vec(-0.5, -0.08, B));
  b.box(vec(0, -1.5, F + 0.03), 0.5, 0.12, 0.04); // the footing course
  b.box(vec(0, -0.03, 0.2), 0.52, 0.06, 0.13); // the coping, its lip 0.09 over the head of the face
  b.box(vec(0, -0.9, -0.12), 0.5, 0.82, 0.36); // the hearting
  return b.build();
}

/** A flight of steps up a terrace's riser, 1 wide: treads from the lower terrace (y = −1.6, z = +0.5) to the coping
 *  (y = 0, z = −0.5), between stone cheeks. */
function stairKit(): THREE.BufferGeometry {
  const b = new Brush(W.stone);
  b.pick = (_c, n) => (n.y > 0.5 ? W.stone : W.stoneDark);
  for (let k = 0; k < 8; k++) b.box(vec(0, -1.6 + (k + 1) * 0.1, -k * 0.0625), 0.32, (k + 1) * 0.1, 0.5 - 0.0625 * k);
  for (const x of [-0.4, 0.4]) b.box(vec(x, -0.75, 0), 0.08, 0.8, 0.55);
  return b.build();
}

/** A heap on the apron 1 across: sacks piled on a pallet, corded bales, and a drying bed on trestles under a woven mat
 *  heaped with mace, turmeric and cloves. */
function heapKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.timber);
  for (const [x, z] of [[-0.42, -0.2], [0.42, -0.2], [-0.42, 0.2], [0.42, 0.2]]) b.box(vec(x + 0.35, 0.16, z), 0.025, 0.16, 0.025);
  b.wash = W.mat;
  b.box(vec(0.35, 0.33, 0), 0.5, 0.015, 0.26);
  for (let k = 0; k < 3; k++) { // spice spread to dry
    b.wash = [W.mace, W.gold, W.clove][k];
    b.mass(vec(0.05 + k * 0.3, 0.345, 0), vec(0.13, 0.035, 0.18), 6, 2, seed + k);
  }
  b.pick = (c) => (hash(Math.round(c.x * 20), Math.round(c.z * 20), seed) < 0.5 ? W.sack : W.sackPale);
  for (let l = 0; l < 3; l++) for (let k = 0; k < 3 - l; k++) b.mass(vec(-0.55 + k * 0.2 + l * 0.1, 0.08 + l * 0.13, -0.05 + 0.08 * (rnd() - 0.5)), vec(0.11, 0.07, 0.09), 5, 3, seed * 3 + l * 4 + k);
  b.pick = (c) => (Math.abs(c.x + 0.25 - Math.round(c.x / 0.1) * 0.1) < 0.012 ? W.timber : W.bale);
  b.box(vec(-0.42, 0.09, 0.32), 0.14, 0.09, 0.1, 0.2);
  b.box(vec(-0.2, 0.09, 0.36), 0.13, 0.09, 0.1, -0.3);
  return b.build();
}

export interface Part { m: THREE.Matrix4; at: V; dir: V; base: number; ground: number; sim: number; top: number; reach: number }
export interface SpicePlan {
  emergents: Part[]; flowers: [Part[], Part[]]; edge: Part[];
  /** S-025: coconut palms on the strand and at the forest's edge, leaning out toward the water. */
  palms: Part[];
  /** S-025: the terraces' spice gardens: nutmeg, clove, and pepper on poles, in rows along the terraces. */
  garden: [Part[], Part[], Part[]]; godowns: Part[]; quays: Part[]; heaps: Part[];
  /** The town's terraces: retaining walls faced like the quay, and flights of steps up their risers. */
  walls: Part[]; stairs: Part[];
  /** Spice Harbour's mole: its dressed stone, a run along each face of the wall. */
  mole: Part[];
  /** The quay's face (unit directions round the anchorage) and the water off it a hull can lie in. */
  quay: V[]; berths: V[];
  birds: V[]; voices: { at: V; loud: number; kind: 'jungle' | 'harbour' }[];
}

const surfaceOut = (): Surface => ({ height: 0, normal: vec(), up: 1, ground: GROUND.meadow as Ground, region: RI });
export const groundAt = (field: TerrainField, dir: V): number => field.surface(dir, -10, surfaceOut()).height;

export function planSpice(field: TerrainField): SpicePlan {
  const geo = field.geo, rnd = seeded(824), S = surfaceOut(), hb = REGION.harbours[0];
  const sim = (x: number, y: number): number => heightAt(geo, chartDir(RI, x, y));
  const tan = (x: number, y: number, dx: number, dy: number): V =>
    chartDir(RI, x + dx * 0.25, y + dy * 0.25).sub(chartDir(RI, x - dx * 0.25, y - dy * 0.25)).normalize();
  const plan: SpicePlan = { emergents: [], flowers: [[], []], edge: [], palms: [], garden: [[], [], []], godowns: [], quays: [], heaps: [], walls: [], stairs: [], mole: [], quay: [], berths: [], birds: [], voices: [] };
  const place = (list: Part[], x: number, y: number, o: { base?: number; sink: number; fwd: V; yaw?: number; tilt?: number; s: number; sy?: number; sz?: number; kitH: number; reach: number }): Part => {
    const dir = chartDir(RI, x, y), ground = field.surface(dir, -10, S).height, base = o.base ?? ground - o.sink, sy = o.sy ?? o.s, at = lift(dir, base);
    const p: Part = { m: pose(new THREE.Matrix4(), at, dir, o.fwd, o.yaw ?? 0, o.tilt ?? 0, o.s, sy, o.sz ?? o.s), at, dir, base, ground, sim: heightAt(geo, dir), top: base + o.kitH * sy, reach: o.reach };
    list.push(p);
    return p;
  };
  // Spice Harbour: rays from the anchorage to the shore; the quay round the landward side (the mouth's arc left to the
  // mole), the apron behind it, the godowns behind that where the ground allows a plinth
  const fb = hb.facing, taken: { x: number; y: number; r: number }[] = [];
  for (let a = 0; a < 360; a += 5) {
    const off = Math.abs(((a - fb + 540) % 360) - 180);
    if (off < 62) continue;
    const ux = Math.sin(a * DEG), uy = Math.cos(a * DEG);
    let t = 0.5;
    while (t < 1.6 * hb.r && sim(hb.x + ux * t, hb.y + uy * t) <= 0.05) t += 0.1;
    if (t >= 1.6 * hb.r) continue;
    const at = (d: number): [number, number] => [hb.x + ux * (t + d), hb.y + uy * (t + d)], out = (x: number, y: number) => tan(x, y, -ux, -uy);
    const [qx, qy] = at(0.55), qg = groundAt(field, chartDir(RI, qx, qy));
    if (qg > SPICE.quay + 0.5 || sim(...at(0.15)) < BLOCK + 0.05) continue;
    place(plan.quays, qx, qy, { base: SPICE.quay, sink: 0, fwd: out(qx, qy), s: Math.max(0.75, (t + 0.55) * 5 * DEG * 1.15), sy: 1, sz: 1, kitH: 0, reach: 0.55 });
    plan.quay.push(chartDir(RI, ...at(0)));
    taken.push({ x: qx, y: qy, r: 1 });
    const [bx, by] = at(-1.6);
    if (a % 15 === 0 && sim(bx, by) < BLOCK - 0.6) plan.berths.push(chartDir(RI, bx, by));
    // the apron: heaps every other ray, seated on the ground behind the coping
    const [hx, hy] = at(1.7 + 0.4 * rnd()), hg = groundAt(field, chartDir(RI, hx, hy));
    if (hg > LAND && hg < SPICE.quay + 1.4 && rnd() < 0.6) {
      place(plan.heaps, hx, hy, { sink: 0.03, fwd: out(hx, hy), yaw: 0.4 * (rnd() - 0.5) + Math.PI / 2, s: 0.95 + 0.3 * rnd(), kitH: 0.4, reach: 0.7 });
      taken.push({ x: hx, y: hy, r: 1 });
    }
    // a godown every 15°, its open front to the water, where its plinth's corners lie within 0.9 u of each other
    if (a % 10 !== 5) continue;
    for (const d of [3.6, 4.6, 5.6, 7.4]) {
      const [gx, gy] = at(d), vx = -uy, vy = ux;
      const corners = [[1.9, 1.3], [-1.9, 1.3], [1.9, -1.3], [-1.9, -1.3], [0, 0]].map(([s, f]) => groundAt(field, chartDir(RI, gx + vx * s - ux * f, gy + vy * s - uy * f)));
      const lo = Math.min(...corners), hi = Math.max(...corners);
      if (hi - lo > 1.1 || lo < LAND || taken.some((p) => Math.hypot(p.x - gx, p.y - gy) < 3.4 && p.r > 1)) continue;
      place(plan.godowns, gx, gy, { base: hi - 0.35, sink: 0, fwd: out(gx, gy), yaw: 0.06 * (rnd() - 0.5), s: 1.3, kitH: 2.1, reach: 2.2 });
      taken.push({ x: gx, y: gy, r: 3.2 });
      break;
    }
  }
  // the mole: two short arms of dressed stone from the flanks, the mouth between them wide open on the sound
  // (structures.ts' MOLE: its rubble toe and the lamp on its head are laid there); a run along either face of the
  // wall, bedded on the sea floor, all outside the sim's harbour (its disc of `r`) where hulls lie
  for (const side of [-1, 1]) {
    const ray = (th: number): [number, number] => [Math.sin(Math.PI + side * th), Math.cos(Math.PI + side * th)];
    let land = MOLE.r * hb.r;
    for (const [ux, uy] = ray(MOLE.land); land <= 2.2 * hb.r && sim(hb.x + ux * land, hb.y + uy * land) <= 0; land += 0.25);
    const arc = (u: number): [number, number] => {
      const th = MOLE.land + (MOLE.mouth - MOLE.land) * u, rr = land + 0.5 + (MOLE.r * hb.r - land - 0.5) * u * u * (3 - 2 * u), [ux, uy] = ray(th);
      return [hb.x + ux * rr, hb.y + uy * rr];
    };
    const n = Math.ceil((land + 0.5) * (MOLE.land - MOLE.mouth) / 0.9) + 3;
    for (let i = 0; i < n; i++) {
      const [x0, y0] = arc(i / n), [x1, y1] = arc((i + 1) / n), mx = (x0 + x1) / 2, my = (y0 + y1) / 2, len = Math.hypot(x1 - x0, y1 - y0);
      const nx = (y1 - y0) / len, ny = -(x1 - x0) / len, g = groundAt(field, chartDir(RI, mx, my)), sy = Math.max(1, (MOLE.coping - g + 0.4) / 1.7);
      for (const face of [-1, 1]) {
        const wx = mx + face * nx * 0.25, wy = my + face * ny * 0.25;
        place(plan.mole, wx, wy, { base: MOLE.coping, sink: 0, fwd: tan(wx, wy, face * nx, face * ny), s: len * 1.06, sy, sz: 1.3, kitH: 0, reach: MOLE.half });
      }
    }
  }
  // the town climbing behind: the terrace's riser faced with a retaining wall (a flight of steps every 30°), and on
  // each terrace above it a house under vermilion tiles where the ground is level enough for its plinth
  for (let a = 0; a < 360; a += 5) {
    const off = Math.abs(((a - fb + 540) % 360) - 180);
    if (off < 55) continue;
    const ux = Math.sin(a * DEG), uy = Math.cos(a * DEG), at = (d: number): [number, number] => [hb.x + ux * d, hb.y + uy * d];
    let rises = 0;
    for (let d = hb.r + 4; d < hb.r + 15 && rises < 4; d += 0.35) {
      const [x0, y0] = at(d), [x1, y1] = at(d + 0.9), g0 = groundAt(field, chartDir(RI, x0, y0)), g1 = groundAt(field, chartDir(RI, x1, y1));
      if (g1 - g0 < 0.75 || g0 < LAND || sim(x0, y0) < LAND) continue;
      rises++;
      const [wx, wy] = at(d + 0.55), fwd = tan(wx, wy, -ux, -uy), w = Math.max(0.75, (d + 0.55) * 5 * DEG * 1.15), stair = a % 30 === 15;
      place(stair ? plan.stairs : plan.walls, wx, wy, { base: g1 + 0.05, sink: 0, fwd, s: stair ? 0.9 : w, sy: (g1 - g0 + 0.5) / 1.6, sz: 1, kitH: 0, reach: 0.5 });
      taken.push({ x: wx, y: wy, r: 1 });
      const [gx, gy] = at(d + 2.4), vx = -uy, vy = ux;
      const corners = [[1.4, 1], [-1.4, 1], [1.4, -1], [-1.4, -1], [0, 0]].map(([s, f]) => groundAt(field, chartDir(RI, gx + vx * s - ux * f, gy + vy * s - uy * f)));
      const lo = Math.min(...corners), hi = Math.max(...corners);
      if (hi - lo < 0.7 && lo > LAND && !taken.some((p) => Math.hypot(p.x - gx, p.y - gy) < 2.6 && p.r > 1)) {
        place(plan.godowns, gx, gy, { base: hi - 0.3, sink: 0, fwd: tan(gx, gy, -ux, -uy), yaw: 0.1 * (rnd() - 0.5), s: 0.95, kitH: 2.1, reach: 1.6 });
        taken.push({ x: gx, y: gy, r: 2.4 });
      }
      d += 1.5;
    }
  }
  // the forest: emergents, flowering groves and the edge behind the beaches, on gentle ground dry at high water
  const fr = seeded(825), sr = seeded(826), pr = seeded(827), STRAND = beachTop(REGION), clear = (x: number, y: number, r: number): boolean => !taken.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r);
  for (let y = -62; y <= 62; y += SPICE.step) {
    for (let x = -62; x <= 62; x += SPICE.step) {
      const px = x + (fr() - 0.5) * SPICE.step, py = y + (fr() - 0.5) * SPICE.step, r = fr(), q = fr();
      if (sim(px, py) <= LAND + 0.3) continue;
      const dir = chartDir(RI, px, py);
      field.surface(dir, -10, S);
      // the town's terraces: garden trees in blossom between the houses
      const town = Math.hypot(px - hb.x, py - hb.y);
      if (town < hb.r + 15) {
        if (S.up > 0.7 && town > hb.r + 5 && r < 0.45 && clear(px, py, 1.4)) {
          place(plan.flowers[r < 0.18 ? 1 : 0], px, py, { sink: 0.1, fwd: tan(px, py, 1, 0), yaw: fr() * TAU, s: 2.6 + 1.0 * fr(), kitH: 0.95, reach: 0.8 });
          taken.push({ x: px, y: py, r: 1 });
        }
        continue;
      }
      // (the forest is planned on the strand as it was drawn before S-022: sand to the beach's top wherever the ground was
      // not steep; the rise behind the sand, drawn as the forest floor since, takes the edge's leaf bank alone, from its
      // own numbers, so the forest above stands where it stood)
      const strand = (g: Surface): boolean => g.height < STRAND && g.up >= SLOPES.scree, rise = strand(S) && S.ground !== GROUND.beach;
      // S-025: palms leaning out from the forest over the beach toward the water (their own draw of chance, so the forest
      // stands where it stood)
      const palm = (p: number, s: number): void => {
        if (pr() >= p || sim(px, py) < LAND + 0.25 || !clear(px, py, 0.8)) return;
        const gx = coastAt(geo, chartDir(RI, px + 0.5, py)) - coastAt(geo, chartDir(RI, px - 0.5, py)), gy = coastAt(geo, chartDir(RI, px, py + 0.5)) - coastAt(geo, chartDir(RI, px, py - 0.5));
        const gl = Math.hypot(gx, gy) || 1;
        place(plan.palms, px, py, { sink: 0.1, fwd: tan(px, py, gx / gl, gy / gl), yaw: 0.7 * (pr() - 0.5), tilt: 0.2 + 0.25 * pr(), s: s + 1.2 * pr(), kitH: 0.95, reach: 0.6 });
      };
      if (strand(S) && !rise && S.up >= 0.6 && -coastAt(geo, dir) > 1.2) palm(0.3, 3.0);
      if (S.up < 0.68 || (strand(S) && !rise) || S.ground === GROUND.mud) continue;
      const inland = -coastAt(geo, dir), fwd = tan(px, py, 1, 0);
      const cx = coastAt(geo, chartDir(RI, px + 0.5, py)) - coastAt(geo, chartDir(RI, px - 0.5, py)), cy = coastAt(geo, chartDir(RI, px, py + 0.5)) - coastAt(geo, chartDir(RI, px, py - 0.5));
      const cl = Math.hypot(cx, cy) || 1, seaward = chartDir(RI, px + (1.8 * cx) / cl, py + (1.8 * cy) / cl);
      if (rise) {
        if (sr() < 0.9) place(plan.edge, px, py, { sink: 0.1, fwd: tan(px, py, cx / cl, cy / cl), yaw: 0.5 * (sr() - 0.5), s: 2 + 0.8 * sr(), sy: 1.8 + 0.8 * sr(), kitH: 0.95, reach: 1.5 });
        continue;
      }
      // the forest's edge: the first wooded ground above a beach or the water
      const edge = inland < 6 && (strand(field.surface(seaward, -10, S)) || heightAt(geo, seaward) < LAND + 0.3);
      // blooming groves: a slow field picks where they gather, and which bloom gold and which vermilion
      const grove = 0.5 + 0.5 * Math.sin(0.21 * px + 1.3 * Math.sin(0.17 * py)) * Math.cos(0.19 * py - 1.1 * Math.sin(0.23 * px));
      if (edge && q < 0.85 && clear(px, py, 1)) {
        palm(0.3, 4.2);
        place(plan.edge, px, py, { sink: 0.1, fwd: tan(px, py, cx / cl, cy / cl), yaw: 0.5 * (fr() - 0.5), s: 2 + 0.8 * fr(), sy: 2.2 + 0.8 * fr(), kitH: 0.95, reach: 1.5 });
        continue;
      }
      if (!clear(px, py, 2)) continue;
      if (r < 0.07) {
        const p = place(plan.emergents, px, py, { sink: 0.15, fwd, yaw: fr() * TAU, tilt: 0.04 * (fr() - 0.5), s: 7.2 + 1.8 * fr(), kitH: 0.95, reach: 1.8 }); // S-025: twice the canopy, its bole showing above it
        if (plan.birds.length < 80 && fr() < 0.5) plan.birds.push(lift(dir, p.top));
      } else if (r < 0.07 + 0.45 * grove) {
        const gold = Math.sin(0.33 * px + 0.7) * Math.cos(0.29 * py - 0.4) > 0.1;
        const p = place(plan.flowers[gold ? 1 : 0], px, py, { sink: 0.1, fwd, yaw: fr() * TAU, s: 3.8 + 1.6 * fr(), kitH: 0.95, reach: 1.3 });
        if (plan.birds.length < 80 && fr() < 0.15) plan.birds.push(lift(dir, p.top));
      }
    }
  }
  // S-025: the terraces planted as spice gardens, in rows along the contour between the walls and the houses: plots of
  // nutmeg, of clove, and of pepper vines on poles, a path left between plots (their own draw of chance)
  const gr = seeded(828);
  for (let d = hb.r + 4.6, ring = 0; d < hb.r + 15.5; d += 1.05, ring++) {
    for (let a = 0; a < 360; a += (1.0 / d) * (180 / Math.PI)) {
      const off = Math.abs(((a - fb + 540) % 360) - 180), plot = Math.floor(a / 11 + 0.37 * ring);
      if (off < 55 || (a / 11 + 0.37 * ring) % 1 < 0.14) continue;
      const kind = Math.floor(hash(plot, Math.floor(ring / 3), 5) * 3.6);
      if (kind > 2) continue;
      const px = hb.x + Math.sin(a * DEG) * (d + 0.2 * (gr() - 0.5)), py = hb.y + Math.cos(a * DEG) * (d + 0.2 * (gr() - 0.5));
      if (sim(px, py) < LAND + 0.3 || taken.some((p) => Math.hypot(p.x - px, p.y - py) < (p.r > 1 ? p.r : 0.7))) continue;
      field.surface(chartDir(RI, px, py), -10, S);
      if (S.up < 0.66 || S.ground === GROUND.beach) continue;
      const s = [1.9, 1.3, 0.85][kind] + 0.4 * gr(), sy = [s, s * 1.6, 1.7 + 0.3 * gr()][kind];
      place(plan.garden[kind], px, py, { sink: 0.06, fwd: tan(px, py, 1, 0), yaw: gr() * TAU, s, sy, sz: s, kitH: 0.95, reach: 0.5 });
    }
  }
  // the voices: the jungle's chorus binned 12 u apart, loudest where the forest is deepest; the harbour's bustle
  const bins = new Map<string, { at: V; n: number }>();
  for (const p of [...plan.emergents, ...plan.flowers[0], ...plan.flowers[1]]) {
    const k = [p.dir.x, p.dir.y, p.dir.z].map((v) => Math.round(v * 40)).join(','), b = bins.get(k);
    if (b) { b.at.add(p.dir); b.n++; } else bins.set(k, { at: p.dir.clone(), n: 1 });
  }
  const most = Math.max(1, ...[...bins.values()].map((b) => b.n));
  plan.voices = [...bins.values()].map((b) => ({ at: b.at.normalize(), loud: b.n / most, kind: 'jungle' as const }));
  plan.voices.push({ at: chartDir(RI, hb.x, hb.y), loud: 1, kind: 'harbour' });
  return plan;
}

export class SpiceIsles {
  readonly group = new THREE.Group();
  readonly plan: SpicePlan;
  /** WP23: perches in the emergents' and flowering trees' crowns. WP28: the jungle's chorus and the harbour. */
  readonly birds: readonly V[];
  readonly voices: readonly { at: V; loud: number; kind: 'jungle' | 'harbour' }[];
  private readonly material: THREE.ShaderMaterial;
  private readonly masonry: THREE.ShaderMaterial;
  private readonly rubble: THREE.ShaderMaterial;
  private readonly fixed: Draw[];
  /** [draw, parts, from, to (u from the eye), each part's foliage, blossom and seed (the flora material's)] */
  private readonly lod: [Draw, Part[], number, number, Float32Array][];
  private readonly trees: THREE.ShaderMaterial[];
  private readonly seen = vec(1e9, 0, 0);
  private readonly fwd = vec(0, 0, 0);
  private readonly look = vec(0, 0, 0);
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly ball = new THREE.Sphere();

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = (this.plan = planSpice(field));
    this.birds = plan.birds;
    this.voices = plan.voices;
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide });
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -1;
    this.material.polygonOffsetUnits = -2;
    const fixed = (kit: THREE.BufferGeometry, parts: Part[]): Draw => new Draw(kit, this.material, parts.length).fill(parts.map((p) => p.m));
    // the quay, terrace walls, mole and stairs in coursed masonry (structures.ts), never the timber's level hatch
    this.masonry = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide, surface: masonrySurface(true) });
    const dressed = (kit: THREE.BufferGeometry, parts: Part[]): Draw => new Draw(kit, this.masonry, parts.length).fill(parts.map((p) => p.m));
    // the terrace walls in coursed rubble, the shade hatched on the slant (upright strokes over the courses read as the
    // slats of a crate, S-022): each stone's foot in shadow, its joints inked
    this.rubble = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, side: THREE.DoubleSide, surface: masonrySurface(true)
      .replace('vec2 mc = vec2(s + 0.3 * hgt, hgt)', 'vec2 mc = vec2(0.72 * (s + 1.1 * hgt), hgt)')
      .replace('0.16 * vert * (1.0 - smoothstep(0.0, 0.22, fy))', '0.3 * vert * (1.0 - smoothstep(0.0, 0.3, fy))')
      // S-025: rubble laid by hand, never breeze blocks: courses that wander and vary in height, stones of every length
      // with perpends off the plumb, each stone its own colour, rounded at its corners into dark pinned joints, and
      // weathered (lichen and damp blotting the face)
      .replace('hgt / 0.24, vert)', '(hgt + 0.06 * sin(s * 2.3) + 0.035 * sin(s * 5.3 + 1.0)) / 0.21, vert)')
      .replace('mix(top.x, s, vert) / (0.45 + 0.35 * hash11(course * 3.17 + 0.4))', 'mix(top.x, s, vert) / (0.3 + 0.22 * hash11(course * 3.17 + 0.4)) + 0.3 * sin(mix(top.x, s, vert) * 3.1 + course * 1.9) + 0.15 * fract(cy)')
      .replace('col *= 1.0 - m * (0.1 * bk', 'col *= 1.0 - m * (0.26 * bk')
      .replace('min(jy, jx))) * worn;', 'min(min(jy, jx), (0.2 + 0.15 * bh) / max(fwidth(cy), 1e-4) - length(max(vec2((0.2 + 0.15 * bh) / max(fwidth(cy), 1e-4)) - vec2(jx, jy), 0.0))))) * max(worn, 0.6);\n    col = mix(col, col * vec3(0.8, 0.88, 0.72), m * vert * 0.8 * smoothstep(0.5, 0.75, q.bloom + 0.25 * (bk - 0.5)));\n    col *= 1.0 - m * vert * 0.22 * smoothstep(0.45, 0.8, q.mottle + 0.3 * (bh - 0.5));') });
    const rubble = (kit: THREE.BufferGeometry, parts: Part[]): Draw => new Draw(kit, this.rubble, parts.length).fill(parts.map((p) => p.m));
    this.fixed = [fixed(godownKit(3), plan.godowns), dressed(quayKit(), [...plan.quays, ...plan.mole]), rubble(wallKit(), plan.walls), fixed(heapKit(5), plan.heaps), rubble(stairKit(), plan.stairs)];
    // the trees are the shared flora's rainforest kits in its material (bending in the wind, blossom in soft dabs,
    // leaf outlines broken into clumps), whole near the eye and sketched further off, handing over between plant by plant
    const near = floraMaterial(style, swell, { band: new THREE.Vector4(-1, 0, SPICE.near * 0.85, SPICE.near), sway: 0.04, hand: true });
    const far = floraMaterial(style, swell, { band: new THREE.Vector4(SPICE.near * 0.85, SPICE.near, SPICE.far * 0.8, SPICE.far), sway: 0.04, far: true, hand: true,
      id: near.uniforms.uInkId.value as number });
    this.trees = [near, far];
    const T = (c: RGB): THREE.Vector3 => transmittanceVec(c), tint = (parts: Part[], k: number): Float32Array => {
      const t = new Float32Array(parts.length * 8);
      parts.forEach((p, i) => {
        const u = hash(p.at.x * 9, p.at.z * 9, k), w = hash(p.at.y * 9, p.at.x * 7, k + 1);
        const fo = T(k === 3 ? mix(mix(PIGMENTS.malachite, PIGMENTS.ochre, 0.3 + 0.2 * w), PIGMENTS.roseMadder, 0.15 + 0.15 * u)
          : k === 4 ? mix(PIGMENTS.malachite, PIGMENTS.verdigris, 0.25 + 0.25 * w) : mix(PIGMENTS.malachite, u < 0.5 ? PIGMENTS.verdigris : PIGMENTS.ochre, 0.1 + 0.3 * w));
        const bl = k === 0 || k > 2 ? fo : T(mix(k === 1 ? PIGMENTS.vermilion : PIGMENTS.ochre, PIGMENTS.roseMadder, 0.25 * u));
        t.set([fo.x, fo.y, fo.z, bl.x, bl.y, bl.z, w, SPICE.far], i * 8);
      });
      return t;
    };
    const lod: [RainForm | 'palm', number, Part[], number, number, number][] = [
      ['emergent', 17, plan.emergents, 0, SPICE.near, 0], ['emergent', 17, plan.emergents, SPICE.near * 0.85, SPICE.far, 0],
      ['flowering', 21, plan.flowers[0], 0, SPICE.near, 1], ['flowering', 21, plan.flowers[0], SPICE.near * 0.85, SPICE.far, 1],
      ['flowering', 27, plan.flowers[1], 0, SPICE.near, 2], ['flowering', 27, plan.flowers[1], SPICE.near * 0.85, SPICE.far, 2],
      // the forest's edge over the beaches: a wall of saplings, ferns and draped climbers under the canopy
      ['edge', 31, plan.edge, 0, SPICE.near, 0], ['edge', 31, plan.edge, SPICE.near * 0.85, SPICE.edge, 0],
      ['palm', 0, plan.palms, 0, SPICE.near, 0], ['palm', 0, plan.palms, SPICE.near * 0.85, SPICE.far, 0],
      // the terraces' spice gardens: nutmeg (deep green), clove (its young leaf flushed red), pepper on poles
      ['cone', 19, plan.garden[0], 0, SPICE.near, 4], ['cone', 19, plan.garden[0], SPICE.near * 0.85, SPICE.far, 4],
      ['cone', 23, plan.garden[1], 0, SPICE.near, 3], ['cone', 23, plan.garden[1], SPICE.near * 0.85, SPICE.far, 3],
      ['pepper', 29, plan.garden[2], 0, SPICE.near, 4], ['pepper', 29, plan.garden[2], SPICE.near * 0.85, SPICE.far, 4]];
    this.lod = lod.map(([form, seed, parts, from, to, k]) => {
      const g = (form === 'palm' ? kitGeometry('palm', from ? 1 : 0) : rainGeometry(form, from ? 1 : 0, seed)).toNonIndexed();
      for (const [name, size] of [['aFoliage', 3], ['aBloom', 3], ['aSeed', 2]] as const) g.setAttribute(name, new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, parts.length) * size), size));
      return [new Draw(g, from ? far : near, parts.length), parts, from, to, tint(parts, k)];
    });
    this.group.add(...this.draws.map((d) => d.mesh));
  }

  private get draws(): Draw[] {
    return [...this.fixed, ...this.lod.map(([d]) => d)];
  }

  /** Trees whole near the eye and sketched further off, the understory near it; with the camera, only the parts in
   *  its view (the frustum widened for the turn allowed between refills), so nothing behind the eye is drawn. */
  update(eye: V, camera?: THREE.Camera): void {
    this.group.visible = regionSeen(RI, eye, 90);
    if (!this.group.visible) return;
    const fwd = camera ? camera.getWorldDirection(this.fwd) : null;
    if (eye.distanceToSquared(this.seen) < 2.25 && (!fwd || fwd.dot(this.look) > 0.996)) return;
    this.seen.copy(eye);
    if (camera && fwd) {
      this.look.copy(fwd);
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    for (const [d, parts, from, to, tint] of this.lod) {
      const g = d.mesh.geometry, [fo, bl, sd] = ['aFoliage', 'aBloom', 'aSeed'].map((k) => (g.getAttribute(k) as THREE.InstancedBufferAttribute).array as Float32Array);
      let n = 0;
      d.begin();
      parts.forEach((p, i) => {
        const r2 = eye.distanceToSquared(p.at);
        if (r2 < from * from || r2 >= to * to) return;
        if (camera) {
          const h = (p.top - p.base) / 2, c = this.ball.center.copy(p.dir).multiplyScalar(h).add(p.at);
          this.ball.radius = Math.hypot(p.reach, h) + 0.5 + 0.09 * Math.sqrt(r2);
          if (!this.frustum.intersectsSphere(this.ball.set(c, this.ball.radius))) return;
        }
        d.add(p.m);
        fo.set(tint.subarray(i * 8, i * 8 + 3), n * 3);
        bl.set(tint.subarray(i * 8 + 3, i * 8 + 6), n * 3);
        sd.set(tint.subarray(i * 8 + 6, i * 8 + 8), n * 2);
        n++;
      });
      for (const k of ['aFoliage', 'aBloom', 'aSeed']) g.getAttribute(k).needsUpdate = true;
      d.end();
    }
  }

  get triangles(): number {
    return this.group.visible ? this.draws.reduce((s, d) => s + d.triangles, 0) : 0;
  }

  dispose(): void {
    this.material.dispose();
    this.masonry.dispose();
    this.rubble.dispose();
    for (const m of this.trees) m.dispose();
    for (const d of this.draws) d.mesh.geometry.dispose();
  }
}

/** The composition root's Spice Isles (MODULES): the layered jungle and Spice Harbour's quay, apron and godowns. */
export function createSpiceIsles(ctx: RenderContext): RenderModule {
  const terrain = terrains.get(ctx.scene), sea = seas.get(ctx.scene);
  if (!terrain || !sea) throw new Error('createSpiceIsles: the sea and the terrain are built first (MODULES order)');
  const spice = new SpiceIsles(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(spice.group);
  return {
    frame() {
      spice.update(ctx.camera.position, ctx.camera);
    },
    dispose() {
      ctx.scene.remove(spice.group);
      spice.dispose();
    },
  };
}
