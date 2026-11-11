import { ACESFilmicToneMapping, PerspectiveCamera, RenderPipeline, Scene, Vector2, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraProjectionMatrixInverse, cameraWorldMatrix, getViewPosition, length, normalize, pass, renderOutput, screenUV,
  select, vec4,
} from 'three/tsl';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import type { Environment } from './environment';
import { createSky } from './sky/sky';
import { createGround } from './land/ground';
import { createIslands } from './land/islands';
import { createLighting } from './land/light';
import { createSand } from './land/sand';
import { createSeabed } from './land/seabed';
import { createShadow } from './land/shadow';
import { createView } from './view/view';
import { createWater } from './water/water';
import { createPlanet } from './world/planet';
import { createWind } from './world/wind';

/**
 * Scene radiance is per unit of sun illuminance; this one exposure brings it to the screen. A camera in full sun is
 * exposed by the sunny-16 rule, which puts an 18% grey card lit by the high sun at middle grey: with the sun 60° up,
 * through the air (0.8 of it, at sin 60°) and the sky give the card a radiance of 0.18·0.25 = 0.045, which three's
 * ACES (input × exposure / 0.6) takes to 0.18 at an exposure of 3.5. Dry coral sand (0.45) then shows a warm beige.
 */
const EXPOSURE = 3.5;
/** The camera's far plane, metres: past the far side of the planet from as high as it goes. */
const FAR = 2000;

/**
 * The frame, in order. Every pass the game draws is listed here and nowhere else:
 *   1. compute  — per-system simulation (sky tables, clouds, ocean FFT, foam); the nearest island's shadow map from
 *                 the sun, redrawn only when the sun has moved or another island has become the nearest
 *   2. scene    — sky backdrop; then the solid things (the sea floor, the islands, later the ships); then the sea,
 *                 which reads what was drawn before it behind itself (the floor through the water)
 *   3. post     — haze by distance, clouds over whatever they stand in front of, tone mapping; then FXAA, on the
 *                 tone-mapped image (its edge test wants the screen's values), for the edges of the sea's crests and
 *                 the islands against the sky
 * Systems hand this file meshes and shader nodes; they never create passes themselves.
 *
 * The world is the planet's (world/sphere.ts): its centre at the origin, up away from it. The view (view/view.ts)
 * says how it looks from the eye, worked out first each frame, and every system that draws is handed it.
 */
/**
 * seed: the planet's (world/planet.ts); debug: a debug view's name (water.ts), or ''. Draw nothing until `ready`
 * resolves (the ground's bake, in a worker meanwhile); it resolves to how long that took, ms.
 */
export function createFrame(renderer: WebGPURenderer, seed: number, debug = '') {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const view = createView();
  const sky = createSky(renderer, view);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const camera = new PerspectiveCamera(60, 1, 0.5, FAR);
  // the ground baked for the shaders in a worker, while the islands are built here
  const ground = createGround(seed);
  const planet = createPlanet(seed);
  const wind = createWind(seed);
  const water = createWater(renderer, view, sky.light, ground, wind, debug);
  const shadow = createShadow(renderer);
  const light = createLighting(sky.light, water.below, shadow.visible);
  const sand = createSand(view, ground, light);
  const seabed = createSeabed(view, ground, sand);
  const islands = createIslands(planet, seed, view, light, sand);
  shadow.cast(...islands.casters);
  scene.add(seabed.mesh, ...islands.meshes, water.mesh);

  const scenePass = pass(scene, camera);
  const post = Fn(() => {
    const color = scenePass.getTextureNode();
    const depth = scenePass.getTextureNode('depth').x;
    const position = getViewPosition(screenUV, depth, cameraProjectionMatrixInverse);
    const dir = normalize(cameraWorldMatrix.mul(vec4(position, 0)).xyz);
    const metres = length(position);
    // the backdrop is the sky itself, already seen through all the air
    const hazed = select(depth.greaterThanEqual(1), color.rgb, sky.fog(color.rgb, dir, metres));
    // clouds in front of whatever the pixel shows
    const cloud = sky.clouds.color.sample(screenUV);
    const inFront = depth.greaterThanEqual(1).or(sky.clouds.distance.sample(screenUV).x.mul(1000).lessThan(metres));
    return vec4(select(inFront, hazed.mul(cloud.a).add(cloud.rgb), hazed), 1);
  })();
  const pipeline = new RenderPipeline(renderer, fxaa(renderOutput(post)));
  pipeline.outputColorTransform = false;

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const size = new Vector2();

  function render(env: Environment, dt: number) {
    camera.updateMatrixWorld();
    view.update(camera);
    renderer.getDrawingBufferSize(size);
    sky.update(env, camera, dt, size.x, size.y);
    water.update(env, dt);
    seabed.update();
    shadow.update(env.sunDirection, islands.update(view.eye));
    pipeline.render();
  }

  return { scene, camera, sky, view, planet, wind, resize, render, ready: ground.ready };
}
