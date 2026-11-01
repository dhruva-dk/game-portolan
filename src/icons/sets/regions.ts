// The 16 region glyphs of src/sim/world/index.ts, each drawn from its portrait's skyline or landmark, and each
// region's own colour (its dominant colour from PLAN.md) for the chart roundel.
import type { RegionId } from '../../sim/world/index.ts';
import { circle, cut, cutLine, ellipse, fill, line, path, poly, px, py, sparkle, wave, type Prim } from '../draw.ts';

/** Each region's colour, chosen so no two read alike on the chart. */
export const REGION_COLOURS: Record<RegionId, string> = {
  iceCrown: '#6fa3c2',
  fjords: '#66737e',
  mistwood: '#2c5650',
  spires: '#2f8f8c',
  narrows: '#b5602c',
  basaltStacks: '#2b332d',
  kelpShallows: '#8a8628',
  blossomRun: '#d46a8c',
  glassSea: '#3e9fd8',
  jadeShoals: '#3fae8c',
  coralAtolls: '#ec7656',
  spiceIsles: '#4e8a1e',
  fireArchipelago: '#962818',
  weepingIsle: '#1d8456',
  mangroveLabyrinth: '#6e5a2c',
  maelstrom: '#22385e',
};

/** A wave line along the bottom: the sea under every skyline. */
const sea = (y = 21.4, w = 1.7): Prim => line(wave(1.6, 22.4, y, 0.8, 3), w);

/** A cherry petal, notched at the tip, pointing up from the centre. */
const petal = 'M12 12C8.4 9.8 8.2 4.6 10.2 2.4L12 4L13.8 2.4C15.8 4.6 15.6 9.8 12 12Z';

/** A spiral from radius r0 in to r1 over the given turns. */
const spiral = (cx: number, cy: number, r0: number, r1: number, turns: number, a0 = 0): string => {
  const p: number[] = [], n = Math.round(turns * 28);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + t * turns * 360, r = r0 + (r1 - r0) * t;
    p.push(px(cx, r, a), py(cy, r, a));
  }
  return path(...p);
};

/** A cedar: tiers of dark boughs up a straight trunk. */
const cedar = (cx: number, top: number, h: number, w: number): string => {
  const t = (k: number) => top + h * k;
  return poly(
    cx, top, cx + w * 0.22, t(0.24), cx + w * 0.12, t(0.24), cx + w * 0.36, t(0.5), cx + w * 0.2, t(0.5), cx + w * 0.5, t(0.8),
    cx - w * 0.5, t(0.8), cx - w * 0.2, t(0.5), cx - w * 0.36, t(0.5), cx - w * 0.12, t(0.24), cx - w * 0.22, t(0.24),
  );
};

/** A palm frond from the crown at x,y out along angle a. */
const frond = (x: number, y: number, a: number, len: number): string => {
  const tx = px(x, len, a), ty = py(y, len, a) + len * 0.35, mx = px(x, len * 0.55, a), my = py(y, len * 0.55, a) - 1.2;
  return `M${x} ${y}Q${mx} ${my - 1.2} ${tx} ${ty}Q${mx} ${my + 1.6} ${x} ${y}Z`;
};

export const REGION_ICONS: Record<RegionId, Prim[]> = {
  iceCrown: [
    // a crown of ice spires over the floes
    fill('M2.6 16.6L4.4 8.6L7.2 12.4L9.2 4.6L12 1.4L14.8 4.6L16.8 12.4L19.6 8.6L21.4 16.6Z'),
    cutLine('M12 2.4L11 15.4M9.4 5.6L10.6 9.6M14.6 5.6L13.4 9.6', 0.9, { fine: true }),
    fill(poly(1.2, 18.4, 10.6, 18.4, 9.4, 22, 2.6, 22)),
    fill(poly(12.6, 18.4, 22.8, 18.4, 21.6, 22, 13.4, 22)),
  ],
  fjords: [
    // valley walls, and the falls at the head of the fjord
    fill('M1.4 22V6.4L4.2 2.6L7.4 4.8C7.6 11 8.4 16.8 10.2 22Z'),
    fill('M22.6 22V5.2L19.8 2L16.6 4.2C16.4 11 15.6 16.8 13.8 22Z'),
    fill(poly(7.4, 6.4, 16.6, 6.4, 16.2, 13.4, 7.8, 13.4)),
    cut('M11 6.2H13V13.6C13.6 15 13.6 16.6 12 16.8C10.4 16.6 10.4 15 11 13.6Z'),
    line('M8.8 19.4H15.2', 1.5),
    fill(circle(9.6, 16, 0.9), { fine: true }),
    fill(circle(14.4, 16, 0.9), { fine: true }),
  ],
  mistwood: [
    // cedar crowns over the fog
    fill(cedar(7.6, 1.6, 19, 10)),
    fill(cedar(16.4, 5.2, 15.6, 9)),
    cutLine('M0 14.2H24', 2.6),
    cutLine('M0 19.2H24', 2.6),
    line('M2.4 14.2H10.6M13.4 14.2H21.6', 1.5),
    line('M5 19.2H19', 1.5),
  ],
  spires: [
    // limestone needles, the Needle tallest
    fill('M4.2 21.4L5.8 8.6L7.4 4.4L9 8.6L10.4 21.4Z'),
    fill('M9.8 21.4L11.2 5.4L12.6 1.2L14 5.4L15.2 21.4Z'),
    fill('M15.4 21.4L16.8 11.6L18.2 8.2L19.6 11.6L20.6 21.4Z'),
    cutLine('M10.4 21.6L9.6 12M15.2 21.6L15.6 13', 0.9, { fine: true }),
    fill(poly(7.4, 2.4, 8.6, 5, 6.2, 5), { fine: true }),
    fill(poly(18.2, 6.4, 19.4, 8.8, 17, 8.8), { fine: true }),
    line('M1.6 22.4H22.4', 1.4),
  ],
  narrows: [
    // two long walls and the slot between
    fill('M1.4 21.4V4.4C4 3.4 7.2 3.6 10 4.4L10.8 21.4Z'),
    fill('M22.6 21.4V3.6C20 2.8 16.8 3 14 3.8L13.2 21.4Z'),
    cutLine('M0 9.4H24', 1),
    cutLine('M0 15.2H24', 1),
    cutLine('M0 12.2H24', 0.6, { fine: true }),
    line('M10.8 21.6H13.2', 1.2, { fine: true }),
    line('M1.6 23H22.4', 1.2, { fine: true }),
  ],
  basaltStacks: [
    // the arch, built of columns
    fill('M1.6 21V8.4C1.6 5.6 3.6 3.6 6.4 3.6H17.6C20.4 3.6 22.4 5.6 22.4 8.4V21H16.4V13.6C16.4 10.8 14.4 9 12 9S7.6 10.8 7.6 13.6V21Z'),
    cutLine('M4.6 6.4V21M19.4 6.4V21', 1),
    cutLine('M10 3.4V8.8M14 3.4V8.8', 0.9, { fine: true }),
    line('M2 3.2C6 1.8 18 1.8 22 3.2', 1.4, { fine: true }),
    sea(22.4, 1.4),
  ],
  kelpShallows: [
    // kelp rising from the bed to the surface
    line(wave(1.6, 22.4, 3.6, 0.9, 3), 1.7),
    line('M6 22.6C4.4 18.4 7.6 14.4 6 7.4', 1.7),
    line('M12 22.6C10.4 17.6 13.6 13.6 12 6.2', 1.7),
    line('M18 22.6C16.4 18.4 19.6 14.8 18 8.6', 1.7),
    ...[[6, 11, -1], [6.4, 17, 1], [12.2, 9.4, 1], [11.8, 15.4, -1], [18.2, 12, -1], [17.8, 18.2, 1]].map(([x, y, s]) =>
      fill(`M${x} ${y}C${x + s * 3} ${y - 3.2} ${x + s * 5} ${y - 1} ${x + s * 4.4} ${y + 0.6}C${x + s * 3} ${y + 1.4} ${x + s * 1.2} ${y + 1} ${x} ${y}Z`)),
    fill(circle(6.2, 7, 1.1), { fine: true }),
    fill(circle(12.2, 5.8, 1.1), { fine: true }),
  ],
  blossomRun: [
    ...[0, 72, 144, 216, 288].map((a) => fill(petal, { tr: `rotate(${a} 12 12.4)` })),
    cut(circle(12, 12.4, 2.6)),
    fill(circle(12, 12.4, 1.2), { top: true }),
    ...[0, 72, 144, 216, 288].map((a) => cutLine(path(px(12, 3, a + 36 - 90), py(12.4, 3, a + 36 - 90), px(12, 5.2, a + 36 - 90), py(12.4, 5.2, a + 36 - 90)), 0.8, { fine: true })),
  ],
  glassSea: [
    // a whale's tail over a mirror, and its reflection
    fill('M10.8 13C10.8 11 10.6 9.6 9.8 8.6C8.4 7 5.2 7.4 2.6 3.4C2.6 7 5.4 9.4 8.6 9.6C9.4 10.2 9.8 11.4 9.6 13ZM13.2 13C13.2 11 13.4 9.6 14.2 8.6C15.6 7 18.8 7.4 21.4 3.4C21.4 7 18.6 9.4 15.4 9.6C14.6 10.2 14.2 11.4 14.4 13Z'),
    fill('M9.4 13C10 10.8 11 9.2 12 7.8C13 9.2 14 10.8 14.6 13Z'),
    line('M1.4 14.6H22.6', 1.6),
    fill('M9.4 16.2C10 18.4 11 20 12 21.4C13 20 14 18.4 14.6 16.2Z', { op: 0.4 }),
    fill('M2.6 22C5.2 19.2 8 19.4 9.6 18', { op: 0.4, fine: true }),
    fill('M21.4 22C18.8 19.2 16 19.4 14.4 18', { op: 0.4, fine: true }),
  ],
  jadeShoals: [
    // dunes, with the beacon on the tallest
    fill('M1.4 20.6C3.6 15.6 7.6 12.2 11.4 12.2C14.6 12.2 16 14.8 18.4 15.8C20 16.4 21.4 16.6 22.6 16.6V20.6Z'),
    cutLine('M11.4 12.4C12.4 14.6 12 17.4 9.4 20.6', 1, { fine: true }),
    fill(sparkle(11.4, 5.6, 4.4, 0.2)),
    line('M11.4 0.6V1.2M5.2 5.6H6M16.8 5.6H17.6', 1.2, { fine: true }),
    line('M2.6 22.8H9.4M12.6 22.8H21.4', 1.4),
  ],
  coralAtolls: [
    // an atoll ring with a palm
    line(ellipse(12, 17.6, 9.8, 4.2), 2.4),
    cutLine('M21.6 14L24 12M2.4 21L0 23', 2.4),
    cutLine('M10.6 16.8L10.4 24', 3),
    line('M10.6 17.2C11 13.4 10.6 10.4 9.2 7.4', 1.7, { top: true }),
    ...[-160, -110, -60, -15, 25].map((a) => fill(frond(9.2, 7.4, a, 6.4), { top: true })),
  ],
  spiceIsles: [
    // the pearl bloom: an open clam
    fill('M2.4 13H21.6C21.6 18.4 17.4 21.8 12 21.8S2.4 18.4 2.4 13Z'),
    fill('M3.4 10.6C4.2 5.2 7.8 2.2 12 2.2S19.8 5.2 20.6 10.6Z'),
    ...[-150, -120, -90, -60, -30].map((a) => cutLine(path(12, 10.6, px(12, 8.2, a), py(10.6, 8.2, a)), 0.9)),
    cutLine('M2 10.8H22', 1),
    cutLine(circle(12, 13.4, 3.8), 1.3),
    fill(circle(12, 13.4, 3), { top: true }),
    cut(circle(11, 12.4, 0.8), { fine: true }),
    cutLine('M5 16.4Q12 18.6 19 16.4', 0.9, { fine: true }),
  ],
  fireArchipelago: [
    // the cone, its plume, and lava running down
    fill('M1.4 22L8.6 10.4H15.4L22.6 22Z'),
    cutLine('M11.2 10.6L9.8 15L11 18.6L10 22', 1.2),
    cutLine('M14.2 10.6L15.4 15.4', 1, { fine: true }),
    cutLine('M7.6 8.6H16.6', 1.6),
    fill(circle(9.2, 5.6, 2.8)),
    fill(circle(13.6, 4.2, 3.4)),
    fill(circle(17.6, 6.2, 2.4)),
    fill(circle(11.6, 7.4, 2)),
  ],
  weepingIsle: [
    // one great dome, weeping falls
    fill('M1.4 21.4C1.4 12.6 5.8 7.2 12 7.2S22.6 12.6 22.6 21.4Z'),
    ...[5.4, 9, 12, 15, 18.6].map((x, i) => cutLine(`M${x} ${i === 0 || i === 4 ? 14 : 10.4}V21.6`, 1)),
    cutLine('M3 7.8C5 4.6 9 4.6 10 5.2C11.4 2 17.4 2.2 18 5.4C20.4 5 22 6.6 21.6 8.6', 1.6),
    fill('M3.6 7C5.2 4.6 8.4 4.4 9.8 5C11.2 2.4 16.8 2.4 17.6 4.8C19.8 4.4 21.4 5.8 21 7.6Z', { top: true }),
    sea(23, 1.2),
  ],
  mangroveLabyrinth: [
    // a canopy on arching roots
    fill(circle(6.6, 7.6, 4.2)),
    fill(circle(12, 5.6, 4.8)),
    fill(circle(17.4, 7.6, 4.2)),
    fill(ellipse(12, 9.4, 9.4, 3)),
    line('M12 10V14', 2),
    line('M12 13C9.6 14 6 16 3.6 21.6', 1.6),
    line('M12 13C10.8 15.4 9.6 18 9 21.6', 1.6),
    line('M12 13C14.4 14 18 16 20.4 21.6', 1.6),
    line('M12 13C13.2 15.4 14.4 18 15 21.6', 1.6),
    line('M1.6 21.8H22.4', 1.4),
  ],
  maelstrom: [
    // the spiral, and the Eye standing in it
    line(spiral(12, 13, 10.4, 3.2, 1.75, 180), 2.1),
    cutLine('M12 4V14', 4),
    fill('M10.6 14.6L11.6 6.6L12.4 4.4L13.2 6.6L13.8 14.6Z', { top: true }),
  ],
};
