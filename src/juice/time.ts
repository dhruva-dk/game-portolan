// Hit-stop: short freezes and slow motion on impact. The game advances by `update(realDt)`'s return value, so a
// stop slows the simulation's fixed-step accumulator and everything drawn from it, while the camera shake, the HUD
// and the haptics keep running on real time (the shake playing over a frozen frame is what sells the hit).
//
// Stacking rules:
// - Stops never add up. Overlapping stops take the deepest scale, so two hits 20 ms apart give one longer freeze.
// - A stop in its hold masks every lower-priority stop: a hit landing during a kill's slow motion doesn't stutter it.
//   Masked stops keep ageing underneath and usually expire unseen.
// - Below `kill`, frozen time is budgeted: at most `budget` seconds of (1 - scale) per rolling second, so a repeater
//   or a scatter volley can't turn the game into a slideshow. Over budget, a stop is trimmed, or dropped if under a frame.
// - No stop holds longer than 0.6 s unless it's a ceremony.
//
// Impact effects (sparks, shards, splinters, the flash on the hull) should not freeze with the world: step them by
// `effectDt(realDt)`, which never drops below EFFECT_FLOOR of real time, so the burst blooms slowly over the held
// frame, the way hit sparks keep playing through hitlag in a fighting game. Ships, water and projectiles use game time.
import { EASE } from './ease.ts';
import { effects } from './log.ts';

export const PRIORITY = { hurt: 0, hit: 1, crit: 2, break: 3, kill: 4, ceremony: 5 } as const;
export type Priority = keyof typeof PRIORITY;

export interface StopSpec {
  /** Time scale while held: 0 freezes, 0.25 is slow motion. */
  scale: number;
  /** Real seconds held at `scale`. */
  hold: number;
  /** Real seconds easing back to full speed. */
  release: number;
  priority: Priority;
}

interface Stop extends StopSpec {
  age: number;
  source: string;
}

const FRAME = 1 / 60;
/** The slowest impact effects run during a stop, as a fraction of real time. */
export const EFFECT_FLOOR = 0.35;
const MAX_HOLD = 0.6;

export class TimeScale {
  /** Seconds of frozen time allowed per rolling `window` for stops below `kill`. */
  budget = 0.2;
  window = 1;
  /** The scale applied on the last update. */
  scale = 1;
  private stops: Stop[] = [];
  private spent: { t: number; frozen: number }[] = [];
  private now = 0;

  request(spec: StopSpec, strength = 1): void {
    const p = PRIORITY[spec.priority];
    const depth = (1 - spec.scale) * Math.min(1, strength);
    const scale = 1 - depth;
    let hold = Math.min(spec.hold * (strength < 1 ? 0.5 + strength / 2 : 1), spec.priority === 'ceremony' ? 10 : MAX_HOLD);
    let outcome: 'played' | 'trimmed' | 'suppressed' = 'played';
    if (p < PRIORITY.kill && depth > 0) {
      const left = this.budget - this.frozenRecently() - this.committed();
      const cost = depth * (hold + (spec.release * 2) / 3);
      if (cost > left) {
        hold = Math.max(0, left / depth - (spec.release * 2) / 3);
        outcome = hold < FRAME ? 'suppressed' : 'trimmed';
      }
    }
    const masked = this.stops.some((s) => s.age < s.hold && PRIORITY[s.priority] > p);
    effects.add(
      'time',
      `stop ${spec.priority}`,
      { scale: +scale.toFixed(3), hold: hold * 1000, release: spec.release * 1000, masked },
      outcome,
    );
    if (outcome === 'suppressed') return;
    this.stops.push({ ...spec, scale, hold, age: 0, source: effects.source });
  }

  /** Advances real time; returns how much game time passes this frame. */
  update(realDt: number): number {
    const scale = this.current();
    this.scale = scale;
    this.now += realDt;
    for (const s of this.stops) s.age += realDt;
    this.stops = this.stops.filter((s) => s.age < s.hold + s.release);
    const budgeted = this.stops.length && !this.stops.some((s) => PRIORITY[s.priority] >= PRIORITY.kill);
    if (budgeted && scale < 1) this.spent.push({ t: this.now, frozen: (1 - scale) * realDt });
    while (this.spent.length && this.spent[0].t < this.now - this.window) this.spent.shift();
    return realDt * scale;
  }

  /** Time for impact effects this frame: game time, but never slower than EFFECT_FLOOR of real time. */
  effectDt(realDt: number): number {
    return realDt * Math.max(this.scale, EFFECT_FLOOR);
  }

  /** The scale this frame, by the stacking rules above. */
  current(): number {
    if (!this.stops.length) return 1;
    let floor = -1;
    for (const s of this.stops) if (s.age < s.hold) floor = Math.max(floor, PRIORITY[s.priority]);
    let scale = 1;
    for (const s of this.stops) if (PRIORITY[s.priority] >= floor) scale = Math.min(scale, valueOf(s));
    return scale;
  }

  get active(): boolean {
    return this.stops.length > 0;
  }

  clear(): void {
    this.stops = [];
    this.spent = [];
    this.scale = 1;
  }

  private frozenRecently(): number {
    let sum = 0;
    for (const s of this.spent) sum += s.frozen;
    return sum;
  }

  /** Frozen time still to come from live budgeted stops. */
  private committed(): number {
    let sum = 0;
    for (const s of this.stops) {
      if (PRIORITY[s.priority] >= PRIORITY.kill) continue;
      const hold = Math.max(0, s.hold - s.age);
      sum += (1 - s.scale) * (hold + (Math.min(s.release, s.hold + s.release - s.age) * 2) / 3);
    }
    return sum;
  }
}

function valueOf(s: Stop): number {
  if (s.age < s.hold) return s.scale;
  const p = (s.age - s.hold) / Math.max(1e-6, s.release);
  return s.scale + (1 - s.scale) * EASE.fall(p);
}
