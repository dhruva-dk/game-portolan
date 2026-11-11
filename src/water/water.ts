// The sea: a grid of rings round the point under the eye, moved by the waves (waves.ts) and shaded as water.
//
// The rings start a metre out and each lies 5% further than the last, with 128 spokes, so a cell is about as long as
// it is wide and covers about as much of the screen near as far: ~36K triangles out to 20 km. The grid follows the
// eye; the waves stay put in the world, read by world position from the patch that tiles the sea.
//
// The light off the water is optics.ts's. Fog and clouds come from the frame's post pass, as for anything solid.

import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import {
  Fn, cameraPosition, float, length, normalize, positionGeometry, positionWorld, saturate, smoothstep, texture, varying, vec3,
} from 'three/tsl';
import type { Environment } from '../environment';
import { seaRadiance } from './optics';
import { PATCH, createWaves } from './waves';

type N = any;

const SPOKES = 128;
const FIRST = 1;
const GROWTH = 1.05;
const REACH = 20000;
/** Beyond this the grid is too coarse for the patch's waves; their displacement fades out by here. */
const FADE = 3000;
/** Open ocean: the trade winds have blown over hundreds of kilometres. */
const FETCH = 300_000;
/** GGX roughness of the ripples the patch can't hold. */
const ROUGHNESS = 0.06;

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

  // the water under this vertex at rest, and where the waves have moved it
  const ground = positionGeometry.xz.add(cameraPosition.xz);
  const uv = ground.div(PATCH);
  const fade = smoothstep(FADE, FADE / 3, length(positionGeometry.xz));
  const moved = texture(waves.displacement, uv).level(float(0)).xyz.mul(fade);
  material.positionNode = vec3(ground.x.add(moved.x), moved.y, ground.y.add(moved.z));

  const height = varying(moved.y);
  material.colorNode = Fn(() => {
    const slope = texture(waves.slopes, varying(uv)).xy;
    const n = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
    const v = normalize(cameraPosition.sub(positionWorld));
    const crest = saturate(height.div(waves.amplitude));
    return seaRadiance(positionWorld, n, v, float(ROUGHNESS), crest, reflect);
  })();

  const mesh = new Mesh(rings(), material);
  mesh.frustumCulled = false;

  return {
    mesh,
    update(env: Environment, dt: number) {
      waves.update({ wind: env.wind.length(), heading: Math.atan2(env.wind.y, env.wind.x), fetch: FETCH }, dt);
    },
  };
}
