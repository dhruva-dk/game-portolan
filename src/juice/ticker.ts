// One frame loop for the DOM animations (presses, pops, count-ups, flights). It runs itself on requestAnimationFrame,
// or, set to manual, waits to be stepped, so capture tools get the same frames every run.

export type TickFn = (dt: number) => boolean | void;

class Ticker {
  /** Real seconds this ticker has run. */
  time = 0;
  private readonly fns = new Set<TickFn>();
  private manualMode = false;
  private raf = 0;
  private last = 0;

  get manual(): boolean {
    return this.manualMode;
  }

  /** Manual: nothing moves until `step` is called. Used by frame-strip capture. */
  set manual(on: boolean) {
    this.manualMode = on;
    if (on) this.stop();
    else this.start();
  }

  /** Runs `fn(dt)` every frame until it returns false or the returned remover is called. */
  add(fn: TickFn): () => void {
    this.fns.add(fn);
    this.start();
    return () => this.fns.delete(fn);
  }

  step(dt: number): void {
    this.time += dt;
    for (const fn of [...this.fns]) if (fn(dt) === false) this.fns.delete(fn);
  }

  get busy(): number {
    return this.fns.size;
  }

  private start(): void {
    if (this.manualMode || this.raf || typeof requestAnimationFrame === 'undefined' || !this.fns.size) return;
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.step(dt);
      this.raf = this.fns.size && !this.manualMode ? requestAnimationFrame(loop) : 0;
    };
    this.raf = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.raf && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}

export const ticker = new Ticker();
