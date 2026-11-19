// Earth's atmosphere, after Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique"
// (EGSR 2020). Plain numbers and CPU functions only: the GPU tables (tables.ts) use the same constants and mappings,
// and the tests check them here.
//
// Units are kilometres. These are Earth's tables, tied to the observer: the eye stands a few metres above the sea at
// the top of a sphere of radius BOTTOM, and the small planet's own sky is read through them (view.toSky stretches its
// elevations so its horizon falls on Earth's).

import type { Rgb } from '../colour';

export const BOTTOM = 6360;
export const TOP = 6460;
/** Height of the eye above the sea for the sky-view table, km. */
export const VIEW_HEIGHT = 0.01;

export const RAYLEIGH_SCATTERING = [5.802e-3, 13.558e-3, 33.1e-3] as const;
export const RAYLEIGH_SCALE_HEIGHT = 8;
/**
 * Aerosol on a clear day over the trade-wind sea (Environment.haze = 1): sea salt held in the marine boundary layer,
 * so a short scale height, and an optical depth at 550 nm of 0.08 (maritime AERONET sites read 0.06–0.1), absorbing
 * little (single-scattering albedo 0.98). Hillaire's continental defaults (3.996e-3, 4.44e-3, 1.2 km) are 16 times
 * clearer: a sky deep blue to the horizon, without the pale band at its foot.
 */
export const MIE_SCATTERING = 0.1;
export const MIE_EXTINCTION = 0.102;
export const MIE_SCALE_HEIGHT = 0.8;
export const MIE_G = 0.8;
export const OZONE_ABSORPTION = [0.65e-3, 1.881e-3, 0.085e-3] as const;
/** Ozone's density is a tent 30 km wide centred 25 km up. */
export const OZONE_CENTRE = 25;
export const OZONE_HALF_WIDTH = 15;
export const GROUND_ALBEDO = 0.3;
/** The sea's albedo under a diffuse sky, for light it bounces up onto undersides and clouds. */
export const SEA_ALBEDO = 0.06;

const H = Math.sqrt(TOP * TOP - BOTTOM * BOTTOM);

/** Extinction per km at height h (km) above the sea. */
export function extinction(h: number): Rgb {
  const rayleigh = Math.exp(-h / RAYLEIGH_SCALE_HEIGHT);
  const mie = Math.exp(-h / MIE_SCALE_HEIGHT);
  const ozone = Math.max(0, 1 - Math.abs(h - OZONE_CENTRE) / OZONE_HALF_WIDTH);
  const at = (i: 0 | 1 | 2) => RAYLEIGH_SCATTERING[i] * rayleigh + MIE_EXTINCTION * mie + OZONE_ABSORPTION[i] * ozone;
  return [at(0), at(1), at(2)];
}

/** Distance from radius r along cosine-of-zenith mu to the top of the atmosphere. */
function distanceToTop(r: number, mu: number): number {
  return Math.max(0, -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + TOP * TOP)));
}

/** Transmittance table coordinates for (r, mu) (Bruneton 2017, §2.2). */
export function transmittanceUV(r: number, mu: number): [number, number] {
  const rho = Math.sqrt(Math.max(0, r * r - BOTTOM * BOTTOM));
  const d = distanceToTop(r, mu);
  const dMin = TOP - r;
  const dMax = rho + H;
  return [(d - dMin) / (dMax - dMin), rho / H];
}

/** The inverse of transmittanceUV. */
export function transmittanceRMu(u: number, v: number): [number, number] {
  const rho = H * v;
  const r = Math.sqrt(rho * rho + BOTTOM * BOTTOM);
  const dMin = TOP - r;
  const dMax = rho + H;
  const d = dMin + u * (dMax - dMin);
  const mu = d === 0 ? 1 : (H * H - rho * rho - d * d) / (2 * r * d);
  return [r, Math.min(1, Math.max(-1, mu))];
}

/** Fraction of light surviving from radius r along mu to the top of the atmosphere, marched. */
export function transmittance(r: number, mu: number, steps = 40): Rgb {
  const length = distanceToTop(r, mu);
  const dt = length / steps;
  let red = 0, green = 0, blue = 0;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const h = Math.sqrt(r * r + t * t + 2 * r * mu * t) - BOTTOM;
    const [er, eg, eb] = extinction(h);
    red += er * dt;
    green += eg * dt;
    blue += eb * dt;
  }
  return [Math.exp(-red), Math.exp(-green), Math.exp(-blue)];
}
