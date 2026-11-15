// The rookery's life: gulls wheeling over the flight loft, and smoke rising from the works' stacks.
//
// The gulls are the flight's own (gulls/gull.ts), drawn in the flight's one instanced draw with its material: here
// they are only worked out, each wheeling on a circle of its own round a point over the loft, banked into it, in the
// crew's colours (its first on their wingtips, its second on their scarves); the frame hands them to the gulls' draw.
//
// The smoke is a stream of puffs from each stack's mouth, each rising and drifting downwind as it swells, then thinning
// away; toon-lit in the coal smoke's two tones.

import { IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { Fn, normalWorld, normalize, positionWorld, vec3 } from 'three/tsl';
import { COAL_SMOKE } from '../palette';
import type { Light } from '../sky/light';
import type { Vec3 } from '../world/sphere';

/** The flock: how many, their size (the flight's gull is about a metre from beak to tail); their circles' radii and
 *  heights over the point they wheel round, metres, and how fast they go round (rad/s). */
const FLOCK = { count: 11, size: 1.3, radius: [7, 19], height: [2, 11], speed: [0.32, 0.55] } as const;
/** The smoke: puffs per stack, the seconds one takes to rise away, how high it rises and how far it drifts downwind,
 *  metres; its size leaving the stack and at its fullest; the most stacks smoking at once. */
const SMOKE = { puffs: 8, life: 7, rise: 16, drift: 9, size: [0.7, 3.2], stacks: 6 } as const;

/** A gull of the flock, flying: where (world metres), heading along `ahead`, `up` its back (banked), in the crew's
 *  colours, at its size (gulls/gulls.ts Wheeling). */
export interface FlockGull { at: Vec3; ahead: Vec3; up: Vec3; paint: Vec3; sail: Vec3; size: number }

export function createLife(light: Light) {
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
  let colours: { paint: Vec3; sail: Vec3 } = { paint: [1, 1, 1], sail: [1, 1, 1] };
  let flock: FlockGull[] = [];
  const downwind = new Vector3(1, 0, 0);
  const rand = (i: number, k: number) => {
    const t = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return t - Math.floor(t);
  };
  return {
    meshes: [smoke],
    /** Where the gulls wheel (over the flight loft; null: none) and the crew's colours, the stacks that smoke (each its
     *  mouth and up, world metres), and the way the wind blows there (a unit tangent). */
    set(over: { at: Vec3; up: Vec3; paint: Vec3; sail: Vec3 } | null, mouths: readonly { at: Vec3; up: Vec3 }[], wind: Vec3) {
      wheel = over && { over: new Vector3(...over.at), up: new Vector3(...over.up) };
      if (over) colours = { paint: over.paint, sail: over.sail };
      stacks = mouths.slice(0, SMOKE.stacks).map((k) => ({ at: new Vector3(...k.at), up: new Vector3(...k.up) }));
      downwind.set(...wind);
    },
    /** The flock's gulls as last worked out (none: no loft stands). */
    flock: (): readonly FlockGull[] => flock,
    /** The flock and the smoke at the world's clock, s. */
    tick(seconds: number) {
      flock = [];
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
          flock.push({ at: [p.x, p.y, p.z], ahead: [x.x, x.y, x.z], up: [y.x, y.y, y.z], ...colours, size: FLOCK.size });
        }
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
      puff.dispose();
      smokeMaterial.dispose();
    },
  };
}
