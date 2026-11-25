import { BUILD } from '../tuning.ts';

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
