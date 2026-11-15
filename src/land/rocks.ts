// The islands' rocks (scatter.ts says where): big masses heaped into outcrops and the boulders round them. A handful
// of shapes of each (rock-shape.ts), each drawn once for all its rocks on the islands in view (site.ts).
//
// The biome's rock: palm keys' terracotta in the sun and plum out of it (palette.ts), each facet one flat tone: the facets' own normals, never the
// shape's smoothed ones. Darker in a band where the sea wets them. Lit like everything else (sky/light.ts).
//
// Triangles: 20 × (detail + 1)² a shape: 2880 for a mass, 500 for a boulder; on the islands far from the eye (FAR:
// islands.ts), where a mass is a few pixels across, each shape at a coarser level of the same lumps: 720 and 180; and
// on those farther still (GROUND_FAR: from orbit, where it is a pixel or two), 180 and 80.

import { Euler, Matrix4, MeshBasicNodeMaterial, Quaternion, Vector3 } from 'three/webgpu';
import { Fn, attribute, cross, dFdx, dFdy, dot, float, length, max, mix, normalWorld, positionWorld, select, vec3 } from 'three/tsl';
import type { Tones } from '../palette';
import type { View } from '../view/view';
import type { Rock } from '../world/scatter';
import type { Chart } from '../world/sphere';
import type { Light } from '../sky/light';
import { rockShape } from './rock-shape';
import { createInstances, standing, type Placed } from './site';
import { cut } from '../tsl';

/** How many shapes of each kind, and how finely each is made, near, far, and distant (from orbit). */
export const KINDS = { big: { shapes: 4, detail: 11, far: 5, distant: 2 }, boulder: { shapes: 4, detail: 4, far: 2, distant: 1 } };
/** A rock is wet up to this many metres over the sea, and darker there by this much. */
const WET_TO = 0.3, WET = 0.72;
/** How deep in a crack (0…1) a rock is drawn in its shadow tone whatever the sun. */
const CAVITY = 0.5;

/** rocks[i]: those on island i, whose chart is charts[i]: each shape's instances near and far, in the biome's rock
 *  (palette.ts GROUNDS). */
export function createRocks(rocks: Rock[][], charts: Chart[], view: View, light: Light, ROCK: Tones) {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => {
    const p = positionWorld;
    // each face one tone: its own normal, from how the surface lies across the pixel, turned the way the shape faces
    const across = cross(dFdx(p), dFdy(p));
    const face = across.div(max(length(across), 1e-12));
    const n = face.mul(select(dot(face, normalWorld).lessThan(0), float(-1), float(1)));
    const wet = mix(float(WET), float(1), cut(view.altitude(p), WET_TO));
    // deep in a crack or under a ledge (rock-shape.ts cavity) the sun never reaches: the shadow tone, lit or not
    const shadow = vec3(...ROCK.shadow).mul(wet);
    return light.toon(p, n, mix(vec3(...ROCK.lit).mul(wet), shadow, cut(attribute('cavity', 'float'), CAVITY)), shadow);
  })();

  const m = new Matrix4(), q = new Quaternion(), e = new Euler(), s = new Vector3(), zero = new Vector3();
  const place = (r: Rock, chart: Chart): Placed => {
    // a slight lean, as if settled
    e.set(Math.sin(r.yaw * 3) * 0.12, r.yaw, Math.cos(r.yaw * 5) * 0.12);
    m.compose(zero, q.setFromEuler(e), s.setScalar(r.size));
    return { matrix: standing(chart, r.x, r.y, r.z, m, new Matrix4()) };
  };
  const placed = (big: boolean, k: number) => rocks.map((on, i) => on.filter((r) => r.big === big && r.shape === k).map((r) => place(r, charts[i])));
  const kind = (big: boolean, level: 'detail' | 'far' | 'distant') => Array.from({ length: big ? KINDS.big.shapes : KINDS.boulder.shapes }, (_, k) =>
    createInstances(rockShape(k + (big ? 1 : 51), (big ? KINDS.big : KINDS.boulder)[level], big), material, placed(big, k)));
  return {
    near: [...kind(true, 'detail'), ...kind(false, 'detail')],
    far: [...kind(true, 'far'), ...kind(false, 'far')],
    distant: [...kind(true, 'distant'), ...kind(false, 'distant')],
  };
}
