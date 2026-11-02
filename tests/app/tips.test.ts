// First-time tips: each shows once ever and one at a time, the saved list survives a broken save, and a real match
// offers the Gale's tip on the Gale and the starter weapon's once the ship has settled at sea.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Intents } from '../../src/app/controls.ts';
import type { Moment } from '../../src/app/events.ts';
import { Session } from '../../src/app/session.ts';
import { TIPS, Tips, parseSeen, type TipId } from '../../src/app/tips.ts';
import { newCareer } from '../../src/career/career.ts';
import { planMatch } from '../../src/career/fleet.ts';
import { PHASE, TICK } from '../../src/sim/state.ts';
import type { CosmeticIds } from '../../src/render/actors/view.ts';
import { WEAPON_NAME } from '../../src/ui/model.ts';

const hands: Intents = {
  stick: { x: 0, y: 0 }, look: { x: 0, y: 0 }, idle: 0, throttle: 1,
  fire: false, dive: false, gust: false, reload: false, ability: false, drop: false, take: false, select: -1, swap: -1, hail: -1,
};

const session = (seed: number, skipGale = false) => new Session(planMatch(newCareer(seed)), {} as CosmeticIds, { seed, skipGale });

/** Tips as the app keeps them in capture mode (in memory), turned on. */
function tips(): Tips {
  const t = new Tips(true);
  t.on = true;
  return t;
}

/** Rides `seconds`, moving the tips on each tick; every tip that came up, in order. */
function ride(s: Session, t: Tips, seconds: number): string[] {
  const seen: string[] = [];
  for (let k = 0; k < seconds / TICK; k++) {
    s.control(hands, TICK);
    s.step();
    const v = t.update(s, TICK);
    if (v && seen[seen.length - 1] !== v.id) seen.push(v.id);
  }
  return seen;
}

test('the saved tips: known ids kept, anything else dropped, a broken save shows them all again', () => {
  assert.deepEqual([...parseSeen(null)], []);
  assert.deepEqual([...parseSeen('{oops')], []);
  assert.deepEqual([...parseSeen('{"gale":true}')], []);
  assert.deepEqual([...parseSeen('["gale","nope",3,"weather:fog"]')].sort(), ['gale', 'weather:fog']);
  for (const id of Object.keys(TIPS)) assert.ok(parseSeen(JSON.stringify([id])).has(id as TipId), `${id} round-trips`);
});

test('on the Gale its tip shows at once, stays its time, and never again', () => {
  const s = session(11), t = tips();
  assert.equal(s.me.phase, PHASE.gale);
  const first = t.update(s, TICK);
  assert.equal(first?.id, 'gale');
  assert.match(first!.text, /Dive/);
  const shown = ride(s, t, 6);
  assert.deepEqual(shown, ['gale'], 'the same card for its seven seconds');
  assert.equal(t.update(s, 1.5), null, 'then it goes, with nothing new on the Gale');
  t.reset();
  assert.equal(t.update(s, TICK), null, 'a new match does not show it again');
  assert.deepEqual(t.shown, ['gale']);
});

test('at sea the first tips wait for the ship to settle, then come one at a time, the starter weapon first', (t) => {
  const s = session(11, true), tp = tips();
  assert.equal(s.me.phase, PHASE.sea);
  assert.deepEqual(ride(s, tp, 2.5), [], 'nothing in the first seconds');
  const shown = ride(s, tp, 30);
  t.diagnostic(`tips in the first 32 s: ${shown.join(', ')}`);
  assert.equal(shown[0], 'weapon');
  assert.ok(shown.includes('gust') && shown.includes('ability'), 'gust and the ability follow');
  assert.equal(new Set(shown).size, shown.length, 'none twice');
  tp.reset();
  assert.ok(!ride(session(29, true), tp, 12).some((id) => shown.includes(id)), 'in the next match a tip seen does not come back');
});

test('the weapon tip names the weapon held, and moments offer theirs only for the player', () => {
  const s = session(11, true), t = tips();
  ride(s, t, 4);
  const card = t.update(s, 0);
  assert.equal(card?.id, 'weapon');
  assert.ok(Object.values(WEAPON_NAME).some((n) => card!.title === `Your ${n}`), `named: ${card!.title}`);
  // another ship's broadside offers nothing; the Storm closing in does, behind the card already up
  t.moment({ k: 'fire', ship: 3, weapon: 'cannon', rarity: 0, pos: s.me.pos, dir: s.me.pos } as Moment, s);
  t.moment({ k: 'stormPhase', phase: 1, seconds: 60 } as Moment, s);
  const after = ride(s, t, 40);
  assert.ok(after.includes('storm'), 'the Storm\'s tip comes up in turn');
  assert.ok(!after.includes('shot'), 'not the shot tip for someone else\'s shot');
});
