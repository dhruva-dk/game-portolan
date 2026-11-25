import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUST_NOTCH, HEAL_SLOTS } from '../src/play/player.ts';
import { GUST_METER, HEAL } from '../src/sim/tuning.ts';
import {
  GUST,
  RARITY_INK,
  THUMB,
  around,
  gustButton,
  healSlot,
  healTapped,
  meterFill,
  notchAt,
  slotBox,
  slotsWidth,
  type Box,
} from '../src/ui/sea/controls.ts';
import { INK, ring } from '../src/ui/base/ink.ts';

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

test('a tap on a held heal uses that slot; a tap on an empty slot does nothing', () => {
  const heals = ['rare', null, 'legendary'] as const;
  assert.equal(healTapped(heals, 0), 0);
  assert.equal(healTapped(heals, 1), null);
  assert.equal(healTapped(heals, 2), 2);
  assert.equal(healTapped([null, null, null], 0), null);
});

test('a held heal is drawn with its rarity’s border; an empty slot shows no heal', () => {
  for (const r of ['common', 'rare', 'epic', 'legendary'] as const)
    assert.ok(healSlot(r, null).includes(`stroke="${RARITY_INK[r]}"`), r);
  assert.deepEqual(
    [RARITY_INK.common, RARITY_INK.rare, RARITY_INK.epic, RARITY_INK.legendary],
    [INK.silver, INK.blue, INK.storm, INK.gold]
  );
  assert.equal(new Set(Object.values(RARITY_INK)).size, 4);
  const empty = healSlot(null, null);
  assert.ok(!empty.includes(INK.green), 'no heal glyph');
  assert.equal(healSlot('rare', 0.5), healSlot('rare', 0.5));
});

test('the ring round a slot in use fills as the use goes on', () => {
  assert.equal(around(0), '');
  const half = around(0.5),
    most = around(0.9);
  assert.ok(half.includes('stroke-dasharray="0.5000 1"'));
  assert.ok(most.includes('stroke-dasharray="0.9000 1"'));
  assert.ok(healSlot('epic', 0.5).includes(half));
  assert.ok(!healSlot('epic', null).includes('stroke-dasharray'));
});

test('the Gust ring’s fill tracks the meter', () => {
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
  const arc = (m: number) =>
    ring(GUST.r, GUST.r, GUST.ring, meterFill(m), INK.iron, GUST.width);
  assert.equal(arc(0), '', 'an empty meter draws no arc');
  for (const m of [0.1, 0.4, 0.8, 1])
    assert.ok(gustButton(m, GUST_NOTCH, false).includes(arc(m)), `${m}`);
  assert.notEqual(arc(0.4), arc(0.8));
  assert.ok(arc(0.4).includes(' 0 0 1 '), 'under half: the short way');
  assert.ok(arc(0.8).includes(' 0 1 1 '), 'over half: the long way');
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
    gustButton(0.5, GUST_NOTCH, false).includes(
      `L${outer.x.toFixed(2)} ${outer.y.toFixed(2)}`
    )
  );
});

test('below the notch an idle Gust is drawn faint; on, or above it, in full', () => {
  const faint = (m: number, on: boolean) =>
    gustButton(m, GUST_NOTCH, on).includes('opacity="0.4"');
  assert.ok(faint(0.2, false));
  assert.ok(!faint(0.2, true));
  assert.ok(!faint(GUST_NOTCH, false));
});
