// The render composition root: the scene and camera a match is drawn in, and the render modules that draw into
// them. Each render package appends its module's factory to MODULES (A6). A module is built when a match screen
// opens and disposed when it closes; every frame it reads the match state, the world and the loop's frame
// (interpolation alpha between the previous tick and the current one, the render clock) and never writes them.
import * as THREE from 'three';
import type { Frame } from '../app/loop.ts';
import type { World } from '../app/worldWorker.ts';
import type { MatchState } from '../sim/state.ts';
import type { Pipeline } from './pipeline.ts';
import { createFlora } from './flora.ts';
import { createSea } from './sea.ts';
import { createSky } from './sky.ts';
import { createStorm } from './storm.ts';
import { createStructures } from './structures.ts';
import { createTerrain, setTerrainCoarsen } from './terrain.ts';
import { createTerritory } from './territory.ts';
import { createTrails } from './trails.ts';
import { createWeather } from './weather.ts';
import { REGION_MODULES } from './regions/index.ts';
import { createShips } from './ships/shipView.ts';
import { createEffects } from './fx.ts';
import { createCurrents } from './currents.ts';
import { createFauna } from './fauna.ts';
import { CameraRig, zoomPhases, type Insets, type RigView } from './camera.ts';
import { Chart, CHART_LAYER, groundOf } from './chart.ts';
import { territories } from './territory.ts';
import { seaFor, type Sea } from '../sim/environment.ts';
import { newSight, survey, type Sight } from '../sim/visibility.ts';
import { SHIPS } from '../sim/state.ts';

/** What a module is built with. */
export interface RenderContext {
  readonly pipeline: Pipeline;
  readonly world: World;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
}

/** A frame of the match: the state after the last tick, drawn at the loop's alpha and clock. */
export interface MatchFrame extends Frame {
  readonly state: MatchState;
}

export interface RenderModule {
  frame(f: MatchFrame): void;
  dispose(): void;
}

type ModuleFactory = (ctx: RenderContext) => RenderModule;

/** The render modules, updated in this order every frame. Append-only (A6). */
const MODULES: readonly ModuleFactory[] = [createSea, createSky, createTerrain, createStructures, createFlora, createTerritory, createTrails, ...REGION_MODULES, createWeather, createStorm, createShips, createEffects, createCurrents, createFauna];

/** WP24 part C: modules whose detail is a pixel or two once the zoom lifts the eye toward orbit, each stood down past
 *  the z it is listed with (the chart globe soaks in from 0.34; the ships stay, their chart marks take over at 0.4), so
 *  the world, and the world and the chart globe together, keep A9's triangle budget at every frame of the zoom. */
const FINE: ReadonlyMap<ModuleFactory, number> = new Map<ModuleFactory, number>([
  [createStructures, 0.25], [createFlora, 0.25], [createEffects, 0.25], ...REGION_MODULES.map((m): [ModuleFactory, number] => [m, 0.3]), [createTrails, 0.34],
]);

export class WorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private readonly modules: RenderModule[];
  /** WP24: the chart (layer 1) and the camera rig. The rig drives the camera only while `drive` is set (the match
   * screen); test pages that place the camera themselves leave it off. */
  readonly chart: Chart;
  readonly rig: CameraRig;
  drive = false;
  private readonly world: World;
  private view: RigView = { width: 1, height: 1, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
  private sea: Sea | null = null;
  private seaSeed = NaN;
  private readonly sights: Sight[] = Array.from({ length: SHIPS }, newSight);
  /** WP24 part C: the fine modules' scene objects, and those stood down this frame. */
  private readonly fine: [THREE.Object3D, number][] = [];
  private readonly stoodDown: THREE.Object3D[] = [];

  constructor(pipeline: Pipeline, world: World) {
    const ctx: RenderContext = { pipeline, world, scene: this.scene, camera: this.camera };
    this.modules = MODULES.map((build) => {
      const n = this.scene.children.length, m = build(ctx);
      for (const c of this.scene.children.slice(n)) c.userData.module ??= build.name;
      const at = FINE.get(build);
      if (at !== undefined) for (const c of this.scene.children.slice(n)) this.fine.push([c, at]);
      return m;
    });
    this.world = world;
    this.chart = new Chart(pipeline.style, world);
    this.scene.add(this.chart.group);
    this.rig = new CameraRig(this.camera, groundOf(world), this.chart.net);
  }

  /** The player's sight this frame (the chart's ships, the camera's focus). */
  sight(state: MatchState): Sight {
    if (this.seaSeed !== state.seed || !this.sea) { this.sea = seaFor(this.world, state.seed); this.seaSeed = state.seed; }
    return survey(this.sea, state, this.sights)[0];
  }

  layout(width: number, height: number, safe: Insets = { top: 0, right: 0, bottom: 0, left: 0 }): void {
    this.view = { width, height, safe };
    this.rig.layout(this.view);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frame(f: MatchFrame): void {
    for (const o of this.stoodDown) o.visible = true;
    this.stoodDown.length = 0;
    setTerrainCoarsen(1);
    if (this.drive) {
      const sight = this.sight(f.state), rig = this.rig;
      rig.seen = sight.ships;
      rig.frame(f.state, f.alpha, f.clock, rig.chartOpen ? 0 : f.dt, f.dt);
      const z = rig.z, ph = zoomPhases(z), r = Math.min(1, Math.max(0, (z - 0.34) / 0.16)), L = this.camera.layers;
      const lod = Math.min(1, Math.max(0, (z - 0.12) / 0.16));
      setTerrainCoarsen(1 + 1.5 * lod * lod * (3 - 2 * lod));
      this.chart.frame(f.state, { z, ...ph, reveal: r * r * (3 - 2 * r) }, this.camera, this.view, sight, territories.get(this.scene)?.wash ?? null);
      if (z <= 0.34) L.set(0);
      else if (z < 0.5) { L.set(0); L.enable(CHART_LAYER); }
      else L.set(CHART_LAYER);
    }
    for (const m of this.modules) m.frame(f);
    if (this.drive) for (const [o, at] of this.fine) if (this.rig.z > at && o.visible) { o.visible = false; this.stoodDown.push(o); }
  }

  dispose(): void {
    for (const m of this.modules) m.dispose();
    this.chart.dispose();
  }
}
