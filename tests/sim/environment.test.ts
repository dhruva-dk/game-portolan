// WP6, the environment: one planetary wind shifting slowly through the match, gusts running downwind, the apparent
// wind a ship's sails and pennants show, the lanes and the Great Current carrying ships (part A); the tide's
// passages, the weather, the hour, the regions' moving waters and the tick budget (part B).
//   node --test tests/sim/environment.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOW_WATER, aground, brew, currentAt, floeAt, floesAt, gustAt, newWind, seaFor, seaLevel, tideOf, untilTide, vortexAt,
  windAt,
} from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { PI, cross, dot, length, normalize, v3, type V3 } from '../../src/sim/math.ts';
import { step } from '../../src/sim/match.ts';
import { BUMPED, apparentWind, newTrim, scald, trim } from '../../src/sim/sailing.ts';
import { R, TERRITORY, cellDir, cellOf, tangentToward } from '../../src/sim/sphere.ts';
import { SAIL, TICK, createMatch, type MatchState, type Ship } from '../../src/sim/state.ts';
import {
  DAY, FITTING, FORMS, GREAT_CURRENT, GUSTS, SAILS, SLOT, SPELL, VORTEX, WEATHER, WIND,
} from '../../src/sim/tables.ts';
import { hourOf, inFog, newSky, skyAt, sunDir, veiled } from '../../src/sim/weather.ts';
import { CHARTS, ZONE, coastAt, regionOf, toWorld } from '../../src/sim/world/geography.ts';
import { NAV } from '../../src/sim/world/nav.ts';
import { DRAFT, REGIONS, TIDE } from '../../src/sim/world/regions.ts';
import { world } from './vectors.ts';

const SEED = 20261024;
const sea = seaFor(world(), SEED);

/** n points spread evenly over the planet. */
function spread(n: number): V3[] {
  return Array.from({ length: n }, (_, k) => {
    const z = 1 - (2 * k + 1) / n, r = Math.sqrt(1 - z * z), lon = k * 2.399963229728653;
    return v3(r * Math.cos(lon), r * Math.sin(lon), z);
  });
}

const angle = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (length(a) * length(b))))) * (180 / PI);

/** The base wind (no gust has spawned before the first tick) everywhere at a match time. */
function field(s: MatchState, seconds: number, points: V3[]): V3[] {
  s.tick = Math.round(seconds / TICK);
  return points.map((p) => ({ ...windAt(sea, s, p, newWind()).v }));
}

test('the wind is one planetary field, tangent and fair, shifting slowly through the match', (t) => {
  const s = createMatch({ seed: SEED }), points = spread(400), w = newWind();
  const now = field(s, 60, points), settled = points.map((p) => windAt(sea, s, p, newWind()).steady >= 0.5);
  const soon = field(s, 61, points), late = field(s, 660, points);
  let unsettled = 0;
  for (let k = 0; k < points.length; k++) {
    windAt(sea, s, points[k], w);
    assert.ok(Math.abs(dot(w.v, points[k])) < 1e-9 * WIND.speed, 'tangent to the sea');
    if (!sheltered(points[k])) assert.ok(Math.abs(length(w.v) - WIND.speed) < 1e-9, 'fair strength everywhere outside gusts, weather and the mangroves');
    if (w.steady < 0.5) unsettled++;
  }
  const second = Math.max(...points.map((_, k) => (settled[k] ? angle(now[k], soon[k]) : 0)));
  const match = points.reduce((sum, _, k) => sum + angle(now[k], late[k]), 0) / points.length;
  t.diagnostic(`where settled, the wind turns at most ${second.toFixed(2)}° in a second, ${match.toFixed(1)}° on average over ten minutes; ${unsettled} of 400 points lie in a swirl's unsettled eye`);
  assert.ok(second < 2, 'never a sudden shift');
  assert.ok(match > 20 && match < 120, 'a visible shift over a match');
  assert.ok(unsettled < 60, 'the wind mostly has a settled direction');
  const other = seaFor(world(), SEED + 1), o = newWind();
  const differ = points.reduce((sum, p, k) => sum + angle(windAt(other, s, p, o).v, late[k]), 0) / points.length;
  assert.ok(differ > 45, 'every seed blows its own wind');
});

test('gusts run downwind, rise and die, and cover a fair share of the sea', (t) => {
  const s = createMatch({ seed: SEED }), idle = idleInput(), points = spread(2000), w = newWind(), sky = newSky();
  for (let k = 0; k < 30 / TICK; k++) step(sea, s, idle);
  assert.ok(s.gusts.every((g) => g.life > 0 && g.age <= g.life + TICK), 'every gust is alive');
  const covered = points.filter((p) => gustAt(s, p) > 0.05).length / points.length;
  t.diagnostic(`${(100 * covered).toFixed(1)} % of the sea lies in a gust`);
  assert.ok(covered > 0.05 && covered < 0.3);
  for (const p of points.filter((q) => !sheltered(q))) {
    windAt(sea, s, p, w);
    const gusty = (1 + GUSTS.strength * w.gust) * skyAt(s, p, sky).wind;
    assert.ok(Math.abs(w.strength - gusty) < 1e-12, 'a gust adds to the wind\'s strength, and the weather scales it');
  }
  const g = s.gusts.find((x) => x.age < x.life - 1)!, from = { ...g.at };
  windAt(sea, s, from, w);
  const blow = { ...w.v };
  for (let k = 0; k < 1 / TICK - 1; k++) step(sea, s, idle);
  const moved = v3(g.at.x - from.x, g.at.y - from.y, g.at.z - from.z);
  assert.ok(angle(moved, blow) < 10, 'it runs with the wind');
  assert.ok(Math.abs((length(moved) * R) / (WIND.speed * GUSTS.drift) - 1) < 0.05, 'at its pace');
});

test('the apparent wind: running before it a ship feels less than the true wind, beating into it more', () => {
  const s = createMatch({ seed: SEED }), ship = s.ships[0], w = newWind(), out = v3();
  windAt(sea, s, ship.pos, w);
  const down = normalize({ ...w.v });
  ship.head = { ...down };
  const run = apparentWind(sea, s, 0, out);
  ship.head = v3(-down.x, -down.y, -down.z);
  const beat = apparentWind(sea, s, 0, out);
  assert.ok(run < WIND.speed && beat > WIND.speed, `${run.toFixed(2)} < ${WIND.speed} < ${beat.toFixed(2)}`);
  assert.ok(dot(out, ship.head) < 0, 'beating, it blows from ahead');
});

test('the lanes and the Great Current carry ships along them', (t) => {
  const c = v3(), lane = sea.geo.lanes[0], mid = normalize(v3(lane.a.x + lane.b.x, lane.a.y + lane.b.y, lane.a.z + lane.b.z));
  const along = normalize(cross(v3(), normalize(cross(v3(), lane.a, lane.b)), mid));
  currentAt(sea, mid, c);
  assert.ok(Math.abs(dot(c, along) - lane.speed) < 0.05 && length(c) < lane.speed + 0.05, 'full speed down the lane\'s middle');
  const side = normalize(cross(v3(), mid, along)), off = (u: number) => normalize(v3(mid.x + side.x * u / R, mid.y + side.y * u / R, mid.z + side.z * u / R));
  assert.equal(length(currentAt(sea, off(lane.width / 2 + 0.5), c)), 0, 'nothing beyond its edge');
  assert.ok(length(currentAt(sea, off(lane.width / 4), c)) < lane.speed * 0.6, 'slacker towards it');

  const pts = sea.current.points, k = 3 * Math.floor(pts.length / 6), at = v3(pts[k], pts[k + 1], pts[k + 2]);
  const ahead = normalize(v3(pts[k + 3] - pts[k - 3], pts[k + 4] - pts[k - 2], pts[k + 5] - pts[k - 1]));
  currentAt(sea, at, c);
  t.diagnostic(`the Great Current runs ${dot(c, ahead).toFixed(2)} u/s at its middle`);
  assert.ok(Math.abs(dot(c, ahead) - GREAT_CURRENT.speed) < 0.1, 'the Great Current at full speed');

  // A reefed ship sailing down the lane's middle makes good its own way plus the lane's.
  const s = createMatch({ seed: SEED }), ship = s.ships[0], idle = idleInput();
  ship.pos = { ...mid };
  ship.head = { ...along };
  ship.sail = SAIL.reefed;
  ship.speed = FORMS[ship.form].speed * 0.72;
  const from = { ...mid };
  for (let n = 0; n < 2 / TICK; n++) step(sea, s, idle);
  const made = (R * Math.acos(dot(from, ship.pos))) / 2;
  assert.ok(made > ship.speed + 0.8 * lane.speed, `${made.toFixed(2)} u/s over the ground`);

  // The fleet opens riding the Great Current, faster than sail alone could carry it.
  const r = createMatch({ seed: SEED }), start = { ...r.ships[0].pos };
  for (let n = 0; n < 20 / TICK; n++) step(sea, r, idle);
  const rode = (R * Math.acos(dot(start, r.ships[0].pos))) / 20;
  t.diagnostic(`the player rides the Great Current at ${rode.toFixed(2)} u/s over the first 20 s`);
  assert.ok(rode > FORMS[0].speed * 1.22 * 1.15, 'the current carries the fleet');
});

test('the tide rises and falls on its period', () => {
  assert.equal(seaLevel(0), 0);
  assert.ok(Math.abs(seaLevel(TIDE.period / 4) - TIDE.amp) < 1e-12);
  assert.ok(Math.abs(seaLevel((3 * TIDE.period) / 4) - LOW_WATER) < 1e-12, 'low water is the lowest it falls');
});

// ---------------------------------------------------------------------------------------------------------------
// Part B: the tide's passages, the weather, the hour, and the regions' moving waters

const regionNamed = (id: string) => REGIONS.findIndex((r) => r.id === id);
const chord = (a: V3, b: V3) => R * Math.sqrt(Math.max(0, 2 - 2 * dot(a, b)));
const pct = (x: number) => `${(100 * x).toFixed(1)} %`;
const zoneOf = (p: V3) => sea.geo.zones[cellOf(TERRITORY, p)];

/** A region's territory cells whose zone has all of `bits` and none of `without`, deep enough at low water when `wet`. */
function cellsOf(ri: number, bits: number, without = 0, wet = true): V3[] {
  const out: V3[] = [], { region, zones, heights } = sea.geo;
  for (let c = 0; c < TERRITORY.cells; c++) {
    if (region[c] !== ri || (zones[c] & bits) !== bits || (zones[c] & without) !== 0) continue;
    if (!wet || heights[c] < LOW_WATER - DRAFT) out.push(cellDir(TERRITORY, c, v3()));
  }
  return out;
}

/** A point about d u from p. */
function offset(p: V3, d: number): V3 {
  const e = normalize(cross(v3(), p, v3(0, 0, 1)));
  return normalize(v3(p.x + (e.x * d) / R, p.y + (e.y * d) / R, p.z + (e.z * d) / R));
}

/** Whether the mangroves' roots break the wind at p. */
function sheltered(p: V3): boolean {
  const shelter = REGIONS[regionOf(p)].mechanics.shelter;
  return shelter !== undefined && coastAt(sea.geo, p) < shelter.reach;
}

/** A match in fair weather throughout: no spell is ever sent. */
function fairMatch(): MatchState {
  const s = createMatch({ seed: SEED });
  for (const spell of s.weather) spell.life = 1e9;
  return s;
}

/** Ship i put at p, heading toward q under `sail` and making its way. */
function place(s: MatchState, i: number, p: V3, q: V3, sail: number = SAIL.plain): Ship {
  const ship = s.ships[i];
  ship.pos = { ...p };
  ship.was = { ...p };
  ship.head = tangentToward(p, q, v3());
  ship.sail = sail;
  ship.speed = FORMS[ship.form].speed * SAILS[sail].speed;
  return ship;
}

test('the tide opens and shuts the passages of the Amber Shoals and the Atolls on its schedule', (t) => {
  const p = v3();
  for (const id of ['amberShoals', 'coralAtolls']) {
    const ri = regionNamed(id), levels: number[] = [];
    for (let c = 0; c < NAV.cells; c++) {
      if (regionOf(cellDir(NAV, c, p)) !== ri) continue;
      for (let k = 0; k < 4; k++) {
        const level = sea.nav.edge[4 * c + k];
        if (level > LOW_WATER && level < TIDE.amp) levels.push(level);
      }
    }
    const heights = new Set(levels.map((l) => Math.round(l * 20))).size;
    t.diagnostic(`${id}: ${levels.length} nav edges open and shut with the tide, at ${heights} heights`);
    assert.ok(levels.length >= 4, `${id} has passages the tide opens and shuts`);
    if (id === 'amberShoals') assert.ok(heights >= 4, 'the passages between the shoals open at their own heights, so their own hours');
    for (const level of levels) {
      for (let k = 0; k < 6; k++) {
        const at = 3 + k * 23.7, open = seaLevel(at) > level, wait = untilTide(level, at);
        assert.ok(wait > 0 && wait <= TIDE.period, 'every passage opens and shuts once a tide');
        assert.equal(seaLevel(at + wait - 1e-3) > level, open, 'it holds until the time given');
        assert.equal(seaLevel(at + wait + 1e-3) > level, !open, 'then it opens or shuts');
      }
    }
  }
  assert.equal(untilTide(LOW_WATER - 0.1, 10), Infinity, 'a passage below low water never shuts');
  assert.equal(untilTide(TIDE.amp + 0.1, 10), Infinity, 'one above high water never opens');
  const s = createMatch({ seed: SEED });
  s.tick = 1234;
  assert.equal(tideOf(s), seaLevel(1234 * TICK), 'the renderer reads the sea level now');
});

test('over 200 seeds the weather keeps each region\'s tendencies: fog in the Fjords and Stacks, calms on the Glass Sea and Shoals, squalls at sea', (t) => {
  const pts = spread(240), region = pts.map(regionOf), open = pts.map((p) => coastAt(sea.geo, p) >= WEATHER.open);
  const seas = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => seaFor(world(), seed)), sky = newSky();
  const seen = REGIONS.map(() => [0, 0, 0, 0]), squalls = [0, 0, 0, 0]; // near land: samples, squalls; open sea: the same
  for (let seed = 1; seed <= 200; seed++) {
    const s = createMatch({ seed }), waters = seas[seed % seas.length];
    while (s.tick < 9000) {
      brew(waters, s);
      if (++s.tick % 300 !== 0) continue;
      for (let k = 0; k < pts.length; k++) {
        skyAt(s, pts[k], sky);
        const r = seen[region[k]], o = open[k] ? 2 : 0;
        r[0]++;
        if (sky.fog >= 0.5) r[SPELL.fog]++;
        if (sky.squall >= 0.5) r[SPELL.squall]++;
        if (sky.calm >= 0.5) r[SPELL.calm]++;
        squalls[o]++;
        if (sky.squall >= 0.5) squalls[o + 1]++;
      }
    }
  }
  const share = (ri: number, kind: number) => seen[ri][kind] / seen[ri][0];
  REGIONS.forEach((r, ri) => t.diagnostic(`${r.id.padEnd(18)} fog ${pct(share(ri, SPELL.fog))}  squall ${pct(share(ri, SPELL.squall))}  calm ${pct(share(ri, SPELL.calm))}`));
  const top = (kind: number) => REGIONS.map((_, ri) => ri).sort((a, b) => share(b, kind) - share(a, kind) || a - b).slice(0, 2)
    .map((ri) => REGIONS[ri].id).sort();
  assert.deepEqual(top(SPELL.fog), ['basaltStacks', 'fjords'], 'fog is commonest in the Fjords and the Basalt Stacks');
  assert.deepEqual(top(SPELL.calm), ['amberShoals', 'glassSea'], 'calms are commonest on the Glass Sea and the Amber Shoals');
  const atSea = squalls[3] / squalls[2], nearLand = squalls[1] / squalls[0];
  t.diagnostic(`squalls: open sea ${pct(atSea)}, near land ${pct(nearLand)}`);
  assert.ok(atSea > 1.3 * nearLand, 'squalls are likelier on the open sea');
  REGIONS.forEach((r, ri) => {
    for (const kind of [SPELL.fog, SPELL.squall, SPELL.calm]) assert.ok(share(ri, kind) > 0, `${r.id} sees every kind of weather`);
  });
});

test('a squall blows harder and in gusts, roughs the sea and shortens sight; a calm drops the wind and flattens the sea; fog hides', (t) => {
  const s = fairMatch(), p = spread(7)[3], sky = newSky(), w = newWind(), spell = s.weather[0];
  const fair = windAt(sea, s, p, w).strength;
  Object.assign(spell, { kind: SPELL.squall, at: { ...p }, r: 30, age: 30, life: 1e4 });
  skyAt(s, p, sky);
  assert.equal(sky.squall, 1);
  assert.ok(Math.abs(windAt(sea, s, p, w).strength / fair - (1 + WEATHER.squall.wind)) < 1e-12, 'a squall strengthens the wind');
  assert.equal(sky.sight, WEATHER.squall.sight, 'and shortens sight');
  assert.equal(sky.rough, WEATHER.squall.rough, 'and roughs the sea');
  spell.kind = SPELL.calm;
  assert.ok(Math.abs(windAt(sea, s, p, w).strength / fair - (1 - WEATHER.calm.drop)) < 1e-12, 'a calm drops the wind');
  assert.equal(skyAt(s, p, sky).rough, 0, 'and lays the sea flat as a mirror');
  spell.kind = SPELL.fog;
  const near = offset(p, 8), far = offset(p, 60);
  assert.ok(inFog(s, p) && inFog(s, near) && !inFog(s, far), 'a fog bank has an extent');
  assert.ok(veiled(sea.geo, s, far, p), 'a ship in fog is hidden from a lookout outside it');
  assert.ok(!veiled(sea.geo, s, near, p), 'but seen from inside the same bank');
  assert.ok(!veiled(sea.geo, s, p, far), 'and from inside the fog a lookout sees out');
  assert.ok(Math.abs(skyAt(s, p, sky).sight - WEATHER.fog.sight) < 1e-12, 'and shortens sight inside it');

  spell.kind = SPELL.squall;
  const from = { ...spell.at }, downwind = { ...windAt(sea, s, from, w).v }, idle = idleInput();
  let inside = 0, samples = 0;
  for (let k = 1; k <= 1200; k++) {
    step(sea, s, idle);
    if (k <= 450 || k % 30 !== 0) continue;
    samples++;
    inside += s.gusts.filter((g) => g.life > 0 && chord(g.at, spell.at) < spell.r).length;
  }
  const background = (GUSTS.count * spell.r * spell.r) / (4 * R * R);
  t.diagnostic(`gusts inside the squall: ${(inside / samples).toFixed(2)} on average, against ${background.toFixed(2)} on open sea`);
  assert.ok(inside / samples > 2.5 * background, 'a squall blows in gusts');
  const moved = chord(from, spell.at), expected = WEATHER.drift * WIND.speed * 40;
  t.diagnostic(`the squall drifted ${moved.toFixed(1)} u in 40 s (${expected.toFixed(1)} u at its drift)`);
  assert.ok(moved > 0.7 * expected && moved < 1.05 * expected, 'it drifts at its pace');
  assert.ok(dot(v3(spell.at.x - from.x, spell.at.y - from.y, spell.at.z - from.z), downwind) > 0, 'downwind');

  const a = createMatch({ seed: 1 }), b = createMatch({ seed: 2 });
  brew(sea, a);
  brew(sea, b);
  assert.notDeepEqual(a.weather, b.weather, 'each seed sets its own weather');
});

test('each match starts at an hour its seed sets, and ten minutes of play cover a visible stretch of the day', () => {
  const used = DAY.starts.map(() => 0);
  for (let seed = 1; seed <= 200; seed++) {
    const h = createMatch({ seed }).hour, k = DAY.starts.findIndex(([from, to]) => h >= from && h < to);
    assert.ok(k >= 0, `seed ${seed} starts at ${h.toFixed(2)}, inside an opening`);
    used[k]++;
  }
  assert.ok(used.every((n) => n > 40), `every opening is used: ${used}`);
  const s = createMatch({ seed: SEED, hour: 15 });
  s.tick = 18000;
  assert.ok(Math.abs(hourOf(s) - 18.5) < 1e-9, 'afternoon at the start, dusk ten minutes on');
  const sun = v3(), near = (a: V3, x: number, y: number, z: number) => Math.hypot(a.x - x, a.y - y, a.z - z) < 1e-9;
  assert.ok(near(sunDir(6, sun), 1, 0, 0), 'the sun rises due east');
  assert.ok(near(sunDir(12, sun), Math.cos(PI / 2), -0.5, Math.sqrt(3) / 2), 'and stands 60° high toward the south at noon');
  assert.ok(near(sunDir(18, sun), -1, sun.y, sun.z) && Math.abs(sun.z) < 1e-9, 'it sets due west');
  assert.ok(sunDir(0, sun).z < 0, 'and is under the horizon at night');
  assert.throws(() => createMatch({ seed: 1, hour: 24 }), RangeError);
});

test('the Ice Crown\'s floes turn on their rings, so lanes through the pack open and close; ships slow among them and stop at them', (t) => {
  const ri = regionNamed('iceCrown'), floes = sea.geo.floes, rings = REGIONS[ri].mechanics.floes, p = v3();
  assert.ok(rings);
  // A lane: a corridor 3 u wide straight out through the outer two rings at a bearing, clear of every floe.
  const clear = (b: number, at: number) => {
    const cb = Math.cos(b), sb = Math.sin(b);
    for (let d = 24; d <= 56; d += 0.5) {
      for (const w of [-1.5, 0, 1.5]) if (floeAt(sea, at, toWorld(ri, d * cb - w * sb, d * sb + w * cb, p)) >= 0) return false;
    }
    return true;
  };
  const B = 36, T = 120, someOpen = new Array<boolean>(T).fill(false);
  let toggling = 0;
  for (let k = 0; k < B; k++) {
    let was = clear((2 * PI * k) / B, 0), flips = 0;
    for (let j = 0; j < T; j++) {
      const now = clear((2 * PI * k) / B, j * 5);
      if (now !== was) flips++;
      if (now) someOpen[j] = true;
      was = now;
    }
    if (flips >= 2) toggling++;
  }
  const open = someOpen.filter(Boolean).length;
  t.diagnostic(`${toggling}/${B} lanes open and close over ten minutes; some lane runs clear at ${open}/${T} moments`);
  assert.ok(toggling >= B / 3, 'lanes open and close as the rings turn');
  assert.ok(open >= T / 2, 'most of the time some lane runs clear');

  const f0 = { ...floesAt(sea, 0)[0] }, f60 = floesAt(sea, 60)[0], turn = rings[floes[0].ring].speed * 60;
  assert.ok(Math.abs(chord(f0, f60) - 2 * floes[0].r * Math.abs(Math.sin(turn / 2))) < 0.3, 'each floe turns with its ring');
  const s = fairMatch();
  assert.ok(aground(sea, s, f0), 'a floe is solid');
  const pack = cellsOf(ri, ZONE.pack).find((q) => floeAt(sea, 0, q) < 0);
  assert.ok(pack);
  s.ships[0].pos = { ...pack };
  assert.equal(trim(sea, s, 0, newTrim()).speed, REGIONS[ri].mechanics.packSlow, 'ships move slowly among the floes');

  const outer = floes.findIndex((f, k) => {
    if (f.ring !== rings.length - 1) return false;
    const q = toWorld(ri, (f.r + 9) * Math.cos(f.angle), (f.r + 9) * Math.sin(f.angle), p);
    return coastAt(sea.geo, q) > 4 && coastAt(sea.geo, floesAt(sea, 0)[k]) > 4;
  });
  assert.ok(outer >= 0);
  const fo = floes[outer], ship = place(s, 0, toWorld(ri, (fo.r + 9) * Math.cos(fo.angle), (fo.r + 9) * Math.sin(fo.angle), v3()),
    { ...floesAt(sea, 0)[outer] }), idle = idleInput();
  let struck = false, onIce = false;
  for (let k = 0; k < 600 && !struck; k++) {
    step(sea, s, idle);
    struck = ship.bumped === BUMPED.land;
    onIce ||= floeAt(sea, s.tick * TICK, ship.pos) >= 0;
  }
  assert.ok(struck, 'a ship sailing at a floe strikes it');
  assert.ok(!onIce, 'and never sails onto it');
});

test('kelp slows any ship inside it and hides it from ships outside it', () => {
  const ri = regionNamed('kelpShallows'), kelp = cellsOf(ri, ZONE.kelp), s = fairMatch();
  const clear = cellsOf(ri, 0, ZONE.kelp).find((q) => coastAt(sea.geo, q) > 6);
  assert.ok(kelp.length > 100 && clear);
  const a = kelp[kelp.length >> 1], b = kelp[0];
  s.ships[0].pos = { ...a };
  const slowed = trim(sea, s, 0, newTrim()).speed;
  s.ships[0].pos = { ...clear };
  assert.equal(slowed / trim(sea, s, 0, newTrim()).speed, REGIONS[ri].mechanics.kelp?.slow, 'kelp slows a ship inside it');
  assert.ok(veiled(sea.geo, s, clear, a), 'and hides it from a ship outside');
  assert.ok(!veiled(sea.geo, s, b, a), 'but not from a ship in the kelp');
  assert.ok(!veiled(sea.geo, s, a, clear), 'and a ship in the kelp sees out');
  assert.ok((zoneOf(a) & ZONE.kelp) !== 0 && (zoneOf(clear) & ZONE.kelp) === 0);
});

test('the Maelstrom flings ships round its vortex and out of it at speed, at full speed under their own colour', (t) => {
  const mi = regionNamed('maelstrom'), c = CHARTS[mi].c, vx = REGIONS[mi].mechanics.vortex, flow = v3(), cw = v3();
  assert.ok(vx);
  const at = (d: number, b: number) => toWorld(mi, d * Math.sin(b), d * Math.cos(b), v3());
  for (const d of [3, 10, 25, 40]) {
    const p = at(d, 1);
    assert.ok(vortexAt(p, flow), `${d} u from the eye lies in the vortex`);
    assert.ok(dot(flow, cross(cw, p, c)) > 0, 'it turns clockwise seen from above');
    assert.ok(dot(flow, c) > 0, 'and draws in toward the eye');
  }
  vortexAt(at(vx.eye + 0.5, 1), flow);
  const wall = length(flow);
  vortexAt(at(40, 1), flow);
  assert.ok(length(flow) < wall && wall > 0.9 * vx.swirl, 'strongest at the eye wall');
  assert.ok(!vortexAt(at(vx.r + 3, 1), flow) && length(flow) === 0, 'nothing beyond its rim');

  const way = Array.from({ length: 72 }, (_, k) => (k * PI) / 36).find((b) => {
    for (let d = 20; d <= 80; d++) if (coastAt(sea.geo, at(d, b)) < 4) return false;
    return true;
  });
  assert.ok(way !== undefined, 'a clear way out of the vortex');
  const eye = sea.geo.landmarks.findIndex((l) => l.perk === 'eye');
  const ride = (own: boolean) => {
    const s = fairMatch(), ship = place(s, 0, at(24, way), at(90, way), SAIL.full), idle = idleInput();
    if (own) s.owner[sea.marks[eye]] = 1;
    let gripped = 0, launch = 0, left = -1, later = -1;
    for (let k = 1; k <= 1800 && later < 0; k++) {
      const inside = vortexAt(ship.pos, flow);
      step(sea, s, idle);
      if (k === 45) gripped = length(ship.fling) / length(flow);
      if (left < 0 && inside && !vortexAt(ship.pos, flow)) left = k;
      if (left > 0 && k === left + 1) launch = length(ship.fling); // the tick after it crossed the rim
      if (left > 0 && k === left + 60) later = length(ship.fling);
    }
    return { gripped, launch, later };
  };
  const plain = ride(false), held = ride(true);
  t.diagnostic(`gripped ${pct(plain.gripped)} of the flow after 1.5 s; launched at ${plain.launch.toFixed(2)} u/s, ${held.launch.toFixed(2)} u/s holding The Eye`);
  assert.ok(plain.gripped > 0.5, 'the vortex\'s water takes a ship round with it');
  assert.ok(plain.launch > 0 && Math.abs(held.launch / plain.launch - 1 / VORTEX.keep) < 0.05, 'a ship leaving it keeps part of that way');
  assert.ok(held.launch > 3, 'and all of it under its own colour: The Eye launches it at full speed');
  assert.ok(plain.later >= 0 && plain.later < plain.launch, 'then the way dies off');
});

test('among the mangroves the roots break the wind near the banks', () => {
  const ri = regionNamed('mangroveLabyrinth'), shelter = REGIONS[ri].mechanics.shelter, s = fairMatch(), w = newWind();
  assert.ok(shelter);
  const water = cellsOf(ri, 0), banks = water.filter((q) => coastAt(sea.geo, q) > 0.5 && coastAt(sea.geo, q) < 2.5);
  const open = water.find((q) => coastAt(sea.geo, q) > shelter.reach + 5);
  assert.ok(banks.length > 100 && open);
  for (const q of banks.slice(0, 200)) {
    const lee = shelter.still + ((1 - shelter.still) * coastAt(sea.geo, q)) / shelter.reach;
    assert.ok(Math.abs(windAt(sea, s, q, w).strength - lee) < 1e-12, 'the wind is lighter near the banks');
  }
  assert.equal(windAt(sea, s, open, w).strength, 1, 'and whole out in open water');
});

test('the Fire Archipelago\'s hot water scalds hulls, all but copper-sheathed ones', () => {
  const ri = regionNamed('fireArchipelago'), hot = cellsOf(ri, ZONE.hot, 0, false), s = fairMatch(), ship = s.ships[0];
  assert.ok(hot.length > 0);
  ship.pos = { ...hot[0] };
  assert.equal(scald(sea, s, 0), REGIONS[ri].mechanics.hotDamage, 'hot water scalds a hull');
  ship.fittings[SLOT.hull] = { kind: FITTING.copperSheathing, tier: 0 };
  assert.equal(scald(sea, s, 0), 0, 'but not a copper-sheathed one');
  ship.pos = spread(7)[3];
  assert.equal(scald(sea, s, 0), 0, 'and cold water scalds nothing');
});

test('the sim stays within its tick budget (A9: Node mean ≤ 0.3 ms, ten ships under all the weather)', (t) => {
  const s = createMatch({ seed: SEED }), idle = idleInput(), times: number[] = [];
  for (let k = 0; k < 3600; k++) {
    const t0 = performance.now();
    step(sea, s, idle);
    times.push(performance.now() - t0);
  }
  const warm = times.slice(300).sort((a, b) => a - b), mean = warm.reduce((a, b) => a + b, 0) / warm.length;
  t.diagnostic(`tick: mean ${(1000 * mean).toFixed(0)} µs, p99 ${(1000 * warm[Math.floor(0.99 * warm.length)]).toFixed(0)} µs`);
  assert.ok(mean <= 0.3, 'within the Node budget');
});
