// The Gale, seen from the air it blows through: long streaks of wind and rags of torn cloud streaming back past the
// fleet, most of them under it, so the fleet rides on them.
//
// Each is a fixed scatter in a box that travels with the fleet along the course, the streaks and the rags sliding back
// through it at their own speeds and wrapped at its ends, where they thin to nothing, so nothing is ever refilled. The
// box bends with the planet's curve. A streak is one ribbon turned to face the eye and kept at least a pixel wide, a
// rag one wide soft quad with its edges torn by a few sines; between them two draw calls and a few hundred quads, lit
// by no more than the height of the sun where the fleet is.
import {
  Group, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial,
  NormalBlending, Vector3, type Node,
} from 'three/webgpu';
import {
  abs, attribute, cameraPosition, cameraProjectionMatrix, cross, float, length, max, mix, mod, normalize, positionGeometry,
  screenSize, sin, smoothstep, uniform, uv, varying, vec3,
} from 'three/tsl';
import { P } from '../gpu/uniforms.ts';
import { R } from '../../sim/sphere.ts';
import type { V3 } from '../../sim/math.ts';

type F = Node<'float'>;
type V3N = Node<'vec3'>;
type V4N = Node<'vec4'>;

/** Where the Gale is this frame, as the stage is told it. */
export interface GaleView {
  /** The fleet's middle on the course (a unit vector), and the way on there (a unit tangent). */
  at: V3;
  way: V3;
  /** The fleet's height over the sea, metres. */
  height: number;
  /** How much of it shows, 0…1. */
  strength: number;
}

/** The box: its middle, its axes (the way on, across it, and up). */
const BOX = {
  at: uniform(new Vector3(0, 1, 0)),
  way: uniform(new Vector3(1, 0, 0)),
  side: uniform(new Vector3(0, 0, 1)),
  up: uniform(new Vector3(0, 1, 0)),
  /** The radius the box bends round. */
  r: uniform(R),
};

interface Spec {
  name: string;
  count: number;
  /** The box's length and width, metres. */
  length: number; width: number;
  /** Heights against the fleet, metres, the many at the first. */
  rise: [number, number];
  /** Metres a second back through the box. */
  speed: number;
  /** Each one's length and width, metres, from the shortest to the longest. */
  long: [number, number]; wide: [number, number];
  /** How much of what is behind it it hides at most. */
  alpha: number;
  torn: boolean;
}

const SPECS: Spec[] = [
  { name: 'gale-streaks', count: 380, length: 620, width: 300, rise: [-85, 40], speed: 62, long: [26, 95], wide: [0.25, 0.9], alpha: 0.62, torn: false },
  { name: 'gale-rags', count: 44, length: 700, width: 340, rise: [-120, -14], speed: 34, long: [55, 140], wide: [9, 26], alpha: 0.5, torn: true },
];

interface Layer { mesh: Mesh; amount: { value: number } }

function layer(spec: Spec): Layer {
  const g = new InstancedBufferGeometry();
  // x across (−1…1), y along, tail (0) to head (1)
  g.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(spec.count * 4);
  let s = spec.count * 6271 + 13;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  g.setAttribute('seed', new InstancedBufferAttribute(seeds, 4));
  g.instanceCount = spec.count;

  const amount = uniform(0);
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending });
  m.fog = false;
  const seed = attribute<'vec4'>('seed') as V4N;
  // the box's own axes, the streak sliding back along the first and wrapped at its ends
  const run = seed.x.mul(spec.length).add(P.time.mul(spec.speed).mul(seed.w.mul(0.5).add(0.75)));
  const qx = float(spec.length / 2).sub(mod(run, spec.length));
  const qy = seed.y.mul(2).sub(1).mul(spec.width / 2);
  // most of them under the fleet
  const qz = mix(float(spec.rise[0]), float(spec.rise[1]), seed.z.mul(seed.z));
  const bend = qx.mul(qx).div(BOX.r.mul(2));
  const centre = BOX.at.add(BOX.way.mul(qx)).add(BOX.side.mul(qy)).add(BOX.up.mul(qz.sub(bend)));
  const tangent = normalize(BOX.way.sub(BOX.up.mul(qx.div(BOX.r))));
  const toEye = centre.sub(cameraPosition).negate();
  const depth = max(length(toEye), 1);
  const ribbon = normalize(cross(tangent, toEye.div(depth)));
  const pixel = depth.mul(2).div((cameraProjectionMatrix as unknown as { element(i: number): V4N }).element(1).y.mul(screenSize.y)).mul(0.8);
  const size = mix(float(spec.wide[0]), float(spec.wide[1]), seed.w.mul(seed.y));
  const width = max(size, pixel);
  const long = mix(float(spec.long[0]), float(spec.long[1]), seed.z);
  const v = positionGeometry.y.sub(0.5);
  m.positionNode = centre.add(tangent.mul(long.mul(v))).add(ribbon.mul(width.mul(positionGeometry.x)));

  // thin at the box's ends and at its sides, thin close to the eye, and thinned for what the pixel's width added
  const edge = smoothstep(0.5, 0.36, abs(qx.div(spec.length))).mul(smoothstep(0.5, 0.38, abs(qy.div(spec.width))));
  const fade = varying(edge.mul(smoothstep(14, 46, depth)).mul(size.div(width)).mul(seed.y.mul(0.35).add(0.65)) as F, 'vGaleFade') as unknown as F;
  const f = uv(), x = f.x.mul(2).sub(1), y = f.y.mul(2).sub(1);
  let shape: F;
  if (spec.torn) {
    const p = varying(seed.x.mul(40) as F, 'vGalePhase') as unknown as F;
    const tear = sin(y.mul(7).add(p)).mul(0.5).add(sin(y.mul(17).add(x.mul(5)).add(p.mul(1.7))).mul(0.3)).add(sin(y.mul(37).sub(x.mul(11)).add(p.mul(3.1))).mul(0.2));
    shape = smoothstep(0.1, 0.6, float(1).sub(x.mul(x)).sub(y.mul(y).mul(0.9)).add(tear.mul(0.3)));
  } else {
    // a head a little sharper than its tail
    shape = float(1).sub(x.mul(x)).mul(smoothstep(0, 0.55, f.y)).mul(smoothstep(1, 0.86, f.y));
  }
  m.opacityNode = shape.mul(fade).mul(amount).mul(spec.alpha);
  m.alphaTest = 0.003;
  // the height of the sun over the fleet: the sun's own colour reddening as it comes down, the moon's by night
  const sun = (BOX.up as unknown as V3N).dot(P.sunDir);
  const day = smoothstep(-0.14, 0.18, sun);
  const warm = mix(vec3(1, 0.6, 0.38), vec3(1, 1, 1), smoothstep(0, 0.4, sun));
  m.colorNode = P.sunIlluminance.mul(warm).mul(day).mul(0.3).add(P.moonIlluminance.mul(P.moonPhase).mul(0.5)).add(vec3(0.004, 0.005, 0.007));
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.name = spec.name;
  return { mesh, amount };
}

export class GaleAir {
  readonly group = new Group();
  readonly #layers = SPECS.map(layer);

  constructor() {
    this.group.name = 'gale';
    this.group.visible = false;
    for (const l of this.#layers) this.group.add(l.mesh);
  }

  /** Where the Gale is, or null when nothing is riding it. */
  update(v: GaleView | null): void {
    const a = v ? Math.min(1, Math.max(0, v.strength)) : 0;
    this.group.visible = a > 0.004;
    if (!v || !this.group.visible) return;
    for (const l of this.#layers) l.amount.value = a;
    const r = R + v.height;
    (BOX.at.value as Vector3).set(v.at.x, v.at.y, v.at.z).multiplyScalar(r);
    const up = (BOX.up.value as Vector3).set(v.at.x, v.at.y, v.at.z);
    const way = (BOX.way.value as Vector3).set(v.way.x, v.way.y, v.way.z);
    (BOX.side.value as Vector3).crossVectors(way, up);
    BOX.r.value = r;
  }
}
