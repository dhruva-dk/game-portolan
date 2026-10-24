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
import { createStructures } from './structures.ts';
import { createTerrain } from './terrain.ts';

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
const MODULES: readonly ModuleFactory[] = [createSea, createSky, createTerrain, createStructures, createFlora];

export class WorldView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
  private readonly modules: RenderModule[];

  constructor(pipeline: Pipeline, world: World) {
    const ctx: RenderContext = { pipeline, world, scene: this.scene, camera: this.camera };
    this.modules = MODULES.map((build) => build(ctx));
  }

  layout(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  frame(f: MatchFrame): void {
    for (const m of this.modules) m.frame(f);
  }

  dispose(): void {
    for (const m of this.modules) m.dispose();
  }
}
