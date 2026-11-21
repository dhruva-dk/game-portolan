// Damage as the player sees it: a fault's onset (player.ts worsened), the beat
// the camera, the sound and the HUD each give once; the vitals slip's wash of a
// zone by its share, and the zone a blow struck (ui/vitals.ts).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SOUND, worsened, type Faults } from '../src/player.ts';
import { CAMERA, faultAnswer } from '../src/play/shake.ts';
import { createFaults } from '../src/ship/faults.ts';
import type { ShipDraw } from '../src/snapshot.ts';
import { createChanged } from '../src/ui/drawn.ts';
import { GLYPHS, stormMark } from '../src/ui/glyphs.ts';
import { RING, glow, sectorOf } from '../src/ui/hits.ts';
import { PAPER, WASH } from '../src/ui/ink.ts';
import { shimmer, washOf } from '../src/ui/vitals.ts';

test("vitals: a zone's wash runs paper, ochre, vermilion, and darkens as its share grows", () => {
  assert.equal(washOf(0), PAPER);
  assert.equal(washOf(0.3), WASH.ochre);
  assert.equal(washOf(0.6), WASH.vermilion);
  assert.equal(washOf(1), WASH.vermilion);
  const light = (hex: string) =>
    [1, 3, 5].reduce((a, i) => a + parseInt(hex.slice(i, i + 2), 16), 0);
  for (let s = 0; s < 0.6; s += 0.05)
    assert.ok(light(washOf(s + 0.05)) < light(washOf(s)), `darker past ${s}`);
});

test('vitals: the mending shimmer starts as she begins, runs on unbroken while she mends, and stops as she ends', () => {
  let started = 0,
    cancelled = 0;
  const start = () => {
    started++;
    return { cancel: () => void cancelled++ };
  };
  let a = shimmer<ReturnType<typeof start>>(null, false, start);
  assert.equal(a, null);
  a = shimmer(a, true, start);
  const first = a;
  for (let i = 0; i < 5; i++) a = shimmer(a, true, start);
  assert.equal(a, first, 'the same one runs on through redraws');
  assert.equal(started, 1);
  a = shimmer(a, false, start);
  assert.equal(a, null);
  assert.equal(cancelled, 1);
  a = shimmer(a, false, start);
  assert.equal(cancelled, 1);
  a = shimmer(a, true, start);
  assert.equal(started, 2, 'started afresh when she mends again');
});

test('a blow on her lights the sector of the ring toward its dealer: eight, ahead first, clockwise', () => {
  const step = Math.PI / 4,
    e = 1e-6;
  for (let i = 0; i < 8; i++) {
    // its middle, either way round, and just inside both its ends
    assert.equal(sectorOf(i * step), i);
    assert.equal(sectorOf(i * step - 2 * Math.PI), i);
    assert.equal(sectorOf(i * step - step / 2 + e), i);
    assert.equal(sectorOf(i * step + step / 2 - e), i);
    // a boundary belongs to the sector clockwise of it
    assert.equal(sectorOf(i * step + step / 2), (i + 1) % 8);
  }
  assert.equal(sectorOf(Math.PI / 2), 2, 'right');
  assert.equal(sectorOf(-Math.PI / 2), 6, 'left');
  assert.equal(sectorOf(Math.PI), 4, 'behind');
  assert.equal(sectorOf(-Math.PI), 4, 'behind, the other way');
});

test("a sector's light: struck at once, brighter the heavier, faded out over 2 s", () => {
  const light = glow(0.4),
    heavy = glow(1.3),
    o = (g: ReturnType<typeof glow>) => g.frames.map((f) => f.opacity);
  assert.equal(light.ms, 2000);
  for (const g of [light, heavy]) {
    const os = o(g);
    for (let i = 1; i < os.length; i++) assert.ok(os[i] <= os[i - 1]);
    assert.equal(os[os.length - 1], 0);
    assert.ok(os[0] > RING.rest, 'lit above the ring at rest');
  }
  assert.ok(o(heavy)[0] > o(light)[0]);
  assert.equal(o(heavy)[0], 1);
  assert.equal(o(glow(0))[0], RING.lit[0]);
});

test('faults on a drawn ship: her canvas grimed and slack, a list, her head wandering; eased in, and sound when mended', () => {
  const ship = (faults: Faults): ShipDraw => ({
    id: 1,
    pose: { position: [0, 0, 554], forward: [1, 0, 0], up: [0, 0, 1] },
    look: { paint: [0.5, 0.4, 0.3], sail: [0.8, 0.1, 0.1], pattern: 'plain' },
    velocity: [0, 0, 0],
    afloat: true,
    gun: null,
    wear: 0,
    faults,
  });
  const f = createFaults();
  // the first frame settles at once
  let [d] = f.apply([ship([2, 2, 2, 0])], 0);
  // greyed toward soot: darker, and its red no longer far above its green
  const [r, g] = d.look.sail;
  assert.ok(r < 0.5 && r - g < 0.35, `grimed: ${d.look.sail}`);
  assert.ok(f.slack(1) < 0.5, 'slack');
  const up = d.pose.up;
  assert.ok(Math.abs(up[2] - Math.cos(0.15)) < 1e-6, `listed: ${up}`);
  assert.ok(Math.abs(Math.hypot(...up) - 1) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...d.pose.forward) - 1) < 1e-9);
  const heads = new Set<string>();
  for (let t = 0; t < 6; t += 0.5)
    heads.add(f.apply([ship([2, 2, 2, 0])], t)[0].pose.forward[1].toFixed(3));
  assert.ok(heads.size > 4, 'her head wanders');
  // mended: eased back, not jumped
  [d] = f.apply([ship([0, 0, 0, 0])], 6.1);
  assert.ok(d.look.sail[0] < 0.75 && f.slack(1) < 0.9, 'easing out');
  for (let t = 6.2; t < 20; t += 0.1) [d] = f.apply([ship(SOUND)], t);
  assert.ok(Math.abs(d.look.sail[0] - 0.8) < 1e-3 && f.slack(1) > 0.999);

  // her look kept but for her sail, and what came in untouched
  const listed = ship([2, 0, 2, 0]),
    g2 = createFaults();
  [d] = g2.apply([listed], 0);
  assert.equal(d.look.paint, listed.look.paint);
  assert.equal(d.look.pattern, listed.look.pattern);
  assert.deepEqual(listed.look.sail, [0.8, 0.1, 0.1]);
  assert.deepEqual(listed.pose.up, [0, 0, 1]);
  // a gun's mouth on her, 5 m over her middle, carried over with her list; one
  // off her, or on a ship unfaulted, left where it is
  const into: [number, number, number] = [0, 0, 0],
    on = g2.carried([0, 0, 559], [listed], into),
    leaned = d.pose.up;
  for (let j = 0; j < 3; j++)
    assert.ok(
      Math.abs(on[j] - (listed.pose.position[j] + 5 * leaned[j])) < 1e-9
    );
  assert.deepEqual(g2.carried([100, 0, 554], [listed], into), [100, 0, 554]);
  const sound = ship(SOUND);
  g2.apply([sound], 1);
  assert.deepEqual(g2.carried([0, 0, 559], [sound], into), [0, 0, 559]);
});

test("the storm's mark: its bolt hollow while it holds, filled while it closes, the same bolt", () => {
  const held = GLYPHS[stormMark(false)],
    closing = GLYPHS[stormMark(true)];
  assert.ok(held.every((p) => p.k === 's'));
  assert.ok(closing.every((p) => p.k === 'f'));
  assert.equal(held[0]?.d, closing[0]?.d);
});

test('a piece is drawn again only when what it shows changes (the clock turning its bolt filled)', () => {
  const changed = createChanged<object>(),
    clock = {},
    other = {};
  // the clock's: its seconds, ships afloat, in violet, closing (hud.ts)
  assert.equal(changed(clock, 40, 6, false, false), true, 'first drawn');
  for (let i = 0; i < 5; i++)
    assert.equal(changed(clock, 40, 6, false, false), false);
  assert.equal(changed(clock, 40, 6, true, true), true, 'closing: redrawn');
  assert.equal(changed(clock, 40, 6, true, true), false);
  assert.equal(changed(other, 40, 6, true, true), true, 'each piece its own');
  assert.equal(changed(clock, 39, 6, true, true), true);
});

test('the camera punches once as a fault comes on or worsens, and only at sea', () => {
  const minor: Faults = [0, 1, 0, 0],
    major: Faults = [0, 2, 0, 0];
  assert.equal(faultAnswer(SOUND, minor, true), CAMERA.fault);
  assert.equal(faultAnswer(minor, major, true), CAMERA.fault);
  assert.equal(faultAnswer(minor, minor, true), null, 'once');
  assert.equal(faultAnswer(major, minor, true), null, 'mending');
  assert.equal(faultAnswer(SOUND, major, false), null, 'not at sea');
});

test('a fault worsens when any zone goes up a grade, never when one mends or moves', () => {
  const minor: Faults = [0, 0, 1, 0],
    major: Faults = [0, 0, 2, 0];
  assert.equal(worsened(SOUND, minor), true);
  assert.equal(worsened(minor, major), true);
  assert.equal(worsened(major, minor), false);
  assert.equal(worsened(minor, minor), false);
  // the worst zone moving from one to another is a new fault where it lands
  assert.equal(worsened([1, 0, 0, 0], [0, 1, 0, 0]), true);
  assert.equal(worsened(major, SOUND), false);
});
