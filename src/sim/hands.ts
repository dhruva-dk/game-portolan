import type { Sight } from './sight.ts';
import type { Vec3 } from '../world/sphere.ts';

export type Hands = {
  readonly course: Vec3 | null;
  readonly throttle: number;
  readonly aim: Sight | null;
  readonly fire: boolean;
  readonly gust: boolean;
  readonly heal: number | null;
};

export const STILL: Hands = {
  course: null,
  throttle: 0,
  aim: null,
  fire: false,
  gust: false,
  heal: null,
};
