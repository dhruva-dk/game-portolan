// The sky as a reflection: a 256×128 panorama of the air and the clouds round the eye, redone every few frames,
// and filtered by three's PMREM so a rough surface reads it blurred. It is the eye's sky, so it is laid out in the
// sky's directions (view.toSky) and read along them. The sun's disc is left out: surfaces draw its
// glint themselves.

import { EquirectangularReflectionMapping, HalfFloatType, LinearFilter, StorageTexture, type WebGPURenderer } from 'three/webgpu';
import { Fn, cos, float, instanceIndex, max, normalize, pmremTexture, sin, textureStore, uvec2, vec3, vec4 } from 'three/tsl';
import type { View } from '../view/view';
import { skyRadiance } from './tables';

type N = any;

const W = 256, H = 128;
/** Frames between bakes: each re-filter is ~30 small passes (about 6 ms on an M-series Mac), and the clouds and sun move slowly. */
const EVERY = 30;

const panorama = new StorageTexture(W, H);
panorama.type = HalfFloatType;
panorama.minFilter = panorama.magFilter = LinearFilter;
panorama.mapping = EquirectangularReflectionMapping;
panorama.generateMipmaps = false;

/**
 * sunDirection: toward the sun, as the eye's sky shows it; cloudsAlong: the clouds' light (rgb) and transmittance (a)
 * along a sky direction, marched in at most so many steps.
 */
export function createReflection(renderer: WebGPURenderer, view: View, sunDirection: N, cloudsAlong: (d: N, steps: number) => N) {
  // the inverse of three's equirectUV
  const bake = Fn(() => {
    const x = instanceIndex.mod(W), y = instanceIndex.div(W);
    const phi = float(x).add(0.5).div(W).sub(0.5).mul(2 * Math.PI);
    const theta = float(y).add(0.5).div(H).sub(0.5).mul(Math.PI);
    const d = vec3(cos(theta).mul(cos(phi)), sin(theta), cos(theta).mul(sin(phi)));
    const clouds = cloudsAlong(d, 24);
    textureStore(panorama, uvec2(x, y), vec4(skyRadiance(d, sunDirection).mul(clouds.a).add(clouds.rgb), 1));
  })().compute(W * H, [64]);

  let frame = 0;
  return {
    /**
     * The sky's light reflected toward world direction dir off a surface of the given roughness (0–1). Only the sky
     * above its horizon: a ray from the sea past the horizon's edge still meets the sky's horizon.
     */
    reflect: (dir: N, roughness: N): N => {
      const d = view.toSky(dir);
      return pmremTexture(panorama, normalize(vec3(d.x, max(d.y, 0), d.z)), roughness);
    },
    update() {
      if (frame++ % EVERY !== 0) return;
      renderer.compute(bake);
      panorama.needsPMREMUpdate = true;
    },
  };
}
