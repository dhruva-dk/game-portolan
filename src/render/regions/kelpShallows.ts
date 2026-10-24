// The Kelp Shallows (WP16 part C): golden-green kelp under clear water. The flora (flora.ts) roots kelp across the
// kelp floors and the sea (sea.ts) paints those floors through the clear water; this module floats the canopies over
// them: rosettes of blades buoyed by gas bladders, riding the swell near the eye and swaying in the current, broken by
// leads of open water, so a ship inside a bed sits half-hidden among the fronds as the sim hides it (environment.ts,
// visibility.ts). The Kelp Cathedral: a horseshoe of compound piers of towering kelp round a clear nave, its door to
// the south, each pier crowned by a great floating rosette (the mark read from orbit), the nave crossed by hatched
// shafts of sunlight refracted down to the floor. On the rocky islets: boulders at the waterline, tide pools on the
// benches, wrack along the strand line. Hook: rafts (WP23's otters).
import * as THREE from 'three';
import { illustratedMaterial, inkMaterial, linearVec, transmittanceVec, type Style } from '../../style/glsl.ts';
import { PIGMENTS, type RGB } from '../../style/palette.ts';
import { coastAt, heightAt } from '../../sim/world/geography.ts';
import { REGIONS, TIDE } from '../../sim/world/regions.ts';
import { FLORA, floraMaterial, kitGeometry } from '../flora.ts';
import { seas } from '../sea.ts';
import type { Swell, SwellSample } from '../swell.ts';
import { GROUND, terrains, type Surface, type TerrainField } from '../terrain.ts';
import type { RenderContext, RenderModule } from '../world.ts';
import { chartDir, Draw, facetUV, Kit, lift, pose, regionSeen, ring, seeded, vec, type V, type Wash } from './kit.ts';

const RI = REGIONS.findIndex((r) => r.id === 'kelpShallows');
const REGION = REGIONS[RI], MARK = REGION.landmark;
const BEDS = REGION.strokes.flatMap((s) => (s.k === 'kelp' ? [s] : []));
/** The Cathedral round its mark, chart u: `piers` places on a ring of radius `ring`, the `door` places to the south
 *  left open; each pier a cluster of `stipes` towering stipes; ordinary canopy kept beyond `clear`. */
const NAVE = { ring: 10.2, piers: 18, door: 3, stipes: 5, clear: 12.8 };
/** Light shafts down the nave (a Latin cross of them), chart offsets from the mark. */
const SHAFTS = [[0, -6.5], [0, -3.2], [0, 0], [0, 3.2], [0, 6.5], [-6.2, 1], [-3, 1], [3, 1], [6.2, 1]] as const;
/** Canopy: grid step (u), the distance within which it rides the swell, its lift over the water, how many. */
const CANOPY = { step: 2.3, near: 60, lift: 0.04, cap: 1100 };
const SHORE = { step: 0.6, wrack: 520, pools: 170, boulders: 420 };
/** Water's refractive index, inverted. */
const ETA = 1 / 1.33;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mixT = (a: RGB, b: RGB, k: number): V => transmittanceVec(a).lerp(transmittanceVec(b), k);
const wash = (t: V, d: number): Wash => ({ t, d });
const INK = {
  gold: mixT(PIGMENTS.ochre, PIGMENTS.malachite, 0.18),
  green: mixT(PIGMENTS.ochre, PIGMENTS.malachite, 0.5),
  olive: mixT(PIGMENTS.ochre, PIGMENTS.umber, 0.35),
  bladder: mixT(PIGMENTS.ochre, PIGMENTS.umber, 0.55),
  stipe: transmittanceVec(PIGMENTS.umber),
  wrack: mixT(PIGMENTS.umber, PIGMENTS.ironGall, 0.45),
  weed: transmittanceVec(PIGMENTS.verdigris),
  pool: mixT(PIGMENTS.verdigris, PIGMENTS.leadWhite, 0.55),
  rock: transmittanceVec(PIGMENTS.sepia),
  stone: mixT(PIGMENTS.umber, PIGMENTS.sepia, 0.5),
  wet: transmittanceVec(PIGMENTS.ironGall),
};
const radial = (c: V, _n: V, out: V) => out.set(c.x, 0, c.z);

/** A small float on a kit: a four-sided cone at o (its base on the surface beneath), radius r. */
function bead(kit: Kit, o: V, r: number): void {
  const e = ring(4, o.y + 0.004, () => r).map((p) => p.add(vec(o.x, 0, o.z))), apex = vec(o.x, o.y + 1.5 * r, o.z);
  for (let j = 0; j < 4; j++) kit.tri(e[j], apex, e[(j + 1) % 4]);
}

/** A floating canopy in its own frame (y up, radius about 1): `blades` blades streaming out from the knot where the
 *  stipes reach the surface, each buoyed by a gas bladder at its base, ruffled and twisted as it lies on the water;
 *  washed golden at the tips through green to olive, banded as the blades overlap. */
function rosetteKit(blades: number, segs: number, bladder: number, seed: number): THREE.BufferGeometry {
  const rng = seeded(seed);
  let as: Wash | null = null;
  const kit = new Kit((c) => {
    if (as) return as;
    const r = Math.hypot(c.x, c.z), band = (((Math.floor(r * 7 + Math.atan2(c.z, c.x) * 2.3) % 3) + 3) % 3);
    return wash(band === 0 ? INK.green : band === 1 ? INK.gold : INK.olive, 0.5 + 0.4 * (1 - r));
  });
  for (let b = 0; b < blades; b++) {
    const az = ((b + 0.35 * rng()) / blades) * 2 * Math.PI, len = 0.7 + 0.3 * rng(), arch = 0.02 + 0.025 * rng(), twist = rng() * 6;
    const d = vec(Math.cos(az), 0, Math.sin(az)), q = vec(-Math.sin(az), 0, Math.cos(az));
    const spine = (t: number) => {
      const c = d.clone().multiplyScalar(0.1 + t * len).addScaledVector(q, 0.07 * Math.sin(t * 4.5 + twist) * t);
      return c.setY(0.03 + arch * Math.sin(Math.PI * t));
    };
    const L: V[] = [], Rt: V[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, hw = 0.025 + 0.1 * Math.sin(Math.PI * (0.12 + 0.88 * t)) * (1 - 0.35 * t), c = spine(t);
      const ruffle = 0.012 * Math.sin(i * 2.1 + twist);
      L.push(c.clone().addScaledVector(q, hw).setY(c.y + ruffle));
      Rt.push(c.clone().addScaledVector(q, -hw).setY(c.y - ruffle));
    }
    for (let i = 0; i < segs; i++) {
      kit.tri(L[i], Rt[i + 1], Rt[i]);
      kit.tri(L[i], L[i + 1], Rt[i + 1]);
    }
    as = wash(INK.bladder, 1.05);
    bead(kit, spine(0.16), bladder);
    as = null;
  }
  as = wash(INK.stipe, 0.95);
  const knot = ring(5, 0.02, () => 0.12);
  for (let j = 0; j < 5; j++) kit.tri(knot[j], vec(0, 0.11, 0), knot[(j + 1) % 5]);
  return facetUV(kit.build(), radial);
}

/** A tangle of cast-up kelp on the strand line (y up, about 1 u long): three stranded stipes, dried near black,
 *  bronze and olive, with their bladders. */
function wrackKit(): THREE.BufferGeometry {
  const rng = seeded(71);
  let as = wash(INK.wrack, 1.1);
  const kit = new Kit(() => as);
  for (let s = 0; s < 3; s++) {
    as = wash([INK.wrack, INK.olive, INK.stipe][s], [1.15, 0.85, 0.95][s]);
    const x0 = (s - 1) * 0.16, ph = rng() * 6, len = 0.7 + 0.3 * rng(), pts: V[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(vec(x0 + 0.09 * Math.sin(t * 5 + ph), 0.03 + 0.012 * Math.sin(t * 7 + ph), (t - 0.5) * len));
    }
    for (let i = 0; i < 5; i++) {
      const w0 = 0.05 - 0.02 * Math.abs(i / 5 - 0.5), w1 = 0.05 - 0.02 * Math.abs((i + 1) / 5 - 0.5);
      const L0 = pts[i].clone().setX(pts[i].x - w0), R0 = pts[i].clone().setX(pts[i].x + w0);
      const L1 = pts[i + 1].clone().setX(pts[i + 1].x - w1), R1 = pts[i + 1].clone().setX(pts[i + 1].x + w1);
      kit.tri(L0, R1, R0);
      kit.tri(L0, L1, R1);
    }
    as = wash(INK.bladder, 1);
    bead(kit, pts[1 + s], 0.035);
  }
  return facetUV(kit.build(), (_c, _n, out) => out.set(0, 0, 1));
}

/** A tide pool in a rock bench (y up, radius about 1): pale still water holding the sky inside a lip of weed and
 *  barnacles, its skirt sunk into the rock. */
function poolKit(seed: number): THREE.BufferGeometry {
  const rng = seeded(seed), jit = Array.from({ length: 9 }, () => 0.75 + 0.25 * rng());
  const kit = new Kit((c, n) => {
    if (n.y > 0.995 && c.y < 0.035 && Math.hypot(c.x, c.z) < 0.9) return wash(INK.pool, 0.4);
    return c.y > 0.045 ? wash(INK.weed, 0.85) : wash(INK.stone, 0.6);
  });
  kit.loft([ring(9, -0.03, (j) => 1.55 * jit[j]), ring(9, 0.09, (j) => 1.25 * jit[j]), ring(9, 0.03, (j) => jit[j])]);
  return facetUV(kit.build(), (_c, _n, out) => out.set(1, 0, 0.3));
}

/** A waterline boulder (y up, radius about 1, 0.75 high): weed-dark and wet below the tide mark, sepia above. */
function boulderKit(seed: number): THREE.BufferGeometry {
  const rng = seeded(seed), rad = [0.92, 1, 0.78, 0.36], hs = [0, 0.3, 0.6, 0.74];
  const kit = new Kit((c, n) => (c.y < 0.28
    ? wash(n.y > 0.3 ? INK.weed : INK.wet, n.y > 0.3 ? 0.8 : 0.85)
    : wash(n.y > 0.6 ? INK.rock : INK.stone, n.y > 0.6 ? 0.5 : 0.7)));
  kit.loft(rad.map((r, i) => ring(7, (k) => hs[i] + 0.06 * Math.sin(k * 2.3 + i), () => r * (0.85 + 0.3 * rng()))));
  return facetUV(kit.build(), (_c, n, out) => out.set(0, 1, 0).addScaledVector(n, -n.y));
}

/** One floating canopy: chart position, unit direction, its world point at sea level, its north, size, kit. */
export interface Float { x: number; y: number; dir: V; at: V; north: V; scale: number; yaw: number; phase: number; kit: 0 | 1 }
export interface Stipe { m: THREE.Matrix4; foliage: V; phase: number }
export interface Shaft { dir: V; east: V; depth: number; w: number; phase: number }
export interface KelpPlan {
  floats: Float[];
  /** The Cathedral's towering kelp, each rooted on the floor and reaching the surface (flora kelp kit). */
  stipes: Stipe[];
  shafts: Shaft[];
  wrack: THREE.Matrix4[];
  pools: THREE.Matrix4[];
  boulders: THREE.Matrix4[];
  rafts: V[];
}

/** Lay out the region: the Cathedral, the canopy over every bed, and the islets' shores. */
export function planKelp(field: TerrainField): KelpPlan {
  const geo = field.geo, rng = seeded(144), TAU = 2 * Math.PI;
  const deep = (d: V) => -heightAt(geo, d);
  const north = (x: number, y: number, d: V) => chartDir(RI, x, y + 1).sub(d).normalize();
  const floats: Float[] = [], stipes: Stipe[] = [], shafts: Shaft[] = [];
  const float = (x: number, y: number, dir: V, scale: number, kit: 0 | 1) =>
    floats.push({ x, y, dir, at: lift(dir, 0), north: north(x, y, dir), scale, yaw: rng() * TAU, phase: rng() * TAU, kit });

  // the Cathedral: compound piers on a horseshoe round the nave, crowned by great rosettes
  for (let k = 0; k < NAVE.piers; k++) {
    if (Math.min(k, NAVE.piers - k) <= (NAVE.door - 1) / 2) continue;
    const a = -Math.PI / 2 + (k / NAVE.piers) * TAU;
    const x = MARK.x + NAVE.ring * Math.cos(a) + 0.5 * (rng() - 0.5), y = MARK.y + NAVE.ring * Math.sin(a) + 0.5 * (rng() - 0.5);
    const centre = chartDir(RI, x, y);
    if (deep(centre) < 1.6) continue;
    for (let s = 0; s < NAVE.stipes; s++) {
      const ga = s * 2.4 + rng(), rr = s ? 0.35 + 0.5 * rng() : 0, sx = x + rr * Math.cos(ga), sy = y + rr * Math.sin(ga);
      const dir = chartDir(RI, sx, sy), depth = deep(dir), w = 2.6 + 0.9 * rng();
      if (depth < 1.4) continue;
      stipes.push({
        m: pose(new THREE.Matrix4(), lift(dir, -depth), dir, north(sx, sy, dir), rng() * TAU, 0, w, depth, w),
        foliage: mixT(PIGMENTS.ochre, PIGMENTS.malachite, 0.2 + 0.3 * rng()),
        phase: rng() * TAU,
      });
    }
    float(x, y, centre, 2.3 + 0.4 * rng(), 1);
  }
  for (const [dx, dy] of SHAFTS) {
    const x = MARK.x + dx + 0.6 * (rng() - 0.5), y = MARK.y + dy + 0.6 * (rng() - 0.5), dir = chartDir(RI, x, y);
    shafts.push({ dir, east: chartDir(RI, x + 1, y).sub(dir).normalize(), depth: Math.max(deep(dir), 1), w: 0.9 + 0.6 * rng(), phase: rng() * TAU });
  }

  // the canopy over every other bed, thinning to its edge and parted by leads of open water
  for (let y = -80; y <= 80; y += CANOPY.step) {
    for (let x = -80; x <= 80; x += CANOPY.step) {
      const px = x + 0.8 * CANOPY.step * (rng() - 0.5), py = y + 0.8 * CANOPY.step * (rng() - 0.5);
      if (Math.hypot(px - MARK.x, py - MARK.y) < NAVE.clear || floats.length >= CANOPY.cap) continue;
      const bed = BEDS.find((b) => Math.hypot(px - b.x, py - b.y) < b.r - 1.2);
      if (!bed) continue;
      const lead = Math.sin(px * 0.23 + 1.3) * Math.sin(py * 0.19 - 0.4) + 0.5 * Math.sin((px - py) * 0.31);
      if (rng() > smooth(bed.r - 1.2, bed.r - 5, Math.hypot(px - bed.x, py - bed.y)) * (lead > -0.5 ? 1 : 0.2)) continue;
      const dir = chartDir(RI, px, py);
      if (deep(dir) < 1.2 || coastAt(geo, dir) < 1.5) continue;
      float(px, py, dir, 0.95 + 0.75 * rng(), 0);
    }
  }
  const rafts = REGION.fauna.filter((o) => o.species === 'otter').flatMap((o) =>
    floats.filter((f) => Math.hypot(f.x - o.x, f.y - o.y) < o.r).slice(0, Math.ceil(o.count / 2)).map((f) => f.dir));

  // the islets' shores: wrack on the strand line, pools on the rock benches, boulders at the waterline
  const S: Surface = { height: 0, normal: vec(), up: 1, ground: 0, region: 0 };
  const keep = [...REGION.harbours.map((h) => [h.x, h.y, h.r + 2.5]), ...REGION.lighthouses.map((l) => [l.x, l.y, 4.5])];
  const taken = new Set<number>(), wrack: THREE.Matrix4[] = [], pools: THREE.Matrix4[] = [], boulders: THREE.Matrix4[] = [];
  const fall = vec(), along = vec();
  for (let y = -66; y <= 66; y += SHORE.step) {
    for (let x = -66; x <= 66; x += SHORE.step) {
      const px = x + 0.4 * SHORE.step * (rng() - 0.5), py = y + 0.4 * SHORE.step * (rng() - 0.5), dir = chartDir(RI, px, py);
      const h = field.height(dir);
      if (h < -0.8 || h > TIDE.amp + 0.4 || keep.some(([kx, ky, kr]) => Math.hypot(px - kx, py - ky) < kr)) continue;
      field.surface(dir, 0, S);
      fall.copy(S.normal).addScaledVector(dir, -S.normal.dot(dir));
      along.crossVectors(dir, fall);
      if (along.lengthSq() < 1e-8) along.copy(north(px, py, dir));
      const r = rng(), cell = Math.round(px / 1.3) * 1000 + Math.round(py / 1.3), at = S.height;
      if (at > TIDE.amp - 0.05 && at < TIDE.amp + 0.35 && S.up > 0.75 && S.ground !== GROUND.cliff && r < 0.45) {
        if (wrack.length < SHORE.wrack) wrack.push(pose(new THREE.Matrix4(), lift(dir, at), S.normal, along, (rng() - 0.5) * 0.6, 0, 0.7 + 0.8 * rng()));
      } else if (at > 0.05 && at < TIDE.amp - 0.1 && S.up > 0.94 && S.ground !== GROUND.beach && S.ground !== GROUND.mud && r < 0.12 && !taken.has(cell)) {
        taken.add(cell);
        const s = 0.35 + 0.4 * rng();
        if (pools.length < SHORE.pools) pools.push(pose(new THREE.Matrix4(), lift(dir, at), S.normal, along, rng() * TAU, 0, s, 1, s));
      } else if (at < 0.45 && S.up > 0.55 && r < 0.13 && !taken.has(cell) && boulders.length < SHORE.boulders) {
        const s = 0.25 + 0.45 * rng() ** 2, up = dir.clone().lerp(S.normal, 0.5);
        boulders.push(pose(new THREE.Matrix4(), lift(dir, at - 0.22 * s), up, along, rng() * TAU, 0, s * (0.8 + 0.5 * rng()), s * (0.7 + 0.4 * rng()), s * (0.8 + 0.5 * rng())));
      }
    }
  }
  return { floats, stipes, shafts, wrack, pools, boulders, rafts };
}

// The light shafts: hatched rays laid as a veil through the water, refracted from the sun down to the floor.
const SHAFT_VERT = /* glsl */ `
uniform float uTime;
in vec3 aShaft;
out vec3 vShaftWorld;
out vec3 vShaft;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vShaftWorld = w.xyz;
  // the rays waver as the swell's lenses pass overhead
  vShaft = vec3(aShaft.xy, 0.6 * sin(uTime * 0.35 + aShaft.z) + 0.25 * sin(uTime * 0.9 + 2.0 * aShaft.z));
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SHAFT_FRAG = /* glsl */ `
uniform float uShaftLight;
uniform vec3 uShaftColour;
in vec3 vShaftWorld;
in vec3 vShaft; // across (-1 to 1), down (0 at the surface, 1 at the floor), waver
void main() {
  // fine strokes running down the ray, spaced across it, broken where the pen lifted
  float sx = (vShaft.x * 0.5 + 0.5) * 6.0 + vShaft.z, si = floor(sx), sd = abs(fract(sx) - 0.5), sw = fwidth(sx);
  float sh = fract(sin(si * 12.9898 + 4.1) * 43758.5453);
  float strokeA = 1.0 - smoothstep(0.13 - sw, 0.13 + sw, sd);
  float gapA = smoothstep(0.0, 0.06, fract(vShaft.y * (2.0 + 2.0 * sh) + sh) - 0.1 * sh);
  float sideA = 1.0 - smoothstep(0.55, 1.0, abs(vShaft.x));
  float fallA = smoothstep(0.0, 0.06, vShaft.y) * pow(1.0 - vShaft.y, 1.4);
  float a = strokeA * gapA * (0.6 + 0.3 * sh);
  // and a faint wash between the strokes: the water lit along the ray
  a = clamp(max(a, 0.18) * sideA * fallA * uShaftLight, 0.0, 1.0);
  writeVeil(candle(uShaftColour, vShaftWorld), a);
}`;
/** Each shaft's two crossed quads: corners (across, down), two triangles each. */
const CORNERS = [[-1, 0], [1, 1], [1, 0], [-1, 0], [-1, 1], [1, 1]] as const;
const RAY = vec(), TOP = vec(), BOT = vec(), A1 = vec(), A2 = vec(), P = vec();

export class KelpShallows {
  readonly group = new THREE.Group();
  /** Where WP23's otters raft, wrapped in the canopy: unit directions over the beds they haunt. */
  readonly rafts: readonly V[];
  private readonly plan: KelpPlan;
  private readonly material: THREE.ShaderMaterial;
  private readonly floats: Draw[];
  private readonly fixed: Draw[];
  private readonly shafts: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly style: Style;
  private readonly swell: Swell;
  private readonly markUp: V;
  private readonly sample: SwellSample = { height: 0, normal: vec() };
  private readonly sun = vec(2, 0, 0);
  private readonly at = vec();
  private readonly m = new THREE.Matrix4();

  constructor(style: Style, field: TerrainField, swell: Swell) {
    const plan = (this.plan = planKelp(field));
    this.rafts = plan.rafts;
    this.style = style;
    this.swell = swell;
    this.markUp = chartDir(RI, MARK.x, MARK.y);
    this.material = illustratedMaterial(style, { pigment: PIGMENTS.ochre, painted: true, hatch: { mode: 'uv', scale: [2, 0.3] }, side: THREE.DoubleSide });
    const counts = [0, 1].map((k) => plan.floats.filter((f) => f.kit === k).length);
    this.floats = [rosetteKit(7, 4, 0.05, 5), rosetteKit(12, 5, 0.075, 13)].map((g, k) => new Draw(g, this.material, counts[k]));

    // the Cathedral's towering kelp: the flora's kelp, seen through the water as a veil, far beyond the flora's reach
    const kelp = kitGeometry('kelp', 0).clone(), n = plan.stipes.length, foliage = new Float32Array(3 * n), seed = new Float32Array(2 * n);
    plan.stipes.forEach((s, i) => {
      foliage.set([s.foliage.x, s.foliage.y, s.foliage.z], 3 * i);
      seed.set([s.phase, 1e4], 2 * i);
    });
    kelp.setAttribute('aFoliage', new THREE.InstancedBufferAttribute(foliage, 3));
    kelp.setAttribute('aBloom', new THREE.InstancedBufferAttribute(foliage.slice(), 3));
    kelp.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
    const towering = floraMaterial(style, swell, { band: new THREE.Vector4(-1, 0, 340, 400), sway: FLORA.kelp.sway, veil: true });
    const halves = [0, 1].map((k) => plan.boulders.filter((_, i) => i % 2 === k));
    this.fixed = [
      new Draw(kelp, towering, n).fill(plan.stipes.map((s) => s.m)),
      new Draw(wrackKit(), this.material, plan.wrack.length).fill(plan.wrack),
      new Draw(poolKit(29), this.material, plan.pools.length).fill(plan.pools),
      ...halves.map((ms, k) => new Draw(boulderKit(17 + 14 * k), this.material, ms.length).fill(ms)),
    ];

    const verts = plan.shafts.length * 2 * CORNERS.length, g = new THREE.BufferGeometry(), aShaft = new Float32Array(3 * verts);
    plan.shafts.forEach((s, i) => {
      for (let q = 0; q < 2; q++) CORNERS.forEach(([u, v], k) => aShaft.set([u, v, s.phase + 1.7 * q], 3 * ((2 * i + q) * CORNERS.length + k)));
    });
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * verts), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShaft', new THREE.BufferAttribute(aShaft, 3));
    const colour = linearVec(PIGMENTS.leadWhite).lerp(linearVec(PIGMENTS.ochre), 0.2);
    this.shafts = new THREE.Mesh(g, inkMaterial(style, {
      vertexShader: SHAFT_VERT, fragmentShader: SHAFT_FRAG, veil: true, side: THREE.DoubleSide,
      uniforms: { uShaftLight: { value: 0 }, uShaftColour: { value: colour } },
    }));
    this.shafts.frustumCulled = false;
    this.group.add(...this.floats.map((d) => d.mesh), ...this.fixed.map((d) => d.mesh), this.shafts);
  }

  /** Lays each shaft along the sun's ray refracted into the water, from the surface down to the floor. */
  private shape(sun: V): void {
    const pos = this.shafts.geometry.getAttribute('position') as THREE.BufferAttribute;
    let o = 0;
    for (const s of this.plan.shafts) {
      const cosi = Math.max(sun.dot(s.dir), 0.05), k = 1 - ETA * ETA * (1 - cosi * cosi);
      RAY.copy(sun).multiplyScalar(-ETA).addScaledVector(s.dir, ETA * cosi - Math.sqrt(k));
      lift(s.dir, -0.05, TOP);
      BOT.copy(TOP).addScaledVector(RAY, s.depth / Math.max(-RAY.dot(s.dir), 0.3));
      A1.crossVectors(RAY, s.east).normalize();
      A2.crossVectors(RAY, A1).normalize();
      for (const a of [A1, A2]) {
        for (const [u, v] of CORNERS) {
          P.copy(v ? BOT : TOP).addScaledVector(a, u * s.w * (v ? 1.6 : 1));
          pos.setXYZ(o++, P.x, P.y, P.z);
        }
      }
    }
    pos.needsUpdate = true;
  }

  /** The canopies at render clock `clock`: riding the swell within reach of the eye, at the tide's level beyond. */
  update(eye: V, clock: number): void {
    this.group.visible = regionSeen(RI, eye, 85);
    if (!this.group.visible) return;
    const sun = this.style.uniforms.uSun.value, level = this.swell.uniforms.uSeaLevel.value as number;
    if (!sun.equals(this.sun)) this.shape(this.sun.copy(sun));
    this.shafts.material.uniforms.uShaftLight.value = smooth(0.04, 0.3, sun.dot(this.markUp)) * (1 - this.style.uniforms.uNight.value);
    for (const d of this.floats) d.begin();
    for (const f of this.plan.floats) {
      const near = eye.distanceToSquared(f.at) < CANOPY.near ** 2;
      if (near) this.swell.sample(f.dir, clock, this.sample);
      const yaw = f.yaw + 0.16 * Math.sin(clock * 0.5 + f.phase);
      lift(f.dir, (near ? this.sample.height : level) + CANOPY.lift, this.at);
      this.floats[f.kit].add(pose(this.m, this.at, near ? this.sample.normal : f.dir, f.north, yaw, 0, f.scale));
    }
    for (const d of this.floats) d.end();
  }

  get triangles(): number {
    return this.group.visible ? [...this.floats, ...this.fixed].reduce((s, d) => s + d.triangles, 0) + 4 * this.plan.shafts.length : 0;
  }

  dispose(): void {
    this.material.dispose();
    this.shafts.material.dispose();
    this.shafts.geometry.dispose();
    for (const d of [...this.floats, ...this.fixed]) d.mesh.geometry.dispose();
    (this.fixed[0].mesh.material as THREE.Material).dispose();
  }
}

/** The composition root's Kelp Shallows (MODULES): the canopies, the Kelp Cathedral and the islets' shores. */
export function createKelpShallows(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createKelpShallows: the sea and terrain are built first (MODULES order)');
  const kelp = new KelpShallows(ctx.pipeline.style, terrain.field, sea.swell);
  ctx.scene.add(kelp.group);
  return {
    frame() {
      kelp.update(ctx.camera.position, ctx.pipeline.style.uniforms.uTime.value);
    },
    dispose() {
      ctx.scene.remove(kelp.group);
      kelp.dispose();
    },
  };
}
