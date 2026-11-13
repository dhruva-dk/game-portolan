// The gun in each ship's hand, on her plinth (mount.ts GUN_MOUNT; drawn twice its size, raised to its bore: GUN_DRAWN),
// turned on its post to where she aims (ShipDraw.gun:
// her aim, laid flat on her deck). One instanced mesh for each kind of gun (gun.ts), each drawn once a frame for all
// the ships carrying that kind within NEAR m of the eye (past that a gun is a few pixels, lost in her rig), and only
// while some ship does: five draws at most. A ship with no gun in hand, or going down, has none on her plinth.
//
// Each gun is bronze, oak and iron (gun.ts METAL), lit as everything is (sky/light.ts): the bronze and the iron glossy,
// the oak not.

import {
  BufferAttribute, DynamicDrawUsage, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh,
  MeshBasicNodeMaterial,
} from 'three/webgpu';
import { Fn, attribute, cross, float, mix, normalize, select, varying, vec3 } from 'three/tsl';
import { KINDS, gunOrder, type GunKind } from '../kinds';
import type { Light } from '../sky/light';
import type { ShipDraw } from '../snapshot';
import type { Vec3Node } from '../tsl';
import { add, dot, length, normalize as unit, scale, type Vec3 } from '../world/sphere';
import { METAL, MUZZLE, gunShape } from './gun';
import { GUN_DRAWN, GUN_MOUNT, toWorld } from './mount';

/** Where a shot of `kind` fired from `from` (the bore, at the trunnions) along `dir` leaves the drawn gun's mouth. */
export const muzzle = (from: Vec3, dir: Vec3, kind: GunKind): Vec3 => add(from, dir, MUZZLE[kind] * GUN_DRAWN.scale);

/** Metres from the eye within which the guns are drawn. */
const NEAR = 360;
/** Floats an instance: its place, its forward and its up, each a vec4. */
const STRIDE = 12;
/** Surfaces (linear albedo): bronze, oak and iron. */
const BRONZE: Vec3 = [0.5, 0.31, 0.1], OAK: Vec3 = [0.2, 0.11, 0.05], IRON: Vec3 = [0.035, 0.033, 0.03];

/** light: how the world is lit (sky/light.ts); capacity: the most ships there will be. */
export function createArms(light: Light, capacity: number) {
  const at = attribute('gunAt', 'vec4'), fwd = attribute('gunFwd', 'vec4'), up = attribute('gunUp', 'vec4');
  const local = attribute('position', 'vec3'), normal = attribute('normal', 'vec3'), metal = attribute('metal', 'float');
  // the gun's frame on her deck: +x to port (up × forward), +y up, +z where she aims
  const f = normalize(fwd.xyz), u = normalize(up.xyz), side = cross(u, f);
  const turn = (v: Vec3Node) => side.mul(v.x).add(u.mul(v.y)).add(f.mul(v.z));
  // drawn at GUN_DRAWN's size, its trunnions lifted to the bore on its post
  const { scale: big, lift } = GUN_DRAWN;

  const drawn = KINDS.map((kind) => {
    const s = gunShape(kind, 8), g = new InstancedBufferGeometry();
    g.setAttribute('position', new BufferAttribute(s.position, 3));
    g.setAttribute('normal', new BufferAttribute(s.normal, 3));
    g.setAttribute('metal', new BufferAttribute(s.metal, 1));
    g.setIndex(new BufferAttribute(s.index, 1));
    const buffer = new InstancedInterleavedBuffer(new Float32Array(capacity * STRIDE), STRIDE).setUsage(DynamicDrawUsage);
    ['gunAt', 'gunFwd', 'gunUp'].forEach((name, i) => g.setAttribute(name, new InterleavedBufferAttribute(buffer, 4, i * 4)));
    g.instanceCount = 0;
    const m = new MeshBasicNodeMaterial();
    const p = at.xyz.add(u.mul(lift)).add(turn(local.mul(big)));
    m.positionNode = p;
    const wp = varying(p), wn = varying(turn(normal)), what = varying(metal);
    m.colorNode = Fn(() => {
      const n = normalize(wn), oak = what.greaterThan(METAL.oak - 0.5).and(what.lessThan(METAL.oak + 0.5));
      const iron = what.greaterThan(METAL.iron - 0.5);
      const albedo = select(iron, vec3(...IRON), vec3(...BRONZE));
      const g = light.glossy(wp, n, select(iron, float(0.35), float(0.45)), mix(albedo.mul(2.2), vec3(0.18, 0.18, 0.18), select(iron, float(1), float(0))));
      const metalLit = albedo.mul(g.diffuse).add(g.specular);
      return select(oak, vec3(...OAK).mul(light(wp, n)), metalLit);
    })();
    const mesh = new Mesh(g, m);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = `gun ${kind}`;
    return { kind, mesh, geometry: g, buffer };
  });

  return {
    meshes: drawn.map((d) => d.mesh),
    /** Each frame: the ships drawn, and where the eye is. */
    update(ships: readonly ShipDraw[], eye: Vec3) {
      const filled = new Map<GunKind, number>();
      for (const sh of ships) {
        if (!sh.afloat || !sh.gun) continue;
        const pose = sh.pose, mount = toWorld(pose, GUN_MOUNT);
        if (length(add(mount, eye, -1)) > NEAR) continue;
        const d = drawn[gunOrder(sh.gun.kind)];
        // her aim laid flat on her deck; straight up or down, her bow
        const flat = add(sh.gun.aim, pose.up, -dot(sh.gun.aim, pose.up)), toward = length(flat) > 1e-3 ? unit(flat) : pose.forward;
        const n = filled.get(d.kind) ?? 0;
        (d.buffer.array as Float32Array).set([...mount, 0, ...toward, 0, ...scale(pose.up, 1), 0], n * STRIDE);
        filled.set(d.kind, n + 1);
      }
      for (const d of drawn) {
        const n = filled.get(d.kind) ?? 0;
        if (n > 0) {
          d.buffer.clearUpdateRanges();
          d.buffer.addUpdateRange(0, n * STRIDE);
          d.buffer.needsUpdate = true;
        }
        d.geometry.instanceCount = n;
        d.mesh.visible = n > 0;
      }
    },
  };
}
