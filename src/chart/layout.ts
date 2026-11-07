// Where things go on the two devices, designed for each and not scaled from one to the other. An iPad is held by its
// sides with the thumbs resting a hand's width in from its lower corners; a phone is held by its ends with the thumbs
// low on either side, a finger's breadth from its rounded corners and clear of the camera's notch. The HUD's disc sits
// top right, out from under both thumbs; the controls sit under the thumbs, every one at least the touch target; the
// right thumb's cluster is laid round it in an arc it can sweep without moving the hand.
import { TARGET } from './press.ts';
import type { Widths } from './pen.ts';

export type DeviceClass = 'ipad' | 'iphone';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ChartLayout {
  cls: DeviceClass;
  w: number;
  h: number;
  safe: Insets;
  /** The three line widths, CSS pixels. */
  widths: Widths;
  /** The touch target, points. */
  target: number;
  /** Where the thumbs rest, and how much of the screen each covers there. */
  thumbs: { left: Circle; right: Circle };
  /** The HUD's papyrus disc. */
  hud: Circle;
  /** The match's controls: the stick under the left thumb, the fire seal under the right, the rest round it. */
  controls: { stick: Circle; fire: Circle; gust: Circle; ability: Box; reload: Circle; sails: Circle };
  /** Body heights of the numeral hand: a hit-mark, the Storm's clock, a result's large figure. */
  figure: { hit: number; clock: number; large: number };
  /** A sheet's margin from the screen's edge. */
  margin: number;
  /** The galleon mark's hull length on the HUD and on the lobby's chart. */
  mark: { hud: number; chart: number };
  /** The lobby chart's compass rose, in its top left corner: where the title's rose flies to. */
  rose: Circle;
}

/** The class of a landscape screen of this size: a phone is the one less than 500 points tall. */
export const deviceClass = (w: number, h: number): DeviceClass => (Math.min(w, h) < 500 ? 'iphone' : 'ipad');

export function chartLayout(w: number, h: number, safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): ChartLayout {
  const cls = deviceClass(w, h);
  if (cls === 'ipad') {
    const L = { x: safe.left + 150, y: h - safe.bottom - 210, r: 78 };
    const R = { x: w - safe.right - 150, y: h - safe.bottom - 210, r: 78 };
    const disc = Math.round(Math.min(150, Math.max(124, Math.min(w, h) * 0.14)));
    return {
      cls, w, h, safe,
      widths: { hair: 0.6, fine: 1.05, bold: 1.9 },
      target: TARGET,
      thumbs: { left: L, right: R },
      hud: { x: w - safe.right - disc - 26, y: safe.top + disc + 26, r: disc },
      controls: {
        stick: { x: L.x, y: L.y, r: 72 },
        fire: { x: R.x, y: R.y, r: 54 },
        gust: { x: R.x - 128, y: R.y - 92, r: 34 },
        ability: { x: R.x - 14, y: R.y - 160, w: 118, h: 84 },
        reload: { x: R.x - 150, y: R.y + 46, r: 34 },
        sails: { x: L.x + 18, y: L.y - 170, r: 36 },
      },
      figure: { hit: 26, clock: 22, large: 64 },
      margin: 22,
      mark: { hud: 34, chart: 64 },
      rose: { x: safe.left + 22 + 72, y: safe.top + 22 + 72, r: 72 },
    };
  }
  const L = { x: safe.left + 92, y: h - safe.bottom - 102, r: 56 };
  const R = { x: w - safe.right - 92, y: h - safe.bottom - 102, r: 56 };
  const disc = Math.round(Math.min(92, Math.max(64, h * 0.17)));
  return {
    cls, w, h, safe,
    widths: { hair: 0.5, fine: 0.9, bold: 1.6 },
    target: TARGET,
    thumbs: { left: L, right: R },
    hud: { x: w - safe.right - disc - 10, y: safe.top + disc + 10, r: disc },
    controls: {
      stick: { x: L.x, y: L.y, r: 56 },
      fire: { x: R.x, y: R.y, r: 40 },
      gust: { x: R.x + 6, y: R.y - 86, r: 28 },
      ability: { x: R.x - 100, y: R.y - 58, w: 88, h: 62 },
      reload: { x: R.x - 112, y: R.y + 30, r: 28 },
      sails: { x: L.x + 6, y: L.y - 110, r: 28 },
    },
    figure: { hit: 18, clock: 16, large: 44 },
    margin: 12,
    mark: { hud: 26, chart: 48 },
    rose: { x: safe.left + 12 + 46, y: safe.top + 12 + 46, r: 46 },
  };
}

type Shape = { kind: 'circle'; c: Circle } | { kind: 'box'; b: Box };

const overlap = (a: Shape, b: Shape): boolean => {
  const box = (s: Shape): Box => (s.kind === 'box' ? s.b : { x: s.c.x, y: s.c.y, w: s.c.r * 2, h: s.c.r * 2 });
  if (a.kind === 'circle' && b.kind === 'circle') return Math.hypot(a.c.x - b.c.x, a.c.y - b.c.y) < a.c.r + b.c.r;
  const A = box(a), B = box(b);
  return Math.abs(A.x - B.x) * 2 < A.w + B.w && Math.abs(A.y - B.y) * 2 < A.h + B.h;
};

/**
 * What breaks the layout's rules: a control smaller than the target, two controls' targets overlapping, the disc
 * under a thumb, anything outside the safe area. Empty when the layout holds.
 */
export function layoutProblems(l: ChartLayout): string[] {
  const out: string[] = [];
  const t = l.target / 2;
  const ctl: [string, Shape][] = Object.entries(l.controls).map(([k, v]) => [k, 'r' in v
    ? { kind: 'circle', c: { ...v, r: Math.max(v.r, t) } }
    : { kind: 'box', b: { ...v, w: Math.max(v.w, l.target), h: Math.max(v.h, l.target) } }]);
  for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
    if (overlap(ctl[i][1], ctl[j][1])) out.push(`${ctl[i][0]} and ${ctl[j][0]} overlap`);
  }
  const disc: Shape = { kind: 'circle', c: l.hud };
  for (const [k, th] of Object.entries(l.thumbs)) if (overlap(disc, { kind: 'circle', c: th })) out.push(`the disc is under the ${k} thumb`);
  for (const [k, s] of ctl) if (overlap(disc, s)) out.push(`the disc covers ${k}`);
  const inside = (s: Shape) => {
    const b = s.kind === 'box' ? s.b : { x: s.c.x, y: s.c.y, w: s.c.r * 2, h: s.c.r * 2 };
    return b.x - b.w / 2 >= l.safe.left && b.x + b.w / 2 <= l.w - l.safe.right && b.y - b.h / 2 >= l.safe.top && b.y + b.h / 2 <= l.h - l.safe.bottom;
  };
  for (const [k, s] of [...ctl, ['disc', disc] as [string, Shape]]) if (!inside(s)) out.push(`${k} is outside the safe area`);
  return out;
}
