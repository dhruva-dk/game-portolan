// The figureheads as woodcuts for the locker's cards (issue #54): one drawing for each of the ship's seven figurehead
// models, so a card shows the shape she will carry. Natural forms and spirits: never people, never faces.
import { circle, cut, cutLine, fill, line, px, py, path, star, type Prim } from '../draw.ts';

/** A spiral wound in from radius r0 to r1, as a path. */
const spiral = (cx: number, cy: number, r0: number, r1: number, turns: number): string => {
  const p: number[] = [], n = Math.ceil(turns * 24);
  for (let i = 0; i <= n; i++) {
    const u = i / n, r = r0 + (r1 - r0) * u, a = u * turns * 360 - 90;
    p.push(px(cx, r, a), py(cy, r, a));
  }
  return path(...p);
};

export const HEAD_ICONS: Record<string, Prim[]> = {
  plainStem: [
    line('M5 22.6C5 13 10.4 6 19 3.2', 3.4),
    fill(circle(19.4, 3, 1.7)),
  ],
  heron: [
    fill('M2.6 17.4C2.8 13.6 6.4 11.4 10.8 11.6C12.2 9.4 13.6 7 15.4 5.6C16.8 4.4 19.2 4.6 19.8 6L23.6 6.8L19.6 7.6C18.4 7.8 17.2 8.8 16.4 10C15.2 11.8 15.2 14.4 12.8 16.4C10.2 18.6 4.6 19.4 2.6 17.4Z'),
    cut(circle(18, 6, 0.8), { fine: true }),
    line('M7.4 18.4L6.4 23M10.6 18L10 23', 1.4),
  ],
  narwhalTusk: [
    fill('M2.6 20.2L6.8 23.2L23 1.4Z'),
    cutLine('M8 19.4L5 17.6M11 15.8L8 14M13.8 12.4L11.2 10.8M16.4 9L14.2 7.6M18.8 5.8L17 4.6', 1.1),
  ],
  ammonite: [
    fill(circle(12, 12, 10.6)),
    cutLine(spiral(12, 12, 9.2, 1.4, 2.6), 1.5),
    cut(circle(12, 12, 1.1), { fine: true }),
  ],
  coralAntler: [
    line('M12 23.4V13.6M12 18L5.4 10.8M12 15.2L18.6 8.4M12 13.6L11.2 3', 2.4),
    line('M8.4 14.4L4.2 5.4M9 15L12 7.8M15.8 11.2L20.8 2.8M16.6 10.2L21.6 11.4', 1.7),
    fill(circle(4.2, 5.2, 1.1) + circle(11.2, 2.8, 1.1) + circle(20.8, 2.6, 1.1) + circle(21.8, 11.4, 1) + circle(5.2, 10.6, 1), { fine: true }),
  ],
  sunburst: [
    fill(star(12, 12, 12, 11.4, 6.4)),
    cut(circle(12, 12, 3.6)),
    fill(circle(12, 12, 1.5), { fine: true }),
  ],
  greatWhale: [
    fill('M1.4 13.6C3.4 7.8 11.6 5.8 17.4 9.2C18.8 10 19.8 11 20.6 11.8L23.2 9C23.6 11.2 23.4 13 22.6 14.2C23.6 15 24 15.8 24.2 16.4C21.4 16.6 20.2 15.8 19.4 14.8C16 19.4 6.2 19.8 1.4 13.6Z'),
    cut(circle(6.2, 12.2, 1), { fine: true }),
    cutLine('M3 15.4C7 17.4 12 17.4 15.8 15.8M3.8 16.8C6 18 9 18.2 11 17.8', 1.1),
    fill('M11.6 5.8C11 4.4 9.2 3.6 7.4 4C9 4.2 10.2 4.8 10.4 6.4Z', { fine: true }),
  ],
};
