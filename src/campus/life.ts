// The rookery's life: gulls wheeling over the flight loft, and smoke rising from the works' stacks.
//
// The gulls are a flock of this folder's own, each a body and two wings beating in the vertex shader, wheeling on
// circles of their own round a point over the loft (their places worked out here each frame). They are the seam for
// the flight's own gull model: swap the geometry in `gull` for it and the flock flies it.
//
// The smoke is a stream of puffs from each stack's mouth, each rising and drifting downwind as it swells, then thinning
// away; toon-lit in the coal smoke's two tones.

import {
  BufferGeometry, DoubleSide, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3,
} from 'three/webgpu';
import {
  Fn, abs, attribute, faceDirection, float, instanceIndex, normalWorld, normalize, positionLocal, positionWorld, select, sin, uniform, vec3,
} from 'three/tsl';
import { COAL_SMOKE, GULL } from '../palette';
import type { Light } from '../sky/light';

/** The flock: how many, the span of a wing, metres, how fast they beat (rad/s); their circles' radii and heights over
 *  the point they wheel round, metres, and how fast they go round (rad/s). */
const FLOCK = { count: 11, span: 1.7, beat: 9, radius: [7, 19], height: [2, 11], speed: [0.32, 0.55] } as const;
/** The smoke: puffs per stack, the seconds one takes to rise away, how high it rises and how far it drifts downwind,
 *  metres; its size leaving the stack and at its fullest; the most stacks smoking at once. */
const SMOKE = { puffs: 8, life: 7, rise: 16, drift: 9, size: [0.7, 3.2], stacks: 6 } as const;

/** A gull: a body along x (its head forward), a wing out to either side along z, their tips marked to beat. */
function gull(): BufferGeometry {
  const s = FLOCK.span / 2, pos: number[] = [], wing: number[] = [];
  const tri = (a: number[], b: number[], c: number[], w: number[]) => { pos.push(...a, ...b, ...c); wing.push(...w); };
  // the body: a slim diamond, nose to tail, and its tail fan
  tri([0.45, 0, 0], [-0.1, 0.09, 0.09], [-0.1, 0.09, -0.09], [0, 0, 0]);
  tri([0.45, 0, 0], [-0.1, -0.08, -0.09], [-0.1, -0.08, 0.09], [0, 0, 0]);
  tri([-0.1, 0.09, 0.09], [-0.45, 0, 0], [-0.1, 0.09, -0.09], [0, 0, 0]);
  tri([-0.1, -0.08, -0.09], [-0.45, 0, 0], [-0.1, -0.08, 0.09], [0, 0, 0]);
  tri([-0.35, 0.02, 0], [-0.62, 0.02, 0.16], [-0.62, 0.02, -0.16], [0, 0, 0]);
  // each wing: an arm from the shoulder to the wrist, then the hand swept back to the tip
  for (const side of [-1, 1]) {
    const z = (v: number) => side * v;
    tri([0.15, 0.04, z(0.06)], [-0.12, 0.04, z(0.06)], [0.02, 0.06, z(s * 0.5)], [0, 0, 0.5]);
    tri([0.15, 0.04, z(0.06)], [0.02, 0.06, z(s * 0.5)], [0.12, 0.05, z(s * 0.5)], [0, 0.5, 0.5]);
    tri([0.12, 0.05, z(s * 0.5)], [0.02, 0.06, z(s * 0.5)], [-0.32, 0.04, z(s)], [0.5, 0.5, 1]);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('wing', new Float32BufferAttribute(wing, 1));
  g.computeVertexNormals();
  return g;
}

export function createLife(light: Light) {
  const clock = uniform(0);
  // ---- the flock
  const birds = gull();
  const gullMaterial = new MeshBasicNodeMaterial();
  gullMaterial.side = DoubleSide;
  gullMaterial.positionNode = Fn(() => {
    // the wings beat, the tips most, each gull at its own phase
    const w = attribute('wing', 'float'), beat = sin(clock.mul(FLOCK.beat).add(float(instanceIndex).mul(2.3)));
    return positionLocal.add(vec3(0, beat.mul(0.42).mul(w).mul(abs(positionLocal.z).div(FLOCK.span / 2).add(0.2)), 0));
  })();
  gullMaterial.colorNode = Fn(() => {
    // (the wingtips dipped in black)
    const ink = select(attribute('wing', 'float').greaterThan(0.9), float(0.3), float(1));
    return light.leaf(positionWorld, normalize(normalWorld).mul(faceDirection), vec3(...GULL.lit).mul(ink), vec3(...GULL.shadow).mul(ink));
  })();
  const flock = new InstancedMesh(birds, gullMaterial, FLOCK.count);
  flock.count = 0;
  flock.frustumCulled = false;
  flock.name = 'gulls';

  // ---- the smoke
  const puff = new IcosahedronGeometry(1, 1);
  const smokeMaterial = new MeshBasicNodeMaterial();
  smokeMaterial.colorNode = Fn(() => light.toon(positionWorld, normalize(normalWorld), vec3(...COAL_SMOKE.lit), vec3(...COAL_SMOKE.shadow)))();
  const smoke = new InstancedMesh(puff, smokeMaterial, SMOKE.puffs * SMOKE.stacks);
  smoke.count = 0;
  smoke.frustumCulled = false;
  smoke.name = 'smoke';

  const m = new Matrix4(), q = new Quaternion(), s = new Vector3(), p = new Vector3();
  const x = new Vector3(), y = new Vector3(), z = new Vector3(), e1 = new Vector3(), e2 = new Vector3();
  let wheel: { over: Vector3; up: Vector3 } | null = null, stacks: { at: Vector3; up: Vector3 }[] = [];
  const downwind = new Vector3(1, 0, 0);
  const rand = (i: number, k: number) => {
    const t = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return t - Math.floor(t);
  };
  return {
    meshes: [flock, smoke],
    /** Where the gulls wheel (over the flight loft; null: none), the stacks that smoke (each its mouth and up, world
     *  metres), and the way the wind blows there (a unit tangent). */
    set(over: { at: readonly [number, number, number]; up: readonly [number, number, number] } | null, mouths: readonly { at: readonly [number, number, number]; up: readonly [number, number, number] }[], wind: readonly [number, number, number]) {
      wheel = over && { over: new Vector3(...over.at), up: new Vector3(...over.up) };
      stacks = mouths.slice(0, SMOKE.stacks).map((k) => ({ at: new Vector3(...k.at), up: new Vector3(...k.up) }));
      downwind.set(...wind);
    },
    /** The flock and the smoke at the world's clock, s. */
    tick(seconds: number) {
      clock.value = seconds;
      flock.count = wheel ? FLOCK.count : 0;
      if (wheel) {
        const { over, up } = wheel;
        e1.set(1, 0, 0).addScaledVector(up, -up.x).normalize();
        e2.crossVectors(up, e1);
        for (let i = 0; i < FLOCK.count; i++) {
          const r = FLOCK.radius[0] + (FLOCK.radius[1] - FLOCK.radius[0]) * rand(i, 1);
          const h = FLOCK.height[0] + (FLOCK.height[1] - FLOCK.height[0]) * rand(i, 2) + Math.sin(seconds * 0.3 + i) * 1.5;
          const w = (FLOCK.speed[0] + (FLOCK.speed[1] - FLOCK.speed[0]) * rand(i, 3)) * (i % 3 === 0 ? -1 : 1);
          const a = seconds * w + rand(i, 4) * 2 * Math.PI, c = Math.cos(a), sn = Math.sin(a);
          p.copy(over).addScaledVector(e1, c * r).addScaledVector(e2, sn * r).addScaledVector(up, h);
          // flying round the circle, banked into it
          x.copy(e1).multiplyScalar(-sn * Math.sign(w)).addScaledVector(e2, c * Math.sign(w));
          const bank = 0.45 * Math.sign(w);
          z.crossVectors(x, up);
          y.copy(up).multiplyScalar(Math.cos(bank)).addScaledVector(z, -Math.sin(bank));
          z.crossVectors(x, y);
          flock.setMatrixAt(i, m.makeBasis(x, y, z).setPosition(p));
        }
        flock.instanceMatrix.needsUpdate = true;
      }
      smoke.count = stacks.length * SMOKE.puffs;
      stacks.forEach((k, j) => {
        for (let i = 0; i < SMOKE.puffs; i++) {
          const age = (seconds / SMOKE.life + i / SMOKE.puffs + j * 0.37) % 1;
          p.copy(k.at).addScaledVector(k.up, age * SMOKE.rise + 0.4).addScaledVector(downwind, age * age * SMOKE.drift);
          const size = (SMOKE.size[0] + (SMOKE.size[1] - SMOKE.size[0]) * Math.sqrt(age)) * Math.min(1, (1 - age) * 5);
          q.setFromAxisAngle(k.up, i * 1.3 + seconds * 0.2);
          smoke.setMatrixAt(j * SMOKE.puffs + i, m.compose(p, q, s.setScalar(size)));
        }
      });
      smoke.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      birds.dispose();
      puff.dispose();
      gullMaterial.dispose();
      smokeMaterial.dispose();
    },
  };
}
