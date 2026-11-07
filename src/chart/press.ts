// Every tap answered. A pressable thing on the chart sinks a hair when a finger lands on it and its ink darkens; a
// short sound and a haptic go out through the interface's feedback hook (src/ui/parts/feedback.ts, which the app
// connects to the sound bank and the Taptic Engine); released, it springs back past rest and settles.
//
// The press is a spring, stepped by the frame's time: stiff and fully damped going down (the sink is felt at once),
// softer and underdamped coming back (the spring-back overshoots a little, so the paper seems to lift).
// Hit areas are never smaller than the touch target (56 pt), however small the drawing.
import { feedback, type UiHaptic, type UiSound } from '../ui/parts/feedback.ts';

/** The smallest touch target, CSS pixels (points). */
export const TARGET = 56;

export class Press {
  held = false;
  /** 0 at rest, 1 fully sunk; a little below 0 as it springs back. */
  sink = 0;
  #v = 0;

  down(): void {
    this.held = true;
  }

  up(): void {
    this.held = false;
  }

  /** Advances the spring by dt seconds; returns the sink. */
  step(dt: number): number {
    const target = this.held ? 1 : 0;
    const k = this.held ? 2600 : 520, zeta = this.held ? 1 : 0.32;
    const c = 2 * zeta * Math.sqrt(k);
    // a few small steps, so a long frame cannot blow the spring up
    const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = k * (target - this.sink) - c * this.#v;
      this.#v += a * h;
      this.sink += this.#v * h;
    }
    if (!this.held && Math.abs(this.sink) < 1e-3 && Math.abs(this.#v) < 1e-2) { this.sink = 0; this.#v = 0; }
    return this.sink;
  }

  /** At rest and not held. */
  get idle(): boolean {
    return !this.held && this.sink === 0;
  }
}

/** What a press looks like: the drawing's scale and drop, and how much its ink darkens. */
export function pressLook(sink: number): { scale: number; dy: number; dark: number } {
  return { scale: 1 - 0.04 * sink, dy: 1.6 * sink, dark: Math.max(0, Math.min(1, sink)) };
}

export type Hit = { x: number; y: number; r: number } | { x: number; y: number; w: number; h: number };

export interface Pressable {
  id: string;
  /** Where it is, CSS pixels: a circle or a box centred at (x, y). Grown to the touch target if smaller. */
  hit: Hit;
  press: Press;
  sound?: UiSound;
  haptic?: UiHaptic;
  /** 'up' (default) acts on release over it; 'down' acts at once (the HUD's controls). */
  on?: 'up' | 'down';
  act?: () => void;
  disabled?: boolean;
}

/** Whether (x, y) is on a pressable, its hit grown to the touch target. */
export function hits(p: Pressable, x: number, y: number): boolean {
  const h = p.hit;
  if ('r' in h) return Math.hypot(x - h.x, y - h.y) <= Math.max(h.r, TARGET / 2);
  return Math.abs(x - h.x) <= Math.max(h.w, TARGET) / 2 && Math.abs(y - h.y) <= Math.max(h.h, TARGET) / 2;
}

/** Routes fingers to pressables: the topmost one under a finger takes it until it lifts. */
export class Presses {
  readonly list: Pressable[] = [];
  readonly #held = new Map<number, Pressable>();

  add(p: Pressable): Pressable {
    this.remove(p.id);
    this.list.push(p);
    return p;
  }

  remove(id: string): void {
    const i = this.list.findIndex((p) => p.id === id);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** A finger landed; returns whether a pressable took it. */
  down(pointer: number, x: number, y: number): boolean {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (!hits(p, x, y)) continue;
      this.#held.set(pointer, p);
      if (p.disabled) {
        feedback('deny', 'error', p.id);
        return true;
      }
      p.press.down();
      if (p.on === 'down') {
        feedback(p.sound ?? 'tap', p.haptic ?? 'light', p.id);
        p.act?.();
      } else {
        // the paper gives under the finger: a selection tick now, the sound when it acts
        feedback('none', 'selection', p.id);
      }
      return true;
    }
    return false;
  }

  /** A finger lifted (or was cancelled, `inside` false). */
  up(pointer: number, x: number, y: number, cancelled = false): void {
    const p = this.#held.get(pointer);
    if (!p) return;
    this.#held.delete(pointer);
    p.press.up();
    if (p.disabled || p.on === 'down' || cancelled || !hits(p, x, y)) return;
    feedback(p.sound ?? 'tap', p.haptic ?? 'light', p.id);
    p.act?.();
  }

  /** Steps every press's spring. */
  step(dt: number): void {
    for (const p of this.list) p.press.step(dt);
  }
}
