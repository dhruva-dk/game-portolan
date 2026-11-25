import type { Focus, Line } from '../state.ts';
import {
  BUILD,
  ECONOMY,
  LEAGUE,
  LEVEL_SPAN,
  POLICY,
  SHIPS,
  STAT_SPAN,
  UNLOCK,
} from '../tuning.ts';
import { levelMerit, parLevel } from './money.ts';

export const unfocusedRate = (): number =>
  (ECONOMY.winter * (parLevel(1) - parLevel(0))) /
  (LEAGUE.racesPerSeason * STAT_SPAN.most);

export const focusedRate = (): number => ECONOMY.focus * unfocusedRate();

export const gainRate = (focus: Focus, line: Line): number =>
  focus !== null && 'line' in focus && focus.line === line
    ? focusedRate()
    : unfocusedRate();

export const designGain = (skill: number, rate: number): number => rate * skill;

export const gainedLevel = (
  level: number,
  skill: number,
  rate: number
): number => Math.min(LEVEL_SPAN.most, level + designGain(skill, rate));

function builtUpTo(level: number): number {
  const { floor, rise, power } = ECONOMY.income;
  const spread = parLevel(1) - parLevel(0);
  return (
    floor * level +
    (rise * spread * levelMerit(level) ** (power + 1)) / (power + 1)
  );
}

export const buildCost = (
  design: number,
  fitted: number,
  thrift: number | null
): number =>
  Math.ceil(
    ECONOMY.levelCost *
      (builtUpTo(design) - builtUpTo(fitted)) *
      (1 - BUILD.thriftCut * (thrift ?? BUILD.noThrift))
  );

export const fitCost = (
  design: number,
  fitted: number,
  thrift: number | null
): number => Math.max(BUILD.leastFit, buildCost(design, fitted, thrift));

export const fittedWinter = (upkeep: number | null): number =>
  upkeep === null
    ? ECONOMY.winter + ECONOMY.winterFitted
    : ECONOMY.winter + ECONOMY.winterFitted * (1 - upkeep / STAT_SPAN.most);

export const wintered = (level: number, share: number): number =>
  SHIPS.leastLevel + (level - SHIPS.leastLevel) * (1 - share);

export const winteredFitted = (
  fitted: number,
  design: number,
  upkeep: number | null
): number =>
  Math.min(
    wintered(fitted, fittedWinter(upkeep)),
    wintered(design, ECONOMY.winter)
  );

export const unlockGain = (gunSkill: number): number =>
  gunSkill / UNLOCK.perSkill;

export const advancedUnlock = (progress: number, gunSkill: number): number =>
  Math.min(UNLOCK.needed, progress + unlockGain(gunSkill));

export const unlockDone = (progress: number): boolean =>
  progress >= UNLOCK.needed;

export const focusWeight = (level: number, mean: number): number =>
  level < mean ? POLICY.behindWeight : POLICY.aheadWeight;

export const focusValue = (skill: number, weight: number): number =>
  skill * weight;

export const wantsGun = (gunLevel: number, unlockedKinds: number): boolean =>
  gunLevel >= POLICY.gunPerKind * unlockedKinds;
