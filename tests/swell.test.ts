import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANDS, CASCADES, FETCH, PERIOD, SIZE } from '../src/water/cascades.ts';
import { initialSpectrum, seaState } from '../src/water/spectrum.ts';
import { createSwell, longModes } from '../src/water/swell.ts';
import { STEP } from '../src/sim/fixed.ts';
import { pose, ride, settled, RIDE } from '../src/sim/ride.ts';
import { shipAt } from '../src/sim/ship.ts';
import { FREQUENCY, anchors, icosphere } from '../src/world/lattice.ts';
import { R, along, cross, dot, frameAt, fromLatLon, length } from '../src/world/sphere.ts';
import { createWind } from '../src/world/wind.ts';

const all = anchors(icosphere(FREQUENCY), createWind(3), CASCADES[0]);
const open = () => -40;
const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);
/** Spread points over the sphere, and times. */
const places = (n: number) => Array.from({ length: n }, (_, i) => ({ p: fromLatLon(Math.asin(2 * ((i * 0.618) % 1) - 1), i * 2.4), t: i * 1.37 }));

test('the modes kept hold nearly all the long waves', () => {
  for (const [wind, share] of [[7.6, 0.9], [10, 0.94], [15, 0.97]]) {
    let total = 0;
    CASCADES.forEach((L, c) => { for (const v of initialSpectrum(SIZE, L, { wind, fetch: FETCH }, c + 1, BANDS[c])) total += v * v; });
    const m = longModes(wind);
    let kept = 0;
    // each kept mode stands for k and −k
    for (let i = 0; i < m.length; i += 8) kept += 2 * (m[i + 4] ** 2 + m[i + 5] ** 2 + m[i + 6] ** 2 + m[i + 7] ** 2);
    assert.ok(kept / total > share, `wind ${wind}: ${kept / total}`);
  }
});

test('under a hull the kept modes read as all of them do, to a few centimetres', () => {
  const every = createSwell(all, open, 10, Infinity), kept = createSwell(all, open, 10);
  const err: number[] = [], height: number[] = [];
  for (const { p, t } of places(150)) {
    const f = frameAt(p);
    const under = [along(p, f.north, 10).p, along(p, f.north, -10).p, along(p, f.east, 3).p, along(p, f.east, -3).p];
    const mean = (s: typeof kept) => under.reduce((sum, q) => sum + s(q, t), 0) / 4;
    const truth = mean(every);
    err.push(truth - mean(kept));
    height.push(truth);
  }
  assert.ok(rms(err) < 0.1 && rms(err) < 0.2 * rms(height), `${rms(err)} m of ${rms(height)} m`);
});

test('the swell is as high as the sea state, repeats every PERIOD, and is cut by the depth', () => {
  const swell = createSwell(all, open, 10);
  const h = places(300).map(({ p, t }) => swell(p, t));
  // σ = Hs/4, less the little the short cascade and the modes left out hold, and less a little where three charts meet
  assert.ok(Math.abs(rms(h) / (seaState(10, FETCH).hs / 4) - 0.95) < 0.12, `${rms(h)}`);
  for (const { p, t } of places(20)) assert.ok(Math.abs(swell(p, t) - swell(p, t + PERIOD)) < 1e-6);
  const shallow = createSwell(all, () => -0.5, 10);
  for (const { p, t } of places(20)) assert.ok(Math.abs(shallow(p, t)) <= Math.abs(swell(p, t)) * (0.5 * 0.78 / seaState(10, FETCH).hs) + 0.05);
});

test('the hull rides the swell: her level follows the water under her, her pitch and roll its slope', () => {
  for (const wind of [10, 15]) {
    const swell = createSwell(all, open, wind);
    const s = shipAt(fromLatLon(0.3, 1.1), frameAt(fromLatLon(0.3, 1.1)).north);
    let r = settled(s, swell, 0);
    const level: number[] = [], miss: number[] = [], pitch: number[] = [], pitchMiss: number[] = [], roll: number[] = [], rolled: number[] = [];
    for (let i = 1; i < 60 / STEP; i++) {
      const t = i * STEP;
      r = ride(r, s, swell, t, STEP);
      const port = cross(s.at, s.heading);
      const at = (d: typeof port, m: number) => swell(along(s.at, d, m).p, t);
      const bow = at(s.heading, RIDE.reach), stern = at(s.heading, -RIDE.reach), left = at(port, RIDE.rail), right = at(port, -RIDE.rail);
      const under = (bow + stern + left + right) / 4;
      roll.push(Math.atan2(left - right, 2 * RIDE.rail));
      rolled.push(r.roll);
      level.push(under);
      miss.push(r.heave - under);
      const slope = Math.atan2(bow - stern, 2 * RIDE.reach);
      pitch.push(slope);
      pitchMiss.push(r.pitch - slope);
    }
    // she lags the water a little, as a hull of her weight does, but never floats clear of it or sinks into it
    assert.ok(rms(miss) < 0.3 * rms(level), `wind ${wind}: level off by ${rms(miss)} m of ${rms(level)} m`);
    assert.ok(Math.max(...miss.map(Math.abs)) < 0.25 * seaState(wind, FETCH).hs, `wind ${wind}: ${Math.max(...miss.map(Math.abs))} m at worst`);
    assert.ok(rms(pitchMiss) < 0.5 * rms(pitch), `wind ${wind}: pitch off by ${rms(pitchMiss)} of ${rms(pitch)}`);
    // the chop rocks the water under her rails more than it rolls her
    assert.ok(rms(rolled) < rms(roll) && rms(rolled) > 0.5 * rms(roll), `wind ${wind}: rolls ${rms(rolled)} on ${rms(roll)}`);
    // and her pose is a placement: square axes, on her level
    const placed = pose(s, r);
    assert.ok(Math.abs(dot(placed.forward, placed.up)) < 1e-12 && Math.abs(length(placed.up) - 1) < 1e-12);
    assert.ok(Math.abs(length(placed.position) - R - r.heave) < 1e-9);
  }
});
