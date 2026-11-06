// The wakes' foam as a node material, for the WebGPU planet: the same V of foam as the GLSL in wakes.ts, read from the
// same vertex data (along, across, strength, age; the trail's glow), but lit as a surface on the sea by the sun, the
// moon and the sky, so it takes the ship's shadow and goes grey under cloud and blue at dusk on its own. At night
// the spirit's light in the water glows in the trail's colour.
import { DoubleSide, MeshStandardNodeMaterial, type Texture } from 'three/webgpu';
import { abs, attribute, float, pow, smoothstep, texture, vec2, vec3 } from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';
import type { V4 } from './kit.ts';

export function wakeNodeMaterial(noise: Texture): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.9, metalness: 0 });
  m.polygonOffset = true;
  m.polygonOffsetFactor = m.polygonOffsetUnits = -2;
  const data = attribute<'vec4'>('aData') as V4, glow = attribute<'vec4'>('aColor') as V4;
  const along = data.x, across = abs(data.y), strength = data.z, age = data.w;
  const n = texture(noise, vec2(along.mul(0.09), across.mul(0.35).add(along.mul(0.02))).add(vec2(0, P.time.mul(0.02)))).g;
  const n2 = texture(noise, vec2(along.mul(0.23).sub(P.time.mul(0.05)), data.y.mul(0.9))).b;
  // the arms of the V bright at the edges, churned water down the middle, all breaking up as it ages
  const edge = smoothstep(0.55, 0.95, across).mul(float(1).sub(smoothstep(0.95, 1, across)));
  const churn = float(1).sub(smoothstep(0, 0.6, across)).mul(float(1).sub(age.mul(0.7)));
  const foam = edge.mul(0.9).add(churn.mul(0.8)).mul(smoothstep(age.mul(0.4).add(0.25), 0.75, n.mul(0.7).add(n2.mul(0.5))));
  const a = foam.mul(strength).mul(pow(float(1).sub(age), 1.5)).mul(smoothstep(0, 2.5, along));
  m.colorNode = vec3(0.82, 0.86, 0.9);
  m.opacityNode = a;
  m.alphaTest = 0.003;
  // at night, the spirit's own light in the water
  m.emissiveNode = glow.rgb.mul(glow.a).mul(P.night.mul(2.2).add(0.25)).mul(LAMP);
  return m;
}
