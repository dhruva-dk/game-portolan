// The planet's air, after Hillaire's "A Scalable and Production Ready Sky and Atmosphere Rendering Technique" (EGSR
// 2020): Rayleigh scattering by the air, Mie scattering and absorption by its haze, and an absorbing ozone layer, each
// with its own density profile over the ground. The lookup tables in luts.ts integrate it; everything that wants the
// air's colour (the sky, the light on every surface, the haze between the eye and what it sees) reads those tables.
//
// The planet is 554 m across its radius, so the air is scaled to it rather than to Earth: a scale height of tens of
// metres, and coefficients raised so that the haze reads at a few hundred metres, which is where every fight happens,
// while the noon sky over the sea stays a deep blue and the sun still reddens through the long path at dusk. From
// orbit the same air is the thin glowing rim round the globe.
//
// Lengths are metres. The planet's centre is the origin.
import { Color, Vector3 } from 'three/webgpu';
import { Fn, If, float, max, select, sqrt, uniform, vec2, vec3, exp, abs, clamp, PI } from 'three/tsl';
import { shared } from '../gpu/uniforms.ts';
import type { Node } from 'three/webgpu';
import { R } from '../../sim/sphere.ts';

/** What the air is made of. Coefficients are per metre, at the ground. */
export interface Air {
  /** Where the air ends, metres above the ground. */
  height: number;
  rayleigh: Color;
  rayleighHeight: number;
  mieScattering: number;
  mieAbsorption: number;
  mieHeight: number;
  /** Mie's anisotropy: how strongly the haze scatters forward, round the sun. */
  mieG: number;
  ozone: Color;
  /** The ozone layer's middle and half width, metres over the ground. */
  ozoneCentre: number;
  ozoneWidth: number;
  /** How much light the ground and sea throw back up into the air. */
  groundAlbedo: Color;
  /** How many times longer the light's path through the air is made at the horizon than the planet's size gives,
   *  for Earth's sunsets on a planet of 554 m (see the transmittance table). */
  lightAirMass: number;
}

/** The air on a clear day. The weather thickens the haze (uniforms below), never this. */
export const CLEAR_AIR: Air = {
  height: 150,
  // Earth's Rayleigh spectrum (5.802, 13.558, 33.1 per 1e6 m) at a density that turns a ship 200 m off a little blue
  // and the far side of the sea to haze. Its scale height is short so the air reads from space as a skin on the
  // planet, not a cloud round it; the column it leaves is thinner than Earth's, which only deepens the zenith's blue.
  rayleigh: new Color(5.802, 13.558, 33.1).multiplyScalar(1e-6 * 8000 / 52),
  rayleighHeight: 32,
  mieScattering: 1.0e-3,
  mieAbsorption: 0.12e-3,
  mieHeight: 10,
  mieG: 0.78,
  ozone: new Color(0.65, 1.881, 0.085).multiplyScalar(1e-6 * 25000 / 60),
  ozoneCentre: 62,
  ozoneWidth: 40,
  groundAlbedo: new Color(0.06, 0.08, 0.1),
  lightAirMass: 4,
};

const rgb = (c: Color) => new Vector3(c.r, c.g, c.b);

/** The air's uniforms. The stage thickens the haze for weather and the Storm by setting these each frame. */
export const AIR = shared({
  bottom: uniform(R),
  top: uniform(R + CLEAR_AIR.height),
  rayleigh: uniform(rgb(CLEAR_AIR.rayleigh)),
  rayleighHeight: uniform(CLEAR_AIR.rayleighHeight),
  mieScattering: uniform(CLEAR_AIR.mieScattering),
  mieExtinction: uniform(CLEAR_AIR.mieScattering + CLEAR_AIR.mieAbsorption),
  mieHeight: uniform(CLEAR_AIR.mieHeight),
  mieG: uniform(CLEAR_AIR.mieG),
  ozone: uniform(rgb(CLEAR_AIR.ozone)),
  ozoneCentre: uniform(CLEAR_AIR.ozoneCentre),
  ozoneWidth: uniform(CLEAR_AIR.ozoneWidth),
  groundAlbedo: uniform(rgb(CLEAR_AIR.groundAlbedo)),
  lightAirMass: uniform(CLEAR_AIR.lightAirMass),
});

/** Sets the air's uniforms from a description, keeping the planet's radius. */
export function setAir(a: Air, bottom = R): void {
  AIR.bottom.value = bottom;
  AIR.top.value = bottom + a.height;
  (AIR.rayleigh.value as Vector3).set(a.rayleigh.r, a.rayleigh.g, a.rayleigh.b);
  AIR.rayleighHeight.value = a.rayleighHeight;
  AIR.mieScattering.value = a.mieScattering;
  AIR.mieExtinction.value = a.mieScattering + a.mieAbsorption;
  AIR.mieHeight.value = a.mieHeight;
  AIR.mieG.value = a.mieG;
  (AIR.ozone.value as Vector3).set(a.ozone.r, a.ozone.g, a.ozone.b);
  AIR.ozoneCentre.value = a.ozoneCentre;
  AIR.ozoneWidth.value = a.ozoneWidth;
  (AIR.groundAlbedo.value as Vector3).set(a.groundAlbedo.r, a.groundAlbedo.g, a.groundAlbedo.b);
  AIR.lightAirMass.value = a.lightAirMass;
}

// ---------------------------------------------------------------- the medium

type F = Node<'float'>;
type V2 = Node<'vec2'>;
type V3 = Node<'vec3'>;

/** The densities of the air (x), the haze (y) and the ozone (z) at height h over the ground; none above the top. */
export const densities = Fn(([h]: [F]) => {
  const inside = select(h.greaterThan(AIR.top.sub(AIR.bottom)), float(0), float(1));
  const hh = max(h, 0);
  const rayleigh = exp(hh.negate().div(AIR.rayleighHeight));
  const mie = exp(hh.negate().div(AIR.mieHeight));
  const ozone = max(float(0), float(1).sub(abs(hh.sub(AIR.ozoneCentre)).div(AIR.ozoneWidth)));
  return vec3(rayleigh, mie, ozone).mul(inside);
});

/** Light lost per metre at height h. */
export const extinctionAt = Fn(([h]: [F]) => {
  const d = densities(h);
  return AIR.rayleigh.mul(d.x).add(vec3(AIR.mieExtinction.mul(d.y))).add(AIR.ozone.mul(d.z));
});

/** Rayleigh's phase function. */
export const rayleighPhase = Fn(([c]: [F]) => float(3).div(float(16).mul(PI)).mul(c.mul(c).add(1)))
  .setLayout({ name: 'rayleighPhase', type: 'float', inputs: [{ name: 'c', type: 'float' }] });

/** Cornette and Shanks's phase function for the haze, with anisotropy g. */
export const miePhase = Fn(([c, g]: [F, F]) => {
  const g2 = g.mul(g);
  const k = float(3).div(float(8).mul(PI)).mul(float(1).sub(g2)).div(g2.add(2));
  const denom = g2.add(1).sub(g.mul(c).mul(2));
  return k.mul(c.mul(c).add(1)).div(max(denom.mul(sqrt(max(denom, 1e-6))), 1e-6));
}).setLayout({ name: 'miePhase', type: 'float', inputs: [{ name: 'c', type: 'float' }, { name: 'g', type: 'float' }] });

/**
 * Where a ray from o along unit d meets a sphere of radius r round the origin: the near and far distances, or (-1, -1)
 * when it misses. A near distance below zero means o is inside.
 */
export const raySphere = Fn(([o, d, r]: [V3, V3, F]) => {
  const b = o.dot(d);
  const c = o.dot(o).sub(r.mul(r));
  const disc = b.mul(b).sub(c);
  const out = vec2(-1, -1).toVar();
  If(disc.greaterThanEqual(0), () => {
    const s = sqrt(disc);
    out.assign(vec2(b.negate().sub(s), b.negate().add(s)));
  });
  return out;
}).setLayout({ name: 'raySphere', type: 'vec2', inputs: [{ name: 'o', type: 'vec3' }, { name: 'd', type: 'vec3' }, { name: 'r', type: 'float' }] });

// ---------------------------------------------------------------- the transmittance table's mapping (Bruneton)

/** The transmittance table's coordinates for a height r (from the centre) and the cosine mu of a ray's zenith angle. */
export const transmittanceUV = Fn(([r, mu]: [F, F]) => {
  const top = AIR.top, bottom = AIR.bottom;
  const H = sqrt(max(top.mul(top).sub(bottom.mul(bottom)), 0));
  const rr = clamp(r, bottom, top);
  const rho = sqrt(max(rr.mul(rr).sub(bottom.mul(bottom)), 0));
  const disc = rr.mul(rr).mul(mu.mul(mu).sub(1)).add(top.mul(top));
  const d = max(rr.negate().mul(mu).add(sqrt(max(disc, 0))), 0);
  const dMin = top.sub(rr), dMax = rho.add(H);
  const xMu = d.sub(dMin).div(max(dMax.sub(dMin), 1e-4));
  const xR = rho.div(max(H, 1e-4));
  return vec2(xMu, xR);
});

/** The inverse: the height and zenith cosine a transmittance texel stands for. */
export const transmittanceParams = Fn(([uv]: [V2]) => {
  const top = AIR.top, bottom = AIR.bottom;
  const H = sqrt(max(top.mul(top).sub(bottom.mul(bottom)), 0));
  const rho = H.mul(uv.y);
  const r = sqrt(rho.mul(rho).add(bottom.mul(bottom)));
  const dMin = top.sub(r), dMax = rho.add(H);
  const d = dMin.add(uv.x.mul(dMax.sub(dMin)));
  const mu = select(d.lessThan(1e-4), float(1), H.mul(H).sub(rho.mul(rho)).sub(d.mul(d)).div(r.mul(d).mul(2)));
  return vec2(r, clamp(mu, -1, 1));
});

/** Whether a ray from height r with zenith cosine mu meets the ground. */
export const hitsGround = Fn(([r, mu]: [F, F]) => {
  const b = AIR.bottom;
  return mu.lessThan(0).and(r.mul(r).mul(mu.mul(mu).sub(1)).add(b.mul(b)).greaterThanEqual(0));
});

/** The distance a ray from height r with zenith cosine mu travels to the top of the air. */
export const distanceToTop = Fn(([r, mu]: [F, F]) => {
  const t = AIR.top;
  return max(r.negate().mul(mu).add(sqrt(max(r.mul(r).mul(mu.mul(mu).sub(1)).add(t.mul(t)), 0))), 0);
});

/** The distance a ray from height r with zenith cosine mu travels to the ground (only meaningful when it hits). */
export const distanceToGround = Fn(([r, mu]: [F, F]) => {
  const b = AIR.bottom;
  return max(r.negate().mul(mu).sub(sqrt(max(r.mul(r).mul(mu.mul(mu).sub(1)).add(b.mul(b)), 0))), 0);
});

