import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCareer, table, type Told } from '../tools/sim/career.ts';
import { targets, type CareerRecord } from '../tools/sim/targets.ts';

const YOU = {
  gunnery: 10,
  helm: 10,
  nerve: 10,
  territory: 10,
  stormcraft: 10,
  lookout: 10,
};

function career(seed: string, seasons: number): CareerRecord {
  const told: Told[] = [];
  const state = runCareer(
    { seed, races: seasons * 10, standin: true, you: YOU },
    (t) => told.push(t)
  );
  return { told, table: table(state) };
}

test('the tuning figures of a career: one entry per career, each read from what the career told', () => {
  const records = [career('figures', 2), career('figures-2', 2)],
    t = targets(records);
  assert.equal(t.careers, 2);
  assert.equal(t.seasons, 2);
  assert.equal(t.top10.each.length, 2);
  assert.deepEqual(
    t.standing.map((s) => s.season),
    [1, 2]
  );
  records.forEach((r, k) => {
    const seasons = r.told.flatMap((x) =>
        x.kind === 'season' ? [x.figures] : []
      ),
      races = r.told.flatMap((x) => (x.kind === 'race' ? [x.line] : []));
    assert.deepEqual(
      t.standing.map((s) => s.each[k]),
      seasons.map((f) => f.standing)
    );
    assert.equal(
      t.lowest.each[k],
      Math.min(...races.slice(0, 5).map((l) => l.balance))
    );
    assert.equal(
      t.richest.each[k],
      Math.max(...r.table.map((row) => row.balance))
    );
    const first = seasons.find((f) => f.standing <= 10);
    assert.equal(t.top10.each[k], first ? first.season : null);
  });
  assert.equal(t.lowest.least, Math.min(...t.lowest.each));
  assert.equal(t.richest.most, Math.max(...t.richest.each));
});

test('the tuning figures compare the top five of the table with the bottom five', () => {
  const row = (standing: number, level: number, stars: number) => ({
    standing,
    team: standing - 1,
    name: `Team ${standing}`,
    points: 100 - standing,
    balance: 1000 * standing,
    level,
    stars,
  });
  const rows = Array.from({ length: 40 }, (_, k) =>
    k < 5 ? row(k + 1, 80, 4) : k >= 35 ? row(k + 1, 10, 1) : row(k + 1, 50, 2)
  );
  const t = targets([{ told: [], table: rows }]);
  assert.equal(t.levels.top, 80);
  assert.equal(t.levels.bottom, 10);
  assert.equal(t.stars.top, 4);
  assert.equal(t.richest.most, 40000);
  assert.equal(t.top10.median, null);
  assert.equal(t.rivals, 0);
});

test('rival repossessions are counted apart from your own', () => {
  const season = (rivals: number, repossessions: number): Told => ({
    kind: 'season',
    figures: {
      season: 1,
      standing: 40,
      balance: 0,
      level: 5,
      stars: [null, null, null],
      balances: { least: 0, median: 0, most: 0 },
      levels: { least: 0, median: 0, most: 0 },
      staff: { least: 0, median: 0, most: 0 },
      repossessions,
      rivals,
      acted: { hired: 0, built: 0, signed: 0 },
    },
  });
  const t = targets([
    { told: [season(2, 3)], table: [] },
    { told: [season(0, 0)], table: [] },
  ]);
  assert.equal(t.rivals, 1);
});
