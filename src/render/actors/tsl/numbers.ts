// The damage numbers as a node material. They are drawn over the finished frame (the stage's
// overlay), after the temporal upscaler, the exposure and the tone curve, which would smear them as they rise, dim
// them by day and blow them out at night: a number is something written on the screen, not light in the world.
import { MeshBasicNodeMaterial, NormalBlending, type Texture } from 'three/webgpu';
import { attribute, cameraProjectionMatrix, cameraViewMatrix, float, floor, min, mix, mod, positionGeometry, select, texture, vec2, vec3, vec4 } from 'three/tsl';
import type { V3, V4 } from './kit.ts';

export function numberNodeMaterial(digits: Texture): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: NormalBlending });
  m.fog = false;
  const anchor = attribute<'vec3'>('iAnchor') as V3, glyph = attribute<'vec3'>('iGlyph') as V3, col = attribute<'vec4'>('iCol') as V4;
  const q = positionGeometry.xy;
  const c = cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(anchor, 1));
  const proj = cameraProjectionMatrix as unknown as { element(i: number): V4 };
  const aspect = proj.element(1).y.div(proj.element(0).x);
  const off = vec2(q.x.mul(0.5).add(glyph.x.mul(0.62)).div(aspect), q.y.mul(0.5)).mul(glyph.z).mul(2);
  // never hidden behind the hull it struck; nothing at all when it is behind the eye
  m.vertexNode = select(c.w.greaterThan(0), vec4(c.xy.add(off.mul(c.w)), min(c.z, c.w.mul(0.999)), c.w), vec4(0, 0, 2, 1));
  const g = glyph.y;
  const t = texture(digits, vec2(mod(g, 4), float(3).sub(floor(g.div(4)))).add(q.mul(0.5).add(0.5)).div(4));
  // white fill takes the colour; the black outline stays dark
  m.colorNode = mix(vec3(0), col.rgb, t.r);
  m.opacityNode = t.a.mul(col.a);
  m.alphaTest = 0.01;
  return m;
}
