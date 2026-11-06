// Where the sun and the moon stand over the planet for an hour of its clock and the season's tilt: the one rule the
// stage, the app and the actors all light by.
import { Vector3 } from 'three';

const DEG = Math.PI / 180;

/**
 * The sun's direction in the planet's frame. `hour` is the local solar time at longitude `lon` (degrees; 0 by
 * default, so then it is the planet's own clock): the sun stands over longitude lon - (hour - 12) × 15°, moving
 * west. `tilt` is the sun's latitude in degrees (positive: northern summer, midnight sun on the Ice Crown; negative:
 * polar night there). The same rule as the app's sunFor().
 */
export function sunDirection(hour: number, tilt: number, out = new Vector3(), lon = 0): Vector3 {
  const l = (lon - (hour - 12) * 15) * DEG, t = tilt * DEG, c = Math.cos(t);
  return out.set(c * Math.cos(l), Math.sin(t), -c * Math.sin(l));
}

/** The moon: nearly opposite the sun, a nearly full moon that lights the night side. */
export function moonDirection(hour: number, tilt: number, out = new Vector3(), lon = 0): Vector3 {
  const l = (lon - (hour - 12) * 15) * DEG + Math.PI + 0.45, lat = -tilt * DEG * 0.6 + 0.12, c = Math.cos(lat);
  return out.set(c * Math.cos(l), Math.sin(lat), -c * Math.sin(l));
}
