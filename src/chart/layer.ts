// The chart layer: the one interface surface over the game. Two planes, stacked:
// - the sheet plane, painted only when it changes (a screen's sheets, baked once per screen size, and everything
//   inked on them that holds still), and repainted each frame only while a sheet is in motion;
// - the live plane, redrawn every frame (marks, pennants, rings, hit-marks, the pressed controls), clearing only the
//   regions it drew into the frame before, so its cost is what it draws and not the screen's size.
// The live plane's CPU time is measured every frame (`cost`), for the perf line.
//
// The layer never takes a touch it does not want: its canvases pass every touch through, and it listens ahead of the
// game, keeping only touches that land on one of its pressables (grown to the touch target), or, when a screen lays a
// drag surface under them (the planet chart's), the touches that land anywhere else.
//
// Several screens can share the sheet plane while one gives way to the next (the title's sheet rolling off the lobby's scraps):
// each adds its own painter, and they paint in the order they were added.
import type { Parchment } from '../render/paper/parchment.ts';
import { chartLayout, type ChartLayout, type Insets } from './layout.ts';
import { canvas, ctx, Paper } from './paper.ts';
import { Pen } from './pen.ts';
import { Presses } from './press.ts';
import { bakeDisc, bakeSheet, type Baked, type SheetWeight, type Side } from './sheet.ts';

/** A drawing baked to a canvas: its anchor (ax, ay) and size in CSS pixels. */
export interface Sprite {
  c: HTMLCanvasElement;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/** A region drawn into, CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Draws on the live plane; returns the regions it drew into (or nothing, and the whole plane is cleared next frame). */
export type LivePainter = (g: CanvasRenderingContext2D, now: number, dt: number, layer: ChartLayer) => Rect | Rect[] | void;
/** Paints the sheet plane. */
export type SheetPainter = (g: CanvasRenderingContext2D, pen: Pen, layer: ChartLayer) => void;

/** What a finger does on the chart off every pressable: a screen's drag (CSS pixels, the pointer's id). */
export interface DragSurface {
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  up(id: number, x: number, y: number): void;
}

/** How far a finger on something that scrolls travels before it is a drag and not a press, CSS pixels. */
const SLOP = 10;

/** Draws a sprite with its anchor at (x, y); `dark` deepens it (the sprite multiplied over itself, for a press). */
export function drawSprite(g: CanvasRenderingContext2D, s: Sprite, x: number, y: number, o: { alpha?: number; scale?: number; rot?: number; dark?: number } = {}): void {
  const a = o.alpha ?? 1;
  if (a <= 0) return;
  const k = o.scale ?? 1;
  g.save();
  g.globalAlpha *= a;
  g.translate(x, y);
  if (o.rot) g.rotate(o.rot);
  g.drawImage(s.c, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
  if (o.dark && o.dark > 0.01) {
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha *= 0.55 * o.dark;
    g.drawImage(s.c, -s.ax * k, -s.ay * k, s.w * k, s.h * k);
  }
  g.restore();
}

export class ChartLayer {
  readonly el: HTMLDivElement;
  readonly sheetCanvas: HTMLCanvasElement;
  readonly liveCanvas: HTMLCanvasElement;
  readonly paper: Paper;
  readonly presses = new Presses();
  layout: ChartLayout;
  dpr = 1;
  /** The pen for the live plane, and the one the sheet plane is painted with. */
  pen: Pen;
  sheetPen: Pen;
  /** The live plane's CPU time per frame, milliseconds: the last, a running mean, the worst since reset. */
  readonly cost = { last: 0, mean: 0, worst: 0, frames: 0 };
  /** Takes the touches no pressable wants, while a screen has one. */
  drag: DragSurface | null = null;
  #sheets: SheetPainter[] = [];
  #live: LivePainter[] = [];
  #dirty: Rect[] | null = null;
  #lastNow = 0;
  #sprites = new Map<string, Sprite>();
  #baked = new Map<string, Baked>();

  constructor(paper: Paper, host?: HTMLElement) {
    this.paper = paper;
    this.el = document.createElement('div');
    this.el.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    this.sheetCanvas = canvas(1, 1);
    this.liveCanvas = canvas(1, 1);
    for (const c of [this.sheetCanvas, this.liveCanvas]) {
      c.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none';
      this.el.appendChild(c);
    }
    this.layout = chartLayout(1, 1);
    this.pen = new Pen(paper, 1, this.layout.widths);
    this.sheetPen = new Pen(paper, 1, this.layout.widths);
    host?.appendChild(this.el);
  }

  /** A layer on the parchment painter's paper. */
  static async create(parchment: Parchment, host?: HTMLElement): Promise<ChartLayer> {
    return new ChartLayer(await Paper.from(parchment), host);
  }

  /** Sizes the layer to the screen (CSS pixels) at its pixel ratio; the layout, the pens and the sheet follow. */
  resize(w: number, h: number, dpr: number, safe?: Insets): void {
    if (dpr !== this.dpr) {
      this.#sprites.clear();
      this.#baked.clear();
    }
    this.dpr = dpr;
    this.layout = chartLayout(w, h, safe);
    for (const c of [this.sheetCanvas, this.liveCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    this.pen = new Pen(this.paper, dpr, this.layout.widths).on(ctx(this.liveCanvas));
    this.sheetPen = new Pen(this.paper, dpr, this.layout.widths).on(ctx(this.sheetCanvas));
    this.#dirty = null;
    this.invalidate();
  }

  /** Adds a painter to the sheet plane, over those already there, and paints it; returns its removal. */
  addSheet(p: SheetPainter): () => void {
    this.#sheets.push(p);
    this.invalidate();
    return () => {
      this.#sheets = this.#sheets.filter((q) => q !== p);
      this.invalidate();
    };
  }

  /** Repaints the sheet plane (call each frame only while a sheet moves). */
  invalidate(): void {
    const g = ctx(this.sheetCanvas);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.sheetCanvas.width, this.sheetCanvas.height);
    if (!this.#sheets.length) return;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.sheetPen.on(g);
    for (const p of this.#sheets) p(g, this.sheetPen, this);
  }

  /** Adds a live painter; returns its removal. */
  addLive(p: LivePainter): () => void {
    this.#live.push(p);
    return () => {
      this.#live = this.#live.filter((q) => q !== p);
      this.#dirty = null;
    };
  }

  /** Redraws the live plane for the frame at `now` (milliseconds). Returns the CPU time it took. */
  frame(now: number): number {
    const t0 = performance.now();
    const dt = this.#lastNow ? Math.min(0.1, (now - this.#lastNow) / 1000) : 1 / 30;
    this.#lastNow = now;
    this.presses.step(dt);
    const g = ctx(this.liveCanvas), d = this.dpr;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.#dirty) g.clearRect(0, 0, this.liveCanvas.width, this.liveCanvas.height);
    else for (const r of this.#dirty) g.clearRect(Math.floor((r.x - 3) * d), Math.floor((r.y - 3) * d), Math.ceil((r.w + 6) * d), Math.ceil((r.h + 6) * d));
    g.setTransform(d, 0, 0, d, 0, 0);
    this.pen.on(g);
    let next: Rect[] | null = [];
    for (const p of this.#live) {
      const r = p(g, now, dt, this);
      if (!r) next = null;
      else if (next) Array.isArray(r) ? next.push(...r) : next.push(r);
    }
    this.#dirty = next;
    const ms = performance.now() - t0, c = this.cost;
    c.last = ms;
    c.frames++;
    c.mean += (ms - c.mean) / Math.min(c.frames, 120);
    c.worst = Math.max(c.worst, ms);
    return ms;
  }

  /** A drawing baked once to a sprite, w × h CSS pixels, anchored at (ax, ay); cached by key at this pixel ratio. */
  sprite(key: string, w: number, h: number, ax: number, ay: number, draw: (pen: Pen, g: CanvasRenderingContext2D) => void): Sprite {
    let s = this.#sprites.get(key);
    if (s) return s;
    const c = canvas(w * this.dpr, h * this.dpr), g = ctx(c);
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const pen = new Pen(this.paper, this.dpr, this.layout.widths).on(g);
    draw(pen, g);
    s = { c, w, h, ax, ay };
    this.#sprites.set(key, s);
    return s;
  }

  /** A sheet of a weight and size, baked once at this pixel ratio. */
  sheet(weight: SheetWeight, w: number, h: number, seed = 1, o: { torn?: Side[]; rule?: boolean; folds?: boolean } = {}): Baked {
    const key = `${weight}|${w}|${h}|${seed}|${o.torn?.join() ?? ''}|${o.rule ?? ''}|${o.folds ?? ''}`;
    let b = this.#baked.get(key);
    if (!b) {
      b = bakeSheet(this.paper, this.layout.widths, { weight, w, h, dpr: this.dpr, seed, ...o });
      this.#baked.set(key, b);
    }
    return b;
  }

  /** The HUD's disc, baked once at this size. */
  disc(r = this.layout.hud.r, seed = 3): Baked {
    const key = `disc|${r}|${seed}`;
    let b = this.#baked.get(key);
    if (!b) {
      b = bakeDisc(this.paper, r, this.dpr, seed);
      this.#baked.set(key, b);
    }
    return b;
  }

  /** Listens for fingers ahead of the game (capture phase on `target`), keeping those that land on a pressable. */
  attach(target: HTMLElement | Window = window): () => void {
    const at = (e: PointerEvent) => {
      const r = this.el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    // the fingers the drag surface took, and the surface that took them; where the others landed, for one that leaves
    // what it pressed on something that scrolls
    const dragging = new Map<number, DragSurface>();
    const landed = new Map<number, readonly [number, number]>();
    const down = (e: PointerEvent) => {
      const [x, y] = at(e);
      if (this.presses.down(e.pointerId, x, y)) {
        landed.set(e.pointerId, [x, y]);
        e.stopPropagation();
        e.preventDefault();
      } else if (this.drag) {
        dragging.set(e.pointerId, this.drag);
        this.drag.down(e.pointerId, x, y);
      }
    };
    const move = (e: PointerEvent) => {
      const [x, y] = at(e), d = dragging.get(e.pointerId);
      if (d) {
        d.move(e.pointerId, x, y);
        return;
      }
      const p = this.presses.holding(e.pointerId), from = landed.get(e.pointerId);
      if (!p || !from) return;
      p.move?.(x, y);
      if (!p.scrolls || !this.drag || Math.hypot(x - from[0], y - from[1]) < SLOP) return;
      // it was a drag all along: the press is let go without acting, and the surface has the finger from where it landed
      this.presses.up(e.pointerId, x, y, true);
      landed.delete(e.pointerId);
      dragging.set(e.pointerId, this.drag);
      this.drag.down(e.pointerId, from[0], from[1]);
      this.drag.move(e.pointerId, x, y);
    };
    const up = (e: PointerEvent) => {
      const [x, y] = at(e);
      this.presses.up(e.pointerId, x, y, e.type === 'pointercancel');
      landed.delete(e.pointerId);
      const d = dragging.get(e.pointerId);
      if (!d) return;
      dragging.delete(e.pointerId);
      d.up(e.pointerId, x, y);
    };
    const opts = { capture: true };
    target.addEventListener('pointerdown', down as EventListener, opts);
    target.addEventListener('pointermove', move as EventListener, opts);
    target.addEventListener('pointerup', up as EventListener, opts);
    target.addEventListener('pointercancel', up as EventListener, opts);
    return () => {
      target.removeEventListener('pointerdown', down as EventListener, opts);
      target.removeEventListener('pointermove', move as EventListener, opts);
      target.removeEventListener('pointerup', up as EventListener, opts);
      target.removeEventListener('pointercancel', up as EventListener, opts);
    };
  }
}
