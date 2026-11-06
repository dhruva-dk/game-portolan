// The planet on screen, on WebGPU: the atmosphere and its light, the sun's shadows, the FFT ocean, the land painted
// with its regions' scans, the plants, the beacons and landmarks, the ships, and the frame's finish, seen through the
// camera rig and driven by the StageView the app makes each frame; nothing here reads the simulation.
import { PerspectiveCamera, Scene, Vector2, Vector3, type Matrix4, type WebGPURenderer } from 'three/webgpu';
import { RENDER_SCALE, createRenderer } from './renderer.ts';
import { Post, SCREEN } from './post.ts';
import { ColourScript, rising } from './grade.ts';
import { ClusteredLighting } from './clusters.ts';
import { runFrameWork } from './work.ts';
import { P } from './uniforms.ts';
import { sharedNoise } from './noise.ts';
import { Atmosphere } from '../atmosphere/index.ts';
import { Clouds } from '../atmosphere/clouds.ts';
import { AURORA, OVAL } from '../atmosphere/aurora.ts';
import { Fog } from '../atmosphere/fog.ts';
import { EYE } from '../atmosphere/luts.ts';
import { LANTERNS } from '../lanterns.ts';
import { LANDMARKS, REGIONS } from '../../sim/world/index.ts';
import { Fall } from '../atmosphere/fall.ts';
import { Ocean, CALM_SEA, type SeaState } from '../ocean/index.ts';
import { Terrain } from '../terrain.ts';
import { ScanCache } from '../land/scans.ts';
import { landMaterial } from '../land/material.ts';
import { CameraRig } from '../camera.ts';
import { Beacons } from '../regions/beacons.ts';
import { Landmarks } from '../regions/landmarks.ts';
import { Floes } from '../regions/floes.ts';
import { EventRocks } from '../regions/eventRocks.ts';
import { EventKelp } from '../regions/eventKelp.ts';
import { EventClams } from '../regions/eventClams.ts';
import { EventPetals } from '../regions/eventPetals.ts';
import { Moonbow } from '../regions/moonbow.ts';
import { Flora } from '../flora/field.ts';
import { rideOn } from '../swell.ts';
import { seaLift, setLifts } from '../lift.ts';
import { seaDeepAt } from '../seaTint.ts';
import { moonDirection, sunDirection } from '../sun.ts';
import { R } from '../../sim/sphere.ts';
import type { V3 } from '../../sim/math.ts';
import type { StageView } from '../stage.ts';

const DEG = Math.PI / 180;
const NO_LIFT: readonly number[] = [];
/** How built up the fair-weather cumulus is over the planet, where its own map heaps it most. */
const FAIR_WEATHER = 0.62;
/** The wind sea is rebuilt only when the wind has changed by this much, m/s and radians: a rebuild is a pop. */
const WIND_STEP = 0.75;
const HEADING_STEP = 8 * DEG;

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
  readonly beacons = new Beacons(1);
  readonly landmarks = new Landmarks();
  readonly floes = new Floes();
  readonly rocks = new EventRocks();
  readonly kelp = new EventKelp();
  readonly clams = new EventClams();
  readonly petals = new EventPetals();
  readonly moonbow = new Moonbow();
  readonly fog = new Fog();
  readonly flora = new Flora();
  readonly #canvas: HTMLCanvasElement;
  readonly #focus = new Vector3();
  readonly #wind = new Vector3();
  readonly #forward = new Vector3();
  readonly #buffer = new Vector2();
  /** The scene's resolution as a share of the screen's. */
  readonly #scale: number;
  readonly #mist = { at: new Vector3(0, 1, 0), radius: 240, amount: 0 };
  readonly #sea: SeaState = { ...CALM_SEA, fetch: 12000, swell: 0.6, swellLength: 40, swellHeading: 0.9, chop: 1 };
  #fps = 60;
  #last = 0;

  private constructor(canvas: HTMLCanvasElement, renderer: WebGPURenderer, phone: boolean) {
    this.#canvas = canvas;
    this.renderer = renderer;
    this.atmosphere = new Atmosphere(renderer);
    this.ocean = new Ocean(3);
    this.atmosphere.install(this.scene, this.ocean.beneath);
    this.scene.add(this.ocean.mesh);
    this.scans = new ScanCache(renderer);
    this.terrain = new Terrain(landMaterial(this.scans, sharedNoise()));
    this.scene.add(this.terrain.group, this.clouds.group, this.fall.group, this.beacons.group, this.landmarks.group);
    this.scene.add(this.floes.group, this.rocks.group, this.kelp.group, this.clams.group, this.petals.group, this.moonbow.group, this.flora.group);
    // what floats rides the sea this stage draws
    rideOn((p, slope) => this.ocean.heightAt(p, slope) + seaLift(p));
    const wood = LANDMARKS.find((l) => REGIONS[l.region].id === 'mistwood');
    if (wood) this.#mist.at.set(wood.pos.x, wood.pos.y, wood.pos.z).normalize();
    this.#scale = phone ? RENDER_SCALE.phone : RENDER_SCALE.desktop;
    // every point light without a shadow is clustered, over the frame as the scene pass draws it
    renderer.lighting = new ClusteredLighting(this.#scale);
    this.post = new Post(renderer, this.scene, this.camera, this.#scale, this.overlay, this.atmosphere.sun);
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement, progress: (f: number, what: string) => void = () => {}): Promise<GpuStage> {
    progress(0.02, 'Charting the seas');
    const { renderer, info } = await createRenderer(canvas);
    progress(0.5, 'Raising the islands');
    const stage = new GpuStage(canvas, renderer, info.phone);
    progress(1, '');
    return stage;
  }

  /** The swell's height over sea level at p, metres, for the hulls to ride: the sea the stage draws. */
  wave = (p: V3): number => this.ocean.heightAt(p);

  resize(): void {
    const w = this.#canvas.clientWidth || innerWidth, h = this.#canvas.clientHeight || innerHeight;
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
    setLifts(v.lift ?? NO_LIFT);
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
    this.rig.update(cam, v.camera, v.target, this.sun, dt, v.time);
    this.onCamera?.(cam);
    cam.updateMatrixWorld();
    const eye = cam.position;
    const t = v.target.pos;
    this.#focus.set(t.x, t.y, t.z).normalize().multiplyScalar(R + v.tide);
    const up = eye.clone().normalize();
    P.night.value = Math.min(1, Math.max(0, (0.08 - up.dot(this.sun)) / 0.16));
    P.space.value = Math.min(1, Math.max(0, (eye.length() - R - 150) / 900));

    this.clouds.update(this.renderer, v.weather, eye, this.sun, this.moon, dt, FAIR_WEATHER);
    const d = this.clouds.depth;
    P.rain.value = Math.max(d.rain ?? 0, d.thunder ?? 0);
    this.colour.update({ elevation: up.dot(this.sun), rising: rising(up, this.sun), weather: d }, dt);
    P.snow.value = d.snow ?? 0;
    P.flash.value = this.clouds.flash;
    this.fall.update(eye, wind, { rain: P.rain.value, snow: P.snow.value, ash: d.ash ?? 0 });
    // a squall raises the sea, a thunderhead most
    this.#seaFromWind(eye, wind, Math.max((d.rain ?? 0) * 0.55, d.thunder ?? 0));
    this.atmosphere.update(cam, dt);
    this.#mistFrom(v);
    // sea smoke off the cold water round the pole, thickest in the polar night and blown away by a wind
    const poleNight = Math.min(1, Math.max(0, (0.08 - this.sun.y) / 0.16));
    const calm = 1 - Math.min(1, Math.max(0, (wind.length() - 6) / 6));
    this.fog.update(this.renderer, eye, cam.getWorldDirection(this.#forward), EYE.viewProjection.value as Matrix4, v.weather,
      (0.4 + 0.6 * poleNight) * calm, this.#mist, LANTERNS, this.atmosphere.shadows.slices);
    const size = this.renderer.getDrawingBufferSize(this.#buffer);
    this.clouds.march(this.renderer, size.x * this.#scale, size.y * this.#scale, eye, this.#forward, EYE.viewProjection.value as Matrix4);
    this.flora.update(this.renderer, cam);
    this.ocean.flow.set(v.currents);
    this.ocean.flow.calms(v.weather, eye);
    this.ocean.update(this.renderer, eye, v.time, dt);
    this.terrain.update(eye);
    this.scans.update(eye, dt);
    this.beacons.update(v.time, P.night.value as number, this.sun);
    this.landmarks.update(P.night.value as number, v.time, v.events, this.sun);
    this.floes.update(v.floes ?? v.time, v.tide, P.night.value as number);
    this.rocks.update(v.events, v.time);
    this.kelp.update(v.events, v.time, v.tide);
    this.clams.update(v.events, v.time, v.tide);
    this.petals.update(this.#focus, v.events, v.currents, v.time, v.tide, dt);
    this.moonbow.update(eye, wind.length());
    runFrameWork(this.renderer);
    this.post.focus(v.focus ?? null);
    this.post.render(dt);

    const now = performance.now();
    if (this.#last) this.#fps += (1000 / Math.max(now - this.#last, 1) - this.#fps) * 0.05;
    this.#last = now;
  }

  /** Mistwood's mist: always some rolling out of the wood, and thick in its Fog Surge. */
  #mistFrom(v: StageView): void {
    const m = this.#mist;
    const e = v.events?.mistwood;
    const surge = e?.phase === 'running' ? Math.min(1, e.since / 5, e.left / 5) : 0;
    m.amount = 0.35 + 0.65 * surge;
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

  /** Resolves when the land round the camera has been built and painted. */
  async settled(): Promise<void> {
    await this.terrain.settled();
    await this.flora.settled();
    await this.scans.settled(this.camera.position);
    await this.ocean.coast.ready;
    await this.ocean.flow.ready;
  }

  stats() {
    const info = this.renderer.info.render, tr = this.terrain.stats;
    return { tris: info.triangles, calls: info.drawCalls, fps: this.#fps, scale: RENDER_SCALE.desktop, chunks: tr.drawn, pending: tr.pending + tr.queued, plants: this.flora.copies };
  }
}
