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

export const muzzle = (from: Vec3, dir: Vec3, kind: GunKind): Vec3 =>
  add(from, dir, MUZZLE[kind] * GUN_DRAWN.scale);

const NEAR = 360;
const FLOATS = 12;
const EMIT = 1.3,
  RIM = 0.5;
const TINT = 0.7;
const NONE: Rgb = [0, 0, 0];

export function createArms(light: Light, capacity: number) {
  const at = attribute('gunAt', 'vec4'),
    fwd = attribute('gunFwd', 'vec4'),
    up = attribute('gunUp', 'vec4');
  const local = attribute('position', 'vec3'),
    normal = attribute('normal', 'vec3'),
    metal = attribute('metal', 'float');
  const f = normalize(fwd.xyz),
    u = normalize(up.xyz),
    side = cross(u, f);
  const turn = (v: Vec3Node) => side.mul(v.x).add(u.mul(v.y)).add(f.mul(v.z));
  const { scale: big, lift } = GUN_DRAWN;
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
      gunSurface(light, wp, n, made, { color: glow, share: fine.mul(TINT) }),
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
    mesh.name = `gun ${kind}`;
    return { kind, mesh, geometry: g, buffer, list };
  });
  const filled = new Uint32Array(KINDS.length);
  const mounted: Out3 = [0, 0, 0],
    laid: Out3 = [0, 0, 0];

  return {
    meshes: drawn.map((d) => d.mesh),
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
