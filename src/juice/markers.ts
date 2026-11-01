// Hit markers at the crosshair and damage numbers over the target, drawn in the DOM and stepped by the juice clock.
//
// Each marker kind differs by shape as well as colour, so it reads at a glance at phone size and for colour-blind
// players: hull hits are an X of four ticks, shield hits are four corner brackets (a broken square), a crit is a
// bigger gold X that spins in, a break throws the brackets outward with shards and a ring, and a kill is a red X
// that turns 45° into a plus.
import { EASE } from './ease.ts';
import { effects } from './log.ts';

export type MarkerKind = 'hit' | 'shield' | 'crit' | 'break' | 'kill';

interface MarkerShape {
  color: string;
  shape: 'tick' | 'bracket';
  /** px at scale 1: tick length, line width, gap from the centre to a tick's inner end. */
  len: number;
  width: number;
  gap: number;
  /** Seconds on screen. */
  life: number;
  /** Starting scale, and how long it takes to settle to 1. */
  pop: number;
  popTime: number;
  /** Degrees turned in over the pop. */
  spin: number;
  /** px the ticks travel outward over the life. */
  spread: number;
  shards: number;
  ring: string;
}

/**
 * Timings at 60 fps: a hit is up for 17 frames and has popped back to size by frame 5, so a repeater's hits read as
 * separate beats. Crits and breaks hold longer because they matter more; the kill holds longest.
 */
export const MARKERS: Record<MarkerKind, MarkerShape> = {
  hit: { color: '#ffffff', shape: 'tick', len: 13, width: 3.5, gap: 8, life: 0.28, pop: 1.55, popTime: 0.08, spin: 0, spread: 0, shards: 0, ring: '' },
  shield: { color: '#4fc3ff', shape: 'bracket', len: 11, width: 3.5, gap: 9, life: 0.28, pop: 1.45, popTime: 0.08, spin: 0, spread: 0, shards: 0, ring: '' },
  crit: { color: '#ffd23f', shape: 'tick', len: 17, width: 4.5, gap: 9, life: 0.45, pop: 1.85, popTime: 0.1, spin: -15, spread: 0, shards: 0, ring: '' },
  break: { color: '#e8f8ff', shape: 'bracket', len: 14, width: 4.5, gap: 10, life: 0.6, pop: 1.9, popTime: 0.1, spin: 0, spread: 22, shards: 10, ring: '#4fc3ff' },
  kill: { color: '#ff4a2e', shape: 'tick', len: 19, width: 5, gap: 9, life: 0.8, pop: 2.1, popTime: 0.12, spin: 45, spread: 0, shards: 0, ring: '#ff4a2e' },
};

const RANK: Record<MarkerKind, number> = { hit: 0, shield: 1, crit: 2, break: 3, kill: 4 };
const OUTLINE = 'rgba(8,12,20,0.85)';

export interface Point {
  x: number;
  y: number;
}

interface Shard {
  el: HTMLDivElement;
  a: number;
  v: number;
  spin: number;
}

export class HitMarkers {
  readonly root: HTMLDivElement;
  /** Multiplies every size; set from the HUD's scale (about 1 on iPad, 0.9 on iPhone). */
  scale = 1;
  private kind: MarkerKind | null = null;
  private t = 0;
  private readonly ticks: HTMLDivElement[] = [];
  private readonly ring: HTMLDivElement;
  private shards: Shard[] = [];
  private readonly parent: HTMLElement;
  private seed = 0;

  constructor(parent: HTMLElement) {
    this.parent = parent;
    this.root = document.createElement('div');
    this.root.className = 'juice-marker';
    this.root.style.cssText = 'position:absolute;left:50%;top:50%;width:0;height:0;pointer-events:none;opacity:0;';
    for (let i = 0; i < 4; i++) {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:0;top:0;box-sizing:border-box;transform-origin:0 0;';
      this.ticks.push(d);
      this.root.append(d);
    }
    this.ring = document.createElement('div');
    this.ring.style.cssText = 'position:absolute;left:0;top:0;border-radius:50%;box-sizing:border-box;opacity:0;';
    this.root.append(this.ring);
    parent.append(this.root);
  }

  /** Shows a marker at a screen point inside the parent (default its centre, the crosshair). */
  show(kind: MarkerKind, at?: Point): void {
    if (this.kind && RANK[kind] < RANK[this.kind] && this.t < MARKERS[this.kind].life * 0.6) {
      effects.add('marker', kind, { by: this.kind }, 'suppressed');
      return;
    }
    this.kind = kind;
    this.t = 0;
    const m = MARKERS[kind], s = this.scale;
    if (at) {
      this.root.style.left = `${at.x}px`;
      this.root.style.top = `${at.y}px`;
    } else {
      this.root.style.left = '50%';
      this.root.style.top = '50%';
    }
    for (const d of this.ticks) {
      if (m.shape === 'tick') {
        d.style.width = `${m.len * s}px`;
        d.style.height = `${m.width * s}px`;
        d.style.background = m.color;
        d.style.border = 'none';
        d.style.borderRadius = `${m.width * s * 0.5}px`;
        d.style.boxShadow = `0 0 0 ${1.25 * s}px ${OUTLINE}, 0 0 ${6 * s}px rgba(0,0,0,0.35)`;
      } else {
        const b = m.len * s;
        d.style.width = `${b}px`;
        d.style.height = `${b}px`;
        d.style.background = 'none';
        d.style.border = `${m.width * s}px solid ${m.color}`;
        d.style.borderLeft = 'none';
        d.style.borderBottom = 'none';
        d.style.borderRadius = `0 ${m.width * s}px 0 0`;
        d.style.boxShadow = 'none';
        d.style.filter = `drop-shadow(0 0 ${1.2 * s}px ${OUTLINE}) drop-shadow(0 0 ${1.2 * s}px ${OUTLINE})`;
      }
    }
    for (const sh of this.shards) sh.el.remove();
    this.shards = [];
    for (let i = 0; i < m.shards; i++) {
      const el = document.createElement('div');
      const w = (3 + ((i * 7) % 4)) * s, h = (6 + ((i * 5) % 6)) * s;
      el.style.cssText = `position:absolute;left:${-w / 2}px;top:${-h / 2}px;width:${w}px;height:${h}px;background:${i % 3 ? m.ring || m.color : m.color};clip-path:polygon(50% 0,100% 70%,30% 100%,0 40%);`;
      this.root.append(el);
      this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
      const jitter = (this.seed / 0x7fffffff - 0.5) * 0.6;
      this.shards.push({ el, a: (i / m.shards) * Math.PI * 2 + jitter, v: (180 + ((i * 53) % 90)) * s, spin: (i % 2 ? 1 : -1) * (400 + i * 40) });
    }
    this.ring.style.border = m.ring ? `${2.5 * s}px solid ${m.ring}` : 'none';
    this.ring.style.opacity = '0';
    effects.add('marker', kind, { life: m.life * 1000, pop: m.pop, ...(at ? { x: at.x, y: at.y } : {}) });
    this.draw();
  }

  update(dt: number): void {
    if (!this.kind) return;
    this.t += dt;
    if (this.t >= MARKERS[this.kind].life) {
      this.clear();
      return;
    }
    this.draw();
  }

  /** Hides the marker at once. */
  clear(): void {
    this.kind = null;
    this.root.style.opacity = '0';
    for (const sh of this.shards) sh.el.remove();
    this.shards = [];
  }

  private draw(): void {
    const m = MARKERS[this.kind!], t = this.t, s = this.scale;
    const pop = 1 + (m.pop - 1) * (1 - EASE.snap(t / m.popTime));
    const spin = m.spin * EASE.snap(t / (m.popTime * 2));
    const spread = m.spread * s * EASE.settle(t / m.life);
    const fadeAt = m.life * 0.5;
    const alpha = t < fadeAt ? 1 : 1 - ((t - fadeAt) / (m.life - fadeAt)) ** 2;
    this.root.style.opacity = alpha.toFixed(3);
    this.root.style.transform = `scale(${pop.toFixed(3)}) rotate(${spin.toFixed(2)}deg)`;
    for (let i = 0; i < 4; i++) {
      const d = this.ticks[i], ang = 45 + i * 90;
      if (m.shape === 'tick') {
        const r = m.gap * s + spread;
        d.style.transform = `rotate(${ang}deg) translate(${r}px, ${(-m.width * s) / 2}px)`;
      } else {
        // a corner bracket whose corner points outward along the diagonal
        const b = m.len * s, r = m.gap * s + spread;
        d.style.transform = `rotate(${ang - 45}deg) translate(${r * 0.7071}px, ${-r * 0.7071 - b}px)`;
      }
    }
    if (m.ring) {
      const p = Math.min(1, t / (m.life * 0.6));
      const r = (m.gap + m.len) * s * (0.6 + 1.4 * EASE.snap(p));
      this.ring.style.width = this.ring.style.height = `${2 * r}px`;
      this.ring.style.left = this.ring.style.top = `${-r}px`;
      this.ring.style.opacity = (0.9 * (1 - p)).toFixed(3);
    }
    for (const sh of this.shards) {
      const d = sh.v * (t - 0.6 * t * t) * 0.9 + (m.gap + m.len * 0.5) * s;
      sh.el.style.transform = `translate(${(Math.cos(sh.a) * d).toFixed(1)}px, ${(Math.sin(sh.a) * d).toFixed(1)}px) rotate(${(sh.spin * t).toFixed(0)}deg)`;
      sh.el.style.opacity = Math.max(0, 1 - t / (m.life * 0.85)).toFixed(3);
    }
  }

  get parentElement(): HTMLElement {
    return this.parent;
  }
}

export type NumberKind = 'hull' | 'shield' | 'crit';

/** Blue for shield and white for hull, as PLAN.md asks; gold and bigger for a crit. */
export const NUMBERS: Record<NumberKind, { color: string; size: number; life: number }> = {
  hull: { color: '#ffffff', size: 26, life: 0.95 },
  shield: { color: '#4fc3ff', size: 26, life: 0.95 },
  crit: { color: '#ffd23f', size: 34, life: 1.15 },
};

/** Numbers within this many seconds on the same target and colour merge into one, re-popping. */
const MERGE = 0.6;
/** Numbers start up and right of the hit (px at scale 1), and drift further right, so the crosshair's marker stays clear. */
const OFFSET = { x: 30, y: -34, drift: [8, 26] } as const;

interface Num {
  el: HTMLDivElement;
  kind: NumberKind;
  key: string;
  value: number;
  t: number;
  at: Point | (() => Point | null);
  dx: number;
  live: boolean;
}

export class DamageNumbers {
  readonly root: HTMLDivElement;
  scale = 1;
  private nums: Num[] = [];
  private n = 0;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'juice-numbers';
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    parent.append(this.root);
  }

  /** `at` is a screen point, or a function that projects a world point each frame (null hides it). */
  show(value: number, kind: NumberKind, at: Point | (() => Point | null), key: string | number = ''): void {
    const fam = kind === 'shield' ? 'shield' : 'hull';
    const k = `${key}`;
    const merge = k !== '' && this.nums.find((n) => n.live && n.key === k && (n.kind === 'shield' ? 'shield' : 'hull') === fam && n.t < MERGE);
    if (merge) {
      merge.value += value;
      if (kind === 'crit') merge.kind = 'crit';
      merge.t = 0.05;
      merge.el.textContent = String(Math.round(merge.value));
      this.style(merge);
      effects.add('number', `${merge.kind} merged`, { value, total: merge.value });
      return;
    }
    let n = this.nums.find((q) => !q.live);
    if (!n) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:absolute;left:0;top:0;font:800 26px/1 system-ui,-apple-system,"Helvetica Neue",sans-serif;white-space:nowrap;' +
        'paint-order:stroke fill;-webkit-text-stroke:4px rgba(8,12,20,0.85);text-shadow:0 2px 8px rgba(0,0,0,0.45);will-change:transform,opacity;';
      this.root.append(el);
      n = { el, kind, key: k, value: 0, t: 0, at, dx: 0, live: true };
      this.nums.push(n);
    }
    this.n++;
    const drift = OFFSET.drift[0] + ((this.n * 37) % 11) / 10 * (OFFSET.drift[1] - OFFSET.drift[0]);
    Object.assign(n, { kind, key: k, value, t: 0, at, live: true, dx: drift });
    n.el.textContent = String(Math.round(value));
    this.style(n);
    effects.add('number', kind, { value });
    this.place(n);
  }

  update(dt: number): void {
    for (const n of this.nums) {
      if (!n.live) continue;
      n.t += dt;
      if (n.t > NUMBERS[n.kind].life) {
        n.live = false;
        n.el.style.opacity = '0';
        continue;
      }
      this.place(n);
    }
  }

  /** Hides every number at once, so none merges into the next match's. */
  clear(): void {
    for (const n of this.nums) {
      n.live = false;
      n.el.style.opacity = '0';
    }
  }

  private style(n: Num): void {
    const spec = NUMBERS[n.kind];
    n.el.style.color = spec.color;
    n.el.style.fontSize = `${spec.size * this.scale}px`;
  }

  private place(n: Num): void {
    const p = typeof n.at === 'function' ? n.at() : n.at;
    if (!p) {
      n.el.style.opacity = '0';
      return;
    }
    const life = NUMBERS[n.kind].life, t = n.t;
    // grow in over 4 frames past full size, then settle back: the pop
    const s = t < 0.065 ? 0.5 + 1.3 * (t / 0.065) : 1 + 0.8 * (1 - EASE.settle((t - 0.065) / 0.18));
    const rise = 48 * this.scale * EASE.settle(t / life);
    const x = p.x + (OFFSET.x + n.dx * EASE.settle(t / life)) * this.scale;
    const a = t < life * 0.6 ? 1 : 1 - (t - life * 0.6) / (life * 0.4);
    n.el.style.opacity = a.toFixed(3);
    n.el.style.transform = `translate(${x.toFixed(1)}px, ${(p.y + OFFSET.y * this.scale - rise).toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
  }
}
