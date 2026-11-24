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
import type { ShipPose } from '../../world/pose.ts';
import { length, scale, type Out3, type Vec3 } from '../../world/sphere.ts';
import type { Wind } from '../../world/wind.ts';
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

const PATTERNS: Record<Look['pattern'], number> = {
  plain: 0,
  band: 1,
  stripes: 2,
};
const MIDDLE = 9,
  RADIUS = 18;
const FULL = 8;
const PARTS = ['body', 'cloth', 'ropes'] as const;

const levels = DETAILS.length;

const phaseOf = (i: number) => (i * 2.399) % (2 * Math.PI);

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
  mesh.renderOrder = material.transparent ? 1 : 0;
  return { mesh, geometry };
}

interface Afloat {
  pose: ShipPose;
  look: Look & { brace: number };
  velocity: Vec3;
}

const STILL: Vec3 = [0, 0, 0];

export function createFleet(light: Light, wind: Wind, capacity: number) {
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
  const floats: boolean[] = [],
    shown: boolean[] = [];
  const braces: number[] = [],
    sails: Out3[] = [];
  const blowing: Out3 = [0, 0, 0];
  let count = 0,
    pinned = -1,
    own = -1,
    simulating = true;
  const berths: (Berth | null)[] = new Array(BERTHS).fill(null);
  const motions = Array.from({ length: BERTHS }, motionOut),
    moving: boolean[] = new Array(BERTHS).fill(false);
  const felts = Array.from({ length: BERTHS }, (): Felt & FeelingOut => ({
    brace: 0,
    phase: 0,
    wind: [0, 0, 0],
    weight: [0, 0, 0],
    spin: [0, 0, 0],
    spinning: [0, 0, 0],
  }));
  const meters = new Float64Array(capacity).fill(Infinity);
  const filled = new Uint32Array(levels);
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

  function set(
    i: number,
    pose: ShipPose,
    look: Look,
    how: { velocity?: Vec3; afloat?: boolean } = {}
  ) {
    const { velocity = STILL, afloat = true } = how;
    if (i >= capacity)
      throw new Error(`fleet: ship ${i} past capacity ${capacity}`);
    floats[i] = afloat;
    shown[i] = true;
    poses[i] = pose;
    looks[i] = look;
    velocities[i] = velocity;
    was[i] ??= -1;
    braces[i] ??= NaN;
    count = Math.max(count, i + 1);
  }

  function sail(windSpeed: number, dt: number): readonly Compute[] {
    for (let i = 0; i < count; i++) {
      meters[i] = Infinity;
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
      if (simulating) meters[i] = eye.distanceTo(middleOf(pose));
    }
    moor(berths, meters, simulating && shown[own] ? own : -1, dt);
    for (let k = 0; k < BERTHS; k++) {
      const b = berths[k];
      if (!b) {
        moving[k] = false;
        cloth.set(k, null);
        continue;
      }
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

  function middleOf(pose: ShipPose): Vector3 {
    const p = pose.position,
      u = pose.up;
    return sphere.center.set(
      p[0] + u[0] * MIDDLE,
      p[1] + u[1] * MIDDLE,
      p[2] + u[2] * MIDDLE
    );
  }

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
      const k =
        pinned >= 0
          ? pinned
          : i === own
            ? 0
            : chooseDetail(was[i], eye.distanceTo(sphere.center), pixel.value);
      was[i] = k;
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
    own(i: number | null) {
      own = i ?? -1;
    },
    drop(i: number) {
      shown[i] = false;
    },
    simulate(on: boolean) {
      simulating = on;
    },
    pin(k: number | null) {
      pinned = k ?? -1;
    },
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
