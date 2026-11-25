import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import { seatHolder, seatStat } from '../src/career/lookup.ts';
import {
  buildCost,
  designGain,
  fitCost,
} from '../src/career/rules/development.ts';
import {
  LINES,
  type CareerState,
  type Levels,
  type Team,
} from '../src/career/state.ts';
import { updateShip, updateTeam } from '../src/career/teams.ts';
import { BUILD, GAIN, REPAINT, UNLOCK } from '../src/career/tuning.ts';
import { paintView } from '../src/career/views/paint.ts';
import { shipView } from '../src/career/views/ship.ts';
import { rehearsed } from '../src/app/rehearse.ts';

const YOURS = 0;
const FRESH = rehearsed('ship', 0);
const MID = rehearsed('views', 14);

const yours = (state: CareerState, change: (team: Team) => Team) =>
  updateTeam(state, YOURS, change);

const levels = (state: CareerState, design: Partial<Levels>, fitted = 5) =>
  yours(state, (t) => ({
    ...t,
    design: { ...t.design, ...design },
    ships: updateShip(
      updateShip(t.ships, 0, (s) => ({
        ...s,
        fitted: {
          ...s.fitted,
          ...Object.fromEntries(Object.keys(design).map((k) => [k, fitted])),
        },
      })),
      1,
      (s) => s
    ),
  }));

const rich = (state: CareerState, balance = 1_000_000) =>
  yours(state, (t) => ({ ...t, balance }));

const thrift = (state: CareerState) =>
  seatStat(state, YOURS, 'mechanic', 'thrift');

test('a new career: seven stops, every level at 5, Build faint with a tick, Uncle on the second ship', () => {
  const view = shipView(FRESH, 'sails');
  assert.deepEqual(
    view.stops.map((s) => s.line),
    LINES
  );
  assert.equal(view.stop, 0);
  assert.equal(view.design, 5);
  assert.deepEqual(view.scale, { least: 0, most: 100 });
  assert.deepEqual(
    view.rows.map((r) => r.sailor.who),
    ['you', 'uncle']
  );
  for (const row of view.rows) {
    assert.equal(row.fitted, 5);
    assert.deepEqual(row.build, {
      fit: null,
      cost: 0,
      gain: 0,
      faint: true,
      why: 'same',
    });
    assert.equal(row.fits, null);
  }
  assert.equal(view.kinds, null);
  assert.equal(view.designer, null);
  assert.deepEqual(view.focus, { on: false, gain: 0, faint: true });
  assert.equal(shipView(FRESH, 'gun').stop, 6);
});

test('Build costs what §1.7.4 says and gains design minus fitted; Build is faint for funds when short', () => {
  const state = rich(levels(FRESH, { hull: 40 }));
  const row = shipView(state, 'hull').rows[0];
  assert.equal(row.build.cost, buildCost(40, 5, thrift(state)));
  assert.equal(row.build.cost, Math.ceil(30 * 35 * (1 + 40 / 25)));
  assert.equal(row.build.gain, 35);
  assert.equal(row.build.faint, false);
  assert.equal(row.build.why, null);
  const short = yours(state, (t) => ({ ...t, balance: row.build.cost - 1 }));
  const faint = shipView(short, 'hull').rows[0].build;
  assert.equal(faint.faint, true);
  assert.equal(faint.why, 'funds');
  assert.equal(faint.cost, row.build.cost);
  const exact = yours(state, (t) => ({ ...t, balance: row.build.cost }));
  assert.equal(shipView(exact, 'hull').rows[0].build.faint, false);
});

test('at the cap of 100 a level shows 100, and the second ship builds up to it on its own', () => {
  const capped = rich(levels(FRESH, { keel: 100 }, 100));
  const view = shipView(capped, 'keel');
  assert.equal(view.design, 100);
  assert.equal(view.rows[0].fitted, 100);
  assert.equal(view.rows[0].build.why, 'same');
  assert.equal(view.rows[1].fitted, 5);
  assert.equal(view.rows[1].build.gain, 95);
  assert.equal(view.rows[1].build.faint, false);
  const built = apply(capped, {
    type: 'Build',
    team: YOURS,
    slot: 1,
    line: 'keel',
  });
  assert.ok(built.ok);
  if (built.ok) {
    const after = shipView(built.state, 'keel');
    assert.equal(after.rows[1].fitted, 100);
    assert.equal(after.rows[1].build.why, 'same');
  }
});

test('a fractional gap still builds for at least one level, and levels show rounded', () => {
  const state = rich(
    yours(FRESH, (t) => ({ ...t, design: { ...t.design, rudder: 5.4 } }))
  );
  const row = shipView(state, 'rudder').rows[0];
  assert.equal(shipView(state, 'rudder').design, 5);
  assert.equal(row.build.gain, 1);
  assert.equal(row.build.faint, false);
});

test('Focus: the gain at the focused rate to one decimal, pressed when this line is the focus, faint with no designer', () => {
  assert.ok(seatHolder(MID, YOURS, 'designer'));
  const line = 'rigging';
  const skill = seatStat(MID, YOURS, 'designer', line) ?? 0;
  const view = shipView(MID, line);
  const gain = designGain(MID.teams[YOURS].design[line], skill, GAIN.focused);
  assert.equal(view.focus.gain, Math.round(gain * 10) / 10);
  assert.equal(view.focus.faint, false);
  assert.equal(view.designer, seatHolder(MID, YOURS, 'designer')?.portrait);
  const focused = apply(MID, {
    type: 'SetFocus',
    team: YOURS,
    focus: { line },
  });
  assert.ok(focused.ok);
  if (!focused.ok) return;
  const on = shipView(focused.state, line);
  assert.equal(on.focus.on, true);
  assert.deepEqual(
    on.stops.filter((s) => s.focused).map((s) => s.line),
    [line]
  );
  assert.equal(shipView(focused.state, 'hull').focus.on, false);
});

test('the gun stop: kinds with unlock progress, the one being unlocked, and fit rows priced as FitGun, at least 200', () => {
  const unlocking = yours(rich(levels(FRESH, { gun: 30 })), (t) => ({
    ...t,
    unlocked: ['cannon', 'mortar'],
    unlockProgress: { ...t.unlockProgress, scatter: 7.75, harpoon: 19.5 },
    focus: { gun: 'scatter' },
  }));
  const view = shipView(unlocking, 'gun');
  assert.equal(view.unlocking, 'scatter');
  const kinds = Object.fromEntries((view.kinds ?? []).map((k) => [k.kind, k]));
  assert.deepEqual(kinds.cannon, {
    kind: 'cannon',
    unlocked: true,
    progress: UNLOCK.needed,
    needed: 20,
    unlocking: false,
    faint: false,
  });
  assert.equal(kinds.scatter.progress, 7);
  assert.equal(kinds.scatter.unlocking, true);
  assert.equal(kinds.scatter.faint, true);
  assert.equal(kinds.harpoon.progress, 19);
  assert.equal(kinds.mortar.faint, false);
  const row = view.rows[0];
  assert.deepEqual(
    row.fits?.map((f) => [f.kind, f.fitted]),
    [
      ['cannon', true],
      ['mortar', false],
    ]
  );
  const mortar = row.fits?.[1].build;
  assert.equal(mortar?.fit, 'mortar');
  assert.equal(mortar?.cost, fitCost(30, 5, thrift(unlocking)));
  assert.equal(row.fits?.[0].build, row.build);
  const level = yours(unlocking, (t) => ({
    ...t,
    ships: updateShip(t.ships, 0, (s) => ({
      ...s,
      fitted: { ...s.fitted, gun: 30 },
    })),
  }));
  const cheap = shipView(level, 'gun').rows[0].fits?.[1].build;
  assert.equal(cheap?.cost, BUILD.leastFit);
  assert.equal(cheap?.gain, 0);
  assert.equal(cheap?.faint, false);
  const poor = yours(level, (t) => ({ ...t, balance: BUILD.leastFit - 1 }));
  assert.equal(shipView(poor, 'gun').rows[0].fits?.[1].build.why, 'funds');
});

test('the second ship is sailed by your driver once one is seated', () => {
  const driver = seatHolder(MID, YOURS, 'driver');
  const view = shipView(MID, 'sails');
  assert.deepEqual(
    view.rows[1].sailor,
    driver === null
      ? { who: 'uncle' }
      : { who: 'driver', portrait: driver.portrait }
  );
  assert.ok(driver);
});

test('paint: your own livery is chosen and Repaint is faint until something changes', () => {
  const team = MID.teams[YOURS];
  const view = paintView(MID);
  assert.deepEqual(view.livery, team.livery);
  assert.equal(view.emblem, team.emblem);
  assert.equal(view.changed, false);
  assert.equal(view.faint, true);
  assert.equal(view.why, 'same');
  assert.equal(view.cost, REPAINT.cost);
  const emblem = (team.emblem + 1) % 12;
  const moved = paintView(rich(MID), { livery: team.livery, emblem });
  assert.equal(moved.changed, true);
  assert.equal(moved.faint, false);
  assert.equal(moved.emblems.filter((s) => s.chosen).length, 1);
  assert.equal(moved.emblems[emblem].chosen, true);
});

test('paint: liveries worn by other teams are faint along the row that would make them, and picking one is refused as taken', () => {
  const other = MID.teams[5].livery;
  const sameDye = paintView(rich(MID), {
    livery: { dye: other.dye, pattern: (other.pattern + 1) % 3 },
    emblem: 0,
  });
  assert.equal(sameDye.patterns[other.pattern].faint, true);
  const samePattern = paintView(rich(MID), {
    livery: { dye: (other.dye + 1) % 16, pattern: other.pattern },
    emblem: 0,
  });
  assert.equal(samePattern.dyes[other.dye].faint, true);
  const taken = paintView(rich(MID), { livery: other, emblem: 0 });
  assert.equal(taken.faint, true);
  assert.equal(taken.why, 'taken');
  const own = paintView(MID);
  const mine = MID.teams[YOURS].livery;
  assert.equal(own.dyes[mine.dye].faint, false);
  assert.equal(own.patterns[mine.pattern].faint, false);
  const worn = new Set(
    MID.teams.slice(1).map((t) => `${t.livery.dye}/${t.livery.pattern}`)
  );
  own.dyes.forEach((s, dye) =>
    assert.equal(s.faint, worn.has(`${dye}/${mine.pattern}`))
  );
});

test('paint: a short balance makes Repaint faint for funds', () => {
  const team = MID.teams[YOURS];
  const poor = yours(MID, (t) => ({ ...t, balance: REPAINT.cost - 1 }));
  const view = paintView(poor, {
    livery: team.livery,
    emblem: (team.emblem + 1) % 12,
  });
  assert.equal(view.faint, true);
  assert.equal(view.why, 'funds');
});
