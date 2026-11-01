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
import { Stage, type StageView } from '../render/stage.ts';
import { QUALITY, U } from '../render/engine.ts';
import { sunDirection } from '../render/sky.ts';
import { waveHeight } from '../render/swell.ts';
import { createActors, type Actors } from '../render/actors/index.ts';
import { wornLook } from '../career/index.ts';
import { R } from '../sim/sphere.ts';
import { cosmeticsOf, sceneActors, sceneStage } from './views.ts';
import { lobbyScene, sceneFrom, titleScene, type SceneInput, type SceneSpec } from './scenes.ts';
import { isScreen, MENUS, type MenuName, type ScreenName } from './flow.ts';
import { CareerHolder } from './career.ts';
import { lobbyModel } from './models.ts';
import { Shell, type ScreenView, type Transition } from '../ui/shell.ts';
import { titleScreen, type TitleView } from '../ui/screens/title.ts';
import { lobbyScreen } from '../ui/screens/lobby.ts';
import { page } from '../ui/screens/frame.ts';
import { el, esc } from '../ui/parts/index.ts';
import type { TitleModel } from '../ui/model.ts';

export interface AppOptions {
  /** Capture mode: no title wait, a fresh career that is never saved, and frames drawn only when the hook asks. */
  capture: boolean;
  /** Draw the plain debug globe instead of the planet's renderer. */
  debugStage?: boolean;
}

/** What the app needs of a stage: the planet's renderer, or the debug globe standing in for it. */
export interface AppStage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  frame(v: StageView, dt: number): void;
  resize(): void;
  snap(): void;
  settled(): Promise<void>;
  stats(): { tris: number; calls: number; fps: number; scale: number; chunks: number; pending: number };
}

const VERSION = 'Portolan · pass 1';

export class App {
  readonly log = new EffectLog();
  readonly juice: Juice;
  readonly audio: Audio;
  readonly sound: MomentSound;
  readonly loop: Loop;
  readonly shell: Shell;
  readonly career: CareerHolder;
  stage: AppStage | null = null;
  actors: Actors | null = null;
  readonly overlay: HTMLElement;
  /** The interface's layer, and the juice library's (markers, numbers, flashes) above it. */
  readonly uiLayer: HTMLElement;
  readonly juiceLayer: HTMLElement;
  readonly options: AppOptions;
  screen: ScreenName = 'boot';
  /** The fixed scene on the stage: the lobby's, the title's, or one the hook jumped to. */
  view: SceneSpec = titleScene();
  ready = false;
  /** True while the hook holds a fixed scene: the ship there sails at full speed for its wake. */
  private fixed = false;
  private readonly canvas: HTMLCanvasElement;
  private loaded: Promise<void> | null = null;
  private title: TitleView | null = null;
  private progress = { f: 0, what: 'Charting the seas' };
  private readonly sun = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, options: AppOptions) {
    this.canvas = canvas;
    this.options = options;
    this.overlay = overlay;
    this.uiLayer = layer(overlay, 'app-ui');
    this.juiceLayer = layer(overlay, 'app-juice');
    this.juiceLayer.style.pointerEvents = 'none';
    this.shell = new Shell(this.uiLayer);
    this.juice = new Juice({ hud: this.juiceLayer, seed: 1 });
    this.career = new CareerHolder(options.capture);
    this.loop = new Loop((f) => this.frame(f));
    this.loop.scale = (dt) => this.juice.update(dt);
    this.audio = createAudio();
    this.audio.unlock();
    this.sound = new MomentSound(this.audio, this.log);
    connectUiFeedback((what, sound) => this.log.add('screen', what, sound !== 'none' ? { sound } : undefined), this.juice.haptics, (n) => this.audio.play(n));
    if (options.capture) this.loop.running = false;
    addEventListener('resize', () => this.stage?.resize());
  }

  start(): void {
    this.go(this.options.capture ? 'lobby' : 'title');
    this.loaded = this.load();
  }

  /** Builds the stage and the actors, reporting progress on the title. */
  private async load(): Promise<void> {
    const report = (f: number, what: string) => {
      this.progress = { f: Math.min(0.97, f), what: what || this.progress.what };
      this.title?.setProgress(this.progress.f, this.progress.what);
    };
    const stage: AppStage = this.options.debugStage ? new DebugStage(this.canvas) : await Stage.create(this.canvas, QUALITY.balanced, report);
    this.stage = stage;
    this.actors = createActors(stage.scene, { radius: R, wave: waveHeight, uniforms: U });
    await this.actors.ready;
    stage.snap();
    this.progress = { f: 1, what: 'Ready' };
    this.title?.setProgress(1, 'Ready');
    this.ready = true;
  }

  /** The simulation tick, or -1 outside a match. */
  get tick(): number {
    return -1;
  }

  /** Resolves when the stage has everything it needs for the current view. */
  async whenLoaded(): Promise<void> {
    await this.loaded;
    await this.stage?.settled();
  }

  // ── screens ──

  go(name: ScreenName | string, model?: unknown): void {
    if (!isScreen(name)) throw new RangeError(`go: no screen "${name}"`);
    const from = this.screen;
    this.screen = name;
    this.log.add('flow', 'screen', { from, to: name });
    this.fixed = false;
    if (name === 'title' || name === 'lobby' || (MENUS as readonly string[]).includes(name) || name === 'results') {
      // the lobby's planet: your ship on the water, or the planet from orbit behind the title
      this.view = name === 'title' ? titleScene() : lobbyScene();
    }
    const view = this.screenView(name, model);
    this.title = name === 'title' ? (view as TitleView) : null;
    this.shell.show(name, view, transition(from, name));
  }

  private screenView(name: ScreenName, model?: unknown): ScreenView {
    const career = this.career.career;
    switch (name) {
      case 'title': {
        const m = (model as TitleModel | undefined) ?? { progress: this.progress.f, status: this.progress.what, version: VERSION };
        return titleScreen(m, { onStart: () => this.go('lobby') });
      }
      case 'lobby':
        return lobbyScreen((model as never) ?? lobbyModel(career), { onPlay: () => this.play({}), onOpen: (m) => this.go(m) });
      default:
        return this.placeholder(name);
    }
  }

  /** A screen still being built: its frame, its name, and a way back. */
  private placeholder(name: ScreenName): ScreenView {
    const back = (MENUS as readonly string[]).includes(name) || name === 'results' ? 'lobby' : null;
    const p = page({ title: name[0].toUpperCase() + name.slice(1), onBack: back ? () => this.go(back) : undefined });
    el('s-page__note', p.body, esc(`The ${name} screen is not built yet.`));
    return p;
  }

  /** Jumps to a fixed scene, leaving any match. */
  scene(input: SceneInput): SceneSpec {
    const s = sceneFrom(input);
    this.view = s;
    this.fixed = true;
    this.stage?.snap();
    this.shell.show('scene', { el: el('s-empty') }, 'none');
    return s;
  }

  // ── matches (wired when the simulation lands) ──
  session: { state: unknown } | null = null;
  play(_o: unknown): void {
    this.shell.toasts.show({ icon: '', text: 'Matches arrive in the next step.' });
  }
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
    return { ...this.loop.perf, ...(this.stage?.stats() ?? {}) };
  }

  /** Draws `frames` frames as fast as the page allows and reports frame times, triangles and draw calls. */
  async measure(frames: number) {
    await this.whenLoaded();
    const times: number[] = [];
    let tris = 0, calls = 0;
    for (let i = 0; i < frames; i++) {
      const t0 = performance.now();
      this.loop.drawNow(1 / 30);
      await new Promise((r) => requestAnimationFrame(r));
      times.push(performance.now() - t0);
      const st = this.stage!.stats();
      tris = Math.max(tris, st.tris);
      calls = Math.max(calls, st.calls);
    }
    times.sort((a, b) => a - b);
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    return { frameMs: +mean.toFixed(2), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), tris, calls };
  }

  private frame(f: Frame): void {
    this.log.clock = f.clock;
    const stage = this.stage, actors = this.actors;
    if (!stage || !actors) return;
    const v = this.view, sv = sceneStage(v, f.clock);
    sunDirection(sv.hour, sv.tilt, this.sun);
    const look = cosmeticsOf(wornLook(this.career.career));
    actors.update(sceneActors(v, f.clock, this.sun, look, v.camera === 'chase' && this.fixed ? 14.5 : 0), f.dt, stage.camera);
    stage.frame(sv, f.dt);
  }
}

/** How one screen gives way to the next. */
function transition(from: ScreenName, to: ScreenName): Transition {
  if (from === 'boot') return 'fade';
  if (from === 'title') return 'zoom';
  if ((MENUS as readonly string[]).includes(to)) return 'push';
  if ((MENUS as readonly MenuName[]).includes(from as MenuName) && to === 'lobby') return 'pop';
  return 'fade';
}

function layer(parent: HTMLElement, cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.style.cssText = 'position:fixed;inset:0;';
  parent.append(d);
  return d;
}
