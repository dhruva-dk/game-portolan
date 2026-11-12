// Every ship on the sea, drawn as instances: the galleon at each of its levels of detail (detail.ts) is three meshes
// — body, cloth, ropes — and each is drawn once a frame for all the ships at that level, nine draws at most for the
// fleet beyond the three of the nearest level. Each frame, every ship in view gets a level by how big she looks
// (with some slack, so she doesn't flicker between two), and her pose and look are packed into her level's instance
// buffer, which its three meshes share.
//
// A ship's pose is world/pose.ts's; her look the captain's colours and how her yards are braced. The wind she feels
// is the planet's at her less her own motion (the apparent wind), in her own frame: sails and pennants lean with it in
// the shader.
//
// One ship may be the player's own (`own`): she is always drawn at the finest level, and her sails thin out round
// the aim point on the screen (`aim`, the screen's middle by default) so they never hide what she aims at.

import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, Frustum, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  Matrix4, Mesh, Sphere, Vector2, Vector3, type Material, type PerspectiveCamera,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Light } from '../land/light';
import type { ShipPose } from '../world/pose';
import { add, cross, dot, length, scale, type Vec3 } from '../world/sphere';
import type { Wind } from '../world/wind';
import { buildShip, type Packed } from './build';
import { DETAILS, chooseDetail } from './detail';
import { createShipMaterials } from './materials';

/** A captain's colours (linear rgb, 0…1) and how her square yards are braced (radians; + turns the port arm aft). */
export interface Look {
  paint: Vec3;
  sail: Vec3;
  /** A band of the paint across her sails. */
  band: boolean;
  brace: number;
}

/** Floats an instance: at, fwd, up, paint, cloth (each a vec4) and clear (materials.ts). */
const STRIDE = 21;
/** Her middle, above the waterline, metres, and a sphere round her whole rig from there. */
const MIDDLE = 9, RADIUS = 18;
/** The wind at which the sails are full and the pennants stream straight, metres per second. */
const FULL = 8;

const levels = DETAILS.length;

/** The draw for one packed mesh, sharing its level's instances. */
function drawOf(p: Packed, instances: InstancedInterleavedBuffer, material: Material): Mesh {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new BufferAttribute(p.position, 3));
  g.setAttribute('nrm', new BufferAttribute(p.normal, 4, true));
  if (p.uv) g.setAttribute('uv', new BufferAttribute(p.uv, 2, true));
  g.setAttribute('part', new BufferAttribute(p.part, 4, true));
  g.setIndex(new BufferAttribute(p.index, 1));
  ['shipAt', 'shipFwd', 'shipUp', 'shipPaint', 'shipCloth'].forEach((name, i) =>
    g.setAttribute(name, new InterleavedBufferAttribute(instances, 4, i * 4)));
  g.setAttribute('shipClear', new InterleavedBufferAttribute(instances, 1, 20));
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
export function createFleet(light: Light, wind: Wind, capacity: number) {
  const pixel = uniform(0.0026), aim = uniform(new Vector2(0.5, 0.5));
  const materials = createShipMaterials(light, pixel, aim);
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
  let count = 0, pinned = -1, own = -1;
  const frustum = new Frustum(), sphere = new Sphere(), m = new Matrix4();

  /** The ship i's pose, look and velocity (metres per second, world space); ships 0…count−1 are drawn. */
  function set(i: number, pose: ShipPose, look: Look, velocity: Vec3 = [0, 0, 0]) {
    if (i >= capacity) throw new Error(`fleet: ship ${i} past capacity ${capacity}`);
    poses[i] = pose;
    looks[i] = look;
    velocities[i] = velocity;
    was[i] ??= -1;
    count = Math.max(count, i + 1);
  }

  /** Each frame, after the camera has moved: windSpeed in metres per second; height the drawing buffer's, pixels. */
  function update(camera: PerspectiveCamera, windSpeed: number, height: number) {
    pixel.value = (2 * Math.tan(((camera.fov / camera.zoom) * Math.PI) / 360)) / height;
    frustum.setFromProjectionMatrix(m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const eye = camera.getWorldPosition(new Vector3());
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
      const w = add(scale(wind(pose.position), windSpeed), velocities[i], -1), size = length(w);
      const strength = size > 0 ? Math.min(size / FULL, 1) / size : 0, port = cross(pose.up, pose.forward);
      const a = instances[k].array as Float32Array, o = filled[k]++ * STRIDE;
      a.set([...pose.position, look.brace, ...pose.forward, dot(w, port) * strength, ...pose.up, dot(w, pose.forward) * strength,
        ...look.paint, look.band ? 1 : 0, ...look.sail, (i * 2.399) % (2 * Math.PI), i === own ? 1 : 0], o);
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
    /** Ship i is the player's own (or none, for null): her sails thin out round the aim point. */
    own(i: number | null) { own = i ?? -1; },
    /** The aim point on the screen, which the player's sails keep clear: 0…1 across from the left and down from the
     * top (the screen's middle until it is set). */
    aim(x: number, y: number) { aim.value.set(x, y); },
    /** Draw every ship at level k, or by her size again for null (a debug view). */
    pin(k: number | null) { pinned = k ?? -1; },
    get count() { return count; },
    /** Ships 0…count−1 as last set: each one's pose, look and velocity (for the marks she leaves on the sea). */
    get ships() { return poses.slice(0, count).map((pose, i) => ({ pose, look: looks[i], velocity: velocities[i] })); },
  };
}
