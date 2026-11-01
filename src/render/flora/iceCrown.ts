// The Ice Crown's plants: snow-laden firs at the rim and cushions of frost-white lichen. Fir bark is scanned (ambientCG
// Bark 014, a fir) and the snow lying on the branches is scanned (ambientCG Snow 005); the needle sprays and the lichen
// are painted in code. The firs are narrow spires whose tiers carry real snow pads, so they read white-on-dark at 300 m.
import * as THREE from 'three';
import { Atlas, Geo, V, assemble, barkMaterial, between, cardMaterial, hsl, lerp, lodOf, rng, seedFor, stroke, type Cell, type Plant } from './kitA.ts';

// ---------------------------------------------------------------- the atlas

/** A flat fir spray, base at the bottom: a twig with alternate side twigs, dense short needles both sides. */
function firSpray(g: CanvasRenderingContext2D, w: number, h: number, r: () => number): [number, number, number, number][] {
  const twigs: [number, number, number, number][] = []; // x, y, angle, length
  const cx = w / 2;
  twigs.push([cx, h, -Math.PI / 2 + (r() - 0.5) * 0.08, h * 0.95]);
  const n = 9;
  for (let k = 0; k < n; k++) {
    const t = 0.1 + (0.8 * k) / n, y = h - t * h * 0.95, side = k % 2 ? 1 : -1;
    const len = w * 0.46 * Math.sin(Math.PI * (0.15 + t * 0.85)) * (0.8 + r() * 0.3);
    twigs.push([cx, y, -Math.PI / 2 + side * (0.85 + r() * 0.25), len]);
  }
  for (const [x, y, a, len] of twigs) stroke(g, x, y, a, len, 3.2, hsl(25, 30, 18));
  for (const [x, y, a, len] of twigs) {
    const steps = Math.round(len / 3);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, px = x + Math.cos(a) * len * t, py = y + Math.sin(a) * len * t;
      for (const side of [-1, 1]) {
        const na = a + side * (1.05 + r() * 0.35) - 0.25 * side * t, nl = (15 + r() * 9) * (1 - t * 0.35);
        const frost = r() < 0.08;
        stroke(g, px, py, na, nl, 2.3, frost ? hsl(195, 18, 62) : hsl(172 + r() * 18, 24 + r() * 12, 13 + r() * 13 + (side > 0 ? 3 : 0)));
      }
    }
  }
  return twigs;
}

const atlas = new Atlas('ice-crown', 1024, {
  sprig: { x: 0, y: 0, w: 512, h: 512, paint: (g, w, h, r) => void firSpray(g, w, h, r) },
  // the same spray, loaded with snow along its twigs
  snowSprig: {
    x: 512, y: 0, w: 512, h: 512,
    paint: (g, w, h, r) => {
      const twigs = firSpray(g, w, h, r);
      for (const [x, y, a, len] of twigs) {
        const n = Math.round(len / 9);
        for (let s = 0; s < n; s++) {
          const t = s / n, px = x + Math.cos(a) * len * t * 0.92, py = y + Math.sin(a) * len * t * 0.92;
          const rad = (13 + r() * 13) * (1 - t * 0.45);
          g.fillStyle = hsl(212, 30, 84, 0.9);
          g.beginPath();
          g.ellipse(px + 2, py + 4, rad * 1.05, rad * 0.8, a, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = hsl(205, 40, 95 + r() * 5);
          g.beginPath();
          g.ellipse(px, py, rad, rad * 0.75, a + (r() - 0.5) * 0.4, 0, Math.PI * 2);
          g.fill();
        }
      }
    },
  },
  // a cushion of reindeer lichen from the side, base at the bottom: densely branching pale stalks under a dome
  lichenSide: {
    x: 0, y: 512, w: 512, h: 512,
    paint: (g, w, h, r) => {
      const grow = (x: number, y: number, a: number, len: number, wid: number, depth: number, l: number) => {
        const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
        const dx = (ex - w / 2) / (w * 0.48), cap = h * (1 - 0.9 * Math.sqrt(Math.max(0, 1 - dx * dx)));
        if (ey < cap) return;
        stroke(g, x, y, a, len, wid, hsl(100 + r() * 60, 6 + r() * 10, l), (r() - 0.5) * 0.3);
        if (depth > 0) for (const s of [-1, 1]) grow(ex, ey, a + s * (0.3 + r() * 0.3), len * (0.72 + r() * 0.15), wid * 0.78, depth - 1, l + 4);
        else {
          g.fillStyle = hsl(60 + r() * 30, 12, 84);
          g.beginPath();
          g.arc(ex, ey, wid * 0.9, 0, Math.PI * 2);
          g.fill();
        }
      };
      for (let i = 0; i < 160; i++) {
        const x = w * (0.04 + r() * 0.92);
        grow(x, h, -Math.PI / 2 + (r() - 0.5) * 0.7 + (x - w / 2) / w, 40 + r() * 40, 6, 5, 64 + r() * 18);
      }
    },
  },
  // the cushion from above: a mat of pale branch tips with grey shadow between
  lichenTop: {
    x: 512, y: 512, w: 512, h: 512,
    paint: (g, w, h, r) => {
      const blob = (fill: string, k: number) => {
        g.fillStyle = fill;
        g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = (i / 40) * Math.PI * 2, d = w * 0.46 * k * (0.86 + 0.14 * Math.sin(a * 5 + 1) * Math.sin(a * 3));
          const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
          if (i) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.fill();
      };
      blob(hsl(150, 6, 58), 1);
      for (let i = 0; i < 1400; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.42, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
        const l = 80 + r() * 16 - (d / w) * 16;
        for (let k = 0; k < 4; k++) stroke(g, x, y, r() * Math.PI * 2, 5 + r() * 8, 2.4, hsl(110 + r() * 80, 6 + r() * 10, l));
      }
    },
  },
});

const FIR = 'ice-crown-snow-fir', LICHEN = 'ice-crown-frost-lichen';
const Y = V(0, 1, 0);

/** A card lying along a branch: from o along dir, its width level across it. */
function branchCard(g: Geo, o: THREE.Vector3, dir: THREE.Vector3, w: number, len: number, cell: Cell, shade: number, crown: THREE.Vector3, wind: { phase: number; branch: number; flutter: number }): void {
  const up = dir.clone().normalize();
  const right = Y.clone().cross(up).normalize();
  if (right.lengthSq() < 0.5) right.set(1, 0, 0);
  g.card(o, right, up, w, len, cell, { anchor: [0.5, 0], crown, shade, wind });
}

// ---------------------------------------------------------------- the snow-laden fir

function snowFir(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(FIR, seed)), L = lodOf(lod);
  const H = between(r, 6, 16), Rc = H * between(r, 0.14, 0.19), load = between(r, 0.55, 1);
  const bark = new Geo(), cards = new Geo();
  const bend = (p: THREE.Vector3) => 0.01 * H * Math.pow(Math.max(0, p.y) / H, 2);
  bark.bend = cards.bend = bend;
  cards.tint.setRGB(between(r, 0.82, 0.95), between(r, 0.9, 1.0), between(r, 0.95, 1.05));

  // the trunk, a little crooked, its base buried in snow
  const lean = V((r() - 0.5) * 0.05, 1, (r() - 0.5) * 0.05).normalize();
  const rings = [10, 5, 3][L];
  const path = Array.from({ length: rings + 1 }, (_, i) => lean.clone().multiplyScalar((H * 0.9 * i) / rings).add(V(Math.sin(i * 1.7 + seed) * 0.04, 0, 0)));
  const R = H * 0.022 + 0.05;
  bark.tube(path, path.map((_, i) => R * (1 - (0.9 * i) / rings) + 0.015), {
    sides: [8, 5, 3][L], uRepeat: 2, vMetres: 1.6,
    shade: (t) => 0.55 + 0.25 * t,
    color: () => new THREE.Color(0.8, 0.8, 0.82),
    cover: (t) => (t < 0.06 ? 0.9 : 0.15),
  });
  const axisAt = (y: number) => lean.clone().multiplyScalar(y);

  // whorls of drooping branches: snowy sprays on top, dark sprays beneath, snow pads lying on them
  const whorls = Math.ceil(H / [0.42, 0.9, 1.5][L]);
  const sprig = atlas.cell('sprig'), snowy = atlas.cell('snowSprig');
  const sz = [1, 1.25, 1.5][L];
  for (let k = 0; k < whorls; k++) {
    const t = k / (whorls - 1), y = H * (0.07 + 0.86 * t);
    const rad = Rc * Math.pow(1 - t, 0.95) * between(r, 0.85, 1.1) + 0.32;
    const m = t > 0.85 ? 4 : [6, 4, 3][L];
    for (let j = 0; j < m; j++) {
      const a = (j / m) * Math.PI * 2 + k * 0.9 + r() * 0.5;
      const out = V(Math.cos(a), 0, Math.sin(a));
      const droop = 0.3 + 0.35 * load * (1 - t * 0.5) + r() * 0.1;
      const from = axisAt(y);
      const dir = out.clone().add(V(0, -droop, 0)).normalize();
      const wind = { phase: a * 3 + k, branch: 0.03 * rad, flutter: 0.012 };
      const crown = axisAt(y - 0.6);
      if (L === 0) bark.tube([from, from.clone().addScaledVector(dir, rad * 0.95)], [0.045, 0.012], { sides: 3, vMetres: 1.6, shade: () => 0.6, wind: () => wind });
      const shade = 0.62 + 0.38 * t;
      branchCard(cards, from.clone().add(V(0, -0.1, 0)), dir.clone().add(V(0, -0.22, 0)), rad * 0.95 * sz, rad * 1.08, sprig, shade * 0.75, crown, wind);
      branchCard(cards, from, dir, rad * 0.85 * sz, rad * 1.05, snowy, shade, crown, wind);
      // the snow pad: a soft lump lying along the upper face of the branch
      if (L < 2 && rad > 0.35) {
        const mid = from.clone().addScaledVector(dir, rad * 0.55).add(V(0, 0.07 + 0.05 * load, 0));
        const q = new THREE.Quaternion().setFromUnitVectors(V(1, 0, 0), V(dir.x, dir.y * 0.6, dir.z).normalize());
        bark.blob(mid, V(rad * 0.42, 0.06 + 0.07 * load, rad * 0.22 * sz), { r, segs: L ? [5, 3] : [7, 4], rough: 0.25, flat: 0.25, cover: 1, rot: q, wind, uvScale: 0.6 });
      }
    }
  }
  // the spire: a leader of upright sprays under a cap of snow
  const top = axisAt(H);
  for (let k = 0; k < (L === 2 ? 2 : 4); k++) {
    const a = (k / 4) * Math.PI + r() * 0.3;
    cards.card(top.clone().add(V(0, -1.6, 0)), V(Math.cos(a), 0, Math.sin(a)), Y, 0.8 * sz, 1.7, k % 2 ? snowy : sprig, { anchor: [0.5, 0], shade: 1, wind: { phase: a, branch: 0.05, flutter: 0.01 } });
  }
  // a skirt of drifted snow round the foot
  if (L < 2) bark.blob(V(0, -0.15, 0), V(Rc * 0.55 + 0.4, 0.35, Rc * 0.55 + 0.4), { r, segs: L ? [7, 3] : [10, 4], cover: 1, rough: 0.3, flat: 0.2, uvScale: 2 });
  return assemble(FIR, L, [{ geo: bark, mat: barkMaterial('fir', 'snow') }, { geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- frost-white lichen

function frostLichen(seed: number, lod: number): THREE.Object3D {
  const r = rng(seedFor(LICHEN, seed)), L = lodOf(lod);
  const cards = new Geo();
  cards.tint.setRGB(between(r, 0.92, 1.05), between(r, 0.95, 1.05), between(r, 0.95, 1.08));
  const side = atlas.cell('lichenSide'), top = atlas.cell('lichenTop');
  const cushions = L === 2 ? 1 : 1 + Math.floor(r() * 3);
  for (let c = 0; c < cushions; c++) {
    const a0 = r() * 6.28, d0 = c ? between(r, 0.2, 0.5) : 0;
    const centre = V(Math.cos(a0) * d0, 0, Math.sin(a0) * d0);
    const W = between(r, 0.28, 0.6) * (c ? 0.8 : 1), Hc = W * between(r, 0.42, 0.62);
    const n = [9, 5, 3][L];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4, out = V(Math.cos(a), 0, Math.sin(a));
      const tilt = between(r, 0.15, 0.4);
      const up = Y.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(out, Math.sin(tilt));
      const right = V(-Math.sin(a), 0, Math.cos(a));
      cards.card(centre.clone().addScaledVector(out, W * 0.18).add(V(0, -0.02, 0)), right, up, W * 0.75, Hc, side, { anchor: [0.5, 0], shade: 0.95, crown: centre.clone().add(V(0, -W * 0.3, 0)), wind: { phase: a, branch: 0, flutter: 0.004 } });
    }
    // the dome: a crown card on top and tilted cards round its shoulders
    const nt = [5, 3, 1][L];
    for (let i = 0; i < nt; i++) {
      const a = (i / nt) * Math.PI * 2 + r(), d = i ? W * 0.28 : 0, tilt = i ? 0.45 : 0;
      const out = V(Math.cos(a), 0, Math.sin(a)), side = V(-Math.sin(a), 0, Math.cos(a));
      const fwd = out.clone().multiplyScalar(Math.cos(tilt)).add(V(0, -Math.sin(tilt), 0)).normalize();
      if (!i) fwd.set(Math.cos(a), 0, Math.sin(a));
      cards.card(centre.clone().addScaledVector(out, d).add(V(0, Hc * (i ? lerp(0.7, 0.8, r()) : 0.92), 0)), side.clone().multiplyScalar(-1), fwd, W * (i ? 0.62 : 0.85), W * (i ? 0.62 : 0.85), top, { shade: 1, crown: centre.clone().add(V(0, -W, 0)), wind: { phase: a, branch: 0, flutter: 0.003 } });
    }
  }
  return assemble(LICHEN, L, [{ geo: cards, mat: cardMaterial(atlas) }]);
}

// ---------------------------------------------------------------- the list

export const ATLAS = atlas;

export const PLANTS: Plant[] = [
  {
    id: FIR,
    name: 'Snow-laden fir',
    build: snowFir,
    placement: { minHeight: 1, maxHeight: 40, maxSlope: 32, density: 1.5, cluster: 0.55 },
    lodDistances: [45, 160, 900],
  },
  {
    id: LICHEN,
    name: 'Frost-white lichen',
    build: frostLichen,
    placement: { minHeight: 0.5, maxHeight: 60, maxSlope: 30, density: 25, cluster: 0.85 },
    lodDistances: [12, 35, 80],
  },
];
