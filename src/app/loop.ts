// The frame loop. The match advances in fixed TICK steps paid for out of an accumulator of real time, at most
// MAX_CATCH_UP a frame, so after a stall the match slows instead of spiralling; the simulation never sees the
// frame time. Frames draw between the last two ticks at the interpolation alpha. The render clock that world
// animations read stops while the match is paused (the chart is open) or the app is in the background, so spray
// hangs and smoke stands still. Rendering reads the match and never feeds back into it.
import { TICK } from '../sim/state.ts';

/** Most ticks stepped in one frame: 0.2 s of match time. */
export const MAX_CATCH_UP = 6;
/** A longer gap between frames is a stall (a debugger, the background), not time to make up. */
const MAX_FRAME = 0.25;
/** Slack when holding a test frame rate, ms: a quarter of a 60 Hz display frame. */
const FRAME_SLACK = 4;

/** One frame to draw. */
export interface Frame {
  /** Wall seconds since the last frame drawn, capped at MAX_FRAME. */
  readonly dt: number;
  /** The render clock, seconds: it stops while the match is paused or the app is in the background. */
  readonly clock: number;
  /** How far the frame lies from the previous tick toward the current one, 0–1. */
  readonly alpha: number;
}

/** What the loop advances: one tick per call, false once the match goes no further. */
export interface Stepper {
  step(): boolean;
}

export class Loop {
  /** The chart is open: no ticks, the render clock stops. */
  paused = false;
  /** The app is in the background: no ticks, the render clock stops. */
  private away = false;
  /** Tests: exactly this many ticks every frame instead of real time; null for real time. */
  speed: number | null = null;
  /** Tests: draw at most this many frames a second; null for every display frame. */
  frameRate: number | null = null;
  clock = 0;
  /** Frames drawn, main-thread milliseconds of the last one, and the ticks of the current match and their times. */
  readonly perf = { frames: 0, frame: 0, tickMean: 0, tickMax: 0, ticks: 0 };

  private sim: Stepper | null = null;
  private acc = 0;
  private alpha = 1;
  private last: number | null = null;
  private readonly draw: (f: Frame) => void;
  private readonly f = { dt: 0, clock: 0, alpha: 1 }; // one Frame, refilled every frame

  constructor(draw: (f: Frame) => void) {
    this.draw = draw;
    requestAnimationFrame(this.frame);
  }

  /** Step this match from the next frame on (null: none), from a whole tick. */
  run(sim: Stepper | null): void {
    this.sim = sim;
    this.acc = 0;
    this.alpha = 1;
    Object.assign(this.perf, { tickMean: 0, tickMax: 0, ticks: 0 });
  }

  get suspended(): boolean {
    return this.away;
  }

  /** Into the background (true) or back (false). The time away is not made up. */
  set suspended(away: boolean) {
    this.away = away;
    this.last = null;
  }

  private readonly frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    if (this.frameRate !== null && this.last !== null && now - this.last < 1000 / this.frameRate - FRAME_SLACK) return;
    const dt = this.last === null ? 0 : Math.min((now - this.last) / 1000, MAX_FRAME);
    this.last = now;
    if (!this.paused && !this.away) {
      this.clock += dt;
      if (this.sim) this.advance(dt);
    }
    const f = this.f;
    f.dt = dt;
    f.clock = this.clock;
    f.alpha = this.alpha;
    this.draw(f);
    this.perf.frames++;
    this.perf.frame = performance.now() - now;
  };

  private advance(dt: number): void {
    const budget = this.speed ?? MAX_CATCH_UP;
    if (this.speed === null) this.acc += dt;
    let n = 0;
    while (n < budget && (this.speed !== null || this.acc >= TICK)) {
      const t0 = performance.now();
      if (!this.sim!.step()) {
        this.acc = 0;
        this.alpha = 1;
        return;
      }
      this.time(performance.now() - t0);
      if (this.speed === null) this.acc -= TICK;
      n++;
    }
    if (this.speed !== null) this.acc = TICK;
    else if (n === budget) this.acc = Math.min(this.acc, TICK); // what could not be made up is dropped
    this.alpha = this.acc / TICK;
  }

  private time(ms: number): void {
    const p = this.perf;
    p.ticks++;
    p.tickMean += (ms - p.tickMean) / p.ticks;
    p.tickMax = Math.max(p.tickMax, ms);
  }
}
