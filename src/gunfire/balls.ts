// The balls in flight: two draws, each a single instanced mesh sharing one
// buffer, one instance a ball, placed each frame where the battle has them.
//
// Each is drawn out along its flight, at least a few pixels across so it is
// seen at the far end of its range: a dark iron core with a hot rim, so it reads
// dark against the bright sky and bright against the sea; behind it a warm
// tracer, glowing (the bloom takes it) and tapering back over its kind's share
// of its flight. (The ribbon of thin grey smoke behind that is puffs, laid along
// the way it came: puffs.ts.) Each kind's its own (SHOT): the cannon's ball; the
// scatter's pellets, small and many, short-tailed; the repeater's slim rounds
// with long hot tracers, no smoke; the harpoon's bolt, a long dark shaft and no
// fire behind it; the mortar's shell, big, smoking heavily as it lobs.

import {
  DoubleSide,
  DynamicDrawUsage,
  IcosahedronGeometry,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  cross,
  float,
  max,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  varying,
  vec3,
} from 'three/tsl';
import { KINDS, gunOrder, type GunKind } from '../kinds.ts';
import { BALL_IRON, BALL_SPARK, TRACER } from '../palette.ts';
import type { BallDraw } from '../snapshot.ts';
import { additive, quad } from '../gpu.ts';
import type { FloatNode } from '../tsl.ts';

/** The most balls in flight at once. */
const BALLS = 512;
/**
 * Each kind's ball:
 *   size    its radius, m
 *   pixels  the fewest pixels it is drawn across
 *   long    its least half-length along its flight, m (the harpoon's bolt a shaft)
 *   hot     how much its rim glows (0: none, a dark shape)
 *   tracer  seconds of its flight its tracer trails over (0: none), and its glow
 *   trail   metres between its smoke's puffs (0: none), and their size
 */
interface Shot {
  size: number;
  pixels: number;
  long: number;
  hot: number;
  tracer: number;
  glow: number;
  trail: number;
  puff: number;
}
export const SHOT: Record<GunKind, Shot> = {
  cannon: {
    size: 0.16,
    pixels: 6,
    long: 0,
    hot: 1,
    tracer: 0.09,
    glow: 1,
    trail: 3,
    puff: 0.3,
  },
  scatter: {
    size: 0.07,
    pixels: 3,
    long: 0,
    hot: 1.3,
    tracer: 0.035,
    glow: 0.8,
    trail: 0,
    puff: 0,
  },
  repeater: {
    size: 0.07,
    pixels: 3,
    long: 0,
    hot: 1.5,
    tracer: 0.2,
    glow: 1.8,
    trail: 0,
    puff: 0,
  },
  harpoon: {
    size: 0.05,
    pixels: 3,
    long: 0.8,
    hot: 0,
    tracer: 0,
    glow: 0,
    trail: 0,
    puff: 0,
  },
  mortar: {
    size: 0.26,
    pixels: 8,
    long: 0,
    hot: 0.7,
    tracer: 0.06,
    glow: 0.7,
    trail: 2,
    puff: 0.55,
  },
};
/**
 * A ball's streak (seconds of its flight it is drawn out along); its rim
 * (palette.ts BALL_SPARK about its BALL_IRON) from where the surface turns this
 * far from the eye (the cosine).
 */
const STREAK = 0.02,
  RIM = 0.55;
/**
 * Its tracer: its width at the ball (m, and the fewest pixels); its glow there
 * is palette.ts TRACER.
 */
const TRACER_WIDE = 0.22,
  TRACER_PIXELS = 3;

/**
 * A node taking each kind's value of `f`, by the kind's index `k` (its place in
 * KINDS: gunOrder, as a ball carries it to its shader).
 */
const byKind = (k: FloatNode, f: (s: Shot) => number): FloatNode =>
  KINDS.slice(0, -1).reduceRight<FloatNode>(
    (rest, kind, i) => select(k.lessThan(i + 0.5), float(f(SHOT[kind])), rest),
    float(f(SHOT[KINDS[KINDS.length - 1]]))
  );

/**
 * The balls and their tracers; `pixel` is how wide a pixel is per metre away
 * (gunfire.ts sets it each frame).
 */
export function createBalls(pixel: FloatNode) {
  const ico = new IcosahedronGeometry(1, 1);
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', ico.getAttribute('position'));
  // where each is, and its velocity
  const data = new Float32Array(BALLS * 8);
  const buffer = new InstancedInterleavedBuffer(data, 8).setUsage(
    DynamicDrawUsage
  );
  g.setAttribute('ballAt', new InterleavedBufferAttribute(buffer, 4, 0));
  g.setAttribute('ballWay', new InterleavedBufferAttribute(buffer, 4, 4));
  g.instanceCount = 0;
  const m = new MeshBasicNodeMaterial();
  const ballAt = attribute('ballAt', 'vec4'),
    at = ballAt.xyz,
    kind = ballAt.w;
  const way = attribute('ballWay', 'vec4').xyz,
    local = attribute('position', 'vec3');
  const far = cameraPosition.sub(at).length();
  const radius = max(
    byKind(kind, (s) => s.size),
    far.mul(pixel).mul(byKind(kind, (s) => s.pixels / 2))
  );
  // drawn out along its flight: its half-length the streak's, its kind's least,
  // or its radius, whichever the most
  const speed = way.length().max(1e-3),
    along = way.div(speed);
  const stretch = max(
    max(radius, speed.mul(STREAK / 2)),
    byKind(kind, (s) => s.long)
  ).div(radius);
  m.positionNode = at.add(
    local.add(along.mul(local.dot(along).mul(stretch.sub(1)))).mul(radius)
  );
  // the iron where it faces the eye, the rim's glow where it turns away (none
  // on the harpoon's bolt)
  const facing = varying(
      abs(normalize(local).dot(normalize(cameraPosition.sub(at))))
    ),
    hot = varying(byKind(kind, (s) => s.hot));
  const iron = smoothstep(RIM - 0.12, RIM + 0.12, facing).max(
    float(1).sub(hot.min(1))
  );
  m.colorNode = mix(vec3(...BALL_SPARK).mul(hot), vec3(...BALL_IRON), iron);
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;

  // the tracer: a ribbon facing the eye, from the ball back along its way, x
  // across it (−1…1) and y back (0…1)
  const t = quad(new InstancedBufferGeometry(), 0);
  t.setAttribute('ballAt', new InterleavedBufferAttribute(buffer, 4, 0));
  t.setAttribute('ballWay', new InterleavedBufferAttribute(buffer, 4, 4));
  t.instanceCount = 0;
  const tm = additive(
    new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
  );
  const wide = max(float(TRACER_WIDE), far.mul(pixel).mul(TRACER_PIXELS)).mul(
    0.5
  );
  const across = normalize(cross(along, cameraPosition.sub(at)));
  const back = local.y,
    taper = float(1).sub(back.mul(0.75)),
    trails = byKind(kind, (s) => s.tracer);
  const tail = at
    .sub(along.mul(back.mul(speed).mul(trails)))
    .add(across.mul(local.x.mul(wide).mul(taper)));
  tm.positionNode = tail.mul(select(trails.greaterThan(0), float(1), float(0)));
  const y = varying(back),
    x = varying(local.x),
    glow = varying(byKind(kind, (s) => s.glow));
  tm.colorNode = vec3(...TRACER)
    .mul(glow)
    .mul(pow(float(1).sub(y), 2))
    .mul(smoothstep(1, 0.4, abs(x)));
  const tracer = new Mesh(t, tm);
  tracer.frustumCulled = false;
  tracer.renderOrder = 3;

  return {
    meshes: [mesh, tracer],
    /**
     * Each frame, every ball in flight written where it is: how many are
     * drawn (no more than BALLS).
     */
    draw(flying: readonly BallDraw[]): number {
      const n = Math.min(flying.length, BALLS);
      for (let i = 0; i < n; i++) {
        const { at, way, gun } = flying[i],
          o = i * 8;
        for (let j = 0; j < 3; j++) {
          data[o + j] = at[j];
          data[o + 4 + j] = way[j];
        }
        data[o + 3] = gunOrder(gun);
        data[o + 7] = 0;
      }
      buffer.needsUpdate = n > 0;
      g.instanceCount = t.instanceCount = n;
      return n;
    },
  };
}
