import { cpuNow } from '../cpu.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { over } from '../../src/sim/end.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { FLAG, idleInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { dacos, dot, hash32, rngFrom, rngInt, set, v3, type V3 } from '../../src/sim/math.ts';
import { newTrim, trim } from '../../src/sim/sailing.ts';
import { TERRITORY, cellArea, cellDir, cellOf } from '../../src/sim/sphere.ts';
import {
  CAUSE, EVENT, PHASE, SHIPS, STREAM, TICK, createMatch, decodeMatch, encodeMatch, matchHash, stormPlan, type MatchState,
} from '../../src/sim/state.ts';
import { calmAt, calmNow, newCalm, newStormView, storm, stormView } from '../../src/sim/storm.ts';
import { FITTING, SLOT, STORM } from '../../src/sim/tables.ts';
import { inkHome } from '../../src/sim/territory.ts';
import { newSight, survey } from '../../src/sim/visibility.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { unarmed, world } from './vectors.ts';

const SEED = 20261024, W = world(), sea = seaFor(W, SEED);
const S = (seconds: number): number => Math.round(seconds / TICK);
const PH = STORM.phases, LAST = PH.length - 1;
const angle = (a: V3, b: V3): number => dacos(Math.max(-1, Math.min(1, dot(a, b))));
const CLOSED = S(PH[LAST].move + PH[LAST].sweep);
const quantile = (xs: number[], q: number): number => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];

function put(s: MatchState, i: number, p: V3): void {
  const ship = s.ships[i];
  ship.phase = PHASE.sailing;
  set(ship.pos, p.x, p.y, p.z);
}

test('every calm of the plan lies inside the one before, and the final calm falls uniformly over the regions', (t) => {
  assert.deepEqual(createMatch({ seed: SEED }).storm, stormPlan(rngFrom(hash32(SEED, STREAM.storm))));
  const area = new Float64Array(REGIONS.length), hits = new Float64Array(REGIONS.length), N = 10000;
  for (let c = 0; c < TERRITORY.cells; c++) area[W.geo.region[c]] += cellArea(TERRITORY, c);
  const total = area.reduce((a, b) => a + b, 0);
  for (let seed = 0; seed < N; seed++) {
    const plan = stormPlan(rngFrom(hash32(seed, STREAM.storm)));
    let at = v3(-plan.origin.x, -plan.origin.y, -plan.origin.z), r = Math.PI;
    for (const calm of plan.calms) {
      assert.ok(angle(at, calm.at) + calm.r <= r + 1e-9, `seed ${seed}: a calm reaches outside the one before`);
      at = calm.at;
      r = calm.r;
    }
    const final = plan.calms[LAST - 1];
    assert.ok(angle(final.at, plan.origin) >= final.r, `seed ${seed}: the final calm holds the origin`);
    hits[W.geo.region[cellOf(TERRITORY, final.at)]]++;
  }
  let chi = 0;
  const shares: string[] = [];
  for (let k = 0; k < REGIONS.length; k++) {
    const e = (N * area[k]) / total;
    chi += ((hits[k] - e) * (hits[k] - e)) / e;
    shares.push(`${REGIONS[k].name} ${hits[k]}/${e.toFixed(0)}`);
    assert.ok(hits[k] > 0, `the final calm never fell in ${REGIONS[k].name}`);
  }
  const df = REGIONS.length - 1, h = 2 / (9 * df), critical = df * (1 - h + 3.09 * Math.sqrt(h)) ** 3;
  t.diagnostic(`final calm over ${N} seeds, region hits/expected: ${shares.join(', ')}`);
  t.diagnostic(`χ² = ${chi.toFixed(2)} on ${df} df; threshold ${critical.toFixed(2)} (p = 0.001)`);
  assert.ok(chi < critical);
});

test('the calm only ever shrinks, and each phase is announced before it moves', () => {
  const view = newStormView(), a = newCalm(), b = newCalm();
  for (let seed = 1; seed <= 20; seed++) {
    const s = createMatch({ seed });
    for (let x = 0; x < CLOSED * TICK + 5; x += 0.5) {
      calmAt(s, x, a);
      calmAt(s, x + 0.5, b);
      assert.ok(angle(a.at, b.at) + b.r <= a.r + 1e-6, `seed ${seed}: the calm grew at ${x} s`);
    }
    for (let k = 0; k < PH.length; k++) {
      s.tick = S(PH[k].move) - S(1);
      stormView(s, view);
      assert.ok(view.announced && view.phase === k && Math.abs(view.toMove - 1) < 1e-9, `phase ${k + 1} is on the chart`);
      assert.equal(view.next.r, s.storm.calms[k].r);
      s.tick = S(PH[k].move + PH[k].sweep / 2);
      stormView(s, view);
      assert.ok(view.announced && view.toMove === 0 && view.phase === k + 1 && view.rate === PH[k].rate);
    }
    s.tick = S(STORM.announce) - 1;
    assert.equal(stormView(s, view).announced, false);
    s.tick = CLOSED;
    assert.ok(!stormView(s, view).announced && view.calm.r === 0);
  }
});

test('inside the storm a ship loses hull at a rate that rises each phase, and its sails labour', () => {
  const s = createMatch({ seed: SEED }), trimmed = newTrim();
  let last = 0;
  for (let k = 0; k < PH.length; k++) {
    s.tick = S(PH[k].move + PH[k].sweep);
    const c = calmNow(s).at, ship = s.ships[0];
    put(s, 0, v3(-c.x, -c.y, -c.z));
    ship.hull = 1000;
    storm(s);
    const lost = 1000 - ship.hull;
    assert.ok(Math.abs(lost - PH[k].rate * TICK) < 1e-12 && lost > last, `phase ${k + 1}: ${lost}`);
    last = lost;
  }
  s.tick = S(PH[0].move + PH[0].sweep);
  const c = calmNow(s).at, p = v3(-c.x, -c.y, -c.z), ratio = (): number => {
    s.tick = 0;
    const calm = trim(sea, s, 0, trimmed).speed;
    s.tick = S(PH[0].move + PH[0].sweep);
    return trim(sea, s, 0, trimmed).speed / calm;
  };
  put(s, 0, p);
  assert.ok(Math.abs(ratio() - (1 - STORM.labour)) < 1e-12);
  s.ships[0].fittings[SLOT.rig] = { kind: FITTING.stormSails, tier: 0 };
  assert.equal(ratio(), 1);
});

test('the storm swallows the sea it covers, and only that', () => {
  const s = createMatch({ seed: SEED });
  s.tick = S(PH[2].move + PH[2].sweep);
  const calm = calmNow(s), c = calm.at;
  put(s, 0, c);
  put(s, 1, v3(-c.x, -c.y, -c.z));
  inkHome(s, 0);
  inkHome(s, 1);
  const mine = s.ships[0].held;
  assert.ok(mine > 0 && s.ships[1].held > 0);
  s.events.length = 0;
  for (let k = 0; k < STORM.scan; k++, s.tick++) storm(s);
  assert.equal(s.ships[1].held, 0, 'the sea in the storm has lost its owner');
  assert.equal(s.ships[0].held, mine, 'the calm keeps its owners');
  assert.ok(s.events.some((e) => e.kind === EVENT.swallow && e.cells.length > 0));
  const d = v3();
  for (let cell = 0; cell < TERRITORY.cells; cell++) {
    if (s.owner[cell] !== 0) assert.ok(dot(cellDir(TERRITORY, cell, d), c) >= calm.cos - 1e-9);
  }
});

function idleMatch(seed: number, each?: (s: MatchState, ms: number) => void, from?: MatchState): MatchState {
  const water = seed === SEED ? sea : seaFor(W, seed), s = from ?? createMatch({ seed }), input = idleInput();
  const off = S(5 + rngInt(rngFrom(seed), 30));
  while (!over(s)) {
    input.flags = s.tick >= off ? FLAG.breakOff : 0;
    const t0 = cpuNow();
    step(water, s, input);
    each?.(s, cpuNow() - t0);
  }
  return s;
}

test('the storm alone ends every match, by its last phase', (t) => {
  const n = Number(process.env.PORTOLAN_MATCHES ?? 6), minutes: number[] = [];
  for (let m = 0; m < n; m++) {
    const s = idleMatch(hash32(SEED, m), undefined, unarmed(createMatch({ seed: hash32(SEED, m) })));
    assert.ok(s.sunk.every((d) => d.cause === CAUSE.storm && d.by === -1));
    assert.ok(s.tick <= CLOSED + S(20), `seed ${m} over at ${s.tick * TICK} s`);
    minutes.push((s.tick * TICK) / 60);
  }
  const within = minutes.filter((x) => x >= 9 && x <= 11).length;
  t.diagnostic(
    `${n} idle matches end at min ${quantile(minutes, 0).toFixed(2)}, q1 ${quantile(minutes, 0.25).toFixed(2)}, median ` +
      `${quantile(minutes, 0.5).toFixed(2)}, q3 ${quantile(minutes, 0.75).toFixed(2)}, max ${quantile(minutes, 1).toFixed(2)} min; ` +
      `${within} in 9–11 min`,
  );
});

test('a whole match resumed from snapshots at random ticks ends exactly as played through; the tick\'s cost', (t) => {
  const rng = rngFrom(SEED), at = [1 + rngInt(rng, S(100)), S(100) + rngInt(rng, S(100)), S(200) + rngInt(rng, S(100))];
  const snaps: Uint8Array[] = [], cost: number[] = [], sights = Array.from({ length: SHIPS }, newSight);
  const whole = idleMatch(SEED, (s, ms) => {
    const t0 = cpuNow();
    survey(sea, s, sights);
    cost.push(ms + cpuNow() - t0);
    if (at.includes(s.tick)) snaps.push(encodeMatch(s));
  });
  assert.equal(snaps.length, at.length);
  for (const b of snaps) assert.equal(matchHash(idleMatch(SEED, undefined, decodeMatch(b))), matchHash(whole));
  const mean = cost.reduce((a, b) => a + b, 0) / cost.length;
  t.diagnostic(`step + survey over ${cost.length} ticks: mean ${mean.toFixed(3)} ms, p99 ${quantile(cost, 0.99).toFixed(3)} ms`);
  assert.ok(mean <= 0.3, `mean ${mean} ms (A9: Node ≤ 0.3)`);
});
