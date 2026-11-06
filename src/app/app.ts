// The app: one canvas for the planet, one layer for the interface, the frame loop, and the flow between screens.
// Each part (stage, actors, interface, sound, career, simulation) is reached through an adapter in this folder.
import * as THREE from 'three';
import { Juice } from '../juice/index.ts';
import { createAudio, type AmbienceMix, type Audio } from '../audio/index.ts';
import { EffectLog } from './effects.ts';
import { MomentSound } from './sounds.ts';
import { connectUiFeedback } from './uiFeedback.ts';
import { Loop, type Frame } from './loop.ts';
import { DebugStage } from './debugStage.ts';
import { Stage, type StageView } from '../render/stage.ts';
import { GpuStage } from '../render/gpu/stage.ts';
import { QUALITY, U } from '../render/engine.ts';
import { sunDirection } from '../render/sky.ts';
import { waveHeight } from '../render/swell.ts';
import { createActors, type Actors } from '../render/actors/index.ts';
import { rockTexturesReady } from '../render/rocks/index.ts';
import { equipAbility, equipCosmetic, wornLook, type Career } from '../career/index.ts';
import { R, TERRITORY, cellOf } from '../sim/sphere.ts';
import { PHASE, PLAYER, SHIPS, WEATHER_KIND, landmarkHold } from '../sim/match.ts';
import { WEATHER } from '../sim/tables.ts';
import { REGIONS } from '../sim/world/index.ts';
import type { V3 } from '../sim/math.ts';
import type { CameraRig } from '../render/camera.ts';
import { Controls } from './controls.ts';
import { Session, type PlayOptions } from './session.ts';
import { MomentJuice, type Viewer } from './juice.ts';
import { MOMENTS, actorEvent, causeOf, daylight, type MomentScript } from './moments.ts';
import type { Moment } from './events.ts';
import { deathModel, galeModel, hudModel, resultsModel, spectateModel, victoryModel } from './matchModels.ts';
import { cosmeticsOf, sceneActors, sceneHearing, sceneStage } from './views.ts';
import { lobbyScene, sceneFrom, titleScene, type SceneInput, type SceneSpec } from './scenes.ts';
import { isScreen, MENUS, type MenuName, type ScreenName } from './flow.ts';
import { CareerHolder } from './career.ts';
import { abilitiesModel, careerModel, lobbyModel, lockerModel, rankModel, rivalsModel } from './models.ts';
import { QUALITY_PRESET, SettingsHolder } from './settings.ts';
import { Tips } from './tips.ts';
import { Shell, type ScreenView, type Transition } from '../ui/shell.ts';
import { titleScreen, type TitleView } from '../ui/screens/title.ts';
import { lobbyScreen } from '../ui/screens/lobby.ts';
import { page } from '../ui/screens/frame.ts';
import {
  deathScreen, galeScreen, hudScreen, resultsScreen, spectateScreen, victoryScreen, type GaleView, type HudView, type SpectateView,
} from '../ui/screens/match.ts';
import { abilitiesScreen, careerScreen, lockerScreen, rankScreen, rivalsScreen, settingsScreen, type MenuView } from '../ui/screens/menus.ts';
import { warmChart } from '../ui/screens/chart.ts';
import { el, esc, tipCard, type TipCardHandle } from '../ui/parts/index.ts';
import type {
  CosmeticKind, DeathModel, GaleModel, HudModel, LobbyModel, ResultsModel, Settings, SpectateModel, TitleModel, VictoryModel,
} from '../ui/model.ts';
import type { Quality as StageQuality } from '../render/engine.ts';
import type { AbilityId } from '../sim/abilities.ts';

export interface AppOptions {
  /** Capture mode: no title wait, a fresh career that is never saved, and frames drawn only when the hook asks. */
  capture: boolean;
  /** Draw the plain debug globe instead of the planet's renderer. */
  debugStage?: boolean;
  /** Draw the planet on WebGPU (?gpu), while it moves across from WebGL. */
  gpu?: boolean;
  /** Log the frame rate, the worst frame and what was drawn every few seconds (the iOS build's log, ?perflog). */
  perfLog?: boolean;
  /** A captain sails a match as soon as the stage is built, on a career that is never saved (measuring a match on a
   *  device, ?autoplay). */
  autoplay?: boolean;
}

/** Seconds between perf lines. */
const PERF_EVERY = 5;

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
  /** The renderer's quality, from the settings; the debug globe has only one. */
  setQuality?(q: StageQuality): void;
  /** The swell the stage draws, for the hulls to ride: metres over sea level at p. The WebGL swell when absent. */
  wave?: (p: V3, t: number) => number;
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
  readonly settings: SettingsHolder;
  /** First-time tips, and the card they show on over the Gale and the HUD. */
  readonly tips: Tips;
  private readonly tip: TipCardHandle;
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
  /** Unlocks the player has not looked at yet: badges on the lobby's tiles and "new" on the cards. */
  private readonly fresh = { abilities: new Set<string>(), cosmetics: new Set<string>() };
  /** A cosmetic the locker is trying on the lobby's ship, over what it wears. */
  private preview: { kind: CosmeticKind; id: string } | null = null;
  /** The frames since the last perf line: seconds, how many, and the longest. */
  private readonly perfWindow = { t: 0, frames: 0, worst: 0 };
  private readonly ear = { fwd: new THREE.Vector3(), up: new THREE.Vector3(), t: 0 };

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
    this.career = new CareerHolder(options.capture || !!options.autoplay);
    this.settings = new SettingsHolder(options.capture || !!options.autoplay);
    this.tips = new Tips(options.capture || !!options.autoplay);
    this.tip = tipCard({ parent: this.shell.root, className: 'pui-tip' });
    this.loop = new Loop((f) => this.frame(f));
    this.loop.scale = (dt) => this.juice.update(dt);
    this.audio = createAudio();
    this.audio.unlock();
    this.sound = new MomentSound(this.audio, this.log);
    this.sound.ear = () => this.session?.state.ships[this.sound.me]?.pos ?? null;
    this.momentJuice = new MomentJuice(this.juice, this.viewer);
    connectUiFeedback((what, sound) => this.log.add('screen', what, sound !== 'none' ? { sound } : undefined), this.juice.haptics, (n) => this.audio.play(n));
    if (options.capture) this.loop.running = false;
    addEventListener('resize', () => this.stage?.resize());
    this.applySettings();
  }

  /** Changes some settings, saves them, and applies them everywhere at once. */
  setSettings(s: Partial<Settings>): Settings {
    const before = this.settings.settings.quality, next = this.settings.set(s);
    this.applySettings(next.quality !== before);
    return next;
  }

  /** The settings into the sound, the juice, the controls, the session and (when it changed) the renderer. */
  private applySettings(quality = false): void {
    const s = this.settings.settings;
    this.audio.setVolumes({ master: s.master, effects: s.effects, ambience: s.ambience, interface: s.interface });
    this.juice.settings({ shake: s.shake, haptics: s.haptics });
    this.controls.sens = s.sensitivity;
    this.controls.invert = s.invertY;
    this.controls.lefty = s.leftHanded;
    if (this.session) this.session.autoFire = s.autoFire;
    this.uiLayer.dataset.hand = s.leftHanded ? 'left' : 'right';
    if (quality) this.stage?.setQuality?.(QUALITY[QUALITY_PRESET[s.quality]]);
  }

  start(): void {
    this.go(this.options.capture ? 'lobby' : 'title');
    this.loaded = this.load();
    if (this.options.autoplay) void this.loaded.then(() => this.play({ autopilot: true }));
  }

  /** Builds the stage and the actors, reporting progress on the title. */
  private async load(): Promise<void> {
    const report = (f: number, what: string) => {
      this.progress = { f: Math.min(0.97, f), what: what || this.progress.what };
      this.title?.setProgress(this.progress.f, this.progress.what);
    };
    const stage: AppStage = this.options.debugStage ? new DebugStage(this.canvas)
      : this.options.gpu ? await GpuStage.create(this.canvas, report)
      : await Stage.create(this.canvas, QUALITY[QUALITY_PRESET[this.settings.settings.quality]], report);
    this.stage = stage;
    // the juice's shake and kicks ride on the camera the rig placed
    stage.onCamera = (cam) => {
      this.juice.applyCamera(cam, cam.fov);
      cam.updateMatrixWorld();
    };
    this.actors = createActors(stage.scene, { radius: R, wave: stage.wave ?? waveHeight, uniforms: U, onJuice: (j, cause) => this.momentJuice.world(j, cause) });
    warmChart();
    await this.actors.ready;
    await rockTexturesReady();
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
    const settled = this.stage?.settled();
    if (!settled || this.loop.running) return settled;
    // the terrain builds only as frames are drawn: with the loop held (captures), draw still ones until it has
    let done = false;
    void settled.then(() => { done = true; });
    for (let i = 0; i < 1800 && !done; i++) {
      this.loop.drawNow(0);
      await new Promise((r) => requestAnimationFrame(r));
    }
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
        return lobbyScreen((model as LobbyModel | undefined) ?? lobbyModel(career, this.news()), { onPlay: () => this.play({}), onOpen: (m) => this.go(m) });
      case 'abilities': {
        const v: MenuView<ReturnType<typeof abilitiesModel>> = abilitiesScreen((model as never) ?? abilitiesModel(career, this.fresh.abilities), {
          onBack: this.back,
          onEquip: (id: AbilityId) => this.equip((c) => equipAbility(c, id), () => v.set(abilitiesModel(this.career.career, this.fresh.abilities))),
        });
        this.seen(this.fresh.abilities);
        return v;
      }
      case 'locker': {
        const v: MenuView<ReturnType<typeof lockerModel>> = lockerScreen((model as never) ?? lockerModel(career, this.fresh.cosmetics), {
          onBack: this.back,
          onEquip: (id) => {
            this.preview = null;
            this.equip((c) => equipCosmetic(c, id), () => v.set(lockerModel(this.career.career, this.fresh.cosmetics)));
          },
          onPreview: (kind, id) => { this.preview = id ? { kind, id } : null; },
        });
        this.seen(this.fresh.cosmetics);
        return v;
      }
      case 'rivals':
        return rivalsScreen((model as never) ?? rivalsModel(career), { onBack: this.back });
      case 'career':
        return careerScreen((model as never) ?? careerModel(career), { onBack: this.back });
      case 'rank':
        return rankScreen((model as never) ?? rankModel(career), { onBack: this.back });
      case 'settings': {
        const v = settingsScreen((model as Settings | undefined) ?? this.settings.settings, { onBack: this.back, onChange: (x) => this.setSettings(x) });
        return v;
      }
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
    if (name === 'death' || name === 'spectate' || name === 'victory') {
      // the match's markers and numbers don't stay over the end of it
      this.juice.markers?.clear();
      this.juice.numbers?.clear();
    }
    switch (name) {
      case 'gale': {
        if (!model && !s) return null;
        const v = galeScreen((model as GaleModel) ?? galeModel(s!), { onDive: () => this.tap('dive'), onPick: (r) => this.session?.pick(r) });
        this.galeView = v;
        return v;
      }
      case 'match': {
        if (!model && !s) return null;
        const v = hudScreen((model as HudModel) ?? hudModel(s!), {
          press: (w, d) => this.controls.press(w, d), pick: (k) => this.controls.pick(k), target: (n, e) => this.juice.target(n, e),
          trade: (f, t) => this.controls.trade(f, t), sails: (v) => { this.controls.throttle = v; }, call: (t) => this.controls.call(t),
        });
        this.hud = v;
        return v;
      }
      case 'death':
        if (!model && !s) return null;
        return deathScreen((model as DeathModel) ?? deathModel(s!), { onSpectate: () => this.go('spectate'), onLeave: () => this.finishMatch() });
      case 'spectate': {
        if (!model && !s) return null;
        s?.spectate();
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

  private readonly back = (): void => this.go('lobby');

  /** Changes the career in a menu (an equip), saves, and redraws the menu; a locked item changes nothing. */
  private equip(change: (c: Career) => Career, redraw: () => void): void {
    try {
      this.career.set(change(this.career.career));
      this.log.add('flow', 'equip', {});
    } catch (e) {
      this.log.add('flow', 'equip-refused', { why: String(e) });
    }
    redraw();
  }

  /** The lobby's badges: how many unlocks wait unseen behind each menu. */
  private news(): LobbyModel['news'] {
    const n: LobbyModel['news'] = {};
    if (this.fresh.abilities.size) n.abilities = this.fresh.abilities.size;
    if (this.fresh.cosmetics.size) n.locker = this.fresh.cosmetics.size;
    return n;
  }

  /** The menu's cards have shown their "new": once you leave, they are old. */
  private seen(set: Set<string>): void {
    queueMicrotask(() => set.clear());
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
  /** The scripted moment the match was set up for, if any. */
  private staged: MomentScript | null = null;
  private hud: HudView | null = null;
  /** The ship the camera followed last frame (-1: none yet). */
  private watched = -1;
  /** How far the camera has drawn back for the win, 0 to 1. */
  private pull = 0;
  private galeView: GaleView | null = null;
  private spec: SpectateView | null = null;
  /** Seconds until the HUD's next refresh: it redraws a few times a second, not every frame. */
  private hudT = 0;
  private readonly eye = { x: 0, y: 0, z: 0 };
  private readonly ndc = new THREE.Vector3();
  /** Where the juice sees from: the camera, and the ship the player watches. */
  private readonly viewer: Viewer = {
    me: PLAYER,
    spectating: false,
    eye: this.eye,
    project: (p) => this.project(p),
    onScreen: (p) => {
      const at = this.project(p);
      if (!at || at.x < 0 || at.x > innerWidth || at.y < 0 || at.y > innerHeight) return null;
      return { x: Math.min(innerWidth * 0.92, Math.max(innerWidth * 0.08, at.x)), y: Math.min(innerHeight * 0.85, Math.max(innerHeight * 0.1, at.y)) };
    },
    bearing: (p) => this.bearing(p),
  };

  /** Starts a match from the career's plan: the Gale, or (skipGale) already at sea. */
  play(o: PlayOptions = {}): void {
    if (this.session) this.leaveMatch();
    this.actors?.clear();
    this.staged = null;
    const s = new Session(this.career.plan(), cosmeticsOf(wornLook(this.career.career)), o);
    s.onMoment = (m) => this.onMoment(m);
    s.autoFire = this.settings.settings.autoFire;
    this.session = s;
    this.watched = -1;
    this.pull = 0;
    this.tips.reset();
    this.viewer.me = this.sound.me = PLAYER;
    this.viewer.spectating = false;
    this.log.tick = s.state.tick;
    this.log.add('flow', 'match', { seed: s.state.seed, skipGale: !!o.skipGale, autopilot: !!o.autopilot });
    this.loop.run(s);
    this.controls.on = true;
    if (this.stage?.rig) Object.assign(this.stage.rig, { follow: 9, shoulder: 0, yaw: 0 });
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
    this.tips.moment(m, s);
  }

  /** Leaves the Gale now. */
  dive(): void {
    this.session?.dive();
  }

  stepTicks(n: number): number {
    return this.loop.advanceTicks(n);
  }

  /** Sinks the player's ship now: by ship `by` (-1: nobody) with `how`, a cause as causeName names it. */
  sinkPlayer(by = -1, how = 'storm'): void {
    this.session?.sinkNow([PLAYER], by, causeOf(how));
  }

  /** Sinks every other ship: the player wins. */
  winPlayer(): void {
    const s = this.session;
    if (!s) return;
    const rest: number[] = [];
    for (let i = 0; i < SHIPS; i++) if (i !== PLAYER && s.state.ships[i].phase !== PHASE.sunk) rest.push(i);
    s.sinkNow(rest);
  }

  /** Hands the player the landmarks whose perks are named, so the next tick gives them those perks, and sets weather
   *  of `weather`'s kind at full strength over the ship. */
  stagePlayer(o: { perks?: readonly string[]; weather?: string } = {}): void {
    const s = this.session;
    if (!s) return;
    const st = s.state, at = st.ships[PLAYER].pos;
    for (const id of o.perks ?? []) {
      const r = REGIONS.findIndex((x) => x.perk === id);
      if (r >= 0) st.owner[cellOf(TERRITORY, landmarkHold(r))] = PLAYER + 1;
    }
    const kind = o.weather ? WEATHER_KIND[o.weather as keyof typeof WEATHER_KIND] : undefined;
    if (kind === undefined) return;
    const w = st.weather[0];
    w.kind = kind;
    w.at.x = at.x; w.at.y = at.y; w.at.z = at.z;
    w.r = WEATHER.r[1];
    w.life = WEATHER.life[1];
    w.age = WEATHER.rise;
  }

  /** Ends the match where it stands: the career takes the report, and the results show what changed. */
  finishMatch(): void {
    const s = this.session;
    if (!s) return;
    const report = s.tally.report(s.plan.fleet.map((e) => e.captain), (i) => s.standing(i));
    const changes = this.career.apply(report), mine = report.ships[PLAYER];
    for (const id of changes.unlocked.abilities) this.fresh.abilities.add(id);
    for (const id of changes.unlocked.cosmetics) this.fresh.cosmetics.add(id);
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
    this.tip.set(null);
    this.log.tick = -1;
    if (this.stage?.rig) Object.assign(this.stage.rig, { follow: 2.2, pitch: 0.2, dist: 27, yaw: 0 });
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

  /** Sets up a scripted moment on a match from the seed (see MOMENTS). Arranged again, it plays the same. */
  moment(name: string, seed: number): void {
    const def = MOMENTS.find((m) => m.name === name);
    if (!def) throw new Error(`no moment "${name}"; there are ${MOMENTS.map((m) => m.name).join(', ')}`);
    this.play({ seed, skipGale: def.sea });
    const s = this.session!;
    const script = def.arrange(s.state);
    daylight(s.state);
    s.stage(script, def.sea);
    this.staged = def;
    this.log.add('flow', 'moment', { name, seed, tick: s.state.tick });
    this.stage?.snap();
  }

  /** A dry run of the moment just set up: the tick its trigger fires on (or -1), and how to frame it. */
  momentPlan(): { trigger: number; lead: number; every: number; frames: number; note: string } | null {
    const s = this.session, def = this.staged;
    if (!s || !def) return null;
    let trigger = -1;
    // only the trigger's tick is wanted: the moments on the way stay unheard and unseen, or their sounds, still
    // ringing, would outrank the same sounds in the replay
    const routed = s.onMoment;
    s.onMoment = (m) => {
      if (trigger < 0 && def.is(m)) trigger = s.state.tick;
    };
    for (let n = 0; n < 60 * 30 && trigger < 0 && this.stepTicks(1); n++);
    s.onMoment = routed;
    return { trigger, lead: def.lead, every: def.every, frames: def.frames, note: def.note };
  }

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
      // the win: the camera draws back and circles the last ship afloat
      this.pull += ((this.screen === 'victory' ? 1 : 0) - this.pull) * (1 - Math.exp(-f.realDt * 1.5));
      stage.rig.yaw += f.realDt * 0.22 * this.pull;
      stage.rig.dist += 9 * this.pull;
    }
    if (s.watch !== this.watched) {
      // the camera moves to another ship: it flies there rather than jumping
      if (this.watched >= 0) stage.rig?.glide();
      this.watched = s.watch;
    }
    s.sun(this.sun);
    actors.update(s.actorsView(f.clock, f.alpha, this.sun), f.dt, stage.camera);
    stage.frame(s.stageView(f.clock, f.alpha), f.dt);
    this.hear(stage, f.realDt, () => s.hearing());
    const c = stage.camera.position;
    this.eye.x = c.x;
    this.eye.y = c.y;
    this.eye.z = c.z;
    this.viewer.me = this.sound.me = s.watch;
    this.viewer.spectating = s.watch !== PLAYER;
    this.follow(s);
    // a tip over the Gale and the HUD only: the card waits while another screen is up
    const tipAt = this.screen === 'gale' ? 'gale' : this.screen === 'match' ? 'hud' : '';
    this.tip.el.dataset.at = tipAt;
    this.tip.set(tipAt ? this.tips.update(s, f.realDt) : null);
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
    // a match that sails itself watches on after its sinking, so a long run keeps the sea busy
    else if (this.options.autoplay && at === 'death' && s.seconds - s.tally.ships[PLAYER].sunkAt > 4) this.go('spectate');
  }

  // ── interface capture: pause every running animation and scrub them together ──
  private frozen: Animation[] = [];
  freezeUi(on: boolean): void {
    if (on) {
      this.frozen = document.getAnimations();
      for (const a of this.frozen) a.pause();
    } else {
      // play() would rewind one scrubbed past its end and run it again
      for (const a of this.frozen) {
        const end = Number(a.effect?.getComputedTiming().endTime ?? Infinity);
        if (Number(a.currentTime ?? 0) >= end) a.finish();
        else a.play();
      }
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

  private logPerf(dt: number): void {
    const w = this.perfWindow;
    w.t += dt;
    w.frames++;
    w.worst = Math.max(w.worst, dt);
    if (w.t < PERF_EVERY) return;
    const st = this.stage?.stats();
    console.info(`perf ${this.screen}: ${(w.frames / w.t).toFixed(1)} fps, worst frame ${(w.worst * 1000).toFixed(0)} ms, ` +
      `scale ${st?.scale.toFixed(2)}, ${st?.tris} tris, ${st?.calls} calls, tick ${this.loop.perf.tickMean.toFixed(2)} ms`);
    Object.assign(w, { t: 0, frames: 0, worst: 0 });
  }

  private frame(f: Frame): void {
    this.log.clock = f.clock;
    if (this.options.perfLog && f.realDt > 0) this.logPerf(f.realDt);
    const stage = this.stage, actors = this.actors;
    if (!stage || !actors) return;
    if (this.session) {
      this.matchFrame(this.session, f, stage, actors);
      return;
    }
    const v = this.view, sv = sceneStage(v, f.clock);
    sunDirection(sv.hour, sv.tilt, this.sun);
    // in the locker the boom swings out and back, so the whole ship stands clear of the pane on the right
    const locker = this.screen === 'locker';
    if (stage.rig && !this.fixed) {
      const k = Math.min(1, f.realDt * 3);
      stage.rig.shoulder += ((locker ? 7.5 : 0) - stage.rig.shoulder) * k;
      stage.rig.dist += ((locker ? 34 : 27) - stage.rig.dist) * k;
    }
    const worn = wornLook(this.career.career), p = locker ? this.preview : null;
    const look = cosmeticsOf(p ? { ...worn, [p.kind]: p.id } : worn);
    const speed = v.camera === 'chase' && this.fixed ? 14.5 : 0;
    actors.update(sceneActors(v, f.clock, this.sun, look, speed), f.dt, stage.camera);
    stage.frame(sv, f.dt);
    this.hear(stage, f.realDt, () => sceneHearing(v, speed));
  }

  /** The listener rides the camera every frame; the sea's beds follow what is around it ten times a second. */
  private hear(stage: AppStage, dt: number, mix: () => AmbienceMix): void {
    const cam = stage.camera, e = this.ear;
    cam.getWorldDirection(e.fwd);
    e.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, e.fwd, e.up);
    e.t -= dt;
    if (e.t > 0 && this.loop.running) return;
    e.t = 0.1;
    this.audio.setAmbience(mix());
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
