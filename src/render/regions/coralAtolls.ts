// The Coral Atolls (WP17 part A): ring reefs round turquoise lagoons in tropical light, the Great Lagoon at their heart.
// The terrain draws the reef flats, motus and white beaches and the sea paints the floor; this module lays the
// lagoons' turquoise and draws what lives and breaks on the reefs, every piece placed from the sim's own heights so the
// drawn reef is exactly the reef a hull meets. The water: a turquoise glaze multiplied over the sea's own surface,
// palest at the beach, richest through the lagoons and the reef-front shallows, cooling to ultramarine down the
// drop-off. Seaward of every reef crest the surf: breakers with a green face under a lead-white crest, rolling in from
// the deep and spending themselves in broken foam on the reef front, drawn wherever water stands over the reef at the
// hour's tide (the break walks out at low water and in at high). On the reef flat (dry at low water, never passable):
// a pink algal ridge of mottled pavement on the seaward edge, a rampart of storm-thrown bleached coral boulders on the
// windward reefs, massive, branching and table corals across the flat, beachrock slabs tilted seaward along the motus'
// shores, and lace foam over every part of the reef a keel would strike at this tide. On the reef front (awash at low
// water, crossed at high) corals whose tops stay under a keel at high water. On the motus: coconut groves broken by
// clearings (three kits, sketched beyond 45 u; the crowns swept to the lee of the trade wind, those on the beach crest
// leaning out over the sand), pandanus on stilt roots, beach scrub, bleached driftwood on the strandline. The channels
// are found by walking each reef's crest in the sim: no reef part, surf or foam lies within 1.6 u of one's centre line;
// every channel is staked on both sides with withies under rose pennants (the Great Lagoon's all through), and a hulk
// that missed the Great Lagoon's lies heeled on the reef flat beside its mouth.
// Hooks: `turtles` (WP23: lagoon water and nesting beaches), `fish` (WP23: over the reef-front corals), `seabirds`
// (WP23: palm crowns and the hulk), `voices` (WP28: the surf's places and loudness), `plan.channels`/`plan.sills`
// (the passes, for cameras and captures).
import * as THREE from 'three';
import { illustratedMaterial, inkMaterial, transmittanceVec, type Style } from '../../style/glsl.ts';
import { PIGMENTS } from '../../style/palette.ts';
import { R } from '../../sim/sphere.ts';
import { coastAt, heightAt, type Geography } from '../../sim/world/geography.ts';
import { DRAFT, REGIONS, TIDE } from '../../sim/world/regions.ts';
import { seas } from '../sea.ts';
import { SWELL_GLSL, type Swell, type SwellSample } from '../swell.ts';
import { GROUND, terrains, type Ground, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, Kit, lift, pose, regionSeen, ring, seeded, vec, type V, washOf, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'coralAtolls');
const REGION = REGIONS[RI];
const TAU = 2 * Math.PI, DEG = Math.PI / 180;
/** Sim heights (u above mean sea): below LOW a hull floats at every tide, at or above BLOCK at none, above LAND dry at
 *  high water. */
export const LOW = -TIDE.amp - DRAFT, BLOCK = TIDE.amp - DRAFT, LAND = TIDE.amp + 0.15;
/** Grid step (u); reef corals and pavement drawn within `near` u of the eye, surf riding the swell and lace within
 *  `far` (the surf beyond it at the tide's level, so the rings read from orbit); the trade wind's lee (chart); the
 *  turquoise glaze's chart half-extent and cell (u) and how far in front of the sea it is depth-tested (u). */
export const CORAL = { step: 1, near: 55, palms: 45, far: 170, lee: [-0.95, -0.3] as const, reach: 72, cell: 1.5, pull: 0.1 } as const;
/** Clearance (u) of reef, surf and foam from a channel's centre line. */
export const CLEAR = 1.6;
/** The motus' dressing grid (u). */
const MOTU = 0.6;

const W = {
  trunk: washOf(PIGMENTS.umber, 0.55), scar: washOf(PIGMENTS.sepia, 0.75),
  frond: washOf(PIGMENTS.malachite, 0.8), frondPale: washOf(PIGMENTS.verdigris, 0.7), frondOld: washOf(PIGMENTS.ochre, 0.75),
  frondDead: washOf(PIGMENTS.umber, 0.85), nut: washOf(PIGMENTS.ochre, 0.95),
  leaf: washOf(PIGMENTS.verdigris, 0.85), root: washOf(PIGMENTS.umber, 0.7), fruit: washOf(PIGMENTS.vermilion, 0.6),
  shrub: washOf(PIGMENTS.malachite, 0.9), shrubLit: washOf(PIGMENTS.verdigris, 0.6), shade: washOf(PIGMENTS.umber, 0.6),
  coral: washOf(PIGMENTS.ochre, 0.55), rose: washOf(PIGMENTS.roseMadder, 0.34), tip: washOf(PIGMENTS.leadWhite, 0.9),
  table: washOf(PIGMENTS.verdigris, 0.55), under: washOf(PIGMENTS.sepia, 0.65),
  bleach: washOf(PIGMENTS.leadWhite, 0.65), rock: washOf(PIGMENTS.sepia, 0.45),
  sand: washOf(PIGMENTS.leadWhite, 0.75), sandEdge: washOf(PIGMENTS.ochre, 0.3),
  face: washOf(PIGMENTS.verdigris, 0.7), crest: washOf(PIGMENTS.leadWhite, 1.25), apron: washOf(PIGMENTS.leadWhite, 0.75), lace: washOf(PIGMENTS.leadWhite, 1.0),
  drift: washOf(PIGMENTS.leadWhite, 0.5), driftDark: washOf(PIGMENTS.sepia, 0.5),
  pole: washOf(PIGMENTS.sepia, 0.85), pennant: washOf(PIGMENTS.roseMadder, 1.1),
  timber: washOf(PIGMENTS.sepia, 0.9), weed: washOf(PIGMENTS.verdigris, 0.95),
};

const T1 = vec(), T2 = vec(), T3 = vec(), T4 = vec();
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
  const top = path[n], Y = vec(0, 1, 0), count = far ? 8 : young ? 9 : 12, L = young ? 0.62 : 0.5, SEG = far ? 2 : 5;
  for (let k = 0; k < count; k++) {
    const phi = (k / count) * TAU + 0.3 * rnd(), d = vec(Math.sin(phi), 0, Math.cos(phi) + 0.6).normalize(), age = k % 4;
    const droop = young ? 0.35 + 0.25 * age : 0.5 + 0.45 * age, rise = young ? 0.55 : 0.4 - 0.08 * age;
    const len = L * (0.85 + 0.3 * rnd()) * (age === 0 ? 0.8 : 1), side = vec().crossVectors(d, Y).normalize();
    b.wash = age === 3 && !young && k % 8 === 3 ? W.frondDead : age === 3 ? W.frondOld : age === 0 ? W.frondPale : W.frond;
    let prev = top.clone();
    for (let i = 1; i <= SEG; i++) {
      const s = i / SEG, p = top.clone().addScaledVector(d, len * s).addScaledVector(Y, len * (rise * s - droop * s * s));
      const w = len * 0.2 * (1 - 0.55 * s) * (i === 1 ? 0.6 : 1), mid = prev.clone().lerp(p, 0.5);
      const hang = vec(0, -len * 0.09, 0).addScaledVector(d, len * 0.05), low = vec(0, -len * 0.03, 0).add(hang);
      b.tri(prev, p, mid.clone().addScaledVector(side, w).add(hang));
      b.tri(p, prev, mid.clone().addScaledVector(side, -w).add(hang));
      b.tri(mid, p, p.clone().addScaledVector(side, 0.8 * w).add(low));
      b.tri(p, mid, p.clone().addScaledVector(side, -0.8 * w).add(low));
      prev = p;
    }
  }
  b.wash = W.nut;
  for (let k = 0; k < (far ? 0 : young ? 2 : 5); k++) blob(b, top.clone().add(vec(0.035 * Math.cos(k * 2.4), -0.035 - 0.015 * (k % 2), 0.035 * Math.sin(k * 2.4))), 0.026);
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

/** A massive (brain or boulder) coral head 1 across, 0.46 tall: rose and ochre on top, dark beneath. */
function massiveKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 8, jit = Array.from({ length: 4 * k }, () => 0.8 + 0.4 * rnd()), b = new Brush(W.coral);
  b.pick = (c, n) => (n.y > 0.7 ? (hash(c.x, c.z) > 0.5 ? W.rose : W.coral) : n.y < 0.2 ? W.under : W.coral);
  b.kit.loft([-0.05, 0.16, 0.32, 0.42].map((y, i) => ring(k, (j) => y + 0.04 * Math.sin(j * 2.3 + i), (j) => [0.5, 0.5, 0.38, 0.16][i] * jit[i * k + j])));
  return b.kit.build();
}

/** A staghorn clump 0.45 tall: forked prongs with pale growing tips. */
function branchKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.coral);
  b.pick = (c) => (c.y > 0.3 ? W.tip : c.y > 0.15 ? W.rose : W.coral);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * TAU + 0.5 * rnd(), lean = 0.3 + 0.6 * rnd(), foot = vec(0.12 * Math.cos(a) * rnd(), -0.04, 0.12 * Math.sin(a) * rnd());
    const tip = foot.clone().add(vec(0.3 * lean * Math.cos(a), 0.42 * (0.7 + 0.3 * rnd()), 0.3 * lean * Math.sin(a))), mid = foot.clone().lerp(tip, 0.45);
    spike(b, foot, tip, 0.035, a);
    spike(b, mid, mid.clone().add(vec(0.15 * Math.cos(a + 0.9), 0.16, 0.15 * Math.sin(a + 0.9))), 0.022, a);
  }
  return b.kit.build();
}

/** A table coral 1 across on its stalk, 0.36 tall, its plate's rim pale. */
function tableKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.under), k = 9;
  spike(b, vec(0, 0.3, 0), vec(0, -0.05, 0), 0.07);
  const top = vec(0.03, 0.34, 0), rim = ring(k, (j) => 0.3 + 0.05 * Math.sin(j * 1.7 + seed), () => 0.5 * (0.8 + 0.35 * rnd()));
  const lip = rim.map((p) => p.clone().multiplyScalar(1.04).setY(p.y - 0.06));
  for (let j = 0; j < k; j++) {
    const a = rim[j], c = rim[(j + 1) % k];
    b.wash = hash(a.x, a.z) > 0.4 ? W.table : W.coral;
    b.tri(top, c, a);
    b.wash = W.tip;
    b.tri(a, c, lip[(j + 1) % k]);
    b.tri(a, lip[(j + 1) % k], lip[j]);
  }
  return b.kit.build();
}

/** A reef-flat paving slab or beachrock slab 1 across, its facets mottled rose, ochre, grey and bleached. */
function slabKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 7, jit = Array.from({ length: k }, () => 0.65 + 0.5 * rnd()), b = new Brush(W.rock);
  b.pick = (c, n) => (n.y < 0.5 ? W.under : [W.rose, W.coral, W.rock, W.bleach][Math.floor(hash(c.x + seed, c.z) * 4)]);
  b.kit.loft([ring(k, -0.06, (j) => 0.5 * jit[j]), ring(k, 0.07, (j) => 0.47 * jit[j]), ring(k, 0.1, (j) => 0.3 * jit[j])]);
  return b.kit.build();
}

/** A storm-thrown coral boulder 1 across, bleached on top. */
function boulderKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), k = 6, jit = Array.from({ length: 3 * k }, () => 0.7 + 0.55 * rnd()), b = new Brush(W.bleach);
  b.pick = (c, n) => (n.y > 0.55 ? W.bleach : n.y < 0 ? W.under : hash(c.x, c.y) > 0.5 ? W.rock : W.coral);
  b.kit.loft([ring(k, -0.1, (j) => 0.42 * jit[j]), ring(k, 0.2, (j) => 0.5 * jit[k + j]), ring(k, 0.42, (j) => 0.22 * jit[2 * k + j])]);
  return b.kit.build();
}

/** A breaker 1 long on x, rolling toward +z (the reef): a low face of green water under a curling lead-white crest,
 *  the spent foam spread behind it in a broken apron, holed and ragged; every face turned up to the sky so the foam
 *  stays paper-white. */
function surfKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.face), N = 6, foot: V[] = [], lip: V[] = [], curl: V[] = [], apron: V[] = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, x = s - 0.5, bow = Math.sin(Math.PI * s), z = -0.12 * bow;
    foot.push(vec(x, -0.02, z - 0.2 * bow - 0.02));
    lip.push(vec(x, 0.07 * bow + 0.01, z));
    curl.push(vec(x * 1.02, 0.05 * bow + 0.01, z + 0.07 * bow + 0.02));
    apron.push(vec(x * (0.8 + 0.3 * rnd()), 0.005, z + 0.18 + 0.4 * bow * (0.5 + rnd())));
  }
  const quad = (a: V, c: V, d: V, e: V): void => { b.tri(a, c, d); b.tri(a, d, e); };
  for (let i = 0; i < N; i++) {
    b.wash = W.face;
    quad(foot[i], foot[i + 1], lip[i + 1], lip[i]);
    b.wash = W.crest;
    quad(lip[i], lip[i + 1], curl[i + 1], curl[i]);
    b.wash = W.apron;
    if (i % 3 !== 1 || rnd() < 0.4) quad(curl[i], curl[i + 1], apron[i + 1], apron[i]);
  }
  return b.kit.build();
}

/** The lagoons' turquoise: a glaze laid over the sea's own surface (riding its swell, depth-tested a hair in front of
 *  it, multiplied into what the sea painted so its floor, rings and strokes all show through), read per pixel from the
 *  sea's field: palest over the sand at the beach, turquoise through the lagoons and the reef-front shallows, cooling
 *  to ultramarine down the drop-off where the sea's own shelf takes over. */
const GLAZE_VERT = /* glsl */ `
uniform float uTime;
${SWELL_GLSL}
out vec3 vRest;
out vec3 vWorld;
void main() {
  vec3 dir = normalize(position), n;
  float lift;
  vec3 w = dir * (SEA_R + uSeaLevel) + swell(dir, uTime, swellAmp(uSeaLevel - seaField(dir).x), n, lift);
  vRest = dir;
  vWorld = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  vec4 nearer = projectionMatrix * viewMatrix * vec4(w + normalize(cameraPosition - w) * ${CORAL.pull.toFixed(2)}, 1.0);
  gl_Position.z = nearer.z / nearer.w * gl_Position.w;
}
`;
const GLAZE_FRAG = /* glsl */ `
${SWELL_GLSL}
uniform vec3 uTurquoise;
uniform vec3 uBlue;
in vec3 vRest;
in vec3 vWorld;
void main() {
  vec3 dir = normalize(vRest), V = normalize(cameraPosition - vWorld);
  Paper q = paperAt(dir * SEA_R, dir, 1.0);
  float depth = uSeaLevel - seaField(dir).x, wet = smoothstep(0.0, 1.0, depth / max(fwidth(depth), 1e-4));
  float glance = 0.6 + 0.4 * smoothstep(0.02, 0.3, dot(V, dir)); // the low eye sees more sky in the water
  float turq = smoothstep(0.0, 0.9, depth) * (0.42 + 0.26 * smoothstep(1.0, 4.0, depth)) * (1.0 - smoothstep(5.0, 10.0, depth));
  float blue = 0.14 * smoothstep(3.0, 6.0, depth) * (1.0 - smoothstep(7.0, 11.0, depth));
  vec3 c = glaze(vec3(1.0), uTurquoise, turq * glance, 0.0, q);
  c = glaze(c, uBlue, blue * glance, 0.6 * exp(-abs(depth - 6.0)), q);
  outColor = vec4(toDisplay(mix(vec3(1.0), c, wet)), 1.0);
  outAux = vec4(1.0); // multiplied: the ink beneath is kept
}
`;

/** The glaze's mesh: the region's chart grid, every cell with water no deeper than the drop-off's foot, at rest on the
 *  unit sphere (the shader lays it on the sea). */
function glazeMesh(geo: Geography): THREE.BufferGeometry {
  const n = Math.round((2 * CORAL.reach) / CORAL.cell) + 1, pos = new Float32Array(n * n * 3), idx: number[] = [];
  const wet = new Uint8Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const d = chartDir(RI, -CORAL.reach + i * CORAL.cell, -CORAL.reach + j * CORAL.cell), h = heightAt(geo, d), k = j * n + i;
      pos.set([d.x, d.y, d.z], 3 * k);
      wet[k] = h > -12 && h < LAND + 0.5 ? 1 : 0;
    }
  }
  for (let j = 0; j + 1 < n; j++) {
    for (let i = 0; i + 1 < n; i++) {
      const k = j * n + i;
      if (wet[k] | wet[k + 1] | wet[k + n] | wet[k + n + 1]) idx.push(k, k + 1, k + n + 1, k, k + n + 1, k + n);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R + 10); // the shader lifts it to the sea
  return g;
}

/** Lace foam: broken flecks in a ring 1 across. */
function laceKit(seed: number): THREE.BufferGeometry {
  const rnd = seeded(seed), b = new Brush(W.lace);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * TAU + 0.5 * rnd(), r = 0.25 + 0.3 * rnd(), c = vec(r * Math.cos(a), 0, r * Math.sin(a)), s = 0.08 + 0.09 * rnd(), q = rnd() * TAU;
    b.tri(c.clone().add(vec(s * Math.cos(q), 0, s * Math.sin(q))), c.clone().add(vec(s * Math.cos(q + 2.3), 0.01, s * Math.sin(q + 2.3))),
      c.clone().add(vec(1.6 * s * Math.cos(q + 4), 0, 1.6 * s * Math.sin(q + 4))));
  }
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

/** A channel withy 1.85 tall: a driven pole, a broom topmark and a rose pennant. */
function stakeKit(): THREE.BufferGeometry {
  const b = new Brush(W.pole);
  tube(b, [vec(0, -0.3, 0), vec(0.02, 1.6, 0)], [0.045, 0.03], 4);
  for (let k = 0; k < 4; k++) spike(b, vec(0.02, 1.45, 0), vec(0.02 + 0.16 * Math.cos(k * 1.6), 1.85, 0.16 * Math.sin(k * 1.6)), 0.015, k);
  b.wash = W.pennant;
  b.tri(vec(0.03, 1.55, 0), vec(0.03, 1.3, 0), vec(0.42, 1.44, 0.05));
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
export interface Part { m: THREE.Matrix4; at: V; dir: V; base: number; ground: number; sim: number; top: number }
/** A breaker's rest: direction, seaward tangent, drawn ground, sim height, phase, length. */
export interface Surf { dir: V; out: V; ground: number; sim: number; phase: number; length: number }
export interface Lace { dir: V; tan: V; ground: number; sim: number; yaw: number; size: number }
/** A pass through a reef ring (bearing in degrees from chart east, width u at the crest) and its centre line (outside
 *  in, 1 u apart). */
export interface Channel { reef: number; great: boolean; bearing: number; width: number; crest: { x: number; y: number }; centre: { x: number; y: number }; line: V[] }
export interface CoralPlan {
  palms: Part[][]; pandanus: Part[]; shrubs: Part[]; heads: Part[]; branches: Part[]; tables: Part[]; slabs: Part[];
  boulders: Part[]; drift: Part[]; stakes: Part[]; hulks: Part[]; surf: Surf[]; lace: Lace[];
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
    drift: [], stakes: [], hulks: [], surf: [], lace: [], channels: [], sills: [], turtles: { swim: [], nest: [] }, fish: [],
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
  // nothing of the reef, its surf or its foam within `CLEAR` u of a channel's centre line
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
      const px = x + (rnd() - 0.5) * 0.9, py = y + (rnd() - 0.5) * 0.9, h = sim(px, py), r = rnd(), q = rnd();
      if (h < LOW) {
        if (h > -5 && Math.hypot(px - mark.x, py - mark.y) < mark.r - 2 && r < 0.05) plan.turtles.swim.push(chartDir(RI, px, py));
        continue;
      }
      const dir = chartDir(RI, px, py), ground = field.surface(dir, -10, S).height;
      const gx = sim(px + 0.7, py) - sim(px - 0.7, py), gy = sim(px, py + 0.7) - sim(px, py - 0.7), gl = Math.hypot(gx, gy);
      const ox = gl > 1e-4 ? -gx / gl : 1, oy = gl > 1e-4 ? -gy / gl : 0, slope = gl / 1.4;
      const seaward = sim(px + 6 * ox, py + 6 * oy) < -6, out = tan(px, py, ox, oy), east = tan(px, py, 1, 0);
      const windward = -(ox * lee[0] + oy * lee[1]) > 0.3, yaw = rnd() * TAU;
      if (h > LAND) continue; // the motus are dressed below, on a finer grid
      // the reef: a hull grounds here at low water at least (and none of it in a channel)
      if (open(px, py)) continue;
      if (seaward && h <= 0.6 && slope > 0.12) plan.surf.push({ dir, out, ground, sim: h, phase: rnd(), length: 2.2 + 1.8 * rnd() });
      if (q < 0.45) plan.lace.push({ dir, tan: east, ground, sim: h, yaw: rnd() * TAU, size: 0.4 + 0.6 * rnd() });
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
      if (r < 0.3 + 0.4 * grove) {
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
    const e = c.great ? across(0, 1, 3.5) : null;
    if (e && !open(e.x, e.y, 2.5)) {
      const p = place(plan.hulks, e.x, e.y, { sink: 0.12, fwd: tan(e.x, e.y, ux, uy), yaw: 0.4, tilt: 0.3, s: 3.4, kitH: 0.4 });
      plan.seabirds.push(lift(p.dir, p.top));
    }
  }
  // the surf's voices: its breakers binned 10 u apart, loudest where most break
  const bins = new Map<string, { at: V; n: number }>();
  for (const s of plan.surf) {
    const k = [s.dir.x, s.dir.y, s.dir.z].map((v) => Math.round((v * R) / 10)).join(','), b = bins.get(k);
    if (b) { b.at.add(s.dir); b.n++; } else bins.set(k, { at: s.dir.clone(), n: 1 });
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
  private readonly glaze: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly fixed: Draw[];
  /** [draw, parts, from, to (u from the eye), drawn only while dry] */
  private readonly near: [Draw, Part[], number, number, boolean][];
  private drawn = NaN;
  private readonly surf: Draw;
  private readonly lace: Draw;
  private readonly swell: Swell;
  private readonly sample: SwellSample = { height: 0, normal: vec() };
  private readonly seen = vec(1e9, 0, 0);
  private readonly m = new THREE.Matrix4();

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
      fixed(pandanusKit(5), plan.pandanus), fixed(shrubKit(9), plan.shrubs),
      fixed(driftKit(4), plan.drift), fixed(stakeKit(), plan.stakes), fixed(hulkKit(8), plan.hulks),
    ];
    // the reef's parts near the eye (the pavement only while dry: it goes under the drawn water, not through it); palms
    // in full near the eye, sketched beyond
    const near: [THREE.BufferGeometry, Part[], number, number, boolean][] = [[massiveKit(2), plan.heads, 0, CORAL.near, false], [branchKit(6), plan.branches, 0, CORAL.near, false],
      [tableKit(7), plan.tables, 0, CORAL.near, false], [slabKit(12), plan.slabs, 0, CORAL.near, true], [boulderKit(13), plan.boulders, 0, CORAL.near, false],
      ...[11, 29, 23].flatMap((seed, k): [THREE.BufferGeometry, Part[], number, number, boolean][] => [
        [palmKit(seed, k === 2), plan.palms[k], 0, CORAL.palms, false], [palmKit(seed, k === 2, true), plan.palms[k], CORAL.palms, 1e4, false]])];
    this.near = near.map(([kit, parts, from, to, dry]) => [new Draw(kit, this.material, parts.length), parts, from, to, dry]);
    this.surf = new Draw(surfKit(1), this.material, plan.surf.length);
    this.lace = new Draw(laceKit(2), this.material, plan.lace.length);
    const glaze = inkMaterial(style, { vertexShader: GLAZE_VERT, fragmentShader: GLAZE_FRAG, uniforms: { ...swell.uniforms,
      uTurquoise: { value: transmittanceVec(PIGMENTS.verdigris) }, uBlue: { value: transmittanceVec(PIGMENTS.ultramarine) } } });
    // multiplied into both targets: colour by the glaze, the ink and veil kept (× 1)
    Object.assign(glaze, { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
    this.glaze = new THREE.Mesh(glazeMesh(field.geo), glaze);
    this.glaze.frustumCulled = false;
    this.glaze.renderOrder = 1; // over the flora's coral seen through the water, so it lies under the turquoise
    this.group.add(this.glaze, ...this.draws.map((d) => d.mesh));
  }

  private get draws(): Draw[] {
    return [...this.fixed, ...this.near.map(([d]) => d), this.surf, this.lace];
  }

  /** The reef's corals near the eye, the surf rolling in at the tide's edge, lace over what a keel would strike now. */
  update(eye: V, clock: number): void {
    this.group.visible = regionSeen(RI, eye, 90);
    if (!this.group.visible) return;
    const level = this.swell.uniforms.uSeaLevel.value as number, far2 = CORAL.far ** 2;
    if (eye.distanceToSquared(this.seen) > 2.25 || Math.abs(level - this.drawn) > 0.01) {
      this.seen.copy(eye);
      this.drawn = level;
      for (const [d, parts, from, to, dry] of this.near) {
        d.begin();
        for (const p of parts) {
          const r2 = eye.distanceToSquared(p.at);
          if (r2 >= from * from && r2 < to * to && (!dry || p.ground > level - 0.02)) d.add(p.m);
        }
        d.end();
      }
    }
    this.surf.begin();
    const thin = CORAL.near ** 2;
    this.plan.surf.forEach((s, i) => {
      if (s.ground > level - 0.05) return; // dry at this tide: the break has walked off it
      const r2 = eye.distanceToSquared(lift(s.dir, level, T1)), rest = r2 > far2;
      if (r2 > thin && i % 2) return; // every other breaker past the near reef: they overlap there
      const ph = rest ? 0.55 : (clock * 0.16 + s.phase) % 1;
      T3.copy(s.dir).addScaledVector(s.out, rest ? 0 : (2.6 * (1 - ph) - 0.6) / R).normalize(); // rolls in from seaward and spends itself
      const h = this.surfaceAt(eye, T3, clock, level), up = h === level ? T3 : this.sample.normal, grow = Math.sin(Math.PI * Math.min(1, ph * 1.15));
      this.surf.add(pose(this.m, lift(T3, h + CORAL.pull + 0.05, T1), up, T2.copy(s.out).negate(), 0, 0, 1.3 * s.length * (0.55 + 0.45 * grow), 1.8 + 1.6 * grow, rest ? 0.8 : 1.2 + 1.8 * (1 - ph)));
    });
    this.surf.end();
    this.lace.begin();
    for (const f of this.plan.lace) {
      if (f.sim < level - DRAFT || f.ground > level - 0.02) continue; // a hull floats here now, or it is dry
      if (eye.distanceToSquared(lift(f.dir, level, T1)) > thin * 2.6) continue;
      const h = this.surfaceAt(eye, f.dir, clock, level), up = h === level ? f.dir : this.sample.normal;
      const yaw = f.yaw + 0.3 * Math.sin(clock * 0.5 + f.yaw), size = f.size * (0.8 + 0.2 * Math.sin(clock * 1.7 + 5 * f.yaw));
      this.lace.add(pose(this.m, lift(f.dir, h + CORAL.pull + 0.04, T1), up, f.tan, yaw, 0, size, 1, size));
    }
    this.lace.end();
  }

  /** The water at `dir`: riding the swell within 40 u of the eye, at the tide's level beyond. */
  private surfaceAt(eye: V, dir: V, clock: number, level: number): number {
    lift(dir, level, T4);
    if (eye.distanceToSquared(T4) > 1600) return level;
    this.swell.sample(dir, clock, this.sample);
    return this.sample.height;
  }

  get triangles(): number {
    return this.group.visible ? this.draws.reduce((s, d) => s + d.triangles, this.glaze.geometry.index!.count / 3) : 0;
  }

  dispose(): void {
    this.material.dispose();
    this.glaze.material.dispose();
    this.glaze.geometry.dispose();
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
      coral.update(ctx.camera.position, ctx.pipeline.style.uniforms.uTime.value);
    },
    dispose() {
      ctx.scene.remove(coral.group);
      coral.dispose();
    },
  };
}
