// The sea: a grid of rings round the point under the eye, moved by the waves (waves.ts) and shaded as water.
//
// The rings start a metre out and each lies 5% further than the last, with 128 spokes, so a cell is about as long as
// it is wide and covers about as much of the screen near as far: ~36K triangles out to 20 km. The grid follows the
// eye; the waves stay put in the world, read by world position from the cascades' patches that tile the sea.
//
// The light off the water is optics.ts's. Fog and clouds come from the frame's post pass, as for anything solid.

import {
  BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, NoColorSpace, RepeatWrapping, TextureLoader, Vector2,
  type WebGPURenderer,
} from 'three/webgpu';
import {
  Fn, cameraPosition, float, length, log2, max, normalize, positionGeometry, positionWorld, saturate, smoothstep, sqrt, texture,
  uniform, varying, vec2, vec3,
} from 'three/tsl';
import type { Environment } from '../environment';
import { seaRadiance } from './optics';
import { CASCADES, SIZE } from './cascades';
import { createWaves } from './waves';

type N = any;

const SPOKES = 128;
const FIRST = 1;
const GROWTH = 1.05;
const REACH = 20000;
/** The foam pattern (ambientCG Foam002) repeats every this many metres across the wind. */
const FOAM_TILE = 3;
/** Open ocean: the trade winds have blown over hundreds of kilometres. */
const FETCH = 300_000;

function rings(): BufferGeometry {
  const radii = [0];
  for (let r = FIRST; ; r *= GROWTH) {
    radii.push(Math.min(r, REACH));
    if (r >= REACH) break;
  }
  const positions: number[] = [0, 0, 0];
  for (let k = 1; k < radii.length; k++) for (let s = 0; s < SPOKES; s++) {
    const a = (s / SPOKES) * 2 * Math.PI;
    positions.push(Math.cos(a) * radii[k], 0, Math.sin(a) * radii[k]);
  }
  const at = (k: number, s: number) => 1 + (k - 1) * SPOKES + (s % SPOKES);
  const index: number[] = [];
  for (let s = 0; s < SPOKES; s++) index.push(0, at(1, s + 1), at(1, s));
  for (let k = 1; k < radii.length - 1; k++) for (let s = 0; s < SPOKES; s++) {
    index.push(at(k, s), at(k, s + 1), at(k + 1, s), at(k, s + 1), at(k + 1, s + 1), at(k + 1, s));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  return g;
}

export function createWater(renderer: WebGPURenderer, reflect: (dir: N, roughness: N) => N) {
  const waves = createWaves(renderer);
  const material = new MeshBasicNodeMaterial();
  /** The way the wind blows, a unit vector in the sea's plane (x, z). */
  const wind = uniform(new Vector2(1, 0));

  // The water under this vertex at rest, and where the waves have moved it. Each cascade is read at the mip whose
  // texels are as wide as the grid's cell here, so waves too short for the grid to draw average away, not alias.
  const ground = positionGeometry.xz.add(cameraPosition.xz);
  const cell = max(length(positionGeometry.xz).mul(GROWTH - 1), FIRST);
  let moved: N = vec3(0);
  CASCADES.forEach((L, c) => {
    const lod = log2(max(cell.div(L / SIZE), 1));
    moved = moved.add(texture(waves.displacement[c], ground.div(L)).level(lod).xyz);
  });
  material.positionNode = vec3(ground.x.add(moved.x), moved.y, ground.y.add(moved.z));

  const height: N = varying(moved.y);
  const foamPattern = new TextureLoader().load(`${import.meta.env.BASE_URL}tex/foam.png`);
  foamPattern.wrapS = foamPattern.wrapT = RepeatWrapping;
  foamPattern.anisotropy = 4;
  foamPattern.colorSpace = NoColorSpace;
  const at: N = varying(ground);
  material.colorNode = Fn(() => {
    // The slopes, filtered over the pixel's footprint by the mips; what the filtering averages away (the slopes'
    // variance within the footprint) becomes roughness, as do the ripples too small for any cascade.
    let slope: N = vec2(0), variance: N = waves.ripples;
    CASCADES.forEach((L, c) => {
      const s = texture(waves.slopes[c], at.div(L));
      slope = slope.add(s.xy);
      variance = variance.add(max(s.z.sub(s.x.mul(s.x)), 0)).add(max(s.w.sub(s.y.mul(s.y)), 0));
    });
    const n = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
    const v = normalize(cameraPosition.sub(positionWorld));
    const crest = saturate(height.div(waves.amplitude));

    // The foam's cover from the breaking cascades (averaged over the footprint by their mips), drawn by the foam
    // pattern: fresh foam is white but for the pattern's holes, and as it fades only its brighter strands are left,
    // so a whitecap thins into a web and then into flecks. The pattern is
    // stretched along the wind, as foam is drawn out in streaks, and read at two scales so it doesn't repeat.
    let cover: N = float(0);
    CASCADES.slice(0, 2).forEach((L, c) => { cover = cover.add(texture(waves.displacement[c], at.div(L)).w); });
    const along = vec2(at.dot(wind), at.dot(vec2(wind.y.negate(), wind.x)));
    const strands = texture(foamPattern, along.mul(vec2(1 / (2 * FOAM_TILE), 1 / FOAM_TILE))).r.mul(0.6)
      .add(texture(foamPattern, along.mul(vec2(1 / (5.3 * FOAM_TILE), 1 / (2.7 * FOAM_TILE)))).r.mul(0.4));
    const foam = saturate(strands.sub(float(1).sub(saturate(cover)).mul(0.7)).mul(2.5));

    // GGX's α² is the mean square slope over both axes
    return seaRadiance(positionWorld, n, v, sqrt(variance), crest, foam, reflect);
  })();

  const mesh = new Mesh(rings(), material);
  mesh.frustumCulled = false;

  return {
    mesh,
    update(env: Environment, dt: number) {
      wind.value.copy(env.wind).normalize();
      waves.update({ wind: env.wind.length(), heading: Math.atan2(env.wind.y, env.wind.x), fetch: FETCH }, dt);
    },
  };
}
