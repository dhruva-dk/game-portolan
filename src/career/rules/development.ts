import type { Focus, Line } from '../state.ts';
import {
  BUILD,
  GAIN,
  LEVEL_SPAN,
  POLICY,
  SHIPS,
  UNLOCK,
  WINTER,
} from '../tuning.ts';

export const gainRate = (focus: Focus, line: Line): number =>
  focus !== null && 'line' in focus && focus.line === line
    ? GAIN.focused
    : GAIN.unfocused;

export const designGain = (
  level: number,
  skill: number,
  rate: number
): number => rate * (skill / GAIN.perSkill) * (1 - level / GAIN.falloff);

export const gainedLevel = (
  level: number,
  skill: number,
  rate: number
): number => Math.min(LEVEL_SPAN.most, level + designGain(level, skill, rate));

export const buildCost = (
  design: number,
  fitted: number,
  thrift: number | null
): number =>
  Math.ceil(
    BUILD.perLevel *
      (design - fitted) *
      (1 + design / BUILD.designScale) *
      (1 - BUILD.thriftCut * (thrift ?? BUILD.noThrift))
  );

export const fitCost = (
  design: number,
  fitted: number,
  thrift: number | null
): number => Math.max(BUILD.leastFit, buildCost(design, fitted, thrift));

export const winterLoss = (upkeep: number | null): number =>
  upkeep === null
    ? WINTER.lossWithout
    : WINTER.loss - WINTER.perUpkeep * upkeep;

export const wintered = (level: number, loss: number): number =>
  Math.max(SHIPS.leastLevel, level - loss);

export const unlockGain = (gunSkill: number): number =>
  gunSkill / UNLOCK.perSkill;

export const advancedUnlock = (progress: number, gunSkill: number): number =>
  Math.min(UNLOCK.needed, progress + unlockGain(gunSkill));

export const unlockDone = (progress: number): boolean =>
  progress >= UNLOCK.needed;

export const focusWeight = (level: number, mean: number): number =>
  level < mean ? POLICY.behindWeight : POLICY.aheadWeight;

export const focusValue = (
  skill: number,
  level: number,
  weight: number
): number => skill * (1 - level / GAIN.falloff) * weight;

export const wantsGun = (gunLevel: number, unlockedKinds: number): boolean =>
  gunLevel >= POLICY.gunPerKind * unlockedKinds;
