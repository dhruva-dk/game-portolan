// The planet on screen, on WebGPU: the atmosphere and its light, the sun's shadows, the FFT ocean, the land painted
// with its regions' scans, the plants, the beacons and landmarks, the ships, and the frame's finish, seen through the
// camera rig and driven by the StageView the app makes each frame; nothing here reads the simulation.
import { PerspectiveCamera, Scene, Vector2, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { RENDER_SCALE, createRenderer, pixelRatio } from './renderer.ts';
import { Post, SCREEN } from './post.ts';
import { shape } from './shape.ts';
import { copyTogether } from './behind.ts';
import { ColourScript, rising } from './grade.ts';
import { ClusteredLighting } from './clusters.ts';
import { runFrameWork } from './work.ts';
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
/** How built up the fair-weather cumulus is over the planet, where its own map heaps it most. */
const FAIR_WEATHER = 0.62;
/** The wind sea is rebuilt only when the wind has changed by this much, m/s and radians: a rebuild is a pop. */
const WIND_STEP = 0.75;
const HEADING_STEP = 8 * DEG;

/** How deep in renders the scene is drawn: inside the quad that puts the frame on the screen. */
const SCENE_DEPTH = 1;

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
  readonly #canvas: HTMLCanvasElement;
  readonly #wind = new Vector3();
  readonly #buffer = new Vector2();
  /** The share of the canvas the scene is drawn at, each way. */
  readonly #scale: number;
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
  #allBuilt!: () => void;
  readonly #all = new Promise<void>((r) => { this.#allBuilt = r; });
  /** What the app has asked to be built after the title (later), in order. */
  readonly #later = new Map<Object3D, { group: Object3D; built: () => void }>();
  /** Whether the scene's materials are built (#build), and what is told the share built meanwhile. */
  #warm: 'no' | 'building' | 'done' = 'no';
  #warmed!: () => void;
  readonly warmed = new Promise<void>((r) => { this.#warmed = r; });
  onWarm?: (f: number) => void;
  /** The canvas's size and pixel ratio, as last set. */
  #size = { w: 0, h: 0, ratio: 0 };
  #shown = false;

  private constructor(canvas: HTMLCanvasElement, renderer: WebGPURenderer, form: keyof typeof RENDER_SCALE) {
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
    this.flora.prepare = (group) => this.#compile(group, true);
    const wood = LANDMARKS.find((l) => REGIONS[l.region].id === 'mistwood');
    if (wood) this.#mist.at.set(wood.pos.x, wood.pos.y, wood.pos.z).normalize();
    this.#scale = RENDER_SCALE[form];
    // every point light without a shadow is clustered, over the frame as the scene pass draws it
    renderer.lighting = new ClusteredLighting(this.#scale);
    this.post = new Post(renderer, this.scene, this.camera, this.#scale, this.overlay);
    this.resize();
  }

  /** Makes the renderer, hands it to `first` (the title's paper is made on it before the planet), then builds the
   *  stage. */
  static async create(canvas: HTMLCanvasElement, progress: (f: number) => void = () => {}, first?: (r: WebGPURenderer) => Promise<void>): Promise<GpuStage> {
    progress(0.02);
    const t0 = performance.now();
    const { renderer, info } = await createRenderer(canvas);
    copyTogether(renderer);
    await first?.(renderer);
    progress(0.5);
    const t1 = performance.now();
    const stage = new GpuStage(canvas, renderer, info.form);
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
  snap(): void {
    this.rig.snap();
  }

  /** Lays out the planet for a frame and draws it. */
  frame(v: StageView, dt: number): void {
    // while the materials are being built, the page is left to them and to the title
    if (this.#warm === 'building') return;
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
    const terr = v.territory;
    this.ocean.territory.set(terr?.owner ?? null, terr?.trail ?? null, terr?.version ?? 0, terr?.me ?? 0);
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
    this.colour.update({ elevation: up.dot(this.sun), rising: rising(up, this.sun), weather: d }, dt);
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
    this.clouds.trace(this.renderer, size.x * this.#scale, size.y * this.#scale);
    shape.system('flora');
    this.flora.update(this.renderer, cam);
    this.ocean.flow.calms(v.weather, eye);
    shape.system('sea');
    this.ocean.update(this.renderer, eye, v.time, dt);
    shape.system('land');
    this.terrain.update(eye);
    this.scans.update(eye, dt);
    this.beacons.update(v.time, P.night.value as number, this.sun, eye);
    this.landmarks.update(P.night.value as number, v.time, this.sun);
    this.floes.update(v.time, v.tide, P.night.value as number);
    this.moonbow.update(eye, wind.length());
    shape.system('actors');
    runFrameWork(this.renderer);
    shape.system('scene');
    // nothing is drawn until every material in the scene is built (warm)
    if (this.#warm !== 'done') {
      if (this.#warm === 'no') {
        this.#warm = 'building';
        void this.#build();
      }
      return;
    }
    this.post.render();
    if (!this.#checked) {
      this.#checked = true;
      if (this.post.sceneDepth !== SCENE_DEPTH) console.warn(`the scene is drawn ${this.post.sceneDepth} renders deep, not ${SCENE_DEPTH}: its materials were built for the wrong depth and are built again`);
    }

    const now = performance.now();
    if (this.#last) this.#fps += (1000 / Math.max(now - this.#last, 1) - this.#fps) * 0.05;
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
    await this.#compile(this.scene, false, (f) => this.onWarm?.(f));
    this.#warm = 'done';
    this.#warmed();
    // after the title, what a match brings in first: the ships with their shot and wreckage; then the weather's falls
    // and the floes; then the beacons and landmarks
    for (const { group, built } of later) {
      await this.#compile(group, true);
      group.visible = true;
      built();
    }
    for (const group of [this.fall.group, this.galeAir.group, this.moonbow.group, this.floes.group]) {
      await this.#compile(group, true);
    }
    for (const group of sites) {
      await this.#compile(group, true);
      group.visible = true;
    }
    // and last, everything in the scene still hidden: the parts shown by the hour or the distance; so none of it holds
    // a frame up the first time it shows
    await this.#compile(this.scene, true);
    this.#allBuilt();
  }

  /** Builds `group`'s materials after the title's (#build), in the order asked, keeping it hidden till then; resolves
   *  once they are built. Asked before the first frame. */
  later(group: Object3D): Promise<void> {
    return new Promise((built) => { this.#later.set(group, { group, built }); });
  }

  /**
   * Builds the materials of everything under `root` as the scene pass will draw them, one object at a time between
   * the page's other work, with three's compileAsync. That builds for the call depth it is made at, and the scene is
   * drawn deeper, inside the frame's own pass; so the draws are gathered at the pass's depth, and each object is built
   * into the pass's target and with its outputs, which are set for that object alone and put back before anything
   * else may run (the frames go on meanwhile). `root` is gathered as if shown, with the whole planet in view, so
   * nothing is left out for lying off the edge of the frame; with `hidden`, so is all that lies hidden under it.
   */
  #compile(root: Object3D, hidden: boolean, progress?: (f: number) => void): Promise<void> {
    // one at a time, each setting the renderer up for its own objects
    const run = this.#compiling.then(() => this.#compileNow(root, hidden, progress));
    this.#compiling = run.catch(() => {});
    return run;
  }

  #compiling: Promise<void> = Promise.resolve();

  async #compileNow(root: Object3D, hidden: boolean, progress?: (f: number) => void): Promise<void> {
    const r = this.renderer as unknown as Internals, pass = this.post.scenePass;
    const { _renderContexts: contexts, _nodes: nodes, _pipelines: pipelines } = r;
    const get = contexts.get, build = nodes.getForRenderAsync, pipeline = pipelines.getForRender;
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
        return Promise.resolve(nodes.getForRender(ro));
      } catch (e) {
        unset();
        throw e;
      }
    };
    // three waits for each object's pipeline before it builds the next: they are left to compile together instead,
    // and waited for at the end (which on the iPad took the building after the title from 52 s to 25 s)
    const compiling: Promise<unknown>[] = [];
    pipelines.getForRender = (ro: unknown, promises: unknown) => {
      try {
        return pipeline.call(pipelines, ro, promises ? compiling : promises);
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
      await Promise.all(compiling);
    } finally {
      nodes.getForRenderAsync = build;
      pipelines.getForRender = pipeline;
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
    return { tris: info.triangles, calls: info.drawCalls, fps: this.#fps, scale: this.#scale, chunks: tr.drawn, pending: tr.pending + tr.queued, plants: this.flora.copies };
  }
}
