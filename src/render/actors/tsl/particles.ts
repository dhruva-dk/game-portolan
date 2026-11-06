// The particles as node materials, for the WebGPU planet: the same sprites as the GLSL in particles.ts, from the same
// instance data (place and size, colour and alpha, velocity and stretch, spin, atlas frame and mode).
//
// Each sprite's corners are placed in world space in the vertex stage (the mesh sits at the origin), whether it
// faces the eye, streaks along its velocity on screen or lies flat on the water, so the haze and the light at the
// fragment are worked out where the sprite really is. Smoke and spray are lit as a thin cloud by the sun and the moon
// through the air and by the sky's light round them, and blended; glow (fire, sparks, light) is added, at the lamps'
// scale, and is not hazed, as bright lights show through the haze.
import { AdditiveBlending, MeshBasicNodeMaterial, NormalBlending, type Texture } from 'three/webgpu';
import {
  abs, attribute, cameraViewMatrix, cameraWorldMatrix, cos, cross, float, floor, length, max, mod, normalize, positionGeometry,
  select, sin, smoothstep, texture, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';
import { MOON_RADIUS, SUN_RADIUS, lightTransmittance } from '../../atmosphere/luts.ts';
import { skyLight } from '../../atmosphere/light.ts';
import type { F, V3, V4 } from './kit.ts';

export function particleNodeMaterial(atlas: Texture, glow: boolean): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: glow ? AdditiveBlending : NormalBlending });
  m.fog = !glow;
  const at = attribute<'vec4'>('iPos') as V4, col = attribute<'vec4'>('iCol') as V4;
  const vel = attribute<'vec4'>('iVel') as V4, misc = attribute<'vec3'>('iMisc') as V3;
  const wp = at.xyz, size = at.w, q = positionGeometry.xy;
  const up = normalize(wp);
  const c = cos(misc.x), s = sin(misc.x);
  const turned = vec2(q.x.mul(c).sub(q.y.mul(s)), q.x.mul(s).add(q.y.mul(c)));

  // lying flat on the water
  const t1 = normalize(cross(up, select(abs(up.y).greaterThan(0.9), vec3(1, 0, 0), vec3(0, 1, 0))));
  const t2 = cross(up, t1);
  const flat = wp.add(t1.mul(turned.x).add(t2.mul(turned.y)).mul(size));
  // facing the eye, or a streak trailing behind along the velocity as seen on screen
  const centre = cameraViewMatrix.mul(vec4(wp, 1));
  const d = cameraViewMatrix.mul(vec4(vel.xyz, 0)).xy;
  const len = length(d);
  const dir = select(len.greaterThan(1e-4), d.div(max(len, 1e-4)), vec2(0, 1));
  const streak = vec2(dir.y.negate(), dir.x).mul(size).mul(q.x).add(dir.mul(max(size, len.mul(vel.w))).mul(q.y.sub(1)).mul(0.5));
  const offset = select(misc.z.greaterThan(0.5), streak, turned.mul(size));
  const facing = cameraWorldMatrix.mul(vec4(centre.xy.add(offset), centre.z, 1)).xyz;
  m.positionNode = select(misc.z.greaterThan(1.5), flat, facing);

  // anything brushing the lens thins out instead of filling the screen
  const near = varying(smoothstep(1.5, 8, centre.z.negate()) as F);
  const frame = misc.y;
  const cell = vec2(mod(frame, 4), floor(frame.div(4).add(0.01)));
  const sprite = texture(atlas, cell.add(0.02).add(q.mul(0.5).add(0.5).mul(0.96)).div(vec2(4, 2)));
  const a = sprite.a.mul(col.a).mul(near);
  m.opacityNode = a;
  m.alphaTest = 0.002;
  if (glow) {
    m.colorNode = col.rgb.mul(LAMP).mul(2.5);
    return m;
  }
  // a thin cloud scatters the light about evenly: a quarter of what falls on it from each side comes to the eye
  const p = varying(wp as V3), r = length(p), u = p.div(r);
  const sun = lightTransmittance(r, u.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance);
  const moon = lightTransmittance(r, u.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase);
  const sky = skyLight(p, u).add(skyLight(p, u.negate())).mul(0.5);
  m.colorNode = col.rgb.mul(sun.add(moon).mul(0.25).add(sky.div(Math.PI)));
  return m;
}
