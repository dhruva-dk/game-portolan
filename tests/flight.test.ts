// Parts and the flight (#58 steps 7 and 8.1): wear by Seamanship and blows, a part failing at its drawn threshold and
// its fault on her handling, a sprung plank's leak; the flight's stop, its jobs in order, its botches, and leaving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Fitted, Service } from '../src/race.ts';
import { SPEC } from '../src/sim/fit.ts';
import { called, served, FLIGHT, SERVICE, type Done, type Serving, type Stop } from '../src/sim/flight.ts';
import { GUST, WEAR } from '../src/sim/handling.ts';
import { emptyHold } from '../src/sim/hold.ts';
import { gustOf } from '../src/sim/gust.ts';
import { faulted, fitOut, leaked, PART_TYPES, repaired, wearRate, worn, type Part } from '../src/sim/wear.ts';

const fitted = (reliability: number, condition = 1): Fitted[] => PART_TYPES.map((type) => ({ type, reliability, condition }) as Fitted);

test('parts: thresholds drawn per race, ship and part, in [0, 1 − reliability]; reliability 1 never fails', () => {
  const a = fitOut(fitted(0.8), 7, 3);
  assert.deepEqual(fitOut(fitted(0.8), 7, 3), a, 'the same race and ship, the same thresholds');
  assert.notDeepEqual(fitOut(fitted(0.8), 7, 4).map((p) => p.threshold), a.map((p) => p.threshold));
  assert.ok(a.every((p) => p.threshold >= 0 && p.threshold <= 0.2 && !p.failed));
  assert.ok(fitOut(fitted(1), 7, 3).every((p) => p.threshold === 0));
  let sure = fitOut(fitted(1), 7, 3);
  for (let t = 0; t < 2000; t++) sure = worn(sure, 1, 0, 0).parts;
  assert.ok(sure.every((p) => !p.failed && p.condition === 0), 'worn to nothing, never failed');
});

test('wear: faster for a worse seaman and for every hull point lost; a part fails once below its threshold', () => {
  assert.ok(wearRate(0.2) > wearRate(0.8));
  const one = [{ type: 'sails', condition: 0.5, threshold: 0.3, failed: false }] as Part[];
  const calm = worn(one, 1, 0.5, 0), hit = worn(one, 1, 0.5, 20);
  assert.ok(hit.parts[0].condition < calm.parts[0].condition);
  assert.ok(Math.abs(calm.parts[0].condition - hit.parts[0].condition - 20 * WEAR.hull) < 1e-12);
  const broke = worn(one, 1, 0.5, 50);
  assert.deepEqual(broke.failed, ['sails']);
  assert.equal(worn(broke.parts, 1, 0.5, 0).failed.length, 0, 'it fails once');
  const fixed = repaired(broke.parts[0]);
  assert.ok(!fixed.failed && Math.abs(fixed.condition - (0.3 + WEAR.after)) < 1e-12);
});

test("faults: each failed part's factor on her handling; a sprung plank leaks past her shield, never below the floor", () => {
  const all = PART_TYPES.map((type): Part => ({ type, condition: 0, threshold: 0.1, failed: true }));
  const f = faulted(SPEC, all);
  assert.equal(f.top, SPEC.top * WEAR.torn);
  assert.equal(f.gather, SPEC.gather * WEAR.fouled);
  assert.equal(f.turn, SPEC.turn * WEAR.jammed);
  assert.equal(f.spread, SPEC.spread * WEAR.ballast);
  assert.equal(f.reload, SPEC.reload * WEAR.seized);
  assert.equal(faulted(SPEC, all.map((p) => ({ ...p, failed: false }))), SPEC, 'none failed: the card as it is');
  const h = leaked({ hull: 50, shield: 40 }, all, 2);
  assert.deepEqual(h, { hull: 50 - 2 * WEAR.plank, shield: 40 });
  assert.equal(leaked({ hull: 1.5, shield: 0 }, all, 2).hull, WEAR.floor);
});

const sure: Service = { ...SERVICE, botch: { mend: 0, gust: 0, stores: 0, part: 0 } };
const hurt = (): Serving => ({
  health: { hull: 60, shield: 0 }, most: 100, gust: { ...gustOf(), charges: 1 }, hold: emptyHold(),
  parts: [{ type: 'rudder', condition: 0, threshold: 0.2, failed: true }],
});
/** A stop run in steps of dt while `home` says she lies in her water: what it did, by the second. */
function stop(service: Service, ship: Serving, dt = 0.1, home = (_t: number) => true, fired = false) {
  let s: Stop | null = called(), her = ship, t = 0;
  const log: { t: number; d: Done }[] = [];
  while (s && t < 200) {
    const r = served(s, her, { service, home: home(t), fired, seed: 9 }, dt);
    t += dt;
    [s, her] = [r.stop, r.ship];
    log.push(...r.done.map((d) => ({ t, d })));
  }
  return { her, log, t };
}

test('the flight: comes after `arrive` s, mends, recharges, stows a kit and repairs, in order, and goes', () => {
  const { her, log } = stop(sure, hurt());
  const kinds = log.map((l) => (l.d.kind === 'job' ? l.d.job : l.d.kind));
  assert.deepEqual(kinds, ['come', 'mend', 'gust', 'stores', 'part', 'repaired', 'ended']);
  assert.ok(Math.abs(log[0].t - SERVICE.arrive) < 0.11);
  assert.equal(her.health.hull, 100);
  assert.equal(her.gust.charges, GUST.charges);
  assert.deepEqual(her.hold.items[0], { kind: 'repairKit', count: 1 });
  assert.ok(!her.parts[0].failed);
  // mending 40 points at FLIGHT.mend a second, a gust charge every FLIGHT.gust s
  const at = (k: string) => log.find((l) => (l.d.kind === 'job' ? l.d.job : l.d.kind) === k)!.t;
  assert.ok(Math.abs(at('gust') - at('mend') - 40 / FLIGHT.mend) < 0.25);
  assert.ok(Math.abs(at('stores') - at('gust') - (GUST.charges - 1) * FLIGHT.gust) < 0.35);
  // twice the rate, half the time at its jobs
  const quick = stop({ ...sure, rate: { mend: 2, gust: 2, stores: 2, part: 2 } }, hurt()), slow = stop(sure, hurt());
  assert.ok(Math.abs(quick.t - SERVICE.arrive - (slow.t - SERVICE.arrive) / 2) < 1, `${quick.t} against ${slow.t}`);
});

test('the flight: a job with nothing to do passed over; its order; free repair on arrival; leaving her water ends it', () => {
  const whole = { ...hurt(), health: { hull: 100, shield: 0 }, gust: gustOf(), hold: { ...emptyHold(), items: [{ kind: 'repairKit', count: 8 }, { kind: 'bigShield', count: 3 }, { kind: 'smallShield', count: 6 }] } } as Serving;
  const kinds = (log: { d: Done }[]) => log.map((l) => (l.d.kind === 'job' ? l.d.job : l.d.kind));
  assert.deepEqual(kinds(stop(sure, whole).log), ['come', 'part', 'repaired', 'ended']);
  assert.deepEqual(kinds(stop({ ...sure, order: ['part', 'mend', 'gust', 'stores'] }, hurt()).log).slice(0, 4), ['come', 'part', 'repaired', 'mend']);
  assert.deepEqual(kinds(stop({ ...sure, freeRepair: true }, whole).log), ['come', 'repaired', 'ended']);
  const left = stop(sure, hurt(), 0.1, (t) => t < 8);
  assert.deepEqual(left.log.at(-1)!.d, { kind: 'ended', served: false });
  assert.ok(left.her.health.hull > 60 && left.her.health.hull < 100, 'mended a little, then gone');
});

test('the flight: a botch pauses its job FLIGHT.botched s, never harms her; under fire, botches come more often', () => {
  const always = { ...SERVICE, botch: { mend: 1, gust: 1, stores: 1, part: 1 } };
  const a = stop(always, hurt()), b = stop(sure, hurt());
  assert.ok(a.log.filter((l) => l.d.kind === 'job').every((l) => l.d.kind === 'job' && l.d.botched));
  assert.ok(Math.abs(a.t - b.t - 4 * FLIGHT.botched) < 0.5, `${a.t} against ${b.t}`);
  assert.deepEqual(a.her, b.her);
  const botches = (fired: boolean) => {
    let n = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = served({ ...called(), t: 10, come: true }, hurt(), { service: { ...SERVICE, botch: { ...SERVICE.botch, mend: 0.2 } }, home: true, fired, seed }, 0.1);
      n += r.done.some((d) => d.kind === 'job' && d.botched) ? 1 : 0;
    }
    return n;
  };
  assert.ok(botches(true) > botches(false) * 1.5, `${botches(true)} against ${botches(false)}`);
});
