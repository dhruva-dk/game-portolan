// The bolt as a node material: its ribbons added over the scene at the lamps' scale times many,
// a white-hot core down the middle of each and a halo spreading out across it. The core's share of the ribbon comes
// with it (uv.y), as the ribbon is widened to hold a few pixels where the bolt is far.
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import { attribute, exp, float, max, uv } from 'three/tsl';
import { LAMP } from '../../gpu/uniforms.ts';
import type { V3 } from './kit.ts';

/** How much brighter the bolt's core is than a lantern. */
const HOT = 60;

export function boltNodeMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  m.fog = false;
  const f = uv();
  const x = f.x.mul(2).sub(1);
  const core = max(f.y, 0.01);
  const across = x.div(core);
  // the core, as wide as the bolt really is, and the glow the rain round it scatters, falling off over the ribbon
  const profile = exp(across.mul(across).mul(-2.5)).add(exp(x.abs().mul(-4)).mul(0.09));
  const colour = attribute<'vec3'>('color') as V3;
  m.colorNode = colour.mul(profile).mul(LAMP).mul(float(HOT));
  return m;
}
