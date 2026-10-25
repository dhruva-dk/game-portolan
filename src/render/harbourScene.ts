// WP26 the title and the harbour drawn as a chart-maker's illustrations: iron-gall ink line, hatching and transparent
// washes laid on a transparent canvas over the parchment page, which shows through every wash. Each sheet is drawn once
// per layout at a capped pixel count; the screens then move the pieces (the ship rides the swell about her waterline,
// the lamps breathe, the lighthouse beam turns, the planet spins under its graticule, the gull wheels).
import * as THREE from 'three';
import type { Rect } from '../ui/safeArea.ts';

type Ctx = CanvasRenderingContext2D;
type Rnd = () => number;
type Path = (g: Ctx) => void;

/** The illustration's pen and washes (sRGB), after style/palette.ts. */
export const INK = '#2a1e14';
export const WASH = {
  sky: '#7d9db3', dusk: '#d9875f', rose: '#c56f78', sea: '#3c7390', deep: '#285470', verdigris: '#4f8b77', ochre: '#c99238',
  umber: '#7b4e2a', vermilion: '#b9432b', gold: '#c8a046', green: '#6f8b4b', stone: '#a08f72', lead: '#f4ecdb', ultramarine: '#3b4f9a',
  iron: '#3a332c', grey: '#8f989f',
} as const;
/** The tiers' pigments, iron-gall to vermilion, for the gull's plumage marks. */
export const TIER_HEX = [WASH.iron, WASH.verdigris, WASH.ultramarine, WASH.vermilion] as const;
const PIGMENT_HEX: Record<string, string> = {
  vermilion: WASH.vermilion, black: '#2b2622', ironGrey: '#5d5f63', ochre: WASH.ochre, verdigris: WASH.verdigris, ultramarine: WASH.ultramarine,
  gold: WASH.gold, goldLeaf: WASH.gold, white: WASH.lead, leadWhite: WASH.lead, umber: WASH.umber, malachite: '#4f9a5c', indigo: '#2f3f6b',
  roseMadder: '#b8576b', sepia: '#704a2c', azure: '#4f86b8', green: WASH.green, purple: '#6b3f6e', red: WASH.vermilion, blue: WASH.ultramarine,
};
const hashStr = (s: string): number => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
export const pigmentHex = (name: string): string => PIGMENT_HEX[name] ?? `hsl(${hashStr(name) % 360} 42% 44%)`;

export function rng(seed: number): Rnd {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ——— sheets ———

export interface Sheet { readonly canvas: HTMLCanvasElement; readonly g: Ctx; readonly w: number; readonly h: number }
/** The UI camera has y down (CSS px from the top left), so canvas rows go on as they are. */
export const FLIP_Y = false;

/** A transparent canvas of w × h CSS px at up to `dpr`, held under `maxPixels`. */
export function sheet(w: number, h: number, maxPixels: number, dpr: number): Sheet {
  const k = Math.max(0.5, Math.min(dpr, Math.sqrt(maxPixels / Math.max(1, w * h))));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * k));
  canvas.height = Math.max(1, Math.round(h * k));
  const g = canvas.getContext('2d')!;
  g.scale(canvas.width / w, canvas.height / h);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { canvas, g, w, h };
}
export const bytesOf = (s: Sheet): number => s.canvas.width * s.canvas.height * 4;

export function sheetMesh(s: Sheet, opacity = 1): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const map = new THREE.CanvasTexture(s.canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = FLIP_Y;
  map.generateMipmaps = false;
  map.minFilter = THREE.LinearFilter;
  return new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.h), new THREE.MeshBasicMaterial({
    map, transparent: true, opacity, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
  }));
}

/** Take a tree of interface meshes apart, freeing what each holds (lettering returns its rasters to the cache). */
export function drop(o: THREE.Object3D): void {
  for (const c of [...o.children]) {
    drop(c);
    o.remove(c);
  }
  const d = o as unknown as { dispose?: () => void };
  if (o instanceof THREE.Mesh && !(typeof d.dispose === 'function' && !(o.material instanceof THREE.MeshBasicMaterial) && 'text' in o)) {
    o.geometry.dispose();
    const ms = (Array.isArray(o.material) ? o.material : [o.material]) as (THREE.Material & { map?: THREE.Texture | null })[];
    for (const m of ms) { m.map?.dispose(); m.dispose(); }
  } else d.dispose?.();
}

// ——— the pen ———

function fill(g: Ctx, p: Path, color: string, alpha: number): void {
  g.save(); g.globalAlpha = alpha; g.fillStyle = color; p(g); g.fill(); g.restore();
}
/** A transparent wash: two jittered layers and a darker pooled edge. */
function wash(g: Ctx, p: Path, color: string, alpha: number, r: Rnd, edge = true): void {
  g.save();
  g.fillStyle = color;
  g.strokeStyle = color;
  for (let pass = 0; pass < 2; pass++) {
    g.save();
    g.translate((r() - 0.5) * 1.6, (r() - 0.5) * 1.6);
    g.globalAlpha = alpha * (pass ? 0.42 : 0.72);
    p(g);
    g.fill();
    if (edge) { g.globalAlpha = alpha * 0.5; g.lineWidth = 1.3; g.stroke(); }
    g.restore();
  }
  g.restore();
}
function hatch(g: Ctx, clip: Path, x: number, y: number, w: number, h: number, angle: number, gap: number, color: string, width: number, alpha: number, r: Rnd): void {
  g.save();
  clip(g);
  g.clip();
  g.strokeStyle = color; g.lineWidth = width; g.globalAlpha = alpha;
  const c = Math.cos(angle), s = Math.sin(angle), d = Math.hypot(w, h), cx = x + w / 2, cy = y + h / 2;
  g.beginPath();
  for (let t = -d / 2; t <= d / 2; t += gap) {
    const j = t + (r() - 0.5) * gap * 0.35, ox = cx - s * j, oy = cy + c * j;
    g.moveTo(ox - (c * d) / 2, oy - (s * d) / 2);
    g.lineTo(ox + (c * d) / 2, oy + (s * d) / 2);
  }
  g.stroke();
  g.restore();
}
function stroke(g: Ctx, p: Path, width: number, alpha = 1, color: string = INK): void {
  g.save(); g.strokeStyle = color; g.lineWidth = width; g.globalAlpha = alpha; p(g); g.stroke(); g.restore();
}
const seg = (x0: number, y0: number, x1: number, y1: number): Path => (q) => { q.beginPath(); q.moveTo(x0, y0); q.lineTo(x1, y1); };

// ——— the ship ———

export interface ShipPoints { mainTop: [number, number]; lantern: [number, number]; bow: [number, number]; stern: [number, number] }
/** A ship of FORM `form` (pinnace … galleon) side on, bow to the right, moored with her sails furled on the yards. */
export function drawShip(g: Ctx, cx: number, wl: number, len: number, form: number, r: Rnd, o: { hull?: string; gull?: boolean; gullLevels?: GullMarks } = {}): ShipPoints {
  const u = len / 380, H = len * 0.15, sx = cx - len / 2, bx = cx + len / 2;
  const castle = [0, H * 0.3, H * 0.55, H * 0.7][form] ?? 0, fore = [0, 0, H * 0.4, H * 0.45][form] ?? 0;
  const hull: Path = (q) => {
    q.beginPath();
    q.moveTo(sx + len * 0.02, wl - H * 1.05 - castle);
    q.lineTo(sx + len * 0.25, wl - H * 1.02 - castle);
    q.lineTo(sx + len * 0.27, wl - H * 0.95);
    q.quadraticCurveTo(cx + len * 0.05, wl - H * 0.72, bx - len * 0.2, wl - H * 0.9);
    if (fore) { q.lineTo(bx - len * 0.19, wl - H * 0.92 - fore); q.lineTo(bx - len * 0.03, wl - H * 0.98 - fore); }
    q.quadraticCurveTo(bx + len * 0.01, wl - H * 1.0 - fore * 0.5, bx + len * 0.03, wl - H * 0.86);
    q.quadraticCurveTo(bx - len * 0.01, wl - H * 0.05, bx - len * 0.13, wl + H * 0.32);
    q.quadraticCurveTo(cx, wl + H * 0.46, sx + len * 0.1, wl + H * 0.3);
    q.lineTo(sx - len * 0.005, wl - H * 0.5);
    q.closePath();
  };
  type Rig = { at: number; h: number; lateen: boolean };
  const rigs: Rig[] = ([
    [{ at: 0.02, h: 0.8, lateen: true }],
    [{ at: 0.12, h: 0.78, lateen: true }, { at: -0.18, h: 0.62, lateen: true }],
    [{ at: 0.24, h: 0.66, lateen: false }, { at: 0.02, h: 0.84, lateen: false }, { at: -0.24, h: 0.58, lateen: true }],
    [{ at: 0.27, h: 0.68, lateen: false }, { at: 0.05, h: 0.86, lateen: false }, { at: -0.15, h: 0.66, lateen: false }, { at: -0.32, h: 0.52, lateen: true }],
  ] as Rig[][])[form] ?? [];
  const main = rigs.reduce((a, b) => (b.h > a.h ? b : a), rigs[0]!);
  const mx = (m: Rig) => cx + m.at * len, top = (m: Rig) => wl - len * m.h;
  const sternTop: [number, number] = [sx + len * 0.02, wl - H * 1.05 - castle];
  const sprit: [number, number] = fore ? [bx + len * 0.13, wl - H * 1.45 - fore] : [bx + len * 0.03, wl - H * 0.9];

  // shrouds and stays behind the masts
  for (const m of rigs) {
    const x = mx(m), t = top(m), from = t + len * m.h * 0.22, foot = wl - H * 0.82;
    for (const d of [-0.07, -0.045, -0.02, 0.03]) stroke(g, seg(x, from, x + d * len, foot), 0.5 * u + 0.25, 0.75);
    if (m === main) {
      g.save(); g.strokeStyle = INK; g.globalAlpha = 0.55; g.lineWidth = 0.4 * u + 0.2; g.beginPath();
      for (let y = foot - 4 * u; y > from + 6 * u; y -= 5.5 * u + 1) {
        const f = (foot - y) / (foot - from);
        g.moveTo(x - 0.07 * len * (1 - f), y); g.lineTo(x - 0.02 * len * (1 - f), y);
      }
      g.stroke(); g.restore();
    }
  }
  const first = rigs.reduce((a, b) => (b.at > a.at ? b : a), rigs[0]!), last = rigs.reduce((a, b) => (b.at < a.at ? b : a), rigs[0]!);
  stroke(g, seg(mx(first), top(first) + len * 0.02, sprit[0], sprit[1]), 0.6 * u + 0.3, 0.85);
  stroke(g, seg(mx(last), top(last) + len * 0.02, sternTop[0] + len * 0.01, sternTop[1]), 0.6 * u + 0.3, 0.85);
  if (fore) stroke(g, seg(bx - len * 0.04, wl - H * 0.95 - fore * 0.6, sprit[0], sprit[1]), 2.2 * u + 0.5);

  // the hull, the sea hiding what lies below her waterline
  g.save();
  g.beginPath(); g.rect(sx - len, wl - len * 2, len * 3, len * 2 + H * 0.12); g.clip();
  wash(g, hull, o.hull ?? WASH.umber, 0.66, r);
  g.save(); hull(g); g.clip();
  hatch(g, (q) => { q.beginPath(); q.rect(sx - 10, wl - H * 0.5, len + 20, H); }, sx - 10, wl - H * 0.6, len + 20, H * 1.2, 0.95, 2.6 * u + 0.8, INK, 0.6 * u + 0.25, 0.5, r);
  if (castle) fill(g, (q) => { q.beginPath(); q.rect(sx, wl - H * 1.1 - castle, len * 0.27, castle + H * 0.1); }, WASH.ochre, 0.3);
  g.restore();
  for (const k of [0.6, 0.42]) stroke(g, (q) => { q.beginPath(); q.moveTo(sx + len * 0.01, wl - H * (k + 0.12)); q.quadraticCurveTo(cx, wl - H * (k - 0.12), bx - len * 0.01, wl - H * (k + 0.1)); }, 1.1 * u + 0.4);
  if (form >= 2) {
    const n = form * 3 + 1, y0 = wl - H * 0.74, yc = wl - H * 0.5, y1 = wl - H * 0.72, x0 = sx + len * 0.01, span = len * 0.98, p = 3.6 * u + 1.2;
    for (let i = 0; i < n; i++) {
      const x = sx + len * 0.3 + (i * len * 0.45) / (n - 1), t = (x - x0) / span, y = (1 - t) * (1 - t) * y0 + 2 * t * (1 - t) * yc + t * t * y1;
      fill(g, (q) => { q.beginPath(); q.rect(x - p / 2, y + p * 0.4, p, p); }, INK, 0.8);
    }
  }
  if (castle) for (let i = 0; i < 3; i++) stroke(g, (q) => { q.beginPath(); q.rect(sx + len * (0.06 + i * 0.06), wl - H * 1.0 - castle * 0.62, 4 * u + 1, 5 * u + 1); }, 0.6 * u + 0.3, 0.8);
  stroke(g, hull, 1.6 * u + 0.5);
  g.restore();
  // her waterline and the ripples along it
  g.save(); g.strokeStyle = INK; g.globalAlpha = 0.7; g.lineWidth = 0.9 * u + 0.3; g.beginPath();
  for (let x = sx - len * 0.06; x < bx + len * 0.08; x += 9 * u + 2) { const l = (5 + r() * 9) * u + 1; g.moveTo(x, wl + H * 0.1 + (r() - 0.5) * 2 * u); g.quadraticCurveTo(x + l / 2, wl + H * 0.06, x + l, wl + H * 0.1); }
  g.stroke(); g.restore();

  // masts, yards and the furled sails
  const bundle = (x0: number, y0: number, x1: number, y1: number, fat: number): void => {
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / (9 * u + 3)));
    const nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1, ox = (nx / nl) * fat, oy = (ny / nl) * fat;
    const p: Path = (q) => {
      q.beginPath(); q.moveTo(x0, y0);
      for (let i = 0; i < n; i++) {
        const a = i / n, b = (i + 1) / n, m = (a + b) / 2;
        q.quadraticCurveTo(x0 + (x1 - x0) * m + ox * 2, y0 + (y1 - y0) * m + Math.abs(oy) * 2 + fat, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
      }
      q.closePath();
    };
    fill(g, p, WASH.lead, 0.92);
    stroke(g, p, 0.7 * u + 0.3, 0.9);
  };
  for (const m of rigs) {
    const x = mx(m), t = top(m), foot = wl - H * 0.85;
    stroke(g, seg(x, foot, x, t + len * m.h * 0.3), 2.8 * u + 0.6);
    stroke(g, seg(x, t + len * m.h * 0.3, x, t), 1.7 * u + 0.4);
    if (!m.lateen) {
      fill(g, (q) => { q.beginPath(); q.moveTo(x - 6 * u, t + len * m.h * 0.3); q.lineTo(x + 6 * u, t + len * m.h * 0.3); q.lineTo(x + 4 * u, t + len * m.h * 0.3 + 5 * u); q.lineTo(x - 4 * u, t + len * m.h * 0.3 + 5 * u); q.closePath(); }, WASH.umber, 0.8);
      [[0.12, 0.15], [0.38, 0.23], [0.62, 0.3]].forEach(([at, w]) => {
        const y = t + len * m.h * at!, half = (len * w! * (m === main ? 1 : 0.85)) / 2;
        stroke(g, (q) => { q.beginPath(); q.moveTo(x - half, y + 1.5 * u); q.quadraticCurveTo(x, y - 1.5 * u, x + half, y + 1.5 * u); }, 1.5 * u + 0.4);
        bundle(x - half * 0.94, y + 1.5 * u, x + half * 0.94, y + 1.5 * u, 2.6 * u + 0.6);
      });
    } else {
      const ax = x + len * 0.17, ay = foot - len * m.h * 0.14, bxx = x - len * 0.2, by = t + len * 0.02;
      stroke(g, seg(ax, ay, bxx, by), 1.5 * u + 0.4);
      bundle(ax - (ax - bxx) * 0.05, ay - (ay - by) * 0.05, bxx + (ax - bxx) * 0.06, by + (ay - by) * 0.06, 2.4 * u + 0.6);
    }
  }
  // the pennant at the main truck and the ensign at the stern
  const [px, py] = [mx(main), top(main)];
  const pennant: Path = (q) => {
    q.beginPath(); q.moveTo(px, py + 2 * u);
    q.bezierCurveTo(px - len * 0.06, py - 3 * u, px - len * 0.12, py + 8 * u, px - len * 0.2, py + 3 * u);
    q.bezierCurveTo(px - len * 0.12, py + 11 * u, px - len * 0.06, py + 4 * u, px, py + 7 * u);
    q.closePath();
  };
  wash(g, pennant, WASH.vermilion, 0.8, r); stroke(g, pennant, 0.6 * u + 0.3);
  const [ex, ey] = sternTop;
  stroke(g, seg(ex, ey, ex - len * 0.03, ey - len * 0.09), 1.1 * u + 0.3);
  const flag: Path = (q) => { q.beginPath(); q.moveTo(ex - len * 0.03, ey - len * 0.09); q.quadraticCurveTo(ex - len * 0.07, ey - len * 0.1, ex - len * 0.1, ey - len * 0.085); q.lineTo(ex - len * 0.095, ey - len * 0.055); q.quadraticCurveTo(ex - len * 0.06, ey - len * 0.065, ex - len * 0.03, ey - len * 0.055); q.closePath(); };
  wash(g, flag, WASH.gold, 0.75, r); stroke(g, flag, 0.6 * u + 0.3);
  // the stern lantern
  const lantern: [number, number] = [ex + len * 0.05, ey - 9 * u];
  stroke(g, seg(lantern[0], ey, lantern[0], lantern[1] + 3 * u), 1 * u + 0.3);
  const cage: Path = (q) => { q.beginPath(); q.rect(lantern[0] - 2.5 * u, lantern[1] - 4 * u, 5 * u, 7 * u); };
  fill(g, cage, WASH.ochre, 0.8); stroke(g, cage, 0.7 * u + 0.3);
  if (o.gull) drawGull(g, px + 0.5 * u, py - 1 * u, len * 0.06, r, o.gullLevels ?? {});
  return { mainTop: [px, py], lantern, bow: [bx - len * 0.02, wl - H * 0.9], stern: [sx + len * 0.05, wl - H * 1.0] };
}

// ——— the gull ———

export interface GullMarks { marks?: readonly string[]; goldTips?: boolean }
/** The gull perched with its feet at (x, y), facing right, `s` its length; its plumage marks along the folded wing. */
export function drawGull(g: Ctx, x: number, y: number, s: number, r: Rnd, o: GullMarks = {}): void {
  const lw = Math.max(0.6, s * 0.035);
  stroke(g, (q) => { q.beginPath(); q.moveTo(x - s * 0.04, y - s * 0.24); q.lineTo(x - s * 0.07, y); q.moveTo(x + s * 0.07, y - s * 0.24); q.lineTo(x + s * 0.06, y); }, lw * 1.3, 1, WASH.ochre);
  const body: Path = (q) => { q.beginPath(); q.ellipse(x, y - s * 0.42, s * 0.42, s * 0.21, -0.14, 0, Math.PI * 2); };
  const tail: Path = (q) => { q.beginPath(); q.moveTo(x - s * 0.3, y - s * 0.46); q.lineTo(x - s * 0.66, y - s * 0.42); q.lineTo(x - s * 0.3, y - s * 0.32); q.closePath(); };
  fill(g, tail, WASH.lead, 0.97); stroke(g, tail, lw);
  fill(g, body, WASH.lead, 0.98); stroke(g, body, lw);
  const wing: Path = (q) => { q.beginPath(); q.moveTo(x + s * 0.26, y - s * 0.55); q.quadraticCurveTo(x - s * 0.05, y - s * 0.7, x - s * 0.64, y - s * 0.5); q.quadraticCurveTo(x - s * 0.2, y - s * 0.34, x + s * 0.22, y - s * 0.41); q.closePath(); };
  wash(g, wing, WASH.grey, 0.8, r);
  const tip: Path = (q) => { q.beginPath(); q.moveTo(x - s * 0.32, y - s * 0.6); q.quadraticCurveTo(x - s * 0.5, y - s * 0.58, x - s * 0.7, y - s * 0.49); q.quadraticCurveTo(x - s * 0.46, y - s * 0.44, x - s * 0.3, y - s * 0.47); q.closePath(); };
  fill(g, tip, o.goldTips ? WASH.gold : '#26221f', 0.92);
  const marks = o.marks ?? [];
  marks.forEach((color, i) => {
    const p = (i + 0.5) / marks.length, fx = x + s * 0.16 - p * s * 0.5, fy = y - s * 0.56 + p * s * 0.04;
    stroke(g, (q) => { q.beginPath(); q.moveTo(fx, fy); q.quadraticCurveTo(fx - s * 0.04, fy + s * 0.05, fx - s * 0.1, fy + s * 0.08); }, lw * 1.8, 0.9, color);
  });
  stroke(g, wing, lw);
  const head: Path = (q) => { q.beginPath(); q.arc(x + s * 0.36, y - s * 0.72, s * 0.15, 0, Math.PI * 2); };
  fill(g, (q) => { q.beginPath(); q.moveTo(x + s * 0.2, y - s * 0.58); q.lineTo(x + s * 0.3, y - s * 0.78); q.lineTo(x + s * 0.46, y - s * 0.66); q.lineTo(x + s * 0.36, y - s * 0.5); q.closePath(); }, WASH.lead, 0.98);
  fill(g, head, WASH.lead, 0.98); stroke(g, head, lw);
  const beak: Path = (q) => { q.beginPath(); q.moveTo(x + s * 0.49, y - s * 0.76); q.lineTo(x + s * 0.7, y - s * 0.71); q.lineTo(x + s * 0.49, y - s * 0.66); q.closePath(); };
  fill(g, beak, WASH.ochre, 0.95); stroke(g, beak, lw * 0.8);
  fill(g, (q) => { q.beginPath(); q.arc(x + s * 0.4, y - s * 0.75, s * 0.022 + 0.35, 0, Math.PI * 2); }, INK, 1);
}

/** The gull in flight, wings in a shallow M, centred on (x, y). */
export function drawFlyingGull(g: Ctx, x: number, y: number, span: number, r: Rnd): void {
  const lw = Math.max(0.7, span * 0.025);
  const wing: Path = (q) => { q.beginPath(); q.moveTo(x, y); q.quadraticCurveTo(x - span * 0.16, y - span * 0.2, x - span * 0.32, y - span * 0.12); q.quadraticCurveTo(x - span * 0.42, y - span * 0.07, x - span * 0.5, y + span * 0.03); q.quadraticCurveTo(x - span * 0.3, y - span * 0.02, x, y + span * 0.07); q.closePath(); };
  const tip: Path = (q) => { q.beginPath(); q.moveTo(x - span * 0.38, y - span * 0.09); q.quadraticCurveTo(x - span * 0.45, y - span * 0.05, x - span * 0.5, y + span * 0.03); q.quadraticCurveTo(x - span * 0.42, y + span * 0.0, x - span * 0.36, y - span * 0.01); q.closePath(); };
  for (const side of [1, -1]) {
    g.save(); g.translate(x, 0); g.scale(side, 1); g.translate(-x, 0);
    wash(g, wing, WASH.grey, 0.55, r); fill(g, tip, '#26221f', 0.9); stroke(g, wing, lw);
    g.restore();
  }
  const body: Path = (q) => { q.beginPath(); q.ellipse(x, y + span * 0.05, span * 0.1, span * 0.045, 0, 0, Math.PI * 2); };
  fill(g, body, WASH.lead, 1); stroke(g, body, lw);
  fill(g, (q) => { q.beginPath(); q.arc(x + span * 0.11, y + span * 0.03, span * 0.035, 0, Math.PI * 2); }, WASH.lead, 1);
  stroke(g, (q) => { q.beginPath(); q.arc(x + span * 0.11, y + span * 0.03, span * 0.035, 0, Math.PI * 2); }, lw);
}

/** Plumage from the gull's levels: a mark in the pigment of each level reached, gold-leaf tips at the top of all. */
export function gullMarks(levels: readonly number[], tops: readonly number[]): GullMarks {
  const marks: string[] = [];
  levels.forEach((l) => { for (let i = 0; i < l; i++) marks.push(TIER_HEX[Math.min(i, TIER_HEX.length - 1)]!); });
  return { marks, goldTips: levels.every((l, i) => l >= (tops[i] ?? 0)) };
}

// ——— small sheets: a ship for the shipwright, the gull's portrait, a captain's emblem ———

export function shipSheet(w: number, h: number, form: number, dpr: number): Sheet {
  const s = sheet(w, h, 0.5e6, dpr), len = Math.min(w * 0.74, h * 1.02), r = rng(7 + form);
  drawShip(s.g, w * 0.45, h * 0.9, len, form, r);
  return s;
}

export function gullSheet(w: number, h: number, marks: GullMarks, dpr: number): Sheet {
  const sh = sheet(w, h, 0.6e6, dpr), g = sh.g, r = rng(23);
  const feet = h * 0.76, size = Math.min(w / 1.5, (h * 0.72) / 0.9);
  const post: Path = (q) => { q.beginPath(); q.moveTo(w * 0.44, feet); q.lineTo(w * 0.56, feet); q.lineTo(w * 0.57, h); q.lineTo(w * 0.43, h); q.closePath(); };
  wash(g, post, WASH.umber, 0.6, r);
  hatch(g, post, w * 0.4, feet, w * 0.2, h - feet, 1.4, 3, INK, 0.6, 0.5, r);
  stroke(g, post, 1);
  stroke(g, (q) => { q.beginPath(); q.ellipse(w * 0.5, feet, w * 0.07, h * 0.012, 0, 0, Math.PI * 2); }, 1);
  drawGull(g, w * 0.5, feet, size, r, marks);
  return sh;
}

export function emblemSheet(w: number, h: number, pigments: readonly [string, string], emblem: string, dpr: number): Sheet {
  const sh = sheet(w, h, 0.08e6, dpr), g = sh.g, r = rng(hashStr(emblem));
  const shield: Path = (q) => { q.beginPath(); q.moveTo(w * 0.1, h * 0.08); q.lineTo(w * 0.9, h * 0.08); q.lineTo(w * 0.9, h * 0.5); q.quadraticCurveTo(w * 0.88, h * 0.82, w * 0.5, h * 0.95); q.quadraticCurveTo(w * 0.12, h * 0.82, w * 0.1, h * 0.5); q.closePath(); };
  for (const [i, x] of [[0, 0], [1, w / 2]] as const) {
    g.save(); g.beginPath(); g.rect(x, 0, w / 2, h); g.clip();
    wash(g, shield, pigmentHex(pigments[i]), 0.85, r, false);
    g.restore();
  }
  const cx = w / 2, cy = h * 0.45, k = Math.min(w, h) * 0.2;
  const charge: Path = [
    (q: Ctx) => { q.beginPath(); q.arc(cx, cy, k, 0, Math.PI * 2); },
    (q: Ctx) => { q.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? k * 0.45 : k * 1.1; q.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } q.closePath(); },
    (q: Ctx) => { q.beginPath(); q.moveTo(cx - k * 1.3, cy + k * 0.8); q.lineTo(cx, cy - k * 0.6); q.lineTo(cx + k * 1.3, cy + k * 0.8); q.lineTo(cx + k * 0.9, cy + k * 1.1); q.lineTo(cx, cy); q.lineTo(cx - k * 0.9, cy + k * 1.1); q.closePath(); },
    (q: Ctx) => { q.beginPath(); q.rect(cx - k * 0.25, cy - k * 1.1, k * 0.5, k * 2.2); q.rect(cx - k * 1.1, cy - k * 0.25, k * 2.2, k * 0.5); },
    (q: Ctx) => { q.beginPath(); q.arc(cx, cy, k, Math.PI * 0.15, Math.PI * 1.85); q.arc(cx + k * 0.45, cy, k * 0.8, Math.PI * 1.75, Math.PI * 0.25, true); q.closePath(); },
  ][hashStr(emblem) % 5]!;
  fill(g, charge, WASH.lead, 0.95); stroke(g, charge, 0.8);
  stroke(g, shield, 1.1);
  return sh;
}

// ——— the harbour ———

export interface HarbourArt { readonly group: THREE.Group; readonly bytes: number; frame(t: number, still: boolean): void }

function glowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!, grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,140,0.95)'); grad.addColorStop(0.35, 'rgba(240,170,80,0.45)'); grad.addColorStop(1, 'rgba(240,170,80,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The harbour at dusk, w × h CSS px: the sky and far shore with the lighthouse, the sea, the player's ship of FORM
 * `form` at her mooring with the gull on the masthead, the quay with its lamps in front. */
export function harbourArt(w: number, h: number, form: number, marks: GullMarks, dpr: number): HarbourArt {
  const r = rng(1525 + form), group = new THREE.Group(), sc = Math.min(w / 956, h / 440);
  const horizon = h * 0.56;
  let bytes = 0;
  const add = (s: Sheet, x: number, y: number, order: number, parent: THREE.Object3D = group) => {
    const m = sheetMesh(s); m.position.set(x, y, 0); m.renderOrder = order; parent.add(m); bytes += bytesOf(s); return m;
  };

  // the sky, the far shore with its lighthouse, the sea
  const back = sheet(w, h, 2.2e6, dpr), g = back.g;
  let grad = g.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, WASH.sky); grad.addColorStop(0.6, WASH.rose); grad.addColorStop(1, WASH.dusk);
  g.globalAlpha = 0.3; g.fillStyle = grad; g.fillRect(0, 0, w, horizon); g.globalAlpha = 1;
  const sun = g.createRadialGradient(w * 0.42, horizon, 0, w * 0.42, horizon, w * 0.36);
  sun.addColorStop(0, 'rgba(236,178,92,0.5)'); sun.addColorStop(1, 'rgba(236,178,92,0)');
  g.fillStyle = sun; g.fillRect(0, 0, w, horizon);
  for (let i = 0; i < 5; i++) {
    const x = w * (0.06 + 0.2 * i + r() * 0.08), y = h * (0.08 + r() * 0.26), cw = w * (0.12 + r() * 0.12), ch = h * (0.02 + r() * 0.02);
    const bumps = [0, 1, 2, 3, 4].map(() => 1.2 + r() * 1.6);
    const cloud: Path = (q) => {
      q.beginPath(); q.moveTo(x - cw / 2, y);
      bumps.forEach((b, j) => { const x0 = x - cw / 2 + (j / 5) * cw, x1 = x0 + cw / 5; q.quadraticCurveTo((x0 + x1) / 2, y - ch * b * Math.sin((Math.PI * (j + 0.5)) / 5), x1, y); });
      q.closePath();
    };
    wash(g, cloud, i % 2 ? WASH.rose : WASH.lead, 0.34, r, false);
    stroke(g, (q) => { q.beginPath(); for (let j = 0; j < 6; j++) { const yy = y + 2 + j * 2.3 * sc, x0 = x - cw * (0.42 - j * 0.06) + r() * 6; q.moveTo(x0, yy); q.lineTo(x0 + cw * (0.62 - j * 0.09), yy); } }, 0.7, 0.4);
  }
  for (let i = 0; i < 4; i++) {
    const bx = w * (0.3 + r() * 0.35), by = h * (0.12 + r() * 0.2), b = (3 + r() * 3) * sc;
    stroke(g, (q) => { q.beginPath(); q.moveTo(bx - b, by); q.quadraticCurveTo(bx - b / 2, by - b * 0.6, bx, by); q.quadraticCurveTo(bx + b / 2, by - b * 0.6, bx + b, by); }, 0.8, 0.7);
  }
  const leftShore: Path = (q) => { q.beginPath(); q.moveTo(0, horizon - h * 0.06); q.quadraticCurveTo(w * 0.12, horizon - h * 0.1, w * 0.22, horizon - h * 0.04); q.quadraticCurveTo(w * 0.3, horizon - h * 0.015, w * 0.38, horizon); q.lineTo(0, horizon); q.closePath(); };
  wash(g, leftShore, '#7f8f6c', 0.32, r); stroke(g, leftShore, 0.8, 0.6);
  const rightShore: Path = (q) => { q.beginPath(); q.moveTo(w * 0.52, horizon); q.quadraticCurveTo(w * 0.58, horizon - h * 0.05, w * 0.64, horizon - h * 0.072); q.quadraticCurveTo(w * 0.7, horizon - h * 0.085, w * 0.78, horizon - h * 0.06); q.quadraticCurveTo(w * 0.9, horizon - h * 0.04, w, horizon - h * 0.045); q.lineTo(w, horizon); q.closePath(); };
  wash(g, rightShore, WASH.green, 0.4, r);
  hatch(g, rightShore, w * 0.5, horizon - h * 0.1, w * 0.5, h * 0.1, 1.2, 3 * sc, INK, 0.5, 0.32, r);
  stroke(g, rightShore, 1, 0.8);
  const lx = w * 0.655, lb = horizon - h * 0.074, th = h * 0.15, tw = Math.max(7, w * 0.014);
  const tower: Path = (q) => { q.beginPath(); q.moveTo(lx - tw / 2, lb); q.lineTo(lx - tw * 0.36, lb - th); q.lineTo(lx + tw * 0.36, lb - th); q.lineTo(lx + tw / 2, lb); q.closePath(); };
  fill(g, tower, WASH.lead, 0.95);
  g.save(); tower(g); g.clip();
  for (const [a, b] of [[0.28, 0.4], [0.6, 0.72]] as const) fill(g, (q) => { q.beginPath(); q.rect(lx - tw, lb - th * b, tw * 2, th * (b - a)); }, WASH.vermilion, 0.6);
  g.restore();
  hatch(g, tower, lx, lb - th, tw / 2, th, 1.3, 2.2, INK, 0.5, 0.45, r);
  stroke(g, tower, 1);
  const room: Path = (q) => { q.beginPath(); q.rect(lx - tw * 0.3, lb - th - tw * 0.75, tw * 0.6, tw * 0.75); };
  fill(g, room, WASH.ochre, 0.85); stroke(g, room, 0.9);
  const roof: Path = (q) => { q.beginPath(); q.moveTo(lx - tw * 0.45, lb - th - tw * 0.75); q.lineTo(lx, lb - th - tw * 1.3); q.lineTo(lx + tw * 0.45, lb - th - tw * 0.75); q.closePath(); };
  wash(g, roof, WASH.vermilion, 0.7, r); stroke(g, roof, 0.9);
  stroke(g, seg(lx - tw * 0.55, lb - th, lx + tw * 0.55, lb - th), 1.1);
  const lamp: [number, number] = [lx, lb - th - tw * 0.38];
  const hut: Path = (q) => { q.beginPath(); q.rect(lx + tw * 1.1, lb - tw * 1.3, tw * 1.8, tw * 1.3); };
  fill(g, hut, WASH.lead, 0.9); stroke(g, hut, 0.8);
  stroke(g, (q) => { q.beginPath(); q.moveTo(lx + tw, lb - tw * 1.3); q.lineTo(lx + tw * 2, lb - tw * 2); q.lineTo(lx + tw * 3, lb - tw * 1.3); }, 0.8);
  fill(g, (q) => { q.beginPath(); q.rect(lx + tw * 1.7, lb - tw * 0.95, tw * 0.45, tw * 0.45); }, WASH.ochre, 0.9);
  grad = g.createLinearGradient(0, horizon, 0, h);
  grad.addColorStop(0, 'rgba(214,150,108,0.28)'); grad.addColorStop(0.35, 'rgba(60,115,144,0.3)'); grad.addColorStop(1, 'rgba(40,84,112,0.42)');
  g.fillStyle = grad; g.fillRect(0, horizon, w, h - horizon);
  stroke(g, (q) => { q.beginPath(); for (let x = 0; x < w; x += 40 + r() * 60) { q.moveTo(x, horizon); q.lineTo(x + 30 + r() * 50, horizon); } }, 0.8, 0.6);
  for (let i = 0; i < 30; i++) {
    const t = (i + 1) / 30, y = horizon + (h - horizon) * Math.pow(t, 1.45);
    g.save(); g.lineWidth = 0.45 + t * 0.7; g.globalAlpha = 0.22 + 0.3 * t; g.strokeStyle = i % 3 === 0 ? WASH.deep : INK; g.beginPath();
    for (let x = -r() * 40; x < w;) {
      const l = (5 + r() * 16) * (0.5 + t * 1.6) * sc;
      g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - (0.8 + t) * sc, x + l, y);
      x += l + (8 + r() * 30) * (0.6 + t) * sc;
    }
    g.stroke(); g.restore();
  }
  for (let i = 0; i < 28; i++) {
    const t = i / 28, y = horizon + 3 + h * 0.26 * t, half = 6 + t * w * 0.05;
    const x0 = w * 0.42 + (r() - 0.5) * half * 2, x1 = lx + (r() - 0.5) * (3 + t * 14);
    stroke(g, seg(x0, y, x0 + 4 + r() * 10 * (1 + t), y), 1.2, 0.6 * (1 - t), WASH.ochre);
    if (t < 0.5) stroke(g, seg(x1, y, x1 + 2 + r() * 5, y), 1, 0.6 * (1 - 2 * t), WASH.ochre);
  }
  add(back, w / 2, h / 2, 1);

  // the beam turning above the far shore
  const beamC = document.createElement('canvas');
  beamC.width = 256; beamC.height = 64;
  const bg = beamC.getContext('2d')!, bgr = bg.createLinearGradient(0, 0, 256, 0);
  bgr.addColorStop(0, 'rgba(255,226,160,0.8)'); bgr.addColorStop(1, 'rgba(255,226,160,0)');
  bg.fillStyle = bgr; bg.beginPath(); bg.moveTo(0, 30); bg.lineTo(256, 0); bg.lineTo(256, 64); bg.lineTo(0, 34); bg.closePath(); bg.fill();
  const beamTex = new THREE.CanvasTexture(beamC);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  const beamLen = w * 0.22;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(beamLen, h * 0.05).translate(beamLen / 2, 0, 0), new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
  beam.position.set(lamp[0], lamp[1], 0); beam.renderOrder = 1.5; group.add(beam);

  // the ship at her mooring, riding the swell about her waterline
  const len = Math.min(w * 0.36, h * 0.95), shipX = w * 0.26, wl = h * 0.835;
  const sw = len * 1.26, sh = len * 1.04, lcx = len * 0.56, lwl = len * 0.95;
  const ss = sheet(sw, sh, 1.6e6, dpr);
  const pts = drawShip(ss.g, lcx, lwl, len, form, r, { gull: true, gullLevels: marks });
  const rider = new THREE.Group();
  rider.position.set(shipX, wl, 0); group.add(rider);
  add(ss, sw / 2 - lcx, sh / 2 - lwl, 2, rider);
  const world = (p: [number, number]): [number, number] => [shipX + p[0] - lcx, wl + p[1] - lwl];

  // the quay in front of her: stones, bollards and lines, lamps, a barrel and a crate
  const fh = h * 0.42, fw = w * 0.56, fy = h - fh, front = sheet(fw, fh, 0.9e6, dpr), f = front.g;
  f.translate(0, -fy);
  const qTop = h * 0.835, qEdge = h * 0.865;
  const surface: Path = (q) => { q.beginPath(); q.moveTo(0, qTop); q.lineTo(w * 0.47, qTop); q.lineTo(w * 0.5, qEdge); q.lineTo(0, qEdge); q.closePath(); };
  const face: Path = (q) => { q.beginPath(); q.moveTo(0, qEdge); q.lineTo(w * 0.5, qEdge); q.lineTo(w * 0.5, h); q.lineTo(0, h); q.closePath(); };
  wash(f, surface, '#cdbb98', 0.7, r); wash(f, face, WASH.stone, 0.75, r);
  hatch(f, face, 0, qEdge, w * 0.5, h - qEdge, Math.PI / 2, 3.2 * sc, INK, 0.5, 0.3, r);
  f.save(); face(f); f.clip();
  const course = Math.max(8, h * 0.028);
  for (let y = qEdge + course, k = 0; y < h + course; y += course, k++) {
    stroke(f, seg(0, y, w * 0.5, y), 0.8, 0.7);
    for (let x = (k % 2) * w * 0.025; x < w * 0.5; x += w * 0.05) stroke(f, seg(x, y - course, x, y), 0.7, 0.6);
  }
  f.restore();
  stroke(f, surface, 1.2); stroke(f, face, 1.2);
  const lamps: [number, number][] = [];
  for (const x of [w * 0.035, w * 0.31]) {
    const top = qTop - h * 0.2;
    stroke(f, seg(x, (qTop + qEdge) / 2, x, top + h * 0.03), 2 * sc + 0.4);
    const cage: Path = (q) => { q.beginPath(); q.rect(x - w * 0.006, top, w * 0.012, h * 0.03); };
    fill(f, cage, WASH.ochre, 0.7); stroke(f, cage, 1);
    stroke(f, (q) => { q.beginPath(); q.moveTo(x - w * 0.009, top); q.lineTo(x, top - h * 0.018); q.lineTo(x + w * 0.009, top); }, 1);
    lamps.push([x, top + h * 0.015]);
  }
  const moor = (bxx: number, to: [number, number]) => {
    const by = (qTop + qEdge) / 2 - h * 0.012;
    const post: Path = (q) => { q.beginPath(); q.rect(bxx - w * 0.006, by, w * 0.012, h * 0.022); };
    fill(f, post, WASH.iron, 0.75); stroke(f, post, 1);
    stroke(f, (q) => { q.beginPath(); q.ellipse(bxx, by, w * 0.008, h * 0.005, 0, 0, Math.PI * 2); }, 1);
    stroke(f, (q) => { q.beginPath(); q.moveTo(bxx, by); q.quadraticCurveTo((bxx + to[0]) / 2, Math.max(by, to[1]) + h * 0.02, to[0], to[1]); }, 1.1 * sc + 0.3);
  };
  moor(w * 0.1, world(pts.stern));
  moor(w * 0.43, world(pts.bow));
  const barrel: Path = (q) => { q.beginPath(); q.ellipse(w * 0.2, qTop + h * 0.002, w * 0.012, h * 0.026, 0, 0, Math.PI * 2); };
  wash(f, barrel, WASH.umber, 0.7, r); stroke(f, barrel, 1);
  for (const k of [-0.012, 0.012]) stroke(f, seg(w * 0.189, qTop + h * k, w * 0.211, qTop + h * k), 0.8);
  const crate: Path = (q) => { q.beginPath(); q.rect(w * 0.215, qTop - h * 0.02, w * 0.03, h * 0.045); };
  wash(f, crate, WASH.ochre, 0.6, r); stroke(f, crate, 1);
  stroke(f, (q) => { q.beginPath(); q.moveTo(w * 0.215, qTop - h * 0.02); q.lineTo(w * 0.245, qTop + h * 0.025); q.moveTo(w * 0.245, qTop - h * 0.02); q.lineTo(w * 0.215, qTop + h * 0.025); }, 0.7, 0.7);
  add(front, fw / 2, fy + fh / 2, 3);

  // the lamplight
  const glowTex = glowTexture();
  const glows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  const glow = (p: [number, number], size: number, base: number, parent: THREE.Object3D = group) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: base, depthTest: false, depthWrite: false, toneMapped: false }));
    m.position.set(p[0], p[1], 0); m.renderOrder = 3.5; m.userData.base = base; parent.add(m); glows.push(m);
  };
  for (const p of lamps) glow(p, h * 0.16, 0.8);
  glow([pts.lantern[0] - lcx, pts.lantern[1] - lwl], h * 0.1, 0.7, rider);
  glow(lamp, h * 0.12, 0.8);
  bytes += 64 * 64 * 4 + 256 * 64 * 4;

  return {
    group,
    bytes,
    frame(t, still) {
      const k = still ? 0 : 1;
      rider.position.y = wl + Math.sin(t * 0.9) * 1.4 * sc * k;
      rider.rotation.z = Math.sin(t * 0.63 + 0.8) * 0.008 * k;
      const a = still ? 0.7 : t * 0.75, c = Math.cos(a);
      beam.scale.x = c >= 0 ? Math.max(0.04, c) : Math.min(-0.04, c);
      beam.material.opacity = 0.16 + 0.5 * Math.abs(c);
      glows.forEach((m, i) => {
        const flash = i === glows.length - 1 ? Math.pow(1 - Math.abs(c), 6) * 0.5 : 0;
        m.material.opacity = Math.min(1, (m.userData.base as number) * (0.82 + k * (0.1 * Math.sin(t * 6.1 + i * 1.7) + 0.06 * Math.sin(t * 13.7 + i))) + flash);
      });
    },
  };
}

// ——— the title ———

const GLOBE_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOBE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uOpacity;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
vec4 over(vec4 acc, vec3 c, float a) { float na = a + acc.a * (1.0 - a); vec3 nc = (c * a + acc.rgb * acc.a * (1.0 - a)) / max(na, 1e-4); return vec4(nc, na); }
const vec3 INK = vec3(0.165, 0.118, 0.078);
void main() {
  vec2 q = vec2(vUv.x * 2.0 - 1.0, 1.0 - vUv.y * 2.0) * 1.12;
  float d = length(q), aa = fwidth(d) * 1.25;
  vec4 acc = vec4(0.0);
  // the double rule around the sphere
  acc = over(acc, INK, (1.0 - smoothstep(0.0, aa * 1.3, abs(d - 1.0))) * 0.95);
  acc = over(acc, INK, (1.0 - smoothstep(0.0, aa, abs(d - 1.055))) * 0.6);
  acc = over(acc, vec3(0.73, 0.26, 0.17), (1.0 - smoothstep(0.0, aa, abs(d - 1.075))) * 0.45);
  if (d < 1.0) {
    vec3 n = vec3(q, sqrt(1.0 - d * d));
    float tl = 0.38, sp = uTime * 0.11;
    vec3 p = vec3(n.x, n.y * cos(tl) - n.z * sin(tl), n.y * sin(tl) + n.z * cos(tl));
    p = vec3(p.x * cos(sp) + p.z * sin(sp), p.y, -p.x * sin(sp) + p.z * cos(sp));
    float lambert = dot(n, normalize(vec3(-0.55, 0.5, 0.68)));
    // the sea's wash, deeper toward the limb
    acc = over(acc, vec3(0.31, 0.5, 0.58), 0.16 + 0.16 * (1.0 - n.z));
    float land = fbm(p * 1.9 + vec3(3.1, 1.7, 0.4)), e = land - 0.53, fw = fwidth(land);
    float isLand = smoothstep(-fw, fw, e);
    acc = over(acc, mix(vec3(0.72, 0.6, 0.32), vec3(0.45, 0.55, 0.3), smoothstep(0.0, 0.08, e)), isLand * 0.42);
    acc = over(acc, vec3(0.23, 0.42, 0.52), (1.0 - smoothstep(0.0, fw * 1.1, abs(e + 0.035))) * step(e, 0.0) * 0.6);
    acc = over(acc, vec3(0.23, 0.42, 0.52), (1.0 - smoothstep(0.0, fw * 1.1, abs(e + 0.075))) * step(e, 0.0) * 0.35);
    // the graticule every thirty degrees, the equator and the tropics in vermilion
    float lat = asin(clamp(p.y, -1.0, 1.0)), lon = atan(p.z, p.x);
    float gl = abs(fract(lat / 0.5236 + 0.5) - 0.5) * 0.5236, gm = abs(fract(lon / 0.5236 + 0.5) - 0.5) * 0.5236 * cos(lat);
    float pw = aa * 0.9;
    acc = over(acc, INK, (1.0 - smoothstep(0.0, pw, gl)) * 0.32);
    acc = over(acc, INK, (1.0 - smoothstep(0.0, pw, gm)) * 0.32);
    acc = over(acc, vec3(0.73, 0.26, 0.17), (1.0 - smoothstep(0.0, pw * 1.2, abs(lat))) * 0.55);
    acc = over(acc, vec3(0.73, 0.26, 0.17), (1.0 - smoothstep(0.0, pw, abs(abs(lat) - 0.409))) * 0.35);
    // hatching on the shadowed side
    float shade = clamp((0.25 - lambert) / 0.9, 0.0, 1.0);
    float hl = abs(fract((q.x + q.y) * 46.0) - 0.5);
    acc = over(acc, INK, (1.0 - smoothstep(0.08, 0.08 + fwidth((q.x + q.y) * 46.0), hl + 0.5 - 0.5 * shade - 0.06)) * shade * 0.5);
    // the coastline in ink
    acc = over(acc, INK, (1.0 - smoothstep(0.0, fw * 1.4, abs(e))) * 0.9);
  }
  gl_FragColor = vec4(acc.rgb, acc.a * uOpacity);
}`;

export interface TitleArt { readonly group: THREE.Group; readonly bytes: number; readonly ribbon: { x: number; y: number; width: number; height: number }; frame(t: number, still: boolean): void }

/** The title page: rhumb lines of a portolan network over the parchment, the planet turning in its double rule at
 * (cx, cy) with radius R, a ribbon cartouche for the swash-lettered name beneath it, a wind rose, the gull wheeling. */
export function titleArt(w: number, h: number, safe: Rect, cx: number, cy: number, R: number, dpr: number): TitleArt {
  const group = new THREE.Group(), r = rng(1492);
  let bytes = 0;
  const bg = sheet(w, h, 2.0e6, dpr), g = bg.g, reach = Math.hypot(w, h);
  const rose = (x: number, y: number, n: number, alpha: number) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, k = (i * 32) / n;
      const color = k % 4 === 0 ? INK : k % 2 === 0 ? WASH.verdigris : WASH.vermilion;
      stroke(g, seg(x, y, x + Math.cos(a) * reach, y + Math.sin(a) * reach), k % 4 === 0 ? 0.8 : 0.6, alpha * (k % 4 === 0 ? 0.5 : 0.42), color);
    }
  };
  rose(cx, cy, 32, 0.9);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; rose(cx + Math.cos(a) * R * 2.05, cy + Math.sin(a) * R * 2.05, 16, 0.32); }
  stroke(g, (q) => { q.beginPath(); q.rect(8, 8, w - 16, h - 16); }, 1.2, 0.7);
  stroke(g, (q) => { q.beginPath(); q.rect(13, 13, w - 26, h - 26); }, 0.6, 0.6);
  // a wind rose in the lower left of the safe area
  const rr = Math.min(safe.height * 0.13, 74), rx = safe.x + rr * 1.35, ry = safe.y + safe.height - rr * 1.35;
  stroke(g, (q) => { q.beginPath(); q.arc(rx, ry, rr * 0.42, 0, Math.PI * 2); }, 0.9, 0.8);
  stroke(g, (q) => { q.beginPath(); q.arc(rx, ry, rr * 0.48, 0, Math.PI * 2); }, 0.6, 0.6);
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4, l = i % 2 ? rr * 0.62 : rr, wd = rr * (i % 2 ? 0.1 : 0.14);
    const tipx = rx + Math.cos(a) * l, tipy = ry + Math.sin(a) * l, nx = -Math.sin(a) * wd, ny = Math.cos(a) * wd;
    const halfA: Path = (q) => { q.beginPath(); q.moveTo(rx, ry); q.lineTo(rx + Math.cos(a) * wd * 1.4 + nx, ry + Math.sin(a) * wd * 1.4 + ny); q.lineTo(tipx, tipy); q.closePath(); };
    const halfB: Path = (q) => { q.beginPath(); q.moveTo(rx, ry); q.lineTo(rx + Math.cos(a) * wd * 1.4 - nx, ry + Math.sin(a) * wd * 1.4 - ny); q.lineTo(tipx, tipy); q.closePath(); };
    fill(g, halfA, i === 0 ? WASH.vermilion : i % 2 ? WASH.verdigris : INK, i % 2 ? 0.55 : 0.75);
    fill(g, halfB, WASH.lead, 0.85);
    stroke(g, halfA, 0.7); stroke(g, halfB, 0.7);
  }
  const bgMesh = sheetMesh(bg); bgMesh.position.set(w / 2, h / 2, 0); bgMesh.renderOrder = 1; group.add(bgMesh); bytes += bytesOf(bg);

  // the planet
  const globe = new THREE.Mesh(new THREE.PlaneGeometry(R * 2.24, R * 2.24), new THREE.ShaderMaterial({
    vertexShader: GLOBE_VERT, fragmentShader: GLOBE_FRAG, uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
    transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }));
  globe.position.set(cx, cy, 0); globe.renderOrder = 2; group.add(globe);

  // the ribbon
  const wr = Math.min(safe.width * 0.66, R * 3.6), hr = wr * 0.2, top = hr * 0.18;
  const rs = sheet(wr, hr * 1.6, 1.2e6, dpr), q0 = rs.g;
  const tail = (flip: boolean): Path => (q) => {
    const X = (x: number) => (flip ? wr - x : x);
    q.beginPath(); q.moveTo(X(0), top + hr * 0.3); q.lineTo(X(wr * 0.17), top + hr * 0.3); q.lineTo(X(wr * 0.17), top + hr * 1.25); q.lineTo(X(0), top + hr * 1.25); q.lineTo(X(wr * 0.055), top + hr * 0.775); q.closePath();
  };
  const foldP = (flip: boolean): Path => (q) => {
    const X = (x: number) => (flip ? wr - x : x);
    q.beginPath(); q.moveTo(X(wr * 0.12), top + hr); q.lineTo(X(wr * 0.17), top + hr * 1.25); q.lineTo(X(wr * 0.17), top + hr * 0.96); q.closePath();
  };
  for (const flip of [false, true]) {
    wash(q0, tail(flip), WASH.ochre, 0.55, r);
    hatch(q0, tail(flip), flip ? wr * 0.83 : 0, top + hr * 0.3, wr * 0.17, hr, 0.8, 2.4, INK, 0.5, 0.35, r);
    stroke(q0, tail(flip), 1.3);
    wash(q0, foldP(flip), WASH.umber, 0.75, r);
    hatch(q0, foldP(flip), flip ? wr * 0.83 : wr * 0.12, top + hr * 0.95, wr * 0.05, hr * 0.3, 0.6, 1.6, INK, 0.5, 0.6, r);
    stroke(q0, foldP(flip), 1.1);
  }
  const band: Path = (q) => { q.beginPath(); q.moveTo(wr * 0.12, top); q.quadraticCurveTo(wr * 0.5, top + hr * 0.16, wr * 0.88, top); q.lineTo(wr * 0.88, top + hr); q.quadraticCurveTo(wr * 0.5, top + hr * 1.16, wr * 0.12, top + hr); q.closePath(); };
  fill(q0, band, '#f1e4c4', 0.96);
  wash(q0, band, WASH.ochre, 0.16, r);
  stroke(q0, band, 1.5);
  for (const k of [0.1, 0.9]) stroke(q0, (q) => { q.beginPath(); q.moveTo(wr * 0.135, top + hr * k); q.quadraticCurveTo(wr * 0.5, top + hr * (k + 0.16), wr * 0.865, top + hr * k); }, 0.6, 0.7);
  const ribbonY = cy + R * 0.86;
  const rm = sheetMesh(rs); rm.position.set(cx, ribbonY, 0); rm.renderOrder = 3; group.add(rm); bytes += bytesOf(rs);

  // the gull wheeling about the planet
  const span = R * 0.3, gs = sheet(span, span * 0.5, 0.05e6, dpr);
  drawFlyingGull(gs.g, span / 2, span * 0.2, span * 0.96, r);
  const gull = sheetMesh(gs); gull.renderOrder = 4; group.add(gull); bytes += bytesOf(gs);

  return {
    group,
    bytes,
    ribbon: { x: cx, y: ribbonY - (hr * 1.6) / 2 + top + hr * 0.58, width: wr * 0.76, height: hr },
    frame(t, still) {
      (globe.material as THREE.ShaderMaterial).uniforms.uTime!.value = still ? 2 + t * 0.25 : t;
      const a = still ? 2.2 : 1.3 + t * 0.21, dir = -Math.sin(a);
      gull.position.set(cx + R * 1.32 * Math.cos(a), cy - R * 0.62 + R * 0.42 * Math.sin(a), 0);
      const flap = still ? 0 : Math.sin(t * 7.5) * (Math.sin(t * 0.8) > 0.35 ? 1 : 0.12);
      gull.scale.set(dir >= 0 ? 1 : -1, 0.8 + 0.2 * flap, 1);
    },
  };
}
