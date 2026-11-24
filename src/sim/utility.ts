import { clamp } from '../world/scalar.ts';

export const ramp = (x: number, lo: number, hi: number): number =>
  clamp((x - lo) / (hi - lo));

export const logistic = (x: number, mid: number, width: number): number =>
  1 / (1 + Math.exp((-2 * (x - mid)) / width));

export function utility(...factors: number[]): number {
  const n = factors.length;
  if (n === 0) return 0;
  const make = 1 - 1 / n;
  let p = 1;
  for (const f of factors) {
    const s = clamp(f);
    if (s === 0) return 0;
    p *= s + (1 - s) * make * s;
  }
  return p;
}

export interface Option<C> {
  readonly name: string;
  readonly weight: number;
  score(ctx: C): number;
}

const REASON = {
  momentum: { fresh: 1.45, held: 1.12, settle: 3 },
  band: 0.22,
} as const;

export const momentum = (since: number): number => {
  const m = REASON.momentum;
  return m.held + (m.fresh - m.held) * ramp(since, m.settle, 0);
};

export function choose<C>(
  options: readonly Option<C>[],
  ctx: C,
  current: number,
  skill: number,
  roll: () => number,
  held: number = REASON.momentum.held
): number {
  const scores = options.map(
    (o, k) => o.weight * o.score(ctx) * (k === current ? held : 1)
  );
  const best = Math.max(0, ...scores);
  if (best <= 0) return -1;
  const floor = best * (1 - REASON.band * (1 - clamp(skill)));
  if (current >= 0 && scores[current] >= floor) return current;
  let total = 0;
  for (const s of scores) if (s >= floor) total += s;
  let pick = roll() * total;
  for (let k = 0; k < options.length; k++) {
    if (scores[k] < floor) continue;
    pick -= scores[k];
    if (pick <= 0) return k;
  }
  for (let k = options.length - 1; k >= 0; k--)
    if (scores[k] >= floor) return k;
  return -1;
}
