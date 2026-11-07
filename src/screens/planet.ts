// The planet under the chart, from orbit, as the lobby and the Gale lay their sheets over it: a window cut in the
// folio round its limb (a little wider, so the atmosphere's rim shows), the cut edge shading the world under it, the
// rhumb web on the paper round the window and a graduated ring inked round its edge; and the planet as the camera sees
// it this frame, to ink things on it where they stand. A chart over it is drawn after the world each frame, so what
// it inks is where the planet was drawn.
import { Vector3, type PerspectiveCamera } from 'three';
import { Pen, canvas, ctx, rhumbWeb, ring, type Baked, type ChartLayer, type Globe } from '../chart/index.ts';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';

/** The folio runs this far past every edge of the screen. */
export const BLEED = 40;
/** How much ink is in the web's lines on the sheet. */
const WEB = 0.45;
const TAU = Math.PI * 2;

/** The window over the planet, CSS pixels, and the width of the graduated band round it. */
export interface Window {
  x: number;
  y: number;
  r: number;
  band: number;
}

/** The planet's limb on the screen from an orbit (distance in radii, field of view in degrees): the camera looks at
 *  its centre, so it stands in the middle of the screen. */
function limbOf(h: number, orbit: { distance: number; fov: number }): number {
  return (h / 2 / Math.tan((orbit.fov * Math.PI) / 360)) / Math.sqrt(orbit.distance * orbit.distance - 1);
}

export function windowOf(layer: ChartLayer, orbit: { distance: number; fov: number }): Window {
  const { w, h } = layer.layout;
  return { x: w / 2, y: h / 2, r: Math.round(limbOf(h, orbit) * 1.035), band: layer.layout.cls === 'iphone' ? 9 : 14 };
}

/** The rhumb web on the paper round the window, inked to t with its north turned by `rot` (and `more` ink), and the
 *  graduated ring round the window. */
export function web(pen: Pen, g: CanvasRenderingContext2D, layer: ChartLayer, win: Window, t: number, rot: number, more = 0): void {
  const { w, h } = layer.layout, cx = w / 2, cy = h / 2, out = new Path2D();
  out.rect(-BLEED, -BLEED, w + BLEED * 2, h + BLEED * 2);
  out.arc(win.x, win.y, win.r + win.band, 0, TAU);
  g.save();
  g.clip(out, 'evenodd');
  g.translate(cx, cy);
  g.rotate(rot);
  g.translate(-cx, -cy);
  rhumbWeb(pen, cx, cy, Math.min(w, h) * 0.56, Math.hypot(w, h), t, WEB + more);
  g.restore();
  ring(pen, win.x, win.y, win.r, win.r + win.band, { ticks: 360, seed: 41 }, t, rot);
}

/**
 * The sheet over the planet: the folio, with whatever `paint` inks on it (in screen pixels), the window cut out of it
 * and the cut edge's shade. A canvas laid in `host` under the chart layer, hidden until shown.
 */
export function cutSheet(layer: ChartLayer, host: HTMLElement, win: Window, paint?: (pen: Pen, g: CanvasRenderingContext2D) => void): { el: HTMLCanvasElement; folio: Baked } {
  const { w, h } = layer.layout, dpr = layer.dpr;
  const folio = layer.sheet('folio', w + BLEED * 2, h + BLEED * 2, 9, { folds: false });
  const el = canvas(folio.canvas.width, folio.canvas.height), x = ctx(el);
  x.drawImage(folio.canvas, 0, 0);
  const o = (folio.pad + BLEED) * dpr;
  if (paint) {
    x.setTransform(dpr, 0, 0, dpr, o, o);
    paint(new Pen(layer.paper, dpr, layer.layout.widths).on(x, o, o), x);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }
  const wx = o + win.x * dpr, wy = o + win.y * dpr, wr = win.r * dpr;
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  x.arc(wx, wy, wr, 0, TAU);
  x.fill();
  x.globalCompositeOperation = 'source-over';
  const shade = x.createRadialGradient(wx, wy, wr - 16 * dpr, wx, wy, wr);
  shade.addColorStop(0, 'rgba(26,14,4,0)');
  shade.addColorStop(1, 'rgba(26,14,4,0.42)');
  x.fillStyle = shade;
  x.beginPath();
  x.arc(wx, wy, wr, 0, TAU);
  x.fill();
  el.style.cssText = `position:absolute;left:${-BLEED - folio.pad}px;top:${-BLEED - folio.pad}px;width:${folio.w + folio.pad * 2}px;height:${folio.h + folio.pad * 2}px;pointer-events:none;opacity:0`;
  host.insertBefore(el, layer.el);
  return { el, folio };
}

/** The planet as a camera sees it this frame, on a w × h screen; `m` and `eye` are the caller's scratch. */
export function globeOf(cam: PerspectiveCamera, w: number, h: number, m: Float64Array, eye: V3): Globe {
  const p = cam.projectionMatrix.elements, v = cam.matrixWorldInverse.elements;
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    m[c * 4 + r] = p[r] * v[c * 4] + p[4 + r] * v[c * 4 + 1] + p[8 + r] * v[c * 4 + 2] + p[12 + r] * v[c * 4 + 3];
  }
  const pos = cam.position, d = Math.hypot(pos.x, pos.y, pos.z);
  eye.x = pos.x / d; eye.y = pos.y / d; eye.z = pos.z / d;
  return {
    eye, horizon: R / d,
    project: (x, y, z, out) => {
      const X = x * R, Y = y * R, Z = z * R;
      const q = m[3] * X + m[7] * Y + m[11] * Z + m[15];
      out.x = ((m[0] * X + m[4] * Y + m[8] * Z + m[12]) / q * 0.5 + 0.5) * w;
      out.y = (0.5 - (m[1] * X + m[5] * Y + m[9] * Z + m[13]) / q * 0.5) * h;
      return q > 0;
    },
  };
}

/** How squarely a point faces the eye, 0 at the limb to 1 under it (negative beyond the limb). */
export function facing(g: Globe, p: V3): number {
  const e = g.eye, dot = p.x * e.x + p.y * e.y + p.z * e.z;
  return (dot - g.horizon) / (1 - g.horizon);
}

const RAY = new Vector3();

/** Where a point on the screen (CSS pixels on a w × h screen) falls on the planet's sea, a unit vector into `out`:
 *  a point off the planet's disc falls on its limb. */
export function unproject(cam: PerspectiveCamera, x: number, y: number, w: number, h: number, out: V3): V3 {
  const o = cam.position, d = RAY.set((x / w) * 2 - 1, 1 - (y / h) * 2, 0.5).unproject(cam).sub(o).normalize();
  const b = o.x * d.x + o.y * d.y + o.z * d.z, c = o.lengthSq() - R * R, disc = b * b - c;
  const s = disc >= 0 ? -b - Math.sqrt(disc) : -b;
  const px = o.x + d.x * s, py = o.y + d.y * s, pz = o.z + d.z * s, l = Math.hypot(px, py, pz) || 1;
  out.x = px / l; out.y = py / l; out.z = pz / l;
  return out;
}
