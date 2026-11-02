// The regions' events: the programme each match draws up, and what each event does to the sea, to ships, to the
// captains' chart and to the captains themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODE } from '../../src/sim/captains/brain.ts';
import {
  EVENT_REGION, aground, bloomAt, currentAt, eventSolidAt, eventStrength, floeTime, levelAt, liftAt, seaLevel, shoal, solidAt,
} from '../../src/sim/environment.ts';
import { PI, dot, v3, type V3 } from '../../src/sim/math.ts';
import { EVENT_CODES, NAV_EVENTS, openAt } from '../../src/sim/nav.ts';
import { createMatch } from '../../src/sim/setup.ts';
import { calmAt, newCalm } from '../../src/sim/storm.ts';
import { along, apart, tangentAt } from '../../src/sim/sphere.ts';
import { CAUSE, EVENT, EVENT_STATE, SHIPS, TICK, matchHash, type MatchState } from '../../src/sim/state.ts';
import { REGION_EVENT, WHALE } from '../../src/sim/tables.ts';
import { inFog, newSky, skyAt } from '../../src/sim/weather.ts';
import {
  CENTRES, CURRENTS, DRAFT, REGION_EVENTS, TIDE_AMPLITUDE, VORTEX, blockAt, currentAt as worldCurrent, heightAt, liftOf, regionAt,
} from '../../src/sim/world/index.ts';
import { place, quietMatch, run, sailOn, type Course } from './fixture.ts';

/** Brings region ri's event on at spot k: its warning sounds on the next tick or two. */
function bring(state: MatchState, ri: number, k = 0): void {
  const ev = state.regionEvents[ri];
  ev.k = k;
  const s = REGION_EVENTS[ri].spots[k];
  ev.spot.x = s.x;
  ev.spot.y = s.y;
  ev.spot.z = s.z;
  ev.state = EVENT_STATE.waiting;
  ev.at = state.tick * TICK + ev.warn + 2 * TICK;
}

/** Runs until region ri's event is `t` seconds into its run (or over, for t past its end), watching the events raised on the way. */
function runTo(state: MatchState, ri: number, t: number, each?: (state: MatchState) => void): void {
  const ev = state.regionEvents[ri];
  run(state, ev.at - state.tick * TICK + t + 2 * TICK, () => null, (s) => {
    each?.(s);
    return ev.state === EVENT_STATE.over ? t >= ev.run : ev.state === EVENT_STATE.running && ev.t >= t;
  });
}

/** Water at least `depth` below low tide about `d` metres from c (a little farther if it must), and the bearing out to it. */
function waterNear(c: V3, d: number, depth = DRAFT + 2): Course {
  const T = v3(), P = v3();
  for (let out = d; out < d + 80; out += 5) {
    for (let k = 0; k < 72; k++) {
      tangentAt(c, (k * PI) / 36, T);
      along(c, T, out, P);
      if (heightAt(P) < -TIDE_AMPLITUDE - depth) return { pos: { ...P }, head: { ...T } };
    }
  }
  throw new Error(`no water ${d} m out`);
}

/** Runs on until region ri's event is a tick or two from starting. */
function nearlyStarted(state: MatchState, ri: number): void {
  run(state, state.regionEvents[ri].at - state.tick * TICK - 1.5 * TICK);
  assert.equal(state.regionEvents[ri].state, EVENT_STATE.warning);
}

/** The Storm's calm over p for the whole match, so a captain there has nothing of the Storm's to get away from. */
function calmOver(state: MatchState, p: V3): void {
  for (const c of state.storm.centres) Object.assign(c, { x: p.x, y: p.y, z: p.z });
}

const hits = (state: MatchState, i: number, cause: number) =>
  state.events.filter((e) => e.kind === EVENT.hit && e.ship === i && e.item === cause).length;

// ---------------------------------------------------------------- the programme

test('each match every region has its event, far from where the Storm closes first, each warned 5 to 10 s ahead', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const state = createMatch({ seed, fleet: Array.from({ length: SHIPS }, () => ({ captain: true })) });
    const evs = state.regionEvents.map((ev, ri) => ({ ri, ev })).sort((a, b) => a.ev.at - b.ev.at);
    assert.equal(evs.length, 16);
    const { first, every, late } = REGION_EVENT;
    for (let i = 0; i < evs.length; i++) {
      const { ri, ev } = evs[i];
      assert.equal(ev.state, EVENT_STATE.waiting);
      assert.ok(ev.at >= first + i * every && ev.at <= first + i * every + late, `seed ${seed}: the ${i}th at ${ev.at}`);
      if (ri === EVENT_REGION.glass) assert.equal(ev.warn, WHALE.rising);
      else assert.ok(ev.warn >= 5 && ev.warn <= 10, `${ri} warned ${ev.warn} s ahead`);
      assert.equal(ev.run, REGION_EVENT.run[ri]);
      assert.ok(ev.k >= 0 && ev.k < REGION_EVENTS[ri].spots.length);
      assert.ok(apart(ev.spot, REGION_EVENTS[ri].spots[ev.k]) < 1e-6);
    }
    // the first half of the programme lies on the far side of the planet from where the Storm will close
    const far = state.storm.centres[3], side = (a: typeof evs) => a.reduce((n, { ri }) => n + dot(CENTRES[ri], far), 0) / a.length;
    assert.ok(side(evs.slice(0, 8)) < side(evs.slice(8)) - 0.3, `seed ${seed}: the first half ${side(evs.slice(0, 8))}, the second ${side(evs.slice(8))}`);
    // and it is all over a good while before the match is
    assert.ok(evs[15].ev.at + evs[15].ev.run < 600);
  }
});

test('no danger comes where the Storm\'s calm has closed round it by then, wherever the finale is', () => {
  const calm = newCalm(), dangers = [EVENT_REGION.spires, EVENT_REGION.narrows, EVENT_REGION.glass, EVENT_REGION.fire, EVENT_REGION.kelp, EVENT_REGION.maelstrom];
  for (let seed = 1; seed <= 32; seed++) {
    const state = createMatch({ seed, fleet: [{ captain: true }] });
    for (const ri of dangers) {
      const ev = state.regionEvents[ri], r = ri === EVENT_REGION.kelp ? REGION_EVENT.bloom.r : REGION_EVENTS[ri].r;
      calmAt(state, ev.at + ev.run - state.storm.start * TICK, calm);
      const room = apart(calm.at, ev.spot) + calm.r - r - REGION_EVENT.berth;
      assert.ok(room >= REGION_EVENT.room, `seed ${seed}, region ${ri}: ${room.toFixed(0)} m of the calm clear of it`);
    }
  }
});

test('every event is warned, starts and ends once, on time, and the Glass Sea\'s is the whale breaching on its spot', () => {
  const state = quietMatch({ events: true }), now = state.tick * TICK;
  // the programme brought forward, a few seconds apart
  const order = state.regionEvents.map((ev, ri) => ({ ri, at: ev.at })).sort((a, b) => a.at - b.at);
  order.forEach(({ ri }, i) => (state.regionEvents[ri].at = now + 12 + 4 * i));
  const seen = Array.from({ length: 16 }, () => ({ warn: [] as number[], start: [] as number[], end: [] as number[] }));
  let rose = -1;
  run(state, 220, () => null, (s) => {
    const t = s.tick * TICK;
    for (const e of s.events) {
      if (e.kind === EVENT.regionWarn) seen[e.item].warn.push(t);
      if (e.kind === EVENT.regionStart) seen[e.item].start.push(t);
      if (e.kind === EVENT.regionEnd) seen[e.item].end.push(t);
      if (e.kind === EVENT.whaleRising) rose = t;
    }
    return s.regionEvents.every((ev) => ev.state === EVENT_STATE.over);
  });
  for (let ri = 0; ri < 16; ri++) {
    const ev = state.regionEvents[ri], s = seen[ri];
    assert.equal(ev.state, EVENT_STATE.over, `${ri} is over`);
    assert.deepEqual([s.warn.length, s.start.length, s.end.length], [1, 1, 1], `${ri} warned, started and ended once`);
    assert.ok(Math.abs(s.start[0] - s.warn[0] - ev.warn) < 2 * TICK, `${ri} warned ${s.start[0] - s.warn[0]} s ahead`);
    assert.ok(Math.abs(s.start[0] - ev.at) < 2 * TICK);
    assert.ok(Math.abs(s.end[0] - s.start[0] - ev.run) < 2 * TICK, `${ri} ran ${s.end[0] - s.start[0]} s`);
  }
  const glass = state.regionEvents[EVENT_REGION.glass];
  assert.ok(Math.abs(rose - seen[EVENT_REGION.glass].warn[0]) < TICK, 'the whale rises as the Glass Sea is warned');
  assert.ok(apart(state.whale.spot, glass.spot) < 1e-6, 'under the event\'s spot');
});

test('two runs of a seed with the events on come out the same', () => {
  const go = (): string => {
    const state = quietMatch({ events: true, seed: 11 });
    state.regionEvents.forEach((ev, ri) => (ev.at = 8 + 3 * ri));
    run(state, 90, (i, tick) => (i % 3 === 0 ? sailOn({ steer: Math.sin(tick / 40 + i) }) : null));
    return matchHash(state);
  };
  assert.equal(go(), go());
});

// ---------------------------------------------------------------- the sea's level

test('the Jade Shoals ebb dry and the Mangroves flood, each only in its own water', () => {
  const state = quietMatch();
  const jade = EVENT_REGION.jade, mangrove = EVENT_REGION.mangrove;
  bring(state, jade);
  bring(state, mangrove);
  const J = REGION_EVENTS[jade].spots[0], M = REGION_EVENTS[mangrove].spots[0];
  assert.equal(liftAt(state, J), 0, 'nothing before it starts');
  runTo(state, jade, 30);
  assert.equal(eventStrength(state, jade), 1);
  // each beyond the tide's own range, so it opens or closes passages even at the opposite tide
  const ebb = liftOf(jade, 0, J), flood = liftOf(mangrove, 0, M);
  assert.ok(ebb < -2 * TIDE_AMPLITUDE && flood > 2 * TIDE_AMPLITUDE, `${ebb} m and ${flood} m`);
  assert.ok(Math.abs(levelAt(state, J) - (seaLevel(state) + ebb)) < 1e-9, 'the sea down over the dunes');
  assert.ok(Math.abs(levelAt(state, M) - (seaLevel(state) + flood)) < 1e-9, 'and up in the Labyrinth');
  // water a keel crossed before now runs dry, and banks it ran aground on now float her
  const P = v3(), T = v3();
  let dried = 0, floated = 0, outside = 0;
  for (let k = 0; k < 2000; k++) {
    for (const [c, ri] of [[J, jade], [M, mangrove]] as const) {
      tangentAt(c, k * 2.399, T);
      along(c, T, 2 + (k % 300), P);
      const sea = seaLevel(state);
      if (regionAt(P) !== ri) {
        if (liftAt(state, P) !== 0 && liftOf(ri, 0, P) === 0) outside++;
        continue;
      }
      if (ri === jade && aground(state, P) && !shoal(P, sea)) dried++;
      if (ri === mangrove && !aground(state, P) && shoal(P, sea)) floated++;
    }
  }
  assert.ok(dried > 50, `${dried} spots of the shoals run dry`);
  assert.ok(floated > 5, `${floated} spots of the Labyrinth float`);
  assert.equal(outside, 0);
  // the neighbours' water stays as it was
  for (let ri = 0; ri < 16; ri++) if (ri !== jade && ri !== mangrove) assert.equal(liftAt(state, CENTRES[ri]), 0, `region ${ri}`);
  runTo(state, mangrove, 1e9);
  runTo(state, jade, 1e9);
  assert.equal(liftAt(state, J), 0, 'and the sea is back once they end');
  assert.equal(liftAt(state, M), 0);
});

test('the Great Atoll\'s tide runs to one side or the other, by the spot', () => {
  const lifts = REGION_EVENTS[EVENT_REGION.coral].lift;
  assert.ok(lifts.length >= 2);
  for (const l of lifts) {
    assert.ok(Math.abs(liftOf(EVENT_REGION.coral, 0, l.pos)) > 1);
    assert.equal(liftOf(EVENT_REGION.coral, 1, l.pos), -liftOf(EVENT_REGION.coral, 0, l.pos));
  }
  assert.ok(lifts.some((l) => liftOf(EVENT_REGION.coral, 0, l.pos) > 0) && lifts.some((l) => liftOf(EVENT_REGION.coral, 0, l.pos) < 0));
});

test('the Basalt Stacks\' sea caves open while the sea is drawn down, then shut again, and the hoard spills out', () => {
  const state = quietMatch(), ri = EVENT_REGION.basalt, roofs = REGION_EVENTS[ri].roofs;
  assert.equal(roofs.length, 2);
  const shut = () => roofs.map((o, i) => [eventSolidAt(state, o.pos) === ri, NAV_EVENTS.shut[EVENT_CODES.roof[ri][i]] === 1]);
  assert.deepEqual(shut(), [[true, true], [true, true]], 'shut at any tide');
  bring(state, ri);
  const loot = state.loot.length;
  runTo(state, ri, 0);
  assert.equal(state.loot.length - loot, REGION_EVENT.hoard.n, 'the hoard spills');
  for (const l of state.loot.slice(loot)) assert.ok(apart(l.at, state.regionEvents[ri].spot) < 30);
  runTo(state, ri, 20);
  assert.deepEqual(shut(), [[false, false], [false, false]], 'open while it runs');
  for (const o of roofs) assert.ok(!solidAt(state, o.pos));
  // the chart shuts them a while before the sea comes back, so no captain is caught under one
  runTo(state, ri, state.regionEvents[ri].run - 10);
  assert.deepEqual(shut().map((s) => s[1]), [true, true], 'charted shut ahead of time');
  runTo(state, ri, 1e9);
  assert.deepEqual(shut(), [[true, true], [true, true]], 'and shut once it is over');
});

// ---------------------------------------------------------------- rock

test('a spire falls across the Spires\' lane for good: the ships under it are hurt and shouldered out, and the chart shuts it from the warning', () => {
  const state = quietMatch(), ri = EVENT_REGION.spires, k = 1, e = REGION_EVENTS[ri], at = e.spots[k];
  bring(state, ri, k);
  // ship 0 on the line it falls along, ship 1 a few metres clear of it
  const codes = EVENT_CODES.block[ri][k];
  assert.equal(NAV_EVENTS.shut[codes], 0, 'open water on the chart before the warning');
  run(state, 3 * TICK);
  assert.equal(state.regionEvents[ri].state, EVENT_STATE.warning);
  assert.equal(NAV_EVENTS.shut[codes], 1, 'shut on the chart from the warning');
  assert.ok(!openAt(at), 'and the nav grid will not route over it');
  assert.ok(!solidAt(state, at), 'though nothing stands there yet');
  // (put there as it falls: the lane would carry a ship sitting there through the warning off the line)
  nearlyStarted(state, ri);
  const P = v3(), side = v3();
  place(state, 0, { pos: { ...at }, head: { ...e.facings[k] } });
  // square off the fall line
  side.x = e.facings[k].y * at.z - e.facings[k].z * at.y;
  side.y = e.facings[k].z * at.x - e.facings[k].x * at.z;
  side.z = e.facings[k].x * at.y - e.facings[k].y * at.x;
  along(at, side, e.block!.width / 2 + 12, P);
  place(state, 1, { pos: { ...P }, head: { ...e.facings[k] } });
  let rock = [0, 0];
  runTo(state, ri, 0.5, (s) => (rock = [rock[0] + hits(s, 0, CAUSE.rock), rock[1] + hits(s, 1, CAUSE.rock)]));
  assert.deepEqual(rock, [1, 0], 'the ship under it is hit, the one beside it is not');
  assert.ok(solidAt(state, at));
  run(state, 3);
  assert.ok(!blockAt(ri, k, state.ships[0].pos), 'and she is shouldered out from under it');
  runTo(state, ri, 1e9);
  assert.ok(solidAt(state, at), 'it stays down for the rest of the match');
  assert.equal(NAV_EVENTS.shut[codes], 1);
});

test('rock fills one end of the Narrows while the event runs, then clears', () => {
  const state = quietMatch(), ri = EVENT_REGION.narrows, k = 0, at = REGION_EVENTS[ri].spots[k];
  bring(state, ri, k);
  nearlyStarted(state, ri);
  place(state, 0, waterNear(at, 4, 0));
  let rock = 0;
  runTo(state, ri, 1, (s) => (rock += hits(s, 0, CAUSE.rock)));
  assert.equal(rock, 1);
  assert.ok(solidAt(state, at));
  assert.ok(!solidAt(state, REGION_EVENTS[ri].spots[1]), 'the other end stays open');
  runTo(state, ri, 1e9);
  assert.ok(!solidAt(state, at), 'gone once it is over');
  assert.equal(NAV_EVENTS.shut[EVENT_CODES.block[ri][k]], 0);
});

// ---------------------------------------------------------------- currents and floes

test('the Fjords and the Blossom Run come down in spate, and the Maelstrom winds up', () => {
  const state = quietMatch(), F = v3(), W = v3();
  const speedAt = (_: V3, out: V3) => Math.hypot(out.x, out.y, out.z);
  for (const ri of [EVENT_REGION.fjords, EVENT_REGION.blossom, EVENT_REGION.maelstrom]) bring(state, ri);
  const lanes = CURRENTS.filter((l) => l.region === EVENT_REGION.fjords || l.region === EVENT_REGION.blossom);
  assert.ok(lanes.length >= 2);
  const mids = lanes.map((l) => l.pts[Math.floor(l.pts.length / 2)]);
  const before = mids.map((p) => speedAt(p, currentAt(state, p, F)));
  const V = waterNear(VORTEX.pos, (VORTEX.eye + VORTEX.r) / 2, 0).pos, vortex = speedAt(V, currentAt(state, V, F));
  runTo(state, EVENT_REGION.blossom, 20);
  mids.forEach((p, i) => {
    const now = speedAt(p, currentAt(state, p, F)), plain = speedAt(p, worldCurrent(p, W));
    assert.ok(Math.abs(plain - before[i]) < 1e-9);
    assert.ok(now > 1.8 * before[i] && now < REGION_EVENT.surge * before[i] + 0.3, `${lanes[i].name}: ${before[i]} to ${now} m/s`);
  });
  const wound = speedAt(V, currentAt(state, V, F));
  assert.ok(wound > 1.8 * vortex && wound < REGION_EVENT.vortex * vortex + 0.3, `the vortex ${vortex} to ${wound} m/s`);
});

test('the Ice Crown\'s floes race round their rings while it runs', () => {
  const state = quietMatch(), ri = EVENT_REGION.ice;
  bring(state, ri);
  runTo(state, ri, 1e9);
  const { run: runs, ramp, ice } = REGION_EVENT;
  // full speed for the run, less the build-up and the dying down
  assert.ok(Math.abs(state.floeT - (ice.speed - 1) * (runs[ri] - ramp[ri])) < 0.5, `${state.floeT} s ahead`);
  assert.ok(Math.abs(floeTime(state) - (state.tick * TICK + state.floeT)) < 1e-9);
});

// ---------------------------------------------------------------- weather

test('Mistwood\'s fog bank, the Weeping Isle\'s cloudburst and Cinder Peak\'s ash come and go', () => {
  const state = quietMatch(), sky = newSky();
  const mist = EVENT_REGION.mist, weeping = EVENT_REGION.weeping, fire = EVENT_REGION.fire;
  for (const ri of [mist, weeping, fire]) bring(state, ri);
  const M = state.regionEvents[mist].spot, W = state.regionEvents[weeping].spot;
  assert.ok(!inFog(state, M) && !inFog(state, W));
  runTo(state, fire, 20);
  assert.ok(inFog(state, M), 'Mistwood fogged in');
  skyAt(state, W, sky);
  assert.ok(inFog(state, W) && sky.rain > 0.9, 'the cloudburst over the Isle');
  skyAt(state, state.regionEvents[fire].spot, sky);
  assert.ok(sky.ash > 0.9, 'the ash over the peak\'s cloud');
  const P = v3(), T = v3();
  tangentAt(M, 0, T);
  along(M, T, REGION_EVENT.mist.r + 20, P);
  assert.ok(!inFog(state, P), 'clear water past the bank');
  runTo(state, mist, 1e9);
  runTo(state, weeping, 1e9);
  assert.ok(!inFog(state, M) && !inFog(state, W));
});

// ---------------------------------------------------------------- the kelp

test('the kelp bloom slows a ship in it to half speed', () => {
  const ri = EVENT_REGION.kelp, at = REGION_EVENTS[ri].spots[0], course = waterNear(at, 20, 0);
  const sail = (on: boolean): number => {
    const state = quietMatch();
    if (on) {
      bring(state, ri);
      runTo(state, ri, 15);
    }
    place(state, 6, course, 4);
    const start = { ...state.ships[6].pos };
    run(state, 6, (i) => (i === 6 ? sailOn() : null));
    return apart(start, state.ships[6].pos);
  };
  const state = quietMatch();
  bring(state, ri);
  runTo(state, ri, 15);
  assert.equal(bloomAt(state, at), REGION_EVENT.bloom.slow);
  const P = v3(), T = v3();
  tangentAt(at, 1, T);
  along(at, T, REGION_EVENT.bloom.r + 15, P);
  assert.equal(bloomAt(state, P), 1);
  const open = sail(false), bloom = sail(true);
  assert.ok(bloom < 0.75 * open, `${bloom.toFixed(1)} m in the bloom against ${open.toFixed(1)} m in open water`);
});

// ---------------------------------------------------------------- prizes

test('a clam bed opens in the Spice Isles with rare pearls', () => {
  const state = quietMatch(), ri = EVENT_REGION.spice;
  bring(state, ri, 1);
  const n = state.loot.length;
  runTo(state, ri, 0);
  const spilt = state.loot.slice(n);
  assert.equal(spilt.length, REGION_EVENT.pearls.n);
  for (const l of spilt) assert.ok(apart(l.at, REGION_EVENTS[ri].spots[1]) < 30);
});

// ---------------------------------------------------------------- Cinder Peak

test('Cinder Peak throws bombs round itself and at ships near it, which hurt and set burning, and none fall far off', () => {
  const state = quietMatch(), ri = EVENT_REGION.fire, peak = REGION_EVENTS[ri].spots[0];
  bring(state, ri);
  place(state, 0, waterNear(peak, 70));
  place(state, 1, waterNear(peak, 260));
  const bombs: V3[] = [];
  let burnt = 0, far = 0, ablaze = false;
  runTo(state, ri, 1e9, (s) => {
    for (const e of s.events) {
      if (e.kind === EVENT.lavaBomb && e.flag !== 0) bombs.push({ ...e.at });
      if (e.kind === EVENT.ablaze && e.ship === 0) ablaze = true;
    }
    if (s.events.some((e) => e.kind === EVENT.lavaBomb && e.flag !== 0)) {
      burnt += hits(s, 0, CAUSE.burn);
      far += hits(s, 1, CAUSE.burn);
    }
  });
  const E = REGION_EVENT.eruption;
  assert.ok(bombs.length > 40, `${bombs.length} bombs`);
  for (const b of bombs) assert.ok(apart(b, peak) < E.far + 10, 'all round the peak');
  assert.ok(burnt >= 3 && ablaze, `the ship near the peak was hit ${burnt} times and set burning`);
  assert.equal(far, 0, 'the one well off it never');
  run(state, E.flight + 1);
  assert.equal(state.regionEvents[ri].marks.length, 0, 'every bomb is down once it is over');
});

// ---------------------------------------------------------------- the captains

/** Ship i as a captain, minding her own business. */
function captain(state: MatchState, i: number): void {
  Object.assign(state.ships[i].captain, { on: true, temperament: 0.5, skill: 0.9, aggro: 0.3, gentle: false, think: 1 });
}

test('captains clear out from under a spire once its fall is announced', () => {
  const state = quietMatch({ seed: 3 }), ri = EVENT_REGION.spires, k = 0, e = REGION_EVENTS[ri];
  captain(state, 0);
  place(state, 0, { pos: { ...e.spots[k] }, head: { ...e.facings[k] } });
  calmOver(state, e.spots[k]);
  bring(state, ri, k);
  let rock = 0, modes = 0;
  runTo(state, ri, 0.2, (s) => {
    rock += hits(s, 0, CAUSE.rock);
    if (s.ships[0].captain.mode === MODE.event) modes++;
  });
  assert.equal(rock, 0, 'the captain was clear when it fell');
  assert.ok(modes > 0, 'running from it');
  assert.ok(!blockAt(ri, k, state.ships[0].pos, 3));
});

test('captains get away from Cinder Peak once it is about to erupt', () => {
  const state = quietMatch({ seed: 3 }), ri = EVENT_REGION.fire, peak = REGION_EVENTS[ri].spots[0];
  captain(state, 1);
  place(state, 1, waterNear(peak, 50));
  calmOver(state, peak);
  bring(state, ri);
  runTo(state, ri, 10);
  const off = apart(state.ships[1].pos, peak);
  assert.ok(off > REGION_EVENTS[ri].r, `${off.toFixed(0)} m off the peak`);
});

test('captains go for the pearls', () => {
  const state = quietMatch({ seed: 3 }), spice = EVENT_REGION.spice, at = REGION_EVENTS[spice].spots[0];
  captain(state, 0);
  place(state, 0, waterNear(at, 120, 0));
  calmOver(state, at);
  bring(state, spice);
  runTo(state, spice, 0.5);
  const start = apart(state.ships[0].pos, at);
  run(state, 12);
  assert.ok(apart(state.ships[0].pos, at) < start - 40, `from ${start.toFixed(0)} m to ${apart(state.ships[0].pos, at).toFixed(0)} m off the clam bed`);
});
