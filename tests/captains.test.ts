// A card's captain sails by her stats (#58 step 6, D15): each stat the sim reads moves, on one seed, the function that
// reads it the expected way from 4 to 16. No races: the functions themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Captain, CaptainStats, Stat } from '../src/race.ts';
import { evades, noticed } from '../src/sim/bot.ts';
import { reactTime, spreadBy } from '../src/sim/gunner.ts';
import { seesRam } from '../src/sim/helmsman.ts';
import { captainOf, temper, temperOf, tired } from '../src/sim/temper.ts';

const MIDDLING: CaptainStats = { gunnery: 10, helm: 10, seamanship: 10, nerve: 10, consistency: 10, stormcraft: 10, stamina: 10, feedback: 10, lookout: 10 };
const captain = (stat: Stat, x: number): Captain => ({ seed: 7, style: 'raider', stats: { ...MIDDLING, [stat]: x } });
/** Her temper with one stat at x, `clock` s into a race expected to last `length` s. */
const at = (stat: Stat, x: number, clock = 0, length = 0) => temperOf(captain(stat, x), clock, length);

test('Gunnery: her balls go off narrower', () => {
  assert.ok(spreadBy(at('gunnery', 16).gunnery) < spreadBy(at('gunnery', 4).gunnery));
});

test('Helm: she sees a ram coming more often, and gets clear of one more readily', () => {
  assert.ok(seesRam(at('helm', 16).helm) > seesRam(at('helm', 4).helm));
  assert.ok(evades(0.6, at('helm', 16).helm) > evades(0.6, at('helm', 4).helm));
});

test('Nerve: her will to fight rises, and the hull she runs below falls', () => {
  const bold = at('nerve', 16), timid = at('nerve', 4);
  assert.ok(bold.fight > timid.fight && bold.aggro > timid.aggro);
  assert.ok(bold.run < timid.run);
});

test('Stormcraft: her margin inside the storm shrinks', () => {
  assert.ok(at('stormcraft', 16).margin < at('stormcraft', 4).margin);
});

test('Stamina: nothing till half way, then the late fall in Gunnery and Helm shrinks', () => {
  assert.equal(tired(4, 199, 400), 0);
  assert.ok(tired(16, 400, 400) < tired(4, 400, 400) && tired(4, 400, 400) > 0);
  assert.ok(tired(4, 300, 400) < tired(4, 400, 400));
  const fresh = at('stamina', 4, 0, 400), spent = at('stamina', 4, 400, 400), hardy = at('stamina', 16, 400, 400);
  assert.ok(spent.gunnery < fresh.gunnery && spent.helm < fresh.helm && spent.lookout === fresh.lookout);
  assert.ok(hardy.gunnery > spent.gunnery);
});

test('Lookout: she notices a ship from further, and fires on one she has just seen sooner', () => {
  assert.ok(noticed(at('lookout', 16)) > noticed(at('lookout', 4)));
  assert.ok(reactTime(at('lookout', 16).lookout) < reactTime(at('lookout', 4).lookout));
});

test('her general skill is the mean of Gunnery, Helm and Lookout; her style sets loot, mending, claim and standoff', () => {
  const t = temperOf({ seed: 7, style: 'scavenger', stats: { ...MIDDLING, gunnery: 4, helm: 10, lookout: 16 } }, 0, 0);
  assert.ok(Math.abs(t.skill - (t.gunnery + t.helm + t.lookout) / 3) < 1e-12);
  const turtle = temperOf({ seed: 7, style: 'turtle', stats: MIDDLING }, 0, 0);
  assert.ok(t.loot > turtle.loot && t.lootReach > turtle.lootReach && turtle.claim > t.claim && turtle.mend > t.mend);
});

test("captainOf(seed)'s captain sails as temper(seed) does, but for her skills' last bits", () => {
  for (let seed = 1; seed < 40; seed++) {
    const a = temper(seed), b = temperOf(captainOf(seed), 0, 0);
    for (const k of Object.keys(a) as (keyof typeof a)[]) assert.ok(Math.abs(a[k] - b[k]) < 1e-12, `${seed} ${k}: ${a[k]} vs ${b[k]}`);
  }
});
