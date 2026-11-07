// What falls through the air round the eye: rain, snow, ash and the embers drifting up out of it, as deep as the eye is
// in each kind of weather.
//
// Each is a fixed scatter of drops or flakes in a box round the eye, carried through it by the fall and the wind and
// wrapped at its sides, so the scatter stays put in the world as the eye sails through it and is never refilled. The
// box's axes are the eye's own up and two tangents. Drops are drawn as streaks along the way they fall as seen on
// screen, as long as they fall in a shutter's time; flakes face the eye and tumble. Both are kept at least a pixel
// wide and thinned by what that widening added, so a raindrop a few millimetres across neither flickers in and out
// between pixels nor thickens into a rope. They are lit where they are: rain shows the sky it bends toward the eye and
// the sun glinting through it, snow and ash scatter the sun and the moon (after the clouds over them) and the sky's
// light, and embers glow at the lamps' scale.
import {
  AdditiveBlending, Group, InstancedBufferAttribute, InstancedBufferGeometry, Float32BufferAttribute, Mesh,
  MeshBasicNodeMaterial, NormalBlending, Vector3, type Node,
} from 'three/webgpu';
import {
  attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, cameraWorldMatrix, clamp, cos, float, instanceIndex,
  length, max, mix, mod, normalize, positionGeometry, pow, screenSize, select, sin, smoothstep, uniform, uv,
  varying, vec2, vec3, vec4,
} from 'three/tsl';
import { LAMP, P } from '../gpu/uniforms.ts';
import { MOON_RADIUS, SUN_RADIUS, lightTransmittance } from './luts.ts';
import { skyLight } from './light.ts';
import { bodyShades } from './shade.ts';

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;
type V4 = Node<'vec4'>;

/** The box's axes: two tangents and up at the eye. */
const BOX = { e1: uniform(new Vector3(1, 0, 0)), up: uniform(new Vector3(0, 1, 0)), e2: uniform(new Vector3(0, 0, 1)) };

interface Spec {
  name: string;
  /** How many at the deepest, and the side of the box they fill, metres. */
  count: number; span: number;
  /** Streaks along the fall, or flakes facing the eye. */
  streak: boolean;
  /** The drop or flake's size, metres, from the smallest to the largest. */
  size: [number, number];
  /** How fast it falls (negative rises), m/s, and how much of the wind carries it. */
  fall: number; carried: number;
  /** How far a flake sways from its line, metres, and how it is drawn. */
  sway: number;
  look: 'rain' | 'snow' | 'ash' | 'ember';
  /** How much of a pixel it covers at most. */
  alpha: number;
}

const SPECS: Spec[] = [
  { name: 'rain', count: 16000, span: 26, streak: true, size: [0.002, 0.005], fall: 9.5, carried: 0.9, sway: 0, look: 'rain', alpha: 0.8 },
  { name: 'snow', count: 14000, span: 22, streak: false, size: [0.012, 0.032], fall: 1.1, carried: 0.8, sway: 0.35, look: 'snow', alpha: 0.95 },
  { name: 'ash', count: 9000, span: 22, streak: false, size: [0.012, 0.04], fall: 0.6, carried: 0.95, sway: 0.25, look: 'ash', alpha: 0.9 },
  { name: 'embers', count: 1400, span: 30, streak: false, size: [0.02, 0.05], fall: -0.8, carried: 1, sway: 0.6, look: 'ember', alpha: 1 },
];

/** How long a shutter is open: how long a streak the fall draws. */
const SHUTTER = 1 / 45;

interface Layer { spec: Spec; mesh: Mesh; geometry: InstancedBufferGeometry; amount: { value: number }; vel: { value: Vector3 } }

function layer(spec: Spec): Layer {
  const g = new InstancedBufferGeometry();
  // x across (−1…1), y from the head (0) back along the streak or up the flake (1)
  g.setAttribute('position', new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  const seeds = new Float32Array(spec.count * 4);
  let s = spec.count * 7919 + spec.span;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  g.setAttribute('seed', new InstancedBufferAttribute(seeds, 4));
  g.instanceCount = 0;

  const amount = uniform(0), vel = uniform(new Vector3());
  const glow = spec.look === 'ember';
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: glow ? AdditiveBlending : NormalBlending });
  m.fog = !glow;
  const seed = attribute<'vec4'>('seed') as V4;
  const span = spec.span;
  // each its own speed a little off the rest, and the flakes their own sway
  const v = vel.mul(seed.w.mul(0.3).add(0.85)) as V3;
  const off = vec3(cameraPosition.dot(BOX.e1), cameraPosition.dot(BOX.up), cameraPosition.dot(BOX.e2));
  const phase = seed.w.mul(6.2832).add(seed.x.mul(17));
  const sway = vec3(sin(P.time.mul(1.3).add(phase)), 0, cos(P.time.mul(1.1).add(phase.mul(1.7)))).mul(spec.sway);
  const q = mod(seed.xyz.mul(span).add(v.mul(P.time)).sub(off), span).sub(span / 2).add(sway);
  const centre = cameraPosition.add(BOX.e1.mul(q.x)).add(BOX.up.mul(q.y)).add(BOX.e2.mul(q.z));
  const velWorld = BOX.e1.mul(v.x).add(BOX.up.mul(v.y)).add(BOX.e2.mul(v.z));
  const size = mix(float(spec.size[0]), float(spec.size[1]), seed.y.mul(seed.z));
  const c = cameraViewMatrix.mul(vec4(centre, 1));
  const depth = max(c.z.negate(), 0.05);
  // a pixel's width at that depth
  const pixel = depth.mul(2).div((cameraProjectionMatrix as unknown as { element(i: number): V4 }).element(1).y.mul(screenSize.y)).mul(0.8);
  const width = max(size, pixel);
  const g2 = positionGeometry.xy;
  let corner: V2;
  let thin: F;
  if (spec.streak) {
    const d = cameraViewMatrix.mul(vec4(velWorld, 0)).xy;
    const len = length(d);
    const dir = select(len.greaterThan(1e-4), d.div(max(len, 1e-4)), vec2(0, -1));
    const side = vec2(dir.y.negate(), dir.x);
    corner = c.xy.add(side.mul(width.mul(g2.x))).sub(dir.mul(max(len.mul(SHUTTER), width.mul(2)).mul(g2.y)));
    thin = size.div(width);
  } else {
    const a = seed.x.mul(40).add(P.time.mul(seed.y.sub(0.5).mul(3)));
    const ca = cos(a), sa = sin(a);
    const r = vec2(g2.x, g2.y.mul(2).sub(1));
    corner = c.xy.add(vec2(r.x.mul(ca).sub(r.y.mul(sa)), r.x.mul(sa).add(r.y.mul(ca))).mul(width));
    thin = pow(size.div(width), 2);
  }
  const world = cameraWorldMatrix.mul(vec4(corner, c.z, 1)).xyz;
  m.positionNode = world;
  // the last of them thinning in as the weather deepens, those at the box's sides and at the lens thinning out
  const shown = clamp(amount.mul(spec.count).sub(float(instanceIndex)).div(spec.count * 0.08), 0, 1);
  const edge = smoothstep(span * 0.5, span * 0.3, length(q));
  const near = smoothstep(0.2, 1.1, depth);
  const fade = varying(shown.mul(edge).mul(near).mul(thin) as F, 'vFallFade') as unknown as F;
  const at = varying(centre as V3, 'vFallAt') as unknown as V3;
  const f = uv();
  const shape = spec.streak
    ? float(1).sub(f.x.mul(2).sub(1).pow(2)).mul(smoothstep(0, 0.15, f.y)).mul(smoothstep(1, 0.6, f.y))
    : smoothstep(1, 0.35, vec2(f.x.mul(2).sub(1), f.y.mul(2).sub(1)).length());
  const alpha = shape.mul(fade).mul(spec.alpha);
  m.opacityNode = alpha;
  m.alphaTest = 0.002;
  if (glow) {
    const flicker = sin(P.time.mul(9).add(phase.mul(5))).mul(0.3).add(0.7);
    m.colorNode = vec3(2.4, 0.9, 0.25).mul(flicker).mul(LAMP).mul(6);
  } else {
    const r = length(at), up = at.div(r);
    const shade = bodyShades(at);
    const sun = lightTransmittance(r, up.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance).mul(shade.sun);
    const moon = lightTransmittance(r, up.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase).mul(shade.moon);
    const sky = skyLight(at, up).add(skyLight(at, up.negate())).mul(0.5).div(Math.PI);
    if (spec.look === 'rain') {
      // a drop bends the whole sky toward the eye, brighter than the haze round it, and the sun glints through it
      // from behind
      const view = normalize(at.sub(cameraPosition));
      const glint = pow(max(view.dot(P.sunDir), 0), 12).mul(2).add(0.06);
      m.colorNode = sky.mul(vec3(1.3, 1.38, 1.5)).add(sun.mul(glint)).add(moon.mul(glint));
    } else {
      const albedo = spec.look === 'snow' ? vec3(0.95, 0.96, 1) : vec3(0.09, 0.085, 0.08);
      m.colorNode = sun.add(moon).mul(0.25).add(sky).mul(albedo);
    }
  }
  const mesh = new Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  mesh.name = spec.name;
  mesh.visible = false;
  return { spec, mesh, geometry: g, amount, vel };
}

/** How deep the eye is in what falls, 0…1. */
export interface Falling { rain: number; snow: number; ash: number }

export class Fall {
  readonly group = new Group();
  readonly #layers = SPECS.map(layer);

  constructor() {
    this.group.name = 'fall';
    for (const l of this.#layers) this.group.add(l.mesh);
  }

  update(eye: Vector3, wind: Vector3, falling: Falling): void {
    const up = (BOX.up.value as Vector3).copy(eye).normalize();
    const e1 = (BOX.e1.value as Vector3).set(0, 1, 0).cross(up);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
    e1.normalize();
    (BOX.e2.value as Vector3).crossVectors(up, e1);
    const e2 = BOX.e2.value as Vector3;
    const deep: Record<Spec['look'], number> = { rain: falling.rain, snow: falling.snow, ash: falling.ash, ember: falling.ash * 0.8 };
    for (const l of this.#layers) {
      const a = Math.min(1, deep[l.spec.look]);
      l.amount.value = a;
      l.mesh.visible = a > 0.01;
      l.geometry.instanceCount = l.mesh.visible ? Math.min(l.spec.count, Math.ceil(a * l.spec.count * 1.08)) : 0;
      // the wind in the box's own axes, and the fall down it
      l.vel.value.set(wind.dot(e1) * l.spec.carried, -l.spec.fall, wind.dot(e2) * l.spec.carried);
    }
  }
}
