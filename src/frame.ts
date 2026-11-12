import { ACESFilmicToneMapping, Color, PerspectiveCamera, RenderPipeline, Scene, Vector2, Vector3, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, float, getViewPosition, length, normalize, pass, renderOutput, screenUV, select, uniform, vec4,
} from 'three/tsl';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import type { Environment } from './environment';
import type { Compute, Draw } from './gpu';
import type { Cap } from './sim/storm';
import { createSky } from './sky/sky';
import { createGround } from './land/ground';
import { createIslands } from './land/islands';
import { createLighting } from './land/light';
import { createSand } from './land/sand';
import { createSeabed } from './land/seabed';
import { createShadow } from './land/shadow';
import { createView } from './view/view';
import { createWater } from './water/water';
import { createFleet } from './ship/fleet';
import { createPlanet } from './world/planet';
import { sunAt } from './world/sun';
import { createWind } from './world/wind';

/**
 * Scene radiance is per unit of sun illuminance; this one exposure brings it to the screen. A camera in full sun is
 * exposed by the sunny-16 rule, which puts an 18% grey card lit by the high sun at middle grey: with the sun 60° up,
 * through the air (0.8 of it, at sin 60°) and the sky give the card a radiance of 0.18·0.25 = 0.045, which three's
 * ACES (input × exposure / 0.6) takes to 0.18 at an exposure of 3.5. The game's afternoon, its sun lower, read a
 * little dark at that, so it is a third of a stop over: 4.4. Dry coral sand (0.45) then shows a warm beige, the foam
 * and the cloud tops stay short of white, and the sea keeps its colour (at half a stop over it pales to cyan).
 */
const EXPOSURE = 4.4;
/** The most ships the sea carries. */
const SHIPS = 32;
/** The camera's far plane, metres: past the far side of the planet from as high as it goes. */
const FAR = 2000;

/**
 * The frame. Every pass the game runs is dispatched here and nowhere else (render below), in this order:
 *   0. once     — the clouds' patterns (sky/cloud-noise.ts), baked before the first frame
 *   1. offscreen, each only when its system says it is due:
 *        sky tables   the air's (sky/tables.ts), one a frame when the haze has drifted; then the sky view and its
 *                     ambient when the sun has moved
 *        clouds       a quarter of the half-resolution pixels marched and the rest kept from before (sky/clouds.ts);
 *                     every fourth frame their shadow map
 *        reflection   the sky and clouds as the sea reflects them, every 30 frames (sky/reflection.ts)
 *        waves        the ocean's FFT and its foam (water/waves.ts), every frame
 *        wake         the ships' marks on the sea round the eye (water/wake.ts: their wakes, foam and shadows), one
 *                     small map, drawn while a ship is near enough to mark it
 *        island       the nearest island's shadow map from the sun over it (land/shadow.ts), redrawn only when the
 *                     sun has moved or another island has become the nearest
 *        cloth        the near ships' sails (ship/cloth.ts), a few small steps of it, while any are held
 *   2. scene    — sky backdrop; then the solid things (the sea floor, the islands, the ships); then the sea, which
 *                 reads what was drawn before it behind itself (the floor through the water)
 *   3. post     — haze by distance, clouds over whatever they stand in front of, the storm's rain and cloud over
 *                 all of it (sky/storm.ts: no march, the ray against its cone), tone mapping; then FXAA, on the
 *                 tone-mapped image (its edge test wants the screen's values), for the edges of the sea's crests and
 *                 the islands against the sky
 * Each frame every system first does its CPU work, in the order one reads another, and says what of its GPU work is
 * due (gpu.ts); then the frame runs it. Systems hand this file meshes, shader nodes, kernels and offscreen draws; they
 * never hold the renderer. The renderer's settings are all here too.
 *
 * The world is the planet's (world/sphere.ts): its centre at the origin, up away from it. The view (view/view.ts)
 * says how it looks from the eye, worked out first each frame, and every system that draws is handed it.
 */
/**
 * seed: the planet's (world/planet.ts); debug: a debug view's name (water.ts), or ''. Draw nothing until `ready`
 * resolves (the ground's bake, in a worker meanwhile); it resolves to how long that took, ms.
 */
export function createFrame(renderer: WebGPURenderer, seed: number, debug = '') {
  renderer.setPixelRatio(1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const view = createView();
  const sky = createSky(view);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const camera = new PerspectiveCamera(60, 1, 0.5, FAR);
  // the ground baked for the shaders in a worker, while the islands are built here
  const ground = createGround(seed);
  const planet = createPlanet(seed);
  const wind = createWind(seed);
  const water = createWater(view, sky.light, ground, wind, SHIPS, debug);
  const shadow = createShadow(renderer.coordinateSystem);
  const light = createLighting(sky.light, water.below, shadow.visible);
  const sand = createSand(view, ground, light);
  const seabed = createSeabed(view, ground, sand);
  const islands = createIslands(planet, seed, view, light, sand);
  shadow.cast(...islands.casters);
  const fleet = createFleet(light, wind, SHIPS);
  scene.add(seabed.mesh, ...islands.meshes, ...fleet.meshes, water.mesh);

  const scenePass = pass(scene, camera);
  // the scene's camera, as uniforms of its own matrices: in the post pass three's camera nodes are the screen quad's
  const projectionInverse = uniform(camera.projectionMatrixInverse), cameraWorld = uniform(camera.matrixWorld);
  const post = Fn(() => {
    const color = scenePass.getTextureNode();
    const depth = scenePass.getTextureNode('depth').x;
    const position = getViewPosition(screenUV, depth, projectionInverse);
    const dir = normalize(cameraWorld.mul(vec4(position, 0)).xyz);
    const metres = length(position);
    // the backdrop is the sky itself, already seen through all the air
    const hazed = select(depth.greaterThanEqual(1), color.rgb, sky.fog(color.rgb, dir, metres));
    // clouds in front of whatever the pixel shows
    const cloud = sky.clouds.color.sample(screenUV);
    const inFront = depth.greaterThanEqual(1).or(sky.clouds.distance.sample(screenUV).x.mul(1000).lessThan(metres));
    const seen = select(inFront, hazed.mul(cloud.a).add(cloud.rgb), hazed);
    // and the storm's rain over all of it, the clouds above it too: its wall stands nearer than they
    return vec4(sky.veil(seen, dir, select(depth.greaterThanEqual(1), float(1e5), metres)), 1);
  })();
  const pipeline = new RenderPipeline(renderer, fxaa(renderOutput(post)));
  pipeline.outputColorTransform = false;

  /** Runs compute passes, in order. */
  const compute = (passes: readonly Compute[]) => {
    for (const p of passes) renderer.compute(p);
  };
  const clearColor = new Color();
  /** Draws an offscreen scene into its target, if it is due. */
  const draw = (d: Draw | null) => {
    if (!d) return;
    renderer.setRenderTarget(d.target);
    if (d.clear) {
      renderer.getClearColor(clearColor);
      const alpha = renderer.getClearAlpha();
      renderer.setClearColor(d.clear.color, d.clear.alpha);
      renderer.render(d.scene, d.camera);
      renderer.setClearColor(clearColor, alpha);
    } else {
      renderer.render(d.scene, d.camera);
    }
    renderer.setRenderTarget(null);
  };

  // 0. once
  compute(sky.bake);

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  const size = new Vector2();
  const islandSun = new Vector3();

  /** storm: the safe cap now (sim/storm.ts); outside it the weather is foul. */
  function render(env: Environment, dt: number, storm: Cap) {
    // the CPU's work, each system's after what it reads: the view first; the ships' yards before the marks they cast
    camera.updateMatrixWorld();
    view.update(camera);
    renderer.getDrawingBufferSize(size);
    const air = sky.update(env, storm, camera, dt, size.x, size.y);
    const ships = fleet.update(camera, env.windSpeed, size.y, dt);
    const sea = water.update(env, dt, fleet.ships);
    seabed.update();
    // the island's shadows fall along the sun over it, which stays put however the eye moves
    const island = islands.update(view.eye);
    if (island) islandSun.set(...sunAt(env.sunPlaces, env.timeOfDay, island.chart.at));
    const islandShadow = shadow.update(islandSun, island);

    // 1. offscreen, what is due
    compute(air.tables);
    compute(air.clouds);
    compute(air.reflection);
    compute(sea.waves);
    draw(sea.wake);
    draw(islandShadow);
    compute(ships.cloth);
    // 2, 3. the scene and its post
    pipeline.render();
  }

  return { scene, camera, sky, view, planet, wind, fleet, anchors: water.anchors, resize, render, ready: ground.ready };
}
