import { SOOT, WISP } from '../palette.ts';
import type { ShipDraw } from '../snapshot.ts';
import * as sphere from '../../world/sphere.ts';
import { clamp } from '../../world/scalar.ts';

type Vec3 = sphere.Vec3;

export const WORN = [
  null,
  {
    rate: 5,
    size: 0.4,
    grow: 0.6,
    rise: 4.5,
    drag: 0.45,
    lift: 0.4,
    life: 4,
    opacity: 0.4,
    ink: WISP,
  },
  {
    rate: 8,
    size: 0.7,
    grow: 0.8,
    rise: 5.5,
    drag: 0.4,
    lift: 0.5,
    life: 5,
    opacity: 0.55,
    ink: SOOT,
  },
] as const;
export const LIFE_SPREAD = 1.1;
export const SMOKING = {
  most: 8,
  near: 50,
  far: 360,
  over: 2.5,
  aft: 1.5,
  close: [14, 45],
  alive: 900,
} as const;
export const CLOSE = { rate: 0.4, rise: 0.5, size: 0.7 } as const;

const LONGEST = Math.max(
  (WORN[2]?.life ?? 0) * LIFE_SPREAD,
  (WORN[1]?.life ?? 0) * LIFE_SPREAD
);
export const MOST_RATE = SMOKING.alive / LONGEST;

export interface Smoker {
  ship: ShipDraw;
  away: number;
  wear: number;
  close: number;
}

function overHorizon(eye: Vec3, p: Vec3) {
  const k = (sphere.R + SMOKING.over + 6) / Math.max(1e-6, sphere.length(p));
  const dx = p[0] * k - eye[0],
    dy = p[1] * k - eye[1],
    dz = p[2] * k - eye[2];
  const t =
    -(eye[0] * dx + eye[1] * dy + eye[2] * dz) / (dx * dx + dy * dy + dz * dz);
  if (t <= 0 || t >= 1) return true;
  const x = eye[0] + dx * t,
    y = eye[1] + dy * t,
    z = eye[2] + dz * t;
  return x * x + y * y + z * z >= sphere.R * sphere.R;
}

const closeShare = (close: number) => CLOSE.rate + (1 - CLOSE.rate) * close;

export function smokers(
  ships: readonly ShipDraw[],
  eye: Vec3,
  out: Smoker[]
): number {
  let n = 0;
  for (const s of ships) {
    if (!s.afloat || !s.wear) continue;
    const p = s.pose.position,
      d = Math.hypot(p[0] - eye[0], p[1] - eye[1], p[2] - eye[2]);
    if (d > SMOKING.far || !overHorizon(eye, p)) continue;
    const full = n === SMOKING.most;
    let i = full ? n - 1 : n;
    if (full && d >= (out[i]?.away ?? 0)) continue;
    const spare = out[i] ?? (out[i] = { ship: s, away: 0, wear: 0, close: 1 });
    for (; i > 0 && (out[i - 1]?.away ?? 0) > d; i--)
      out[i] = out[i - 1] ?? spare;
    out[i] = spare;
    spare.ship = s;
    spare.away = d;
    if (!full) n++;
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const m = out[i];
    if (!m) continue;
    const s = m.ship,
      far = Math.max(1, m.away / SMOKING.near),
      close = clamp(
        (m.away - SMOKING.close[0]) / (SMOKING.close[1] - SMOKING.close[0])
      ),
      share = closeShare(close) / far;
    m.close = close;
    m.wear = (WORN[s.wear]?.rate ?? 0) * share;
    sum += m.wear;
  }
  if (sum > MOST_RATE) {
    const k = MOST_RATE / sum;
    for (let i = 0; i < n; i++) {
      const m = out[i];
      if (!m) continue;
      m.wear *= k;
    }
  }
  return n;
}
