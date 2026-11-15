// A crew's emblem as the office draws it: the twelve marks its flags fly (campus/flags.ts MARKS, there as distance
// fields), here as SVG paths in a box `s` across, centred. Its order is the flags': emblem i is the same mark.

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A polygon through `pts` (units of the box, y up), placed and scaled. */
const poly = (pts: readonly (readonly [number, number])[], cx: number, cy: number, s: number) =>
  `M${pts.map(([x, y]) => `${r2(cx + x * s)} ${r2(cy - y * s)}`).join('L')}Z`;
const circle = (cx: number, cy: number, r: number) => `M${r2(cx - r)} ${r2(cy)}a${r2(r)} ${r2(r)} 0 1 0 ${r2(2 * r)} 0a${r2(r)} ${r2(r)} 0 1 0 ${r2(-2 * r)} 0Z`;
const lobes = (n: number, r: (a: number) => number) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2;
  return [Math.cos(a) * r(a), Math.sin(a) * r(a)] as const;
});

/**
 * Emblem `i` (0–11) `s` across centred on (cx, cy), in `ink`, cut from `ground` where a mark has a hole (the
 * crescent's bite, the ring's middle): a disc, a ring, a lozenge, a cross, a saltire, a rose, a crescent, a triangle,
 * a chevron, two bars, a canton, a sun.
 */
export function emblem(i: number, cx: number, cy: number, s: number, inks: { ink: string; ground: string }): string {
  const { ink, ground } = inks;
  const k = ((Math.round(i) % 12) + 12) % 12, u = s / 0.8, f = `fill="${ink}"`;
  const bar = (x0: number, y0: number, x1: number, y1: number) => poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], cx, cy, u);
  const turn = (pts: [number, number][]) => pts.map(([x, y]) => [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2] as const);
  switch (k) {
    case 0: return `<path d="${circle(cx, cy, 0.3 * u)}" ${f}/>`;
    case 1: return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(0.26 * u)}" fill="none" stroke="${ink}" stroke-width="${r2(0.15 * u)}"/>`;
    case 2: return `<path d="${poly([[0, 0.36], [0.36, 0], [0, -0.36], [-0.36, 0]], cx, cy, u)}" ${f}/>`;
    case 3: return `<path d="${bar(-0.36, -0.09, 0.36, 0.09)}${bar(-0.09, -0.36, 0.09, 0.36)}" ${f}/>`;
    case 4: return `<path d="${poly(turn([[-0.4, -0.085], [0.4, -0.085], [0.4, 0.085], [-0.4, 0.085]]), cx, cy, u)}${poly(turn([[-0.085, -0.4], [0.085, -0.4], [0.085, 0.4], [-0.085, 0.4]]), cx, cy, u)}" ${f}/>`;
    case 5: return `<path d="${poly(lobes(40, (a) => 0.21 + 0.11 * Math.cos(5 * a - Math.PI / 2)), cx, cy, u)}" ${f}/>`;
    case 6: return `<path d="${circle(cx, cy, 0.3 * u)}" ${f}/><path d="${circle(cx + 0.13 * u, cy - 0.07 * u, 0.25 * u)}" fill="${ground}"/>`;
    case 7: return `<path d="${poly([[0, 0.3], [0.3, -0.22], [-0.3, -0.22]], cx, cy, u)}" ${f}/>`;
    case 8: return `<path d="${poly([[-0.4, -0.18], [0, 0.14], [0.4, -0.18], [0.4, -0.34], [0, -0.02], [-0.4, -0.34]], cx, cy, u)}" ${f}/>`;
    case 9: return `<path d="${bar(-0.4, 0.085, 0.4, 0.215)}${bar(-0.4, -0.215, 0.4, -0.085)}" ${f}/>`;
    case 10: return `<path d="${bar(-0.34, 0, 0, 0.34)}" ${f}/><path d="${bar(-0.34, -0.34, 0.34, 0.34)}" fill="none" stroke="${ink}" stroke-width="${r2(0.05 * u)}"/>`;
    default: return `<path d="${poly(lobes(48, (a) => (Math.cos(8 * a) > 0.25 ? 0.29 : 0.17)), cx, cy, u)}" ${f}/>`;
  }
}
