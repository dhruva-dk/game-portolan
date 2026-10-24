// WP21: the air the renderer reads (S-005: the sim's wind over the eye in a match, a defined ambient wind without one,
// no crash before the camera is placed) and the fog wall standing exactly where the sim's veil hides.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Air, fogAngle } from '../../src/render/weather.ts';
import { newWind, seaFor, windAt } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { R } from '../../src/sim/sphere.ts';
import { createMatch } from '../../src/sim/state.ts';
import { SIGHT, WEATHER } from '../../src/sim/tables.ts';
import { depthIn, newSky, skyAt } from '../../src/sim/weather.ts';
import { world } from '../sim/vectors.ts';

const W = world();

test('without a match the air is a fair trade wind, tangent at the foot', () => {
  const air = new Air().update(W, null, new THREE.Vector3(0, 0, 0));
  assert.deepEqual(air.foot.toArray(), [0, 0, 1]);
  assert.ok(Math.abs(air.toward.length() - 1) < 1e-9 && Math.abs(air.toward.dot(air.foot)) < 1e-9);
  assert.equal(air.strength, 1);
  assert.equal(air.range, SIGHT.clear);
  assert.equal(air.storm, 0);
});

test("in a match the air is the sim's wind and weather over the eye; an unplaced camera stands over the player", () => {
  const state = createMatch({ seed: 7 }), sea = seaFor(W, 7), air = new Air();
  air.update(W, state, new THREE.Vector3(0, 0, 0));
  const p = state.ships[0].pos;
  assert.ok(air.foot.distanceTo(new THREE.Vector3(p.x, p.y, p.z).normalize()) < 1e-9);
  const eye = new THREE.Vector3(0.3, 0.8, -0.5).normalize().multiplyScalar(R + 20);
  air.update(W, state, eye);
  const wind = windAt(sea, state, air.foot, newWind()), v = new THREE.Vector3(wind.v.x, wind.v.y, wind.v.z).normalize();
  assert.ok(air.toward.distanceTo(v) < 1e-9);
  assert.equal(air.strength, wind.strength);
  const sky = skyAt(state, air.foot, newSky());
  assert.ok(Math.abs(air.range - SIGHT.clear * sky.sight * (1 - (1 - 0.45) * air.storm)) < 1e-9);
});

test("a fog bank's wall stands where the sim's veil begins", () => {
  let checked = 0;
  for (let seed = 1; seed < 40 && checked < 6; seed++) {
    const state = createMatch({ seed });
    step(seaFor(W, seed), state, idleInput()); // the weather is brewed on the first tick
    for (const spell of state.weather) {
      const a = fogAngle(spell);
      if (a === 0) continue;
      const c = new THREE.Vector3(spell.at.x, spell.at.y, spell.at.z), t = new THREE.Vector3(c.y, -c.x, 0.2);
      t.addScaledVector(c, -t.dot(c)).normalize();
      const at = (k: number) => c.clone().multiplyScalar(Math.cos(a * k)).addScaledVector(t, Math.sin(a * k));
      assert.ok(depthIn(spell, at(0.99)) >= WEATHER.veil);
      assert.ok(depthIn(spell, at(1.01)) < WEATHER.veil);
      checked++;
    }
  }
  assert.ok(checked >= 3, `fog spells checked: ${checked}`);
});
