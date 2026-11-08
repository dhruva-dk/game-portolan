// The full map, opened from the minimap's disc over the drop or the match, which go on under it. A round window on the
// live planet in a sheet of paper, north up: the coasts inked over it, the Storm's edge and its next circle, every ship
// in range by her emblem, hers gilt, and her marker a pennant where she has set it. One finger spins the planet and it
// runs on when let go; a tap in the window sets or moves the marker; a tap outside the sheet, or on the disc, shuts it.
// The camera is the stage's own orbit view, held on the point the finger has turned to the middle of the window.
import {
  drawEmblem, drawGalleon, galleonSprite, pennant, staff, WASH, type ChartLayer, type Coasts, type Colours, type DragSurface, type Globe, type Pen,
} from '../chart/index.ts';
import type { PerspectiveCamera } from 'three';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';
import { PlanetChart, facing, unproject, type Turn } from './planet.ts';

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
  /** Her colours and charge: her gilt mark. */
  mine: Colours;
  /** Sets or moves her marker. */
  aim(p: V3): void;
  /** Shuts the map. */
  close(): void;
}

/** The distance of the orbit the planet is seen from at first, in radii. */
const DISTANCE = 3.6;
/** Seconds the sheet comes up over. */
const LAY = 0.16;
/** A finger that travels less than this before it lifts is a tap, CSS pixels. */
const TAP = 10;
const TAU = Math.PI * 2;
const clamp = (x: number) => Math.min(1, Math.max(0, x));

export class FullMap {
  readonly #host: HTMLElement;
  readonly #h: FullMapHost;
  #layer: ChartLayer | null = null;
  #chart: PlanetChart | null = null;
  #sheet: HTMLCanvasElement | null = null;
  #off: (() => void) | null = null;
  #wasDrag: DragSurface | null = null;
  #drag: (DragSurface & { turned(now: number): V3 }) | null = null;
  readonly #turn: Turn = { lat: 0, lon: 0, vLat: 0, vLon: 0 };
  #tap: { id: number; x: number; y: number; far: boolean } | null = null;
  /** The point under the camera: what the app turns its orbit to. */
  centre: V3 = { x: 0, y: 0, z: 1 };
  /** The orbit's distance, in radii: a pinch can drive it; the window follows it (see `refit`). */
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
    this.#chart = new PlanetChart(layer, { camera: () => this.#h.camera(), orbit: () => ({ distance: this.distance, fov: this.#h.fov }), coasts: () => this.#h.coasts() });
    this.#wasDrag = layer.drag;
    this.#drag = this.#chart.drag(this.#turn);
    layer.drag = {
      down: (id, x, y) => {
        if (!this.#tap) this.#tap = { id, x, y, far: false };
        this.#drag!.down(id, x, y);
      },
      move: (id, x, y) => {
        const t = this.#tap;
        if (t && t.id === id && Math.hypot(x - t.x, y - t.y) > TAP) t.far = true;
        this.#drag!.move(id, x, y);
      },
      up: (id, x, y) => {
        this.#drag!.up(id, x, y);
        const t = this.#tap;
        if (t && t.id === id) {
          this.#tap = null;
          if (!t.far) this.tap(x, y);
        }
      },
    };
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

  /** Re-lays the window and its sheet for the current `distance`. */
  refit(): void {
    this.#lay();
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#sheet?.remove();
    this.#sheet = null;
    if (this.#layer && this.#drag) this.#layer.drag = this.#wasDrag;
  }

  #lay(): void {
    const chart = this.#chart!;
    chart.resize();
    this.#sheet?.remove();
    this.#sheet = chart.place(this.#host, chart.sheet(), 0);
  }

  #frame(g: CanvasRenderingContext2D, now: number): void {
    const layer = this.#layer!, pen = layer.pen, chart = this.#chart!;
    this.centre = this.#drag!.turned(now);
    if (now - this.#modelAt > 80) {
      this.#modelAt = now;
      this.#model = this.#h.model();
    }
    const a = clamp((now - this.#born) / 1000 / LAY);
    if (this.#sheet) this.#sheet.style.opacity = String(a);
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
    if (m.storm) this.#circle(pen, globe, m.storm.at, m.storm.r, { w: 'bold', ink: 'rubric', alpha: 0.95, wobble: 0.3, seed: 61 });
    this.#circle(pen, globe, m.next.at, m.next.r, { w: 'fine', ink: 'iron', alpha: 0.9, wobble: 0.2, seed: 62 }, [0, 7]);
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

  /** A circle of angular radius r/R round `c` on the sphere, in the runs that face the eye. */
  #circle(pen: Pen, globe: Globe, c: V3, r: number, st: Parameters<Pen['rule']>[1], dash?: number[]): void {
    const a = r / R, ca = Math.cos(a), sa = Math.sin(a), P = this.#P;
    // two tangents at c
    const ref = Math.abs(c.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
    let tx = c.y * ref.z - c.z * ref.y, ty = c.z * ref.x - c.x * ref.z, tz = c.x * ref.y - c.y * ref.x;
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l; ty /= l; tz /= l;
    const bx = c.y * tz - c.z * ty, by = c.z * tx - c.x * tz, bz = c.x * ty - c.y * tx;
    const runs: number[][] = [];
    let run: number[] | null = null;
    const N = 120, q = { x: 0, y: 0, z: 0 };
    for (let i = 0; i <= N; i++) {
      const th = (i / N) * TAU, u = sa * Math.cos(th), v = sa * Math.sin(th);
      q.x = c.x * ca + tx * u + bx * v;
      q.y = c.y * ca + ty * u + by * v;
      q.z = c.z * ca + tz * u + bz * v;
      if (facing(globe, q) <= 0.01 || !globe.project(q.x, q.y, q.z, P)) { run = null; continue; }
      if (!run) runs.push((run = []));
      run.push(P.x, P.y);
    }
    pen.rule(runs, st, 1, dash);
  }
}
