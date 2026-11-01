// The Basalt Stacks' plants: tussocks of grass bent flat by the sea wind, and cushions of sea pinks (thrift)
// holding the turf at the cliff edges. Both are real blade geometry, coloured per vertex, one draw call each.
//
// Both lean toward local +X: turn each instance so +X points downwind of the prevailing wind. The live wind then
// bends them further and sets them streaming.
import * as THREE from 'three';
import { Geo, V, assemble, lerp, material, range, rng, type Lod, type PlantSpec, type Rgb, type Wind } from './kitB.ts';

const blades = () => material('basalt-blades', { doubleSided: true, roughness: 0.75, translucency: 0.3 });
const flowers = () => material('basalt-flowers', { roughness: 0.8 });

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * One blade from `root`: it rises along `up`, then is pushed over toward +X by `lean` (0 upright, 1 flat), with
 * its tip drooping. Width tapers to a point. Colour runs base → mid → tip.
 */
function blade(geo: Geo, r: () => number, root: THREE.Vector3, len: number, width: number, lean: number, segs: number, cols: [Rgb, Rgb, Rgb], wind: (t: number) => Wind, up = V(0, 1, 0)): void {
  const side = r() - 0.5;
  const dir0 = up.clone().add(V(range(r, -0.15, 0.25) + lean * 0.3, 0, side * 0.5)).normalize();
  const push = V(1, -0.25, side * 0.4).normalize();
  const path: THREE.Vector3[] = [], sides: THREE.Vector3[] = [], widths: number[] = [];
  const p = root.clone();
  const d = dir0.clone();
  const twist = range(r, -1.2, 1.2);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    path.push(p.clone());
    // the blade's flat face turns as it goes, so a tussock catches light at every angle
    const a = twist * t + side * 3;
    const s = new THREE.Vector3().crossVectors(d, V(0, 1, 0));
    if (s.lengthSq() < 1e-4) s.set(1, 0, 0);
    s.normalize().applyAxisAngle(d, a * 0.5);
    sides.push(s);
    widths.push(width * (1 - t * 0.92));
    d.lerp(push, lean * 0.55 * (0.3 + t)).normalize();
    p.addScaledVector(d, len / segs);
  }
  geo.ribbon(path, widths, sides, {
    vAt: (i) => i / segs,
    color: (i) => {
      const t = i / segs;
      return t < 0.5 ? mix(cols[0], cols[1], t * 2) : mix(cols[1], cols[2], (t - 0.5) * 2);
    },
    wind: (_q, i) => wind(i / segs),
  });
}

// ---------------------------------------------------------------- wind-bent grass

function windBentGrass(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed + 4040);
  const geo = new Geo();
  const n = lod === 0 ? Math.round(range(r, 60, 90)) : lod === 1 ? 22 : 9;
  const segs = lod === 0 ? 5 : lod === 1 ? 3 : 2;
  const rad = range(r, 0.12, 0.28);
  const tall = range(r, 0.45, 0.85);
  const lean = range(r, 0.45, 0.85);
  const bleach = r();
  const base: Rgb = [0.03, 0.07, 0.015];
  const mid: Rgb = [lerp(0.09, 0.13, bleach), lerp(0.24, 0.28, bleach), 0.04];
  const tip: Rgb = [lerp(0.2, 0.42, bleach), lerp(0.3, 0.36, bleach), lerp(0.07, 0.16, bleach)];
  const widthK = lod === 0 ? 1 : lod === 1 ? 1.8 : 3;
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad;
    const root = V(Math.cos(a) * d, 0, Math.sin(a) * d);
    const len = tall * range(r, 0.55, 1.15);
    const phase = r();
    const dry = r() < 0.15 ? 0.6 : 0;
    blade(geo, r, root, len, range(r, 0.008, 0.013) * widthK, lean * range(r, 0.8, 1.2), segs, [base, mix(mid, tip, dry), tip],
      (t) => ({ bend: 0.3 * len * t * t, branch: 0.07 * len * t, phase, flutter: 0, hz: 1.4 }));
  }
  // a few seed stalks standing above the tussock, with their seed heads
  const stalks = lod === 0 ? Math.round(range(r, 3, 7)) : lod === 1 ? 2 : 0;
  for (let i = 0; i < stalks; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * rad * 0.7;
    const root = V(Math.cos(a) * d, 0, Math.sin(a) * d);
    const len = tall * range(r, 1.2, 1.6);
    const phase = r();
    const straw: Rgb = [0.32, 0.27, 0.12];
    blade(geo, r, root, len, 0.006 * widthK, lean * 0.45, segs + 1, [[0.08, 0.14, 0.03], straw, straw],
      (t) => ({ bend: 0.35 * len * t * t, branch: 0.1 * len * t, phase, flutter: 0, hz: 1.6 }));
  }
  return assemble('wind-bent-grass', [[geo, blades(), lod < 2]]);
}

// ---------------------------------------------------------------- sea pinks

/** A cushion of thrift: a dome of fine dark leaves, with pink pompom heads on bare stalks above it. */
function seaPinks(seed: number, lod: Lod): THREE.Object3D {
  // one stream for the plant's shape, one for leaf detail, so every LOD puts its stalks in the same places
  const r = rng(seed + 5151);
  const rd = rng(seed * 7 + 99);
  const leaves = new Geo(), heads = new Geo();
  const R = range(r, 0.14, 0.32);
  const dome = R * range(r, 0.45, 0.6);
  const hue = r();
  const pink: Rgb = mix([0.78, 0.2, 0.42], [0.62, 0.22, 0.6], hue);
  const pale: Rgb = [0.95, 0.62, 0.78];
  const stalks = Math.round(range(r, 10, 30) * (R / 0.25));
  const sway = (t: number, h: number, phase: number): Wind => ({ bend: 0.04 * h * t * t * 4, branch: 0.03 * t, phase, flutter: 0, hz: 1.7 });

  if (lod === 0) {
    // the cushion: short narrow leaves radiating from the centre over a dome
    const n = Math.round(160 * (R / 0.25));
    for (let i = 0; i < n; i++) {
      const u = rd(), a = rd() * Math.PI * 2;
      const out = V(Math.cos(a) * Math.sqrt(u), 0, Math.sin(a) * Math.sqrt(u));
      const root = V(out.x * R * 0.85, dome * (1 - u) * 0.6, out.z * R * 0.85);
      const dir = out.clone().multiplyScalar(0.8).add(V(0, 1.1 - u * 0.6, 0)).normalize();
      blade(leaves, rd, root, range(rd, 0.06, 0.11), 0.006, 0.1, 2, [[0.02, 0.05, 0.015], [0.06, 0.13, 0.035], [0.1, 0.17, 0.05]],
        (t) => ({ bend: 0.01 * t, branch: 0, phase: 0, flutter: 0, hz: 1.7 }), dir);
    }
  } else {
    // a lumpy dome stands in for the leaves
    leaves.blob(V(0, dome * 0.35, 0), [R, dome * 0.75, R], 1, rd, {
      flatBottom: 0.45, lumps: 0.3,
      color: (_q, n) => (lod === 2 && n.y > 0.35 ? mix([0.06, 0.12, 0.04], pink, 0.7) : mix([0.03, 0.07, 0.02], [0.07, 0.15, 0.04], n.y * 0.5 + 0.5)),
      wind: () => ({ bend: 0, branch: 0, phase: 0, flutter: 0, hz: 1.7 }),
    });
  }
  if (lod < 2) {
    for (let i = 0; i < stalks; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.75;
      const root = V(Math.cos(a) * d, dome * 0.5, Math.sin(a) * d);
      const h = range(r, 0.12, 0.28);
      const phase = r();
      // a thin stalk, leaning a little downwind
      const top = root.clone().add(V(h * range(r, 0.05, 0.25) + Math.cos(a) * d * 0.4, h, Math.sin(a) * d * 0.4));
      const path = [root, root.clone().lerp(top, 0.5).add(V(0.01, 0, 0)), top];
      const side = V(-Math.sin(a), 0, Math.cos(a));
      leaves.ribbon(path, [0.004, 0.0035, 0.003].map((w) => w * (lod ? 2 : 1)), [side, side, side], {
        vAt: (k) => k / 2, color: () => [0.12, 0.17, 0.06], wind: (q) => sway(Math.max(0, q.y - root.y) / h, h, phase),
      });
      // the flower head: a pompom of florets
      const c: Rgb = r() < 0.08 ? pale : mix(pink, pale, r() * 0.35);
      const hr = range(r, 0.014, 0.02) * (lod ? 1.4 : 1);
      if (lod === 1 && i % 2) continue;
      heads.blob(top.clone().add(V(0, hr * 0.6, 0)), [hr, hr * 0.85, hr], lod === 0 ? 1 : 0, rd, {
        lumps: 0.5,
        color: (_q, n) => { const k = lerp(0.6, 1.08, n.y * 0.5 + 0.5) * range(rd, 0.85, 1.12); return [c[0] * k, c[1] * k, c[2] * k]; },
        wind: () => sway(1, h, phase),
      });
    }
  }
  return assemble('sea-pinks', [[leaves, blades(), lod < 2], [heads, flowers(), false]]);
}

// ---------------------------------------------------------------- the region's list

export const PLANTS: PlantSpec[] = [
  {
    id: 'wind-bent-grass',
    name: 'Wind-bent grass',
    build: windBentGrass,
    placement: { minHeight: 1.2, maxHeight: 80, maxSlope: 42, density: 45, cluster: 0.3 },
    lodDistances: [18, 55],
    cullDistance: 160,
  },
  {
    id: 'sea-pinks',
    name: 'Sea pinks',
    build: seaPinks,
    placement: { minHeight: 1.5, maxHeight: 60, maxSlope: 55, density: 6, cluster: 0.85 },
    lodDistances: [16, 50],
    cullDistance: 180,
  },
];
