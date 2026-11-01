// The Narrows' plants: junipers clinging to the sandstone walls (and wind-flagged ones on the ledges), and ivy
// hanging in curtains from the overhangs.
import * as THREE from 'three';
import {
  Geo, V, assemble, atlasCells, emitTree, grow, hsl, isDescendant, lerp, material, painted, range, rng, scan, stamp, topOf,
  type GrowParams, type Lod, type PlantSpec, type Rgb, type Wind,
} from './kitB.ts';

// ---------------------------------------------------------------- textures

/** A pad of juniper foliage: fronds of tiny scale-leaves and needles radiating from the centre, with blue berries. */
function juniperTexture(): THREE.Texture {
  return painted('juniper', 512, 512, ({ g, w }) => {
    const r = rng(19);
    const cx = w / 2, cy = w / 2;
    const scales = (x0: number, y0: number, x1: number, y1: number, size: number, light: number) => {
      const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (size * 0.9)));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t), s = size * (1 - t * 0.45);
        g.fillStyle = hsl(range(r, 150, 172), range(r, 22, 36), light + range(r, -6, 8));
        g.beginPath(); g.ellipse(x, y, s, s * 0.7, Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2); g.fill();
        // a few sharp needles off the scales, so close up it reads prickly
        if (r() < 0.35) {
          const a = Math.atan2(y1 - y0, x1 - x0) + (r() < 0.5 ? 1 : -1) * range(r, 0.5, 0.9);
          g.strokeStyle = hsl(155, 30, light + 6); g.lineWidth = 1.2;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * s * 2.6, y + Math.sin(a) * s * 2.6); g.stroke();
        }
      }
    };
    for (let layer = 0; layer < 2; layer++) {
      const fronds = layer ? 9 : 7;
      for (let f = 0; f < fronds; f++) {
        const a = (f / fronds) * Math.PI * 2 + r() * 0.6 + layer * 0.4;
        const L = w * range(r, 0.3, 0.45);
        const light = layer ? 30 : 20;
        g.strokeStyle = hsl(20, 30, 22); g.lineWidth = 3;
        const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L;
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
        scales(cx, cy, ex, ey, 7, light);
        for (let k = 1; k < 12; k++) {
          const t = k / 12, bx = lerp(cx, ex, t), by = lerp(cy, ey, t);
          const side = k % 2 ? 1 : -1, ba = a + side * range(r, 0.6, 1.0), bl = L * 0.36 * (1 - t * 0.55);
          const tx = bx + Math.cos(ba) * bl, ty = by + Math.sin(ba) * bl;
          scales(bx, by, tx, ty, 6, light);
          for (let j = 1; j < 4; j++) {
            const u = j / 4, sx = lerp(bx, tx, u), sy = lerp(by, ty, u), sa = ba + (j % 2 ? 0.7 : -0.7);
            scales(sx, sy, sx + Math.cos(sa) * bl * 0.45, sy + Math.sin(sa) * bl * 0.45, 4.5, light);
          }
        }
      }
    }
    for (let i = 0; i < 30; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * w * 0.38;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, s = range(r, 4.5, 6.5);
      g.fillStyle = hsl(212, 28, range(r, 38, 50));
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
      g.fillStyle = hsl(205, 30, 78, 0.7);
      g.beginPath(); g.arc(x - s * 0.3, y - s * 0.3, s * 0.35, 0, Math.PI * 2); g.fill();
    }
  });
}

/** Ivy leaves recoloured from the pale scan to the deep glossy green of ivy on a cliff. */
function darkened(img: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const L = (0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]) / 255;
    // keep the veins (bright in the scan) a little paler than the blade
    const t = Math.min(1, Math.max(0, (L - 0.25) * 1.6));
    d[i] = lerp(18, 140, t ** 1.5); d[i + 1] = lerp(48, 170, t ** 1.2); d[i + 2] = lerp(14, 90, t ** 1.5);
  }
  g.putImageData(px, 0, 0);
  return c;
}

/**
 * A vertical strip of hanging ivy: a wandering stem with leaves on stalks either side. It tiles top to bottom,
 * so one strip texture covers a strand of any length.
 */
function ivyTexture(): THREE.Texture {
  const W = 512, H = 1024;
  const stems = (r: () => number) => {
    // the stem's x at each y, wandering, matching top to bottom so the strip tiles
    const k1 = range(r, 0.8, 1.6), p1 = r() * 6.28;
    return (y: number) => W / 2 + Math.sin((y / H) * Math.PI * 2 * Math.round(k1) + p1) * W * 0.12;
  };
  const leaves = (g: CanvasRenderingContext2D, r: () => number, draw: (x: number, y: number, a: number, len: number) => void) => {
    const sx = stems(r);
    g.strokeStyle = hsl(25, 30, 22); g.lineWidth = 4;
    g.beginPath();
    for (let y = -10; y <= H + 10; y += 8) g.lineTo(sx(y), y);
    g.stroke();
    const n = 30;
    for (let i = 0; i < n; i++) {
      const y = (i / n) * H + range(r, -10, 10);
      const side = i % 2 ? 1 : -1;
      const len = range(r, 85, 125);
      const stalk = range(r, 50, 120);
      const x0 = sx(y), a = side * range(r, 1.0, 1.5);
      const x = THREE.MathUtils.clamp(x0 + Math.sin(a) * stalk, len * 0.45, W - len * 0.45), yy = y + stalk * 0.25;
      g.strokeStyle = hsl(30, 25, 25); g.lineWidth = 2;
      for (const dy of [-H, 0, H]) { g.beginPath(); g.moveTo(x0, y + dy); g.lineTo(x, yy + dy); g.stroke(); }
      // leaves hang tip-down, turned a little outward
      for (const dy of [-H, 0, H]) draw(x, yy + dy, Math.PI + side * range(r, 0.2, 0.7), len);
    }
  };
  return painted('ivy', W, H, ({ g }) => {
    const r = rng(23);
    leaves(g, r, (x, y, a, len) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = hsl(range(r, 95, 125), range(r, 30, 45), range(r, 16, 26));
      // three lobes, roughly
      g.beginPath(); g.moveTo(0, 0);
      g.lineTo(-len * 0.38, -len * 0.35); g.lineTo(-len * 0.2, -len * 0.55); g.lineTo(0, -len); g.lineTo(len * 0.2, -len * 0.55); g.lineTo(len * 0.38, -len * 0.35);
      g.closePath(); g.fill();
      g.restore();
    });
  }, {
    scans: [['ivy_leaves_c.jpg', 'ivy_leaves_a.jpg']],
    paint: ({ g }, [atlas]) => {
      const r = rng(23);
      const dark = darkened(atlas);
      const cells = atlasCells(dark, 2, 3);
      leaves(g, r, (x, y, a, len) => stamp(g, dark, cells[Math.floor(r() * cells.length)], x, y, a, len * 0.95, r() < 0.5));
    },
  });
}

// ---------------------------------------------------------------- materials

const juniperBark = () => material('juniper-bark', { map: scan('juniper_bark_d.jpg', true), normalMap: scan('juniper_bark_n.jpg', false), normalScale: 1.5, roughness: 0.92 });
const deadwood = () => material('juniper-deadwood', { map: scan('juniper_bark_d.jpg', true), normalMap: scan('juniper_bark_n.jpg', false), normalScale: 1.8, roughness: 0.8, bleach: 0.85 });
const juniperLeaf = () => material('juniper-leaf', { map: juniperTexture(), alphaTest: 0.42, translucency: 0.25, roughness: 0.8 });
const ivyLeaf = () => material('ivy-leaf', { map: ivyTexture(), alphaTest: 0.45, translucency: 0.35, roughness: 0.45 });
const solid = () => material('narrows-solid', { roughness: 0.9 });

// ---------------------------------------------------------------- junipers

/**
 * A juniper. On a wall it bursts from a crack, runs out from the face and turns up, twisting; on a ledge it stands
 * flagged by the wind (its foliage pulled toward +X, so turn it downwind). Some limbs are dead and bleached silver.
 */
function juniper(seed: number, lod: Lod, onWall: boolean): THREE.Object3D {
  const r = rng(seed + (onWall ? 0 : 500));
  const P: GrowParams = {
    root: V(0, 0, 0),
    dir: onWall ? V((r() - 0.5) * 0.8, 0.25, 1) : V(range(r, 0.1, 0.5), 1, (r() - 0.5) * 0.4),
    length: onWall ? range(r, 2.2, 3.6) : range(r, 2.4, 3.8),
    radius: range(r, 0.12, 0.19),
    children: [5, 4, 3],
    spread: [[0.3, 1], [0.2, 1], [0.3, 1]],
    angle: [0.85, 0.75, 0.65],
    lengthRatio: [0.62, 0.55, 0.5],
    radiusRatio: 0.66,
    tropism: [onWall ? 0.12 : 0.02, 0.05, 0.02, 0.0],
    wiggle: 0.65,
    segments: [7, 5, 4, 3],
    flex: [0, 0.05, 0.08, 0.12],
    tipRatio: 0.34,
    steer: (d, level, _t, at) => {
      if (onWall && at.z < 0.35) d.z += 0.35; // never back into the rock
      if (!onWall && level > 0) d.x += 0.14; // flagged downwind
    },
  };
  const limbs = grow(r, P);
  // a quarter of the main limbs are dead: bare, twisted and silver
  for (const l of limbs.filter((b) => b.level === 1)) {
    if (r() > 0.27) continue;
    for (const b of limbs) if (b === l || isDescendant(limbs, b, l)) b.dead = true;
  }
  const blue = r();
  const g = emitTree(onWall ? 'cliff-juniper' : 'ledge-juniper', seed, lod, limbs, {
    bark: juniperBark, deadBark: deadwood, leaf: juniperLeaf, far: solid,
    tint: [lerp(0.95, 0.8, blue), lerp(1.05, 1.0, blue), lerp(0.95, 1.08, blue)],
    farColor: [lerp(0.09, 0.07, blue), lerp(0.17, 0.15, blue), lerp(0.11, 0.14, blue)],
    barkTint: [1, 0.95, 0.92],
    bend: onWall ? 0.12 : 0.2, hz: 0.7, card: 0.95, perTwig: 3, flat: 0.45, barkScale: 0.35, sides: [7, 5, 3], flare: 1.6,
  }, topOf(limbs));
  if (onWall && lod < 2) g.add(...assemble('roots', [[wallRoots(r, lod), juniperBark()]]).children);
  return g;
}

/** Roots gripping the rock face: they run out from the crack along the wall (z ≈ 0) and down into fissures. */
function wallRoots(r: () => number, lod: Lod): Geo {
  const geo = new Geo();
  const n = lod === 0 ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4;
    const L = range(r, 0.6, 1.6);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      pts.push(V(Math.cos(a) * L * t + (r() - 0.5) * 0.06, Math.sin(a) * L * t + (r() - 0.5) * 0.06, 0.08 * (1 - t) + 0.02));
    }
    geo.tube(pts, pts.map((_, k) => lerp(0.07, 0.015, k / 5)), lod === 0 ? 5 : 3, {
      uRepeat: 1, vPerMetre: 2.5, color: () => [0.85, 0.8, 0.78], wind: () => ({ bend: 0, branch: 0, phase: 0, flutter: 0, hz: 0.7 }),
    });
  }
  return geo;
}

// ---------------------------------------------------------------- hanging ivy

/**
 * Ivy hanging from a ledge: strands that spill over the lip (the origin, on the face) and hang 2–7 m down the wall,
 * a hand's width out from it. Each strand is a strip of the ivy texture; close up, extra tufts stick out sideways.
 */
function hangingIvy(seed: number, lod: Lod): THREE.Object3D {
  const r = rng(seed + 77);
  const leaves = new Geo(), far = new Geo();
  const spread = range(r, 1.5, 3.2);
  const strands = Math.round(range(r, 14, 22));
  const longest = range(r, 4, 7.5);
  const shade = range(r, 0.85, 1.1);
  for (let s = 0; s < strands; s++) {
    const x = (s / (strands - 1) - 0.5) * spread * 2 + (r() - 0.5) * 0.3;
    // strands in the middle hang longest, so the curtain ends in a ragged point
    const L = longest * range(r, 0.45, 1) * (1 - Math.abs(x / spread) * 0.45);
    const phase = r();
    const keep = lod === 0 || (lod === 1 ? s % 2 === 0 : s % 4 === 0);
    if (!keep) continue;
    const width = lod === 0 ? range(r, 0.5, 0.65) : lod === 1 ? 0.9 : 1.5;
    const segs = lod === 2 ? 3 : Math.max(4, Math.round(L / 0.5));
    const path: THREE.Vector3[] = [], sides: THREE.Vector3[] = [], widths: number[] = [];
    const wob = r() * 6.28;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      // over the lip, then down, drifting a little sideways
      path.push(V(x + Math.sin(t * 3 + wob) * 0.15, 0.1 - t * L, lerp(0.3, 0.12 + 0.08 * Math.sin(t * 5 + wob), Math.min(1, t * 4))));
      const yaw = Math.sin(t * 2 + wob) * 0.25;
      sides.push(V(Math.cos(yaw), 0, Math.sin(yaw)));
      widths.push(width * lerp(1, 0.55, t));
    }
    const wind = (p: THREE.Vector3): Wind => {
      const t = Math.min(1, Math.max(0, -p.y) / L);
      return { bend: 0.14 * t * t * L * 0.25, branch: 0.05 * t * L * 0.2, phase, flutter: 0.02, hz: 0.6 };
    };
    if (lod < 2) {
      const vTop = r();
      // the strip texture is twice as tall as it is wide
      leaves.ribbon(path, widths, sides, {
        vAt: (k) => vTop - ((k / segs) * L) / (width * 2),
        color: (k) => { const ao = lerp(1.0, 0.8, k / segs) * shade; return [ao, ao, ao]; },
        wind: (p) => wind(p),
      });
    } else {
      const c: Rgb = [0.05 * shade, 0.11 * shade, 0.04 * shade];
      far.ribbon(path, widths, sides, { vAt: (k) => k, color: () => c, wind: (p) => wind(p) });
    }
    // tufts standing off the strand, so the curtain has depth from the side
    if (lod === 0) {
      for (let k = 0; k < Math.round(L * 1.4); k++) {
        const t = range(r, 0.05, 0.95);
        const i = Math.min(segs - 1, Math.floor(t * segs));
        const p = path[i].clone().lerp(path[i + 1], t * segs - i).add(V(0, 0, range(r, 0.02, 0.15)));
        const yaw = (r() < 0.5 ? -1 : 1) * range(r, 0.6, 1.3);
        const right = V(Math.cos(yaw), 0, Math.sin(yaw));
        const s = range(r, 0.35, 0.5);
        const v0 = r() * 0.6;
        leaves.card(p, right, V(0, 1, 0), s, s * 1.1, [0.15, v0, 0.85, v0 + 0.35], { color: () => [shade * 0.95, shade * 0.95, shade * 0.95], wind: (q) => wind(q), bendNormals: 0 });
      }
    }
  }
  return assemble('hanging-ivy', [[leaves, ivyLeaf(), true], [far, solid(), false]]);
}

// ---------------------------------------------------------------- the region's list

export const PLANTS: PlantSpec[] = [
  {
    id: 'cliff-juniper',
    name: 'Cliff juniper',
    build: (seed, lod) => juniper(seed, lod, true),
    placement: { anchor: 'wall', minHeight: 2, maxHeight: 90, minSlope: 55, maxSlope: 95, density: 0.35, cluster: 0.55 },
    lodDistances: [35, 110],
    cullDistance: 500,
  },
  {
    id: 'ledge-juniper',
    name: 'Ledge juniper (wind-flagged)',
    build: (seed, lod) => juniper(seed, lod, false),
    placement: { minHeight: 3, maxHeight: 120, maxSlope: 35, density: 0.4, cluster: 0.5 },
    lodDistances: [35, 110],
    cullDistance: 500,
  },
  {
    id: 'hanging-ivy',
    name: 'Hanging ivy',
    build: hangingIvy,
    placement: { anchor: 'wall', minHeight: 4, maxHeight: 90, minSlope: 65, maxSlope: 110, density: 0.5, cluster: 0.7 },
    lodDistances: [40, 130],
    cullDistance: 500,
  },
];
