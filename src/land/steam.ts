// The craters' steam (world/biome.ts Biome.steam): over each cone, a plume of puffs rising from the crater, swelling as
// they climb and lean downwind, then thinning away to nothing at its head; new ones born small at the crater as the
// old go. Drawn as the sky's clouds are, solid and toon-lit (palette.ts STEAM), not as a haze: a puff shrinks to
// nothing rather than fading, so it needs no blending.
//
// Every puff of every crater is one instanced draw (loot.ts's way): a lumpy sphere, placed and sized in the vertex
// shader from its crater, its frame and its phase along the plume, by three's clock (no render hook, no update).

import { IcosahedronGeometry, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial } from 'three/webgpu';
import { Fn, attribute, float, fract, normalize, smoothstep, time, varying, vec3 } from 'three/tsl';
import { STEAM } from '../palette';
import { random } from '../world/random';
import type { IslandSite } from '../world/planet';
import { chartBasis, place } from '../world/sphere';
import type { Light } from '../sky/light';

/** Puffs a plume; seconds a puff takes from the crater to the plume's head; metres it climbs, and leans downwind. */
const PUFFS = 14, LIFE = 16, CLIMB = 26, LEAN = 14;
/** A puff's radius as it leaves the crater, and as it reaches the plume's head, metres. */
const BORN = 2.2, GROWN = 7.5;
/** Only a cone this high or more steams, metres. */
const TALL = 15;

/** A puff's lumpy sphere, radius about 1. */
function puff(): IcosahedronGeometry {
  const g = new IcosahedronGeometry(1, 1), p = g.getAttribute('position'), rand = random(17), shake = new Map<string, number>();
  for (let i = 0; i < p.count; i++) {
    const key = [p.getX(i), p.getY(i), p.getZ(i)].map((x) => x.toFixed(4)).join();
    if (!shake.has(key)) shake.set(key, 0.85 + 0.3 * rand());
    const k = shake.get(key)!;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  // (each face's corners shaken alike wherever they meet; its normals left the sphere's, so it shades round)
  return g;
}

/** The steam over each of `islands` tall enough to steam, its crater's floor `floor(site)` metres up; null if none. */
export function createSteam(islands: readonly IslandSite[], floor: (s: IslandSite) => number, light: Light): Mesh | null {
  const cones = islands.filter((s) => s.kind === 'island' && s.summit >= TALL);
  if (cones.length === 0) return null;
  const count = cones.length * PUFFS, at = new Float32Array(count * 4), up = new Float32Array(count * 4), lean = new Float32Array(count * 3);
  cones.forEach((s, c) => {
    const base = place(s.chart.at, floor(s)), [e1] = chartBasis(s.chart, s.chart.at), rand = random(c * 31 + 5);
    for (let k = 0; k < PUFFS; k++) {
      const i = c * PUFFS + k;
      // its phase along the plume, and a size of its own
      at.set([...base, (k + rand() * 0.5) / PUFFS], i * 4);
      up.set([...s.chart.at, 0.8 + 0.4 * rand()], i * 4);
      lean.set(e1, i * 3);
    }
  });
  const shape = puff(), g = new InstancedBufferGeometry();
  g.setIndex(shape.getIndex());
  g.setAttribute('position', shape.getAttribute('position'));
  g.setAttribute('normal', shape.getAttribute('normal'));
  g.setAttribute('steamAt', new InstancedBufferAttribute(at, 4));
  g.setAttribute('steamUp', new InstancedBufferAttribute(up, 4));
  g.setAttribute('steamLean', new InstancedBufferAttribute(lean, 3));
  g.instanceCount = count;

  const a = attribute('steamAt', 'vec4'), u = attribute('steamUp', 'vec4'), downwind = attribute('steamLean', 'vec3');
  // how far along the plume (0 at the crater … 1 at its head), and so where and how big
  const life = fract(time.div(LIFE).add(a.w));
  const centre = a.xyz.add(u.xyz.mul(life.sqrt().mul(CLIMB))).add(downwind.mul(life.pow(1.6).mul(LEAN)));
  const radius = float(BORN).add(life.mul(GROWN - BORN)).mul(u.w).mul(smoothstep(0, 0.08, life)).mul(float(1).sub(smoothstep(0.7, 1, life)));
  const m = new MeshBasicNodeMaterial();
  m.positionNode = centre.add(attribute('position', 'vec3').mul(radius));
  const p = varying(centre.add(attribute('position', 'vec3').mul(radius))), n = varying(attribute('normal', 'vec3'));
  m.colorNode = Fn(() => light.toon(p, normalize(n), vec3(...STEAM.lit), vec3(...STEAM.shadow)))();
  const mesh = new Mesh(g, m);
  // (the puffs stand all over the planet, placed in the shader)
  mesh.frustumCulled = false;
  mesh.name = 'steam';
  return mesh;
}
