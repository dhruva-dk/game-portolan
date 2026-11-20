// The gun in each ship's hand, on her plinth (mount.ts GUN_MOUNT; drawn 1.7
// times its size, raised to its bore: GUN_DRAWN), turned on its post to where
// she aims (ShipDraw.gun: her aim, laid flat on her deck). One instanced mesh
// for each kind of gun (gun-shape.ts), each drawn once a frame for all the
// ships carrying that kind within NEAR m of the eye (past that a gun is a few
// pixels, lost in her rig), and only while some ship does: five draws at most.
// A ship with no gun in hand, or going down, has none on her plinth.
//
// Each gun is bronze, oak and iron, lit as everything is (gun.ts gunSurface);
// one material serves every kind. One finer than common has its bronze cast in
// its rarity's light, and a rim of it where it turns from the eye, as it had
// floating (loot.ts; palette.ts RARITY_GLOW), so a ship's gun can be read
// across the water: the light rides in each instance's spare fourth floats, no
// draw more.

import {
  BufferAttribute,
  DynamicDrawUsage,
  InstancedBufferGeometry,
  InstancedInterleavedBuffer,
  InterleavedBufferAttribute,
  Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import {
  Fn,
  abs,
  attribute,
  cameraPosition,
  cross,
  dot as dotNode,
  float,
  mix,
  normalize,
  smoothstep,
  step,
  varying,
  vec3,
} from 'three/tsl';
import { KINDS, gunOrder, type GunKind } from '../kinds.ts';
import { RARITY_GLOW, type Rgb } from '../palette.ts';
import type { Light } from '../sky/light.ts';
import type { ShipDraw } from '../snapshot.ts';
import type { Vec3Node } from '../tsl.ts';
import {
  add,
  dot,
  length,
  scale,
  type Out3,
  type Vec3,
} from '../world/sphere.ts';
import { gunSurface } from './gun.ts';
import { MUZZLE, gunShape } from './gun-shape.ts';
import { GUN_DRAWN, GUN_MOUNT, toWorld } from './mount.ts';

/**
 * Where a shot of `kind` fired from `from` (the bore, at the trunnions) along
 * `dir` leaves the drawn gun's mouth.
 */
export const muzzle = (from: Vec3, dir: Vec3, kind: GunKind): Vec3 =>
  add(from, dir, MUZZLE[kind] * GUN_DRAWN.scale);

/** Metres from the eye within which the guns are drawn. */
const NEAR = 360;
/**
 * Floats a gun's instance: its place, its forward and its up, each a vec4, the
 * fourth of each its rarity's light (red, green, blue; none for a common gun).
 */
const FLOATS = 12;
/**
 * How bright a gun's rim glows, of what the sun and the sky give a white
 * surface; and how far a face must turn from the eye (0 facing it … 1 edge on)
 * to be in it: wider than a floating piece's, a gun being a few pixels across.
 */
const EMIT = 1.3,
  RIM = 0.5;
/** How far a finer gun's bronze is cast toward its rarity's light. */
const TINT = 0.7;
/** A common gun's light: none. */
const NONE: Rgb = [0, 0, 0];

/**
 * light: how the world is lit (sky/light.ts); capacity: the most ships there
 * will be.
 */
export function createArms(light: Light, capacity: number) {
  const at = attribute('gunAt', 'vec4'),
    fwd = attribute('gunFwd', 'vec4'),
    up = attribute('gunUp', 'vec4');
  const local = attribute('position', 'vec3'),
    normal = attribute('normal', 'vec3'),
    metal = attribute('metal', 'float');
  // the gun's frame on her deck: +x to port (up × forward), +y up, +z where she
  // aims
  const f = normalize(fwd.xyz),
    u = normalize(up.xyz),
    side = cross(u, f);
  const turn = (v: Vec3Node) => side.mul(v.x).add(u.mul(v.y)).add(f.mul(v.z));
  // drawn at GUN_DRAWN's size, its trunnions lifted to the bore on its post
  const { scale: big, lift } = GUN_DRAWN;
  // one material for every kind: they differ only in their shape
  const m = new MeshBasicNodeMaterial();
  const p = at.xyz.add(u.mul(lift)).add(turn(local.mul(big)));
  m.positionNode = p;
  const wp = varying(p),
    wn = varying(turn(normal)),
    made = varying(metal),
    glow = varying(vec3(at.w, fwd.w, up.w));
  m.colorNode = Fn(() => {
    const n = normalize(wn),
      eye = normalize(cameraPosition.sub(wp)),
      fine = step(1e-3, glow.x.add(glow.y).add(glow.z));
    const edge = smoothstep(
      RIM - 0.05,
      RIM + 0.05,
      float(1).sub(abs(dotNode(n, eye)))
    ).mul(fine);
    return mix(
      gunSurface(light, wp, n, made, { colour: glow, share: fine.mul(TINT) }),
      glow.mul(light.level(wp).mul(EMIT)),
      edge
    );
  })();

  const drawn = KINDS.map((kind) => {
    const s = gunShape(kind, 8),
      g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(s.position, 3));
    g.setAttribute('normal', new BufferAttribute(s.normal, 3));
    g.setAttribute('metal', new BufferAttribute(s.metal, 1));
    g.setIndex(new BufferAttribute(s.index, 1));
    const list = new Float32Array(capacity * FLOATS);
    const buffer = new InstancedInterleavedBuffer(list, FLOATS).setUsage(
      DynamicDrawUsage
    );
    ['gunAt', 'gunFwd', 'gunUp'].forEach((name, i) =>
      g.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, i * 4))
    );
    g.instanceCount = 0;
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    // (for the meter's split: meter.ts)
    mesh.name = `gun ${kind}`;
    return { kind, mesh, geometry: g, buffer, list };
  });
  /** How many of each kind (gunOrder) are drawn this frame. */
  const filled = new Uint32Array(KINDS.length);
  /** A gun's mount and the way it is laid, worked out for each in turn. */
  const mounted: Out3 = [0, 0, 0],
    laid: Out3 = [0, 0, 0];

  return {
    meshes: drawn.map((d) => d.mesh),
    /** Each frame: the ships drawn, and where the eye is. */
    update(ships: readonly ShipDraw[], eye: Vec3) {
      filled.fill(0);
      for (const sh of ships) {
        if (!sh.afloat || !sh.gun) continue;
        const pose = sh.pose,
          mount = toWorld(pose, GUN_MOUNT, mounted);
        if (
          Math.hypot(mount[0] - eye[0], mount[1] - eye[1], mount[2] - eye[2]) >
          NEAR
        )
          continue;
        const k = gunOrder(sh.gun.kind),
          a = drawn[k].list,
          o = filled[k]++ * FLOATS;
        // her aim laid flat on her deck; straight up or down, her bow
        const flat = add(sh.gun.aim, pose.up, -dot(sh.gun.aim, pose.up), laid),
          size = length(flat);
        const toward = size > 1e-3 ? scale(flat, 1 / size, laid) : pose.forward;
        const glow = sh.gun.rarity > 0 ? RARITY_GLOW[sh.gun.rarity] : NONE;
        for (let j = 0; j < 3; j++) {
          a[o + j] = mount[j];
          a[o + 4 + j] = toward[j];
          a[o + 8 + j] = pose.up[j];
          a[o + 3 + 4 * j] = glow[j];
        }
      }
      for (let k = 0; k < drawn.length; k++) {
        const d = drawn[k],
          n = filled[k];
        if (n > 0) {
          d.buffer.clearUpdateRanges();
          d.buffer.addUpdateRange(0, n * FLOATS);
          d.buffer.needsUpdate = true;
        }
        d.geometry.instanceCount = n;
      }
    },
  };
}
