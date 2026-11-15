// Every ship on the sea, drawn as instances: the galleon at each of its levels of detail (detail.ts) is three meshes
// — body, cloth, ropes — and each is drawn once a frame for all the ships at that level, nine draws at most for the
// fleet beyond the three of the nearest level. Each frame, every ship in view gets a level by how big she looks
// (with some slack, so she doesn't flicker between two), and her pose and look are packed into her level's instance
// buffer, which its three meshes share.
//
// A ship's pose is world/pose.ts's; her look the captain's colours. Her canvas is filled by her sails' wind (motion.ts's
// filling(): at rest the planet's at her, weakened; under way, from her quarter whatever her heading, so it always
// draws), in her own frame: her crew haul her square yards round to it, and sails and pennants lean with it, drawn in
// the shader or simulated. (Not the wind she feels through her own motion, which would lay her sails aback as she
// sails into it: her speed doesn't come from the wind. Pennants streaming aft over sails filled from astern would tell
// two stories.)
//
// One ship may be the player's own (`own`): she is always drawn at the finest level.
//
// A ship going down is drawn but not afloat: the sea neither fits round her hull nor takes her wake or shadow, so it
// closes over her. One gone is dropped, and not drawn.
//
// Her canvas and pennants are simulated as cloth while she is among the few nearest the eye (berths.ts, cloth.ts),
// the player's own always: each frame the berths are handed out, and each berthed ship's sails' wind and motion
// (motion.ts) handed to the cloth, before it is moved on. Every other ship's are the drawn shape the shader fills.

import {
  BufferAttribute, BufferGeometry, DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute,
  Mesh, Sphere, Vector3, type Material,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import { release, type Compute } from '../gpu';
import type { Look } from '../snapshot';
import type { Light } from '../sky/light';
import type { Eye } from '../view/view';
import type { ShipPose } from '../world/pose';
import { add, length, scale, type Vec3 } from '../world/sphere';
import type { Wind } from '../world/wind';
import { BERTHS, moor, type Berth } from './berths';
import { buildShip, type Packed } from './build';
import { createCloth } from './cloth';
import { SLOTS, STRIDE, pack } from './instance';
import { DETAILS, chooseDetail } from './detail';
import { createShipMaterials } from './materials';
import { feeling, filling, hauled, inFrame, moved, trim, type Motion } from './motion';

/** A sails' pattern as the instance carries it (instance.ts). */
const PATTERNS: Record<Look['pattern'], number> = { plain: 0, band: 1, stripes: 2 };
/** Her middle, above the waterline, metres, and a sphere round her whole rig from there. */
const MIDDLE = 9, RADIUS = 18;
/** The wind at which the sails are full and the pennants stream straight, metres per second. */
const FULL = 8;

const levels = DETAILS.length;

/** A wind (metres a second) as a share of FULL, at most 1. */
const share = (w: Vec3): Vec3 => { const size = length(w); return size > 0 ? scale(w, Math.min(size / FULL, 1) / size) : [0, 0, 0]; };

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
  SLOTS.forEach((name, i) =>
    g.setAttribute(name, new InterleavedBufferAttribute(instances, 4, i * 4)));
  g.instanceCount = 0;
  const mesh = new Mesh(g as BufferGeometry, material);
  mesh.frustumCulled = false;
  // the blended ropes after the sea, which reads what is behind it from what was drawn before it
  mesh.renderOrder = material.transparent ? 1 : 0;
  return mesh;
}

export type Fleet = ReturnType<typeof createFleet>;

/** capacity: the most ships there will be. */
export function createFleet(light: Light, wind: Wind, capacity: number) {
  const pixel = uniform(0.0026);
  const cloth = createCloth();
  const materials = createShipMaterials(light, pixel, cloth);
  const instances = Array.from({ length: levels }, () => {
    const buffer = new InstancedInterleavedBuffer(new Float32Array(capacity * STRIDE), STRIDE);
    return buffer.setUsage(DynamicDrawUsage);
  });
  const draws = instances.map((buffer, k) => {
    const ship = buildShip(k);
    // (the farthest level has no ropes, and so no rope draw)
    return ([[ship.body, materials.body], [ship.cloth, materials.cloth], [ship.ropes, materials.ropes]] as const)
      .filter(([p]) => p.triangles > 0).map(([p, material], j) => Object.assign(drawOf(p, buffer, material), { name: `ship ${['body', 'cloth', 'ropes'][j]} ${k}` }));
  });
  const meshes = draws.flat();

  const poses: ShipPose[] = [], looks: Look[] = [], velocities: Vec3[] = [], was: number[] = [];
  /** Whether ship i floats (else she is going down), and whether she is drawn at all. */
  const floats: boolean[] = [], shown: boolean[] = [];
  /** How each ship's square yards are braced, radians (+ turns the port arm aft); and, this frame, her sails' wind, her
   * frame, metres a second. */
  const braces: number[] = [], sails: Vec3[] = [];
  let count = 0, pinned = -1, own = -1;
  let berths: (Berth | null)[] = new Array(BERTHS).fill(null), simulating = true;
  const motions: (Motion | null)[] = new Array(BERTHS).fill(null);
  const sphere = new Sphere();

  /** The ship i's pose, look and velocity (metres per second, world space), and whether she floats; ships 0…count−1
   * are drawn, but those dropped. */
  function set(i: number, pose: ShipPose, look: Look, velocity: Vec3 = [0, 0, 0], afloat = true) {
    if (i >= capacity) throw new Error(`fleet: ship ${i} past capacity ${capacity}`);
    floats[i] = afloat;
    shown[i] = true;
    poses[i] = pose;
    looks[i] = look;
    velocities[i] = velocity;
    was[i] ??= -1;
    // (her yards trimmed to the wind she first feels, then hauled round as it changes)
    braces[i] ??= NaN;
    count = Math.max(count, i + 1);
  }

  /** Each ship's yards hauled round dt seconds on, her sails' wind found, and the berths handed out; returns the passes
   * that move each berthed ship's canvas on dt seconds. */
  function sail(eye: Vector3, windSpeed: number, dt: number): Compute[] {
    for (let i = 0; i < count; i++) {
      // (a ship not drawn, or never set, has no canvas to fill)
      if (!shown[i]) continue;
      const pose = poses[i], speed = length(velocities[i]);
      const blowing = inFrame(pose, scale(wind(pose.position), windSpeed));
      braces[i] = Number.isNaN(braces[i]) ? trim(blowing, speed, 0) : hauled(braces[i], blowing, speed, dt);
      sails[i] = filling(blowing, speed, braces[i]);
    }
    const metres = poses.slice(0, count).map((p, i) => (shown[i] ? eye.distanceTo(new Vector3(...add(p.position, p.up, MIDDLE))) : Infinity));
    const before = berths;
    berths = moor(berths, simulating ? metres : metres.map(() => Infinity), simulating ? own : -1, dt);
    berths.forEach((b, k) => {
      if (!b) { motions[k] = null; cloth.set(k, null); return; }
      const motion = moved(b.fresh || before[k]?.ship !== b.ship ? null : motions[k], poses[b.ship], dt);
      motions[k] = motion;
      cloth.set(k, { brace: braces[b.ship], phase: phaseOf(b.ship), wind: sails[b.ship], ...feeling(motion) }, b.fresh);
    });
    return cloth.update(dt);
  }

  /**
   * Each frame, once the eye has moved (view.ts): windSpeed in metres per second; dt the seconds since the last.
   * Returns what is due: the near ships' canvas as cloth.
   */
  function update(seen: Readonly<Eye>, windSpeed: number, dt: number): { cloth: Compute[] } {
    pixel.value = seen.pixel;
    const eye = new Vector3(...seen.position);
    const canvas = sail(eye, windSpeed, dt);
    const shares = new Map(berths.flatMap((b, k) => (b ? [[b.ship, [k, b.share]] as const] : [])));
    const filled = new Array<number>(levels).fill(0);
    for (let i = 0; i < count; i++) {
      const pose = poses[i], look = looks[i];
      if (!shown[i]) { was[i] = -1; continue; }
      const middle = add(pose.position, pose.up, MIDDLE);
      sphere.set(new Vector3(...middle), RADIUS);
      if (!seen.frustum.intersectsSphere(sphere)) { was[i] = -1; continue; }
      // (the player's own ship always whole: the chase camera holds her at the finest level's edge)
      const k = pinned >= 0 ? pinned : i === own ? 0 : chooseDetail(was[i], eye.distanceTo(sphere.center), pixel.value);
      was[i] = k;
      // her sails' wind, as a share of FULL across her and along her
      const w = share(sails[i]);
      const [berth, part] = shares.get(i) ?? [0, 0];
      pack(instances[k].array as Float32Array, filled[k]++ * STRIDE, {
        position: pose.position, forward: pose.forward, up: pose.up, brace: braces[i], wind: [w[0], w[2]],
        paint: look.paint, sail: look.sail, pattern: PATTERNS[look.pattern], phase: phaseOf(i), berth, share: part,
      });
    }
    draws.forEach((three, k) => {
      // (only the ships written go up: the buffer holds the most ships' worth)
      if (filled[k] > 0) {
        instances[k].addUpdateRange(0, filled[k] * STRIDE);
        instances[k].needsUpdate = true;
      }
      for (const mesh of three) (mesh.geometry as InstancedBufferGeometry).instanceCount = filled[k];
    });
    return { cloth: canvas };
  }

  return {
    meshes,
    set,
    update,
    /** Frees every level's draws and the cloth. */
    dispose() {
      release(...meshes);
      cloth.dispose();
    },
    /** Ship i is the player's own (or none, for null): she is always drawn at the finest level. */
    own(i: number | null) { own = i ?? -1; },
    /** Ship i is gone: not drawn till she is set again. */
    drop(i: number) { shown[i] = false; },
    /** Simulate the near ships' canvas as cloth, or (false: a debug view) draw every ship's as its wind fills it. */
    simulate(on: boolean) { simulating = on; },
    /** Draw every ship at level k, or by her size again for null (a debug view). */
    pin(k: number | null) { pinned = k ?? -1; },
    /** The ships afloat as last set: each one's pose, look (and her yards' brace) and velocity (for the marks she leaves
     * on the sea). */
    get ships() {
      return poses.slice(0, count).flatMap((pose, i) => (shown[i] && floats[i] ? [{ pose, look: { ...looks[i], brace: braces[i] }, velocity: velocities[i] }] : []));
    },
  };
}
