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
import { createTerrain } from './terrain.ts';
import { createTerritory } from './territory.ts';
import { createTrails } from './trails.ts';
import { createWeather } from './weather.ts';
import { REGION_MODULES } from './regions/index.ts';
import { createShips } from './ships/shipView.ts';
import { createEffects } from './fx.ts';
import { createCurrents } from './currents.ts';
import { createEffects } from './fx.ts';
import { createCurrents } from './currents.ts';
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
const MODULES: readonly ModuleFactory[] = [createSea, createSky, createTerrain, createStructures, createFlora, createTerritory, createTrails, ...REGION_MODULES, createWeather, createStorm, createShips, createEffects, createCurrents];

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

  constructor(pipeline: Pipeline, world: World) {
    const ctx: RenderContext = { pipeline, world, scene: this.scene, camera: this.camera };
    this.modules = MODULES.map((build) => build(ctx));
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
    if (this.drive) {
      const sight = this.sight(f.state), rig = this.rig;
      rig.seen = sight.ships;
      rig.frame(f.state, f.alpha, f.clock, rig.chartOpen ? 0 : f.dt, f.dt);
      const z = rig.z, ph = zoomPhases(z), r = Math.min(1, Math.max(0, (z - 0.34) / 0.16)), L = this.camera.layers;
      this.chart.frame(f.state, { z, ...ph, reveal: r * r * (3 - 2 * r) }, this.camera, this.view, sight, territories.get(this.scene)?.wash ?? null);
      if (z <= 0.34) L.set(0);
      else if (z < 0.5) { L.set(0); L.enable(CHART_LAYER); }
      else L.set(CHART_LAYER);
    }
    for (const m of this.modules) m.frame(f);
  }

  dispose(): void {
    for (const m of this.modules) m.dispose();
    this.chart.dispose();
  }
}
