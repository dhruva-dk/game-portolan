import type { Status } from '../../play/player.ts';
import { INK, WASH, bar, figure, slip, svg } from '../base/ink.ts';

const VITALS = { w: 226, h: 92 } as const;

const BARS = { x: 90, w: 82, shield: [26, 12], hull: [56, 18], figures: 178 };

export function createVitals(face: HTMLElement) {
  const drawn = document.createElement('div');
  face.append(drawn);
  const was = [NaN, NaN, NaN];

  return {
    update(s: Status) {
      const shield = Math.round(s.shield),
        hull = Math.round(s.hull),
        most = s.shieldMax * 1000 + s.hullMax;
      if (shield === was[0] && hull === was[1] && most === was[2]) return;
      was[0] = shield;
      was[1] = hull;
      was[2] = most;
      const low = hull <= 25;
      drawn.innerHTML = svg(
        VITALS.w,
        VITALS.h,
        slip(1, 1, VITALS.w - 2, VITALS.h - 2) +
          bar(
            BARS.x,
            BARS.shield[0],
            BARS.w,
            BARS.shield[1],
            shield / s.shieldMax,
            WASH.azure
          ) +
          figure(BARS.figures, BARS.shield[0], shield, 16, {
            anchor: 'start',
            fill: INK.blue,
          }) +
          bar(
            BARS.x,
            BARS.hull[0],
            BARS.w,
            BARS.hull[1],
            hull / s.hullMax,
            WASH.umber
          ) +
          figure(BARS.figures, BARS.hull[0], hull, 25, {
            anchor: 'start',
            fill: low ? INK.rubric : INK.iron,
          })
      );
    },
  };
}
