import { UNLOCK } from '../tuning.ts';

export const unlockGain = (gunSkill: number): number =>
  gunSkill / UNLOCK.perSkill;

export const advancedUnlock = (progress: number, gunSkill: number): number =>
  Math.min(UNLOCK.needed, progress + unlockGain(gunSkill));

export const unlockDone = (progress: number): boolean =>
  progress >= UNLOCK.needed;
