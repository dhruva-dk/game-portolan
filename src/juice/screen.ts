// Screen flashes and vignettes: the damage edge (aimed at whoever hit you), the shield break's cold flash, and the
// low-hull heartbeat. `ScreenFx` is plain state, so the renderer can feed it into its grade as uniforms; `ScreenFxDom`
// draws the same state with two DOM layers for pages that don't have a grade.
//
// Safety: a flash that changes the screen's brightness a lot counts as a "big" flash, and no more than three big
// flashes may start in any second (the WCAG 2.3.1 threshold). Extra ones are dimmed to a safe level and logged as trimmed.
import { EASE } from './ease.ts';
import { effects } from './log.ts';

export type Rgb = readonly [number, number, number];

/**
 * `add` lightens like light hitting the lens (shield break, crit glints, the win). `tint` lays colour over the
 * frame like a wash (damage). Times in seconds.
 */
export interface FlashSpec {
  color: string;
  alpha: number;
  blend: 'add' | 'tint';
  attack: number;
  hold: number;
  decay: number;
}

/** Colour creeping in from the edges. `reach` is how far in it gets: 0.3 hugs the corners, 0.7 eats the frame. */
export interface VignetteSpec {
  color: string;
  alpha: number;
  reach: number;
  attack: number;
  hold: number;
  decay: number;
  /** Shift toward the source direction when one is given. */
  aimed?: boolean;
}

export interface ScreenState {
  add: { color: Rgb; alpha: number };
  tint: { color: Rgb; alpha: number };
  /** cx, cy: where the clear middle sits, -1..1 of half the screen (+x right, +y down). */
  vignette: { color: Rgb; alpha: number; reach: number; cx: number; cy: number };
  /** 0..1, how low the hull is (0 above 30%). */
  low: number;
  /** A suggestion for the grade: pull saturation down by this much. */
  desat: number;
}

interface Layer {
  color: Rgb;
  alpha: number;
  attack: number;
  hold: number;
  decay: number;
  age: number;
}

interface Flash extends Layer {
  blend: 'add' | 'tint';
}

interface Vignette extends Layer {
  reach: number;
  cx: number;
  cy: number;
}

/** A flash whose alpha is at or over this counts as big (≥ ~10% luminance change over most of the screen). */
const BIG = 0.2;
const SAFE = 0.12;

/** The low-hull heartbeat. Below `LOW_START` of the hull it fades in; the rate climbs as the hull drops. */
export const LOW_HULL = {
  start: 0.3,
  floor: 0.05,
  bpmCalm: 72,
  bpmPanic: 128,
  color: '#b0141c',
  /** Resting vignette, then the extra on each beat, both scaled by how low the hull is (0..1). */
  rest: [0.1, 0.32],
  beat: [0.12, 0.28],
  reach: [0.42, 0.6],
  /** Seconds from lub to dub, and how fast each thump fades. */
  dub: 0.15,
  fade: 9,
  desat: 0.45,
} as const;

export function rgb(hex: string): Rgb {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class ScreenFx {
  /** 0..1: the player's flash setting. */
  intensity = 1;
  readonly state: ScreenState = {
    add: { color: [1, 1, 1], alpha: 0 },
    tint: { color: [1, 0, 0], alpha: 0 },
    vignette: { color: [0, 0, 0], alpha: 0, reach: 0.5, cx: 0, cy: 0 },
    low: 0,
    desat: 0,
  };
  /** Called on each heartbeat's first thump, with the hull's lowness (0..1). */
  onBeat: ((low: number) => void) | null = null;
  private flashes: Flash[] = [];
  private vignettes: Vignette[] = [];
  private bigStarts: number[] = [];
  private now = 0;
  private hull = 1;
  private beatT = 0;
  private sinceBeat = 9;

  flash(spec: FlashSpec, strength = 1): void {
    let alpha = Math.min(1, spec.alpha * strength * this.intensity);
    this.bigStarts = this.bigStarts.filter((t) => t > this.now - 1);
    let outcome: 'played' | 'trimmed' = 'played';
    if (alpha >= BIG) {
      if (this.bigStarts.length >= 3) {
        alpha = SAFE;
        outcome = 'trimmed';
      } else this.bigStarts.push(this.now);
    }
    this.flashes.push({ color: rgb(spec.color), alpha, blend: spec.blend, attack: spec.attack, hold: spec.hold, decay: spec.decay, age: 0 });
    effects.add('flash', `${spec.blend} ${spec.color}`, { alpha, ms: (spec.attack + spec.hold + spec.decay) * 1000 }, outcome);
  }

  /** `dir`: the source's screen direction, radians clockwise from straight ahead (the top of the screen). */
  vignette(spec: VignetteSpec, strength = 1, dir?: number): void {
    const alpha = Math.min(1, spec.alpha * strength * this.intensity);
    const aim = spec.aimed && dir !== undefined ? 0.55 : 0;
    const cx = aim ? -Math.sin(dir!) * aim : 0, cy = aim ? Math.cos(dir!) * aim : 0;
    this.vignettes.push({ color: rgb(spec.color), alpha, reach: spec.reach, attack: spec.attack, hold: spec.hold, decay: spec.decay, age: 0, cx, cy });
    effects.add('vignette', spec.color, { alpha, reach: spec.reach, ms: (spec.attack + spec.hold + spec.decay) * 1000, ...(aim ? { dir: dir! } : {}) });
  }

  /** The hull as a fraction (0..1). Call every frame, or when it changes; 0 or less means sunk (no heartbeat). */
  setHull(frac: number): void {
    this.hull = frac;
  }

  update(dt: number): ScreenState {
    this.now += dt;
    const st = this.state;
    // flashes: composite each blend as stacked layers
    for (const blend of ['add', 'tint'] as const) {
      let keep = 1, r = 0, g = 0, b = 0, wsum = 0;
      for (const f of this.flashes) {
        if (f.blend !== blend) continue;
        const a = f.alpha * env(f);
        keep *= 1 - a;
        r += f.color[0] * a;
        g += f.color[1] * a;
        b += f.color[2] * a;
        wsum += a;
      }
      const out = st[blend];
      out.alpha = 1 - keep;
      if (wsum > 0) out.color = [r / wsum, g / wsum, b / wsum];
    }
    // vignettes: event layers plus the heartbeat
    const low = this.hull > 0 ? Math.max(0, Math.min(1, (LOW_HULL.start - this.hull) / (LOW_HULL.start - LOW_HULL.floor))) : 0;
    const layers: { color: Rgb; alpha: number; reach: number; cx: number; cy: number }[] = [];
    for (const v of this.vignettes) layers.push({ color: v.color, alpha: v.alpha * env(v), reach: v.reach, cx: v.cx, cy: v.cy });
    if (low > 0) {
      const bpm = LOW_HULL.bpmCalm + (LOW_HULL.bpmPanic - LOW_HULL.bpmCalm) * low;
      this.beatT += dt;
      this.sinceBeat += dt;
      if (this.beatT >= 60 / bpm) {
        this.beatT = 0;
        this.sinceBeat = 0;
        this.onBeat?.(low);
      }
      const s = this.sinceBeat;
      const thump = Math.exp(-s * LOW_HULL.fade) + (s > LOW_HULL.dub ? 0.6 * Math.exp(-(s - LOW_HULL.dub) * LOW_HULL.fade) : 0);
      const lerp = (p: readonly [number, number]) => p[0] + (p[1] - p[0]) * low;
      layers.push({ color: rgb(LOW_HULL.color), alpha: (lerp(LOW_HULL.rest) + lerp(LOW_HULL.beat) * thump) * this.intensity, reach: lerp(LOW_HULL.reach), cx: 0, cy: 0 });
    } else {
      this.beatT = 9;
      this.sinceBeat = 9;
    }
    let keep = 1, wsum = 0;
    const v = st.vignette;
    let r = 0, g = 0, b = 0, reach = 0, cx = 0, cy = 0;
    for (const l of layers) {
      keep *= 1 - l.alpha;
      wsum += l.alpha;
      r += l.color[0] * l.alpha;
      g += l.color[1] * l.alpha;
      b += l.color[2] * l.alpha;
      reach += l.reach * l.alpha;
      cx += l.cx * l.alpha;
      cy += l.cy * l.alpha;
    }
    v.alpha = 1 - keep;
    if (wsum > 0) {
      v.color = [r / wsum, g / wsum, b / wsum];
      v.reach = reach / wsum;
      v.cx = cx / wsum;
      v.cy = cy / wsum;
    }
    st.low = low;
    st.desat = low * LOW_HULL.desat;
    for (const f of this.flashes) f.age += dt;
    for (const l of this.vignettes) l.age += dt;
    this.flashes = this.flashes.filter((f) => f.age < f.attack + f.hold + f.decay);
    this.vignettes = this.vignettes.filter((l) => l.age < l.attack + l.hold + l.decay);
    return st;
  }

  clear(): void {
    this.flashes = [];
    this.vignettes = [];
    this.bigStarts = [];
  }
}

/** 0 → 1 → 1 → 0. The attack is linear (a flash should land on its first frame); the decay eases out. */
function env(l: Layer): number {
  const a = l.age;
  if (a < l.attack) return a / l.attack;
  if (a < l.attack + l.hold) return 1;
  return 1 - EASE.fade((a - l.attack - l.hold) / Math.max(1e-6, l.decay));
}

/** Draws a ScreenState with DOM layers over the game: an additive flash, a tint wash and the vignette. */
export class ScreenFxDom {
  readonly root: HTMLDivElement;
  private readonly addEl: HTMLDivElement;
  private readonly tintEl: HTMLDivElement;
  private readonly vigEl: HTMLDivElement;
  private lastVig = '';

  constructor(parent: HTMLElement) {
    const layer = (blend: string) => {
      const d = document.createElement('div');
      d.style.cssText = `position:absolute;inset:0;pointer-events:none;opacity:0;mix-blend-mode:${blend};`;
      return d;
    };
    this.root = document.createElement('div');
    this.root.className = 'juice-screen';
    this.root.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    this.vigEl = layer('normal');
    this.tintEl = layer('normal');
    this.addEl = layer('plus-lighter');
    this.root.append(this.vigEl, this.tintEl, this.addEl);
    parent.append(this.root);
  }

  draw(s: ScreenState): void {
    const css = (c: Rgb) => `rgb(${(c[0] * 255) | 0},${(c[1] * 255) | 0},${(c[2] * 255) | 0})`;
    this.addEl.style.opacity = s.add.alpha.toFixed(3);
    if (s.add.alpha > 0) this.addEl.style.background = css(s.add.color);
    this.tintEl.style.opacity = s.tint.alpha.toFixed(3);
    if (s.tint.alpha > 0) this.tintEl.style.background = css(s.tint.color);
    const v = s.vignette;
    this.vigEl.style.opacity = v.alpha > 0.002 ? '1' : '0';
    if (v.alpha > 0.002) {
      const c = v.color.map((x) => (x * 255) | 0).join(',');
      const inner = Math.max(0, (1 - v.reach) * 100);
      const x = 50 + v.cx * 50, y = 50 + v.cy * 50;
      const bg =
        `radial-gradient(ellipse farthest-corner at ${x.toFixed(1)}% ${y.toFixed(1)}%, rgba(${c},0) ${inner.toFixed(1)}%, ` +
        `rgba(${c},${(v.alpha * 0.45).toFixed(3)}) ${(inner + (100 - inner) * 0.45).toFixed(1)}%, rgba(${c},${v.alpha.toFixed(3)}) 100%)`;
      if (bg !== this.lastVig) this.vigEl.style.background = this.lastVig = bg;
    }
  }
}
