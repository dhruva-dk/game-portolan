// The six weapon classes, in profile with the muzzle to the right, and the four consumables.
import {
  all, ball, circle, cut, cutLine, fill, line, plus, poly, rect, shield, star, wave, type Prim,
} from '../draw.ts';

export type WeaponClass = 'cannon' | 'scatter' | 'harpoon' | 'mortar' | 'repeater' | 'broadside';
export type ConsumableId = 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

const barrel = 'rotate(-9 12 10)';

export const WEAPON_ICONS: Record<WeaponClass, Prim[]> = {
  cannon: [
    // the barrel, breech to muzzle, a little elevated
    ...all([
      fill('M5.2 6.3L18.2 7.7V7H21.8V13H18.2V12.3L5.2 13.7C3.4 13.7 2.6 12 2.6 10S3.4 6.3 5.2 6.3Z'),
      fill(circle(2.2, 10, 1.5)),
      cutLine('M8.4 6.4V13.6', 1, { fine: true }),
      cutLine('M16.6 7.2V12.8', 1),
    ], { tr: barrel }),
    // the carriage and its wheels
    fill(poly(4.6, 13.6, 16.8, 12.2, 15.6, 18.2, 5.4, 18.2)),
    cutLine('M3.6 13.5L17.6 11.9', 1.2),
    fill(circle(7.6, 19.2, 3.1) + circle(7.6, 19.2, 1, true), { top: true }),
    fill(circle(14.6, 19.2, 3.1) + circle(14.6, 19.2, 1, true), { top: true }),
    cutLine(circle(7.6, 19.2, 3.9), 1.3),
    cutLine(circle(14.6, 19.2, 3.9), 1.3),
  ],
  scatter: [
    // a flared swivel gun spraying shot
    fill('M3.4 8.5H11.2C13.2 8.5 14.4 5.8 16.6 4.6V15.4C14.4 14.2 13.2 11.5 11.2 11.5H3.4Z'),
    fill(circle(3.6, 10, 2.4)),
    cutLine('M15.2 5.6V14.4', 1),
    line('M8.6 12.4V18.6', 2.4),
    line('M5.6 12.4Q8.6 16.2 11.6 12.4', 1.8, { fine: true }),
    fill(rect(4.6, 18.4, 8, 3, 1.2)),
    fill(circle(19.4, 5.2, 1.5)),
    fill(circle(21.4, 10, 1.7)),
    fill(circle(19.4, 14.8, 1.5)),
    fill(circle(22.4, 6.6, 0.9), { fine: true }),
    fill(circle(22.4, 13.4, 0.9), { fine: true }),
  ],
  harpoon: [
    ...all([
      line('M4.2 12H16.6', 2.4),
      fill('M23 12L14.2 7.2L16.6 11H15.4V13H16.6L14.2 16.8Z'),
      line(circle(2.6, 12, 1.7), 1.5),
      cutLine('M13 12H14.6', 3, { fine: true }),
      line('M12.8 10.6V13.4', 1.2, { fine: true, cap: 'butt' }),
    ], { tr: 'rotate(-38 12 12)' }),
    // the line, trailing from the eye
    line('M2.6 15.6C2 19 5.4 18.2 6 20.4C6.5 22.2 4.2 22.8 2.6 22.2', 1.4),
  ],
  mortar: [
    // a squat tube on its bed, lobbing a ball over
    ...all([
      fill(rect(5.4, 7.6, 7.6, 11.2, 1.6)),
      fill(rect(4.3, 6.4, 9.8, 2.8, 1.2)),
      cutLine('M5.2 9.6H13.2', 1),
      cutLine('M5.2 13.4H13.2', 0.9, { fine: true }),
    ], { tr: 'rotate(32 9.2 13.2)' }),
    fill(rect(2, 18.2, 15.6, 3.8, 1.3)),
    cutLine('M2 18.1H17.6', 1.2),
    line('M14.2 4.6Q18.4 0.6 21 6.8', 1.5, { dash: '0.1 2.8' }),
    ...ball(20.6, 11, 2.6),
  ],
  repeater: [
    // a crank-turned volley gun: three barrels from one drum
    fill(rect(9.4, 5.4, 12.6, 2.8, 1.2)),
    fill(rect(9.4, 9.6, 13.4, 2.8, 1.2)),
    fill(rect(9.4, 13.8, 12.6, 2.8, 1.2)),
    fill(rect(17.8, 4.4, 2.4, 13.2, 0.8)),
    cutLine(circle(7.6, 11, 6.3), 1.2),
    fill(circle(7.6, 11, 5.5) + circle(7.6, 11, 1.7, true), { top: true }),
    fill(rect(6.2, 16, 2.8, 4.4)),
    fill(rect(3.2, 19.8, 8.8, 2.4, 1)),
    line('M1.4 16.2L3.6 14.2', 1.6),
  ],
  broadside: [
    // a ship bow-on, firing from both sides at once
    line('M12 2.4V9.4', 1.8),
    fill('M8.6 3.2H15.4C15.8 4.8 15.8 6.4 15.4 8H8.6C8.2 6.4 8.2 4.8 8.6 3.2Z'),
    fill('M6.8 9.6H17.2L16 15.6C15.4 18.4 13.8 19.6 12 19.6C10.2 19.6 8.6 18.4 8 15.6Z'),
    cutLine('M7.8 12.6H16.2', 1, { fine: true }),
    fill(rect(3.4, 11.2, 4.6, 2.6, 0.8)),
    fill(rect(16, 11.2, 4.6, 2.6, 0.8)),
    fill(star(2.2, 12.5, 7, 2.6, 1.1, 0)),
    fill(star(21.8, 12.5, 7, 2.6, 1.1, 180)),
    line(wave(2, 22, 21.6, 0.9, 3), 1.6),
  ],
};

/** The shield crest knocked out of a bottle. */
const crest = (cx: number, cy: number, w: number, h: number): Prim[] => [
  cut(shield(cx, cy, w, h)),
  fill(shield(cx, cy, w * 0.52, h * 0.52), { fine: true }),
];

export const CONSUMABLE_ICONS: Record<ConsumableId, Prim[]> = {
  smallShield: [
    // a small round vial
    fill(circle(12, 15.4, 6.6), { tint: true }),
    fill(rect(9.8, 5.2, 4.4, 5.4, 0.6)),
    fill(rect(8.8, 2, 6.4, 3.4, 1.2)),
    cutLine('M8.4 5.3H15.6', 0.9),
    ...crest(12, 15.6, 6.4, 7.4),
  ],
  bigShield: [
    // a big jug with a handle
    fill(rect(3.4, 8.4, 15.6, 14, 4.6), { tint: true }),
    fill('M7.6 9.2C7.6 6.8 9.2 6 9.2 4.6H13.2C13.2 6 14.8 6.8 14.8 9.2Z'),
    fill(rect(8.2, 1.2, 6, 3.6, 1.2)),
    cutLine('M7.6 4.7H14.8', 0.9),
    cutLine('M7 8.8H15.4', 0.9),
    line('M19 11.4C23 11.4 23 18.4 19 18.4', 2),
    ...crest(11.2, 15.6, 9.2, 10.4),
  ],
  repairKit: [
    // a plank and a mallet
    fill(rect(1.6, 13.6, 20.8, 5.6, 1.2), { tr: 'rotate(-14 12 16.4)', tint: true }),
    cut(circle(4.6, 17.2, 0.8), { fine: true }),
    cut(circle(19.6, 13.4, 0.8), { fine: true }),
    cutLine('M5.4 21.6L15.8 7.4', 4.2),
    line('M5.4 21.6L14.6 9', 2.2, { top: true }),
    fill(rect(9.6, 2.2, 10.8, 6.4, 1.6), { tr: 'rotate(36 15 5.4)', top: true }),
    cutLine('M12.6 6.6L17.6 10.2', 1.2, { tr: 'translate(-1.4 -1.6)', fine: true }),
  ],
  fullRepair: [
    // a full kit: a box with a carrying handle and a big cross
    fill(rect(2.4, 8.2, 19.2, 13.6, 2.6), { tint: true }),
    line('M8.4 8.4V6.2C8.4 4.9 9.1 4.2 10.4 4.2H13.6C14.9 4.2 15.6 4.9 15.6 6.2V8.4', 2.2),
    cutLine('M2.4 11.6H21.6', 1),
    cut(plus(12, 16.4, 4.2, 2.8)),
  ],
};
