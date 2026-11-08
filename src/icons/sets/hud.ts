// HUD glyphs (read at a glance in a fight), menu glyphs, and the gull's delivery tiers.
import {
  all, arcArrow, chest, circle, cut, cutLine, fill, flame, gear, gull, line, path, poly, px, py, rect, ring, shield, ship, sparkle, star, wave,
  type Prim,
} from '../draw.ts';

export type HudId = 'gust' | 'storm' | 'spiral' | 'shipsLeft' | 'kills' | 'damage' | 'afloat' | 'coins' | 'map' | 'shield' | 'hull' | 'reload' | 'sail' | 'lantern' | 'gull';
export type MenuId = 'play' | 'back' | 'settings' | 'locker' | 'abilities' | 'rivals' | 'chart' | 'rank' | 'close' | 'lock' | 'check'
  | 'wheel' | 'chest' | 'burst' | 'pennants' | 'ships' | 'speaker' | 'arrows';
export type GullTierId = 'supplies' | 'armament' | 'treasure';

/** The hull in profile, bow to the right, used by the hull glyph and the repair ability. */
export const HULL = 'M1.6 7.6L22.4 6.2C21.6 9.6 20.4 13.4 18 16.4C16.9 17.8 15.4 18.6 13.6 18.6H6.2C4.6 18.6 3.5 17.7 3.1 16.3Z';

/** The storm's swirl: an eye with two hooked arms. */
const stormArm = 'M12 7.2C11.6 3.6 14.6 1.2 19.6 1.6C16.4 2.8 15.2 4.8 15.6 8.4Z';

/** A spiral winding in from radius r0 to r1 over `turns`, as a polyline. */
const spiral = (cx: number, cy: number, r0: number, r1: number, turns: number, a0 = -90): string => {
  const p: number[] = [], n = Math.ceil(turns * 24);
  for (let i = 0; i <= n; i++) {
    const u = i / n, r = r0 + (r1 - r0) * u, a = a0 + u * turns * 360;
    p.push(px(cx, r, a), py(cy, r, a));
  }
  return path(...p);
};

/** The Storm's spiral wound `turns` times: tighter, the more turns. The clock winds it in as the circle closes. */
export const stormSpiral = (turns: number): Prim[] => [line(spiral(12, 12, 10.6, 1.6, turns), 2), fill(circle(12, 12, 1.3))];

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
  /** The Storm closing: a line winding in to the eye, for the clock. */
  spiral: stormSpiral(2.5),
  shipsLeft: ship(12, 21.6),
  kills: [
    // a ship going down by the bow
    ...all(ship(12, 18.4, 0.9), { tr: 'rotate(34 12 13)' }),
    cut('M0 17.6C3 16.4 5 16.4 7.6 17.6S12.6 18.8 15.4 17.6S20.6 16.4 24 17.6V24H0Z'),
    line(wave(1.6, 22.4, 20.6, 0.9, 3), 1.8),
    fill(circle(19.6, 6.4, 1.2), { fine: true }),
    fill(circle(21.4, 3.4, 0.8), { fine: true }),
  ],
  damage: [
    // a round shot breaking a plank, splinters flying from the breach
    fill('M1.6 15.4L9 14L11 16.6L13.6 14.2L22.4 15V21.4H1.6Z'),
    cutLine('M4 18.4H20', 0.9, { fine: true }),
    cutLine('M11.4 16.4L10.8 21.4', 1.1),
    fill(circle(12.2, 7.6, 4.2)),
    line('M7.6 12.4L4.4 8.6', 1.5),
    line('M16.4 12.2L19.8 8.8', 1.5),
    line('M12.4 12.8V9.4', 1.2, { fine: true }),
  ],
  afloat: [
    // a ship upright on her waves, under way
    ...ship(12, 16.8, 0.92),
    line(wave(1.2, 22.8, 20.4, 0.9, 3), 1.8),
    line(wave(3.4, 20.6, 22.9, 0.7, 2), 1.2, { fine: true }),
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
  /** A square sail bellied on its yard, for the sails' instrument. */
  sail: [
    line('M2.6 4.6H21.4', 2),
    line('M12 1.2V4.6M12 19V22.8', 1.8),
    fill('M4.4 5.8H19.6C21.2 10 21.2 14.6 19.6 18.8H4.4C2.8 14.6 2.8 10 4.4 5.8Z'),
    cutLine('M3.8 10Q12 11.8 20.2 10', 1.1),
    cutLine('M3.8 14.4Q12 16.2 20.2 14.4', 1.1, { fine: true }),
  ],
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
  // the lobby's woodcuts (issue #54): each stands only for its own meaning
  /** A ship's wheel: the rim, its hub, eight spokes run out through the rim to their handles. Settings. */
  wheel: [
    fill(ring(12, 12, 8.2, 6.2)),
    fill(circle(12, 12, 2.6)),
    line(Array.from({ length: 8 }, (_, k) => `M${px(12, 2.6, k * 45)} ${py(12, 2.6, k * 45)}L${px(12, 11.2, k * 45)} ${py(12, 11.2, k * 45)}`).join(''), 2),
    fill(Array.from({ length: 8 }, (_, k) => circle(px(12, 11, k * 45), py(12, 11, k * 45), 1.3)).join(''), { fine: true }),
  ],
  /** A sea chest, its lid shut and its lock on the front. The locker. */
  chest: [
    fill(chest(12, 21.6, 18, 13.6), { tint: true }),
    cutLine('M3 13.2H21', 1.1),
    cut(rect(10.6, 14.2, 2.8, 3.8, 0.7)),
    cutLine('M6.2 13.2V21M17.8 13.2V21', 1, { fine: true }),
  ],
  /** A burst of rays from a point. The abilities. */
  burst: [
    fill(star(12, 12, 8, 11.2, 4.6)),
    cut(circle(12, 12, 1.8)),
  ],
  /** A staff flying three pennants, the longest uppermost. The rank. */
  pennants: [
    line('M4.4 2.2V22.6', 2.2),
    fill(circle(4.4, 1.9, 1.5)),
    fill(poly(5.6, 3.4, 21.6, 5.6, 5.6, 7.8)),
    fill(poly(5.6, 9.2, 18.4, 11.4, 5.6, 13.6)),
    fill(poly(5.6, 15, 15.4, 17.2, 5.6, 19.4)),
  ],
  /** Two ships bow to bow. The rivals. */
  ships: [
    ...ship(6.4, 22.4, 0.56),
    ...all(ship(6.4, 22.4, 0.56), { tr: 'matrix(-1 0 0 1 24 0)' }),
  ],
  /** A speaker's cone and two waves leaving it. A sound's volume. */
  speaker: [
    fill('M2.6 9.4H7.2L13.2 4.2V19.8L7.2 14.6H2.6Z'),
    line('M16 8.4C17.8 10.4 17.8 13.6 16 15.6', 1.9),
    line('M18.8 5.8C22 9.4 22 14.6 18.8 18.2', 1.9),
  ],
  /** An arrow up and an arrow down, side by side. Invert the look. */
  arrows: [
    line('M8 20.6V6', 2.5),
    fill(poly(8, 2, 12.8, 9.4, 3.2, 9.4)),
    line('M16 3.4V18', 2.5),
    fill(poly(16, 22, 11.2, 14.6, 20.8, 14.6)),
  ],
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
