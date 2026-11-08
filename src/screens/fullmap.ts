// The full map, opened from the minimap's disc over the drop or the match, which go on under it. A round window on the
// live planet in a sheet of paper, north up: the coasts inked over it, the Storm's edge and its next circle, every ship
// in range by her emblem, hers gilt, and her marker a pennant where she has set it. One finger spins the planet and it
// runs on when let go; two pinch it from the whole planet down to a coast's bays and points, and carry it as they go; a
// tap in the window sets or moves the marker; a tap outside the sheet, or on the disc, shuts it.
// The camera is the stage's own orbit view, held on the point the finger has turned to the middle of the window. The
// window is cut once for the whole planet and the zoom happens in it; everything inked in it is placed from the live
// camera, so it stands right at every height, in a size that does not change.
import {
  drawEmblem, drawGalleon, galleonSprite, pennant, staff, WASH, type ChartLayer, type Coasts, type Colours, type DragSurface, type Globe, type Pen,
} from '../chart/index.ts';
import type { PerspectiveCamera } from 'three';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';
import { PlanetChart, carry, facing, unproject, type Turn } from './planet.ts';

/** A ship on the planet, from the app's model. */
export interface MapShip {
  pos: V3;
  emblem: string;
  colour: string;
}

/** What the full map shows of the match, refreshed a few times a second. */
export interface PlanetMapModel {
  me: V3;
  ships: MapShip[];
  storm: { at: V3; r: number } | null;
  next: { at: V3; r: number };
  marker: V3 | null;
}

export interface FullMapHost {
  camera(): PerspectiveCamera | null;
  coasts(): Coasts;
  /** The orbit view's field of view, degrees. */
  readonly fov: number;
  model(): PlanetMapModel;
  /** The land's height at a point on the planet, metres over the sea (negative under it). */
  ground(p: V3): number;
  /** Her colours and charge: her gilt mark. */
  mine: Colours;
  /** Sets or moves her marker. */
  aim(p: V3): void;
  /** Shuts the map. */
  close(): void;
}

/** The distance of the orbit the planet is seen from at first and at its farthest, in radii: the window is cut for it. */
const DISTANCE = 3.6;
/** Seconds the sheet comes up over. */
const LAY = 0.16;
/** A finger that travels less than this before it lifts is a tap, CSS pixels. */
const TAP = 10;
/** How low a pinch can bring the eye, metres over the sea: close enough to read a coast's bays and points. */
const NEAREST = 150;
/** How high it can take it, metres over the sea: the whole planet in the window. */
const FARTHEST = (DISTANCE - 1) * R;
/** How far the eye keeps above the highest ground under the view, metres, however close the fingers ask for it. */
const CLEAR = 60;
/** How far out from under the view the ground is looked at, metres, so the eye rises ahead of a peak spun under it. */
const AHEAD = 30;
/** How fast the eye goes to the height asked of it, per second. */
const FLY = 14;
/** The eye counts as moving fast above this zoom (natural-log change of its height a second) or this speed of the
 *  ground across the window (pixels a second): while it does, the land asks for nothing new. */
const FAST_ZOOM = 0.8;
const FAST_SPIN = 1200;
/** How long the eye must have been slow before the land catches up, milliseconds. */
const REST = 250;
/** The colour of the dark round the sheet when the planet outgrows the paper. */
const VEIL = '#100b08';
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const within = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Two unit tangents at the unit vector c. */
function tangents(c: V3): { t: V3; b: V3 } {
  const ref = Math.abs(c.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  let tx = c.y * ref.z - c.z * ref.y, ty = c.z * ref.x - c.x * ref.z, tz = c.x * ref.y - c.y * ref.x;
  const l = Math.hypot(tx, ty, tz) || 1;
  tx /= l; ty /= l; tz /= l;
  return { t: { x: tx, y: ty, z: tz }, b: { x: c.y * tz - c.z * ty, y: c.z * tx - c.x * tz, z: c.x * ty - c.y * tx } };
}

export class FullMap {
  readonly #host: HTMLElement;
  readonly #h: FullMapHost;
  #layer: ChartLayer | null = null;
  #chart: PlanetChart | null = null;
  #sheet: HTMLCanvasElement | null = null;
  /** The dark round the sheet: under it, over the planet once the planet has grown past the paper. */
  #veil: HTMLDivElement | null = null;
  #veiled = -1;
  #off: (() => void) | null = null;
  #wasDrag: DragSurface | null = null;
  #drag: (DragSurface & { turned(now: number): V3 }) | null = null;
  readonly #turn: Turn = { lat: 0, lon: 0, vLat: 0, vLon: 0 };
  #tap: { id: number; x: number; y: number; far: boolean } | null = null;
  /** The fingers on the map, two at most: one spins it, two pinch it. */
  readonly #fingers = new Map<number, { x: number; y: number }>();
  /** How high the fingers have asked for the eye, and how high it is, metres over the sea. */
  #want = FARTHEST;
  #alt = FARTHEST;
  #flew = -1;
  /** The point under the eye the last frame, and when the eye last moved fast. */
  #before: V3 | null = null;
  #movedAt = -Infinity;
  /** The lowest the eye may stand here, metres over the sea: the ground under the view and its clearance. */
  #floor = 0;
  /** The point under the camera: what the app turns its orbit to. */
  centre: V3 = { x: 0, y: 0, z: 1 };
  /** The orbit's distance, in radii: where the fingers and the ground have the eye. */
  distance = DISTANCE;
  #born = -1;
  #model: PlanetMapModel | null = null;
  #modelAt = -Infinity;
  readonly #P = { x: 0, y: 0 };

  constructor(host: HTMLElement, h: FullMapHost) {
    this.#host = host;
    this.#h = h;
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#model = this.#h.model();
    const m = this.#model.me;
    this.#turn.lat = Math.asin(Math.max(-1, Math.min(1, m.y)));
    this.#turn.lon = Math.atan2(-m.z, m.x);
    this.centre = { ...m };
    this.#chart = new PlanetChart(layer, { camera: () => this.#h.camera(), orbit: () => ({ distance: DISTANCE, fov: this.#h.fov }), coasts: () => this.#h.coasts() });
    this.#wasDrag = layer.drag;
    this.#drag = this.#chart.drag(this.#turn);
    layer.drag = { down: (id, x, y) => this.#down(id, x, y), move: (id, x, y) => this.#move(id, x, y), up: (id, x, y) => this.#up(id, x, y) };
    this.#lay();
    this.#off = layer.addLive((g, t) => this.#frame(g, t));
  }

  /** The window on the planet, CSS pixels. */
  get window(): { x: number; y: number; r: number } | null {
    const w = this.#chart?.win;
    return w ? { x: w.x, y: w.y, r: w.r } : null;
  }

  /** A press on the map at (x, y): the marker in the window, or shut if it was outside the sheet. */
  tap(x: number, y: number): void {
    const layer = this.#layer, chart = this.#chart, cam = this.#h.camera();
    if (!layer || !chart || !cam) return;
    const w = chart.win, half = chart.half;
    if (Math.abs(x - w.x) > half || Math.abs(y - w.y) > half) {
      this.#h.close();
      return;
    }
    if (Math.hypot(x - w.x, y - w.y) >= w.r) return;
    this.#h.aim(unproject(cam, x, y, layer.layout.w, layer.layout.h, { x: 0, y: 0, z: 1 }));
  }

  resize(): void {
    if (this.#layer) this.#lay();
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#sheet?.remove();
    this.#sheet = null;
    this.#veil?.remove();
    this.#veil = null;
    if (this.#layer && this.#drag) this.#layer.drag = this.#wasDrag;
  }

  // ── the fingers ──

  /** A finger landed. The first may be a tap or a spin; a second makes it a pinch, never a tap and no spin. */
  #down(id: number, x: number, y: number): void {
    const n = this.#fingers.size;
    if (n >= 2) return;
    this.#fingers.set(id, { x, y });
    if (n === 0) {
      this.#tap = { id, x, y, far: false };
      this.#drag!.down(id, x, y);
      return;
    }
    this.#tap = null;
    for (const [k, q] of this.#fingers) if (k !== id) this.#drag!.up(k, q.x, q.y);
    this.#turn.vLat = this.#turn.vLon = 0;
  }

  #move(id: number, x: number, y: number): void {
    const f = this.#fingers.get(id);
    if (!f) return;
    if (this.#fingers.size === 1) {
      const t = this.#tap;
      if (t && t.id === id && Math.hypot(x - t.x, y - t.y) > TAP) t.far = true;
      this.#drag!.move(id, x, y);
    } else {
      this.#pinch(id, f, x, y);
    }
    f.x = x;
    f.y = y;
  }

  #up(id: number, x: number, y: number): void {
    if (!this.#fingers.delete(id)) return;
    if (this.#fingers.size === 1) {
      // the pinch is over: the finger still down goes on as a spin, from where it is
      for (const [k, q] of this.#fingers) this.#drag!.down(k, q.x, q.y);
      return;
    }
    this.#drag!.up(id, x, y);
    const t = this.#tap;
    this.#tap = null;
    if (t && t.id === id && !t.far) this.tap(x, y);
  }

  /** Finger `id` of two moved from `f` to (x, y): their span takes the eye up or down, about their middle, and the
   *  middle's own move carries the planet. */
  #pinch(id: number, f: { x: number; y: number }, x: number, y: number): void {
    let o = f;
    for (const [k, q] of this.#fingers) if (k !== id) o = q;
    const d0 = Math.hypot(f.x - o.x, f.y - o.y), d1 = Math.hypot(x - o.x, y - o.y);
    if (d0 <= 8 || d1 <= 8) return;
    const chart = this.#chart!, w = chart.win, a0 = Math.max(this.#want, this.#floor);
    const a1 = within((a0 * d0) / d1, Math.max(NEAREST, this.#floor), FARTHEST);
    const rp0 = chart.pxPerRadian(a0), rp1 = chart.pxPerRadian(a1), k = 1 - rp0 / rp1;
    // the ground under the middle of the fingers stays there as the planet grows or shrinks about it
    carry(this.#turn, ((f.x + o.x) / 2 - w.x) * -k, ((f.y + o.y) / 2 - w.y) * -k, rp0);
    carry(this.#turn, (x - f.x) / 2, (y - f.y) / 2, rp1);
    this.#want = a1;
  }

  /** The eye toward the height asked of it. */
  #fly(now: number): void {
    const dt = this.#flew < 0 ? 0 : Math.min(0.1, Math.max(0, (now - this.#flew) / 1000));
    this.#flew = now;
    this.#floor = this.#ground() + CLEAR;
    const alt0 = this.#alt;
    this.#alt += (Math.max(this.#want, this.#floor) - this.#alt) * (1 - Math.exp(-FLY * dt));
    this.distance = 1 + this.#alt / R;
    const c = this.centre, p = this.#before;
    if (dt > 0 && p) {
      const ground = (Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) * this.#chart!.pxPerRadian(this.#alt)) / dt;
      if (Math.abs(Math.log(this.#alt / alt0)) / dt > FAST_ZOOM || ground > FAST_SPIN) this.#movedAt = now;
    }
    this.#before = c;
  }

  /** Whether the eye is moving too fast for the land to chase: it asks for no chunk or scan until it slows. */
  get restless(): boolean {
    return this.#flew - this.#movedAt < REST;
  }

  /** The highest ground under the view and just round it, metres, never below the sea. */
  #ground(): number {
    const c = this.centre, { t, b } = tangents(c), a = AHEAD / R, ca = Math.cos(a), sa = Math.sin(a), h = this.#h;
    let top = h.ground(c);
    const q = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 8; i++) {
      const th = (i / 8) * TAU, u = sa * Math.cos(th), v = sa * Math.sin(th);
      q.x = c.x * ca + t.x * u + b.x * v;
      q.y = c.y * ca + t.y * u + b.y * v;
      q.z = c.z * ca + t.z * u + b.z * v;
      top = Math.max(top, h.ground(q));
    }
    return Math.max(0, top);
  }

  #lay(): void {
    const chart = this.#chart!;
    chart.resize();
    this.#sheet?.remove();
    this.#sheet = chart.place(this.#host, chart.sheet(), 0);
    const w = chart.win, half = w.r + w.band, veil = (this.#veil ??= document.createElement('div'));
    veil.style.cssText = `position:absolute;left:${w.x - half}px;top:${w.y - half}px;width:${half * 2}px;height:${half * 2}px;box-shadow:0 0 0 200vmax ${VEIL};pointer-events:none;opacity:0`;
    this.#host.insertBefore(veil, this.#sheet);
    this.#veiled = -1;
  }

  #frame(g: CanvasRenderingContext2D, now: number): void {
    const layer = this.#layer!, pen = layer.pen, chart = this.#chart!;
    this.centre = this.#drag!.turned(now);
    this.#fly(now);
    if (now - this.#modelAt > 80) {
      this.#modelAt = now;
      this.#model = this.#h.model();
    }
    const a = clamp((now - this.#born) / 1000 / LAY);
    if (this.#sheet) this.#sheet.style.opacity = String(a);
    const veiled = Math.round(a * clamp((DISTANCE - this.distance) / 0.4) * 50) / 50;
    if (this.#veil && veiled !== this.#veiled) {
      this.#veil.style.opacity = String(veiled);
      this.#veiled = veiled;
    }
    const globe = chart.globe(), m = this.#model;
    if (!globe || !m) return;
    pen.mood({ dry: 1 - a }, () => this.#ink(g, pen, globe, m, now));
  }

  #ink(g: CanvasRenderingContext2D, pen: Pen, globe: Globe, m: PlanetMapModel, now: number): void {
    const chart = this.#chart!, layer = this.#layer!, w = chart.win, P = this.#P, l = layer.layout, a = 1 - pen.dry;
    chart.ink(pen, g, globe, 1, 1);
    g.save();
    const clip = new Path2D();
    clip.arc(w.x, w.y, w.r, 0, TAU);
    g.clip(clip);
    if (m.storm) this.#circle(pen, globe, m.storm.at, m.storm.r, { w: 'bold', ink: 'rubric', alpha: 0.95, wobble: 0, seed: 61 });
    this.#circle(pen, globe, m.next.at, m.next.r, { w: 'fine', ink: 'iron', alpha: 0.9, wobble: 0, seed: 62 }, [0, 7]);
    for (const sh of m.ships) {
      const f = facing(globe, sh.pos);
      if (f <= 0.02 || !globe.project(sh.pos.x, sh.pos.y, sh.pos.z, P)) continue;
      drawEmblem(g, layer.paper, sh.emblem, sh.colour, P.x, P.y, l.mark.hud, layer.dpr, a * Math.min(1, f / 0.1));
    }
    const f = facing(globe, m.me);
    if (f > 0.02 && globe.project(m.me.x, m.me.y, m.me.z, P)) {
      drawGalleon(g, galleonSprite(pen, this.#h.mine, { size: Math.round(l.mark.chart * 0.72), gilt: true, facing: 1 }), P.x, P.y, a * Math.min(1, f / 0.1));
    }
    if (m.marker && facing(globe, m.marker) > 0.02 && globe.project(m.marker.x, m.marker.y, m.marker.z, P)) {
      const tall = 44, x = P.x, y = P.y;
      staff(pen, x, y - tall, y, 1, 3);
      pennant(pen, { x, y: y - tall + 2, length: 34, height: 14, colour: WASH.vermilion, seed: 41, phase: now / 260 });
    }
    g.restore();
  }

  /** A circle of angular radius r/R round `c` on the sphere: as many points as the whole of it, laid along the arc
   *  the window can see, so a storm's edge stays a true curve however close the eye comes. */
  #circle(pen: Pen, globe: Globe, c: V3, r: number, st: Parameters<Pen['rule']>[1], dash?: number[]): void {
    const a = r / R, ca = Math.cos(a), sa = Math.sin(a), P = this.#P, { t, b } = tangents(c), e = globe.eye;
    // a point's dot with the eye runs round the circle as A + B cos(th - phi): the arc that clears `edge` is what shows
    const edge = Math.max(globe.horizon, globe.reach ?? globe.horizon);
    const A = ca * (c.x * e.x + c.y * e.y + c.z * e.z), te = t.x * e.x + t.y * e.y + t.z * e.z, be = b.x * e.x + b.y * e.y + b.z * e.z;
    const B = sa * Math.hypot(te, be), phi = Math.atan2(be, te);
    let from = 0, span = TAU;
    if (B > 1e-9) {
      const need = (edge - A) / B;
      if (need >= 1) return;
      if (need > -1) {
        const w = Math.acos(need);
        from = phi - w;
        span = 2 * w;
      }
    } else if (A <= edge) return;
    const runs: number[][] = [];
    let run: number[] | null = null;
    const N = 120, q = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= N; i++) {
      const th = from + (i / N) * span, u = sa * Math.cos(th), v = sa * Math.sin(th);
      q.x = c.x * ca + t.x * u + b.x * v;
      q.y = c.y * ca + t.y * u + b.y * v;
      q.z = c.z * ca + t.z * u + b.z * v;
      if (facing(globe, q) <= 0.01 || !globe.project(q.x, q.y, q.z, P)) { run = null; continue; }
      if (!run) runs.push((run = []));
      run.push(P.x, P.y);
    }
    pen.rule(runs, st, 1, dash);
  }
}
