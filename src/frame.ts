import { ACESFilmicToneMapping, PerspectiveCamera, Scene, type WebGPURenderer } from 'three/webgpu';
import type { Environment } from './environment';
import { createSky } from './sky/sky';

/** Scene radiance is per unit of sun illuminance; this one exposure brings it to the screen. */
const EXPOSURE = 10;

/**
 * The frame, in order. Every pass the game draws is listed here and nowhere else:
 *   1. compute  — per-system simulation (sky LUTs, ocean FFT, foam)
 *   2. opaque   — land, ship
 *   3. water    — reads opaque depth and colour
 *   4. clouds   — composited over everything
 *   5. post     — tone mapping
 * Systems hand this file meshes and shader nodes; they never create passes themselves.
 */
export function createFrame(renderer: WebGPURenderer) {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const sky = createSky(renderer);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const camera = new PerspectiveCamera(60, 1, 0.1, 20000);

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(env: Environment, _dt: number) {
    sky.update(env);
    renderer.render(scene, camera);
  }

  return { scene, camera, resize, render };
}
