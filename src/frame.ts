import { ACESFilmicToneMapping, PerspectiveCamera, RenderPipeline, Scene, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraProjectionMatrixInverse, cameraWorldMatrix, getViewPosition, length, normalize, pass, screenUV, select, vec4,
} from 'three/tsl';
import type { Environment } from './environment';
import { createSky, fog } from './sky/sky';

/** Scene radiance is per unit of sun illuminance; this one exposure brings it to the screen. */
const EXPOSURE = 10;

/**
 * The frame, in order. Every pass the game draws is listed here and nowhere else:
 *   1. compute  — per-system simulation (sky tables, ocean FFT, foam)
 *   2. scene    — sky backdrop, land, ship (later: water reading opaque depth and colour)
 *   3. post     — haze by distance; (later: clouds composited); tone mapping
 * Systems hand this file meshes and shader nodes; they never create passes themselves.
 */
export function createFrame(renderer: WebGPURenderer) {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const sky = createSky(renderer);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const camera = new PerspectiveCamera(60, 1, 0.5, 40000);

  const scenePass = pass(scene, camera);
  const post = Fn(() => {
    const color = scenePass.getTextureNode();
    const depth = scenePass.getTextureNode('depth').x;
    const view = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse);
    const dir = normalize(cameraWorldMatrix.mul(vec4(view, 0)).xyz);
    // the backdrop is the sky itself, already seen through all the air
    return select(depth.greaterThanEqual(1), color, vec4(fog(color.rgb, dir, length(view)), 1));
  })();
  const pipeline = new RenderPipeline(renderer, post);

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function render(env: Environment, _dt: number) {
    sky.update(env);
    pipeline.render();
  }

  return { scene, camera, resize, render };
}
