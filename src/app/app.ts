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
import { PHASE, PLAYER, SHIPS } from '../sim/match.ts';
import type { V3 } from '../sim/math.ts';
import type { CameraRig } from '../render/camera.ts';
import { Controls } from './controls.ts';
import { Session, type PlayOptions } from './session.ts';
import { MomentJuice, type Viewer } from './juice.ts';
import { actorEvent } from './moments.ts';
import type { Moment } from './events.ts';
import { deathModel, galeModel, hudModel, resultsModel, spectateModel, victoryModel } from './matchModels.ts';
import { cosmeticsOf, sceneActors, sceneStage } from './views.ts';
import { lobbyScene, sceneFrom, titleScene, type SceneInput, type SceneSpec } from './scenes.ts';
import { isScreen, MENUS, type MenuName, type ScreenName } from './flow.ts';
import { CareerHolder } from './career.ts';
import { lobbyModel } from './models.ts';
import { Shell, type ScreenView, type Transition } from '../ui/shell.ts';
import { titleScreen, type TitleView } from '../ui/screens/title.ts';
import { lobbyScreen } from '../ui/screens/lobby.ts';
import { page } from '../ui/screens/frame.ts';
import {
  deathScreen, galeScreen, hudScreen, resultsScreen, spectateScreen, victoryScreen, type GaleView, type HudView, type SpectateView,
} from '../ui/screens/match.ts';
import { el, esc } from '../ui/parts/index.ts';
import type { DeathModel, GaleModel, HudModel, ResultsModel, SpectateModel, TitleModel, VictoryModel } from '../ui/model.ts';

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
  /** The planet's camera rig and its after-placement hook; the debug globe has neither. */
  readonly rig?: CameraRig;
  onCamera?: ((cam: THREE.PerspectiveCamera) => void) | null;
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
  /** Thumbs, mouse and keys in a match, on a layer under the interface. */
  readonly controls: Controls;
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
    this.controls = new Controls(layer(overlay, 'app-touch'));
    this.controls.on = false;
    this.uiLayer = layer(overlay, 'app-ui');
    // only the screens' own parts take touches: the rest fall through to the controls beneath
    this.uiLayer.style.pointerEvents = 'none';
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
    this.momentJuice = new MomentJuice(this.juice, this.viewer);
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
    // the juice's shake and kicks ride on the camera the rig placed
    stage.onCamera = (cam) => {
      this.juice.applyCamera(cam, cam.fov);
      cam.updateMatrixWorld();
    };
    this.actors = createActors(stage.scene, { radius: R, wave: waveHeight, uniforms: U });
    await this.actors.ready;
    stage.snap();
    this.progress = { f: 1, what: 'Ready' };
    this.title?.setProgress(1, 'Ready');
    this.ready = true;
  }

  /** The simulation tick, or -1 outside a match. */
  get tick(): number {
    return this.session?.state.tick ?? -1;
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
        return this.matchView(name, model) ?? this.placeholder(name);
    }
  }

  /** The screens over a match, from the live session or a model the hook hands in; null when there is neither. */
  private matchView(name: ScreenName, model?: unknown): ScreenView | null {
    const s = this.session;
    this.hud = null;
    this.galeView = null;
    this.spec = null;
    switch (name) {
      case 'gale': {
        if (!model && !s) return null;
        const v = galeScreen((model as GaleModel) ?? galeModel(s!), { onDive: () => this.tap('dive') });
        this.galeView = v;
        return v;
      }
      case 'match': {
        if (!model && !s) return null;
        const v = hudScreen((model as HudModel) ?? hudModel(s!), {
          press: (w, d) => this.controls.press(w, d), pick: (k) => this.controls.pick(k), target: (n, e) => this.juice.target(n, e),
        });
        this.hud = v;
        return v;
      }
      case 'death':
        if (!model && !s) return null;
        return deathScreen((model as DeathModel) ?? deathModel(s!), { onSpectate: () => this.go('spectate'), onLeave: () => this.finishMatch() });
      case 'spectate': {
        if (!model && !s) return null;
        const v = spectateScreen((model as SpectateModel) ?? spectateModel(s!, wornLook(this.career.career)), { onLeave: () => this.finishMatch() });
        this.spec = v;
        return v;
      }
      case 'victory':
        if (!model && !s) return null;
        return victoryScreen((model as VictoryModel) ?? victoryModel(s!), { onContinue: () => this.finishMatch() });
      case 'results':
        return model ? resultsScreen(model as ResultsModel, { onDone: () => this.go('lobby') }) : null;
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
    if (this.session) this.leaveMatch();
    const s = sceneFrom(input);
    this.view = s;
    this.fixed = true;
    this.stage?.snap();
    this.shell.show('scene', { el: el('s-empty') }, 'none');
    return s;
  }

  // ── matches ──

  session: Session | null = null;
  private readonly momentJuice: MomentJuice;
  private hud: HudView | null = null;
  private galeView: GaleView | null = null;
  private spec: SpectateView | null = null;
  /** Seconds until the HUD's next refresh: it redraws a few times a second, not every frame. */
  private hudT = 0;
  private readonly eye = { x: 0, y: 0, z: 0 };
  private readonly ndc = new THREE.Vector3();
  /** Where the juice sees from: the camera, and the ship the player watches. */
  private readonly viewer: Viewer = {
    me: PLAYER,
    eye: this.eye,
    project: (p) => this.project(p),
    bearing: (p) => this.bearing(p),
  };

  /** Starts a match from the career's plan: the Gale, or (skipGale) already at sea. */
  play(o: PlayOptions = {}): void {
    if (this.session) this.leaveMatch();
    const s = new Session(this.career.plan(), cosmeticsOf(wornLook(this.career.career)), o);
    s.onMoment = (m) => this.onMoment(m);
    this.session = s;
    this.viewer.me = this.sound.me = PLAYER;
    this.log.tick = s.state.tick;
    this.log.add('flow', 'match', { seed: s.state.seed, skipGale: !!o.skipGale, autopilot: !!o.autopilot });
    this.loop.run(s);
    this.controls.on = true;
    if (this.stage?.rig) this.stage.rig.follow = 9;
    this.stage?.snap();
    this.go(s.me.phase === PHASE.gale ? 'gale' : 'match');
  }

  /** A tap on a control: pressed and let go at once, read as one edge. */
  private tap(what: 'dive' | 'gust' | 'take'): void {
    this.controls.press(what, true);
    this.controls.press(what, false);
  }

  private onMoment(m: Moment): void {
    const s = this.session;
    if (!s) return;
    this.log.tick = s.state.tick;
    const ev = actorEvent(m, s.state.whale.head);
    if (ev) this.actors?.fire([ev]);
    this.momentJuice.react(m);
    this.sound.react(m);
  }

  /** Leaves the Gale now. */
  dive(): void {
    this.session?.dive();
  }

  stepTicks(n: number): number {
    return this.loop.advanceTicks(n);
  }

  sinkPlayer(): void {
    this.session?.sinkNow([PLAYER]);
  }

  /** Sinks every other ship: the player wins. */
  winPlayer(): void {
    const s = this.session;
    if (!s) return;
    const rest: number[] = [];
    for (let i = 0; i < SHIPS; i++) if (i !== PLAYER && s.state.ships[i].phase !== PHASE.sunk) rest.push(i);
    s.sinkNow(rest);
  }

  /** Ends the match where it stands: the career takes the report, and the results show what changed. */
  finishMatch(): void {
    const s = this.session;
    if (!s) return;
    const report = s.tally.report(s.plan.fleet.map((e) => e.captain), (i) => s.standing(i));
    const changes = this.career.apply(report), mine = report.ships[PLAYER];
    this.log.add('flow', 'finish', { place: changes.place, kills: changes.kills, xp: changes.xp.total, tick: s.state.tick });
    this.leaveMatch();
    this.go('results', resultsModel(changes, this.career.career, { damage: mine.damage, survived: mine.survived }));
  }

  private leaveMatch(): void {
    this.session = null;
    this.loop.run(null);
    this.controls.on = false;
    this.sound.clear();
    this.juice.clear();
    this.hud = this.galeView = this.spec = null;
    this.log.tick = -1;
    if (this.stage?.rig) Object.assign(this.stage.rig, { follow: 2.2, pitch: 0.2, dist: 27 });
    this.stage?.snap();
  }

  matchHash(): string | null {
    return this.session?.hash() ?? null;
  }

  /** The match as the hook reads it: screen, tick, the player's ship and the fleet. */
  summary(): unknown {
    const s = this.session;
    if (!s) return { screen: this.screen, tick: -1 };
    const me = s.me;
    return {
      screen: this.screen, tick: s.state.tick, seconds: +s.seconds.toFixed(2), over: s.over, winner: s.state.winner, watch: s.watch,
      afloat: s.state.ships.filter((x) => x.phase !== PHASE.sunk).length,
      me: { phase: me.phase, hull: +me.hull.toFixed(1), shield: +me.shield.toFixed(1), kills: me.kills, coins: Math.floor(me.coins), sel: me.sel },
    };
  }

  moment(_name: string, _seed: number): void { throw new Error('moment: not built yet'); }
  momentPlan(): unknown { return null; }

  /** Where a world point lands on the interface, in CSS pixels, or null behind the camera. */
  private project(p: V3): { x: number; y: number } | null {
    const cam = this.stage?.camera;
    if (!cam) return null;
    const v = this.ndc.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse);
    if (v.z > 0) return null;
    v.applyMatrix4(cam.projectionMatrix);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }

  /** Radians clockwise from straight ahead, as the camera sees a world point. */
  private bearing(p: V3): number {
    const cam = this.stage?.camera;
    if (!cam) return 0;
    const v = this.ndc.set(p.x, p.y, p.z).applyMatrix4(cam.matrixWorldInverse);
    return Math.atan2(v.x, -v.z);
  }

  /** One frame of a match: the controls into the session, the actors and the planet drawn, the screens kept in step. */
  private matchFrame(s: Session, f: Frame, stage: AppStage, actors: Actors): void {
    this.log.tick = s.state.tick;
    s.control(this.controls.read(), f.realDt);
    if (stage.rig) {
      // high up, the planet curves away below the horizon: the boom tips down and lengthens to keep the sea in view
      const alt = Math.max(0, s.state.ships[s.watch].alt), dip = Math.acos(R / (R + alt));
      stage.rig.pitch = Math.max(s.pitch, Math.min(1.05, dip * 0.9 + 0.1));
      stage.rig.dist = 27 + alt * 0.08;
    }
    s.sun(this.sun);
    actors.update(s.actorsView(f.clock, f.alpha, this.sun), f.dt, stage.camera);
    stage.frame(s.stageView(f.clock, f.alpha), f.dt);
    const c = stage.camera.position;
    this.eye.x = c.x;
    this.eye.y = c.y;
    this.eye.z = c.z;
    this.viewer.me = this.sound.me = s.watch;
    this.follow(s);
    this.hudT -= f.realDt;
    if (this.hudT <= 0 || !this.loop.running) {
      this.hudT = 1 / 12;
      if (this.hud && this.session === s) this.hud.set(hudModel(s));
      if (this.galeView && this.session === s) this.galeView.set(galeModel(s));
      if (this.spec && this.session === s) this.spec.set(spectateModel(s, wornLook(this.career.career)));
    }
  }

  /** Moves between the match's screens as the player's ship leaves the Gale, sinks, or wins. */
  private follow(s: Session): void {
    const me = s.me, at = this.screen;
    if (s.over && s.state.winner === PLAYER && (at === 'match' || at === 'gale')) this.go('victory');
    else if (me.phase === PHASE.sunk && (at === 'match' || at === 'gale')) this.go('death');
    else if (at === 'gale' && me.phase !== PHASE.gale) this.go('match');
    else if (s.over && at === 'spectate') this.finishMatch();
  }

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
    if (this.session) {
      this.matchFrame(this.session, f, stage, actors);
      return;
    }
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
