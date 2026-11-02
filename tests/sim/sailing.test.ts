// Sailing and the sea around it, measured against PLAN.md's pass 1 lines: the speeds, turning, great circles,
// grounding, currents, the gust, the wind, tides, day and night, weather, and lanterns at night.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floeTime, hourOf, isNight, localHour, seaLevel, seaLevelAt, solidAt, sunDir } from '../../src/sim/environment.ts';
import { cross, dot, length, normalize, rngFloat, rngFrom, set, v3, type V3 } from '../../src/sim/math.ts';
import { pointOfSail, settledSpeed, turnRate } from '../../src/sim/sailing.ts';
import { R, along, apart, fromLatLon, localFrame, tangentAt, tangentToward } from '../../src/sim/sphere.ts';
import { CAUSE, EVENT, TICK, type MatchState } from '../../src/sim/state.ts';
import { DAY, GUST, SHIP, TIDE, WEATHER, WEATHER_KIND, WIND } from '../../src/sim/tables.ts';
import { RULE } from '../../src/sim/rules.ts';
import { seen, SEEN, sightOf } from '../../src/sim/visibility.ts';
import { brew, newSky, skyAt } from '../../src/sim/weather.ts';
import { newWind, windAt } from '../../src/sim/wind.ts';
import {
  CENTRES, CURRENTS, DRAFT, FLOES, GREAT_CURRENT, OBSTACLES, REGIONS, TIDE_AMPLITUDE, VORTEX, currentAt, floePos, heightAt,
  navigable, obstacleAt, regionAt, type Obstacle,
} from '../../src/sim/world/index.ts';
import { events, openWater, place, quietMatch, run, sailOn, type Course } from './fixture.ts';

/** The Glass Sea: a long clear run, and no other ship of the quiet match within 450 m of it. */
const G = 8;
const COURSE = openWater(G, 160);

function sailing(q: Parameters<typeof quietMatch>[0] = {}): MatchState {
  const state = quietMatch(q);
  place(state, G, COURSE);
  return state;
}

const only = (i: number, input: ReturnType<typeof sailOn>) => (j: number) => (j === i ? input : null);
const deep = (p: V3, margin = 1): boolean => heightAt(p) < -TIDE_AMPLITUDE - DRAFT - margin;
const clearOfShips = (state: MatchState, p: V3, metres: number): boolean => state.ships.every((s, j) => j === G || apart(s.pos, p) > metres);
const sub = (out: V3, a: V3, b: V3): V3 => set(out, a.x - b.x, a.y - b.y, a.z - b.z);
const latOf = (p: V3): number => Math.asin(Math.max(-1, Math.min(1, p.y)));

test('she makes at most 14.5 m/s under sail, and close to it on a fair wind', (t) => {
  let least = 1, most = 0;
  for (let a = 0; a <= Math.PI; a += 0.001) {
    least = Math.min(least, pointOfSail(a));
    most = Math.max(most, pointOfSail(a));
  }
  t.diagnostic(`point of sail from ${least.toFixed(3)} to ${most.toFixed(3)}; running ${pointOfSail(0)}, close-hauled ${pointOfSail(Math.PI).toFixed(3)}`);
  assert.ok(least >= 0.75 - 1e-9, 'at most 25% slower upwind');
  assert.ok(Math.abs(most - 1) < 1e-9 && Math.abs(pointOfSail(Math.PI / 2) - 1) < 1e-9, 'fastest on a reach');

  const state = sailing(), ship = state.ships[G], beam = newWind();
  cross(beam.v, ship.pos, ship.head);
  beam.strength = beam.steady = beam.lee = 1;
  assert.ok(Math.abs(settledSpeed(ship, beam, 1) - SHIP.top) < 1e-9, 'a steady breeze on the beam gives 14.5 m/s');

  let top = 0;
  run(state, 9, only(G, sailOn()), (s) => {
    top = Math.max(top, s.ships[G].speed);
  });
  const wind = windAt(state, ship.pos, newWind()), settled = settledSpeed(ship, wind, 1);
  t.diagnostic(`top ${top.toFixed(2)} m/s; settles to ${settled.toFixed(2)} on this wind (strength ${wind.strength.toFixed(2)}), at ${ship.speed.toFixed(2)}`);
  assert.ok(top <= SHIP.top + 1e-9, 'never faster than 14.5 m/s without a gust');
  assert.ok(Math.abs(ship.speed - settled) < 0.03 * settled, 'she settles to the speed the wind gives her');
  assert.ok(settled > 0.5 * SHIP.top, 'and the wind gives her way');
});

test('with the helm amidships she runs a great circle', () => {
  const state = sailing(), ship = state.ships[G], n = cross(v3(), ship.pos, ship.head);
  let off = 0;
  run(state, 9, only(G, sailOn()), (s) => {
    off = Math.max(off, Math.abs(dot(s.ships[G].pos, n)) * R);
  });
  assert.ok(apart(ship.pos, COURSE.pos) > 80, 'she went somewhere');
  assert.ok(off < 0.5, `strayed ${off.toFixed(2)} m off her great circle`);
});

test('she turns at up to her turning rate, and crawls through a hard turn', (t) => {
  const state = sailing();
  run(state, 3, only(G, sailOn()));
  const ship = state.ships[G], before = v3(ship.head.x, ship.head.y, ship.head.z);
  run(state, 1, only(G, sailOn({ steer: 0.3 })));
  const rate = turnRate(ship), turned = Math.acos(Math.max(-1, Math.min(1, dot(before, ship.head))));
  t.diagnostic(`rate ${ship.rate.toFixed(3)} of ${rate.toFixed(3)} rad/s at ${ship.speed.toFixed(1)} m/s; turned ${turned.toFixed(2)} rad in 1 s`);
  assert.ok(Math.abs(ship.rate - rate) < 0.02 * rate, 'full helm comes up to the full turning rate');
  assert.ok(rate > SHIP.turn + 0.9 * SHIP.turnWay, 'with way on she turns faster than from rest');
  assert.ok(turned > 0.75 * rate && turned < rate, 'and swings her heading that far');

  const hard = sailing();
  run(hard, 3, only(G, sailOn()));
  assert.ok(hard.ships[G].speed > SHIP.crawl + 3);
  run(hard, 2, only(G, sailOn({ steer: SHIP.hard + 0.5 })));
  assert.ok(hard.ships[G].speed <= SHIP.crawl + 1e-9, `a hard turn holds her to ${SHIP.crawl} m/s, not ${hard.ships[G].speed.toFixed(2)}`);
});

/**
 * From the open course, the first bearing that meets a shore between 40 and 200 m off over still, deep water:
 * land that goes on for 12 m, not a thin rim like Glasswater's.
 */
function towardLand(): { course: Course; land: number } {
  const T = v3(), P = v3(), C = v3();
  for (let b = 0; b < 2 * Math.PI; b += Math.PI / 90) {
    tangentAt(COURSE.pos, b, T);
    for (let d = 2; d <= 200; d += 1) {
      along(COURSE.pos, T, d, P);
      if (heightAt(P) > 0) {
        if (d >= 40 && heightAt(along(COURSE.pos, T, d + 12, P)) > 0) return { course: { pos: v3(COURSE.pos.x, COURSE.pos.y, COURSE.pos.z), head: v3(T.x, T.y, T.z) }, land: d };
        break;
      }
      currentAt(P, C);
      if (d < 20 && (!deep(P) || length(C) > 0.05)) break;
    }
  }
  throw new Error('no shore in reach of the Glass Sea course');
}

test('she stops at the shore and never sails onto land', (t) => {
  const { course, land } = towardLand(), state = quietMatch(), shore = along(course.pos, course.head, land, v3());
  place(state, G, course);
  let dry = 0, scrapes = 0, closest = 1e9;
  run(state, 18, only(G, sailOn()), (s) => {
    const ship = s.ships[G];
    if (heightAt(ship.pos) >= seaLevel(s)) dry++;
    scrapes += events(s, EVENT.scrape).filter((e) => e.ship === G).length;
    closest = Math.min(closest, apart(ship.pos, shore));
  });
  t.diagnostic(`land ${land} m ahead; came within ${closest.toFixed(1)} m of it; ${scrapes} scrapes`);
  assert.equal(dry, 0, 'her keel never stood on dry land');
  assert.ok(closest < SHIP.half + 6, 'she sailed right up to the shore');
  assert.ok(scrapes >= 1, 'and scraped it');
});

test('a hull with her stern on the ground can still sail off it', () => {
  const { course, land } = towardLand(), state = quietMatch(), level = seaLevel(state);
  const P = v3(), S = v3(), back = set(v3(), -course.head.x, -course.head.y, -course.head.z);
  let found: Course | null = null;
  for (let d = land - 1; d > land - 40 && !found; d -= 0.25) {
    along(course.pos, course.head, d, P);
    along(P, course.head, SHIP.half * 0.8, S);
    if (heightAt(P) < level - DRAFT - 0.1 && heightAt(S) > level - DRAFT) {
      const head = normalize(sub(v3(), along(P, back, 1, v3()), P));
      found = { pos: v3(P.x, P.y, P.z), head: normalize(set(head, head.x - P.x * dot(head, P), head.y - P.y * dot(head, P), head.z - P.z * dot(head, P))) };
    }
  }
  assert.ok(found, 'a spot with the stern over the ground and the keel afloat');
  place(state, G, found);
  run(state, 5, only(G, sailOn()));
  assert.ok(apart(state.ships[G].pos, found.pos) > 25, `she got off: ${apart(state.ships[G].pos, found.pos).toFixed(1)} m`);
});

/** Down the slope of the ground at p, off the shore, from its height either side. */
function offShore(p: V3, out: V3): V3 {
  const E = v3(), N = v3(), Q = v3();
  localFrame(p, E, N);
  const gx = heightAt(along(p, E, 3, Q)) - heightAt(along(p, E, -3, Q)), gy = heightAt(along(p, N, 3, Q)) - heightAt(along(p, N, -3, Q));
  return normalize(set(out, -gx * E.x - gy * N.x, -gx * E.y - gy * N.y, -gx * E.z - gy * N.z));
}

/**
 * Courses that run onto a shore at `angle` from straight in, over still, deep water with no column within 40 m of
 * where she meets it: up to three in each region.
 */
function slantingShores(angle: number): { region: number; course: Course }[] {
  const out: { region: number; course: Course }[] = [];
  const T = v3(), P = v3(), H = v3(), S = v3(), Nn = v3(), C = v3(), Q = v3();
  for (let region = 0; region < REGIONS.length; region++) {
    let found = 0;
    for (let d = 60; d <= 400 && found < 3; d += 37) {
      for (let b = 0; b < 2 * Math.PI && found < 3; b += 0.7) {
        tangentAt(CENTRES[region], b, T);
        along(CENTRES[region], T, d, P);
        if (regionAt(P) !== region || !deep(P, 1.5)) continue;
        for (let hb = 0; hb < 2 * Math.PI && found < 3; hb += 0.5) {
          tangentAt(P, hb, H);
          let hit = -1;
          for (let k = 2; k < 80 && hit < 0; k++) if (!deep(along(P, H, k, S), 0.5)) hit = k;
          if (hit < 30) continue;
          along(P, H, hit + 2, S);
          if (OBSTACLES.some((o) => apart(o.pos, S) < o.r + 40)) continue;
          offShore(S, Nn);
          const side = normalize(cross(v3(), Nn, S));
          const head = normalize(set(v3(), -Nn.x * Math.cos(angle) + side.x * Math.sin(angle), -Nn.y * Math.cos(angle) + side.y * Math.sin(angle), -Nn.z * Math.cos(angle) + side.z * Math.sin(angle)));
          const start = along(S, head, -(hit + 2), v3());
          let clear = deep(start, 1);
          for (let k = 0; k < hit - 6 && clear; k += 3) {
            currentAt(along(start, head, k, Q), C);
            clear = deep(Q, 0.5) && length(C) <= 0.05;
          }
          if (!clear) continue;
          const h0 = normalize(set(head, head.x - start.x * dot(head, start), head.y - start.y * dot(head, start), head.z - start.z * dot(head, start)));
          out.push({ region, course: { pos: start, head: h0 } });
          found++;
        }
      }
    }
  }
  return out;
}

test('a ship pressed against a slanting shore slides along it instead of freezing', (t) => {
  let met = 0, slid = 0;
  const stuck: string[] = [];
  for (const { region, course } of slantingShores((50 * Math.PI) / 180)) {
    const state = quietMatch(), at = v3();
    place(state, G, course);
    let contact = -1, dry = 0;
    run(state, 25, only(G, sailOn()), (s) => {
      if (contact < 0 && events(s, EVENT.scrape).some((e) => e.ship === G)) {
        contact = s.tick;
        set(at, s.ships[G].pos.x, s.ships[G].pos.y, s.ships[G].pos.z);
      }
      if (heightAt(s.ships[G].pos) >= seaLevel(s)) dry++;
    });
    if (contact < 0) continue;
    met++;
    assert.equal(dry, 0, `${REGIONS[region].id}: her keel never stood on dry land`);
    const moved = apart(state.ships[G].pos, at);
    if (moved >= 10) slid++;
    else stuck.push(`${REGIONS[region].id} ${moved.toFixed(1)} m`);
  }
  t.diagnostic(`${slid} of ${met} ships run onto a shore 50° from straight in slid 10 m or more along it; stuck: ${stuck.join(', ')}`);
  assert.ok(met >= 30, 'shores met all over the planet');
  assert.ok(slid >= met * 0.9, 'nearly all slide along them');
});

test('she rides the currents: a held ship drifts with a lane, and east with the Great Current', (t) => {
  const state = quietMatch(), C = v3();
  let lane: V3 | null = null;
  for (const l of CURRENTS) {
    for (const p of l.pts) {
      if (deep(p) && length(currentAt(p, C)) > 0.6 && clearOfShips(state, p, 120)) {
        lane = v3(p.x, p.y, p.z);
        break;
      }
    }
    if (lane) break;
  }
  assert.ok(lane, 'a deep stretch of a lane, clear of the fleet');
  const flow = v3(C.x, C.y, C.z), head = tangentAt(lane, 0, v3());
  place(state, G, { pos: lane, head });
  run(state, 3);
  const moved = apart(state.ships[G].pos, lane), dir = normalize(sub(v3(), state.ships[G].pos, lane));
  t.diagnostic(`lane: ${length(flow).toFixed(2)} m/s, she drifted ${moved.toFixed(2)} m in 3 s`);
  assert.ok(Math.abs(moved - 3 * length(flow)) < 0.25 * 3 * length(flow), 'at the lane\'s speed');
  assert.ok(dot(dir, flow) / length(flow) > 0.9, 'and its way');

  const eq = quietMatch(), P = v3(), E = v3(), N = v3();
  let start: V3 | null = null;
  for (let lon = 0; lon < 2 * Math.PI && !start; lon += 0.01) {
    fromLatLon(0, lon, P);
    if (deep(P, 2) && clearOfShips(eq, P, 120)) start = v3(P.x, P.y, P.z);
  }
  assert.ok(start, 'deep water on the equator, clear of the fleet');
  localFrame(start, E, N);
  place(eq, G, { pos: start, head: v3(N.x, N.y, N.z) });
  run(eq, 3);
  const east = dot(sub(v3(), eq.ships[G].pos, start), E) * R;
  t.diagnostic(`the Great Current carried her ${east.toFixed(1)} m east in 3 s`);
  assert.ok(east > 0.5 * GREAT_CURRENT.speed * 3, 'east at half its speed or better');
});

test('the Maelstrom\'s whirlpool spirals a held ship in toward the Eye', (t) => {
  const state = quietMatch(), P = v3(), T = v3(), E = v3(), N = v3();
  let start: V3 | null = null;
  for (let b = 0; b < 2 * Math.PI && !start; b += 0.1) {
    along(VORTEX.pos, tangentAt(VORTEX.pos, b, T), 0.8 * VORTEX.r, P);
    if (deep(P) && clearOfShips(state, P, 120)) start = v3(P.x, P.y, P.z);
  }
  assert.ok(start, 'deep water in the basin, clear of the fleet');
  place(state, G, { pos: start, head: tangentAt(start, 0, v3()) });
  // How far round the Eye she goes, from her bearing as seen from it.
  localFrame(VORTEX.pos, E, N);
  const bearing = (p: V3): number => Math.atan2(dot(p, E), dot(p, N));
  let swept = 0, was = bearing(start), closest = apart(start, VORTEX.pos);
  run(state, 120, () => null, (s) => {
    const p = s.ships[G].pos, b = bearing(p);
    swept += Math.atan2(Math.sin(b - was), Math.cos(b - was));
    was = b;
    closest = Math.min(closest, apart(p, VORTEX.pos));
  });
  const turn = Math.abs(swept) * (180 / Math.PI);
  t.diagnostic(`from ${apart(start, VORTEX.pos).toFixed(0)} m out she went ${turn.toFixed(0)}° round and came within ${closest.toFixed(0)} m of the Eye in 120 s`);
  assert.ok(turn >= 180, 'round the Eye as she goes in, not straight at it');
  assert.ok(closest < 2 * VORTEX.eye, 'in to the calm round the Eye');
});

test('the gust: two charges, a burst of speed and a hop, each charge back after 6.5 s', (t) => {
  const state = sailing(), ship = state.ships[G], start = state.tick + Math.round(2 / TICK);
  const press = new Set([start, start + 10, start + Math.round(1.3 / TICK), start + Math.round(1.4 / TICK)]);
  const said: number[] = [], back: number[] = [];
  let top = 0, high = 0, boosted = 0, charges = ship.gusts;
  run(state, 4.6, (i, tick) => (i === G ? sailOn({ gust: press.has(tick) }) : null), (s) => {
    for (const e of events(s, EVENT.gust)) if (e.ship === G) said.push(e.amount);
    top = Math.max(top, ship.speed);
    high = Math.max(high, ship.alt);
    if (ship.boost > 0) boosted++;
  });
  t.diagnostic(`gusts ${said.join(', ')}; top ${top.toFixed(1)} m/s, hop ${high.toFixed(2)} m, boosted ${(boosted * TICK).toFixed(2)} s`);
  assert.deepEqual(said, [1, 0], 'two charges; none while one is running, none once both are spent');
  assert.ok(top > SHIP.top + GUST.speed / 2 && top <= SHIP.top + GUST.speed + 1e-9, 'a burst of speed above top speed');
  assert.ok(Math.abs(high - (GUST.hop * GUST.hop) / 20) < 0.25, 'a hop of about two metres');
  assert.ok(Math.abs(boosted * TICK - 2 * GUST.time) < 0.1, 'the burst lasts 1.15 s each time');
  charges = ship.gusts;
  run(state, 12, () => null, (s) => {
    if (s.ships[G].gusts > charges) back.push((s.tick - start) * TICK);
    charges = s.ships[G].gusts;
  });
  t.diagnostic(`charges back ${back.map((x) => x.toFixed(2)).join(' and ')} s after the first gust`);
  assert.equal(ship.gusts, GUST.charges, 'both charges back');
  assert.ok(Math.abs(back[0] - GUST.recharge) < 0.1 && Math.abs(back[1] - 2 * GUST.recharge) < 0.1, 'one at a time, 6.5 s apart');
});

test('the wind varies over the planet, falls calm in the lee of land, and bends round rain', (t) => {
  const state = quietMatch(), rng = rngFrom(31), P = v3(), E = v3(), N = v3(), w = newWind(), octants = new Set<number>();
  let speeds = 0, sq = 0, n = 0, leeward = 0, open = 0;
  for (let k = 0; k < 4000; k++) {
    set(P, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1);
    if (length(P) < 0.1 || length(P) > 1) continue;
    normalize(P);
    if (!navigable(P)) continue;
    windAt(state, P, w);
    localFrame(P, E, N);
    octants.add(Math.floor(((Math.atan2(dot(w.v, E), dot(w.v, N)) + Math.PI) / (2 * Math.PI)) * 8) % 8);
    const s = length(w.v);
    speeds += s;
    sq += s * s;
    n++;
    if (w.lee < 1) leeward++;
    else open++;
  }
  const mean = speeds / n, sd = Math.sqrt(sq / n - mean * mean);
  t.diagnostic(`${n} points: mean ${mean.toFixed(2)} m/s, sd ${sd.toFixed(2)}; ${octants.size} of 8 directions; ${leeward} in a lee`);
  assert.equal(octants.size, 8, 'it blows every way somewhere');
  assert.ok(Math.abs(mean - WIND.speed) < 0.25 * WIND.speed && sd > 1, 'about 6 m/s on the whole, more here and less there');
  assert.ok(leeward > 0.02 * n && open > 0.5 * n, 'some water lies in the lee of land');

  // a lee: a point just downwind of land
  let calmest = 1;
  for (let k = 0; k < 4000; k++) {
    set(P, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1);
    if (length(P) < 0.1 || length(P) > 1) continue;
    normalize(P);
    if (navigable(P)) calmest = Math.min(calmest, windAt(state, P, w).lee);
  }
  assert.ok(Math.abs(calmest - WIND.still) < 1e-9, 'close under the land it falls to a quarter');

  const rain = quietMatch(), q = COURSE.pos, before = windAt(rain, q, newWind()).v, centre = along(q, COURSE.head, 30, v3());
  const s = rain.weather[0];
  Object.assign(s, { kind: WEATHER_KIND.rain, r: 100, age: WEATHER.rise, life: 1e9 });
  set(s.at, centre.x, centre.y, centre.z);
  const after = windAt(rain, q, newWind()).v, delta = sub(v3(), after, before), out = normalize(sub(v3(), q, centre));
  t.diagnostic(`rain 30 m off bends the wind by ${length(delta).toFixed(2)} m/s`);
  assert.ok(length(delta) > 2, 'rain spins the wind');
  assert.ok(Math.abs(dot(normalize(delta), out)) < 0.35 || length(after) > length(before), 'round its centre');
});

test('the tide rises and falls a metre either way every 240 s', () => {
  let hi = -2, lo = 2;
  for (let t = 0; t <= 2 * TIDE.period; t += 0.25) {
    const h = seaLevelAt(t);
    hi = Math.max(hi, h);
    lo = Math.min(lo, h);
    assert.ok(Math.abs(seaLevelAt(t + TIDE.period) - h) < 1e-9, 'a 240 s period');
  }
  assert.ok(Math.abs(hi - TIDE_AMPLITUDE) < 1e-6 && Math.abs(lo + TIDE_AMPLITUDE) < 1e-6, `${lo} to ${hi}`);
  assert.equal(TIDE_AMPLITUDE, 1);
});

test('day and night: about four hours pass in a match, night covers half the planet, the sun stands over the tilt', () => {
  const state = quietMatch({ hour: 6, tilt: 0.3 }), rng = rngFrom(5), P = v3(), S = v3();
  const later = { ...state, tick: Math.round(630 / TICK) };
  assert.ok(Math.abs(hourOf(later) - hourOf(state) - 4) < 1e-9, 'four hours in 630 s');
  assert.ok(Math.abs(latOf(sunDir(state, S)) - 0.3) < 1e-9, 'the sun stands over the tilt\'s latitude');
  let night = 0, all = 0;
  for (let k = 0; k < 20_000; k++) {
    set(P, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1, rngFloat(rng) * 2 - 1);
    if (length(P) < 0.1 || length(P) > 1) continue;
    normalize(P);
    all++;
    if (isNight(state, P)) night++;
  }
  assert.ok(Math.abs(night / all - (1 + DAY.dusk) / 2) < 0.015, `night over ${(100 * night / all).toFixed(1)}% of the planet`);
  const a = fromLatLon(0, 0, v3()), b = fromLatLon(0, Math.PI, v3());
  assert.ok(Math.abs(((localHour(state, b) - localHour(state, a) + 24) % 24) - 12) < 1e-9, 'twelve hours apart across the planet');
  const dark = quietMatch({ rule: RULE.nightOnly });
  assert.ok(CENTRES.every((c) => isNight(dark, c)), 'under the night-only rule it is night everywhere');
});

test('weather: three to five systems, each region mostly its own kinds, snow only in the north, ash only near the Fire Archipelago', (t) => {
  const kinds = new Set<number>();
  let own = 0, formed = 0, fewest = 99, most = 0, southSnow = 90, farAsh = 0;
  const FIRE = REGIONS.findIndex((r) => r.id === 'fireArchipelago');
  for (let seed = 1; seed <= 6; seed++) {
    const state = quietMatch({ seed, weather: true });
    state.weather.forEach((s) => (s.kind = -1, s.gap = 0));
    for (let k = 0; k < Math.round(900 / TICK); k++) {
      state.events.length = 0;
      brew(state);
      state.tick++;
      let active = 0;
      for (const s of state.weather) {
        if (s.kind < 0) continue;
        active++;
        if (s.kind === WEATHER_KIND.snow) southSnow = Math.min(southSnow, (latOf(s.at) * 180) / Math.PI);
        if (s.kind === WEATHER_KIND.ash) farAsh = Math.max(farAsh, apart(s.at, CENTRES[FIRE]));
      }
      fewest = Math.min(fewest, active);
      most = Math.max(most, active);
      for (const e of events(state, EVENT.weatherForms)) {
        kinds.add(e.item);
        const region = REGIONS[regionAt(e.at)], mine = region.weather.filter((w) => w !== 'clear').map((w): number => WEATHER_KIND[w as keyof typeof WEATHER_KIND]);
        formed++;
        if (mine.length === 0 || mine.includes(e.item)) own++;
      }
    }
  }
  t.diagnostic(`${formed} systems; ${(100 * own / formed).toFixed(0)}% their region's own; ${fewest}–${most} at once; snow as far south as ${southSnow.toFixed(1)}°; ash up to ${farAsh.toFixed(0)} m from the Fire Archipelago`);
  assert.ok(fewest >= WEATHER.least && most <= WEATHER.slots, 'three to five at once');
  assert.equal(kinds.size, 6, 'all six kinds');
  assert.ok(own / formed > 0.75, 'mostly the region\'s own kinds');
  assert.ok(southSnow >= 45, 'snow keeps to the far north');
  assert.ok(farAsh <= 380, 'ash keeps near the Fire Archipelago');
});

/** A system of a kind sitting at full strength right over ship i. */
function over(state: MatchState, kind: number, i = G): void {
  const s = state.weather[0], p = state.ships[i].pos;
  Object.assign(s, { kind, r: 100, age: WEATHER.rise, life: 1e9, strike: 1, target: -1 });
  set(s.at, p.x, p.y, p.z);
}

test('each weather does its one thing: fog, rain, thunder, calm, snow and ash', (t) => {
  const sky = newSky();
  const fog = sailing();
  over(fog, WEATHER_KIND.fog);
  assert.ok(Math.abs(sightOf(fog, G) - 0.35 * 240) < 1e-6, 'fog cuts the sightline to 35%');
  const rain = sailing();
  over(rain, WEATHER_KIND.rain);
  assert.ok(Math.abs(skyAt(rain, rain.ships[G].pos, sky).wind - WEATHER.rain.wind) < 1e-9, 'rain freshens the wind');
  const calm = sailing();
  over(calm, WEATHER_KIND.calm);
  assert.ok(Math.abs(skyAt(calm, calm.ships[G].pos, sky).wind - WEATHER.calm.wind) < 1e-9, 'a calm kills it');

  const thunder = sailing();
  over(thunder, WEATHER_KIND.thunder);
  const hull = thunder.ships[G].hull + thunder.ships[G].shield;
  let warned = -1, struck = -1;
  run(thunder, 4, () => null, (s) => {
    if (events(s, EVENT.lightningWarn).some((e) => e.ship === G) && warned < 0) warned = s.tick;
    if (events(s, EVENT.hit).some((e) => e.ship === G && e.item === CAUSE.lightning) && struck < 0) struck = s.tick;
  });
  assert.ok(warned > 0 && struck > warned, 'thunder warns, then strikes');
  assert.ok(Math.abs((struck - warned) * TICK - WEATHER.thunder.warn) < 0.1, 'a second and a half later');
  assert.equal(hull - thunder.ships[G].hull - thunder.ships[G].shield, WEATHER.thunder.damage, 'for 25');

  // snow and ash fade away from their homes: ship 0 waits in the Ice Crown, ship 12 in the Fire Archipelago
  const snow = quietMatch();
  over(snow, WEATHER_KIND.snow, 0);
  run(snow, WEATHER.snow.build + 1);
  const iced = snow.ships[0];
  t.diagnostic(`ice ${iced.ice.toFixed(2)} after ${WEATHER.snow.build + 1} s`);
  assert.ok(iced.ice > 0.99, 'snow ices the rigging over 20 s');
  assert.ok(Math.abs(turnRate(iced) - turnRate({ ...iced, ice: 0 }) * (1 - WEATHER.snow.turn)) < 1e-9, 'and halves her turning');

  const ash = quietMatch(), FIRE = REGIONS.findIndex((r) => r.id === 'fireArchipelago');
  over(ash, WEATHER_KIND.ash, FIRE);
  run(ash, WEATHER.ash.after - 0.2);
  assert.equal(ash.ships[FIRE].hull, 100, 'no harm for the first four seconds');
  run(ash, 4.2);
  const lost = 100 - ash.ships[FIRE].hull;
  t.diagnostic(`ash burnt ${lost.toFixed(2)} in 4 s past the first four`);
  assert.ok(Math.abs(lost - 4 * WEATHER.ash.rate) < 0.6, 'then 1.5 a second');
});

test('at night a ship beyond 150 m shows only as a lantern', () => {
  const lon = Math.atan2(-COURSE.pos.z, COURSE.pos.x);
  const midnight = (((12 - ((lon + Math.PI) * 24) / (2 * Math.PI)) % 24) + 24) % 24;
  for (const [hour, dark] of [[midnight, true], [(midnight + 12) % 24, false]] as const) {
    const state = sailing({ hour, tilt: 0 });
    assert.equal(isNight(state, COURSE.pos), dark);
    for (const [d, far] of [[100, false], [158, true]] as const) {
      place(state, 0, { pos: along(COURSE.pos, COURSE.head, d, v3()), head: COURSE.head });
      const v = seen(state, G, 0);
      assert.ok((v & SEEN.visible) !== 0, `in sight at ${d} m`);
      assert.equal((v & SEEN.lantern) !== 0, dark && far, `${dark ? 'night' : 'day'}, ${d} m: ${v}`);
    }
  }
});

/** A clear run of `run` metres at obstacle o, ending `stop` metres from its centre, or null. */
function runAt(state: MatchState, o: Obstacle, stop: number, run = 40): Course | null {
  const T = v3(), P = v3(), Q = v3();
  for (let b = 0; b < 2 * Math.PI; b += Math.PI / 36) {
    tangentAt(o.pos, b, T);
    along(o.pos, T, stop + run, P);
    let ok = true;
    for (let d = stop; d <= stop + run + SHIP.half && ok; d += 1) {
      along(o.pos, T, d, Q);
      ok = deep(Q, 0.5) && !solidAt(state, Q);
    }
    if (!ok) continue;
    // heading back along T, at the obstacle
    tangentToward(P, o.pos, Q);
    return { pos: v3(P.x, P.y, P.z), head: v3(Q.x, Q.y, Q.z) };
  }
  return null;
}

test('columns standing in the water are solid: she stops at kelp, coral, glass, the cedar\'s stump and the Root Gate\'s roots', (t) => {
  const tried = new Set<string>();
  for (const o of OBSTACLES) {
    const id = REGIONS[o.region].id;
    if (o.kind !== 'trunk' || tried.has(id)) continue;
    const state = quietMatch(), course = runAt(state, o, o.r + 2);
    if (!course) continue;
    tried.add(id);
    const i = o.region;
    place(state, i, course, SHIP.top);
    let inside = 0, closest = 1e9;
    run(state, 8, only(i, sailOn()), (s) => {
      const ship = s.ships[i];
      if (obstacleAt(ship.pos) >= 0) inside++;
      closest = Math.min(closest, apart(ship.pos, o.pos));
    });
    t.diagnostic(`${id}: a column ${o.r.toFixed(1)} m round; her middle came within ${closest.toFixed(1)} m of its heart`);
    assert.equal(inside, 0, `${id}: she never sailed into it`);
    assert.ok(closest < o.r + SHIP.half + 4, `${id}: she sailed right up to it`);
  }
  for (const id of ['kelpShallows', 'coralAtolls', 'glassSea', 'mistwood', 'mangroveLabyrinth']) assert.ok(tried.has(id), `${id} was tried`);
});

test('the Hollow Cedar\'s log is solid in its walls', (t) => {
  const log = OBSTACLES.find((o) => o.kind === 'log');
  assert.ok(log);
  const state = quietMatch(), i = log.region, side = cross(v3(), log.pos, log.facing), P = v3(), H = v3();
  // abeam of the log somewhere along it, heading straight at its side over clear water
  const A = v3(), Q = v3();
  let found: Course | null = null;
  for (let a = -40; a <= 40 && !found; a += 5) {
    along(log.pos, log.facing, a, A);
    for (const k of [1, -1]) {
      set(H, side.x * k, side.y * k, side.z * k);
      let ok = true;
      for (let d = log.r + 1; d <= log.r + 40 && ok; d += 1) ok = deep(along(A, H, d, Q), 0.5);
      if (!ok) continue;
      along(A, H, log.r + 36, P);
      tangentToward(P, A, H);
      found = { pos: v3(P.x, P.y, P.z), head: v3(H.x, H.y, H.z) };
      break;
    }
  }
  assert.ok(found, 'clear water abeam of the log');
  place(state, i, found, SHIP.top);
  let inside = 0, closest = 1e9;
  run(state, 8, only(i, sailOn()), (s) => {
    if (obstacleAt(s.ships[i].pos) >= 0) inside++;
    closest = Math.min(closest, apart(s.ships[i].pos, A));
  });
  t.diagnostic(`her middle came within ${closest.toFixed(1)} m of the log's axis`);
  assert.equal(inside, 0, 'she never sailed into its wall');
  assert.ok(closest < log.r + SHIP.half + 4, 'she sailed right up to it');
});

test('a floe riding into a ship that lies still shoulders her out of its way', (t) => {
  const state = quietMatch(), i = 0, f = FLOES[0], P = v3(), Q = v3(), H = v3(), C = v3();
  // where the floe will be in 12 s, heading on round its ring
  floePos(f, floeTime(state) + 12, P);
  floePos(f, floeTime(state) + 13, Q);
  tangentToward(P, Q, H);
  place(state, i, { pos: P, head: H });
  let deepest = 0;
  run(state, 40, () => null, (s) => {
    floePos(f, floeTime(s), C);
    deepest = Math.max(deepest, f.size - apart(s.ships[i].pos, C));
  });
  t.diagnostic(`the floe ran at most ${deepest.toFixed(2)} m into her; she was carried ${apart(state.ships[i].pos, P).toFixed(1)} m`);
  assert.ok(deepest < 1, 'it never ran into her');
  assert.ok(apart(state.ships[i].pos, P) > 5, 'it pushed her along');
});
