// The Gale, drawn on the chart. The sheet stays up over the planet while the fleet is carried: the planet turns under
// the Gale's course, a dotted rhumb line straight across the window, and the fleet's galleon marks slide along it, hers
// gilt and leading. A press on the planet marks her dive, a cross inked where the finger lifted and a dotted line from
// her mark to it; another press moves it. A sand-glass in the corner drains for the time left to choose. When she
// leaves the Gale the sheet thins to the world as the camera dives with her, and is gone when she lands. Nothing is
// written.
//
// The sheet is the planet chart's (planet.ts): the folio with its window, the web and the rose's needle swung to the
// course, baked once onto a canvas under the chart layer, with the planet's coasts and its seas' signs inked through
// the window. Played from the lobby, the same sheet whole has unrolled over her ship, and lies under this one until it
// thins away to open the window on the planet. The camera looks straight down on the course, at a point that moves
// along it at two thirds of the fleet's pace, so the course is a straight line through the window's middle and the
// fleet slides along it while the planet turns. The course and the dive's line are dots fixed on the planet, so they
// turn with it and never crawl. The fleet rides in a formation drawn
// wider than it sails, so each captain reads; a captain who leaves the Gale peels off to where she really is.
import {
  Press, arcPts, cross, drawGalleon, ease, galleonSprite, hand, sandglass, stagger, type ChartLayer, type Colours, type Globe,
  type Pen,
} from '../chart/index.ts';
import { GALE } from '../sim/tables.ts';
import { R } from '../sim/sphere.ts';
import { PHASE } from '../sim/state.ts';
import type { V3 } from '../sim/math.ts';
import { PlanetChart, facing, unproject, type PlanetHost, type Window } from './planet.ts';

/** A ship as the chart reads her this frame. */
export interface GaleShip {
  pos: V3;
  head: V3;
  alt: number;
  phase: number;
}

export interface GaleHost extends PlanetHost {
  /** The Gale's course: where it rises (a unit vector) and its way from there (a unit tangent). */
  course(): { from: V3; dir: V3 };
  /** Seconds the Gale has blown, to the frame. */
  time(): number;
  /** The fleet's colours, by ship. */
  colours(): readonly Colours[];
  /** Her ship, and how many there are. */
  me: number;
  ships: number;
  /** Ship i as she stands this frame, into `out`. */
  ship(i: number, out: GaleShip): GaleShip;
  /** Marks her dive. */
  aim(p: V3): void;
}

export interface GaleOptions {
  /** Seconds before the ink begins (the window still opening in the lobby's sheet over it). */
  delay?: number;
  /** The sheet is up at once (the lobby unrolled it, whole, and it opens over this one); otherwise it comes up. */
  under?: boolean;
  /** The first Gale: a hand points where a press marks the dive. */
  teach?: boolean;
}

/** When each thing happens, seconds from the ink's start; the press's and the leaving's from theirs. */
const AT = {
  sheet: 0.35,
  /** The planet's coasts, and its seas' signs one after another. */
  coasts: [0, 1.0],
  signs: [0.3, 1.3],
  course: [0, 0.9],
  fleet: [0.25, 1.1],
  glass: [0.35, 1.0],
  hand: [1.3, 1.8],
  /** A cross inks in, its line runs out to it; an old one dries. */
  cross: 0.25,
  line: 0.45,
  gone: 0.3,
  /** The glass dries as she leaves; everything dries leaving for anything but the sea. */
  dryGlass: 0.4,
  dry: 0.3,
} as const;

const TAU = Math.PI * 2;
const clamp = (x: number) => Math.min(1, Math.max(0, x));
const span = (s: number, [a, b]: readonly [number, number]): number => clamp((s - a) / (b - a));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The point on the course `a` radians along it, and the way on there. */
function along(from: V3, dir: V3, a: number, out: V3, head?: V3): V3 {
  const c = Math.cos(a), s = Math.sin(a);
  out.x = from.x * c + dir.x * s; out.y = from.y * c + dir.y * s; out.z = from.z * c + dir.z * s;
  if (head) { head.x = dir.x * c - from.x * s; head.y = dir.y * c - from.y * s; head.z = dir.z * c - from.z * s; }
  return out;
}

/** The camera's dive with her as she leaves the Gale, seconds: straight down from the orbit to above her, then round
 *  behind her to sail. The sheet thins away over it. */
export const DIVE = { descent: 1.4, settle: 1.4 } as const;

/** Where the camera looks `s` seconds into the dive, as an orbit: its point (from where it looked over the course to
 *  her, into `out`) and its distance from the planet's centre in radii, down to a little above her; null once the
 *  descent is over and the camera follows her. */
export function diveView(from: V3, to: V3, alt: number, s: number, distance: number, out: V3): number | null {
  if (s >= DIVE.descent) return null;
  const k = ease.inOut(clamp(s / DIVE.descent)), d = Math.acos(Math.max(-1, Math.min(1, from.x * to.x + from.y * to.y + from.z * to.z)));
  const sd = Math.sin(d), a = sd < 1e-6 ? 1 - k : Math.sin((1 - k) * d) / sd, b = sd < 1e-6 ? k : Math.sin(k * d) / sd;
  out.x = from.x * a + to.x * b; out.y = from.y * a + to.y * b; out.z = from.z * a + to.z * b;
  const near = (R + alt + 160) / R;
  return Math.exp(Math.log(distance) + (Math.log(near) - Math.log(distance)) * k);
}

/** How far along its course the Gale has carried the fleet at t seconds, radians. */
const carried = (t: number): number => (GALE.arc * Math.min(t, GALE.time)) / GALE.time;

/** Where the camera looks at t seconds into the Gale: on the course, a sixth of the way along it at first and five
 *  sixths at the end, so the fleet, its ranks trailing, comes in from behind the middle and slides on past it. */
export function galeLook(from: V3, dir: V3, t: number, out: V3, head: V3): void {
  along(from, dir, GALE.arc / 6 + (carried(t) * 2) / 3, out, head);
}

/** The course's bearing where the Gale rises, radians clockwise from north: the lobby swings its web to it. */
export function courseBearing(from: V3, dir: V3): number {
  // east is north's pole crossed with the point, north the point crossed with east
  let ex = from.z, ez = -from.x;
  const l = Math.hypot(ex, ez);
  if (l < 1e-6) { ex = 0; ez = -1; } else { ex /= l; ez /= l; }
  const nx = from.y * ez, ny = from.z * ex - from.x * ez, nz = -from.y * ex;
  return Math.atan2(dir.x * ex + dir.z * ez, dir.x * nx + dir.y * ny + dir.z * nz);
}

/** Dots (x, y, radius in threes) inked over a ground of lead white a little wider, so they read over the night side
 *  as over the day: one path a pass. */
function dots(pen: Pen, pts: readonly number[], ink: 'iron' | 'rubric', alpha: number): void {
  if (alpha <= 0 || !pts.length) return;
  const under = new Path2D(), over = new Path2D();
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], r = pts[i + 2];
    under.moveTo(x + r + 1, y);
    under.arc(x, y, r + 1, 0, TAU);
    over.moveTo(x + r, y);
    over.arc(x, y, r, 0, TAU);
  }
  pen.fill(under, 'white', 0.45 * alpha);
  pen.fill(over, ink, 0.9 * alpha);
}

interface Mark {
  p: V3;
  at: number;
  /** When a newer press moved it (ms), or -1. */
  gone: number;
}

export class Gale {
  readonly #host: HTMLElement;
  readonly #h: GaleHost;
  #layer: ChartLayer | null = null;
  #chart: PlanetChart | null = null;
  #win: Window | null = null;
  #sheet: HTMLCanvasElement | null = null;
  #colours: readonly Colours[];
  readonly #delay: number;
  readonly #under: boolean;
  readonly #teach: boolean;
  #born = -1;
  #t0 = -1;
  /** When she left the Gale, when the first press marked the dive, when the chart left (ms; -1 not yet). */
  #diveAt = -1;
  #taught = -1;
  #leftAt = -1;
  #marks: Mark[] = [];
  /** When each captain left the Gale (ms), for her mark to peel off; -1 still aboard. */
  #peel: number[];
  readonly #press = new Press();
  #off: (() => void) | null = null;
  #lastNow = 0;
  readonly #ship: GaleShip = { pos: { x: 0, y: 0, z: 1 }, head: { x: 1, y: 0, z: 0 }, alt: 0, phase: 0 };
  readonly #q = { x: 0, y: 0, z: 1 };
  readonly #r = { x: 0, y: 0, z: 1 };
  readonly #P = { x: 0, y: 0 };
  /** Called once the chart has gone. */
  onGone?: () => void;

  constructor(host: HTMLElement, h: GaleHost, o: GaleOptions = {}) {
    this.#host = host;
    this.#h = h;
    this.#colours = h.colours();
    this.#delay = o.delay ?? 0;
    this.#under = !!o.under;
    this.#teach = !!o.teach;
    this.#peel = new Array<number>(h.ships).fill(-1);
  }

  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#born = now;
    this.#lastNow = now;
    this.#t0 = now + this.#delay * 1000;
    this.#lay();
    const off = layer.addLive((g, t) => this.#frame(g, t));
    layer.presses.add({ id: 'gale:mark', hit: { x: 0, y: 0, r: 1 }, press: this.#press, sound: 'pick', haptic: 'medium', act: (x, y) => this.#aim(x, y) });
    this.#placePress();
    this.#off = () => {
      off();
      layer.presses.remove('gale:mark');
    };
  }

  resize(): void {
    if (!this.#layer) return;
    this.#lay();
    this.#placePress();
  }

  /** Leaves at `now`: once she is at sea the sheet is already gone; for anything else the ink dries away. */
  leave(now: number): void {
    if (this.#leftAt >= 0) return;
    this.#leftAt = now;
    this.#layer?.presses.remove('gale:mark');
  }

  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#sheet?.remove();
    this.#sheet = null;
  }

  // ── the sheet ──

  #lay(): void {
    const layer = this.#layer!, chart = this.#chart;
    if (chart) chart.resize();
    else this.#chart = new PlanetChart(layer, this.#h);
    this.#win = this.#chart!.win;
    const c = this.#h.course();
    this.#sheet?.remove();
    // the web and the rose's needle swung to the course
    this.#sheet = this.#chart!.place(this.#host, this.#chart!.sheet(courseBearing(c.from, c.dir)), this.#under ? 1 : 0);
  }

  /** The press over the window, kept out of the safe areas (the phone's window runs under its home bar). */
  #placePress(): void {
    const l = this.#layer!.layout, s = l.safe, p = this.#layer!.presses.list.find((q) => q.id === 'gale:mark'), w = this.#win!;
    if (p) p.hit = { x: w.x, y: w.y, r: Math.min(w.r, w.y - s.top, l.h - s.bottom - w.y, w.x - s.left, l.w - s.right - w.x) };
  }

  /** A press on the planet: her dive is marked where the finger lifted. */
  #aim(x: number, y: number): void {
    const cam = this.#h.camera(), l = this.#layer;
    if (!cam || !l || this.#diveAt >= 0 || this.#leftAt >= 0) return;
    const p = unproject(cam, x, y, l.layout.w, l.layout.h, { x: 0, y: 0, z: 1 }), now = this.#lastNow;
    for (const m of this.#marks) if (m.gone < 0) m.gone = now;
    this.#marks.push({ p, at: now, gone: -1 });
    if (this.#taught < 0) this.#taught = now;
    this.#h.aim(p);
  }

  // ── drawing ──

  #frame(g: CanvasRenderingContext2D, now: number): void {
    this.#lastNow = now;
    const layer = this.#layer!, pen = layer.pen, h = this.#h, me = h.ship(h.me, this.#ship);
    if (me.phase === PHASE.sea || me.phase === PHASE.sunk) {
      // she is down: the sheet has thinned away under her
      this.dispose();
      this.onGone?.();
      return;
    }
    if (me.phase !== PHASE.gale && this.#diveAt < 0) {
      this.#diveAt = now;
      layer.presses.remove('gale:mark');
    }
    const dry = this.#leftAt < 0 ? 0 : clamp((now - this.#leftAt) / 1000 / AT.dry);
    if (dry >= 1) {
      this.dispose();
      this.onGone?.();
      return;
    }
    // the dive: the sheet thins to the world as the camera dives with her; what was inked on it, her mark and her line
    // to it, thins as she comes down and is gone as she touches the sea
    const kt = this.#diveAt < 0 ? 0 : clamp((now - this.#diveAt) / 1000 / (DIVE.descent + DIVE.settle));
    const down = this.#diveAt < 0 ? 0 : clamp(1 - me.alt / GALE.height);
    const born = (now - this.#born) / 1000;
    const paper = (this.#under ? 1 : ease.out(clamp(born / AT.sheet))) * (1 - ease.inOut(kt));
    if (this.#sheet) this.#sheet.style.opacity = String(paper * (1 - dry));
    const s = (now - this.#t0) / 1000;
    const globe = this.#chart!.globe();
    if (s < 0 || !globe) return;
    pen.mood({ dry }, () => this.#ink(g, pen, globe, s, now, kt, down));
  }

  #ink(g: CanvasRenderingContext2D, pen: Pen, globe: Globe, s: number, now: number, kt: number, down: number): void {
    const layer = this.#layer!, h = this.#h, w = this.#win!, l = layer.layout, phone = l.cls === 'iphone';
    const c = h.course(), t = h.time(), head = this.#q, ahead = this.#r, P = this.#P;
    // what is inked on the planet stays in the window over it, the window opening to the screen as the camera dives
    const clipR = w.r + (Math.hypot(l.w, l.h) - w.r) * ease.inOut(kt);
    g.save();
    const clip = new Path2D();
    clip.arc(w.x, w.y, clipR, 0, TAU);
    g.clip(clip);
    // the dots a degree apart on the iPad, wider on the phone where a degree is smaller
    const step = (phone ? 9 : 12) / (w.r * 1.36), r = phone ? 1.7 : 2.3;
    const gone = 1 - ease.inOut(clamp(kt / 0.3));
    // the planet's coasts and its seas' signs under everything else inked on it
    this.#chart!.ink(pen, g, globe, span(s, AT.coasts), span(s, AT.signs), gone, clipR);
    // the course: dots fixed on it from where the Gale rose to where it lets go, inked from its start
    const ct = span(s, AT.course);
    if (ct > 0 && gone > 0) {
      const n = Math.floor(GALE.arc / step), pts: number[] = [];
      for (let k = 0; k <= n * ct; k++) {
        along(c.from, c.dir, k * step, head);
        const f = facing(globe, head);
        if (f <= 0.08 || !globe.project(head.x, head.y, head.z, P)) continue;
        pts.push(P.x, P.y, r * smooth(0.08, 0.35, f));
      }
      dots(pen, pts, 'iron', 0.85 * gone);
      // where the Gale lets go: a ring at the course's end
      along(c.from, c.dir, GALE.arc, head);
      if (ct >= 1 && facing(globe, head) > 0.05 && globe.project(head.x, head.y, head.z, P)) {
        pen.mood({ dry: Math.max(pen.dry, 1 - gone) }, () => pen.stroke(arcPts(P.x, P.y, phone ? 5 : 7, 0, TAU, 24), { w: 'fine', nib: 0.2, pool: 0.3, seed: 5 }));
      }
    }
    // the fleet's head on the course, and the course's way across the screen there
    const fa = carried(t);
    along(c.from, c.dir, fa, head);
    along(c.from, c.dir, fa + 0.02, ahead);
    globe.project(head.x, head.y, head.z, P);
    const hx = P.x, hy = P.y;
    globe.project(ahead.x, ahead.y, ahead.z, P);
    let ux = P.x - hx, uy = P.y - hy;
    const ul = Math.hypot(ux, uy) || 1;
    ux /= ul; uy /= ul;
    // her mark: leading the fleet on the Gale; once she leaves it, where she is, given over to her ship as the camera
    // comes down on her
    const me = h.ship(h.me, this.#ship), mine = me.phase === PHASE.gale;
    const M = l.mark.chart, m = l.mark.hud, ft = span(s, AT.fleet);
    let mx = hx, my = hy;
    if (!mine && globe.project(me.pos.x, me.pos.y, me.pos.z, P)) { mx = P.x; my = P.y; }
    this.#line(pen, globe, mine ? head : me.pos, now, step, r, 1 - ease.inOut(clamp((down - 0.4) / 0.6)));
    if (ft > 0 && gone > 0) this.#fleet(g, globe, hx, hy, ux, uy, m, M, ft, now, gone);
    const mt = stagger(ft, 0, 20, 0.5), ma = 1 - ease.inOut(clamp(kt / 0.4));
    if (mt > 0 && ma > 0) {
      const sp = galleonSprite(pen, this.#colours[h.me], { size: M, gilt: true, facing: ux >= 0 ? 1 : -1 });
      drawGalleon(g, sp, mx, my, ma * ease.out(mt) * (1 - pen.dry), 0.85 + 0.15 * ease.back(mt));
    }
    // the first Gale: a hand pointing ahead of the fleet, tapping, until the first press
    if (this.#teach && mine) this.#hand(pen, hx, hy, ux, uy, s, now);
    g.restore();
    // the sand-glass, in the corner the HUD's disc comes to: it drains for the time left to choose
    const gt = span(s, AT.glass), gl = this.#diveAt < 0 ? 0 : clamp((now - this.#diveAt) / 1000 / AT.dryGlass);
    if (gt > 0 && gl < 1) {
      const hud = l.hud;
      pen.mood({ dry: Math.max(pen.dry, gl) }, () => sandglass(pen, hud.x, hud.y, hud.r * 1.15, { sand: 1 - t / GALE.time, running: mine && t < GALE.time, time: now / 1000 }, gt));
    }
  }

  /** The fleet but her: on the Gale in ranks behind her, five abreast; off it, each captain where she is. */
  #fleet(g: CanvasRenderingContext2D, globe: Globe, hx: number, hy: number, ux: number, uy: number, m: number, M: number, ft: number, now: number, gone: number): void {
    const h = this.#h, P = this.#P, sh = this.#ship, pen = this.#layer!.pen, vx = -uy, vy = ux;
    const draws: { y: number; x: number; i: number; a: number; k: number; face: 1 | -1 }[] = [];
    for (let i = 0, slot = 0; i < h.ships; i++) {
      if (i === h.me) continue;
      const k = slot++, ship = h.ship(i, sh);
      if (ship.phase === PHASE.sunk) continue;
      const row = Math.floor(k / 5), n = row < 3 ? 5 : 4, col = k % 5;
      const along = -(M * 0.55 + m * 0.35 + row * m * 0.62), across = (col - (n - 1) / 2) * m * 0.78;
      let x = hx + ux * along + vx * across, y = hy + uy * along + vy * across, a = 1, sc = 1, face: 1 | -1 = ux >= 0 ? 1 : -1;
      if (ship.phase !== PHASE.gale) {
        if (this.#peel[i] < 0) this.#peel[i] = now;
        const f = facing(globe, ship.pos);
        if (f <= 0.02 || !globe.project(ship.pos.x, ship.pos.y, ship.pos.z, P)) continue;
        const px = P.x, py = P.y;
        const hd = ship.head, q = this.#r;
        q.x = ship.pos.x + hd.x * 0.02; q.y = ship.pos.y + hd.y * 0.02; q.z = ship.pos.z + hd.z * 0.02;
        globe.project(q.x, q.y, q.z, P);
        face = P.x >= px ? 1 : -1;
        const pk = ease.inOut(clamp((now - this.#peel[i]) / 600));
        x += (px - x) * pk;
        y += (py - y) * pk;
        a = smooth(0.02, 0.15, f) * (ship.phase === PHASE.sea ? 0.55 : 1);
        sc = ship.phase === PHASE.sea ? 0.8 : 1 - 0.2 * clamp(1 - ship.alt / GALE.height);
      }
      const st = stagger(ft, k + 1, 20, 0.5);
      if (st > 0) draws.push({ x, y, i, a: a * ease.out(st) * gone, k: sc * (0.85 + 0.15 * ease.back(st)), face });
    }
    // back to front, so the lower marks lie over the higher
    draws.sort((p, q) => p.y - q.y);
    for (const d of draws) drawGalleon(g, galleonSprite(pen, this.#colours[d.i], { size: m, facing: d.face }), d.x, d.y, d.a * (1 - pen.dry), d.k);
  }

  /** Her dive's marks: the cross where she pressed and the dotted line out to it from her mark, an old one drying. */
  #line(pen: Pen, globe: Globe, from: V3, now: number, step: number, r: number, ink: number): void {
    if (ink <= 0) return;
    const P = this.#P, l = this.#layer!.layout, cr = l.cls === 'iphone' ? 10 : 14;
    for (const mk of this.#marks) {
      const a = (mk.gone < 0 ? 1 : 1 - clamp((now - mk.gone) / 1000 / AT.gone)) * ink;
      if (a <= 0) continue;
      const X = mk.p, lt = clamp((now - mk.at) / 1000 / AT.line), xt = clamp((now - mk.at) / 1000 / AT.cross);
      // dots back from the cross toward her, fixed on the great circle between, inked out from her side
      const d = Math.acos(Math.max(-1, Math.min(1, X.x * from.x + X.y * from.y + X.z * from.z)));
      const pts: number[] = [], sd = Math.sin(d);
      if (d > step * 2 && sd > 1e-6) {
        const gap = (l.mark.chart * 0.45) / (this.#win!.r * 1.36);
        for (let k = 1; k * step < d - gap; k++) {
          const u = (k * step) / d;
          if (d - k * step > lt * d) continue;
          const s0 = Math.sin((1 - u) * d) / sd, s1 = Math.sin(u * d) / sd, q = this.#r;
          q.x = X.x * s0 + from.x * s1; q.y = X.y * s0 + from.y * s1; q.z = X.z * s0 + from.z * s1;
          const f = facing(globe, q);
          if (f <= 0.08 || !globe.project(q.x, q.y, q.z, P)) continue;
          pts.push(P.x, P.y, r * 1.1 * smooth(0.08, 0.35, f));
        }
        dots(pen, pts, 'rubric', a);
      }
      if (globe.project(X.x, X.y, X.z, P) && facing(globe, X) > 0) {
        // the cross over a ground of lead white, so it reads over the coasts and the night side as on open sea
        pen.mood({ dry: Math.max(pen.dry, 1 - a) }, () => {
          const halo = new Path2D();
          halo.arc(P.x, P.y, cr * 1.45, 0, TAU);
          pen.fill(halo, 'white', 0.5 * ease.out(xt));
          cross(pen, P.x, P.y, cr * 1.08, xt, 'white');
          cross(pen, P.x, P.y, cr, xt, 'rubric');
        });
      }
    }
    // the moved marks, once dried, are let go
    this.#marks = this.#marks.filter((mk) => mk.gone < 0 || now - mk.gone < AT.gone * 1000);
  }

  /** The hand: pointing at the planet a way ahead of the fleet and off its course, in from that side so it lies clear
   *  of the course, tapping, until the first press. */
  #hand(pen: Pen, hx: number, hy: number, ux: number, uy: number, s: number, now: number): void {
    const w = this.#win!, ht = span(s, AT.hand), off = this.#taught < 0 ? 0 : clamp((now - this.#taught) / 1000 / AT.dry);
    if (ht <= 0 || off >= 1) return;
    const vx = -uy, vy = ux, side = vy <= 0 ? 1 : -1;
    const tx = hx + ux * w.r * 0.42 + vx * side * w.r * 0.2, ty = hy + uy * w.r * 0.42 + vy * side * w.r * 0.2;
    // pointing back toward the course, a little across it, bobbing as a finger taps
    const rot = Math.atan2(-side * vy, -side * vx) + 0.3 * side, tap = Math.abs(Math.sin((now / 1000) * Math.PI / 0.9));
    const back = 6 + 8 * tap;
    pen.mood({ dry: Math.max(pen.dry, off) }, () => hand(pen, tx - Math.cos(rot) * back, ty - Math.sin(rot) * back, this.#layer!.layout.cls === 'iphone' ? 56 : 84, rot, ht));
  }
}
