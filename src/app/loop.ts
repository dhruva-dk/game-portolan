// The frame loop: the simulation steps at a fixed 30 Hz, and every animation frame draws once, with `alpha` saying how
// far the clock has run between the last tick and the next, so rendering can interpolate.
// Ported from the old game's loop (2025e68:src/app/loop.ts), plus hit-stop: a short hold that freezes the
// simulation and slows the drawn clock, for the juice of big hits.

export const TICK = 1 / 30;
export const MAX_CATCH_UP = 6;
const MAX_FRAME = 0.25;
const FRAME_SLACK = 4;

export interface Frame {
  /** Seconds since the last frame, after hit-stop. */
  readonly dt: number;
  /** Seconds since the last frame, ignoring hit-stop (for interface motion). */
  readonly realDt: number;
  /** The loop's own clock, in seconds; it stops while paused. */
  readonly clock: number;
  /** How far between the last tick and the next, 0…1. */
  readonly alpha: number;
}

export interface Stepper {
  /** Advances one tick; false when there is nothing left to step. */
  step(): boolean;
}

export class Loop {
  paused = false;
  /** Fixed ticks per frame instead of real time (tests and captures). */
  speed: number | null = null;
  frameRate: number | null = null;
  /** Real-time multiplier. */
  rate = 1;
  /** Milliseconds of stepping per frame while skipping ahead. */
  rush: number | null = null;
  /** When false, the loop draws only when asked (captures drive it frame by frame). */
  running = true;
  clock = 0;
  readonly perf = { frames: 0, frame: 0, frameMean: 0, tickMean: 0, tickMax: 0, ticks: 0 };

  private away = false;
  private sim: Stepper | null = null;
  private acc = 0;
  private alpha = 1;
  private last: number | null = null;
  private stop = 0;
  private readonly draw: (f: Frame) => void;
  private readonly f = { dt: 0, realDt: 0, clock: 0, alpha: 1 };

  constructor(draw: (f: Frame) => void) {
    this.draw = draw;
    requestAnimationFrame(this.frame);
  }

  run(sim: Stepper | null): void {
    this.sim = sim;
    this.acc = 0;
    this.alpha = 1;
    this.rate = 1;
    this.rush = null;
    this.stop = 0;
    Object.assign(this.perf, { tickMean: 0, tickMax: 0, ticks: 0 });
  }

  get stepping(): boolean {
    return this.sim !== null;
  }

  get suspended(): boolean {
    return this.away;
  }

  set suspended(away: boolean) {
    this.away = away;
    this.last = null;
  }

  /** Hit-stop: freeze the simulation for `seconds` (the longest asked for wins). */
  hold(seconds: number): void {
    this.stop = Math.max(this.stop, seconds);
  }

  get held(): number {
    return this.stop;
  }

  /** Steps the simulation n ticks now, without drawing (tests and captures). */
  advanceTicks(n: number): number {
    let done = 0;
    while (done < n && this.sim && this.tick()) done++;
    this.alpha = 1;
    return done;
  }

  /** Draws one frame of `dt` seconds now, stepping the simulation in real time (captures). */
  drawNow(dt: number): void {
    this.pass(dt);
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    if (!this.running) {
      this.last = null;
      return;
    }
    if (this.frameRate !== null && this.last !== null && now - this.last < 1000 / this.frameRate - FRAME_SLACK) return;
    const dt = this.last === null ? 0 : Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    this.pass(dt);
    const p = this.perf, ms = performance.now() - now;
    p.frames++;
    p.frame = ms;
    p.frameMean += (ms - p.frameMean) / Math.min(p.frames, 120);
  };

  private pass(realDt: number): void {
    let dt = realDt;
    if (this.paused || this.away) dt = 0;
    else if (this.stop > 0) {
      // the world holds its breath: no ticks, and the drawn clock crawls
      this.stop = Math.max(0, this.stop - realDt);
      dt = realDt * 0.05;
    } else {
      this.clock += dt;
      if (this.sim) this.advance(dt);
    }
    const f = this.f;
    f.dt = dt;
    f.realDt = this.paused || this.away ? 0 : realDt;
    f.clock = this.clock;
    f.alpha = this.alpha;
    this.draw(f);
  }

  private advance(dt: number): void {
    if (this.rush !== null) {
      const until = performance.now() + this.rush;
      do if (!this.tick()) return; while (performance.now() < until);
      this.alpha = 1;
      return;
    }
    const budget = this.speed ?? MAX_CATCH_UP;
    if (this.speed === null) this.acc += dt * this.rate;
    let n = 0;
    while (n < budget && (this.speed !== null || this.acc >= TICK)) {
      if (!this.tick()) return;
      if (this.speed === null) this.acc -= TICK;
      n++;
    }
    if (this.speed !== null) this.acc = TICK;
    else if (n === budget) this.acc = Math.min(this.acc, TICK);
    this.alpha = this.acc / TICK;
  }

  private tick(): boolean {
    const t0 = performance.now();
    if (!this.sim!.step()) {
      this.acc = 0;
      this.alpha = 1;
      return false;
    }
    const p = this.perf, ms = performance.now() - t0;
    p.ticks++;
    p.tickMean += (ms - p.tickMean) / p.ticks;
    p.tickMax = Math.max(p.tickMax, ms);
    return true;
  }
}
