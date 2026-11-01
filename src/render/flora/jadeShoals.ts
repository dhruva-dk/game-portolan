// The Jade Shoals' plants: dune grass on the amber dunes and beach morning glory creeping over the sand flats.
// Both are low; the grass is the region's motion (it streams in every breeze), the glory its splash of magenta.
import * as THREE from 'three';
import {
  Geo, V, assemble, css, dirAt, hsl, leafMaps, mix, paintedTexture, plantMaterial, rng,
  type Atlas, type Lod, type Plant, type Rand,
} from './kitC.ts';

// ---------------------------------------------------------------- materials

/** Sea-oat heads: arching branchlets hung with flat golden spikelets, anchored at the top centre. */
function oatTexture(): THREE.Texture {
  return paintedTexture('jadeShoals-oats', 256, 512, (g, w, h) => {
    const r = rng(77);
    for (let b = 0; b < 9; b++) {
      const side = b % 2 ? 1 : -1, reach = (0.15 + r() * 0.3) * w * side;
      const x0 = w / 2, y0 = 6 + b * 6, x1 = x0 + reach, y1 = h * (0.35 + r() * 0.55);
      g.strokeStyle = css(40, 35, 48);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo(x0 + reach * 0.9, y0 + 10, x1, y1);
      g.stroke();
      const n = 6 + Math.floor(r() * 6);
      for (let k = 0; k < n; k++) {
        const t = 0.25 + (0.75 * k) / n;
        const x = x0 + (x1 - x0) * t * (2 - t) * 0.95, y = y0 + (y1 - y0) * t * t;
        g.save();
        g.translate(x, y);
        g.rotate(Math.PI / 2 + (r() - 0.5) * 0.5 - side * 0.3);
        g.fillStyle = css(38 + r() * 12, 45 + r() * 20, 50 + r() * 22);
        g.beginPath();
        g.ellipse(9, 0, 11, 4.5, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = css(35, 40, 38, 0.6);
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, 0);
        g.lineTo(18, 0);
        g.stroke();
        g.restore();
      }
    }
  });
}

/** A whole clump of blades, for the farthest LOD's crossed cards. */
function clumpTexture(): THREE.Texture {
  return paintedTexture('jadeShoals-clump', 512, 512, (g, w, h) => {
    const r = rng(78);
    for (let i = 0; i < 160; i++) {
      const x0 = w / 2 + (r() - 0.5) * w * 0.25, side = (r() - 0.5) * 2;
      const len = h * (0.45 + r() * 0.5), x1 = x0 + side * w * 0.45 * (0.4 + r() * 0.6), y1 = h - len;
      const dry = r() < 0.3;
      g.strokeStyle = dry ? css(38, 50, 55 + r() * 15) : css(95 + r() * 40, 25 + r() * 15, 38 + r() * 20);
      g.lineWidth = 2 + r() * 3;
      g.beginPath();
      g.moveTo(x0, h);
      g.quadraticCurveTo(x0 + (x1 - x0) * 0.2, h - len * 0.9, x1, y1 + len * 0.25 * Math.abs(side));
      g.stroke();
    }
  });
}

/** The morning glory's trumpet: u round the funnel, v from the throat (0) to the rim (1). */
function gloryTexture(): THREE.Texture {
  return paintedTexture('jadeShoals-glory', 256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, css(290, 60, 22));
    grad.addColorStop(0.25, css(305, 65, 38));
    grad.addColorStop(0.55, css(318, 72, 60));
    grad.addColorStop(1, css(322, 78, 70));
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // five deeper bands down the middle of the petals, and fine veins
    for (let k = 0; k < 5; k++) {
      const x = ((k + 0.5) / 5) * w;
      const band = g.createLinearGradient(x - w / 14, 0, x + w / 14, 0);
      band.addColorStop(0, css(318, 70, 55, 0));
      band.addColorStop(0.5, css(312, 75, 45, 0.7));
      band.addColorStop(1, css(318, 70, 55, 0));
      g.fillStyle = band;
      g.beginPath();
      g.moveTo(x - w / 14, 0);
      g.lineTo(x + w / 14, 0);
      g.lineTo(x + 2, h);
      g.lineTo(x - 2, h);
      g.fill();
    }
    g.strokeStyle = css(300, 50, 40, 0.25);
    for (let i = 0; i < 40; i++) {
      const x = (i / 40) * w;
      g.beginPath();
      g.moveTo(x, h);
      g.lineTo(x, 0);
      g.stroke();
    }
  });
}

const grassMat = () => plantMaterial('jadeShoals-grass', () => ({ roughness: 0.75, doubleSide: true }));
const oatMat = () => plantMaterial('jadeShoals-oats', () => ({ map: oatTexture(), roughness: 0.8, leaf: 0.6 }));
const clumpMat = () => plantMaterial('jadeShoals-clump', () => ({ map: clumpTexture(), roughness: 0.8, leaf: 0.5 }));
const gloryLeafMat = () => plantMaterial('jadeShoals-gloryLeaf', () => ({ ...leafMaps('glory_leaf'), roughness: 0.5, leaf: 0.45 }));
const gloryFlowerMat = () => plantMaterial('jadeShoals-gloryFlower', () => ({ map: gloryTexture(), roughness: 0.6, doubleSide: true }));
const runnerMat = () => plantMaterial('jadeShoals-runner', () => ({ roughness: 0.7 }));

/** LeafSet023: six heart-shaped leaves, two by three, stems pointing left. */
const GLORY_ATLAS: Atlas = { cols: 2, rows: 3, stem: 'left', aspect: 512 / 341 };
const WHOLE: [number, number, number, number] = [0, 0, 1, 1];

// ---------------------------------------------------------------- dune grass

interface Blade { base: THREE.Vector3; dir: THREE.Vector3; length: number; arch: number; width: number; dry: boolean }

function duneGrassPlan(seed: number): { blades: Blade[]; stalks: { base: THREE.Vector3; dir: THREE.Vector3; length: number }[]; radius: number; height: number } {
  const r = rng(seed);
  const radius = 0.25 + r() * 0.35, height = 0.7 + r() * 0.5;
  const lean = r() * Math.PI * 2, windswept = r() * 0.25;
  const blades: Blade[] = [];
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    const out = d / radius;
    // inner blades stand up, outer ones fan out and arch over; the dune wind combs them one way
    const dir = dirAt(a, 0.92 - out * 0.35 - r() * 0.1).add(V(Math.cos(lean), 0, Math.sin(lean)).multiplyScalar(windswept)).normalize();
    blades.push({
      base: V(Math.cos(a) * d, -0.05, Math.sin(a) * d),
      dir,
      length: height * (0.6 + r() * 0.6) * (1 - out * 0.3),
      arch: 0.15 + out * 0.45 + r() * 0.2,
      width: 0.012 + r() * 0.01,
      dry: r() < 0.28,
    });
  }
  const stalks = [];
  for (let i = 0, n = 3 + Math.floor(r() * 7); i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius * 0.6;
    stalks.push({ base: V(Math.cos(a) * d, -0.05, Math.sin(a) * d), dir: dirAt(a, 0.93 + r() * 0.05), length: height * (1.5 + r() * 0.6) });
  }
  return { blades, stalks, radius, height };
}

/** A blade's spine: up its heading, arching over under its own weight. */
function bladeSpine(b: Blade, n: number): THREE.Vector3[] {
  const flat = V(b.dir.x, 0, b.dir.z);
  if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
  flat.normalize();
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pts.push(b.base.clone().addScaledVector(b.dir, b.length * t).addScaledVector(flat, b.length * b.arch * t * t * 0.6).add(V(0, -b.length * b.arch * t * t * 0.55, 0)));
  }
  return pts;
}

function buildDuneGrass(seed: number, lod: Lod): THREE.Object3D {
  const plan = duneGrassPlan(seed);
  const r = rng(seed * 5 + 11);
  const grass = new Geo(), oats = new Geo(), clump = new Geo();
  const green = hsl(85 + r() * 30, 28 + r() * 12, 40 + r() * 8), straw = hsl(42, 52, 64), sandy = hsl(38, 35, 72);
  if (lod === 2) {
    // three crossed cards of a painted clump
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI + r() * 0.3;
      const right = V(Math.cos(a), 0, Math.sin(a));
      const s = plan.height * 2.2;
      clump.card(V(0, -0.05, 0), right, V(0, 1, 0), s * 1.2, s * 0.85, WHOLE, mix(green, straw, 0.3).multiplyScalar(1.8), { anchorBottom: true, sway: 0.15, flutter: 0.02 });
    }
    return assemble('Dune grass', lod, [{ geo: clump, mat: clumpMat() }]);
  }
  const keep = lod === 0 ? plan.blades.length : 34;
  const segs = lod === 0 ? 5 : 3;
  plan.blades.slice(0, keep).forEach((b, i) => {
    const spine = bladeSpine(b, segs + 1);
    const side = b.dir.clone().cross(V(0, 1, 0));
    if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
    side.normalize().applyAxisAngle(b.dir, (r() - 0.5) * 1.2);
    const sides = spine.map(() => side);
    const w = (lod === 0 ? 1 : 1.8) * b.width;
    const nrm = spine.map((p, j) => {
      const d = (j < spine.length - 1 ? spine[j + 1].clone().sub(p) : p.clone().sub(spine[j - 1])).normalize();
      return side.clone().cross(d).normalize();
    });
    const tip = b.dry ? straw : mix(green, straw, 0.35);
    grass.strip(spine, sides, spine.map((_, j) => -w * (1 - j / segs) - 0.001), spine.map((_, j) => w * (1 - j / segs) + 0.001), nrm, WHOLE,
      (_j, t) => (t < 0.12 ? sandy : mix(b.dry ? mix(green, straw, 0.6) : green, tip, t)).clone().multiplyScalar(0.75 + 0.35 * t + (i % 5) * 0.03),
      { sway: (_j, t) => 0.4 * b.length * t * t, flutter: (_j, t) => 0.012 * t });
  });
  for (const s of plan.stalks) {
    const top = s.base.clone().addScaledVector(s.dir, s.length);
    const sideV = s.dir.clone().cross(V(0, 0, 1)).normalize();
    const pts = [s.base, s.base.clone().lerp(top, 0.5), top];
    grass.strip(pts, pts.map(() => sideV), [-0.004, -0.003, -0.002], [0.004, 0.003, 0.002], pts.map(() => V(0, 0, 1)), WHOLE, straw, { sway: (_j, t) => 0.35 * s.length * t * t });
    // the head hangs from the stalk top: two crossed cards
    const sway = 0.35 * s.length;
    for (let k = 0; k < (lod === 0 ? 2 : 1); k++) {
      const a = r() * Math.PI;
      const right = V(Math.cos(a), 0, Math.sin(a));
      const hgt = 0.32 + r() * 0.12;
      oats.card(top.clone().add(V(0, -hgt / 2 + 0.02, 0)), right, V(0, 1, 0), hgt * 0.5, hgt, WHOLE, hsl(42, 40, 70).multiplyScalar(1.3), { sway, flutter: 0.03 });
    }
  }
  return assemble('Dune grass', lod, [{ geo: grass, mat: grassMat() }, { geo: oats, mat: oatMat() }]);
}

// ---------------------------------------------------------------- beach morning glory

interface Runner { path: THREE.Vector3[] }

/** Runners creep out over the sand from one root, wandering and forking. */
function gloryPlan(seed: number): Runner[] {
  const r = rng(seed);
  const runners: Runner[] = [];
  const creep = (from: THREE.Vector3, heading: number, length: number, depth: number) => {
    const pts = [from.clone()];
    let a = heading;
    const p = from.clone();
    const step = 0.12;
    for (let s = 0; s < length / step; s++) {
      a += (r() - 0.5) * 0.5;
      p.add(V(Math.cos(a) * step, 0, Math.sin(a) * step));
      p.y = 0.015 + r() * 0.02;
      pts.push(p.clone());
      if (depth < 2 && s > 3 && r() < 0.07) creep(p, a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.6), length * (0.3 + r() * 0.35), depth + 1);
    }
    runners.push({ path: pts });
  };
  const n = 6 + Math.floor(r() * 4), reach = 1.2 + r() * 1.4;
  for (let i = 0; i < n; i++) creep(V(0, 0.03, 0), (i / n) * Math.PI * 2 + r() * 0.6, reach * (0.6 + r() * 0.6), 0);
  return runners;
}

/** One flower: a five-lobed trumpet on a short stalk, opening up and out. */
function trumpet(geo: Geo, at: THREE.Vector3, dir: THREE.Vector3, size: number, lod: Lod, r: Rand): void {
  const sides = lod === 0 ? 15 : 5;
  const rings = lod === 0 ? [[0, 0.1], [0.35, 0.22], [0.7, 0.62], [1, 1]] : [[0, 0.15], [1, 1]];
  const x = dir.clone().cross(V(0, 1, 0));
  if (x.lengthSq() < 1e-3) x.set(1, 0, 0);
  x.normalize();
  const y = dir.clone().cross(x).normalize();
  const base = geo.count, twist = r() * Math.PI;
  rings.forEach(([v, rad]) => {
    for (let s = 0; s <= sides; s++) {
      const th = (s / sides) * Math.PI * 2 + twist;
      const lobe = 1 + 0.1 * Math.cos(th * 5) * v;
      const off = x.clone().multiplyScalar(Math.cos(th)).addScaledVector(y, Math.sin(th));
      const p = at.clone().addScaledVector(dir, size * (0.9 * v - 0.25 * v * v * v)).addScaledVector(off, size * 0.5 * rad * lobe);
      const n = off.clone().multiplyScalar(0.4).addScaledVector(dir, -0.9).normalize();
      geo.vert(p, n, s / sides, v, hsl(0, 0, 100), 0.05, 0.01 * v);
    }
  });
  for (let j = 0; j < rings.length - 1; j++)
    for (let s = 0; s < sides; s++) {
      const a = base + j * (sides + 1) + s;
      geo.quad(a, a + 1, a + sides + 2, a + sides + 1);
    }
}

function buildMorningGlory(seed: number, lod: Lod): THREE.Object3D {
  const runners = gloryPlan(seed);
  const r = rng(seed * 3 + 5);
  const stems = new Geo(), leaves = new Geo(), flowers = new Geo();
  const stemCol = hsl(345, 35, 42), leafCol = () => hsl(95 + r() * 25, 45 + r() * 15, 52 + r() * 12);
  for (const run of runners) {
    if (lod === 2) {
      // far off, the mat is a few flat cards of leaves along each runner
      for (let i = 2; i < run.path.length; i += 4) {
        const p = run.path[i], d = run.path[i].clone().sub(run.path[i - 1]).normalize();
        leaves.card(p.clone().add(V(0, 0.06, 0)), d, V(d.z, 0, -d.x), 0.55, 0.5, WHOLE, leafCol(), {});
      }
      continue;
    }
    if (lod === 0) stems.tube(run.path, run.path.map((_, i) => Math.max(0.004, 0.008 - i * 0.0002)), 3, stemCol, {}, 1, 2);
    else stems.strip(run.path, run.path.map(() => V(1, 0, 0)), run.path.map(() => -0.01), run.path.map(() => 0.01), run.path.map(() => V(0, 1, 0)), WHOLE, stemCol);
    for (let i = 1; i < run.path.length; i++) {
      const p = run.path[i], d = p.clone().sub(run.path[i - 1]).normalize();
      const side = V(-d.z, 0, d.x).multiplyScalar(i % 2 ? 1 : -1);
      if (lod === 1 && i % 2) continue;
      // a leaf on a stalk, folded up along its midrib, turned to the sun
      const stalk = side.clone().multiplyScalar(0.5).add(V(0, 0.8 + r() * 0.3, 0)).addScaledVector(d, 0.2).normalize();
      const plen = 0.03 + r() * 0.05;
      const lb = p.clone().addScaledVector(stalk, plen);
      if (lod === 0) stems.tube([p, lb], [0.003, 0.0025], 3, hsl(80, 40, 45), { sway: 0.02 }, 1, 2);
      const along = side.clone().multiplyScalar(0.6).addScaledVector(d, 0.5).add(V(0, 0.25 + r() * 0.3, 0)).normalize();
      const face = V(0, 1, 0).addScaledVector(along, -along.y).normalize();
      const size = (0.12 + r() * 0.06) * (lod === 1 ? 1.6 : 1);
      leaves.leaf(lb, along, face, size, GLORY_ATLAS, Math.floor(r() * 6), leafCol(), { segs: 1, fold: 0.35, curl: 0.05, sway: 0.02, flutter: 0.01 });
      if (r() < (lod === 0 ? 0.2 : 0.14)) {
        const fd = side.clone().multiplyScalar(0.4).add(V(0, 1, 0)).normalize();
        const fp = p.clone().addScaledVector(fd, 0.06 + r() * 0.06);
        if (lod === 0) stems.tube([p, fp], [0.003, 0.003], 3, hsl(100, 30, 45), { sway: 0.03 }, 1, 2);
        if (r() < 0.2) {
          // a twisted bud
          const bud = fp.clone().addScaledVector(fd, 0.035);
          if (lod === 0) stems.tube([fp, bud], [0.008, 0.001], 4, hsl(320, 55, 55), { sway: 0.03 }, 1, 2, true);
        } else trumpet(flowers, fp, fd.clone().add(V((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize(), (0.075 + r() * 0.02) * (lod === 1 ? 1.6 : 1), lod, r);
      }
    }
  }
  return assemble('Beach morning glory', lod, [{ geo: stems, mat: runnerMat() }, { geo: leaves, mat: gloryLeafMat() }, { geo: flowers, mat: gloryFlowerMat() }]);
}

// ---------------------------------------------------------------- the region's list

export const PLANTS: Plant[] = [
  {
    id: 'duneGrass',
    name: 'Dune grass',
    build: buildDuneGrass,
    // thick on the dunes and bar crests, thinning towards the wet sand
    placement: { minHeight: 0.6, maxHeight: 25, maxSlope: 38, density: 22, cluster: 4 },
  },
  {
    id: 'beachMorningGlory',
    name: 'Beach morning glory',
    build: buildMorningGlory,
    // mats creeping over the flats and the foot of the dunes, just above the tide
    placement: { minHeight: 0.4, maxHeight: 6, maxSlope: 18, density: 1.5, cluster: 6 },
  },
];
