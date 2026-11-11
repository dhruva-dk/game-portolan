// The islands' ground: one mesh for each island, from its summit down the beach and across its apron to where the
// water is deep enough for the sea floor's own mesh (seabed.ts) to take over, overlapping it a little; then a skirt
// tucked under. Shaded as all the ground is (sand.ts), with litter under the palms and shrubs.
//
// Each is a polar grid about the island's centre on its chart, laid on the sphere (site.ts), whose rings follow the
// coast so the waterline lies along a ring: rings a metre or so apart across the beach and the shallows, growing
// apart inland and out over the apron; spokes about a metre apart at the coast, as many as the island's size needs.
// Seaward each spoke stops where the ground has gone below DEEPEST for good (the farthest it is shallower, along the
// spoke and its neighbours, plus a margin: past the apron's farthest reach the flank only falls); spokes that stop
// sooner leave their last rings on that point.

import { BufferGeometry, Float32BufferAttribute, Mesh, MeshBasicNodeMaterial, Vector3 } from 'three/webgpu';
import { Fn, attribute, normalWorld, normalize, positionWorld } from 'three/tsl';
import type { Isle } from '../world/scatter';
import type { Sand } from './sand';
import { SHALLOWEST } from './seabed';
import { onSphere } from './site';

/** The island's mesh reaches out to where the ground is this deep (the sea floor's begins at SHALLOWEST). */
const DEEPEST = SHALLOWEST + 1;
/** Past that, metres; and the skirt's drop. */
const MARGIN = 2, SKIRT = 1.5;
/** Metres between spokes at the coast, and between rings across the beach. */
const SPOKE = 1.2, RING = 1.2;

/** How far out from the coast each ring lies, metres (negative inland), for an island out to `out` past its coast. */
function rings(radius: number, out: number): number[] {
  const ds: number[] = [];
  const near = Math.min(24, radius);
  for (let d = -radius; d < -near; d += 2) ds.push(d);
  for (let d = -near; d < 24; d += RING) ds.push(d);
  for (let d = 24, step = RING; d < out; d += step, step *= 1.04) ds.push(d);
  ds.push(out);
  return ds;
}

function geometry(isle: Isle, litter: (x: number, z: number) => number): BufferGeometry {
  const { site, height } = isle;
  const spokes = Math.max(96, Math.round((2 * Math.PI * site.radius) / SPOKE));
  const angle = (s: number) => (s / spokes) * 2 * Math.PI;
  // how far past the coast each spoke must reach: the farthest the ground is still shallower than DEEPEST
  const raw = Array.from({ length: spokes }, (_, s) => {
    const t = angle(s), c = site.coast(t);
    let last = 0;
    for (let d = 0; c + d < site.shelf + 30; d += 0.5) if (height(Math.cos(t) * (c + d), Math.sin(t) * (c + d)) > -DEEPEST) last = d;
    return last;
  });
  const reach = raw.map((_, s) => Math.max(...Array.from({ length: 13 }, (_, k) => raw[(s + k - 6 + spokes) % spokes])) + MARGIN);
  const ds = rings(site.radius, Math.max(...reach));

  const positions: number[] = [], normals: number[] = [], fallen: number[] = [];
  const n = new Vector3(), e = 0.5;
  const vertex = (s: number, d: number, drop: number) => {
    const t = angle(s), c = site.coast(t);
    // inland the rings shrink with the coast toward the centre; seaward they keep their distance from it
    const r = d < 0 ? c * (1 + d / site.radius) : c + Math.min(d, reach[s]);
    const x = Math.cos(t) * r, z = Math.sin(t) * r;
    const at = onSphere(site.chart, x, height(x, z) - drop, z);
    positions.push(...at.p);
    // the ground's normal on the chart (x, up, z), turned onto the sphere
    n.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
    for (let i = 0; i < 3; i++) normals.push(at.e1[i] * n.x + at.up[i] * n.y + at.e2[i] * n.z);
    fallen.push(d < 0 ? litter(x, z) : 0);
  };
  for (const d of ds) for (let s = 0; s < spokes; s++) vertex(s, d, 0);
  for (let s = 0; s < spokes; s++) vertex(s, Infinity, SKIRT);

  const index: number[] = [];
  const at = (k: number, s: number) => k * spokes + (s % spokes);
  for (let k = 0; k < ds.length; k++) for (let s = 0; s < spokes; s++) {
    index.push(at(k, s), at(k, s + 1), at(k + 1, s), at(k, s + 1), at(k + 1, s + 1), at(k + 1, s));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  g.setAttribute('litter', new Float32BufferAttribute(fallen, 1));
  g.setIndex(index);
  return g;
}

/** litters[i](x, z): 0…1, how thickly fallen fronds and leaves cover island i's ground (scatter.litter). */
export function createLand(isles: Isle[], litters: ((x: number, z: number) => number)[], sand: Sand): Mesh[] {
  const material = new MeshBasicNodeMaterial();
  material.colorNode = Fn(() => sand(positionWorld, normalize(normalWorld), attribute('litter', 'float')))();
  return isles.map((isle, i) => new Mesh(geometry(isle, litters[i]), material));
}
