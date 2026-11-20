// The sun: the same time of day everywhere. On a planet 554 m round a sun fixed in space would set on a ship within a
// minute's sail (night is 870 m from noon), so the sun is not one direction for the whole planet but one for each
// place: it stands as high over every place as the clock says, and its bearing is carried from place to place.
//
// It is a function of the place and the match alone (its planet and the hour), so every eye, bot or player that
// stands in one place sees one sun there, and a ship's shadow falls the same way for all of them.
//
// Bearing. A sun at the same height everywhere and a bearing that turns smoothly from place to place is a tangent
// field without zeros on the sphere, which cannot be (Poincaré–Hopf: world/wind.ts's calms are the same fact). So it
// has one, and it is hidden where no ship can go: the sun is set at the anchor (where she starts) by the compass there
// and carried (parallel transport, sphere.ts) along the great circle to the origin; from there to every place along
// the great circle between them. Along every great circle through the origin it keeps its bearing to the circle, so
// the sun moves over the sea no more than the sea's own curve turns it (a degree for every 9.7 m sailed). The one
// point it is undefined is the origin's antipode, put at the land's heart far from the anchor (sunPlaces): land, so no
// ship ever reaches it. Sailing across the great circles rather than along them, the sun turns a little more than the
// curve, by tan(θ/2) of it θ radians from the origin: no more than twice the curve's own but in the fifth of the planet
// nearest the heart, and right round it 2/r radians a metre r metres from it (twice round in a lap; for the release's
// planet, its heart some 150 m in from the coast, about 0.7° a metre at the coast).
//
// The hour is the sun's at LATITUDE on the solstice (DECLINATION): its height and its bearing at the anchor.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { add, dot, frameAt, normalize, put, scale, transport, type FrameOut, type Out3, type Vec3 } from './sphere.ts';

/** The latitude whose day the hours are, radians: the trade-wind tropics. */
const LATITUDE = (10 * Math.PI) / 180;
/** The sun's declination: the solstice; fixed until seasons matter. */
const DECLINATION = (23.44 * Math.PI) / 180;

/**
 * Where the match's sun is set: `anchor`, where its bearing is the compass's (up there), and `origin`, from which it
 * is carried everywhere (up there), with the sun there.
 */
export interface SunPlaces { anchor: Vec3; origin: Vec3 }

/**
 * The places for a planet: set at the start, `start`, and its undefined point at `heart`, the land's point farthest in
 * from the coast a quarter of the way round the planet or more from the start (planet.ts; the bearing turns round it
 * as 2/r, so the farther in the better).
 */
export const sunPlaces = (start: Vec3, heart: Vec3): SunPlaces => ({ anchor: start, origin: scale(normalize(heart), -1) });

/** Toward the sun at `hours` (0–24) in a place's own frame, as (east, up, north): its height and its compass bearing
 *  (into `out`). */
export function sunInSky(hours: number, out?: Out3): Vec3 {
  const h = ((hours - 12) / 12) * Math.PI;
  const sl = Math.sin(LATITUDE), cl = Math.cos(LATITUDE), sd = Math.sin(DECLINATION), cd = Math.cos(DECLINATION);
  return put(out, -cd * Math.sin(h), sl * sd + cl * cd * Math.cos(h), cl * sd - sl * cd * Math.cos(h));
}

/** The working vectors of what follows: each written over each call, so nothing is made once warm. */
const frame: FrameOut = { up: [0, 0, 0], east: [0, 0, 0], north: [0, 0, 0] };
const sky: Out3 = [0, 0, 0], here: Out3 = [0, 0, 0], ca: Out3 = [0, 0, 0], cb: Out3 = [0, 0, 0], level: Out3 = [0, 0, 0];

/** A unit vector toward the sun a (east, up, north) in the frame at p (into `out`, not a). */
const inFrame = (p: Vec3, a: Vec3, out?: Out3): Vec3 => {
  const f = frameAt(p, frame);
  return add(add(scale(f.east, a[0], out), f.up, a[1], out), f.north, a[2], out);
};

/** Toward the sun at the origin at `hours`, world space: the anchor's sun carried there (into `out`). */
export function sunAtOrigin(places: SunPlaces, hours: number, out?: Out3): Vec3 {
  return carry(inFrame(places.anchor, sunInSky(hours, sky), here), places.anchor, places.origin, out);
}

/** A direction s over `from` carried to `to`: its height over the level kept, its bearing transported (into `out`,
 *  which may be s). */
function carry(s: Vec3, from: Vec3, to: Vec3, out?: Out3): Vec3 {
  const a = normalize(from, ca), b = normalize(to, cb), y = dot(s, a);
  add(s, a, -y, level);
  return normalize(add(transport(level, a, b, level), b, y, level), out);
}

/** Toward the sun over p (a vector from the centre, of any length) at `hours`, world space: a unit vector (into
 *  `out`). */
export function sunAt(places: SunPlaces, hours: number, p: Vec3, out?: Out3): Vec3 {
  return carry(sunAtOrigin(places, hours, here), places.origin, p, out);
}
