// The emblems: the thirty captains' (PROMPT.md, "The captains") and the player's gull, drawn in code as heraldic
// charges on a roundel (a field in the captain's first pigment, the charge and a bordure in the second, an ink line
// round both) and rasterised once from signed distances into one atlas, crisp at every mip. Ship.setEmblem paints a
// cell onto the mainsail, where it deforms with the cloth; the chart, the lookout and the results can reuse the atlas.
// Channels: r = field, g = charge, b = ink, a = coverage. Row 0 of the atlas is its top row of cells.
import * as THREE from 'three';

export const EMBLEMS = [
  'arrowhead', 'crossedLances', 'feather', 'sunburst', 'ironKnot', 'meridianArc', 'waves', 'risingSun', 'eightPointStar', 'windRose',
  'diamond', 'crescent', 'key', 'lightningStroke', 'coin', 'hexagon', 'tower', 'anchor', 'battlement', 'circle',
  'hourglass', 'eclipse', 'twoRings', 'brokenWheel', 'spiral', 'wheelOfFortune', 'die', 'thunderbolt', 'comet', 'flame',
  'gull',
] as const;
export type EmblemName = (typeof EMBLEMS)[number];
/** The player's own emblem: the companion gull under a star. */
export const PLAYER_EMBLEM: EmblemName = 'gull';
export const EMBLEM_CELL = 128;
const COLS = 8, ROWS = 4;

/** A signed distance in the plane, negative inside. */
export type SDF = (x: number, y: number) => number;
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
/** Coverage of a pixel of size px by the inside of d. */
export const cover = (d: number, px: number) => clamp(0.5 - d / px, 0, 1);
/** Coverage of a pixel by a line of half-width hw along d = 0. */
export const edge = (d: number, px: number, hw: number) => clamp((hw - Math.abs(d)) / px + 0.5, 0, 1);
export const circle = (cx: number, cy: number, r: number): SDF => (x, y) => Math.hypot(x - cx, y - cy) - r;
const ring = (cx: number, cy: number, r: number, w: number): SDF => (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - w;
const ellipse = (cx: number, cy: number, rx: number, ry: number): SDF => (x, y) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);
/** A capsule from a to b, its radius running from ra to rb. */
export const seg = (ax: number, ay: number, bx: number, by: number, ra: number, rb = ra): SDF => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-9;
  return (x, y) => {
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
    return Math.hypot(x - ax - dx * t, y - ay - dy * t) - (ra + (rb - ra) * t);
  };
};
export const union = (...fs: SDF[]): SDF => (x, y) => {
  let d = Infinity;
  for (const f of fs) d = Math.min(d, f(x, y));
  return d;
};
/** A polyline of capsules through flat [x, y, ...] points, its radius tapering from ra to rb. */
export const path = (p: readonly number[], ra: number, rb = ra): SDF => {
  const n = p.length / 2 - 1;
  return union(...Array.from({ length: n }, (_, i) => seg(p[2 * i], p[2 * i + 1], p[2 * i + 2], p[2 * i + 3], ra + ((rb - ra) * i) / n, ra + ((rb - ra) * (i + 1)) / n)));
};
/** A polygon through flat [x, y, ...] points (even-odd); beyond `cull` outside its bounds only the bounds are measured. */
export const poly = (p: readonly number[], cull = 0.1): SDF => {
  const n = p.length / 2, xs = p.filter((_, i) => i % 2 === 0), ys = p.filter((_, i) => i % 2 === 1);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return (x, y) => {
    const out = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(y0 - y, 0, y - y1));
    if (out > cull) return out;
    let d = Infinity, s = 1;
    for (let i = 0, j = n - 1; i < n; j = i, i++) {
      const vx = p[2 * i], vy = p[2 * i + 1], ex = p[2 * j] - vx, ey = p[2 * j + 1] - vy, wx = x - vx, wy = y - vy;
      const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey || 1e-9), 0, 1), bx = wx - ex * t, by = wy - ey * t;
      d = Math.min(d, bx * bx + by * by);
      const c1 = y >= vy, c2 = y < p[2 * j + 1], c3 = ex * wy > ey * wx;
      if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    }
    return s * Math.sqrt(d);
  };
};
const cut = (a: SDF, ...b: SDF[]): SDF => { const u = union(...b); return (x, y) => Math.max(a(x, y), -u(x, y)); };
const inter = (a: SDF, b: SDF): SDF => (x, y) => Math.max(a(x, y), b(x, y));
const rot = (f: SDF, a: number): SDF => { const c = Math.cos(a), s = Math.sin(a); return (x, y) => f(c * x + s * y, -s * x + c * y); };
const move = (f: SDF, dx: number, dy: number): SDF => (x, y) => f(x - dx, y - dy);
const mirrorX = (f: SDF): SDF => (x, y) => f(Math.abs(x), y);
/** n copies of f (drawn about the +x axis) around the origin, the first at angle a0. */
const around = (f: SDF, n: number, a0 = 0): SDF => {
  const k = (2 * Math.PI) / n;
  return (x, y) => { const a = Math.atan2(y, x) - a0, r = Math.hypot(x, y), b = a - k * Math.round(a / k); return f(r * Math.cos(b), r * Math.sin(b)); };
};
const rect = (cx: number, cy: number, hx: number, hy: number, r = 0): SDF => (x, y) => {
  const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const star = (n: number, ro: number | readonly number[], ri: number, a0 = Math.PI / 2): number[] =>
  Array.from({ length: 2 * n }, (_, k) => {
    const r = k % 2 ? ri : typeof ro === 'number' ? ro : ro[(k / 2) % ro.length], a = a0 + (k * Math.PI) / n;
    return [r * Math.cos(a), r * Math.sin(a)];
  }).flat();
const hex = (r: number): SDF => (x, y) => {
  let px = Math.abs(x), py = Math.abs(y);
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269, d = 2 * Math.min(kx * px + ky * py, 0);
  px -= d * kx;
  py -= d * ky;
  px -= clamp(px, -kz * r, kz * r);
  py -= r;
  return Math.hypot(px, py) * Math.sign(py);
};
const above = (y0: number): SDF => (_x, y) => y0 - y;
const below = (y0: number): SDF => (_x, y) => y - y0;
const bez = (a: readonly number[], b: readonly number[], c: readonly number[], n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = i / n, s = 1 - t; return [s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1]]; }).flat();
const spiral = (turns: number, rMax: number, w: number): SDF => {
  const tMax = turns * 2 * Math.PI, b = rMax / tMax;
  return (x, y) => {
    const r = Math.hypot(x, y);
    let a = Math.atan2(y, x), d = Math.hypot(x - rMax * Math.cos(tMax), y - rMax * Math.sin(tMax));
    if (a < 0) a += 2 * Math.PI;
    for (let t = a; t <= tMax; t += 2 * Math.PI) d = Math.min(d, Math.abs(r - b * t));
    return d - w;
  };
};
const wheel = (r: number, spokes: number, w: number) => union(ring(0, 0, r, w), circle(0, 0, r * 0.22), around(seg(r * 0.2, 0, r, 0, w * 0.6), spokes));
const lance = union(seg(0, -0.72, 0, 0.56, 0.05, 0.022), poly([0, 0.8, 0.065, 0.6, 0, 0.52, -0.065, 0.6]), seg(0, -0.42, 0, -0.24, 0.13, 0.04));
const vane = cut(ellipse(0, 0.12, 0.24, 0.6), seg(0, -0.5, 0, 0.7, 0.014), seg(0.06, 0.32, 0.3, 0.46, 0.025), seg(-0.06, -0.06, -0.3, 0.06, 0.025));
const bolt = union(path([-0.56, -0.06, -0.28, 0.08, 0, -0.08, 0.28, 0.08, 0.52, -0.02], 0.05), poly([0.74, 0, 0.48, 0.14, 0.52, -0.14]), poly([-0.74, 0, -0.5, 0.13, -0.54, -0.15]));
const ray = (k: number, n: number, cy: number, r0: number, r1: number) => { const a = (Math.PI * k) / n; return seg(r0 * Math.cos(a), cy + r0 * Math.sin(a), r1 * Math.cos(a), cy + r1 * Math.sin(a), 0.05, 0.012); };

/** The charges, drawn within radius 0.8 of the cell (−1…1, y up). */
const CHARGES: Record<EmblemName, SDF> = {
  arrowhead: poly([0, 0.76, 0.44, -0.1, 0.15, 0.06, 0.08, 0, 0.08, -0.72, -0.08, -0.72, -0.08, 0, -0.15, 0.06, -0.44, -0.1]),
  crossedLances: union(rot(lance, 0.6), rot(lance, -0.6)),
  feather: rot(union(vane, seg(0, -0.78, 0, -0.45, 0.032, 0.02)), -0.55),
  sunburst: union(circle(0, 0, 0.25), around(poly([0.3, 0.09, 0.76, 0, 0.3, -0.09]), 8), around(poly([0.3, 0.065, 0.58, 0, 0.3, -0.065]), 8, Math.PI / 8)),
  ironKnot: union(rot((x, y) => Math.abs(rect(0, 0, 0.32, 0.32, 0.08)(x, y)) - 0.055, Math.PI / 4), around(ring(0.5, 0, 0.16, 0.055), 4)),
  meridianArc: union(inter(ring(0, -0.3, 0.62, 0.05), above(-0.3)), seg(-0.66, -0.3, 0.66, -0.3, 0.05), seg(0, -0.3, 0, 0.62, 0.035), circle(0, -0.3, 0.1),
    ...Array.from({ length: 7 }, (_, k) => { const a = (Math.PI * (k + 1)) / 8; return seg(0.48 * Math.cos(a), -0.3 + 0.48 * Math.sin(a), 0.6 * Math.cos(a), -0.3 + 0.6 * Math.sin(a), 0.022); })),
  waves: (x, y) => {
    let d = Infinity;
    for (const y0 of [0.34, 0, -0.34]) d = Math.min(d, Math.abs(y - y0 - 0.1 * Math.sin(x * 6.5 + 1)) * 0.8 - 0.065);
    return Math.max(d, Math.abs(x) - 0.64);
  },
  risingSun: union(inter(circle(0, -0.22, 0.32), above(-0.22)), ...Array.from({ length: 7 }, (_, k) => ray(k + 1, 8, -0.22, 0.4, 0.68)),
    seg(-0.66, -0.32, 0.66, -0.32, 0.045), seg(-0.46, -0.47, 0.46, -0.47, 0.035), seg(-0.24, -0.6, 0.24, -0.6, 0.03)),
  eightPointStar: poly(star(8, 0.76, 0.32)),
  windRose: cut(union(poly(star(8, [0.78, 0.48], 0.12)), ring(0, 0, 0.34, 0.03)), circle(0, 0, 0.06)),
  diamond: cut(poly([0, 0.78, 0.5, 0, 0, -0.78, -0.5, 0]), poly([0, 0.3, 0.19, 0, 0, -0.3, -0.19, 0])),
  crescent: cut(circle(0, -0.06, 0.62), circle(0, 0.2, 0.52)),
  key: rot(union(ring(0, 0.44, 0.2, 0.065), seg(0, 0.24, 0, -0.7, 0.062), rect(0.15, -0.52, 0.12, 0.055), rect(0.13, -0.66, 0.1, 0.045)), 0.4),
  lightningStroke: poly([0.12, 0.66, -0.28, 0.02, -0.05, 0.02, -0.28, -0.66, 0.19, -0.07, -0.03, -0.07, 0.31, 0.66]),
  coin: cut((x, y) => Math.hypot(x, y) - (0.6 + 0.02 * Math.cos(28 * Math.atan2(y, x))), ring(0, 0, 0.47, 0.022), seg(-0.2, 0, 0.2, 0, 0.04), seg(0, -0.2, 0, 0.2, 0.04)),
  hexagon: union((x, y) => Math.abs(hex(0.58)(x, y)) - 0.065, hex(0.22), around(seg(0.22, 0, 0.6, 0, 0.03), 6)),
  tower: cut(union(rect(0, -0.16, 0.28, 0.48), rect(-0.21, 0.4, 0.07, 0.1), rect(0, 0.4, 0.07, 0.1), rect(0.21, 0.4, 0.07, 0.1), rect(0, -0.66, 0.36, 0.06)),
    rect(0, -0.5, 0.1, 0.12), circle(0, -0.38, 0.1), rect(0, 0.08, 0.03, 0.11)),
  anchor: union(ring(0, 0.54, 0.12, 0.045), seg(0, 0.42, 0, -0.6, 0.055), seg(-0.3, 0.3, 0.3, 0.3, 0.05), inter(ring(0, -0.1, 0.5, 0.055), below(-0.2)), mirrorX(poly([0.36, -0.24, 0.62, -0.04, 0.52, -0.34]))),
  battlement: cut(union(rect(0, -0.2, 0.6, 0.26), ...[-0.49, -0.163, 0.163, 0.49].map((x) => rect(x, 0.17, 0.11, 0.12))),
    rect(0, -0.36, 0.11, 0.1), circle(0, -0.26, 0.11), seg(-0.6, -0.08, -0.2, -0.08, 0.012), seg(0.2, -0.08, 0.6, -0.08, 0.012)),
  circle: ring(0, 0, 0.5, 0.13),
  hourglass: union(poly([-0.36, 0.54, 0.36, 0.54, 0.05, 0, -0.05, 0]), poly([-0.05, 0, 0.05, 0, 0.36, -0.54, -0.36, -0.54]),
    rect(0, 0.6, 0.42, 0.055), rect(0, -0.6, 0.42, 0.055), mirrorX(seg(0.4, -0.55, 0.4, 0.55, 0.025))),
  eclipse: union(circle(0, 0, 0.42), around(seg(0.5, 0, 0.7, 0, 0.035, 0.01), 20)),
  twoRings: union(ring(-0.24, 0, 0.36, 0.075), ring(0.24, 0, 0.36, 0.075)),
  brokenWheel: cut(wheel(0.6, 8, 0.07), inter(poly([0, 0, 0.95, 0.28, 0.5, 0.86], 9), (x, y) => 0.3 - Math.hypot(x, y))),
  spiral: spiral(2.6, 0.64, 0.055),
  wheelOfFortune: union(wheel(0.5, 8, 0.06), around(union(seg(0.5, 0, 0.64, 0, 0.03), circle(0.68, 0, 0.065)), 8, Math.PI / 8)),
  die: rot(cut(rect(0, 0, 0.48, 0.48, 0.1), circle(0, 0, 0.085), ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => circle(0.25 * a, 0.25 * b, 0.085))), 0.3),
  thunderbolt: union(rot(bolt, Math.PI / 4), rot(bolt, -Math.PI / 4), circle(0, 0, 0.13)),
  comet: union(circle(0.3, 0.3, 0.17), cut(union(seg(0.3, 0.3, -0.66, -0.46, 0.14, 0.01), seg(0.24, 0.38, -0.5, -0.1, 0.07, 0.008), seg(0.38, 0.24, -0.1, -0.6, 0.07, 0.008)), circle(0.3, 0.3, 0.23))),
  flame: cut(union(seg(0.02, -0.42, 0.06, 0.76, 0.3, 0), seg(-0.16, -0.4, -0.44, 0.3, 0.17, 0), seg(0.2, -0.42, 0.46, 0.2, 0.16, 0)), seg(0.02, -0.4, 0.04, 0.3, 0.12, 0)),
  gull: union(mirrorX(path(bez([0.03, -0.04], [0.28, 0.5], [0.72, 0.02], 10), 0.08, 0.016)), ellipse(0, -0.1, 0.07, 0.15), move(poly(star(4, 0.17, 0.05)), 0, 0.52)),
};
const FIELD = circle(0, 0, 0.94), BORDURE = ring(0, 0, 0.86, 0.028), INK = 0.016;

/** The atlas: COLS × ROWS cells of `cell` px, RGBA (field, charge, ink, coverage), bottom row first in memory. */
export function emblemAtlas(cell = EMBLEM_CELL): Uint8Array {
  const W = COLS * cell, out = new Uint8Array(4 * W * ROWS * cell), px = 2 / cell;
  EMBLEMS.forEach((name, k) => {
    const charge = union(CHARGES[name], BORDURE), ox = (k % COLS) * cell, oy = (ROWS - 1 - Math.floor(k / COLS)) * cell;
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
      const x = (i + 0.5) * px - 1, y = (j + 0.5) * px - 1, fd = FIELD(x, y), cd = charge(x, y);
      const field = cover(fd, px), ink = Math.max(edge(fd, px, INK), edge(cd, px, INK) * field), o = 4 * ((oy + j) * W + ox + i);
      out[o] = Math.round(255 * field);
      out[o + 1] = Math.round(255 * cover(cd, px) * field);
      out[o + 2] = Math.round(255 * ink);
      out[o + 3] = Math.round(255 * Math.max(field, ink));
    }
  });
  return out;
}
/** An emblem's cell in the atlas texture: (u0, v0, du, dv). */
export function emblemRect(name: EmblemName): THREE.Vector4 {
  const k = EMBLEMS.indexOf(name);
  return new THREE.Vector4((k % COLS) / COLS, (ROWS - 1 - Math.floor(k / COLS)) / ROWS, 1 / COLS, 1 / ROWS);
}
let texture: THREE.DataTexture | null = null;
/** The atlas as one mipmapped texture, made on first use. */
export function emblemTexture(): THREE.DataTexture {
  if (!texture) texture = atlasTexture(emblemAtlas(), COLS * EMBLEM_CELL, ROWS * EMBLEM_CELL);
  return texture;
}
export function atlasTexture(data: Uint8Array, w: number, h: number): THREE.DataTexture {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}
