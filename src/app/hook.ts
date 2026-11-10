// window.__portolan: the test hook. Playwright (tools/capture/) drives the game through it:
// jump to a scene, start a seeded match with scripted player input, step the simulation, read the effect log, open
// any screen with its live or fixture model, and read state.
import { Resolution } from '../render/gpu/resolution.ts';
import type { App } from './app.ts';
import type { PlayOptions } from './session.ts';
import type { ScrapId } from '../screens/scraps.ts';
import { BEACON_LOOKS } from '../render/beacons/index.ts';
import { BEACONS, REGIONS, heightAt } from '../sim/world/index.ts';
import { ebbAt, seaLevelAt } from '../sim/environment.ts';
import { beaconView, borderViews, lapPath, nightView, orbitView, regionList, regionView, type SceneInput } from './scenes.ts';
import { shape } from '../render/gpu/shape.ts';
import { MODE_NAMES, OPTION_NAMES, SCORES } from '../sim/captains/brain.ts';
import { LEAF } from '../sim/captains/tree.ts';

const nextFrame = () => new Promise<void>((done) => requestAnimationFrame(() => done()));

export function installHook(app: App) {
  // a capture's pictures do not depend on how the frames before them went
  if (navigator.webdriver) Resolution.held = true;
  const { loop, log } = app;
  const hook = {
    get ready() { return app.ready; },
    get screen() { return app.screen; },
    get clock() { return loop.clock; },
    get tick() { return app.tick; },

    // ── scenes ──
    regions: () => regionList().map(({ id, name }) => ({ id, name })),
    regionView: (id: string | number, k = 0) => regionView(id as never, k),
    nightView: (id: string | number) => nightView(id as never),
    lapPath: (ring: 'equator' | 'north' | 'south', every = 4) => lapPath(ring, every),
    orbitView: (id: string | number) => orbitView(id as never),
    /** The beacon at midnight, framed on how high its look's light shows over the sea where it stands. */
    beaconView: (id: string | number) => {
      const i = typeof id === 'number' ? id : REGIONS.findIndex((r) => r.id === id), look = BEACON_LOOKS[REGIONS[i].id];
      const base = look.ground === 'shore' ? Math.max(0, heightAt(BEACONS[i].pos)) : 0;
      return beaconView(i, base + Math.max(look.lightHeight, 0.6 * look.height));
    },
    borderViews: () => borderViews(),
    /** The tide t seconds into a match, as a scene takes it: { tide, ebb }. */
    tide: (t: number) => ({ tide: seaLevelAt(t), ebb: ebbAt(t) }),
    /** Jumps to a fixed scene: { region | lat,lon | pos, heading, hour, tilt, weather, camera, tide, ebb, ship, fleet }. */
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
    /** Presses what the chart offers to be pressed under `id` as a finger would, down and up at its middle. */
    press: (id: string) => {
      const c = app.chart, p = c?.presses.list.find((q) => q.id === id);
      if (!c || !p) throw new Error(`press: nothing on the chart called ${id}`);
      c.presses.down(-7, p.hit.x, p.hit.y);
      c.presses.up(-7, p.hit.x, p.hit.y);
    },
    /** The full map's window on the planet, or null while it is shut. */
    get mapWindow() { return app.mapWindow; },
    freezeUi: (on: boolean) => app.freezeUi(on),
    scrubUi: (ms: number) => app.scrubUi(ms),
    /** Holds the title as if the world were p loaded, its needle wandering (null lets it be ready). */
    holdTitle: (p: number | null) => { app.titleHold = p; },

    // ── matches ──
    /** Starts a match: { seed, skipGale, autopilot, script: [[tick, input], ...] }. */
    play: (o: PlayOptions = {}) => app.play(o),
    dive: () => app.dive(),
    /** #8's frozen fight: the frame every budget is measured on. */
    fight: () => app.fight(),
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
    /** Gives the player perks by name and weather by kind ('fog', 'rain'...) over the ship. */
    stagePlayer: (o: { perks?: string[]; weather?: string; weapons?: string[] }) => app.stagePlayer(o),
    finish: () => app.finishMatch(),
    matchHash: () => app.matchHash(),
    state: () => app.summary(),
    get sim() { return app.session?.state ?? null; },
    /** How each captain is thinking: its mode, the leaf of its behaviour tree that last acted, and its options' last
     *  weighted scores, best first. */
    minds: () => {
      const st = app.session?.state;
      if (!st) return [];
      return st.ships.map((sh, i) => ({
        ship: i, mode: MODE_NAMES[sh.captain.mode], leaf: LEAF[i] ?? '',
        scores: OPTION_NAMES.map((n, k) => [n, +SCORES[i][k].toFixed(3)] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]),
      }));
    },
    get app() { return app; },

    // ── teaching ──
    /** Turns the teaching scraps on or off (off in capture mode to start); returns the ones shown so far. */
    tips(on?: boolean) {
      if (on !== undefined) app.tips.on = on;
      return app.tips.shown;
    },
    forgetTips: () => app.tips.forget(),
    /** Pins a teaching scrap over the HUD at once, without waiting for its moment. */
    teach: (id: ScrapId | 'hail') => app.teach(id),

    // ── moments ──
    moment: (name: string, seed: number) => app.moment(name, seed),
    momentPlan: () => app.momentPlan(),

    // ── effects and numbers ──
    effects: (since = 0) => log.since(since),
    clearEffects: () => log.clear(),
    /** The region beds playing now, with their gains: the log has a bed only when it starts. */
    beds: () => app.audio.ambience.playing(),
    perf: () => app.perf(),
    flora: () => (app.stage as { flora?: { kinds: unknown } } | null)?.flora?.kinds ?? null,
    measure: (frames: number) => app.measure(frames),
    /** The last frame's shape as the frame log prints it (every pass with `passes`), and the screen's steady frame. */
    shape: (passes = true) => shape.table(app.screen, undefined, passes),
    shapeSteady: () => shape.steady(),
    /** The last timed frame's GPU milliseconds by pass, as { label, system, gpu }; null until one is timed. */
    timed: () => shape.timed?.passes.map((p) => ({ label: p.label, system: p.system, gpu: p.gpu })) ?? null,
    /** The textures the device holds, the heaviest kinds first, and the whole memory line. */
    textures: (top = 40) => `${shape.memory}\n${shape.inventory(top)}`,
  };
  Object.defineProperty(window, '__portolan', { value: hook, configurable: true });
  return hook;
}

export type PortolanHook = ReturnType<typeof installHook>;
