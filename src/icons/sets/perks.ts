// The 16 region perks of src/sim/world/index.ts: what holding a region's landmark gives you.
import type { PerkId } from '../../sim/world/index.ts';
import {
  all, arc, arcArrow, ball, bolt, chest, circle, cut, cutLine, fill, gull, line, path, poly, px, py, rect, sparkle, wave,
  type Prim,
} from '../draw.ts';

/** Three speed lines trailing to the left of x. */
const trail = (x: number, ys: readonly number[], len = 3): Prim[] => ys.map((y, i) => line(`M${x - len + (i % 2) * 0.8} ${y}H${x}`, 1.6));

/** A six-armed snowflake, as cuts. */
const snowflake = (cx: number, cy: number, r: number, w: number): Prim[] => {
  const p: Prim[] = [];
  for (const a of [0, 60, 120]) p.push(cutLine(path(px(cx, r, a), py(cy, r, a), px(cx, -r, a), py(cy, -r, a)), w));
  for (let a = 0; a < 360; a += 60) {
    const bx = px(cx, r * 0.6, a), by = py(cy, r * 0.6, a);
    p.push(cutLine(path(px(bx, r * 0.32, a + 135), py(by, r * 0.32, a + 135), bx, by, px(bx, r * 0.32, a - 135), py(by, r * 0.32, a - 135)), w * 0.75, { fine: true }));
  }
  return p;
};

/** A mallet, head up and to the right. */
const mallet = (o: { tr?: string } = {}): Prim[] =>
  all([line('M3.6 20.4L11.4 10.8', 2.4), fill(rect(7.6, 3.4, 10.4, 6.2, 1.6), { tr: 'rotate(39 12.8 6.5)' })], o);

export const PERK_ICONS: Record<PerkId, Prim[]> = {
  frostShot: [
    fill(circle(13.6, 12, 8.2), { tint: true }),
    ...snowflake(13.6, 12, 5.6, 1.4),
    ...trail(4.4, [7.6, 12, 16.4]),
  ],
  fastRepair: [
    ...mallet({ tr: 'translate(-1 0)' }),
    line('M13.4 13.4L16.8 16.8L13.4 20.2', 2.4),
    line('M18.2 13.4L21.6 16.8L18.2 20.2', 2.4),
  ],
  fogSight: [
    // a spyglass through the fog
    ...all([
      fill(rect(2.2, 10, 5.4, 4, 0.8)),
      fill(rect(7.2, 9.2, 5.8, 5.6, 0.9)),
      fill(rect(12.6, 8.2, 8.4, 7.6, 1.2)),
      fill(rect(20.4, 7.4, 1.8, 9.2, 0.6)),
      cutLine('M7.4 9V15M12.8 8V16', 0.9),
    ], { tr: 'rotate(-24 12 12)' }),
    cutLine('M0 18.6H24', 3.4),
    line('M2.6 18.6H13.4', 1.7),
    line('M8.6 22H21.4', 1.7),
    line('M14.6 3H21.6', 1.7),
  ],
  spotter: [
    // a mark on the map where your shot landed
    fill('M12 22.4C8.6 17.8 4.6 14 4.6 9.6A7.4 7.4 0 0 1 19.4 9.6C19.4 14 15.4 17.8 12 22.4Z'),
    cut(circle(12, 9.6, 3.6)),
    fill(circle(12, 9.6, 1.5), { top: true }),
    line(arc(12, 9.6, 10.6, 195, 235), 1.5, { fine: true }),
    line(arc(12, 9.6, 10.6, 305, 345), 1.5, { fine: true }),
  ],
  longRange: [
    line('M4.6 16.8Q12.4 -0.4 20 13.4', 1.6, { dash: '0.1 2.9' }),
    fill(rect(1.2, 15.6, 6.4, 3.4, 1), { tr: 'rotate(-48 4.4 17.3)' }),
    ...ball(20.2, 15.6, 2.4),
    line('M1.6 22H22.4', 1.6),
    line('M1.6 20.2V22M7.8 20.8V22M14 20.8V22M22.4 20.2V22', 1.3),
  ],
  fastReload: [
    // the shot is stacked and ready
    fill(circle(6.8, 17.6, 3.8)),
    fill(circle(15, 17.6, 3.8)),
    fill(circle(10.9, 10.6, 3.8)),
    cutLine(circle(10.9, 10.6, 4.5), 1),
    cutLine('M10.9 14V21.6', 1),
    fill(bolt(15.6, 1.2, 7.6, 11.2), { top: true }),
    cutLine(bolt(15.6, 1.2, 7.6, 11.2), 2.2),
  ],
  hiddenWake: [
    // a ship from above, its wake rubbed out
    fill('M12 1.8C14 3.8 14.6 6.4 14.4 9.8H9.6C9.4 6.4 10 3.8 12 1.8Z'),
    line('M10.2 11.6L5 21', 1.8, { dash: '2.2 2' }),
    line('M13.8 11.6L19 21', 1.8, { dash: '2.2 2' }),
    cutLine('M3.4 4L20.6 20.6', 4),
    line('M3.4 4L20.6 20.6', 2.2),
  ],
  quickGust: [
    ...arcArrow(12, 12, 9.6, 30, 310, 2),
    ...all([
      line('M5 9.8H12.6A2.2 2.2 0 1 0 10.4 7.6', 1.9),
      line('M4.6 13.2H15.6A2.2 2.2 0 1 1 13.4 15.4', 1.9),
    ], { tr: 'translate(1.4 0.6)' }),
  ],
  cheapDeliveries: [
    fill(gull(8.8, 7.4, 0.7)),
    cutLine(circle(16.2, 16.4, 7.2), 1.4),
    fill(circle(16.2, 16.4, 6.2), { top: true, tint: true }),
    cut('M16.2 20.4L12.8 16.6H15V12.2H17.4V16.6H19.6Z'),
  ],
  shallowDraft: [
    fill('M2.6 5.4H21.4L19.6 10.4C19.2 11.4 18.4 12 17.4 12H6.6C5.6 12 4.8 11.4 4.4 10.4Z'),
    line('M1.6 14.4H22.4', 1.4, { dash: '2.4 1.6', fine: true }),
    fill('M1.6 22.4C5 17.8 9 16.6 12 16.6S19 17.8 22.4 22.4Z', { tint: true }),
    cutLine('M7 20.6Q12 18.8 17 20.6', 0.9, { fine: true }),
    line('M12 1V3.6', 1.4, { fine: true }),
  ],
  lootSense: [
    fill(chest(12, 22, 15, 10)),
    cutLine('M4.5 15.8H19.5', 1),
    cut(rect(10.8, 14.6, 2.4, 3.4, 0.6)),
    line(arc(12, 10, 4.2, 222, 318), 1.8),
    line(arc(12, 10, 7.8, 226, 314), 1.8),
  ],
  betterLoot: [
    fill(chest(9.6, 22.4, 15, 10)),
    cutLine('M2.1 16.2H17.1', 1),
    cut(rect(8.4, 15, 2.4, 3.4, 0.6)),
    cutLine('M18.4 2.4V13M14.8 6L18.4 2.4L22 6', 4.6),
    line('M18.4 2.6V12.6M15.2 5.8L18.4 2.6L21.6 5.8', 2.2, { top: true }),
    fill(sparkle(4.4, 4.8, 2.8), { fine: true }),
  ],
  fireShot: [
    // a ball trailing fire
    fill('M10.4 11.6C7.8 9.6 4.8 6.2 2.8 2.4C6.2 4.8 9.2 5.6 11.2 5.2C10.6 6.8 11 8.2 12.2 9.4C12.6 7.2 14.4 5.6 17 5.2C16 6.8 16.2 8.4 17.4 9.8Z', { tint: true }),
    cutLine(circle(15.2, 15.2, 6.6), 1.4),
    ...ball(15.2, 15.2, 5.6, { top: true }),
  ],
  fastRefill: [
    // a flask, used fast
    fill('M10.8 2.6H16.2V8.4L21 18.2C21.8 19.8 20.8 21.4 19 21.4H8C6.2 21.4 5.2 19.8 6 18.2L10.8 8.4Z', { tint: true }),
    cutLine('M10.6 4.6H16.4', 1),
    cutLine('M7.8 14.4H19.2', 1.1, { fine: true }),
    ...trail(4.6, [10, 14, 18]),
  ],
  tightTurns: [
    // the helm
    line(circle(12, 12, 6.6), 2.2),
    ...[0, 45, 90, 135].map((a) => line(path(px(12, 9.4, a), py(12, 9.4, a), px(12, -9.4, a), py(12, -9.4, a)), 1.6)),
    ...[0, 45, 90, 135, 180, 225, 270, 315].map((a) => fill(circle(px(12, 9.8, a), py(12, 9.8, a), 1.5))),
    fill(circle(12, 12, 2.4)),
    cut(circle(12, 12, 0.9), { fine: true }),
  ],
  currentRider: [0, 1, 2].flatMap((i) => {
    const y = 5.6 + i * 6.4, x = i === 1 ? 0 : -1.4;
    return [line(wave(1.6 + x + 1.4, 17 + x, y, 1.3, 1.5), 2.1), fill(poly(16 + x, y - 3, 22.4 + x, y, 16 + x, y + 3))];
  }),
};
