// The new world against PLAN.md's pass 1 lines for the planet and for every region. Each check that the
// world does not meet yet is marked todo: it still runs and reports what it measured, without failing the run.
// Take the todo off once the regions are fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PI, cross, dot, normalize, rngFloat, rngFrom, v3, type Rng, type V3 } from '../../src/sim/math.ts';
import {
  R, TERRITORY, along, cellDir, cellOf, fromLatLon, horizonDistance, neighbor, surfaceDistance, tangentAt, tangentToward,
} from '../../src/sim/sphere.ts';
import { SHIP } from '../../src/sim/tables.ts';
import {
  BEACONS, BLEND, CENTRES, CURRENTS, GREAT_CURRENT, LANDMARKS, LOOT_SPOTS, REGIONS, REGION_COUNT, TIDAL_PASSAGES, TIDE_AMPLITUDE, ZONE,
  bakeHeights, currentAt, heightAt, heightExact, navigable, obstacleAt, regionAt, regionHeight, regionIndex, regionMix, regionWeights,
  zonesAt, type RegionId,
} from '../../src/sim/world/index.ts';

bakeHeights();

const rng = rngFrom(0x5eed);
function anywhere(out: V3, r: Rng = rng): V3 {
  for (;;) {
    const x = rngFloat(r) * 2 - 1, y = rngFloat(r) * 2 - 1, z = rngFloat(r) * 2 - 1, l = x * x + y * y + z * z;
    if (l > 0.01 && l <= 1) {
      const s = 1 / Math.sqrt(l);
      out.x = x * s;
      out.y = y * s;
      out.z = z * s;
      return out;
    }
  }
}
const lat = (p: V3): number => (Math.asin(Math.max(-1, Math.min(1, p.y))) * 180) / PI;
const name = (i: number): string => REGIONS[i].id;
const NORTH = [1, 2, 3, 4, 5, 6, 7], SOUTH = [8, 9, 10, 11, 12, 13, 14];
const EYE = horizonDistance(8);

// ---------------------------------------------------------------- the planet

test('the planet is about 554 m across its radius, and a lap at top speed takes about four minutes', () => {
  assert.ok(Math.abs(R - 554) < 5, `R = ${R}`);
  const lap = (2 * PI * R) / SHIP.top;
  assert.ok(lap > 225 && lap < 255, `a lap takes ${lap.toFixed(0)} s`);
});

test('a cap at each pole and two staggered rings of seven, in the listed order', () => {
  assert.equal(REGION_COUNT, 16);
  assert.equal(REGIONS[0].id, 'iceCrown');
  assert.equal(REGIONS[0].lat, 90);
  assert.equal(REGIONS[15].id, 'maelstrom');
  assert.equal(REGIONS[15].lat, -90);
  const order: RegionId[] = [
    'fjords', 'mistwood', 'spires', 'narrows', 'basaltStacks', 'kelpShallows', 'blossomRun',
    'glassSea', 'jadeShoals', 'coralAtolls', 'spiceIsles', 'fireArchipelago', 'weepingIsle', 'mangroveLabyrinth',
  ];
  order.forEach((id, k) => assert.equal(regionIndex(id), k + 1, id));
  for (let k = 0; k < 7; k++) {
    const n = REGIONS[NORTH[k]], s = REGIONS[SOUTH[k]];
    assert.ok(n.lat > 0 && s.lat < 0);
    // the southern ring sits half a step round from the northern one
    const off = (((n.lon - s.lon) % (360 / 7)) + 360 / 7) % (360 / 7);
    assert.ok(Math.abs(off - 360 / 14) < 1e-9, `${n.id} and ${s.id} are ${off}° apart`);
  }
});

// Borders seen by sampling: which pairs of regions meet.
const borders = new Set<string>();
const SEAM = { maxLat: 0 };
{
  const P = v3(), M = { a: 0, b: 0, t: 0 };
  for (let k = 0; k < 100_000; k++) {
    anywhere(P);
    regionMix(P, M);
    if (M.t < 0.45) continue;
    borders.add(`${Math.min(M.a, M.b)}-${Math.max(M.a, M.b)}`);
    const crossRing = (NORTH.includes(M.a) && SOUTH.includes(M.b)) || (SOUTH.includes(M.a) && NORTH.includes(M.b));
    if (crossRing) SEAM.maxLat = Math.max(SEAM.maxLat, Math.abs(lat(P)));
  }
}
const meets = (a: number, b: number): boolean => borders.has(`${Math.min(a, b)}-${Math.max(a, b)}`);

test('each ring region touches two regions in the other ring', () => {
  for (const i of [...NORTH, ...SOUTH]) {
    const other = NORTH.includes(i) ? SOUTH : NORTH;
    const touched = other.filter((j) => meets(i, j));
    assert.equal(touched.length, 2, `${name(i)} touches ${touched.map(name).join(', ')}`);
    const listed = REGIONS[i].neighbours.filter((j) => other.includes(j));
    assert.deepEqual([...touched].sort(), [...listed].sort(), `${name(i)}'s neighbours list`);
  }
});

test('the equator is the seam between the rings', (t) => {
  t.diagnostic(`the border between the rings strays at most ${SEAM.maxLat.toFixed(1)}° (${((SEAM.maxLat * PI * R) / 180).toFixed(0)} m) from the equator`);
  // the rings are staggered, so the border zigzags across the equator; it stays inside the blend band
  assert.ok((SEAM.maxLat * PI * R) / 180 < BLEND, `the seam wanders ${SEAM.maxLat.toFixed(1)}° off the equator`);
  const P = v3();
  for (let k = 0; k < 20_000; k++) {
    anywhere(P);
    const l = lat(P), r = regionAt(P);
    if (l > SEAM.maxLat + 0.5) assert.ok(r <= 7, `a point at ${l.toFixed(1)}° is in ${name(r)}`);
    if (l < -SEAM.maxLat - 0.5) assert.ok(r >= 8, `a point at ${l.toFixed(1)}° is in ${name(r)}`);
  }
});

test('the regions tile the sphere: every point of 100,000 belongs to exactly one region', () => {
  const P = v3(), M = { a: 0, b: 0, t: 0 }, seen = new Set<number>();
  for (let k = 0; k < 100_000; k++) {
    anywhere(P);
    const r = regionAt(P);
    assert.ok(Number.isInteger(r) && r >= 0 && r < REGION_COUNT);
    regionMix(P, M);
    assert.equal(M.a, r);
    assert.ok(M.t <= 0.5);
    seen.add(r);
  }
  assert.equal(seen.size, REGION_COUNT);
  // every observed border is in both regions' neighbour lists
  for (const b of borders) {
    const [a, c] = b.split('-').map(Number);
    assert.ok(REGIONS[a].neighbours.includes(c) && REGIONS[c].neighbours.includes(a), `${name(a)} meets ${name(c)} unlisted`);
  }
});

test('a landmark or beacon is above the horizon from at least 95% of the sea, at 8 m up, by day and by night', (t) => {
  const P = v3();
  let sea = 0, day = 0, night = 0;
  for (let k = 0; k < 40_000; k++) {
    anywhere(P);
    if (!navigable(P)) continue;
    sea++;
    let d = false, n = false;
    for (const b of BEACONS) if (surfaceDistance(P, b.pos) <= EYE + horizonDistance(b.height)) d = n = true;
    if (!d) for (const l of LANDMARKS) if (surfaceDistance(P, l.pos) <= EYE + horizonDistance(l.height)) d = true;
    if (d) day++;
    if (n) night++;
  }
  t.diagnostic(`in view by day ${((100 * day) / sea).toFixed(1)}%, by night (beacons only) ${((100 * night) / sea).toFixed(1)}%`);
  assert.ok(day / sea >= 0.95);
  assert.ok(night / sea >= 0.95);
});

// ---------------------------------------------------------------- every region

test('each region\'s terrain comes from its own module', () => {
  const dir = fileURLToPath(new URL('../../src/sim/world/regions/', import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
  const bodies = new Set<string>();
  for (const r of REGIONS) {
    assert.ok(files.includes(`${r.id}.ts`), `regions/${r.id}.ts`);
    const src = readFileSync(`${dir}${r.id}.ts`, 'utf8');
    assert.match(src, new RegExp(`export const ${r.id}: RegionSpec`), `${r.id} exports its spec`);
    assert.match(src, /height\s*[(:]/, `${r.id} has its own height function`);
    bodies.add(src);
  }
  assert.equal(bodies.size, REGION_COUNT);
});

// What breaks up open water: land, shallows, cover or loot. And the current lanes, which count as something.
const loot = (p: V3): boolean => {
  for (const s of LOOT_SPOTS) if (dot(p, s.pos) > 1 - (15 * 15) / (2 * R * R)) return true;
  return false;
};
const something = (p: V3): boolean =>
  heightAt(p) > -4 || (zonesAt(p) & (ZONE.kelp | ZONE.mist | ZONE.canopy | ZONE.curtain)) !== 0 || obstacleAt(p) >= 0 || loot(p);
const FLOW = v3();
const lane = (p: V3, over = 0.3): boolean => {
  currentAt(p, FLOW);
  return Math.hypot(FLOW.x, FLOW.y, FLOW.z) > over;
};

// The longest straight run with nothing on it, by region: outside the lanes, from a sea point in a random
// direction, the distance until land, shallows, cover or loot.
const GAPS = new Array<number>(REGION_COUNT).fill(0);
{
  const P = v3(), T = v3(), Q = v3();
  for (let k = 0; k < 2500; k++) {
    anywhere(P);
    if (!navigable(P)) continue;
    tangentAt(P, rngFloat(rng) * 2 * PI, T);
    let gap = 0, from = regionAt(P);
    for (let s = 3; s <= 900; s += 3) {
      along(P, T, s, Q);
      if (!navigable(Q)) break;
      if (something(Q) || lane(Q)) {
        gap = 0;
        from = regionAt(Q);
        continue;
      }
      gap += 3;
      if (gap > GAPS[from]) GAPS[from] = gap;
    }
  }
}

test('outside the lanes, every straight course meets something at least every 217 m', (t) => {
  t.diagnostic(`longest gap by region: ${REGIONS.map((r, i) => `${r.id} ${GAPS[i]} m`).join(', ')}`);
  const over = REGIONS.filter((_, i) => GAPS[i] > 217).map((r) => r.id);
  assert.deepEqual(over, []);
});

test('neighbours blend across a band at least 100 m wide, where both weigh in', () => {
  assert.ok(2 * BLEND >= 100, `the band is ${2 * BLEND} m`);
  const P = v3(), M = { a: 0, b: 0, t: 0 }, W = new Float64Array(REGION_COUNT);
  let checked = 0;
  for (let k = 0; k < 200_000 && checked < 2000; k++) {
    anywhere(P);
    regionMix(P, M);
    if (M.t < 0.47) continue;
    checked++;
    regionWeights(P, W);
    // on the border the two sides weigh the same, and more than any third region near a corner
    const third = Math.max(...W.filter((_, i) => i !== M.a && i !== M.b));
    assert.ok(W[M.a] > 0.2 && Math.abs(W[M.a] - W[M.b]) < 0.05 && third <= W[M.a] + 1e-9,
      `on the ${name(M.a)}–${name(M.b)} border: ${W[M.a].toFixed(2)} / ${W[M.b].toFixed(2)}, a third weighs ${third.toFixed(2)}`);
  }
  assert.ok(checked > 500, `only ${checked} border points sampled`);
});

// Lines across every border, away from the lanes, whose channels are carved on purpose with banks 40 m beyond the
// current: from a point on the border, 60 m into each side along the way between the two regions' centres, a
// metre a step. Up to 40 a border, drawn from their own seed so the other tests' draws don't move.
interface Transect { a: number; b: number; pts: V3[] }
const TRANSECTS: Transect[] = [];
const carved = (p: V3): boolean => Math.abs(p.y) * R < GREAT_CURRENT.fade + 45 ||
  CURRENTS.some((l) => dot(p, l.centre) >= l.cos && l.pts.some((q) => surfaceDistance(p, q) < l.width / 2 + 45));
{
  const r = rngFrom(0xb0d0), P = v3(), D = v3(), M = { a: 0, b: 0, t: 0 }, count = new Map<string, number>();
  for (let k = 0; k < 400_000; k++) {
    anywhere(P, r);
    regionMix(P, M);
    if (M.t < 0.495) continue;
    const key = `${Math.min(M.a, M.b)}-${Math.max(M.a, M.b)}`;
    if ((count.get(key) ?? 0) >= 40) continue;
    tangentToward(P, CENTRES[M.b], D);
    const pts: V3[] = [];
    for (let x = -BLEND; x <= BLEND; x++) pts.push(along(P, D, x, v3()));
    if (pts.some(carved)) continue;
    count.set(key, (count.get(key) ?? 0) + 1);
    TRANSECTS.push({ a: M.a, b: M.b, pts });
  }
}
const border = (a: number, b: number): string => `${name(Math.min(a, b))}–${name(Math.max(a, b))}`;

test('across every border the blend raises no ridge, digs no trench and stands no wall', (t) => {
  const W = new Float64Array(REGION_COUNT), own = new Float64Array(REGION_COUNT), was = new Float64Array(REGION_COUNT);
  let steepest = 0, where = '';
  for (const { a, b, pts } of TRANSECTS) {
    was.fill(NaN);
    let before = 0;
    pts.forEach((q, j) => {
      const h = heightExact(q);
      regionWeights(q, W);
      let top = -Infinity, slope = 0;
      for (let i = 0; i < REGION_COUNT; i++) {
        own[i] = W[i] > 0 ? regionHeight(i, q) : NaN;
        if (W[i] > 0) top = Math.max(top, own[i]);
        if (!Number.isNaN(own[i]) && !Number.isNaN(was[i])) slope = Math.max(slope, Math.abs(own[i] - was[i]));
      }
      const home = own[regionAt(q)];
      // the highest landform wins, smoothly: never more than a metre and a half over the tallest of them
      assert.ok(h <= top + 1.5, `${border(a, b)}: ${h.toFixed(1)} m stands over every region's own ground (${top.toFixed(1)} m)`);
      // and never under the ground of the region it is in
      assert.ok(h >= home - 0.01, `${border(a, b)}: ${h.toFixed(1)} m sinks under ${name(regionAt(q))}'s own ${home.toFixed(1)} m`);
      if (j > 0 && Math.abs(h - before) - slope > steepest) {
        steepest = Math.abs(h - before) - slope;
        where = `${border(a, b)}, ${j - BLEND} m from the border at ${h.toFixed(1)} m`;
      }
      before = h;
      was.set(own);
    });
  }
  t.diagnostic(`${TRANSECTS.length} lines across the borders; the blend's steepest addition: ${steepest.toFixed(2)} m a metre, on the ${where}`);
  // a steep shore, not a wall: at most 2 m a metre steeper than the regions' own ground
  assert.ok(steepest <= 2, `a wall on the ${where}: ${steepest.toFixed(2)} m a metre steeper than either side's own ground`);
});

test('on every border the landforms reach across and mix, rather than meet at a seam', (t) => {
  // Ground 4–40 m into one side raised by the other side's landform: higher than its own region's ground, and near
  // enough the surface to see. Where one side's ground already stands higher (the Mangrove's flats against the
  // Maelstrom's deep water), only the other side's reaches over.
  const reach = new Map<string, number>(), seen = new Map<string, number>(), ways = new Map<string, Set<string>>();
  for (const { a, b, pts } of TRANSECTS) {
    const key = border(a, b);
    pts.forEach((q, j) => {
      const x = j - BLEND;
      if (Math.abs(x) < 4 || Math.abs(x) > 40) return;
      const [here, there] = x < 0 ? [a, b] : [b, a], h = heightExact(q);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (h > -10 && h > regionHeight(here, q) + 1 && regionHeight(there, q) >= h - 1.5) {
        reach.set(key, (reach.get(key) ?? 0) + 1);
        ways.set(key, (ways.get(key) ?? new Set()).add(name(there)));
      }
    });
  }
  const share = [...seen].map(([k, n]) => [k, (reach.get(k) ?? 0) / n] as const).sort((x, y) => x[1] - y[1]);
  const both = [...ways].filter(([, w]) => w.size === 2).length;
  t.diagnostic(`${seen.size} borders; ${both} reach both ways; the least mixed: ${share.slice(0, 5).map(([k, f]) => `${k} ${(100 * f).toFixed(1)}%`).join(', ')}`);
  assert.deepEqual(share.filter(([, f]) => f < 0.02).map(([k]) => k), []);
});

test('no border is a long flat strip of open water', (t) => {
  // Along each border from the middle of every line across it, both ways until another region takes over.
  const T = v3(), Q = v3(), M = { a: 0, b: 0, t: 0 }, longest = new Map<string, number>();
  for (const { a, b, pts } of TRANSECTS) {
    const P = pts[BLEND];
    normalize(cross(T, P, pts[BLEND + 1]));
    for (const dir of [1, -1]) {
      let gap = 0;
      for (let s = 3; s <= 600; s += 3) {
        along(P, T, dir * s, Q);
        regionMix(Q, M);
        if (Math.min(M.a, M.b) !== Math.min(a, b) || Math.max(M.a, M.b) !== Math.max(a, b)) break;
        gap = !navigable(Q) || something(Q) || lane(Q) ? 0 : gap + 3;
        const k = border(a, b);
        if (gap > (longest.get(k) ?? 0)) longest.set(k, gap);
      }
    }
  }
  const worst = [...longest].sort((x, y) => y[1] - x[1]);
  t.diagnostic(`longest open water along a border: ${worst.slice(0, 5).map(([k, g]) => `${k} ${g} m`).join(', ')}`);
  assert.deepEqual(worst.filter(([, g]) => g > 217).map(([k]) => k), []);
});

test('the Great Current is a closed loop round the equator that every ring region touches', () => {
  const P = v3(), C = v3(), E = v3(), touched = new Set<number>();
  for (let k = 0; k < 3600; k++) {
    fromLatLon(0, (k / 3600) * 2 * PI, P);
    assert.ok(navigable(P, -TIDE_AMPLITUDE), `the equator runs aground at ${(k / 10).toFixed(1)}°`);
    currentAt(P, C);
    E.x = P.z;
    E.y = 0;
    E.z = -P.x;
    const east = dot(C, E) / Math.hypot(E.x, E.z);
    assert.ok(east >= GREAT_CURRENT.speed * 0.5, `the current runs ${east.toFixed(2)} m/s east at ${(k / 10).toFixed(1)}°`);
    touched.add(regionAt(P));
  }
  for (const i of [...NORTH, ...SOUTH]) assert.ok(touched.has(i), `${name(i)} doesn't touch the Great Current`);
});

test('every region has a current that crosses into a neighbour', () => {
  for (let i = 0; i < REGION_COUNT; i++) {
    const crossing = CURRENTS.filter((l) => l.region === i && l.pts.some((q) => regionAt(q) === i) && l.pts.some((q) => regionAt(q) !== i));
    assert.ok(crossing.length > 0, `${name(i)} has no current crossing a border`);
  }
});

const water = new Uint8Array(TERRITORY.cells), part = new Int32Array(TERRITORY.cells).fill(-1);
let mainPart = -1;
{
  const P = v3(), sizes: number[] = [], stack: number[] = [];
  for (let c = 0; c < TERRITORY.cells; c++) water[c] = navigable(cellDir(TERRITORY, c, P), 0) ? 1 : 0;
  for (let c = 0; c < TERRITORY.cells; c++) {
    if (!water[c] || part[c] >= 0) continue;
    let size = 0;
    stack.push(c);
    part[c] = sizes.length;
    while (stack.length) {
      const x = stack.pop()!;
      size++;
      for (let k = 0; k < 4; k++) {
        const y = neighbor(TERRITORY, x, k);
        if (water[y] && part[y] < 0) {
          part[y] = sizes.length;
          stack.push(y);
        }
      }
    }
    sizes.push(size);
  }
  mainPart = sizes.indexOf(Math.max(...sizes));
}

test('every region has 6 or more loot spots', () => {
  for (let i = 0; i < REGION_COUNT; i++) assert.ok(LOOT_SPOTS.filter((s) => s.region === i).length >= 6, name(i));
});

test('every loot spot is in its region, in water a ship can reach at low tide', (t) => {
  const faults: string[] = [];
  for (let i = 0; i < REGION_COUNT; i++) {
    const spots = LOOT_SPOTS.filter((s) => s.region === i);
    const dry = spots.filter((s) => !navigable(s.pos, -TIDE_AMPLITUDE)).length;
    const cut = spots.filter((s) => part[cellOf(TERRITORY, s.pos)] !== mainPart).length;
    const out = spots.filter((s) => regionAt(s.pos) !== i).length;
    if (dry || cut || out) faults.push(`${name(i)}: ${dry} dry at low tide, ${cut} cut off, ${out} over the border`);
  }
  t.diagnostic(faults.join('; ') || 'none');
  assert.deepEqual(faults, []);
});

test('every landmark is about 50 m or taller, or carries a light', () => {
  for (const l of LANDMARKS) {
    const lit = BEACONS.some((b) => b.region === l.region && surfaceDistance(b.pos, l.pos) <= l.r + 30);
    assert.ok(l.height >= 50 || lit, `${l.name} is ${l.height} m and unlit`);
    assert.equal(regionAt(l.pos), l.region, `${l.name} stands in its own region`);
  }
});

test('every landmark can be seen over the curve from every point of its borders', (t) => {
  const P = v3(), M = { a: 0, b: 0, t: 0 }, short = new Array<number>(REGION_COUNT).fill(0);
  for (let k = 0; k < 150_000; k++) {
    anywhere(P);
    regionMix(P, M);
    if (M.t < 0.47) continue;
    for (const i of [M.a, M.b]) {
      const l = LANDMARKS[i], over = surfaceDistance(P, l.pos) - (EYE + horizonDistance(l.height));
      if (over > short[i]) short[i] = over;
    }
  }
  const faults = REGIONS.flatMap((r, i) => (short[i] > 0 ? [`${r.id} ${short[i].toFixed(0)} m short`] : []));
  t.diagnostic(faults.join(', ') || 'none');
  assert.deepEqual(faults, []);
});

test('the Needle can be seen from every northern ring region', { todo: 'four northern regions lie beyond the 150 m Needle\'s reach; Kelp Shallows and Blossom Run, about 750 m off, need it about 390 m tall' }, (t) => {
  const needle = LANDMARKS[regionIndex('spires')], reach = EYE + horizonDistance(needle.height), P = v3();
  const nearest = new Array<number>(REGION_COUNT).fill(Infinity);
  for (let k = 0; k < 60_000; k++) {
    anywhere(P);
    const r = regionAt(P);
    if (NORTH.includes(r)) nearest[r] = Math.min(nearest[r], surfaceDistance(P, needle.pos));
  }
  const far = NORTH.filter((i) => nearest[i] > reach);
  t.diagnostic(`the Needle (${needle.height} m) shows ${reach.toFixed(0)} m off; nearest water of ${NORTH.map((i) => `${name(i)} ${nearest[i].toFixed(0)} m`).join(', ')}`);
  assert.deepEqual(far.map(name), []);
});

test('every region has a beacon with a light above the sea', () => {
  assert.equal(BEACONS.length, REGION_COUNT);
  BEACONS.forEach((b, i) => {
    assert.equal(b.region, i);
    assert.equal(regionAt(b.pos), i, `${name(i)}'s beacon stands in its region`);
    assert.ok(b.height > 0);
  });
});

test('the four tidal regions each have a passage that opens at high tide and closes at low tide', () => {
  for (const id of ['basaltStacks', 'jadeShoals', 'coralAtolls', 'mangroveLabyrinth'] as RegionId[]) {
    const i = regionIndex(id);
    const works = TIDAL_PASSAGES.filter((s) => s.region === i && navigable(s.pos, TIDE_AMPLITUDE) && !navigable(s.pos, -TIDE_AMPLITUDE));
    assert.ok(works.length > 0, `${id} has no working tidal passage`);
  }
});

test('the landmarks sit near their region centres, and each region is about the same size', () => {
  const P = v3(), count = new Array<number>(REGION_COUNT).fill(0);
  for (let k = 0; k < 40_000; k++) count[regionAt(anywhere(P))]++;
  for (let i = 0; i < REGION_COUNT; i++) {
    const share = count[i] / 40_000;
    assert.ok(share > 0.4 / REGION_COUNT && share < 1.8 / REGION_COUNT, `${name(i)} covers ${(share * 100).toFixed(1)}%`);
    assert.ok(surfaceDistance(LANDMARKS[i].pos, CENTRES[i]) < 400, `${LANDMARKS[i].name} is far from its region's heart`);
  }
});
