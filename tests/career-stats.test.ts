// Every stat of every role, and the direction of what it does (Phase B section 2.1, D15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random } from '../src/world/random.ts';
import * as svc from '../src/career/service.ts';
import * as staff from '../src/career/staff.ts';
import * as lead from '../src/career/leadership.ts';
import { ROLE_STATS, type GullOf } from '../src/career/roles.ts';
import { TUNING } from '../src/career/tuning.ts';
import type { Job } from '../src/race.ts';

const LOW = 2, HIGH = 18;
/** a < b, strictly. */
const rises = (f: (x: number) => number, what: string) => assert.ok(f(HIGH) > f(LOW), `${what} should rise with the stat: ${f(LOW)} → ${f(HIGH)}`);
const falls = (f: (x: number) => number, what: string) => assert.ok(f(HIGH) < f(LOW), `${what} should fall with the stat: ${f(LOW)} → ${f(HIGH)}`);

test('every role has its stats (D37)', () => {
  assert.deepEqual(Object.keys(ROLE_STATS).sort(), ['bosun', 'captain', 'elder', 'flight', 'manager', 'scout', 'shipwright']);
  assert.equal(ROLE_STATS.captain.length, 9);
  assert.equal(ROLE_STATS.bosun.length, 8);
  assert.equal(ROLE_STATS.shipwright.length, 9);
  assert.equal(ROLE_STATS.scout.length, 5);
  assert.equal(ROLE_STATS.flight.length, 6);
  assert.equal(ROLE_STATS.manager.length, 6);
  assert.equal(ROLE_STATS.elder.length, 4);
});

test('captain: Feedback gives more points, to the part furthest below its maximum', () => {
  rises(staff.feedbackPoints, 'Feedback points');
  assert.equal(staff.feedbackPoints(20), 30);
  const parts = [{ id: 1, perf: 500, perfMax: 560, spec: false }, { id: 2, perf: 400, perfMax: 600, spec: false }, { id: 3, perf: 100, perfMax: 900, spec: true }];
  assert.equal(staff.feedbackTarget(parts)?.id, 2, 'spec parts are never improved');
  assert.equal(staff.feedbackTarget([{ perf: 5, perfMax: 5, spec: false }]), null);
});

test('bosun: each stat moves its factor the right way', () => {
  rises(svc.repairsFactor, 'Repairs (part rate)');
  rises(svc.mendingFactor, 'Mending (mend rate)');
  falls(svc.arriveSeconds, 'Flight Handling (seconds to arrive)');
  assert.ok(Math.abs(svc.arriveSeconds(20) - 3) < 1e-9 && Math.abs(svc.arriveSeconds(0) - 5) < 1e-9);
  falls(svc.concentrationFactor, 'Concentration (botch)');
  falls(svc.leadershipFatigue, 'Leadership (flight fatigue)');
  rises(svc.leadershipMorale, 'Leadership (flight morale)');
  assert.equal(svc.leadershipMorale(10), 0);
  rises(svc.reliabilityYard, 'Reliability (yard to reliability)');
  rises(svc.perfYard, 'Performance (yard to performance)');
  rises(svc.bondGain, 'Chemistry (bond a race)');
  assert.equal(svc.bondGain(0), 1);
  assert.equal(svc.bondGain(20), 2);
});

test('bond: levels at 5, 12 and 20 unlock arriving sooner, a free repair and a faster Gust', () => {
  assert.deepEqual([0, 4.9, 5, 11.9, 12, 19.9, 20, 40].map(svc.bondLevel), [0, 0, 1, 1, 2, 2, 3, 3]);
  const base: svc.Crewing = { bosun: null, flight: [], order: ['part', 'mend', 'gust', 'stores'], bond: 0 };
  const at = (bond: number) => svc.service({ ...base, bond });
  assert.ok(at(5).arrive < at(0).arrive);
  assert.equal(at(5).arrive, at(0).arrive - TUNING.bond.sooner);
  assert.equal(at(5).freeRepair, false);
  assert.equal(at(12).freeRepair, true);
  assert.equal(at(12).gustRecharge, 1);
  assert.equal(at(20).gustRecharge, 0.9);
});

const flightStats = (v: number): GullOf<'flight'>['stats'] => ({ speed: v, strength: v, precision: v, teamwork: v, nerve: v, stamina: v });

test('flight: each stat of a job\'s weights raises its rating; fatigue lowers the rate and raises botch', () => {
  const weights = TUNING.flight.weights;
  for (const job of Object.keys(weights) as Job[]) {
    for (const k of Object.keys(weights[job])) {
      rises((x) => svc.rating({ ...flightStats(10), [k]: x }, job), `${k} for ${job}`);
    }
    // a stat outside the job's weights does nothing to its rating
    const outside = (['speed', 'strength', 'precision', 'teamwork'] as const).filter((k) => !(k in weights[job]));
    for (const k of outside) assert.equal(svc.rating({ ...flightStats(10), [k]: LOW }, job), svc.rating({ ...flightStats(10), [k]: HIGH }, job));
  }
  rises((r) => svc.jobRate(r / 20, 0), 'rating (rate)');
  falls((f) => svc.jobRate(0.5, f * 5), 'fatigue (rate)');
  falls((p) => svc.jobBotch(p, 0), 'Precision (botch)');
  rises((f) => svc.jobBotch(10, f * 5), 'fatigue (botch)');
  falls((n) => svc.underFire([n, n, n, n]), 'Nerve (under fire)');
  assert.equal(svc.underFire([20, 20, 20, 20]), 1);
  falls(svc.fatigueGained, 'Stamina (fatigue a race)');
  assert.equal(svc.fatigueGained(0), 37.5);
});

test('flight: fatigue falls 10 × (1 + flight loft level) a day, in closed form, never below 0', () => {
  const g = { fatigue: 80, fatigueDay: 10 };
  assert.equal(svc.fatigueOn(g, 10, 1), 80);
  assert.equal(svc.fatigueOn(g, 12, 1), 40);
  assert.equal(svc.fatigueOn(g, 12, 3), 0);
  assert.equal(svc.fatigueOn(g, 100, 1), 0);
  assert.ok(svc.recovery(3) > svc.recovery(1));
});

test('service: the bosun\'s factors and the flight\'s ratings land in the Service the sim reads', () => {
  const flight = (v: number, fatigue = 0) => (['mend', 'gust', 'stores', 'part'] as Job[]).map((job) => ({ job, stats: flightStats(v), fatigue }));
  const bosun = (v: number): GullOf<'bosun'>['stats'] => ({ repairs: v, mending: v, handling: v, concentration: v, leadership: v, reliability: v, perf: v, chemistry: v });
  const at = (b: number, f: number, fatigue = 0) => svc.service({ bosun: bosun(b), flight: flight(f, fatigue), order: ['part', 'mend', 'gust', 'stores'], bond: 0 });
  for (const job of ['mend', 'gust', 'stores', 'part'] as Job[]) {
    assert.ok(at(10, HIGH).rate[job] > at(10, LOW).rate[job], `flight raise ${job}'s rate`);
    assert.ok(at(10, HIGH).botch[job] < at(10, LOW).botch[job], `flight lower ${job}'s botch`);
    assert.ok(at(HIGH, 10).botch[job] < at(LOW, 10).botch[job], `bosun lowers ${job}'s botch`);
    assert.ok(at(10, 10, 80).rate[job] < at(10, 10, 0).rate[job], `fatigue slows ${job}`);
  }
  assert.ok(at(HIGH, 10).rate.part > at(LOW, 10).rate.part);
  assert.ok(at(HIGH, 10).rate.mend > at(LOW, 10).rate.mend);
  assert.equal(at(HIGH, 10).rate.gust, at(LOW, 10).rate.gust, 'the bosun touches only mend and part');
  assert.ok(at(HIGH, 10).arrive < at(LOW, 10).arrive);
  assert.ok(at(10, HIGH).underFire < at(10, LOW).underFire);
  assert.deepEqual(at(10, 10).order, ['part', 'mend', 'gust', 'stores']);
});

test('shipwright: type stats start designs higher; Innovation teaches more; Speed and Accuracy shorten and narrow', () => {
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

test('scout: Judgement narrows and centres the star range; Insight the potential\'s, and shows a trait at 14', () => {
  falls(staff.starWidth, 'Judgement (width)');
  assert.equal(staff.starWidth(20), 0.5);
  assert.equal(staff.starWidth(0), 2.5);
  const spread = (j: number) => {
    const rand = random(9);
    let most = 0;
    for (let i = 0; i < 300; i++) most = Math.max(most, Math.abs(staff.centreOff(j, rand)));
    return most;
  };
  falls(spread, 'Judgement (centre off)');
  falls((i) => staff.potentialWidth(i, false), 'Insight (potential width, unscouted)');
  falls((i) => staff.potentialWidth(i, true), 'Insight (potential width, scouted)');
  assert.ok(staff.potentialWidth(10, true) < staff.potentialWidth(10, false));
  assert.equal(staff.traitShows(13.9), false);
  assert.equal(staff.traitShows(14), true);
  assert.deepEqual(staff.shownRange(3, 1), [2.5, 3.5]);
});

test('scout: Reach sees free agents and the own league always, the adjacent at 7, all at 14; Speed shortens; Persuasion persuades', () => {
  assert.equal(staff.inReach(0, 2, null), true);
  assert.equal(staff.inReach(0, 2, 2), true);
  assert.equal(staff.inReach(6.9, 2, 1), false);
  assert.equal(staff.inReach(7, 2, 1), true);
  assert.equal(staff.inReach(13.9, 2, 0), false);
  assert.equal(staff.inReach(14, 2, 0), true);
  falls((x) => staff.scoutDays(x, 1), 'Speed (days)');
  assert.ok(staff.scoutDays(10, 3) < staff.scoutDays(10, 1), 'the crow\'s nest shortens scouting');
  assert.equal(staff.scoutDays(0, 1), Math.round(14 * 1.3));
  const count = (p: number) => {
    const rand = random(3);
    let n = 0;
    for (let i = 0; i < 400; i++) if (staff.persuades(p, 0, 10, rand)) n++;
    return n;
  };
  rises(count, 'Persuasion');
  assert.equal(staff.persuades(20, 0, 31, random(1)), false, 'only within 30 days of the report');
});

test('manager: Negotiation bids lower, Talent Eye weighs potential, Finance commits more, Development sharpens the yard, Tactics holds, Politics sways', () => {
  falls(lead.bidShare, 'Negotiation (bid)');
  rises((t) => lead.worth(t, 2, 4), 'Talent Eye (worth of a high-potential gull)');
  falls((t) => lead.worth(t, 4, 2), 'Talent Eye (worth of a gull past potential)');
  rises((f) => lead.commitment(f, 1000, -500), 'Finance (commitment)');
  assert.equal(lead.commitment(20, -900, -500), 0);
  const needs = [3, 1, 0.5];
  rises((d) => lead.yardSplit(d, needs)[0], 'Development (share to the neediest)');
  assert.ok(Math.abs(lead.yardSplit(10, needs).reduce((a, b) => a + b) - 1) < 1e-9);
  const holds = (t: number) => {
    const rand = random(4);
    let n = 0;
    for (let i = 0; i < 400; i++) if (lead.tacticsHolds(t, rand)) n++;
    return n;
  };
  rises(holds, 'Tactics');
  rises((p) => lead.sway(p, 60), 'Politics (sway)');
});

test('elder: Ambition raises the target, Patience softens falls, Generosity gives and lowers the floor, Meddling meddles', () => {
  falls((a) => lead.targetPlace(a, 20), 'Ambition (target place, lower is higher)');
  assert.equal(lead.targetPlace(20, 2), 1);
  const fall = (p: number) => lead.confidenceMove(p, 5, 15, 10);
  assert.ok(fall(LOW) < fall(HIGH), 'the patient lose less confidence');
  assert.equal(lead.confidenceMove(LOW, 10, 2, 10), lead.confidenceMove(HIGH, 10, 2, 10), 'a rise is not scaled by Patience');
  assert.equal(lead.confidenceMove(10, 10, 2, 10), 4, 'a rise is capped at 4');
  assert.ok(lead.confidenceMove(0, 1, 40, 10) >= -5 * 1.3 - 1e-9);
  assert.equal(lead.debtMove(-10, -100), TUNING.elder.debt);
  assert.equal(lead.debtMove(-200, -100), TUNING.elder.pastFloor);
  assert.ok(TUNING.elder.pastFloor < 0, 'past the floor costs confidence');
  assert.equal(lead.debtMove(5, -100), 0);
  rises((g) => lead.endowment(g, 1000), 'Generosity (endowment)');
  falls((g) => lead.debtFloor(g, 1000), 'Generosity (floor, lower is deeper)');
  rises(lead.meddleChance, 'Meddling');
});
