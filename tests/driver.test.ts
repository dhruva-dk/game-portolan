import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEADY, driver } from '../src/sim/driver.ts';
import type { DriverStats } from '../src/sim/setup.ts';
import type { Temper } from '../src/sim/temper.ts';
import { TRICKS } from '../src/sim/tuning.ts';

const all = (n: number): DriverStats => ({
  gunnery: n,
  helm: n,
  nerve: n,
  territory: n,
  stormcraft: n,
  lookout: n,
});
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const ROWS: readonly {
  stat: keyof DriverStats;
  read: (t: Temper) => number;
  one: number;
  twenty: number;
}[] = [
  { stat: 'gunnery', read: (t) => t.react, one: 2.2, twenty: 0.3 },
  { stat: 'gunnery', read: (t) => t.gunnery, one: 0, twenty: 1 },
  { stat: 'helm', read: (t) => t.helm, one: 0, twenty: 1 },
  { stat: 'nerve', read: (t) => t.run, one: 0.6, twenty: 0.15 },
  { stat: 'territory', read: (t) => t.loop, one: 60, twenty: 250 },
  { stat: 'stormcraft', read: (t) => t.setOff, one: 0, twenty: 25 },
  { stat: 'lookout', read: (t) => t.notice, one: 60, twenty: 300 },
];

test('each row of how well a driver does it: its value at 1 and at 20, and in even steps between', () => {
  for (const { stat, read, one, twenty } of ROWS) {
    const at = (n: number) => read(driver({ ...all(10), [stat]: n }));
    assert.ok(close(at(1), one), `${stat} at 1: ${at(1)}`);
    assert.ok(close(at(20), twenty), `${stat} at 20: ${at(20)}`);
    const step = (twenty - one) / 19;
    for (let n = 2; n <= 20; n++)
      assert.ok(
        close(at(n) - at(n - 1), step),
        `${stat} from ${n - 1} to ${n}`
      );
  }
});

test('each row moves only with its own stat', () => {
  for (const { stat, read } of ROWS) {
    const base = read(driver({ ...all(1), [stat]: 10 }));
    assert.ok(close(read(driver({ ...all(20), [stat]: 10 })), base), stat);
  }
});

test("how much a driver wants each thing: today's base weight times 0.25 + 1.5 x / 20", () => {
  const wants = (stats: Partial<DriverStats>) =>
    driver({ ...all(10), ...stats }).wants;
  for (const n of [1, 7, 10, 20]) {
    const factor = (x: number) => 0.25 + (1.5 * x) / 20;
    const nerve = wants({ nerve: n }),
      territory = wants({ territory: n });
    assert.ok(close(nerve.fight, factor(n)), `fight at Nerve ${n}`);
    assert.ok(close(nerve.hunt, factor(n)), `hunt at Nerve ${n}`);
    assert.ok(close(nerve.flee, factor(21 - n)), `flee at Nerve ${n}`);
    assert.ok(close(territory.claim, factor(n)), `claim at Territory ${n}`);
  }
  assert.ok(close(wants({ nerve: 1 }).fight, 0.325));
  assert.ok(close(wants({ nerve: 20 }).fight, 1.75));
  assert.ok(close(wants({ nerve: 1 }).flee, 1.75));
  assert.ok(close(wants({ nerve: 20 }).flee, 0.325));
  for (const n of [1, 20]) {
    const w = driver(all(n)).wants;
    for (const mode of ['heal', 'loot', 'storm', 'roam'] as const)
      assert.equal(w[mode], 1, `${mode} at ${n}`);
  }
  for (const mode of ['fight', 'hunt', 'claim'] as const)
    assert.ok(close(driver(all(10)).wants[mode], 1), `${mode} at 10`);
});

test('each trick is off one below its stat level and on at it, whatever the other stats', () => {
  for (const [name, { stat, needs }] of Object.entries(TRICKS))
    for (const rest of [1, 20]) {
      const of = (n: number) =>
        driver({ ...all(rest), [stat]: n }).tricks[name as keyof typeof TRICKS];
      assert.equal(of(needs - 1), false, `${name} at ${stat} ${needs - 1}`);
      assert.equal(of(needs), true, `${name} at ${stat} ${needs}`);
    }
  assert.deepEqual(Object.values(driver(all(1)).tricks), [
    false,
    false,
    false,
    false,
    false,
    false,
  ]);
  assert.deepEqual(Object.values(driver(all(20)).tricks), [
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(TRICKS).map(([k, v]) => [k, [v.stat, v.needs]])
    ),
    {
      lead: ['gunnery', 8],
      returnFire: ['lookout', 10],
      dodge: ['helm', 12],
      outrun: ['stormcraft', 10],
      loops: ['territory', 8],
      healUnderFire: ['nerve', 12],
    }
  );
});

test('what the tables do not name is one fixed value, the mean of the six old styles, for every driver', () => {
  assert.deepEqual(
    { ...STEADY },
    {
      fight: 3.3 / 6,
      margin: 175 / 6,
      standoff: 1,
      loot: 3.35 / 6,
      mend: 60,
      claim: 3.45 / 6,
      skill: 3.65 / 6,
      aggro: 0.6,
    }
  );
  for (const n of [1, 10, 20]) {
    const t = driver(all(n));
    for (const [k, v] of Object.entries(STEADY))
      assert.equal(t[k as keyof typeof STEADY], v, `${k} at ${n}`);
  }
});
