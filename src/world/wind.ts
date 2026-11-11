// The prevailing wind: the direction it blows toward at every point of the planet, a unit tangent there. Its speed
// is the same everywhere (Environment.windSpeed); only its direction varies, gently, from place to place.
//
// The wind runs along the level lines of a smooth potential φ on the sphere (the curl of φ: V = ∇φ × up, a quarter
// turn from the gradient, so it circles φ's high and low as the westerlies circle a pole). Here
//
//   φ(u) = a·u + ½ u·M u       a: a seeded axis; M: a seeded symmetric traceless matrix (a degree-2 harmonic) with a
//                              among its eigenvectors, ‖M‖ = BEND
//
// so ∇φ = g − (g·u)u with g = a + Mu, and V = g × u: closed form, no derivatives. Since Ma ∥ a, g ∥ u at ±a, and with
// ‖M‖ < 1 nowhere else, so the wind has exactly two calms, at ±a. No fewer is possible: a tangent field on a sphere
// must vanish somewhere (Poincaré–Hopf).
//
// Round a calm the wind turns once round, less the curvature it encloses: along a circle θ radians from the calm, by
// cot θ radians per radian of arc on average, whatever the field. On this small planet (anchors 205 m, 0.37 rad,
// apart), neighbouring anchors' winds differ by up to 120° in the triangle round each calm, 30–60° in the ring
// beyond, and nowhere else by more than 30° (tested): those few charts cross their wave trains, a confused sea, as at
// a real calm. That turning can be moved but not removed, and spread evenly is what keeps it smallest.
//
// So the calms are put where the sea's charts take it best: each at the centre of one of the anchors' triangles
// (lattice.ts), as far from every anchor as can be. No anchor's direction is then ill-defined or touchy, and the three
// round a calm meet at 120°, rather than two meeting head on across a calm on their border. (The icosphere is
// symmetric through its centre, so −a is a triangle's centre too.) The axis a is a seeded one of the triangles'
// centres within 40° of the north pole, so the wind blows roughly east, round the planet's axis. At ±a exactly, the
// direction is east (frameAt's): a guard, never seen.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { FREQUENCY, geodesic } from './lattice.ts';
import { random } from './random.ts';
import { add, cross, dot, frameAt, length, normalize, scale, type Vec3 } from './sphere.ts';

/** The prevailing wind's direction at a point (a vector from the centre, of any length): a unit tangent there. */
export type Wind = (p: Vec3) => Vec3;

/** How far the degree-2 term bends the wind from circles round the axis: M's largest eigenvalue. */
const BEND = 0.15;
/** The calms lie no further than this from the poles, radians. */
const TILT = (40 * Math.PI) / 180;

type Matrix = [Vec3, Vec3, Vec3];
const times = (m: Matrix, u: Vec3): Vec3 => [dot(m[0], u), dot(m[1], u), dot(m[2], u)];

/** The seed's potential: its axis a (the northern calm) and M, as rows. */
function potential(seed: number): { a: Vec3; m: Matrix } {
  const next = random(seed ^ 0x77696e64); // "wind": a stream of its own, apart from the planet's
  const { points, triangles } = geodesic(FREQUENCY);
  const centres = triangles
    .map(([i, j, k]) => normalize(add(add(points[i], points[j]), points[k])))
    .filter((c) => c[1] > Math.cos(TILT));
  const a = centres[Math.floor(next() * centres.length)];
  // M = Σ λ e eᵀ over a and two axes b, c across it (turned by a seeded angle), λ traceless and at most BEND
  const east = frameAt(a).east, north = cross(a, east), turn = 2 * Math.PI * next();
  const b = add(scale(east, Math.cos(turn)), north, Math.sin(turn)), c = cross(a, b);
  const la = 2 * next() - 1, lb = 2 * next() - 1, l = [la, lb, -la - lb];
  const k = BEND / Math.max(...l.map(Math.abs));
  const row = (r: number): Vec3 => add(add(scale(a, k * l[0] * a[r]), b, k * l[1] * b[r]), c, k * l[2] * c[r]);
  return { a, m: [row(0), row(1), row(2)] };
}

/** The planet's prevailing wind for a seed: the same field every time. */
export function createWind(seed: number): Wind {
  const { a, m } = potential(seed);
  return (p) => {
    const u = normalize(p);
    const v = cross(add(a, times(m, u)), u);
    const size = length(v);
    return size > 1e-9 ? scale(v, 1 / size) : frameAt(u).east;
  };
}

/** The wind's two calms for a seed, unit vectors: the northern one first. */
export function calms(seed: number): [Vec3, Vec3] {
  const { a } = potential(seed);
  return [a, scale(a, -1)];
}
