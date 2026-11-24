import type { Sighter } from '../../src/play/orders.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { SHIP } from '../../src/sim/handling.ts';
import type { Sight } from '../../src/sim/sight.ts';
import { random } from '../../src/world/random.ts';
import {
  add,
  cross,
  normalize,
  place,
  toward,
  type Vec3,
} from '../../src/world/sphere.ts';

const BOOM = 60,
  FOCUS = 20,
  SHOULDER = 14;
export const THUMBS = {
  steady: { lag: 0.2, wander: 0.04 },
  sloppy: { lag: 0.3, wander: 0.07 },
} as const;
export type Thumb = keyof typeof THUMBS;
const isThumb = (name: string): name is Thumb => name in THUMBS;

export function thumbNamed(name: string): Thumb {
  if (!isThumb(name))
    throw new Error(`no thumb "${name}" (${Object.keys(THUMBS).join(', ')})`);
  return name;
}
const EVERY: readonly [number, number] = [0.4, 1.0],
  FOLLOW = 3;

export function standIn(seed: number, thumb: Thumb = 'steady'): Sighter {
  const { lag: LAG, wander: WANDER } = THUMBS[thumb];
  const draw = random(seed >>> 0);
  const seen: Vec3[] = [];
  let foeId = -1;
  let off: [number, number] = [0, 0],
    to: [number, number] = [0, 0],
    t = 0;
  const lagged = Math.max(1, Math.round(LAG / STEP));

  return (own, foe): Sight => {
    const deck = place(own.ship.at, FOCUS);
    if (!foe) {
      foeId = -1;
      seen.length = 0;
      return { from: deck, dir: own.ship.heading };
    }
    if (foe.id !== foeId) {
      foeId = foe.id;
      seen.length = 0;
    }
    seen.push(foe.ship.at);
    if (seen.length > lagged) seen.shift();
    const mark = place(seen[0], SHIP.rig / 2);
    t -= STEP;
    if (t <= 0) {
      t = EVERY[0] + (EVERY[1] - EVERY[0]) * draw();
      const a = 2 * Math.PI * draw(),
        r = WANDER * Math.sqrt(draw());
      to = [r * Math.cos(a), r * Math.sin(a)];
    }
    const k = Math.min(1, FOLLOW * STEP);
    off = [off[0] + (to[0] - off[0]) * k, off[1] + (to[1] - off[1]) * k];
    const up = own.ship.at,
      ahead = toward(up, seen[0]) ?? own.ship.heading,
      right = cross(ahead, up);
    const look = normalize(add(mark, deck, -1)),
      eye = add(add(deck, right, SHOULDER), look, -BOOM);
    const on = normalize(add(mark, eye, -1)),
      across = normalize(cross(on, normalize(eye))),
      lift = cross(across, on);
    return {
      from: eye,
      dir: normalize(add(add(on, across, off[0]), lift, off[1])),
    };
  };
}
