// The planet chart: a sheet over the whole screen, and what is inked on the planet through it. A square window is cut
// in the paper, as tall as the screen allows, its cut edge shading the world under it; corners of paper with a
// graduated ring hold the whole planet round in it, and thin away as the planet outgrows them. Through the window the planet's coasts
// are inked where its land meets the sea, each frame where the planet was drawn this frame (a chart is drawn after the
// world). A finger can turn the planet under it. The full map (fullmap.ts) draws on it.
import { Vector3, type PerspectiveCamera } from 'three';
import {
  Pen, canvas, coasts, ctx, rhumbWeb, ring, type Baked, type ChartLayer, type Coasts, type DragSurface, type Globe,
} from '../chart/index.ts';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';

/** How much ink is in the web's lines on the sheet, and in the coasts: a light hand, under what is drawn on the
 *  planet. */
const WEB = 0.45;
const COAST = 0.5;
const TAU = Math.PI * 2;
/** Paper between the screen's edge and the window's frame, CSS pixels. */
const EDGE = 20;
/** How far past the screen the sheet's paper runs, so its torn edge is never seen, CSS pixels. */
const BLEED = 40;
/** The shade the cut edge of the window throws on the world under it, CSS pixels. */
const SHADE = 16;

/** The window over the planet, CSS pixels, and the width of the graduated band round it. */
export interface Window {
  x: number;
  y: number;
  r: number;
  band: number;
}

export interface PlanetHost {
  /** The camera the planet is drawn with this frame, or null before the stage. */
  camera(): PerspectiveCamera | null;
  /** The orbit the window is cut for: distance from the planet's centre in radii (the farthest the view goes, so the
   *  window never has to change as it zooms), and the field of view in degrees. */
  orbit(): { distance: number; fov: number };
  /** The planet's coasts. */
  coasts(): Coasts;
}

/** Where a finger has turned the planet: the point under the camera (radians) and how fast it turns (radians a
 *  second). */
export interface Turn {
  lat: number;
  lon: number;
  vLat: number;
  vLon: number;
}

/** How far north or south a finger can turn the planet: just short of where the orbit camera loses north. */
const MOST_LAT = 1.25;

/** Turns `turn` as a finger moving (dx, dy) pixels carries the ground at `rp` pixels a radian; returns how far it went. */
export function carry(turn: Turn, dx: number, dy: number, rp: number): { lon: number; lat: number } {
  const lon = -dx / (rp * Math.cos(turn.lat)), lat = dy / rp;
  turn.lon += lon;
  turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, turn.lat + lat));
  return { lon, lat };
}

export class PlanetChart {
  readonly #layer: ChartLayer;
  readonly #h: PlanetHost;
  /** The window, laid out for the layer's size. */
  win: Window;
  readonly #mat = new Float64Array(16);
  readonly #eye = { x: 0, y: 0, z: 1 };

  constructor(layer: ChartLayer, h: PlanetHost) {
    this.#layer = layer;
    this.#h = h;
    this.win = this.#window();
    this.resize();
  }

  /** Lays the window out for the layer's size and the orbit's distance. */
  resize(): void {
    this.win = this.#window();
  }

  /** The planet's limb on the screen from the orbit (the camera looks at its centre, in the middle of the screen),
   *  and the window a little wider. */
  #window(): Window {
    const { w, h, cls, safe } = this.#layer.layout, o = this.#h.orbit();
    const limb = this.#focal() / Math.sqrt(o.distance * o.distance - 1), r = Math.round(limb * 1.035), band = cls === 'iphone' ? 9 : 14;
    return { x: Math.min(w / 2, safe.left + EDGE + band + r), y: h / 2, r, band };
  }

  /** How far left the world is slid to bring the planet's centre under the window, CSS pixels. */
  get shift(): number {
    return this.#layer.layout.w / 2 - this.win.x;
  }

  #paper(): Baked {
    const l = this.#layer.layout;
    return this.#layer.sheet('folio', l.w + BLEED * 2, l.h + BLEED * 2, 9, { folds: false });
  }

  /**
   * The sheet, baked: paper over the whole screen, the web on it, and a square window cut in it inside a graduated
   * frame, north up, its edge shaded. Laid in the page with `place`.
   */
  sheet(): Baked {
    const layer = this.#layer, dpr = layer.dpr, win = this.win, { w: W, h: H } = layer.layout, side = win.r + win.band;
    const folio = this.#paper(), c = canvas(folio.canvas.width, folio.canvas.height), x = ctx(c);
    x.drawImage(folio.canvas, 0, 0);
    const o = (folio.pad + BLEED) * dpr;
    x.setTransform(dpr, 0, 0, dpr, o, o);
    const pen = new Pen(layer.paper, dpr, layer.layout.widths).on(x, o, o);
    const out = new Path2D();
    out.rect(-BLEED, -BLEED, W + BLEED * 2, H + BLEED * 2);
    out.rect(win.x - side, win.y - side, side * 2, side * 2);
    x.save();
    x.clip(out, 'evenodd');
    rhumbWeb(pen, win.x, win.y, side * 0.84, W * 1.4, 1, WEB);
    x.restore();
    this.#frame(pen);
    x.setTransform(dpr, 0, 0, dpr, o, o);
    x.globalCompositeOperation = 'destination-out';
    x.fillRect(win.x - win.r, win.y - win.r, win.r * 2, win.r * 2);
    x.globalCompositeOperation = 'source-over';
    const X0 = win.x - win.r, Y0 = win.y - win.r, S = win.r * 2;
    for (const [ax, ay, bx, by, rx, ry, rw, rh] of [
      [X0, 0, X0 + SHADE, 0, X0, Y0, SHADE, S], [X0 + S, 0, X0 + S - SHADE, 0, X0 + S - SHADE, Y0, SHADE, S],
      [0, Y0, 0, Y0 + SHADE, X0, Y0, S, SHADE], [0, Y0 + S, 0, Y0 + S - SHADE, X0, Y0 + S - SHADE, S, SHADE],
    ]) {
      const shade = x.createLinearGradient(ax, ay, bx, by);
      shade.addColorStop(0, 'rgba(26,14,4,0.42)');
      shade.addColorStop(1, 'rgba(26,14,4,0)');
      x.fillStyle = shade;
      x.fillRect(rx, ry, rw, rh);
    }
    x.setTransform(1, 0, 0, 1, 0, 0);
    return { ...folio, canvas: c };
  }

  /** The square frame round the window: its rules and a band of alternating bars, as the ring has. */
  #frame(pen: Pen): void {
    const { x: cx, y: cy, r, band } = this.win, at = (f: number) => r + band * f;
    const box = (d: number): number[] => [cx - d, cy - d, cx + d, cy - d, cx + d, cy + d, cx - d, cy + d, cx - d, cy - d];
    pen.stroke(box(at(0)), { w: 'fine', nib: 0.15, ink: 'iron', seed: 41, pool: 0.3, wobble: 0.2, drift: 0.2 });
    pen.rule([box(at(0.58)), box(at(0.92))], { w: 'hair', ink: 'iron', seed: 42, wobble: 0.15 });
    pen.stroke(box(at(1)), { w: 'bold', nib: 0.15, ink: 'iron', seed: 43, pool: 0.3, wobble: 0.2, drift: 0.2 });
    const cells = Math.max(8, Math.round(r / (band * 1.4))) * 2, step = (r * 2) / cells, inner = at(0.58), outer = at(0.92), bars = new Path2D();
    for (let k = 0; k < cells; k += 2) {
      const u = -r + k * step;
      bars.rect(cx + u, cy - outer, step, outer - inner);
      bars.rect(cx + u, cy + inner, step, outer - inner);
      bars.rect(cx - outer, cy + u, outer - inner, step);
      bars.rect(cx + inner, cy + u, outer - inner, step);
    }
    pen.fill(bars, 'iron', 0.85);
  }

  /**
   * The paper over the window's corners while the whole planet is in it, with the graduated ring round the planet:
   * it thins away as the planet grows past the ring and the square is all sea. Its canvas is laid over the sheet.
   */
  corners(): Baked {
    const layer = this.#layer, dpr = layer.dpr, win = this.win, s = win.r * 2, folio = this.#paper(), l = (folio.pad + BLEED + win.x - win.r) * dpr, t = (folio.pad + BLEED + win.y - win.r) * dpr;
    const size = Math.ceil(s * dpr), c = canvas(size, size), x = ctx(c);
    x.drawImage(folio.canvas, l, t, size, size, 0, 0, size, size);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pen = new Pen(layer.paper, dpr, layer.layout.widths).on(x, 0, 0), c0 = win.r;
    const out = new Path2D();
    out.rect(0, 0, s, s);
    out.arc(c0, c0, win.r - win.band, 0, TAU);
    x.save();
    x.clip(out, 'evenodd');
    rhumbWeb(pen, c0, c0, win.r * 0.84, s, 1, WEB);
    x.restore();
    ring(pen, c0, c0, win.r - win.band, win.r, { ticks: 360, seed: 41 }, 1, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    const w0 = c0 * dpr, wr = (win.r - win.band) * dpr;
    x.globalCompositeOperation = 'destination-out';
    x.beginPath();
    x.arc(w0, w0, wr, 0, TAU);
    x.fill();
    x.globalCompositeOperation = 'source-over';
    const shade = x.createRadialGradient(w0, w0, wr - SHADE * dpr, w0, w0, wr);
    shade.addColorStop(0, 'rgba(26,14,4,0)');
    shade.addColorStop(1, 'rgba(26,14,4,0.42)');
    x.fillStyle = shade;
    x.beginPath();
    x.arc(w0, w0, wr, 0, TAU);
    x.fill();
    return { ...folio, canvas: c, w: s, h: s, pad: 0 };
  }

  /** Lays a baked sheet in `host` under the chart layer with its paper's corner at (x, y), at `opacity`. */
  place(host: HTMLElement, b: Baked, x: number, y: number, opacity: number): HTMLCanvasElement {
    const el = b.canvas;
    el.style.cssText = `position:absolute;left:${x - b.pad}px;top:${y - b.pad}px;width:${b.w + b.pad * 2}px;height:${b.h + b.pad * 2}px;pointer-events:none;opacity:${opacity}`;
    host.insertBefore(el, this.#layer.el);
    return el;
  }

  /** The window's square, as a clip for what is inked through it. */
  clip(g: CanvasRenderingContext2D): void {
    const w = this.win, p = new Path2D();
    p.rect(w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
    g.clip(p);
  }

  /** The planet as the camera sees it this frame, or null before the stage. */
  globe(): Globe | null {
    const cam = this.#h.camera(), l = this.#layer.layout;
    if (!cam) return null;
    const g = globeOf(cam, l.w, l.h, this.#mat, this.#eye), at = g.project, shift = this.shift;
    // the world is slid left under the window; what is inked over it is placed where the planet has gone
    g.project = (x, y, z, out) => {
      const front = at(x, y, z, out);
      out.x -= shift;
      return front;
    };
    // how far round the planet the window can see from here: a ray at the window's rim (a little past it) meets the
    // sphere at reach, or misses it, and then the window goes to the limb
    const a = Math.atan((this.win.r * Math.SQRT2 * 1.03) / this.#focal()), rim = Math.sin(a) * (cam.position.length() / R);
    if (rim < 1) g.reach = Math.cos(Math.asin(rim) - a);
    return g;
  }

  /** The coasts inked to `tc` at `alpha`, in the window. */
  ink(pen: Pen, gc: CanvasRenderingContext2D, globe: Globe, tc: number, alpha: number): void {
    if (alpha <= 0 || tc <= 0) return;
    gc.save();
    this.clip(gc);
    pen.mood({ dry: 1 - COAST * alpha * (1 - pen.dry) }, () => coasts(pen, this.#h.coasts(), globe, {}, tc));
    gc.restore();
  }

  /** How many pixels at the middle of the window carry the ground under it a radian, from `alt` metres over the sea
   *  (the camera looks straight down, so the ground under it scales as the height does). */
  pxPerRadian(alt: number): number {
    return (this.#focal() * R) / Math.max(1, alt);
  }

  /** The orbit view's focal length on this screen, pixels. */
  #focal(): number {
    return this.#layer.layout.h / 2 / Math.tan((this.#h.orbit().fov * Math.PI) / 360);
  }

  /** The same from where the camera is this frame. */
  #radiusPx(): number {
    const cam = this.#h.camera();
    return cam ? this.pxPerRadian(cam.position.length() - R) : 300;
  }

  /**
   * A drag that turns the planet under the camera: what is under the finger follows it; let go, the planet runs on and
   * slows, unless the finger stopped before it lifted. `turned` steps the turn and gives the point under the camera.
   */
  drag(turn: Turn): DragSurface & { turned(now: number): V3 } {
    let finger: { id: number; x: number; y: number; at: number; vLat: number; vLon: number } | null = null, last = -1;
    return {
      down: (id, x, y) => {
        if (finger) return;
        finger = { id, x, y, at: performance.now(), vLat: 0, vLon: 0 };
        turn.vLat = turn.vLon = 0;
      },
      move: (id, x, y) => {
        const f = finger;
        if (!f || f.id !== id) return;
        const rp = this.#radiusPx(), now = performance.now(), dt = Math.max(1, now - f.at) / 1000;
        const { lon: dLon, lat: dLat } = carry(turn, x - f.x, y - f.y, rp);
        const k = Math.min(1, dt * 12);
        f.vLon += (dLon / dt - f.vLon) * k;
        f.vLat += (dLat / dt - f.vLat) * k;
        f.x = x;
        f.y = y;
        f.at = now;
      },
      up: (id) => {
        const f = finger;
        if (!f || f.id !== id) return;
        finger = null;
        const still = performance.now() - f.at > 90;
        turn.vLon = still ? 0 : Math.max(-1.5, Math.min(1.5, f.vLon));
        turn.vLat = still ? 0 : Math.max(-1.5, Math.min(1.5, f.vLat));
      },
      turned: (now) => {
        const dt = last < 0 ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000)), k = Math.exp(-3 * dt);
        last = now;
        if (!finger) {
          turn.lon += turn.vLon * dt;
          turn.lat = Math.max(-MOST_LAT, Math.min(MOST_LAT, turn.lat + turn.vLat * dt));
          turn.vLon *= k;
          turn.vLat *= k;
        }
        const c = Math.cos(turn.lat);
        return { x: c * Math.cos(turn.lon), y: Math.sin(turn.lat), z: -c * Math.sin(turn.lon) };
      },
    };
  }
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
