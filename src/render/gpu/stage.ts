// The planet on screen, on WebGPU: the atmosphere and its light, the sun's shadows, the FFT ocean, the land painted
// with its regions' scans, and the frame's finish, seen through the same camera rig and driven by the same StageView
// as the WebGL stage. The app takes it with ?gpu while the rest of the planet moves across; nothing here reads the
// simulation.
import { PerspectiveCamera, Scene, Vector3, type WebGPURenderer } from 'three/webgpu';
import { RENDER_SCALE, createRenderer } from './renderer.ts';
import { Post, SCREEN } from './post.ts';
import { P } from './uniforms.ts';
import { makeNoiseTexture } from './noise.ts';
import { Atmosphere } from '../atmosphere/index.ts';
import { Clouds } from '../atmosphere/clouds.ts';
import { Fall } from '../atmosphere/fall.ts';
import { Ocean, CALM_SEA, type SeaState } from '../ocean/index.ts';
import { Terrain } from '../terrain.ts';
import { ScanCache } from '../land/scans.ts';
import { landMaterial } from '../land/material.ts';
import { CameraRig } from '../camera.ts';
import { Beacons } from '../regions/beacons.ts';
import { GPU } from '../actors/common.ts';
import { moonDirection, sunDirection } from '../sky.ts';
import { R } from '../../sim/sphere.ts';
import type { V3 } from '../../sim/math.ts';
import type { StageView } from '../stage.ts';

const DEG = Math.PI / 180;
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
  readonly fall = new Fall();
  readonly beacons = new Beacons(1, true);
  readonly #canvas: HTMLCanvasElement;
  readonly #focus = new Vector3();
  readonly #wind = new Vector3();
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
    this.terrain = new Terrain(landMaterial(this.scans, makeNoiseTexture()));
    this.scene.add(this.terrain.group, this.clouds.group, this.fall.group, this.beacons.group);
    this.post = new Post(renderer, this.scene, this.camera, phone ? RENDER_SCALE.phone : RENDER_SCALE.desktop, this.overlay);
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement, progress: (f: number, what: string) => void = () => {}): Promise<GpuStage> {
    progress(0.02, 'Charting the seas');
    // whatever the stage builds from here takes its node materials
    GPU.on = true;
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
    (P.planet.value as { set(x: number, y: number, z: number, w: number): void }).set(R, R + v.tide, v.tide, R + 180);
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

    this.clouds.update(this.renderer, v.weather, eye, this.sun, this.moon, dt);
    const d = this.clouds.depth;
    P.rain.value = Math.max(d.rain ?? 0, d.thunder ?? 0);
    P.snow.value = d.snow ?? 0;
    P.flash.value = this.clouds.flash;
    this.fall.update(eye, wind, { rain: P.rain.value, snow: P.snow.value, ash: d.ash ?? 0 });
    // a squall raises the sea, a thunderhead most
    this.#seaFromWind(eye, wind, Math.max((d.rain ?? 0) * 0.55, d.thunder ?? 0));
    this.atmosphere.update(cam, dt);
    this.ocean.update(this.renderer, eye, v.time, dt);
    this.terrain.update(eye);
    this.scans.update(eye, dt);
    this.beacons.update(v.time, P.night.value as number, this.sun);
    this.post.render();

    const now = performance.now();
    if (this.#last) this.#fps += (1000 / Math.max(now - this.#last, 1) - this.#fps) * 0.05;
    this.#last = now;
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
    await this.scans.settled(this.camera.position);
  }

  stats() {
    const info = this.renderer.info.render, tr = this.terrain.stats;
    return { tris: info.triangles, calls: info.drawCalls, fps: this.#fps, scale: RENDER_SCALE.desktop, chunks: tr.drawn, pending: tr.pending + tr.queued };
  }
}
