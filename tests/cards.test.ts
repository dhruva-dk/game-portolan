// What the screens set down that can be read without a page: the share of the
// sea held as a per cent (ui/ink.ts percent), her dye as the minimap's
// arrowhead and her end's sea held take it from the sea (dyeOn), and the seed
// panel's fleet card (ui/fleet.ts): its type's name under its mark, the
// traits only while it is held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linearToHex } from '../src/colour.ts';
import { fleetOf } from '../src/play/fleet.ts';
import type { Sea } from '../src/snapshot.ts';
import { CARD, fleetCard } from '../src/ui/fleet.ts';
import { INK, dyeOn, percent } from '../src/ui/ink.ts';
import { seedOf } from '../src/world/seeds.ts';

test('the sea held, as a per cent: always to a tenth, never below none', () => {
  assert.equal(percent(0), '0.0%');
  assert.equal(percent(0.0004), '0.0%');
  assert.equal(percent(0.0006), '0.1%');
  assert.equal(percent(0.123), '12.3%');
  assert.equal(percent(1), '100.0%');
  assert.equal(percent(-0.2), '0.0%');
});

test("her dye, from the sea's colours: hers by her id, white while it is not known", () => {
  const colours: Sea['colours'] = [
    [1, 0, 0],
    [0.9, 0.7, 0.1],
  ];
  const on = (own: number | null | undefined) => dyeOn({ colours }, own);
  assert.equal(on(0), '#ff0000');
  assert.equal(on(1), linearToHex([0.9, 0.7, 0.1]));
  assert.equal(on(2), INK.white);
  assert.equal(on(null), INK.white);
  assert.equal(dyeOn(undefined, 0), INK.white);
});

/** The texts a card sets down, each with where. */
const texts = (svg: string) =>
  [
    ...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)<\/text>/g),
  ].map((m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }));

test("the fleet card names its seed's match type under the type's mark", () => {
  // a seed of each type (play/fleet.ts fleetOf, sim/persona.ts TYPES)
  for (const [name, type] of [
    ['1', 'mixed'],
    ['4', 'bloodbath'],
    ['5', 'gold rush'],
    ['15', 'cagey'],
  ]) {
    const f = fleetOf(seedOf(name));
    assert.equal(f.name, type, `seed ${name}`);
    const word = texts(fleetCard(100, 50, f)).find((t) => t.text === type);
    assert.ok(word, `${type}: its name on the card`);
    // under the paper disc its mark is drawn in (at x + 22, y + 24, 21 across its half)
    assert.equal(word.x, 122);
    assert.ok(word.y > 50 + 24 + 21, `${type}: under its mark`);
  }
});

test('the fleet card shows the traits only while held: the bars otherwise', () => {
  const f = fleetOf(seedOf('1'));
  const bars = fleetCard(0, 0, f),
    held = fleetCard(0, 0, f, true);
  // each bar a persona's count over it; held, the skill as stars, rated to a tenth
  const rating = (f.skill.mean * 5).toFixed(1);
  // (a bar's wash is ochre, or gilt for the most common: a trait's spread is washed lighter, .7)
  const bar = /<rect [^>]*fill-opacity="0\.\d+"/g;
  assert.equal((bars.match(bar) ?? []).length, f.counts.length);
  assert.ok(!texts(bars).some((t) => t.text === rating));
  assert.ok(texts(held).some((t) => t.text === rating));
  assert.equal((held.match(bar) ?? []).length, 0);
  // the whole card takes the hold: its edge, filled though unseen, round all of it
  for (const svg of [bars, held])
    assert.match(svg, new RegExp(`^<path d="M-4 -8H${CARD + 4}V`));
});
