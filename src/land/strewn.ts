// Stones and weed strewn over the sea floor, seen through the water: small stones, a few centimetres to a hand across,
// thickest where the ground's cover has rubble; and tufts of weed, thickest round the sea grass and scattered over the
// bare sand. Shading only, laid on the sand by sand.ts.
//
// Each is a lattice of cells in the world (so the floor's mesh can slide beneath them), each cell holding at most
// one: a ball set wholly inside it, so a pixel needs only its own cell's hash; the floor cuts the balls at every
// height, so their sizes vary. Near the eye only: farther off, where a stone is under a pixel, they fade to the
// mean of the pattern they make (so the floor's tone doesn't change), and are not worked out at all past FAR.

import { Fn, If, cameraPosition, float, floor, fract, length, mix, mx_cell_noise_float, select, smoothstep, vec3, vec4 } from 'three/tsl';

type N = any;

/** Cells of each, metres; the share of cells that hold one; its radius's range, as a share of the cell. */
const STONE = { cell: 0.6, share: 0.55, radius: [0.12, 0.32] };
const TUFT = { cell: 1.5, share: 0.4, radius: [0.18, 0.38] };
/** Albedos: the stones' grey-brown, the weed's olive. */
const STONE_ALBEDO = [0.11, 0.09, 0.07];
const TUFT_ALBEDO = [0.045, 0.06, 0.025];
/** They fade to their mean from NEAR metres from the eye to FAR. */
const NEAR = 25, FAR = 50;
/** Stones lie this deep and deeper, metres (above, the surf rolls them away). */
const SHALLOWEST = 0.3;

/**
 * 0…1 how much of the ball in p's cell (p in cells) the floor cuts there, 1 at its middle, and whether the cell holds
 * one; k keeps each lattice's hashes apart.
 */
const ball = (p: N, share: number, radius: number[], k: number): N => {
  const cell = floor(p), f = fract(p);
  const h = (o: number): N => mx_cell_noise_float(cell.add(k + o * 7.31));
  const r = mix(float(radius[0]), float(radius[1]), h(0));
  // the centre kept a radius from the cell's walls
  const centre = vec3(h(1), h(2), h(3)).mul(float(1).sub(r.mul(2))).add(r);
  const inside = float(1).sub(length(f.sub(centre)).div(r)).clamp(0, 1);
  return inside.mul(select(h(4).lessThan(share), float(1), float(0)));
};

/** strewn(p, height, cover): the stones' and weed's albedo at world position p and how much they cover (rgb, a). */
export function createStrewn() {
  // their cover's mean: a ball cut at random heights covers 2/3 of its disc on average, less its softened rim
  const mean = (s: typeof STONE) => s.share * Math.PI * ((s.radius[0] + s.radius[1]) / 2) ** 2 * 0.55;
  return Fn(([p, height, cover]: [N, N, N]) => {
    const deep = smoothstep(-SHALLOWEST, -SHALLOWEST - 0.5, height);
    const stones = deep.mul(cover.y.mul(0.85).add(0.15)), tufts = deep.mul(smoothstep(0.02, 0.4, cover.x).mul(0.8).add(0.2));
    const s = float(mean(STONE)).toVar(), t = float(mean(TUFT)).toVar();
    const far = length(p.sub(cameraPosition));
    If(far.lessThan(FAR).and(deep.greaterThan(0)), () => {
      const fade = smoothstep(NEAR, FAR, far);
      s.assign(mix(smoothstep(0, 0.35, ball(p.div(STONE.cell), STONE.share, STONE.radius, 0)), s, fade));
      t.assign(mix(smoothstep(0, 0.6, ball(p.div(TUFT.cell), TUFT.share, TUFT.radius, 101)), t, fade));
    });
    const a: N = s.mul(stones), b: N = t.mul(tufts), stone: N = vec3(...STONE_ALBEDO);
    return vec4(mix(stone, vec3(...TUFT_ALBEDO), b.div(a.add(b).max(1e-4))), a.max(b));
  });
}
