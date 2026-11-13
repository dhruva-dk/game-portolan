// The sun: the same time of day everywhere. On a planet 554 m round a sun fixed in space would set on a ship within a
// minute's sail (night is 870 m from noon), so the sun is not one direction for the whole planet but one for each
// place: it stands as high over every place as the clock says, and its bearing is carried from place to place.
//
// It is a function of the place and the match alone (its islands and the hour), so every eye, bot or player that
// stands in one place sees one sun there, and a ship's shadow falls the same way for all of them.
//
// Bearing. A sun at the same height everywhere and a bearing that turns smoothly from place to place is a tangent
// field without zeros on the sphere, which cannot be (Poincaré–Hopf: world/wind.ts's calms are the same fact). So it
// has one, and it is hidden where no ship can go: the sun is set at the anchor (the start, the first island's
// centre) by the compass there and carried (parallel transport, sphere.ts) along the great circle to the origin;
// from there to every place along the great circle between them. Along every great circle through the origin it
// keeps its bearing to the circle, so the sun moves over the sea no more than the sea's own curve turns it (a
// degree for every 9.7 m sailed). The one point it is undefined is the origin's antipode, put at the centre of a
// large island far from the anchor (sunPlaces): land, so no ship ever reaches it. Sailing across the great circles
// rather than along them, the sun turns a little more than the curve, by tan(θ/2) of it θ radians from the origin: no
// more than twice the curve's own but in the fifth of the planet nearest that island, and right round the island 2/r
// radians a metre r metres from its centre (twice round in a lap; for the default planet's, 59 m in radius, about 2°
// a metre on its beach and 0.8° at the edge of its apron, 145 m out).
//
// The hour is the sun's at LATITUDE on the solstice (DECLINATION): its height and its bearing at the anchor.
//
// Pure arithmetic: no three, so it runs in node for the tests.

import { add, dot, frameAt, normalize, scale, transport, type Vec3 } from './sphere.ts';

/** The latitude whose day the hours are, radians: the trade-wind tropics. */
export const LATITUDE = (10 * Math.PI) / 180;
/** The sun's declination: the solstice; fixed until seasons matter. */
export const DECLINATION = (23.44 * Math.PI) / 180;

/**
 * Where the match's sun is set: `anchor`, where its bearing is the compass's (up there), and `origin`, from which it
 * is carried everywhere (up there), with the sun there.
 */
export interface SunPlaces { anchor: Vec3; origin: Vec3 }

/**
 * The places for a planet's islands (their centres, coasts' radii and summits, metres; the first where the game
 * starts): the undefined point at the centre of the largest island a quarter of the way round the planet or more from
 * the start (the bearing turns round it as 2/r, so the broader the better), else of the farthest. Only those that
 * stand out of the sea.
 */
export function sunPlaces(all: readonly { chart: { at: Vec3 }; radius: number; summit: number }[]): SunPlaces {
  const islands = all.filter((s) => s.summit > 0);
  if (islands.length === 0) return { anchor: [0, 1, 0], origin: [0, 1, 0] };
  const anchor = islands[0].chart.at;
  const away = islands.slice(1).filter((s) => dot(normalize(s.chart.at), normalize(anchor)) <= 0);
  const far = away.length > 0
    ? away.reduce((a, b) => (b.radius > a.radius ? b : a)).chart.at
    : islands.length > 1
      ? islands.reduce((a, b) => (dot(b.chart.at, anchor) < dot(a.chart.at, anchor) ? b : a)).chart.at
      : scale(anchor, -1);
  return { anchor, origin: scale(far, -1) };
}

/** Toward the sun at `hours` (0–24) in a place's own frame, as (east, up, north): its height and its compass bearing. */
export function sunInSky(hours: number): Vec3 {
  const h = ((hours - 12) / 12) * Math.PI;
  const [sl, cl, sd, cd] = [Math.sin(LATITUDE), Math.cos(LATITUDE), Math.sin(DECLINATION), Math.cos(DECLINATION)];
  return [-cd * Math.sin(h), sl * sd + cl * cd * Math.cos(h), cl * sd - sl * cd * Math.cos(h)];
}

/** A unit vector toward the sun a (east, up, north) in the frame at p. */
const inFrame = (p: Vec3, a: Vec3): Vec3 => {
  const f = frameAt(p);
  return add(add(scale(f.east, a[0]), f.up, a[1]), f.north, a[2]);
};

/** Toward the sun at the origin at `hours`, world space: the anchor's sun carried there. */
export function sunAtOrigin(places: SunPlaces, hours: number): Vec3 {
  return carry(inFrame(places.anchor, sunInSky(hours)), places.anchor, places.origin);
}

/** A direction s over `from` carried to `to`: its height over the level kept, its bearing transported. */
function carry(s: Vec3, from: Vec3, to: Vec3): Vec3 {
  const a = normalize(from), b = normalize(to), y = dot(s, a);
  const level = add(s, a, -y);
  return normalize(add(transport(level, a, b), b, y));
}

/** Toward the sun over p (a vector from the centre, of any length) at `hours`, world space: a unit vector. */
export function sunAt(places: SunPlaces, hours: number, p: Vec3): Vec3 {
  return carry(sunAtOrigin(places, hours), places.origin, p);
}
