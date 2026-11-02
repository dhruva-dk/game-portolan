// The planet on screen: the engine (HDR, bloom and the grade), the sky and its light, the terrain, the water, the
// weather's formations, the landmarks the terrain can't make, the beacons, the floes and the rock the regions' events
// move, seen through the camera rig. The app hands it a StageView every frame, made from the match or from a fixed
// scene; nothing here reads the simulation.
import * as THREE from 'three';
import { Engine, QUALITY, U, loadTextures, type Quality, type Textures } from './engine.ts';
import { Sky, moonDirection, sunDirection } from './sky.ts';
import { Terrain } from './terrain.ts';
import { terrainMaterial } from './ground.ts';
import { Water } from './water.ts';
import { Weather, type WeatherDepth, type WeatherSystem } from './weather.ts';
import { CameraRig, type CameraMode, type CameraTarget } from './camera.ts';
import { Landmarks } from './regions/landmarks.ts';
import { Beacons } from './regions/beacons.ts';
import { Floes } from './regions/floes.ts';
import { EventRocks, type EventPhase } from './regions/eventRocks.ts';
import { setLifts } from './lift.ts';
import { R } from '../sim/sphere.ts';
import type { V3 } from '../sim/math.ts';
import type { RegionId } from '../sim/world/index.ts';

export type { CameraMode, CameraTarget } from './camera.ts';
export type { WeatherSystem } from './weather.ts';
export type { EventPhase } from './regions/eventRocks.ts';

const NO_LIFT: readonly number[] = [];

export interface StageView {
  /** Seconds on the clock every animated thing shares: the swell, ripples and beacons. Give the actors the same. */
  time: number;
  /** The planet's clock, 0…24: the sun stands over longitude −(hour − 12) × 15°. */
  hour: number;
  /** The sun's latitude, in degrees. */
  tilt: number;
  /** Sea level against the mean, in metres. */
  tide: number;
  /** How far round their rings the Ice Crown's floes have ridden, in seconds; `time` when absent. */
  floes?: number;
  /** How far the regions' events move the sea now, metres at the middle of each of the world's LIFTS; none when absent. */
  lift?: readonly number[];
  /** Where the regions' events have got to, for the rock they move (the Spires' fall, the Narrows' rockfall); none under way when absent. */
  events?: Partial<Record<RegionId, EventPhase>>;
  /** The wind where the camera looks, a tangent in metres per second. */
  wind: V3;
  camera: CameraMode;
  target: CameraTarget;
  weather: readonly WeatherSystem[];
  /** The safe circle: its centre (a unit vector) and its radius along the surface in metres; null before it forms. */
  storm: { centre: V3; radius: number } | null;
  /** Each cell's owner and trail as ship index + 1 (the simulation's grid), with a version that changes with them. */
  territory: { owner: Uint8Array; trail: Uint8Array; version: number; me: number } | null;
  /** Screen-wide tints, 0…1: outside the safe circle, just hurt, and low on hull. */
  screen?: { storm: number; hurt: number; low: number };
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(58, 1, 0.25, 4000);
  readonly rig = new CameraRig();
  /** The sun and moon this frame, unit vectors. */
  readonly sun = new THREE.Vector3(1, 0, 0);
  readonly moon = new THREE.Vector3(-1, 0, 0);
  /** The point the camera follows, in metres. */
  readonly focus = new THREE.Vector3(0, R, 0);
  readonly depth: WeatherDepth = {};
  /** Called once the rig has placed the camera each frame, before anything is drawn: for shake laid on top. */
  onCamera: ((cam: THREE.PerspectiveCamera) => void) | null = null;
  private readonly up = new THREE.Vector3();

  readonly engine: Engine;
  readonly tex: Textures;
  readonly sky: Sky;
  readonly terrain: Terrain;
  readonly water: Water;
  readonly weather: Weather;
  readonly landmarks: Landmarks;
  readonly beacons: Beacons;
  readonly floes = new Floes();
  readonly rocks = new EventRocks();

  private constructor(engine: Engine, tex: Textures, sky: Sky, terrain: Terrain, water: Water, weather: Weather, landmarks: Landmarks, beacons: Beacons) {
    this.engine = engine;
    this.tex = tex;
    this.sky = sky;
    this.terrain = terrain;
    this.water = water;
    this.weather = weather;
    this.landmarks = landmarks;
    this.beacons = beacons;
    // the atmosphere rides on three's fog chunks, so a fog must exist for them to compile in
    this.scene.fog = new THREE.Fog(0xffffff, 1, 2);
    this.scene.add(sky.group, terrain.group, water.mesh, weather.group, landmarks.group, beacons.group, this.floes.group, this.rocks.group);
    terrain.detail = engine.quality.detail;
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement, quality: Quality = QUALITY.balanced, progress: (f: number, what: string) => void = () => {}): Promise<Stage> {
    const engine = new Engine(canvas);
    engine.setQuality(quality);
    progress(0.02, 'Charting the seas');
    const tex = await loadTextures((f) => progress(0.05 + f * 0.75, 'Painting the land'));
    progress(0.82, 'Raising the islands');
    await new Promise((r) => setTimeout(r, 0));
    const sky = new Sky(quality.shadow);
    const terrain = new Terrain(terrainMaterial(tex));
    const water = new Water(tex, quality.reflect);
    const weather = new Weather(quality.puffs);
    progress(0.9, 'Lighting the beacons');
    await new Promise((r) => setTimeout(r, 0));
    const stage = new Stage(engine, tex, sky, terrain, water, weather, new Landmarks(), new Beacons());
    progress(1, '');
    return stage;
  }

  setQuality(q: Quality): void {
    this.engine.setQuality(q);
    this.terrain.detail = q.detail;
    this.water.setReflectScale(q.reflect);
    this.weather.setPuffs(q.puffs);
  }

  resize(): void {
    this.engine.resize();
    this.camera.aspect = this.engine.aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Points the camera for the view at once, with no flight between modes. */
  snap(): void {
    this.rig.snap();
  }

  /** Lays out the planet for a frame and draws it. */
  frame(v: StageView, dt: number): void {
    U.uTime.value = v.time;
    sunDirection(v.hour, v.tilt, this.sun);
    moonDirection(v.hour, v.tilt, this.moon);
    U.uPlanet.value.set(R, R + v.tide, v.tide, 0);
    setLifts(v.lift ?? NO_LIFT);
    // ripples and trees: about 1 in a fresh breeze
    U.uWind.value.set(v.wind.x, v.wind.y, v.wind.z).multiplyScalar(0.09);
    U.uDrift.value.addScaledVector(U.uWind.value, dt);
    if (v.storm) {
      const c = v.storm.centre;
      U.uStorm.value.set(c.x, c.y, c.z, Math.cos(Math.min(Math.PI, v.storm.radius / R)));
      U.uStormOn.value = 1;
    } else U.uStormOn.value = 0;
    const s = v.screen, cu = this.engine.composite.uniforms;
    cu.uStorm.value = s?.storm ?? 0;
    cu.uHurt.value = s?.hurt ?? 0;
    cu.uLow.value = s?.low ?? 0;

    const cam = this.camera;
    cam.aspect = this.engine.aspect;
    this.rig.update(cam, v.camera, v.target, this.sun, dt, v.time);
    this.onCamera?.(cam);
    const eye = cam.position;
    const t = v.target.pos;
    this.focus.set(t.x, t.y, t.z).normalize().multiplyScalar(R + v.tide);
    // the sun climbs where the camera is when its westward motion, along (−sun.z, 0, sun.x), heads overhead
    const up = this.up.copy(eye).normalize();
    const rising = up.z * this.sun.x - up.x * this.sun.z > 0;
    this.weather.update(v.weather, eye, dt, this.depth);
    this.sky.update(dt, eye, this.focus, this.sun, this.moon, v.hour, rising, this.depth);
    this.water.rain = Math.max(this.depth.rain ?? 0, this.depth.thunder ?? 0);
    const terr = v.territory;
    this.water.setTerritory(terr?.owner ?? null, terr?.trail ?? null, terr?.version ?? 0, terr?.me ?? 0);
    this.terrain.update(eye);
    this.landmarks.update(this.sky.night);
    this.beacons.update(v.time, this.sky.night);
    this.floes.update(v.floes ?? v.time, v.tide);
    this.rocks.update(v.events, v.time);
    this.engine.render(this.scene, cam, this.sky.grade, dt, () => {
      this.water.prepare(this.engine.renderer, this.scene, cam, this.focus, this.sky.look, this.engine.width, this.engine.height, dt);
    });
  }

  /** Resolves when the terrain round the camera has been built. */
  settled(): Promise<void> {
    return this.terrain.settled();
  }

  stats() {
    const st = this.engine.stats, tr = this.terrain.stats;
    return { tris: st.tris, calls: st.calls, fps: st.fps, scale: this.engine.scale, chunks: tr.drawn, pending: tr.pending + tr.queued };
  }
}
