// The Fjords' plants: tall pines on the valley walls and carpets of heather. The pine is a Scots pine: a long clean
// trunk whose bark turns from grey plates to flaking orange up high (scanned pine bark, Poly Haven), under a flat,
// broken crown of blue-green needle brushes. Young pines are still conical. Needles and heather are painted in code.
import * as THREE from 'three';
import { Atlas, Geo, V, assemble, barkMaterial, between, cardAlong, cardMaterial, hsl, lerp, lodOf, rng, seedFor, smooth, stroke, wander, type Plant, type VertexWind } from './kitA.ts';

// ---------------------------------------------------------------- the atlas

/** Long paired needles in a brush along a twig from (x, y) at angle a. */
function brush(g: CanvasRenderingContext2D, r: () => number, x: number, y: number, a: number, len: number, needle: number): void {
  stroke(g, x, y, a, len, 4, hsl(22, 35, 24));
  const steps = Math.round(len / 4);
  for (let s = 0; s < steps; s++) {
    const t = s / steps;
    if (t < 0.25) continue;
    const px = x + Math.cos(a) * len * t, py = y + Math.sin(a) * len * t;
    for (const side of [-1, 1]) {
      const na = a + side * (0.25 + r() * 0.75) * (1.1 - t * 0.5), nl = needle * (0.7 + r() * 0.4);
      stroke(g, px, py, na, nl, 1.9, hsl(148 + r() * 22, 16 + r() * 16, 24 + r() * 16), (r() - 0.5) * 0.12);
    }
  }
  // the brush closes round the bud at the tip
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  for (let i = 0; i < 26; i++) stroke(g, ex, ey, a + (r() - 0.5) * 1.6, needle * (0.5 + r() * 0.5), 1.9, hsl(150 + r() * 20, 20, 28 + r() * 16));
  g.fillStyle = hsl(28, 45, 40);
  g.beginPath();
  g.ellipse(ex, ey, 4, 7, a + Math.PI / 2, 0, Math.PI * 2);
  g.fill();
}

/** A heather stem: wiry branches up from the base, scale leaves along them, and a spike of bells near the top. */
function heatherStems(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number): void {
  const grow = (x: number, y: number, a: number, len: number, wid: number, depth: number) => {
    const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
    const dx = (ex - w / 2) / (w * 0.5), cap = h * (1 - 0.92 * Math.sqrt(Math.max(0, 1 - dx * dx)));
    if (ey < cap) return;
    stroke(g, x, y, a, len, wid, hsl(15, 30, 18 + r() * 8), (r() - 0.5) * 0.3);
    const steps = Math.round(len / 3);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, px = x + Math.cos(a) * len * t, py = y + Math.sin(a) * len * t;
      g.fillStyle = hsl(95 + r() * 40, 25 + r() * 15, 16 + r() * 14);
      g.fillRect(px - 2.5 + (r() - 0.5) * 3, py - 1.5, 5, 3);
      // bells on the upper part of the clump
      if (py < h * 0.62 && r() < 0.75) {
        g.fillStyle = hsl(292 + r() * 30, 38 + r() * 25, 48 + r() * 22);
        g.beginPath();
        g.ellipse(px + (r() - 0.5) * 8, py, 2.6 + r() * 1.4, 3.2 + r() * 1.4, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (depth > 0) for (let k = 0; k < 2; k++) grow(ex, ey, a + (k ? 1 : -1) * (0.15 + r() * 0.35), len * (0.75 + r() * 0.2), wid * 0.75, depth - 1);
  };
  for (let i = 0; i < n; i++) {
    const x = w * (0.1 + r() * 0.8);
    grow(x, h, -Math.PI / 2 + (x - w / 2) / w * 0.9 + (r() - 0.5) * 0.3, 60 + r() * 50, 3, 4);
  }
}

const atlas = new Atlas('fjords', 1024, {
  // a pine shoot, base at the bottom: a twig and its side twigs, each ending in a brush of long blue-green needles
  tuft: {
    x: 0, y: 0, w: 512, h: 512,
    paint: (g, w, h, r) => {
      const len = h * 0.62;
      for (let k = 0; k < 4; k++) {
        const t = 0.25 + k * 0.17, side = k % 2 ? 1 : -1;
        brush(g, r, w / 2, h - len * t, -Math.PI / 2 + side * (0.55 + r() * 0.3), h * 0.32 * (1 - t * 0.4), 64);
      }
      brush(g, r, w / 2, h, -Math.PI / 2 + (r() - 0.5) * 0.1, len, 74);
    },
  },
  // shoots radiating from a branch end, seen from above or below
  tuftTop: {
    x: 512, y: 0, w: 512, h: 512,
    paint: (g, w, h, r) => {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + r() * 0.4;
        brush(g, r, w / 2, h / 2, a, w * (0.2 + r() * 0.12), 52);
      }
    },
  },
  heather: { x: 0, y: 512, w: 512, h: 512, paint: (g, w, h, r) => heatherStems(g, w, h, r, 34) },
  heatherTop: {
    x: 512, y: 512, w: 512, h: 512,
    paint: (g, w, h, r) => {
      for (let i = 0; i < 2600; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.46 * (0.88 + 0.12 * Math.sin(a * 6));
        const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
        const bloom = r() < 0.55;
        g.fillStyle = bloom ? hsl(292 + r() * 30, 35 + r() * 25, 45 + r() * 25) : hsl(95 + r() * 40, 25, 16 + r() * 14);
        g.beginPath();
        g.ellipse(x, y, bloom ? 3.5 : 4, bloom ? 3 : 1.6, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
  },
});

const PINE = 'fjords-tall-pine', HEATHER = 'fjords-heather';
const Y = V(0, 1, 0);

/** A clump of needle brushes round a branch end: shoots reaching out and up, and a flat rosette on top. */
function needleClump(g: Geo, r: () => number, at: THREE.Vector3, out: THREE.Vector3, size: number, n: number, shade: number, crown: THREE.Vector3, w: VertexWind): void {
  const tuft = atlas.cell('tuft'), top = atlas.cell('tuftTop');
  for (let i = 0; i < n; i++) {
    const d = out.clone().multiplyScalar(0.6).add(V((r() - 0.5) * 1.2, between(r, 0.1, 0.9), (r() - 0.5) * 1.2)).normalize();
    cardAlong(g, at.clone().addScaledVector(d, -size * 0.25), d, r() * Math.PI, size * between(r, 0.8, 1.05), size * between(r, 0.9, 1.15), tuft, { crown, shade: shade * between(r, 0.85, 1.05), wind: w });
  }
  const a = r() * Math.PI;
  g.card(at.clone().add(V(0, size * 0.15, 0)), V(Math.cos(a), (r() - 0.5) * 0.3, Math.sin(a)).normalize(), V(-Math.sin(a), (r() - 0.5) * 0.3, Math.cos(a)).normalize(), size * 1.3, size * 1.3, top, { crown, shade, wind: w });
}

// ---------------------------------------------------------------- the tall pine

function tallPine(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(PINE, seed)), L = lodOf(lod);
  const mature = r() > 0.28;
  const H = mature ? between(r, 18, 28) : between(r, 9, 14);
  const R = H * between(r, 0.014, 0.018) + 0.06;
  const bark = new Geo(), cards = new Geo();
  const bend = (p: THREE.Vector3) => 0.018 * H * Math.pow(Math.max(0, p.y) / H, 2);
  bark.bend = cards.bend = bend;
  cards.tint.setRGB(between(r, 0.85, 1.0), between(r, 0.92, 1.05), between(r, 0.85, 0.98));

  // a long trunk with a gentle S, flaking orange above the grey plates of the lower bole
  const rings = [16, 8, 4][L], ph = r() * 6.28, lean = V((r() - 0.5) * 0.06, 1, (r() - 0.5) * 0.06);
  const path: THREE.Vector3[] = [], radii: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    path.push(lean.clone().multiplyScalar(H * t).add(V(Math.sin(t * 3 + ph) * 0.18, 0, Math.cos(t * 2.5 + ph) * 0.18)));
    radii.push(R * (1 - 0.85 * t) + R * 0.5 * Math.exp(-t * H / 0.8) + 0.02);
  }
  const axisAt = (y: number) => {
    const t = Math.min(rings - 0.001, (y / H) * rings), i = Math.floor(t);
    return path[i].clone().lerp(path[i + 1], t - i);
  };
  const orange = new THREE.Color(1.35, 0.82, 0.55), grey = new THREE.Color(0.85, 0.8, 0.76);
  bark.tube(path, radii, {
    sides: [10, 6, 4][L], uRepeat: 2, vMetres: 1.3,
    color: (t) => grey.clone().lerp(orange, smooth(0.4, 0.7, t)),
    shade: (t) => 0.7 + 0.3 * t,
  });

  const crownBase = H * (mature ? between(r, 0.55, 0.7) : between(r, 0.12, 0.2));
  // dead twigs on the clean bole of mature pines
  if (mature && L < 2) {
    for (let k = 0; k < [7, 3][L]; k++) {
      const y = lerp(H * 0.25, crownBase, r()), a = r() * 6.28, out = V(Math.cos(a), between(r, -0.2, 0.3), Math.sin(a));
      const from = axisAt(y);
      bark.tube(wander(from, out, between(r, 0.5, 1.5), 2, r, 0.4), [0.05, 0.03, 0.012], { sides: 3, vMetres: 1.3, color: () => new THREE.Color(0.6, 0.58, 0.55) });
    }
  }

  const sz = [1, 1.5, 2.3][L];
  if (mature) {
    // a flat, broken crown: limbs climbing out of the top of the bole, each forking into needle clumps
    const limbs = [11, 7, 5][L];
    for (let k = 0; k < limbs; k++) {
      const t = k / (limbs - 1), y = lerp(crownBase, H * 0.94, t);
      const a = k * 2.39996 + r() * 0.7, out = V(Math.cos(a), 0, Math.sin(a));
      const len = (H - y) * 0.45 + between(r, 1.8, 3.4);
      const from = axisAt(y);
      const pts = wander(from, out.clone().add(V(0, between(r, 0.25, 0.8), 0)), len, [4, 3, 2][L], r, 0.35, V(0, 0.08, 0));
      const phase = a * 3 + k;
      const lw = (u: number): VertexWind => ({ phase, branch: 0.05 * u * len, flutter: 0 });
      if (L < 2) bark.tube(pts, pts.map((_, i) => lerp(0.11 + 0.012 * len, 0.03, i / (pts.length - 1))), { sides: [5, 3][L], vMetres: 1.3, wind: lw, color: () => orange, shade: () => 0.85 });
      const end = pts[pts.length - 1];
      const crown = axisAt(H * 0.85).add(V(0, -2, 0));
      const cw = { phase, branch: 0.05 * len, flutter: 0.03 };
      needleClump(cards, r, end, out, 1.3 * sz, [7, 3, 2][L], 0.8 + 0.2 * t, crown, cw);
      if (L < 2) {
        // forks along the limb, each with its own clump
        for (let f = 0; f < 2; f++) {
          const i = 1 + Math.floor(r() * (pts.length - 2)), b = out.clone().applyAxisAngle(Y, (f ? 1 : -1) * between(r, 0.5, 1.1)).add(V(0, between(r, 0.3, 0.8), 0));
          const fork = wander(pts[i], b, between(r, 1.0, 2.2), 2, r, 0.3);
          if (L === 0) bark.tube(fork, [0.05, 0.035, 0.02], { sides: 3, vMetres: 1.3, color: () => orange, wind: () => cw });
          needleClump(cards, r, fork[2], b.setY(0).normalize(), 1.15 * sz, [5, 2][L], 0.75 + 0.2 * t, crown, cw);
        }
      }
    }
    needleClump(cards, r, axisAt(H), V(1, 0, 0), 1.4 * sz, [6, 3, 2][L], 1, axisAt(H - 3), { phase: 1, branch: 0.1, flutter: 0.03 });
  } else {
    // a young pine: regular whorls, still a cone
    const whorls = Math.round((H - crownBase) / [0.75, 1.4, 2.2][L]);
    for (let k = 0; k < whorls; k++) {
      const t = k / whorls, y = lerp(crownBase, H * 0.95, t), rad = (H - y) * 0.32 + 0.4;
      const m = [5, 4, 3][L];
      for (let j = 0; j < m; j++) {
        const a = (j / m) * 6.28 + k * 1.3 + r() * 0.4, out = V(Math.cos(a), 0, Math.sin(a));
        const from = axisAt(y), end = from.clone().addScaledVector(out, rad).add(V(0, rad * 0.25, 0));
        const cw = { phase: a * 3 + k, branch: 0.04 * rad, flutter: 0.03 };
        if (L < 2) bark.tube([from, end], [0.05, 0.02], { sides: 3, vMetres: 1.3, wind: () => cw });
        needleClump(cards, r, end, out, (0.9 + rad * 0.25) * sz, [4, 2, 1][L], 0.75 + 0.25 * t, axisAt(y - 0.5), cw);
        if (L === 0) needleClump(cards, r, from.clone().lerp(end, 0.5).add(V(0, 0.1, 0)), out, 0.9, 2, 0.7, axisAt(y - 0.5), cw);
      }
    }
    needleClump(cards, r, axisAt(H), V(1, 0, 0), 1.1 * sz, [4, 2, 1][L], 1, axisAt(H - 1.5), { phase: 0, branch: 0.06, flutter: 0.03 });
  }
  return assemble(PINE, L, [{ geo: bark, mat: barkMaterial('pine') }, { geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- heather

function heather(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(HEATHER, seed)), L = lodOf(lod);
  const cards = new Geo();
  const W = between(r, 0.5, 1.3), Hh = W * between(r, 0.4, 0.6);
  cards.bend = (p) => 0.06 * Math.pow(Math.max(0, p.y) / Hh, 2);
  // some clumps are in full bloom, some still green
  const bloom = r();
  cards.tint.setRGB(lerp(0.85, 1.08, bloom), lerp(0.95, 0.88, bloom), lerp(0.8, 1.02, bloom));
  const side = atlas.cell('heather'), top = atlas.cell('heatherTop');
  const n = [12, 6, 3][L];
  const centre = V(0, -Hh * 0.6, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, out = V(Math.cos(a), 0, Math.sin(a));
    const tilt = between(r, 0.12, 0.35);
    const up = Y.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt));
    const o = out.clone().multiplyScalar(W * between(r, 0.05, 0.25)).add(V(0, -0.04, 0));
    cards.card(o, V(-Math.sin(a), 0, Math.cos(a)), up, W * between(r, 0.6, 0.8), Hh * between(r, 0.9, 1.1), side, { anchor: [0.5, 0], crown: centre, shade: 0.95, wind: { phase: a * 2, branch: 0.015, flutter: 0.025 } });
  }
  const nt = [3, 2, 1][L];
  for (let i = 0; i < nt; i++) {
    const a = r() * Math.PI, tilt = (r() - 0.5) * 0.25;
    cards.card(V((r() - 0.5) * W * 0.2, Hh * between(r, 0.72, 0.85), (r() - 0.5) * W * 0.2), V(Math.cos(a), tilt, Math.sin(a)).normalize(), V(-Math.sin(a), -tilt, Math.cos(a)).normalize(), W * between(r, 0.75, 0.95), W * between(r, 0.75, 0.95), top, { crown: centre, shade: 1, wind: { phase: a, branch: 0.01, flutter: 0.015 } });
  }
  return assemble(HEATHER, L, [{ geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- the list

export const ATLAS = atlas;

export const PLANTS: Plant[] = [
  {
    id: PINE,
    name: 'Tall pine',
    build: tallPine,
    placement: { minHeight: 2, maxHeight: 220, maxSlope: 40, density: 1.1, cluster: 0.5 },
    lodDistances: [55, 190, 1100],
  },
  {
    id: HEATHER,
    name: 'Heather',
    build: heather,
    placement: { minHeight: 1, maxHeight: 320, maxSlope: 38, density: 22, cluster: 0.8 },
    lodDistances: [16, 45, 120],
  },
];
