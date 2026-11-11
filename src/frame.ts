import { Color, PerspectiveCamera, Scene, type WebGPURenderer } from 'three/webgpu';
import type { Environment } from './environment';

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
  const scene = new Scene();
  scene.background = new Color(0x1d4f73);
  const camera = new PerspectiveCamera(60, 1, 0.1, 20000);

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(_env: Environment, _dt: number) {
    renderer.render(scene, camera);
  }

  return { scene, camera, resize, render };
}
