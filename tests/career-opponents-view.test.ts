import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import { reportPrice } from '../src/career/knowledge/report.ts';
import { standings } from '../src/career/rules/standing.ts';
import {
  DRIVER_STATS,
  LINES,
  ROLES,
  type CareerState,
  type Range,
} from '../src/career/state.ts';
import { SCOUTING, STAND_IN } from '../src/career/tuning.ts';
import { opponentsView, teamSheetView } from '../src/career/views/opponents.ts';
import { rehearsed } from '../src/app/rehearse.ts';

const YOURS = 0;
const FRESH = rehearsed('test', 0);
const THIRD = rehearsed('test', 3);
const SECOND_SEASON = rehearsed('test', 14);

const mean = (values: readonly number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;

const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const fittedOf = (state: CareerState, team: number) =>
  state.teams[team].ships.flatMap((ship) =>
    LINES.map((line) => ship.fitted[line])
  );

const knownLines = (state: CareerState, team: number): Range[] =>
  state.knowledge.lines[team].flatMap((ranges) =>
    LINES.map((line) => ranges[line])
  );

const RIVAL = 7;

function emptied(state: CareerState): CareerState {
  const id = state.teams[RIVAL].seats.mechanic;
  return {
    ...state,
    teams: state.teams.map((team, i) =>
      i === RIVAL ? { ...team, seats: { ...team.seats, mechanic: null } } : team
    ),
    people: state.people.map((p) =>
      p.id === id ? { ...p, contract: null } : p
    ),
  };
}

const rivalWithEmpty = (state: CareerState) =>
  state.teams.findIndex(
    (team, i) => i !== YOURS && ROLES.some((role) => team.seats[role] === null)
  );

const sent = (state: CareerState, command: Parameters<typeof apply>[1]) => {
  const done = apply(state, command);
  assert.ok(done.ok);
  return done.state;
};

test('forty rows in standing order, each team once, yours marked and opened to', () => {
  for (const state of [FRESH, THIRD, SECOND_SEASON]) {
    const view = opponentsView(state);
    const places = standings(state);
    assert.equal(view.rows.length, state.teams.length);
    assert.deepEqual(
      view.rows.map((row) => row.place),
      view.rows.map((_, i) => i + 1)
    );
    assert.deepEqual(
      [...view.rows.map((row) => row.team)].sort((a, b) => a - b),
      state.teams.map((_, i) => i)
    );
    view.rows.forEach((row) => {
      const team = state.teams[row.team];
      assert.equal(row.place, places[row.team]);
      assert.equal(row.name, team.name);
      assert.equal(row.emblem, team.emblem);
      assert.deepEqual(row.livery, team.livery);
      assert.equal(row.points, state.points[row.team]);
      assert.equal(row.yours, row.team === YOURS);
    });
    assert.equal(view.rows.filter((row) => row.yours).length, 1);
    assert.equal(view.rows[view.open].team, YOURS);
  }
});

test('before the first race nothing has moved; after it, rows move by the places gained', () => {
  assert.ok(opponentsView(FRESH).rows.every((row) => row.moved === 0));
  for (const state of [THIRD, SECOND_SEASON]) {
    const rows = opponentsView(state).rows;
    rows.forEach((row) =>
      assert.equal(row.moved, state.lastStanding[row.team] - row.place)
    );
    assert.ok(rows.some((row) => row.moved > 0));
    assert.ok(rows.some((row) => row.moved < 0));
  }
});

test('strength is the range of the mean of the fourteen fitted levels as you know them', () => {
  for (const state of [FRESH, THIRD, SECOND_SEASON]) {
    const view = opponentsView(state);
    const own = mean(fittedOf(state, YOURS));
    assert.ok(close(view.mean, own));
    view.rows.forEach((row) => {
      if (row.yours) {
        assert.ok(close(row.strength.lo, own));
        assert.ok(close(row.strength.hi, own));
        return;
      }
      const lines = knownLines(state, row.team);
      assert.equal(lines.length, 14);
      assert.ok(close(row.strength.lo, mean(lines.map((r) => r.lo))));
      assert.ok(close(row.strength.hi, mean(lines.map((r) => r.hi))));
      assert.ok(row.strength.lo < row.strength.hi);
      const truth = mean(fittedOf(state, row.team));
      assert.ok(row.strength.lo <= truth + 1e-9);
      assert.ok(truth <= row.strength.hi + 1e-9);
    });
  }
});

test("a rival's sheet: header, two ships of seven known lines against your slot 0, and four cards", () => {
  const view = opponentsView(THIRD);
  const row = view.rows.find((r) => !r.yours && r.place === 1);
  assert.ok(row);
  const sheet = teamSheetView(THIRD, row.team);
  const team = THIRD.teams[row.team];
  assert.equal(sheet.team, row.team);
  assert.equal(sheet.name, team.name);
  assert.equal(sheet.emblem, team.emblem);
  assert.equal(sheet.place, 1);
  assert.equal(sheet.yours, false);
  assert.equal(sheet.ships.length, 2);
  sheet.ships.forEach((ship, slot) => {
    assert.equal(ship.gun, team.ships[slot].gun);
    assert.deepEqual(
      ship.lines.map((l) => l.line),
      LINES
    );
    ship.lines.forEach((l) => {
      assert.deepEqual(l.level, THIRD.knowledge.lines[row.team][slot][l.line]);
      assert.equal(l.yours, THIRD.teams[YOURS].ships[0].fitted[l.line]);
    });
  });
  assert.deepEqual(
    sheet.cards.map((c) => c.seat),
    ['owner', 'driver', 'designer', 'mechanic']
  );
});

test("the owner's card: stats as ranges, Report only, no holder, wage or clause", () => {
  const team = opponentsView(THIRD).rows.find((r) => !r.yours)!.team;
  const owner = THIRD.teams[team].owner!;
  const card = teamSheetView(THIRD, team).cards[0];
  assert.equal(card.seat, 'owner');
  assert.equal(card.helm, false);
  assert.ok(card.card);
  assert.equal(card.card.role, 'owner');
  assert.equal(card.card.name, owner.name);
  assert.equal(card.card.person, owner.id);
  assert.equal(card.card.wage, null);
  assert.equal(card.card.age, null);
  assert.deepEqual(
    card.card.stats.map((s) => s.stat),
    DRIVER_STATS
  );
  assert.ok(card.card.stats.some((s) => s.value.lo < s.value.hi));
  assert.equal(card.exact, false);
  assert.equal(card.rival, null);
  assert.equal(card.holder, null);
  assert.equal(card.approach, null);
  assert.ok(card.report);
  assert.equal(card.report.cost, reportPrice(THIRD, owner.id));
  assert.equal(card.report.faint, false);
});

test("a rival's staff compare against whoever holds the same seat in your team", () => {
  const team = opponentsView(FRESH).rows.find((r) => !r.yours)!.team;
  const [, driver, designer] = teamSheetView(FRESH, team).cards;
  assert.deepEqual(
    driver.holder,
    DRIVER_STATS.map((stat) => STAND_IN[stat])
  );
  assert.equal(designer.holder, null);
  for (const c of [driver, designer]) {
    assert.ok(c.card);
    assert.ok(c.rival);
    assert.equal(c.rival.team, team);
    assert.ok(c.card.wage);
    assert.ok(c.approach);
    assert.equal(c.approach.cost, SCOUTING.approach);
    assert.ok(c.report);
  }
  const later = teamSheetView(THIRD, team).cards[2];
  const ours = THIRD.people.find(
    (p) => p.id === THIRD.teams[YOURS].seats.designer
  )!;
  assert.deepEqual(later.holder, ours.stats);
});

test('an empty seat is an outline with nothing to buy', () => {
  for (const state of [THIRD, SECOND_SEASON].map(emptied)) {
    const team = rivalWithEmpty(state);
    assert.ok(team > 0);
    const sheet = teamSheetView(state, team);
    const empty = sheet.cards.filter(
      (c) => c.seat !== 'owner' && state.teams[team].seats[c.seat] === null
    );
    assert.ok(empty.length > 0);
    for (const c of empty) {
      assert.equal(c.card, null);
      assert.equal(c.report, null);
      assert.equal(c.approach, null);
    }
  }
});

test('a report makes the card exact and the button faint; an approach pins it', () => {
  const team = opponentsView(SECOND_SEASON).rows.find((r) => !r.yours)!.team;
  const before = teamSheetView(SECOND_SEASON, team).cards[1];
  assert.ok(before.card && before.card.person !== null);
  const person = before.card.person;
  let state = sent(SECOND_SEASON, { type: 'BuyReport', team: YOURS, person });
  state = sent(state, { type: 'Approach', team: YOURS, person });
  const after = teamSheetView(state, team).cards[1];
  assert.ok(after.card);
  assert.equal(after.exact, true);
  assert.ok(after.card.stats.every((s) => s.value.lo === s.value.hi));
  assert.equal(after.report?.faint, true);
  assert.equal(after.report?.why, 'held');
  assert.equal(after.pinned, true);
  assert.equal(after.approach?.why, 'held');
});

test('your own row opens your team exactly, with no buttons and the helm for an owner', () => {
  for (const state of [FRESH, THIRD]) {
    const sheet = teamSheetView(state, YOURS);
    const yours = state.teams[YOURS];
    assert.equal(sheet.yours, true);
    sheet.ships.forEach((ship, slot) =>
      ship.lines.forEach((l) => {
        const level = yours.ships[slot].fitted[l.line];
        assert.deepEqual(l.level, { lo: level, hi: level });
        assert.equal(l.yours, yours.ships[0].fitted[l.line]);
      })
    );
    const [owner, ...staff] = sheet.cards;
    assert.equal(owner.helm, true);
    assert.equal(owner.card, null);
    for (const c of sheet.cards) {
      assert.equal(c.report, null);
      assert.equal(c.approach, null);
      assert.equal(c.holder, null);
      assert.equal(c.rival, null);
    }
    for (const c of staff) {
      if (c.card === null) continue;
      assert.ok(c.card.stats.every((s) => s.value.lo === s.value.hi));
    }
  }
  assert.equal(teamSheetView(FRESH, YOURS).cards[1].card?.who, 'uncle');
});
