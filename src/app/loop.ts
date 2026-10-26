import { TICK } from '../sim/state.ts';

export const MAX_CATCH_UP = 6;
const MAX_FRAME = 0.25;
const FRAME_SLACK = 4;

export interface Frame {
  readonly dt: number;
  readonly clock: number;
  readonly alpha: number;
}

export interface Stepper {
  step(): boolean;
}

export class Loop {
  paused = false;
  private away = false;
  speed: number | null = null;
  frameRate: number | null = null;
  rate = 1;
  rush: number | null = null;
  clock = 0;
  readonly perf = { frames: 0, frame: 0, tickMean: 0, tickMax: 0, ticks: 0 };

  private sim: Stepper | null = null;
  private acc = 0;
  private alpha = 1;
  private last: number | null = null;
  private readonly draw: (f: Frame) => void;
  private readonly f = { dt: 0, clock: 0, alpha: 1 };

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
    Object.assign(this.perf, { tickMean: 0, tickMax: 0, ticks: 0 });
  }

  get suspended(): boolean {
    return this.away;
  }

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
    if (this.rush !== null) {
      const until = performance.now() + this.rush;
      do if (!this.step()) return; while (performance.now() < until);
      this.alpha = 1;
      return;
    }
    const budget = this.speed ?? MAX_CATCH_UP;
    if (this.speed === null) this.acc += dt * this.rate;
    let n = 0;
    while (n < budget && (this.speed !== null || this.acc >= TICK)) {
      if (!this.step()) return;
      if (this.speed === null) this.acc -= TICK;
      n++;
    }
    if (this.speed !== null) this.acc = TICK;
    else if (n === budget) this.acc = Math.min(this.acc, TICK);
    this.alpha = this.acc / TICK;
  }

  private step(): boolean {
    const t0 = performance.now();
    if (!this.sim!.step()) {
      this.acc = 0;
      this.alpha = 1;
      return false;
    }
    this.time(performance.now() - t0);
    return true;
  }

  private time(ms: number): void {
    const p = this.perf;
    p.ticks++;
    p.tickMean += (ms - p.tickMean) / p.ticks;
    p.tickMax = Math.max(p.tickMax, ms);
  }
}
