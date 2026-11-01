// The juice toolkit's rules, checked without a browser: `node --test src/juice/juice.test.ts`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EASE, Spring, SPRING, peakPerVelocity, springEasing, type SpringPreset } from './ease.ts';
import { TimeScale } from './time.ts';
import { CameraJuice } from './camera.ts';
import { Haptics, PATTERNS, type HapticKind } from './haptics.ts';
import { ScreenFx, LOW_HULL } from './screen.ts';
import { effects } from './log.ts';
import { RECIPES, RECIPE_IDS, PARTICLE_HOOKS, SOUND_LAYERS, pickupRecipe, type Recipe } from './recipes.ts';
import { Juice } from './index.ts';

const F = 1 / 60;

test('easing curves start at 0 and end at 1', () => {
  for (const [name, e] of Object.entries(EASE)) {
    assert.ok(Math.abs(e(0)) < 1e-9, `${name}(0)`);
    assert.ok(Math.abs(e(1) - 1) < 1e-3, `${name}(1)`);
  }
});

test('springs: press is dead, release and pop bounce, kicks peak where asked', () => {
  const overshoot = (p: SpringPreset) => {
    const s = new Spring(p, 0, 1);
    let max = 0;
    for (let i = 0; i < 600; i++) max = Math.max(max, s.step(F / 10));
    return max - 1;
  };
  assert.ok(overshoot(SPRING.press) < 0.01, 'press barely overshoots');
  assert.ok(overshoot(SPRING.release) > 0.2, 'release bounces');
  const k = new Spring(SPRING.kick);
  k.kick(0.5);
  let peak = 0;
  for (let i = 0; i < 1200; i++) peak = Math.max(peak, k.step(F / 10));
  assert.ok(Math.abs(peak - 0.5) < 0.03, `kick peaks at ${peak}`);
  assert.ok(peakPerVelocity(SPRING.kick) > 0);
  assert.match(springEasing(SPRING.pop).easing, /^linear\(0/);
});

test('hit-stop: a 45 ms freeze holds 3 frames at 60 fps, then eases back', () => {
  const ts = new TimeScale();
  ts.request({ scale: 0.05, hold: 0.045, release: 0.06, priority: 'hit' });
  const scales = Array.from({ length: 8 }, () => ts.update(F) / F);
  assert.deepEqual(scales.slice(0, 3).map((s) => +s.toFixed(2)), [0.05, 0.05, 0.05]);
  assert.ok(scales[3] > 0.05 && scales[3] < 1);
  assert.equal(scales[7], 1);
});

test('hit-stop: overlapping stops take the deepest scale and never add up', () => {
  const ts = new TimeScale();
  ts.request({ scale: 0.05, hold: 0.05, release: 0, priority: 'hit' });
  ts.update(F);
  ts.request({ scale: 0.2, hold: 0.05, release: 0, priority: 'hit' });
  const s = ts.update(F) / F;
  assert.equal(+s.toFixed(2), 0.05);
});

test('hit-stop: a kill slow-mo in its hold masks a lower-priority freeze', () => {
  const ts = new TimeScale();
  ts.request({ scale: 0.2, hold: 0.3, release: 0.3, priority: 'kill' });
  ts.update(F);
  ts.request({ scale: 0, hold: 0.05, release: 0, priority: 'hit' });
  assert.equal(+(ts.update(F) / F).toFixed(2), 0.2);
});

test('hit-stop: a repeater burst is held to the frozen-time budget', () => {
  const ts = new TimeScale();
  let frozen = 0;
  for (let i = 0; i < 60; i++) {
    if (i % 6 === 0) ts.request({ scale: 0.05, hold: 0.045, release: 0.06, priority: 'hit' });
    frozen += F - ts.update(F);
  }
  assert.ok(frozen <= ts.budget + 0.02, `froze ${frozen.toFixed(3)} s in one second`);
  assert.ok(frozen > 0.1, 'but still froze');
});

test('camera: shake decays to rest, kicks return home, pulses end', () => {
  const cam = new CameraJuice(3);
  cam.play({ shake: 0.5, kick: { back: 0.5, pitch: 1 }, fov: { deg: -4, attack: 0.05, hold: 0.05, release: 0.3 } });
  let maxRoll = 0, minFov = 0;
  for (let i = 0; i < 20; i++) {
    const o = cam.update(F);
    maxRoll = Math.max(maxRoll, Math.abs(o.roll));
    minFov = Math.min(minFov, o.fov);
  }
  assert.ok(maxRoll > 0.05, 'it shakes');
  assert.ok(minFov < -3.5, 'it punches in');
  for (let i = 0; i < 120; i++) cam.update(F);
  const o = cam.update(F);
  assert.ok(Math.abs(o.roll) < 1e-3 && Math.abs(o.z) < 1e-3 && o.fov === 0, 'at rest after 2 s');
  assert.equal(cam.busy, false);
});

test('camera: falloff drops shake to nothing beyond its range', () => {
  const cam = new CameraJuice();
  cam.play({ shake: 0.5, falloff: [20, 200] }, 1, undefined, 300);
  assert.equal(cam.trauma.hit, 0);
  cam.play({ shake: 0.5, falloff: [20, 200] }, 1, undefined, 110);
  assert.ok(Math.abs(cam.trauma.hit - 0.25) < 1e-9);
});

test('haptics: pattern beats land on time, close taps merge, off means off', () => {
  const played: [number, HapticKind][] = [];
  let t = 0;
  const h = new Haptics({ play: (k) => played.push([Math.round(t * 1000), k]) });
  h.play('shieldBreak');
  for (let i = 0; i < 20; i++) {
    t += F;
    h.update(F);
  }
  assert.deepEqual(played.map((p) => p[1]), PATTERNS.shieldBreak.map((b) => b.kind));
  assert.ok(Math.abs(played[1][0] - 70) <= 17 && Math.abs(played[2][0] - 150) <= 17, `beats at ${played.map((p) => p[0])}`);
  played.length = 0;
  h.play('heavy');
  h.play('light');
  assert.equal(played.length, 1, 'a light tap right after a heavy one merges');
  h.enabled = false;
  h.play('heavy');
  assert.equal(played.length, 1);
});

test('screen: no more than three big flashes start in a second', () => {
  const s = new ScreenFx();
  const spec = { color: '#ffffff', alpha: 0.4, blend: 'add' as const, attack: 0, hold: 0, decay: 0.1 };
  const before = effects.entries.length;
  for (let i = 0; i < 6; i++) {
    s.flash(spec);
    s.update(0.1);
  }
  const outs = effects.entries.slice(before).filter((e) => e.channel === 'flash').map((e) => e.outcome);
  assert.deepEqual(outs, ['played', 'played', 'played', 'trimmed', 'trimmed', 'trimmed']);
});

test('screen: the heartbeat speeds up as the hull drops', () => {
  const beats = (hull: number) => {
    const s = new ScreenFx();
    let n = 0;
    s.onBeat = () => n++;
    s.setHull(hull);
    for (let i = 0; i < 600; i++) s.update(F);
    return n;
  };
  assert.equal(beats(0.5), 0);
  const calm = beats(0.29), panic = beats(0.05);
  assert.ok(Math.abs(calm - (LOW_HULL.bpmCalm / 6)) <= 1.5, `calm ${calm} beats in 10 s`);
  assert.ok(Math.abs(panic - LOW_HULL.bpmPanic / 6) <= 1.5, `panic ${panic} beats in 10 s`);
});

test('recipes: every impact meets the juice checklist on its own channels', () => {
  const impacts = ['cannonHit', 'shieldHit', 'crit', 'shieldBreak', 'sink'] as const;
  for (const id of impacts) {
    const r: Recipe = RECIPES[id];
    assert.ok(r.stop, `${id} hit-stop`);
    assert.ok(r.flash, `${id} flash`);
    assert.ok(r.marker, `${id} marker`);
    assert.ok(r.camera, `${id} camera`);
    assert.ok(r.haptic, `${id} haptic`);
    assert.ok(r.particles, `${id} particles`);
    assert.ok(r.sound.length >= 3, `${id} layered sound`);
  }
  for (const id of RECIPE_IDS) assert.ok((RECIPES[id] as Recipe).sound.length > 0, `${id} has sound`);
  for (const r of [0, 1, 2, 3, 4]) assert.ok(pickupRecipe(r) in RECIPES);
  assert.ok(PARTICLE_HOOKS.includes('shards') && SOUND_LAYERS.includes('shield.shatter'));
});

test('juice: one fire call logs every channel the recipe names, credited to the recipe', () => {
  const calls: string[] = [];
  const juice = new Juice({ haptics: null, hooks: { particles: (c) => calls.push(c.hook), sound: (l) => calls.push(l.join('+')) } });
  const before = effects.entries.length;
  juice.fire('shieldBreak', { value: 30 });
  for (let i = 0; i < 20; i++) juice.update(F);
  const mine = effects.entries.slice(before).filter((e) => e.source === 'shieldBreak');
  const channels = new Set(mine.map((e) => e.channel));
  for (const c of ['time', 'camera', 'haptic', 'flash', 'vignette', 'marker', 'number', 'particles', 'sound'] as const) assert.ok(channels.has(c), `logged ${c}`);
  assert.equal(mine.filter((e) => e.channel === 'haptic' && e.outcome === 'played' && !e.what.startsWith('pattern')).length, 3, 'all three beats of the pattern');
  assert.deepEqual(calls, ['shards', 'shield.crack+shield.shatter+shield.tinkle+shield.tail']);
});
