// The loot as node materials, for the WebGPU planet: the beams that mark loot from afar and the tokens' rarity glow,
// as the GLSL in loot.ts does them. Each token's rarity colour (its instance colour) lights only its glow, which
// gathers at the edges, so the token's own colour is left alone and the glow rims its shape.
import {
  AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, MeshStandardNodeMaterial, type MeshStandardMaterialParameters, type NodeBuilder,
} from 'three/webgpu';
import { abs, cameraPosition, clamp, dot, float, normalView, normalWorld, positionViewDirection, positionWorld, pow, sin, smoothstep, uv, varyingProperty } from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';

/** A standard material whose instance colour is left out of its diffuse colour, for the glow alone to take. */
class Token extends MeshStandardNodeMaterial {
  override setupDiffuseColor(builder: NodeBuilder): void {
    const object = builder.object as { instanceColor?: unknown };
    const tint = object.instanceColor;
    object.instanceColor = null;
    super.setupDiffuseColor(builder);
    object.instanceColor = tint;
  }
}

export function tokenNodeMaterial(base: MeshStandardMaterialParameters, glow: number): MeshStandardNodeMaterial {
  const m = new Token(base);
  const rim = pow(float(1).sub(abs(dot(normalView, positionViewDirection))), 2).mul(1.4).add(0.3);
  m.emissiveNode = varyingProperty('vec3', 'vInstanceColor').mul(glow).mul(rim).mul(LAMP).mul(2.5);
  return m;
}

export function beamNodeMaterial(): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  m.fog = false;
  const v = uv().y;
  let a = pow(clamp(float(1).sub(v), 0, 1), 2.2).mul(sin(v.mul(40).sub(P.time.mul(6))).mul(0.25).add(0.75));
  // a soft column: bright down the core, nothing at the rim
  const axis = positionWorld.normalize();
  const look = cameraPosition.sub(positionWorld).normalize();
  const across = look.sub(axis.mul(dot(look, axis))).normalize();
  const core = abs(dot(normalWorld.sub(axis.mul(dot(normalWorld, axis))).normalize(), across));
  a = a.mul(core).mul(core).mul(1.6);
  // a marker for the distance; up close the token itself speaks
  m.opacityNode = a.mul(smoothstep(10, 55, positionWorld.distance(cameraPosition)));
  // the instance colour, the rarity's, is laid on by the material itself
  m.colorNode = LAMP.mul(2.5);
  return m;
}
