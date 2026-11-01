// Motion: nothing pops in. Lists stagger in, numbers count up, rewards fly into their counters, and every wait is a
// tween the caller can await.
import { effect } from './feedback.ts';
import { MOTION } from './tokens.ts';

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);

/** Runs fn(t) for t from 0 to 1 over ms, eased; resolves at the end. */
export function tween(ms: number, fn: (t: number) => void, ease: (t: number) => number = easeOut): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0) { fn(1); resolve(); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      fn(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export interface CountOptions {
  from?: number;
  ms?: number;
  format?: (v: number) => string;
  /** Ticks a sound as it climbs (every few steps), and lands with a reward sound. */
  tick?: boolean;
}

/** Counts a number up (or down) in an element's text. */
export function countUp(e: Element, to: number, o: CountOptions = {}): Promise<void> {
  const from = o.from ?? 0, fmt = o.format ?? ((v: number) => String(Math.round(v)));
  const ms = o.ms ?? Math.min(1400, 380 + Math.abs(to - from) * 6);
  let last = from;
  e.textContent = fmt(from);
  e.classList.add('p-counting');
  return tween(ms, (t) => {
    const v = from + (to - from) * t;
    e.textContent = fmt(v);
    if (o.tick && Math.abs(Math.round(v) - Math.round(last)) >= Math.max(1, Math.abs(to - from) / 14)) {
      last = v;
      effect('count', 'tick', 'none');
    }
  }).then(() => {
    e.textContent = fmt(to);
    e.classList.remove('p-counting');
    if (o.tick) effect('count:land', 'count', 'light');
  });
}

/** Staggers a container's children in: each gets --i and the entry animation. */
export function stagger(container: Element, selector = ':scope > *', start = 0): void {
  container.querySelectorAll<HTMLElement>(selector).forEach((c, i) => {
    c.style.setProperty('--i', String(start + i));
    c.classList.remove('p-in');
    void c.offsetWidth;
    c.classList.add('p-in');
  });
}

let flyLayer: HTMLElement | null = null;
/** Where fliers travel: a layer over everything, set by the interface shell. */
export function setFlyLayer(e: HTMLElement): void {
  flyLayer = e;
}

export interface FlyOptions {
  /** The glyph each flier carries (SVG markup). */
  icon: string;
  count?: number;
  color?: string;
  /** Called as each flier lands. */
  onLand?: (i: number) => void;
}

/** Rewards fly from one element into their counter, in an arc, landing one after another with a bump. */
export async function flyTo(from: Element | DOMRect, to: Element, o: FlyOptions): Promise<void> {
  const layer = flyLayer ?? document.body, n = o.count ?? 6;
  const a = from instanceof Element ? from.getBoundingClientRect() : from, b = to.getBoundingClientRect();
  const L = layer.getBoundingClientRect();
  const ax = a.left + a.width / 2 - L.left, ay = a.top + a.height / 2 - L.top, bx = b.left + b.width / 2 - L.left, by = b.top + b.height / 2 - L.top;
  const jobs: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    const f = document.createElement('div');
    f.className = 'p-flier';
    f.innerHTML = o.icon;
    if (o.color) f.style.color = o.color;
    layer.appendChild(f);
    // scatter out a little, then sweep up and over into the counter
    const sx = ax + (Math.random() - 0.5) * 120, sy = ay + (Math.random() - 0.5) * 80;
    const mx = (sx + bx) / 2 + (Math.random() - 0.5) * 80, my = Math.min(sy, by) - 80 - Math.random() * 60;
    const anim = f.animate([
      { transform: `translate(${ax}px, ${ay}px) scale(0.2)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy}px) scale(1.15)`, opacity: 1, offset: 0.22 },
      { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${bx}px, ${by}px) scale(0.55)`, opacity: 0.9 },
    ], { duration: 820 + i * 22, delay: i * 70, easing: MOTION.ease, fill: 'both' });
    jobs.push(anim.finished.then(() => {
      f.remove();
      to.classList.remove('p-bump');
      void (to as HTMLElement).offsetWidth;
      to.classList.add('p-bump');
      effect('reward:land', i === 0 ? 'reward' : 'tick', i === 0 ? 'light' : 'none');
      o.onLand?.(i);
    }));
  }
  await Promise.all(jobs);
}
