// Where the island lies on the planet. Its ground (world/terrain.ts) and what stands on it (world/scatter.ts) are
// worked out flat, in metres on the island's own chart (world/sphere.ts: x east, z south of its centre); this lays
// them on the sphere: a chart point and a height become a world position, and the chart's x, up and z there become
// what stands there's axes.

import { Matrix4, Vector3 } from 'three/webgpu';
import { chartBasis, fromChart, fromLatLon, frameAt, place, type Chart, type Vec3 } from '../world/sphere';
import { createIsland, type Island } from '../world/terrain';

/** The island's centre, radians: in the tropics. */
const LATITUDE = (12 * Math.PI) / 180, LONGITUDE = 0;

export interface Site {
  island: Island;
  /** The island's chart: centred on it, x east. */
  chart: Chart;
}

export function createSite(): Site {
  const at = fromLatLon(LATITUDE, LONGITUDE);
  return { island: createIsland([0, 0]), chart: { at, axis: frameAt(at).east } };
}

/** The world position `height` metres up at chart point (x, z), and the chart's axes there: x (e1), up, z (e2). */
export function onSphere(site: Site, x: number, height: number, z: number): { p: Vec3; e1: Vec3; up: Vec3; e2: Vec3 } {
  const up = fromChart(site.chart, x, z);
  const [e1, e2] = chartBasis(site.chart, up);
  return { p: place(up, height), e1, up, e2 };
}

const basis = new Matrix4(), e1 = new Vector3(), up = new Vector3(), e2 = new Vector3();

/**
 * The world matrix of a thing standing at chart point (x, z), its foot `height` metres up: its own matrix `local`
 * (turned and scaled, in the chart's axes: x, up, z) carried to the sphere.
 */
export function standing(site: Site, x: number, height: number, z: number, local: Matrix4, out: Matrix4): Matrix4 {
  const s = onSphere(site, x, height, z);
  basis.makeBasis(e1.set(...s.e1), up.set(...s.up), e2.set(...s.e2)).setPosition(...s.p);
  return out.multiplyMatrices(basis, local);
}
