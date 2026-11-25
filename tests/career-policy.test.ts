import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  newCareer,
  runPolicies,
  runPolicy,
  type Applied,
} from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { buildPrice, fitPrice } from '../src/career/development/build.ts';
import { draw } from '../src/career/draw.ts';
import { matchSetup } from '../src/career/fit.ts';
import { costToSign, clauseOwed } from '../src/career/hiring/cost.ts';
import { willingness } from '../src/career/hiring/talks.ts';
import { knownStats, trueStats } from '../src/career/knowledge/people.ts';
import { personOf } from '../src/career/lookup.ts';
import {
  holderStars,
  policy,
  wantedFocus,
  weakSeat,
} from '../src/career/policy/policy.ts';
import { meansOf, minimumTerms } from '../src/career/policy/means.ts';
import { runTeam, worstFirst, type Send } from '../src/career/policy/run.ts';
import { moneyTotal, teamMoney, wageBill } from '../src/career/record/pay.ts';
import { scoreRace } from '../src/career/record/race.ts';
import { ask, standardClause } from '../src/career/rules/hiring.ts';
import {
  focusValue,
  focusWeight,
  wantsGun,
} from '../src/career/rules/development.ts';
import { affordablePurchase, seasonPrize } from '../src/career/rules/money.ts';
import { reputations, standings } from '../src/career/rules/standing.ts';
import {
  TEMPERAMENTS,
  ownerTemperament,
  stars,
  temperamentOf,
  type Temperament,
} from '../src/career/rules/person.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  DRIVER_STATS,
  LINES,
  ROLES,
  type CareerState,
  type Line,
  type Person,
  type Role,
  type Sponsor,
  type Team,
} from '../src/career/state.ts';
import { LEAGUE, REPOSSESSION, SCOUTING } from '../src/career/tuning.ts';

const YOURS = 0;
const QUIET = 20;
const SEASON = LEAGUE.racesPerSeason;
const RICH = 1000000;
const NERVE = DRIVER_STATS.indexOf('nerve');

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 3, pattern: 1 },
    emblem: 2,
  });

const BASE = careerOf('policy');

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  assert.deepEqual(applied.refused, []);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

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

function changePerson(
  state: CareerState,
  id: number,
  change: (person: Person) => Person
): CareerState {
  return {
    ...state,
    people: state.people.map((p) => (p.id === id ? change(p) : p)),
  };
}

const evenStats = (state: CareerState, id: number, value: number) =>
  changePerson(state, id, (p) => ({ ...p, stats: p.stats.map(() => value) }));

const funded = (state: CareerState, team: number, balance = RICH) =>
  changeTeam(state, team, (t) => ({ ...t, balance }));

function person(state: CareerState, id: number | null): Person {
  const found = id === null ? null : personOf(state, id);
  if (found === null) throw new Error(`no person ${String(id)}`);
  return found;
}

function holder(state: CareerState, team: number, role: Role): number {
  const id = state.teams[team].seats[role];
  if (id === null) throw new Error('an empty seat');
  return id;
}

function freeAgents(state: CareerState, role: Role): Person[] {
  return state.people.filter((p) => p.contract === null && p.role === role);
}

function withNerve(state: CareerState, team: number, nerve: number) {
  return changeTeam(state, team, (t) =>
    t.owner === null
      ? t
      : {
          ...t,
          owner: {
            ...t.owner,
            stats: t.owner.stats.map((s, i) => (i === NERVE ? nerve : s)),
          },
        }
  );
}

function quiet(start: CareerState, team: number): CareerState {
  const settled = changeTeam(start, team, (t) => {
    const kind = t.taste.find((k) => t.unlocked.includes(k)) ?? 'cannon';
    const ship = { fitted: { ...t.design }, gun: kind };
    return {
      ...t,
      ships: [ship, { ...ship, fitted: { ...t.design } }],
      deals: { driver: null, designer: null, mechanic: null },
      approached: { driver: null, designer: null, mechanic: null },
      talks: [],
      offers: [],
    };
  });
  return changeTeam(settled, team, (t) => ({
    ...t,
    focus: wantedFocus(settled, team),
    scoutSeat: weakSeat(settled, team),
  }));
}

const QUIET_BASE = quiet(funded(BASE, QUIET), QUIET);

const OTHER_SEATS: readonly Role[] = ['designer', 'mechanic'];

function scoreAt(state: CareerState, team: number, who: Person) {
  return willingness(state, team, who);
}

function lowestSigningWage(
  state: CareerState,
  team: number,
  who: Person
): number {
  const score = scoreAt(state, team, who);
  const rest = {
    seasons: who.preferred,
    fee: 0,
    clause: standardClause(ask(who)),
  };
  for (let wage = 10; wage <= 30000; wage += 10)
    if (score({ ...rest, wage }) >= 1) return wage;
  throw new Error('nobody signs at any wage');
}

function minimumOffer(state: CareerState, team: number, id: number): Command {
  const who = person(state, id);
  return {
    type: 'Offer',
    team,
    person: id,
    terms: {
      wage: lowestSigningWage(state, team, who),
      seasons: who.preferred,
      fee: 0,
      clause: standardClause(ask(who)),
    },
  };
}

test('the temperament bands of §1.5.6: cautious 1 to 8, sensible 9 to 11, bold 12 to 20', () => {
  assert.equal(temperamentOf(1), 'cautious');
  assert.equal(temperamentOf(8), 'cautious');
  assert.equal(temperamentOf(9), 'sensible');
  assert.equal(temperamentOf(11), 'sensible');
  assert.equal(temperamentOf(12), 'bold');
  assert.equal(temperamentOf(20), 'bold');
  assert.equal(ownerTemperament(null), 'sensible');
  const owner = BASE.teams[QUIET].owner;
  assert.ok(owner);
  assert.equal(
    ownerTemperament(owner),
    temperamentOf(owner.stats[DRIVER_STATS.indexOf('nerve')])
  );
  assert.deepEqual(TEMPERAMENTS, ['cautious', 'sensible', 'bold']);
});

test('B, S and R for each temperament are the table of §1.10.2', () => {
  assert.deepEqual(meansOf('cautious'), { build: 12, share: 0.25, reserve: 6 });
  assert.deepEqual(meansOf('sensible'), { build: 8, share: 0.4, reserve: 4 });
  assert.deepEqual(meansOf('bold'), { build: 5, share: 0.6, reserve: 3 });
});

test('an affordable purchase is at most S of the balance and leaves R races of wages', () => {
  assert.equal(affordablePurchase(10000, 4000, 1000, 0.4, 4), true);
  assert.equal(affordablePurchase(10000, 4010, 1000, 0.4, 4), false);
  assert.equal(affordablePurchase(10000, 3000, 1750, 0.4, 4), true);
  assert.equal(affordablePurchase(10000, 3000, 1760, 0.4, 4), false);
  assert.equal(affordablePurchase(0, 0, 0, 0.6, 3), true);
  assert.equal(affordablePurchase(-500, 200, 0, 0.6, 3), false);
});

test('the focus value is skill × (1 − design / 110) × w, w 1.5 below the mean', () => {
  assert.equal(focusValue(12, 55, 1.5), 9);
  assert.equal(focusValue(20, 0, 1), 20);
  assert.equal(focusValue(1, 110, 1.5), 0);
  assert.equal(focusWeight(40, 50), 1.5);
  assert.equal(focusWeight(50, 50), 1);
  assert.equal(focusWeight(60, 50), 1);
  assert.equal(wantsGun(50, 2), true);
  assert.equal(wantsGun(49.9, 2), false);
  assert.equal(wantsGun(100, 4), true);
});

test('minimum terms: preferred seasons, no fee, the standard clause and the lowest signing wage', () => {
  for (const team of [YOURS, 3, QUIET, 39])
    for (const who of BASE.people
      .slice(0, 300)
      .filter((_, i) => i % 23 === 0)) {
      const terms = minimumTerms(BASE, team, who);
      assert.ok(terms);
      assert.equal(terms.seasons, who.preferred);
      assert.equal(terms.fee, 0);
      assert.equal(terms.clause, standardClause(ask(who)));
      assert.equal(terms.wage, lowestSigningWage(BASE, team, who));
      const score = scoreAt(BASE, team, who);
      assert.ok(score(terms) >= 1);
      if (terms.wage > 10)
        assert.ok(score({ ...terms, wage: terms.wage - 10 }) < 1);
    }
});

test('holder stars are −1 for an empty seat; the weak seat breaks ties driver, designer, mechanic', () => {
  let state = BASE;
  for (const role of ROLES)
    state = evenStats(state, holder(BASE, QUIET, role), 10);
  assert.equal(holderStars(state, QUIET, 'driver'), 2.5);
  assert.equal(weakSeat(state, QUIET), 'driver');
  state = evenStats(state, holder(BASE, QUIET, 'designer'), 9);
  assert.equal(holderStars(state, QUIET, 'designer'), 2);
  assert.equal(weakSeat(state, QUIET), 'designer');
  state = changeTeam(state, QUIET, (t) => ({
    ...t,
    seats: { ...t.seats, mechanic: null },
  }));
  assert.equal(holderStars(state, QUIET, 'mechanic'), -1);
  assert.equal(weakSeat(state, QUIET), 'mechanic');
});

test('a settled team wants nothing in any temperament', () => {
  for (const temperament of TEMPERAMENTS)
    assert.equal(policy(QUIET_BASE, QUIET, temperament), null, temperament);
  assert.equal(policy(QUIET_BASE, QUIET), null);
});

test('step 1, marker: the scouting marker moves to the weak seat', () => {
  const mechanic = holder(BASE, QUIET, 'mechanic');
  let state = QUIET_BASE;
  for (const role of ROLES)
    state = evenStats(state, holder(BASE, QUIET, role), 12);
  state = evenStats(state, mechanic, 6);
  state = changeTeam(state, QUIET, (t) => ({ ...t, scoutSeat: 'designer' }));
  assert.deepEqual(policy(state, QUIET), {
    type: 'SetScoutSeat',
    team: QUIET,
    role: 'mechanic',
  });
  const moved = send(state, {
    type: 'SetScoutSeat',
    team: QUIET,
    role: 'mechanic',
  });
  assert.equal(policy(moved, QUIET), null);
});

function offseasonWith(
  racesLeft: number,
  dealt: readonly number[] = []
): { state: CareerState; driver: number } {
  const driver = holder(BASE, QUIET, 'driver');
  let state: CareerState = { ...QUIET_BASE, phase: 'offseason', race: SEASON };
  state = changePerson(state, driver, (p) =>
    p.contract === null ? p : { ...p, contract: { ...p.contract, racesLeft } }
  );
  state = changeTeam(state, QUIET, (t) => ({
    ...t,
    scoutSeat: weakSeat(state, QUIET),
    deals: {
      ...t.deals,
      driver:
        dealt.length === 0 ? null : { candidates: [...dealt], locked: null },
    },
  }));
  return { state, driver };
}

test('step 2, renew: at the stop an expiring employee is offered minimum terms', () => {
  const { state, driver } = offseasonWith(0);
  assert.deepEqual(policy(state, QUIET), minimumOffer(state, QUIET, driver));
  const renewed = send(state, minimumOffer(state, QUIET, driver));
  assert.equal(person(renewed, driver).contract?.team, QUIET);
  assert.equal(
    person(renewed, driver).contract?.racesLeft,
    person(state, driver).preferred * SEASON
  );
  assert.equal(policy(renewed, QUIET), null, 'talks now exist');
});

test('step 2, renew: not in the lobby, not with races left, not once talked to', () => {
  const { state, driver } = offseasonWith(0);
  assert.equal(policy({ ...state, phase: 'lobby', race: 3 }, QUIET), null);
  assert.equal(policy(offseasonWith(1).state, QUIET), null);
  const talked = changeTeam(state, QUIET, (t) => ({
    ...t,
    talks: [{ person: driver, attempts: 1, answer: 'refused', counter: null }],
  }));
  assert.equal(policy(talked, QUIET), null);
});

test('step 2, renew: not when the renewal is unaffordable or a better candidate is', () => {
  const { state, driver } = offseasonWith(0);
  const poor = funded(state, QUIET, 0);
  assert.equal(policy(poor, QUIET), null);
  const own = stars(person(state, driver).stats);
  const better = freeAgents(state, 'driver')[0].id;
  const dealt = evenStats(
    offseasonWith(0, [better]).state,
    better,
    Math.ceil((own + 1) * 4)
  );
  assert.ok(stars(person(dealt, better).stats) > own);
  assert.deepEqual(policy(dealt, QUIET), minimumOffer(dealt, QUIET, better));
});

function dealtDriver(
  state: CareerState,
  team: number,
  candidates: readonly number[],
  locked: number | null = null
): CareerState {
  return changeTeam(state, team, (t) => ({
    ...t,
    deals: { ...t.deals, driver: { candidates: [...candidates], locked } },
  }));
}

test('step 3, sign: the candidate with the most stars, at least half a star better, at minimum terms', () => {
  const [a, b, c] = freeAgents(BASE, 'driver')
    .slice(0, 3)
    .map((p) => p.id)
    .sort((x, y) => y - x);
  let state = evenStats(QUIET_BASE, holder(BASE, QUIET, 'driver'), 10);
  for (const role of OTHER_SEATS)
    state = evenStats(state, holder(BASE, QUIET, role), 16);
  state = changeTeam(state, QUIET, (t) => ({ ...t, scoutSeat: 'driver' }));
  state = evenStats(evenStats(evenStats(state, a, 12), b, 12), c, 11);
  assert.deepEqual(
    [a, b, c].map((id) => stars(person(state, id).stats)),
    [3, 3, 2.5]
  );
  const dealt = dealtDriver(state, QUIET, [a, b, c]);
  const lower = Math.min(a, b);
  assert.deepEqual(policy(dealt, QUIET), minimumOffer(dealt, QUIET, lower));
  assert.equal(policy(dealtDriver(state, QUIET, [c]), QUIET), null);
  assert.equal(policy(dealtDriver(state, QUIET, [a, b], a), QUIET), null);
  const signed = send(dealt, minimumOffer(dealt, QUIET, lower));
  assert.equal(signed.teams[QUIET].seats.driver, lower);
  assert.equal(policy(funded(dealt, QUIET, 0), QUIET), null);
});

function approachCase(): { state: CareerState; team: number } {
  for (let race = 1; race <= SEASON; race++)
    for (let team = 1; team <= 10; team++)
      if (draw(BASE.seed, 'approach', 1, race, team) < 0.1) {
        let state = funded({ ...BASE, race }, team);
        state = evenStats(state, holder(BASE, team, 'driver'), 4);
        for (const role of OTHER_SEATS)
          state = evenStats(state, holder(BASE, team, role), 18);
        state = quiet(state, team);
        assert.equal(state.teams[team].scoutSeat, 'driver');
        return { state, team };
      }
  throw new Error('no approach draw below 0.1 in a season');
}

test('step 4, approach: the best affordable driver of a worse team, on the draw', () => {
  const { state, team } = approachCase();
  assert.ok(reputations(state)[team] <= 10);
  const table = standings(state);
  const own = holderStars(state, team, 'driver');
  const targets = state.people
    .filter(
      (p) =>
        p.role === 'driver' &&
        p.contract !== null &&
        p.contract.team !== team &&
        table[p.contract.team] > table[team] &&
        stars(p.stats) >= own + 1
    )
    .sort((x, y) => stars(y.stats) - stars(x.stats) || x.id - y.id);
  assert.ok(targets.length > 1);
  assert.deepEqual(policy(state, team), {
    type: 'Approach',
    team,
    person: targets[0].id,
  });
  const approached = send(state, {
    type: 'Approach',
    team,
    person: targets[0].id,
  });
  assert.equal(policy(approached, team), null, 'an approach is held');
});

test('step 4, approach: never above reputation 10, off the draw, or with no affordable target', () => {
  const { state, team } = approachCase();
  const otherRace = Array.from({ length: SEASON }, (_, r) => r + 1).find(
    (race) => draw(BASE.seed, 'approach', 1, race, team) >= 0.1
  );
  assert.ok(otherRace !== undefined);
  assert.equal(policy({ ...state, race: otherRace }, team), null);
  const worse = {
    ...state,
    previousStanding: state.previousStanding.map((s, t) =>
      t === team ? 39 : s === 39 ? state.previousStanding[team] : s
    ),
  };
  assert.ok(reputations(worse)[team] > 10);
  assert.equal(policy(worse, team), null);
  const bill = wageBill(state, team);
  assert.equal(
    policy(funded(state, team, SCOUTING.approach + bill), team),
    null
  );
});

test('step 5, focus: the line with the best weighted gain, or nothing without a designer', () => {
  const designer = holder(BASE, QUIET, 'designer');
  let state = evenStats(QUIET_BASE, designer, 10);
  state = changeTeam(state, QUIET, (t) => {
    const design = { ...t.design };
    for (const line of LINES) design[line] = 50;
    design.hull = 30;
    design.gun = 24;
    const ship = { ...t.ships[0], fitted: { ...design } };
    return {
      ...t,
      design,
      unlocked: ['cannon'],
      ships: [ship, { ...ship, fitted: { ...design } }],
      focus: null,
    };
  });
  state = changeTeam(state, QUIET, (t) => ({
    ...t,
    scoutSeat: weakSeat(state, QUIET),
  }));
  assert.deepEqual(policy(state, QUIET), {
    type: 'SetFocus',
    team: QUIET,
    focus: { line: 'gun' },
  });
  const hullBehind = changeTeam(state, QUIET, (t) => ({
    ...t,
    design: { ...t.design, gun: 24, hull: 20 },
  }));
  assert.deepEqual(policy(hullBehind, QUIET), {
    type: 'SetFocus',
    team: QUIET,
    focus: { line: 'hull' },
  });
  const even = changeTeam(state, QUIET, (t) => ({
    ...t,
    design: { ...t.design, hull: 50, gun: 24 },
  }));
  const levelled = changeTeam(even, QUIET, (t) => {
    const design = { ...t.design };
    for (const line of LINES) design[line] = 24;
    return { ...t, design };
  });
  assert.deepEqual(policy(levelled, QUIET), {
    type: 'SetFocus',
    team: QUIET,
    focus: { line: 'sails' },
  });
  const gunReady = changeTeam(state, QUIET, (t) => ({
    ...t,
    design: { ...t.design, gun: 25 },
  }));
  const firstLocked = state.teams[QUIET].taste.find((k) => k !== 'cannon');
  assert.ok(firstLocked);
  assert.deepEqual(policy(gunReady, QUIET), {
    type: 'SetFocus',
    team: QUIET,
    focus: { gun: firstLocked },
  });
  const noDesigner = changeTeam(QUIET_BASE, QUIET, (t) => ({
    ...t,
    seats: { ...t.seats, designer: null },
    scoutSeat: 'designer',
    focus: { line: 'keel' },
  }));
  assert.deepEqual(policy(noDesigner, QUIET), {
    type: 'SetFocus',
    team: QUIET,
    focus: null,
  });
});

test('step 6, fit: each ship gets the favorite unlocked gun when affordable', () => {
  const taste = QUIET_BASE.teams[QUIET].taste;
  const state = changeTeam(QUIET_BASE, QUIET, (t) => ({
    ...t,
    unlocked: [...taste],
    ships: [
      { ...t.ships[0], gun: taste[1] },
      { ...t.ships[1], gun: taste[2] },
    ],
  }));
  assert.deepEqual(policy(state, QUIET), {
    type: 'FitGun',
    team: QUIET,
    slot: 0,
    kind: taste[0],
  });
  const first = send(state, {
    type: 'FitGun',
    team: QUIET,
    slot: 0,
    kind: taste[0],
  });
  assert.deepEqual(policy(first, QUIET), {
    type: 'FitGun',
    team: QUIET,
    slot: 1,
    kind: taste[0],
  });
  const price = fitPrice(state, QUIET, 0);
  const poor = funded(state, QUIET, Math.floor(price / 0.4) - 1);
  assert.equal(policy(poor, QUIET, 'sensible'), null);
});

function gapped(
  state: CareerState,
  gaps: readonly [number, Line, number][]
): CareerState {
  return changeTeam(state, QUIET, (t) => {
    const ships: Team['ships'] = [
      { ...t.ships[0], fitted: { ...t.design } },
      { ...t.ships[1], fitted: { ...t.design } },
    ];
    for (const [slot, line, gap] of gaps)
      ships[slot].fitted[line] = t.design[line] - gap;
    return { ...t, ships };
  });
}

test('step 7, build: the largest affordable gap of at least B, slot 0 and earlier lines first', () => {
  const state = gapped(QUIET_BASE, [
    [1, 'keel', 15],
    [0, 'hull', 15],
    [0, 'sails', 9],
  ]);
  assert.deepEqual(policy(state, QUIET, 'sensible'), {
    type: 'Build',
    team: QUIET,
    slot: 0,
    line: 'hull',
  });
  const hull = send(state, {
    type: 'Build',
    team: QUIET,
    slot: 0,
    line: 'hull',
  });
  assert.deepEqual(policy(hull, QUIET, 'sensible'), {
    type: 'Build',
    team: QUIET,
    slot: 1,
    line: 'keel',
  });
  const small = gapped(QUIET_BASE, [[1, 'rudder', 7]]);
  assert.equal(policy(small, QUIET, 'sensible'), null);
  const cheap = cheapStaff(
    gapped(QUIET_BASE, [
      [0, 'hull', 15],
      [0, 'sails', 9],
    ]),
    QUIET
  );
  const hullPrice = buildPrice(cheap, QUIET, 0, 'hull');
  const sailsPrice = buildPrice(cheap, QUIET, 0, 'sails');
  assert.ok(hullPrice > sailsPrice);
  const tight = funded(cheap, QUIET, Math.ceil(sailsPrice / 0.4));
  assert.deepEqual(policy(tight, QUIET, 'sensible'), {
    type: 'Build',
    team: QUIET,
    slot: 0,
    line: 'sails',
  });
});

function offer(sponsor: number, fee: number, bonus: number): Sponsor {
  return { sponsor, fee, bonus, objective: 'sea', racesLeft: 6 };
}

test('step 8, sponsors: the offer worth most by fee + 0.5 × bonus goes in the first empty slot', () => {
  const state = changeTeam(QUIET_BASE, QUIET, (t) => ({
    ...t,
    sponsors: [t.sponsors[0], null, null],
    offers: [offer(50, 500, 1000), offer(51, 600, 600), offer(52, 400, 1400)],
  }));
  assert.deepEqual(policy(state, QUIET), {
    type: 'SignSponsor',
    team: QUIET,
    offer: 2,
    slot: 1,
  });
  const tie = changeTeam(state, QUIET, (t) => ({
    ...t,
    offers: [offer(50, 500, 1000), offer(51, 600, 800)],
  }));
  assert.deepEqual(policy(tie, QUIET), {
    type: 'SignSponsor',
    team: QUIET,
    offer: 0,
    slot: 1,
  });
  const none = changeTeam(state, QUIET, (t) => ({ ...t, offers: [] }));
  assert.equal(policy(none, QUIET), null);
});

test('B: a bold team builds a gap of 6, a sensible one 9, a cautious one only 12', () => {
  const built = (gap: number, temperament: Temperament): boolean =>
    policy(gapped(QUIET_BASE, [[0, 'hull', gap]]), QUIET, temperament) !== null;
  assert.deepEqual(
    [6, 9, 12].map((gap) => TEMPERAMENTS.map((t) => built(gap, t))),
    [
      [false, false, true],
      [false, true, true],
      [true, true, true],
    ]
  );
  assert.equal(built(4, 'bold'), false);
});

function cheapStaff(state: CareerState, team: number): CareerState {
  return {
    ...state,
    people: state.people.map((p) =>
      p.contract?.team === team
        ? { ...p, contract: { ...p.contract, wage: 10 } }
        : p
    ),
  };
}

test('S: a bold team spends a larger share of its balance than a sensible one, and that than a cautious one', () => {
  const state = cheapStaff(gapped(QUIET_BASE, [[0, 'hull', 15]]), QUIET);
  const price = buildPrice(state, QUIET, 0, 'hull');
  const builds = (share: number, temperament: Temperament): boolean =>
    policy(
      funded(state, QUIET, Math.ceil(price / share)),
      QUIET,
      temperament
    ) !== null;
  assert.deepEqual(
    [0.5, 0.3, 0.2].map((share) => TEMPERAMENTS.map((t) => builds(share, t))),
    [
      [false, false, true],
      [false, true, true],
      [true, true, true],
    ]
  );
});

test('R: a cautious team keeps more races of wages in hand than a sensible one, and that than a bold one', () => {
  const mechanic = holder(BASE, QUIET, 'mechanic');
  let state = changeTeam(QUIET_BASE, QUIET, (t) => ({
    ...t,
    seats: { ...t.seats, mechanic: null },
    scoutSeat: 'mechanic',
  }));
  state = changePerson(state, mechanic, (p) => ({ ...p, contract: null }));
  const candidate = freeAgents(state, 'mechanic')[0];
  state = changeTeam(state, QUIET, (t) => ({
    ...t,
    deals: {
      ...t.deals,
      mechanic: { candidates: [candidate.id], locked: null },
    },
  }));
  const terms = minimumTerms(state, QUIET, candidate);
  assert.ok(terms);
  const bill = wageBill(state, QUIET) + terms.wage;
  const signs = (races: number, temperament: Temperament): boolean =>
    policy(funded(state, QUIET, races * bill), QUIET, temperament) !== null;
  assert.deepEqual(
    [3, 4, 6].map((races) => TEMPERAMENTS.map((t) => signs(races, t))),
    [
      [false, false, true],
      [false, true, true],
      [true, true, true],
    ]
  );
  assert.equal(costToSign(state, QUIET, candidate, terms), 0);
});

test('the temperament comes from the owner’s Nerve', () => {
  const state = gapped(QUIET_BASE, [[0, 'hull', 9]]);
  assert.equal(policy(withNerve(state, QUIET, 8), QUIET), null);
  assert.notEqual(policy(withNerve(state, QUIET, 9), QUIET), null);
  const six = gapped(QUIET_BASE, [[0, 'hull', 6]]);
  assert.equal(policy(withNerve(six, QUIET, 11), QUIET), null);
  assert.notEqual(policy(withNerve(six, QUIET, 12), QUIET), null);
});

test('the policy and its run are deterministic and never mutate the state', () => {
  const state = deepFreeze(structuredClone(BASE));
  const copy = structuredClone(state);
  for (const team of [1, 17, 39]) {
    assert.deepEqual(policy(state, team), policy(copy, team));
    assert.deepEqual(runPolicy(state, team), runPolicy(copy, team));
  }
  assert.deepEqual(runPolicies(state), runPolicies(copy));
  assert.deepEqual(state, copy);
});

test('the rivals run worst standing first; your team is not run inside StartRace', () => {
  const state = { ...BASE, points: BASE.points.map((_, t) => (t * 37) % 41) };
  const table = standings(state);
  const order = worstFirst(state);
  assert.equal(order.length, LEAGUE.teams - 1);
  assert.ok(!order.includes(YOURS));
  for (let i = 1; i < order.length; i++)
    assert.ok(table[order[i - 1]] > table[order[i]]);
  const run = runPolicies(state);
  const position = (team: number) => order.indexOf(team);
  for (let i = 1; i < run.sent.length; i++)
    assert.ok(position(run.sent[i - 1].team) <= position(run.sent[i].team));
  assert.ok(run.sent.every((command) => command.team !== YOURS));
  const started = apply(state, { type: 'StartRace', team: YOURS });
  assert.ok(started.ok);
  assert.deepEqual(started.state, { ...run.state, phase: 'racing' });
});

test('a refused policy command is collected with its reason and stops that team', () => {
  const refusing: Send = (state, command) =>
    command.type === 'SetFocus'
      ? { ok: false, reason: 'locked' }
      : apply(state, command);
  const state = changeTeam(QUIET_BASE, QUIET, (t) => ({ ...t, focus: null }));
  const focus = wantedFocus(state, QUIET);
  assert.notEqual(focus, null);
  const run = runTeam(state, QUIET, refusing);
  assert.deepEqual(run.sent, []);
  assert.equal(run.state, state);
  assert.deepEqual(run.refused, [
    { command: { type: 'SetFocus', team: QUIET, focus }, reason: 'locked' },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(run)), run);
  const idle: Send = (current) => ({ ok: true, state: current });
  const looping = runTeam(state, QUIET, idle);
  assert.equal(looping.sent.length, 40);
  assert.deepEqual(looping.refused, []);
});

const HEADCOUNT = BASE.people.length;

function checkLeague(state: CareerState): void {
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.equal(state.people.length, HEADCOUNT);
  const ids = state.people.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
  const seated = new Map<number, string>();
  state.teams.forEach((team, index) => {
    for (const role of ROLES) {
      const id = team.seats[role];
      if (id === null) continue;
      assert.ok(!seated.has(id), `${id} holds two seats`);
      seated.set(id, `${index}/${role}`);
      const who = person(state, id);
      assert.equal(who.role, role);
      assert.equal(who.contract?.team, index, `${id} has no contract`);
    }
  });
  for (const p of state.people)
    if (p.contract === null) assert.ok(!seated.has(p.id));
    else assert.equal(seated.get(p.id), `${p.contract.team}/${p.role}`);
}

function checkRanges(state: CareerState): void {
  const within = (value: number, range: { lo: number; hi: number }) =>
    range.lo <= value && value <= range.hi;
  const ids = [
    ...state.people.map((p) => p.id),
    ...state.teams.flatMap((t) => (t.owner === null ? [] : [t.owner.id])),
  ];
  for (const id of ids) {
    const stats = trueStats(state, id);
    const ranges = knownStats(state, id);
    assert.ok(stats && ranges);
    stats.forEach((stat, i) => assert.ok(within(stat, ranges[i]), `${id}`));
  }
  state.teams.forEach((team, index) => {
    if (index === YOURS) return;
    team.ships.forEach((ship, slot) => {
      for (const line of LINES)
        assert.ok(
          within(ship.fitted[line], state.knowledge.lines[index][slot][line]),
          `${index}/${slot}/${line}`
        );
    });
  });
}

function expectedDelta(before: CareerState, command: Command): number[] {
  const delta = before.teams.map(() => 0);
  switch (command.type) {
    case 'Approach':
      delta[command.team] -= SCOUTING.approach;
      break;
    case 'Build':
      delta[command.team] -= buildPrice(
        before,
        command.team,
        command.slot,
        command.line
      );
      break;
    case 'FitGun':
      delta[command.team] -= fitPrice(before, command.team, command.slot);
      break;
    case 'Offer': {
      const who = person(before, command.person);
      const signs = scoreAt(before, command.team, who)(command.terms) >= 1;
      if (!signs) break;
      delta[command.team] -= costToSign(
        before,
        command.team,
        who,
        command.terms
      );
      const from = who.contract?.team;
      if (from !== undefined && from !== command.team)
        delta[from] += clauseOwed(who, command.team);
      break;
    }
    default:
      break;
  }
  return delta;
}

type Tally = {
  hired: Set<number>;
  built: Set<number>;
  signed: Set<number>;
  commands: number;
  repossessed: number;
};

function sendChecked(
  state: CareerState,
  command: Command,
  tally: Tally
): CareerState {
  const before = deepFreeze(state);
  const applied = apply(before, command);
  assert.ok(
    applied.ok,
    `${JSON.stringify(command)} refused (${applied.ok ? '' : applied.reason}) at ${state.season}/${state.race}`
  );
  const after = applied.state;
  const delta = expectedDelta(before, command);
  after.teams.forEach((team, index) =>
    assert.equal(
      team.balance - before.teams[index].balance,
      delta[index],
      `${command.type} by ${command.team}: money of team ${index}`
    )
  );
  tally.commands += 1;
  if (command.type === 'Build' || command.type === 'FitGun')
    tally.built.add(command.team);
  if (command.type === 'SignSponsor') tally.signed.add(command.team);
  if (
    command.type === 'Offer' &&
    personOf(after, command.person)?.contract?.team === command.team &&
    personOf(before, command.person)?.contract?.team !== command.team
  )
    tally.hired.add(command.team);
  return after;
}

function policyLoop(
  state: CareerState,
  team: number,
  temperament: Temperament | undefined,
  tally: Tally
): CareerState {
  let current = state;
  for (let n = 0; n < 40; n++) {
    const command = policy(current, team, temperament);
    if (command === null) break;
    current = sendChecked(current, command, tally);
  }
  return current;
}

function rivalsActed(
  state: CareerState,
  temperament: Temperament | undefined,
  tally: Tally
): CareerState {
  let current = state;
  for (const team of worstFirst(state))
    current = policyLoop(current, team, temperament, tally);
  return current;
}

function forced(state: CareerState, temperament: Temperament | undefined) {
  if (temperament === undefined) return state;
  const nerve = { cautious: 4, sensible: 10, bold: 16 }[temperament];
  let current = state;
  for (let team = 1; team < state.teams.length; team++)
    current = withNerve(current, team, nerve);
  return current;
}

function raceChecked(started: CareerState, tally: Tally): CareerState {
  const result = standInResult(matchSetup(started, { hands: 'player' }));
  const after = send(deepFreeze(started), {
    type: 'RecordRace',
    team: YOURS,
    result,
  });
  const final = standings(scoreRace(started, result));
  started.teams.forEach((team, index) => {
    const paid = team.balance + moneyTotal(teamMoney(started, result, index));
    const prize = started.race === SEASON ? seasonPrize(final[index]) : 0;
    if (paid < REPOSSESSION.below) {
      tally.repossessed += 1;
      assert.equal(after.teams[index].balance, REPOSSESSION.balance + prize);
    } else
      assert.equal(after.teams[index].balance, paid + prize, `team ${index}`);
  });
  checkLeague(after);
  checkRanges(after);
  return after;
}

function playLeague(
  seed: string,
  seasons: number,
  temperament: Temperament | undefined
): { state: CareerState; tally: Tally } {
  const tally: Tally = {
    hired: new Set(),
    built: new Set(),
    signed: new Set(),
    commands: 0,
    repossessed: 0,
  };
  let state = forced(careerOf(seed), temperament);
  for (let race = 0; race < seasons * SEASON; race++) {
    if (state.phase === 'offseason') {
      state = policyLoop(state, YOURS, temperament, tally);
      const acted = rivalsActed(state, temperament, tally);
      const finished = send(deepFreeze(state), {
        type: 'FinishOffseason',
        team: YOURS,
      });
      assert.deepEqual(
        finished.teams.map((t) => t.balance),
        acted.teams.map((t) => t.balance)
      );
      checkLeague(finished);
      checkRanges(finished);
      state = finished;
    }
    state = policyLoop(state, YOURS, temperament, tally);
    const acted = rivalsActed(state, temperament, tally);
    const started = send(deepFreeze(state), { type: 'StartRace', team: YOURS });
    assert.deepEqual(started, { ...acted, phase: 'racing' });
    checkLeague(started);
    state = raceChecked(started, tally);
    if (state.phase === 'lobby')
      state = send(state, { type: 'MarkRead', team: YOURS });
  }
  return { state, tally };
}

test('over two seasons no policy command is refused, for each temperament forced on every team and for the natural mix, from three seeds', () => {
  const runs: (Temperament | undefined)[] = [...TEMPERAMENTS, undefined];
  for (const seed of ['tide', 'squall', 'doldrums'])
    for (const temperament of runs) {
      const { state, tally } = playLeague(seed, 2, temperament);
      assert.equal(state.season, 2);
      assert.equal(state.phase, 'offseason');
      assert.ok(tally.commands > 0);
      if (temperament !== undefined)
        state.teams.forEach((team) =>
          assert.equal(
            ownerTemperament(team.owner),
            team.owner === null ? 'sensible' : temperament
          )
        );
    }
});
