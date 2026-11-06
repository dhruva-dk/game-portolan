// Where a mortar shell will come down: a ring on the water as wide as its burst, drawn the moment it is fired so
// whoever stands there has the flight's length to get out (WINDUP). A dashed rim turns slowly; a second ring sweeps in
// from the rim to the middle as the shell falls, so the time left reads at a glance, and the floor inside warms and
// quickens its pulse as it nears. It is a warning, not a thing in the world: unlit, held a metre over the sea so only a
// big wave hides it, and fading out with distance so a far one doesn't crowd the view.
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import { abs, atan, attribute, cameraPosition, clamp, float, fwidth, length, max, mix, positionWorld, sin, smoothstep, uv, vec3 } from 'three/tsl';
import { P } from '../../gpu/uniforms.ts';
import type { F } from './kit.ts';

/** A band one pixel soft at radius `r` and half-width `w` (both in the ring's own units, 1 at the rim). */
function band(d: F, r: F | number, w: number): F {
  const aa = max(fwidth(d), 0.002);
  return float(1).sub(smoothstep(float(w).sub(aa), float(w).add(aa), abs(d.sub(r))));
}

export function landingNodeMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  m.polygonOffset = true;
  m.polygonOffsetFactor = m.polygonOffsetUnits = -4;
  // per ring: 0 as the shell leaves the gun, 1 as it lands
  const k = attribute<'float'>('aFall') as unknown as F;
  const q = uv().sub(0.5).mul(2), d = length(q), ang = atan(q.y, q.x);
  // the rim, cut into dashes that walk round
  const dash = smoothstep(-0.25, 0.25, sin(ang.mul(14).add(P.time.mul(1.6))));
  const rim = band(d, 0.97, 0.03).mul(mix(0.55, 1, dash));
  // the sweep closing in: at the rim as it's fired, the middle as it lands
  const sweep = band(d, float(1).sub(k).mul(0.95), 0.025).mul(smoothstep(0, 0.08, float(1).sub(k)));
  // the floor, warming and pulsing faster as it nears
  const beat = sin(P.time.mul(mix(5, 16, k))).mul(0.5).add(0.5);
  const floor = float(1).sub(smoothstep(0.9, 0.97, d)).mul(mix(0.06, 0.2, k)).mul(mix(0.6, 1, beat));
  const cross = band(d, 0, 0.05).mul(0.8);
  const near = float(1).sub(smoothstep(160, 320, length(positionWorld.sub(cameraPosition))));
  const glow = rim.add(sweep.mul(0.9)).add(floor).add(cross).mul(near).mul(mix(1, 1.4, P.night));
  const color = mix(vec3(1, 0.62, 0.18), vec3(1, 0.22, 0.08), k);
  m.colorNode = color.mul(glow).mul(2.2);
  m.opacityNode = clamp(glow, 0, 1);
  return m;
}
