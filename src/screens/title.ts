// The title. The app opens on a blank sheet, and the chart inks itself in on it: the rhumb web grows out from the
// centre, a rose of 32 points draws itself over it, and the player's own galleon mark is inked beneath, gilt-rimmed.
// The rose's needle swings while the world loads and settles north when it is ready; the world is drawn under the sheet
// as it loads, and the sheet thins to let it show. One press anywhere: the rose lifts off and flies to the corner it
// keeps on the lobby's chart, the sheet rolls off with the web and the mark on it, and the lobby is under it. Nothing is
// written.
//
// The paper is the folio baked once for the screen and shown as its own canvas under the chart layer, so thinning it is
// the compositor's opacity. The ink is on the layer: a drawing still inking is drawn on the live plane each frame, and
// once done it is painted on the sheet plane once; the rose, once drawn, is a sprite, so it can fly, and only its needle
// is drawn each frame. Everything runs off the time it is given, so a capture's frozen clock shows the same instants.
import {
  Pen, Press, canvas, ctx, drawSprite, ease, flight, galleon, needle, pressLook, rhumbWeb, rose, stamp, unroll,
  type Baked, type ChartLayer, type Colours, type Rect, type Sprite,
} from '../chart/index.ts';
import { effect } from '../ui/parts/feedback.ts';

export interface TitleHost {
  /** How far the world has loaded, 0..1. */
  progress(): number;
  /** Whether the world is drawn under the sheet yet. */
  drawn(): boolean;
  /** Whether everything the lobby needs is built, so a press can leave. */
  ready(): boolean;
  /** The player's own colour and emblem, for her mark. */
  mark(): Colours;
  /** The press: the lobby is put under the sheet (and calls leave). */
  start(): void;
  /** The sheet is opaque again over the world, just before it rolls off: whatever is under it can be put right. */
  covered(): void;
}

/** The sheet's tone before its paper is made: the launch screen's and the page's, so the app opens on it. */
export const BLANK = '#dfc8a2';

/** Seconds from the press to the title's rose landing in its corner, where the lobby takes it up. */
export const TITLE_LANDS = 0.88;

/** When each thing happens, seconds: from the paper's arrival for the ink, from the press for the leaving. */
const AT = {
  /** The paper's grain comes up over the blank tone. */
  grain: [0, 0.45],
  web: [0.25, 2.3],
  rose: [1.25, 3.9],
  mark: [3.2, 4.4],
  needle: [3.5, 4.1],
  /** Once the world is drawn: how long the sheet takes to thin, and how much of it is left. */
  thin: 2.4,
  rest: 0.42,
  /** After the press: the sheet, lifted off the world, turns opaque again (vellum is clear only where it lies on what
   *  is under it); then it rolls off, while the rose flies (landing at `land` of its flight) and stamps in its corner,
   *  where the lobby keeps it. */
  lift: 0.16,
  roll: [0.16, 0.92],
  fly: 1.1,
  land: TITLE_LANDS / 1.1,
} as const;

/** How far through [a, b] the seconds s are, 0..1. */
const span = (s: number, [a, b]: readonly [number, number]): number => Math.min(1, Math.max(0, (s - a) / (b - a)));

/** How much ink is in the web's lines: the chart's ground, under everything drawn on it. */
const WEB = 0.42;
/** The folio runs this far past every edge of the screen, its deckle out of sight. */
const BLEED = 40;

interface Geo {
  w: number;
  h: number;
  /** The rose: its centre and radius, and its needle's half-length. */
  cx: number;
  cy: number;
  r: number;
  needle: number;
  /** The web's ring of sixteen nodes, and how far each node's winds reach. */
  ring: number;
  reach: number;
  /** The mark: her waterline's middle and her length. */
  mx: number;
  my: number;
  size: number;
  /** Where the rose flies to. */
  corner: { x: number; y: number; r: number };
}

/** Where everything goes: the rose a little above the middle, as large as leaves room under it for the mark. */
function geo(layer: ChartLayer): Geo {
  const l = layer.layout, { w, h } = l, phone = l.cls === 'iphone';
  const r = Math.round(phone ? h * 0.29 : Math.min(h * 0.3, w * 0.24));
  const cx = w / 2, cy = Math.round(h * (phone ? 0.41 : 0.4));
  // the mark, her masts clear of the rose's ring: a full engraving on an iPad, a mark's few sails on a phone
  const size = phone ? 72 : 150, s = size / 2.3, rig = size >= 90 ? 2.75 : 2.15;
  const my = Math.min(h - l.safe.bottom - l.margin - s * 0.55, cy + r + s * rig);
  return { w, h, cx, cy, r, needle: r * 0.52, ring: Math.min(w, h) * 0.56, reach: Math.hypot(w, h), mx: cx, my, size, corner: l.rose };
}

/** The rose: the title's, and the one it becomes in the lobby's corner. */
export const ROSE = { points: 32, ring: 0.12, seed: 17 } as const;

/** The rose drawn at the size it keeps in the lobby chart's corner: the title's rose lands as it, and the lobby keeps it. */
export function cornerRose(layer: ChartLayer): Sprite {
  const c = layer.layout.rose, d = Math.ceil(c.r * 2 + 8);
  return layer.sprite(`corner-rose|${c.r}`, d, d, d / 2, d / 2, (pen) => rose(pen, d / 2, d / 2, c.r, ROSE, 1));
}



export class Title {
  readonly #host: HTMLElement;
  readonly #h: TitleHost;
  /** The blank sheet: a flat tone until the paper is made. */
  #blank: HTMLDivElement | null;
  #layer: ChartLayer | null = null;
  #g: Geo | null = null;
  #paper: Baked | null = null;
  #paperEl: HTMLCanvasElement | null = null;
  #mark: Colours;
  /** When the ink began, the world was first drawn, and the press came (ms on the given clock; -1 not yet). */
  #t0 = -1;
  #drawnAt = -1;
  #leftAt = -1;
  #inked = { web: false, mark: false };
  #rose: Sprite | null = null;
  /** The rose as it was when the press came, flying. */
  #flyer: Sprite | null = null;
  #rolling: Baked | null = null;
  #rollT = 1;
  /** The sheet as the press found it: how far it was inked, and how thin; and whether it has been taken up. */
  #lifted = { s: 0, opacity: 1 };
  #takenUp = false;
  readonly #press = new Press();
  /** The needle: its bearing off north and how fast it swings, stepped by the clock. */
  readonly #needle = { a: 2.2, v: 0, at: -1 };
  #off: (() => void) | null = null;
  #offLive: (() => void) | null = null;
  /** Called once the title has gone. */
  onGone?: () => void;

  constructor(host: HTMLElement, h: TitleHost) {
    this.#host = host;
    this.#h = h;
    this.#mark = h.mark();
    this.#blank = document.createElement('div');
    this.#blank.style.cssText = `position:absolute;inset:0;background:${BLANK}`;
    host.insertBefore(this.#blank, host.firstChild);
  }

  /** The paper is made: the sheet takes its grain and the ink begins, at `now`. */
  attach(layer: ChartLayer, now: number): void {
    this.#layer = layer;
    this.#t0 = now;
    this.#needle.at = now;
    this.#lay();
    this.#offLive = layer.addLive((g, t) => this.#frame(g, t) ?? undefined);
    const offSheet = layer.addSheet((g, pen) => this.#sheet(g, pen));
    layer.presses.add({
      id: 'title', hit: { x: layer.layout.w / 2, y: layer.layout.h / 2, w: layer.layout.w, h: layer.layout.h }, press: this.#press,
      sound: 'tap', haptic: 'selection', act: () => (this.#canLeave(this.#needle.at) ? this.#h.start() : this.#kick()),
    });
    this.#off = () => {
      this.#offLive?.();
      offSheet();
      layer.presses.remove('title');
    };
  }

  /** The screen changed size: everything is laid out and baked again. */
  resize(): void {
    if (!this.#layer) return;
    this.#lay();
    this.#layer.invalidate();
    const p = this.#layer.presses.list.find((q) => q.id === 'title');
    if (p) p.hit = { x: this.#layer.layout.w / 2, y: this.#layer.layout.h / 2, w: this.#layer.layout.w, h: this.#layer.layout.h };
  }

  /** Leaves for the lobby at `now`: the rose lifts, and the sheet rolls off with what is inked on it. */
  leave(now: number): void {
    if (this.#leftAt >= 0) return;
    const layer = this.#layer;
    if (!layer || !this.#paper || !this.#g) {
      this.dispose();
      return;
    }
    this.#leftAt = now;
    layer.presses.remove('title');
    // drawn over whatever came in under it, so the rose flies over the lobby's scraps and lands on its own
    this.#offLive?.();
    this.#offLive = layer.addLive((g, t) => this.#frame(g, t) ?? undefined);
    const s = (now - this.#t0) / 1000;
    this.#flyer = this.#roseSprite(span(s, AT.rose));
    this.#lifted = { s, opacity: Number(this.#paperEl?.style.opacity || 1) };
    effect('title:roll', 'whoosh', 'none');
  }

  /** Takes everything off the page and the layer. */
  dispose(): void {
    this.#off?.();
    this.#off = null;
    this.#blank?.remove();
    this.#paperEl?.remove();
    this.#blank = null;
    this.#paperEl = null;
  }

  /** Lays the title out for the layer's size and bakes its paper. */
  #lay(): void {
    const layer = this.#layer!, g = (this.#g = geo(layer));
    this.#paper = layer.sheet('folio', g.w + BLEED * 2, g.h + BLEED * 2, 7, { folds: false });
    this.#paperEl?.remove();
    const b = this.#paper, el = b.canvas;
    el.style.cssText = `position:absolute;left:${-BLEED - b.pad}px;top:${-BLEED - b.pad}px;width:${b.w + b.pad * 2}px;height:${b.h + b.pad * 2}px;pointer-events:none`;
    this.#host.insertBefore(el, layer.el);
    this.#paperEl = this.#leftAt >= 0 ? null : el;
    if (this.#leftAt >= 0) el.remove();
    this.#rose = null;
  }

  /** Whether a press now leaves: the world is ready and the chart is inked. */
  #canLeave(now: number): boolean {
    return this.#h.ready() && (now - this.#t0) / 1000 >= AT.mark[1];
  }

  /** A press before the world is ready: the needle jumps on its pivot. */
  #kick(): void {
    this.#needle.v += (this.#needle.a > 0 ? -1 : 1) * 4.5;
  }

  /** The rose drawn to t, baked as a sprite (once, when it is whole). */
  #roseSprite(t: number): Sprite {
    const layer = this.#layer!, g = this.#g!, d = Math.ceil(g.r * 2 + 8);
    if (this.#rose && t >= 1) return this.#rose;
    const s = layer.sprite(`title-rose|${g.r}|${t.toFixed(3)}`, d, d, d / 2, d / 2, (pen) => rose(pen, d / 2, d / 2, g.r, ROSE, t));
    if (t >= 1) this.#rose = s;
    return s;
  }

  /** The sheet as it stands at s seconds, its ink and all, as one baked sheet for rolling up. */
  #rollingSheet(s: number): Baked {
    const layer = this.#layer!, g = this.#g!, b = this.#paper!, dpr = layer.dpr;
    const c = canvas(b.canvas.width, b.canvas.height), x = ctx(c);
    x.drawImage(b.canvas, 0, 0);
    x.setTransform(dpr, 0, 0, dpr, (b.pad + BLEED) * dpr, (b.pad + BLEED) * dpr);
    const pen = new Pen(layer.paper, dpr, layer.layout.widths).on(x, (b.pad + BLEED) * dpr, (b.pad + BLEED) * dpr);
    rhumbWeb(pen, g.cx, g.cy, g.ring, g.reach, span(s, AT.web), WEB);
    galleon(pen, this.#mark, g.mx, g.my, { size: g.size, gilt: true }, span(s, AT.mark));
    return { ...b, canvas: c };
  }

  /** The sheet plane: what is inked and done, or the sheet rolling up. */
  #sheet(gc: CanvasRenderingContext2D, pen: Pen): void {
    const g = this.#g;
    if (!g) return;
    if (this.#rolling) {
      unroll(gc, pen.paper, this.#rolling, -BLEED, -BLEED, this.#rollT, 'right', this.#layer!.dpr);
      return;
    }
    // lifted and taken up: the ink is on the rolling sheet now, or gone with it
    if (this.#takenUp) return;
    if (this.#inked.web) rhumbWeb(pen, g.cx, g.cy, g.ring, g.reach, 1, WEB);
    if (this.#inked.mark) galleon(pen, this.#mark, g.mx, g.my, { size: g.size, gilt: true }, 1);
  }

  /** The needle's swing to `now`: wandering while the world loads, more wildly the less of it there is; drawn north and
   *  settling there, overshooting a few times, once it is ready. */
  #swing(now: number): number {
    const n = this.#needle;
    const ready = this.#h.ready(), p = this.#h.progress();
    let left = Math.max(0, Math.min(2, (now - n.at) / 1000));
    n.at = now;
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 120), t = now / 1000 - left;
      const wander = (0.25 + 0.95 * (1 - p)) * (Math.sin(0.9 * t + 0.3) + 0.45 * Math.sin(2.1 * t + 1.7) + 0.2 * Math.sin(4.7 * t + 0.2));
      const target = ready || this.#leftAt >= 0 ? 0 : wander;
      const k = ready ? 22 : 14, c = 2 * (ready ? 0.2 : 0.45) * Math.sqrt(k);
      n.v += (k * (target - n.a) - c * n.v) * h;
      n.a += n.v * h;
      left -= h;
    }
    return n.a;
  }

  /** One frame of the live plane. */
  /** Draws the title's live plane; returns the rose's box once only the rose and its needle move on it. */
  #frame(gc: CanvasRenderingContext2D, now: number): Rect | null {
    const layer = this.#layer!, g = this.#g!, pen = layer.pen, s = (now - this.#t0) / 1000;
    const a = this.#swing(now);
    if (this.#leftAt >= 0) {
      this.#leaving(gc, now);
      return null;
    }
    // the paper: its grain comes up over the blank tone; then, with the world drawn under it, it thins
    const grain = ease.out(span(s, AT.grain));
    if (this.#h.drawn() && this.#drawnAt < 0 && grain >= 1) this.#drawnAt = now;
    const thin = this.#drawnAt < 0 ? 0 : ease.inOut(span((now - this.#drawnAt) / 1000, [0, AT.thin]));
    if (this.#paperEl) this.#paperEl.style.opacity = String(grain * (1 - (1 - AT.rest) * thin));
    if (grain >= 1 && this.#blank) {
      this.#blank.remove();
      this.#blank = null;
    }
    // the press can leave once the world is ready and the chart is inked; until then it only jogs the needle
    const p = layer.presses.list.find((q) => q.id === 'title');
    if (p) {
      const go = this.#canLeave(now);
      p.sound = go ? 'start' : 'tap';
      p.haptic = go ? 'medium' : 'selection';
    }
    // the web, then the rose over it, then the mark: each inked on the live plane, then painted on the sheet when done
    const web = span(s, AT.web), roseT = span(s, AT.rose), mark = span(s, AT.mark);
    if (web >= 1 && !this.#inked.web) {
      this.#inked.web = true;
      layer.invalidate();
    } else if (web > 0 && web < 1) rhumbWeb(pen, g.cx, g.cy, g.ring, g.reach, web, WEB);
    if (mark >= 1 && !this.#inked.mark) {
      this.#inked.mark = true;
      layer.invalidate();
    } else if (mark > 0 && mark < 1) galleon(pen, this.#mark, g.mx, g.my, { size: g.size, gilt: true }, mark);
    const look = pressLook(this.#press.sink);
    if (roseT >= 1) drawSprite(gc, this.#roseSprite(1), g.cx, g.cy + look.dy, { scale: look.scale, dark: look.dark });
    else if (roseT > 0) rose(pen, g.cx, g.cy, g.r, ROSE, roseT);
    needle(pen, g.cx, g.cy + look.dy, g.needle * look.scale, a, span(s, AT.needle));
    if ((web > 0 && web < 1) || (mark > 0 && mark < 1)) return null;
    const d = g.r + 12;
    return { x: g.cx - d, y: g.cy - d - 6, w: d * 2, h: d * 2 + 12 };
  }

  /** The leaving: the sheet rolls off, the rose flies to its corner, stamps, and dries. */
  #leaving(gc: CanvasRenderingContext2D, now: number): void {
    const layer = this.#layer!, g = this.#g!, s = (now - this.#leftAt) / 1000;
    // the sheet is lifted off the world and turns opaque, then is taken up as one sheet, its ink and all
    if (s < AT.lift) {
      if (this.#paperEl) this.#paperEl.style.opacity = String(this.#lifted.opacity + (1 - this.#lifted.opacity) * ease.out(s / AT.lift));
    } else if (this.#paperEl) {
      this.#rolling = this.#rollingSheet(this.#lifted.s);
      this.#takenUp = true;
      this.#h.covered();
      this.#paperEl.remove();
      this.#paperEl = null;
      this.#blank?.remove();
      this.#blank = null;
    }
    else if (!this.#takenUp) {
      // what was still inking when the press came stays as it was until the sheet is taken up
      const web = span(this.#lifted.s, AT.web), mark = span(this.#lifted.s, AT.mark);
      if (web > 0 && web < 1) rhumbWeb(layer.pen, g.cx, g.cy, g.ring, g.reach, web, WEB);
      if (mark > 0 && mark < 1) galleon(layer.pen, this.#mark, g.mx, g.my, { size: g.size, gilt: true }, mark);
    }
    // it rolls up toward the left edge: slowly off the right, then faster, then slowing into the roll
    const u = span(s, AT.roll);
    const open = 1 - ease.inOut(u);
    this.#rollT = open <= 0 ? 0 : 1 - Math.cbrt(1 - open);
    if (this.#rolling) {
      layer.invalidate();
      if (u >= 1) {
        this.#rolling = null;
        layer.invalidate();
      }
    }
    // the rose lifts off the sheet and flies, shrinking to the corner's size, its shadow falling away beneath it
    const fu = s / AT.fly, to = g.corner, f = flight({ x: g.cx, y: g.cy }, to, fu, 0.3, AT.land);
    const k = (1 + (to.r / g.r - 1) * ease.inOut(Math.min(1, fu / AT.land))) * f.scale;
    if (!f.landed) {
      const sr = g.r * k * 0.98, sx = f.x + f.shadow.dx, sy = f.y + f.shadow.dy;
      const sh = gc.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 1.12);
      sh.addColorStop(0, `rgba(30,18,6,${f.shadow.alpha})`);
      sh.addColorStop(1, 'rgba(30,18,6,0)');
      gc.fillStyle = sh;
      gc.fillRect(sx - sr * 1.2, sy - sr * 1.2, sr * 2.4, sr * 2.4);
      // as it nears the corner the rose becomes the corner's own, drawn at the weight it keeps there
      const c = Math.min(1, Math.max(0, (fu / AT.land - 0.55) / 0.45));
      if (c < 1) drawSprite(gc, this.#flyer!, f.x, f.y, { scale: k, alpha: 1 - c });
      if (c > 0) drawSprite(gc, cornerRose(layer), f.x, f.y, { scale: (k * g.r) / to.r, alpha: c });
      needle(layer.pen, f.x, f.y, g.needle * k, this.#needle.a, 1);
    } else if (fu < 1) {
      // landed: the lobby has it now; the title leaves only the stamp it made
      stamp(layer.pen, to.x, to.y, to.r, f.stamp);
    }
    if (u >= 1 && fu >= 1) {
      this.dispose();
      this.onGone?.();
    }
  }
}
