// The particles as node materials: the sprites particles.ts simulates, read straight from its storage buffers by
// instance (place and age, velocity and life, colour, size and sprite, turn, gravity and heat).
//
// Each sprite's corners are placed in world space in the vertex stage (the mesh sits at the origin), whether it
// faces the eye, streaks along its velocity on screen or lies flat on the water, so the haze and the light at the
// fragment are worked out where the sprite really is; a dead slot folds to a point and draws nothing.
//
// Smoke and spray are lit as a thin cloud by the sun and the moon through the air and by the sky's light round them,
// and blended; glow (fire, sparks, light) is added, at the lamps' scale, and is not hazed, as bright lights show
// through the haze. A billow or a blast is a frame of the baked smoke (smokeBake.ts) played through over its life,
// blended between moments, and lit from six sides: the sun's direction is taken into the sprite's own frame and
// each side's share of light is weighted by how squarely the sun stands on that side, with a forward-scattering lobe
// that makes it glow when the sun is behind it; its hot core burns on a blackbody ramp. Every sprite fades out where
// it meets what lies behind it (soft particles), so smoke never shows a hard seam where it cuts into the sea or a
// hull.
import { AdditiveBlending, MeshBasicNodeMaterial, NormalBlending, type Texture } from 'three/webgpu';
import {
  abs, cameraFar, cameraNear, cameraViewMatrix, cameraWorldMatrix, clamp, cos, cross, float, floor, instanceIndex, length,
  max, min, mix, mod, normalize, perspectiveDepthToViewZ, positionGeometry, positionView, pow, select, sin, smoothstep,
  texture, varying, vec2, vec3, vec4,
} from 'three/tsl';
import { overDepth } from '../../gpu/behind.ts';
import { LAMP, P } from '../../gpu/uniforms.ts';
import { MOON_RADIUS, SUN_RADIUS, lightTransmittance } from '../../atmosphere/luts.ts';
import { skyLight } from '../../atmosphere/light.ts';
import { FLIP, SMOKE_DEPTH, SMOKE_SIDES } from '../smokeBake.ts';
import { type F, type V2, type V3, type V4 } from './kit.ts';

type Buffer = { element(i: unknown): V4 };
export interface ParticleBuffers { pos: Buffer; vel: Buffer; col: Buffer; shape: Buffer; turn: Buffer; more: Buffer }

/** The first sprite drawn from the baked smoke (particles.ts SPRITE.billow); the one after burns (SPRITE.blast). */
const BILLOW = 8;

/** What lies behind the sprites: the scene with the sea in it. */
const behind = overDepth();

export function particleNodeMaterial(atlas: Texture, glow: boolean, b: ParticleBuffers): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: glow ? AdditiveBlending : NormalBlending });
  m.fog = !glow;
  const id = instanceIndex;
  const at = b.pos.element(id), vel = b.vel.element(id), col = b.col.element(id);
  const shape = b.shape.element(id), turn = b.turn.element(id), more = b.more.element(id);
  const life = vel.w, alive = life.greaterThanEqual(0), once = life.equal(0);
  const k = select(once, float(0), clamp(at.w.div(max(life, 1e-4)), 0, 1));
  const frame = shape.z, mode = shape.w, smoky = frame.greaterThanEqual(BILLOW - 0.5);
  const fadeIn = more.z;
  const rise = select(fadeIn.greaterThan(0), min(k.div(max(fadeIn, 1e-4)), 1), float(1));
  // the baked smoke thins itself as it ages, so it is only faded out at the very end
  const fall = select(smoky, pow(float(1).sub(k), 0.6), float(1).sub(k).mul(float(1).sub(k)).mul(float(1).sub(k.mul(0.3))));
  const alpha = col.a.mul(select(once, float(1), rise.mul(fall)));
  const size = shape.x.mul(float(1).add(shape.y.sub(1).mul(float(1).sub(float(1).sub(k).mul(float(1).sub(k))))));

  const wp = at.xyz, q = positionGeometry.xy;
  const up = normalize(wp);
  const c = cos(turn.y), s = sin(turn.y);
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
  const streak = vec2(dir.y.negate(), dir.x).mul(size).mul(q.x).add(dir.mul(max(size, len.mul(turn.x))).mul(q.y.sub(1)).mul(0.5));
  const offset = select(mode.greaterThan(0.5), streak, turned.mul(size));
  const facing = cameraWorldMatrix.mul(vec4(centre.xy.add(offset), centre.z, 1)).xyz;
  m.positionNode = select(alive, select(mode.greaterThan(1.5), flat, facing), vec3(0));

  // what the fragment needs of the particle, worked out once per corner
  const vAlpha = varying(alpha as F), vCol = varying(col.rgb as V3), vFrame = varying(frame as F);
  const vAge = varying(k as F), vHeat = varying(more.w as F), vSize = varying(size as F);
  const vTurn = varying(vec2(c, s) as V2), vMirror = varying(mod(id.toFloat(), 2) as F);
  // anything brushing the lens thins out instead of filling the screen
  const near = varying(smoothstep(1.5, 8, centre.z.negate()) as F);

  // soft: fades out over half its size in front of what lies behind it
  const scene = perspectiveDepthToViewZ(behind, cameraNear, cameraFar);
  const soft = clamp(positionView.z.sub(scene).div(max(vSize.mul(0.5), 0.15)), 0, 1);

  // ----- the canvas sprites
  // the sheet is uploaded the right way up, so its first row of cells (drawn at the canvas's top) is the upper one
  const cell = vec2(mod(vFrame, 4), float(1).sub(floor(vFrame.div(4).add(0.01))));
  const sprite = texture(atlas, cell.add(0.02).add(q.mul(0.5).add(0.5).mul(0.96)).div(vec2(4, 2)));

  // ----- the baked smoke, played through over the particle's life, mirrored on every other slot
  const f = vAge.mul(FLIP.frames - 1), f0 = floor(f), f1 = min(f0.add(1), FLIP.frames - 1), blend = f.sub(f0);
  const local = vec2(select(vMirror.greaterThan(0.5), q.x.negate(), q.x), q.y);
  const st = vec2(local.x.mul(0.5).add(0.5), float(0.5).sub(local.y.mul(0.5))).mul(0.98).add(0.01);
  const page = (n: F, tex: Texture): V4 => texture(tex, vec2(mod(n, FLIP.cols), floor(n.div(FLIP.cols).add(0.01))).add(st).div(vec2(FLIP.cols, FLIP.rows))) as unknown as V4;
  const sides = mix(page(f0, SMOKE_SIDES), page(f1, SMOKE_SIDES), blend);
  const depth = mix(page(f0, SMOKE_DEPTH), page(f1, SMOKE_DEPTH), blend);

  const opacity = select(vFrame.greaterThanEqual(BILLOW - 0.5), depth.a, sprite.a).mul(vAlpha).mul(near).mul(soft);
  m.opacityNode = opacity;
  m.alphaTest = 0.002;

  // a hot core on a blackbody ramp: deep red, orange, then yellow only at its hottest
  const temp = min(depth.b.mul(vHeat), 1.2);
  const ramp = mix(mix(vec3(0.5, 0.05, 0.01), vec3(1, 0.32, 0.04), smoothstep(0.15, 0.55, temp)), vec3(1, 0.7, 0.3), smoothstep(0.75, 1.15, temp));
  const burn = ramp.mul(pow(temp, 2.2)).mul(LAMP).mul(3);

  if (glow) {
    m.colorNode = select(vFrame.greaterThanEqual(BILLOW - 0.5), burn.add(vCol.mul(LAMP).mul(0.6)), vCol.mul(LAMP).mul(2.5));
    return m;
  }
  const p = varying(wp as V3), r = length(p), u = p.div(r);
  const sun = lightTransmittance(r, u.dot(P.sunDir), float(SUN_RADIUS)).mul(P.sunIlluminance);
  const moon = lightTransmittance(r, u.dot(P.moonDir), float(MOON_RADIUS)).mul(P.moonIlluminance).mul(P.moonPhase);
  const skyUp = skyLight(p, u), skyDown = skyLight(p, u.negate());
  // a thin cloud scatters the light about evenly: a quarter of what falls on it from each side comes to the eye
  const plain = vCol.mul(sun.add(moon).mul(0.25).add(skyUp.add(skyDown).mul(0.5 / Math.PI)));

  // six-way: how much of the light from direction L (in the world) this texel scatters to the eye
  const right = vec3(vTurn.x, vTurn.y, 0), upward = vec3(vTurn.y.negate(), vTurn.x, 0);
  const mirror = select(vMirror.greaterThan(0.5), float(-1), float(1));
  const share = (L: V3): F => {
    const v = cameraViewMatrix.mul(vec4(L, 0)).xyz;
    const x = v.dot(right).mul(mirror), y = v.dot(upward), z = v.z;
    return x.mul(x).mul(select(x.greaterThan(0), sides.r, sides.g))
      .add(y.mul(y).mul(select(y.greaterThan(0), sides.b, sides.a)))
      .add(z.mul(z).mul(select(z.greaterThan(0), depth.r, depth.g)));
  };
  // forward scattering (Henyey–Greenstein, g 0.35, against an even spread): a puff glows with the sun behind it
  const toward = normalize(positionView).negate();
  const cosSun = cameraViewMatrix.mul(vec4(P.sunDir, 0)).xyz.dot(toward).negate();
  const g = 0.35, hg = float(1 - g * g).div(pow(float(1 + g * g).sub(cosSun.mul(2 * g)), 1.5));
  const lit = vCol.mul(
    sun.mul(share(P.sunDir as unknown as V3)).mul(mix(float(1), hg, 0.7))
      .add(moon.mul(share(P.moonDir as unknown as V3)))
      .div(Math.PI)
      .add(skyUp.mul(share(u)).add(skyDown.mul(share(u.negate()))).mul(0.8 / Math.PI)),
  );
  m.colorNode = select(vFrame.greaterThanEqual(BILLOW - 0.5), lit.add(burn), plain);
  return m;
}
