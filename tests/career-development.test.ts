import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import type { Command, Reason } from '../src/career/commands.ts';
import { buildPrice, fitPrice } from '../src/career/development/build.ts';
import { matchSetup } from '../src/career/fit.ts';
import { develop } from '../src/career/record/develop.ts';
import { buildCost, fitCost } from '../src/career/rules/build-cost.ts';
import { designGain, gainRate, gainedLevel } from '../src/career/rules/gain.ts';
import {
  advancedUnlock,
  unlockDone,
  unlockGain,
} from '../src/career/rules/unlock.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  LINES,
  MECHANIC_STATS,
  type CareerState,
  type Focus,
  type Levels,
  type Line,
  type Role,
  type Team,
} from '../src/career/state.ts';
import { LEAGUE } from '../src/career/tuning.ts';
import type { GunKind } from '../src/sim/kinds.ts';
import type { MatchResult } from '../src/sim/result.ts';

const YOURS = 0;
const RIVAL = 9;
const SEASON = LEAGUE.racesPerSeason;

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 0, pattern: 0 },
    emblem: 0,
  });

const BASE = careerOf('workshop');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

const close = (a: number, b: number): void =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} is not ${b}`);

function changeTeam(
  state: CareerState,
  index: number,
  change: (team: Team) => Team
): CareerState {
  return {
    ...state,
    teams: state.teams.map((team, i) => (i === index ? change(team) : team)),
  };
}

function freeAgent(state: CareerState, role: Role, skip = 0): number {
  const found = state.people.filter(
    (p) => p.contract === null && p.role === role
  )[skip];
  assert.ok(found);
  return found.id;
}

function hire(
  state: CareerState,
  team: number,
  role: Role,
  stats: readonly number[] | null
): CareerState {
  const id = freeAgent(state, role);
  const seated = changeTeam(state, team, (t) => ({
    ...t,
    seats: { ...t.seats, [role]: id },
  }));
  return {
    ...seated,
    people: seated.people.map((p) =>
      p.id === id
        ? {
            ...p,
            stats: stats === null ? p.stats : [...stats],
            contract: { team, wage: 10, clause: 0, racesLeft: 30 },
          }
        : p
    ),
  };
}

function fire(state: CareerState, team: number, role: Role): CareerState {
  return changeTeam(state, team, (t) => ({
    ...t,
    seats: { ...t.seats, [role]: null },
  }));
}

const allAt = (n: number, count: number): number[] =>
  Array.from({ length: count }, () => n);

const designerAt = (n: number) => allAt(n, LINES.length);

function designerWith(skills: Partial<Levels>): number[] {
  return LINES.map((line) => skills[line] ?? 10);
}

function mechanicWithThrift(thrift: number): number[] {
  return MECHANIC_STATS.map((stat) => (stat === 'thrift' ? thrift : 10));
}

const levels = (n: number): Levels => ({
  sails: n,
  rigging: n,
  rudder: n,
  hull: n,
  keel: n,
  mounts: n,
  gun: n,
});

function shaped(
  state: CareerState,
  team: number,
  shape: Partial<Pick<Team, 'balance' | 'design' | 'unlocked' | 'focus'>> & {
    fitted?: Levels;
  }
): CareerState {
  return changeTeam(state, team, (t) => ({
    ...t,
    balance: shape.balance ?? t.balance,
    design: shape.design ?? t.design,
    unlocked: shape.unlocked ?? t.unlocked,
    focus: shape.focus === undefined ? t.focus : shape.focus,
    ships: [
      { ...t.ships[0], fitted: shape.fitted ?? t.ships[0].fitted },
      { ...t.ships[1], fitted: shape.fitted ?? t.ships[1].fitted },
    ],
  }));
}

const sendRaw = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

function refusedUntouched(
  state: CareerState,
  command: unknown,
  reason: Reason
): void {
  const before = structuredClone(state);
  const applied = sendRaw(deepFreeze(state), command);
  assert.deepEqual(applied, { ok: false, reason }, JSON.stringify(command));
  assert.deepEqual(state, before);
}

function acceptedPlain(state: CareerState, command: Command): CareerState {
  const before = structuredClone(state);
  const next = send(deepFreeze(state), command);
  assert.deepEqual(state, before, 'the input is untouched');
  assert.deepEqual(JSON.parse(JSON.stringify(next)), next);
  return next;
}

test('the gain of §1.7.2 at hand-worked points', () => {
  assert.equal(designGain(0, 20, 1), 5);
  assert.equal(designGain(55, 8, 1), 1);
  assert.equal(designGain(55, 8, 0.5), 0.5);
  assert.equal(designGain(0, 1, 0.5), 0.125);
  assert.equal(designGain(0, 4, 1), 1);
  close(designGain(100, 20, 1), 5 / 11);
  close(designGain(5, 4, 1), 1 - 5 / 110);
  assert.equal(gainedLevel(55, 8, 1), 56);
  assert.equal(gainedLevel(0, 20, 0.5), 2.5);
  assert.equal(gainedLevel(99.9, 20, 1), 100);
  assert.equal(gainedLevel(100, 20, 1), 100);
  assert.equal(gainRate({ line: 'hull' }, 'hull'), 1);
  assert.equal(gainRate({ line: 'hull' }, 'keel'), 0.5);
  assert.equal(gainRate(null, 'hull'), 0.5);
  assert.equal(gainRate({ gun: 'mortar' }, 'gun'), 0.5);
});

test('unlock progress of §1.7.3 at hand-worked points', () => {
  assert.equal(unlockGain(20), 5);
  assert.equal(unlockGain(1), 0.25);
  assert.equal(unlockGain(8), 2);
  assert.equal(advancedUnlock(0, 8), 2);
  assert.equal(advancedUnlock(18, 8), 20);
  assert.equal(advancedUnlock(19, 20), 20);
  assert.equal(unlockDone(19.75), false);
  assert.equal(unlockDone(20), true);
});

test('the build and fit costs of §1.7.4 at hand-worked points', () => {
  assert.equal(buildCost(15, 5, null), 480);
  assert.equal(buildCost(50, 5, null), 4050);
  assert.equal(buildCost(6, 5, null), 38);
  assert.equal(buildCost(25, 5, 10), 960);
  assert.equal(buildCost(30, 20, 5), 594);
  assert.equal(buildCost(100, 5, 1), 13965);
  assert.equal(buildCost(100, 5, 20), 8550);
  assert.equal(buildCost(40, 40, null), 0);
  assert.equal(fitCost(5, 5, null), 200);
  assert.equal(fitCost(6, 5, null), 200);
  assert.equal(fitCost(20, 10, null), 540);
  assert.equal(fitCost(100, 5, 20), 8550);
  assert.ok(buildCost(60, 10, 20) < buildCost(60, 10, 1));
  assert.ok(buildCost(60, 10, 1) < buildCost(60, 10, null));
});

test('SetFocus sets a line, a locked kind or nothing, and only that', () => {
  for (const phase of ['lobby', 'offseason'] as const) {
    const state = { ...BASE, phase };
    const focuses: Focus[] = [
      { line: 'hull' },
      { line: 'gun' },
      { gun: 'mortar' },
    ];
    for (const team of [YOURS, RIVAL]) {
      const locked = state.teams[team].taste.find(
        (kind) => !state.teams[team].unlocked.includes(kind)
      );
      for (const focus of locked === undefined
        ? focuses.slice(0, 2)
        : [...focuses.slice(0, 2), { gun: locked }]) {
        const next = acceptedPlain(state, { type: 'SetFocus', team, focus });
        assert.deepEqual(
          next,
          changeTeam(state, team, (t) => ({ ...t, focus }))
        );
        const cleared = acceptedPlain(next, {
          type: 'SetFocus',
          team,
          focus: null,
        });
        assert.deepEqual(cleared, state);
      }
    }
  }
});

test('SetFocus is refused for the cannon, an unlocked kind, the same focus and a bad field', () => {
  const state = shaped(BASE, YOURS, {
    unlocked: ['cannon', 'harpoon'],
    focus: { line: 'keel' },
  });
  const focus = (f: Focus): Command => ({
    type: 'SetFocus',
    team: YOURS,
    focus: f,
  });
  const raw = (f: unknown) => ({ type: 'SetFocus', team: YOURS, focus: f });
  refusedUntouched(state, focus({ gun: 'cannon' }), 'locked');
  refusedUntouched(state, focus({ gun: 'harpoon' }), 'locked');
  refusedUntouched(state, focus({ line: 'keel' }), 'same');
  refusedUntouched(shaped(state, YOURS, { focus: null }), focus(null), 'same');
  refusedUntouched(
    shaped(state, YOURS, { focus: { gun: 'mortar' } }),
    focus({ gun: 'mortar' }),
    'same'
  );
  refusedUntouched(state, raw({ line: 'deck' }), 'invalid');
  refusedUntouched(state, raw({ gun: 'musket' }), 'invalid');
  refusedUntouched(
    { ...state, phase: 'racing' },
    focus({ line: 'hull' }),
    'phase'
  );
  const switched = acceptedPlain(state, focus({ gun: 'mortar' }));
  assert.deepEqual(switched.teams[YOURS].focus, { gun: 'mortar' });
  const back = acceptedPlain(switched, focus({ line: 'keel' }));
  assert.deepEqual(back, state);
});

test('Build sets the fitted level to the design level and charges the §1.7.4 cost', () => {
  const state = shaped(BASE, YOURS, {
    balance: 5000,
    design: { ...levels(5), hull: 15, keel: 50 },
    fitted: levels(5),
  });
  const built = acceptedPlain(state, {
    type: 'Build',
    team: YOURS,
    slot: 1,
    line: 'hull',
  });
  const team = built.teams[YOURS];
  assert.equal(team.balance, 5000 - 480);
  assert.equal(team.ships[1].fitted.hull, 15);
  assert.deepEqual(team.ships[0], state.teams[YOURS].ships[0]);
  assert.deepEqual(
    built,
    changeTeam(state, YOURS, (t) => ({
      ...t,
      balance: 4520,
      ships: [
        t.ships[0],
        { ...t.ships[1], fitted: { ...t.ships[1].fitted, hull: 15 } },
      ],
    }))
  );
  const keel = acceptedPlain(built, {
    type: 'Build',
    team: YOURS,
    slot: 0,
    line: 'keel',
  });
  assert.equal(keel.teams[YOURS].balance, 4520 - 4050);
  assert.equal(keel.teams[YOURS].ships[0].fitted.keel, 50);
});

test('a mechanic’s Thrift makes building cheaper, and none counts as 0', () => {
  const base = shaped(BASE, YOURS, {
    balance: 5000,
    design: { ...levels(5), keel: 25 },
    fitted: levels(5),
  });
  const thrifty = hire(base, YOURS, 'mechanic', mechanicWithThrift(10));
  assert.equal(buildPrice(base, YOURS, 0, 'keel'), 1200);
  assert.equal(buildPrice(thrifty, YOURS, 0, 'keel'), 960);
  const built = send(thrifty, {
    type: 'Build',
    team: YOURS,
    slot: 0,
    line: 'keel',
  });
  assert.equal(built.teams[YOURS].balance, 5000 - 960);
});

test('Build is refused when nothing would change, when short of funds and for a bad field', () => {
  const state = shaped(BASE, YOURS, {
    balance: 479,
    design: { ...levels(5), hull: 15 },
    fitted: levels(5),
  });
  const build = (slot: number, line: Line): Command => ({
    type: 'Build',
    team: YOURS,
    slot,
    line,
  });
  const raw = (slot: unknown, line: unknown) => ({
    type: 'Build',
    team: YOURS,
    slot,
    line,
  });
  refusedUntouched(state, build(0, 'keel'), 'same');
  refusedUntouched(state, build(0, 'hull'), 'funds');
  refusedUntouched(state, raw(2, 'hull'), 'invalid');
  refusedUntouched(state, raw(0, 'deck'), 'invalid');
  refusedUntouched(state, raw(-1, 'hull'), 'invalid');
  refusedUntouched({ ...state, phase: 'racing' }, build(0, 'hull'), 'phase');
  const exact = shaped(state, YOURS, { balance: 480 });
  const built = acceptedPlain(exact, build(0, 'hull'));
  assert.equal(built.teams[YOURS].balance, 0);
  refusedUntouched(built, build(0, 'hull'), 'same');
  const indebted = shaped(state, YOURS, { balance: -100 });
  refusedUntouched(indebted, build(0, 'hull'), 'funds');
});

test('a rival builds by the same rules', () => {
  const team = BASE.teams[RIVAL];
  const slot = 1;
  const line = LINES.find((l) => team.ships[slot].fitted[l] < team.design[l]);
  assert.ok(line);
  const price = buildPrice(BASE, RIVAL, slot, line);
  assert.equal(
    price,
    buildCost(
      team.design[line],
      team.ships[slot].fitted[line],
      BASE.people.find((p) => p.id === team.seats.mechanic)?.stats[
        MECHANIC_STATS.indexOf('thrift')
      ] ?? null
    )
  );
  const built = acceptedPlain(BASE, { type: 'Build', team: RIVAL, slot, line });
  assert.equal(built.teams[RIVAL].balance, team.balance - price);
  assert.equal(built.teams[RIVAL].ships[slot].fitted[line], team.design[line]);
  const broke = shaped(BASE, RIVAL, { balance: price - 1 });
  refusedUntouched(broke, { type: 'Build', team: RIVAL, slot, line }, 'funds');
});

test('FitGun changes the gun, fits the gun line to the design level and charges at least 200', () => {
  const state = shaped(BASE, YOURS, {
    balance: 1000,
    unlocked: ['cannon', 'scatter', 'mortar'],
    design: { ...levels(5), gun: 20 },
    fitted: { ...levels(5), gun: 10 },
  });
  assert.equal(fitPrice(state, YOURS, 0), 540);
  const fitted = acceptedPlain(state, {
    type: 'FitGun',
    team: YOURS,
    slot: 0,
    kind: 'scatter',
  });
  const ship = fitted.teams[YOURS].ships[0];
  assert.equal(ship.gun, 'scatter');
  assert.equal(ship.fitted.gun, 20);
  assert.deepEqual(ship.fitted, { ...levels(5), gun: 20 });
  assert.equal(fitted.teams[YOURS].balance, 460);
  assert.deepEqual(fitted.teams[YOURS].ships[1], state.teams[YOURS].ships[1]);
  assert.equal(fitPrice(fitted, YOURS, 0), 200);
  const again = acceptedPlain(fitted, {
    type: 'FitGun',
    team: YOURS,
    slot: 0,
    kind: 'mortar',
  });
  assert.equal(again.teams[YOURS].balance, 260);
  assert.equal(again.teams[YOURS].ships[0].gun, 'mortar');
});

test('FitGun is refused for a locked kind, the fitted kind, short funds and a bad field', () => {
  const state = shaped(BASE, YOURS, {
    balance: 199,
    unlocked: ['cannon', 'scatter'],
  });
  const fit = (slot: number, kind: GunKind): Command => ({
    type: 'FitGun',
    team: YOURS,
    slot,
    kind,
  });
  const raw = (slot: unknown, kind: unknown) => ({
    type: 'FitGun',
    team: YOURS,
    slot,
    kind,
  });
  refusedUntouched(state, fit(0, 'mortar'), 'locked');
  refusedUntouched(state, fit(1, 'cannon'), 'same');
  refusedUntouched(state, fit(1, 'scatter'), 'funds');
  refusedUntouched(state, raw(2, 'scatter'), 'invalid');
  refusedUntouched(state, raw(0, 'musket'), 'invalid');
  refusedUntouched({ ...state, phase: 'racing' }, fit(0, 'scatter'), 'phase');
  const exact = shaped(state, YOURS, { balance: 200 });
  assert.equal(acceptedPlain(exact, fit(1, 'scatter')).teams[YOURS].balance, 0);
});

function placed(state: CareerState): MatchResult {
  return standInResult(matchSetup(state, { hands: 'player' }));
}

function race(state: CareerState): CareerState {
  const started = send(state, { type: 'StartRace', team: YOURS });
  return send(started, {
    type: 'RecordRace',
    team: YOURS,
    result: placed(started),
  });
}

function sailOn(state: CareerState): CareerState {
  const raced = race(state);
  return raced.phase === 'lobby'
    ? send(raced, { type: 'MarkRead', team: YOURS })
    : raced;
}

test('step 4 gains every line at the focused or unfocused rate, only with a designer', () => {
  const skills = designerWith({ sails: 20, hull: 8, gun: 4 });
  const start = shaped(hire(BASE, YOURS, 'designer', skills), YOURS, {
    design: { ...levels(5), hull: 55 },
    focus: { line: 'hull' },
  });
  const developed = develop(start);
  const design = developed.teams[YOURS].design;
  assert.equal(design.hull, 56);
  close(design.sails, 5 + 0.5 * 5 * (1 - 5 / 110));
  close(design.gun, 5 + 0.5 * 1 * (1 - 5 / 110));
  close(design.keel, 5 + 0.5 * 2.5 * (1 - 5 / 110));
  for (const line of LINES)
    assert.equal(
      design[line],
      gainedLevel(
        start.teams[YOURS].design[line],
        skills[LINES.indexOf(line)],
        gainRate({ line: 'hull' }, line)
      )
    );
  assert.deepEqual(developed.teams[YOURS].ships, start.teams[YOURS].ships);
  const alone = fire(start, YOURS, 'designer');
  assert.deepEqual(develop(alone).teams[YOURS], alone.teams[YOURS]);
  for (let team = 1; team < LEAGUE.teams; team++) {
    const before = start.teams[team];
    const after = developed.teams[team];
    const id = before.seats.designer;
    const designer = start.people.find((p) => p.id === id);
    assert.ok(designer);
    for (const line of LINES)
      assert.equal(
        after.design[line],
        gainedLevel(
          before.design[line],
          designer.stats[LINES.indexOf(line)],
          gainRate(before.focus, line)
        ),
        `team ${team} ${line}`
      );
  }
});

test('step 4 caps design levels at 100', () => {
  const start = shaped(hire(BASE, YOURS, 'designer', designerAt(20)), YOURS, {
    design: { ...levels(99.9), hull: 100 },
    focus: { line: 'sails' },
  });
  assert.deepEqual(develop(start).teams[YOURS].design, levels(100));
});

test('a gun focus raises its progress by Gun / 4, gives no line the focused rate, and unlocks at 20', () => {
  const skills = designerWith({ gun: 8 });
  const start = shaped(hire(BASE, YOURS, 'designer', skills), YOURS, {
    design: levels(5),
    focus: { gun: 'harpoon' },
  });
  const once = develop(start).teams[YOURS];
  assert.equal(once.unlockProgress.harpoon, 2);
  assert.equal(once.unlockProgress.mortar, 0);
  for (const line of LINES)
    assert.equal(
      once.design[line],
      gainedLevel(5, skills[LINES.indexOf(line)], 0.5)
    );
  assert.deepEqual(once.focus, { gun: 'harpoon' });
  assert.deepEqual(once.unlocked, ['cannon']);
  let state = start;
  for (let n = 1; n <= 10; n++) {
    state = develop(state);
    const team = state.teams[YOURS];
    if (n < 10) {
      assert.equal(team.unlockProgress.harpoon, 2 * n);
      assert.deepEqual(team.focus, { gun: 'harpoon' });
      assert.ok(!team.unlocked.includes('harpoon'));
    } else {
      assert.equal(team.unlockProgress.harpoon, 20);
      assert.equal(team.focus, null);
      assert.ok(team.unlocked.includes('harpoon'));
      assert.ok(team.unlocked.includes('cannon'));
      assert.equal(team.unlocked.length, 2);
    }
  }
  const further = develop(state).teams[YOURS];
  assert.equal(further.unlockProgress.harpoon, 20);
  assert.equal(further.unlocked.length, 2);
  const unmanned = fire(start, YOURS, 'designer');
  assert.deepEqual(develop(unmanned).teams[YOURS], unmanned.teams[YOURS]);
});

test('an unlocked kind can then be fitted and no longer focused', () => {
  let state = shaped(hire(BASE, YOURS, 'designer', designerAt(20)), YOURS, {
    balance: 10000,
    focus: { gun: 'repeater' },
  });
  for (let n = 0; n < 4; n++) state = develop(state);
  assert.ok(state.teams[YOURS].unlocked.includes('repeater'));
  refusedUntouched(
    state,
    { type: 'SetFocus', team: YOURS, focus: { gun: 'repeater' } },
    'locked'
  );
  const fitted = acceptedPlain(state, {
    type: 'FitGun',
    team: YOURS,
    slot: 1,
    kind: 'repeater',
  });
  assert.equal(fitted.teams[YOURS].ships[1].gun, 'repeater');
});

function season(state: CareerState): CareerState[] {
  const states = [state];
  let current = state;
  for (let n = 0; n < SEASON; n++) {
    current = sailOn(current);
    states.push(current);
  }
  return states;
}

const raced = (state: CareerState): Levels =>
  state.lastOffseason?.design.before ?? state.teams[YOURS].design;

const gainOver = (states: readonly CareerState[], line: Line): number =>
  raced(states[states.length - 1])[line] - raced(states[0])[line];

function withDesigner(stats: readonly number[], focus: Focus): CareerState {
  return send(hire(BASE, YOURS, 'designer', stats), {
    type: 'SetFocus',
    team: YOURS,
    focus,
  });
}

test('over a season a better designer gains faster on every line', () => {
  const good = season(withDesigner(designerAt(18), { line: 'rudder' }));
  const poor = season(withDesigner(designerAt(3), { line: 'rudder' }));
  const none = season(
    send(BASE, { type: 'SetFocus', team: YOURS, focus: { line: 'rudder' } })
  );
  for (const line of LINES) {
    assert.ok(gainOver(good, line) > gainOver(poor, line), line);
    assert.ok(gainOver(poor, line) > 0, line);
    assert.equal(gainOver(none, line), 0, line);
  }
  for (const states of [good, poor])
    for (let n = 1; n < states.length; n++)
      for (const line of LINES)
        assert.ok(raced(states[n])[line] >= raced(states[n - 1])[line]);
});

test('over a season the focus changes which line gains most', () => {
  const sails = season(withDesigner(designerAt(12), { line: 'sails' }));
  const hull = season(withDesigner(designerAt(12), { line: 'hull' }));
  assert.ok(gainOver(sails, 'sails') > gainOver(hull, 'sails'));
  assert.ok(gainOver(hull, 'hull') > gainOver(sails, 'hull'));
  assert.ok(gainOver(sails, 'sails') > gainOver(sails, 'hull'));
  assert.ok(gainOver(hull, 'hull') > gainOver(hull, 'sails'));
  close(gainOver(sails, 'keel'), gainOver(hull, 'keel'));
  const gun = season(withDesigner(designerAt(12), { gun: 'mortar' }));
  assert.ok(gainOver(gun, 'sails') < gainOver(sails, 'sails'));
  close(gainOver(gun, 'sails'), gainOver(gun, 'hull'));
  const unlockedAt = gun.findIndex((s) =>
    s.teams[YOURS].unlocked.includes('mortar')
  );
  assert.equal(unlockedAt, 7);
  assert.equal(gun[unlockedAt].teams[YOURS].focus, null);
  assert.ok(
    gainOver(gun.slice(unlockedAt), 'sails') <
      gainOver(sails.slice(unlockedAt), 'sails')
  );
});

test('the workshop strip shows the real before and after of the race', () => {
  const states = season(withDesigner(designerAt(12), { line: 'mounts' }));
  for (let n = 1; n < states.length; n++) {
    const report = states[n].lastRace;
    assert.ok(report);
    assert.deepEqual(report.workshop, {
      focus: { line: 'mounts' },
      before: raced(states[n - 1]).mounts,
      after: raced(states[n]).mounts,
    });
    assert.ok(report.workshop.after > report.workshop.before);
  }
  const gun = season(withDesigner(designerAt(8), { gun: 'scatter' }));
  const progress = gun.slice(1).map((s) => s.lastRace?.workshop);
  progress.forEach((strip, n) =>
    assert.deepEqual(strip, {
      focus: { gun: 'scatter' },
      before: 2 * n,
      after: 2 * (n + 1),
    })
  );
  const none = season(BASE);
  for (const state of none.slice(1))
    assert.equal(state.lastRace?.workshop, null);
});

test('rivals gain from their own designers in a real season', () => {
  const states = season(BASE);
  for (let team = 1; team < LEAGUE.teams; team++) {
    const designer = BASE.teams[team].seats.designer;
    for (const line of LINES)
      if (designer !== null)
        assert.ok(
          states[SEASON - 1].teams[team].design[line] >
            BASE.teams[team].design[line],
          `team ${team} ${line}`
        );
  }
});

test('development is deterministic and plain data throughout', () => {
  const start = withDesigner(designerAt(15), { gun: 'repeater' });
  const first = season(start);
  const second = season(structuredClone(start));
  assert.deepEqual(first, second);
  for (const state of first)
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('commands from every team are judged by that team’s own workshop', () => {
  const kinds: GunKind[] = ['scatter', 'repeater', 'harpoon', 'mortar'];
  for (let team = 1; team < LEAGUE.teams; team++) {
    const t = BASE.teams[team];
    for (const kind of kinds) {
      const applied = apply(BASE, {
        type: 'SetFocus',
        team,
        focus: { gun: kind },
      });
      assert.equal(
        applied.ok,
        !t.unlocked.includes(kind),
        `team ${team} ${kind}`
      );
    }
  }
});
