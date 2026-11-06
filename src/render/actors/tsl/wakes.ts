// The wakes' foam as a node material, for the WebGPU planet: the same V of foam as the GLSL in wakes.ts, read from the
// same vertex data (along, across, strength, age; the trail's glow), but lit as a surface on the sea by the sun, the
// moon and the sky, so it takes the ship's shadow and goes grey under cloud and blue at dusk on its own. At night
// the spirit's light in the water glows in the trail's colour.
//
// Lit foam in the planet's light is many times brighter than the sea round it, so a thin veil of it over the whole
// ribbon reads as a sheet of white. Foam is not a veil: it lies in patches with water between, and how much of the
// sea it covers is how white the sea looks from afar. So the V's foam here is a lace, cut from noise at the share of
// the water the GLSL's foam stands for, and seen from far enough that the lace is finer than a pixel, that share.
import { DoubleSide, MeshStandardNodeMaterial, type Texture } from 'three/webgpu';
import { abs, attribute, clamp, float, fwidth, max, mix, pow, smoothstep, texture, vec2, vec3 } from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';
import type { V4 } from './kit.ts';

export function wakeNodeMaterial(noise: Texture): MeshStandardNodeMaterial {
  const m = new MeshStandardNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, roughness: 0.9, metalness: 0 });
  m.polygonOffset = true;
  m.polygonOffsetFactor = m.polygonOffsetUnits = -2;
  const data = attribute<'vec4'>('aData') as V4, glow = attribute<'vec4'>('aColor') as V4;
  const metres = attribute<'float'>('aAcross');
  const along = data.x, across = abs(data.y), strength = data.z, age = data.w;
  const n = texture(noise, vec2(along.mul(0.09), across.mul(0.35).add(along.mul(0.02))).add(vec2(0, P.time.mul(0.02)))).g;
  const n2 = texture(noise, vec2(along.mul(0.23).sub(P.time.mul(0.05)), data.y.mul(0.9))).b;
  // the arms of the V bright at the edges, churned water down the middle, all breaking up as it ages
  const edge = smoothstep(0.55, 0.95, across).mul(float(1).sub(smoothstep(0.95, 1, across)));
  const churn = float(1).sub(smoothstep(0, 0.6, across)).mul(float(1).sub(age.mul(0.7)));
  const foam = edge.mul(0.9).add(churn.mul(0.8)).mul(smoothstep(age.mul(0.4).add(0.25), 0.75, n.mul(0.7).add(n2.mul(0.5))));
  const share = clamp(foam.mul(strength).mul(pow(float(1).sub(age), 1.5)).mul(smoothstep(0, 2.5, along)).mul(0.8), 0, 1);
  // the lace: streaks a hand or two across, drawn out along the way the water streams past, slowly working
  const q = vec2(along.mul(0.1).add(P.time.mul(0.01)), metres.mul(0.2));
  const lace = texture(noise, q).a.mul(0.5)
    .add(texture(noise, q.mul(2.7).add(vec2(0.37, P.time.mul(0.013)))).b.mul(0.3))
    .add(texture(noise, q.mul(0.37).add(vec2(0.61, 0.13))).g.mul(0.2));
  // cut at the share the foam stands for, fringed with the thinner bubbles round each patch
  const soft = max(fwidth(lace).mul(1.5), 0.08);
  const cover = smoothstep(float(1).sub(share).sub(soft), float(1).sub(share).add(soft), lace.add(share.mul(0.12)));
  // where the lace is finer than the pixels, the share itself
  const far = smoothstep(0.08, 0.3, fwidth(lace));
  const a = mix(cover, share, far).mul(mix(1, 0.55, P.night));
  m.colorNode = vec3(0.82, 0.86, 0.9);
  m.opacityNode = a;
  m.alphaTest = 0.003;
  // at night, the spirit's own light in the water
  m.emissiveNode = glow.rgb.mul(glow.a).mul(P.night.mul(2.2).add(0.25)).mul(LAMP);
  return m;
}
