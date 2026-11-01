// Sail emblems: one charge for each of the league's captains, and the player's own choices. Captains are spirits,
// shown by an emblem, never a face, so every charge is an animal, a spirit, a plant or a natural form: no tools,
// no buildings, nothing made by hands. Built on the old game's emblem code (src/career/emblems.ts), whose purely
// geometric charges carry over where they are natural (the sun, the waves, the star, the moon's eclipse...).
// No three.js here: the shapes render in Node as well as in the browser.
import {
  above, around, bez, circle, cover, cut, edge, ellipse, hexagon, inter, mirrorX, move, path, poly, rect, ring, rot, scale, seg,
  shape, spiral, star, stroke, trace, union, type SDF,
} from './sdf.ts';

// ---------------------------------------------------------------- drawing helpers

/** A shape laid over another with a thin gap of field between them, so overlapping parts still read apart. */
const over = (back: SDF, front: SDF, gap = 0.035): SDF => union(cut(back, (x, y) => front(x, y) - gap), front);
const grow = (f: SDF, r: number): SDF => (x, y) => f(x, y) - r;
const cubic = (a: readonly number[], b: readonly number[], c: readonly number[], d: readonly number[]) => (t: number): [number, number] => {
  const s = 1 - t;
  return [s * s * s * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t * t * t * d[0], s * s * s * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t * t * t * d[1]];
};
/**
 * A line from p0 to p1 that then curls round on itself (dir +1 to the left of travel, -1 to the right), for gusts,
 * tentacles, tails and fronds. Returns flat points.
 */
function curl(x0: number, y0: number, x1: number, y1: number, r: number, dir: number, sweep = 1.5, n = 32): number[] {
  const len = Math.hypot(x1 - x0, y1 - y0), dx = (x1 - x0) / len, dy = (y1 - y0) / len, nx = -dy * dir, ny = dx * dir;
  const cx = x1 + nx * r, cy = y1 + ny * r, a0 = Math.atan2(-ny, -nx), share = len / (len + r * sweep * Math.PI);
  return trace((t) => {
    if (t <= share) return [x0 + (x1 - x0) * (t / share), y0 + (y1 - y0) * (t / share)];
    const u = (t - share) / (1 - share), a = a0 + dir * u * sweep * Math.PI, rr = r * (1 - 0.55 * u);
    return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  }, n);
}
/** A wavy horizontal line, for water under a charge. */
const water = (y0: number, w: number, amp = 0.045, k = 13, hw = 0.03): SDF => (x, y) =>
  Math.max(Math.abs(y - y0 - amp * Math.sin(x * k)) * 0.8 - hw, Math.abs(x) - w);
/** A leaf whose half-width follows lobes along its length: oak, holly and the like. */
function lobedLeaf(len: number, w: number, lobes: number, depth: number): SDF {
  const right = trace((t) => [w * Math.sin(Math.PI * t) ** 0.75 * (1 - depth * (0.5 - 0.5 * Math.cos(2 * Math.PI * lobes * t))), -len / 2 + len * t], 48);
  const left: number[] = [];
  for (let i = right.length - 2; i >= 0; i -= 2) left.push(-right[i], right[i + 1]);
  return poly([...right, ...left]);
}
const pts = (p: number[]) => [p[p.length - 2], p[p.length - 1]] as const;

// ---------------------------------------------------------------- the charges

// the old game's natural charges, carried over
const sunburst = union(circle(0, 0, 0.25), around(poly([0.3, 0.09, 0.76, 0, 0.3, -0.09]), 8), around(poly([0.3, 0.065, 0.58, 0, 0.3, -0.065]), 8, Math.PI / 8));
const ray = (k: number, n: number, cy: number, r0: number, r1: number) => { const a = (Math.PI * k) / n; return seg(r0 * Math.cos(a), cy + r0 * Math.sin(a), r1 * Math.cos(a), cy + r1 * Math.sin(a), 0.05, 0.012); };
const risingSun = union(inter(circle(0, -0.22, 0.32), above(-0.22)), ...Array.from({ length: 7 }, (_, k) => ray(k + 1, 8, -0.22, 0.4, 0.68)),
  seg(-0.66, -0.32, 0.66, -0.32, 0.045), seg(-0.46, -0.47, 0.46, -0.47, 0.035), seg(-0.24, -0.6, 0.24, -0.6, 0.03));
const waves: SDF = (x, y) => {
  let d = Infinity;
  for (const y0 of [0.34, 0, -0.34]) d = Math.min(d, Math.abs(y - y0 - 0.1 * Math.sin(x * 6.5 + 1)) * 0.8 - 0.065);
  return Math.max(d, Math.abs(x) - 0.64);
};
const northStar = cut(poly(star(8, [0.78, 0.46], 0.2)), poly(star(4, 0.16, 0.05, Math.PI / 4)));
const lightning = poly([0.12, 0.66, -0.28, 0.02, -0.05, 0.02, -0.28, -0.66, 0.19, -0.07, -0.03, -0.07, 0.31, 0.66]);
const eclipse = union(cut(circle(0, 0, 0.46), circle(0.07, -0.05, 0.42)), circle(-0.3, 0.33, 0.07), around(seg(0.56, 0, 0.7, 0, 0.022, 0.004), 24));
const comet = union(circle(0.3, 0.3, 0.17), cut(union(seg(0.3, 0.3, -0.66, -0.46, 0.14, 0.01), seg(0.24, 0.38, -0.5, -0.1, 0.07, 0.008), seg(0.38, 0.24, -0.1, -0.6, 0.07, 0.008)), circle(0.3, 0.3, 0.23)));
const flame = cut(union(seg(0.02, -0.42, 0.06, 0.76, 0.3, 0), seg(-0.16, -0.4, -0.44, 0.3, 0.17, 0), seg(0.2, -0.42, 0.46, 0.2, 0.16, 0)), seg(0.02, -0.4, 0.04, 0.3, 0.12, 0));

// birds
const swift = union(
  mirrorX(shape('M 0.03 0.3 Q 0.42 0.3 0.8 -0.38 Q 0.42 -0.06 0.03 -0.04 Z')),
  ellipse(0, 0.06, 0.11, 0.34), circle(0, 0.42, 0.12),
  shape('M 0.06 -0.2 L 0.22 -0.76 L 0 -0.46 L -0.22 -0.76 L -0.06 -0.2 Z'),
);
const goshawk = cut(union(
  mirrorX(shape('M 0.06 0.16 Q 0.36 0.42 0.82 0.52 L 0.7 0.38 L 0.84 0.3 L 0.7 0.22 L 0.8 0.12 L 0.62 0.08 L 0.68 -0.02 L 0.5 0.0 Q 0.3 -0.04 0.06 -0.12 Z')),
  ellipse(0, -0.06, 0.15, 0.34), circle(0, 0.32, 0.13),
  shape('M 0.1 0.38 Q 0.26 0.36 0.24 0.22 L 0.12 0.27 Z'),
  shape('M 0.07 -0.32 L 0.22 -0.76 L 0 -0.68 L -0.22 -0.76 L -0.07 -0.32 Z'),
), circle(0.05, 0.35, 0.03), mirrorX(path([0.2, 0.2, 0.5, 0.18], 0.014)));
const magpie = cut(union(
  circle(0.34, 0.34, 0.13), shape('M 0.44 0.39 L 0.64 0.32 L 0.44 0.27 Z'),
  ellipse(0.02, 0.06, 0.34, 0.19, 0.45),
  seg(-0.22, -0.1, -0.74, -0.62, 0.09, 0.05),
  seg(0.04, -0.12, 0.06, -0.44, 0.022), seg(0.14, -0.1, 0.18, -0.42, 0.022),
), ellipse(-0.02, 0.04, 0.2, 0.055, 0.45), circle(0.38, 0.37, 0.03), ellipse(0.2, -0.06, 0.11, 0.06, 0.7));
const raven = cut(union(
  circle(0.32, 0.36, 0.14), shape('M 0.38 0.44 Q 0.62 0.42 0.72 0.3 Q 0.56 0.3 0.4 0.27 Z'),
  ellipse(0.0, 0.06, 0.38, 0.23, 0.4),
  shape('M -0.22 -0.06 L -0.72 -0.46 L -0.64 -0.58 L -0.54 -0.54 L -0.1 -0.2 Z'),
  seg(0.02, -0.14, 0.04, -0.46, 0.025), seg(0.14, -0.1, 0.16, -0.46, 0.025),
  seg(-0.5, -0.48, 0.66, -0.48, 0.035),
), circle(0.36, 0.4, 0.03), path([-0.34, -0.06, 0.1, 0.2], 0.014), path([-0.26, -0.14, 0.14, 0.08], 0.014));
const heron = cut(union(
  ellipse(-0.1, 0.0, 0.32, 0.15, 0.25),
  shape('M -0.36 -0.06 L -0.56 -0.3 L -0.3 -0.14 Z'),
  stroke(cubic([0.12, 0.08], [0.36, 0.24], [0.08, 0.38], [0.2, 0.56]), 0.065, 0.045),
  ellipse(0.24, 0.58, 0.09, 0.06, 0.1), shape('M 0.3 0.62 L 0.7 0.5 L 0.3 0.54 Z'), seg(0.18, 0.63, -0.04, 0.68, 0.016, 0.004),
  seg(-0.08, -0.1, -0.06, -0.74, 0.022), path([0.02, -0.1, 0.1, -0.4, 0.04, -0.74], 0.022),
  seg(-0.06, -0.74, 0.08, -0.76, 0.018), seg(0.04, -0.74, 0.18, -0.76, 0.018),
), circle(0.25, 0.6, 0.022), path([-0.34, 0.02, 0.06, 0.06], 0.014));
const owl = cut(
  mirrorX(shape('M 0 -0.7 Q 0.44 -0.7 0.46 -0.1 Q 0.48 0.32 0.4 0.5 L 0.5 0.8 L 0.22 0.58 Q 0.1 0.6 0 0.58 Z')),
  mirrorX(ring(0.19, 0.28, 0.12, 0.03)), mirrorX(path([0.32, 0.12, 0.36, -0.2, 0.26, -0.56], 0.018)),
  path([-0.12, -0.2, 0, -0.28, 0.12, -0.2], 0.02), path([-0.14, -0.38, 0, -0.46, 0.14, -0.38], 0.02),
  shape('M -0.05 0.17 L 0.05 0.17 L 0 0.04 Z'),
);
const vulture = cut(union(
  over(shape('M -0.52 -0.62 Q -0.64 0.0 -0.3 0.32 Q 0.0 0.5 0.2 0.3 Q 0.28 0.0 0.18 -0.3 Q 0.0 -0.56 -0.52 -0.62 Z'),
    shape('M 0.04 0.3 L 0.14 0.42 L 0.22 0.36 L 0.32 0.42 L 0.36 0.3 L 0.3 0.2 Q 0.18 0.16 0.04 0.3 Z'), 0.025),
  seg(0.28, 0.36, 0.36, 0.5, 0.045, 0.035), circle(0.4, 0.55, 0.09),
  shape('M 0.44 0.62 Q 0.62 0.6 0.58 0.44 L 0.52 0.5 L 0.46 0.5 Z'),
  seg(-0.02, -0.5, 0.0, -0.74, 0.03), seg(0.1, -0.42, 0.14, -0.74, 0.03),
), circle(0.42, 0.58, 0.022), path([-0.46, -0.5, -0.2, 0.2], 0.014), path([-0.3, -0.56, -0.04, 0.12], 0.014), path([-0.14, -0.56, 0.08, -0.02], 0.014));
const gull = union(mirrorX(path(bez([0.03, -0.1], [0.3, 0.52], [0.8, 0.0], 14), 0.11, 0.02)), ellipse(0, -0.16, 0.09, 0.2), circle(0, 0.02, 0.09), move(poly(star(4, 0.2, 0.06)), 0, 0.56));
const swan = cut(union(
  shape('M -0.62 0.0 Q -0.5 -0.32 0.0 -0.34 Q 0.4 -0.34 0.5 -0.1 Q 0.3 -0.02 0.16 0.02 Q -0.1 0.42 -0.58 0.44 Q -0.46 0.2 -0.62 0.0 Z'),
  stroke(cubic([0.36, -0.1], [0.66, 0.2], [0.14, 0.36], [0.3, 0.62]), 0.065, 0.045),
  ellipse(0.36, 0.64, 0.1, 0.07), shape('M 0.42 0.68 L 0.6 0.58 L 0.42 0.6 Z'),
  water(-0.48, 0.78, 0.03, 12, 0.025),
), circle(0.37, 0.66, 0.02), path([-0.5, 0.36, -0.12, 0.08], 0.014), path([-0.5, 0.2, -0.16, -0.02], 0.014));

// beasts of the land
const wolf = cut(
  mirrorX(shape('M 0 -0.74 Q 0.14 -0.7 0.2 -0.44 L 0.3 -0.2 L 0.56 -0.04 L 0.46 0.14 L 0.58 0.38 L 0.52 0.86 L 0.26 0.56 Q 0.12 0.6 0 0.6 Z')),
  mirrorX(shape('M 0.08 0.12 L 0.28 0.2 L 0.22 0.06 Z')), mirrorX(shape('M 0.32 0.52 L 0.47 0.74 L 0.44 0.42 Z')),
  mirrorX(path([0.04, -0.5, 0.16, -0.34, 0.22, -0.14], 0.016)),
);
const fox = cut(
  mirrorX(shape('M 0 -0.62 L 0.1 -0.56 Q 0.3 -0.24 0.66 0.02 Q 0.46 0.14 0.42 0.3 L 0.62 0.84 L 0.22 0.46 Q 0.1 0.48 0 0.48 Z')),
  mirrorX(shape('M 0.12 -0.46 Q 0.3 -0.2 0.56 0.0 Q 0.3 -0.06 0.16 -0.22 Z')), mirrorX(shape('M 0.08 0.1 L 0.26 0.2 L 0.22 0.05 Z')),
  mirrorX(shape('M 0.3 0.4 L 0.54 0.74 L 0.42 0.32 Z')),
);
const stag = cut(union(
  mirrorX(shape('M 0 -0.72 Q 0.12 -0.7 0.14 -0.5 Q 0.2 -0.1 0.22 0.06 L 0.46 0.16 Q 0.36 0.24 0.22 0.26 Q 0.14 0.32 0 0.32 Z')),
  mirrorX(union(path([0.1, 0.28, 0.3, 0.48, 0.44, 0.84], 0.04, 0.018), path([0.24, 0.42, 0.52, 0.5], 0.028, 0.012), path([0.36, 0.64, 0.64, 0.7], 0.026, 0.01),
    path([0.4, 0.74, 0.3, 0.88], 0.022, 0.01), path([0.16, 0.34, 0.12, 0.56], 0.024, 0.01))),
), mirrorX(ellipse(0.12, 0.0, 0.04, 0.026, 0.3)), mirrorX(path([0.04, -0.56, 0.1, -0.3], 0.014)));
const bearPaw = union(
  shape('M -0.36 -0.2 Q -0.4 0.08 -0.12 0.06 Q 0 0.12 0.12 0.06 Q 0.4 0.08 0.36 -0.2 Q 0.3 -0.56 0 -0.56 Q -0.3 -0.56 -0.36 -0.2 Z'),
  ellipse(-0.42, 0.22, 0.11, 0.14, 0.45), ellipse(-0.15, 0.38, 0.12, 0.15, 0.15), ellipse(0.15, 0.38, 0.12, 0.15, -0.15), ellipse(0.42, 0.22, 0.11, 0.14, -0.45),
  ...[[-0.52, 0.34, 0.45], [-0.19, 0.52, 0.15], [0.19, 0.52, -0.15], [0.52, 0.34, -0.45]].map(([x, y, a]) => move(rot(poly([-0.045, 0, 0.045, 0, 0, 0.17]), a), x, y)),
);
const hare = cut(union(
  ellipse(-0.12, -0.22, 0.36, 0.3, 0.25), ellipse(0.2, 0.2, 0.17, 0.13, 0.5),
  ellipse(0.06, 0.52, 0.06, 0.26, 0.3), ellipse(0.2, 0.52, 0.06, 0.25, -0.05),
  seg(0.2, -0.1, 0.24, -0.5, 0.05, 0.04), ellipse(-0.12, -0.56, 0.3, 0.07), circle(-0.48, -0.12, 0.09),
  shape('M 0.3 0.12 L 0.38 0.06 L 0.32 0.2 Z'),
), circle(0.26, 0.24, 0.026), path([-0.3, -0.36, -0.02, -0.4, 0.1, -0.26], 0.016));

// beasts of the sea
const narwhal = cut(rot(scale(move(cut(union(
  ellipse(-0.08, 0, 0.42, 0.19), circle(0.28, 0.02, 0.16), seg(0.4, 0.06, 0.98, 0.2, 0.035, 0.006),
  seg(-0.42, 0, -0.66, 0.02, 0.11, 0.045),
  shape('M -0.64 0.02 Q -0.76 0.2 -0.9 0.26 Q -0.84 0.08 -0.76 0.01 Q -0.84 -0.08 -0.9 -0.22 Q -0.76 -0.16 -0.64 -0.01 Z'),
  ellipse(0.06, -0.18, 0.13, 0.05, -0.5),
), circle(0.3, 0.07, 0.03), circle(-0.2, 0.05, 0.035), circle(-0.04, 0.09, 0.03), circle(-0.32, -0.03, 0.03), circle(-0.12, -0.04, 0.025)), -0.04, 0), 0.82), 0.4));
const whale = union(
  over(shape('M 0 -0.24 Q 0.04 0.1 0.12 0.24 Q 0.36 0.32 0.74 0.62 Q 0.5 0.68 0.32 0.6 Q 0.16 0.52 0.04 0.42 L 0 0.5 L -0.04 0.42 Q -0.16 0.52 -0.32 0.6 Q -0.5 0.68 -0.74 0.62 Q -0.36 0.32 -0.12 0.24 Q -0.04 0.1 0 -0.24 Z'),
    union(water(-0.26, 0.8, 0.05, 11, 0.035), water(-0.5, 0.66, 0.04, 11, 0.03)), 0.04),
  circle(0.7, 0.44, 0.03), circle(-0.66, 0.4, 0.03), circle(0.68, 0.28, 0.022), circle(-0.62, 0.24, 0.022),
);
const octopus = (() => {
  const arms = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((s) => path(curl(0.16 * s, 0.02, 0.16 * s + 0.5 * s, -0.5 + 0.12 * Math.abs(s), 0.11, s > 0 ? 1 : -1, 1.4), 0.07, 0.016));
  return cut(union(ellipse(0, 0.34, 0.3, 0.36), ...arms), mirrorX(ring(0.12, 0.14, 0.05, 0.022)), circle(-0.06, 0.48, 0.04), circle(0.1, 0.56, 0.03));
})();
const turtle = union(
  cut(ellipse(0, 0, 0.36, 0.44),
    (x, y) => Math.abs(hexagon(0.15)(x, y)) - 0.018,
    inter(around(seg(0.16, 0, 0.5, 0, 0.018), 6, Math.PI / 6), ellipse(0, 0, 0.3, 0.37)),
    (x, y) => Math.abs(ellipse(0, 0, 0.29, 0.36)(x, y)) - 0.016),
  ellipse(0, 0.56, 0.11, 0.14),
  mirrorX(shape('M 0.22 0.22 Q 0.5 0.3 0.7 0.56 Q 0.54 0.62 0.38 0.44 Q 0.28 0.3 0.24 0.06 Z')),
  mirrorX(ellipse(0.34, -0.38, 0.17, 0.08, -0.6)), shape('M -0.05 -0.4 L 0 -0.64 L 0.05 -0.4 Z'),
);
const crab = (() => {
  const claw = shape('M 0.34 0.36 Q 0.32 0.8 0.6 0.84 Q 0.5 0.7 0.54 0.6 Q 0.66 0.64 0.74 0.72 Q 0.78 0.42 0.5 0.34 Z');
  return union(
    shape('M -0.46 -0.02 Q -0.44 0.24 0 0.26 Q 0.44 0.24 0.46 -0.02 Q 0.4 -0.3 0 -0.32 Q -0.4 -0.3 -0.46 -0.02 Z'),
    mirrorX(union(seg(0.3, 0.12, 0.44, 0.38, 0.06), claw,
      path([0.36, -0.02, 0.66, 0.02, 0.8, -0.24], 0.035, 0.02), path([0.36, -0.12, 0.62, -0.16, 0.7, -0.42], 0.035, 0.02),
      path([0.3, -0.22, 0.5, -0.32, 0.52, -0.6], 0.035, 0.02), seg(0.1, 0.22, 0.14, 0.38, 0.025), circle(0.14, 0.4, 0.05))),
  );
})();
const pufferfish = cut(union(
  circle(0.04, 0, 0.42), move(around(poly([0.4, 0.06, 0.62, 0, 0.4, -0.06]), 14), 0.04, 0),
  shape('M -0.34 0 L -0.74 0.26 Q -0.64 0 -0.74 -0.26 Z'),
), circle(0.22, 0.12, 0.09), circle(0.44, -0.06, 0.04), path([-0.08, 0.3, 0.06, 0.1, -0.06, -0.06], 0.016));
const pufferEye = circle(0.24, 0.12, 0.045);
const swordfish = scale(rot(union(
  ellipse(-0.06, 0, 0.4, 0.14), shape('M 0.2 0.12 Q 0.34 0.08 0.4 0.03 L 0.4 -0.03 Q 0.3 -0.1 0.2 -0.12 Z'), seg(0.36, 0.02, 0.94, 0.04, 0.03, 0.005),
  shape('M -0.14 0.1 Q -0.04 0.44 0.14 0.4 Q 0.12 0.22 0.16 0.1 Z'),
  seg(-0.4, 0, -0.58, 0, 0.08, 0.035),
  shape('M -0.56 0 Q -0.68 0.14 -0.8 0.4 Q -0.7 0.1 -0.66 0 Q -0.7 -0.1 -0.8 -0.4 Q -0.68 -0.14 -0.56 0 Z'),
  shape('M 0.06 -0.08 Q -0.04 -0.26 -0.16 -0.3 Q -0.04 -0.16 -0.02 -0.08 Z'),
), 0.32), 0.86);
const seahorse = cut(union(
  ellipse(0.16, 0.52, 0.16, 0.12, 0.3), seg(0.26, 0.5, 0.58, 0.42, 0.05, 0.04),
  shape('M 0.04 0.6 L 0.06 0.76 L 0.12 0.64 L 0.18 0.78 L 0.22 0.62 Z'),
  stroke(cubic([0.1, 0.44], [-0.18, 0.24], [0.34, 0.02], [0.06, -0.3]), 0.1, 0.075),
  path(curl(0.06, -0.3, 0.0, -0.52, 0.12, 1, 1.5), 0.07, 0.02),
  shape('M 0.02 0.22 L -0.17 0.18 L -0.17 0.0 L 0.02 0.02 Z'),
), circle(0.2, 0.55, 0.03), path([0.14, 0.22, 0.24, 0.24], 0.012), path([0.16, 0.08, 0.26, 0.06], 0.012), path([0.12, -0.06, 0.22, -0.1], 0.012));
const dolphin = (() => {
  const at = (deg: number, r = 0.66): [number, number] => { const a = (deg * Math.PI) / 180; return [r * Math.cos(a), -0.36 + r * Math.sin(a)]; };
  const arc = (a0: number, a1: number) => trace((t) => at(a0 + (a1 - a0) * t), 20);
  const tail = at(160), nose = at(22);
  return cut(union(
    path(arc(95, 24), 0.17, 0.05), path(arc(95, 158), 0.17, 0.04), seg(nose[0], nose[1], nose[0] + 0.1, nose[1] - 0.1, 0.045, 0.03),
    move(rot(shape('M 0 0 Q 0.04 0.2 -0.12 0.26 Q -0.06 0.12 -0.1 0 Z'), 0.1), ...at(104, 0.8)),
    move(rot(shape('M 0 0 L -0.06 0.18 Q 0 0.22 0.08 0.2 L 0.02 0 L 0.1 -0.16 Q 0.04 -0.22 -0.06 -0.18 Z'), 0.75), tail[0], tail[1]),
    move(rot(shape('M 0 0 Q 0.02 -0.18 -0.12 -0.24 Q -0.04 -0.08 -0.06 0 Z'), -0.4), ...at(58, 0.55)),
    water(-0.6, 0.8, 0.04, 12, 0.03),
  ), circle(...at(36, 0.68), 0.025));
})();
const serpent = union(
  over(union(
    inter(ring(-0.52, -0.16, 0.15, 0.065), above(-0.16)), inter(ring(-0.1, -0.16, 0.19, 0.075), above(-0.16)),
    stroke(cubic([0.16, -0.18], [0.16, 0.3], [0.5, 0.18], [0.46, 0.48]), 0.08, 0.06),
    seg(-0.67, -0.16, -0.82, 0.06, 0.05, 0.01),
    shape('M 0.36 0.5 Q 0.52 0.66 0.72 0.6 L 0.6 0.52 L 0.74 0.48 Q 0.6 0.4 0.5 0.42 Z'),
    shape('M 0.4 0.58 L 0.34 0.78 L 0.46 0.62 Z'),
    ...[[0.2, 0.06], [0.24, 0.2], [0.32, 0.3]].map(([x, y]) => poly([x - 0.03, y, x - 0.14, y + 0.06, x - 0.03, y + 0.08])),
  ), union(water(-0.24, 0.8, 0.035, 12, 0.03), water(-0.46, 0.66, 0.03, 12, 0.025)), 0.04),
);

// small creatures
const scorpion = (() => {
  const tail = curl(0, -0.24, 0, -0.56, 0.15, 1, 1.25), [ex, ey] = pts(tail);
  return union(
    ellipse(0, 0.0, 0.14, 0.26), ellipse(0, 0.26, 0.12, 0.1),
    mirrorX(union(path([0.08, 0.3, 0.26, 0.42, 0.3, 0.54], 0.032), shape('M 0.24 0.56 Q 0.2 0.8 0.34 0.84 Q 0.3 0.72 0.34 0.66 Q 0.42 0.7 0.44 0.78 Q 0.48 0.6 0.32 0.52 Z'),
      ...[0.14, 0.04, -0.06, -0.16].map((y) => path([0.1, y, 0.32, y + 0.06, 0.42, y - 0.1], 0.02, 0.012)))),
    path(tail, 0.075, 0.045), circle(ex, ey, 0.07), poly([ex - 0.04, ey + 0.03, ex - 0.2, ey + 0.1, ex - 0.02, ey - 0.05]),
  );
})();
const moth = cut(union(
  over(mirrorX(shape('M 0.04 -0.04 Q 0.4 -0.08 0.46 -0.36 Q 0.3 -0.56 0.04 -0.28 Z')),
    mirrorX(shape('M 0.04 0.12 Q 0.3 0.5 0.72 0.42 Q 0.74 0.1 0.5 -0.02 Q 0.24 -0.04 0.04 -0.02 Z')), 0.03),
  ellipse(0, 0, 0.06, 0.32), mirrorX(path([0.02, 0.28, 0.12, 0.5, 0.26, 0.62], 0.018, 0.01)),
), mirrorX(ring(0.42, 0.2, 0.08, 0.025)), mirrorX(circle(0.26, -0.24, 0.05)));
const butterfly = cut(union(
  over(mirrorX(shape('M 0.04 -0.02 Q 0.46 0.0 0.5 -0.32 Q 0.44 -0.46 0.34 -0.44 L 0.3 -0.72 L 0.22 -0.46 Q 0.12 -0.36 0.04 -0.18 Z')),
    mirrorX(shape('M 0.04 0.06 Q 0.2 0.64 0.64 0.62 Q 0.8 0.4 0.56 0.06 Q 0.3 -0.02 0.04 0.0 Z')), 0.03),
  ellipse(0, 0, 0.055, 0.3), mirrorX(union(path([0.02, 0.28, 0.1, 0.52, 0.2, 0.7], 0.014), circle(0.2, 0.71, 0.035))),
), mirrorX(circle(0.46, 0.4, 0.07)), mirrorX(circle(0.3, 0.22, 0.045)), mirrorX(circle(0.32, -0.24, 0.045)));
const bat = scale(cut(union(
  mirrorX(shape('M 0.06 0.2 Q 0.4 0.38 0.84 0.32 Q 0.74 0.12 0.76 -0.04 Q 0.62 0.02 0.54 -0.14 Q 0.44 -0.02 0.32 -0.16 Q 0.22 -0.02 0.06 -0.14 Z')),
  ellipse(0, 0.02, 0.1, 0.24), circle(0, 0.26, 0.1), mirrorX(poly([0.02, 0.3, 0.1, 0.48, 0.11, 0.28])),
), mirrorX(path([0.12, 0.18, 0.52, 0.3], 0.012)), mirrorX(path([0.12, 0.14, 0.56, -0.04], 0.012)), mirrorX(path([0.1, 0.1, 0.32, -0.08], 0.012))), 0.92);
const starfish = cut(grow(poly(star(5, 0.72, 0.26)), 0.03),
  around(circle(0.28, 0, 0.035), 5, Math.PI / 2), around(circle(0.46, 0, 0.03), 5, Math.PI / 2), circle(0, 0, 0.06));
const nautilus = cut(union(circle(0, 0.04, 0.56), ellipse(0.34, -0.16, 0.3, 0.38, 0.4)),
  spiral(2.1, 0.5, 0.024), ellipse(0.42, -0.24, 0.16, 0.24, 0.4),
  inter(around(seg(0.3, 0, 0.56, 0, 0.014), 11), cut(circle(0, 0.04, 0.53), circle(0, 0, 0.3))));
const scallop = cut(union(
  shape(`M 0 -0.46 ${trace((t) => { const a = Math.PI * (0.06 + 0.88 * t), r = 1.1 + 0.05 * Math.abs(Math.sin(t * Math.PI * 9)); return [0.68 * r * Math.cos(a) * 0.9, -0.46 + 0.68 * r * Math.sin(a)]; }, 72).reduce((s, v, i) => s + (i % 2 ? ` ${v}` : ` L ${v}`), '')} Z`),
  shape('M -0.12 -0.42 L -0.36 -0.36 L -0.34 -0.6 L -0.06 -0.56 Z'), shape('M 0.12 -0.42 L 0.36 -0.36 L 0.34 -0.6 L 0.06 -0.56 Z'),
), ...Array.from({ length: 8 }, (_, k) => { const a = Math.PI * (0.18 + (0.64 * (k + 0.5)) / 8); return seg(0.06 * Math.cos(a), -0.4 + 0.06 * Math.sin(a), 0.66 * Math.cos(a) * 0.9, -0.46 + 0.66 * Math.sin(a), 0.006, 0.02); }));

// plants
const oak = union(
  cut(rot(lobedLeaf(1.3, 0.36, 4.5, 0.42), 0.45), rot(seg(0, -0.6, 0, 0.56, 0.018, 0.006), 0.45)),
  rot(seg(0, -0.64, 0, -0.84, 0.03), 0.45),
  ellipse(0.46, -0.46, 0.1, 0.13), inter(circle(0.46, -0.36, 0.13), above(-0.37)), seg(0.46, -0.24, 0.5, -0.16, 0.02),
);
const maple = cut(union(
  mirrorX(shape('M 0 0.84 L 0.11 0.62 L 0.25 0.68 L 0.2 0.36 L 0.42 0.54 L 0.46 0.42 L 0.66 0.48 L 0.58 0.28 L 0.7 0.22 L 0.4 -0.02 L 0.47 -0.16 L 0.05 -0.1 L 0.04 -0.44 L 0 -0.44 Z')),
  seg(0, -0.42, 0.02, -0.76, 0.03),
), seg(0, -0.1, 0, 0.66, 0.016), seg(0, -0.06, 0.5, 0.36, 0.014), seg(0, -0.06, -0.5, 0.36, 0.014));
const clover = union(
  cut(around(union(circle(0.34, 0.12, 0.17), circle(0.34, -0.12, 0.17), poly([0.0, 0.0, 0.24, 0.26, 0.24, -0.26])), 4, Math.PI / 4),
    around(seg(0.06, 0, 0.42, 0, 0.016), 4, Math.PI / 4)),
  stroke(cubic([0, -0.06], [0.02, -0.4], [0.16, -0.6], [0.34, -0.8]), 0.04, 0.025),
);
const lotus = (() => {
  const petal = shape('M 0 0 Q 0.22 0.3 0 0.72 Q -0.22 0.3 0 0 Z');
  const p = (a: number, k: number) => move(rot(scale(petal, k), a), 0, -0.24);
  return union(over(over(union(p(1.15, 0.72), p(-1.15, 0.72)), union(p(0.55, 0.9), p(-0.55, 0.9))), p(0, 1)),
    water(-0.4, 0.74, 0.03, 12, 0.025), water(-0.58, 0.56, 0.025, 12, 0.022));
})();
const fern = (() => {
  const stem = curl(0.16, -0.8, -0.02, 0.24, 0.18, -1, 1.6, 40), leaves: SDF[] = [];
  for (let i = 2; i < 26; i += 2) {
    const x = stem[2 * i], y = stem[2 * i + 1], dx = stem[2 * i + 2] - x, dy = stem[2 * i + 3] - y, a = Math.atan2(dy, dx), l = 0.26 * (1 - i / 30);
    for (const s of [1, -1]) leaves.push(ellipse(x + Math.cos(a + s * 1.1) * l * 0.5, y + Math.sin(a + s * 1.1) * l * 0.5, l * 0.5, l * 0.16, a + s * 1.1));
  }
  return union(path(stem, 0.035, 0.022), ...leaves);
})();

// the elements
const sun = sunburst;
const wind = move(scale(union(
  path(curl(-0.74, 0.3, 0.18, 0.3, 0.2, 1, 1.4), 0.05, 0.03),
  path(curl(-0.52, -0.02, 0.4, -0.02, 0.16, 1, 1.4), 0.05, 0.03),
  path(curl(-0.78, -0.36, 0.02, -0.36, 0.14, -1, 1.4), 0.045, 0.028),
), 0.9), 0.06, 0);
const mountain = scale(cut(union(shape('M -0.8 -0.46 L -0.3 0.3 L -0.12 0.06 L 0.22 0.64 L 0.8 -0.46 Z'), seg(-0.8, -0.6, 0.8, -0.6, 0.035)),
  path([0.0, 0.28, 0.1, 0.36, 0.18, 0.26, 0.26, 0.38, 0.34, 0.28, 0.44, 0.32], 0.025), path([-0.44, 0.1, -0.36, 0.16, -0.3, 0.08, -0.22, 0.15], 0.022)), 0.9);
const stormCloud = union(
  inter(union(circle(-0.28, 0.3, 0.2), circle(0.0, 0.42, 0.27), circle(0.3, 0.3, 0.2), rect(0, 0.2, 0.5, 0.1, 0.1)), above(0.1)),
  poly([0.04, 0.04, -0.16, -0.3, 0.0, -0.3, -0.12, -0.74, 0.22, -0.2, 0.06, -0.2, 0.18, 0.04]),
  seg(-0.36, -0.02, -0.44, -0.3, 0.025), seg(0.38, -0.02, 0.3, -0.3, 0.025), seg(-0.24, -0.42, -0.3, -0.64, 0.025), seg(0.34, -0.42, 0.28, -0.64, 0.025),
);
const volcano = union(
  over(union(circle(0.0, 0.36, 0.12), circle(0.14, 0.5, 0.15), circle(-0.04, 0.68, 0.13), circle(0.24, 0.72, 0.12), circle(0.4, 0.62, 0.1)),
    cut(shape('M -0.78 -0.56 L -0.24 0.12 Q -0.16 0.18 -0.1 0.14 L 0.1 0.14 Q 0.16 0.18 0.24 0.12 L 0.78 -0.56 Z'),
      path([0.0, 0.12, -0.06, -0.1, 0.04, -0.3, -0.04, -0.56], 0.03)), 0.035),
  circle(-0.3, 0.42, 0.035), circle(-0.42, 0.24, 0.03), circle(0.5, 0.3, 0.03),
);
const snowflake = cut(around(union(seg(0, 0, 0.74, 0, 0.045), seg(0.3, 0, 0.46, 0.15, 0.032), seg(0.3, 0, 0.46, -0.15, 0.032),
  seg(0.52, 0, 0.63, 0.11, 0.026), seg(0.52, 0, 0.63, -0.11, 0.026)), 6, Math.PI / 2), hexagon(0.08));

// the show-off charges
const crystal = cut(union(
  shape('M -0.12 -0.64 L 0.12 -0.64 L 0.12 0.36 L 0 0.6 L -0.12 0.36 Z'),
  rot(shape('M -0.09 -0.64 L 0.09 -0.64 L 0.09 0.12 L 0 0.3 L -0.09 0.12 Z'), 0.5),
  rot(shape('M -0.09 -0.64 L 0.09 -0.64 L 0.09 0.18 L 0 0.36 L -0.09 0.18 Z'), -0.45),
  rot(shape('M -0.07 -0.64 L 0.07 -0.64 L 0.07 -0.04 L 0 0.1 L -0.07 -0.04 Z'), 0.95),
  rot(shape('M -0.07 -0.64 L 0.07 -0.64 L 0.07 -0.1 L 0 0.04 L -0.07 -0.1 Z'), -0.95),
  ellipse(0, -0.64, 0.5, 0.1),
), seg(0, -0.54, 0, 0.5, 0.014), rot(seg(0, -0.5, 0, 0.24, 0.012), 0.5), rot(seg(0, -0.5, 0, 0.3, 0.012), -0.45));
const leviathan = (() => {
  const at = (a: number, r: number): [number, number] => [r * Math.cos(a), r * Math.sin(a)];
  const body = trace((t) => at(Math.PI * (0.62 + 1.75 * t), 0.5), 48), fins: SDF[] = [];
  for (let k = 1; k < 9; k++) {
    const a = Math.PI * (0.7 + 0.19 * k), [x, y] = at(a, 0.6), [x1, y1] = at(a + 0.12, 0.76), [x2, y2] = at(a + 0.2, 0.58);
    fins.push(poly([x, y, x1, y1, x2, y2]));
  }
  const [hx, hy] = at(Math.PI * 0.62, 0.5);
  return cut(union(path(body.slice().reverse(), 0.03, 0.13), ...fins,
    move(rot(union(shape('M 0 -0.1 Q 0.2 -0.14 0.38 -0.04 L 0.2 -0.02 L 0.34 0.06 Q 0.16 0.16 0 0.1 Z'), shape('M 0.02 0.08 L -0.14 0.3 L 0.1 0.12 Z')), -0.2), hx, hy)),
  circle(hx + 0.1, hy + 0.02, 0.025), circle(0, 0, 0.18));
})();
const phoenix = union(
  mirrorX(shape('M 0.06 0.1 Q 0.3 0.1 0.46 0.36 L 0.5 0.24 Q 0.62 0.46 0.62 0.72 L 0.7 0.6 Q 0.82 0.4 0.74 0.12 Q 0.6 -0.12 0.32 -0.16 Q 0.18 -0.14 0.06 -0.08 Z')),
  ellipse(0, -0.02, 0.12, 0.26), circle(0, 0.28, 0.1), shape('M 0.04 0.3 L 0.16 0.24 L 0.04 0.22 Z'),
  shape('M -0.04 0.34 Q -0.1 0.52 0.02 0.66 Q 0.0 0.5 0.08 0.44 Q 0.12 0.56 0.2 0.58 Q 0.14 0.44 0.06 0.34 Z'),
  path(curl(0, -0.24, -0.06, -0.62, 0.12, -1, 1.2), 0.07, 0.02),
  path(curl(0.06, -0.22, 0.3, -0.6, 0.1, 1, 1.2), 0.055, 0.016),
  path(curl(-0.06, -0.22, -0.3, -0.56, 0.1, -1, 1.2), 0.055, 0.016),
);

// ---------------------------------------------------------------- the catalogue

export type EmblemFinish = 'ink' | 'crystal' | 'gold' | 'spirit';
export interface EmblemDef {
  readonly name: string;
  readonly charge: SDF;
  /** How the charge is laid on: plain ink for most, the show-off ones in crystal, gold leaf or living light. */
  readonly finish: EmblemFinish;
}
const def = (name: string, charge: SDF, finish: EmblemFinish = 'ink'): EmblemDef => ({ name, charge, finish });

/** The league's captains: one charge each, chosen from the spirit each captain is named for. */
export const CAPTAIN_EMBLEMS = {
  swift: def('Swift', swift), narwhal: def('Narwhal', narwhal), goshawk: def('Goshawk', goshawk), wolf: def('Wolf', wolf),
  crab: def('Crab', crab), sun: def('Noon Sun', sun), waves: def('Tide', waves), risingSun: def('Dawn', risingSun),
  northStar: def('North Star', northStar), wind: def('Wind', wind), magpie: def('Magpie', magpie), fox: def('Fox', fox),
  raven: def('Raven', raven), lightning: def('Lightning', lightning), octopus: def('Octopus', octopus), turtle: def('Turtle', turtle),
  mountain: def('Mountain', mountain), oak: def('Oak', oak), pufferfish: def('Pufferfish', union(pufferfish, pufferEye)), lotus: def('Lotus', lotus),
  heron: def('Heron', heron), eclipse: def('Eclipse', eclipse), owl: def('Owl', owl), vulture: def('Vulture', vulture),
  nautilus: def('Nautilus', nautilus), clover: def('Clover', clover), scorpion: def('Scorpion', scorpion), stormCloud: def('Storm', stormCloud),
  comet: def('Comet', comet), flame: def('Flame', flame), whale: def('Whale', whale), serpent: def('Serpent', serpent),
  stag: def('Stag', stag), bearPaw: def('Bear', bearPaw), bat: def('Bat', bat), moth: def('Moth', moth),
  swordfish: def('Swordfish', swordfish), maple: def('Maple', maple), volcano: def('Volcano', volcano), starfish: def('Starfish', starfish),
} as const satisfies Record<string, EmblemDef>;

/** The player's choices, worn on the sail; the last three are the show-off emblems for Diamond, Admiral and Legend. */
export const PLAYER_EMBLEMS = {
  gull: def('Gull', gull), seahorse: def('Seahorse', seahorse), dolphin: def('Dolphin', dolphin), swan: def('Swan', swan),
  hare: def('Hare', hare), butterfly: def('Butterfly', butterfly), snowflake: def('Snowflake', snowflake), fern: def('Fern', fern),
  scallop: def('Scallop', scallop),
  crystal: def('Crystal Heart', crystal, 'crystal'), leviathan: def('Leviathan', leviathan, 'gold'), phoenix: def('Phoenix', phoenix, 'spirit'),
} as const satisfies Record<string, EmblemDef>;

export type CaptainEmblemId = keyof typeof CAPTAIN_EMBLEMS;
export type PlayerEmblemId = keyof typeof PLAYER_EMBLEMS;
export type EmblemId = CaptainEmblemId | PlayerEmblemId;
export const EMBLEMS: Record<EmblemId, EmblemDef> = { ...CAPTAIN_EMBLEMS, ...PLAYER_EMBLEMS };
export const CAPTAIN_EMBLEM_IDS = Object.keys(CAPTAIN_EMBLEMS) as CaptainEmblemId[];
export const PLAYER_EMBLEM_IDS = Object.keys(PLAYER_EMBLEMS) as PlayerEmblemId[];
export const EMBLEM_IDS = Object.keys(EMBLEMS) as EmblemId[];

/**
 * The old game's emblem names (src/career/league.ts) mapped to natural charges. Several old charges were things made
 * by hands (a tower, a key, an anchor, dice), which the plan rules out, so each captain gets the spirit of their name.
 */
export const LEGACY_EMBLEMS: Record<string, EmblemId> = {
  arrowhead: 'swift', crossedLances: 'narwhal', feather: 'goshawk', sunburst: 'wolf', ironKnot: 'crab', meridianArc: 'sun', waves: 'waves',
  risingSun: 'risingSun', eightPointStar: 'northStar', windRose: 'wind', diamond: 'magpie', crescent: 'fox', key: 'raven',
  lightningStroke: 'lightning', coin: 'octopus', hexagon: 'turtle', tower: 'mountain', anchor: 'oak', battlement: 'pufferfish',
  circle: 'lotus', hourglass: 'heron', eclipse: 'eclipse', twoRings: 'owl', brokenWheel: 'vulture', spiral: 'nautilus',
  wheelOfFortune: 'clover', die: 'scorpion', thunderbolt: 'stormCloud', comet: 'comet', flame: 'flame', gull: 'gull',
};

export const isEmblem = (id: string): id is EmblemId => id in EMBLEMS;
export const emblemCharge = (id: EmblemId): SDF => EMBLEMS[id].charge;

// ---------------------------------------------------------------- rendering

/** The roundel the rivals page sets each charge in, as the old atlas did. */
const FIELD = circle(0, 0, 0.94), BORDURE = ring(0, 0, 0.86, 0.028), INK = 0.016;

/**
 * One emblem as a roundel, RGBA, `size` square, in the old atlas's channels so the old shader still reads it:
 * R the field, G the charge, B the ink lines, A the whole roundel.
 */
export function emblemRoundel(id: EmblemId, size: number, out = new Uint8Array(4 * size * size), stride = size, ox = 0, oy = 0): Uint8Array {
  const charge = union(EMBLEMS[id].charge, BORDURE), px = 2 / size;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) * px - 1, y = (j + 0.5) * px - 1, fd = FIELD(x, y), cd = charge(x, y);
    const field = cover(fd, px), ink = Math.max(edge(fd, px, INK), edge(cd, px, INK) * field), o = 4 * ((oy + j) * stride + ox + i);
    out[o] = Math.round(255 * field);
    out[o + 1] = Math.round(255 * cover(cd, px) * field);
    out[o + 2] = Math.round(255 * ink);
    out[o + 3] = Math.round(255 * Math.max(field, ink));
  }
  return out;
}

export const ATLAS_COLS = 8;
/** Every emblem in one atlas (rows bottom-up, as a texture reads them), with each one's cell. */
export function emblemAtlas(cell = 128, ids: readonly EmblemId[] = EMBLEM_IDS): { data: Uint8Array; width: number; height: number; rects: Record<string, [number, number, number, number]> } {
  const rows = Math.ceil(ids.length / ATLAS_COLS), width = ATLAS_COLS * cell, height = rows * cell, data = new Uint8Array(4 * width * height);
  const rects: Record<string, [number, number, number, number]> = {};
  ids.forEach((id, k) => {
    const cx = k % ATLAS_COLS, cy = rows - 1 - Math.floor(k / ATLAS_COLS);
    emblemRoundel(id, cell, data, width, cx * cell, cy * cell);
    rects[id] = [cx / ATLAS_COLS, cy / rows, 1 / ATLAS_COLS, 1 / rows];
  });
  return { data, width, height, rects };
}

