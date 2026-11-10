// How much of the canvas the scene is drawn at, from the time between frames alone: the frame rate is what matters, and a
// GPU that cannot keep up shows it there first. It only ever gives ground below the share renderer.ts fixes for the
// device, and takes it back when the frames are easy again; it never reaches past that share, so no probing upward costs
// a dropped frame.
//
// Two slow frames within about half a second lose a step at once. A step comes back after ten seconds with no slow frame,
// and a step that fails soon after it came back stays barred for a minute.

/** The target's frame, seconds: slower than `slow` is a missed frame, and from `stall` on it is a hitch (uploads,
 *  streaming, a collection) that drawing fewer pixels would not cure. */
const FRAME = { slow: 1 / 26, stall: 1 / 13 } as const;
/** Each step is this share of the device's scale, and there are this many below it. */
const STEP = 0.05, STEPS = 7;
const HOLD = { afterHitch: 0.4, afterDrop: 0.6 } as const;
const BARRED = { failed: 60, usual: 15, soon: 8 } as const;
const CALM = 10;

export class Resolution {
  /** Capture runs hold it, so a picture does not depend on how the frames before it went. */
  static held = false;
  readonly #base: number;
  #step = 0;
  #slow = 0;
  #hold = 0;
  #calm = 0;
  #sinceRise = Infinity;
  #floor = 0;
  #barred = 0;

  constructor(base: number) {
    this.#base = base;
  }

  /** The share of the canvas to draw the scene at, each way. */
  get scale(): number {
    return this.#base * (1 - this.#step * STEP);
  }

  /** Takes the seconds since the last frame; true if the scale has changed. */
  frame(dt: number): boolean {
    if (Resolution.held) return false;
    this.#hold -= dt;
    this.#sinceRise += dt;
    this.#barred -= dt;
    if (this.#barred <= 0) this.#floor = 0;
    if (dt >= FRAME.stall) this.#hold = Math.max(this.#hold, HOLD.afterHitch);
    this.#slow = this.#slow * Math.exp(-dt / 0.5) + (dt > FRAME.slow && this.#hold <= 0 ? 1 : 0);
    this.#calm = this.#slow > 0.5 ? 0 : this.#calm + dt;
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
