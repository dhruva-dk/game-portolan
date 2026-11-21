// Every ship on the sea, drawn as instances: the galleon at each of its levels
// of detail (detail.ts) is three meshes — body, cloth, ropes — and each is
// drawn once a frame for all the ships at that level, nine draws at most for
// the fleet beyond the three of the nearest level. Each frame, every ship in
// view gets a level by how big she looks (with some slack, so she doesn't
// flicker between two), and her pose and look are packed into her level's
// instance buffer, which its three meshes share.
//
// A ship's pose is world/pose.ts's; her look the captain's colours. Her canvas
// is filled by her sails' wind (motion.ts's filling(): at rest the planet's at
// her, weakened; under way, from her quarter whatever her heading, so it always
// draws), in her own frame: her crew haul her square yards round to it, and
// sails and pennants lean with it, drawn in the shader or simulated. (Not the
// wind she feels through her own motion, which would lay her sails aback as she
// sails into it: her speed doesn't come from the wind. Pennants streaming aft
// over sails filled from astern would tell two stories.)
//
// One ship may be the player's own (`own`): she is always drawn at the finest
// level.
//
// A ship going down is drawn but not afloat: the sea neither fits round her
// hull nor takes her wake or shadow, so it closes over her. One gone is
// dropped, and not drawn.
//
// Her canvas and pennants are simulated as cloth while she is among the few
// nearest the eye (berths.ts, cloth.ts), the player's own always: each frame
// the berths are handed out, and each berthed ship's sails' wind and motion
// (motion.ts) handed to the cloth, before it is moved on. Every other ship's
// are the drawn shape the shader fills.

import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  Sphere,
  Vector3,
  type Material,
} from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { Compute } from '../gpu.ts';
import type { Look } from '../snapshot.ts';
import type { Light } from '../sky/light.ts';
import type { Eye } from '../view/view.ts';
import type { ShipPose } from '../world/pose.ts';
import { length, scale, type Out3, type Vec3 } from '../world/sphere.ts';
import type { Wind } from '../world/wind.ts';
import { BERTHS, moor, type Berth } from './berths.ts';
import { buildShip, type Packed } from './build.ts';
import { createCloth, type Felt } from './cloth.ts';
import { SLOTS, STRIDE, pack, type Instance } from './instance.ts';
import { DETAILS, PIXEL, chooseDetail } from './detail.ts';
import { createShipMaterials } from './materials.ts';
import {
  feeling,
  filling,
  hauled,
  inFrame,
  motionOut,
  moved,
  trim,
  type FeelingOut,
} from './motion.ts';

/** A sails' pattern as the instance carries it (instance.ts). */
const PATTERNS: Record<Look['pattern'], number> = {
  plain: 0,
  band: 1,
  stripes: 2,
};
/**
 * Her middle, above the waterline, metres, and a sphere round her whole rig
 * from there.
 */
const MIDDLE = 9,
  RADIUS = 18;
/**
 * The wind at which the sails are full and the pennants stream straight, metres
 * per second.
 */
const FULL = 8;
/** Each level's three draws, by name (for the meter's split: meter.ts). */
const PARTS = ['body', 'cloth', 'ropes'] as const;

const levels = DETAILS.length;

/** Ship i's own phase, radians, so no two ships' canvas moves in step. */
const phaseOf = (i: number) => (i * 2.399) % (2 * Math.PI);

/** The draw for one packed mesh, sharing its level's instances. */
function drawOf(
  name: string,
  p: Packed,
  instances: InstancedInterleavedBuffer,
  material: Material
) {
  const geometry = new InstancedBufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(p.position, 3));
  geometry.setAttribute('nrm', new BufferAttribute(p.normal, 4, true));
  if (p.uv) geometry.setAttribute('uv', new BufferAttribute(p.uv, 2, true));
  geometry.setAttribute('part', new BufferAttribute(p.part, 4, true));
  geometry.setIndex(new BufferAttribute(p.index, 1));
  SLOTS.forEach((slot, i) =>
    geometry.setAttribute(
      slot,
      new InterleavedBufferAttribute(instances, 4, i * 4)
    )
  );
  geometry.instanceCount = 0;
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  // the blended ropes after the sea, which reads what is behind it from what
  // was drawn before it
  mesh.renderOrder = material.transparent ? 1 : 0;
  return { mesh, geometry };
}

/**
 * A ship afloat as the sea takes her (water/wake.ts): her pose, look (and her
 * yards' brace) and velocity.
 */
interface Afloat {
  pose: ShipPose;
  look: Look & { brace: number };
  velocity: Vec3;
}

/** capacity: the most ships there will be. */
/** A ship's velocity when none is given: still. */
const STILL: Vec3 = [0, 0, 0];

export function createFleet(light: Light, wind: Wind, capacity: number) {
  // a pixel's angle, radians: the target's until the first frame gives the
  // eye's (update)
  const pixel = uniform(PIXEL);
  const cloth = createCloth();
  const materials = createShipMaterials(light, pixel, cloth);
  const lists = Array.from(
    { length: levels },
    () => new Float32Array(capacity * STRIDE)
  );
  const instances = lists.map((list) =>
    new InstancedInterleavedBuffer(list, STRIDE).setUsage(DynamicDrawUsage)
  );
  const draws = instances.map((buffer, k) => {
    const ship = buildShip(k),
      parts = [ship.body, ship.cloth, ship.ropes] as const;
    const made = [materials.body, materials.cloth, materials.ropes] as const;
    // (the farthest level has no ropes, and so no rope draw)
    return PARTS.flatMap((part, j) =>
      parts[j].triangles > 0
        ? [drawOf(`ship ${part} ${k}`, parts[j], buffer, made[j])]
        : []
    );
  });
  const meshes = draws.flat().map((d) => d.mesh);

  const poses: ShipPose[] = [],
    looks: Look[] = [],
    velocities: Vec3[] = [],
    was: number[] = [];
  /** Whether ship i floats (else she is going down), and whether she is drawn at all. */
  const floats: boolean[] = [],
    shown: boolean[] = [],
    slacks: number[] = [];
  /** How each ship's square yards are braced, radians (+ turns the port arm aft); and, this frame, her sails' wind, her
   * frame, metres a second. */
  const braces: number[] = [],
    sails: Out3[] = [];
  /** The true wind at a ship, her frame (worked out for each in turn). */
  const blowing: Out3 = [0, 0, 0];
  let count = 0,
    pinned = -1,
    own = -1,
    simulating = true;
  const berths: (Berth | null)[] = new Array(BERTHS).fill(null);
  /** Each berth's ship's motion, written over each frame, and whether it holds one (none once the berth is let go). */
  const motions = Array.from({ length: BERTHS }, motionOut),
    moving: boolean[] = new Array(BERTHS).fill(false);
  /** Each berth's ship's feeling, handed to the cloth. */
  const felts = Array.from({ length: BERTHS }, (): Felt & FeelingOut => ({
    brace: 0,
    phase: 0,
    wind: [0, 0, 0],
    weight: [0, 0, 0],
    spin: [0, 0, 0],
    spinning: [0, 0, 0],
  }));
  /** Each ship's distance from the eye, metres (Infinity for one not drawn), for the berths. */
  const metres = new Float64Array(capacity).fill(Infinity);
  /** How many ships each level draws this frame. */
  const filled = new Uint32Array(levels);
  /** Each ship afloat, as the sea takes her, and those afloat this frame (ships). */
  const records: Afloat[] = [],
    afloat: Afloat[] = [];
  const eye = new Vector3(),
    sphere = new Sphere();
  const drawn: Instance = {
    position: [0, 0, 0],
    forward: [0, 0, 0],
    up: [0, 0, 0],
    brace: 0,
    wind: [0, 0],
    paint: [0, 0, 0],
    sail: [0, 0, 0],
    pattern: 0,
    phase: 0,
    berth: 0,
    share: 0,
  };

  /** The ship i's pose and look, and as `how` has her (each as given there, if it is): her velocity (metres per second,
   * world space; still), whether she floats (afloat), and the share of her sails' wind her canvas takes (1 whole; less,
   * slack: her rigging cut, faults.ts); ships 0…count−1 are drawn, but those dropped. */
  function set(
    i: number,
    pose: ShipPose,
    look: Look,
    how: { velocity?: Vec3; afloat?: boolean; slack?: number } = {}
  ) {
    const { velocity = STILL, afloat = true, slack = 1 } = how;
    if (i >= capacity)
      throw new Error(`fleet: ship ${i} past capacity ${capacity}`);
    slacks[i] = slack;
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
  function sail(windSpeed: number, dt: number): readonly Compute[] {
    for (let i = 0; i < count; i++) {
      metres[i] = Infinity;
      // (a ship not drawn, or never set, has no canvas to fill)
      if (!shown[i]) continue;
      const pose = poses[i],
        speed = length(velocities[i]);
      inFrame(
        pose,
        scale(wind(pose.position, blowing), windSpeed, blowing),
        blowing
      );
      braces[i] = Number.isNaN(braces[i])
        ? trim(blowing, speed, 0)
        : hauled(braces[i], blowing, speed, dt);
      filling(blowing, speed, braces[i], (sails[i] ??= [0, 0, 0]));
      if (slacks[i] < 1) scale(sails[i], slacks[i], sails[i]);
      if (simulating) metres[i] = eye.distanceTo(middleOf(pose));
    }
    // (her own berthed only while she is drawn: never set, or dropped, none)
    moor(berths, metres, simulating && shown[own] ? own : -1, dt);
    for (let k = 0; k < BERTHS; k++) {
      const b = berths[k];
      if (!b) {
        moving[k] = false;
        cloth.set(k, null);
        continue;
      }
      // (a berth's ship stays hers till it is let go: a new one comes fresh)
      const motion = moved(
          b.fresh || !moving[k] ? null : motions[k],
          poses[b.ship],
          dt,
          motions[k]
        ),
        felt = felts[k];
      moving[k] = true;
      feeling(motion, felt);
      felt.brace = braces[b.ship];
      felt.phase = phaseOf(b.ship);
      felt.wind = sails[b.ship];
      cloth.set(k, felt, b.fresh);
    }
    return cloth.update(dt);
  }

  /** The middle of her rig (MIDDLE over her waterline), into the sphere round it. */
  function middleOf(pose: ShipPose): Vector3 {
    const p = pose.position,
      u = pose.up;
    return sphere.center.set(
      p[0] + u[0] * MIDDLE,
      p[1] + u[1] * MIDDLE,
      p[2] + u[2] * MIDDLE
    );
  }

  /**
   * Each frame, once the eye has moved (view.ts): windSpeed in metres per second; dt the seconds since the last.
   * Returns what is due: the near ships' canvas as cloth.
   */
  function update(
    seen: Readonly<Eye>,
    windSpeed: number,
    dt: number
  ): { cloth: readonly Compute[] } {
    pixel.value = seen.pixel;
    eye.fromArray(seen.position);
    const canvas = sail(windSpeed, dt);
    filled.fill(0);
    sphere.radius = RADIUS;
    for (let i = 0; i < count; i++) {
      const pose = poses[i],
        look = looks[i];
      if (!shown[i]) {
        was[i] = -1;
        continue;
      }
      middleOf(pose);
      if (!seen.frustum.intersectsSphere(sphere)) {
        was[i] = -1;
        continue;
      }
      // (the player's own ship always whole: the chase camera holds her at the finest level's edge)
      const k =
        pinned >= 0
          ? pinned
          : i === own
            ? 0
            : chooseDetail(was[i], eye.distanceTo(sphere.center), pixel.value);
      was[i] = k;
      // her sails' wind, as a share of FULL across her and along her
      const w = sails[i],
        size = length(w),
        part = size > 0 ? Math.min(size / FULL, 1) / size : 0;
      drawn.position = pose.position;
      drawn.forward = pose.forward;
      drawn.up = pose.up;
      drawn.brace = braces[i];
      drawn.wind[0] = w[0] * part;
      drawn.wind[1] = w[2] * part;
      drawn.paint = look.paint;
      drawn.sail = look.sail;
      drawn.pattern = PATTERNS[look.pattern];
      drawn.phase = phaseOf(i);
      drawn.berth = drawn.share = 0;
      for (let b = 0; b < BERTHS; b++) {
        const held = berths[b];
        if (held?.ship === i) {
          drawn.berth = b;
          drawn.share = held.share;
        }
      }
      pack(lists[k], filled[k]++ * STRIDE, drawn);
    }
    for (let k = 0; k < levels; k++) {
      // (only the ships written go up: the buffer holds the most ships' worth)
      if (filled[k] > 0) {
        instances[k].clearUpdateRanges();
        instances[k].addUpdateRange(0, filled[k] * STRIDE);
        instances[k].needsUpdate = true;
      }
      for (const { geometry } of draws[k]) geometry.instanceCount = filled[k];
    }
    return { cloth: canvas };
  }

  return {
    meshes,
    set,
    update,
    /** Ship i is the player's own (or none, for null): she is always drawn at the finest level. */
    own(i: number | null) {
      own = i ?? -1;
    },
    /** Ship i is gone: not drawn till she is set again. */
    drop(i: number) {
      shown[i] = false;
    },
    /** Simulate the near ships' canvas as cloth, or (false: a debug view) draw every ship's as its wind fills it. */
    simulate(on: boolean) {
      simulating = on;
    },
    /** Draw every ship at level k, or by her size again for null (a debug view). */
    pin(k: number | null) {
      pinned = k ?? -1;
    },
    /** The ships afloat as last set: each one's pose, look (and her yards' brace) and velocity (for the marks she leaves
     * on the sea). The same list each time, made over: read it before the next. */
    get ships(): readonly Afloat[] {
      afloat.length = 0;
      for (let i = 0; i < count; i++) {
        if (!shown[i] || !floats[i]) continue;
        const r = (records[i] ??= {
          pose: poses[i],
          look: { ...looks[i], brace: 0 },
          velocity: velocities[i],
        });
        r.pose = poses[i];
        r.velocity = velocities[i];
        r.look.paint = looks[i].paint;
        r.look.sail = looks[i].sail;
        r.look.pattern = looks[i].pattern;
        r.look.brace = braces[i];
        afloat.push(r);
      }
      return afloat;
    },
  };
}
