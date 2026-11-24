import { smoother, smootherIntegral } from '../world/scalar.ts';
import { BOOM, type Shot } from './chase.ts';

export type Ending = 'sunk' | 'won';

export const FINALE = {
  sunk: { back: 30, tilt: 0.32, turn: 0.1, rise: 3.2, beat: 2.6 },
  won: { back: 22, tilt: 0.12, turn: 0.22, rise: 2.4, beat: 2.4 },
} as const;

export function finale(end: Ending | null, seconds: number): Shot {
  if (!end) return {};
  const f = FINALE[end],
    t = Math.max(0, seconds),
    u = Math.min(1, t / f.rise);
  const spin = f.turn * (u < 1 ? f.rise * smootherIntegral(u) : t - f.rise / 2);
  return {
    boom: BOOM + f.back * smoother(u),
    tilt: f.tilt * smoother(u),
    spin,
  };
}
