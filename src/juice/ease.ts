// Timing: easing curves, named presets for each kind of motion, and a damped spring that every press, pop and kick
// rides on. Presentation only, so Math.pow and Math.sin are fine here (the simulation's rules don't apply).

export type Ease = (t: number) => number;

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const linear: Ease = (t) => clamp01(t);
export const quadIn: Ease = (t) => clamp01(t) ** 2;
export const quadOut: Ease = (t) => 1 - (1 - clamp01(t)) ** 2;
export const cubicIn: Ease = (t) => clamp01(t) ** 3;
export const cubicOut: Ease = (t) => 1 - (1 - clamp01(t)) ** 3;
export const cubicInOut: Ease = (t) => ((t = clamp01(t)) < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
export const quartOut: Ease = (t) => 1 - (1 - clamp01(t)) ** 4;
export const quintOut: Ease = (t) => 1 - (1 - clamp01(t)) ** 5;
export const expoOut: Ease = (t) => ((t = clamp01(t)) >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const expoIn: Ease = (t) => ((t = clamp01(t)) <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const sineInOut: Ease = (t) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;

/** Overshoots past 1 and settles back; `s` sets how far (1.70158 is the classic 10%). */
export const backOut = (s = 1.70158): Ease => (t) => {
  const u = clamp01(t) - 1;
  return 1 + (s + 1) * u ** 3 + s * u ** 2;
};

export const backIn = (s = 1.70158): Ease => (t) => {
  t = clamp01(t);
  return (s + 1) * t ** 3 - s * t ** 2;
};

/** A decaying wobble around 1, for things that land with a twang. */
export const elasticOut = (period = 0.3): Ease => (t) => {
  t = clamp01(t);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin(((t - period / 4) * (2 * Math.PI)) / period) + 1;
};

/**
 * The house curves. Pick by what the motion is doing, not by its maths:
 * - snap: arrives fast and settles (markers popping in, a punch-in's attack, a burst leaving its source).
 * - settle: the default for UI moving into place.
 * - fall: starts slow and rushes (time returning after a hit-stop, a coin accelerating into its counter).
 * - swoop: camera and panel moves that start and stop gently.
 * - fade: opacity going out.
 * - count: a number counting up: fast through the bulk, slow over the last digits so you can read them land.
 * - overshoot: a pop that goes past and comes back.
 */
export const EASE = {
  snap: expoOut,
  settle: cubicOut,
  fall: quadIn,
  swoop: cubicInOut,
  fade: quadOut,
  count: quartOut,
  overshoot: backOut(2.2),
} as const satisfies Record<string, Ease>;

/** A spring by feel: frequency in Hz (how fast) and damping ratio (1 = no overshoot, lower = more bounce). */
export interface SpringPreset {
  freq: number;
  damping: number;
}

/**
 * The house springs. Overshoot on a step is exp(-ζπ/√(1-ζ²)): ζ 0.9 ≈ 0%, 0.55 ≈ 13%, 0.42 ≈ 23%, 0.3 ≈ 37%.
 * - press: a finger going down. Stiff and nearly dead, so the button is under your thumb in ~40 ms.
 * - release: a finger coming up. Springy, so the button bounces back past full size once.
 * - pop: badges, counters and numbers bumping when something lands in them.
 * - squash: a jelly wobble for things landing (coins, icons), squash then stretch then settle.
 * - kick: the camera knocked by recoil or a hit, snapping home with one small overshoot.
 * - punch: the field of view punching in and recovering.
 * - follow: panels and readouts chasing a value, no bounce.
 */
export const SPRING = {
  press: { freq: 12, damping: 0.9 },
  release: { freq: 5.5, damping: 0.38 },
  pop: { freq: 6, damping: 0.32 },
  squash: { freq: 4.5, damping: 0.28 },
  kick: { freq: 7, damping: 0.55 },
  punch: { freq: 5, damping: 0.7 },
  follow: { freq: 2.5, damping: 1 },
} as const satisfies Record<string, SpringPreset>;

const SUBSTEP = 1 / 480;

/** A damped spring pulling `x` toward `target`. Stable at any frame time (it substeps). */
export class Spring {
  x: number;
  v = 0;
  target: number;
  preset: SpringPreset;

  constructor(preset: SpringPreset, x = 0, target = x) {
    this.preset = preset;
    this.x = x;
    this.target = target;
  }

  step(dt: number): number {
    const w = 2 * Math.PI * this.preset.freq;
    const k = w * w, c = 2 * this.preset.damping * w;
    let left = Math.min(dt, 0.25);
    while (left > 1e-9) {
      const h = Math.min(SUBSTEP, left);
      this.v += (-k * (this.x - this.target) - c * this.v) * h;
      this.x += this.v * h;
      left -= h;
    }
    return this.x;
  }

  /** Adds velocity so the spring's first excursion peaks about `amount` away from where it is. */
  kick(amount: number): void {
    this.v += amount / peakPerVelocity(this.preset);
  }

  settled(eps = 1e-4): boolean {
    return Math.abs(this.x - this.target) < eps && Math.abs(this.v) < eps * 10;
  }

  snap(x: number): void {
    this.x = this.target = x;
    this.v = 0;
  }
}

const peakCache = new Map<string, number>();

/** How far a spring at rest travels for unit starting velocity: lets kicks be tuned in metres and degrees. */
export function peakPerVelocity(p: SpringPreset): number {
  const key = `${p.freq}/${p.damping}`;
  let peak = peakCache.get(key);
  if (peak === undefined) {
    const s = new Spring(p, 0, 0);
    s.v = 1;
    peak = 0;
    for (let i = 0; i < 2000 && s.v > 0; i++) peak = Math.max(peak, s.step(1 / 1000));
    peakCache.set(key, peak);
  }
  return peak;
}

/** Samples a spring going from 0 to 1 as a CSS `linear()` easing, for non-interruptible WAAPI animations. */
export function springEasing(p: SpringPreset, samples = 48): { easing: string; duration: number } {
  const s = new Spring(p, 0, 1);
  const dt = 1 / 240;
  const xs: number[] = [0];
  let t = 0;
  while (t < 3 && !(t > 0.1 && s.settled(5e-4))) {
    s.step(dt);
    t += dt;
    xs.push(s.x);
  }
  const out: string[] = [];
  for (let i = 0; i <= samples; i++) out.push(xs[Math.round((i / samples) * (xs.length - 1))].toFixed(4));
  out[out.length - 1] = '1';
  return { easing: `linear(${out.join(', ')})`, duration: t };
}
