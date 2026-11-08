// The app: one canvas for the planet, one layer for the interface, the frame loop, and the flow between screens.
// Each part (stage, actors, interface, sound, career, simulation) is reached through an adapter in this folder.
import * as THREE from 'three';
import { Juice } from '../juice/index.ts';
import { createAudio, type AmbienceMix, type Audio } from '../audio/index.ts';
import { EffectLog } from './effects.ts';
import { MomentSound } from './sounds.ts';
import { connectUiFeedback } from './uiFeedback.ts';
import { Loop, type Frame } from './loop.ts';
import { GpuStage } from '../render/gpu/stage.ts';
import { ORBIT_FOV } from '../render/camera.ts';
import type { StageView } from '../render/stage.ts';
import { sunDirection } from '../render/sun.ts';
import { createActors, type Actors } from '../render/actors/index.ts';
import { rockTexturesReady } from '../render/rocks/index.ts';
import { Studio } from '../render/studio.ts';
import { Parchment } from '../render/paper/parchment.ts';
import type { Weapon } from '../render/actors/view.ts';
import { setStudio } from '../ui/parts/art.ts';
import { careerStats, equipAbility, equipCosmetic, wornLook, type Career } from '../career/index.ts';
import { R, TERRITORY, cellOf } from '../sim/sphere.ts';
import { PHASE, PLAYER, SHIPS, TICK, WEATHER_KIND, landmarkHold } from '../sim/match.ts';
import { GALE, ITEM, WEAPONS, WEATHER } from '../sim/tables.ts';
import { REGIONS, adoptHeights, heightAt, regionAt } from '../sim/world/index.ts';
import { P } from '../render/gpu/uniforms.ts';
import { adoptNav, type Nav } from '../sim/nav.ts';
import type { V3 } from '../sim/math.ts';
import { Controls } from './controls.ts';
import { Session, type PlayOptions } from './session.ts';
import { MomentJuice, type Viewer } from './juice.ts';
import { MOMENTS, actorEvent, arrangeFight, causeOf, daylight, type MomentScript } from './moments.ts';
import type { Moment } from './events.ts';
import { deathModel, galeMap, hudModel, markOf, planetMap, resultsModel, victoryModel } from './matchModels.ts';
import { cosmeticsOf, sceneActors, sceneHearing, sceneStage } from './views.ts';
import { LOBBY_CAMERA, lobbyScene, sceneFrom, type SceneInput, type SceneSpec } from './scenes.ts';
import { isScreen, MENUS, type ScreenName } from './flow.ts';
import { shape } from '../render/gpu/shape.ts';
import { CareerHolder } from './career.ts';
import { abilitiesModel, levelView, lockerModel, rankModel, rankView, rivalsModel } from './models.ts';
import { SettingsHolder } from './settings.ts';
import { Tips } from './tips.ts';
import { Shell, type ScreenView, type Transition } from '../ui/shell.ts';
import { ChartLayer, traceCoasts, type Coasts, type Colours, type Insets } from '../chart/index.ts';
import { Title } from '../screens/title.ts';
import { FullMap } from '../screens/fullmap.ts';
import { Lobby, relaxOrbit, type CareerMarks, type Orbit } from '../screens/lobby.ts';
import type { SheetName } from '../screens/folio.ts';
import { DIVE, Gale, RIDE, fleetAt } from '../screens/gale.ts';
import { Hud } from '../screens/hud.ts';
import { TIER_ILLUMINATION } from '../screens/cards.ts';
import { page } from '../ui/screens/frame.ts';
import { deathScreen, resultsScreen, victoryScreen } from '../ui/screens/match.ts';
import { applyParchment, el, esc, tipCard, type TipCardHandle } from '../ui/parts/index.ts';
import type { DeathModel, HudModel, ResultsModel, Settings, VictoryModel } from '../ui/model.ts';
import type { AbilityId } from '../sim/abilities.ts';

export interface AppOptions {
  /** Capture mode: no title wait, a fresh career that is never saved, and frames drawn only when the hook asks. */
  capture: boolean;
  /** Log the frame rate, the worst frame and what was drawn every few seconds (the iOS build's log, ?perflog). */
  perfLog?: boolean;
  /** A captain sails a match as soon as the stage is built, on a career that is never saved (measuring a match on a
   *  device, ?autoplay). */
  autoplay?: boolean;
  /** Open on #8's frozen fight (?fight, or VITE_FIXTURE=fight on the device). */
  fight?: boolean;
}

/** Seconds between perf lines. */
const PERF_EVERY = 5;
/** The seconds the camera takes between views. */
const FLIGHT = 2.2;
/** Seconds the camera takes to fly from the anchorage to the Gale. */
const TO_THE_GALE = 2.6;

const norm = (p: V3): V3 => {
  const l = Math.hypot(p.x, p.y, p.z) || 1;
  return { x: p.x / l, y: p.y / l, z: p.z / l };
};

/** The hour on the device's clock, for the lobby's sun. */
const localHour = (): number => {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
};

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
  stage: GpuStage | null = null;
  actors: Actors | null = null;
  readonly overlay: HTMLElement;
  /** Thumbs, mouse and keys in a match, on a layer under the interface. */
  readonly controls: Controls;
  /** The interface's layer, the chart's over it, and the juice library's (markers, numbers, flashes) above both. */
  readonly uiLayer: HTMLElement;
  readonly chartHost: HTMLElement;
  readonly juiceLayer: HTMLElement;
  /** The chart: the one canvas layer the interface is drawn on, once its paper is made. */
  chart: ChartLayer | null = null;
  readonly options: AppOptions;
  screen: ScreenName = 'boot';
  /** The fixed scene on the stage: the lobby's, the title's, or one the hook jumped to. */
  view: SceneSpec;
  /** The hour by the device's clock (a capture's is fixed): the lobby's low sun is the morning's or the evening's. */
  readonly hour: number;
  /** The planet's coasts, traced for the Gale's chart. */
  private coasts: Coasts | null = null;
  ready = false;
  /** True while the hook holds a fixed scene: the ship there sails at full speed for its wake. */
  private fixed = false;
  private readonly canvas: HTMLCanvasElement;
  private loaded: Promise<void> | null = null;
  /** The title, the lobby and the Gale on the chart, while each is up or leaving. */
  private title: Title | null = null;
  private lobby: Lobby | null = null;
  /** Where a finger has taken the lobby's camera off its resting view. */
  private readonly boom: Orbit = { yaw: 0, pitch: 0, zoom: 1 };
  private gale: Gale | null = null;
  /** The full map, while it is open. */
  private map: FullMap | null = null;
  /** How far the world has loaded, 0..1. */
  private progress = 0;
  /** Whether the stage has drawn the world yet, and whether the ships are built (after the title's materials). */
  #drawn = false;
  #shipsDone = false;
  /** The chart's clock: real time, or held and scrubbed by the capture tools, and never running backwards when let go. */
  private readonly chartClock = { held: -1, scrub: 0, offset: 0 };
  /** The capture tools hold the title as if the world were this far loaded (null: as it is). */
  titleHold: number | null = null;
  private readonly sun = new THREE.Vector3();
  /** The frames since the last perf line: seconds, how many, and the longest. */
  private readonly perfWindow = { t: 0, frames: 0, worst: 0 };
  private readonly ear = { fwd: new THREE.Vector3(), up: new THREE.Vector3(), t: 0 };

  constructor(canvas: HTMLCanvasElement, overlay: HTMLElement, options: AppOptions) {
    this.canvas = canvas;
    this.options = options;
    this.hour = options.capture ? 16.5 : localHour();
    this.view = lobbyScene(this.hour);
    this.overlay = overlay;
    this.controls = new Controls(layer(overlay, 'app-touch'));
    this.controls.on = false;
    this.uiLayer = layer(overlay, 'app-ui');
    // only the screens' own parts take touches: the rest fall through to the controls beneath
    this.uiLayer.style.pointerEvents = 'none';
    // the chart takes only the touches that land on what it draws to be pressed (ChartLayer.attach)
    this.chartHost = layer(overlay, 'app-chart');
    this.chartHost.style.pointerEvents = 'none';
    this.chartHost.style.overflow = 'hidden';
    this.juiceLayer = layer(overlay, 'app-juice');
    this.juiceLayer.style.pointerEvents = 'none';
    this.shell = new Shell(this.uiLayer);
    this.juice = new Juice({ hud: this.juiceLayer, seed: 1, marks: false });
    this.career = new CareerHolder(options.capture || !!options.autoplay || !!options.fight);
    this.settings = new SettingsHolder(options.capture || !!options.autoplay || !!options.fight);
    this.tips = new Tips(options.capture || !!options.autoplay || !!options.fight);
    this.tip = tipCard({ parent: this.shell.root, className: 'pui-tip' });
    this.loop = new Loop((f) => this.frame(f));
    // every frame on the screen for the same time: a thirtieth of a second, every other refresh of a 60 Hz panel
    this.loop.frameRate = 30;
    this.loop.scale = (dt) => this.juice.update(dt);
    this.audio = createAudio();
    this.audio.unlock();
    this.sound = new MomentSound(this.audio, this.log);
    this.momentJuice = new MomentJuice(this.juice, this.viewer);
    connectUiFeedback((what, sound) => this.log.add('screen', what, sound !== 'none' ? { sound } : undefined), this.juice.haptics, (n) => this.audio.play(n));
    if (options.capture) this.loop.running = false;
    addEventListener('resize', () => {
      this.stage?.resize();
      this.sizeChart();
    });
    this.applySettings();
  }

  /** Changes some settings, saves them, and applies them everywhere at once. */
  setSettings(s: Partial<Settings>): Settings {
    const next = this.settings.set(s);
    this.applySettings();
    return next;
  }

  /** The settings into the sound, the juice, the controls and the session. */
  private applySettings(): void {
    const s = this.settings.settings;
    this.audio.setVolumes({ master: s.master, effects: s.effects, ambience: s.ambience, interface: s.interface });
    this.juice.settings({ shake: s.shake, haptics: s.haptics });
    this.controls.sens = s.sensitivity;
    this.controls.invert = s.invertY;
    this.controls.lefty = s.leftHanded;
    if (this.session) this.session.autoFire = s.autoFire;
    this.uiLayer.dataset.hand = s.leftHanded ? 'left' : 'right';
  }

  start(): void {
    this.go(this.options.capture ? 'lobby' : 'title');
    this.loaded = this.load();
    if (this.options.fight) void this.loaded.then(() => this.fight());
    else if (this.options.autoplay) void this.loaded.then(() => this.play({ autopilot: true }));
  }

  /** The chart's time now, milliseconds. */
  chartNow(): number {
    const c = this.chartClock;
    return c.held >= 0 ? c.held + c.scrub : performance.now() + c.offset;
  }

  /** The chart to the window's size and its safe areas. */
  private sizeChart(): void {
    if (!this.chart) return;
    this.chart.resize(innerWidth, innerHeight, devicePixelRatio || 1, safeArea());
    this.title?.resize();
    this.lobby?.resize();
    this.gale?.resize();
    this.map?.resize();
  }

  /** Builds the stage and the actors; the title's needle reads the progress. */
  private async load(): Promise<void> {
    const report = (f: number) => {
      this.progress = Math.min(0.97, f);
    };
    // with the frame log on, how long each step of the boot took
    let last = performance.now();
    const mark = (what: string) => {
      if (!this.options.perfLog) return;
      const now = performance.now();
      console.info(`boot ${what}: ${((now - last) / 1000).toFixed(2)} s (at ${(now / 1000).toFixed(1)} s)`);
      last = now;
    };
    mark('page');
    // the world's heights and the captains' chart, baked alongside the rest of the boot
    const chart = new Worker(new URL('../sim/chart-worker.ts', import.meta.url), { type: 'module' });
    chart.onmessage = (e: MessageEvent<{ heights: Float32Array; nav: Nav; coasts: Coasts }>) => {
      adoptHeights(e.data.heights);
      adoptNav(e.data.nav);
      this.coasts ??= e.data.coasts;
      chart.terminate();
    };
    chart.postMessage(0);
    // the title's paper is made on the renderer first, so the chart inks in while the planet is built
    let parchment!: Parchment;
    const stage = await GpuStage.create(this.canvas, (f) => report(0.2 * f), async (renderer) => {
      parchment = await Parchment.create(renderer);
      this.chart = await ChartLayer.create(parchment, this.chartHost);
      this.sizeChart();
      this.chart.attach(window);
      this.title?.attach(this.chart, this.chartNow());
      this.lobby?.attach(this.chart, this.chartNow());
      mark('paper');
    });
    mark('stage');
    this.stage = stage;
    void stage.warmed.then(() => { this.#drawn = true; });
    // the juice's shake and kicks ride on the camera the rig placed
    stage.onCamera = (cam) => {
      this.juice.applyCamera(cam, cam.fov);
      cam.updateMatrixWorld();
    };
    // the interface's parchment, rendered on the stage's own GPU
    applyParchment(await parchment.sheets());
    mark('parchment');
    this.actors = createActors(stage.scene, {
      radius: R, wave: stage.wave, overlay: stage.overlay, sceneDepth: stage.post.scenePass.getTexture('depth'),
      onJuice: (j, cause) => this.momentJuice.world(j, cause),
    });
    // the ships are built after the planet, with the title up; leaving the title waits for them
    void stage.later(this.actors.group).then(() => { this.#shipsDone = true; });
    mark('actors');
    // the first frame builds every material, a few at a time, before anything is drawn
    stage.onWarm = (f) => report(0.2 + 0.75 * f);
    // with the loop held (captures), the frame that starts it is drawn here
    let warm = false;
    void stage.warmed.then(() => { warm = true; });
    while (!warm && !this.loop.running) {
      this.loop.drawNow(0);
      await new Promise((r) => requestAnimationFrame(r));
    }
    await stage.warmed;
    mark('warm');
    await this.actors.ready;
    mark('actors ready');
    // the locker's cards and the rewards are drawn from the ship itself
    const studio = new Studio(stage.renderer, this.actors.kit);
    // a weapon's art is its mount on her deck; anything else is a cosmetic as worn
    setStudio((kind, id) => (kind === 'weapon' ? studio.weapon(id as Weapon) : studio.cosmetic(kind, id)));
    await rockTexturesReady();
    mark('studio and rocks');
    stage.snap();
    this.progress = 1;
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
    const from = this.screen, folio = (n: ScreenName) => (MENUS as readonly string[]).includes(n);
    this.screen = name;
    this.log.add('flow', 'screen', { from, to: name });
    this.fixed = false;
    if (name === 'title' || name === 'lobby' || name === 'results' || (MENUS as readonly string[]).includes(name)) {
      // her ship at anchor on her home water, behind the title, the lobby, its folios and a match's results
      this.view = lobbyScene(this.hour);
    }
    // the title leaves on the chart (the rose flies, the sheet rolls off) over whatever comes next; the lobby's ink dries
    // away; the Gale's chart is gone by the time she lands; the HUD dries
    const now = this.chartNow();
    const atLobby = from === 'lobby' || folio(from), toLobby = name === 'lobby' || folio(name);
    if (atLobby && !toLobby) this.lobby?.leave(now);
    if (from === 'gale' && name !== 'gale') this.gale?.leave(now);
    if (from === 'match' && name !== 'match') this.hud?.leave(now);
    if (name === 'title') this.openTitle();
    // a folio or the settings unrolls over the lobby that is already here, or one that comes with it
    if (toLobby && (!atLobby || !this.lobby)) this.openLobby(from);
    if (toLobby) this.lobby?.show(name === 'lobby' ? null : (name as SheetName), now);
    if (name === 'gale') this.openGale();
    if (name !== 'match' && name !== 'gale') this.closeMap(false);
    if (name === 'match') this.openHud(model);
    // (after what comes in under it, so it is drawn over it)
    if (from === 'title' && name !== 'title') this.title?.leave(now);
    if (name === 'spectate') this.session?.spectate();
    const view = this.screenView(name, model);
    this.shell.show(name, view, transition(from, name));
  }

  private screenView(name: ScreenName, model?: unknown): ScreenView {
    const career = this.career.career;
    switch (name) {
      // drawn on the chart (the title, the lobby and its sheets, the Gale, spectating), or nothing at all
      case 'boot':
      case 'title':
      case 'lobby':
      case 'abilities':
      case 'locker':
      case 'rivals':
      case 'rank':
      case 'settings':
      case 'gale':
      case 'spectate':
        return { el: el('s-empty') };
      default:
        return this.matchView(name, model) ?? this.placeholder(name);
    }
  }

  /** The screens over a match, from the live session or a model the hook hands in; null when there is neither. */
  private matchView(name: ScreenName, model?: unknown): ScreenView | null {
    const s = this.session;
    if (name === 'death' || name === 'spectate' || name === 'victory') {
      // the match's markers and numbers don't stay over the end of it
      this.juice.markers?.clear();
      this.juice.numbers?.clear();
    }
    switch (name) {
      case 'match':
        // the HUD is on the chart (openHud); touches it does not take go through this empty screen to the controls
        return !model && !s ? null : { el: el('s-empty') };
      case 'death':
        if (!model && !s) return null;
        return deathScreen((model as DeathModel) ?? deathModel(s!), { onSpectate: () => this.go('spectate'), onLeave: () => this.finishMatch() });
      case 'victory':
        if (!model && !s) return null;
        return victoryScreen((model as VictoryModel) ?? victoryModel(s!), { onContinue: () => this.finishMatch() });
      case 'results':
        return model ? resultsScreen(model as ResultsModel, { onDone: () => this.go('lobby') }) : null;
      default:
        return this.placeholder(name);
    }
  }

  /** Changes the career from a folio (an equip) and saves; a locked item changes nothing. */
  private equip(change: (c: Career) => Career): void {
    try {
      this.career.set(change(this.career.career));
      this.log.add('flow', 'equip', {});
    } catch (e) {
      this.log.add('flow', 'equip-refused', { why: String(e) });
    }
  }

  /** A screen still being built: its frame, its name, and a way back. */
  private placeholder(name: ScreenName): ScreenView {
    const back = name === 'results' ? 'lobby' : null;
    const p = page({ title: name[0].toUpperCase() + name.slice(1), onBack: back ? () => this.go(back) : undefined });
    el('s-page__note', p.body, esc(`The ${name} screen is not built yet.`));
    return p;
  }

  /** Jumps to a fixed scene, leaving any match. */
  scene(input: SceneInput): SceneSpec {
    if (this.session) this.leaveMatch();
    for (const c of [this.gale, this.hud]) c?.dispose();
    this.gale = this.hud = null;
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
  /** The HUD on the chart, while a match is up or its ink is drying. */
  private hud: Hud | null = null;
  /** The ship the camera followed last frame (-1: none yet). */
  private watched = -1;
  /** How far the camera has drawn back for the win, 0 to 1. */
  private pull = 0;
  /** How far the frame is between the last tick and this one. */
  private alpha = 1;
  /** The fleet's middle on the Gale and the way on there; seconds into her dive (-1 not diving). */
  private readonly fleet = { at: { x: 0, y: 0, z: 1 }, head: { x: 1, y: 0, z: 0 } };
  private diving = -1;
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
    this.begin(this.prepare(o), o);
  }

  /** Makes the next match, not yet begun. */
  private prepare(o: PlayOptions = {}): Session {
    return new Session(this.career.plan(), cosmeticsOf(wornLook(this.career.career)), o);
  }

  /** Begins a match made ready. Played from the lobby the camera flies from the anchorage to the Gale, the actors and
   *  the hour changing under the paper the lobby came down with. */
  private begin(s: Session, o: PlayOptions = {}, fly = false): void {
    if (this.session) this.leaveMatch();
    this.actors?.clear();
    this.staged = null;
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
    if (fly) this.stage?.rig.glide(TO_THE_GALE);
    else this.stage?.snap();
    this.go(s.me.phase === PHASE.gale ? 'gale' : 'match');
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
    this.hud?.moment(m);
  }

  /** Marks her dive right under her: she leaves the Gale now and drops where she is. */
  dive(): void {
    const s = this.session;
    if (s) s.aimFor(s.me.pos);
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
  stagePlayer(o: { perks?: readonly string[]; weather?: string; weapons?: readonly string[] } = {}): void {
    const s = this.session;
    if (!s) return;
    const st = s.state, at = st.ships[PLAYER].pos;
    // and fills the hotbar from its first slot with the weapons named, rare and loaded
    (o.weapons ?? []).forEach((name, k) => {
      const kind = ITEM[name as keyof typeof ITEM], slot = st.ships[PLAYER].slots[k];
      if (kind === undefined || !slot) return;
      slot.kind = kind; slot.rarity = 2; slot.n = WEAPONS[kind].mag;
    });
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
    this.log.add('flow', 'finish', { place: changes.place, kills: changes.kills, xp: changes.xp.total, tick: s.state.tick });
    this.leaveMatch();
    this.go('results', resultsModel(changes, this.career.career, { damage: mine.damage, survived: mine.survived }));
  }

  private leaveMatch(): void {
    this.closeMap(false);
    this.session = null;
    this.loop.run(null);
    this.controls.on = false;
    this.sound.clear();
    this.juice.clear();
    this.hud?.leave(this.chartNow());
    this.tip.set(null);
    this.log.tick = -1;
    if (this.stage?.rig) Object.assign(this.stage.rig, { follow: 2.2, pitch: 0.2, dist: 27, yaw: 0, flight: FLIGHT });
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

  /** #8's frozen fight, the frame every budget is measured on: seed 5 at sea, nine captains around the player at the
   *  Storm's edge, dusk and a thunderstorm over them, four seconds fought, then held there. The simulation stops; the
   *  frame goes on drawing the moment (sea, cloth, weather and smoke moving in place). */
  fight(): void {
    this.play({ seed: 5, skipGale: true, autopilot: true });
    const s = this.session!;
    arrangeFight(s.state);
    this.stagePlayer({ weather: 'thunder' });
    this.stage?.snap();
    this.stepTicks(4 * 30);
    this.loop.run(null);
    this.log.add('flow', 'fight', { tick: s.state.tick });
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
  private matchFrame(s: Session, f: Frame, stage: GpuStage, actors: Actors): void {
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
    const sv = s.stageView(f.clock, f.alpha);
    this.alpha = f.alpha;
    if (this.gale && s.watch === PLAYER) this.galeCamera(s, sv, f.realDt);
    if (this.map) {
      // the full map holds the orbit over the point the finger has turned to the middle of its window
      sv.camera = 'orbit';
      sv.target = { pos: this.map.centre, heading: sv.target.heading, pull: 0 };
      stage.rig.orbitDistance = this.map.distance;
      sv.gale = null;
    }
    stage.frame(sv, f.dt);
    this.hear(stage, f.realDt, () => s.hearing());
    const c = stage.camera.position;
    this.eye.x = c.x;
    this.eye.y = c.y;
    this.eye.z = c.z;
    this.viewer.me = this.sound.me = s.watch;
    this.viewer.spectating = s.watch !== PLAYER;
    this.follow(s);
    // a tip over the HUD only: the card waits while another screen is up
    const tipAt = this.screen === 'match' ? 'hud' : '';
    this.tip.el.dataset.at = tipAt;
    this.tip.set(tipAt ? this.tips.update(s, f.realDt) : null);
    this.hudT -= f.realDt;
    if (this.hudT <= 0 || !this.loop.running) {
      this.hudT = 1 / 12;
      if (this.hud && this.session === s) this.hud.set(hudModel(s));
    }
  }

  /** Moves between the match's screens as the player's ship lands from the Gale, sinks, or wins. */
  private follow(s: Session): void {
    const me = s.me, at = this.screen;
    if (s.over && s.state.winner === PLAYER && (at === 'match' || at === 'gale')) this.go('victory');
    else if (me.phase === PHASE.sunk && (at === 'match' || at === 'gale')) this.go('death');
    else if (at === 'gale' && me.phase === PHASE.sea) this.go('match');
    else if (s.over && at === 'spectate') this.finishMatch();
    // a match that sails itself watches on after its sinking, so a long run keeps the sea busy
    else if (this.options.autoplay && at === 'death' && s.seconds - s.tally.ships[PLAYER].sunkAt > 4) this.go('spectate');
  }

  /** The player's own colour and emblem, as the chart's marks take a captain. */
  private ownMark(): Colours {
    const m = markOf(wornLook(this.career.career));
    return { colour: m.colours[0], sigil: { id: m.emblem } };
  }

  /** The career as the lobby's plate draws it. */
  private careerMarks(): CareerMarks {
    const c = this.career.career, l = levelView(c), s = careerStats(c);
    return { level: l.level, into: l.into, need: l.need, illumination: TIER_ILLUMINATION[rankView(c).tier] ?? 'ink', matches: s.matches, wins: s.wins };
  }

  /** Opens or shuts the full map over the drop or the match. */
  private toggleMap(): void {
    if (this.map) this.closeMap();
    else this.openMap();
  }

  private openMap(): void {
    const s = this.session, stage = this.stage, layer = this.chart;
    if (this.map || !s || !stage || !layer) return;
    const m = new FullMap(this.chartHost, {
      camera: () => this.stage?.camera ?? null,
      coasts: () => (this.coasts ??= traceCoasts(heightAt)),
      fov: ORBIT_FOV,
      model: () => planetMap(s),
      mine: this.ownMark(),
      aim: (p) => s.aimFor(p),
      close: () => this.closeMap(),
    });
    m.attach(layer, this.chartNow());
    this.map = m;
    this.controls.on = false;
    this.hud?.cover(true);
    this.gale?.cover(true);
    stage.rig.snap();
  }

  /** The window on the planet, for the test hook: where the full map's window is, or null while it is shut. */
  get mapWindow(): { x: number; y: number; r: number } | null {
    return this.map?.window ?? null;
  }

  /** Shuts the full map. `sailing`: the match goes on, and the controls come back to the player. */
  private closeMap(sailing = true): void {
    const m = this.map;
    if (!m) return;
    m.dispose();
    this.map = null;
    this.controls.on = sailing;
    this.hud?.cover(false);
    this.gale?.cover(false);
    this.stage?.rig.snap();
  }

  /** Puts the lobby on the chart, its instruments laid as the title's sheet rolls off them and the title's rose landing
   *  on its plate; its tabs, plate and wheel unroll their sheets over it. */
  private openLobby(from: ScreenName): void {
    this.lobby?.dispose();
    const l = new Lobby({
      career: () => this.careerMarks(),
      begin: () => this.begin(this.prepare(), {}, true),
      settings: () => this.go('settings'),
      rank: () => this.go('rank'),
      open: (folio) => this.go(folio),
      close: () => this.go('lobby'),
      sheets: {
        abilities: () => abilitiesModel(this.career.career),
        locker: () => lockerModel(this.career.career),
        rank: () => rankModel(this.career.career),
        rivals: () => rivalsModel(this.career.career),
        settings: () => this.settings.settings,
        career: () => this.careerMarks(),
        equipAbility: (id: AbilityId) => this.equip((c) => equipAbility(c, id)),
        equipCosmetic: (id) => this.equip((c) => equipCosmetic(c, id)),
        setSettings: (s) => this.setSettings(s),
      },
      boom: this.boom,
    }, { roseLanded: from === 'title' });
    l.onGone = () => {
      if (this.lobby === l) this.lobby = null;
    };
    this.lobby = l;
    if (this.chart) l.attach(this.chart, this.chartNow());
  }

  /** Riding the Gale, the camera is a chase view behind and above the fleet's middle, the planet's curve in it; leaving
   *  it, the same chase view eases from the fleet down onto her and from the boom's height on the Gale to her own, over
   *  the dive's seconds, so there is no jump. */
  private galeCamera(s: Session, sv: StageView, dt: number): void {
    const rig = this.stage?.rig, me = s.me;
    if (!rig || (me.phase !== PHASE.gale && me.phase !== PHASE.glide)) return;
    const f = this.fleet, g = s.state.gale;
    fleetAt(g.from, g.dir, this.galeTime(s), f.at, f.head);
    let k = 0;
    if (me.phase === PHASE.glide) {
      this.diving = Math.max(this.diving, 0) + dt;
      const x = Math.min(1, this.diving / (DIVE.descent + DIVE.settle));
      k = x * x * (3 - 2 * x);
    } else this.diving = -1;
    const her = sv.target, mix = (a: number, b: number) => a + (b - a) * k;
    rig.pitch = mix(RIDE.pitch, rig.pitch);
    rig.dist = mix(RIDE.dist, rig.dist);
    sv.target = {
      pos: norm({ x: mix(f.at.x, her.pos.x), y: mix(f.at.y, her.pos.y), z: mix(f.at.z, her.pos.z) }),
      heading: norm({ x: mix(f.head.x, her.heading.x), y: mix(f.head.y, her.heading.y), z: mix(f.head.z, her.heading.z) }),
      height: mix(2.5 + GALE.height, her.height ?? 2.5),
    };
    sv.gale = { at: f.at, way: f.head, height: GALE.height, strength: me.phase === PHASE.gale ? 1 : Math.max(0, 1 - this.diving / 1.2) };
  }

  /** Seconds the match's Gale has blown, to the frame. */
  private galeTime(s: Session): number {
    return Math.min(GALE.time, Math.max(0, s.state.gale.t - (1 - this.alpha) * TICK));
  }

  /** Puts the drop on the chart, over the world. */
  private openGale(): void {
    this.gale?.dispose();
    this.gale = null;
    const s = this.session;
    if (!s) return;
    const g = new Gale({
      controls: this.controls,
      lefty: () => this.controls.lefty,
      time: () => this.galeTime(s),
      phase: () => s.me.phase,
      map: () => galeMap(s),
      marker: () => s.mark,
      project: (p) => this.project(p),
      eye: () => this.eye,
      openMap: () => this.toggleMap(),
    }, { teach: this.tips.drawn('gale') });
    g.onGone = () => {
      if (this.gale === g) this.gale = null;
    };
    this.gale = g;
    if (this.chart) g.attach(this.chart, this.chartNow());
  }

  /** Inks the HUD in as she comes to sea, from the live session or a model the hook hands in. */
  private openHud(model?: unknown): void {
    this.hud?.dispose();
    this.hud = null;
    const s = this.session;
    if (!model && !s) return;
    const h = new Hud({
      controls: this.controls,
      sight: this.viewer,
      shipAt: (i) => this.session?.shipAt(i) ?? null,
      lefty: () => this.controls.lefty,
      openMap: () => this.toggleMap(),
    });
    if (this.map) h.cover(true);
    h.onGone = () => {
      if (this.hud === h) this.hud = null;
    };
    h.set((model as HudModel) ?? hudModel(s!));
    this.hud = h;
    if (this.chart) h.attach(this.chart, this.chartNow());
  }

  /** Puts the title on the chart: a blank sheet at once, inked once the paper is made. */
  private openTitle(): void {
    this.title?.dispose();
    const t = new Title(this.chartHost, {
      progress: () => this.titleHold ?? this.progress,
      drawn: () => this.#drawn,
      ready: () => this.titleHold === null && this.ready && this.#shipsDone,
      mark: () => this.ownMark(),
      start: () => this.go('lobby'),
      // the camera is at the lobby before the sheet comes off it, not flying there from orbit
      covered: () => this.stage?.snap(),
    });
    t.onGone = () => {
      if (this.title === t) this.title = null;
    };
    this.title = t;
    if (this.chart) t.attach(this.chart, this.chartNow());
  }

  // ── interface capture: pause every running animation and scrub them together ──
  private frozen: Animation[] = [];
  freezeUi(on: boolean): void {
    const c = this.chartClock, now = this.chartNow();
    if (on) c.held = now;
    else {
      c.offset = now - performance.now();
      c.held = -1;
    }
    c.scrub = 0;
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
    this.chartClock.scrub = ms;
    this.chart?.frame(this.chartNow());
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

  /** The chart's share of the frame since the last perf line: its mean and worst CPU time. */
  private chartCost(): string {
    const c = this.chart?.cost;
    if (!c?.frames) return '';
    const out = `chart ${c.mean.toFixed(1)} ms (worst ${c.worst.toFixed(0)}), `;
    c.worst = 0;
    return out;
  }

  private logPerf(dt: number): void {
    const w = this.perfWindow;
    w.t += dt;
    w.frames++;
    w.worst = Math.max(w.worst, dt);
    if (w.t < PERF_EVERY) return;
    const frames = w.frames, t = w.t, worst = w.worst;
    Object.assign(w, { t: 0, frames: 0, worst: 0 });
    const st = this.stage?.stats(), s = this.session;
    // where the watched ship is, so a frame that breaks the budget is found by the region it broke in
    const sky = this.stage ? Object.entries(this.stage.clouds.depth).filter(([, v]) => (v ?? 0) > 0.1).map(([k]) => k).join('+') || 'fair' : '';
    const at = s ? ` in ${REGIONS[regionAt(s.state.ships[s.watch].pos)].id}, ${sky}, ${P.night.value as number > 0.5 ? 'night' : 'day'}` : '';
    console.info(`perf ${this.screen}${at}: ${(frames / t).toFixed(1)} fps, worst frame ${(worst * 1000).toFixed(0)} ms, ` +
      `scale ${st?.scale.toFixed(2)}, ${st?.tris} tris, ${st?.calls} calls, tick ${this.loop.perf.tickMean.toFixed(2)} ms, cpu ${this.loop.perf.frameMean.toFixed(1)} ms a frame, ` +
      `${this.chartCost()}${shape.memory}`);
    // in pieces: the device's console cuts a long message short
    const lines = shape.report(this.screen).split('\n');
    for (let i = 0; i < lines.length; i += 24) console.info(lines.slice(i, i + 24).join('\n'));
  }

  private frame(f: Frame): void {
    this.log.clock = f.clock;
    shape.frame(this.screen);
    if (this.options.perfLog && f.realDt > 0) this.logPerf(f.realDt);
    this.drawWorld(f);
    // the chart after the world, so what it inks over the planet is where the planet was drawn this frame
    this.chart?.frame(this.chartNow());
  }

  private drawWorld(f: Frame): void {
    const stage = this.stage, actors = this.actors;
    if (!stage || !actors) return;
    if (!this.lobby?.held) relaxOrbit(this.boom, f.realDt);
    if (this.session) {
      this.matchFrame(this.session, f, stage, actors);
      return;
    }
    const v = this.view, sv = sceneStage(v, f.clock);
    sunDirection(sv.hour, sv.tilt, this.sun);
    // at anchor the camera stands off her bow on the quarter and drifts slowly round her and back, a finger turning it
    // about her and pinching it closer; in the locker the boom swings out, so the whole ship stands clear of the sheet
    // on the right
    const locker = this.screen === 'locker';
    if (stage.rig && !this.fixed) {
      const k = Math.min(1, f.realDt * 3), c = LOBBY_CAMERA, b = this.boom;
      stage.rig.shoulder += ((locker ? 7.5 : 0) - stage.rig.shoulder) * k;
      // a pinch answers at once; only the locker's swing is eased
      stage.rig.dist += ((locker ? c.dist - 6 : c.dist) * b.zoom - stage.rig.dist) * (this.lobby?.held ? 1 : k);
      stage.rig.pitch = c.pitch + b.pitch;
      stage.rig.yaw = Math.PI - c.quarter + c.drift * Math.sin((f.clock / c.period) * Math.PI * 2) + b.yaw;
    }
    const look = cosmeticsOf(wornLook(this.career.career));
    const speed = v.camera === 'chase' && this.fixed ? 14.5 : 0;
    // at anchor she is shown whole, her sails sheeted out and not thinned for a crosshair
    const av = sceneActors(v, f.clock, this.sun, look, speed);
    av.aiming = this.fixed;
    actors.update(av, f.dt, stage.camera);
    stage.frame(sv, f.dt);
    this.hear(stage, f.realDt, () => sceneHearing(v, speed));
  }

  /** The listener rides the camera every frame; the sea's beds follow what is around it ten times a second. */
  private hear(stage: GpuStage, dt: number, mix: () => AmbienceMix): void {
    const cam = stage.camera, e = this.ear;
    cam.getWorldDirection(e.fwd);
    e.up.set(0, 1, 0).applyQuaternion(cam.quaternion);
    this.audio.setListener(cam.position, e.fwd, e.up);
    const s = this.session;
    if (s) this.sound.fires(s.state.ships, PHASE.sunk, (p) => ({ x: p.x * R, y: p.y * R, z: p.z * R }));
    e.t -= dt;
    if (e.t > 0 && this.loop.running) return;
    e.t = 0.1;
    this.audio.setAmbience(mix());
  }
}

/** How one screen gives way to the next. */
function transition(from: ScreenName, to: ScreenName): Transition {
  if (from === 'boot') return 'fade';
  // the lobby is already there when the title's sheet rolls off it
  if (from === 'title') return 'none';
  // a folio's sheet is the chart's to unroll
  if ((MENUS as readonly string[]).includes(to) || (MENUS as readonly string[]).includes(from)) return 'none';
  return 'fade';
}

/** The safe areas' insets as the page resolves them, CSS pixels. */
function safeArea(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;inset:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe), px = (v: string) => parseFloat(v) || 0;
  const out = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return out;
}

function layer(parent: HTMLElement, cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  d.style.cssText = 'position:fixed;inset:0;';
  parent.append(d);
  return d;
}
