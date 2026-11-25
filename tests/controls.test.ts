import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUST_NOTCH, HEAL_SLOTS } from '../src/play/player.ts';
import { GUST_METER, HEAL } from '../src/sim/tuning.ts';
import {
  GUST,
  RARITY_INK,
  THUMB,
  around,
  dash,
  gustButton,
  gustReady,
  healSlot,
  healTapped,
  meterFill,
  notchAt,
  slotBox,
  slotsWidth,
  type Box,
} from '../src/ui/sea/controls.ts';
import { INK } from '../src/ui/base/ink.ts';

const POINTS_PER_UNIT = 1.735,
  TOUCH = 44 / POINTS_PER_UNIT;

const apart = (a: Box, b: Box) =>
  a.left + a.width <= b.left ||
  b.left + b.width <= a.left ||
  a.top + a.height <= b.top ||
  b.top + b.height <= a.top;

test('three heal slots and the notch come from the sea rules', () => {
  assert.equal(HEAL_SLOTS, HEAL.slots);
  assert.equal(HEAL_SLOTS, 3);
  assert.equal(GUST_NOTCH, GUST_METER.least);
});

test('each heal slot is a hit area of its own, big enough for a thumb, within the bar', () => {
  const boxes = Array.from({ length: HEAL_SLOTS }, (_, i) => slotBox(i));
  for (const b of boxes) {
    assert.ok(b.width >= TOUCH && b.height >= TOUCH);
    assert.ok(b.left >= 0 && b.left + b.width <= slotsWidth(HEAL_SLOTS));
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      assert.ok(apart(boxes[i], boxes[j]), `slots ${i} and ${j} overlap`);
});

test('the Gust toggle is its own hit area above Fire, within the thumb', () => {
  const { gust, fire } = THUMB;
  assert.ok(gust.width >= TOUCH && gust.height >= TOUCH);
  assert.ok(gust.bottom >= fire.bottom + fire.height, 'above Fire');
  for (const c of [gust, fire]) {
    assert.ok(c.right >= 0 && c.right + c.width <= THUMB.width);
    assert.ok(c.bottom >= 0 && c.bottom + c.height <= THUMB.height);
  }
});

test('a tap on a held heal uses that slot; an empty slot, a heal in use or a whole hull refuse it', () => {
  const heals = ['rare', null, 'legendary'] as const;
  assert.equal(healTapped(heals, 0), 0);
  assert.equal(healTapped(heals, 1), null);
  assert.equal(healTapped(heals, 2), 2);
  assert.equal(healTapped([null, null, null], 0), null);
  assert.equal(healTapped(heals, 0, true), null);
});

test('a held heal is drawn with its rarity’s border; an empty slot shows no heal', () => {
  for (const r of ['common', 'rare', 'epic', 'legendary'] as const)
    assert.ok(healSlot(r, false).includes(`stroke="${RARITY_INK[r]}"`), r);
  assert.deepEqual(
    [RARITY_INK.common, RARITY_INK.rare, RARITY_INK.epic, RARITY_INK.legendary],
    [INK.silver, INK.blue, INK.storm, INK.gold]
  );
  assert.equal(new Set(Object.values(RARITY_INK)).size, 4);
  const empty = healSlot(null, false);
  assert.ok(!empty.includes(INK.green), 'no heal glyph');
  assert.ok(!empty.includes('class="use"'), 'no ring');
  assert.ok(healSlot('rare', true).includes('class="use"'));
  assert.notEqual(healSlot('rare', true), healSlot('rare', false));
});

test('the ring round a slot in use is one path whose dash fills as the use goes on', () => {
  assert.ok(around(0).includes('opacity="0"'));
  assert.ok(around(0.5).includes('stroke-dasharray="0.5000 1"'));
  assert.ok(around(0.9).includes('stroke-dasharray="0.9000 1"'));
  assert.equal(dash(1.4), '1.0000 1');
  assert.equal(dash(-1), '0.0000 1');
  assert.ok(healSlot('epic', true).includes(around(0)));
});

test('the Gust ring’s fill tracks the meter, drawn once and dashed to it', () => {
  assert.equal(meterFill(0), 0);
  assert.equal(meterFill(1), 1);
  assert.equal(meterFill(1.2), 1);
  assert.equal(meterFill(-0.1), 0);
  let last = -1;
  for (let m = 0; m <= 1; m += 0.01) {
    const f = meterFill(m);
    assert.ok(f >= last && Math.abs(f - m) < 1 / 40);
    last = f;
  }
  const face = gustButton(GUST_NOTCH);
  assert.ok(face.includes('class="meter"'));
  assert.ok(face.includes('pathLength="1"'));
  assert.equal(
    face,
    gustButton(GUST_NOTCH),
    'the face does not move with the meter'
  );
});

test('the notch sits at 30% of the way round, clockwise from the top', () => {
  const c = GUST.r,
    p = notchAt(c, c, 10, GUST_NOTCH),
    a = 2 * Math.PI * GUST_NOTCH - Math.PI / 2;
  assert.ok(Math.abs(p.x - (c + 10 * Math.cos(a))) < 1e-9);
  assert.ok(Math.abs(p.y - (c + 10 * Math.sin(a))) < 1e-9);
  assert.ok(p.x > c && p.y > c, 'right of center and below it');
  const top = notchAt(c, c, 10, 0);
  assert.deepEqual([Math.round(top.x), Math.round(top.y)], [c, c - 10]);
  const outer = notchAt(c, c, GUST.notch[1], GUST_NOTCH);
  assert.ok(
    gustButton(GUST_NOTCH).includes(
      `L${outer.x.toFixed(2)} ${outer.y.toFixed(2)}`
    )
  );
});

test('below the notch an idle Gust is not ready; on, or above it, it is', () => {
  assert.ok(!gustReady(0.2, GUST_NOTCH, false));
  assert.ok(gustReady(0.2, GUST_NOTCH, true));
  assert.ok(gustReady(GUST_NOTCH, GUST_NOTCH, false));
});
