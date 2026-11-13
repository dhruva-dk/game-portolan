// The planet: a sphere of radius R metres, its centre at the world's origin. All the sphere's arithmetic on the CPU
// lives here (the GPU's mirror of it is src/view/view.ts); nothing else derives numbers from R by hand.
//
// Points are given as vectors from the centre, of any length: only their direction counts, and the points this
// returns are unit vectors ("ups"). A point's height above the sea is its length less R (altitude, place).
//
// Directions in a point's own frame follow three's axes: x east, y up, z south (so east × up = south).
//
// A chart flattens the sphere round a point `at` (azimuthal equidistant): a point's chart position is its distance
// from `at` along the surface, in metres, along the bearing it lies at; chart x runs along `axis` (a tangent at
// `at`) and chart z along axis × at, as three's x and z run about y. Distances from `at` are kept exactly; across
// them the chart stretches, by θ / sin θ at an arc of θ radians (about 1.04 at a fifth of a radian).
//
// Pure arithmetic: no three, so it runs in node for the tests.

export const R = 554;

export type Vec3 = readonly [number, number, number];
/** A point's local axes: up, and the two horizontal compass directions. */
export interface Frame { up: Vec3; east: Vec3; north: Vec3 }
/** An azimuthal-equidistant chart about `at` (a unit vector), its x axis along `axis` (a unit tangent at `at`). */
export interface Chart { at: Vec3; axis: Vec3 }

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
/** a + b·k. */
export const add = (a: Vec3, b: Vec3, k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const length = (a: Vec3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
export const normalize = (a: Vec3): Vec3 => scale(a, 1 / length(a));

/** The point at a latitude and longitude, radians: the north pole is +y, longitude 0 is +x, and east runs toward −z there. */
export function fromLatLon(lat: number, lon: number): Vec3 {
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}

/** The world position `altitude` metres above the sea over the point `up`. */
export const place = (up: Vec3, altitude: number): Vec3 => scale(normalize(up), R + altitude);
/** Metres above the sea. */
export const altitude = (p: Vec3) => length(p) - R;

/** Up, east and north at a point. At the poles, where east is undefined, it is taken as −z. */
export function frameAt(p: Vec3): Frame {
  const up = normalize(p);
  const e = cross([0, 1, 0], up);
  const east = length(e) > 1e-9 ? normalize(e) : ([0, 0, -1] as Vec3);
  return { up, east, north: cross(up, east) };
}

/** The chart's second axis, z: axis × at. */
const zAxis = (c: Chart): Vec3 => cross(c.axis, c.at);

/** chartAt's answer for the one-off reads (toChart, chartBasis). */
const scratch = new Float64Array(8);

/**
 * Where the point (x, y, z) (a vector from the centre, any length) lies on the chart, metres, written into out[0] and
 * out[1]; and if `axes`, the chart's x and z axes carried there (chartBasis's) into out[2…4] and out[5…7]. Nothing is
 * made: for the loops that read many points (world/swell.ts).
 */
export function chartAt(c: Chart, x: number, y: number, z: number, out: Float64Array, axes = false) {
  const [ax, ay, az] = c.at, [bx, by, bz] = c.axis;
  const k = 1 / Math.sqrt(x * x + y * y + z * z), ux = x * k, uy = y * k, uz = z * k;
  // the direction from `at` toward the point in `at`'s tangent plane, and the arc between them
  const cosT = ux * ax + uy * ay + uz * az;
  let dx = ux + ax * -cosT, dy = uy + ay * -cosT, dz = uz + az * -cosT;
  const s = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (s > 1e-12) {
    const i = 1 / s;
    dx *= i;
    dy *= i;
    dz *= i;
  } else [dx, dy, dz] = [bx, by, bz];
  const theta = Math.atan2(s, cosT);
  // the chart's z axis: axis × at
  const zx = by * az - bz * ay, zy = bz * ax - bx * az, zz = bx * ay - by * ax;
  const cp = dx * bx + dy * by + dz * bz, sp = dx * zx + dy * zy + dz * zz;
  out[0] = cp * theta * R;
  out[1] = sp * theta * R;
  if (!axes) return;
  // the radial direction carried to the point, and the one across it (dir × at), which the carrying leaves as it is
  const ct = Math.cos(theta), st = Math.sin(theta);
  const gx = dx * ct + ax * -st, gy = dy * ct + ay * -st, gz = dz * ct + az * -st;
  const tx = dy * az - dz * ay, ty = dz * ax - dx * az, tz = dx * ay - dy * ax;
  out[2] = gx * cp + tx * -sp;
  out[3] = gy * cp + ty * -sp;
  out[4] = gz * cp + tz * -sp;
  out[5] = gx * sp + tx * cp;
  out[6] = gy * sp + ty * cp;
  out[7] = gz * sp + tz * cp;
}

/** Where p lies on the chart, metres. */
export function toChart(c: Chart, p: Vec3): [x: number, z: number] {
  chartAt(c, p[0], p[1], p[2], scratch);
  return [scratch[0], scratch[1]];
}

/** The point at chart position (x, z). */
export function fromChart(c: Chart, x: number, z: number): Vec3 {
  const r = Math.hypot(x, z);
  if (r < 1e-12) return c.at;
  const theta = r / R;
  const dir = add(scale(c.axis, x / r), zAxis(c), z / r);
  return normalize(add(scale(c.at, Math.cos(theta)), dir, Math.sin(theta)));
}

/**
 * The chart's x and z axes carried to p along the great circle from `at`: unit tangents at p, e1 × up = e2. They are
 * the chart's own directions exactly along that circle and across it; elsewhere the chart's stretch bends them a little.
 */
export function chartBasis(c: Chart, p: Vec3): [e1: Vec3, e2: Vec3] {
  chartAt(c, p[0], p[1], p[2], scratch, true);
  return [[scratch[2], scratch[3], scratch[4]], [scratch[5], scratch[6], scratch[7]]];
}

/** From p, `metres` along the surface in the direction of tangent t: the point reached and the tangent there. */
export function along(p: Vec3, t: Vec3, metres: number): { p: Vec3; t: Vec3 } {
  const u = normalize(p), a = metres / R, c = Math.cos(a), s = Math.sin(a);
  const q = normalize(add(scale(u, c), t, s));
  const k = add(scale(t, c), u, -s);
  return { p: q, t: normalize(add(k, q, -dot(k, q))) };
}

/**
 * Tangent t at `from` carried to `to` along the great circle between them (parallel transport): turned with the
 * surface, its length kept.
 */
export function transport(t: Vec3, from: Vec3, to: Vec3): Vec3 {
  const a = normalize(from), b = normalize(to);
  const w = cross(a, b), c = dot(a, b);
  const size = length(t);
  // Rodrigues' rotation taking a to b: v·c + w × v + w (w·v)/(1 + c)
  let v = c > -1 + 1e-9 ? add(add(scale(t, c), cross(w, t)), w, dot(w, t) / (1 + c)) : t;
  v = add(v, b, -dot(v, b));
  const l = length(v);
  return l > 1e-12 ? scale(v, size / l) : v;
}

/** Metres along the surface between two points. */
export function distance(a: Vec3, b: Vec3): number {
  // (normalize, cross, length and dot as above, written out: nothing made, the same arithmetic)
  const k = 1 / length(a), l = 1 / length(b);
  const ux = a[0] * k, uy = a[1] * k, uz = a[2] * k, vx = b[0] * l, vy = b[1] * l, vz = b[2] * l;
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return R * Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), ux * vx + uy * vy + uz * vz);
}

/**
 * Whether a and b surely lie more than `metres` apart along the surface, by their dot product alone (no root, no
 * trig): it may answer no for points a little beyond, never yes for points within. For the loops that pass over the
 * far before measuring the near with distance.
 */
export function apart(a: Vec3, b: Vec3, metres: number): boolean {
  // the arc's cosine against 1 − t²/2, which never exceeds cos t
  const t = metres / R, k = 1 - (t * t) / 2, c = dot(a, b), c2 = c * c, l2 = dot(a, a) * dot(b, b);
  return k >= 0 ? c < 0 || c2 < k * k * l2 : c < 0 && c2 > k * k * l2;
}

/** How far below the level the sea's horizon lies, radians, for an eye `height` metres up. */
export function horizonDip(height: number): number {
  const h = Math.max(height, 0);
  return Math.atan2(Math.sqrt(h * (2 * R + h)), R);
}

/** How far over the sea the horizon lies, metres along the surface, for an eye `height` metres up. */
export const horizonDistance = (height: number) => R * horizonDip(height);

/**
 * The sky's elevation for a true one, radians: the eye's sky is Earth's, drawn for an eye at the sea, so the
 * elevations are stretched to put Earth's horizon where the sea's lies (dip below the level), the zenith kept.
 */
export const skyElevation = (e: number, dip: number) => (e + dip) / (1 + (2 * dip) / Math.PI);

/** A world direction as the eye's sky sees it: in the eye's frame (x east, y up, z south), its elevation stretched. */
export function toSky(f: Frame, dip: number, dir: Vec3): Vec3 {
  const d = normalize(dir);
  const x = dot(d, f.east), y = dot(d, f.up), z = -dot(d, f.north);
  const e = skyElevation(Math.asin(Math.max(-1, Math.min(1, y))), dip);
  const h = Math.hypot(x, z);
  const [hx, hz] = h > 1e-12 ? [x / h, z / h] : [1, 0];
  return [hx * Math.cos(e), Math.sin(e), hz * Math.cos(e)];
}

// ------------------------------------------------------------------ the cube

/** An axis (0 x, 1 y, 2 z) and a sign. */
export type Axis = readonly [0 | 1 | 2, 1 | -1];

/**
 * The cube's six faces, written once (faceUV and faceDir here, cells.ts, and the shaders' view/cube.ts all keep to it;
 * tests/sphere.test.ts holds them to it): the axis each lies across (with its sign), and the signed axes its u and v run
 * along. A direction q on face f has the gnomonic coordinates (u's axis, v's axis) of q over f's axis, each signed. A
 * direction lies on the face of its largest component; ties go to x before y before z.
 */
export const FACES: readonly { across: Axis; u: Axis; v: Axis }[] = [
  { across: [0, 1], u: [2, -1], v: [1, 1] },
  { across: [0, -1], u: [2, 1], v: [1, 1] },
  { across: [1, 1], u: [0, 1], v: [2, -1] },
  { across: [1, -1], u: [0, 1], v: [2, 1] },
  { across: [2, 1], u: [0, 1], v: [1, 1] },
  { across: [2, -1], u: [0, -1], v: [1, 1] },
];

export interface FaceUV { face: number; u: number; v: number }

/** The cube face p lies on, and where on it, u and v in −1…1, spaced evenly in angle (an equi-angular cube). */
export function faceUV(p: Vec3): FaceUV {
  const [x, y, z] = p;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  let face: number, gu: number, gv: number;
  if (ax >= ay && ax >= az) {
    face = x >= 0 ? 0 : 1;
    gu = (x >= 0 ? -z : z) / ax;
    gv = y / ax;
  } else if (ay >= az) {
    face = y >= 0 ? 2 : 3;
    gu = x / ay;
    gv = (y >= 0 ? -z : z) / ay;
  } else {
    face = z >= 0 ? 4 : 5;
    gu = (z >= 0 ? x : -x) / az;
    gv = y / az;
  }
  return { face, u: Math.atan(gu) * (4 / Math.PI), v: Math.atan(gv) * (4 / Math.PI) };
}

/** The unit vector at (u, v) on a cube face: faceUV's inverse. */
export function faceDir(face: number, u: number, v: number): Vec3 {
  const gu = Math.tan(u * (Math.PI / 4)), gv = Math.tan(v * (Math.PI / 4));
  const faces: Vec3[] = [[1, gv, -gu], [-1, gv, gu], [gu, 1, -gv], [gu, -1, gv], [gu, gv, 1], [-gu, gv, -1]];
  return normalize(faces[face]);
}
