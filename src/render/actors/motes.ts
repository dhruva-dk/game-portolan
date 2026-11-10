// Motes in the air round the eye that show only where the sun's shadow map says they are lit and shine forward along its
// light, so they gather in the beams between palms, sails and rigging. They live in a box anchored to the world and
// carried by the wind, each coming and going on its own clock; none is ever simulated.
import { BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, AdditiveBlending, Vector3, type Node } from 'three/webgpu';
import {
  Fn, attribute, cameraPosition, cameraProjectionMatrix, cameraViewMatrix, dot, float, floor, fract, length, max, mod, normalize, pow, screenSize, sin, smoothstep, uniform, vec3,
} from 'three/tsl';
import { BODIES, sunlight } from '../atmosphere/light.ts';
import { sunShadow } from '../atmosphere/shadows.ts';
import { P } from '../gpu/uniforms.ts';
import { R } from '../../sim/sphere.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;

/** How many there are, the side of their box in metres, a mote's size in metres, and the fewest pixels half of one covers. */
const COUNT = 700, BOX = 22, SIZE = 0.02, PIXELS = 1.3;

const hash = (p: V3): F => fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)) as unknown as F;

/** Forward scatter of light off a speck, Henyey and Greenstein's phase function, against a speck that scatters evenly. */
const scatter = (c: F, g: number): F => float(1 - g * g).div(pow(float(1 + g * g).sub(c.mul(2 * g)), 1.5));

export class Motes {
  readonly mesh: Mesh;
  /** Where the box is centred, between the eye and what it looks at. */
  readonly #centre = uniform(new Vector3());

  constructor() {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.instanceCount = COUNT;
    // a fixed sequence, so every run scatters them alike
    const data = new Float32Array(COUNT * 4);
    let s = 0x2f6e2b1;
    for (let i = 0; i < data.length; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      data[i] = s / 4294967296;
    }
    g.setAttribute('aRand', new InstancedBufferAttribute(data, 4));

    const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending });
    m.fog = false;
    const rand = attribute<'vec4'>('aRand'), q = attribute<'vec3'>('position').xy;
    const life = rand.z.mul(5).add(7);
    const clock = P.time.div(life).add(rand.x.mul(13));
    const k = floor(clock), a = fract(clock);
    const rnd = vec3(hash(vec3(rand.yz, k) as unknown as V3), hash(vec3(rand.zy, k.add(0.5)) as unknown as V3), hash(vec3(rand.xw, k.add(0.25)) as unknown as V3));
    const centre = this.#centre as unknown as V3;
    const rel = mod(rnd.mul(BOX * 3.7).add((P.drift as unknown as V3).mul(0.25)).sub(centre), BOX).sub(BOX / 2);
    const swayed = rel.add(sin(vec3(1.3, 1.7, 1.1).mul(P.time).mul(0.7).add(rnd.mul(20))).mul(0.15));
    const at = (centre.add(swayed) as unknown as V3).toVar();
    const dist = length(at.sub(cameraPosition)).toVar();
    // no smaller than a pixel or so: smaller still, it dims instead of shrinking
    const perMetre = (cameraProjectionMatrix as unknown as { element(i: number): { element(j: number): F } }).element(1).element(1).mul(screenSize.y).mul(0.5).div(dist);
    const half = max(float(SIZE), float(PIXELS).div(perMetre)).toVar();
    const view = cameraViewMatrix as unknown as { element(i: number): Node<'vec4'> };
    const right = vec3(view.element(0).x, view.element(1).x, view.element(2).x);
    const up = vec3(view.element(0).y, view.element(1).y, view.element(2).y);
    m.positionNode = at.add(right.mul(q.x).add(up.mul(q.y)).mul(half));

    const box = max(max(rel.x.abs(), rel.y.abs()), rel.z.abs()).div(BOX);
    const fade = smoothstep(0, 0.2, a).mul(smoothstep(1, 0.8, a)).mul(float(1).sub(smoothstep(0.38, 0.5, box)))
      .mul(smoothstep(0.2, 0.8, length(at).sub((P.planet as unknown as { y: F }).y))).mul(smoothstep(0.5, 2, dist))
      .mul(pow(float(SIZE).div(half), 2));
    const glint = sin(P.time.mul(2).add(rand.y.mul(30))).mul(0.4).add(0.6);
    const look = normalize(at.sub(cameraPosition));
    const r2 = dot(q, q);
    m.colorNode = Fn(() => {
      const soft = float(1).sub(r2).max(0);
      return sunlight.mul(BODIES.sun).mul(sunShadow()).mul(scatter(dot(look, P.sunDir as unknown as V3).negate() as unknown as F, 0.75)).mul(fade).mul(1.5).mul(glint).mul(soft).mul(soft);
    })() as unknown as V3;
    this.mesh = new Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.renderOrder = 5;
  }

  /** Once a frame, with where the eye is and the unit direction of what it follows. */
  update(eye: Vector3, target: { x: number; y: number; z: number }): void {
    (this.#centre.value as Vector3).set(eye.x + (target.x * R - eye.x) * 0.45, eye.y + (target.y * R - eye.y) * 0.45, eye.z + (target.z * R - eye.z) * 0.45);
  }
}
