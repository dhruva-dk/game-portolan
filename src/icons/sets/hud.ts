// HUD glyphs (read at a glance in a fight), menu glyphs, and the gull's delivery tiers.
import {
  all, arcArrow, chest, circle, cut, cutLine, fill, flame, gear, gull, line, poly, rect, shield, ship, sparkle, wave,
  type Prim,
} from '../draw.ts';

export type HudId = 'gust' | 'storm' | 'shipsLeft' | 'kills' | 'coins' | 'map' | 'shield' | 'hull' | 'reload' | 'lantern' | 'gull';
export type MenuId = 'play' | 'back' | 'settings' | 'locker' | 'abilities' | 'rivals' | 'chart' | 'rank' | 'close' | 'lock' | 'check';
export type GullTierId = 'supplies' | 'armament' | 'treasure';

/** The hull in profile, bow to the right, used by the hull glyph and the repair ability. */
export const HULL = 'M1.6 7.6L22.4 6.2C21.6 9.6 20.4 13.4 18 16.4C16.9 17.8 15.4 18.6 13.6 18.6H6.2C4.6 18.6 3.5 17.7 3.1 16.3Z';

/** The storm's swirl: an eye with two hooked arms. */
const stormArm = 'M12 7.2C11.6 3.6 14.6 1.2 19.6 1.6C16.4 2.8 15.2 4.8 15.6 8.4Z';

export const HUD_ICONS: Record<HudId, Prim[]> = {
  gust: [
    line('M2.6 8.4H13.4A3 3 0 1 0 10.4 5.4', 2.5),
    line('M1.8 13H17.6A3 3 0 1 1 14.6 16', 2.5),
    line('M4.6 17.8H10', 2.5),
  ],
  storm: [
    fill(circle(12, 12, 5.4) + circle(12, 12, 2.2, true), { tint: true }),
    fill(stormArm, { tint: true }),
    fill(stormArm, { tint: true, tr: 'rotate(180 12 12)' }),
    fill(stormArm, { tint: true, tr: 'rotate(90 12 12)', fine: true, op: 0.45 }),
    fill(stormArm, { tint: true, tr: 'rotate(270 12 12)', fine: true, op: 0.45 }),
  ],
  shipsLeft: ship(12, 21.6),
  kills: [
    // a ship going down by the bow
    ...all(ship(12, 18.4, 0.9), { tr: 'rotate(34 12 13)' }),
    cut('M0 17.6C3 16.4 5 16.4 7.6 17.6S12.6 18.8 15.4 17.6S20.6 16.4 24 17.6V24H0Z'),
    line(wave(1.6, 22.4, 20.6, 0.9, 3), 1.8),
    fill(circle(19.6, 6.4, 1.2), { fine: true }),
    fill(circle(21.4, 3.4, 0.8), { fine: true }),
  ],
  coins: [
    // a stack and one standing coin
    fill('M1.8 15A6.4 2.5 0 0 1 14.6 15V19.4A6.4 2.5 0 0 1 1.8 19.4Z', { tint: true }),
    cutLine('M1.8 15A6.4 2.5 0 0 0 14.6 15', 1),
    cutLine('M1.8 17.3A6.4 2.5 0 0 0 14.6 17.3', 0.8, { fine: true }),
    cutLine(circle(15, 10, 8.4), 1.6),
    fill(circle(15, 10, 7.4) + circle(15, 10, 5.4, true), { tint: true, top: true }),
    fill(sparkle(15, 10, 3.9, 0.2), { tint: true, top: true }),
  ],
  map: [
    fill(poly(1.8, 5.4, 8.4, 2.8, 15.6, 5.4, 22.2, 2.8, 22.2, 18.6, 15.6, 21.2, 8.4, 18.6, 1.8, 21.2)),
    cutLine('M8.4 2.6V18.8', 1.1),
    cutLine('M15.6 5.2V21.4', 1.1),
    cutLine('M4.6 16.4C7 13.4 9.4 15.6 12 12.4S16.4 9.6 17.6 9', 1.2, { dash: '1.6 1.6', fine: true }),
    cutLine('M17.4 6.4L20 9M20 6.4L17.4 9', 1.2, { fine: true }),
  ],
  shield: [
    fill(shield(12, 12.2, 17.6, 20.4), { tint: true }),
    cutLine(shield(12, 12.1, 12.6, 15.2), 1.2),
    fill(shield(12, 12.1, 9.6, 12.2), { fine: true, op: 0.45, tint: true }),
  ],
  hull: [
    fill(HULL, { tint: true }),
    cutLine('M3 11L21.2 9.8', 1.1),
    cutLine('M4.4 14.6L19 13.6', 1.1),
    line('M1.6 4.6L22.4 3.2', 1.6, { fine: true }),
    line('M5 4.4V7M10 4.1V6.7M15 3.7V6.3M20 3.4V6', 1.3, { fine: true }),
  ],
  reload: arcArrow(12, 12, 8, 20, 300, 2.8),
  lantern: [
    line(circle(12, 3.2, 1.8), 1.4),
    fill('M7 7.8L8.8 5.2H15.2L17 7.8Z'),
    fill(rect(7.2, 7.6, 9.6, 10.6, 1.6), { tint: true }),
    fill(rect(6.2, 18, 11.6, 3, 1.1)),
    cut(flame(12, 17, 6.6, 8.6)),
    fill(flame(12, 16.6, 3, 4.4), { top: true, tint: true }),
    line('M3.2 9.4L1.6 8.6M3.2 14H1.4M20.8 9.4L22.4 8.6M20.8 14H22.6', 1.3, { fine: true }),
  ],
  gull: [fill(gull(12, 12.4))],
};

export const MENU_ICONS: Record<MenuId, Prim[]> = {
  play: [fill('M7 4C7 2.9 8.1 2.3 9 2.9L20.4 10.4C21.3 11 21.3 12.4 20.4 13L9 20.6C8.1 21.2 7 20.6 7 19.5Z')],
  back: [line('M10.6 4.6L3.4 12L10.6 19.4', 3), line('M4.4 12H20.6', 3)],
  settings: [fill(gear(12, 12, 8, 10.4, 7.6, 3.2))],
  locker: [
    // a sail on its yard: what you dress your ship in
    line('M2.4 3.6H21.6', 2.2),
    fill('M4.4 4.8H19.6C20.8 9.6 20.8 15 18.8 19.8H5.2C3.2 15 3.2 9.6 4.4 4.8Z'),
    cutLine('M3.4 11.2Q12 13.2 20.6 11.2', 2.2),
    line('M5.6 19.6L3.4 22.2M18.4 19.6L20.6 22.2', 1.4),
    line('M12 1V3.6', 1.6),
  ],
  abilities: [fill(sparkle(10.4, 13.2, 9.2, 0.16)), fill(sparkle(19.2, 4.8, 3.8, 0.2)), fill(circle(20, 13.4, 1.3), { fine: true })],
  rivals: [
    // two pennants crossed
    line('M4.6 21.6L17.4 2.8', 2),
    line('M19.4 21.6L6.6 2.8', 2),
    fill('M17.2 3.2L23 5.6L19.4 7L21.8 9.8L14.6 7Z'),
    fill('M6.8 3.2L1 5.6L4.6 7L2.2 9.8L9.4 7Z'),
  ],
  chart: [
    // the wind rose
    fill(sparkle(12, 12, 10.6, 0.2)),
    fill(sparkle(12, 12, 7.2, 0.24), { tr: 'rotate(45 12 12)' }),
    cut(circle(12, 12, 2.4)),
    fill(circle(12, 12, 1), { fine: true }),
    cut('M12 1.4L13.7 10.3L12 12Z', { fine: true }),
    cut('M22.6 12L13.7 13.7L12 12Z', { fine: true }),
    cut('M12 22.6L10.3 13.7L12 12Z', { fine: true }),
    cut('M1.4 12L10.3 10.3L12 12Z', { fine: true }),
  ],
  rank: [
    fill(shield(12, 12.2, 17, 20)),
    cutLine('M6.6 9.6L12 13.2L17.4 9.6', 2),
    cutLine('M6.6 14.4L12 18L17.4 14.4', 2),
    cut(sparkle(12, 5.6, 2.4, 0.3), { fine: true }),
  ],
  close: [line('M5 5L19 19M19 5L5 19', 3.2)],
  lock: [
    line('M7.8 10.8V7.6C7.8 5.1 9.6 3.2 12 3.2S16.2 5.1 16.2 7.6V10.8', 2.6),
    fill(rect(4.4, 10.2, 15.2, 11.6, 2.4)),
    cut(circle(12, 14.8, 1.8)),
    cut(rect(11.1, 15.2, 1.8, 3.8, 0.6)),
  ],
  check: [line('M4 12.8L9.4 18.2L20 6', 3.4)],
};

/** The gull with what it carries, bigger and richer at each tier. */
const carrier = (cargo: Prim[]): Prim[] => [
  fill(gull(12, 6.2, 0.98)),
  line('M12 10.4V12.6', 1.2),
  ...cargo,
];

export const GULL_TIER_ICONS: Record<GullTierId, Prim[]> = {
  supplies: carrier([
    // a tied sack
    fill('M12 12.4C10.8 12.4 10.4 13.2 10.6 14.2C7.6 15.4 6.8 18.4 7.4 20.4C7.9 22 9.4 22.6 12 22.6S16.1 22 16.6 20.4C17.2 18.4 16.4 15.4 13.4 14.2C13.6 13.2 13.2 12.4 12 12.4Z', { tint: true }),
    cutLine('M10.2 14.6H13.8', 1),
  ]),
  armament: carrier([
    // a crate
    fill(rect(6.2, 12.6, 11.6, 10, 1.2), { tint: true }),
    cutLine(rect(8.2, 14.6, 7.6, 6, 0.4), 1),
    cutLine('M8.4 20.4L15.6 14.8', 1),
  ]),
  treasure: carrier([
    // a chest, glinting
    fill(chest(12, 22.8, 15, 10.4), { tint: true }),
    cutLine('M4.5 16.6H19.5', 1),
    cut(rect(10.8, 15.4, 2.4, 3.4, 0.6)),
    fill(sparkle(2.8, 13.6, 2.6)),
    fill(sparkle(21.4, 12.6, 2.2)),
    fill(sparkle(21.6, 19, 1.4), { fine: true }),
  ]),
};
