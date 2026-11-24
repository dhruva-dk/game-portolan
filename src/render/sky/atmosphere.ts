import type { Rgb } from '../../world/color.ts';

export const BOTTOM = 6360;
export const TOP = 6460;
export const VIEW_HEIGHT = 0.01;

export const RAYLEIGH_SCATTERING = [5.802e-3, 13.558e-3, 33.1e-3] as const;
export const RAYLEIGH_SCALE_HEIGHT = 8;
export const MIE_SCATTERING = 0.1;
export const MIE_EXTINCTION = 0.102;
export const MIE_SCALE_HEIGHT = 0.8;
export const MIE_G = 0.8;
export const OZONE_ABSORPTION = [0.65e-3, 1.881e-3, 0.085e-3] as const;
export const OZONE_CENTER = 25;
export const OZONE_HALF_WIDTH = 15;
export const GROUND_ALBEDO = 0.3;
export const SEA_ALBEDO = 0.06;

const H = Math.sqrt(TOP * TOP - BOTTOM * BOTTOM);

function extinction(h: number): Rgb {
  const rayleigh = Math.exp(-h / RAYLEIGH_SCALE_HEIGHT);
  const mie = Math.exp(-h / MIE_SCALE_HEIGHT);
  const ozone = Math.max(0, 1 - Math.abs(h - OZONE_CENTER) / OZONE_HALF_WIDTH);
  const at = (i: 0 | 1 | 2) =>
    RAYLEIGH_SCATTERING[i] * rayleigh +
    MIE_EXTINCTION * mie +
    OZONE_ABSORPTION[i] * ozone;
  return [at(0), at(1), at(2)];
}

function distanceToTop(r: number, mu: number): number {
  return Math.max(
    0,
    -r * mu + Math.sqrt(Math.max(0, r * r * (mu * mu - 1) + TOP * TOP))
  );
}

export function transmittanceUV(r: number, mu: number): [number, number] {
  const rho = Math.sqrt(Math.max(0, r * r - BOTTOM * BOTTOM));
  const d = distanceToTop(r, mu);
  const dMin = TOP - r;
  const dMax = rho + H;
  return [(d - dMin) / (dMax - dMin), rho / H];
}

export function transmittanceRMu(u: number, v: number): [number, number] {
  const rho = H * v;
  const r = Math.sqrt(rho * rho + BOTTOM * BOTTOM);
  const dMin = TOP - r;
  const dMax = rho + H;
  const d = dMin + u * (dMax - dMin);
  const mu = d === 0 ? 1 : (H * H - rho * rho - d * d) / (2 * r * d);
  return [r, Math.min(1, Math.max(-1, mu))];
}

export function transmittance(r: number, mu: number, steps = 40): Rgb {
  const length = distanceToTop(r, mu);
  const dt = length / steps;
  let red = 0,
    green = 0,
    blue = 0;
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
