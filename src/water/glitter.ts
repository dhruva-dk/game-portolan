// Glitter: the sun's glint off the ripples too small for any cascade, as the eye sees it — not an even sheet but a
// scatter of flashes, each a facet that happens to tilt the sun's light into the eye.
//
// The sea's specular lobe (optics.ts) is the glint's mean over a pixel. Within the pixel lie N ripple facets (its area over
// FACET²), and each reflects the sun toward the eye with a small chance P: the lobe's density at the half vector times
// the solid angle a facet's sun covers (Ω, the sun's disc widened by the facet's own curvature), as a share of the
// half vectors (Walter et al. 2007). So the number that flash is Poisson, mean λ = N·P, and the pixel's glint is the
// mean times k/λ for the k drawn: the same on average (energy kept), but where λ is small — near, and at high wind,
// where the lobe is broad and low — a few pixels flash and the rest are dark between, and where λ is large — far
// off, or on a calm sea, where each facet glints more surely — the flashes average back into the even lobe.
// (After Deliot & Belcour 2023, "Real-time rendering of glinty appearances using distributed binomial laws on
// anisotropic grids", without their anisotropy.)
//
// The draws are made on a grid fixed to the sea (the first chart's coordinates), its cells as wide as the pixel's
// footprint, so they stay where they are as the eye moves and never alias; between two cell sizes the two draws are
// blended, so no edge shows where the grid's size steps. Each cell draws anew RATE times a second, at its own moments:
// the ripples run on and the flashes twinkle.

import { clamp, exp, float, floor, fract, hash, log2, max, min, mix, select, sqrt, time, uint, vec2 } from 'three/tsl';

type N = any;

/** About how wide a ripple facet is, metres: a capillary ripple's flank. */
const FACET = 0.01;
/** The solid angle a facet reflects the sun over, sr: the sun's disc (6.8e-5) widened by the facet's curvature (~3°). */
const OMEGA = 8e-3;
/** Times a second each cell draws anew. */
const RATE = 8;
/** The draw's grid: its finest cells, metres. */
const FINEST = 0.005;

/** A uniform 0…1 for cell (x, y) at level, in time slot `slot`, salted. */
const draw = (x: N, y: N, level: N, slot: N, salt: number): N => hash(
  x.toUint().mul(uint(73856093)).bitXor(y.toUint().mul(uint(19349663))).bitXor(level.toUint().mul(uint(83492791)))
    .bitXor(slot.toUint().mul(uint(2654435761))).add(uint(salt)),
);

/** Poisson's k for mean λ, by inverse CDF from the uniform u, as k/λ: up to 8 terms, past which it is near enough normal. */
function poisson(lambda: N, u: N, g: N): N {
  let p: N = exp(lambda.negate()), cdf: N = p, k: N = float(0);
  for (let i = 1; i <= 8; i++) {
    k = k.add(select(u.greaterThan(cdf), float(1), float(0)));
    p = p.mul(lambda).div(i);
    cdf = cdf.add(p);
  }
  return mix(k.div(lambda), max(g.div(sqrt(lambda)).add(1), 0), clamp(lambda.sub(6).div(4), 0, 1));
}

/**
 * The glint's multiplier at chart position q (metres), for a pixel whose footprint on the sea is `area` (m²) and
 * `width` (its longer side, m), where the lobe's density at the half vector is D, n·h is nh and h·l is hl.
 */
export function glitter(q: N, area: N, width: N, D: N, nh: N, hl: N): N {
  const P = min(D.mul(nh).mul(OMEGA).div(max(hl.mul(4), 1e-3)), 1);
  const lambda = max(area.div(FACET * FACET).mul(P), 1e-4);
  const level = max(log2(width.div(FINEST)), 0);
  const at = (l: N): N => {
    const size = float(2).pow(l).mul(FINEST);
    // (offset so the cells' indices are positive)
    const cell = floor(q.div(size)).add(vec2(1 << 22));
    const slot = floor(time.mul(RATE).add(draw(cell.x, cell.y, l, float(0), 1)));
    const u = draw(cell.x, cell.y, l, slot, 2);
    // a normal draw for the many: the sum of two uniforms' deviations, scaled to unit variance
    const g = draw(cell.x, cell.y, l, slot, 3).add(draw(cell.x, cell.y, l, slot, 4)).sub(1).mul(Math.sqrt(6));
    return poisson(lambda, u, g);
  };
  const l0 = floor(level);
  return mix(at(l0), at(l0.add(1)), fract(level));
}
