// Stones and weed strewn over the sea floor, seen through the water: stones up to a stride across, bold enough to read
// from the masthead, thickest where the ground's cover has rubble; and tufts of weed, thickest round the sea grass and scattered over the
// bare sand. Flat shapes with crisp edges, laid on the sand by sand.ts in their own tones.
//
// Each is a lattice of cells in the world (so the floor's mesh can slide beneath them), each cell holding at most
// one: a ball set wholly inside it, so a pixel needs only its own cell's hash; the floor cuts the balls at every
// height, so their sizes vary. Near the eye only: farther off, where a stone is under a pixel, they fade to the
// mean of the pattern they make (so the floor's tone doesn't change), and are not worked out at all past FAR.

import { Fn, If, cameraPosition, float, floor, fract, length, mix, mx_cell_noise_float, select, smoothstep, vec2, vec3 } from 'three/tsl';
import type { FloatNode, Vec2Node, Vec3Node, Vec4Node } from '../tsl.ts';

/** Cells of each, metres; the share of cells that hold one; its radius's range, as a share of the cell; and how far
 *  into its ball (0 at its rim … 1 at its middle) its shape's edge is cut, CRISP wide. */
const STONE = { cell: 2.4, share: 0.55, radius: [0.12, 0.32], rim: 0.15 };
const TUFT = { cell: 3.2, share: 0.4, radius: [0.18, 0.38], rim: 0.3 };
const CRISP = 0.06;
/** They fade to their mean from NEAR metres from the eye to FAR. */
const NEAR = 50, FAR = 90;
/** Stones lie this deep and deeper, metres (above, the surf rolls them away). */
const SHALLOWEST = 0.3;

/**
 * 0…1 how much of the ball in p's cell (p in cells) the floor cuts there, 1 at its middle, and whether the cell holds
 * one; k keeps each lattice's hashes apart.
 */
const ball = (p: Vec3Node, share: number, radius: number[], k: number): FloatNode => {
  const cell = floor(p), f = fract(p);
  const h = (o: number): FloatNode => mx_cell_noise_float(cell.add(k + o * 7.31));
  const r = mix(float(radius[0]), float(radius[1]), h(0));
  // the centre kept a radius from the cell's walls
  const centre = vec3(h(1), h(2), h(3)).mul(float(1).sub(r.mul(2))).add(r);
  const inside = float(1).sub(length(f.sub(centre)).div(r)).clamp(0, 1);
  return inside.mul(select(h(4).lessThan(share), float(1), float(0)));
};

/** strewn(p, height, cover): how much of the floor at world position p the stones cover, and the weed (x, y). */
export function createStrewn() {
  // their cover's mean: a ball cut at random heights covers 2/3 of its disc on average, less its rim
  const mean = (s: typeof STONE) => s.share * Math.PI * ((s.radius[0] + s.radius[1]) / 2) ** 2 * 0.55;
  return Fn(([p, height, cover]: [Vec3Node, FloatNode, Vec4Node]): Vec2Node => {
    const deep = smoothstep(-SHALLOWEST, -SHALLOWEST - 0.5, height);
    // how thickly each lies here: where thin, the shapes are smaller, not fainter
    const stones = deep.mul(cover.y.mul(0.85).add(0.15)), tufts = deep.mul(smoothstep(0.02, 0.4, cover.x).mul(0.8).add(0.2));
    const s = stones.mul(mean(STONE)).toVar(), t = tufts.mul(mean(TUFT)).toVar();
    const far = length(p.sub(cameraPosition));
    If(far.lessThan(FAR).and(deep.greaterThan(0)), () => {
      const fade = smoothstep(NEAR, FAR, far);
      const shape = (lattice: typeof STONE, thick: FloatNode, k: number): FloatNode =>
        smoothstep(lattice.rim, lattice.rim + CRISP, ball(p.div(lattice.cell), lattice.share, lattice.radius, k).mul(thick.mul(0.6).add(0.4)));
      s.assign(mix(shape(STONE, stones, 0), s, fade));
      t.assign(mix(shape(TUFT, tufts, 101), t, fade));
    });
    return vec2(s, t);
  });
}
