// WP25: the match controls, HUD layout, HUD model and haptics, without a browser. Touch → ShipInput for every
// gesture (the validator, parseRecording, accepts every input generated), the layout on the iPhone, the iPad and the
// smallest iPhone (inside the safe area, nothing overlapping, every hit area ≥ 44 pt, the frame's centre clear), the
// model following the match, haptics patterns and their limiter.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FLAG, STEER_MAX, parseRecording, record, recorder, type ShipInput } from '../../src/sim/input.ts';
import { EVENT, FLIGHT } from '../../src/sim/state.ts';
import { CONSUMABLE, FORMS } from '../../src/sim/tables.ts';
import { Controls, PRESS, STICK, steerOf } from '../../src/ui/controls.ts';
import { Haptics, LIMIT, type Pulse } from '../../src/ui/haptics.ts';
import { HudState, MIN_HIT, hudLayout, type HudButton, type HudLayout } from '../../src/ui/hud.ts';
import type { View } from '../../src/ui/safeArea.ts';
import { scripted } from '../render/territory.match.ts';

/** The harness's devices (tests/harness.ts DEVICES) plus the smallest supported iPhone, layout only. */
const PROFILES: Record<string, View> = {
  iphone: { width: 956, height: 440, dpr: 3, safe: { top: 0, right: 62, bottom: 20, left: 62 } },
  ipad: { width: 1376, height: 1032, dpr: 2, safe: { top: 0, right: 0, bottom: 25, left: 0 } },
  mini: { width: 812, height: 375, dpr: 3, safe: { top: 0, right: 50, bottom: 21, left: 50 } },
};
const CELL = 42;

function rig(view = PROFILES.iphone) {
  let now = 1000;
  const c = new Controls(() => now);
  c.layout = hudLayout(view);
  c.pick = (_x, y) => (y < view.height * 0.6 ? CELL : -1);
  const all: ShipInput[] = [];
  const tick = (): ShipInput => { const i = c.input(); all.push(i); return i; };
  let id = 0;
  const finger = (x: number, y: number) => {
    const f = ++id;
    c.touch({ phase: 'down', id: f, x, y });
    return {
      id: f,
      to: (nx: number, ny: number, ms = 16) => { now += ms; return c.touch({ phase: 'move', id: f, x: nx, y: ny }); },
      up: (nx = x, ny = y, ms = 16) => { now += ms; return c.touch({ phase: 'up', id: f, x: nx, y: ny }); },
    };
  };
  const btn = (k: string): HudButton => c.layout!.buttons.find((b) => b.kind === k)!;
  return { c, tick, finger, btn, all, wait: (ms: number) => { now += ms; } };
}

function assertValid(all: ShipInput[]): void {
  const r = recorder();
  all.forEach((i, t) => {
    assert.ok(Number.isInteger(i.steer) && Math.abs(i.steer) <= STEER_MAX);
    assert.ok([-1, 0, 1].includes(i.sail));
    record(r, t, i);
  });
  assert.doesNotThrow(() => parseRecording(JSON.parse(JSON.stringify(r.recording))));
}

test('stick: dead zone, expo, hysteresis, trailing origin, centred on release', () => {
  const { finger, tick, all } = rig();
  const f = finger(200, 300);
  f.to(205, 300);
  assert.equal(tick().steer, 0, 'inside the dead zone');
  f.to(230, 300);
  const s30 = tick().steer;
  assert.ok(s30 > 0 && s30 < STEER_MAX / 2, `fine near the centre: ${s30}`);
  f.to(320, 300);
  assert.equal(tick().steer, STEER_MAX);
  const o = 320 - STICK.full; // the origin trailed the thumb: coming back through it reverses at once
  f.to(o - 12, 300);
  assert.ok(tick().steer < 0);
  f.to(o - 5, 300); // inside the dead zone but beyond release: still engaged (hysteresis)
  assert.ok(tick().steer < 0);
  f.to(o - 2, 300);
  assert.equal(tick().steer, 0, 'centred inside release');
  f.up();
  assert.equal(tick().steer, 0);
  assert.equal(steerOf(STICK.full), STEER_MAX);
  assert.equal(steerOf(-STICK.full * 3), -STEER_MAX);
  assertValid(all);
});

test('stick flicks step the sails once each, with a rest; while riding a flick up breaks off', () => {
  const { c, finger, tick, wait, all } = rig();
  const f = finger(150, 300);
  f.to(150, 280, 30); f.to(150, 262, 30);
  assert.equal(tick().sail, 1);
  f.to(150, 230, 30);
  assert.equal(tick().sail, 0, 'resting');
  wait(STICK.flickRest);
  f.to(150, 240, 20); f.to(150, 275, 40);
  assert.equal(tick().sail, -1);
  f.up();
  const slow = finger(150, 300); // a slow drag is not a flick
  for (let y = 300; y > 250; y -= 4) slow.to(150, y, 40);
  assert.equal(tick().sail, 0);
  slow.up();
  c.riding = () => true;
  const r = finger(150, 300);
  r.to(150, 260, 40);
  const i = tick();
  assert.equal(i.flags & FLAG.breakOff, FLAG.breakOff);
  assert.equal(i.sail, 0);
  assertValid(all);
});

test('aimed fitting: tap auto-aims, drag aims by hand, drag back cancels', () => {
  const { finger, tick, btn, all } = rig();
  const b = btn('aimed');
  finger(b.x + 3, b.y - 2).up();
  let i = tick();
  assert.equal(i.flags, FLAG.useAimed);
  assert.equal(i.aim, -1);
  const d = finger(b.x, b.y);
  d.to(b.x - 150, b.y - 140);
  d.up(b.x - 200, b.y - 180);
  i = tick();
  assert.equal(i.flags, FLAG.useAimed);
  assert.equal(i.aim, CELL);
  const x = finger(b.x, b.y);
  x.to(b.x - 150, b.y - 150);
  x.up(b.x + 2, b.y + 2);
  assert.equal(tick().flags, 0, 'cancelled');
  assertValid(all);
});

test('gull: tap calls it, drag onto the sea dives; consumables; head home held; chart opens', () => {
  const { c, finger, tick, btn, wait, all } = rig();
  const g = btn('gull');
  finger(g.x, g.y).up();
  assert.equal(tick().flags, FLAG.callGull);
  const d = finger(g.x, g.y);
  d.to(g.x - 120, g.y - 200);
  d.up(g.x - 160, g.y - 220);
  const i = tick();
  assert.equal(i.flags, FLAG.dive);
  assert.equal(i.aim, CELL);
  for (const [k, slot] of [['c0', 0], ['c1', 1], ['c2', 2]] as const) {
    const b = btn(k);
    finger(b.x + b.hit * 0.8, b.y).up(b.x + b.hit * 0.8, b.y); // forgiving: the edge of the hit area
    assert.equal(tick().consumable, slot);
  }
  const h = btn('home');
  const hold = finger(h.x, h.y);
  assert.equal(tick().flags & FLAG.headHome, 0, 'not yet armed');
  wait(PRESS.homeArm + 10);
  assert.equal(tick().flags & FLAG.headHome, FLAG.headHome);
  assert.equal(tick().flags & FLAG.headHome, FLAG.headHome, 'held');
  hold.up();
  assert.equal(tick().flags & FLAG.headHome, 0);
  let opened = 0;
  c.onChart = () => { opened++; };
  const ch = btn('chart');
  finger(ch.x, ch.y).up();
  assert.equal(opened, 1);
  assertValid(all);
});

test('swipe up on open sea breaks off; two fingers are the camera\'s pinch and never steer', () => {
  const { finger, tick, all } = rig();
  const s = finger(560, 300);
  const fwd = s.to(562, 220, 60);
  assert.equal(fwd.length, 1, 'open-sea touches reach the camera');
  assert.equal(tick().flags, FLAG.breakOff);
  s.up();
  const a = finger(200, 250);
  const twin = rig(); void twin;
  // a second finger 60 ms after the stick's: a pinch, both handed to the camera
  const out = (() => { const b2 = finger(300, 260); return b2; })();
  void out;
  assert.equal(tick().steer, 0);
  const m = a.to(150, 250);
  assert.equal(m.length, 1, 'the stick finger now belongs to the camera');
  assert.equal(tick().steer, 0, 'pinching never steers');
  assert.equal(tick().flags, 0, 'nor breaks off');
  assertValid(all);
});

test('stick held while the other hand pinches later: steering carries on', () => {
  const { finger, tick, wait, all } = rig();
  const st = finger(200, 300);
  st.to(250, 300);
  wait(400);
  const p1 = finger(600, 200), p2 = finger(640, 150);
  assert.equal(p1.to(580, 190).length, 1);
  assert.equal(p2.to(740, 230).length, 1);
  assert.ok(tick().steer > 0);
  assert.equal(tick().flags, 0, 'a pinch is no swipe');
  assertValid(all);
});

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}
const box = (d: { x: number; y: number; r: number }) => ({ x: d.x - d.r, y: d.y - d.r, width: 2 * d.r, height: 2 * d.r });

function displays(L: HudLayout) {
  const f = L.fittings, first = box(f[0]), last = box(f[f.length - 1]);
  return {
    hull: { x: L.hull.x, y: L.hull.y, width: L.hull.width, height: L.share.y + L.share.height - L.hull.y },
    sternGlass: box(L.sternGlass), top: L.top, chart: L.chart, compass: box(L.compass), sail: L.sail, purse: L.purse,
    fittings: { x: first.x, y: first.y, width: last.x + last.width - first.x, height: first.height },
  };
}

for (const [name, view] of Object.entries(PROFILES)) {
  test(`layout fits the safe area on ${name}: no overlaps, hit areas ≥ 44 pt, the centre clear`, () => {
    const L = hudLayout(view), s = L.safe, eps = 0.5;
    const within = (r: { x: number; y: number; width: number; height: number }, what: string) =>
      assert.ok(r.x >= s.x - eps && r.y >= s.y - eps && r.x + r.width <= s.x + s.width + eps && r.y + r.height <= s.y + s.height + eps, `${what} inside the safe area`);
    const D = displays(L);
    for (const [k, r] of Object.entries(D)) within(r, k);
    const discs = L.buttons.filter((b) => b.kind !== 'chart');
    for (const b of L.buttons) {
      assert.ok(b.hit >= MIN_HIT, `${b.kind} hit radius ${b.hit}`);
      if (b.kind !== 'chart') within(box(b), b.kind);
    }
    for (let i = 0; i < discs.length; i++) for (let j = i + 1; j < discs.length; j++) {
      const a = discs[i], b = discs[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= a.hit + b.hit - eps, `${a.kind}/${b.kind} hit areas apart`);
    }
    const names = Object.keys(D) as (keyof typeof D)[];
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) assert.ok(!overlaps(D[names[i]], D[names[j]]), `${names[i]}/${names[j]}`);
      if (names[i] === 'chart') continue;
      for (const b of discs) assert.ok(!overlaps(D[names[i]], box({ x: b.x, y: b.y, r: b.hit })), `${names[i]} clear of ${b.kind}'s hit area`);
    }
    const centre = { x: s.x + s.width * 0.3, y: s.y + s.height * 0.3, width: s.width * 0.4, height: s.height * 0.4 };
    for (const [k, r] of Object.entries(D)) assert.ok(!overlaps(r, centre), `${k} out of the frame's centre`);
    for (const b of discs) assert.ok(!overlaps(box(b), centre), `${b.kind} out of the frame's centre`);
    assert.ok(L.stick.width >= s.width / 2 - eps, 'the stick may land anywhere on the left half');
  });
}

test('HUD model follows the match', () => {
  const { sea, state } = scripted();
  const hud = new HudState(), ship = state.ships[0], form = FORMS[ship.form];
  let m = hud.update(sea, state, 0);
  assert.ok(m.hull > 0 && m.hull <= 1);
  assert.equal(m.afloat, state.ships.filter((s) => s.phase !== 3).length);
  assert.ok(m.rank >= 1 && m.rank <= m.afloat);
  ship.hull = form.hull / 2;
  ship.purse = 123;
  ship.bank = 456;
  ship.ward = 4;
  ship.reload[0] = 2;
  ship.consumables[1].kind = CONSUMABLE.ward;
  ship.consumables[1].count = 2;
  ship.gull.spied = 1 << 1;
  m = hud.update(sea, state, 0);
  assert.ok(Math.abs(m.hull - 0.5) < 1e-9);
  assert.equal(m.purse, 123);
  assert.equal(m.bank, 456);
  assert.equal(m.ward, true);
  assert.equal(m.batteries[0].reload, 1);
  assert.deepEqual(m.consumables[1], { kind: CONSUMABLE.ward, count: 2 });
  assert.equal(m.threats.length, 1);
  assert.equal(m.threats[0].ship, 1);
  assert.ok(Math.abs(m.threats[0].bearing) <= Math.PI && m.threats[0].near >= 0 && m.threats[0].near <= 1);
  ship.reload[0] = 1;
  assert.equal(hud.update(sea, state, 0).batteries[0].reload, 0.5);
  ship.reload[0] = 0;
  assert.equal(hud.update(sea, state, 0).batteries[0].reload, 0);
  assert.ok(m.gull.price > 0);
  assert.ok(Number.isFinite(m.heading) && Number.isFinite(m.wind));
});

test('haptics: patterns, rests, events for the player only, the limiter', () => {
  let now = 0;
  const got: [number, Pulse][] = [];
  const h = new Haptics({ pulse: (p) => got.push([now, p]) }, () => now);
  assert.equal(h.play('fire'), true);
  assert.equal(h.play('fire'), false, 'resting');
  assert.deepEqual(got, [[0, 'medium']]);
  h.events([{ kind: EVENT.loop, ship: 1, by: -1, amount: 9000 }, { kind: EVENT.hit, ship: 2, by: 0, amount: 5 }], 0);
  now = 1000; h.flush();
  assert.equal(got.length, 1, 'rivals\' moments are not ours');
  h.events([{ kind: EVENT.loop, ship: 0, by: -1, amount: 9000 }], 0);
  for (let t = 0; t < 40; t++) { now += 20; h.flush(); }
  const loop = got.slice(1);
  assert.ok(loop.length >= 4 && loop[loop.length - 1][1] === 'success', `a big loop swells: ${loop.map((g) => g[1])}`);
  got.length = 0;
  now = 5000;
  for (const k of ['hit', 'ram', 'chest', 'bank', 'trail', 'storm', 'home', 'sink', 'sail', 'tap'] as const) h.play(k);
  for (let t = 0; t < 100; t++) { now += 10; h.flush(); }
  for (let i = 1; i < got.length; i++) assert.ok(got[i][0] - got[i - 1][0] >= LIMIT.gap, 'a gap between pulses');
  for (const [t] of got) assert.ok(got.filter(([u]) => u > t - 1000 && u <= t).length <= LIMIT.perSecond);
  assert.ok(got.some(([, p]) => p === 'error'), 'sinking always gets through');
  got.length = 0;
  now = 20000;
  h.watch({ gullFlight: FLIGHT.back, inHome: false, stormEdge: false });
  h.watch({ gullFlight: FLIGHT.mast, inHome: true, stormEdge: false });
  for (let t = 0; t < 20; t++) { now += 20; h.flush(); }
  assert.ok(got.length >= 2 && got.some(([, p]) => p === 'medium'), `the gull home and home waters: ${got.map((g) => g[1])}`);
  h.enabled = false;
  assert.equal(h.play('ram'), false);
});
