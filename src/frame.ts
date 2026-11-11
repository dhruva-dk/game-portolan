import { ACESFilmicToneMapping, PerspectiveCamera, RenderPipeline, Scene, Vector2, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraProjectionMatrixInverse, cameraWorldMatrix, getViewPosition, length, normalize, pass, screenUV, select, vec4,
} from 'three/tsl';
import type { Environment } from './environment';
import { createSky } from './sky/sky';
import { createLand } from './land/land';
import { createLighting } from './land/light';
import { createPalms } from './land/palms';
import { createRocks } from './land/rocks';
import { createSeabed } from './land/seabed';
import { createShadow } from './land/shadow';
import { createShrubs } from './land/shrubs';
import { createSite } from './land/site';
import { createView } from './view/view';
import { createWater } from './water/water';
import { litter } from './world/scatter';

/** Scene radiance is per unit of sun illuminance; this one exposure brings it to the screen. */
const EXPOSURE = 10;
/** The camera's far plane, metres: past the far side of the planet from as high as it goes. */
const FAR = 2000;

/**
 * The frame, in order. Every pass the game draws is listed here and nowhere else:
 *   1. compute  — per-system simulation (sky tables, clouds, ocean FFT, foam); the island's shadow map from the sun,
 *                 redrawn only when the sun has moved
 *   2. scene    — sky backdrop; then the solid things (the island, later the ships); then the sea, which reads what was
 *                 drawn before it behind itself (the floor through the shallows)
 *   3. post     — haze by distance, clouds over whatever they stand in front of, tone mapping
 * Systems hand this file meshes and shader nodes; they never create passes themselves.
 *
 * The world is the planet's (world/sphere.ts): its centre at the origin, up away from it. The view (view/view.ts)
 * says how it looks from the eye, worked out first each frame, and every system that draws is handed it.
 */
export function createFrame(renderer: WebGPURenderer) {
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const view = createView();
  const sky = createSky(renderer, view);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const camera = new PerspectiveCamera(60, 1, 0.5, FAR);
  const site = createSite();
  const seabed = createSeabed(site, view);
  const water = createWater(renderer, view, sky.light, seabed, site.chart);
  const shadow = createShadow(renderer, site);
  const light = createLighting(sky.light, water.below, shadow.visible);
  const rocks = createRocks(site, view, light);
  const palms = createPalms(site, light);
  const shrubs = createShrubs(site, light);
  const land = createLand(site, view, light, litter(palms.palms, shrubs.shrubs));
  shadow.cast(...rocks.meshes, ...palms.meshes, ...shrubs.meshes);
  scene.add(land.mesh, ...rocks.meshes, ...palms.meshes, ...shrubs.meshes, water.mesh);

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
  const pipeline = new RenderPipeline(renderer, post);

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
    shadow.update(env.sunDirection);
    pipeline.render();
  }

  return { scene, camera, sky, view, resize, render };
}
