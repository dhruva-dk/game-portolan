// WP25: the match HUD drawn as ink on parchment scraps (PROMPT.md, The match screen; hud.ts places it). Every
// indicator that can be graphic is graphic and drawn with a broad nib at 40° (nib(): width by stroke direction, a
// touch of pressure mid-stroke, a seeded wobble so no two rings are true): the hull as a rope fraying as it empties
// with the ward's gold glow, the storm's next move as a dial, a portolan wind rose turned to the bow with the wind's
// feathered arrow, the sail setting as three sails, the purse a pouch that swells with unbanked doubloons beside the
// bank's strongbox, a reload arc round the aimed fitting, the gull and its call price, consumables and the six
// fittings as small inked icons in their tier pigments, chevrons on the frame toward every rival in sight with a
// darkening vignette on the nearest's side. Numbers are lettered in the generated hand (Lettering). Elements write
// themselves in on appearance, staggered (the ink-draw transition). The sheet is one canvas redrawn only when what
// it shows changes (≤ 11 Hz, every frame while writing in); the stick and the aiming reticle are small sprites drawn
// every frame they move, so a touch shows the frame it lands.
import * as THREE from 'three';
import type { InkText, InkTextOptions, Lettering } from '../lettering/ink.ts';
import { FLIGHT } from '../sim/state.ts';
import { CONSUMABLE, SLOT } from '../sim/tables.ts';
import type { Style } from '../style/glsl.ts';
import type { ControlsView } from './controls.ts';
import { STICK } from './controls.ts';
import { edgePoint, type ButtonKind, type HudLayout, type HudModel } from './hud.ts';
import { ButtonBase, Scrap, ThreatVignette } from './parchment.ts';

export const INK = '#2a211c';
/** Pigment tiers, dullest first (tables.ts PIGMENT_TIER): iron gall, verdigris, ultramarine, vermilion, gold leaf. */
export const TIER = ['#2a211c', '#5aa394', '#4566b0', '#d9472b', '#d4a64a'] as const;
const PIG = { sepia: '#6b4f36', ochre: '#d4a656', ultramarine: '#4566b0', indigo: '#3e4d72', vermilion: '#d9472b', gold: '#d4a64a', verdigris: '#5aa394', grey: '#8a8178' } as const;

type G = CanvasRenderingContext2D;
type Pt = [number, number];

/** A broad-nib stroke along `pts`, written up to `p` (0–1) of its length. */
export function nib(g: G, pts: readonly Pt[], w: number, p = 1, colour: string = INK, alpha = 0.9): void {
  if (pts.length < 2 || p <= 0) return;
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(d); total += d; }
  let left = total * Math.min(1, p), run = 0;
  g.save();
  g.strokeStyle = colour;
  g.globalAlpha = alpha;
  g.lineCap = 'round';
  for (let i = 1; i < pts.length && left > 0; i++) {
    const [ax, ay] = pts[i - 1], d = seg[i - 1];
    let [bx, by] = pts[i];
    if (d > left) { const f = left / d; bx = ax + (bx - ax) * f; by = ay + (by - ay) * f; }
    const along = (run + Math.min(d, left) / 2) / (total || 1);
    g.lineWidth = w * (0.72 + 0.28 * Math.sin(Math.PI * along)) * (0.42 + 0.58 * Math.abs(Math.sin(Math.atan2(by - ay, bx - ax) - 0.7)));
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    run += d; left -= d;
  }
  g.restore();
}

/** A hand-drawn ring (or arc from a0 through `sweep`), never quite true. */
export function ring(cx: number, cy: number, r: number, seed: number, a0 = -Math.PI / 2, sweep = Math.PI * 2, n = 44): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n, k = 1 + 0.022 * Math.sin(3 * a + seed * 7.1) + 0.01 * Math.sin(7 * a + seed);
    pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]);
  }
  return pts;
}

/** A watercolour wash: a pale fill with the darker dried edge. */
export function wash(g: G, colour: string, alpha: number, path: (g: G) => void): void {
  g.save();
  g.fillStyle = colour; g.strokeStyle = colour;
  g.globalAlpha = alpha; g.beginPath(); path(g); g.fill();
  g.globalAlpha = Math.min(1, alpha * 1.4); g.lineWidth = 1.1; g.stroke();
  g.restore();
}

const poly = (pts: readonly Pt[]) => (g: G): void => { g.moveTo(pts[0][0], pts[0][1]); for (const q of pts) g.lineTo(q[0], q[1]); };

// ---- icons: (g, x, y, s = half size, p = written 0–1)

export function gullIcon(g: G, x: number, y: number, s: number, p = 1, colour: string = INK): void {
  nib(g, [[x - s, y - 0.05 * s], [x - 0.6 * s, y - 0.42 * s], [x - 0.25 * s, y - 0.3 * s], [x, y + 0.08 * s]], s * 0.2, p, colour);
  nib(g, [[x, y + 0.08 * s], [x + 0.25 * s, y - 0.3 * s], [x + 0.6 * s, y - 0.42 * s], [x + s, y - 0.05 * s]], s * 0.2, p, colour);
}

export function anchorIcon(g: G, x: number, y: number, s: number, p = 1): void {
  nib(g, ring(x, y - 0.72 * s, 0.17 * s, 2), s * 0.12, p);
  nib(g, [[x, y - 0.55 * s], [x, y + 0.8 * s]], s * 0.16, p);
  nib(g, [[x - 0.42 * s, y - 0.32 * s], [x + 0.42 * s, y - 0.32 * s]], s * 0.13, p);
  nib(g, ring(x, y + 0.15 * s, 0.68 * s, 5, 0.25 * Math.PI, 0.5 * Math.PI, 16), s * 0.15, p);
  nib(g, [[x - 0.72 * s, y + 0.2 * s], [x - 0.55 * s, y + 0.45 * s]], s * 0.14, p);
  nib(g, [[x + 0.72 * s, y + 0.2 * s], [x + 0.55 * s, y + 0.45 * s]], s * 0.14, p);
}

export function mortarIcon(g: G, x: number, y: number, s: number, p = 1, tier = 0): void {
  const body: Pt[] = [[x - 0.55 * s, y + 0.15 * s], [x - 0.15 * s, y - 0.55 * s], [x + 0.35 * s, y - 0.3 * s], [x + 0.25 * s, y + 0.3 * s], [x - 0.55 * s, y + 0.15 * s]];
  wash(g, TIER[tier], 0.35 * p, poly(body));
  nib(g, body, s * 0.14, p);
  nib(g, [[x - 0.8 * s, y + 0.6 * s], [x + 0.8 * s, y + 0.6 * s]], s * 0.16, p);
  for (let i = 0; i < 4; i++) nib(g, [[x + (0.2 + i * 0.18) * s, y - (0.75 + i * 0.05) * s], [x + (0.27 + i * 0.18) * s, y - (0.78 + i * 0.05) * s]], s * 0.1, p);
}

export function consumableIcon(g: G, kind: number, x: number, y: number, s: number, p = 1): void {
  switch (kind) {
    case CONSUMABLE.patchKit:
      nib(g, [[x - 0.6 * s, y - 0.4 * s], [x + 0.6 * s, y + 0.4 * s]], s * 0.32, p, PIG.sepia);
      nib(g, [[x - 0.6 * s, y + 0.4 * s], [x + 0.6 * s, y - 0.4 * s]], s * 0.32, p, PIG.sepia);
      for (let i = -1; i <= 1; i++) nib(g, [[x + i * 0.3 * s - 0.08 * s, y - 0.12 * s], [x + i * 0.3 * s + 0.08 * s, y + 0.12 * s]], s * 0.08, p);
      break;
    case CONSUMABLE.ward: {
      const sh: Pt[] = [[x - 0.55 * s, y - 0.6 * s], [x + 0.55 * s, y - 0.6 * s], [x + 0.5 * s, y + 0.1 * s], [x, y + 0.7 * s], [x - 0.5 * s, y + 0.1 * s], [x - 0.55 * s, y - 0.6 * s]];
      wash(g, PIG.gold, 0.45 * p, poly(sh));
      nib(g, sh, s * 0.12, p);
      nib(g, [[x, y - 0.4 * s], [x, y + 0.35 * s]], s * 0.1, p);
      break;
    }
    case CONSUMABLE.gust:
      for (let i = 0; i < 3; i++) {
        const yy = y + (i - 1) * 0.38 * s, w = (1 - Math.abs(i - 1) * 0.3) * s;
        nib(g, [[x - w * 0.8, yy], [x + w * 0.45, yy], ...ring(x + w * 0.45, yy - 0.14 * s, 0.14 * s, i, Math.PI / 2, -1.5 * Math.PI, 10)], s * 0.12, p, PIG.ultramarine);
      }
      break;
    case CONSUMABLE.fogFlask: {
      wash(g, PIG.grey, 0.4 * p, (q) => q.arc(x, y + 0.2 * s, 0.48 * s, 0, Math.PI * 2));
      nib(g, ring(x, y + 0.2 * s, 0.48 * s, 3), s * 0.11, p);
      nib(g, [[x - 0.14 * s, y - 0.28 * s], [x - 0.14 * s, y - 0.62 * s], [x + 0.14 * s, y - 0.62 * s], [x + 0.14 * s, y - 0.28 * s]], s * 0.11, p);
      break;
    }
    case CONSUMABLE.flare:
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2, r0 = 0.18 * s, r1 = (i % 2 ? 0.55 : 0.8) * s;
        nib(g, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0], [x + Math.cos(a) * r1, y + Math.sin(a) * r1]], s * 0.12, p, PIG.vermilion);
      }
      break;
    default: // an empty slot: a dotted ring
      for (let i = 0; i < 10; i += 2) nib(g, ring(x, y, 0.55 * s, i, (i / 10) * Math.PI * 2, Math.PI / 6, 4), s * 0.07, p, INK, 0.4);
  }
}

/** A fitting by its slot, washed in its tier's pigment (gold leaf at the top tier). */
export function fittingIcon(g: G, slot: number, kind: number, tier: number, x: number, y: number, s: number, p = 1): void {
  if (kind === 0) { nib(g, [[x - 0.12 * s, y], [x + 0.12 * s, y]], s * 0.25, p, INK, 0.3); return; }
  const c = TIER[Math.max(0, Math.min(4, tier))];
  wash(g, c, 0.55 * p, (q) => q.arc(x, y, 0.95 * s, 0, Math.PI * 2));
  const w = s * 0.2;
  switch (slot) {
    case SLOT.bow: nib(g, [[x - 0.6 * s, y + 0.5 * s], [x + 0.65 * s, y], [x - 0.6 * s, y - 0.5 * s]], w, p); break;
    case SLOT.broadside: nib(g, [[x - 0.7 * s, y - 0.1 * s], [x + 0.6 * s, y - 0.25 * s]], w * 1.6, p); nib(g, ring(x - 0.2 * s, y + 0.35 * s, 0.25 * s, 1), w * 0.6, p); break;
    case SLOT.stern: mortarIcon(g, x, y, s * 0.8, p, tier); break;
    case SLOT.rig: nib(g, [[x, y - 0.8 * s], [x, y + 0.7 * s]], w * 0.7, p); nib(g, [[x - 0.5 * s, y - 0.5 * s], [x + 0.55 * s, y - 0.5 * s], [x + 0.5 * s, y + 0.3 * s], [x - 0.5 * s, y + 0.3 * s]], w * 0.8, p); break;
    case SLOT.hull: for (let i = -1; i <= 1; i++) nib(g, [[x - 0.7 * s, y + i * 0.35 * s], [x + 0.7 * s, y + i * 0.35 * s]], w, p); break;
    default: nib(g, [[x - 0.7 * s, y + 0.3 * s], [x + 0.7 * s, y - 0.3 * s]], w * 1.3, p); nib(g, ring(x + 0.7 * s, y - 0.3 * s, 0.2 * s, 4), w * 0.6, p);
  }
}

export function shipGlyph(g: G, x: number, y: number, s: number, p = 1): void {
  nib(g, [[x - s, y + 0.2 * s], [x - 0.6 * s, y + 0.6 * s], [x + 0.6 * s, y + 0.6 * s], [x + s, y + 0.15 * s]], s * 0.16, p);
  nib(g, [[x, y + 0.5 * s], [x, y - 0.9 * s]], s * 0.1, p);
  nib(g, [[x - 0.45 * s, y - 0.65 * s], [x - 0.35 * s, y + 0.05 * s], [x + 0.4 * s, y + 0.05 * s], [x + 0.5 * s, y - 0.65 * s]], s * 0.12, p);
}

export function pennant(g: G, x: number, y: number, s: number, gold: boolean, p = 1): void {
  nib(g, [[x - 0.5 * s, y + s], [x - 0.5 * s, y - s]], s * 0.12, p);
  const flag: Pt[] = [[x - 0.5 * s, y - s], [x + s, y - 0.7 * s], [x + 0.55 * s, y - 0.5 * s], [x + s, y - 0.3 * s], [x - 0.5 * s, y - 0.2 * s]];
  wash(g, gold ? PIG.gold : PIG.ochre, (gold ? 0.85 : 0.3) * p, poly(flag));
  nib(g, flag, s * 0.1, p);
}

/** The purse: a drawstring pouch, radius by the doubloons it holds (√, so it swells fast then fills slowly). */
export function pouch(g: G, x: number, y: number, s: number, purse: number, p = 1): void {
  const r = s * (0.45 + 0.55 * Math.min(1, Math.sqrt(purse / 400)));
  wash(g, PIG.ochre, 0.45 * p, (q) => q.ellipse(x, y + 0.25 * s, r, r * 0.85, 0, 0, Math.PI * 2));
  nib(g, ring(x, y + 0.25 * s, r, 6, -0.35 * Math.PI, 1.7 * Math.PI), s * 0.13, p);
  nib(g, [[x - 0.25 * r, y + 0.25 * s - r * 0.85], [x - 0.35 * r, y + 0.25 * s - r * 1.25], [x + 0.35 * r, y + 0.25 * s - r * 1.25], [x + 0.25 * r, y + 0.25 * s - r * 0.85]], s * 0.11, p);
}

export function strongbox(g: G, x: number, y: number, s: number, p = 1): void {
  const box: Pt[] = [[x - 0.8 * s, y - 0.2 * s], [x + 0.8 * s, y - 0.2 * s], [x + 0.8 * s, y + 0.6 * s], [x - 0.8 * s, y + 0.6 * s], [x - 0.8 * s, y - 0.2 * s]];
  wash(g, PIG.sepia, 0.35 * p, poly(box));
  nib(g, box, s * 0.13, p);
  nib(g, ring(x, y - 0.2 * s, 0.8 * s, 1, Math.PI, Math.PI, 14), s * 0.13, p);
  nib(g, [[x, y - 0.05 * s], [x, y + 0.25 * s]], s * 0.16, p, PIG.gold);
}

/** Sail settings reefed, plain, full as three sails; the one set inked, the others ghosted; torn sails ragged. */
export function sails(g: G, x: number, y: number, w: number, h: number, setting: number, torn: boolean, p = 1): void {
  for (let k = 0; k < 3; k++) {
    const cx = x + w * (k + 0.5) / 3, on = k === setting, a = on ? 0.95 : 0.28, s = h * 0.45;
    nib(g, [[cx, y + h * 0.95], [cx, y + h * 0.05]], s * 0.12, p, INK, a);
    for (let j = 0; j <= k; j++) {
      const top = y + h * 0.1 + j * h * 0.27, belly = (0.1 + 0.08 * k) * s;
      const sail: Pt[] = [[cx - 0.4 * s, top], [cx + 0.4 * s, top], [cx + 0.4 * s + belly * 0.3, top + h * 0.2], [cx - 0.4 * s - belly * 0.3, top + h * 0.2], [cx - 0.4 * s, top]];
      if (on) wash(g, torn ? PIG.grey : '#f3ead6', 0.8 * p, poly(sail));
      nib(g, torn && on ? sail.map(([a1, b1], i) => [a1 + (i % 2 ? 1.5 : -1.5), b1] as Pt) : sail, s * 0.09, p, INK, a);
    }
  }
}

/** The hull as a rope: twisted strands to the hull left, frayed loose strands beyond, the ward's gold behind. */
export function rope(g: G, x: number, y: number, w: number, h: number, f: number, ward: boolean, fire: boolean, p = 1): void {
  const cy = y + h / 2, end = x + w * f * p, th = h * 0.32;
  if (ward) wash(g, PIG.gold, 0.35, (q) => q.roundRect(x - 4, cy - th - 5, w * f + 8, th * 2 + 10, th + 5));
  if (f > 0.02) {
    nib(g, [[x, cy - th], [end, cy - th]], 1.6, 1);
    nib(g, [[x, cy + th], [end, cy + th]], 1.6, 1);
    for (let sx = x + th * 0.6; sx < end - th * 0.4; sx += th * 0.9) nib(g, [[sx - th * 0.5, cy + th * 0.85], [sx + th * 0.5, cy - th * 0.85]], 2.2, 1, f < 0.3 ? PIG.vermilion : INK);
  }
  if (fire) for (let i = 0; i < 4; i++) nib(g, [[x + w * f * (0.2 + 0.2 * i), cy - th], [x + w * f * (0.25 + 0.2 * i), cy - th * 2.2]], 1.8, p, PIG.vermilion);
  if (f < 0.995) { // the fray: three loose strands curling off the empty end, then the faint line of what was
    for (let k = -1; k <= 1; k++) nib(g, [[end, cy + k * th * 0.6], [end + th * 1.1, cy + k * th * 1.1 + th * 0.2], [end + th * 1.9, cy + k * th * 1.6 - th * 0.3]], 1.3, p, INK, 0.75);
    nib(g, [[end + th * 2.2, cy], [x + w, cy]], 0.7, p, INK, 0.25);
  }
}

/** The storm dial: a ring of phases, the moved ones washed indigo, the announced one sweeping vermilion as its time runs. */
export function stormDial(g: G, x: number, y: number, r: number, m: HudModel['storm'], p = 1): void {
  const phases = Math.max(5, m.phase + 1);
  for (let i = 0; i < phases; i++) {
    const a0 = -Math.PI / 2 + (i / phases) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / phases;
    if (i < m.phase) wash(g, PIG.indigo, 0.45 * p, (q) => { q.moveTo(x, y); q.arc(x, y, r * 0.86, a0, a1); q.closePath(); });
    nib(g, [[x + Math.cos(a0) * r * 0.86, y + Math.sin(a0) * r * 0.86], [x + Math.cos(a0) * r, y + Math.sin(a0) * r]], 1.2, p);
  }
  if (m.announced) {
    const a0 = -Math.PI / 2 + (m.phase / phases) * Math.PI * 2, span = ((Math.PI * 2) / phases) * (1 - m.frac);
    wash(g, PIG.vermilion, 0.6 * p, (q) => { q.moveTo(x, y); q.arc(x, y, r * 0.86, a0, a0 + span); q.closePath(); });
  }
  nib(g, ring(x, y, r, 9), 1.8, p);
  // a cloud at the hub
  nib(g, [...ring(x - r * 0.18, y, r * 0.22, 1, Math.PI * 0.9, Math.PI * 1.1, 8), ...ring(x + r * 0.15, y - r * 0.05, r * 0.26, 2, Math.PI * 1.1, Math.PI * 1.1, 8)], 1.3, p);
}

/** A portolan wind rose turned so the bow is up (north swings with the helm), the wind as a feathered arrow. */
export function rose(g: G, x: number, y: number, r: number, heading: number, wind: number, strength: number, p = 1): void {
  nib(g, ring(x, y, r, 4), 1.4, p, INK, 0.7);
  for (let i = 0; i < 8; i++) {
    const a = -heading + (i * Math.PI) / 4 - Math.PI / 2, long = i % 2 === 0, l = r * (long ? 0.92 : 0.55), wdt = r * (long ? 0.13 : 0.09);
    const tip: Pt = [x + Math.cos(a) * l, y + Math.sin(a) * l];
    const sideL: Pt = [x + Math.cos(a - Math.PI / 2) * wdt, y + Math.sin(a - Math.PI / 2) * wdt];
    const sideR: Pt = [x + Math.cos(a + Math.PI / 2) * wdt, y + Math.sin(a + Math.PI / 2) * wdt];
    wash(g, i === 0 ? PIG.vermilion : PIG.sepia, (i === 0 ? 0.75 : long ? 0.35 : 0.15) * p, poly([[x, y], sideL, tip]));
    nib(g, [sideL, tip, sideR], 1.1, p);
  }
  nib(g, [[x, y - r - 5], [x, y - r + 3]], 2.4, p); // the lubber's mark: the bow
  const a = wind - Math.PI / 2, l = r * (0.55 + 0.35 * Math.min(1.5, strength) / 1.5);
  const tail: Pt = [x - Math.cos(a) * l, y - Math.sin(a) * l], head: Pt = [x + Math.cos(a) * l, y + Math.sin(a) * l];
  nib(g, [tail, head], 2, p, PIG.ultramarine);
  for (const side of [-1, 1]) {
    nib(g, [head, [head[0] - Math.cos(a + side * 0.45) * r * 0.26, head[1] - Math.sin(a + side * 0.45) * r * 0.26]], 2, p, PIG.ultramarine);
    for (let k = 0; k < 2; k++) {
      const bx = tail[0] + Math.cos(a) * r * 0.12 * k, by = tail[1] + Math.sin(a) * r * 0.12 * k;
      nib(g, [[bx, by], [bx - Math.cos(a + side * 0.6) * r * 0.2, by - Math.sin(a + side * 0.6) * r * 0.2]], 1.2, p, PIG.ultramarine);
    }
  }
}

/** A chevron on the frame toward a rival, heavier and redder the nearer. */
export function chevron(g: G, x: number, y: number, bearing: number, near: number, s: number, p = 1): void {
  const a = bearing - Math.PI / 2, w = s * (0.7 + 0.6 * near);
  const tip: Pt = [x + Math.cos(a) * w * 0.6, y + Math.sin(a) * w * 0.6];
  const l: Pt = [x + Math.cos(a + 2.4) * w, y + Math.sin(a + 2.4) * w], r: Pt = [x + Math.cos(a - 2.4) * w, y + Math.sin(a - 2.4) * w];
  wash(g, PIG.vermilion, (0.2 + 0.6 * near) * p, poly([l, tip, r, [x, y], l]));
  nib(g, [l, tip, r], 1.4 + 1.6 * near, p);
}

// ---- the view

const fmt = (n: number): string => (n < 1000 ? String(Math.floor(n)) : n < 1e5 ? `${(n / 1000).toFixed(1)}k` : `${Math.floor(n / 1000)}k`);
const ordinal = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

interface Sprite { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; g: G; tex: THREE.CanvasTexture; size: number; ratio: number }

function sheet(width: number, height: number, ratio: number): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * ratio); canvas.height = Math.ceil(height * ratio);
  const g = canvas.getContext('2d')!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false; // the ui camera looks with y down
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.frustumCulled = false;
  return { mesh, g, tex, size: width, ratio };
}

export class HudView {
  readonly group = new THREE.Group();
  private readonly style: Style;
  private readonly lettering: Lettering;
  private L: HudLayout | null = null;
  private base: Sprite | null = null;
  private stick: Sprite | null = null;
  private reticle: Sprite | null = null;
  private vignette: ThreatVignette | null = null;
  private readonly buttons = new Map<ButtonKind, ButtonBase>();
  private readonly texts = new Map<string, { s: string; size: number; t: InkText; used: boolean }>();
  private clock = 0;
  private born = 0;
  private drawn = -1;
  private sig = '';
  private stickSig = '';

  constructor(style: Style, lettering: Lettering) {
    this.style = style;
    this.lettering = lettering;
  }

  setLayout(L: HudLayout): void {
    this.clear();
    this.L = L;
    const { u, view } = L, ratio = Math.min(2, view.dpr);
    const scrap = (x: number, y: number, w: number, h: number, seed: number): void => {
      const s = new Scrap(this.style, { width: w, height: h, torn: [0.4 + 0.1 * seed, 0.6, 0.5, 0.7 - 0.1 * seed], frame: 'rule', age: 0.4 });
      s.position.set(x + w / 2, y + h / 2, 0);
      s.renderOrder = 1;
      this.group.add(s);
    };
    scrap(L.hull.x - 6 * u, L.hull.y - 4 * u, L.hull.width + 12 * u, L.hull.height + L.share.height + 12 * u, 0);
    scrap(L.top.x, L.top.y, L.top.width, L.top.height, 1);
    scrap(L.chart.x, L.chart.y, L.chart.width, L.chart.height, 2);
    scrap(L.purse.x, L.purse.y, L.purse.width, L.purse.height, 3);
    for (const b of L.buttons) {
      if (b.kind === 'chart') continue;
      const bb = new ButtonBase(this.style, b.r);
      bb.position.set(b.x, b.y, 0);
      bb.renderOrder = 2;
      this.buttons.set(b.kind, bb);
      this.group.add(bb);
    }
    this.vignette = new ThreatVignette(this.style);
    this.vignette.setView(view.width, view.height);
    this.vignette.renderOrder = 0;
    this.group.add(this.vignette);
    this.base = sheet(view.width, view.height, ratio);
    this.base.mesh.position.set(view.width / 2, view.height / 2, 0);
    this.base.mesh.renderOrder = 3;
    const ss = (STICK.full + 30) * 2;
    this.stick = sheet(ss, ss, ratio);
    this.stick.mesh.renderOrder = 5;
    this.reticle = sheet(64 * u, 64 * u, ratio);
    this.reticle.mesh.renderOrder = 5;
    this.group.add(this.base.mesh, this.stick.mesh, this.reticle.mesh);
    this.born = this.clock;
    this.sig = '';
  }

  /** Draw the frame's HUD; `dt` s since the last. */
  frame(m: HudModel, c: ControlsView, dt: number): void {
    this.clock += dt;
    const L = this.L;
    if (!L || !this.base) return;
    const age = this.clock - this.born, writing = age < 1.1;
    for (const e of this.texts.values()) e.used = false;
    this.buttonsFrame(m, c);
    this.letters(m, L);
    const sig = [Math.round(m.hull * 60), m.ward, m.fire, m.sail, m.torn, Math.floor(m.purse), Math.floor(m.bank), Math.round(m.share * 100), m.afloat, m.rank, m.leader,
      m.storm.phase, m.storm.announced, Math.round(m.storm.frac * 40), m.storm.edge, Math.round(m.heading * 40), Math.round(m.wind * 30),
      m.batteries.map((b) => Math.round(b.reload * 20)).join(), m.consumables.map((s) => `${s.kind}:${s.count}`).join(), m.gull.flight, m.gull.ready,
      m.aimed?.ready, m.fittings.map((f) => f.kind * 8 + f.tier).join(), m.threats.map((t) => `${Math.round(t.bearing * 20)}:${Math.round(t.near * 8)}`).join(), m.sternGlass].join('|');
    if (writing || (sig !== this.sig && this.clock - this.drawn > 0.09)) {
      this.draw(m, L, age);
      this.sig = sig;
      this.drawn = this.clock;
    }
    this.sprites(c, L);
    for (const e of this.texts.values()) e.t.visible = e.used;
    const v = this.vignette!, top = m.threats[0];
    v.material.uniforms.uStrength.value = top ? 0.25 + 0.55 * top.near * top.near : 0;
    if (top) v.material.uniforms.uFrom.value.set(Math.sin(top.bearing), -Math.cos(top.bearing));
  }

  private buttonsFrame(m: HudModel, c: ControlsView): void {
    for (const [k, b] of this.buttons) {
      b.pressed = c.pressed.has(k) ? 1 : 0;
      let off = false, fill = 0;
      if (k === 'aimed') { off = !m.aimed; fill = m.aimed && !m.aimed.ready ? 0.5 : 0; }
      else if (k === 'gull') { off = !m.gull.ready; fill = m.gull.flight === FLIGHT.mast || m.gull.flight === FLIGHT.wheel ? 0 : 0.6; }
      else if (k === 'home') fill = c.home;
      else { const s = m.consumables[Number(k[1])]; off = !s || s.kind === 0 || s.count <= 0; }
      b.disabled = off ? 1 : 0;
      b.material.uniforms.uFill.value = fill;
    }
  }

  private say(key: string, s: string, size: number, x: number, y: number, o: Partial<InkTextOptions> = {}): void {
    let e = this.texts.get(key);
    if (!e || e.s !== s || Math.abs(e.size - size) > 0.01) {
      if (e) { this.group.remove(e.t); e.t.dispose(); }
      const t = this.lettering.text(s, { size, align: 'center', valign: 'middle', ...o });
      t.renderOrder = 4;
      this.group.add(t);
      e = { s, size, t, used: true };
      this.texts.set(key, e);
    }
    e.t.position.set(x, y, 0);
    e.used = true;
  }

  private letters(m: HudModel, L: HudLayout): void {
    const u = L.u, sz = 15 * u;
    const t = L.top;
    this.say('afloat', String(m.afloat), sz * 1.25, t.x + t.width * 0.24, t.y + t.height * 0.52);
    if (m.storm.announced && m.storm.toMove > 0) this.say('storm', String(Math.ceil(m.storm.toMove)), sz * 0.8, t.x + t.width / 2, t.y + t.height + 9 * u, { pigment: 'vermilion' });
    this.say('rank', ordinal(m.rank), sz * 1.1, t.x + t.width * 0.8, t.y + t.height * 0.52, m.leader ? { pigment: 'goldLeaf' } : {});
    this.say('share', String(Math.round(m.share * 100)), sz * 0.85, L.share.x + L.share.width + 16 * u, L.share.y + L.share.height / 2);
    const P = L.purse;
    this.say('purse', fmt(m.purse), sz, P.x + P.width * 0.27, P.y + P.height * 0.2);
    this.say('bank', fmt(m.bank), sz, P.x + P.width * 0.73, P.y + P.height * 0.2);
    for (const b of L.buttons) {
      if (b.kind === 'gull') this.say('price', String(Math.round(m.gull.price)), sz * 0.75, b.x, b.y + b.r * 0.55, { pigment: m.gull.ready ? 'goldLeaf' : 'ink' });
      if (b.kind[0] === 'c') {
        const s = m.consumables[Number(b.kind[1])];
        if (s && s.kind !== 0 && s.count > 1) this.say(`n${b.kind}`, String(s.count), sz * 0.7, b.x + b.r * 0.75, b.y + b.r * 0.7);
      }
    }
    this.say('chart', 'chart', sz * 0.9, L.chart.x + L.chart.width / 2, L.chart.y + L.chart.height / 2, { opacity: 0.45 }); // until WP24 part D
  }

  private draw(m: HudModel, L: HudLayout, age: number): void {
    const { g, tex, ratio } = this.base!, { width, height } = L.view, u = L.u;
    const ink = (i: number): number => Math.min(1, Math.max(0, (age - i * 0.07) / 0.45)); // staggered write-in
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    g.clearRect(0, 0, width, height);
    const H = L.hull;
    rope(g, H.x, H.y, H.width, H.height, m.hull, m.ward, m.fire, ink(0));
    const S = L.share; // share of the claimed sea: a wash filling a ruled bar
    wash(g, PIG.ultramarine, 0.5 * ink(1), (q) => q.rect(S.x, S.y + S.height * 0.3, S.width * m.share, S.height * 0.4));
    nib(g, [[S.x, S.y + S.height * 0.3], [S.x + S.width, S.y + S.height * 0.3], [S.x + S.width, S.y + S.height * 0.7], [S.x, S.y + S.height * 0.7], [S.x, S.y + S.height * 0.3]], 1, ink(1), INK, 0.6);
    if (m.sternGlass) { const d = L.sternGlass; wash(g, '#cfd8d4', 0.5, (q) => q.arc(d.x, d.y, d.r, 0, Math.PI * 2)); nib(g, ring(d.x, d.y, d.r, 3), 2.2, ink(2)); nib(g, ring(d.x, d.y, d.r * 0.8, 5), 0.8, ink(2)); }
    const T = L.top;
    shipGlyph(g, T.x + T.width * 0.1, T.y + T.height * 0.5, 9 * u, ink(2));
    stormDial(g, T.x + T.width / 2, T.y + T.height / 2, 19 * u, m.storm, ink(3));
    pennant(g, T.x + T.width * 0.64, T.y + T.height * 0.5, 9 * u, m.leader, ink(4));
    const C = L.chart; // the compact chart's slot (WP24 part D draws into it)
    nib(g, ring(C.x + C.width - 16 * u, C.y + 16 * u, 9 * u, 8), 1, ink(5), INK, 0.5);
    nib(g, [[C.x + C.width - 16 * u, C.y + 5 * u], [C.x + C.width - 16 * u, C.y + 27 * u]], 1, ink(5), INK, 0.5);
    rose(g, L.compass.x, L.compass.y, L.compass.r, m.heading, m.wind, m.windStrength, ink(6));
    sails(g, L.sail.x, L.sail.y, L.sail.width, L.sail.height, m.sail, m.torn, ink(7));
    const P = L.purse;
    pouch(g, P.x + P.width * 0.27, P.y + P.height * 0.62, 17 * u, m.purse, ink(8));
    strongbox(g, P.x + P.width * 0.73, P.y + P.height * 0.62, 15 * u, ink(8));
    for (const b of L.buttons) {
      const p = ink(9);
      if (b.kind === 'aimed') {
        if (m.aimed) mortarIcon(g, b.x, b.y - b.r * 0.05, b.r * 0.55, p, m.aimed.tier);
        else nib(g, ring(b.x, b.y, b.r * 0.4, 2), 1, p, INK, 0.3);
        // the batteries' reloads as arcs round the aimed fitting: port left, starboard right, castle top, stern bottom
        for (const bt of m.batteries) {
          const mid = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][bt.battery], span = 0.75;
          nib(g, ring(b.x, b.y, b.r + 5 * u, bt.battery, mid - span / 2, span, 10), 2, p, INK, 0.25);
          if (bt.reload <= 0) nib(g, ring(b.x, b.y, b.r + 5 * u, bt.battery, mid - span / 2, span, 10), 2.6, p, PIG.vermilion, 0.9);
          else nib(g, ring(b.x, b.y, b.r + 5 * u, bt.battery, mid - span / 2, span * (1 - bt.reload), 10), 2.6, p, INK, 0.8);
        }
      } else if (b.kind === 'gull') {
        gullIcon(g, b.x, b.y - b.r * 0.2, b.r * 0.55, p, m.gull.ready ? INK : PIG.grey);
        if (m.gull.tier > 0 && m.gull.flight === FLIGHT.back) nib(g, ring(b.x, b.y, b.r * 0.9, 1), 2, p, TIER[m.gull.tier], 0.8);
      } else if (b.kind === 'home') anchorIcon(g, b.x, b.y, b.r * 0.55, p);
      else if (b.kind[0] === 'c') { const s = m.consumables[Number(b.kind[1])]; consumableIcon(g, s && s.count > 0 ? s.kind : 0, b.x, b.y, b.r * 0.6, p); }
    }
    m.fittings.forEach((f, i) => { const d = L.fittings[i]; if (d) fittingIcon(g, i, f.kind, f.tier, d.x, d.y, d.r, ink(10 + i * 0.3)); });
    for (const t of m.threats) { const [x, y] = edgePoint(L.edge, t.bearing); chevron(g, x, y, t.bearing, t.near, 9 * u, ink(4)); }
    if (m.storm.edge) wash(g, PIG.indigo, 0.12, (q) => { q.rect(0, 0, width, height); q.rect(L.safe.x + 30 * u, L.safe.y + 30 * u, L.safe.width - 60 * u, L.safe.height - 60 * u); });
    tex.needsUpdate = true;
  }

  private sprites(c: ControlsView, L: HudLayout): void {
    const st = this.stick!, rt = this.reticle!, s = c.stick;
    st.mesh.visible = !!s;
    if (s) {
      st.mesh.position.set(s.ox, s.oy, 0);
      const dx = Math.max(-STICK.full, Math.min(STICK.full, s.x - s.ox)), dy = Math.max(-STICK.full, Math.min(STICK.full, s.y - s.oy));
      const key = `${Math.round(dx)}|${Math.round(dy)}|${s.steer}`;
      if (key !== this.stickSig) {
        this.stickSig = key;
        const { g, ratio, size, tex } = st, o = size / 2;
        g.setTransform(ratio, 0, 0, ratio, 0, 0);
        g.clearRect(0, 0, size, size);
        nib(g, ring(o, o, STICK.full, 3), 1.6, 1, INK, 0.55);
        nib(g, ring(o, o, STICK.dead, 6), 0.8, 1, INK, 0.35);
        if (s.steer !== 0) nib(g, ring(o, o, STICK.full, 3, -Math.PI / 2, (s.steer / 127) * Math.PI * 0.5, 16), 3.2, 1, PIG.vermilion, 0.85);
        wash(g, '#f3ead6', 0.75, (q) => q.arc(o + dx, o + dy, 15, 0, Math.PI * 2));
        nib(g, ring(o + dx, o + dy, 15, 1), 2.2, 1);
        tex.needsUpdate = true;
      }
    }
    const a = c.aiming;
    rt.mesh.visible = !!a;
    if (a) {
      rt.mesh.position.set(a.x, a.y - 40 * L.u, 0); // drawn above the finger, where it can be seen
      const { g, ratio, size, tex } = rt, o = size / 2, live = !a.cancel && a.cell >= 0;
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.clearRect(0, 0, size, size);
      const col = live ? PIG.vermilion : PIG.grey;
      nib(g, ring(o, o, size * 0.32, 2), 2, 1, col, live ? 0.9 : 0.5);
      for (let i = 0; i < 4; i++) { const ang = (i * Math.PI) / 2; nib(g, [[o + Math.cos(ang) * size * 0.18, o + Math.sin(ang) * size * 0.18], [o + Math.cos(ang) * size * 0.46, o + Math.sin(ang) * size * 0.46]], 1.6, 1, col); }
      tex.needsUpdate = true;
    }
  }

  private clear(): void {
    for (const ch of [...this.group.children]) {
      this.group.remove(ch);
      const mesh = ch as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      if ('dispose' in ch && typeof (ch as { dispose?: unknown }).dispose === 'function' && !(ch instanceof Scrap) && !(ch instanceof ButtonBase) && !(ch instanceof ThreatVignette) && this.isText(ch)) (ch as InkText).dispose();
      else { mesh.geometry?.dispose(); (mesh.material as THREE.Material & { map?: THREE.Texture | null })?.map?.dispose(); mesh.material?.dispose(); }
    }
    this.texts.clear();
    this.buttons.clear();
  }

  private isText(o: THREE.Object3D): boolean {
    for (const e of this.texts.values()) if (e.t === o) return true;
    return false;
  }

  dispose(): void {
    this.clear();
    this.L = null;
  }
}
