// The office's shell and kit, as far as they are plain: the screens' registry, the fixture desk every screen is drawn from on the debug
// page, and the kit's own figures (a place, a number, a share, a tone).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE } from '../src/office/fixtures/desk.ts';
import { TABS } from '../src/office/office.ts';
import { toneOf } from '../src/ui/ink.ts';
import { grouped, ordinal, share } from '../src/ui/kit/part.ts';
import { NAMES, SCREENS } from '../src/ui/office/screens.ts';

test('every screen built has a name the page can ask for, a title, and lights a tab of the nav or none', () => {
  for (const [name, entry] of Object.entries(SCREENS)) {
    assert.ok(
      NAMES.some((n) => n === name),
      `${name} is in NAMES`
    );
    assert.ok(entry.title.length > 0, `${name} has a title`);
    assert.ok(
      entry.tab === null || TABS.includes(entry.tab),
      `${name} lights a tab`
    );
  }
  assert.equal(new Set(NAMES).size, NAMES.length, 'no name twice');
});

test('a bare screen lights no tab: it has no nav', () => {
  for (const [name, entry] of Object.entries(SCREENS))
    if (entry.bare) assert.equal(entry.tab, null, name);
});

test('the fixture desk: a team in two colours the page can show, and the menu on it', () => {
  const shell = FIXTURE.shell(),
    menu = FIXTURE.view('menu');
  for (const c of shell.team.colours) assert.match(c, /^#[0-9a-f]{6}$/);
  assert.notEqual(shell.team.colours[0], shell.team.colours[1]);
  assert.equal(menu.career.championships, 3);
  assert.equal(menu.career.teams, 60);
  assert.equal(menu.single.ships, 80);
  assert.deepEqual(menu.kept?.team, shell.team);
});

test('a place is said as an ordinal', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 80, 101, 111].map(ordinal),
    [
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '80th',
      '101st',
      '111th',
    ]
  );
});

test('a number is grouped by thousands, its minus a true one', () => {
  assert.equal(grouped(211000), '211,000');
  assert.equal(grouped(-4297000), '−4,297,000');
  assert.equal(grouped(950), '950');
  assert.equal(grouped(0), '0');
});

test('a share is a length of what it is a share of, never past its ends', () => {
  assert.equal(share(0.5), '50.0%');
  assert.equal(share(-1), '0.0%');
  assert.equal(share(2), '100.0%');
});

test('a value takes its tone from its share of the best: good, fair, warn, bad', () => {
  assert.deepEqual(
    [20, 16, 15, 12, 10, 8, 6, 4, 0].map((v) => toneOf(v / 20)),
    ['good', 'good', 'good', 'fair', 'fair', 'warn', 'warn', 'bad', 'bad']
  );
});
