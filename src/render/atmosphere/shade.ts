// What the clouds leave of the sun's or the moon's light on everything under them. Each frame the clouds work out
// (clouds.ts) how much light gets through along the light's beam over a square round the eye, as a map laid across the
// beam; every lit surface reads it at its own place, so a cloud's shadow runs over the sea, the land, the hulls and
// the sails alike, and lies where the sun puts it rather than straight under the cloud.
import { NearestFilter, StorageTexture, Vector3, type Node } from 'three/webgpu';
import { abs, clamp, float, floor, fract, ivec2, max, mix, smoothstep, texture, uniform, vec2 } from 'three/tsl';
import { shared } from '../gpu/uniforms.ts';

type F = Node<'float'>;
type V3 = Node<'vec3'>;

/** The map's texels on a side. */
export const SHADE_SIZE = 128;

/** Nearest-filtered, so it is read with loads alone and binds no sampler: every lit material reads it, and the land's
 *  already holds the most samplers a stage may. The four loads are blended here instead. */
function shadeMap(): StorageTexture {
  const t = new StorageTexture(SHADE_SIZE, SHADE_SIZE);
  t.minFilter = t.magFilter = NearestFilter;
  // (three would otherwise make its mips after every frame's march, for nothing that reads them)
  t.generateMipmaps = false;
  (t as unknown as { mipmapsAutoUpdate: boolean }).mipmapsAutoUpdate = false;
  return t;
}

export const SHADE = shared({
  /** The share of the light left after the clouds, in r; 1 where there are none. */
  map: shadeMap(),
  /** The square's middle (on the sea under the eye) and its axes across the beam. */
  centre: uniform(new Vector3()),
  e1: uniform(new Vector3(1, 0, 0)),
  e2: uniform(new Vector3(0, 0, 1)),
  /** Half the square's side, metres. */
  extent: uniform(480),
  /** 1 while the map follows the sun's light, 0 while it follows the moon's. */
  sun: uniform(1),
  /** 0 until the map has been drawn once, or while there are no clouds. */
  on: uniform(0),
});

/** The share of the light the map follows that reaches p through the clouds. */
export function cloudShade(p: V3): F {
  const q = p.sub(SHADE.centre);
  const uv = vec2(q.dot(SHADE.e1), q.dot(SHADE.e2)).div(SHADE.extent).mul(0.5).add(0.5);
  // the map's own edge fades to no shadow at all
  const edge = max(abs(uv.x.sub(0.5)), abs(uv.y.sub(0.5)));
  const inside = smoothstep(0.5, 0.44, edge).mul(SHADE.on);
  const at = uv.mul(SHADE_SIZE).sub(0.5);
  const i = floor(at), f = fract(at);
  const tap = (x: number, y: number): F => texture(SHADE.map).load(ivec2(clamp(i.add(vec2(x, y)), 0, SHADE_SIZE - 1))).r as F;
  const left = mix(mix(tap(0, 0), tap(1, 0), f.x), mix(tap(0, 1), tap(1, 1), f.x), f.y);
  return mix(float(1), left, inside);
}

/** The cloud shade on the sun's light at p. */
export const sunShade = (p: V3): F => mix(float(1), cloudShade(p), SHADE.sun);
/** The cloud shade on the moon's light at p. */
export const moonShade = (p: V3): F => mix(cloudShade(p), float(1), SHADE.sun);
