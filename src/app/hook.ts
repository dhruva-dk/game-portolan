// window.__portolan: the test hook. Playwright (tests/smoke.test.ts and tests/capture/) drives the game through it:
// jump to a scene, start a seeded match with scripted player input, step the simulation, read the effect log, open
// any screen with its live or fixture model, and read state.
import type { App } from './app.ts';
import type { PlayOptions } from './session.ts';
import { borderViews, lapPath, orbitView, regionList, regionView, type SceneInput } from './scenes.ts';

const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

export function installHook(app: App) {
  const { loop, log } = app;
  const hook = {
    get ready() { return app.ready; },
    get screen() { return app.screen; },
    get clock() { return loop.clock; },
    get tick() { return app.tick; },

    // ── scenes ──
    regions: () => regionList().map(({ id, name }) => ({ id, name })),
    regionView: (id: string | number, k = 0) => regionView(id as never, k),
    lapPath: (ring: 'equator' | 'north' | 'south', every = 4) => lapPath(ring, every),
    orbitView: (id: string | number) => orbitView(id as never),
    borderViews: () => borderViews(),
    /** Jumps to a fixed scene: { region | lat,lon | pos, heading, hour, tilt, weather, camera, tide, ship }. */
    scene: (s: SceneInput) => app.scene(s),
    /** Draws `frames` frames, then waits until the page has presented the last one. */
    async settle(frames = 4) {
      // a still frame first, so the view asks for what it needs before the wait
      if (!loop.running) loop.drawNow(0);
      await app.whenLoaded();
      for (let i = 0; i < frames; i++) {
        if (!loop.running) loop.drawNow(1 / 30);
        await nextFrame();
      }
      await nextFrame();
    },
    /** Draws `seconds` of 30 fps frames back to back, so whatever the frames drive (juice, cameras) plays out. */
    async run(seconds: number) {
      for (let i = 0; i < Math.round(seconds * 30); i++) loop.drawNow(1 / 30);
      await nextFrame();
    },
    /** Draws one frame of dt seconds now (stepping the match in real time). */
    async draw(dt = 1 / 30) {
      loop.drawNow(dt);
      await nextFrame();
    },

    // ── screens ──
    go: (name: string, model?: unknown) => app.go(name, model),
    freezeUi: (on: boolean) => app.freezeUi(on),
    scrubUi: (ms: number) => app.scrubUi(ms),

    // ── matches ──
    /** Starts a match: { seed, skipGale, autopilot, script: [[tick, input], ...] }. */
    play: (o: PlayOptions = {}) => app.play(o),
    dive: () => app.dive(),
    /** Steps n ticks now, without drawing; returns how many ran. */
    step: (n: number) => app.stepTicks(n),
    /** Steps n ticks, then draws one frame of n ticks' time. */
    async stepAndDraw(n: number) {
      app.stepTicks(n);
      loop.drawNow(n / 30);
      await nextFrame();
    },
    setSpeed: (n: number | null) => { loop.speed = n; },
    setPaused: (p: boolean) => { loop.paused = p; },
    setRunning: (r: boolean) => { loop.running = r; },
    /** Sinks the player's ship: by ship `by` (none by default) with `how` ('cannon', 'ram', 'storm'...). */
    sinkPlayer: (by?: number, how?: string) => app.sinkPlayer(by, how),
    winPlayer: () => app.winPlayer(),
    finish: () => app.finishMatch(),
    matchHash: () => app.matchHash(),
    state: () => app.summary(),
    get sim() { return app.session?.state ?? null; },
    get app() { return app; },

    // ── moments ──
    moment: (name: string, seed: number) => app.moment(name, seed),
    momentPlan: () => app.momentPlan(),

    // ── effects and numbers ──
    effects: (since = 0) => log.since(since),
    clearEffects: () => log.clear(),
    perf: () => app.perf(),
    measure: (frames: number) => app.measure(frames),
  };
  Object.defineProperty(window, '__portolan', { value: hook, configurable: true });
  return hook;
}

export type PortolanHook = ReturnType<typeof installHook>;
