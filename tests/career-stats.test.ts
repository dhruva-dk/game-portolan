// Every stat of every role, and the direction of what it does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../src/world/random.ts';
import * as pit from '../src/career/pit.ts';
import * as staff from '../src/career/staff.ts';
import * as lead from '../src/career/leadership.ts';
import { ROLE_STATS, type PersonOf } from '../src/career/roles.ts';
import { TUNING } from '../src/career/tuning.ts';

const LOW = 2,
  HIGH = 18;
/** a < b, strictly. */
const rises = (f: (x: number) => number, what: string) =>
  assert.ok(
    f(HIGH) > f(LOW),
    `${what} should rise with the stat: ${f(LOW)} → ${f(HIGH)}`
  );
const falls = (f: (x: number) => number, what: string) =>
  assert.ok(
    f(HIGH) < f(LOW),
    `${what} should fall with the stat: ${f(LOW)} → ${f(HIGH)}`
  );

test('every role has its stats', () => {
  assert.deepEqual(Object.keys(ROLE_STATS).sort(), [
    'chairman',
    'designer',
    'driver',
    'manager',
    'mechanic',
    'pit',
    'scout',
  ]);
  assert.equal(ROLE_STATS.driver.length, 9);
  assert.equal(ROLE_STATS.mechanic.length, 8);
  assert.equal(ROLE_STATS.designer.length, 9);
  assert.equal(ROLE_STATS.scout.length, 5);
  assert.equal(ROLE_STATS.pit.length, 6);
  assert.equal(ROLE_STATS.manager.length, 6);
  assert.equal(ROLE_STATS.chairman.length, 4);
});

test('driver: Feedback gives more points, to the part furthest below its maximum', () => {
  rises(staff.feedbackPoints, 'Feedback points');
  assert.equal(staff.feedbackPoints(20), 30);
  const parts = [
    { id: 1, perf: 500, perfMax: 560, spec: false },
    { id: 2, perf: 400, perfMax: 600, spec: false },
    { id: 3, perf: 100, perfMax: 900, spec: true },
  ];
  assert.equal(
    staff.feedbackTarget(parts)?.id,
    2,
    'spec parts are never improved'
  );
  assert.equal(
    staff.feedbackTarget([{ perf: 5, perfMax: 5, spec: false }]),
    null
  );
});

test('mechanic: each stat moves its factor the right way', () => {
  rises(pit.repairsFactor, 'Repairs (pit work)');
  rises(pit.mendingFactor, 'Mending (pit work)');
  falls(pit.handlingFactor, 'Pit Handling (pit pace)');
  falls(pit.concentrationFactor, 'Concentration (slips)');
  falls(pit.leadershipFatigue, 'Leadership (pit crew fatigue)');
  rises(pit.leadershipMorale, 'Leadership (pit crew morale)');
  assert.equal(pit.leadershipMorale(10), 0);
  rises(pit.reliabilityImprovement, 'Reliability (improvement to reliability)');
  rises(pit.perfImprovement, 'Performance (improvement to performance)');
  rises(pit.bondGain, 'Chemistry (bond a race)');
  assert.equal(pit.bondGain(0), 1);
  assert.equal(pit.bondGain(20), 2);
});

const pitStats = (v: number): PersonOf<'pit'>['stats'] => ({
  speed: v,
  strength: v,
  precision: v,
  teamwork: v,
  nerve: v,
  stamina: v,
});
const mechanic = (v: number): PersonOf<'mechanic'>['stats'] => ({
  repairs: v,
  mending: v,
  handling: v,
  concentration: v,
  leadership: v,
  reliability: v,
  perf: v,
  chemistry: v,
});
const member = (v: number, fatigue = 0): pit.Member => ({
  stats: pitStats(v),
  fatigue,
  rested: false,
  pushed: false,
});
const crewOf = (v: number, fatigue = 0) =>
  Array.from({ length: TUNING.world.pit }, () => member(v, fatigue));

test('bond: levels at 5, 12 and 20, each a quicker stop', () => {
  assert.deepEqual(
    [0, 4.9, 5, 11.9, 12, 19.9, 20, 40].map(pit.bondLevel),
    [0, 0, 1, 1, 2, 2, 3, 3]
  );
  const at = (bond: number) =>
    pit.pitCrew({ mechanic: mechanic(10), crew: crewOf(10), bond });
  assert.deepEqual(
    [0, 5, 12, 20].map((b) => at(b).pace / at(0).pace),
    TUNING.bond.pace
  );
  assert.equal(at(20).slip, at(0).slip, 'a bond steadies no hand');
});

test("pit crew: Speed, Strength and Teamwork raise a member's work, Precision and Nerve lower their slips; fatigue does the reverse; Stamina tires them less", () => {
  for (const k of ['speed', 'strength', 'teamwork'] as const) {
    rises((x) => pit.work({ ...pitStats(10), [k]: x }, 0), `${k} (work)`);
    assert.equal(
      pit.slipOf({ ...pitStats(10), [k]: LOW }, 0),
      pit.slipOf({ ...pitStats(10), [k]: HIGH }, 0),
      `${k} moves no slip`
    );
  }
  for (const k of ['precision', 'nerve'] as const) {
    falls((x) => pit.slipOf({ ...pitStats(10), [k]: x }, 0), `${k} (slip)`);
    assert.equal(
      pit.work({ ...pitStats(10), [k]: LOW }, 0),
      pit.work({ ...pitStats(10), [k]: HIGH }, 0),
      `${k} moves no work`
    );
  }
  assert.equal(pit.work(pitStats(10), 0), 1, 'tens, rested, work as the spec');
  falls((f) => pit.work(pitStats(10), f * 5), 'fatigue (work)');
  rises((f) => pit.slipOf(pitStats(10), f * 5), 'fatigue (slip)');
  falls(pit.fatigueGained, 'Stamina (fatigue a race)');
  assert.equal(pit.fatigueGained(0), 37.5);
});

test('pit crew: fatigue falls 10 × (1 + pit house level) a day, in closed form, never below 0', () => {
  const g = { fatigue: 80, fatigueDay: 10 };
  assert.equal(pit.fatigueOn(g, 10, 1), 80);
  assert.equal(pit.fatigueOn(g, 12, 1), 40);
  assert.equal(pit.fatigueOn(g, 12, 3), 0);
  assert.equal(pit.fatigueOn(g, 100, 1), 0);
  assert.ok(pit.recovery(3) > pit.recovery(1));
});

test("a ship's pit: her mechanic and the pit crew land in the pace and slip the sim reads (race.ts PitCrew)", () => {
  const at = (m: number, crew: number, fatigue = 0) =>
    pit.pitCrew({
      mechanic: mechanic(m),
      crew: crewOf(crew, fatigue),
      bond: 0,
    });
  const spec = at(10, 10);
  assert.ok(Math.abs(spec.pace - 1) < 1e-9, 'tens all round are the spec pace');
  assert.ok(spec.slip > 0 && spec.slip < 1);
  assert.ok(at(10, HIGH).pace < at(10, LOW).pace, 'a better crew is quicker');
  assert.ok(at(10, HIGH).slip < at(10, LOW).slip, 'and slips less');
  assert.ok(at(HIGH, 10).pace < at(LOW, 10).pace, 'a better mechanic too');
  assert.ok(at(HIGH, 10).slip < at(LOW, 10).slip);
  assert.ok(at(10, 10, 80).pace > at(10, 10, 0).pace, 'fatigue slows a stop');
  assert.ok(at(10, 10, 80).slip > at(10, 10, 0).slip, 'and slips more');
  // each of the mechanic's four stop stats on its own
  const one = (k: 'repairs' | 'mending' | 'handling' | 'concentration') => {
    const with1 = (v: number) =>
      pit.pitCrew({
        mechanic: { ...mechanic(10), [k]: v },
        crew: crewOf(10),
        bond: 0,
      });
    return [with1(LOW), with1(HIGH)];
  };
  for (const k of ['repairs', 'mending', 'handling'] as const) {
    const [low, high] = one(k);
    assert.ok(high.pace < low.pace, `${k} quickens the stop`);
    assert.equal(high.slip, low.slip);
  }
  const [low, high] = one('concentration');
  assert.ok(high.slip < low.slip);
  assert.equal(high.pace, low.pace);
  // a place no one fills, and no mechanic, are the worst there is
  const short = pit.pitCrew({
    mechanic: mechanic(10),
    crew: crewOf(10).slice(1),
    bond: 0,
  });
  assert.ok(short.pace > spec.pace && short.slip > spec.slip);
  const none = pit.pitCrew({ mechanic: null, crew: crewOf(10), bond: 0 });
  assert.ok(none.pace > at(LOW, 10).pace && none.slip >= at(LOW, 10).slip);
  // a dilemma's rest and push
  const rested = pit.pitCrew({
    mechanic: mechanic(10),
    crew: [{ ...member(10), rested: true }, ...crewOf(10).slice(1)],
    bond: 0,
  });
  assert.ok(rested.pace > spec.pace, 'a member rested works less this race');
  const pushed = pit.pitCrew({
    mechanic: mechanic(10),
    crew: [{ ...member(10), pushed: true }, ...crewOf(10).slice(1)],
    bond: 0,
  });
  assert.ok(pushed.slip > spec.slip, 'a member pushed on slips more');
});

test('designer: type stats start designs higher; Innovation teaches more; Speed and Accuracy shorten and narrow', () => {
  rises(staff.designHead, 'a type stat (start)');
  assert.equal(staff.designHead(10), 80);
  rises(staff.innovationChance, 'Innovation');
  falls(staff.designSpeed, 'Speed (design days)');
  falls(staff.accuracyBand, 'Accuracy (band)');
  assert.equal(staff.accuracyBand(20), 0);
  const rand = random(5);
  for (let i = 0; i < 200; i++) {
    const f = staff.accuracyDraw(8, rand);
    assert.ok(Math.abs(f - 1) <= staff.accuracyBand(8) + 1e-12);
  }
  assert.equal(staff.componentsKnown(2.5), 6);
  assert.equal(staff.componentsKnown(4), 7);
});

test("scout: Judgement narrows and centres the star range; Insight the potential's, and shows a trait at 14", () => {
  falls(staff.starWidth, 'Judgement (width)');
  assert.equal(staff.starWidth(20), 0.5);
  assert.equal(staff.starWidth(0), 2.5);
  const spread = (j: number) => {
    const rand = random(9);
    let most = 0;
    for (let i = 0; i < 300; i++)
      most = Math.max(most, Math.abs(staff.centreOff(j, rand)));
    return most;
  };
  falls(spread, 'Judgement (centre off)');
  falls(
    (i) => staff.potentialWidth(i, false),
    'Insight (potential width, unscouted)'
  );
  falls(
    (i) => staff.potentialWidth(i, true),
    'Insight (potential width, scouted)'
  );
  assert.ok(staff.potentialWidth(10, true) < staff.potentialWidth(10, false));
  assert.equal(staff.traitShows(13.9), false);
  assert.equal(staff.traitShows(14), true);
  assert.deepEqual(staff.shownRange(3, 1), [2.5, 3.5]);
});

test('scout: Reach sees free agents and the own tier always, the adjacent at 7, all at 14; Speed shortens; Persuasion persuades', () => {
  assert.equal(staff.inReach(0, 2, null), true);
  assert.equal(staff.inReach(0, 2, 2), true);
  assert.equal(staff.inReach(6.9, 2, 1), false);
  assert.equal(staff.inReach(7, 2, 1), true);
  assert.equal(staff.inReach(13.9, 2, 0), false);
  assert.equal(staff.inReach(14, 2, 0), true);
  falls((x) => staff.scoutDays(x, 1), 'Speed (days)');
  assert.ok(
    staff.scoutDays(10, 3) < staff.scoutDays(10, 1),
    "the crow's nest shortens scouting"
  );
  assert.equal(staff.scoutDays(0, 1), Math.round(14 * 1.3));
  const count = (p: number) => {
    const rand = random(3);
    let n = 0;
    for (let i = 0; i < 400; i++) if (staff.persuades(p, 0, 10, rand)) n++;
    return n;
  };
  rises(count, 'Persuasion');
  assert.equal(
    staff.persuades(20, 0, 31, random(1)),
    false,
    'only within 30 days of the report'
  );
});

test('manager: Negotiation bids lower, Talent Eye weighs potential, Finance commits more, Development sharpens the improvement, Tactics holds, Politics sways', () => {
  falls(lead.bidShare, 'Negotiation (bid)');
  rises(
    (t) => lead.worth(t, 2, 4),
    'Talent Eye (worth of a high-potential person)'
  );
  falls(
    (t) => lead.worth(t, 4, 2),
    'Talent Eye (worth of a person past potential)'
  );
  rises((f) => lead.commitment(f, 1000, -500), 'Finance (commitment)');
  assert.equal(lead.commitment(20, -900, -500), 0);
  const needs = [3, 1, 0.5];
  rises(
    (d) => lead.improvementSplit(d, needs)[0],
    'Development (share to the neediest)'
  );
  assert.ok(
    Math.abs(lead.improvementSplit(10, needs).reduce((a, b) => a + b) - 1) <
      1e-9
  );
  const holds = (t: number) => {
    const rand = random(4);
    let n = 0;
    for (let i = 0; i < 400; i++) if (lead.tacticsHolds(t, rand)) n++;
    return n;
  };
  rises(holds, 'Tactics');
  rises((p) => lead.sway(p, 60), 'Politics (sway)');
});

test('chairman: Ambition raises the target, Patience softens falls, Generosity gives and lowers the floor, Meddling meddles', () => {
  falls(
    (a) => lead.targetPlace(a, 20),
    'Ambition (target place, lower is higher)'
  );
  assert.equal(lead.targetPlace(20, 2), 1);
  const fall = (p: number) => lead.confidenceMove(p, 5, 15, 10);
  assert.ok(fall(LOW) < fall(HIGH), 'the patient lose less confidence');
  assert.equal(
    lead.confidenceMove(LOW, 10, 2, 10),
    lead.confidenceMove(HIGH, 10, 2, 10),
    'a rise is not scaled by Patience'
  );
  assert.equal(lead.confidenceMove(10, 10, 2, 10), 4, 'a rise is capped at 4');
  assert.ok(lead.confidenceMove(0, 1, 40, 10) >= -5 * 1.3 - 1e-9);
  assert.equal(lead.debtMove(-10, -100), TUNING.chairman.debt);
  assert.equal(lead.debtMove(-200, -100), TUNING.chairman.pastFloor);
  assert.ok(TUNING.chairman.pastFloor < 0, 'past the floor costs confidence');
  assert.equal(lead.debtMove(5, -100), 0);
  rises((g) => lead.endowment(g, 1000), 'Generosity (endowment)');
  falls((g) => lead.debtFloor(g, 1000), 'Generosity (floor, lower is deeper)');
  rises(lead.meddleChance, 'Meddling');
});
