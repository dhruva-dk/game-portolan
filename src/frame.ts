import {
  Color, NoToneMapping, PerspectiveCamera, RenderPipeline, Scene, Vector2, Vector3, type MRTNode, type Object3D, type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, float, getViewPosition, length, normalize, pass, rtt, screenUV, select, uniform, vec3, vec4,
} from 'three/tsl';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { environmentAt, type World } from './environment';
import type { Compute, Draw } from './gpu';
import type { Eye, Snapshot } from './snapshot';
import { createSky, type Sky } from './sky/sky';
import { createGround } from './land/ground';
import { createGroves } from './land/groves';
import { createIslands } from './land/islands';
import { createLighting } from './sky/light';
import { createSand } from './land/sand';
import { createSeabed } from './land/seabed';
import { createTerrainMesh } from './land/terrain-mesh';
import { createShadow } from './land/shadow';
import { createView } from './view/view';
import { createWater, type SeaShows } from './water/water';
import { createFleet } from './ship/fleet';
import { createGunfire } from './gunfire/gunfire';
import { createArms, muzzle } from './ship/arms';
import { createLoot } from './loot/loot';
import { sunAt, sunInSky } from './world/sun';
import { BLOOM_LEVELS, bloom } from './post/bloom';
import { film } from './post/film';
import { createGrade, encode } from './post/grade';
import { createShafts, type Shafts } from './post/shafts';
import { SKY_METRES } from './sky/sky';
import { BANDS, SPACE } from './palette';
import type { Vec4Node } from './tsl';

/**
 * How strongly the bloom (post/bloom.ts: the light over its knee, spread) is added to the frame's light; and the
 * light shafts' (post/shafts.ts), by the sun's height: strongest low, and still there high. The exposure, the tone
 * curve and the look are the grade's (post/grade.ts), set by the sun's height.
 */
const BLOOM = 0.22;
const shaftsFor = (rise: number) => 0.6 * (1 - 0.5 * Math.min(1, Math.max(0, (rise - 0.2) / 0.6)));
/**
 * The frame's pixels per CSS pixel, whatever the screen's own: the iPad Air's is 2, and the browser scales the frame up
 * to it. At 1 its 1180×820 is 0.97 M pixels, half the screen's own each way, as the phone's 1434×660 at 1.5 was, which
 * held the 30–40 FPS budget; 1.5 (1770×1230) would cost every full-size pass 2.25× the pixels.
 */
const SCALE = 1;
/** The eye's near and far planes, metres: in the air, past the far side of the planet from as high as it goes; from
 *  space, round the whole planet from as far out as the full map goes. */
const PLANES = { air: [0.5, 2000], space: [50, 4000] } as const;
/** The view from space: how high over the sea the air it sees the planet through reaches, metres. */
const AIR = 400;
/**
 * The eyes the frame builds its shaders from (prime): each kind's, looking at the planet's centre from where the whole
 * planet is inside its lens and its far plane, so every mesh on it is in view.
 */
const WARM: readonly Eye[] = [
  { kind: 'air', position: [0, 0, 1300], orientation: [0, 0, 0, 1], fov: 60 },
  { kind: 'space', position: [0, 0, 2000], orientation: [0, 0, 0, 1], fov: 40 },
];

/** How the frame draws: what the sea is drawn as (water/water.ts); the most ships it draws at once (the room the
 *  fleet and the sea keep for them: the match's ship count), and a ship's length overall, m (the sim's: her trail runs
 *  from her stern); every ship at one level of detail (ship/fleet.ts pin) or null; whether the near ships' canvas is
 *  simulated; whether the storm's lightning is held lit (sky/storm-bolt.ts), for a still of it; and anything more to
 *  stand in the world, lit by the sky. */
export interface FrameOptions {
  sea: SeaShows;
  fleet: number;
  length: number;
  lod: number | null;
  cloth: boolean;
  bolt: boolean;
  extras?: (light: Sky, world: World) => readonly Object3D[];
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
 *   3. post     — clouds over whatever they stand in front of, the haze by distance over both (sky.ts fog), the
 *                 storm's rain and cloud over all of it (sky/storm.ts: a short march, from where the ray meets its cone), drawn
 *                 once to a full-size texture of light; then, at the iPad's 1180×820 drawn at SCALE (1180×820, the
 *                 browser scaling the frame up to the screen):
 *        bloom        7 passes, the largest a quarter size (295×205), 4–5 taps each: ~0.4 M taps (post/bloom.ts)
 *        shafts       3 passes at a quarter size, 2 + 16 + 16 taps: ~2 M taps (post/shafts.ts)
 *        grade        exposure, vignette, the tone curve, the look (the day's mixed to the storm's), sRGB; a
 *                     dither (post/grade.ts, post/film.ts) — one full-size pass with the bloom's and shafts' reads
 *        FXAA         on the graded image (its edge test wants the screen's values), for the edges of the sea's
 *                     crests and the islands against the sky
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
  renderer.setPixelRatio(SCALE);
  // the grade tone maps (post/grade.ts); the output only encodes for the display
  renderer.toneMapping = NoToneMapping;
  // the sun's height, and whether it rises (east of the meridian: a morning)
  const [east, rise] = sunInSky(world.climate.timeOfDay);
  const view = createView();
  const sky = createSky(view, options.bolt);
  const { grade, gain } = createGrade(rise, east > 0, sky.light.open);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  // the ground baked for the shaders in a worker, while the islands are built here
  const ground = createGround(world.seed, world.land);
  const water = createWater(view, sky.light, ground, world.wind, options.fleet, options.length, options.sea);
  const shadow = createShadow();
  const light = createLighting(sky.light, water.below, shadow.visible);
  const terrain = world.land.kind === 'terrain' ? world.land.terrain : null;
  // (the ground's own, with the caustics on the sea floor)
  const dune = terrain ? BANDS.dunes * terrain.stats.summit : BANDS.dune;
  const sand = createSand(view, ground, createLighting(sky.light, water.floor, shadow.visible), dune);
  // the ground under the sea, and the land's own where the land is the terrain's (the islands draw theirs); and what
  // stands on the land, the terrain's tiles' or the islands'
  const seabed = terrain ? createTerrainMesh(view, ground, sand, terrain) : createSeabed(view, ground, sand);
  const islands = terrain ? createGroves(terrain, world.planet, world.seed, view, light) : createIslands(world.planet, world.seed, view, light, sand);
  shadow.cast(...islands.casters);
  const fleet = createFleet(light, world.wind, options.fleet);
  fleet.pin(options.lod);
  fleet.simulate(options.cloth);
  const arms = createArms(light, options.fleet);
  const gunfire = createGunfire(light);
  const loot = createLoot(light);
  scene.add(seabed.mesh, ...islands.meshes, ...fleet.meshes, ...arms.meshes, water.mesh, water.ribbons, ...gunfire.meshes, ...loot.meshes, ...(options.extras?.(sky.light, world) ?? []));
  // (named for the meter's split: meter.ts)
  scene.name = 'world';
  [seabed.mesh.name, water.mesh.name, water.ribbons.name] = ['seabed', 'sea', 'trails'];
  gunfire.meshes.forEach((m) => (m.name ||= 'gunfire'));
  loot.meshes.forEach((m, k) => (m.name ||= `loot ${k}`));

  /** The scene from a camera, and what it saw at each pixel: its colour and depth, and the ray to it from the camera
   *  (world direction, metres). In a post pass three's camera nodes are the screen quad's, so the camera's own
   *  matrices are uniforms here. */
  const look = (camera: PerspectiveCamera) => {
    const scenePass = pass(scene, camera);
    const projectionInverse = uniform(camera.projectionMatrixInverse), world = uniform(camera.matrixWorld);
    const seen = () => {
      const color = scenePass.getTextureNode();
      const depth = scenePass.getTextureNode('depth').x;
      const position = getViewPosition(screenUV, depth, projectionInverse);
      return { color, depth, dir: normalize(world.mul(vec4(position, 0)).xyz), metres: length(position) };
    };
    return { seen, depth: scenePass.getTextureNode('depth'), pass: scenePass };
  };
  /**
   * The post chain over a view's light (linear, per unit sun) and the depth it was seen at: drawn once to a texture,
   * its bloom and light shafts added, graded, encoded for the display, dithered, anti-aliased.
   */
  const pipelineOf = (post: Vec4Node, depth: ReturnType<typeof look>['depth']): { pipeline: RenderPipeline; shafts: Shafts } => {
    const light = rtt(post, null, null, { depthBuffer: false });
    const glow = bloom(light, gain);
    const shafts = createShafts(light, depth);
    const storm = sky.light.storm(view.position);
    const graded = Fn(() => {
      const c = light.sample(screenUV).rgb.add(glow.sample(screenUV).rgb.mul(BLOOM / BLOOM_LEVELS)).add(shafts.light());
      return film(encode(grade(c, storm)));
    })();
    // the grade encodes for the display itself, dithered before the anti-aliasing
    const p = new RenderPipeline(renderer, fxaa(graded));
    p.outputColorTransform = false;
    return { pipeline: p, shafts };
  };

  // In the air: haze by distance, the clouds over whatever they stand in front of, the storm over all of it.
  const airCamera = new PerspectiveCamera(60, 1, ...PLANES.air);
  const airSeen = look(airCamera);
  const airPost = Fn(() => {
    const { color, depth, dir, metres } = airSeen.seen();
    const open = depth.greaterThanEqual(1);
    // clouds in front of whatever the pixel shows
    const { color: cloud, metres: cloudAt } = sky.clouds.at(screenUV);
    const inFront = open.or(cloudAt.lessThan(metres));
    const clouded = select(inFront, color.rgb.mul(cloud.a).add(cloud.rgb), color.rgb);
    // then the haze, by distance; over the sky and its clouds, its band along the horizon
    const hazed = sky.fog(clouded, dir, select(open, float(SKY_METRES * 2), metres));
    // and the storm's rain over all of it, the clouds above it too: its wall stands nearer than they
    return vec4(sky.veil(hazed, dir, select(open, float(1e5), metres)), 1);
  })();

  // From space: the sky's backdrop and its clouds are the air's, seen from inside it, so past the planet's limb is the
  // dark of space, the clouds are left out, and the haze is only that of the air the ray crosses under AIR metres
  // (from up here, the whole of its path would be through air as thick as the sea's).
  const spaceCamera = new PerspectiveCamera(40, 1, ...PLANES.space);
  const spaceSeen = look(spaceCamera);
  const spacePost = Fn(() => {
    const { color, depth, dir, metres } = spaceSeen.seen();
    const seen = sky.deck(sky.aerial(color.rgb, dir, view.under(dir, metres, AIR)), dir, metres);
    return vec4(select(depth.greaterThanEqual(1), vec3(...SPACE), seen), 1);
  })();

  const eyes = {
    air: { camera: airCamera, scene: airSeen.pass, ...pipelineOf(airPost, airSeen.depth) },
    space: { camera: spaceCamera, scene: spaceSeen.pass, ...pipelineOf(spacePost, spaceSeen.depth) },
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
  /** Builds the shaders and pipelines of all `scene` can draw seen by `camera` into `target` (with its `mrt`), what
   *  is hidden in it too (a system hides what it has none of by drawing none of it: a count of none), in the
   *  background between frames. The target is the renderer's only while the build is laid out: it is given back as it
   *  was both then and once the build is done, since compileAsync takes and restores the renderer's state where it
   *  resumes, after its own awaits (left alone, a frame with no offscreen draw before its own, as when there are no
   *  ships and no islands, would draw into the last build's target). Frames are drawn whole between tasks, so neither
   *  lands in one. */
  const build = (scene: Object3D, camera: Draw['camera'], target: Draw['target'], mrt: MRTNode | null = null) => {
    const [was, wasMrt] = [renderer.getRenderTarget(), renderer.getMRT()];
    const restore = () => {
      renderer.setRenderTarget(was);
      renderer.setMRT(wasMrt);
    };
    renderer.setRenderTarget(target);
    renderer.setMRT(mrt);
    const built = renderer.compileAsync(scene, camera);
    restore();
    return built.then(restore);
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

  /** The ships, the guns' work and the loot, as the snapshot has them. */
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
      // the flash at the drawn gun's mouth
      if (b.kind === 'shot') gunfire.shot(b.time, muzzle(b.from, b.dir, b.gun), b.dir, b.gun);
      else if (b.kind === 'splash') gunfire.splash(b.time, b.at, b.land, b.gun);
      else if (b.kind === 'strike') gunfire.strike(b.time, b.at, b.ram, b.shield, b.broke);
      else gunfire.sink(b.time, b.at);
    }
    laid = Math.max(laid, ...s.blasts.map((b) => b.time));
    gunfire.draw(s.clock, s.balls);
    loot.draw(s.clock, s.loot, s.eye.position);
    arms.update(s.ships, s.eye.position);
  }

  /**
   * Builds every shader the frame can draw with, and its pipeline, once the ground is baked and before the first
   * frame (ready): the view from space, the other ships, the loot, the trails, the guns' work and the ships' marks are
   * first seen only once a match is under way, and a shader first built then costs that frame tens of milliseconds
   * (more on the phone). Each eye's post is drawn at two frames from its WARM eye, its passes set up (a post's pass
   * inside another is set up again as the outer is built, which remakes its draw at the next); then its scene is built from
   * there, and the ships' marks into their map, one after another (three's builds share the renderer's state).
   */
  const nothing = new Scene();
  async function prime() {
    for (let k = 0; k < 2; k++) {
      // (a frame apart: what a pass does once a frame is done again only at the renderer's next)
      if (k > 0) await new Promise(requestAnimationFrame);
      for (const eye of WARM) {
        cameraFor(eye);
        eyes[eye.kind].pipeline.render();
      }
    }
    for (const eye of WARM) {
      const { camera, scene: seen } = eyes[eye.kind];
      cameraFor(eye);
      // nothing drawn into the pass's target first (its pass draws all of it each frame), so the build's context
      // knows its target: three's build leaves it unset, and the sea's read of what is behind it would copy the canvas
      renderer.setRenderTarget(seen.renderTarget);
      renderer.setMRT(seen.getMRT());
      renderer.render(nothing, camera);
      renderer.setRenderTarget(null);
      renderer.setMRT(null);
      await build(scene, camera, seen.renderTarget, seen.getMRT());
    }
    await build(water.marks.scene, water.marks.camera, water.marks.target);
  }

  /** Draws the world as the snapshot has it, from its eye, dt seconds after the last frame. */
  function render(s: Snapshot, dt: number) {
    const seen = s.eye;
    const env = environmentAt(world, s.clock, seen.position);
    stage(s);
    // the CPU's work, each system's after what it reads: the view first; the ships' yards before the marks they cast.
    // The eye is given the screen's size in CSS pixels, not the frame's (SCALE): the ships' and the guns' detail and
    // the clouds' march are the screen's, so the frame's scale costs only the passes drawn at it
    const camera = cameraFor(seen);
    renderer.getSize(size);
    view.update(camera, size.y);
    const eye = view.eye;
    const air = sky.update(env, s.storm, seen.kind, dt, size.x, size.y);
    const ships = fleet.update(eye, env.windSpeed, dt);
    gunfire.update(eye);
    loot.update(eye);
    const sea = water.update(env, dt, fleet.ships, s);
    seabed.update(eye);
    // the island's shadows fall along the sun over it, which stays put however the eye moves
    const island = islands.update(eye);
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
    // 2, 3. the scene and its post, from the eye; the light shafts only in the air
    eyes[seen.kind].shafts.update(eye, env.sunDirection, seen.kind === 'air' ? shaftsFor(rise) : 0);
    eyes[seen.kind].pipeline.render();
  }

  return {
    resize,
    render,
    /** Resolves once the ground is baked and every shader the frame can draw with built (prime), to how long the
     *  bake took, ms. */
    ready: ground.ready.then(async (ms) => (await prime(), ms)),
    /** The sea's anchors (world/lattice.ts), as the frame's sea is laid on them: the CPU's copy of the long waves
     *  (world/swell.ts) must read the very charts the GPU's do. */
    anchors: water.anchors,
  };
}

export type Frame = ReturnType<typeof createFrame>;
