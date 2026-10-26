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
import { mix, PIGMENTS, type RGB } from '../style/palette.ts';
import { v3 } from '../sim/math.ts';
import { R, TERRITORY, gnomonicDir } from '../sim/sphere.ts';
import type { Geography } from '../sim/world/geography.ts';
import { FLOOR, REGIONS, type Flora as RegionFlora, type Pigment, type Region } from '../sim/world/regions.ts';
import { seas } from './sea.ts';
import { SWELL_GLSL, type Swell } from './swell.ts';
import { GROUND, SLOPES, cladOf, groundAt, shoreExposure, terrains, townsOf, type Ground, type Surface, type TerrainField } from './terrain.ts';
import type { RenderContext, RenderModule } from './world.ts';

/** Every species: the regions' flora, plus reeds in the mud of grassy and mangrove shores and pandanus at the edge of
 *  the rainforest's beaches. */
/** `broadleaf` and `nutmeg` are the jungle's other crowns (planted wherever it grows, S-022: never one repeated tree). */
export type FloraKind = RegionFlora | 'reed' | 'pandanus' | 'broadleaf' | 'nutmeg';

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
const PALE_BARK = paint(mix(PIGMENTS.sepia, PIGMENTS.leadWhite, 0.45), 0.5);
/** Leaf masses take the instance's foliage (tint 1) or blossom (tint 2); only the density is the kit's. */
const LEAF: Paint = [1, 1, 1, 1.05], BLADE: Paint = [1, 1, 1, 0.9];
/** aTint: 0 the kit's pigment, 1 the instance's foliage, 2 its blossom. aPart: sway weight (0 root … 1 crown),
 *  0 wood / 1 leaf mass / 2 thin sheet (lit from the side it is seen), self-shade (0 deep inside … 1 open). */
const WOOD = 0, MASS = 1, SHEET = 2;

class Kit {
  private readonly a: Record<'position' | 'normal' | 'aLit' | 'aPaint' | 'aTint' | 'aPart', number[]> =
    { position: [], normal: [], aLit: [], aPaint: [], aTint: [], aPart: [] };
  private readonly index: number[] = [];
  /** S-025 (6b): its leaf masses are a rainforest canopy's crowns (the material shades and inks them as a canopy). */
  canopy = false;
  /** S-025 (6d): its leaf masses lit as one crown, a dome about `c` of radii `r` (their own normals kept for the
   *  outline only), as an engraver washes a far crown in one tone and shades its underside, never lobe by lobe. */
  dome: { c: THREE.Vector3; r: THREE.Vector3 } | null = null;

  vert(p: THREE.Vector3, n: THREE.Vector3, pt: Paint, tint: number, sway: number, part: number, shade: number): number {
    const a = this.a, d = part === MASS ? this.domeN(p) : null;
    a.position.push(p.x, p.y, p.z);
    a.normal.push(n.x, n.y, n.z);
    // the light's normal: the clump's own, or (a dome-lit crown) mostly the crown's, the clump's only a modelling touch
    const l = d ? d.clone().multiplyScalar(0.8).addScaledVector(n, 0.2).normalize() : n;
    a.aLit.push(l.x, l.y, l.z);
    a.aPaint.push(...pt);
    a.aTint.push(tint);
    a.aPart.push(Math.max(0, sway), part, shade);
    return a.aTint.length - 1;
  }

  /** A dome-lit crown's normal at p (null: none). */
  domeN(p: THREE.Vector3): THREE.Vector3 | null {
    const d = this.dome;
    return d ? V((p.x - d.c.x) / d.r.x ** 2, (p.y - d.c.y) / d.r.y ** 2, (p.z - d.c.z) / d.r.z ** 2).normalize() : null;
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

  /** A limb from `a` to `b` bowing up by `arch` on the way (a quadratic curve, never a straight plank), tapering
   *  from `r0` to `r1`; returns its path. */
  limb(a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, arch: number, sides: number, pt: Paint): THREE.Vector3[] {
    const m = a.clone().lerp(b, 0.5).addScaledVector(UP, arch), path: THREE.Vector3[] = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      path.push(a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(m, 2 * t * (1 - t)).addScaledVector(b, t * t));
    }
    this.tube(path, path.map((_, i) => r0 + (r1 - r0) * Math.pow(i / 4, 0.8)), sides, pt);
    return path;
  }

  /** A clustered leaf mass: an icosphere lobed into clumps, its underside drawn up by `under`, lit as a soft dome and
   *  darker beneath (`open` < 1: deeper in the crown's shade); vertices on its upper side whose pattern exceeds `bloom`
   *  carry the blossom whole, or (dab) a blossom weight the material breaks into soft dabs, thick on the sunward top. */
  mass(c: THREE.Vector3, r: number, squash: number, detail: number, seed: number, bloom = 2, dab = 0, under = 0.6, open = 1): void {
    const ico = new THREE.IcosahedronGeometry(1, detail), pos = ico.getAttribute('position'), q = V(), p = V(), n = V();
    // each clump its own warmth (the material's greens, cool to warm: aPaint.r below 1; the rest is the instance's)
    const leaf: Paint = [0.98 * (((Math.sin(seed * 12.9898 + 4.1) * 43758.5453) % 1 + 1) % 1), this.canopy ? (this.dome ? 0.3 : 0.5) : 1, 1, LEAF[3]];
    for (let k = 0; k < pos.count; k += 3) {
      const ids = [0, 1, 2].map((m) => {
        q.fromBufferAttribute(pos, k + m);
        const lobe = 1 + 0.22 * Math.sin(q.x * 4.1 + seed) * Math.sin(q.y * 3.7 + seed * 1.7) * Math.sin(q.z * 4.3 + seed * 2.3)
          + 0.09 * Math.sin((q.x + q.z) * 9 + seed * 3.1);
        p.set(q.x * r * lobe, q.y * r * lobe * squash * (q.y < 0 ? under : 1), q.z * r * lobe).add(c);
        n.copy(q); // its sphere's normal: the outline's, through the squash (the material lifts it toward the light)
        // aTint 1 + w: w the blossom (1 whole, as the pattern lays it; below 1 a weight for the material's dabs)
        const w = dab ? Math.min(0.95, dab * smooth(-1, 0.1, q.y) * (0.75 + 0.25 * Math.sin(q.x * 5 + q.z * 4 + seed)))
          : q.y > 0.05 && Math.sin(q.x * 7 + seed * 3) * Math.sin(q.z * 6 + seed) + 0.3 * q.y > bloom ? 1 : 0;
        // (its self-shade by its clump's side, or a dome-lit crown's by the crown's: deep under it, never clump by clump)
        return this.vert(p, n, leaf, 1 + w, p.y, MASS, (0.35 + 0.65 * smooth(-0.8, 0.6, this.domeN(p)?.y ?? q.y)) * open);
      });
      this.tri(ids[0], ids[1], ids[2]);
    }
    ico.dispose();
  }

  /** A billowing foliage clump: a core mass crowned by smaller lobes round its upper side, each lit on its own top and
   *  shaded under it, so the clump's outline swells in rounded billows (never one plate). */
  billow(c: THREE.Vector3, r0: number, squash: number, lobes: number, detail: number, seed: number, dab = 0, open = 1): void {
    const r = r0 * 1.12; // drawn a little large: the material bites its outline back into rounded clumps
    this.mass(c, r, squash, detail, seed, 2, dab, 0.75, open * 0.85);
    for (let i = 0; i < lobes; i++) {
      const a = seed * 1.7 + (i / lobes) * TAU + 0.5 * Math.sin(seed + i * 3.1), el = 0.25 + 0.55 * hash(i, Math.round(seed * 31), 3);
      const o = V(Math.cos(a) * Math.cos(el), Math.sin(el) * squash, Math.sin(a) * Math.cos(el)).multiplyScalar(r * 0.78);
      this.mass(o.add(c), r * (0.4 + 0.2 * hash(i, Math.round(seed * 31), 5)), squash * 1.15, 0, seed + i * 5.3, 2, dab * 1.1, 0.8, open);
    }
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
    const g = new THREE.BufferGeometry(), sizes = { position: 3, normal: 3, aLit: 3, aPaint: 4, aTint: 1, aPart: 3 } as const;
    for (const [k, s] of Object.entries(sizes)) g.setAttribute(k, new THREE.Float32BufferAttribute(this.a[k as keyof typeof sizes], s));
    g.setIndex(this.index);
    g.userData.dome = this.dome !== null; // (its material takes the plant's habit on its wood too: floraMaterial's dome)
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

/** A rainforest tree 1 tall, drawn as an engraver draws one from a boat offshore (S-020). `canopy`: a bole forking low
 *  into limbs under a deep crown massed into billowing clumps of many sizes at stepped heights, a sub-canopy crown
 *  under its rim, creepers draping from the rim, lianas hanging in loops and curls, and at its feet an understory of
 *  low billows, fern fronds and broad leaves, so from the side the leaf runs from the crown to the ground. `flowering`:
 *  a broad, spreading crown at the canopy's height whose clumps carry a blossom weight over all but their undersides
 *  (the material washes it whole, S-022). `emergent`: a pale buttressed bole standing clear of the canopy under a
 *  broad, irregular, two-tiered crown of clumps on long fanning limbs, lianas hanging from it (never a lollipop). Far:
 *  the bole and a few billows. */
export type RainForm = 'canopy' | 'flowering' | 'emergent' | 'edge' | 'broad' | 'cone' | 'clove' | 'pepper';
function rainKit(lod: number, form: RainForm, seed: number): Kit {
  if (form === 'edge') return edgeKit(lod, seed);
  if (form === 'pepper') return pepperKit(lod, seed);
  if (form === 'cone') return nutmegKit(lod, seed);
  if (form === 'clove') return cloveKit(lod, seed);
  if (form === 'broad') return crownedKit(lod, form, seed);
  const k = new Kit(), far = lod > 0, em = form === 'emergent', fl = form === 'flowering';
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  const lean = V((rnd() - 0.5) * 0.12, 0, (rnd() - 0.5) * 0.12), forkY = (em ? 0.52 : fl ? 0.34 : 0.4) + 0.05 * rnd();
  const fork = V(0, forkY, 0).add(lean), bark = em ? PALE_BARK : BARK, dab = fl ? 1.15 : 0; // a tree in flower is a mass of colour (S-022)
  k.canopy = !em; // (S-025 (6b): drawn as the canopy, near and far; the emergents stand clear of it)
  if (far && !em) {
    // far, S-025: never a cushion on the canopy. A bole that reads at harbour distance, two limbs forking from it into
    // a crown of separate clumps at differing heights and reaches, the sky or the shade between them (a flowering
    // tree's spread wide and flat, a canopy tree's taller and more broken)
    k.tube([V(0, -0.06, 0), V(lean.x * 0.3 + 0.015, forkY * 0.5, lean.z * 0.3), fork], [0.062, 0.045, 0.034], 4, bark);
    // S-025 (6b): an irregular crown, never a cushion: the heart off to one side, a broad shoulder, a smaller lobe
    // slung low into the shade, and a spray thrown out high on its own limb, so each crown's outline and habit differ
    // (the bed varies its width and height too) and the material can sink its lower lobes into the canopy's hollows
    const a0 = rnd() * TAU, top = fl ? 0.8 : 0.86;
    k.mass(V(0.07 * Math.cos(a0), top - 0.2, 0.07 * Math.sin(a0)).add(lean), fl ? 0.26 : 0.24, fl ? 0.7 : 0.82, 0, seed * 3.1, 2, dab, 0.8, 1);
    const lobes = fl ? [[0.3, 0.22, -0.26, 0.9], [0.27, 0.15, -0.38, 0.72], [0.36, 0.1, -0.12, 1]]
      : [[0.24, 0.2, -0.3, 0.9], [0.26, 0.14, -0.44, 0.7], [0.31, 0.09, -0.08, 1]];
    lobes.forEach(([d0, r0, h, open], i) => {
      const a = a0 + Math.PI + (i - 1) * 2 + 0.6 * rnd(), d = d0 + 0.06 * rnd(), r = r0 + 0.035 * rnd();
      const c = V(Math.cos(a) * d, top + h + 0.05 * rnd(), Math.sin(a) * d).add(lean);
      if (i !== 1) k.tube([fork, c.clone().setY(c.y - r * 0.4)], [0.024, 0.01], 3, bark); // (the low lobe's limb hidden)
      k.mass(c, r, fl ? 0.72 : 0.82, 0, seed * 3.1 + (i + 1) * 2.37, 2, dab, 0.8, open);
    });
    return k;
  }
  k.tube([V(0, -0.06, 0), V(lean.x * 0.3 + 0.015, forkY * 0.5, lean.z * 0.3), fork], em ? [0.05, 0.032, 0.026] : [0.045, 0.03, 0.024], far ? 3 : 5, bark);
  if (em && !far) for (let i = 0; i < 4; i++) { // buttresses: thin flanges flaring from the bole's foot
    const a = (i / 4) * TAU + rnd(), o = V(Math.cos(a), 0, Math.sin(a)), nn = V(-o.z, 0, o.x);
    k.tri(k.vert(V(0, 0.2, 0), nn, bark, 0, 0, WOOD, 0.8), k.vert(o.clone().multiplyScalar(0.13).setY(-0.03), nn, bark, 0, 0, WOOD, 0.6), k.vert(V(0, -0.03, 0), nn, bark, 0, 0, WOOD, 0.5));
  }
  // the crown: billowing clumps, the largest high in the middle, the rest round it at stepped heights, wider and lower
  // toward the rim (an emergent's in two tiers), each on a limb from the fork
  const spread = em ? 0.46 : fl ? 0.42 : 0.4, top = em ? 0.93 : 0.86, C = far ? (em ? 5 : 2) : em ? 7 : 5;
  const rims: THREE.Vector3[] = [];
  for (let i = 0; i < C; i++) {
    const a = i * 2.39996 + rnd() * 0.8, d = i === 0 && !em ? 0.02 : spread * (far ? (em ? 0.62 : 0.5) : 0.4 + 0.6 * Math.sqrt(rnd()));
    // far: a broad crown in two or three billows, the lower one slung low over the bole (never a tuft on a pole)
    const tier = (em && i >= 5) || (far && i === 1) ? (far && !em ? 0.26 : 0.16) : 0, r = far ? (em ? (i ? 0.2 : 0.22) : i ? 0.21 : fl ? 0.25 : 0.27) : (i === 0 ? 0.2 : 0.11 + 0.08 * rnd()) * (em ? 0.85 : 1);
    const c = V(Math.cos(a) * d, top - r * 0.6 - tier - (em ? 0.18 : 0.3) * (d / spread) ** 2 + 0.05 * rnd(), Math.sin(a) * d).add(lean);
    // far, an emergent's bole runs on up into a crown massed over it, its limbs into the clumps round it (S-020: a bare
    // pale bole with its clumps off to the sides read as a pole on the skyline)
    // far, S-022: no column stacked over a pole; one clump over the fork, four round it in two tiers far out on spreading
    // limbs, so the crown is a broad, flat-topped spread the limbs show under
    if (em && far) {
      const dd = i ? (i % 2 ? 0.3 : 0.37) + 0.05 * rnd() : 0.03;
      c.set(Math.cos(a) * dd, forkY + (i === 0 ? 0.27 : i % 2 ? 0.3 : 0.15), Math.sin(a) * dd).add(lean);
      if (i) k.limb(fork, c.clone().setY(c.y - r * 0.35), 0.022, 0.008, 0.08, 3, bark);
    } else if (em && !far) {
      // near, a limb rises steeply from the fork and arches out, tapering, and forks under its clump into two boughs and
      // a twig: never a straight plank (S-020, S-022); dark under the crown, the twigs ending in the leaf
      const end = c.clone().setY(c.y - r * 0.3), split = fork.clone().lerp(end, 0.6).setY(fork.y + (end.y - fork.y) * 0.8);
      const main = k.limb(fork, split, 0.028, 0.017, 0.06, 6, BARK), sw = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(r * 0.65);
      const turn = rnd() < 0.5 ? -1 : 1;
      k.limb(main[4], end.clone().addScaledVector(sw, 0.35 * turn), 0.016, 0.006, 0.04, 5, BARK);
      k.limb(main[4], end.clone().addScaledVector(sw, -0.9 * turn).setY(end.y + r * 0.1), 0.012, 0.004, 0.05, 4, BARK);
      k.limb(main[2], main[2].clone().lerp(end, 0.7).addScaledVector(sw, 1.2 * turn).setY(end.y - r * 0.1), 0.009, 0.003, 0.03, 3, BARK);
    } else if (!far && d > 0.05) k.tube([fork, c.clone().setY(c.y - r * 0.3)], [0.02, 0.008], 3, bark); // (hidden in the canopy)
    k.billow(c, r, em ? (far ? 0.8 : 0.66) : 0.74, far ? (i ? (em ? 1 : 0) : em ? 1 : 2) : i ? 2 : 3, 0, seed * 3.1 + i * 2.37, dab, tier ? 0.8 : 1);
    if (d > spread * 0.6) rims.push(c);
  }
  if (far) return k;
  // the sub-canopy under the rim (none under an emergent: the canopy round it is its own)
  if (!em) {
    const sa = rnd() * TAU, sub = V(Math.cos(sa) * 0.28, 0, Math.sin(sa) * 0.28);
    k.tube([sub.clone().setY(-0.04), sub.clone().setY(0.26)], [0.02, 0.012], 3, BARK);
    k.billow(sub.clone().setY(0.3 + 0.05 * rnd()), 0.15, 0.8, 1, 0, seed + 40, dab * 0.6, 0.75);
  }
  // lianas: loops slung between limbs, sagging in a curve, and strands hanging from the rim in a slow S to a curl
  const sling = (a: THREE.Vector3, b: THREE.Vector3, sag: number): void => {
    const pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 4; s++) pts.push(a.clone().lerp(b, s / 4).setY(a.y + (b.y - a.y) * (s / 4) - sag * Math.sin((Math.PI * s) / 4)));
    k.tube(pts, pts.map(() => 0.005), 3, ROOT);
  };
  for (let i = 0; i + 1 < rims.length && i < 2; i++) sling(rims[i].clone().setY(rims[i].y - 0.05), rims[i + 1].clone().setY(rims[i + 1].y - 0.05), 0.12 + 0.12 * rnd());
  for (let i = 0; i < (em ? 2 : 1); i++) {
    const a = rnd() * TAU, d = spread * (0.5 + 0.4 * rnd()), x = Math.cos(a) * d + lean.x, zz = Math.sin(a) * d + lean.z, y0 = top - 0.12;
    const len = em ? 0.35 + 0.15 * rnd() : y0 - 0.06, pts: THREE.Vector3[] = [];
    for (let s = 0; s <= 4; s++) {
      const t = s / 4, sw = 0.035 * Math.sin(t * 4 + i);
      pts.push(V(x + sw * Math.sin(a), y0 - len * t, zz - sw * Math.cos(a)));
    }
    const end = pts[4]; // the curl at its foot
    pts.push(V(end.x + 0.025 * Math.cos(a), end.y + 0.015, end.z + 0.025 * Math.sin(a)));
    k.tube(pts, pts.map((_, s) => 0.006 - 0.0005 * s), 3, ROOT);
  }
  if (em) return k;
  // the understory: low billows, fern fronds and broad leaves at the feet, so no stem stands on bare ground
  const sa0 = rnd() * TAU;
  for (let i = 0; i < 2; i++) {
    // saplings and edge growth standing to the crown's underside, one hard by the bole, so no stem shows between the
    // leaf at the foot and the canopy (S-020)
    const a = sa0 + i * 2.1 + rnd(), d = i ? 0.2 + 0.18 * rnd() : 0.08 + 0.06 * rnd();
    k.billow(V(Math.cos(a) * d, 0.17 + 0.06 * rnd(), Math.sin(a) * d), 0.14 + 0.05 * rnd(), 1.2, 1, 0, seed + 60 + i, 0, 0.7);
  }
  for (let f = 0; f < 2; f++) {
    const a = rnd() * TAU, h = V(Math.cos(a), 0, Math.sin(a)), base = h.clone().multiplyScalar(0.06 + 0.12 * rnd()), broad = f % 2 === 1;
    k.sheet(base, h.clone().multiplyScalar(broad ? 0.12 : 0.17).addScaledVector(UP, broad ? 0.16 : 0.12), V(0, -0.1, 0), broad ? 0.05 : 0.035, 3, broad ? 0 : 0.55, 0.3, LEAF, 1);
  }
  return k;
}

/** The jungle's other crowns, 1 tall (S-022: never one repeated umbrella). `broad`: a low-forking tree under a wide
 *  dome of billows skirting down to its feet, wider than tall (a fig or a rain tree). `cone`: a nutmeg's or a clove's
 *  dense crown tapering in stacked tiers of clumps from near the ground to a point. Far: the same outline in a few
 *  masses, no bole (the crown hides it). */
function crownedKit(lod: number, form: 'broad', seed: number): Kit {
  const k = new Kit(), far = lod > 0;
  k.canopy = true;
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  if (form === 'broad' && far) {
    // far, S-025: a short stout bole and two limbs spreading into a wide dome of separate clumps, gaps between them;
    // S-025 (6d): lit as one crown (Kit.dome), never lobe by lobe (rows of olive loaves above the town), its clumps
    // rounder and lacier at the outline, each plant drawn out by bearing into its own habit (the material's dome)
    k.dome = { c: V(0, 0.56, 0), r: V(0.48, 0.3, 0.48) };
    k.tube([V(0, -0.06, 0), V(0, 0.3, 0.01)], [0.066, 0.045], 4, BARK);
    const a0 = rnd() * TAU;
    k.mass(V(0.06 * Math.cos(a0), 0.68, 0.06 * Math.sin(a0)), 0.24, 0.78, 0, seed * 1.3, 2, 0, 0.7, 1);
    for (let i = 0; i < 3; i++) { // (lobes of differing reach and size, one small spray thrown out high: S-025 (6b))
      const a = a0 + Math.PI + (i - 1) * 2 + 0.5 * rnd(), d = [0.36, 0.28, 0.44][i] + 0.06 * rnd(), r = [0.2, 0.15, 0.11][i] + 0.04 * rnd();
      const c = V(Math.cos(a) * d, [0.5, 0.38, 0.62][i] + 0.08 * rnd(), Math.sin(a) * d);
      if (i !== 1) k.tube([V(0, 0.3, 0), c.clone().setY(c.y - r * 0.4)], [0.028, 0.012], 3, BARK);
      k.mass(c, r, 0.8, 0, seed + i * 3.3, 2, 0, 0.7, [0.92, 0.72, 1][i]);
    }
    return k;
  }
  {
    if (!far) k.tube([V(0, -0.06, 0), V(0.02, 0.16, 0), V(0, 0.3, 0.01)], [0.05, 0.034, 0.026], 5, BARK);
    k.billow(V(0, 0.72, 0), 0.25, 0.62, far ? 2 : 3, 0, seed * 1.3, 0, 1);
    const n = far ? 2 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + 0.6 * rnd(), d = far ? 0.36 : 0.3 + 0.16 * rnd(), r = far ? 0.24 : 0.15 + 0.06 * rnd();
      const c = V(Math.cos(a) * d, (far ? 0.5 : 0.48 + 0.16 * rnd()), Math.sin(a) * d);
      if (!far) k.tube([V(0, 0.3, 0), c.clone().setY(c.y - r * 0.4)], [0.022, 0.009], 3, BARK);
      if (far) k.mass(c, r, 0.62, 0, seed + i * 3.3, 2, 0, 0.75, 0.85);
      else k.billow(c, r, 0.66, 1, 0, seed + i * 3.3, 0, i % 2 ? 0.85 : 1);
    }
    if (!far) for (let i = 0; i < 3; i++) { // the skirt: lower billows under the rim, down to the understory
      const a = rnd() * TAU, d = 0.22 + 0.15 * rnd();
      k.billow(V(Math.cos(a) * d, 0.24 + 0.08 * rnd(), Math.sin(a) * d), 0.15 + 0.04 * rnd(), 0.9, 1, 0, seed + 30 + i, 0, 0.7);
    }
    return k;
  }
  return k;
}

/** A nutmeg tree 1 tall, as an engraver draws one in a spice garden from life (S-025 (6c); never a stack of balls): a
 *  short trunk forking low under a dense, dark evergreen crown of irregular habit, conical to rounded (each seed its
 *  own), its heart off to one side, a shoulder slung out lower on the other, a narrower head leaning on, sprays breaking
 *  the outline at differing heights and reaches, and a skirt sunk in its own shade near the ground. */
function nutmegKit(lod: number, seed: number): Kit {
  const k = new Kit(), far = lod > 0;
  k.canopy = true;
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  const a0 = rnd() * TAU, round = rnd(), lean = V(0.06 * Math.cos(a0 + 1), 0, 0.06 * Math.sin(a0 + 1));
  const at = (a: number, d: number, y: number): THREE.Vector3 => V(Math.cos(a) * d, y, Math.sin(a) * d).addScaledVector(lean, y);
  if (far) k.tube([V(0, -0.06, 0), at(0, 0, 0.3)], [0.05, 0.026], 3, BARK); // (far: within the kits' 110 triangles)
  else k.tube([V(0, -0.06, 0), at(0, 0, 0.15), at(0, 0, 0.3)], [0.05, 0.036, 0.026], 4, BARK);
  if (!far) for (let i = 0; i < 2; i++) k.tube([at(0, 0, 0.15), at(a0 + 2 + 2.3 * i, 0.15, 0.3)], [0.02, 0.009], 3, BARK); // limbs forking low
  // the crown's bulk, off-centre; the shoulder lower on the far side; the head narrower and higher, leaning on (a young
  // tree conical, an old one rounded); the tip a narrow spray
  const parts: [THREE.Vector3, number, number, number][] = [
    [at(a0, 0.06, 0.45), 0.26 + 0.04 * round, 1.05 - 0.15 * round, 0.95],
    [at(a0 + Math.PI + 0.7 * (rnd() - 0.5), 0.15 + 0.05 * rnd(), 0.33 + 0.05 * rnd()), 0.18 + 0.03 * rnd(), 0.85, 0.75],
    [at(a0 + 0.9 * (rnd() - 0.5), 0.07, 0.69 - 0.06 * round), 0.16 + 0.05 * round, 1.15 - 0.2 * round, 1],
    [at(a0 + 1.4 * (rnd() - 0.5), 0.06 + 0.04 * rnd(), 0.88 - 0.06 * round), 0.08 + 0.02 * round, 1.4, 1]];
  parts.forEach(([c, r, sq, open], i) => {
    if (!far && i < 3) k.billow(c, r * 0.92, sq, 2 + (i === 0 ? 1 : 0), 1, seed * 1.7 + i * 2.3, 0, open);
    else k.mass(c, r, sq, 0, seed * 1.7 + i * 2.3, 2, 0, 0.75, open);
  });
  // sprays out on the outline, each its own height and reach, so the silhouette breaks into leaf, never a rim
  for (let i = 0, n = far ? 1 : 6; i < n; i++) {
    const y = 0.26 + 0.52 * ((i + rnd()) / n), out = (0.3 + 0.04 * round) * (1 - 0.62 * Math.max(0, y - 0.25) / 0.6) + 0.03;
    k.mass(at(a0 + 1.1 + i * 2.4 + 0.5 * rnd(), out, y), 0.06 + 0.035 * rnd(), 1.1, 0, seed * 2.9 + i * 1.3, 2, 0, 0.8, 0.9);
  }
  if (!far) k.mass(at(a0 + 2.3, 0.15, 0.22), 0.15 + 0.03 * rnd(), 0.7, 0, seed * 3.7, 2, 0, 0.5, 0.55); // the skirt, in its own shade
  return k;
}

/** A clove tree 1 tall in a spice garden (S-025 (6c)): a slender trunk under a narrow cone of dense small leaf from low
 *  down to a pointed head, its clumps overlapping as they climb, the centre wandering a little, sprays broken out of the
 *  outline; its young leaf flushed red at the head and the upper sprays (the blossom weight: the material's dabs). */
function cloveKit(lod: number, seed: number): Kit {
  const k = new Kit(), far = lod > 0;
  k.canopy = true;
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  const a0 = rnd() * TAU, lean = V(0.05 * Math.cos(a0), 0, 0.05 * Math.sin(a0)), width = (y: number): number => 0.17 * (1 - 0.8 * Math.max(0, y - 0.28) / 0.66) + 0.015;
  k.tube([V(0, -0.06, 0), V(lean.x * 0.25, 0.28, lean.z * 0.25)], [0.034, 0.022], far ? 3 : 4, BARK);
  const n = far ? 5 : 7, c = V(0, 0, 0);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = 0.3 + 0.56 * t;
    c.set(c.x + 0.035 * (rnd() - 0.5), y, c.z + 0.035 * (rnd() - 0.5));
    const at = c.clone().addScaledVector(lean, y), flush = t > 0.55 ? 0.45 + 0.5 * t : 0;
    k.mass(at, width(y) * (0.9 + 0.2 * rnd()), 1.3, !far && t < 0.5 ? 1 : 0, seed * 1.3 + i * 2.9, 2, flush, 0.75, 0.72 + 0.28 * t);
  }
  for (let i = 0, m = far ? 3 : 6; i < m; i++) {
    const y = 0.32 + 0.5 * ((i + rnd()) / m), a = a0 + i * 2.4 + 0.5 * rnd();
    k.mass(V(Math.cos(a) * width(y), y, Math.sin(a) * width(y)).addScaledVector(lean, y), 0.045 + 0.03 * rnd(), 1.3, 0, seed * 2.1 + i * 1.7, 2, y > 0.55 ? 0.9 : 0.25, 0.8, 0.9);
  }
  k.mass(V(0, 0.95, 0).addScaledVector(lean, 1.1), 0.045, 1.9, 0, seed * 4.1, 2, 0.95, 0.8, 1); // the head
  return k;
}

/** A pepper vine 1 tall in a spice garden (S-025; (6c) an untidy leafy column, never a bead string): on a pale pole
 *  whose head stands clear (an even seed), or on a live support (odd), a slender tree whose own small head of leaf
 *  sits over the vine; the vine's clumps crowd the support at uneven heights and reaches, gaps where the pole shows,
 *  loose shoots hanging out from the column, thinning toward its head. */
function pepperKit(lod: number, seed: number): Kit {
  const k = new Kit(), far = lod > 0, live = seed % 2 === 1, n = far ? 7 : 13;
  k.canopy = true;
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  const lean = V(0.04 * (rnd() - 0.5), 0, 0.04 * (rnd() - 0.5));
  if (live) {
    const top = V(lean.x * 2, 1.12, lean.z * 2);
    k.tube([V(0, -0.06, 0), V(lean.x, 0.6, lean.z), top], [0.04, 0.028, 0.018], far ? 3 : 4, BARK);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + rnd(), d = 0.07 + 0.05 * rnd();
      if (!far) k.tube([V(top.x, 0.98, top.z), V(top.x + Math.cos(a) * d, 1.1 + 0.05 * i, top.z + Math.sin(a) * d)], [0.012, 0.006], 3, BARK);
      k.mass(V(top.x + Math.cos(a) * d, 1.12 + 0.05 * i, top.z + Math.sin(a) * d), 0.08 + 0.03 * rnd(), 0.6, 0, seed * 1.9 + i * 3.1, 2, 0, 0.8, 1);
    }
  } else k.tube([V(0, -0.05, 0), V(lean.x * 2, 1.04, lean.z * 2)], [0.026, 0.02], far ? 3 : 4, PALE_BARK);
  for (let i = 0; i < n; i++) {
    const y = 0.05 + 0.86 * ((i + 0.8 * rnd()) / n), a = rnd() * TAU, d = 0.03 + 0.06 * rnd(), r = (far ? 0.1 : 0.075) * (1 - 0.35 * y) + 0.04 * rnd();
    if (rnd() < 0.12) continue; // (a gap: the pole shows)
    k.mass(V(Math.cos(a) * d + lean.x * 2 * y, y, Math.sin(a) * d + lean.z * 2 * y), r, 1.25 + 0.4 * rnd(), 0, seed + i * 4.1, 2, 0, 0.8, 0.62 + 0.38 * y);
  }
  for (let i = 0; i < (far ? 2 : 4); i++) { // loose shoots hanging out from the column
    const y = 0.4 + 0.5 * rnd(), a = rnd() * TAU, d = 0.11 + 0.06 * rnd();
    k.mass(V(Math.cos(a) * d + lean.x * 2 * y, y - 0.04, Math.sin(a) * d + lean.z * 2 * y), 0.04 + 0.02 * rnd(), 1.7, 0, seed * 2.3 + i, 2, 0, 0.8, 0.95);
  }
  return k;
}

/** The rainforest's edge, 1 tall and about as wide, where the forest meets the light of a beach or the water (S-020):
 *  saplings and edge growth banked from the ground to the canopy's underside, ferns at its foot, and climbers draped
 *  down its face in curtains of leaf, so from the shore the eye meets a wall of jungle, not the stems behind it. */
function edgeKit(lod: number, seed: number): Kit {
  const k = new Kit(), far = lod > 0;
  let z = seed * 9301 + 49297;
  const rnd = (): number => ((z = (z * 9301 + 49297) % 233280) / 233280);
  if (far) {
    for (let i = 0; i < 3; i++) k.billow(V((i - 1) * 0.34, 0.3 + 0.22 * (i % 2), 0), 0.24, 0.85, 1, 0, seed + i * 3.7, 0, 0.85);
    return k;
  }
  // the bank: overlapping clumps in three staggered tiers from the ground to the canopy's underside, broad at the foot,
  // the saplings carrying the upper tier hidden inside it (no stem shows)
  for (let i = 0; i < 4; i++) k.billow(V((i - 1.5) * 0.3 + 0.06 * rnd(), 0.2 + 0.06 * rnd(), 0.12 * (rnd() - 0.5)), 0.22 + 0.05 * rnd(), 0.85, 1, 0, seed + i * 2.9, 0, 0.75);
  for (let i = 0; i < 3; i++) k.billow(V((i - 1) * 0.34 + 0.08 * (rnd() - 0.5), 0.47 + 0.08 * rnd(), 0.12 * (rnd() - 0.5)), 0.2 + 0.04 * rnd(), 0.82, 1, 0, seed + 10 + i * 2.3, 0, 0.85);
  for (let i = 0; i < 2; i++) {
    const c = V((i - 0.5) * 0.4 + 0.08 * (rnd() - 0.5), 0.72 + 0.08 * rnd(), 0.1 * (rnd() - 0.5));
    k.tube([V(c.x * 0.9, 0.3, c.z), c.clone().setY(c.y - 0.08)], [0.014, 0.008], 3, BARK);
    k.billow(c, 0.18 + 0.04 * rnd(), 0.8, 2, 0, seed + 20 + i * 3.1, 0, 0.95);
  }
  // climbers draped down its face from the upper tier, broad leaves on long hanging runners, both faces
  for (let i = 0; i < 4; i++) {
    const f = i % 2 ? -1 : 1, x = (rnd() - 0.5) * 0.8;
    k.sheet(V(x, 0.8 + 0.08 * rnd(), f * 0.2), V(0.06 * (rnd() - 0.5), -0.5 - 0.15 * rnd(), f * 0.12), V(0, 0, f * 0.05), 0.05, 4, 0.45, 0.2, LEAF, 1);
  }
  // ferns at its foot, arching out toward the light
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU, h = V(Math.cos(a), 0, Math.sin(a));
    k.sheet(h.clone().multiplyScalar(0.12 + 0.2 * rnd()).setY(0.02), h.clone().multiplyScalar(0.2).addScaledVector(UP, 0.14), V(0, -0.12, 0), 0.04, 3, 0.55, 0.3, LEAF, 1);
  }
  return k;
}

/** The rainforest's strand, 1 tall, where it meets the beach: a pandanus (a leaning, forking trunk on a cone of stilt
 *  roots, a spiky tuft of long drooping strap leaves at each branch's tip) rising out of a bank of strand scrub, low
 *  billows of leaf spilling onto the sand, so the forest's edge comes down to the beach as a wall of leaf. */
function pandanusKit(lod: number): Kit {
  const k = new Kit(), far = lod > 0, tips = [V(0.2, 0.86, 0.05), V(-0.12, 0.92, -0.1), V(0.02, 0.74, 0.2)].slice(0, far ? 1 : 3);
  const fork = V(0.06, 0.45, 0);
  k.tube([V(0, 0.12, 0), V(0.03, 0.3, 0), fork], [0.03, 0.026, 0.022], 3, PALM_BARK);
  if (!far) for (let i = 0; i < 4; i++) { // stilt roots splaying into the sand
    const a = (i / 4) * TAU + 0.4;
    k.tube([V(0, 0.16, 0), V(Math.cos(a) * 0.08, 0.06, Math.sin(a) * 0.08), V(Math.cos(a) * 0.13, -0.03, Math.sin(a) * 0.13)], [0.01, 0.009, 0.008], 3, PALM_BARK);
  }
  for (const [t, tip] of tips.entries()) {
    k.tube([fork, V((fork.x + tip.x) / 2, (fork.y + tip.y) / 2 + 0.05, (fork.z + tip.z) / 2), tip], [0.02, 0.016, 0.013], 3, PALM_BARK);
    const L = far ? 5 : 7;
    for (let l = 0; l < L; l++) {
      const az = l * 2.39996 + t, rise = 0.5 - 0.9 * ((l * 0.618) % 1), h = V(Math.cos(az), 0, Math.sin(az)), len = 0.3 + 0.08 * Math.sin(l * 1.9);
      k.sheet(tip, h.clone().multiplyScalar(len).addScaledVector(UP, rise * len), V(0, -0.5 * len, 0), 0.022, far ? 2 : 3, 0.25, 0.5, LEAF, 1);
    }
  }
  for (let i = 0; i < (far ? 1 : 4); i++) { // the strand scrub banked round its foot
    const a = i * 2.4 + 0.7, d = 0.18 + 0.2 * ((i * 0.618) % 1), y = 0.07 + 0.1 * ((i * 0.38) % 1);
    k.billow(V(Math.cos(a) * d, y, Math.sin(a) * d), 0.14 + 0.05 * ((i * 0.71) % 1), 0.8, far ? 1 : 2, 0, 70 + i * 3.3, 0, 0.8);
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
  jungle: { kit: (l) => rainKit(l, 'canopy', 7), size: [2.6, 4.0], near: 60, far: 300, sway: 0.045 },
  floweringTree: { kit: (l) => rainKit(l, 'flowering', 11), size: [3.3, 4.6], near: 60, far: 300, sway: 0.05 },
  cloudForest: { kit: (l) => crownKit(l, 'cloud'), size: [2.8, 4.2], near: 42, far: 300, sway: 0.045 },
  mangrove: { kit: (l) => crownKit(l, 'mangrove'), size: [1.4, 2.2], near: 42, far: 240, sway: 0.04 },
  palm: { kit: (l) => palmKit(l, false), size: [1.8, 2.8], near: 55, far: 260, sway: 0.08 },
  treeFern: { kit: (l) => palmKit(l, true), size: [1.0, 1.6], near: 45, far: 150, sway: 0.07 },
  heather: { kit: () => crownKit(0, 'shrub'), size: [0.3, 0.55], near: 55, far: 0, sway: 0.08 },
  scrub: { kit: () => crownKit(0, 'shrub'), size: [0.4, 0.8], near: 70, far: 0, sway: 0.07 },
  grass: { kit: () => tuftKit(false), size: [0.25, 0.45], near: 34, far: 0, sway: 0.3 },
  duneGrass: { kit: () => tuftKit(false), size: [0.3, 0.5], near: 34, far: 0, sway: 0.35 },
  reed: { kit: () => tuftKit(true), size: [0.5, 0.9], near: 40, far: 0, sway: 0.25 },
  pandanus: { kit: pandanusKit, size: [1.5, 2.4], near: 45, far: 160, sway: 0.06 },
  kelp: { kit: kelpKit, size: [1.6, 2.4], near: 70, far: 0, sway: 0.22, veil: true },
  coral: { kit: coralKit, size: [0.35, 0.6], near: 120, far: 0, sway: 0, veil: true },
  broadleaf: { kit: (l) => rainKit(l, 'broad', 13), size: [2.4, 3.6], near: 60, far: 300, sway: 0.045 },
  nutmeg: { kit: (l) => rainKit(l, 'cone', 19), size: [1.8, 3.0], near: 60, far: 300, sway: 0.05 },
};
export const KINDS = Object.keys(FLORA) as FloraKind[];

/** A rainforest tree's kit as geometry (the Spice Isles' emergents and flowering trees, in floraMaterial). */
export function rainGeometry(form: RainForm, lod: number, seed: number): THREE.BufferGeometry {
  return rainKit(lod, form, seed).geometry();
}

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
interface Cell { ground: Ground; height: number; up: number; inland: number; shelter: number; alt: number; grove: number; depth: number; floor: number; mix: number; clad: boolean }

/** The trees (palms apart: they fringe the beach crest): never on beach, mud, cliff, basalt or ice. */
/** S-025 (6b): the rainforest canopy's trees (jungle, flowering, broadleaf) planted this much larger than their kits'
 *  sizes, and as much fewer per area (their crowns overlapping more): a canopy of big crowns over deep hollows, not a heap of small ones. */
export const CANOPY = 1.5;
export const TREES: readonly FloraKind[] = ['pine', 'jungle', 'floweringTree', 'cloudForest', 'treeFern', 'broadleaf', 'nutmeg'];
/** Whether a land species takes the exact surface's ground: dune grass and palms the beach crest, reeds the mud, every other
 *  species open ground, rock and scree (mangroves stand in the tide, kelp and coral under it). */
const grows = (kind: FloraKind, g: Ground): boolean => (kind === 'duneGrass' || kind === 'palm' || kind === 'pandanus' ? g === GROUND.meadow || g === GROUND.beach
  : kind === 'reed' ? g === GROUND.mud || g === GROUND.meadow : g === GROUND.meadow || g === GROUND.rock || g === GROUND.scree);
// (rainforest holds far steeper ground, down to its sheer crags: SLOPES.clad)
const wooded = (c: Cell, [lo, hi] = c.clad ? SLOPES.clad : [0.6, 0.8]): number => (c.up > lo && c.inland > 1.2 && c.depth < -0.3
  ? smooth(lo, hi, c.up) * Math.min(1.4, Math.max(0.12, 0.75 + 0.9 * c.shelter)) * (1 - smooth(0.6, 1, c.alt)) : 0);

/** Expected plants of `kind` in a cell. */
function density(kind: FloraKind, c: Cell): number {
  const land = c.depth < 0, grove = (a: number, b: number): number => smooth(a, b, c.grove), g = c.ground;
  switch (kind) {
    case 'pine': return 0.3 * wooded(c) * grove(0.3, 0.55);
    // the canopy mixed of three crowns, each massing where a slow field favours it, flowering trees through them all
    // (S-025 (6b): fewer and larger than the kits' sizes, CANOPY: a canopy's trees tower over the godowns)
    case 'jungle': return (0.14 / CANOPY) * wooded(c) * grove(0.12, 0.35) * (0.6 + 0.8 * c.mix);
    case 'broadleaf': return (0.11 / CANOPY) * wooded(c) * grove(0.12, 0.35) * (1.4 - 0.8 * c.mix);
    case 'nutmeg': return 0.08 * wooded(c) * grove(0.12, 0.35) * (0.5 + c.mix * (1 - c.mix) * 2.4);
    case 'floweringTree': return (0.15 / CANOPY) * wooded(c) * grove(0.12, 0.35);
    case 'cloudForest': return 0.3 * wooded(c) * grove(0.15, 0.4) * (0.6 + c.alt);
    case 'treeFern': return 0.12 * wooded(c) * (1.2 - c.alt);
    case 'palm': return land && (g === GROUND.meadow || (g === GROUND.beach && c.height > 0.65)) && c.inland > 0.3 && c.up > 0.75 ? 0.35 * (1 - smooth(1, 9, c.inland)) : 0;
    // the rainforest's edge: pandanus and strand scrub along the top of the beach under the leaning palms
    case 'pandanus': return land && (g === GROUND.meadow || (g === GROUND.beach && c.height > 0.55)) && c.inland > 0.2 && c.up > 0.6 ? 0.6 * (1 - smooth(3, 8, c.inland)) : 0;
    case 'mangrove': return c.height > -0.7 && c.height < 1.8 && c.inland < 6 && c.up > 0.75 ? 0.25 : 0;
    case 'heather': return land && c.up > 0.66 && (g === GROUND.meadow || g === GROUND.rock || g === GROUND.scree)
      ? 0.3 * (0.25 + 0.75 * (1 - c.grove)) * (0.6 + Math.max(0, -c.shelter)) : 0;
    case 'scrub': return land && c.up > 0.66 && (g === GROUND.meadow || g === GROUND.rock || g === GROUND.scree) ? 0.16 * (1 - 0.5 * c.grove) : 0;
    case 'grass': return land && g === GROUND.meadow ? 0.9 * (1 - 0.7 * c.grove) : 0;
    case 'duneGrass': return land && (g === GROUND.meadow || g === GROUND.beach) && c.inland < 7 && c.height > 0.8 ? 1.1 : 0;
    case 'reed': return land && (g === GROUND.mud || g === GROUND.meadow) && c.inland < 4 ? 0.35 : 0;
    case 'kelp': return c.floor === FLOOR.kelp && c.depth > 1 && c.depth < 10 ? 0.3 : 0;
    // no coral meshes: a veil is not refracted, so over the lagoons' refracted floor they stood at the surface as grass
    // tufts and violet blobs (S-021); the sea paints every reef's heads on its floor, under the water ('coral' stays the
    // reef regions' mark: the sea's clear water, the white sand)
    case 'coral': return 0;
  }
}

const T = (p: Pigment): THREE.Vector3 => transmittanceVec(PIGMENTS[p]);
/** An instance's foliage and blossom, from its region's pigments, varied by u and w ∈ [0, 1). */
function tones(kind: FloraKind, r: Region, u: number, w: number): [THREE.Vector3, THREE.Vector3] {
  const fol = T(r.pigments.foliage), to = (a: THREE.Vector3, p: Pigment, t: number): THREE.Vector3 => a.clone().lerp(T(p), t);
  switch (kind) {
    case 'pine': return [to(fol, 'indigo', 0.4 + 0.2 * u), fol];
    case 'jungle': return [to(fol, u < 0.5 ? 'verdigris' : 'ochre', 0.12 + 0.28 * w), fol];
    case 'floweringTree': return [to(fol, 'verdigris', 0.25 * u), to(T(w < 0.55 ? r.pigments.accent : 'ochre'), 'roseMadder', 0.12 * u)];
    case 'broadleaf': return [to(fol, 'ochre', 0.18 + 0.25 * w), fol]; // a light yellow-green dome (S-025 (6d): greener, never khaki)
    case 'nutmeg': return [to(fol, 'indigo', 0.22 + 0.18 * u), fol]; // dark glossy cones
    case 'cloudForest': return [to(fol, 'ultramarine', 0.18 + 0.15 * u), fol];
    case 'treeFern': return [to(fol, 'verdigris', 0.3 + 0.2 * u), fol];
    case 'palm': return [to(fol, 'verdigris', 0.2 + 0.25 * u), fol];
    case 'mangrove': return [to(fol, 'umber', 0.12 + 0.2 * u), fol];
    case 'heather': return [to(fol, 'umber', 0.3 + 0.2 * u), to(T('roseMadder'), 'ultramarine', 0.3 * w)];
    case 'scrub': return [to(T('umber'), 'ochre', 0.4 * u), T('ochre')];
    case 'grass': return [to(fol, 'ochre', 0.25 + 0.35 * u), fol];
    case 'duneGrass': return [to(T('ochre'), 'malachite', 0.25 * u), fol];
    case 'reed': return [to(T('ochre'), 'umber', 0.35 * u), fol];
    case 'pandanus': return [to(fol, u < 0.6 ? 'ochre' : 'verdigris', 0.15 + 0.25 * w), fol];
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
  const clad = REGIONS.map(cladOf), kinds = REGIONS.map((r) => [...r.flora, ...(r.flora.includes('grass') || r.flora.includes('mangrove') ? ['reed' as const] : []),
    ...(r.flora.includes('jungle') ? ['pandanus' as const, 'broadleaf' as const, 'nutmeg' as const] : [])]
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
        const cell: Cell = { ground: groundAt(ri, Math.max(h, 0.03), up, h < 3 ? shoreExposure(geo, dir, ri) : 0), height: h, up, inland: -geo.coast[c], shelter: ring / 8 - h,
          alt: Math.max(0, h) / peak[ri], grove: smooth(0.3, 0.7, grove), depth: -h, floor,
          mix: noise(dir.x * s * 2.3 + 17.1, dir.y * s * 2.3 - 5.3, dir.z * s * 2.3 + 9.7), clad: clad[ri] }; // which of the jungle's crowns masses here
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
            if (kind === 'palm' || kind === 'pandanus') Y.addScaledVector(X, (kind === 'palm' ? 0.12 : 0.05) + 0.2 * z); // palms lean out over the shore
            Y.normalize();
            X.addScaledVector(Y, -X.dot(Y)).normalize();
            if (kind !== 'palm') X.applyAxisAngle(Y, z * TAU);
            Z.crossVectors(X, Y);
            // S-025 (6b): each rainforest crown its own habit, some spreading wide and flat, some tall and narrow
            const habit = kind === 'jungle' || kind === 'floweringTree' || kind === 'broadleaf' ? hash(c, k, 70 + m) : -1;
            const wide = habit < 0 ? 1 : CANOPY * (0.84 + 0.36 * habit), tall = habit < 0 ? 1 : CANOPY * (1.2 - 0.12 * habit + 0.16 * (hash(c, k, 80 + m) - 0.5));
            X.multiplyScalar(size * wide);
            Z.multiplyScalar(size * wide);
            Y.multiplyScalar(kind === 'kelp' ? cell.depth : size * tall);
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
uniform float uHand; // 1: this level hands over to (or from) the other kit plant by plant
uniform float uFar;
uniform float uDome; // S-025 (6d): the kit's crown is dome-lit (its wood takes the plant's habit with its leaf)
in vec4 aPaint;
in float aTint;
in vec3 aPart;
in vec3 aFoliage;
in vec3 aBloom;
in vec2 aSeed;
in vec3 aLit;
out vec3 vWorld;
out vec3 vNormal;
out vec4 vPaint;
out vec3 vPart;
out vec3 vUp;
out float vFade;
out float vDepth;
out float vEdge;
out float vBlossom;
out vec3 vBloom;
out vec3 vSil;
out vec2 vLeaf;
out vec3 vCanopy;
void main() {
  mat4 model = modelMatrix * instanceMatrix;
  vec3 root = model[3].xyz, up = normalize(root);
  float H = length(model[1].xyz), t = uTime, s = aPart.x, seen = 1.0;
  vec3 wdir = cross(uWindAxis, up);
  wdir /= max(length(wdir), 1e-4);
  vec3 side = cross(up, wdir);
  // S-025 (6d): a dome-lit crown (one kit for the species) given each plant's own habit: its lobes drawn out or in by
  // bearing and its head raised or lowered, smoothly, so every crown's outline differs (limbs and lobes alike)
  float dome = aTint > 0.5 && aPaint.g < 0.4 ? 1.0 : 0.0;
  vec3 pos = position;
  if (uDome > 0.5) { // (the dome-lit kit's draw only: every other kit's bark and leaf untouched)
    float th = atan(pos.z, pos.x + 1e-5), sd = aSeed.x * 6.2832, k = smoothstep(0.25, 0.5, pos.y);
    float fr = 1.0 + k * (0.2 * sin(2.0 * th + sd) + 0.12 * sin(3.0 * th - 2.3 * sd) + 0.06 * sin(5.0 * th + 4.1 * sd));
    pos.xz *= fr;
    pos.y += k * (pos.y - 0.3) * (0.16 * sin(th + 1.7 * sd) + 0.1 * cos(2.0 * th - sd));
  }
  vec4 w = model * vec4(pos, 1.0);
  // a leaf mass carries its sphere's normal (its outline's), and is lit as a soft dome lifted toward the light
  // (through the instance's own scale: a crown spread wider than tall keeps its normals, S-025 (6b))
  vec3 s2 = vec3(dot(model[0].xyz, model[0].xyz), dot(model[1].xyz, model[1].xyz), dot(model[2].xyz, model[2].xyz));
  vSil = normalize(mat3(model) * (normal / s2));
  vNormal = aPart.y > 0.5 && aPart.y < 1.5 ? normalize(mat3(model) * (normalize(aLit + vec3(0.0, 0.3, 0.0)) / s2)) : vSil;
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
  vPaint = vec4(aTint > 0.5 ? aFoliage : aPaint.rgb, aPaint.w);
  vBlossom = aTint > 0.5 ? aTint - 1.0 : 0.0;
  vBloom = aBloom;
  float dist = distance(cameraPosition, root), o1 = min(uBand.w, max(aSeed.y * uCut.x, uCut.y)), o0 = min(uBand.z, o1 * 0.8);
  float fin = smoothstep(uBand.x, uBand.y, dist), fout = 1.0 - smoothstep(o0, o1, dist);
  if (uHand > 0.5) {
    // the hand-over between the near and far kits: each plant at its own distance across the band, dissolving quickly
    // (both levels the same plant's same distance, so the far fills exactly what the near leaves): at any moment only
    // the odd plant is between its kits, never a whole band of stippled crowns (S-022)
    float j = 0.1 + 0.8 * fract(aSeed.x * 7.13 + 0.37);
    if (uFar > 0.5) fin = smoothstep(-0.35, 0.35, dist - mix(uBand.x, uBand.y, j));
    else fout = (1.0 - smoothstep(-0.35, 0.35, dist - mix(uBand.z, uBand.w, j))) * (1.0 - smoothstep(0.8 * o1, o1, dist) * step(o1, uBand.w - 0.01));
  }
  vFade = fin * fout * seen;
  // a leaf mass's leaf (the instance's: broad, pinnate or palmate) and its clump's warmth (aPaint.r below 1: cool → warm)
  vLeaf = vec2(fract(aSeed.x * 3.71 + 0.13), aTint > 0.5 && aPaint.r < 0.99 ? aPaint.r : 0.5);
  vCanopy = vec3(aTint > 0.5 && aPaint.g < 0.75 ? 1.0 : 0.0, pos.y, dome); // a far canopy crown's mass, its height in the tree, lit as one crown
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
in float vBlossom;
in vec3 vBloom;
in vec3 vSil;
in vec2 vLeaf;
in vec3 vCanopy;
uniform float uFar;
uniform vec3 uOchre;
uniform vec3 uRose;
uniform float uSeed;
uniform vec3 uWater;
float fhash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.103, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fhash(i), fhash(i + vec3(1, 0, 0)), f.x), mix(fhash(i + vec3(0, 1, 0)), fhash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(fhash(i + vec3(0, 0, 1)), fhash(i + vec3(1, 0, 1)), f.x), mix(fhash(i + vec3(0, 1, 1)), fhash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// blossom as a watercolourist lays a tree in flower: the crown washed whole in its colour, mottled, thinning to the
// leaf where the crown turns from the eye and under it (the green showing through at its edges); into the wash, deeper
// clusters of bloom in a second layer (soft-edged, world-anchored, many sizes, a few ochre among the vermilion), and
// near the eye each truss's shaded side inked. A cluster melts into the depth it averages to before it shrinks to a
// pixel (S-020: never facets; S-022: a mass of colour across the harbour, never scattered flecks)
float blossomAt(vec3 p, float w, float rim, out float other, out float deep, out float ink) {
  other = 0.0; deep = 0.0; ink = 0.0;
  if (w > 0.99) return 1.0;
  // (the wash whole from afar; near the eye laid in masses on the paper with the leaf left between them, never the
  // two mixed to a brown, the gaps filling as they shrink)
  float gap = smoothstep(0.42, 0.58, 0.7 * vnoise(p * 1.6 + 5.3) + 0.3 * vnoise(p * 4.1 + 1.7));
  float b = smoothstep(0.1, 0.45, w) * (0.82 + 0.18 * vnoise(p * 1.1 + 5.3)) * (1.0 - 0.7 * smoothstep(0.55, 0.95, rim))
          * mix(gap, 1.0, smoothstep(0.03, 0.12, length(fwidth(p * 2.4))));
  // the largest dabs are the trusses; the smaller gather round them as florets breaking the truss's edge, few between
  float truss = 0.0;
  for (int o = 0; o < 3; o++) {
    vec3 c = p * (o == 0 ? 2.4 : o == 1 ? 5.0 : 11.0), cell = floor(c);
    vec3 j = vec3(fhash(cell + 3.1), fhash(cell + 5.7), fhash(cell + 8.3)) - 0.5, f = fract(c) - 0.5 - 0.35 * j;
    float r = length(f), rr = (o == 0 ? 0.28 : 0.24) + 0.2 * fhash(cell + 11.9), px = length(fwidth(c));
    float on = step(fhash(cell + 13.3), w * (o == 0 ? 0.8 : (o == 1 ? 0.95 : 0.85) * (0.25 + 0.75 * truss)));
    float d = smoothstep(rr + 0.5 * px + 0.06, rr - 0.08, r) * on, far = smoothstep(0.7, 1.4, px), k = o == 0 ? 0.9 : o == 1 ? 0.7 : 0.5;
    if (o == 0) truss = smoothstep(rr + 0.3, rr, r) * on;
    deep = max(deep, k * mix(d, 0.3 * w, far));
    b = max(b, d * (1.0 - far));
    other = max(other, d * (1.0 - far) * step(0.72, fhash(cell + 17.7)));
    // (each truss and floret inked on its shaded side, broken where the cell's hash lifts the pen; a dot at a floret's heart)
    float pen = smoothstep(0.0, -0.12, f.y) * step(0.2, fhash(cell + 21.1)) * (1.0 - smoothstep(0.55, 1.4, abs(r - rr) / max(px, 1e-4)))
              + (o == 0 ? 0.0 : smoothstep(0.055 + px, 0.03 + 0.5 * px, r) * 0.8);
    ink = max(ink, on * pen * (1.0 - smoothstep(0.06, 0.16, px)));
  }
  return max(b, 0.1 * w);
}
// a leaf in its own frame (x from its stalk at 0 to its tip at 1, y across), as an engraver draws it: 0 a broad leaf,
// a pointed oval outlined on its shaded side with its midrib; 1 pinnate, a rib with leaflets swept to the tip in pairs;
// 2 palmate, five fingers fanned from the stalk. Its body (for the silhouette) and its ink, px its pixel in leaf units
float leafBody(vec2 f) {
  float x = clamp(f.x, 0.0, 1.0);
  return step(0.0, f.x) * step(f.x, 1.0) * smoothstep(0.0, 0.04, 0.22 * sin(3.1416 * x) * (1.0 - 0.3 * x) - abs(f.y));
}
float leafInk(vec2 f, float kind, float px) {
  float lw = 0.045 + 0.7 * px, x = clamp(f.x, 0.0, 1.0), ay = abs(f.y), on = step(0.0, f.x) * step(f.x, 1.0);
  float w = 0.22 * sin(3.1416 * x) * (1.0 - 0.3 * x);
  if (kind < 0.5) return on * max(max(smoothstep(lw, 0.0, abs(f.y + w)), 0.45 * smoothstep(lw, 0.0, abs(f.y - w))), 0.8 * smoothstep(0.7 * lw, 0.0, ay) * step(f.x, 0.8));
  if (kind < 1.5) {
    float s = fract(f.x * 5.0 - ay * 3.2), d = min(s, 1.0 - s) / 5.9;
    return on * max(smoothstep(0.7 * lw, 0.0, ay), smoothstep(lw, 0.0, d) * step(ay, 0.9 * w + 0.03) * step(0.12, f.x));
  }
  float th = atan(f.y, max(f.x, 1e-3)), r = length(f), k = clamp(floor(th / 0.48 + 0.5), -2.0, 2.0);
  return smoothstep(lw, 0.0, abs(th - k * 0.48) * r) * step(r, 0.95 - 0.12 * abs(k)) * step(0.05, r) * step(-0.05, f.x);
}
void main() {
  vec3 v = normalize(cameraPosition - vWorld), n = normalize(vNormal);
  if (vPart.y > 1.5 && dot(n, v) < 0.0) n = -n; // a thin sheet is lit from the side it is seen
  // S-025 (6d): a dome-lit crown's clumps show only their faces toward the eye: where its outline or a gap bites a clump
  // the eye sees through to the clumps, limbs and understory behind, never the clump's inside hatched as shade
  float cd = vCanopy.z * step(0.5, vPart.y) * step(vPart.y, 1.5);
  if (cd > 0.5 && !gl_FrontFacing) discard;
  Paper q = paperAt(vWorld, n, 1.0);
#ifdef VEIL
  vec3 col = glaze(parchment(q), mix(vPaint.rgb, vBloom, clamp(vBlossom, 0.0, 1.0)), vPaint.w, 0.35, q);
  col = mix(col, hatchInk(0.15), 0.6 * smoothstep(0.5, 0.9, vEdge));
  float d = max(vDepth, 0.0);
  col = glaze(col, uWater, 0.75 * (1.0 - exp(-d * 0.6)), 0.3, q); // tinted by the water over it, never garnish (WP17)
  writeVeil(candle(col, vWorld), vFade * (0.3 + 0.6 * exp(-d * 0.5)));
#else
  // levels and thinning dissolve by a stipple anchored to the world: the far level fills what the near one leaves
  float h = fhash(floor(vWorld * 9.0));
  if (uFar < 0.5 ? h >= vFade : h < 1.0 - vFade) discard;
  float scal = 0.0, clu = 0.0;
  if (vPart.y > 0.5 && vPart.y < 1.5) {
    // a leaf mass's outline breaks into rounded clumps of leaf where it turns from the eye (never a polygon's edge),
    // the clumps world-anchored and gone before they shrink below a few pixels
    // (its sphere's normal's turn from the eye traces a rounded outline inside the facets', bitten by the clumps)
    // S-022: toward the rim only leaves stand out, each a pointed leaf turned outward from its clump (drawn in the
    // plane facing the eye), so the edge breaks into leaf tips, never rounded cushions or square chips
    vec3 lc = vWorld * 3.4, sil = normalize(vSil);
    float nv = dot(sil, v), rim = sqrt(max(0.0, 1.0 - nv * nv)), nz = 0.6 * vnoise(lc) + 0.4 * vnoise(lc * 2.7 + 7.0), lpx = length(fwidth(lc));
    vec3 e1 = normalize(cross(v, vUp)), e2 = cross(e1, v);
    vec2 sp0 = vec2(dot(vWorld, e1), dot(vWorld, e2)) * 4.2, sa = vec2(dot(sil, e1), dot(sil, e2));
    sa = length(sa) > 1e-3 ? normalize(sa) : vec2(0.0, 1.0);
    // S-025: further off, the leaves gather into sprays drawn the same way a size up (an octave per halving of the
    // leaf's size on screen), so the outline stays lacy across the harbour, never a cushion's rounded rim
    float oct = max(0.0, log2(length(fwidth(sp0)) / 0.09)), ok = floor(oct), lf = 0.0;
    for (int o = 0; o < 2; o++) {
      float kk = ok + float(o), sz = exp2(-kk);
      vec2 sp = sp0 * sz + 17.0 * kk, sc = floor(sp);
      vec2 sb = rot2(0.9 * (fhash(vec3(sc, 31.0)) - 0.5)) * sa;
      vec2 sf = fract(sp) - 0.5 - 0.3 * (vec2(fhash(vec3(sc, 32.0)), fhash(vec3(sc, 33.0))) - 0.5);
      float l = leafBody(vec2(dot(sf, sb) + 0.45, dot(sf, vec2(-sb.y, sb.x))) / 0.9) * step(0.25, fhash(vec3(sc, 34.0)));
      lf += l * (o == 0 ? 1.0 - smoothstep(0.5, 1.0, oct - ok) : smoothstep(0.5, 1.0, oct - ok));
    }
    float fz = smoothstep(0.35, 0.9, lpx); // (the clump noise gone before it shrinks to speckle; the sprays stay)
    // S-025 (6b): and across a canopy crown at any distance the engraver's foliage, small scalloped loops a size up
    // from the sprays (an octave per halving on screen, so never speckle), laid in the shade below
    for (int o = 0; o < 2; o++) {
      float kk = ok + float(o), sz = exp2(-kk);
      vec2 sp = sp0 * sz * 0.85 + 5.0 * kk + 3.1, sc = floor(sp), f = fract(sp) - 0.5 - 0.3 * (vec2(fhash(vec3(sc, 41.0)), fhash(vec3(sc, 42.0))) - 0.5);
      float r = length(f), a = smoothstep(0.34, 0.29, r) * smoothstep(0.19, 0.24, r) * smoothstep(-0.14, 0.04, f.y) * step(0.22, fhash(vec3(sc, 43.0)));
      float wo = o == 0 ? 1.0 - smoothstep(0.5, 1.0, oct - ok) : smoothstep(0.5, 1.0, oct - ok);
      scal += a * wo;
      // S-025 (6d): on a dome-lit crown each loop rounds a leaf cluster: lit on its sunward side, sunk in shade below
      vec2 sunS = vec2(dot(uSun, e1), dot(uSun, e2));
      float body = smoothstep(0.36, 0.22, r);
      clu += wo * (body * (0.6 * dot(f, sunS) / 0.3 - 0.45 * smoothstep(0.05, -0.25, f.y)) - 0.35 * (1.0 - body));
    }
    if (rim > 0.5 + 0.28 * mix(nz, 0.5, fz) + 0.26 * lf + 0.08 * fz) discard;
    // S-025 (6d): and a dome-lit crown opens in gaps between its sprays, fewest on its sunlit head, through to the dark
    // within (gone before they shrink below a few pixels: never a sieve)
    if (cd > 0.5) {
      vec3 gc = vWorld * 1.5 + 23.0;
      float gpx = length(fwidth(gc)), gn = 0.65 * vnoise(gc) + 0.35 * vnoise(gc * 2.3 + 5.0);
      if (gn - 0.55 * smoothstep(0.18, 0.4, gpx) - 0.12 * smoothstep(0.0, 0.8, dot(normalize(vNormal), vUp)) > 0.57 - 0.08 * lf) discard;
    }
  }
  // (a crown in flower thins to its leaf where it turns from the eye: its outline's turn)
  float nvB = dot(normalize(vSil), v), other = 0.0, deep = 0.0, bink = 0.0;
  float bloom = vBlossom > 0.01 ? blossomAt(vWorld, vBlossom, sqrt(max(0.0, 1.0 - nvB * nvB)), other, deep, bink) : 0.0;
  vec3 bpig = mix(vBloom, uOchre, other * 0.8), leafPig = vPaint.rgb;
  if (vPart.y > 0.5 && vPart.y < 1.5) { // S-022: several greens, each clump warmer or cooler, mottled across the crown
    float wc = 2.0 * vLeaf.y - 1.0 + 1.1 * (vnoise(vWorld * 0.8 + 3.0) - 0.5);
    leafPig = mix(leafPig, wc > 0.0 ? uOchre : uWater, min(0.42, 0.34 * abs(wc)));
  }
  vec3 pig = mix(leafPig, bpig, bloom);
  vec3 side = normalize(cross(vUp, abs(vUp.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec2 hc = vec2(dot(vWorld, vUp), dot(vWorld, side) + 0.7 * dot(vWorld, cross(vUp, side)));
  vec2 hdx = dFdx(hc), hdy = dFdy(hc);
  float ndl = dot(n, uSun), tone = lightTone(ndl, abs(dot(n, v))) * mix(0.45, 1.0, vPart.z);
  // S-022: a leaf mass drawn as leaves, the instance's own (broad, pinnate or palmate), each hanging outward and down
  // from its clump's crown, each its own wash, inked most heavily on the clump's shaded underside (cross-hatched there);
  // gone before they shrink to noise
  float under = 0.0, lInk = 0.0, lBody = 0.0, lHue = 0.5, lpxL = 1.0, density = vPaint.w;
  if (vPart.y > 0.5 && vPart.y < 1.5) {
    vec3 an = abs(n), c = vWorld * 4.6, g = n - 0.9 * vUp;
    under = smoothstep(0.5, -0.25, dot(n, vUp)) * (1.0 - bloom);
    vec2 lp = an.x > an.y && an.x > an.z ? c.yz : an.y > an.z ? c.xz : c.xy, ga = an.x > an.y && an.x > an.z ? g.yz : an.y > an.z ? g.xz : g.xy;
    ga = length(ga) > 1e-3 ? normalize(ga) : vec2(0.0, -1.0);
    vec2 cell = floor(lp), o = vec2(fhash(vec3(cell, 1.0)), fhash(vec3(cell, 2.0))) - 0.5, f = fract(lp) - 0.5 - 0.3 * o;
    float g3 = fhash(vec3(cell, 3.0)), sz = 0.85 * (0.75 + 0.45 * fhash(vec3(cell, 4.0)));
    lpxL = length(fwidth(lp));
    vec2 ax = rot2(1.1 * (g3 - 0.5)) * ga;
    vec2 lf = vec2(dot(f, ax) + 0.42 * sz, dot(f, vec2(-ax.y, ax.x))) / sz;
    float kind = floor(vLeaf.x * 3.0), keep = step(0.18, g3) * (1.0 - smoothstep(0.2, 0.55, lpxL));
    lInk = leafInk(lf, kind, lpxL / sz) * keep;
    lBody = (kind > 1.5 ? smoothstep(0.95, 0.6, length(lf)) * step(-0.05, lf.x) : leafBody(lf * vec2(1.0, 0.75))) * keep;
    lHue = fhash(vec3(cell, 5.0));
    density *= 1.0 + lBody * (0.4 * lHue - 0.12) * (1.0 - bloom);
    pig = mix(pig, lHue > 0.5 ? uOchre : uWater, 0.12 * lBody * abs(2.0 * lHue - 1.0) * (1.0 - bloom));
  }
  // S-025: the outline selective, as an engraver draws a crown from life: the pen on its shaded side and along its top
  // against the sky, broken where the light falls on it, the lit side left to the wash (no ring of pooled pigment there)
  // (a dome-lit crown's sides are the crown's: its pen and its paling by which way the whole crown turns, S-025 (6d))
  vec3 silN = normalize(mix(normalize(vSil), n, cd));
  float isMass = vPart.y > 0.5 && vPart.y < 1.5 ? 1.0 : 0.0, litSil = dot(silN, uSun);
  float penLit = 0.06 + 0.3 * step(0.62, vnoise(vWorld * 1.3 + 2.0));
  float pen = mix(1.0, max(mix(penLit, 1.0, smoothstep(0.42, -0.08, litSil)), 0.75 * smoothstep(0.5, 0.85, dot(silN, vUp))), isMass);
  // S-025 (6b): a rainforest crown drawn as a canopy from life: the pen only under its shaded side, in broken
  // strokes (never a rim round every lobe), its lit side paling into the wash, its lower lobes sunk in the canopy's
  // hollows, so crown stands against the shade of the next, not cushion against cushion
  float cf = isMass * vCanopy.x, cy = vCanopy.y, rimC = sqrt(max(0.0, 1.0 - nvB * nvB));
  float hollow = cf * smoothstep(0.74, 0.4, cy), litRim = cf * smoothstep(0.05, 0.45, litSil) * smoothstep(0.5, 0.95, rimC);
  // (against a low sun it stays a dark silhouette, inked whole)
  float back = smoothstep(0.3, 0.8, -dot(v, uSun)) * uLow;
  pen = mix(pen, smoothstep(0.12, -0.3, litSil) * (0.3 + 0.7 * smoothstep(0.35, -0.25, dot(silN, vUp))) * step(0.38, vnoise(vWorld * 2.2 + 5.0)), cf * (1.0 - back));
  density *= 1.0 - 0.5 * litRim * (1.0 - back);
  // S-025 (6d): a dome-lit crown in one transparent wash, the paper glowing through its sunlit head
  density *= 1.0 - cd * (0.2 * smoothstep(0.6, 0.15, tone) - 0.3 * smoothstep(0.45, 0.9, tone)) * (1.0 - back); // (tone: 0 lit … 1 shade)
  // S-025 (3): a crown between the eye and a low sun is seen against the light: a darker, cooler silhouette whose
  // blossom no longer holds its colour into the shade, rimmed with light where its edge turns up toward the sun
  // S-025 (6d): a dome-lit crown's wash cools to a deeper green in its shade (never greyed by the shade's violet over the
  // ochre), and is modelled cluster by cluster: lighter on each cluster's sunward side, deeper between and under them
  pig = mix(pig, uWater, cd * 0.15 * smoothstep(0.3, 0.8, tone));
  density *= 1.0 - cd * 0.32 * clamp(clu, -1.0, 1.0) * smoothstep(0.2, 0.45, lpxL);
  vec3 col = glaze(parchment(q), pig, density, washPool(n, v, q) * mix(1.0, 0.25 + 0.75 * pen, isMass), q);
  col = glaze(col, bpig, (0.3 * bloom + 0.6 * deep) * vPaint.w * (1.0 - 0.7 * back), 0.3, q); // the bloom laid twice, deepest in its clusters
  // a crown in flower holds its colour further round into the shade, and there deepens to a cooler red (rose madder
  // over the vermilion, a warm madder over the ochre), never browning under the cool glaze
  col = sunGlaze(shadeGlaze(col, tone - 0.15 * bloom * (1.0 - back) - 0.22 * cd, q), ndl, tone);
  col = glaze(col, uRose, 0.45 * bloom * smoothstep(0.4, 0.75, tone) * (1.0 - back), 0.2, q);
  // (a leaf mass's shaded underside is not ruled across like a shelf, S-022: it is a deeper glaze its leaves are inked into)
  // S-025: and a crown's lower, inner clumps sit in the canopy's shade: the hollows between crowns go dark and cool
  // (S-025 (6d): a dome-lit crown's shade a deeper glaze of its own green, never the ink's grey over its wash)
  vec3 shadeInk = mix(hatchInk(0.0), mix(pig, uWater, 0.45), 0.75 * cd);
  col = glaze(col, shadeInk, (0.28 + 0.2 * uFar) * under * (1.0 - 0.5 * tone) + isMass * uFar * 0.4 * smoothstep(0.75, 0.3, vPart.z), 0.0, q);
  col = wash(glaze(col, shadeInk, 0.55 * hollow * (1.0 - 0.4 * tone), 0.0, q), uShade, (0.35 - 0.2 * cd) * hollow);
  col = mix(col, hatchInk(tone), hatching(hc, hdx, hdy, tone, uSeed) * (1.0 - 0.85 * under) * (vPart.y > 0.5 && vPart.y < 1.5 ? 0.6 - 0.35 * cf * (1.0 - back) : 1.0)); // (a canopy's shade in its loops, not ruled)
  col = mix(col, hatchInk(0.6), 0.75 * bink); // near the eye each truss's shaded side inked
  // S-025 (6d): over a dome-lit crown's lit head the same loops laid in its own wash, a second glaze, never the pen:
  // the leaf's sprays modelled in colour where the light falls
  col = glaze(col, pig, 0.45 * scal * cd * smoothstep(0.2, 0.45, lpxL) * smoothstep(0.7, 0.2, tone) * vPaint.w, 0.2, q);
  col = mix(col, hatchInk(tone), scal * cf * smoothstep(0.2, 0.45, lpxL) * smoothstep(0.95, 0.45, tone) * 0.9 * (1.0 - 0.4 * bloom));
  if (vPart.y > 0.5 && vPart.y < 1.5) {
    float strength = clamp(0.9 - 0.6 * tone + 0.45 * under, 0.3, 0.95) * (1.0 - 0.4 * bloom);
    col = mix(col, hatchInk(tone), lInk * strength);
  } else if (vPart.y > 0.5) {
    // crescent leaf marks scalloping the sheets, densest in shade, gone before they shrink to noise
    vec3 an = abs(n), c = vWorld * 5.5;
    vec2 lp = an.x > an.y && an.x > an.z ? c.yz : an.y > an.z ? c.xz : c.xy;
    // each cell's mark its own: turned, sized, and some cells left bare, so no one glyph repeats down a crown
    vec2 cell = floor(lp), o = vec2(fhash(vec3(cell, 1.0)), fhash(vec3(cell, 2.0))) - 0.5, f = fract(lp) - 0.5 - 0.35 * o;
    float g3 = fhash(vec3(cell, 3.0)), turn = 1.6 * (g3 - 0.5), sz = 0.7 + 0.5 * fhash(vec3(cell, 4.0));
    f = mat2(cos(turn), sin(turn), -sin(turn), cos(turn)) * f / sz;
    float r = length(f), px = length(fwidth(lp));
    float arc = smoothstep(0.38, 0.31, r) * smoothstep(0.2, 0.27, r) * smoothstep(0.05, -0.1 + 0.25 * o.x, f.y) * step(0.28, g3);
    col = mix(col, hatchInk(tone), arc * clamp(0.9 - 0.7 * tone, 0.15, 0.9) * (1.0 - smoothstep(0.18, 0.5, px)) * (1.0 - 0.4 * bloom));
  }
  if (back > 0.0) {
    float rimB = sqrt(max(0.0, 1.0 - nvB * nvB)), rimL = smoothstep(0.5, 0.9, rimB) * (0.2 + 0.8 * smoothstep(-0.2, 0.5, dot(silN, vUp)));
    // (S-025 (6b): the light caught in broken touches, along a canopy's crowns' heads, never a gold rim round every
    // lobe: stacked saucers)
    rimL *= mix(1.0, smoothstep(0.62, 0.9, cy), cf) * mix(1.0, step(0.42, vnoise(vWorld * 2.0 + 9.0)), isMass);
    col = wash(col, uShade, 0.75 * back);
    col = mix(col, col * vec3(0.62, 0.64, 0.74), 0.45 * back);
    col = mix(col, wash(uPaper, uSunTint, 1.3), 0.85 * back * rimL * isMass);
  }
  if (uNight > 0.0) {
    float lit = smoothstep(0.3, 0.95, ndl) * uNight;
    col = mix(col, uSilver, 0.65 * hatching(rot2(0.6) * hc, rot2(0.6) * hdx, rot2(0.6) * hdy, lit * 0.26, uSeed + 11.0));
  }
  writeInk(candle(col, vWorld), n, pen * (1.0 - 0.5 * back * isMass));
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
  /** Hand over between the near and far kits plant by plant (the near level of a species with a far one, and the far). */
  hand?: boolean;
  veil?: boolean;
  id?: number;
  /** S-025 (6d): the kit's crown is dome-lit (Kit.dome: its geometry's userData.dome). */
  dome?: boolean;
}

/** The flora's material: kits drawn with it bend in the swell's wind (instanced; per-instance aFoliage, aBloom, aSeed). */
export function floraMaterial(style: Style, swell: Swell, o: FloraMaterialOptions): THREE.ShaderMaterial {
  return inkMaterial(style, {
    vertexShader: VERT, fragmentShader: FRAG, defines: o.veil ? { VEIL: true } : {}, id: o.id, veil: o.veil, side: THREE.DoubleSide,
    uniforms: { ...swell.uniforms, uBand: { value: o.band }, uCut: { value: new THREE.Vector2(1, 0) }, uSway: { value: o.sway }, uFar: { value: o.far ? 1 : 0 }, uDome: { value: o.dome ? 1 : 0 }, uHand: { value: o.hand ? 1 : 0 },
      uSeed: { value: 3.7 }, uWater: { value: T('verdigris') }, uOchre: { value: T('ochre') }, uRose: { value: T('roseMadder') } },
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
      const geometry = kitGeometry(kind, lod);
      const material = floraMaterial(style, swell, { band, sway: sp.sway, far: lod === 1, hand: !!sp.far, veil: sp.veil, id, dome: !!geometry.userData.dome });
      id ??= material.uniforms.uInkId.value as number;
      const d = new Draw(geometry, material, Math.min(totals[k], lod ? CAP.far : CAP.near));
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
