// How much of the canvas the scene is drawn at, from the time between frames alone: the frame rate is what matters, and a
// GPU that cannot keep up shows it there first. It only ever gives ground below the share renderer.ts fixes for the
// device, and takes it back when the frames are easy again; it never reaches past that share, so no probing upward costs
// a dropped frame.
//
// Two slow frames within about half a second lose a step at once. A step comes back after ten seconds with no slow frame,
// and a step that fails soon after it came back stays barred for a minute.

/** The target's frame, seconds: slower than `slow` is a missed frame. A lone frame from `stall` on may be an upload,
 *  streaming or collection; repeated stalls are overload and must still lower the scale. */
const TOLERANCE = 30 / 26, STALL = 30 / 13;
/** Each step is this share of the device's scale, and there are this many below it. */
const STEP = 0.05, STEPS = 7;
const HOLD = { afterHitch: 0.4, afterDrop: 0.6 } as const;
const BARRED = { failed: 60, usual: 15, soon: 8 } as const;
const CALM = 10;

export class Resolution {
  /** Capture runs hold it, so a picture does not depend on how the frames before it went. */
  static held = false;
  readonly #base: number;
  readonly #slowFrame: number;
  readonly #stallFrame: number;
  #step = 0;
  #slow = 0;
  #wasStall = false;
  #hold = 0;
  #calm = 0;
  #sinceRise = Infinity;
  #floor = 0;
  #barred = 0;

  constructor(base: number, targetFPS: 30 | 40 = 30) {
    this.#base = base;
    this.#slowFrame = TOLERANCE / targetFPS;
    this.#stallFrame = STALL / targetFPS;
  }

  /** The share of the canvas to draw the scene at, each way. */
  get scale(): number {
    return this.#base * (1 - this.#step * STEP);
  }

  /** Takes the seconds since the last frame; true if the scale has changed. */
  frame(dt: number): boolean {
    if (Resolution.held || !Number.isFinite(dt) || dt <= 0) return false;
    this.#hold -= dt;
    this.#sinceRise += dt;
    this.#barred -= dt;
    if (this.#barred <= 0) this.#floor = 0;
    const stalled = dt >= this.#stallFrame;
    const isolatedHitch = stalled && !this.#wasStall;
    if (isolatedHitch) this.#hold = Math.max(this.#hold, HOLD.afterHitch);
    this.#wasStall = stalled;
    // Weight by elapsed time as well as frame count: even 1–3 FPS must accumulate enough evidence of overload.
    // A lone hitch gets a short grace period; subsequent severe frames cannot keep renewing it.
    this.#slow = this.#slow * Math.exp(-dt / 0.5)
      + (dt > this.#slowFrame && this.#hold <= 0 ? Math.max(1, dt / this.#slowFrame) : 0);
    this.#calm = dt > this.#slowFrame || this.#hold > 0 ? 0 : this.#calm + dt;
    if (this.#slow > 1.8 && this.#step < STEPS && this.#hold <= 0) {
      this.#step++;
      this.#floor = this.#step;
      this.#barred = this.#sinceRise < BARRED.soon ? BARRED.failed : BARRED.usual;
      // let the frames already queued at the old scale drain before judging again
      this.#hold = HOLD.afterDrop;
      this.#slow = 0;
      this.#calm = 0;
      return true;
    }
    if (this.#calm > CALM && this.#step > this.#floor) {
      this.#step--;
      this.#sinceRise = 0;
      this.#calm = 0;
      return true;
    }
    return false;
  }
}
