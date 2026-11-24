import {
  Color,
  NoToneMapping,
  PerspectiveCamera,
  RenderPipeline,
  Scene,
  Vector2,
  Vector3,
  type Object3D,
  type PassNode,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn,
  float,
  getViewPosition,
  length,
  normalize,
  pass,
  rtt,
  screenUV,
  select,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import { environmentAt, type Environment, type World } from './environment.ts';
import type { Compute, Draw } from './gpu.ts';
import type { Eye, Snapshot } from './snapshot.ts';
import { createSky, type Sky } from './sky/sky.ts';
import { createGround } from './land/ground.ts';
import { createGroves } from './land/groves.ts';
import { createLighting } from './sky/light.ts';
import { createSand } from './land/sand.ts';
import { createTerrainMesh } from './land/terrain-mesh.ts';
import { createShadow } from './land/shadow.ts';
import { createView } from './view/view.ts';
import { createWater, type SeaShows } from './water/water.ts';
import { createFleet } from './ship/fleet.ts';
import { createGunfire } from './gunfire/gunfire.ts';
import { createArms, muzzle } from './ship/arms.ts';
import { createLoot } from './loot/loot.ts';
import type { Out3 } from './world/sphere.ts';
import { sunAt, sunInSky } from './world/sun.ts';
import { BLOOM_LEVELS, bloom } from './post/bloom.ts';
import { film } from './post/film.ts';
import { createGrade, encode } from './post/grade.ts';
import { createShafts, type Shafts } from './post/shafts.ts';
import { SKY_METRES } from './sky/sky.ts';
import { SPACE } from './palette.ts';
import { clamp } from './world/scalar.ts';
import { loaded } from './load.ts';
import type { Vec4Node } from './tsl.ts';

const BLOOM = 0.22;
const shaftsFor = (rise: number) => 0.6 * (1 - 0.5 * clamp((rise - 0.2) / 0.6));
const SCALE = 1;
const PLANES = { air: [0.5, 2000], space: [50, 4000] } as const;
const AIR = 400;
const MIDDLE = [0, 0] as const;
const WARM: readonly Eye[] = [
  { kind: 'air', position: [0, 0, 1300], orientation: [0, 0, 0, 1], fov: 60 },
  { kind: 'space', position: [0, 0, 2000], orientation: [0, 0, 0, 1], fov: 40 },
];

export interface FrameOptions {
  sea: SeaShows;
  fleet: number;
  lod: number | null;
  cloth: boolean;
  bolt: boolean;
  extras?: (light: Sky, world: World) => readonly Object3D[];
}

export function createFrame(
  renderer: WebGPURenderer,
  world: World,
  options: FrameOptions
) {
  renderer.setPixelRatio(SCALE);
  renderer.toneMapping = NoToneMapping;
  const [east, rise] = sunInSky(world.climate.timeOfDay);
  const view = createView();
  const sky = createSky(view, options.bolt);
  const { grade, gain } = createGrade(rise, east > 0, sky.light.open);
  const scene = new Scene();
  scene.backgroundNode = sky.background;
  const ground = createGround(world.seed, world.land);
  const water = createWater(
    view,
    sky.light,
    ground,
    world.wind,
    options.fleet,
    options.sea
  );
  const shadow = createShadow();
  const light = createLighting(sky.light, water.below, shadow.visible);
  const floorLight = createLighting(sky.light, water.floor, shadow.visible);
  const sand = createSand(view, ground, floorLight, world.dunes);
  const terrain = createTerrainMesh(view, ground, sand, world.land);
  const groves = createGroves(world, view, light);
  shadow.cast(...groves.casters);
  const fleet = createFleet(light, world.wind, options.fleet);
  fleet.pin(options.lod);
  fleet.simulate(options.cloth);
  const arms = createArms(light, options.fleet);
  const gunfire = createGunfire(light);
  const loot = createLoot(light);
  scene.add(
    terrain.mesh,
    ...groves.meshes,
    ...fleet.meshes,
    ...arms.meshes,
    water.mesh
  );
  scene.add(
    ...gunfire.meshes,
    ...loot.meshes,
    ...(options.extras?.(sky.light, world) ?? [])
  );
  scene.name = 'world';
  [terrain.mesh.name, water.mesh.name] = ['terrain', 'sea'];
  gunfire.meshes.forEach((m) => (m.name ||= 'gunfire'));
  loot.meshes.forEach((m, k) => (m.name ||= `loot ${k}`));

  const look = (camera: PerspectiveCamera) => {
    const scenePass = pass(scene, camera);
    const projectionInverse = uniform(camera.projectionMatrixInverse),
      world = uniform(camera.matrixWorld);
    const seen = () => {
      const color = scenePass.getTextureNode();
      const depth = scenePass.getTextureNode('depth').x;
      const position = getViewPosition(screenUV, depth, projectionInverse);
      return {
        color,
        depth,
        dir: normalize(world.mul(vec4(position, 0)).xyz),
        metres: length(position),
      };
    };
    return { seen, depth: scenePass.getTextureNode('depth'), pass: scenePass };
  };
  const pipelineOf = (
    post: Vec4Node,
    depth: ReturnType<typeof look>['depth']
  ): { pipeline: RenderPipeline; shafts: Shafts } => {
    const light = rtt(post, null, null, { depthBuffer: false });
    const glow = bloom(light, gain);
    const shafts = createShafts(light, depth);
    const storm = sky.light.storm(view.position);
    const graded = Fn(() => {
      const c = light
        .sample(screenUV)
        .rgb.add(glow.sample(screenUV).rgb.mul(BLOOM / BLOOM_LEVELS))
        .add(shafts.light());
      return film(encode(grade(c, storm)));
    })();
    const p = new RenderPipeline(renderer, fxaa(graded));
    p.outputColorTransform = false;
    return { pipeline: p, shafts };
  };

  const airCamera = new PerspectiveCamera(60, 1, ...PLANES.air);
  const airSeen = look(airCamera);
  const airPost = Fn(() => {
    const { color, depth, dir, metres } = airSeen.seen();
    const open = depth.greaterThanEqual(1);
    const { color: cloud, metres: cloudAt } = sky.clouds.at(screenUV);
    const inFront = open.or(cloudAt.lessThan(metres));
    const clouded = select(
      inFront,
      color.rgb.mul(cloud.a).add(cloud.rgb),
      color.rgb
    );
    const hazed = sky.fog(
      clouded,
      dir,
      select(open, float(SKY_METRES * 2), metres)
    );
    return vec4(sky.veil(hazed, dir, select(open, float(1e5), metres)), 1);
  })();

  const spaceCamera = new PerspectiveCamera(40, 1, ...PLANES.space);
  const spaceSeen = look(spaceCamera);
  const spacePost = Fn(() => {
    const { color, depth, dir, metres } = spaceSeen.seen();
    const seen = sky.deck(
      sky.aerial(color.rgb, dir, view.under(dir, metres, AIR)),
      dir,
      metres
    );
    return vec4(select(depth.greaterThanEqual(1), vec3(...SPACE), seen), 1);
  })();

  const eyes = {
    air: {
      camera: airCamera,
      scene: airSeen.pass,
      ...pipelineOf(airPost, airSeen.depth),
    },
    space: {
      camera: spaceCamera,
      scene: spaceSeen.pass,
      ...pipelineOf(spacePost, spaceSeen.depth),
    },
  };

  const compute = (passes: readonly Compute[]) => {
    for (const p of passes) renderer.compute(p);
  };
  const clearColor = new Color();
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
  const build = async (d: Pick<Draw, 'scene' | 'camera' | 'target'>) => {
    renderer.setRenderTarget(d.target);
    await renderer.compileAsync(d.scene, d.camera);
    renderer.setRenderTarget(null);
  };
  const nothing = new Scene();
  const buildPass = (seen: PassNode) => {
    renderer.setRenderTarget(seen.renderTarget);
    renderer.setMRT(seen.getMRT());
    renderer.render(nothing, seen.camera);
    renderer.setRenderTarget(null);
    renderer.setMRT(null);
    return seen.compileAsync(renderer);
  };

  compute(sky.bake);

  function resize(width: number, height: number) {
    renderer.setSize(width, height);
  }

  const size = new Vector2();
  const shadeSun = new Vector3(),
    shadeAt: Out3 = [0, 0, 0];
  let drawn = new Set<number>(),
    now = new Set<number>(),
    laid = -Infinity;
  let env: Environment | undefined;

  function cameraFor(eye: Eye) {
    const camera = eyes[eye.kind].camera;
    renderer.getDrawingBufferSize(size);
    camera.aspect = size.x / size.y;
    camera.fov = eye.fov;
    const [x, y] = eye.centre ?? MIDDLE,
      k = eye.size ?? 1;
    if (x !== 0 || y !== 0 || k !== 1)
      camera.setViewOffset(
        size.x * k,
        size.y * k,
        (size.x * (k - 1 - x)) / 2,
        (size.y * (k - 1 - y)) / 2,
        size.x,
        size.y
      );
    else camera.clearViewOffset();
    camera.position.fromArray(eye.position);
    camera.quaternion.fromArray(eye.orientation);
    camera.updateMatrixWorld();
    return camera;
  }

  function stage(s: Snapshot) {
    fleet.own(s.own);
    now.clear();
    const ships = s.ships;
    for (const ship of ships) {
      fleet.set(ship.id, ship.pose, ship.look, {
        velocity: ship.velocity,
        afloat: ship.afloat,
      });
      now.add(ship.id);
    }
    for (const id of drawn) if (!now.has(id)) fleet.drop(id);
    const was = drawn;
    drawn = now;
    now = was;
    let latest = laid;
    for (const b of s.blasts) {
      latest = Math.max(latest, b.time);
      if (b.time <= laid) continue;
      if (b.kind === 'shot')
        gunfire.shot(b.time, muzzle(b.from, b.dir, b.gun), b.dir, b.gun);
      else if (b.kind === 'splash') gunfire.splash(b.time, b.at, b.land, b.gun);
      else if (b.kind === 'strike')
        gunfire.strike(b.time, b.at, b.ram, b.shield, b.broke);
      else gunfire.sink(b.time, b.at);
    }
    laid = latest;
    gunfire.draw(s.clock, s.balls, ships, s.eye.position);
    loot.draw(s.clock, s.loot, s.eye.position);
    arms.update(ships, s.eye.position);
  }

  async function prime() {
    for (let k = 0; k < 2; k++) {
      if (k > 0) await new Promise(requestAnimationFrame);
      for (const eye of WARM) {
        cameraFor(eye);
        eyes[eye.kind].pipeline.render();
      }
      loaded(`posts drawn ${k + 1}`);
    }
    for (const eye of WARM) {
      cameraFor(eye);
      await buildPass(eyes[eye.kind].scene);
      loaded(`built ${eye.kind}`);
    }
    await build(water.marks);
    loaded('built marks');
  }

  function render(s: Snapshot, dt: number) {
    const seen = s.eye;
    env = environmentAt(world, s.clock, seen.position, env);
    stage(s);
    const camera = cameraFor(seen);
    renderer.getSize(size);
    view.update(camera, size.y * (seen.size ?? 1));
    const eye = view.eye;
    const air = sky.update(env, s.storm, seen.kind, dt, size.x, size.y);
    const ships = fleet.update(eye, env.windSpeed, dt);
    gunfire.update(eye);
    loot.update(eye);
    const sea = water.update(env, dt, fleet.ships, s);
    terrain.update(eye);
    const shade = groves.update(eye);
    if (shade)
      shadeSun.fromArray(
        sunAt(env.sunPlaces, env.timeOfDay, shade.chart.at, shadeAt)
      );
    const landShadow = shadow.update(shadeSun, shade);

    compute(air.tables);
    compute(air.clouds);
    compute(air.reflection);
    compute(sea.waves);
    draw(sea.wake);
    draw(landShadow);
    compute(ships.cloth);
    eyes[seen.kind].shafts.update(
      eye,
      env.sunDirection,
      seen.kind === 'air' ? shaftsFor(rise) : 0
    );
    eyes[seen.kind].pipeline.render();
  }

  return {
    resize,
    render,
    ready: ground.ready.then(
      async (ms) => (loaded('baked'), await prime(), ms)
    ),
    anchors: water.anchors,
  };
}
