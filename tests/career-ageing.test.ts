// A season's end for every gull (Phase B sections 2.2, 2.3): growth, retirement, traits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newsworthy,
  retirements,
  schoolingOf,
  seasonGrowth,
  traitTurns,
  without,
} from '../src/career/ageing.ts';
import { canonical } from '../src/career/canon.ts';
import { dice } from '../src/career/dice.ts';
import { YEAR, age, retireRange } from '../src/career/stars.ts';
import { staffOf } from '../src/career/state.ts';
import { founded, invariants } from './career-kit.ts';

const sum = (stats: Readonly<Record<string, number>>) =>
  Object.values(stats).reduce((a, b) => a + b, 0);

test("schooling: the role's building on their crew; a free agent as at level 1", () => {
  const s = founded();
  const crew = s.crews[0];
  const captain = s.gulls[crew.staff.ships[0].captain!];
  assert.equal(
    schoolingOf(s, captain).school,
    crew.buildings.sailingSchool.level
  );
  const scout = s.gulls[crew.staff.scouts[0]];
  assert.equal(schoolingOf(s, scout).school, crew.buildings.crowsNest.level);
  const free = s.gulls.find((g) => g.contract === null)!;
  assert.deepEqual(schoolingOf(s, free), {
    school: 1,
    mentor: false,
    sailingSchool: 0,
  });
});

test("a season's growth: the young below peak rise, the old past it fall; the player is untouched; the same every time", () => {
  const s = { ...founded(), day: 140 };
  const t = seasonGrowth(s);
  let rose = 0,
    fell = 0;
  for (const g of s.gulls) {
    if (g.player) {
      assert.equal(t.gulls[g.id], g);
      continue;
    }
    const before = sum(g.stats),
      after = sum(t.gulls[g.id].stats);
    if (age(g, s.day) < g.peak)
      assert.ok(after >= before, `gull ${g.id} below peak did not fall`);
    else assert.ok(after <= before, `gull ${g.id} past peak did not rise`);
    if (after > before) rose++;
    if (after < before) fell++;
  }
  assert.ok(rose > 200 && fell > 200, `${rose} rose, ${fell} fell`);
  assert.equal(canonical(seasonGrowth(s)), canonical(t));
});

test("retirement: no one under their role's first age, everyone at its last; the retired leave their posts (a manager's and an elder's are kept for the elder's hiring)", () => {
  const s = founded();
  const r = retirements(s, dice(s.seed, s.streams));
  for (const id of r.retired) {
    const g = s.gulls[id];
    assert.ok(
      age(g, s.day) > retireRange(g.role)[0],
      `gull ${id} retired at ${age(g, s.day)}`
    );
  }
  for (const g of s.gulls)
    if (!g.player && age(g, s.day) >= retireRange(g.role)[1])
      assert.ok(r.retired.includes(g.id), `gull ${g.id} is past the last age`);
  const later = { ...s, day: s.day + 12 * YEAR };
  const r2 = retirements(later, dice(s.seed, s.streams));
  assert.ok(
    r2.retired.length > 500,
    `${r2.retired.length} retired twelve years on`
  );
  for (const id of r2.retired) {
    const g = r2.state.gulls[id];
    assert.equal(g.retired, later.day);
    if (g.role !== 'manager' && g.role !== 'elder') {
      assert.equal(g.contract, null);
      for (const c of r2.state.crews)
        assert.ok(
          !staffOf(c).includes(id),
          `retired ${id} still on crew ${c.id}`
        );
    }
  }
  assert.equal(
    r2.state.gulls[s.player!.gull].retired,
    null,
    'the player never retires'
  );
  invariants(r2.state);
  assert.ok(newsworthy(s, s.gulls[s.crews[s.player!.crew].staff.flight[0]]));
});

test('without: a gull taken off every post of a staff', () => {
  const crew = founded().crews[5];
  const id = crew.staff.ships[1].bosun!;
  const staff = without(crew.staff, id);
  assert.equal(staff.ships[1].bosun, null);
  assert.equal(staff.ships[0].bosun, crew.staff.ships[0].bosun);
  assert.equal(without(crew.staff, crew.staff.flight[2]).flight.length, 3);
});

test("traits turn at a season's end, by the 'traits' stream, and say what changed", () => {
  const s = founded();
  const roll = dice(s.seed, s.streams);
  const t = traitTurns(s, roll);
  assert.ok(t.changes.length > 50, `${t.changes.length} changed`);
  for (const c of t.changes)
    assert.deepEqual(
      [...t.state.gulls[c.gull].traits].sort(),
      [
        ...s.gulls[c.gull].traits.filter((x) => !c.lost.includes(x)),
        ...c.gained,
      ].sort()
    );
  assert.equal(roll.counters().traits, 1);
  assert.equal(
    canonical(traitTurns(s, dice(s.seed, s.streams)).state),
    canonical(t.state)
  );
});
