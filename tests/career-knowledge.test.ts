import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  newCareer,
  runPolicies,
  type Applied,
} from '../src/career/apply.ts';
import type { Command, Reason } from '../src/career/commands.ts';
import { draw, knowledgeYear, uniform } from '../src/career/draw.ts';
import { matchSetup } from '../src/career/fit.ts';
import {
  clauseOwed,
  costToSign,
  releaseCostOf,
} from '../src/career/hiring/cost.ts';
import { willingness } from '../src/career/hiring/talks.ts';
import {
  isExact,
  knownAsk,
  knownStars,
  knownStats,
  trueStats,
} from '../src/career/knowledge/people.ts';
import { reportPrice } from '../src/career/knowledge/report.ts';
import {
  leagueLines,
  redrawRepossessed,
} from '../src/career/knowledge/ships.ts';
import { ownerOf, personOf } from '../src/career/lookup.ts';
import { enterPhase, scoreRace } from '../src/career/record/race.ts';
import { moneyTotal, teamMoney } from '../src/career/record/pay.ts';
import {
  ask,
  askingWage,
  lowestWage,
  standardClause,
} from '../src/career/rules/hiring.ts';
import {
  askRange,
  exactRange,
  narrowed,
  reportCost,
  shipRange,
  starRange,
  statRange,
} from '../src/career/rules/knowledge.ts';
import { seasonPrize } from '../src/career/rules/money.ts';
import { stars } from '../src/career/rules/person.ts';
import { standings } from '../src/career/rules/standing.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  LINES,
  ROLES,
  type CareerState,
  type Person,
  type Range,
  type Role,
  type Team,
  type Terms,
} from '../src/career/state.ts';
import { LEAGUE } from '../src/career/tuning.ts';

const YOURS = 0;
const RIVAL = 17;
const SEASON = LEAGUE.racesPerSeason;
const HEADCOUNT = 39 * 3 + 3 * 60;

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 0, pattern: 0 },
    emblem: 0,
  });

const BASE = careerOf('ledger');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

const sendRaw = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

const sendAny = (state: CareerState, command: unknown): CareerState =>
  accepted(sendRaw(state, command));

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
}

function refusedUntouched(
  state: CareerState,
  command: unknown,
  reason: Reason
): void {
  const before = structuredClone(state);
  const applied = sendRaw(deepFreeze(structuredClone(state)), command);
  assert.deepEqual(applied, { ok: false, reason }, JSON.stringify(command));
  assert.deepEqual(state, before);
}

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

const funded = (state: CareerState, team: number, balance: number) =>
  changeTeam(state, team, (t) => ({ ...t, balance }));

function person(state: CareerState, id: number | null | undefined): Person {
  const found = id === null || id === undefined ? null : personOf(state, id);
  if (found === null) throw new Error(`no person ${String(id)}`);
  return found;
}

function holderId(state: CareerState, team: number, role: Role): number {
  const id = state.teams[team].seats[role];
  if (id === null) throw new Error('an empty seat');
  return id;
}

function ownerId(state: CareerState, team: number): number {
  const owner = state.teams[team].owner;
  if (owner === null) throw new Error('no owner');
  return owner.id;
}

function sail(state: CareerState): CareerState {
  return finishRace(send(state, { type: 'StartRace', team: YOURS }));
}

function finishRace(started: CareerState): CareerState {
  const raced = standInResult(matchSetup(started, { hands: 'player' }));
  const after = send(started, {
    type: 'RecordRace',
    team: YOURS,
    result: raced,
  });
  return after.phase === 'lobby'
    ? send(after, { type: 'MarkRead', team: YOURS })
    : after;
}

const within = (value: number, range: Range): boolean =>
  range.lo <= value && value <= range.hi;

const inside = (inner: Range, outer: Range): boolean =>
  inner.lo >= outer.lo && inner.hi <= outer.hi;

test('a stat range of §1.6.1 at hand-worked points', () => {
  assert.deepEqual(statRange(10, 0), { lo: 7, hi: 13 });
  assert.deepEqual(statRange(10, 1), { lo: 4, hi: 10 });
  assert.deepEqual(statRange(10, -1), { lo: 10, hi: 16 });
  assert.deepEqual(statRange(10, 0.3), { lo: 6, hi: 13 });
  assert.deepEqual(statRange(2, 0.5), { lo: 1, hi: 4 });
  assert.deepEqual(statRange(19, -0.5), { lo: 17, hi: 20 });
  assert.deepEqual(statRange(1, -1), { lo: 1, hi: 7 });
  assert.deepEqual(statRange(20, 1), { lo: 14, hi: 20 });
  assert.deepEqual(exactRange(12), { lo: 12, hi: 12 });
  for (let stat = 1; stat <= 20; stat++)
    for (let o = -1; o <= 1; o += 0.125) {
      const range = statRange(stat, o);
      assert.ok(within(stat, range));
      assert.ok(range.lo >= 1 && range.hi <= 20);
      assert.ok(range.hi - range.lo <= 7);
    }
});

test('star and asking-wage ranges of §1.6.1 at hand-worked points', () => {
  const ranges = (lo: number, hi: number, n: number): Range[] =>
    Array.from({ length: n }, () => ({ lo, hi }));
  assert.deepEqual(starRange(ranges(4, 8, 6)), { lo: 1, hi: 2 });
  assert.deepEqual(starRange(ranges(1, 20, 7)), { lo: 0, hi: 5 });
  assert.deepEqual(starRange([...ranges(10, 12, 4), { lo: 1, hi: 1 }]), {
    lo: 2,
    hi: 2,
  });
  assert.deepEqual(askRange({ lo: 1, hi: 2 }, 1), { lo: 60, hi: 480 });
  assert.deepEqual(askRange({ lo: 1, hi: 2 }, 0.7), { lo: 40, hi: 340 });
  assert.deepEqual(askRange({ lo: 0, hi: 5 }, 1.3), { lo: 10, hi: 9750 });
});

test('the report cost of §1.6.3 at hand-worked points', () => {
  assert.equal(reportCost(0), 100);
  assert.equal(reportCost(0.5), 100);
  assert.equal(reportCost(1), 200);
  assert.equal(reportCost(3.5), 700);
  assert.equal(reportCost(5), 1000);
});

test('rival ship ranges of §1.7.6 at hand-worked points', () => {
  assert.deepEqual(shipRange(50, 30, 0), { lo: 50, hi: 80 });
  assert.deepEqual(shipRange(50, 30, 1), { lo: 20, hi: 50 });
  assert.deepEqual(shipRange(10, 30, 0.5), { lo: 0, hi: 25 });
  assert.deepEqual(shipRange(95, 20, 0.25), { lo: 90, hi: 100 });
  assert.deepEqual(narrowed({ lo: 20, hi: 50 }, 30, 1, 1), {
    lo: 22.5,
    hi: 45,
  });
  assert.deepEqual(narrowed({ lo: 20, hi: 50 }, 30, 0, 0), { lo: 20, hi: 50 });
  assert.deepEqual(narrowed({ lo: 20, hi: 50 }, 30, 0.5, 0.2), {
    lo: 21.25,
    hi: 49,
  });
  assert.deepEqual(narrowed({ lo: 40, hi: 40 }, 40, 1, 1), { lo: 40, hi: 40 });
});

test('anyone else’s stats show as ranges keyed by person, stat and knowledge year', () => {
  const free = BASE.people.find((p) => p.contract === null);
  assert.ok(free);
  const ranges = knownStats(BASE, free.id);
  assert.ok(ranges);
  ranges.forEach((range, stat) => {
    assert.deepEqual(
      range,
      statRange(
        free.stats[stat],
        uniform(-1, 1, BASE.seed, 'range', 1, free.id, stat)
      )
    );
  });
  const owner = ownerId(BASE, 3);
  const ownerStats = BASE.teams[3].owner?.stats ?? [];
  assert.deepEqual(trueStats(BASE, owner), ownerStats);
  assert.equal(knownStats(BASE, owner)?.length, 6);
  assert.equal(knownAsk(BASE, owner), null);
  assert.equal(knownStats(BASE, BASE.nextPersonId), null);
  const starsKnown = knownStars(BASE, free.id);
  assert.ok(starsKnown);
  assert.deepEqual(starsKnown, starRange(ranges));
  assert.ok(within(stars(free.stats), starsKnown));
  assert.deepEqual(
    knownAsk(BASE, free.id),
    askRange(starsKnown, free.wageFactor)
  );
  const nextYear: CareerState = { ...BASE, phase: 'offseason' };
  assert.equal(knowledgeYear(nextYear), 2);
  let moved = 0;
  for (const p of BASE.people.slice(0, 50))
    if (
      JSON.stringify(knownStats(nextYear, p.id)) !==
      JSON.stringify(knownStats(BASE, p.id))
    )
      moved++;
  assert.ok(moved > 40);
  let offCenter = 0;
  for (const p of BASE.people)
    knownStats(BASE, p.id)?.forEach((range, stat) => {
      if (range.lo + range.hi !== 2 * p.stats[stat]) offCenter++;
    });
  assert.ok(offCenter > BASE.people.length);
});

test('your own staff are exact; a report makes anyone exact', () => {
  const theirs = holderId(BASE, RIVAL, 'designer');
  assert.equal(isExact(BASE, theirs), false);
  const reported = send(BASE, {
    type: 'BuyReport',
    team: YOURS,
    person: theirs,
  });
  assert.equal(isExact(reported, theirs), true);
  assert.deepEqual(
    knownStats(reported, theirs),
    person(BASE, theirs).stats.map(exactRange)
  );
  const who = person(BASE, theirs);
  assert.deepEqual(knownStars(reported, theirs), exactRange(stars(who.stats)));
  assert.deepEqual(knownAsk(reported, theirs), exactRange(ask(who)));
  const mine: CareerState = {
    ...BASE,
    people: BASE.people.map((p) =>
      p.id === theirs
        ? { ...p, contract: { team: 0, wage: 10, clause: 0, racesLeft: 5 } }
        : p
    ),
  };
  assert.equal(isExact(mine, theirs), true);
});

test('BuyReport charges 200 per star at the top of the range, at least 100, and is kept until the off-season stop', () => {
  for (const id of [
    holderId(BASE, 1, 'driver'),
    holderId(BASE, 38, 'mechanic'),
    ownerId(BASE, 2),
    BASE.people[BASE.people.length - 1].id,
  ]) {
    const top = knownStars(BASE, id)?.hi ?? -1;
    const price = Math.max(100, 200 * top);
    assert.equal(reportPrice(BASE, id), price);
    const frozen = deepFreeze(structuredClone(BASE));
    const bought = send(frozen, { type: 'BuyReport', team: YOURS, person: id });
    assert.equal(bought.teams[YOURS].balance, 1500 - price);
    assert.deepEqual(bought.knowledge.reports, [id]);
    assert.deepEqual(
      bought,
      changeTeam(
        { ...BASE, knowledge: { ...BASE.knowledge, reports: [id] } },
        YOURS,
        (t) => ({ ...t, balance: 1500 - price })
      )
    );
  }
  let state = send(BASE, {
    type: 'BuyReport',
    team: YOURS,
    person: ownerId(BASE, 9),
  });
  for (let n = 1; n < SEASON; n++) state = sail(state);
  assert.deepEqual(state.knowledge.reports, [ownerId(BASE, 9)]);
  const stopped = sail(state);
  assert.equal(stopped.phase, 'offseason');
  assert.deepEqual(stopped.knowledge.reports, []);
  const again = send(stopped, {
    type: 'BuyReport',
    team: YOURS,
    person: ownerId(BASE, 9),
  });
  assert.deepEqual(again.knowledge.reports, [ownerId(BASE, 9)]);
  const next = send(again, { type: 'FinishOffseason', team: YOURS });
  assert.deepEqual(next.knowledge.reports, [ownerId(BASE, 9)]);
});

test('BuyReport is refused as the table says, in its order', () => {
  const theirs = holderId(BASE, RIVAL, 'mechanic');
  const report = (who: unknown, team = YOURS) => ({
    type: 'BuyReport',
    team,
    person: who,
  });
  const reported = sendAny(BASE, report(theirs));
  refusedUntouched(reported, report(theirs), 'same');
  refusedUntouched(funded(reported, YOURS, 0), report(theirs), 'same');
  const mine: CareerState = {
    ...BASE,
    people: BASE.people.map((p) =>
      p.id === theirs
        ? { ...p, contract: { team: 0, wage: 10, clause: 0, racesLeft: 5 } }
        : p
    ),
  };
  refusedUntouched(funded(mine, YOURS, 0), report(theirs), 'same');
  refusedUntouched(BASE, report(theirs, RIVAL), 'same');
  refusedUntouched(funded(BASE, YOURS, 99), report(theirs), 'funds');
  refusedUntouched(
    funded(BASE, YOURS, reportPrice(BASE, theirs) - 1),
    report(theirs),
    'funds'
  );
  assert.ok(
    sendRaw(funded(BASE, YOURS, reportPrice(BASE, theirs)), report(theirs)).ok
  );
  refusedUntouched(BASE, report(BASE.nextPersonId), 'unknown');
  refusedUntouched(BASE, report('x'), 'invalid');
  refusedUntouched({ ...BASE, phase: 'racing' }, report(theirs), 'phase');
  refusedUntouched(BASE, report(theirs, -2), 'team');
});

test('after each race every rival ship range narrows by keyed amounts and keeps the true level', () => {
  let state = BASE;
  for (let race = 1; race <= 3; race++) {
    const started = send(state, { type: 'StartRace', team: YOURS });
    const next = finishRace(started);
    for (let team = 1; team < LEAGUE.teams; team++)
      for (let slot = 0; slot < 2; slot++)
        for (const line of LINES) {
          const before = started.knowledge.lines[team][slot][line];
          const after = next.knowledge.lines[team][slot][line];
          const level = next.teams[team].ships[slot].fitted[line];
          const a = draw(BASE.seed, 'narrow', 1, race, team, slot, line, 'a');
          const b = draw(BASE.seed, 'narrow', 1, race, team, slot, line, 'b');
          assert.deepEqual(after, narrowed(before, level, a, b));
          assert.ok(inside(after, before));
          assert.ok(within(level, after));
        }
    assert.deepEqual(next.knowledge.lines[0], []);
    state = next;
  }
});

test('at the off-season stop the rival ranges are redrawn after winter for the next knowledge year', () => {
  let state = BASE;
  for (let n = 1; n <= SEASON; n++) state = sail(state);
  assert.equal(state.phase, 'offseason');
  assert.deepEqual(
    state.knowledge.lines,
    leagueLines(state.seed, state.teams, 2)
  );
  const fresh = leagueLines(state.seed, state.teams, 2);
  fresh.forEach((ships, team) =>
    ships.forEach((ranges, slot) => {
      for (const line of LINES) {
        const level = state.teams[team].ships[slot].fitted[line];
        const u = draw(state.seed, 'line', 2, team, slot, line);
        assert.deepEqual(ranges[line], shipRange(level, 30, u));
      }
    })
  );
  const next = send(state, { type: 'FinishOffseason', team: YOURS });
  assert.deepEqual(
    next.knowledge.lines,
    runPolicies(state).state.knowledge.lines
  );
});

test('a rival’s build or gun fitting redraws that one range with width 20', () => {
  const rich = changeTeam(funded(BASE, RIVAL, 1000000), RIVAL, (t) => ({
    ...t,
    unlocked: t.taste,
  }));
  const built = send(rich, {
    type: 'Build',
    team: RIVAL,
    slot: 1,
    line: 'keel',
  });
  const level = built.teams[RIVAL].ships[1].fitted.keel;
  assert.equal(level, built.teams[RIVAL].design.keel);
  const u = draw(BASE.seed, 'line', 1, RIVAL, 1, 'keel', 'built', 1);
  assert.deepEqual(
    built.knowledge.lines[RIVAL][1].keel,
    shipRange(level, 20, u)
  );
  built.knowledge.lines.forEach((ships, team) =>
    ships.forEach((ranges, slot) => {
      for (const line of LINES)
        if (team !== RIVAL || slot !== 1 || line !== 'keel')
          assert.deepEqual(
            ranges[line],
            rich.knowledge.lines[team][slot][line]
          );
    })
  );
  const kind = rich.teams[RIVAL].taste.find(
    (k) => k !== rich.teams[RIVAL].ships[0].gun
  );
  assert.ok(kind);
  const offseason: CareerState = { ...rich, phase: 'offseason', race: SEASON };
  const fitted = send(offseason, {
    type: 'FitGun',
    team: RIVAL,
    slot: 0,
    kind,
  });
  const v = draw(BASE.seed, 'line', 2, RIVAL, 0, 'gun', 'built', 11);
  assert.deepEqual(
    fitted.knowledge.lines[RIVAL][0].gun,
    shipRange(fitted.teams[RIVAL].ships[0].fitted.gun, 20, v)
  );
  const ready = changeTeam(funded(BASE, YOURS, 100000), YOURS, (t) => ({
    ...t,
    design: { ...t.design, hull: 20 },
  }));
  const mine = send(ready, {
    type: 'Build',
    team: YOURS,
    slot: 0,
    line: 'hull',
  });
  assert.equal(mine.teams[YOURS].ships[0].fitted.hull, 20);
  assert.deepEqual(mine.knowledge, BASE.knowledge);
});

test('a repossession redraws both of that rival’s ships as at the start, with its own keys', () => {
  const state: CareerState = { ...BASE, race: 4, phase: 'racing' };
  const redrawn = redrawRepossessed(state, RIVAL);
  for (let slot = 0; slot < 2; slot++)
    for (const line of LINES) {
      const u = draw(BASE.seed, 'line', 1, RIVAL, slot, line, 'repossessed', 4);
      assert.deepEqual(
        redrawn.knowledge.lines[RIVAL][slot][line],
        shipRange(state.teams[RIVAL].ships[slot].fitted[line], 30, u)
      );
    }
  for (let team = 0; team < LEAGUE.teams; team++)
    if (team !== RIVAL)
      assert.deepEqual(
        redrawn.knowledge.lines[team],
        state.knowledge.lines[team]
      );
  assert.equal(redrawRepossessed(state, YOURS), state);
});

type Step = { before: CareerState; after: CareerState; command: Command };

function minimumTerms(
  state: CareerState,
  team: number,
  id: number,
  seasons: 1 | 2 | 3
): Terms {
  const who = person(state, id);
  const base: Terms = {
    wage: 10,
    seasons,
    fee: 0,
    clause: standardClause(ask(who)),
  };
  const score = willingness(state, team, who);
  const wage = lowestWage((w) => score({ ...base, wage: w }), 1);
  assert.ok(wage !== null);
  return { ...base, wage };
}

function expectedMoney(before: CareerState, command: Command): number[] {
  const delta = before.teams.map(() => 0);
  switch (command.type) {
    case 'Approach':
      delta[command.team] -= 500;
      break;
    case 'BuyReport':
      delta[command.team] -= reportPrice(before, command.person);
      break;
    case 'Release':
      delta[command.team] -= releaseCostOf(person(before, command.person));
      break;
    case 'Offer': {
      const who = person(before, command.person);
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

function raceMoneyOf(started: CareerState): (after: CareerState) => void {
  const raced = standInResult(matchSetup(started, { hands: 'player' }));
  return (after) => {
    const scored = scoreRace(started, raced);
    const final = standings(scored);
    started.teams.forEach((team, index) => {
      const prize = started.race === SEASON ? seasonPrize(final[index]) : 0;
      assert.equal(
        after.teams[index].balance - team.balance,
        moneyTotal(teamMoney(started, raced, index)) + prize,
        `team ${index} after race ${started.race}`
      );
    });
  };
}

function checkPlaces(state: CareerState, gone: ReadonlySet<number>): void {
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
      const holder = person(state, id);
      assert.equal(holder.role, role);
      assert.equal(holder.contract?.team, index);
    }
  });
  for (const p of state.people) {
    assert.ok(!gone.has(p.id), `${p.id} came back`);
    if (p.contract === null) assert.ok(!seated.has(p.id));
    else
      assert.equal(seated.get(p.id), `${p.contract.team}/${p.role}`, `${p.id}`);
  }
  for (const id of gone) assert.ok(!seated.has(id));
}

function checkRanges(state: CareerState): void {
  for (const p of state.people) {
    const ranges = knownStats(state, p.id);
    assert.ok(ranges);
    p.stats.forEach((stat, i) => assert.ok(within(stat, ranges[i])));
    const starsKnown = knownStars(state, p.id);
    assert.ok(starsKnown && within(stars(p.stats), starsKnown));
    const asks = knownAsk(state, p.id);
    assert.ok(asks && within(askingWage(stars(p.stats), p.wageFactor), asks));
  }
  for (const team of state.teams.slice(1)) {
    const owner = team.owner;
    assert.ok(owner);
    const ranges = knownStats(state, owner.id);
    assert.ok(ranges);
    owner.stats.forEach((stat, i) => assert.ok(within(stat, ranges[i])));
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

function checkNarrowing(before: CareerState, after: CareerState): void {
  if (knowledgeYear(before) !== knowledgeYear(after)) {
    assert.deepEqual(after.knowledge.reports, []);
    assert.deepEqual(
      after.knowledge.lines,
      leagueLines(after.seed, after.teams, knowledgeYear(after))
    );
    return;
  }
  after.knowledge.lines.forEach((ships, team) =>
    ships.forEach((ranges, slot) => {
      for (const line of LINES)
        assert.ok(
          inside(ranges[line], before.knowledge.lines[team][slot][line]),
          `${team}/${slot}/${line} widened`
        );
    })
  );
  const ours = (state: CareerState, id: number) =>
    personOf(state, id)?.contract?.team === YOURS;
  for (const p of after.people) {
    if (
      ours(before, p.id) ||
      ours(after, p.id) ||
      personOf(before, p.id) === null
    )
      continue;
    const was = knownStats(before, p.id);
    const now = knownStats(after, p.id);
    assert.ok(was && now);
    now.forEach((range, i) => assert.ok(inside(range, was[i]), `${p.id}`));
  }
  for (const id of before.knowledge.reports)
    if (ownerOf(after, id) !== null || personOf(after, id) !== null)
      assert.ok(after.knowledge.reports.includes(id));
}

type Plan = (state: CareerState) => Command[];

function richest(state: CareerState, role: Role): number {
  const ids = state.teams[YOURS].deals[role]?.candidates ?? [];
  assert.ok(ids.length > 0, `no ${role} candidates`);
  return ids.reduce((best, id) =>
    ask(person(state, id)) > ask(person(state, best)) ? id : best
  );
}

function scripted(state: CareerState): Command[] {
  const at = `${state.season}/${state.phase === 'offseason' ? 'off' : state.race}`;
  const mine = (role: Role) => holderId(state, YOURS, role);
  const offer = (id: number, seasons: 1 | 2 | 3): Command => ({
    type: 'Offer',
    team: YOURS,
    person: id,
    terms: minimumTerms(state, YOURS, id, seasons),
  });
  switch (at) {
    case '1/1':
      return [
        {
          type: 'Approach',
          team: YOURS,
          person: holderId(state, RIVAL, 'driver'),
        },
        { type: 'BuyReport', team: YOURS, person: ownerId(state, 5) },
        {
          type: 'BuyReport',
          team: YOURS,
          person: holderId(state, RIVAL, 'driver'),
        },
      ];
    case '1/2': {
      const designer = richest(state, 'designer');
      return [
        { type: 'BuyReport', team: YOURS, person: designer },
        offer(designer, 1),
        offer(holderId(state, RIVAL, 'driver'), 2),
      ];
    }
    case '1/5':
      return [{ type: 'SetScoutSeat', team: YOURS, role: 'mechanic' }];
    case '1/6':
      return [offer(richest(state, 'mechanic'), 3)];
    case '1/off':
      return [
        offer(mine('designer'), 2),
        { type: 'BuyReport', team: YOURS, person: richest(state, 'driver') },
      ];
    case '2/3':
      return [
        { type: 'Release', team: YOURS, person: mine('mechanic') },
        offer(mine('driver'), 1),
      ];
    case '2/5':
      return [offer(richest(state, 'mechanic'), 1)];
    case '3/2':
      return [{ type: 'Release', team: YOURS, person: mine('designer') }];
    case '3/4':
      return [
        { type: 'SetScoutSeat', team: YOURS, role: 'designer' },
        { type: 'BuyReport', team: YOURS, person: ownerId(state, 30) },
      ];
    default:
      return [];
  }
}

function checked(
  before: CareerState,
  after: CareerState,
  gone: Set<number>
): void {
  for (const p of before.people)
    if (personOf(after, p.id) === null) gone.add(p.id);
  checkPlaces(after, gone);
  checkRanges(after);
  checkNarrowing(before, after);
  assert.deepEqual(JSON.parse(JSON.stringify(after)), after);
}

function play(
  start: CareerState,
  plan: Plan,
  seasons: number
): { state: CareerState; steps: Step[] } {
  const gone = new Set<number>();
  const steps: Step[] = [];
  let state = deepFreeze(start);
  checked(state, state, gone);
  for (let season = 1; season <= seasons; season++) {
    for (let race = 1; race <= SEASON; race++) {
      for (const command of plan(state)) {
        const before = state;
        const copy = structuredClone(before);
        const expected = expectedMoney(before, command);
        const after = deepFreeze(send(before, command));
        assert.deepEqual(before, copy);
        after.teams.forEach((team, index) =>
          assert.equal(
            team.balance - before.teams[index].balance,
            expected[index],
            `${command.type} team ${index}`
          )
        );
        checked(before, after, gone);
        steps.push({ before, after, command });
        state = after;
      }
      const started = deepFreeze(enterPhase(state, 'racing'));
      const money = raceMoneyOf(started);
      const raced = standInResult(matchSetup(started, { hands: 'player' }));
      const after = deepFreeze(
        send(started, { type: 'RecordRace', team: YOURS, result: raced })
      );
      money(after);
      checked(started, after, gone);
      state =
        after.phase === 'lobby'
          ? deepFreeze(send(after, { type: 'MarkRead', team: YOURS }))
          : after;
    }
    for (const command of plan(state)) {
      const before = state;
      const expected = expectedMoney(before, command);
      const after = deepFreeze(send(before, command));
      after.teams.forEach((team, index) =>
        assert.equal(
          team.balance - before.teams[index].balance,
          expected[index]
        )
      );
      checked(before, after, gone);
      steps.push({ before, after, command });
      state = after;
    }
    const finished = deepFreeze(
      send(state, { type: 'FinishOffseason', team: YOURS })
    );
    checked(runPolicies(state).state, finished, gone);
    state = finished;
  }
  return { state, steps };
}

const START = funded(careerOf('ledger'), YOURS, 200000);

test('a scripted three-season career keeps every invariant after every command and race', () => {
  const { state, steps } = play(START, scripted, 3);
  assert.equal(state.season, 4);
  const types: string[] = steps.map((step) => step.command.type);
  for (const type of [
    'Approach',
    'BuyReport',
    'Offer',
    'Release',
    'SetScoutSeat',
  ])
    assert.ok(types.includes(type), type);
  const signed = steps.filter(
    (step) =>
      step.command.type === 'Offer' &&
      personOf(step.after, step.command.person)?.contract?.team === YOURS
  );
  assert.equal(
    signed.length,
    steps.filter((s) => s.command.type === 'Offer').length
  );
  const renewals = signed.filter(
    (step) =>
      step.command.type === 'Offer' &&
      personOf(step.before, step.command.person)?.contract?.team === YOURS
  );
  assert.equal(renewals.length, 2);
  const buyouts = signed.filter(
    (step) =>
      step.command.type === 'Offer' &&
      personOf(step.before, step.command.person)?.contract?.team === RIVAL
  );
  assert.equal(buyouts.length, 1);
  assert.equal(state.teams[YOURS].seats.mechanic, null);
});

test('the scripted career is deterministic', () => {
  const one = play(START, scripted, 2).state;
  const two = play(structuredClone(START), scripted, 2).state;
  assert.deepEqual(one, two);
  assert.notDeepEqual(
    play(funded(careerOf('other'), YOURS, 200000), () => [], 1).state.teams,
    play(START, () => [], 1).state.teams
  );
});
