// The abilities of src/sim/abilities.ts: nine actives and nine passives (the last of each found as a secret).
import type { AbilityId } from '../../sim/abilities.ts';
import {
  all, arc, arcArrow, ball, circle, cut, cutLine, fill, line, path, plus, poly, px, py, rect, shield, ship, star, wave,
  wedge, type Prim,
} from '../draw.ts';
import { HULL } from './hud.ts';

/** A spiked sea mine. */
const mine = (cx: number, cy: number, r: number): Prim[] => {
  const p: Prim[] = [fill(circle(cx, cy, r))];
  for (const a of [-90, -30, 30, 150, 210]) {
    p.push(line(path(px(cx, r - 1, a), py(cy, r - 1, a), px(cx, r + 2.6, a), py(cy, r + 2.6, a)), 1.8));
    p.push(fill(circle(px(cx, r + 2.8, a), py(cy, r + 2.8, a), 1.25)));
  }
  return p;
};

export const ABILITY_ICONS: Record<AbilityId, Prim[]> = {
  // ---------------------------------------------------------------- actives
  repair: [
    // the hull, with a cross rising over it
    ...all([fill(HULL), cutLine('M3 11L21.2 9.8', 1.1)], { tr: 'translate(0 4.2)' }),
    cutLine('M1 10.6H23', 1.6),
    fill(plus(12, 6.2, 5, 3.2)),
  ],
  smokeScreen: [
    fill(circle(7.6, 13.4, 4.6)),
    fill(circle(13.2, 9.8, 5.6)),
    fill(circle(18, 14.2, 4.2)),
    fill(rect(3.2, 13.4, 18.8, 4.8, 2.4)),
    cutLine(arc(13.2, 9.8, 5.6, 115, 175), 1.1, { fine: true }),
    cutLine(arc(18, 14.2, 4.2, 160, 220), 1.1, { fine: true }),
    fill(circle(3.6, 6.8, 1.7)),
    fill(circle(20.6, 5.6, 1.4)),
    line(wave(2, 22, 21.6, 0.9, 3), 1.8),
  ],
  ram: [
    // a bow driving into a burst
    fill('M1.6 8H12.6C14.4 8 15.2 9 16.2 10.4L18.2 13.2L15.4 15.8C14.4 16.8 13.4 17.6 11.8 17.6H4.6C3 17.6 2 16.4 1.8 14.8Z'),
    cutLine('M2 12.6H15.8', 1.1, { fine: true }),
    cutLine(circle(19.6, 13.2, 5.2), 1.4),
    fill(star(19.6, 13.2, 8, 4.4, 1.9, -90), { top: true }),
    line('M2.6 4.6H8.6', 1.6),
    line('M1.2 21H7', 1.6),
  ],
  reveal: [
    // a sweep that finds ships
    line(circle(12, 12, 9.6), 1.8),
    line(circle(12, 12, 5.4), 1.3, { fine: true }),
    fill(wedge(12, 12, 9.6, -90, -30)),
    fill(circle(12, 12, 1.9)),
    cut(circle(16.4, 7.2, 1.5)),
    fill(circle(6.6, 15.6, 1.6)),
    fill(circle(15.8, 17.4, 1.3)),
  ],
  hardTurn: [
    line('M6.2 21V10.4A5.8 5.8 0 0 1 17.8 10.4V13.6', 2.8),
    fill(poly(13.2, 12.6, 22.4, 12.6, 17.8, 19.8)),
    line('M1.6 17.4H3.4M1.6 13.4H3.4', 1.6, { fine: true }),
  ],
  decoy: [
    // a ghost ship sailing on beside the real one
    ...ship(8.6, 16.4, 0.62).map((p): Prim => ({ ...p, k: 's', w: 1.1, dash: '1.4 1.2' })),
    ...ship(15.4, 22.4, 0.72),
  ],
  wave: [
    fill('M1.6 21.4C1.6 13.4 6.4 5 14.2 3.8C18.8 3.2 22.2 5.8 22 9.6C21.8 12.8 18.6 14.2 16.4 12.6C14.8 11.4 15.6 9 17.4 9.4C16.6 7.4 12.4 7.4 10 10.8C7.6 14.2 8.6 18.4 11.6 21.4Z'),
    cutLine('M4.4 18.6C4.6 13.6 7.6 8.4 12.4 6.6', 1.1, { fine: true }),
    line('M12.6 21.4H22.4', 2),
    fill(circle(20.2, 17.4, 1.2), { fine: true }),
    fill(circle(17.6, 16.6, 0.9), { fine: true }),
  ],
  driftMine: [
    ...mine(12, 10.4, 5.2),
    cut('M0 16.6C3 15.4 5 15.4 7.6 16.6S12.6 17.8 15.4 16.6S20.6 15.4 24 16.6V24H0Z'),
    line(wave(1.6, 22.4, 19.2, 0.9, 3), 1.8),
    cut(circle(10, 8.4, 1.3), { fine: true }),
  ],
  whaleCall: [
    // the whale's flukes thrown up out of the sea, and the rings of the call spreading under them
    fill('M10.8 12.6C10.8 10.2 10.6 8.8 9.6 7.6C8 5.8 4.6 6.2 1.8 1.8C1.8 5.8 4.8 8.6 8.4 8.8C9.2 9.4 9.6 10.8 9.4 12.6ZM13.2 12.6C13.2 10.2 13.4 8.8 14.4 7.6C16 5.8 19.4 6.2 22.2 1.8C22.2 5.8 19.2 8.6 15.6 8.8C14.8 9.4 14.4 10.8 14.6 12.6Z'),
    fill('M9.2 12.8C9.8 10.4 10.8 8.6 12 7.2C13.2 8.6 14.2 10.4 14.8 12.8Z'),
    line('M1.4 14.6C4.6 13.4 7.4 13.4 12 14.6S19.4 15.8 22.6 14.6', 1.8),
    line('M4.6 18.4C8 17.6 16 17.6 19.4 18.4', 1.4),
    line('M8 21.8C10.4 21.4 13.6 21.4 16 21.8', 1.2, { fine: true }),
  ],
  // ---------------------------------------------------------------- passives
  salvage: [
    // a shield raised from wreckage
    fill(shield(12, 9.2, 13, 15)),
    cut(poly(12, 3.6, 16.2, 8.6, 13.6, 8.6, 13.6, 13.4, 10.4, 13.4, 10.4, 8.6, 7.8, 8.6)),
    fill(poly(1.6, 18.6, 10.2, 17, 9.6, 18.6, 10.6, 19.6, 10.2, 21, 2.2, 22.6)),
    fill(poly(13.8, 17.6, 22.4, 18.4, 22, 22.4, 13.4, 21.4, 14.4, 20.2, 13.2, 19.2)),
  ],
  quickReload: [
    ...arcArrow(12, 12, 8.6, 20, 300, 2.4),
    ...ball(12, 12, 4.2),
  ],
  quickHands: [
    // the hourglass runs fast
    line('M5.6 2.6H18.4M5.6 21.4H18.4', 2.2),
    line('M7.4 3.4C7.4 8.4 10.6 10 10.6 12S7.4 15.6 7.4 20.6M16.6 3.4C16.6 8.4 13.4 10 13.4 12S16.6 15.6 16.6 20.6', 1.6),
    fill('M8.6 6.4H15.4C14.6 8.4 12.8 9.4 12 10.4C11.2 9.4 9.4 8.4 8.6 6.4Z'),
    fill('M12 15.4L15.6 20.6H8.4Z'),
    line('M12 11V15.6', 1, { fine: true }),
    line('M0.8 8.4H3.2M0.6 12H2.6M0.8 15.6H3.2', 1.5),
  ],
  lightHull: [
    // a feather
    fill('M20.4 2C12.4 3 6.6 9.2 5.8 17.4L7.6 18.4C14.8 15.8 20 10.4 20.4 2Z'),
    cutLine('M18.8 4.2C14.4 8.4 10.4 12.8 6.8 17.8', 1.1),
    cutLine('M14.6 5.4L13.4 8.4M10.6 9.2L9.8 12M17.6 9.4L14.6 10.4M14.4 13.4L11.6 14.4', 0.9, { fine: true }),
    line('M7.2 17.4L3.2 21.6', 2),
  ],
  windReader: [
    // a sail held close to the wind
    line('M7.2 2.6V19', 1.8),
    fill('M8.4 3.4C13.4 6 14.8 12 13.6 17.4H8.4Z'),
    fill('M2.6 18.4H16.6L15 21.6H4.6Z'),
    line('M22.4 5.6H17.6', 1.8),
    line('M22.4 10H16.2', 1.8),
    line('M22.4 14.4H17.6', 1.8),
    fill(poly(16.6, 3.6, 16.6, 7.6, 14.4, 5.6), { fine: true }),
  ],
  stormWalker: [
    fill(shield(12, 12.2, 17.6, 20.4)),
    cut('M13.4 3.6L7 13.2H11.4L9.8 20.4L17 10.4H12.6L14.6 3.6Z'),
  ],
  deepHold: [
    // a barrel, and one more
    fill('M4.6 4.4H14.2C16.2 8 16.2 16.4 14.2 20H4.6C2.6 16.4 2.6 8 4.6 4.4Z'),
    cutLine('M2.8 8.8H16', 1.1),
    cutLine('M2.8 15.6H16', 1.1),
    cutLine(circle(18.2, 6.4, 5.4), 1.6),
    fill(circle(18.2, 6.4, 4.6) + plus(18.2, 6.4, 2.8, 1.8), { top: true, evenodd: true }),
  ],
  steadyAim: [
    line(circle(12, 12, 7), 2),
    line('M12 1.4V6.4M12 17.6V22.6M1.4 12H6.4M17.6 12H22.6', 2.2),
    fill(circle(12, 12, 2)),
    line(arc(12, 12, 10.2, 200, 250), 1.3, { fine: true }),
    line(arc(12, 12, 10.2, 20, 70), 1.3, { fine: true }),
  ],
  darkLantern: [
    // a lantern with its shutter drawn, under a crescent moon
    line(circle(10.4, 4.4, 1.7), 1.4),
    fill('M5.6 8.8L7.4 6.2H13.4L15.2 8.8Z'),
    fill(rect(5.8, 8.6, 9.2, 10.6, 1.6)),
    fill(rect(4.8, 19, 11.2, 3, 1.1)),
    cutLine('M8.2 11.2V16.8M10.4 11.2V16.8M12.6 11.2V16.8', 1.1),
    fill('M20.4 2.2A5 5 0 1 0 22.6 10.6A4 4 0 1 1 20.4 2.2Z'),
  ],
};
