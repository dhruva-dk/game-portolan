import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, start } from '../src/career/career.ts';
import { coinText, foundErrors, foundView, homeView, letters, ordinal, recoverView, settingsView, topBar } from '../src/career/views.ts';
import { table } from '../src/career/read.ts';
import { FOUND, founded, toRaceDay } from './career-kit.ts';
import type { Figure } from '../src/office.ts';

/** Every figure of a view carries what it is set against and what it is made of. */
function figures(v: unknown, out: Figure[] = []): Figure[] {
  if (v && typeof v === 'object') {
    if ('value' in v && 'text' in v && 'against' in v && 'explain' in v) out.push(v as Figure);
    else for (const x of Object.values(v)) figures(x, out);
  }
  return out;
}

test('ordinal and coin text', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 40].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '40th']);
  assert.equal(coinText(12500), '12,500');
  assert.equal(coinText(-300), '−300');
  assert.equal(coinText(300, true), '+300');
});

test('the top bar: the player, their crew, day one of season one, Continue free', () => {
  const s = founded(), t = topBar(s), c = s.crews[s.player!.crew];
  assert.equal(t.name, `${FOUND.given} ${FOUND.family}`);
  assert.equal(t.crew, FOUND.crew);
  assert.equal(t.face.role, 'manager');
  assert.deepEqual(t.face.colours, FOUND.colours);
  assert.match(t.date, /^Day \d+, Season 1$/);
  assert.equal(t.coin.value, c.coin);
  assert.equal(t.coin.against?.kind, 'change');
  assert.ok(t.coin.explain && t.coin.explain.lines.length >= 1);
  assert.equal(t.go.label, 'Continue');
  assert.equal(t.go.blocker, null);
});

test('the top bar on race day reads Race plan and opens the plan', () => {
  const t = topBar(toRaceDay(founded()));
  assert.equal(t.go.label, 'Race plan');
  assert.equal(t.go.raceDay, true);
  assert.equal(t.go.blocker?.screen, 'plan');
});

test('home: the next race, both ships, the yard, five lines of the table round the player\'s, four letters', () => {
  const s = founded(), h = homeView(s), c = s.crews[s.player!.crew];
  assert.ok(h.race);
  assert.match(h.race.round, /^Round 1 of \d+$/);
  assert.equal(h.race.heading, 'Next Race');
  assert.ok(h.race.days.value >= 0);
  assert.equal(h.race.target.value, c.target);
  assert.equal(h.ships[0].you, true);
  assert.equal(h.ships[0].captain, null, 'the player sails ship one');
  assert.ok(h.ships[1].captain, 'ship two has her captain');
  assert.equal(h.ships[0].parts.length, 6);
  assert.ok(h.ships.every((x) => x.parts.every((p) => p.fitted)));
  assert.equal(h.table.lines.length, 5);
  assert.equal(h.table.lines.filter((l) => l.mine).length, 1);
  const rows = table(s, c.league);
  for (const l of h.table.lines) assert.equal(rows[l.place - 1].crew, l.crew);
  assert.ok(h.mail.letters.length <= 4);
  for (const f of figures(h)) {
    assert.ok(f.against, `${f.text} has nothing it is set against`);
    assert.ok(f.explain && f.explain.lines.length > 0, `${f.text} has no explanation`);
  }
});

test('home on race day: the heading reads Race Day', () => {
  assert.equal(homeView(toRaceDay(founded())).race?.heading, 'Race Day');
});

test('a part under half its condition is marked low', () => {
  const s = founded(), id = s.player!.crew, c = s.crews[id];
  const worn = { ...s, crews: s.crews.map((k) => (k.id !== id ? k : { ...k, parts: c.parts.map((p) => (p.ship === 0 && p.type === 'sails' ? { ...p, condition: 0.3 } : p)) })) };
  const marks = homeView(worn).ships[0].parts;
  assert.equal(marks.find((p) => p.type === 'sails')?.low, true);
  assert.equal(marks.filter((p) => p.low).length, 1);
});

test('letters: newest first, the Admiralty\'s from its secretary, a dilemma sealed', () => {
  const s = toRaceDay(founded()), ls = letters(s, 50);
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i - 1].day >= ls[i].day);
  for (const l of ls) {
    const m = s.mail.find((x) => x.id === l.id)!;
    assert.equal(l.unread, !m.read);
    assert.equal(l.sealed, m.dilemma !== null && m.dilemma.answer === null);
    if (m.sender === null) assert.equal(l.from, 'The Admiralty\'s secretary');
  }
});

test('found: defaults the career takes, the same for a seed, the crew it replaces named', () => {
  const v = foundView(FOUND.seed, FOUND.colours);
  assert.deepEqual(foundView(FOUND.seed, FOUND.colours), v);
  assert.ok(v.crew.length >= 1 && v.crew.length <= v.limits.crew);
  assert.equal(v.swatches, 24);
  assert.equal(v.emblems, 12);
  assert.match(v.replacing, /League Three/);
  const r = apply(start(), { kind: 'Found', seed: v.seed, crew: v.crew, colours: v.colours, emblem: v.emblem, given: v.given, family: v.family, headshot: v.headshot });
  assert.ok(r.ok, r.ok ? '' : r.reason.sentence);
  assert.notEqual(foundView(FOUND.seed + 1, FOUND.colours).crew, '');
});

test('found errors: each under its own field, none for a founding the career takes', () => {
  assert.deepEqual(foundErrors(FOUND), {});
  const e = foundErrors({ ...FOUND, crew: '', colours: { first: 3, second: 3 }, family: 'x'.repeat(40) });
  assert.match(e.crew ?? '', /needs a name/);
  assert.match(e.colours ?? '', /different/);
  assert.match(e.gull ?? '', /too long/);
  assert.equal(e.emblem, undefined);
  assert.match(foundErrors({ ...FOUND, crew: 'A'.repeat(30) }).crew ?? '', /at most 24/);
});

test('recover and settings say what happened', () => {
  const failed = recoverView({ from: 'new', lost: '', failed: 'The save could not be read.' });
  assert.deepEqual(failed.ways.map((w) => w.way), ['retry']);
  const replayed = recoverView({ from: 'journal', lost: 'Two actions since Day 4 were lost.', failed: null });
  assert.match(replayed.found, /journal/);
  assert.ok(replayed.ways.some((w) => w.way === 'carry'));
  assert.equal(settingsView(null).backup, 'Never backed up.');
  assert.match(settingsView({ day: 12, season: 0 }).backup, /Day 12, Season 1/);
});
