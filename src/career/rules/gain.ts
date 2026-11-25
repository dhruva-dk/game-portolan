import type { Focus, Line } from '../state.ts';
import { GAIN, LEVEL_SPAN } from '../tuning.ts';

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
