// The planet on screen, on WebGPU: the atmosphere and its light, the sun's shadows, the FFT ocean, the land painted
// with its regions' scans, the plants, the beacons and landmarks, the ships, and the frame's finish, seen through the
// camera rig and driven by the StageView the app makes each frame; nothing here reads the simulation.
import type { InkMark } from '../ocean/territory.ts';
import { PerspectiveCamera, Scene, Vector2, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { RENDER_SCALE, createRenderer, pixelRatio } from './renderer.ts';
import { Post, SCREEN } from './post.ts';
import { shape } from './shape.ts';
import { copyTogether } from './behind.ts';
import { ColourScript, rising } from './grade.ts';
import { ClusteredLighting } from './clusters.ts';
import { Resolution } from './resolution.ts';
import { Motes } from '../actors/motes.ts';
import { buildNodeForTargetAsync, runFrameWork, serializePreparation, sitePreparationYield } from './work.ts';
import { P } from './uniforms.ts';
import { sharedNoise } from './noise.ts';
import { Atmosphere } from '../atmosphere/index.ts';
import { Clouds } from '../atmosphere/clouds.ts';
import { AURORA, OVAL } from '../atmosphere/aurora.ts';
import { Fog } from '../atmosphere/fog.ts';
import { LANDMARKS, REGIONS } from '../../sim/world/index.ts';
import { Fall } from '../atmosphere/fall.ts';
import { GaleAir } from '../atmosphere/gale.ts';
import { Ocean, CALM_SEA, type SeaState } from '../ocean/index.ts';
import { Terrain } from '../terrain.ts';
import { ScanCache } from '../land/scans.ts';
import { landMaterial } from '../land/material.ts';
import { CameraRig } from '../camera.ts';
import { Beacons } from '../regions/beacons.ts';
import { Landmarks } from '../regions/landmarks.ts';
import { Floes } from '../regions/floes.ts';
import { Moonbow } from '../regions/moonbow.ts';
import { Flora } from '../flora/field.ts';
import { seaDeepAt } from '../seaTint.ts';
import { moonDirection, sunDirection } from '../sun.ts';
import { R } from '../../sim/sphere.ts';
import type { V3 } from '../../sim/math.ts';
import type { StageView } from '../stage.ts';

const DEG = Math.PI / 180;
/** The sine of the sun's height as an eye `alt` metres up has it: over the air the horizon falls away, and whatever
 *  flies up there stands in sunlight over a sea already in the dark. The exposure goes part of the way to the sun it is
 *  in, so she does not blaze and the dark sea she is falling to can still be read. */
function sunSeen(elevation: number, alt: number): number {
  const over = Math.min(1, Math.max(0, (alt - 40) / 180));
  if (over <= 0) return elevation;
  const dip = 0.6 * Math.acos(R / (R + alt)) * over * over * (3 - 2 * over);
  return Math.sin(Math.min(Math.PI / 2, Math.asin(Math.min(1, Math.max(-1, elevation))) + dip));
}

/** How built up the fair-weather cumulus is over the planet, where its own map heaps it most. */
const FAIR_WEATHER = 0.62;
/** The wind sea is rebuilt only when the wind has changed by this much, m/s and radians: a rebuild is a pop. */
const WIND_STEP = 0.75;
const HEADING_STEP = 8 * DEG;

/** How deep in renders the scene is drawn: inside the picture at its own size, inside the quad that puts it on the screen. */
const SCENE_DEPTH = 2;

/** The renderer's own state the warm-up borrows. */
interface Internals {
  _renderContexts: { get(target: unknown, mrt: unknown, depth?: number): unknown };
  _nodes: { getForRenderAsync(ro: unknown): Promise<unknown>; getForRender(ro: unknown): unknown };
  _pipelines: { getForRender(ro: unknown, promises: unknown): unknown };
  setRenderTarget(target: unknown): void;
  setMRT(mrt: unknown): void;
}

export class GpuStage {
  readonly scene = new Scene();
  /** What is written on the screen rather than lit in the world (the damage numbers), drawn over the finished frame. */
  readonly overlay = new Scene();
  readonly camera = new PerspectiveCamera(58, 1, 0.25, 4000);
  readonly rig = new CameraRig();
  onCamera: ((cam: PerspectiveCamera) => void) | null = null;
  /** The sun and moon this frame, unit vectors. */
  readonly sun = new Vector3(1, 0, 0);
  readonly moon = new Vector3(-1, 0, 0);

  readonly renderer: WebGPURenderer;
  readonly atmosphere: Atmosphere;
  readonly ocean: Ocean;
  readonly terrain: Terrain;
  readonly scans: ScanCache;
  readonly post: Post;
  readonly clouds = new Clouds();
  /** The grade for the hour and the weather where the eye is. */
  readonly colour = new ColourScript();
  readonly fall = new Fall();
  readonly galeAir = new GaleAir();
  readonly beacons = new Beacons(1);
  readonly landmarks = new Landmarks();
  readonly floes = new Floes();
  readonly moonbow = new Moonbow();
  readonly fog = new Fog();
  readonly flora = new Flora();
  readonly motes = new Motes();
  readonly #up = new Vector3();
  readonly #focus = new Vector3();
  readonly #canvas: HTMLCanvasElement;
  readonly #wind = new Vector3();
  readonly #buffer = new Vector2();
  /** The share of the canvas the scene is drawn at, each way. */
  readonly #resolution: Resolution;
  /** Mistwood's mist: always some rolling out of the wood. */
  readonly #mist = { at: new Vector3(0, 1, 0), radius: 240, amount: 0.35 };
  readonly #sea: SeaState = { ...CALM_SEA, fetch: 12000, swell: 0.6, swellLength: 40, swellHeading: 0.9, chop: 1 };
  #fps = 60;
  #last = 0;
  /** The planet seen whole, from five radii out: what the materials are gathered for (#compile). */
  readonly #whole = (() => {
    const c = new PerspectiveCamera(60, 1, 1, 10 * R);
    c.position.set(0, 0, 5 * R);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    return c;
  })();
  /** Whether the first frame drawn has been checked against the depth the materials were built for. */
  #checked = false;
  #dropReady!: () => void;
  #dropFailed!: (error: unknown) => void;
  /** Ships and immediate weather are prepared before the drop can expose them. */
  readonly dropReady = new Promise<void>((resolve, reject) => { this.#dropReady = resolve; this.#dropFailed = reject; });
  #allBuilt!: () => void;
  #allFailed!: (error: unknown) => void;
  readonly #all = new Promise<void>((resolve, reject) => { this.#allBuilt = resolve; this.#allFailed = reject; });
  /** What the app has asked to be built after the title (later), in order. */
  readonly #later = new Map<Object3D, { group: Object3D; built: () => void; failed: (error: unknown) => void }>();
  readonly #siteReady = new WeakSet<Object3D>();
  /** Whether the scene's materials are built (#build), and what is told the share built meanwhile. */
  #warm: 'no' | 'building' | 'done' | 'failed' = 'no';
  #warmed!: () => void;
  #warmFailed!: (error: unknown) => void;
  readonly warmed = new Promise<void>((resolve, reject) => { this.#warmed = resolve; this.#warmFailed = reject; });
  onWarm?: (f: number) => void;
  /** The canvas's size and pixel ratio, as last set. */
  #size = { w: 0, h: 0, ratio: 0 };
  #shown = false;

  private constructor(canvas: HTMLCanvasElement, renderer: WebGPURenderer, form: keyof typeof RENDER_SCALE, frameRate: 30 | 40) {
    // These may fail before the app starts awaiting them. Keep the rejection available to callers without an
    // unhandled rejection from the stage's own background task.
    void Promise.all([this.warmed, this.dropReady, this.#all]).catch(() => {});
    this.#canvas = canvas;
    this.renderer = renderer;
    this.atmosphere = new Atmosphere(renderer);
    this.ocean = new Ocean(3);
    this.atmosphere.install(this.scene, this.ocean.beneath);
    this.scene.add(this.ocean.mesh);
    this.scans = new ScanCache(renderer);
    this.terrain = new Terrain(landMaterial(this.scans, sharedNoise()));
    this.scene.add(this.terrain.group, this.clouds.group, this.fall.group, this.galeAir.group, this.beacons.group, this.landmarks.group);
    this.scene.add(this.floes.group, this.moonbow.group, this.flora.group);
    this.scene.add(this.motes.mesh);
    this.flora.prepare = (group) => this.#compile(group, true);
    const wood = LANDMARKS.find((l) => REGIONS[l.region].id === 'mistwood');
    if (wood) this.#mist.at.set(wood.pos.x, wood.pos.y, wood.pos.z).normalize();
    this.#resolution = new Resolution(RENDER_SCALE[form], frameRate);
    // every point light without a shadow is clustered, over the frame as the scene pass draws it
    renderer.lighting = new ClusteredLighting(this.#resolution);
    this.post = new Post(renderer, this.scene, this.camera, this.#resolution.scale, this.overlay);
    this.ocean.territory.attach(renderer);
    this.resize();
  }

  /** Makes the renderer, hands it to `first` (the title's paper is made on it before the planet), then builds the
   *  stage. */
  static async create(canvas: HTMLCanvasElement, progress: (f: number) => void = () => {}, first?: (r: WebGPURenderer) => Promise<void>, frameRate: 30 | 40 = 30): Promise<GpuStage> {
    progress(0.02);
    const t0 = performance.now();
    const { renderer, info } = await createRenderer(canvas);
    copyTogether(renderer);
    await first?.(renderer);
    progress(0.5);
    const t1 = performance.now();
    const stage = new GpuStage(canvas, renderer, info.form, frameRate);
    console.info(`boot renderer ${((t1 - t0) / 1000).toFixed(2)} s, stage built ${((performance.now() - t1) / 1000).toFixed(2)} s`);
    progress(1);
    return stage;
  }

  /** The swell's height over sea level at p, metres, for the hulls to ride: the sea the stage draws. */
  wave = (p: V3): number => this.ocean.heightAt(p);

  resize(): void {
    const w = this.#canvas.clientWidth || innerWidth, h = this.#canvas.clientHeight || innerHeight, ratio = pixelRatio(w, h);
    // only when it changes: three sets the canvas's size each time it is asked, even to the size it has, and every
    // time the canvas's drawing buffer is made again
    const s = this.#size;
    if (s.w === w && s.h === h && s.ratio === ratio) return;
    Object.assign(s, { w, h, ratio });
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  /** Points the camera for the view at once, with no flight between modes. */
  /** A loop closed or a trail washed out, for the sea to play. */
  inkMark(m: InkMark): void {
    this.ocean.territory.mark(m);
  }

  /** A wreck has gone down here: it leaves a film on the water. */
  wreck(at: V3): void {
    this.ocean.slicks.add(at);
  }

  snap(): void {
    this.rig.snap();
  }

  /** Lays out the planet for a frame and draws it. */
  frame(v: StageView, dt: number): void {
    this.renderer.info.reset();
    // while the materials are being built, the page is left to them and to the title
    if (this.#warm === 'building' || this.#warm === 'failed') return;
    P.time.value = v.time;
    P.dt.value = dt;
    sunDirection(v.hour, v.tilt, this.sun);
    moonDirection(v.hour, v.tilt, this.moon);
    (P.sunDir.value as Vector3).copy(this.sun);
    (P.moonDir.value as Vector3).copy(this.moon);
    P.moonPhase.value = 0.5 - 0.5 * this.sun.dot(this.moon);
    this.atmosphere.turn = -(v.hour - 12) * 15 * DEG;
    // the aurora is always there over the pole where it is dark, waxing and waning over the minutes; when the sun
    // stands over all of the oval, it is not worked out at all
    const dark = Math.cos(Math.min(Math.PI, Math.acos(Math.max(-1, Math.min(1, this.sun.y))) + OVAL)) < 0.08;
    AURORA.strength.value = dark ? 0.7 + 0.3 * Math.sin(v.time * 0.013) * Math.sin(v.time * 0.031 + 1.3) : 0;
    (P.planet.value as { set(x: number, y: number, z: number, w: number): void }).set(R, R + v.tide, v.tide, R + 180);
    P.ebb.value = v.ebb;
    this.ocean.territory.set(v.territory, v.time, v.target.pos);
    this.ocean.slicks.update(v.time);
    // the deep water's colour under the eye, for the sea the sky draws past the horizon
    seaDeepAt(v.target.pos, P.seaDeep.value as Vector3);
    const wind = this.#wind.set(v.wind.x, v.wind.y, v.wind.z);
    (P.wind.value as Vector3).copy(wind);
    (P.drift.value as Vector3).addScaledVector(wind, dt);
    if (v.storm) {
      const c = v.storm.centre;
      (P.storm.value as { set(x: number, y: number, z: number, w: number): void }).set(c.x, c.y, c.z, Math.cos(Math.min(Math.PI, v.storm.radius / R)));
      P.stormOn.value = 1;
    } else P.stormOn.value = 0;
    SCREEN.storm.value = v.screen?.storm ?? 0;
    SCREEN.hurt.value = v.screen?.hurt ?? 0;
    SCREEN.low.value = v.screen?.low ?? 0;

    const cam = this.camera;
    this.resize();
    this.rig.sea = v.tide;
    this.rig.update(cam, v.camera, v.target, this.sun, dt, v.time);
    this.onCamera?.(cam);
    cam.updateMatrixWorld();
    const eye = cam.position;
    const up = eye.clone().normalize();
    P.night.value = Math.min(1, Math.max(0, (0.08 - up.dot(this.sun)) / 0.16));
    P.space.value = Math.min(1, Math.max(0, (eye.length() - R - 150) / 900));

    shape.system('clouds');
    this.clouds.update(this.renderer, v.weather, eye, this.sun, this.moon, dt, FAIR_WEATHER);
    const d = this.clouds.depth;
    P.rain.value = Math.max(d.rain ?? 0, d.thunder ?? 0);
    // the full map looks at the planet from outside its weather: the grade of a squall or the ash the eye dips into is not on the chart
    this.colour.update({ elevation: sunSeen(up.dot(this.sun), eye.length() - R), rising: rising(up, this.sun), weather: v.camera === 'orbit' ? {} : d }, dt);
    P.snow.value = d.snow ?? 0;
    P.flash.value = this.clouds.flash;
    this.fall.update(eye, wind, { rain: P.rain.value, snow: P.snow.value, ash: d.ash ?? 0 });
    this.galeAir.update(v.gale ?? null);
    // a squall raises the sea, a thunderhead most
    this.#seaFromWind(eye, wind, Math.max((d.rain ?? 0) * 0.55, d.thunder ?? 0));
    shape.system('sky');
    this.atmosphere.update(cam, dt);
    // sea smoke off the cold water round the pole, thickest in the polar night and blown away by a wind
    const poleNight = Math.min(1, Math.max(0, (0.08 - this.sun.y) / 0.16));
    const calm = 1 - Math.min(1, Math.max(0, (wind.length() - 6) / 6));
    shape.system('fog');
    this.fog.update(this.renderer, eye, v.weather, (0.4 + 0.6 * poleNight) * calm, this.#mist);
    const size = this.renderer.getDrawingBufferSize(this.#buffer);
    shape.system('clouds');
    this.clouds.trace(this.renderer, size.x * this.#resolution.scale, size.y * this.#resolution.scale);
    shape.system('flora');
    this.flora.update(this.renderer, cam, this.#focus.set(v.target.pos.x, v.target.pos.y, v.target.pos.z).multiplyScalar(R + (v.target.height ?? 2.5)));
    this.motes.update(eye, v.target.pos);
    this.motes.mesh.visible = eye.length() - R < 200;
    this.ocean.flow.calms(v.weather, eye);
    shape.system('sea');
    this.ocean.update(this.renderer, eye, v.time, dt);
    shape.system('land');
    this.terrain.update(eye);
    this.scans.update(eye, dt);
    this.beacons.update(v.time, P.night.value as number, this.sun, eye);
    this.landmarks.update(P.night.value as number, v.time, this.sun);
    // An individual site becomes drawable after its own preparation, without waiting for every region's sites.
    for (const group of [this.beacons.group, this.landmarks.group]) {
      for (const site of group.children) if (!this.#siteReady.has(site)) site.visible = false;
    }
    this.floes.update(v.time, v.tide, P.night.value as number);
    this.moonbow.update(eye, wind.length());
    shape.system('actors');
    runFrameWork(this.renderer);
    shape.system('scene');
    // nothing is drawn until every material in the scene is built (warm)
    if (this.#warm !== 'done') {
      if (this.#warm === 'no') {
        this.#warm = 'building';
        void this.#build().catch((error: unknown) => {
          if (this.#warm !== 'done') this.#warm = 'failed';
          this.#warmFailed(error);
          this.#dropFailed(error);
          this.#allFailed(error);
          for (const later of this.#later.values()) later.failed(error);
          console.error('prepare failed', error);
        });
      }
      return;
    }
    this.post.shafts.update(this.camera, this.#up.copy(this.camera.position).normalize());
    this.post.render();
    if (!this.#checked) {
      this.#checked = true;
      if (this.post.sceneDepth !== SCENE_DEPTH) console.warn(`the scene is drawn ${this.post.sceneDepth} renders deep, not ${SCENE_DEPTH}: its materials were built for the wrong depth and are built again`);
    }

    const now = performance.now();
    if (this.#last) this.#fps += (1000 / Math.max(now - this.#last, 1) - this.#fps) * 0.05;
    if (this.#last && this.#resolution.frame((now - this.#last) / 1000)) this.post.rescale(this.#resolution.scale);
    this.#last = now;
    if (!this.#shown) this.#show();
  }

  /** iOS lays the canvas out as a plain element before three gives it its WebGPU context, and never composites what is
   *  drawn into it until it is laid out again: once the first frame is drawn, it is hidden for a frame and shown. */
  #show(): void {
    this.#shown = true;
    const c = this.#canvas;
    c.style.display = 'none';
    requestAnimationFrame(() => { c.style.display = ''; });
  }

  /** The wind sea from the wind where the camera looks, and the gusts of the weather over it: rebuilt only when it
   *  has moved by a step. */
  #seaFromWind(eye: Vector3, wind: Vector3, storm: number): void {
    const speed = Math.min(Math.max(wind.length(), 2) + storm * 9, 20);
    const s = this.#sea;
    const before = s.heading;
    this.ocean.sea = s;
    this.ocean.windToward(eye, wind.lengthSq() > 1e-6 ? wind : new Vector3(1, 0, 0));
    const heading = this.ocean.sea.heading;
    if (Math.abs(speed - s.wind) >= WIND_STEP) s.wind = Math.round(speed / WIND_STEP) * WIND_STEP;
    if (Math.abs(Math.atan2(Math.sin(heading - before), Math.cos(heading - before))) >= HEADING_STEP) s.heading = heading;
    this.ocean.sea = s;
  }

  /**
   * Builds every material in the scene before it is drawn: drawn straight away, the first frame built them all at
   * once and held the page still for the better part of 20 s on the iPad. It starts from the first frame, so the lights
   * stand as that frame set them (which lights cast shadows is part of what a material is built for), and draws
   * nothing until the planet the title shows is built. What the title can do without (the ships and all they carry,
   * asked for by the app, and the regions' beacons and landmarks: two thirds of the materials, and nothing that shows
   * from orbit) is built after that, with the title up, each hidden until its own are.
   */
  async #build(): Promise<void> {
    // the land's material is built for its chunks, the first of which the workers are still making
    await this.terrain.faces;
    this.atmosphere.shadows.node.ready(this.camera, this.renderer);
    // the land's chunks are shown by the view that wants them
    this.terrain.update(this.#whole.position);
    const later = [...this.#later.values()], sites = [this.beacons.group, this.landmarks.group];
    for (const group of [...later.map((l) => l.group), ...sites]) group.visible = false;
    await this.#compile(this.scene, false, (f) => this.onWarm?.(f), 'title');
    this.#warm = 'done';
    this.#warmed();
    // after the title, what a match brings in first: the ships with their shot and wreckage; then the weather's falls
    // and the floes; then the beacons and landmarks
    for (const { group, built } of later) {
      await this.#compile(group, true);
      group.visible = true;
      built();
    }
    // The orbit title hides the near-eye motes and can hide the cloud composite. Prepare those explicitly along
    // with weather; all other scene roots are either visible in the title or have their own preparation owner.
    for (const [group, label] of [
      [this.clouds.group, 'clouds'], [this.motes.mesh, 'motes'], [this.fall.group, 'fall'],
      [this.galeAir.group, 'gale'], [this.moonbow.group, 'moonbow'], [this.floes.group, 'floes'],
    ] as const) {
      await this.#compile(group, true, undefined, label);
    }
    this.#dropReady();
    // A world-sized sites batch used to keep building far-away variants while the player dropped. Prepare one
    // site at a time, nearest the live camera first. Re-sort after each job so a moved camera gets priority; every
    // site still finishes, and unprepared children remain hidden until their own material variants are ready.
    const pending = sites.flatMap((group) => group.children.map((site) => ({ site, at: site.getWorldPosition(new Vector3()) })));
    for (const group of sites) group.visible = true;
    while (pending.length) {
      pending.sort((a, b) => a.at.distanceToSquared(this.camera.position) - b.at.distanceToSquared(this.camera.position));
      const { site } = pending.shift()!;
      await this.#compile(site, true, undefined, `site ${site.name || site.type}`);
      this.#siteReady.add(site);
      site.visible = true;
    }
    // No second scene-wide traversal: actors, flora and each site's hidden variants have already been prepared
    // by their owners. Traversing them all again creates render objects for hidden terrain and plant instances.
    this.#allBuilt();
  }

  /** Builds `group`'s materials after the title's (#build), in the order asked, keeping it hidden till then; resolves
   *  once they are built. Asked before the first frame. */
  later(group: Object3D): Promise<void> {
    return new Promise((built, failed) => { this.#later.set(group, { group, built, failed }); });
  }

  /**
   * Builds the materials of everything under `root` as the scene pass will draw them, one object at a time between
   * the page's other work, with three's compileAsync. That builds for the call depth it is made at, and the scene is
   * drawn deeper, inside the frame's own pass; so the draws are gathered at the pass's depth, and each object is built
   * into the pass's target and with its outputs, which are set for that object alone and put back before anything
   * else may run (the frames go on meanwhile). `root` is gathered as if shown, with the whole planet in view, so
   * nothing is left out for lying off the edge of the frame; with `hidden`, so is all that lies hidden under it.
   */
  #compile(root: Object3D, hidden: boolean, progress?: (f: number) => void, label = root.name || root.type): Promise<void> {
    return serializePreparation(this.renderer, async () => {
      const since = performance.now();
      if (import.meta.env.VITE_RELEASE !== '1') console.info(`prepare ${label}: start`);
      try { await this.#compileNow(root, hidden, progress); }
      finally {
        if (import.meta.env.VITE_RELEASE !== '1') console.info(`prepare ${label}: ${((performance.now() - since) / 1000).toFixed(2)} s`);
      }
    });
  }

  async #compileNow(root: Object3D, hidden: boolean, progress?: (f: number) => void): Promise<void> {
    const r = this.renderer as unknown as Internals, pass = this.post.scenePass;
    const { _renderContexts: contexts, _nodes: nodes, _pipelines: pipelines } = r;
    const get = contexts.get, build = nodes.getForRenderAsync, pipeline = pipelines.getForRender;
    const created = this.renderer.debug.onNodeBuilderCreated;
    // Only optional sites spend this frame-paced budget; title, actors and immediate weather keep their critical
    // preparation path. Share the budget across a site's builders so the next object cannot start another burst.
    const yieldSite = root.parent === this.beacons.group || root.parent === this.landmarks.group ? sitePreparationYield() : undefined;
    this.renderer.debug.onNodeBuilderCreated = (builder, object) => {
      created?.(builder, object);
      const context = (object as { context: unknown }).context;
      const buildForTarget = () => buildNodeForTargetAsync(builder, pass.renderTarget, pass.getMRT(), context, yieldSite);
      (builder as unknown as { buildAsync(): Promise<object> }).buildAsync = yieldSite
        ? async () => { await yieldSite(); return buildForTarget(); }
        : buildForTarget;
    };
    // an object is built in one go, straight after its target is set, and the target is put back once its pipeline is
    // asked for, the last step before three waits for it (and only then: the frames draw meanwhile, and ask for theirs)
    let set = false;
    const unset = () => {
      if (!set) return;
      set = false;
      r.setRenderTarget(null);
      r.setMRT(null);
    };
    nodes.getForRenderAsync = (ro: unknown) => {
      r.setRenderTarget(pass.renderTarget);
      r.setMRT(pass.getMRT());
      set = true;
      try {
        // Native async building yields between shader stages. Its builder hook borrows the target separately for
        // each stage; restore it now, then set it again only for Three's synchronous bindings/pipeline preparation.
        return build.call(nodes, ro).then((state) => {
          r.setRenderTarget(pass.renderTarget);
          r.setMRT(pass.getMRT());
          set = true;
          return state;
        });
      } finally {
        unset();
      }
    };
    // Keep Three's per-object await: background preparation must not flood the driver with pipelines.
    pipelines.getForRender = (ro: unknown, promises: unknown) => {
      // compileAsync resumes after its initial target was restored; regular frame draws have no promises array.
      if (Array.isArray(promises)) {
        r.setRenderTarget(pass.renderTarget);
        r.setMRT(pass.getMRT());
        set = true;
      }
      try {
        return pipeline.call(pipelines, ro, promises);
      } finally {
        unset();
      }
    };
    // shown for the gathering: `root` itself, and with `hidden` everything under it but the lights (which lights shine
    // is part of what every material is built for, and a light is shown only while it is lit)
    const shown: Object3D[] = [];
    root.traverse((o) => {
      if (o.visible || (o !== root && (!hidden || (o as { isLight?: boolean }).isLight))) return;
      shown.push(o);
      o.visible = true;
    });
    // and nothing tested against the view, which holds the whole planet: the tests would work out the bounds of every
    // hidden thing at once (half a second on the iPad), where the frames work each out when it is first seen
    const culled: Object3D[] = [];
    root.traverse((o) => {
      if (!o.frustumCulled) return;
      culled.push(o);
      o.frustumCulled = false;
    });
    contexts.get = (target: unknown, mrt: unknown) => get.call(contexts, target, mrt, SCENE_DEPTH);
    r.setRenderTarget(pass.renderTarget);
    r.setMRT(pass.getMRT());
    set = true;
    let built: Promise<void>;
    try {
      // the key of the scene's lights, which every material is built for, is worked out once per draw call and kept
      // until the next; the first material built sets the lights' nodes up and changes it, and with no draws between
      // them the rest would be built for the stale key and built again by the first frame: so each counts as a call
      built = this.renderer.compileAsync(root, this.#whole, root === this.scene ? null : this.scene, (e: ProgressEvent) => {
        (this.renderer.info as { calls: number }).calls++;
        progress?.(e.loaded / Math.max(e.total, 1));
      });
    } finally {
      contexts.get = get;
      for (const o of shown) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
      unset();
    }
    try {
      await built;
    } finally {
      unset();
      nodes.getForRenderAsync = build;
      pipelines.getForRender = pipeline;
      this.renderer.debug.onNodeBuilderCreated = created;
    }
  }

  /** Resolves when every material is built and the land round the camera has been built and painted. */
  async settled(): Promise<void> {
    await this.#all;
    await this.terrain.settled();
    await this.flora.settled();
    await this.scans.settled(this.camera.position);
    await this.ocean.coast.ready;
    await this.ocean.flow.ready;
  }

  stats() {
    const info = this.renderer.info.render, tr = this.terrain.stats;
    return { tris: info.triangles, calls: info.drawCalls, fps: this.#fps, scale: this.#resolution.scale, chunks: tr.drawn, pending: tr.pending + tr.queued, plants: this.flora.copies };
  }
}
