// The app: one canvas for the planet, one layer for the interface, the frame loop, and the flow between screens.
// Each part (stage, actors, interface, sound, career, simulation) is reached through an adapter in this folder.
import * as THREE from 'three';
import { Juice } from '../juice/index.ts';
import { createAudio, type Audio } from '../audio/index.ts';
import { EffectLog } from './effects.ts';
import { MomentSound } from './sounds.ts';
import { connectUiFeedback } from './uiFeedback.ts';
import { Loop, type Frame } from './loop.ts';
import { DebugStage } from './debugStage.ts';
import { sceneFrom, sunFor, type SceneInput, type SceneSpec } from './scenes.ts';
import { isScreen, type ScreenName } from './flow.ts';

export interface AppOptions {
  /** Capture mode: no title wait, a fresh career that is never saved, and frames drawn only when the hook asks. */
  capture: boolean;
}

export class App {
  readonly log = new EffectLog();
  readonly juice: Juice;
  readonly audio: Audio;
  readonly sound: MomentSound;
  readonly loop: Loop;
  readonly stage: DebugStage;
  readonly overlay: HTMLElement;
  readonly options: AppOptions;
  screen: ScreenName = 'boot';
  /** The fixed scene the hook jumped to, if any. */
  view: SceneSpec | null = null;
  ready = false;

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, options: AppOptions) {
    this.options = options;
    this.overlay = overlay;
    this.juice = new Juice({ hud: overlay, seed: 1 });
    this.stage = new DebugStage(canvas);
    this.loop = new Loop((f) => this.frame(f));
    this.loop.scale = (dt) => this.juice.update(dt);
    this.audio = createAudio();
    this.audio.unlock();
    this.sound = new MomentSound(this.audio, this.log);
    connectUiFeedback((what, sound) => this.log.add('screen', what, sound !== 'none' ? { sound } : undefined), this.juice.haptics, (n) => this.audio.play(n));
    if (options.capture) this.loop.running = false;
    addEventListener('resize', () => this.stage.resize());
  }

  start(): void {
    this.go(this.options.capture ? 'lobby' : 'title');
    this.ready = true;
  }

  /** The simulation tick, or -1 outside a match. */
  get tick(): number {
    return -1;
  }

  /** Resolves when the stage has everything it needs for the current view. */
  async whenLoaded(): Promise<void> {}

  go(name: ScreenName | string, _model?: unknown): void {
    if (!isScreen(name)) throw new RangeError(`go: no screen "${name}"`);
    const from = this.screen;
    this.screen = name;
    this.log.add('flow', 'screen', { from, to: name });
    this.renderOverlay();
  }

  /** Jumps to a fixed scene, leaving any match. */
  scene(input: SceneInput): SceneSpec {
    const s = sceneFrom(input);
    this.view = s;
    const sun = sunFor(s.pos, s.hour, s.tilt);
    this.stage.setScene(s, new THREE.Vector3(sun.x, sun.y, sun.z));
    this.overlay.replaceChildren();
    return s;
  }

  // ── matches (wired when the simulation lands) ──
  session: { state: unknown } | null = null;
  play(_o: unknown): void { throw new Error('play: no simulation yet'); }
  dive(): void {}
  stepTicks(n: number): number { return this.loop.advanceTicks(n); }
  sinkPlayer(): void {}
  winPlayer(): void {}
  finishMatch(): void {}
  matchHash(): string | null { return null; }
  summary(): unknown { return { screen: this.screen }; }
  moment(_name: string, _seed: number): void { throw new Error('moment: no simulation yet'); }
  momentPlan(): unknown { return null; }

  // ── interface capture: pause every running animation and scrub them together ──
  private frozen: Animation[] = [];
  freezeUi(on: boolean): void {
    if (on) {
      this.frozen = document.getAnimations();
      for (const a of this.frozen) a.pause();
    } else {
      for (const a of this.frozen) a.play();
      this.frozen = [];
    }
  }

  scrubUi(ms: number): void {
    for (const a of this.frozen) {
      const t = a.effect?.getComputedTiming(), end = Number(t?.endTime ?? ms);
      a.currentTime = Math.min(ms, Number.isFinite(end) ? end : ms);
    }
  }

  // ── numbers ──
  perf() {
    return { ...this.loop.perf, ...this.stage.stats() };
  }

  /** Draws `frames` frames as fast as the page allows and reports frame times, triangles and draw calls. */
  async measure(frames: number) {
    const times: number[] = [];
    let tris = 0, calls = 0;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      this.loop.drawNow(1 / 30);
      await new Promise((r) => requestAnimationFrame(r));
      times.push(performance.now() - t0);
      const st = this.stage.stats();
      tris = Math.max(tris, st.tris);
      calls = Math.max(calls, st.calls);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return { frameMs: +mean.toFixed(2), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), tris, calls };
  }

  private frame(f: Frame): void {
    this.log.clock = f.clock;
    this.stage.render();
  }

  private renderOverlay(): void {
    // placeholder screens until the interface lands
    const o = this.overlay;
    o.replaceChildren();
    const panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;left:24px;top:24px;padding:16px 20px;background:#f3e7cc;border-radius:12px;font:600 20px system-ui;color:#2b2118';
    panel.textContent = this.screen;
    o.append(panel);
  }
}
