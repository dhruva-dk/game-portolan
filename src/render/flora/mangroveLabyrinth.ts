// The Mangrove Labyrinth's plants: red mangroves standing in the water on cages of arching prop roots, and the
// canopy mangrove, a giant whose limbs spread over the channels at more than 21 m so ships sail beneath its roof.
// Both are hung with grey beards of moss. Each stands with its origin on the mud: plant it where the ground is
// below or near the sea, and the water covers its root feet; the bark darkens and stains at the tide line.
import * as THREE from 'three';
import {
  Geo, V, arc, assemble, atlas, barkMaterial, beard, bendAt, clump, detail, leafMaterial, many, range, rng, taper,
  twigs, wander, TAU, type Atlas, type Lod, type Plant,
} from './kitD.ts';

/** Nothing of the canopy mangrove hangs lower than this over the water (an 18 m mast clears it). */
export const CANOPY_CLEARANCE = 18.5;

// ---------------------------------------------------------------- the atlas

const C = { leaf: 0, leafFar: 1, beard: 2, canopyUnder: 3 } as const;

let mangAtlas: Atlas | null = null;
const MANG = () => mangAtlas ??= atlas('mang', 2, 512, [
  // rosettes of thick, glossy leaves at the twig tips, with seedlings hanging like green pencils
  (p) => {
    const { g, r } = p;
    const pts = twigs(p, 3, '#5a4632', 2.4, 1.3, 0.8);
    for (const [x, y, a, tip] of pts) {
      if (!tip) { if (r() < 0.4) p.leaf('long', Math.floor(r() * 6), x, y, 30, a + (r() < 0.5 ? -1 : 1) * 0.9); continue; }
      for (let k = 0; k < 6; k++) p.leaf('long', Math.floor(r() * 6), x, y, 34 + r() * 12, a + (k / 5 - 0.5) * 2.6);
      if (r() < 0.3) {
        g.strokeStyle = '#4f5a26'; g.lineWidth = 3.2; g.lineCap = 'round';
        const l = 34 + r() * 24;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 3, y + l * 0.5, x + 1, y + l); g.stroke();
        g.strokeStyle = '#3a2a1a'; g.beginPath(); g.moveTo(x + 1, y + l * 0.85); g.lineTo(x + 1, y + l); g.stroke();
      }
    }
    p.tone({ sat: 0.85, mul: [0.8, 0.86, 0.5] });
  },
  (p) => {
    const { r, s } = p;
    for (let i = 0; i < 160; i++) {
      const a = r() * TAU, d = Math.sqrt(r());
      p.leaf('long', Math.floor(r() * 6), s / 2 + Math.cos(a) * d * s * 0.42, s * 0.56 + Math.sin(a) * d * s * 0.36, 36 + r() * 16, r() * TAU);
    }
    p.tone({ sat: 0.8, mul: [0.76, 0.84, 0.48] });
  },
  // grey beards of moss
  (p) => beard(p, 120, 88, 14, 60),
  // the canopy seen from below: leaves edge-on and backlit, gaps of sky
  (p) => {
    const { r, s } = p;
    for (let i = 0; i < 110; i++) {
      const a = r() * TAU, d = Math.sqrt(r());
      p.leaf('long', Math.floor(r() * 6), s / 2 + Math.cos(a) * d * s * 0.45, s / 2 + Math.sin(a) * d * s * 0.45, 32 + r() * 16, r() * TAU);
    }
    p.tone({ sat: 0.9, mul: [0.85, 0.95, 0.5] });
  },
]);

const bark = () => barkMaterial('mang-bark', { map: 'bark_mangrove_d.jpg', normal: 'bark_mangrove_n.jpg', tint: 0xa89a8c, roughness: 0.82, normalScale: 1.2, tide: true, aspect: 0.5 });
const leaves = () => leafMaterial('mang-leaves', { atlas: MANG(), roughness: 0.42, translucency: 0.45 });

/** A prop root: out from `from`, arching up a little, then down into the mud at `reach` from the axis. */
function propRoot(from: THREE.Vector3, out: THREE.Vector3, reach: number, hump: number, n: number): THREE.Vector3[] {
  const end = out.clone().multiplyScalar(reach).add(V(0, -0.4, 0));
  const ctrl = from.clone().lerp(end, 0.45).add(V(0, hump, 0)).addScaledVector(out, reach * 0.12);
  return arc(from, ctrl, end, n);
}

// ---------------------------------------------------------------- red mangrove

function redMangrove(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed), d = detail(lod), A = MANG();
  const H = range(r, 4.5, 8.5), knee = range(r, 1.5, 2.6), R = H * range(r, 0.38, 0.5);
  const wd = new Geo(), lv = new Geo();
  const bend = bendAt(0.05 * H, H);
  const still = (): readonly [number, number, number] => [0, 0, 0];
  const lean = V((r() - 0.5) * 0.4, 1, (r() - 0.5) * 0.4);
  const trunk = wander(r, V(0, knee * 0.55, 0), lean, H * 0.45, Math.max(3, Math.round(6 * d.seg)), 0.35);
  const r0 = 0.1 + H * 0.014;
  wd.tube(trunk, taper(trunk.length, r0, r0 * 0.75), { sides: d.sides, texM: 1, wind: (p) => [bend(p), 0, 0] });
  // the root cage: roots leave the trunk at different heights and arch down into the water all round
  const roots = lod === 2 ? 6 : lod === 1 ? 10 : 13 + Math.floor(r() * 6);
  const segs = Math.max(3, Math.round(9 * d.seg));
  for (let k = 0; k < roots; k++) {
    const a = (k / roots) * TAU + r() * 0.5, out = V(Math.cos(a), 0, Math.sin(a));
    const t = Math.min(trunk.length - 2, Math.floor(r() * 3));
    const from = trunk[t].clone().add(V(0, (r() - 0.3) * 0.4, 0)).addScaledVector(out, r0 * 0.7);
    const reach = range(r, 1.3, 3.0) * (0.6 + H / 14);
    const path = propRoot(from, out, reach, range(r, 0.2, 0.9), segs);
    wd.tube(path, taper(path.length, r0 * 0.42, r0 * 0.3), { sides: Math.max(3, d.sides - 2), texM: 1, wind: still });
    if (d.fine && r() < 0.45) {
      // a root that forks again before it reaches the water
      const mid = path[Math.floor(path.length * 0.45)];
      const b = a + (r() < 0.5 ? -1 : 1) * range(r, 0.3, 0.7), out2 = V(Math.cos(b), 0, Math.sin(b));
      const fork = propRoot(mid, out2, reach * range(r, 1.05, 1.4) - 0.2, range(r, 0.1, 0.4), 6);
      wd.tube(fork, taper(fork.length, r0 * 0.28, r0 * 0.22), { sides: 4, texM: 1, wind: still });
    }
  }
  // limbs, and roots that drop straight from them into the water
  const ends: THREE.Vector3[] = [], hangs: THREE.Vector3[] = [];
  const crown = trunk[trunk.length - 1].clone().add(V(0, R * 0.4, 0));
  const limbs = lod === 2 ? 3 : 3 + Math.floor(r() * 3);
  for (let k = 0; k < limbs; k++) {
    const a = (k / limbs) * TAU + r() * 0.8;
    const from = trunk[Math.max(1, trunk.length - 1 - Math.floor(r() * 3))];
    const limb = wander(r, from, V(Math.cos(a), range(r, 0.4, 0.9), Math.sin(a)), H * range(r, 0.32, 0.45), Math.max(2, Math.round(5 * d.seg)), 0.5);
    wd.tube(limb, taper(limb.length, r0 * 0.55, r0 * 0.18), { sides: Math.max(3, d.sides - 2), texM: 1, wind: (p) => [bend(p), 0, 0] });
    ends.push(limb[limb.length - 1]);
    hangs.push(limb[Math.floor(limb.length / 2)]);
    if (d.mid) {
      const b = a + (r() - 0.5) * 1.8;
      const br = wander(r, limb[limb.length - 2], V(Math.cos(b), range(r, 0.3, 0.9), Math.sin(b)), H * 0.2, 3, 0.6);
      if (d.fine) wd.tube(br, taper(br.length, r0 * 0.15, r0 * 0.06), { sides: 3, texM: 1, wind: (p) => [bend(p), 0.1, 0] });
      ends.push(br[br.length - 1]);
    }
    if (d.mid && r() < 0.6) {
      const p0 = limb[1].clone();
      const drop = [p0, ...Array.from({ length: 4 }, (_, i) => V(p0.x + (r() - 0.5) * 0.15, p0.y - (p0.y + 0.4) * ((i + 1) / 4), p0.z + (r() - 0.5) * 0.15))];
      wd.tube(drop, taper(drop.length, 0.035, 0.028), { sides: 3, texM: 1, wind: (p) => [bend(p) * 0.3, 0, 0] });
    }
  }
  // the crown: dense and rounded, olive green
  for (const e of ends) {
    const s = R * range(r, 0.45, 0.6);
    clump(lv, r, e.clone().add(V(0, s * 0.15, 0)), [s, s * 0.6, s], many(lod === 2 ? 4 : 16, d), 0.9 * d.cardSize,
      () => A.uv(lod === 0 ? C.leaf : C.leafFar), { crown, bend, flutter: 0.4 });
  }
  // grey moss in the lower limbs
  if (d.mid) for (const h of hangs) {
    if (r() < 0.4) continue;
    const len = range(r, 0.6, 1.5), a = r() * Math.PI;
    for (let k = 0; k < (d.fine ? 2 : 1); k++) {
      lv.card(h, V(Math.cos(a + k * 1.57), 0, Math.sin(a + k * 1.57)), V(0, 1, 0), len * 0.5, len, A.uv(C.beard), { anchor: 'top', wind: [bend(h), 0.5, r()], tip: 0.3 });
    }
  }
  return assemble('redMangrove', lod, [[wd, bark()], [lv, leaves()]]);
}

// ---------------------------------------------------------------- canopy mangrove

function canopyMangrove(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed), d = detail(lod), A = MANG();
  const floor = 21.5, span = range(r, 14, 19), knee = range(r, 4, 6);
  const wd = new Geo(), lv = new Geo();
  const bend = bendAt(0.35, 26);
  const still = (): readonly [number, number, number] => [0, 0, 0];
  const segs = Math.max(3, Math.round(10 * d.seg));
  // two to four stems rise from the root cage, leaning apart
  const stems = 2 + Math.floor(r() * 3);
  const tops: THREE.Vector3[] = [];
  for (let k = 0; k < stems; k++) {
    const a = (k / stems) * TAU + r() * 0.8, out = V(Math.cos(a), 0, Math.sin(a));
    const base = out.clone().multiplyScalar(0.5).add(V(0, knee * 0.6, 0));
    const top = out.clone().multiplyScalar(range(r, 1.5, 3)).add(V(0, floor - range(r, 1, 2.5), 0));
    const stem = arc(base, base.clone().lerp(top, 0.5).addScaledVector(out, -0.6), top, segs);
    wd.tube(stem, taper(stem.length, 0.5, 0.36), { sides: d.sides + 1, texM: 1.2, wind: (p) => [bend(p), 0, 0], gnarl: d.fine ? 0.12 : 0 });
    tops.push(top);
    // each stem stands on its own spray of prop roots
    const roots = lod === 2 ? 4 : lod === 1 ? 7 : 9 + Math.floor(r() * 4);
    for (let j = 0; j < roots; j++) {
      const b = a + ((j / roots) - 0.5) * 3.4 + (r() - 0.5) * 0.3, o2 = V(Math.cos(b), 0, Math.sin(b));
      const t = range(r, 0.05, 0.3);
      const from = stem[Math.floor(t * segs)].clone().addScaledVector(o2, 0.3);
      const reach = range(r, 4, 8);
      const path = propRoot(from, o2, reach + base.length(), range(r, 0.5, 1.8), segs);
      wd.tube(path, taper(path.length, 0.17, 0.12), { sides: Math.max(3, d.sides - 2), texM: 1.2, wind: still });
      if (d.fine && r() < 0.4) {
        const mid = path[Math.floor(path.length * 0.4)];
        const c = b + (r() < 0.5 ? -1 : 1) * range(r, 0.3, 0.6);
        const fork = propRoot(mid, V(Math.cos(c), 0, Math.sin(c)), reach * 1.15, 0.4, 6);
        wd.tube(fork, taper(fork.length, 0.11, 0.09), { sides: 4, texM: 1.2, wind: still });
      }
    }
  }
  // great limbs reach out level over the water, then a crown of leaf clumps closes over them
  const centre = V(0, floor + 2.5, 0);
  const ends: THREE.Vector3[] = [], hangs: THREE.Vector3[] = [], drops: THREE.Vector3[] = [];
  const limbs = lod === 2 ? 6 : 7 + Math.floor(r() * 3);
  for (let k = 0; k < limbs; k++) {
    const a = (k / limbs) * TAU + r() * 0.5, out = V(Math.cos(a), 0, Math.sin(a));
    const from = tops[k % stems];
    const reach = span * range(r, 0.7, 1.05);
    const end = out.clone().multiplyScalar(reach).add(V(0, floor + range(r, 0.6, 1.8), 0));
    const limb = arc(from, from.clone().lerp(end, 0.5).add(V(0, 2.6, 0)), end, segs);
    wd.tube(limb, taper(limb.length, 0.3, 0.09), { sides: Math.max(3, d.sides - 1), texM: 1.2, wind: (p) => [bend(p), 0, 0] });
    for (let i = 2; i < limb.length - 1; i += 2) hangs.push(limb[i]);
    ends.push(end);
    drops.push(limb[1]);
    // branches rise from the limb into the canopy
    for (const t of d.mid ? [0.4, 0.65, 0.85] : [0.55]) {
      const at = limb[Math.floor(t * segs)];
      const b = a + (r() - 0.5) * 1.6;
      const br = wander(r, at, V(Math.cos(b), range(r, 0.6, 1.4), Math.sin(b)), range(r, 2.5, 4.5), 3, 0.5);
      if (d.mid) wd.tube(br, taper(br.length, 0.1, 0.035), { sides: 3, texM: 1.2, wind: (p) => [bend(p), 0.1, 0] });
      ends.push(br[br.length - 1]);
    }
  }
  // roots that drop from the limbs near the trunk (never out over the channel)
  if (d.mid) for (const p0 of drops) {
    if (r() < 0.4 || Math.hypot(p0.x, p0.z) > 6) continue;
    const drop = [p0.clone(), ...Array.from({ length: 5 }, (_, i) => V(p0.x + (r() - 0.5) * 0.3, p0.y - (p0.y + 0.4) * ((i + 1) / 5), p0.z + (r() - 0.5) * 0.3))];
    wd.tube(drop, taper(drop.length, 0.07, 0.06), { sides: 3, texM: 1.2, wind: (p) => [bend(p) * 0.2, 0, 0] });
  }
  // the roof: flattened clumps whose undersides stay above the clearance
  for (const e of ends) {
    const s = range(r, 3.2, 4.6), sy = s * 0.38;
    const c = e.clone().add(V(0, sy * 0.4, 0));
    c.y = Math.max(c.y, floor + sy * 0.8);
    clump(lv, r, c, [s, sy, s], many(lod === 2 ? 4 : 22, d), 1.5 * d.cardSize,
      (i) => A.uv(lod === 0 ? (i % 4 === 0 ? C.canopyUnder : C.leaf) : C.leafFar), { crown: centre, bend, flutter: 0.4, flat: 0.25 });
  }
  // grey moss along the limbs, short enough that masts pass under it
  if (d.mid) for (const h of hangs) {
    if (r() < 0.35) continue;
    const len = Math.min(range(r, 1.2, 3.2), h.y - CANOPY_CLEARANCE);
    if (len < 0.5) continue;
    const a = r() * Math.PI;
    for (let k = 0; k < (d.fine ? 2 : 1); k++) {
      lv.card(h, V(Math.cos(a + k * 1.57), 0, Math.sin(a + k * 1.57)), V(0, 1, 0), len * 0.45, len, A.uv(C.beard), { anchor: 'top', wind: [bend(h), 0.5, r()], tip: 0.45 });
    }
  }
  return assemble('canopyMangrove', lod, [[wd, bark()], [lv, leaves()]]);
}

export const PLANTS: Plant[] = [
  {
    id: 'redMangrove', name: 'Red mangrove', build: redMangrove,
    placement: { minHeight: -1.6, maxHeight: 0.8, maxSlope: 20, density: 3.5, cluster: 0.7 },
  },
  {
    id: 'canopyMangrove', name: 'Canopy mangrove', build: canopyMangrove,
    placement: { minHeight: -1.4, maxHeight: 1.2, maxSlope: 15, density: 0.3, cluster: 0.25 },
  },
];
