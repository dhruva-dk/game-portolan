import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PI, dot, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { R, TERRITORY, cellArea, cellDir, cellOf, neighbor } from '../../src/sim/sphere.ts';
import { DRAFT, REGIONS, TIDE, rimAt } from '../../src/sim/world/regions.ts';
import {
  CHARTS, CLEAR, NEIGHBOURS, ZONE, buildGeography, chartTangent, coastAt, greatCurrent, heightAt, regionOf, toWorld,
} from '../../src/sim/world/geography.ts';
import { NAV, buildNav, findRoute, navCellOf, type Nav } from '../../src/sim/world/nav.ts';

const cpuMs = (): number => {
  const u = process.cpuUsage();
  return (u.user + u.system) / 1000;
};
let t0 = cpuMs();
const geo = buildGeography();
const buildMs = cpuMs() - t0;
t0 = cpuMs();
const nav = buildNav(geo);
const navMs = cpuMs() - t0;
console.log(`# buildGeography ${buildMs.toFixed(0)} ms, buildNav ${navMs.toFixed(0)} ms`);

const LOW = -TIDE.amp + 0.01, HIGH = TIDE.amp - 0.01;
const idx = (id: string) => REGIONS.findIndex((r) => r.id === id);
const at = (ri: number, x: number, y: number) => toWorld(ri, x, y, v3());
const deg = (b: number) => b * (PI / 180);

function flood(n: Nav, from: number, tide: number, blocked?: (c: number) => boolean): Uint8Array {
  const seen = new Uint8Array(NAV.cells), stack = [from];
  seen[from] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    for (let s = 0; s < 4; s++) {
      const m = neighbor(NAV, c, s);
      if (seen[m] || !(n.edge[c * 4 + s] < tide) || blocked?.(m)) continue;
      seen[m] = 1;
      stack.push(m);
    }
  }
  return seen;
}
const ocean = normalize(v3(CHARTS[0].c.x + CHARTS[1].c.x + CHARTS[2].c.x, CHARTS[0].c.y + CHARTS[1].c.y + CHARTS[2].c.y,
  CHARTS[0].c.z + CHARTS[1].c.z + CHARTS[2].c.z));

test('generation is fast enough for the world worker', () => {
  assert.ok(buildMs < 3000, `buildGeography took ${buildMs.toFixed(0)} ms`);
  assert.ok(navMs < 2000, `buildNav took ${navMs.toFixed(0)} ms`);
});

test('the twelve regions sit at the vertices of an icosahedron, each with five equidistant neighbours', () => {
  assert.equal(REGIONS.length, 12);
  const edge = Math.atan(2);
  CHARTS.forEach((a, i) => {
    assert.equal(NEIGHBOURS[i].length, 5);
    for (const j of NEIGHBOURS[i]) assert.ok(Math.abs(Math.acos(dot(a.c, CHARTS[j].c)) - edge) < 1e-9, `${i}–${j}`);
    for (let j = 0; j < 12; j++) if (j !== i && !NEIGHBOURS[i].includes(j)) assert.ok(Math.acos(dot(a.c, CHARTS[j].c)) > edge + 0.1);
  });
});

test('each region has its own landmark and perk, at least one harbour and one light', () => {
  const perks = new Set(REGIONS.map((r) => r.landmark.perk));
  assert.equal(perks.size, 12);
  REGIONS.forEach((r, ri) => {
    assert.equal(geo.landmarks[ri].region, ri);
    assert.equal(regionOf(geo.landmarks[ri].pos), ri, `${r.id} landmark outside its region`);
    assert.ok(r.harbours.length >= 1 && r.lighthouses.length >= 1, r.id);
  });
});

test('harbours are sheltered, navigable anchorages facing out through their mouths', () => {
  for (const h of geo.harbours) {
    const id = REGIONS[h.region].id;
    assert.ok(coastAt(geo, h.pos) >= CLEAR, `${id} anchorage ${coastAt(geo, h.pos).toFixed(1)} u from shore`);
    let sheltered = 0;
    for (let k = 0; k < 32; k++) {
      const t = chartTangent(h.region, h.pos, k * 11.25, v3()), p = v3();
      for (let d = 1; d <= 30; d += 0.5) {
        if (heightAt(geo, step(h.pos, t, d, p)) >= -DRAFT) { sheltered++; break; }
      }
    }
    assert.ok(sheltered >= 16, `${id} harbour sheltered on ${sheltered}/32 bearings`);
    const p = v3();
    for (let d = 1; d <= 8; d += 0.5) assert.ok(coastAt(geo, step(h.pos, h.facing, d, p)) > 1, `${id} harbour mouth blocked ${d} u out`);
  }
});

test('lighthouses stand on headlands, looking out to sea', () => {
  for (const l of geo.lights) {
    const id = REGIONS[l.region].id, p = v3();
    assert.ok(heightAt(geo, l.pos) > TIDE.amp - DRAFT + 0.3, `${id} light at height ${heightAt(geo, l.pos).toFixed(2)}`);
    let wet = 0;
    for (let k = 0; k < 32; k++) {
      const t = chartTangent(l.region, l.pos, k * 11.25, v3());
      for (let d = 0.5; d <= 12; d += 0.5) if (heightAt(geo, step(l.pos, t, d, p)) < -DRAFT) { wet++; break; }
    }
    assert.ok(wet >= 16, `${id} light sees the sea on ${wet}/32 bearings`);
    assert.ok(heightAt(geo, step(l.pos, l.facing, 8, p)) < -DRAFT, `${id} light faces land`);
  }
});

test('every cut edge of the chart net runs through open sea, at least 40 u from land', () => {
  let worst = Infinity;
  for (let i = 0; i < 12; i++) {
    for (const j of NEIGHBOURS[i]) {
      if (j < i) continue;
      const ends = NEIGHBOURS[i].filter((k) => NEIGHBOURS[j].includes(k)).map((k) =>
        normalize(v3(CHARTS[i].c.x + CHARTS[j].c.x + CHARTS[k].c.x, CHARTS[i].c.y + CHARTS[j].c.y + CHARTS[k].c.y,
          CHARTS[i].c.z + CHARTS[j].c.z + CHARTS[k].c.z)));
      assert.equal(ends.length, 2);
      const len = R * Math.acos(dot(ends[0], ends[1])), p = v3();
      for (let s = 0; s <= len; s += 1) {
        const t = s / len;
        normalize(Object.assign(p, { x: ends[0].x * (1 - t) + ends[1].x * t, y: ends[0].y * (1 - t) + ends[1].y * t, z: ends[0].z * (1 - t) + ends[1].z * t }));
        worst = Math.min(worst, coastAt(geo, p));
      }
    }
  }
  assert.ok(worst >= 40, `land within ${worst.toFixed(1)} u of a cut edge`);
});

test('the whole world is navigable from the open sea at every tide', () => {
  const water = ['greatFalls', 'arch', 'kelpCathedral', 'greatLagoon', 'spiceHarbour', 'rootGate', 'whaleRoad', 'eye'];
  for (const tide of [LOW, 0, HIGH]) {
    const seen = flood(nav, navCellOf(ocean), tide);
    for (const h of geo.harbours) assert.ok(seen[navCellOf(h.pos)], `${REGIONS[h.region].id} harbour cut off at tide ${tide}`);
    for (const m of geo.landmarks) if (water.includes(m.perk)) assert.ok(seen[navCellOf(m.pos)], `${m.perk} cut off at tide ${tide}`);
  }
});

test('the Great Lagoon can be entered only through its channel', () => {
  const ri = idx('coralAtolls'), reef = REGIONS[ri].strokes.find((s) => s.k === 'reef' && s.great);
  assert.ok(reef && reef.k === 'reef' && reef.gaps.length === 1);
  const lagoon = geo.landmarks[ri].pos, b = deg(reef.gaps[0].bearing);
  const rr = rimAt(reef.rim, reef.gaps[0].bearing).r, mouth = at(ri, reef.x + rr * Math.sin(b), reef.y + rr * Math.cos(b));
  for (const tide of [LOW, HIGH]) {
    assert.ok(flood(nav, navCellOf(ocean), tide)[navCellOf(lagoon)], 'lagoon unreachable through its channel');
    const shut = flood(nav, navCellOf(ocean), tide, (c) => R * Math.acos(Math.min(1, dot(cellDir(NAV, c, v3()), mouth))) < 14);
    assert.ok(!shut[navCellOf(lagoon)], `lagoon reachable with its channel shut at tide ${tide}`);
  }
  assert.ok(geo.zones[cellOf(TERRITORY, lagoon)] & ZONE.lagoon);
  assert.ok(!(geo.zones[cellOf(TERRITORY, at(ri, 8, 40))] & ZONE.lagoon));
});

test('every atoll lagoon can be entered only through its own passes', () => {
  const ri = idx('coralAtolls');
  for (const s of REGIONS[ri].strokes) {
    if (s.k !== 'reef') continue;
    const lagoon = at(ri, s.x, s.y), mouths = s.gaps.map((g) => {
      const b = deg(g.bearing), r = rimAt(s.rim, g.bearing).r;
      return at(ri, s.x + r * Math.sin(b), s.y + r * Math.cos(b));
    });
    for (const tide of [LOW, HIGH]) {
      assert.ok(flood(nav, navCellOf(ocean), tide)[navCellOf(lagoon)], `lagoon (${s.x}, ${s.y}) unreachable at tide ${tide}`);
      const shut = flood(nav, navCellOf(ocean), tide, (c) => mouths.some((m) => R * Math.acos(Math.min(1, dot(cellDir(NAV, c, v3()), m))) < 7));
      assert.ok(!shut[navCellOf(lagoon)], `lagoon (${s.x}, ${s.y}) reachable with its passes shut at tide ${tide}`);
    }
  }
});
test('the Sound runs through the Fjords end to end, narrow but navigable at every tide', () => {
  const ri = idx('fjords'), sound = REGIONS[ri].strokes.filter((s) => s.k === 'carve')[0];
  assert.ok(sound && sound.k === 'carve');
  const line: V3[] = [];
  for (let i = 0; i < sound.pts.length; i += 3) line.push(at(ri, sound.pts[i], sound.pts[i + 1]));
  const off = (c: number) => {
    const p = cellDir(NAV, c, v3());
    let d = Infinity;
    for (let i = 1; i < line.length; i++) d = Math.min(d, distToArc(p, line[i - 1], line[i]));
    return d > 10;
  };
  for (const tide of [LOW, HIGH]) {
    const seen = flood(nav, navCellOf(line[0]), tide, off);
    assert.ok(seen[navCellOf(line[line.length - 1])], `the Sound is closed at tide ${tide}`);
  }
  for (const [x, y] of [[-8, 30], [33, -27], [-6, -34]]) {
    assert.ok(flood(nav, navCellOf(ocean), LOW)[navCellOf(at(ri, x, y))], `fjord head (${x}, ${y}) cut off`);
  }
});

test('the tide opens and shuts passages on the Amber Shoals and in the Coral Atolls', () => {
  for (const id of ['amberShoals', 'coralAtolls']) {
    const ri = idx(id);
    let tidal = 0;
    for (let c = 0; c < NAV.cells; c++) {
      if (regionOf(cellDir(NAV, c, v3())) !== ri) continue;
      for (let s = 0; s < 4; s++) if (Number.isFinite(nav.edge[c * 4 + s])) tidal++;
    }
    assert.ok(tidal >= 8, `${id}: ${tidal} tidal edges`);
  }
  const ri = idx('amberShoals'), from = navCellOf(at(ri, -60, 0)), harbour = geo.harbours.find((h) => h.region === ri)!;
  const route: number[] = [], goal = (c: number) => c === navCellOf(harbour.pos);
  const low = findRoute(nav, from, LOW, goal, harbour.pos, route), high = findRoute(nav, from, HIGH, goal, harbour.pos, route);
  assert.ok(low > 0 && high > 0, 'harbour unreachable');
  assert.ok(high < low * 0.7, `high tide ${high.toFixed(0)} u vs low tide ${low.toFixed(0)} u`);
});

test('the Weeping Isle is the largest land in the world, and the Glass Sea has no cover', () => {
  const comp = new Int32Array(TERRITORY.cells).fill(-1), areas: number[] = [];
  for (let c = 0; c < TERRITORY.cells; c++) {
    if (comp[c] >= 0 || geo.heights[c] < -DRAFT) continue;
    const id = areas.length, stack = [c];
    let area = 0;
    comp[c] = id;
    while (stack.length) {
      const k = stack.pop()!;
      area += cellArea(TERRITORY, k);
      for (let s = 0; s < 4; s++) {
        const m = neighbor(TERRITORY, k, s);
        if (comp[m] < 0 && geo.heights[m] >= -DRAFT) { comp[m] = id; stack.push(m); }
      }
    }
    areas.push(area);
  }
  const weeping = comp[cellOf(TERRITORY, geo.landmarks[idx('weepingIsle')].pos)];
  const second = Math.max(...areas.filter((_, i) => i !== weeping));
  assert.ok(weeping >= 0 && areas[weeping] > 1.3 * second, `Weeping Isle ${areas[weeping]} vs next ${second}`);
  const glass = idx('glassSea');
  for (let r = 0; r <= 45; r += 1) {
    for (let a = 0; a < 360; a += 3) assert.ok(heightAt(geo, at(glass, r * Math.sin(deg(a)), r * Math.cos(deg(a)))) < -DRAFT - 2, `cover at ${r} u`);
  }
});

test('the Great Current rides clear of land through four or five neighbouring regions', () => {
  const seen = new Set<number>();
  let worst = Infinity, worstSeed = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const route = greatCurrent(seed);
    assert.ok(route.regions.length >= 4 && route.regions.length <= 5);
    assert.equal(new Set(route.regions).size, route.regions.length);
    for (let i = 1; i < route.regions.length; i++) assert.ok(NEIGHBOURS[route.regions[i - 1]].includes(route.regions[i]));
    route.regions.forEach((r) => seen.add(r));
    const p = v3();
    for (let k = 0; k < route.points.length; k += 3) {
      p.x = route.points[k]; p.y = route.points[k + 1]; p.z = route.points[k + 2];
      const c = coastAt(geo, p);
      if (c < worst) { worst = c; worstSeed = seed; }
    }
    assert.deepEqual(greatCurrent(seed), route, 'route is not a pure function of the seed');
  }
  assert.equal(seen.size, 12, 'some region is never on the current');
  assert.ok(worst >= 8, `the current passes ${worst.toFixed(1)} u from land (seed ${worstSeed})`);
});

test('the fixed current lanes run clear of land', () => {
  for (const lane of geo.lanes) {
    const len = R * Math.acos(dot(lane.a, lane.b)), p = v3();
    for (let s = 0; s <= len; s++) {
      const t = s / len;
      normalize(Object.assign(p, { x: lane.a.x * (1 - t) + lane.b.x * t, y: lane.a.y * (1 - t) + lane.b.y * t, z: lane.a.z * (1 - t) + lane.b.z * t }));
      assert.ok(coastAt(geo, p) >= lane.width, `${REGIONS[lane.from].id} → ${REGIONS[lane.to].id} near land`);
    }
  }
});

test('finds stand where they can be taken; the Spice Isles have most, the Fire Archipelago pays best', () => {
  for (const f of geo.finds) {
    const id = REGIONS[f.region].id, p = v3();
    if (f.kind === 'wreck') assert.ok(coastAt(geo, f.pos) >= CLEAR, `${id} wreck aground`);
    else {
      assert.ok(heightAt(geo, f.pos) > -DRAFT + 0.3, `${id} cache awash`);
      let shore = false;
      for (let k = 0; k < 16 && !shore; k++) shore = coastAt(geo, step(f.pos, chartTangent(f.region, f.pos, k * 22.5, v3()), 4, p)) > 0.5;
      assert.ok(shore, `${id} cache out of reach of a hull`);
    }
  }
  const count = (ri: number) => geo.finds.filter((f) => f.region === ri).length;
  const spice = idx('spiceIsles'), fire = idx('fireArchipelago');
  REGIONS.forEach((r, ri) => {
    if (ri !== spice) assert.ok(count(spice) > count(ri), `${r.id} has as many finds as the Spice Isles`);
    if (ri !== fire) assert.ok(REGIONS[fire].richness > r.richness);
  });
});

function distToArc(p: V3, a: V3, b: V3): number {
  const n = normalize(v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)), s = dot(p, n);
  const q = normalize(v3(p.x - n.x * s, p.y - n.y * s, p.z - n.z * s)), ab = Math.acos(Math.min(1, dot(a, b)));
  if (Math.acos(Math.min(1, dot(a, q))) + Math.acos(Math.min(1, dot(q, b))) <= ab + 1e-9) return R * Math.asin(Math.min(1, Math.abs(s)));
  return R * Math.min(Math.acos(Math.min(1, dot(p, a))), Math.acos(Math.min(1, dot(p, b))));
}

function step(p: V3, t: V3, d: number, out: V3): V3 {
  const a = d / R, c = Math.cos(a), s = Math.sin(a);
  return normalize(Object.assign(out, { x: p.x * c + t.x * s, y: p.y * c + t.y * s, z: p.z * c + t.z * s }));
}
