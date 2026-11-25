import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { seasonPrize } from '../src/career/rules/money.ts';
import { standingOrder, standings } from '../src/career/rules/standing.ts';
import { stars } from '../src/career/rules/person.ts';
import {
  LINES,
  type CareerState,
  type SeasonCard,
} from '../src/career/state.ts';
import { LEAGUE } from '../src/career/tuning.ts';
import { STAT_IDS } from '../src/career/views/card.ts';
import {
  peopleView,
  tableView,
  winterView,
  type PeopleView,
  type SeasonFace,
  type TableView,
  type WinterView,
} from '../src/career/views/offseason.ts';
import { paperView } from '../src/career/views/paper.ts';
import { recorded, rehearsed } from '../src/app/rehearse.ts';

const YOURS = 0;
const FRESH = rehearsed('test', 0);
const MIDSEASON = rehearsed('test', 4);
const FIRST = recorded(rehearsed('test', 9));
const SECOND = recorded(rehearsed('test', 19));
const THIRD = rehearsed('test', 30);

function done(state: CareerState, command: Command): CareerState {
  const result = apply(state, command);
  if (!result.ok) throw new Error(result.reason);
  return result.state;
}

const NINTH = rehearsed('test', 9);
const designer = NINTH.teams[YOURS].seats.designer;
const VACANT = recorded(
  designer === null
    ? NINTH
    : done(NINTH, { type: 'Release', team: YOURS, person: designer })
);

function table(state: CareerState): TableView {
  const v = tableView(state);
  if (v === null) throw new Error('no table');
  return v;
}

function people(state: CareerState): PeopleView {
  const v = peopleView(state);
  if (v === null) throw new Error('no people');
  return v;
}

function winter(state: CareerState): WinterView {
  const v = winterView(state);
  if (v === null) throw new Error('no winter');
  return v;
}

type Held = Extract<SeasonFace, { kind: 'person' }>;

function held(face: SeasonFace): Held {
  if (face.kind !== 'person') throw new Error('an empty seat');
  return face;
}

test('the report pages exist only once a season has ended', () => {
  for (const state of [FRESH, MIDSEASON]) {
    assert.equal(tableView(state), null);
    assert.equal(peopleView(state), null);
    assert.equal(winterView(state), null);
  }
  for (const state of [FIRST, SECOND]) {
    assert.equal(state.phase, 'offseason');
    assert.equal(state.unread, true);
  }
});

test('the table shows the top three, the champion and your own row', () => {
  for (const state of [FIRST, SECOND]) {
    const v = table(state),
      report = state.lastOffseason;
    assert.ok(report);
    assert.equal(v.podium.length, 3);
    assert.deepEqual(
      v.podium.map((entry) => entry.mark.team),
      report.table.slice(0, 3).map((row) => row.team)
    );
    assert.deepEqual(
      v.podium.map((entry) => entry.place),
      [1, 2, 3]
    );
    assert.deepEqual(
      v.podium.map((entry) => entry.points),
      report.table.slice(0, 3).map((row) => row.points)
    );
    assert.equal(v.champion.team, report.table[0].team);
    assert.equal(v.of, LEAGUE.teams);
    assert.equal(v.you.mark.team, YOURS);
    assert.equal(v.you.mark.yours, true);
    assert.equal(
      v.you.place,
      report.table.findIndex((row) => row.team === YOURS) + 1
    );
    assert.equal(v.prize, report.prize);
    assert.equal(v.prize, seasonPrize(v.you.place));
  }
});

test('a title won by a rival crowns that rival, with you further down', () => {
  const v = table(FIRST);
  assert.notEqual(v.champion.team, YOURS);
  assert.equal(v.champion.yours, false);
  assert.ok(v.you.place > 3);
  assert.equal(v.podium[0].mark.name, FIRST.teams[v.champion.team].name);
});

test('the table is last season frozen, not the cleared new one', () => {
  const v = table(FIRST);
  const before = rehearsed('test', 9);
  assert.ok(v.podium[0].points >= v.podium[1].points);
  assert.ok(v.podium[1].points >= v.podium[2].points);
  assert.ok(v.you.points >= before.points[YOURS]);
  assert.equal(standingOrder(FIRST)[0], v.champion.team);
  assert.equal(standings(FIRST)[YOURS], v.you.place);
});

test('your people come as three seats in seat order', () => {
  for (const state of [FIRST, SECOND, VACANT]) {
    assert.deepEqual(
      people(state).seats.map((face) => face.role),
      ['driver', 'designer', 'mechanic']
    );
  }
});

test('a season card carries each stat before and after with its change', () => {
  for (const state of [FIRST, SECOND, THIRD]) {
    const report = state.lastOffseason;
    assert.ok(report);
    for (const face of people(state).seats) {
      const card: SeasonCard | null = report.seats[face.role];
      if (card === null) continue;
      const person = held(face);
      assert.deepEqual(
        person.stats.map((s) => s.stat),
        STAT_IDS[person.role]
      );
      person.stats.forEach((s, i) => {
        assert.equal(s.value.before, card.stats.before[i]);
        assert.equal(s.value.after, card.stats.after[i]);
        assert.equal(s.change, s.value.after - s.value.before);
      });
      assert.deepEqual(person.stars, {
        before: stars(card.stats.before),
        after: stars(card.stats.after),
      });
    }
  }
});

test('every season card ages by one', () => {
  for (const state of [FIRST, SECOND]) {
    for (const face of people(state).seats) {
      const person = held(face);
      assert.equal(person.age.after, person.age.before + 1);
    }
  }
});

test('the second winter follows the first', () => {
  const one = people(FIRST).seats.map(held),
    two = people(SECOND).seats.map(held);
  const kept = two.filter((p) => one.some((q) => q.name === p.name));
  assert.ok(kept.length > 0);
  for (const p of kept) {
    const q = one.find((o) => o.name === p.name);
    assert.ok(q);
    assert.equal(p.age.before, q.age.after);
  }
});

test('a retirement is marked on its card', () => {
  const faces = people(FIRST).seats.map(held);
  const gone = faces.filter((p) => p.retired);
  assert.ok(gone.length > 0);
  assert.equal(gone[0].role, 'driver');
  assert.equal(FIRST.teams[YOURS].seats.driver, null);
  assert.ok(faces.some((p) => !p.retired));
});

test('a stat that rose and a stat that fell show as changes', () => {
  const rose = people(SECOND)
    .seats.map(held)
    .flatMap((p) => p.stats)
    .filter((s) => s.change > 0);
  assert.ok(rose.length > 0);
  const fell = people(THIRD)
    .seats.map(held)
    .flatMap((p) => p.stats)
    .filter((s) => s.change < 0);
  assert.ok(fell.length > 0);
  assert.ok(fell.every((s) => s.value.after < s.value.before));
});

test('a contract with no races left shows none', () => {
  const spent = people(SECOND)
    .seats.map(held)
    .filter((p) => p.racesLeft === 0);
  assert.deepEqual(
    spent.map((p) => p.role),
    ['driver', 'mechanic']
  );
  assert.ok(
    people(FIRST)
      .seats.map(held)
      .every((p) => p.racesLeft > 0)
  );
});

test('a seat that was empty is an empty seat, and Uncle is not drawn', () => {
  const faces = people(VACANT).seats;
  assert.deepEqual(faces[1], { kind: 'empty', role: 'designer' });
  assert.equal(faces[0].kind, 'person');
  assert.equal(faces[2].kind, 'person');
});

test('winter shows seven lines of three bars, each lower or level', () => {
  for (const state of [FIRST, SECOND]) {
    const v = winter(state),
      report = state.lastOffseason;
    assert.ok(report);
    assert.deepEqual(
      v.lines.map((l) => l.line),
      LINES
    );
    for (const line of v.lines) {
      assert.equal(line.bars.length, 3);
      const sources = [report.design, report.fitted[0], report.fitted[1]];
      line.bars.forEach((bar, i) => {
        assert.equal(bar.before, Math.round(sources[i].before[line.line]));
        assert.equal(bar.after, Math.round(sources[i].after[line.line]));
        assert.ok(bar.after <= bar.before);
        assert.ok(bar.after >= 5);
        assert.ok(Number.isInteger(bar.before));
      });
    }
    assert.ok(v.lines.some((l) => l.bars[0].after < l.bars[0].before));
  }
});

test('winter levels match the team as the off-season left it', () => {
  const v = winter(FIRST),
    team = FIRST.teams[YOURS];
  for (const line of v.lines) {
    assert.equal(line.bars[0].after, Math.round(team.design[line.line]));
    assert.equal(
      line.bars[1].after,
      Math.round(team.ships[0].fitted[line.line])
    );
    assert.equal(
      line.bars[2].after,
      Math.round(team.ships[1].fitted[line.line])
    );
  }
});

test('the fourth page is the season edition', () => {
  for (const [state, season] of [
    [FIRST, 1],
    [SECOND, 2],
  ] as const) {
    const v = paperView(state);
    assert.equal(v.kind, 'season');
    assert.equal(v.dateline, `Season ${season}`);
    assert.equal(v.workshop, null);
    const kinds = v.headlines.map((h) => h.kind);
    assert.ok(kinds.includes('yourSeason'));
    assert.ok(kinds.includes('title'));
    assert.ok(!kinds.includes('yourFinish'));
  }
});
