import { ACESFilmicToneMapping, PerspectiveCamera, RenderPipeline, Scene, Vector2, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraProjectionMatrixInverse, cameraWorldMatrix, getViewPosition, length, normalize, pass, screenUV, select, vec4,
} from 'three/tsl';
import type { Environment } from './environment';
import { VIEW_HEIGHT } from './sky/atmosphere';
import { createSky, fog } from './sky/sky';
import { createWater } from './water/water';

/** Scene radiance is per unit of sun illuminance; this one exposure brings it to the screen. */
const EXPOSURE = 10;

/**
 * The frame, in order. Every pass the game draws is listed here and nowhere else:
 *   1. compute  — per-system simulation (sky tables, clouds, ocean FFT, foam)
 *   2. scene    — sky backdrop, sea, (later) land and ship
 *   3. post     — haze by distance, clouds over whatever they stand in front of, tone mapping
 * Systems hand this file meshes and shader nodes; they never create passes themselves.
 */
export function createFrame(renderer: WebGPURenderer) {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const sky = createSky(renderer);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const camera = new PerspectiveCamera(60, 1, 0.5, 40000);
  // the eye stands where the sky's view is worked out from
  camera.position.y = VIEW_HEIGHT * 1000;
  const water = createWater(renderer, sky.reflect);
  scene.add(water.mesh);

  const scenePass = pass(scene, camera);
  const post = Fn(() => {
    const color = scenePass.getTextureNode();
    const depth = scenePass.getTextureNode('depth').x;
    const view = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse);
    const dir = normalize(cameraWorldMatrix.mul(vec4(view, 0)).xyz);
    const metres = length(view);
    // the backdrop is the sky itself, already seen through all the air
    const hazed = select(depth.greaterThanEqual(1), color.rgb, fog(color.rgb, dir, metres));
    // clouds in front of whatever the pixel shows
    const cloud = sky.clouds.color.sample(screenUV);
    const inFront = depth.greaterThanEqual(1).or(sky.clouds.distance.sample(screenUV).x.mul(1000).lessThan(metres));
    return vec4(select(inFront, hazed.mul(cloud.a).add(cloud.rgb), hazed), 1);
  })();
  const pipeline = new RenderPipeline(renderer, post);

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const size = new Vector2();

  function render(env: Environment, dt: number) {
    camera.updateMatrixWorld();
    renderer.getDrawingBufferSize(size);
    sky.update(env, camera, dt, size.x, size.y);
    water.update(env, dt);
    pipeline.render();
  }

  return { scene, camera, sky, resize, render };
}
