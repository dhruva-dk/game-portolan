// The ribbon trails (ribbons.ts) as a node material: one segment an instance, between a point of a trail and the
// next, read straight from the storage buffers.
//
// Each end of a segment is turned to face the eye about the trail's tangent there (from the points either side of
// it), so neighbouring segments share their edges and the strip bends without seams; a segment whose ends are not
// neighbours (a ring that has wrapped, a dead point) folds to nothing. The strip spreads as it ages, thickens out of
// nothing just behind the shot as smoke takes a moment to form, and frays: two scales of noise, carried along the
// trail and drifting across it, eat into it more the older it is, so a fresh trail is a tight cord and an old one
// a few loose wisps.
//
// Smoke is lit as a thin cloud, as the spray is: a share of the sun and moon through the air, more of the sun when
// it stands behind the trail (forward scattering, Henyey–Greenstein), and the sky's light from above and below; it
// is hazed and blended. A glowing ribbon is the heat a shot sheds: it cools down a blackbody ramp over its life, is
// added at the lamps' scale and shows through the haze. Both fade where they meet what lies behind them.
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial, NormalBlending, type Texture } from 'three/webgpu';
import {
  Fn, cameraFar, cameraNear, cameraPosition, cameraViewMatrix, clamp, cross, exp, float, instanceIndex, length, max, min, mix, mrt,
  normalize, perspectiveDepthToViewZ, positionGeometry, positionView, pow, select, smoothstep, texture, varying, vec2,
  vec3, vec4,
} from 'three/tsl';
import { overDepth } from '../../gpu/behind.ts';
import { LAMP, P } from '../../gpu/uniforms.ts';
import { MOON_RADIUS, SUN_RADIUS, lightTransmittance } from '../../atmosphere/luts.ts';
import { skyLight } from '../../atmosphere/light.ts';
import { moved, type F, type V3, type V4 } from './kit.ts';

type Buffer = { element(i: unknown): V4 };
export interface RibbonBuffers { pos: Buffer; vel: Buffer; col: Buffer; shape: Buffer; more: Buffer }

const behind = overDepth();

export function ribbonNodeMaterial(noise: Texture, glow: boolean, b: RibbonBuffers, points: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: glow ? AdditiveBlending : NormalBlending });
  m.fog = !glow;
  m.mrtNode = mrt({ velocity: vec4(0), smear: vec4(0) });

  // this segment runs from point j to j + 1 of its trail's ring; j − 1 and j + 2 give the tangents at its ends
  const id = instanceIndex, base = id.div(points).mul(points), j = id.mod(points);
  const at = (k: number) => base.add(j.add(points + k).mod(points));
  const [i0, i1, i2, i3] = [at(-1), at(0), at(1), at(2)];
  const p0 = b.pos.element(i0), p1 = b.pos.element(i1), p2 = b.pos.element(i2), p3 = b.pos.element(i3);
  const s0 = b.shape.element(i0), s1 = b.shape.element(i1), s2 = b.shape.element(i2), s3 = b.shape.element(i3);
  const v0 = b.vel.element(i0), v1 = b.vel.element(i1), v2 = b.vel.element(i2), v3 = b.vel.element(i3);
  const follows = (va: V4, sa: V4, vb: V4, sb: V4) => va.w.greaterThanEqual(0).and(vb.w.greaterThanEqual(0)).and(sb.z.equal(sa.z.add(1)));
  const whole = follows(v1, s1, v2, s2);
  const before = follows(v0, s0, v1, s1), after = follows(v2, s2, v3, s3);

  const far = positionGeometry.x.greaterThan(0.5);
  const here = select(far, p2, p1), shape = select(far, s2, s1), life = select(far, v2.w, v1.w);
  const col = select(far, b.col.element(i2), b.col.element(i1)), more = select(far, b.more.element(i2), b.more.element(i1));
  const prev = select(far, p1, select(before, p0, p1)), next = select(far, select(after, p3, p2), p2);
  const k = clamp(here.w.div(max(life, 1e-4)), 0, 1);
  const width = shape.x.mul(float(1).add(shape.y.sub(1).mul(float(1).sub(float(1).sub(k).mul(float(1).sub(k))))));

  // turned to face the eye about the tangent; seen end on, about the up instead
  const tangent = next.xyz.sub(prev.xyz);
  const toEye = normalize(cameraPosition.sub(here.xyz));
  const c = cross(tangent, toEye), cl = length(c);
  const side = select(cl.greaterThan(1e-5), c.div(max(cl, 1e-5)), normalize(cross(normalize(here.xyz), toEye)));
  const wp = here.xyz.add(side.mul(positionGeometry.y).mul(width).mul(0.5));
  m.positionNode = Fn(() => moved(select(whole, wp, vec3(0)) as V3))();

  const vAcross = varying(positionGeometry.y as F), vAlong = varying(more.x as F), vSeed = varying(more.y as F);
  const vAge = varying(k as F), vSec = varying(here.w as F), vForm = varying(more.z as F);
  const vCol = varying(col as V4), vHeat = varying(shape.w as F), vWidth = varying(width as F);
  const near = varying(smoothstep(1, 6, positionView.z.negate()) as F);

  // a tight cord when fresh, loose wisps when old: the cord wanders across the band as it spreads, and the noise
  // carried along it eats it into strands, more the older it is
  const wander = texture(noise, vec2(vAlong.mul(0.02).add(vSeed.mul(3.3)), vSeed)).r.sub(0.5).mul(vAge).mul(1.2);
  const x = vAcross.sub(wander);
  const n1 = texture(noise, vec2(vAlong.mul(0.035).add(vSeed), x.mul(0.2).add(vAge.mul(0.25)))).g;
  const n2 = texture(noise, vec2(vAlong.mul(0.1).sub(vAge.mul(0.3)), x.mul(0.45).add(vSeed.mul(7.1)))).b;
  const n = n1.mul(0.6).add(n2.mul(0.4));
  const core = exp(x.mul(x).mul(-3.2));
  const strands = smoothstep(vAge.mul(0.3).add(0.3), vAge.mul(0.15).add(0.7), n.add(core.sub(0.5).mul(0.35)));
  const density = core.mul(mix(float(1), strands, vAge.mul(0.6).add(0.35)));
  const formed = smoothstep(0, max(vForm, 1e-3), vSec);

  const scene = perspectiveDepthToViewZ(behind, cameraNear, cameraFar);
  const soft = clamp(positionView.z.sub(scene).div(max(vWidth.mul(0.5), 0.2)), 0, 1);
  const alpha = vCol.a.mul(density).mul(pow(float(1).sub(vAge), 1.4)).mul(formed).mul(soft).mul(near);
  m.opacityNode = alpha;
  m.alphaTest = 0.003;

  if (glow) {
    // heat shed by the shot: yellow at its hottest, through orange to a dull red as it cools
    const temp = min(vHeat.mul(pow(float(1).sub(vAge), 1.6)).mul(n.mul(0.8).add(0.6)), 1.4);
    const ramp = mix(mix(vec3(0.5, 0.05, 0.01), vec3(1, 0.32, 0.04), smoothstep(0.15, 0.55, temp)), vec3(1, 0.72, 0.32), smoothstep(0.75, 1.2, temp));
    m.colorNode = ramp.mul(pow(temp, 2)).mul(vCol.rgb).mul(LAMP).mul(3);
    return m;
  }
  const p = varying(here.xyz as V3), r = length(p), u = p.div(r);
  const sun = lightTransmittance(r, u.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance);
  const moon = lightTransmittance(r, u.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase);
  const skyUp = skyLight(p, u), skyDown = skyLight(p, u.negate());
  // forward scattering against an even spread: a trail between the eye and a low sun shines
  const toward = normalize(positionView).negate();
  const cosSun = cameraViewMatrix.mul(vec4(P.sunDir, 0)).xyz.dot(toward).negate();
  const g = 0.4, hg = float(1 - g * g).div(pow(float(1 + g * g).sub(cosSun.mul(2 * g)), 1.5));
  m.colorNode = vCol.rgb.mul(sun.mul(mix(float(1), hg, 0.75)).add(moon).mul(0.25).add(skyUp.add(skyDown).mul(0.5 / Math.PI)));
  return m;
}
