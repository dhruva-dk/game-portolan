// The shield aura as a node material: a shell of hexes round the hull, driven by aura.ts's uniforms. It brightens as the shield fills, ripples from each hit, cracks as it weakens, flashes when it
// breaks and knits up from the waterline when it is refilled. Added light, at the lamps' scale, and not hazed.
import { AdditiveBlending, DoubleSide, MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn, abs, atan, clamp, dot, float, floor, fract, length, max, min, mix, mod, normalView, normalize, positionGeometry,
  positionViewDirection, pow, select, sin, smoothstep, vec2, vec3,
} from 'three/tsl';
import { LAMP, P } from '../../gpu/uniforms.ts';
import { read, readArray, type F, type Uniforms, type V2, type V3, type V4 } from './kit.ts';

/** How near a point is to the edge of its hex, 0 inside to 1 on the edge. */
const hexEdge = (p0: V2): F => {
  const p = p0.mul(vec2(1, 1.1547));
  const a = mod(p, vec2(1, 1.732)).sub(vec2(0.5, 0.866));
  const b = mod(p.sub(vec2(0.5, 0.866)), vec2(1, 1.732)).sub(vec2(0.5, 0.866));
  const h = abs(select(dot(a, a).lessThan(dot(b, b)), a, b));
  return smoothstep(0.4, 0.5, max(dot(h, vec2(0.5, 0.866)), h.x));
};

const hash3 = (p: V3): V3 =>
  fract(sin(vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)))).mul(43758.5453));

/** The gap between the nearest two cells round p: small along the cracks. */
const cracks = Fn(([p]: [V3]) => {
  const i = floor(p), f = fract(p);
  const d1 = float(8).toVar(), d2 = float(8).toVar();
  for (let z = -1; z <= 1; z++) for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const g = vec3(x, y, z);
    const d = length(g.add(hash3(i.add(g))).sub(f));
    d2.assign(select(d.lessThan(d1), d1, min(d2, d)));
    d1.assign(min(d1, d));
  }
  return d2.sub(d1);
});

export function auraNodeMaterial(u: Uniforms, hits: number): MeshBasicNodeMaterial {
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: DoubleSide, blending: AdditiveBlending });
  m.fog = false;
  const fill = read(u, 'uFill', 'float'), crack = read(u, 'uCrack', 'float'), shimmer = read(u, 'uShimmer', 'float');
  const flash = read(u, 'uFlash', 'float'), vis = read(u, 'uVis', 'float'), colour = read(u, 'uColor', 'color');
  const struck = readArray(u, 'uHits', 'vec4');
  const t = P.time;

  const fres = pow(clamp(float(1).sub(abs(dot(normalView, positionViewDirection))), 0, 1), 2.2);
  const dir = normalize(positionGeometry).toVar('auraDir');
  const round = atan(dir.z, dir.x);
  const hex = hexEdge(vec2(round.mul(2.6), dir.y.mul(4)).mul(1.6)).toVar('auraHex');
  // a slow drift of light through the cells, stronger as the shield fills
  const drift = sin(dir.y.mul(9).sub(t.mul(1.7)).add(round.mul(3))).mul(0.5).add(0.5);
  let a: F = fres.mul(fill.mul(0.3).add(0.15)).add(hex.mul(fill.mul(0.09).add(0.03)).mul(drift.mul(0.3).add(0.7)));
  // ripples out from each hit
  for (let k = 0; k < hits; k++) {
    const h = struck.element(k) as unknown as V4;
    const d = dir.distance(h.xyz);
    const fresh = float(1).sub(h.w).mul(select(h.w.lessThanEqual(1), float(1), float(0)));
    const ring = smoothstep(0.3, 0, abs(d.sub(h.w.mul(2.6)))).mul(fresh);
    const near = smoothstep(0.9, 0, d).mul(fresh);
    a = a.add(ring.mul(hex.mul(2).add(0.9))).add(near.mul(hex.mul(0.8).add(0.3)));
  }
  // cracks spread through the shell as it weakens, flickering
  const cp = dir.mul(3.2).add(1.7);
  const c = cracks(cp);
  const line = smoothstep(0.06, 0, c.sub(float(1).sub(crack).mul(0.02)));
  const reach = float(1).sub(crack.mul(1.2));
  const spread = smoothstep(reach, reach.add(0.25), hash3(floor(cp)).x.add(0.3));
  const cracked = line.mul(crack).mul(spread.mul(0.4).add(0.6)).mul(sin(t.mul(23).add(c.mul(40))).mul(0.25).add(0.75));
  a = a.add(cracked.mul(1.6));
  let col: V3 = mix(colour, vec3(1.2, 1.6, 2.4), clamp(cracked, 0, 1).mul(0.6));
  // a refill knits the shell up from the waterline: unmade above the seam, a bright seam, settled below
  const level = mix(-1.15, 1.15, shimmer);
  const y = dir.y.add(sin(round.mul(5).add(t.mul(4))).mul(0.08));
  const made = smoothstep(level.add(0.04), level.sub(0.04), y);
  const seam = smoothstep(0.22, 0, abs(y.sub(level)));
  const knitting = shimmer.greaterThan(0);
  a = select(knitting, a.mul(made).add(seam.mul(hex.mul(2.5).add(0.8)).mul(float(1).sub(shimmer.mul(0.4)))), a);
  col = select(knitting, mix(col, vec3(1.3, 1.9, 2.4), seam.mul(0.5)), col);
  a = a.add(flash.mul(hex.mul(2).add(1))).mul(vis);
  m.colorNode = col.mul(LAMP).mul(1.2);
  m.opacityNode = a;
  return m;
}
