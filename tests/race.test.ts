// A carded race sailed headless (play/race.ts runRace, MANAGER.md 3 point 9):
// a pure function of its card and its planet, with the result the career reads
// (race.ts RaceResult).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED } from '../src/environment.ts';
import { KINDS } from '../src/kinds.ts';
import { raceOf, runRace, specField } from '../src/play/race.ts';
import { TEAM, type RaceCard, type RaceResult } from '../src/race.ts';
import { nature } from '../src/sim/persona.ts';
import { DEFAULT_RULES } from '../src/sim/rules.ts';
import { chart } from '../src/sim/route.ts';
import { berthing } from '../src/sim/spawn.ts';
import { closedBy } from '../src/sim/storm.ts';
import { landOf, planetOf } from '../src/world/land.ts';
import { hash } from '../src/world/random.ts';
import type { Vec3 } from '../src/world/sphere.ts';

const planet = planetOf(SEED, landOf(SEED)),
  depth = (p: Vec3) => -planet.height(p),
  waters = { chart: chart(depth), water: berthing(depth) };

/**
 * A short race: three teams of spec ships, the storm three times as quick.
 */
const short = (over: Partial<RaceCard> = {}): RaceCard => {
  const card = specField(SEED, 3);
  return { ...card, rules: { ...card.rules, storm: 3 }, ...over };
};
const sailed = (card: RaceCard) => runRace(card, planet, waters);
const FIRST = sailed(short());

/** What every result holds to, whatever the race. */
function sound(card: RaceCard, r: RaceResult) {
  const ids = card.ships.map((s) => s.id),
    team = (id: number) => card.ships[id].team;
  assert.deepEqual(
    [...r.order].sort((a, b) => a - b),
    ids,
    'every ship placed'
  );
  const down = new Set(r.sinkings.map((s) => s.id)),
    afloat = r.order.filter((id) => !down.has(id));
  assert.equal(down.size, r.sinkings.length, 'no ship sunk twice');
  assert.deepEqual(r.order.slice(0, afloat.length), afloat, 'the afloat first');
  assert.ok(
    new Set(afloat.map(team)).size <= 1 ||
      r.seconds >= closedBy(raceOf(card, planet).type.rules.storm),
    'one team afloat at the end, or none (or the race was called)'
  );
  for (const s of r.sinkings) {
    assert.ok(s.by === null || team(s.by) !== team(s.id), 'none by a mate');
    assert.ok(s.second >= 0 && s.second <= r.seconds);
  }
  const sum = (k: 'landed' | 'taken') => r.hits.reduce((a, h) => a + h[k], 0);
  assert.equal(sum('landed'), sum('taken'));
  assert.ok(r.hits.every((h) => h.landed === 0 || h.fired > 0));
  assert.deepEqual(
    r.hits.map((h) => h.id),
    ids
  );
  assert.deepEqual(
    r.seaHeld.map((h) => h.id),
    ids
  );
  assert.ok(r.seaHeld.every((h) => h.share >= 0 && h.share < 0.5));
  assert.match(r.hash, /^[0-9a-f]{8}$/);
}

test('a race is sailed to its end: one team afloat, every ship placed, the tally sound', () => {
  const card = short();
  sound(card, FIRST);
  assert.deepEqual(
    [FIRST.seed, FIRST.tier, FIRST.round],
    [card.seed, card.tier, card.round]
  );
  assert.ok(FIRST.sinkings.length >= card.ships.length - TEAM);
  assert.ok(
    FIRST.hits.some((h) => h.landed > 0),
    'guns were found and fired'
  );
  assert.ok(FIRST.faults.length > 0, 'and faults came on');
  for (const f of FIRST.faults)
    assert.ok(f.zone >= 0 && f.zone < 4 && f.level >= 1 && f.level <= 2);
});

test('the same card on the same planet gives the same result, hash and all; another seed another', () => {
  assert.deepEqual(sailed(short()), FIRST);
  // (pinned: the same on every machine. A rule that changes a carded race
  // changes it, and says so: da9afc4e till the pit took the place of the
  // water's mending in a carded race, sim/pit.ts)
  assert.equal(FIRST.hash, '5702c7c7');
  const other = sailed(short({ seed: SEED + 1 }));
  assert.notEqual(other.hash, FIRST.hash);
});

test('a forfeit does not put to sea: placed last, listed sunk at second 0, with nothing to her name', () => {
  const base = short(),
    card = {
      ...base,
      ships: base.ships.map((s) => ({
        ...s,
        forfeit: s.id === 5 || s.id === 9,
      })),
    };
  const r = sailed(card);
  sound(card, r);
  assert.deepEqual(r.order.slice(-2), [5, 9]);
  assert.deepEqual(r.sinkings.slice(0, 2), [
    { id: 5, by: null, cause: 'forfeit', gun: null, second: 0 },
    { id: 9, by: null, cause: 'forfeit', gun: null, second: 0 },
  ]);
  for (const id of [5, 9]) {
    assert.deepEqual(r.hits[id], {
      id,
      fired: 0,
      landed: 0,
      taken: 0,
      dealt: 0,
    });
    assert.equal(r.seaHeld[id].share, 0);
  }
  assert.notEqual(r.hash, FIRST.hash);
});

test("the card's rules: a banned gun is never laid, the storm's pace quickens its waits and closings alike", () => {
  const banned = KINDS.filter((k) => k !== 'scatter'),
    base = short(),
    card = { ...base, rules: { ...base.rules, banned } };
  const m = raceOf(card, planet);
  assert.deepEqual(m.type.rules.loot.kinds, [
    0,
    DEFAULT_RULES.loot.kinds[1],
    0,
    0,
    0,
  ]);
  assert.ok(
    Math.abs(closedBy(m.type.rules.storm) - closedBy(DEFAULT_RULES.storm) / 3) <
      1e-9
  );
  assert.equal(m.storm(0).damage, DEFAULT_RULES.storm.phases[0].damage);
  const r = sailed(card);
  sound(card, r);
  assert.ok(r.sinkings.every((s) => s.gun === null || s.gun === 'scatter'));
  // today's pace and no ban: the game's own rules, themselves
  const own = raceOf(specField(SEED, 3), planet).type.rules;
  assert.equal(own.loot, DEFAULT_RULES.loot);
  assert.equal(own.storm, DEFAULT_RULES.storm);
  assert.throws(
    () => raceOf({ ...base, rules: { ...base.rules, storm: 0 } }, planet),
    /pace/
  );
  assert.throws(
    () => raceOf({ ...base, rules: { ...base.rules, banned: KINDS } }, planet),
    /banned/
  );
});

test("ship 0 with no driver is sailed by the pilot's hands, asked every step; with one, by her bot", () => {
  const card = specField(SEED, 3, true),
    quick = { ...card, rules: { ...card.rules, storm: 3 } };
  assert.equal(quick.ships[0].driver, null);
  const asked: number[] = [];
  const r = runRace(quick, planet, waters, (second) => {
    asked.push(second);
    return {
      helm: { course: null, throttle: 0 },
      gun: { aim: null, fire: false },
    };
  });
  sound(quick, r);
  assert.equal(asked[0], 0);
  assert.ok(Math.abs(asked.length - r.seconds * 30) < 1e-6, 'asked every step');
  assert.equal(r.hits[0].fired, 0, 'her hands idle, she fired nothing');
  assert.notEqual(r.hash, FIRST.hash, 'a bot sailed her otherwise');
  // idle hands by default
  assert.deepEqual(runRace(quick, planet, waters), r);
});

test('a spec field: teams of four by id, each in its own livery, every driver the bot of her berth', () => {
  const card = specField(7);
  assert.equal(card.ships.length, 80);
  for (const s of card.ships) {
    assert.equal(s.team, Math.floor(s.id / TEAM));
    assert.deepEqual(s.colours, card.ships[s.team * TEAM].colours);
    assert.equal(s.driver?.seed, hash(7, s.id));
    assert.equal(s.driver?.persona, nature(hash(7, s.id)).persona);
  }
  const liveries = new Set(
    card.ships.map((s) => `${s.colours.dye} ${s.colours.pattern}`)
  );
  assert.equal(liveries.size, 20);
});
