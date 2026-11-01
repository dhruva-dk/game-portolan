// Interface motion: press, release, pop and squash springs on any element; numbers that count up; rewards that burst
// out and fly into their counter, in the DOM (a handful of icons) or on a canvas (dozens).
//
// Every element's springs compose into its CSS `scale` property (not `transform`), so they stack with each other and
// with whatever transform the element already has. All of it runs on the shared ticker, on real time.
import { EASE, Spring, SPRING, type Ease } from './ease.ts';
import { effects } from './log.ts';
import { ticker } from './ticker.ts';

// ------------------------------------------------------------------ element springs

interface Springs {
  el: HTMLElement;
  press: Spring;
  pop: Spring;
  squash: Spring;
  running: boolean;
}

const springs = new WeakMap<HTMLElement, Springs>();

function springsOf(el: HTMLElement): Springs {
  let s = springs.get(el);
  if (!s) {
    s = { el, press: new Spring(SPRING.press, 1), pop: new Spring(SPRING.pop), squash: new Spring(SPRING.squash), running: false };
    springs.set(el, s);
  }
  return s;
}

function run(s: Springs): void {
  if (s.running) return;
  s.running = true;
  ticker.add((dt) => {
    s.press.step(dt);
    s.pop.step(dt);
    s.squash.step(dt);
    const k = s.press.x * (1 + s.pop.x), q = s.squash.x;
    s.el.style.scale = `${(k * (1 + q)).toFixed(4)} ${(k * (1 - q)).toFixed(4)}`;
    if (s.press.settled() && s.pop.settled() && s.squash.settled()) {
      s.el.style.scale = s.press.target === 1 ? '' : `${s.press.target}`;
      s.running = false;
      return false;
    }
  });
}

/** How far a button sinks under the finger, and how hard it bounces back. */
export const PRESS = { depth: 0.92, bounce: 0.06 } as const;

/** Finger down: the element sinks to PRESS.depth in about 40 ms. */
export function pressDown(el: HTMLElement): void {
  const s = springsOf(el);
  s.press.preset = SPRING.press;
  s.press.target = PRESS.depth;
  run(s);
  effects.add('anim', 'press', { depth: PRESS.depth });
}

/** Finger up: the element springs back past full size once and settles. */
export function pressUp(el: HTMLElement): void {
  const s = springsOf(el);
  s.press.preset = SPRING.release;
  s.press.target = 1;
  s.press.kick(PRESS.bounce);
  run(s);
  effects.add('anim', 'release', { bounce: PRESS.bounce });
}

export interface PressOptions {
  /** On finger down: the place to play the tap haptic and sound. */
  onDown?: (e: PointerEvent) => void;
  /** On finger up inside the element: the tap. */
  onTap?: (e: PointerEvent) => void;
}

/** Makes an element pressable. Returns a function that removes the handlers. */
export function pressable(el: HTMLElement, opts: PressOptions = {}): () => void {
  let down = false;
  const onDown = (e: PointerEvent) => {
    down = true;
    el.setPointerCapture?.(e.pointerId);
    pressDown(el);
    opts.onDown?.(e);
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    down = false;
    pressUp(el);
    const r = el.getBoundingClientRect();
    if (e.type === 'pointerup' && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) opts.onTap?.(e);
  };
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}

/** A bump: the element swells by about `amount`, dips back under and settles. Pops add up if they overlap. */
export function pop(el: HTMLElement, amount = 0.2): void {
  const s = springsOf(el);
  s.pop.kick(amount);
  run(s);
  effects.add('anim', 'pop', { amount });
}

/** A landing: squashes wide by `amount`, stretches tall, and wobbles out. Volume stays about the same. */
export function squash(el: HTMLElement, amount = 0.18): void {
  const s = springsOf(el);
  s.squash.kick(amount);
  run(s);
  effects.add('anim', 'squash', { amount });
}

// ------------------------------------------------------------------ count-up

export interface CountOptions {
  /** Seconds. Defaults to longer for bigger jumps: 0.5 s plus 0.28 s per power of ten, at most 1.8 s. */
  duration?: number;
  ease?: Ease;
  format?: (n: number) => string;
  /** Each time the shown number changes, at most 30 times a second: the place for the tick sound. */
  onTick?: (n: number) => void;
  onDone?: () => void;
  /** The pop when it lands; 0 for none. */
  land?: number;
}

export interface Running {
  finish(): void;
  cancel(): void;
}

export function countDuration(from: number, to: number): number {
  return Math.min(1.8, 0.5 + 0.28 * Math.log10(1 + Math.abs(to - from)));
}

/** Counts the element's text from `from` to `to`, thrumming as it goes and popping when it lands. */
export function countUp(el: HTMLElement, from: number, to: number, opts: CountOptions = {}): Running {
  const duration = opts.duration ?? countDuration(from, to);
  const ease = opts.ease ?? EASE.count;
  const format = opts.format ?? ((n: number) => Math.round(n).toLocaleString('en-US'));
  let t = 0, shown = Math.round(from), lastTick = -1, lastThrum = -1, alive = true;
  el.textContent = format(from);
  effects.add('anim', 'count-up', { from, to, ms: duration * 1000 });
  const land = () => {
    el.textContent = format(to);
    if (opts.land !== 0) pop(el, opts.land ?? 0.22);
    effects.add('anim', 'count landed', { value: to });
    opts.onDone?.();
  };
  const off = ticker.add((dt) => {
    if (!alive) return false;
    t += dt;
    if (t >= duration) {
      alive = false;
      land();
      return false;
    }
    const n = Math.round(from + (to - from) * ease(t / duration));
    if (n !== shown) {
      shown = n;
      el.textContent = format(n);
      if (t - lastTick >= 1 / 30) {
        lastTick = t;
        opts.onTick?.(n);
      }
      if (t - lastThrum >= 0.09) {
        lastThrum = t;
        pop(el, 0.035);
      }
    }
  });
  return {
    finish() {
      if (!alive) return;
      alive = false;
      off();
      land();
    },
    cancel() {
      alive = false;
      off();
    },
  };
}

// ------------------------------------------------------------------ fly-to-counter

export interface Point {
  x: number;
  y: number;
}

/**
 * How a reward travels, tuned so a handful of coins reads as a stream and lands in about a second:
 * - burst: each flyer is flung out from the source to a ring 30-72 px away in 0.24 s, swelling past full size.
 * - stagger: then they leave one after another, 45 ms apart (at most 0.5 s in all, so big rewards don't drag).
 * - flight: each curves to the counter along a bow (alternating sides), accelerating in over 0.5-0.6 s and shrinking
 *   to 70% as it arrives, so the counter seems to swallow it.
 */
export const FLY = {
  burst: 0.24,
  ring: [30, 72],
  stagger: 0.045,
  maxStagger: 0.5,
  flight: [0.5, 0.62],
  bow: 0.32,
  scale: { start: 0.35, peak: 1.15, end: 0.7 },
} as const;

export interface FlyOptions {
  from: Point;
  /** The counter (its centre when the flight starts) or a screen point. */
  to: HTMLElement | Point;
  count: number;
  color?: string;
  /** Each arrival, in order: bump the counter here. The target element is popped for you. */
  onArrive?: (i: number, count: number) => void;
  onDone?: () => void;
  /** Sets the pseudo-random scatter, for repeatable captures. */
  seed?: number;
}

interface Flyer {
  bx: number;
  by: number;
  ex: number;
  ey: number;
  cx: number;
  cy: number;
  tx: number;
  ty: number;
  wait: number;
  flight: number;
  arrived: boolean;
}

function plan(o: FlyOptions): Flyer[] {
  const to = 'getBoundingClientRect' in o.to ? centre(o.to as HTMLElement) : (o.to as Point);
  let seed = (o.seed ?? 7) * 9301 + 49297;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const n = Math.max(1, Math.round(o.count));
  const stagger = Math.min(FLY.stagger, FLY.maxStagger / n);
  const out: Flyer[] = [];
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996 + rand() * 0.6, r = FLY.ring[0] + (FLY.ring[1] - FLY.ring[0]) * rand();
    const ex = o.from.x + Math.cos(a) * r, ey = o.from.y + Math.sin(a) * r;
    const mx = (ex + to.x) / 2, my = (ey + to.y) / 2, dx = to.x - ex, dy = to.y - ey;
    const side = i % 2 ? 1 : -1, bow = FLY.bow * (0.6 + 0.8 * rand()) * side;
    out.push({
      bx: o.from.x, by: o.from.y, ex, ey,
      cx: mx - dy * bow, cy: my + dx * bow,
      tx: to.x, ty: to.y,
      wait: FLY.burst + i * stagger,
      flight: FLY.flight[0] + (FLY.flight[1] - FLY.flight[0]) * rand(),
      arrived: false,
    });
  }
  return out;
}

/** Where a flyer is at time t: position, scale and opacity. */
function at(f: Flyer, t: number): { x: number; y: number; s: number; a: number } {
  if (t < FLY.burst) {
    const p = EASE.snap(t / FLY.burst);
    const s = FLY.scale.start + (FLY.scale.peak - FLY.scale.start) * EASE.overshoot(t / FLY.burst);
    return { x: f.bx + (f.ex - f.bx) * p, y: f.by + (f.ey - f.by) * p, s, a: Math.min(1, t / 0.05) };
  }
  if (t < f.wait) return { x: f.ex, y: f.ey, s: FLY.scale.peak + Math.sin((t - FLY.burst) * 30) * 0.03, a: 1 };
  const q = EASE.fall((t - f.wait) / f.flight), u = 1 - q;
  return {
    x: u * u * f.ex + 2 * u * q * f.cx + q * q * f.tx,
    y: u * u * f.ey + 2 * u * q * f.cy + q * q * f.ty,
    s: FLY.scale.peak + (FLY.scale.end - FLY.scale.peak) * q,
    a: 1,
  };
}

function centre(el: HTMLElement): Point {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** Steps a flight; returns false when every flyer has landed. */
function fly(o: FlyOptions, draw: (fs: Flyer[], t: number) => void, done: () => void): void {
  const fs = plan(o);
  const target = 'getBoundingClientRect' in o.to ? (o.to as HTMLElement) : null;
  let t = 0, landed = 0;
  effects.add('anim', 'fly', { count: fs.length, ms: (fs[fs.length - 1].wait + fs[fs.length - 1].flight) * 1000 });
  ticker.add((dt) => {
    t += dt;
    for (let i = 0; i < fs.length; i++) {
      const f = fs[i];
      if (f.arrived || t < f.wait + f.flight) continue;
      f.arrived = true;
      landed++;
      if (target) pop(target, 0.1 + 0.08 / Math.sqrt(fs.length));
      o.onArrive?.(landed - 1, fs.length);
    }
    draw(fs, t);
    if (landed === fs.length) {
      effects.add('anim', 'fly landed', { count: fs.length });
      done();
      o.onDone?.();
      return false;
    }
  });
}

/** Flies `count` DOM icons from a point into a counter. `make` builds one icon (default: a gold coin). */
export function flyTo(o: FlyOptions & { make?: () => HTMLElement; parent?: HTMLElement }): void {
  const parent = o.parent ?? document.body;
  const color = o.color ?? '#ffcf3a';
  const make = o.make ?? (() => coin(color));
  const els: HTMLElement[] = [];
  fly(
    o,
    (fs, t) => {
      while (els.length < fs.length) {
        const e = make();
        e.style.position = 'fixed';
        e.style.left = '0';
        e.style.top = '0';
        e.style.pointerEvents = 'none';
        e.style.willChange = 'transform';
        e.style.zIndex = '1000';
        parent.append(e);
        els.push(e);
      }
      for (let i = 0; i < fs.length; i++) {
        const e = els[i];
        if (fs[i].arrived) {
          e.style.display = 'none';
          continue;
        }
        const p = at(fs[i], t);
        e.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) translate(-50%, -50%) scale(${p.s.toFixed(3)})`;
        e.style.opacity = p.a.toFixed(2);
      }
    },
    () => els.forEach((e) => e.remove()),
  );
}

function coin(color: string): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText =
    `width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%, #fff8d0 0 18%, ${color} 40%, ` +
    `color-mix(in srgb, ${color} 55%, #5a3200) 100%);box-shadow:0 0 0 2px rgba(60,30,0,0.55), 0 0 12px ${color};`;
  return d;
}

/**
 * The same flights drawn on a 2D canvas laid over the screen, for big rewards (dozens of coins, XP sparks). The
 * canvas is sized to its CSS box each frame; pass the overlay canvas once and call `fly` as often as you like.
 */
export class FlyCanvas {
  readonly canvas: HTMLCanvasElement;
  private readonly flights: { fs: Flyer[]; t: number; color: string }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  fly(o: FlyOptions): void {
    const entry = { fs: [] as Flyer[], t: 0, color: o.color ?? '#ffcf3a' };
    this.flights.push(entry);
    fly(
      o,
      (fs, t) => {
        entry.fs = fs;
        entry.t = t;
        this.draw();
      },
      () => {
        this.flights.splice(this.flights.indexOf(entry), 1);
        this.draw();
      },
    );
  }

  private draw(): void {
    const c = this.canvas, dpr = typeof devicePixelRatio === 'number' ? devicePixelRatio : 1;
    const w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = c.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, c.clientWidth, c.clientHeight);
    const box = c.getBoundingClientRect();
    for (const f of this.flights) {
      for (const fl of f.fs) {
        if (fl.arrived) continue;
        const p = at(fl, f.t);
        const x = p.x - box.left, y = p.y - box.top, r = 9 * p.s;
        g.globalAlpha = p.a;
        g.globalCompositeOperation = 'lighter';
        const glow = g.createRadialGradient(x, y, 0, x, y, r * 2.4);
        glow.addColorStop(0, f.color);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = glow;
        g.fillRect(x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = f.color;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath();
        g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }
}
