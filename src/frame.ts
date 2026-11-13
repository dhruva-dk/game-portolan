import { ACESFilmicToneMapping, Color, PerspectiveCamera, RenderPipeline, Scene, Vector2, Vector3, type Object3D, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, float, getViewPosition, length, normalize, pass, renderOutput, screenUV, select, uniform, vec3, vec4,
} from 'three/tsl';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { environmentAt, type World } from './environment';
import type { Compute, Draw } from './gpu';
import type { Eye, Snapshot } from './snapshot';
import { createSky, type Sky } from './sky/sky';
import { createGround } from './land/ground';
import { createIslands } from './land/islands';
import { createLighting } from './sky/light';
import { createSand } from './land/sand';
import { createSeabed } from './land/seabed';
import { createShadow } from './land/shadow';
import { createView } from './view/view';
import { createWater } from './water/water';
import { createFleet } from './ship/fleet';
import { createGunfire } from './gunfire/gunfire';
import { sunAt } from './world/sun';

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
/** The eye's near and far planes, metres: in the air, past the far side of the planet from as high as it goes; from
 *  space, round the whole planet from as far out as the full map goes. */
const PLANES = { air: [0.5, 2000], space: [50, 4000] } as const;
/** The view from space: the colour past the planet's limb (linear, before exposure), and how high over the sea the
 *  air it sees the planet through reaches, metres. */
const SPACE = [0.0015, 0.002, 0.004] as const;
const AIR = 400;

/** How the frame draws: a debug view's name (water.ts) or ''; every ship at one level of detail (ship/fleet.ts pin)
 *  or null; whether the near ships' canvas is simulated; and anything more to stand in the scene, lit by the sky. */
export interface FrameOptions {
  view: string;
  lod: number | null;
  cloth: boolean;
  extras?: (light: Sky) => readonly Object3D[];
}

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
 *   2. scene    — sky backdrop; then the solid things (the sea floor, the islands, the ships, the balls in flight);
 *                 then the sea, which reads what was drawn before it behind itself (the floor through the water); then
 *                 the guns' smoke, flashes and spray (gunfire/gunfire.ts), blended over it
 *   3. post     — haze by distance, clouds over whatever they stand in front of, the storm's rain and cloud over
 *                 all of it (sky/storm.ts: no march, the ray against its cone), tone mapping; then FXAA, on the
 *                 tone-mapped image (its edge test wants the screen's values), for the edges of the sea's crests and
 *                 the islands against the sky
 * Each frame every system first does its CPU work, in the order one reads another, and says what of its GPU work is
 * due (gpu.ts); then the frame runs it. Systems hand this file meshes, shader nodes, kernels and offscreen draws; they
 * never hold the renderer. The renderer's settings are all here too.
 *
 * What it draws comes in each frame as a Snapshot (snapshot.ts), plain data: the eye, the ships, the balls, what the
 * guns did, the world's clock and the storm. The frame alone turns it into its cameras and its systems' state.
 *
 * The eye is in the air or in space (the full map, ui/globe.ts). From space every system works from that eye and the
 * same scene is drawn, but the sky does no cloud work (sky.ts update) and its own post pass shows space past the limb,
 * the air only under AIR metres, no clouds, and the storm as the top of its cloud.
 *
 * The world is the planet's (world/sphere.ts): its centre at the origin, up away from it. The view (view/view.ts)
 * says how it looks from the eye, worked out first each frame, and every system that draws is handed it.
 */
/**
 * world: the planet and its climate (environment.ts). Draw nothing until `ready` resolves (the ground's bake, in a
 * worker meanwhile); it resolves to how long that took, ms.
 */
export function createFrame(renderer: WebGPURenderer, world: World, options: FrameOptions) {
  renderer.setPixelRatio(1);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = EXPOSURE;
  const view = createView();
  const sky = createSky(view);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  // the ground baked for the shaders in a worker, while the islands are built here
  const ground = createGround(world.seed);
  const water = createWater(view, sky.light, ground, world.wind, SHIPS, options.view);
  const shadow = createShadow();
  const light = createLighting(sky.light, water.below, shadow.visible);
  const sand = createSand(view, ground, light);
  const seabed = createSeabed(view, ground, sand);
  const islands = createIslands(world.planet, world.seed, view, light, sand);
  shadow.cast(...islands.casters);
  const fleet = createFleet(light, world.wind, SHIPS);
  fleet.pin(options.lod);
  fleet.simulate(options.cloth);
  const gunfire = createGunfire(light);
  scene.add(seabed.mesh, ...islands.meshes, ...fleet.meshes, water.mesh, ...gunfire.meshes, ...(options.extras?.(sky.light) ?? []));

  /** The scene from a camera, and what it saw at each pixel: its colour and depth, and the ray to it from the camera
   *  (world direction, metres). In a post pass three's camera nodes are the screen quad's, so the camera's own
   *  matrices are uniforms here. */
  const look = (camera: PerspectiveCamera) => {
    const scenePass = pass(scene, camera);
    const projectionInverse = uniform(camera.projectionMatrixInverse), world = uniform(camera.matrixWorld);
    return () => {
      const color = scenePass.getTextureNode();
      const depth = scenePass.getTextureNode('depth').x;
      const position = getViewPosition(screenUV, depth, projectionInverse);
      return { color, depth, dir: normalize(world.mul(vec4(position, 0)).xyz), metres: length(position) };
    };
  };
  const pipelineOf = (post: Parameters<typeof renderOutput>[0]) => {
    const p = new RenderPipeline(renderer, fxaa(renderOutput(post)));
    p.outputColorTransform = false;
    return p;
  };

  // In the air: haze by distance, the clouds over whatever they stand in front of, the storm over all of it.
  const airCamera = new PerspectiveCamera(60, 1, ...PLANES.air);
  const airSeen = look(airCamera);
  const airPost = Fn(() => {
    const { color, depth, dir, metres } = airSeen();
    // the backdrop is the sky itself, already seen through all the air
    const hazed = select(depth.greaterThanEqual(1), color.rgb, sky.fog(color.rgb, dir, metres));
    // clouds in front of whatever the pixel shows
    const cloud = sky.clouds.color.sample(screenUV);
    const inFront = depth.greaterThanEqual(1).or(sky.clouds.distance.sample(screenUV).x.mul(1000).lessThan(metres));
    const seen = select(inFront, hazed.mul(cloud.a).add(cloud.rgb), hazed);
    // and the storm's rain over all of it, the clouds above it too: its wall stands nearer than they
    return vec4(sky.veil(seen, dir, select(depth.greaterThanEqual(1), float(1e5), metres)), 1);
  })();

  // From space: the sky's backdrop and its clouds are the air's, seen from inside it, so past the planet's limb is the
  // dark of space, the clouds are left out, and the haze is only that of the air the ray crosses under AIR metres
  // (from up here, the whole of its path would be through air as thick as the sea's).
  const spaceCamera = new PerspectiveCamera(40, 1, ...PLANES.space);
  const spaceSeen = look(spaceCamera);
  const spacePost = Fn(() => {
    const { color, depth, dir, metres } = spaceSeen();
    const seen = sky.deck(sky.fog(color.rgb, dir, view.under(dir, metres, AIR)), dir, metres);
    return vec4(select(depth.greaterThanEqual(1), vec3(...SPACE), seen), 1);
  })();

  const eyes = {
    air: { camera: airCamera, pipeline: pipelineOf(airPost) },
    space: { camera: spaceCamera, pipeline: pipelineOf(spacePost) },
  };

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
  }

  const size = new Vector2();
  const islandSun = new Vector3();
  /** The ships drawn last frame, and the latest moment of the guns' work laid so far (each blast is laid once). */
  let drawn = new Set<number>(), laid = -Infinity;

  /** The eye's camera, placed and turned as the eye says, its aspect the drawing buffer's. */
  function cameraFor(eye: Eye) {
    const camera = eyes[eye.kind].camera;
    renderer.getDrawingBufferSize(size);
    camera.aspect = size.x / size.y;
    camera.fov = eye.fov;
    camera.updateProjectionMatrix();
    camera.position.set(...eye.position);
    camera.quaternion.set(...eye.orientation);
    camera.updateMatrixWorld();
    return camera;
  }

  /** The ships and the guns' work, as the snapshot has them. */
  function stage(s: Snapshot) {
    fleet.own(s.own);
    const now = new Set<number>();
    for (const ship of s.ships) {
      fleet.set(ship.id, ship.pose, ship.look, ship.velocity, ship.afloat);
      now.add(ship.id);
    }
    for (const id of drawn) if (!now.has(id)) fleet.drop(id);
    drawn = now;
    for (const b of s.blasts) {
      if (b.time <= laid) continue;
      if (b.kind === 'shot') gunfire.shot(b.time, b.from, b.dir);
      else if (b.kind === 'splash') gunfire.splash(b.time, b.at, b.land);
      else gunfire.strike(b.time, b.at, b.ram);
    }
    laid = Math.max(laid, ...s.blasts.map((b) => b.time));
    gunfire.draw(s.clock, s.balls);
  }

  /** Draws the world as the snapshot has it, dt seconds after the last frame. */
  function render(s: Snapshot, dt: number) {
    const eye = cameraFor(s.eye);
    const env = environmentAt(world, s.clock, s.eye.position);
    stage(s);
    // the CPU's work, each system's after what it reads: the view first; the ships' yards before the marks they cast
    view.update(eye);
    renderer.getDrawingBufferSize(size);
    const air = sky.update(env, s.storm, eye, s.eye.kind, dt, size.x, size.y);
    const ships = fleet.update(eye, env.windSpeed, size.y, dt);
    gunfire.update(eye, size.y);
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
    // 2, 3. the scene and its post, from the eye
    eyes[s.eye.kind].pipeline.render();
  }

  return {
    resize,
    render,
    ready: ground.ready,
    /** The sea's anchors (world/lattice.ts), as the frame's sea is laid on them: the CPU's copy of the long waves
     *  (water/swell.ts) must read the very charts the GPU's do. */
    anchors: water.anchors,
  };
}

export type Frame = ReturnType<typeof createFrame>;
