import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply } from '../src/career/apply.ts';
import { SPONSOR_ROSTER } from '../src/career/names.ts';
import type { CareerState, Sponsor, Team } from '../src/career/state.ts';
import { updateTeam } from '../src/career/teams.ts';
import { SPONSORS } from '../src/career/tuning.ts';
import { sponsorsView } from '../src/career/views/sponsors.ts';
import { rehearsed } from '../src/app/rehearse.ts';

const YOURS = 0;
const FRESH = rehearsed('sponsors', 0);
const DEALT = rehearsed('sponsors', 1);

const yours = (state: CareerState, change: (team: Team) => Team) =>
  updateTeam(state, YOURS, change);

const offer = (
  sponsor: number,
  objective: Sponsor['objective'],
  fee = 120,
  racesLeft = 7
): Sponsor => ({ sponsor, fee, bonus: 2 * fee, objective, racesLeft });

const signed = (state: CareerState, offerAt: number, slot: number) => {
  const done = apply(state, {
    type: 'SignSponsor',
    team: YOURS,
    offer: offerAt,
    slot,
  });
  assert.ok(done.ok);
  return done.state;
};

test('a new career has three empty slots and no offers', () => {
  const view = sponsorsView(FRESH);
  assert.deepEqual(view.slots, [null, null, null]);
  assert.deepEqual(view.offers, []);
  assert.deepEqual(view.open, [0, 1, 2]);
});

test('offers dealt after a race carry the roster name, emblem and terms', () => {
  const team = DEALT.teams[YOURS];
  const view = sponsorsView(DEALT);
  assert.equal(view.offers.length, SPONSORS.offers);
  view.offers.forEach((card, index) => {
    const held = team.offers[index];
    assert.equal(card.sponsor, held.sponsor);
    assert.equal(card.name, SPONSOR_ROSTER[held.sponsor].name);
    assert.equal(card.emblem, SPONSOR_ROSTER[held.sponsor].emblem);
    assert.equal(card.fee, held.fee);
    assert.equal(card.bonus, held.bonus);
    assert.equal(card.racesLeft, held.racesLeft);
    assert.equal(card.pays, held.fee * held.racesLeft);
    assert.equal(card.signable, true);
  });
});

test('each objective carries its figure', () => {
  const state = yours(DEALT, (t) => ({
    ...t,
    offers: [
      offer(3, 'top10'),
      offer(4, 'sinkTwo'),
      offer(5, 'sea'),
      offer(6, 'bothAfloat'),
    ],
  }));
  const figures = sponsorsView(state).offers.map((card) => [
    card.objective,
    card.figure,
    card.percent,
  ]);
  assert.deepEqual(figures, [
    ['top10', 10, false],
    ['sinkTwo', 2, false],
    ['sea', 3, true],
    ['bothAfloat', null, false],
  ]);
});

test('signing fills the slot and leaves the other offers', () => {
  const first = sponsorsView(DEALT).offers[1];
  const state = signed(DEALT, 1, 2);
  const view = sponsorsView(state);
  assert.equal(view.slots[2]?.name, first.name);
  assert.equal(view.slots[2]?.pays, first.pays);
  assert.deepEqual(view.open, [0, 1]);
  assert.equal(view.offers.length, SPONSORS.offers - 1);
  assert.ok(view.offers.every((card) => card.name !== first.name));
  assert.ok(view.offers.every((card) => card.signable));
});

test('with every slot filled the offers wait but cannot be signed', () => {
  const full = signed(signed(signed(DEALT, 0, 0), 0, 1), 0, 2);
  const refreshed = yours(full, (t) => ({
    ...t,
    offers: [offer(40, 'sea'), offer(41, 'top10')],
  }));
  const view = sponsorsView(refreshed);
  assert.deepEqual(view.open, []);
  assert.ok(view.slots.every((slot) => slot !== null));
  assert.equal(view.offers.length, 2);
  assert.ok(view.offers.every((card) => !card.signable));
  const refused = apply(refreshed, {
    type: 'SignSponsor',
    team: YOURS,
    offer: 0,
    slot: 1,
  });
  assert.deepEqual(refused, { ok: false, reason: 'locked' });
});

test('a slot counts its races down and empties at the end', () => {
  const state = yours(DEALT, (t) => ({
    ...t,
    sponsors: [offer(9, 'sea', 200, 1), null, offer(11, 'top10', 90, 10)],
  }));
  const view = sponsorsView(state);
  assert.equal(view.slots[0]?.racesLeft, 1);
  assert.equal(view.slots[0]?.pays, 200);
  assert.equal(view.slots[2]?.racesLeft, 10);
  assert.deepEqual(view.open, [1]);
});
