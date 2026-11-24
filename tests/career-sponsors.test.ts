import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, newCareer, type Applied } from '../src/career/apply.ts';
import type { Command, Reason } from '../src/career/commands.ts';
import { matchSetup } from '../src/career/fit.ts';
import { SPONSOR_ROSTER } from '../src/career/names.ts';
import { moneyTotal, teamMoney } from '../src/career/record/pay.ts';
import { objectiveMet } from '../src/career/rules/objective.ts';
import { reputations } from '../src/career/rules/reputation.ts';
import { sponsorBonus, sponsorFee } from '../src/career/rules/sponsor-fee.ts';
import { drawOffers } from '../src/career/sponsors/offers.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  OBJECTIVES,
  type CareerState,
  type Objective,
  type Sponsor,
  type Team,
} from '../src/career/state.ts';
import { LEAGUE } from '../src/career/tuning.ts';
import type { MatchResult, ShipResult } from '../src/sim/result.ts';

const YOURS = 0;
const RIVAL = 12;
const TEAMS = LEAGUE.teams;
const SHIPS = TEAMS * LEAGUE.shipsPerTeam;
const SEASON = LEAGUE.racesPerSeason;
const SEEDS = ['pennant', 'gullet', 'tarbuckle'];

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 0, pattern: 0 },
    emblem: 0,
  });

const BASE = careerOf('pennant');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

const sendRaw = (state: CareerState, command: unknown): Applied =>
  Reflect.apply(apply, undefined, [state, command]);

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(Reflect.get(value, key));
  }
  return value;
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

const offer = (
  sponsor: number,
  objective: Objective,
  fee: number,
  racesLeft: number
): Sponsor => ({ sponsor, fee, bonus: 2 * fee, objective, racesLeft });

const signedSponsors = (team: Team): Sponsor[] =>
  team.sponsors.filter((sponsor) => sponsor !== null);

function checkOffers(
  team: Team,
  offers: readonly Sponsor[],
  reputation: number
): void {
  assert.equal(offers.length, 3);
  const ids = offers.map((o) => o.sponsor);
  assert.equal(new Set(ids).size, 3);
  for (const o of offers) {
    assert.ok(Number.isInteger(o.sponsor));
    assert.ok(o.sponsor >= 0 && o.sponsor < SPONSOR_ROSTER.length);
    assert.ok(
      !signedSponsors(team).some((s) => s.sponsor === o.sponsor),
      'not already signed'
    );
    assert.ok(o.fee >= sponsorFee(reputation, 0.8), `${o.fee} low`);
    assert.ok(o.fee <= sponsorFee(reputation, 1.2), `${o.fee} high`);
    assert.equal(o.fee % 10, 0);
    assert.equal(o.bonus, 2 * o.fee);
    assert.ok(OBJECTIVES.includes(o.objective));
    assert.ok(Number.isInteger(o.racesLeft));
    assert.ok(o.racesLeft >= 5 && o.racesLeft <= 10);
  }
}

test('the sponsor fee of §1.8.5 at hand-worked points', () => {
  assert.equal(sponsorFee(40, 1), 100);
  assert.equal(sponsorFee(40, 0.8), 80);
  assert.equal(sponsorFee(40, 1.2), 120);
  assert.equal(sponsorFee(40, 0.83), 80);
  assert.equal(sponsorFee(40, 0.86), 90);
  assert.equal(sponsorFee(1, 1), 1500);
  assert.equal(sponsorFee(1, 0.8), 1200);
  assert.equal(sponsorFee(1, 1.2), 1800);
  assert.equal(sponsorFee(30.25, 1), 280);
  assert.equal(sponsorFee(30.25, 1.2), 330);
  assert.equal(sponsorBonus(100), 200);
  assert.equal(sponsorBonus(1500), 3000);
  for (let r = 1; r < 40; r++)
    assert.ok(sponsorFee(r, 1) >= sponsorFee(r + 1, 1));
});

const ship = (
  place: number,
  sinkings: number,
  afloatAtPhaseFour: boolean
): ShipResult => ({
  place,
  sunkAt: afloatAtPhaseFour ? null : 100,
  sunkBy: null,
  sinkings,
  shotsFired: 10,
  shotsLanded: 3,
  damageDealt: 0,
  damageTaken: 0,
  afloatAtPhaseFour,
});

const flat = (share: number): number[] =>
  Array.from({ length: 7 }, () => share);

test('each objective is met exactly as the table of §1.8.5 says', () => {
  const sea = flat(0);
  assert.equal(
    objectiveMet('top10', [ship(10, 0, false), ship(80, 0, false)], sea),
    true
  );
  assert.equal(
    objectiveMet('top10', [ship(40, 0, false), ship(1, 0, false)], sea),
    true
  );
  assert.equal(
    objectiveMet('top10', [ship(11, 0, true), ship(12, 0, true)], sea),
    false
  );
  assert.equal(
    objectiveMet('sinkTwo', [ship(50, 1, false), ship(60, 1, false)], sea),
    true
  );
  assert.equal(
    objectiveMet('sinkTwo', [ship(50, 2, false), ship(60, 0, false)], sea),
    true
  );
  assert.equal(
    objectiveMet('sinkTwo', [ship(1, 1, true), ship(2, 0, true)], sea),
    false
  );
  const two = [ship(50, 0, false), ship(60, 0, false)];
  assert.equal(objectiveMet('sea', two, flat(0.03)), true);
  assert.equal(objectiveMet('sea', two, [0, 0, 0, 0, 0, 0, 0.21]), true);
  assert.equal(objectiveMet('sea', two, flat(0.029)), false);
  assert.equal(objectiveMet('sea', two, [0, 0, 0, 0, 0, 0, 0.2]), false);
  assert.equal(
    objectiveMet('bothAfloat', [ship(70, 0, true), ship(80, 0, true)], sea),
    true
  );
  assert.equal(
    objectiveMet('bothAfloat', [ship(1, 5, true), ship(2, 5, false)], sea),
    false
  );
  assert.equal(
    objectiveMet('bothAfloat', [ship(1, 0, false), ship(2, 0, true)], sea),
    false
  );
});

test('newCareer gives each rival three sponsors dealt as offers for a reputation of its index', () => {
  for (const seed of SEEDS) {
    const state = careerOf(seed);
    assert.deepEqual(state.teams[YOURS].sponsors, [null, null, null]);
    assert.deepEqual(state.teams[YOURS].offers, []);
    for (let index = 1; index < TEAMS; index++) {
      const team = state.teams[index];
      const sponsors = signedSponsors(team);
      assert.equal(sponsors.length, 3);
      checkOffers({ ...team, sponsors: [null, null, null] }, sponsors, index);
      assert.deepEqual(
        sponsors,
        drawOffers({
          seed,
          season: 1,
          race: 1,
          team: index,
          reputation: index,
          held: [],
          races: { lo: 5, hi: 10 },
        })
      );
      assert.deepEqual(team.offers, []);
    }
    const strong = state.teams.slice(1, 6).flatMap(signedSponsors);
    const weak = state.teams.slice(35).flatMap(signedSponsors);
    assert.ok(
      Math.min(...strong.map((s) => s.fee)) >
        Math.max(...weak.map((s) => s.fee))
    );
  }
  assert.notDeepEqual(
    careerOf('a').teams[5].sponsors,
    careerOf('b').teams[5].sponsors
  );
});

function result(
  yours: readonly ShipResult[],
  sea: readonly number[]
): MatchResult {
  const taken = new Set(yours.map((s) => s.place));
  const rest = Array.from({ length: SHIPS }, (_, i) => i + 1).filter(
    (place) => !taken.has(place)
  );
  const ships = Array.from({ length: SHIPS }, (_, id): ShipResult => {
    if (id < 2) return yours[id];
    const place = rest[id - 2];
    return ship(place, 0, place <= 20);
  });
  return {
    seconds: 480,
    hash: 'hand',
    ships,
    sea: Array.from({ length: TEAMS }, (_, team) =>
      team === YOURS ? [...sea] : flat(0.01)
    ),
  };
}

function withOffers(
  state: CareerState,
  offers: readonly Sponsor[]
): CareerState {
  return changeTeam(state, YOURS, (t) => ({ ...t, offers: [...offers] }));
}

function race(state: CareerState, raced: MatchResult): CareerState {
  const started = send(state, { type: 'StartRace', team: YOURS });
  return send(started, { type: 'RecordRace', team: YOURS, result: raced });
}

test('SignSponsor puts an offer in an empty slot at no cost and keeps the other offers', () => {
  for (const phase of ['lobby', 'offseason'] as const) {
    const offers = [
      offer(3, 'top10', 400, 6),
      offer(8, 'sea', 500, 5),
      offer(13, 'bothAfloat', 600, 10),
    ];
    const state = { ...withOffers(BASE, offers), phase };
    const before = structuredClone(state);
    const next = send(deepFreeze(state), {
      type: 'SignSponsor',
      team: YOURS,
      offer: 1,
      slot: 2,
    });
    assert.deepEqual(state, before);
    assert.deepEqual(
      next,
      changeTeam(state, YOURS, (t) => ({
        ...t,
        sponsors: [null, null, offers[1]],
        offers: [offers[0], offers[2]],
      }))
    );
    const again = send(next, {
      type: 'SignSponsor',
      team: YOURS,
      offer: 1,
      slot: 0,
    });
    assert.deepEqual(again.teams[YOURS].sponsors, [offers[2], null, offers[1]]);
    assert.deepEqual(again.teams[YOURS].offers, [offers[0]]);
    assert.equal(again.teams[YOURS].balance, state.teams[YOURS].balance);
    assert.deepEqual(JSON.parse(JSON.stringify(again)), again);
  }
});

test('SignSponsor is refused into a filled slot, for no such offer, a bad field and in a race', () => {
  const offers = [offer(3, 'top10', 400, 6), offer(8, 'sea', 500, 5)];
  const state = send(withOffers(BASE, offers), {
    type: 'SignSponsor',
    team: YOURS,
    offer: 0,
    slot: 1,
  });
  const sign = (o: unknown, slot: unknown) => ({
    type: 'SignSponsor',
    team: YOURS,
    offer: o,
    slot,
  });
  refusedUntouched(state, sign(0, 1), 'locked');
  refusedUntouched(state, sign(1, 0), 'unknown');
  refusedUntouched(state, sign(0, 3), 'invalid');
  refusedUntouched(state, sign(-1, 0), 'invalid');
  refusedUntouched(state, sign(0.5, 0), 'invalid');
  refusedUntouched({ ...state, phase: 'racing' }, sign(0, 0), 'phase');
  refusedUntouched(BASE, sign(0, 0), 'unknown');
  const rival = changeTeam(BASE, RIVAL, (t) => ({ ...t, offers }));
  refusedUntouched(
    rival,
    { type: 'SignSponsor', team: RIVAL, offer: 0, slot: 2 },
    'locked'
  );
});

test('a sponsor pays its fee every race and its bonus only when the objective is met', () => {
  const cases: [Objective, ShipResult[], number[], boolean][] = [
    ['top10', [ship(9, 0, false), ship(70, 0, false)], flat(0), true],
    ['top10', [ship(11, 0, true), ship(70, 0, true)], flat(0.5), false],
    ['sinkTwo', [ship(30, 1, false), ship(31, 1, false)], flat(0), true],
    ['sinkTwo', [ship(1, 1, true), ship(31, 0, false)], flat(0), false],
    ['sea', [ship(60, 0, false), ship(61, 0, false)], flat(0.04), true],
    ['sea', [ship(1, 3, true), ship(2, 3, true)], flat(0.02), false],
    ['bothAfloat', [ship(30, 0, true), ship(40, 0, true)], flat(0), true],
    ['bothAfloat', [ship(1, 4, true), ship(4, 0, false)], flat(0.3), false],
  ];
  for (const [objective, yours, sea, met] of cases) {
    const signed = send(withOffers(BASE, [offer(20, objective, 700, 5)]), {
      type: 'SignSponsor',
      team: YOURS,
      offer: 0,
      slot: 1,
    });
    const raced = result(yours, sea);
    const next = race(signed, raced);
    const report = next.lastRace;
    assert.ok(report);
    assert.deepEqual(report.money.sponsors, [
      { sponsor: 20, objective, met, amount: met ? 2100 : 700 },
    ]);
    const others = teamMoney({ ...signed, teams: BASE.teams }, raced, YOURS);
    assert.equal(
      report.balance.after - report.balance.before,
      moneyTotal(others) + (met ? 2100 : 700),
      objective
    );
  }
});

test('a sponsor counts down after each race and its slot empties at 0', () => {
  const offers = [offer(1, 'top10', 300, 2), offer(2, 'sea', 200, 1)];
  let state = withOffers(BASE, offers);
  state = send(state, { type: 'SignSponsor', team: YOURS, offer: 0, slot: 0 });
  state = send(state, { type: 'SignSponsor', team: YOURS, offer: 0, slot: 2 });
  const raced = result([ship(50, 0, false), ship(60, 0, false)], flat(0));
  const first = race(state, raced);
  assert.deepEqual(first.teams[YOURS].sponsors, [
    { ...offers[0], racesLeft: 1 },
    null,
    null,
  ]);
  assert.deepEqual(
    first.lastRace?.money.sponsors.map((row) => row.amount),
    [300, 200]
  );
  const second = race(send(first, { type: 'MarkRead', team: YOURS }), raced);
  assert.deepEqual(second.teams[YOURS].sponsors, [null, null, null]);
  assert.deepEqual(
    second.lastRace?.money.sponsors.map((row) => row.amount),
    [300]
  );
  const third = race(send(second, { type: 'MarkRead', team: YOURS }), raced);
  assert.deepEqual(third.lastRace?.money.sponsors, []);
});

test('three offers are dealt to every team after every race, replacing the unsigned ones', () => {
  let state = withOffers(BASE, [offer(59, 'top10', 100, 5)]);
  state = send(state, { type: 'SignSponsor', team: YOURS, offer: 0, slot: 0 });
  state = withOffers(state, [offer(58, 'sea', 100, 5)]);
  for (let n = 1; n <= SEASON; n++) {
    const started = send(state, { type: 'StartRace', team: YOURS });
    const raced = standInResult(matchSetup(started, { hands: 'player' }));
    const next = send(started, {
      type: 'RecordRace',
      team: YOURS,
      result: raced,
    });
    const reputation = reputations(next);
    for (let team = 0; team < TEAMS; team++) {
      const t = next.teams[team];
      checkOffers(t, t.offers, reputation[team]);
      assert.deepEqual(
        t.offers,
        drawOffers({
          seed: BASE.seed,
          season: 1,
          race: n < SEASON ? n + 1 : SEASON + 1,
          team,
          reputation: reputation[team],
          held: signedSponsors(t).map((s) => s.sponsor),
          races: { lo: 5, hi: 10 },
        }),
        `team ${team} after race ${n}`
      );
      assert.notDeepEqual(t.offers, started.teams[team].offers);
    }
    assert.equal(next.phase, n < SEASON ? 'lobby' : 'offseason');
    state = n < SEASON ? send(next, { type: 'MarkRead', team: YOURS }) : next;
  }
  const finished = send(state, { type: 'FinishOffseason', team: YOURS });
  assert.deepEqual(
    finished.teams.map((t) => t.offers),
    state.teams.map((t) => t.offers)
  );
});

function sail(state: CareerState): {
  before: CareerState;
  after: CareerState;
  result: MatchResult;
} {
  const before = send(state, { type: 'StartRace', team: YOURS });
  const raced = standInResult(matchSetup(before, { hands: 'player' }));
  const after = send(before, {
    type: 'RecordRace',
    team: YOURS,
    result: raced,
  });
  return { before, after, result: raced };
}

test('over a season every team’s money changes by exactly its rows, sponsors included', () => {
  for (const seed of SEEDS) {
    let state = careerOf(seed);
    state = changeTeam(state, YOURS, (t) => ({
      ...t,
      offers: [offer(40, 'sea', 900, 10), offer(41, 'top10', 900, 10)],
    }));
    state = send(state, {
      type: 'SignSponsor',
      team: YOURS,
      offer: 0,
      slot: 0,
    });
    state = send(state, {
      type: 'SignSponsor',
      team: YOURS,
      offer: 0,
      slot: 2,
    });
    let rows = 0;
    for (let n = 1; n < SEASON; n++) {
      const { before, after, result: raced } = sail(state);
      for (let team = 0; team < TEAMS; team++) {
        const money = teamMoney(before, raced, team);
        assert.equal(
          after.teams[team].balance - before.teams[team].balance,
          moneyTotal(money),
          `team ${team} race ${n}`
        );
        assert.equal(
          money.sponsors.length,
          signedSponsors(before.teams[team]).length
        );
        rows += money.sponsors.length;
        for (const row of money.sponsors) {
          const sponsor = signedSponsors(before.teams[team]).find(
            (s) => s.sponsor === row.sponsor
          );
          assert.ok(sponsor);
          assert.equal(row.amount, sponsor.fee + (row.met ? sponsor.bonus : 0));
        }
      }
      assert.deepEqual(after.lastRace?.money, teamMoney(before, raced, YOURS));
      assert.deepEqual(JSON.parse(JSON.stringify(after)), after);
      state = send(after, { type: 'MarkRead', team: YOURS });
    }
    assert.ok(rows > 0);
  }
});

test('the rivals’ starting sponsors pay for their length and then leave', () => {
  let state = BASE;
  const lengths = BASE.teams.map((t) =>
    t.sponsors.map((s) => (s === null ? 0 : s.racesLeft))
  );
  for (let n = 1; n <= SEASON; n++) {
    const { after } = sail(state);
    for (let team = 1; team < TEAMS; team++)
      after.teams[team].sponsors.forEach((sponsor, slot) => {
        const left = lengths[team][slot] - n;
        if (left <= 0) assert.equal(sponsor, null);
        else assert.equal(sponsor?.racesLeft, left);
      });
    state = n < SEASON ? send(after, { type: 'MarkRead', team: YOURS }) : after;
  }
  for (let team = 1; team < TEAMS; team++)
    assert.deepEqual(state.teams[team].sponsors, [null, null, null]);
});

test('dealing and signing are deterministic and never mutate their input', () => {
  const start = deepFreeze(structuredClone(BASE));
  const copy = structuredClone(start);
  const one = sail(start).after;
  const two = sail(start).after;
  assert.deepEqual(one, two);
  assert.deepEqual(start, copy);
  const read = deepFreeze(send(one, { type: 'MarkRead', team: YOURS }));
  const kept = structuredClone(read);
  const signed = send(read, {
    type: 'SignSponsor',
    team: YOURS,
    offer: 2,
    slot: 1,
  });
  assert.deepEqual(read, kept);
  assert.deepEqual(
    signed.teams[YOURS].sponsors[1],
    read.teams[YOURS].offers[2]
  );
  assert.notDeepEqual(careerOf('x').teams[3].sponsors, BASE.teams[3].sponsors);
});
