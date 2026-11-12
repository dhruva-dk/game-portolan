// Every ship on the sea, drawn as instances: the galleon at each of its levels of detail (detail.ts) is three meshes
// — body, cloth, ropes — and each is drawn once a frame for all the ships at that level, nine draws at most for the
// fleet beyond the three of the nearest level. Each frame, every ship in view gets a level by how big she looks
// (with some slack, so she doesn't flicker between two), and her pose and look are packed into her level's instance
// buffer, which its three meshes share.
//
// A ship's pose is world/pose.ts's; her look the captain's colours. The wind she feels is the planet's at her less her
// own motion (the apparent wind), in her own frame: sails and pennants lean with it in the shader, and her crew haul
// her square yards round to meet it (motion.ts).
//
// One ship may be the player's own (`own`): she is always drawn at the finest level.
//
// Her canvas and pennants are simulated as cloth while she is among the few nearest the eye (berths.ts, cloth.ts),
// the player's own always: each frame the berths are handed out, and each berthed ship's apparent wind and motion
// (motion.ts) handed to the cloth, before it is moved on. Every other ship's are the drawn shape the shader fills.

import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Frustum, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  Matrix4, Mesh, Sphere, Vector3, type Material, type PerspectiveCamera, type WebGPURenderer,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Light } from '../land/light';
import type { ShipPose } from '../world/pose';
import { add, cross, dot, length, scale, type Vec3 } from '../world/sphere';
import type { Wind } from '../world/wind';
import { BERTHS, moor, type Berth } from './berths';
import { buildShip, type Packed } from './build';
import { createCloth } from './cloth';
import { DETAILS, chooseDetail } from './detail';
import { createShipMaterials } from './materials';
import { feeling, hauled, inFrame, moved, trim, type Motion } from './motion';

/** A captain's colours (linear rgb, 0…1). */
export interface Look {
  paint: Vec3;
  sail: Vec3;
  /** A band of the paint across her sails. */
  band: boolean;
}

/** Floats an instance: at, fwd, up, paint, cloth and berth, each a vec4 (materials.ts). */
const STRIDE = 24;
/** Her middle, above the waterline, metres, and a sphere round her whole rig from there. */
const MIDDLE = 9, RADIUS = 18;
/** The wind at which the sails are full and the pennants stream straight, metres per second. */
const FULL = 8;

const levels = DETAILS.length;

/** Ship i's own phase, radians, so no two ships' canvas moves in step. */
const phaseOf = (i: number) => (i * 2.399) % (2 * Math.PI);

/** The draw for one packed mesh, sharing its level's instances. */
function drawOf(p: Packed, instances: InstancedInterleavedBuffer, material: Material): Mesh {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(p.position, 3));
  g.setAttribute('nrm', new BufferAttribute(p.normal, 4, true));
  if (p.uv) g.setAttribute('uv', new BufferAttribute(p.uv, 2, true));
  g.setAttribute('part', new BufferAttribute(p.part, 4, true));
  g.setIndex(new BufferAttribute(p.index, 1));
  ['shipAt', 'shipFwd', 'shipUp', 'shipPaint', 'shipCloth', 'shipBerth'].forEach((name, i) =>
    g.setAttribute(name, new InterleavedBufferAttribute(instances, 4, i * 4)));
  g.instanceCount = 0;
  const mesh = new Mesh(g as BufferGeometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  // the blended ropes after the sea, which reads what is behind it from what was drawn before it
  mesh.renderOrder = material.transparent ? 1 : 0;
  return mesh;
}

export type Fleet = ReturnType<typeof createFleet>;

/** capacity: the most ships there will be. */
export function createFleet(renderer: WebGPURenderer, light: Light, wind: Wind, capacity: number) {
  const pixel = uniform(0.0026);
  const cloth = createCloth(renderer);
  const materials = createShipMaterials(light, pixel, cloth);
  const instances = Array.from({ length: levels }, () => {
    const buffer = new InstancedInterleavedBuffer(new Float32Array(capacity * STRIDE), STRIDE);
    return buffer.setUsage(DynamicDrawUsage);
  });
  const draws = instances.map((buffer, k) => {
    const ship = buildShip(k);
    // (the farthest level has no ropes, and so no rope draw)
    return ([[ship.body, materials.body], [ship.cloth, materials.cloth], [ship.ropes, materials.ropes]] as const)
      .filter(([p]) => p.triangles > 0).map(([p, material]) => drawOf(p, buffer, material));
  });
  const meshes = draws.flat();

  const poses: ShipPose[] = [], looks: Look[] = [], velocities: Vec3[] = [], was: number[] = [];
  /** How each ship's square yards are braced, radians (+ turns the port arm aft). */
  const braces: number[] = [];
  let count = 0, pinned = -1, own = -1;
  let berths: (Berth | null)[] = new Array(BERTHS).fill(null), simulating = true;
  const motions: (Motion | null)[] = new Array(BERTHS).fill(null);
  const frustum = new Frustum(), sphere = new Sphere(), m = new Matrix4();

  /** The ship i's pose, look and velocity (metres per second, world space); ships 0…count−1 are drawn. */
  function set(i: number, pose: ShipPose, look: Look, velocity: Vec3 = [0, 0, 0]) {
    if (i >= capacity) throw new Error(`fleet: ship ${i} past capacity ${capacity}`);
    poses[i] = pose;
    looks[i] = look;
    velocities[i] = velocity;
    was[i] ??= -1;
    // (her yards trimmed to the wind she first feels, then hauled round as it changes)
    braces[i] ??= NaN;
    count = Math.max(count, i + 1);
  }

  /** The wind ship i feels, metres a second, in the world: the planet's at her less her own motion. */
  const apparent = (i: number, windSpeed: number) => add(scale(wind(poses[i].position), windSpeed), velocities[i], -1);

  /** The berths handed out, and each berthed ship's canvas moved on dt seconds. */
  function sail(eye: Vector3, windSpeed: number, dt: number) {
    for (let i = 0; i < count; i++) {
      const w = inFrame(poses[i], apparent(i, windSpeed));
      braces[i] = Number.isNaN(braces[i]) ? trim(w, 0) : hauled(braces[i], w, dt);
    }
    const metres = poses.slice(0, count).map((p) => eye.distanceTo(new Vector3(...add(p.position, p.up, MIDDLE))));
    const before = berths;
    berths = moor(berths, simulating ? metres : metres.map(() => Infinity), simulating ? own : -1, dt);
    berths.forEach((b, k) => {
      if (!b) { motions[k] = null; cloth.set(k, null); return; }
      const motion = moved(b.fresh || before[k]?.ship !== b.ship ? null : motions[k], poses[b.ship], dt);
      motions[k] = motion;
      const wind = inFrame(poses[b.ship], apparent(b.ship, windSpeed));
      cloth.set(k, { brace: braces[b.ship], phase: phaseOf(b.ship), wind, ...feeling(motion) }, b.fresh);
    });
    cloth.update(dt);
  }

  /**
   * Each frame, after the camera has moved: windSpeed in metres per second; height the drawing buffer's, pixels; dt
   * the seconds since the last.
   */
  function update(camera: PerspectiveCamera, windSpeed: number, height: number, dt: number) {
    pixel.value = (2 * Math.tan(((camera.fov / camera.zoom) * Math.PI) / 360)) / height;
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const eye = camera.getWorldPosition(new Vector3());
    sail(eye, windSpeed, dt);
    const share = new Map(berths.flatMap((b, k) => (b ? [[b.ship, [k, b.share]] as const] : [])));
    const filled = new Array<number>(levels).fill(0);
    for (let i = 0; i < count; i++) {
      const pose = poses[i], look = looks[i];
      const middle = add(pose.position, pose.up, MIDDLE);
      sphere.set(new Vector3(...middle), RADIUS);
      if (!frustum.intersectsSphere(sphere)) { was[i] = -1; continue; }
      // (the player's own ship always whole: the chase camera holds her at the finest level's edge)
      const k = pinned >= 0 ? pinned : i === own ? 0 : chooseDetail(was[i], eye.distanceTo(sphere.center), pixel.value);
      was[i] = k;
      // the apparent wind, as a share of FULL (at most 1) along her own axes
      const w = apparent(i, windSpeed), size = length(w);
      const strength = size > 0 ? Math.min(size / FULL, 1) / size : 0, port = cross(pose.up, pose.forward);
      const a = instances[k].array as Float32Array, o = filled[k]++ * STRIDE;
      a.set([...pose.position, braces[i], ...pose.forward, dot(w, port) * strength, ...pose.up, dot(w, pose.forward) * strength,
        ...look.paint, look.band ? 1 : 0, ...look.sail, phaseOf(i), ...(share.get(i) ?? [0, 0]), 0, 0], o);
    }
    draws.forEach((three, k) => {
      instances[k].needsUpdate = true;
      for (const mesh of three) {
        (mesh.geometry as InstancedBufferGeometry).instanceCount = filled[k];
        mesh.visible = filled[k] > 0;
      }
    });
  }

  return {
    meshes,
    set,
    update,
    /** Ship i is the player's own (or none, for null): she is always drawn at the finest level. */
    own(i: number | null) { own = i ?? -1; },
    /** Simulate the near ships' canvas as cloth, or (false: a debug view) draw every ship's as the wind fills it. */
    simulate(on: boolean) { simulating = on; },
    /** Draw every ship at level k, or by her size again for null (a debug view). */
    pin(k: number | null) { pinned = k ?? -1; },
    get count() { return count; },
    /** Ships 0…count−1 as last set: each one's pose, look (and her yards' brace) and velocity (for the marks she leaves
     * on the sea). */
    get ships() { return poses.slice(0, count).map((pose, i) => ({ pose, look: { ...looks[i], brace: braces[i] }, velocity: velocities[i] })); },
  };
}
