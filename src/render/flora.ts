// The shared instanced flora (WP15 part C): every plant on the planet, drawn as a master illustrator draws foliage
// from life. Each species is a small procedural kit at two levels of detail: clustered leaf masses (lobed, so their
// silhouettes scallop under the composite's ink), tiered and jagged conifer skirts, pinnate palm fronds, arching
// mangrove roots, grass and reed blades, kelp stipes and blades, coral domes, antlers and fans; trunks and branches
// as tapered tubes. One material draws them all: a transparent wash in the region's pigment (per instance, so no two
// crowns match), shade glazed and hatched along the plant's contours, crescent leaf marks scalloping the shadow side
// that fade before they shrink below a few pixels, world-anchored paper, silver ink by night. Kelp and coral lie
// under water and are seen through it: drawn over the opaque sea (which paints the floor beneath them) as a veil at
// their apparent depth, wavering under the swell, fading and cooling into the water with their true depth.
//
// Planting (plantBed) is fixed: a pass over the territory cells reads the drawn relief, the coast distance, the floor
// and each region's flora, and scatters plants by integer hashes (the same every match): forests follow valleys and
// sheltered slopes, thin on exposed ridges and toward the peaks, part into groves and clearings, and never stand on
// cliffs, scree, beaches or ice; palms fringe the shore leaning seaward, mangroves stand in the tidal mud, reeds in
// the mud, kelp over the kelp floors, coral on the reefs. Every vertex bends in the planetary wind (the swell's wind
// uniforms): its sway grows with the square of its height in the plant, gusts ripple downwind across the canopies,
// leaves flutter. Plants are bucketed into patches culled by horizon, frustum and distance, and refilled into one
// instanced draw per species and level only when the eye has moved or turned; levels cross-fade by a world-anchored
// stipple dissolve (the far level fills exactly the stipples the near one leaves), distant plants thin out one by one
// the same way, so nothing pops.
import * as THREE from 'three';
import { inkMaterial, transmittanceVec, type Style } from '../style/glsl.ts';
import { PIGMENTS, type RGB } from '../style/palette.ts';
import { v3 } from '../sim/math.ts';
import { R, TERRITORY, gnomonicDir } from '../sim/sphere.ts';
import type { Geography } from '../sim/world/geography.ts';
import { DRAFT, FLOOR, REGIONS, TIDE, type Flora as RegionFlora, type Pigment, type Region } from '../sim/world/regions.ts';
import { seas } from './sea.ts';
import { SWELL_GLSL, type Swell } from './swell.ts';
import { GROUND, groundAt, terrains, townsOf, type Ground, type Surface, type TerrainField } from './terrain.ts';
import type { RenderContext, RenderModule } from './world.ts';

/** Every species: the regions' flora, plus reeds in the mud of grassy and mangrove shores. */
export type FloraKind = RegionFlora | 'reed';

const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0): THREE.Vector3 => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------------------------------------------
// Kits: each species' geometry in its own frame, base at the origin, height 1 (the instance scales it).

/** A vertex's own pigment (transmittance) and wash density. */
type Paint = readonly [number, number, number, number];
const paint = (c: RGB, density: number): Paint => {
  const t = transmittanceVec(c);
  return [t.x, t.y, t.z, density];
};
const BARK = paint(PIGMENTS.sepia, 0.6), PALM_BARK = paint(PIGMENTS.umber, 0.6), ROOT = paint(PIGMENTS.umber, 0.75);
const MOSS = paint(PIGMENTS.verdigris, 0.55), SEED = paint(PIGMENTS.umber, 0.9);
/** Leaf masses take the instance's foliage (tint 1) or blossom (tint 2); only the density is the kit's. */
const LEAF: Paint = [1, 1, 1, 1.05], BLADE: Paint = [1, 1, 1, 0.9];
/** aTint: 0 the kit's pigment, 1 the instance's foliage, 2 its blossom. aPart: sway weight (0 root … 1 crown),
 *  0 wood / 1 leaf mass / 2 thin sheet (lit from the side it is seen), self-shade (0 deep inside … 1 open). */
const WOOD = 0, MASS = 1, SHEET = 2;

class Kit {
  private readonly a: Record<'position' | 'normal' | 'aPaint' | 'aTint' | 'aPart', number[]> =
    { position: [], normal: [], aPaint: [], aTint: [], aPart: [] };
  private readonly index: number[] = [];

  vert(p: THREE.Vector3, n: THREE.Vector3, pt: Paint, tint: number, sway: number, part: number, shade: number): number {
    const a = this.a;
    a.position.push(p.x, p.y, p.z);
    a.normal.push(n.x, n.y, n.z);
    a.aPaint.push(...pt);
    a.aTint.push(tint);
    a.aPart.push(Math.max(0, sway), part, shade);
    return a.aTint.length - 1;
  }

  tri(i: number, j: number, k: number): void {
    this.index.push(i, j, k);
  }

  quad(i: number, j: number, k: number, l: number): void {
    this.index.push(i, j, k, i, k, l);
  }

  /** A tapered tube along `path` (one radius per point). */
  tube(path: THREE.Vector3[], radii: number[], sides: number, pt: Paint, tint = 0): void {
    const t = V(), s = V(), b = V(), n = V(), p = V(), first = this.a.aTint.length;
    path.forEach((c, k) => {
      t.subVectors(path[Math.min(k + 1, path.length - 1)], path[Math.max(k - 1, 0)]).normalize();
      s.set(Math.abs(t.z) > 0.9 ? 1 : 0, 0, Math.abs(t.z) > 0.9 ? 0 : 1);
      b.crossVectors(t, s).normalize();
      s.crossVectors(b, t);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * TAU;
        n.copy(s).multiplyScalar(Math.cos(a)).addScaledVector(b, Math.sin(a));
        this.vert(p.copy(c).addScaledVector(n, radii[k]), n, pt, tint, c.y, WOOD, 1);
      }
    });
    for (let k = 0; k + 1 < path.length; k++) {
      for (let i = 0; i < sides; i++) {
        const o = first + k * sides, j = (i + 1) % sides;
        this.quad(o + i, o + sides + i, o + sides + j, o + j);
      }
    }
  }

  /** A clustered leaf mass: an icosphere lobed into clumps, flat-bottomed, lit as a soft dome and darker beneath;
   *  vertices on its upper side whose pattern exceeds `bloom` carry the blossom. */
  mass(c: THREE.Vector3, r: number, squash: number, detail: number, seed: number, bloom = 2, dab = 0): void {
    const ico = new THREE.IcosahedronGeometry(1, detail), pos = ico.getAttribute('position'), q = V(), p = V(), n = V();
    for (let k = 0; k < pos.count; k += 3) {
      const ids = [0, 1, 2].map((m) => {
        q.fromBufferAttribute(pos, k + m);
        const lobe = 1 + 0.22 * Math.sin(q.x * 4.1 + seed) * Math.sin(q.y * 3.7 + seed * 1.7) * Math.sin(q.z * 4.3 + seed * 2.3)
          + 0.09 * Math.sin((q.x + q.z) * 9 + seed * 3.1);
        p.set(q.x * r * lobe, q.y * r * lobe * squash * (q.y < 0 ? 0.6 : 1), q.z * r * lobe).add(c);
        n.copy(q).addScaledVector(UP, 0.3).normalize();
        // blossom as the pattern lays it, or (dab) broken dabs face by face, thicker on the sunward top
        const blossom = dab ? q.y > -0.25 && hash(k, Math.round(seed * 97), 7) < dab * (0.55 + 0.6 * q.y)
          : q.y > 0.05 && Math.sin(q.x * 7 + seed * 3) * Math.sin(q.z * 6 + seed) + 0.3 * q.y > bloom;
        return this.vert(p, n, LEAF, blossom ? 2 : 1, p.y, MASS, 0.35 + 0.65 * smooth(-0.8, 0.6, q.y));
      });
      this.tri(ids[0], ids[1], ids[2]);
    }
    ico.dispose();
  }

  /** A thin leaf or blade sheet from `base` along `dir` curving by `bend`, `segs` long; `jag` serrates its edges
   *  (pinnate leaflets), `fold` folds it into a shallow V along the rib. */
  sheet(base: THREE.Vector3, dir: THREE.Vector3, bend: THREE.Vector3, width: number, segs: number, jag: number, fold: number,
    pt: Paint, tint: number): void {
    const side = V().crossVectors(dir, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const c = V(), tan = V(), n = V(), p = V();
    let prev: number[] | null = null;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs, w = width * Math.sin(Math.PI * Math.min(1, 0.12 + t)) * (k % 2 ? 1 : 1 - jag);
      c.copy(base).addScaledVector(dir, t).addScaledVector(bend, t * t);
      tan.copy(dir).addScaledVector(bend, 2 * t);
      n.crossVectors(side, tan).normalize();
      const sway = base.y + 0.3 * t, row = [
        this.vert(p.copy(c).addScaledVector(side, w).addScaledVector(n, -fold * w), n, pt, tint, sway, SHEET, 0.85),
        this.vert(c, n, pt, tint, sway, SHEET, 1),
        this.vert(p.copy(c).addScaledVector(side, -w).addScaledVector(n, -fold * w), n, pt, tint, sway, SHEET, 0.85),
      ];
      if (prev) {
        this.quad(prev[0], row[0], row[1], prev[1]);
        this.quad(prev[1], row[1], row[2], prev[2]);
      }
      prev = row;
    }
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), sizes = { position: 3, normal: 3, aPaint: 4, aTint: 1, aPart: 3 } as const;
    for (const [k, s] of Object.entries(sizes)) g.setAttribute(k, new THREE.Float32BufferAttribute(this.a[k as keyof typeof sizes], s));
    g.setIndex(this.index);
    return g;
  }
}

/** A conifer: a tapering trunk under drooping, jagged tiers of needle skirts, narrowing to a spire. */
function pineKit(lod: number): Kit {
  const k = new Kit(), T = lod ? 4 : 8, S = lod ? 7 : 14;
  k.tube([V(0, -0.06, 0), V(0, 0.5, 0), V(0, 1, 0)], [0.035, 0.022, 0.005], lod ? 3 : 6, BARK);
  for (let t = 0; t < T; t++) {
    const f = t / T, y = 0.16 + f * 0.76, r = 0.3 * Math.pow(1 - f, 0.85) + 0.045, h = 0.2 * (1 - 0.45 * f);
    const top = k.vert(V(0, y + h, 0), UP, LEAF, 1, y + h, MASS, 1);
    const bottom = k.vert(V(0, y - 0.025, 0), V(0, -1, 0), LEAF, 1, y, MASS, 0.25);
    const ring: number[] = [];
    for (let i = 0; i < S; i++) {
      const a = (i / S) * TAU + t * 0.7, rr = r * (i % 2 ? 0.72 : 1) * (1 + 0.12 * Math.sin(i * 2.3 + t * 1.9));
      ring.push(k.vert(V(Math.cos(a) * rr, y - (i % 2 ? 0 : 0.035), Math.sin(a) * rr), V(Math.cos(a), 0.6, Math.sin(a)).normalize(),
        LEAF, 1, y, MASS, i % 2 ? 0.6 : 0.9));
    }
    for (let i = 0; i < S; i++) {
      k.tri(top, ring[(i + 1) % S], ring[i]);
      k.tri(bottom, ring[i], ring[(i + 1) % S]);
    }
  }
  return k;
}

type Crown = 'jungle' | 'flowering' | 'cloud' | 'mangrove' | 'shrub';
/** Leaf masses (x, y, z, r, squash) per crown, near and far. */
const CROWNS: Record<Crown, readonly (readonly number[])[][]> = {
  // rainforest crowns broken into flat, spreading clumps at stepped heights (never one rounded dome), sky between them
  jungle: [[[0, 0.86, 0, 0.2, 0.55], [0.34, 0.74, 0.12, 0.19, 0.5], [-0.3, 0.78, -0.16, 0.2, 0.5], [0.1, 0.7, -0.36, 0.18, 0.55],
    [-0.14, 0.66, 0.33, 0.17, 0.55], [-0.34, 0.6, 0.16, 0.15, 0.6]],
    [[0, 0.8, 0, 0.3, 0.5], [0.26, 0.7, 0.1, 0.2, 0.55], [-0.22, 0.68, -0.14, 0.2, 0.55]]],
  flowering: [[[0, 0.78, 0, 0.3, 0.75], [0.22, 0.7, 0.06, 0.22, 0.8], [-0.2, 0.69, -0.08, 0.22, 0.8], [0.02, 0.72, -0.24, 0.2, 0.8]],
    [[0, 0.76, 0, 0.34, 0.75], [0.14, 0.7, 0.1, 0.22, 0.8]]],
  cloud: [[[0, 0.62, 0, 0.21, 0.9], [0.1, 0.8, 0.05, 0.22, 0.9], [-0.08, 0.95, -0.02, 0.16, 0.9], [-0.12, 0.7, 0.1, 0.17, 0.9]],
    [[0, 0.68, 0, 0.25, 0.95], [0.04, 0.88, 0, 0.2, 0.95]]],
  mangrove: [[[0, 0.66, 0, 0.3, 0.55], [0.23, 0.6, 0.05, 0.22, 0.6], [-0.21, 0.6, -0.08, 0.22, 0.6], [0.02, 0.62, 0.25, 0.2, 0.6]],
    [[0, 0.64, 0, 0.36, 0.55], [0.12, 0.6, 0.12, 0.24, 0.6]]],
  shrub: [[[0, 0.42, 0, 0.42, 0.75], [0.3, 0.32, 0.12, 0.3, 0.7], [-0.28, 0.3, -0.14, 0.3, 0.7]], [[0, 0.4, 0, 0.48, 0.75]]],
};

/** A broadleaf: a trunk forking into branches under clustered leaf masses; cloud-forest trees hang with moss,
 *  mangroves stand on arching prop roots, flowering trees carry blossom on their sunward masses. */
function crownKit(lod: number, crown: Crown): Kit {
  const k = new Kit(), masses = CROWNS[crown][lod], top = crown === 'mangrove' ? 0.5 : crown === 'cloud' ? 0.55 : 0.56;
  if (crown !== 'shrub') {
    k.tube([V(0, crown === 'mangrove' ? 0.12 : -0.06, 0), V(0.02, top * 0.55, 0), V(-0.01, top, 0)], [0.042, 0.03, 0.02], lod ? 3 : 6, BARK);
    if (!lod && crown !== 'mangrove') for (const m of masses) k.tube([V(-0.01, top * 0.92, 0), V(m[0] * 0.8, m[1] - m[3] * 0.4, m[2] * 0.8)], [0.02, 0.008], 3, BARK);
  }
  if (crown === 'mangrove') {
    const roots = lod ? 4 : 8;
    for (let i = 0; i < roots; i++) {
      const a = (i / roots) * TAU + 0.4 * Math.sin(i * 1.7), reach = 0.36 + 0.1 * Math.sin(i * 2.9), pts: THREE.Vector3[] = [];
      // WP30 part C: three segments near (sampled at the arch's crown, not evenly), two far; the crown's short branches
      // stay hidden in its low masses, so the near mangrove leaves them out
      for (const t of lod ? [0, 0.5, 1] : [0, 0.3, 0.62, 1]) {
        const rr = reach * t, y = 0.3 * (1 - t) + 0.34 * Math.sin(Math.PI * t) * (1 - 0.4 * t) - 0.14 * t;
        pts.push(V(Math.cos(a) * rr, y, Math.sin(a) * rr));
      }
      k.tube(pts, pts.map((_, s) => 0.022 - 0.002 * s), 3, ROOT);
    }
  }
  masses.forEach((m, i) => k.mass(V(m[0], m[1], m[2]), m[3], m[4], lod || crown === 'shrub' ? 0 : 1, i * 2.37 + m[0] * 5,
    crown === 'flowering' ? 0.05 : crown === 'shrub' ? 0.35 : 2));
  if (crown !== 'shrub' && crown !== 'mangrove') k.mass(V(0.1, 0.12, 0.06), 0.2, 0.7, 0, 9.1); // understory at its foot
  if (crown === 'cloud' && !lod) {
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4, x = Math.cos(a) * 0.15, z = Math.sin(a) * 0.15, y = 0.6 + 0.12 * (i % 3);
      k.tube([V(x, y, z), V(x * 1.1, y - 0.12, z * 1.1), V(x * 1.15, y - 0.22, z * 1.15)], [0.012, 0.008, 0.002], 3, MOSS);
    }
  }
  return k;
}

/** A rainforest tree 1 tall (the Spice Isles' jungle and flowering trees, S-020): a bole forking high, leaning off its
 *  foot, under a broad broken crown of many leaf masses of varied size and height (never one stamped shape), a lower
 *  sub-canopy tree beside it, lianas hanging from its limbs, and at its feet an understory of dark low masses and fern
 *  fronds; a flowering tree's blossom lies in broken dabs over the green, thick on some masses and thin on others. */
function rainKit(lod: number, flowering: boolean, seed: number): Kit {
  const k = new Kit(), far = lod > 0;
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  const lean = V((rnd() - 0.5) * 0.14, 0, (rnd() - 0.5) * 0.14), top = (flowering ? 0.46 : 0.56) + 0.06 * rnd();
  const fork = V(0, top, 0).add(lean);
  k.tube([V(0, -0.06, 0), V(lean.x * 0.4, top * 0.5, lean.z * 0.4), fork], [0.045, 0.03, 0.022], far ? 3 : 6, BARK);
  const N = far ? (flowering ? 2 : 3) : flowering ? 7 : 10, spread = flowering ? 0.26 : 0.36;
  for (let i = 0; i < N; i++) {
    const a = i * 2.39996 + rnd() * 0.9, d = i === 0 ? 0.03 : spread * (0.35 + 0.65 * Math.sqrt(rnd())), r = (far ? 0.13 : 0.08) + (far ? 0.1 : 0.12) * rnd();
    const c = V(Math.cos(a) * d, top + 0.12 + 0.2 * rnd() - 0.22 * d * d, Math.sin(a) * d).add(lean);
    if (!far && d > 0.05) k.tube([fork, c.clone().setY(c.y - r * 0.4)], [0.018, 0.007], 3, BARK);
    k.mass(c, r, 0.45 + 0.35 * rnd(), !far && i < (flowering ? 4 : 3) ? 1 : 0, seed * 3.1 + i * 2.37, 2, flowering ? 0.2 + 0.55 * rnd() : 0);
  }
  // the sub-canopy: a smaller tree to one side, its rounder crown lower and darker
  const sa = rnd() * TAU, sub = V(Math.cos(sa) * 0.3, 0, Math.sin(sa) * 0.3);
  if (!far) k.tube([sub.clone().setY(-0.04), sub.clone().setY(0.3)], [0.022, 0.014], 3, BARK);
  for (let i = 0; i < (far ? 1 : 3); i++) k.mass(sub.clone().add(V((rnd() - 0.5) * 0.14, 0.34 + 0.08 * rnd(), (rnd() - 0.5) * 0.14)), 0.09 + 0.05 * rnd(), 0.8, 0, seed + 40 + i);
  if (far) return k;
  // lianas looping down from the limbs, the understory's low masses and fern fronds at the feet
  for (let i = 0; i < 3; i++) {
    const a = rnd() * TAU, d = 0.12 + 0.18 * rnd(), x = Math.cos(a) * d + lean.x, zz = Math.sin(a) * d + lean.z;
    k.tube([V(x, top + 0.05, zz), V(x * 1.05, top - 0.2 - 0.1 * rnd(), zz * 1.05), V(x * 1.1, 0.02, zz * 1.1)], [0.006, 0.005, 0.004], 3, ROOT);
  }
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU, d = 0.08 + 0.22 * rnd();
    k.mass(V(Math.cos(a) * d, 0.05 + 0.04 * rnd(), Math.sin(a) * d), 0.06 + 0.06 * rnd(), 0.9, 0, seed + 60 + i);
  }
  for (let f = 0; f < 3; f++) {
    const a = rnd() * TAU, h = V(Math.cos(a), 0, Math.sin(a)), base = h.clone().multiplyScalar(0.1 + 0.1 * rnd());
    k.sheet(base, h.clone().multiplyScalar(0.16).addScaledVector(UP, 0.12), V(0, -0.1, 0), 0.04, 3, 0.55, 0.3, LEAF, 1);
  }
  return k;
}

/** A palm (or a tree fern): a ringed trunk curving up (the fern's short and straight) under a crown of arching
 *  pinnate fronds. */
function palmKit(lod: number, fern: boolean): Kit {
  const k = new Kit(), P = lod ? 2 : 7, lean = fern ? 0 : 0.17, height = fern ? 0.62 : 0.94, path: THREE.Vector3[] = [], radii: number[] = [];
  for (let s = 0; s <= P; s++) {
    const t = s / P;
    path.push(V(lean * t * t, t * height - 0.04, 0));
    radii.push((fern ? 0.04 : 0.03) * (1 - 0.3 * t) * (s % 2 && !lod ? 0.88 : 1));
  }
  k.tube(path, radii, lod ? 3 : 6, PALM_BARK);
  const crown = path[P], F = lod ? 6 : fern ? 12 : 10;
  for (let f = 0; f < F; f++) {
    const az = (f / F) * TAU + 0.3 * Math.sin(f * 2.1), len = (fern ? 0.4 : 0.48) * (0.85 + 0.15 * Math.sin(f * 1.7));
    const rise = fern ? 0.6 : 0.42 - 0.25 * (f % 2), h = V(Math.cos(az), 0, Math.sin(az));
    k.sheet(crown, h.clone().multiplyScalar(len).addScaledVector(UP, rise * len), V(0, -(fern ? 0.75 : 0.95) * len, 0),
      fern ? 0.07 : 0.075, lod ? 3 : 7, 0.55, 0.3, LEAF, 1);
  }
  return k;
}

/** A tuft of grass (or reeds: taller, straighter, with seed heads). */
function tuftKit(reed: boolean): Kit {
  const k = new Kit(), B = reed ? 7 : 9;
  for (let b = 0; b < B; b++) {
    const az = b * 2.39996, out = reed ? 0.12 : 0.38, len = 0.65 + 0.35 * Math.abs(Math.sin(b * 1.9)), h = V(Math.cos(az), 0, Math.sin(az));
    const base = h.clone().multiplyScalar(0.05 * (b % 3));
    k.sheet(base, h.clone().multiplyScalar(out * len).addScaledVector(UP, len), h.clone().multiplyScalar((reed ? 0.06 : 0.3) * len).addScaledVector(UP, -0.15 * len),
      reed ? 0.02 : 0.035, 2, 0, 0.2, BLADE, 1);
    if (reed && b % 3 === 0) {
      const tip = base.clone().addScaledVector(h, (out + 0.06) * len * 0.92).addScaledVector(UP, len * 0.82);
      k.tube([tip, tip.clone().addScaledVector(UP, 0.14)], [0.018, 0.01], 3, SEED);
    }
  }
  return k;
}

/** Kelp: stipes rising from the floor to the surface (height 1 = the water's depth), blades along them and a canopy
 *  of blades floating out across the surface. */
function kelpKit(): Kit {
  const k = new Kit();
  for (let s = 0; s < 2; s++) {
    const x0 = 0.12 * Math.cos(s * 2.1), z0 = 0.12 * Math.sin(s * 2.1), pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      pts.push(V(x0 + 0.06 * Math.sin(t * 7 + s), t, z0 + 0.06 * Math.cos(t * 6 + s)));
    }
    k.tube(pts, pts.map(() => 0.022), 3, LEAF, 1);
    for (let i = 1; i < 4; i++) {
      const az = s * 1.3 + i * 2.2, d = V(Math.cos(az) * 0.22, 0.05, Math.sin(az) * 0.22);
      k.sheet(pts[i], d, V(0, -0.03, 0), 0.05, 1, 0.2, 0, LEAF, 1);
    }
    for (let i = 0; i < 4; i++) {
      const az = s * 2.1 + i * 1.6 + 0.4, d = V(Math.cos(az) * 0.55, 0.01, Math.sin(az) * 0.55);
      k.sheet(pts[4], d, V(Math.sin(az) * 0.12, 0, -Math.cos(az) * 0.12), 0.13, 2, 0.25, 0, LEAF, 1);
    }
  }
  return k;
}

/** A coral head: brain domes and a staghorn clump of slender branches (no leaf-like sheet: from the deck a sheet read
 *  as floating leaf litter). */
function coralKit(): Kit {
  const k = new Kit();
  k.mass(V(0.12, 0, 0.05), 0.32, 0.5, 0, 1.3);
  k.mass(V(-0.26, 0, -0.12), 0.2, 0.6, 0, 4.1, -1);
  for (let b = 0; b < 9; b++) {
    const az = b * 0.7, o = V(-0.05 + 0.18 * Math.sin(b * 2.1), 0, -0.25 + 0.12 * Math.cos(b * 1.7)), m = V(Math.cos(az) * 0.12, 0.3, Math.sin(az) * 0.12).add(o);
    k.tube([o, m, m.clone().add(V(Math.cos(az) * 0.12, 0.25, Math.sin(az) * 0.12))], [0.045, 0.03, 0.012], 3, LEAF, 2);
  }
  return k;
}

// ---------------------------------------------------------------------------------------------------------------
// Species

export interface Species {
  /** The kit at level 0 (near) or 1 (far). */
  kit(lod: number): Kit;
  /** Height range, u (kelp and coral: width; kelp's height is the water's depth). */
  size: readonly [number, number];
  /** Drawn whole within `near` u; as the far kit out to `far` u (0: no far level), thinning from a third of it. */
  near: number;
  far: number;
  /** Bend at the crown in a fair wind, per unit height. */
  sway: number;
  /** Under water: seen through the sea as a veil over it. */
  veil?: true;
}

export const FLORA: Record<FloraKind, Species> = {
  pine: { kit: pineKit, size: [2.0, 3.4], near: 55, far: 300, sway: 0.05 },
  jungle: { kit: (l) => rainKit(l, false, 7), size: [2.6, 4.0], near: 42, far: 300, sway: 0.045 },
  floweringTree: { kit: (l) => rainKit(l, true, 11), size: [1.9, 2.8], near: 42, far: 280, sway: 0.05 },
  cloudForest: { kit: (l) => crownKit(l, 'cloud'), size: [2.8, 4.2], near: 42, far: 300, sway: 0.045 },
  mangrove: { kit: (l) => crownKit(l, 'mangrove'), size: [1.4, 2.2], near: 42, far: 240, sway: 0.04 },
  palm: { kit: (l) => palmKit(l, false), size: [1.8, 2.8], near: 55, far: 260, sway: 0.08 },
  treeFern: { kit: (l) => palmKit(l, true), size: [1.0, 1.6], near: 45, far: 150, sway: 0.07 },
  heather: { kit: () => crownKit(0, 'shrub'), size: [0.3, 0.55], near: 55, far: 0, sway: 0.08 },
  scrub: { kit: () => crownKit(0, 'shrub'), size: [0.4, 0.8], near: 70, far: 0, sway: 0.07 },
  grass: { kit: () => tuftKit(false), size: [0.25, 0.45], near: 34, far: 0, sway: 0.3 },
  duneGrass: { kit: () => tuftKit(false), size: [0.3, 0.5], near: 34, far: 0, sway: 0.35 },
  reed: { kit: () => tuftKit(true), size: [0.5, 0.9], near: 40, far: 0, sway: 0.25 },
  kelp: { kit: kelpKit, size: [1.6, 2.4], near: 70, far: 0, sway: 0.22, veil: true },
  coral: { kit: coralKit, size: [0.35, 0.6], near: 120, far: 0, sway: 0, veil: true },
};
export const KINDS = Object.keys(FLORA) as FloraKind[];

/** A species' kit as geometry (region packages draw hero plants with it and floraMaterial). */
export function kitGeometry(kind: FloraKind, lod: number): THREE.BufferGeometry {
  return FLORA[kind].kit(lod).geometry();
}

// ---------------------------------------------------------------------------------------------------------------
// Planting: fixed, from the drawn relief, the coast, the floor and the regions' flora.

const N = TERRITORY.n, NN = N * N;
const angle = (x: number): number => ((x / N) * 2 - 1) * (Math.PI / 4);
/** Cells along a patch's edge: the unit of culling. */
const PATCH = 16;
/** Cells round a cell (±3) whose mean height against its own tells a sheltered hollow from an exposed ridge. */
const RING = [[-3, 0], [3, 0], [0, -3], [0, 3], [-3, -3], [3, 3], [-3, 3], [3, -3]].map(([i, j]) => i + j * N);

/** A deterministic hash of three integers to [0, 1). */
function hash(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35) ^ Math.imul(c + 0x27d4eb2f, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth value noise on the integer lattice. */
function noise(x: number, y: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), u = smooth(0, 1, x - i), v = smooth(0, 1, y - j), w = smooth(0, 1, z - k);
  let s = 0;
  for (let c = 0; c < 8; c++) {
    const a = c & 1, b = (c >> 1) & 1, d = c >> 2;
    s += hash(i + a, j + b, k + d) * (a ? u : 1 - u) * (b ? v : 1 - v) * (d ? w : 1 - w);
  }
  return s;
}

/** What a cell offers a plant: its ground, height, slope, distance inland, shelter (u its ring stands above it),
 *  altitude (fraction of its region's peak), grove (0 clearing … 1 grove), water depth and floor. */
interface Cell { ground: Ground; height: number; up: number; inland: number; shelter: number; alt: number; grove: number; depth: number; floor: number }

/** The trees (palms apart: they fringe the beach crest): never on beach, mud, cliff, basalt or ice. */
export const TREES: readonly FloraKind[] = ['pine', 'jungle', 'floweringTree', 'cloudForest', 'treeFern'];
/** Whether a land species takes the exact surface's ground: dune grass and palms the beach crest, reeds the mud, every other
 *  species open ground, rock and scree (mangroves stand in the tide, kelp and coral under it). */
const grows = (kind: FloraKind, g: Ground): boolean => (kind === 'duneGrass' || kind === 'palm' ? g === GROUND.meadow || g === GROUND.beach
  : kind === 'reed' ? g === GROUND.mud || g === GROUND.meadow : g === GROUND.meadow || g === GROUND.rock || g === GROUND.scree);
const wooded = (c: Cell): number => (c.up > 0.6 && c.inland > 1.2 && c.depth < -0.3
  ? smooth(0.6, 0.8, c.up) * Math.min(1.4, Math.max(0.12, 0.75 + 0.9 * c.shelter)) * (1 - smooth(0.6, 1, c.alt)) : 0);

/** Expected plants of `kind` in a cell. */
function density(kind: FloraKind, c: Cell): number {
  const land = c.depth < 0, grove = (a: number, b: number): number => smooth(a, b, c.grove), g = c.ground;
  switch (kind) {
    case 'pine': return 0.3 * wooded(c) * grove(0.3, 0.55);
    case 'jungle': return 0.32 * wooded(c) * grove(0.12, 0.35);
    case 'floweringTree': return 0.08 * wooded(c) * grove(0.12, 0.35);
    case 'cloudForest': return 0.3 * wooded(c) * grove(0.15, 0.4) * (0.6 + c.alt);
    case 'treeFern': return 0.12 * wooded(c) * (1.2 - c.alt);
    case 'palm': return land && (g === GROUND.meadow || (g === GROUND.beach && c.height > 0.65)) && c.inland > 0.3 && c.up > 0.75 ? 0.35 * (1 - smooth(1, 9, c.inland)) : 0;
    case 'mangrove': return c.height > -0.7 && c.height < 1.8 && c.inland < 6 && c.up > 0.75 ? 0.25 : 0;
    case 'heather': return land && c.up > 0.66 && (g === GROUND.meadow || g === GROUND.rock || g === GROUND.scree)
      ? 0.3 * (0.25 + 0.75 * (1 - c.grove)) * (0.6 + Math.max(0, -c.shelter)) : 0;
    case 'scrub': return land && c.up > 0.66 && (g === GROUND.meadow || g === GROUND.rock || g === GROUND.scree) ? 0.16 * (1 - 0.5 * c.grove) : 0;
    case 'grass': return land && g === GROUND.meadow ? 0.9 * (1 - 0.7 * c.grove) : 0;
    case 'duneGrass': return land && (g === GROUND.meadow || g === GROUND.beach) && c.inland < 7 && c.height > 0.8 ? 1.1 : 0;
    case 'reed': return land && (g === GROUND.mud || g === GROUND.meadow) && c.inland < 4 ? 0.35 : 0;
    case 'kelp': return c.floor === FLOOR.kelp && c.depth > 1 && c.depth < 10 ? 0.3 : 0;
    // coral standing only down the reef's slopes, so deep that its heads (≤ 0.33 u tall) lie well under the lowest
    // water, seen through it and tinted by it, never at or on the waterline (WP17); the sea paints the reef's own heads,
    // those a hull grounds on, on its floor
    case 'coral': return c.floor === FLOOR.coral && c.depth > TIDE.amp + DRAFT + 0.9 && c.depth < 3.6 ? 0.3 : 0;
  }
}

const T = (p: Pigment): THREE.Vector3 => transmittanceVec(PIGMENTS[p]);
/** An instance's foliage and blossom, from its region's pigments, varied by u and w ∈ [0, 1). */
function tones(kind: FloraKind, r: Region, u: number, w: number): [THREE.Vector3, THREE.Vector3] {
  const fol = T(r.pigments.foliage), to = (a: THREE.Vector3, p: Pigment, t: number): THREE.Vector3 => a.clone().lerp(T(p), t);
  switch (kind) {
    case 'pine': return [to(fol, 'indigo', 0.4 + 0.2 * u), fol];
    case 'jungle': return [to(fol, u < 0.5 ? 'verdigris' : 'ochre', 0.12 + 0.28 * w), fol];
    case 'floweringTree': return [to(fol, 'verdigris', 0.25 * u), to(T(w < 0.55 ? r.pigments.accent : 'ochre'), 'roseMadder', 0.2 * u)];
    case 'cloudForest': return [to(fol, 'ultramarine', 0.18 + 0.15 * u), fol];
    case 'treeFern': return [to(fol, 'verdigris', 0.3 + 0.2 * u), fol];
    case 'palm': return [to(fol, 'verdigris', 0.2 + 0.25 * u), fol];
    case 'mangrove': return [to(fol, 'umber', 0.12 + 0.2 * u), fol];
    case 'heather': return [to(fol, 'umber', 0.3 + 0.2 * u), to(T('roseMadder'), 'ultramarine', 0.3 * w)];
    case 'scrub': return [to(T('umber'), 'ochre', 0.4 * u), T('ochre')];
    case 'grass': return [to(fol, 'ochre', 0.25 + 0.35 * u), fol];
    case 'duneGrass': return [to(T('ochre'), 'malachite', 0.25 * u), fol];
    case 'reed': return [to(T('ochre'), 'umber', 0.35 * u), fol];
    case 'kelp': return [to(T('ochre'), 'malachite', 0.35 + 0.25 * u), fol];
    case 'coral': return [u < 0.35 ? to(T('ochre'), 'roseMadder', 0.55) : u < 0.7 ? to(T('roseMadder'), 'ultramarine', 0.3) : to(T('verdigris'), 'ochre', 0.35), T(w < 0.6 ? 'leadWhite' : 'ochre')]; // reef pigments: ochre-rose, lilac and sage, cream-white tips
  }
}

export interface Patch { readonly centre: THREE.Vector3; readonly radius: number; readonly start: number; readonly end: number }
/** Every plant, sorted by patch then species. */
export interface Bed {
  readonly count: number;
  /** Index into KINDS. */
  readonly kind: Uint8Array;
  /** 16 per plant: its frame, size and seat (the translation is its root). */
  readonly matrix: Float32Array;
  /** 6 per plant: foliage and blossom transmittance. */
  readonly colour: Float32Array;
  /** 2 per plant: wind phase, and the distance beyond which it is thinned out. */
  readonly seed: Float32Array;
  readonly patches: readonly Patch[];
}

/** Plant the whole planet (the same every match). */
export function plantBed(geo: Geography, field: TerrainField): Bed {
  const H = field.relief, peak = new Float32Array(REGIONS.length).fill(1);
  for (let c = 0; c < H.length; c++) peak[geo.region[c]] = Math.max(peak[geo.region[c]], H[c]);
  const kinds = REGIONS.map((r) => [...r.flora, ...(r.flora.includes('grass') || r.flora.includes('mangrove') ? ['reed' as const] : [])]
    .map((k) => KINDS.indexOf(k)));
  const keys: number[] = [], kindOf: number[] = [], mats: number[] = [], cols: number[] = [], seeds: number[] = [];
  const dir = v3(), surf: Surface = { height: 0, normal: V(), up: 1, ground: GROUND.meadow, region: 0 }, towns = townsOf(geo);
  const cellU = ((Math.PI / 2) * R) / N, per = Math.ceil(N / PATCH), m4 = new THREE.Matrix4(), X = V(), Y = V(), Z = V(), P = V(), nrm = V();
  for (let f = 0; f < 6; f++) {
    for (let j = 3; j < N - 3; j++) {
      for (let i = 3; i < N - 3; i++) {
        const c = f * NN + j * N + i, ri = geo.region[c], ks = kinds[ri], h = H[c], floor = geo.floor[c];
        if (!ks.length || h < -10 || (h < -0.7 && floor !== FLOOR.kelp && floor !== FLOOR.coral)) continue;
        if (towns.length && h > 0) { // a town's quay and lower terraces are built on, not planted
          gnomonicDir(f, Math.tan(angle(i + 0.5)), Math.tan(angle(j + 0.5)), dir);
          if (towns.some((hb) => { const L = Math.hypot(hb.pos.x, hb.pos.y, hb.pos.z); return hb.region === ri && R * Math.hypot(dir.x - hb.pos.x / L, dir.y - hb.pos.y / L, dir.z - hb.pos.z / L) < hb.r + 8.5; })) continue;
        }
        const gx = (H[c + 1] - H[c - 1]) / (2 * cellU), gy = (H[c + N] - H[c - N]) / (2 * cellU), up = 1 / Math.sqrt(1 + gx * gx + gy * gy);
        let ring = 0;
        for (const o of RING) ring += H[c + o];
        gnomonicDir(f, Math.tan(angle(i + 0.5)), Math.tan(angle(j + 0.5)), dir);
        const s = R / 9, grove = 0.7 * noise(dir.x * s, dir.y * s, dir.z * s) + 0.3 * noise(dir.x * s * 3.1, dir.y * s * 3.1, dir.z * s * 3.1);
        const cell: Cell = { ground: groundAt(ri, Math.max(h, 0.03), up), height: h, up, inland: -geo.coast[c], shelter: ring / 8 - h,
          alt: Math.max(0, h) / peak[ri], grove: smooth(0.3, 0.7, grove), depth: -h, floor };
        for (const k of ks) {
          const kind = KINDS[k], sp = FLORA[kind], n = Math.floor(density(kind, cell) + hash(c, k, 1)), tree = TREES.includes(kind);
          for (let m = 0; m < n; m++) {
            const [u, v, w, z, y] = [10, 20, 30, 40, 50].map((o) => hash(c, k, o + m));
            gnomonicDir(f, Math.tan(angle(i + u)), Math.tan(angle(j + v)), dir);
            P.set(dir.x, dir.y, dir.z);
            let height: number, upness = up;
            if (sp.veil || kind === 'mangrove') {
              height = sp.veil ? h : field.height(dir);
              nrm.copy(P);
            } else {
              field.surface(dir, 0, surf);
              if (!grows(kind, surf.ground)) continue;
              [height, upness] = [surf.height, surf.up];
              nrm.copy(surf.normal);
            }
            const size = (sp.size[0] + (sp.size[1] - sp.size[0]) * w) * (tree ? 0.8 + 0.25 * smooth(-0.5, 0.5, cell.shelter) : 1);
            const low = kind === 'grass' || kind === 'duneGrass' || kind === 'heather' || kind === 'scrub' || kind === 'reed';
            Y.copy(P).lerp(nrm, low ? 0.5 : 0.12);
            X.copy(nrm).addScaledVector(P, -nrm.dot(P)); // downhill
            if (X.lengthSq() < 1e-10) X.set(-P.z, 0, P.x);
            X.normalize();
            if (kind === 'palm') Y.addScaledVector(X, 0.12 + 0.2 * z); // palms lean out over the shore
            Y.normalize();
            X.addScaledVector(Y, -X.dot(Y)).normalize();
            if (kind !== 'palm') X.applyAxisAngle(Y, z * TAU);
            Z.crossVectors(X, Y);
            X.multiplyScalar(size);
            Z.multiplyScalar(size);
            Y.multiplyScalar(kind === 'kelp' ? cell.depth : size);
            const sink = kind === 'mangrove' ? 0.1 : sp.veil ? 0 : 0.03 + 0.3 * (1 - upness);
            m4.makeBasis(X, Y, Z).setPosition(P.multiplyScalar(R + height - sink * size));
            mats.push(...m4.elements);
            const [fo, bl] = tones(kind, REGIONS[ri], u, y);
            cols.push(fo.x, fo.y, fo.z, bl.x, bl.y, bl.z);
            seeds.push(hash(c, k, 60 + m), sp.far ? sp.far * (0.33 + 0.67 * Math.pow(y, 0.7)) : sp.near * (0.55 + 0.45 * y));
            keys.push((f * per + Math.floor(j / PATCH)) * per + Math.floor(i / PATCH));
            kindOf.push(k);
          }
        }
      }
    }
  }
  const order = keys.map((_, i) => i).sort((a, b) => keys[a] - keys[b] || kindOf[a] - kindOf[b]), count = order.length;
  const bed = { count, kind: new Uint8Array(count), matrix: new Float32Array(count * 16), colour: new Float32Array(count * 6),
    seed: new Float32Array(count * 2), patches: [] as Patch[] };
  order.forEach((o, i) => {
    bed.kind[i] = kindOf[o];
    for (let e = 0; e < 16; e++) bed.matrix[i * 16 + e] = mats[o * 16 + e];
    for (let e = 0; e < 6; e++) bed.colour[i * 6 + e] = cols[o * 6 + e];
    bed.seed[i * 2] = seeds[o * 2];
    bed.seed[i * 2 + 1] = seeds[o * 2 + 1];
  });
  for (let a = 0; a < count;) {
    let b = a;
    while (b < count && keys[order[b]] === keys[order[a]]) b++;
    const centre = V(), at = (i: number): THREE.Vector3 => P.set(bed.matrix[i * 16 + 12], bed.matrix[i * 16 + 13], bed.matrix[i * 16 + 14]);
    for (let i = a; i < b; i++) centre.add(at(i));
    centre.divideScalar(b - a);
    let radius = 0;
    for (let i = a; i < b; i++) radius = Math.max(radius, at(i).distanceTo(centre));
    bed.patches.push({ centre, radius: radius + 4.5, start: a, end: b });
    a = b;
  }
  return bed;
}

// ---------------------------------------------------------------------------------------------------------------
// The material: one for every species; kelp and coral seen through the water as a veil over the sea.

const VERT = /* glsl */ `
${SWELL_GLSL}
uniform float uTime;
uniform vec4 uBand; // fade in over x → y u from the eye, out over z → w (or the plant's own thinning distance)
uniform vec2 uCut; // WP30 part C: the plant's thinning distance × x, at least y (the reach governor)
uniform float uSway;
in vec4 aPaint;
in float aTint;
in vec3 aPart;
in vec3 aFoliage;
in vec3 aBloom;
in vec2 aSeed;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vPaint;
out vec3 vPart;
out vec3 vUp;
out float vFade;
out float vDepth;
out float vEdge;
void main() {
  mat4 model = modelMatrix * instanceMatrix;
  vec3 root = model[3].xyz, up = normalize(root);
  float H = length(model[1].xyz), t = uTime, s = aPart.x, seen = 1.0;
  vec3 wdir = cross(uWindAxis, up);
  wdir /= max(length(wdir), 1e-4);
  vec3 side = cross(up, wdir);
  vec4 w = model * vec4(position, 1.0);
  vNormal = normalize(mat3(model) * normal);
  // gusts ripple downwind across the canopies
  float gust = 0.5 + 0.5 * sin(dot(root, wdir) * 0.42 - t * 2.4 + 1.3 * sin(dot(root, side) * 0.23 + t * 0.37));
#ifdef VEIL
  w.xyz += (wdir * sin(t * 0.8 + aSeed.x * 6.283 + s * 1.7) + side * 0.4 * sin(t * 0.55 + aSeed.x * 11.0))
    * uSway * s * length(model[0].xyz) * (0.5 + 0.5 * uWind);
  vec3 dir = normalize(w.xyz);
  vEdge = 1.0 - abs(dot(vNormal, normalize(cameraPosition - w.xyz)));
  vDepth = SEA_R + uSeaLevel - length(w.xyz);
  vec4 f = seaField(dir);
  vec3 sn;
  float lift;
  vec3 sw = swell(dir, t, swellAmp(uSeaLevel - f.x), sn, lift);
  // seen through clear water: raised to its apparent depth (refraction, n ≈ 4/3) and wavering under the swell's lens,
  // the canopy riding the surface; depth-tested as the surface in front of it, so it shows over the opaque sea yet
  // hides behind hulls and headlands
  float d = max(vDepth, 0.0), rs = SEA_R + uSeaLevel + dot(sw, dir);
  w.xyz += dir * (0.25 * d + dot(sw, dir) * exp(-0.8 * d)) + (sn - dir) * d * 0.6;
  vec3 rd = normalize(w.xyz - cameraPosition);
  float b = dot(cameraPosition, rd), disc = b * b - dot(cameraPosition, cameraPosition) + rs * rs, reach = distance(cameraPosition, w.xyz);
  vec3 surf = cameraPosition + rd * max(min(disc > 0.0 ? -b - sqrt(disc) : reach, reach) - 0.3, 0.1);
  // past the sea's horizon (beyond the ray's lowest point, -b) the sea's bulge hides it: never seen through the planet
  seen = 1.0 - smoothstep(0.0, 4.0, reach + b);
#else
  float bend = uWind * (0.3 + 0.7 * gust) * uSway * s * s;
  float flutter = aPart.y > 0.5 ? sin(t * 7.0 + aSeed.x * 40.0 + dot(position, vec3(9.0, 5.0, 7.0))) * 0.02 * uWind * (0.4 + gust) * s : 0.0;
  w.xyz += (wdir * bend + side * flutter - up * 0.5 * bend * bend) * H;
  vDepth = 0.0;
  vEdge = 0.0;
#endif
  vWorld = w.xyz;
  vUp = up;
  vPart = aPart;
  vPaint = vec4(aTint > 1.5 ? aBloom : aTint > 0.5 ? aFoliage : aPaint.rgb, aPaint.w);
  float dist = distance(cameraPosition, root), o1 = min(uBand.w, max(aSeed.y * uCut.x, uCut.y)), o0 = min(uBand.z, o1 * 0.8);
  vFade = smoothstep(uBand.x, uBand.y, dist) * (1.0 - smoothstep(o0, o1, dist)) * seen;
  gl_Position = projectionMatrix * viewMatrix * w;
#ifdef VEIL
  vec4 sc = projectionMatrix * viewMatrix * vec4(surf, 1.0);
  gl_Position.z = sc.z / sc.w * gl_Position.w;
#endif
}
`;

const FRAG = /* glsl */ `
in vec3 vWorld;
in vec3 vNormal;
in vec4 vPaint;
in vec3 vPart;
in vec3 vUp;
in float vFade;
in float vDepth;
in float vEdge;
uniform float uFar;
uniform float uSeed;
uniform vec3 uWater;
float fhash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main() {
  vec3 v = normalize(cameraPosition - vWorld), n = normalize(vNormal);
  if (vPart.y > 1.5 && dot(n, v) < 0.0) n = -n; // a thin sheet is lit from the side it is seen
  Paper q = paperAt(vWorld, n, 1.0);
#ifdef VEIL
  vec3 col = glaze(parchment(q), vPaint.rgb, vPaint.w, 0.35, q);
  col = mix(col, hatchInk(0.15), 0.6 * smoothstep(0.5, 0.9, vEdge));
  float d = max(vDepth, 0.0);
  col = glaze(col, uWater, 0.75 * (1.0 - exp(-d * 0.6)), 0.3, q); // tinted by the water over it, never garnish (WP17)
  writeVeil(candle(col, vWorld), vFade * (0.3 + 0.6 * exp(-d * 0.5)));
#else
  // levels and thinning dissolve by a stipple anchored to the world: the far level fills what the near one leaves
  float h = fhash(floor(vWorld * 9.0));
  if (uFar < 0.5 ? h >= vFade : h < 1.0 - vFade) discard;
  vec3 side = normalize(cross(vUp, abs(vUp.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec2 hc = vec2(dot(vWorld, vUp), dot(vWorld, side) + 0.7 * dot(vWorld, cross(vUp, side)));
  vec2 hdx = dFdx(hc), hdy = dFdy(hc);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v))) * mix(0.45, 1.0, vPart.z);
  vec3 col = glaze(parchment(q), vPaint.rgb, vPaint.w, washPool(n, v, q), q);
  col = sunGlaze(shadeGlaze(col, tone, q), ndl, tone);
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone, uSeed));
  if (vPart.y > 0.5) {
    // crescent leaf marks scalloping the masses, densest in shade, gone before they shrink to noise
    vec3 an = abs(n), c = vWorld * 5.5;
    vec2 lp = an.x > an.y && an.x > an.z ? c.yz : an.y > an.z ? c.xz : c.xy;
    // each cell's mark its own: turned, sized, and some cells left bare, so no one glyph repeats down a crown
    vec2 cell = floor(lp), o = vec2(fhash(vec3(cell, 1.0)), fhash(vec3(cell, 2.0))) - 0.5, f = fract(lp) - 0.5 - 0.35 * o;
    float g3 = fhash(vec3(cell, 3.0)), turn = 1.6 * (g3 - 0.5), sz = 0.7 + 0.5 * fhash(vec3(cell, 4.0));
    f = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * f / sz;
    float r = length(f), px = length(fwidth(lp));
    float arc = smoothstep(0.38, 0.31, r) * smoothstep(0.2, 0.27, r) * smoothstep(0.05, -0.1 + 0.25 * o.x, f.y) * step(0.28, g3);
    col = mix(col, hatchInk(tone), arc * clamp(0.9 - 0.7 * tone, 0.15, 0.9) * (1.0 - smoothstep(0.18, 0.5, px)));
  }
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.65 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, uSeed + 11.0));
  }
  writeInk(candle(col, vWorld), n);
#endif
}
`;

export interface FloraMaterialOptions {
  /** Fade in over band.x → y u from the eye and out over z → w. */
  band: THREE.Vector4;
  /** Bend at the crown in a fair wind, per unit height. */
  sway: number;
  /** The far level (fills the stipples the near level leaves). */
  far?: boolean;
  veil?: boolean;
  id?: number;
}

/** The flora's material: kits drawn with it bend in the swell's wind (instanced; per-instance aFoliage, aBloom, aSeed). */
export function floraMaterial(style: Style, swell: Swell, o: FloraMaterialOptions): THREE.ShaderMaterial {
  return inkMaterial(style, {
    vertexShader: VERT, fragmentShader: FRAG, defines: o.veil ? { VEIL: true } : {}, id: o.id, veil: o.veil, side: THREE.DoubleSide,
    uniforms: { ...swell.uniforms, uBand: { value: o.band }, uCut: { value: new THREE.Vector2(1, 0) }, uSway: { value: o.sway }, uFar: { value: o.far ? 1 : 0 },
      uSeed: { value: 3.7 }, uWater: { value: T('verdigris') } },
  });
}

/** Plants of one species at one level: one instanced draw. */
class Draw {
  readonly mesh: THREE.InstancedMesh;
  private readonly attrs: [THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute, THREE.InstancedBufferAttribute];
  n = 0;
  readonly cap: number;

  constructor(geometry: THREE.BufferGeometry, material: THREE.ShaderMaterial, cap: number) {
    this.cap = cap;
    this.attrs = [3, 3, 2].map((s) => new THREE.InstancedBufferAttribute(new Float32Array(cap * s), s).setUsage(THREE.DynamicDrawUsage)) as Draw['attrs'];
    ['aFoliage', 'aBloom', 'aSeed'].forEach((k, i) => geometry.setAttribute(k, this.attrs[i]));
    this.mesh = new THREE.InstancedMesh(geometry, material, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  put(bed: Bed, i: number): void {
    if (this.n >= this.cap) return;
    const m = this.mesh.instanceMatrix.array, [fo, bl, sd] = this.attrs.map((a) => a.array as Float32Array), k = this.n++;
    for (let e = 0; e < 16; e++) m[k * 16 + e] = bed.matrix[i * 16 + e];
    for (let e = 0; e < 3; e++) [fo[k * 3 + e], bl[k * 3 + e]] = [bed.colour[i * 6 + e], bed.colour[i * 6 + 3 + e]];
    [sd[k * 2], sd[k * 2 + 1]] = [bed.seed[i * 2], bed.seed[i * 2 + 1]];
  }

  commit(): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    for (const [a, s] of [[this.mesh.instanceMatrix, 16], [this.attrs[0], 3], [this.attrs[1], 3], [this.attrs[2], 2]] as const) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * s);
      a.needsUpdate = true;
    }
  }

  get triangles(): number {
    return (this.mesh.geometry.index!.count / 3) * this.mesh.count;
  }

  get bytes(): number {
    const g = this.mesh.geometry;
    return Object.values(g.attributes).reduce((a, x) => a + (x.array as Float32Array).byteLength, 0) + g.index!.array.byteLength
      + this.mesh.instanceMatrix.array.byteLength;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

/** Instances one draw holds at most, near and far. */
const CAP = { near: 3500, far: 14000 } as const;

export class Flora {
  readonly group = new THREE.Group();
  readonly bed: Bed;
  /** Per species, its near and far draws (null where it has none). */
  private readonly draws: (Draw | null)[][];
  private readonly all: Draw[];
  private readonly eye = V(Infinity, 0, 0);
  private readonly look = V();
  private readonly fwd = V();
  private readonly at = V();
  private readonly frustum = new THREE.Frustum();
  private readonly viewProj = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere();
  private readonly seen: { p: Patch; d: number }[] = [];
  private readonly reach = Math.max(...KINDS.map((k) => FLORA[k].far || FLORA[k].near));
  /** WP30 part C: the reach governor's scales: the far level's and the thinning distances (kF), then the near level's (kN). */
  private kF = 1;
  private kN = 1;
  /** WP26c the graphics quality's detail (Pipeline.quality.detail): Swift and Fine draw the plants in nearer. */
  detail = 1;

  constructor(style: Style, geo: Geography, field: TerrainField, swell: Swell) {
    this.bed = plantBed(geo, field);
    const totals = KINDS.map(() => 0);
    for (const k of this.bed.kind) totals[k]++;
    let id: number | undefined;
    this.draws = KINDS.map((kind, k) => [0, 1].map((lod) => {
      const sp = FLORA[kind];
      if (!totals[k] || (lod && !sp.far)) return null;
      const band = lod ? new THREE.Vector4(sp.near * 0.85, sp.near, sp.far * 0.8, sp.far)
        : new THREE.Vector4(-1, 0, sp.near * (sp.far ? 0.85 : 0.75), sp.near);
      const material = floraMaterial(style, swell, { band, sway: sp.sway, far: lod === 1, veil: sp.veil, id });
      id ??= material.uniforms.uInkId.value as number;
      const d = new Draw(kitGeometry(kind, lod), material, Math.min(totals[k], lod ? CAP.far : CAP.near));
      this.group.add(d.mesh);
      return d;
    }));
    this.all = this.draws.flat().filter((d): d is Draw => d !== null);
  }

  /** Refill the draws from the patches in view (horizon, frustum, distance), nearest first, once the eye has moved
   *  or turned far enough; the frustum test is widened to cover the turn allowed between refills. */
  update(camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld();
    const eye = camera.position, el = eye.length(), fwd = camera.getWorldDirection(this.fwd);
    if (this.eye.distanceTo(eye) < Math.max(1.2, 0.015 * (el - R)) && fwd.dot(this.look) > 0.996) return;
    this.eye.copy(eye);
    this.look.copy(fwd);
    this.frustum.setFromProjectionMatrix(this.viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const horizon = Math.acos(Math.min(1, R / el)) + Math.acos(R / (R + 6)), seen = this.seen, bed = this.bed;
    seen.length = 0;
    for (const p of bed.patches) {
      const d = p.centre.distanceTo(eye) - p.radius;
      if (d > this.reach * this.kF * this.detail || Math.acos(Math.min(1, p.centre.dot(eye) / (p.centre.length() * el))) > horizon + p.radius / R) continue;
      if (this.frustum.intersectsSphere(this.sphere.set(p.centre, p.radius + 6 + 0.1 * Math.max(d, 0)))) seen.push({ p, d });
    }
    seen.sort((a, b) => a.d - b.d);
    // the dissolve bands follow the governor's reach, so plants drawn in still dissolve by the stipple
    const kN = this.kN * this.detail, kF = this.kF * this.detail;
    KINDS.forEach((kind, k) => this.draws[k].forEach((d, lod) => {
      if (!d) return;
      const sp = FLORA[kind], u = (d.mesh.material as THREE.ShaderMaterial).uniforms, nr = sp.near * kN, fr = sp.far * kF;
      if (lod) (u.uBand.value as THREE.Vector4).set(nr * 0.85, nr, fr * 0.8, fr);
      else (u.uBand.value as THREE.Vector4).set(-1, 0, nr * (sp.far ? 0.85 : 0.75), nr);
      (u.uCut.value as THREE.Vector2).set(sp.far ? kF : kN, sp.far ? nr : 0);
    }));
    for (const d of this.all) d.n = 0;
    for (const { p } of seen) {
      for (let i = p.start; i < p.end; i++) {
        const k = bed.kind[i], sp = FLORA[KINDS[k]], [near, far] = this.draws[k], nr = sp.near * kN;
        const cut = sp.far ? Math.max(bed.seed[i * 2 + 1] * kF, nr) : bed.seed[i * 2 + 1] * kN;
        const dist = this.at.set(bed.matrix[i * 16 + 12], bed.matrix[i * 16 + 13], bed.matrix[i * 16 + 14]).distanceTo(eye);
        if (dist < Math.min(nr, cut)) near!.put(bed, i);
        if (far && dist > nr * 0.85 && dist < Math.min(sp.far * kF, cut)) far.put(bed, i);
      }
    }
    for (const d of this.all) d.commit();
    // WP30 part C: over FLORA_TRIS, draw the reach in (far level and thinning first, then the near level) and refill
    // next frame; well under it, let it out again a step per refill
    const tris = this.all.reduce((a, d) => a + d.triangles, 0);
    if (tris > FLORA_TRIS && (this.kF > KF_MIN || this.kN > KN_MIN)) {
      const s = THREE.MathUtils.clamp(Math.sqrt(FLORA_TRIS / tris) * 0.97, 0.6, 0.99);
      if (this.kF > KF_MIN) this.kF = Math.max(KF_MIN, this.kF * s);
      else this.kN = Math.max(KN_MIN, this.kN * s);
      this.eye.set(Infinity, 0, 0);
    } else if (tris < FLORA_TRIS * 0.7) {
      if (this.kN < 1) this.kN = Math.min(1, this.kN * 1.06);
      else if (this.kF < 1) this.kF = Math.min(1, this.kF * 1.06);
    }
  }

  /** Draw calls, triangles and instances submitted, and GPU bytes held (kits and instance buffers). */
  get stats(): { calls: number; triangles: number; instances: number; bytes: number; plants: number } {
    const shown = this.all.filter((d) => d.mesh.visible);
    return { calls: shown.length, triangles: shown.reduce((a, d) => a + d.triangles, 0), instances: shown.reduce((a, d) => a + d.n, 0),
      bytes: this.all.reduce((a, d) => a + d.bytes, 0), plants: this.bed.count };
  }

  dispose(): void {
    for (const d of this.all) d.dispose();
  }
}

/** WP30 part C: the flora's share of A9's triangles: the reach governor holds the plants in view under it, drawing in
 *  the far level and the thinning (to KF_MIN of their reach) and then the near level (to KN_MIN). */
const FLORA_TRIS = 140000, KF_MIN = 0.33, KN_MIN = 0.4;

/** Each scene's flora, for the region packages built after it. */
export const floras = new WeakMap<THREE.Object3D, Flora>();

/** The composition root's flora (MODULES): planted on the terrain, bending in the sea's wind. */
export function createFlora(ctx: RenderContext): RenderModule {
  const sea = seas.get(ctx.scene), terrain = terrains.get(ctx.scene);
  if (!sea || !terrain) throw new Error('createFlora: the sea and the terrain are built first (MODULES order)');
  const flora = new Flora(ctx.pipeline.style, ctx.world.geo, terrain.field, sea.swell);
  ctx.scene.add(flora.group);
  floras.set(ctx.scene, flora);
  return {
    frame() {
      flora.detail = ctx.pipeline.quality.detail; // WP26c the graphics quality
      flora.update(ctx.camera);
    },
    dispose() {
      ctx.scene.remove(flora.group);
      flora.dispose();
    },
  };
}
