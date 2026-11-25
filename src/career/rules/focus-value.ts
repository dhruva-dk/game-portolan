import { GAIN, POLICY } from '../tuning.ts';

export const focusWeight = (level: number, mean: number): number =>
  level < mean ? POLICY.behindWeight : POLICY.aheadWeight;

export const focusValue = (
  skill: number,
  level: number,
  weight: number
): number => skill * (1 - level / GAIN.falloff) * weight;

export const wantsGun = (gunLevel: number, unlockedKinds: number): boolean =>
  gunLevel >= POLICY.gunPerKind * unlockedKinds;
