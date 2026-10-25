// WP27 part A: the chest choice gives the very pick a captain would and passes the input validator; the results tell
// the match as it was; the career chart reads the career; the first voyage prompts each lesson once, scripted and on
// the real sim; every sheet fits the safe area of the iPhone and the iPad with targets of 44 pt or more.
//   node --test tests/ui/results.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyResult } from '../../src/career/progress.ts';
import { toSetup } from '../../src/career/setup.ts';
import { newCareer } from '../../src/career/state.ts';
import { LESSON, LESSONS, newVoyage, observe } from '../../src/career/voyage.ts';
import { seaFor } from '../../src/sim/environment.ts';
import { idleInput, inputAt, parseRecording, record, recorder, replay } from '../../src/sim/input.ts';
import { bestPick, isConsumable } from '../../src/sim/items.ts';
import { step } from '../../src/sim/match.ts';
import { afloat, createMatch } from '../../src/sim/state.ts';
import { CONSUMABLE, FITTING, FITTING_SLOT, TIERS } from '../../src/sim/tables.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { careerChartData, regionCells, unrollMask } from '../../src/ui/careerChart.ts';
import { draw } from '../../src/career/league.ts';
import { CHART_GRID } from '../../src/career/voyage.ts';
import { cellDir } from '../../src/sim/sphere.ts';
import { v3 } from '../../src/sim/math.ts';
import { cardLines } from './results.lines.ts';
import { chestLayout, chestOffers, chestPick, pickAt } from '../../src/ui/chestChoice.ts';
import { MIN_TARGET, safeOf, within } from '../../src/ui/inkpage.ts';
import { nextLayout, resultsLayout, resultsModel, skipLayout } from '../../src/ui/results.ts';
import { newTutorial, promptLayout, sense, tutorialOver, tutorialStep, type Moment } from '../../src/ui/tutorial.ts';
import { world } from '../sim/vectors.ts';
import { inkChart, madeMatch } from './results.fixtures.ts';

const IPHONE = { width: 956, height: 440, dpr: 3, safe: { top: 0, right: 62, bottom: 20, left: 62 } };
const IPAD = { width: 1376, height: 1032, dpr: 2, safe: { top: 24, right: 0, bottom: 20, left: 0 } };
const VIEWS = [IPHONE, IPAD];

test('a touch on the card a captain would take gives its very chestPick, through the input validator and the sim', () => {
  const { setup } = toSetup(newCareer(3), 77), sea = seaFor(world(), 77), state = createMatch(setup), ship = state.ships[0];
  let s = 12345;
  const rnd = (n: number): number => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
  let checked = 0, stepped = 0;
  for (let trial = 0; trial < 300; trial++) {
    ship.offer.length = 0;
    for (let k = 0; k < 3; k++) ship.offer.push({ kind: 1 + rnd(25), tier: rnd(TIERS) });
    for (let slot = 0; slot < ship.fittings.length; slot++) {
      const kinds = FITTING_SLOT.flatMap((sl, kind) => (sl === slot ? [kind] : []));
      ship.fittings[slot] = rnd(3) === 0 ? { kind: FITTING.none, tier: 0 } : { kind: kinds[rnd(kinds.length)], tier: rnd(TIERS) };
    }
    for (const c of ship.consumables) { c.kind = CONSUMABLE.patchKit + rnd(5); c.count = rnd(3); }
    const offers = chestOffers(ship), best = bestPick(ship);
    assert.equal(offers.length, 3);
    offers.forEach((o, k) => assert.equal(chestPick(offers, k), o.takeable ? k : -1));
    for (const view of VIEWS) {
      const l = chestLayout(view);
      offers.forEach((_, k) => { const c = l.cards[k]; assert.equal(pickAt(l, c.x + c.width / 2, c.y + c.height / 2), k); });
      if (best < 0) { assert.ok(offers.every((o) => !o.takeable)); continue; }
      const c = l.cards[best], pick = chestPick(offers, pickAt(l, c.x + c.width / 2, c.y + c.height / 2));
      assert.equal(pick, best);
      assert.ok(offers[best].best);
      const r = recorder();
      record(r, 9, { ...idleInput(), chestPick: pick });
      const raw = JSON.parse(JSON.stringify(r)) as Record<string, unknown>;
      assert.equal(inputAt(replay(parseRecording('events' in raw ? raw : raw.recording)), 9).chestPick, best);
      checked++;
    }
    if (best >= 0 && trial % 15 === 0 && afloat(ship)) {
      const item = ship.offer[best];
      step(sea, state, { ...idleInput(), chestPick: best });
      assert.equal(ship.offer.length, 0, 'the deck clears');
      if (isConsumable(item.kind)) assert.ok(ship.consumables.some((cs) => cs.kind === item.kind && cs.count > 0));
      else assert.deepEqual({ ...ship.fittings[FITTING_SLOT[item.kind]] }, { kind: item.kind, tier: item.tier });
      stepped++;
    }
  }
  assert.ok(checked > 400 && stepped > 5, `${checked} picks, ${stepped} stepped`);
});

test('the results tell the match as it was: place, tallies, timeline, fates, rank and league', () => {
  for (const place of [1, 4, 10]) {
    const before = newCareer(17 + place), { drawn } = toSetup(before, 99), result = madeMatch(place), voyage = newVoyage();
    voyage.breakOff = 2;
    voyage.entered[2] = 140;
    voyage.lessons[LESSON.breakOff] = 140;
    const after = applyResult(before, result, voyage), m = resultsModel(before, after, result, drawn, voyage), me = result.ships[0];
    assert.equal(m.place, place);
    assert.equal(m.won, place === 1);
    assert.deepEqual([m.claimed, m.sank, m.bank, m.treasure], [Math.round(me.claimed), me.sank, Math.round(me.bank), Math.round(me.treasure)]);
    const text = m.timeline.map((l) => l.text).join(' | ');
    for (const want of [`Broke off into ${REGIONS[2].name.replace(/^The /, 'the ')}`, 'Closed a loop, 420 of sea', 'broke your trail', 'Chose the Long Guns', 'Sank ']) assert.ok(text.includes(want), `${want} in ${text}`);
    assert.ok(place === 1 ? text.endsWith('the sea is yours') : /Sunk by .+/.test(m.timeline[m.timeline.length - 1].text), text);
    assert.ok(m.timeline.every((l, i) => i === 0 || l.tick >= m.timeline[i - 1].tick), 'in order');
    assert.equal(m.fates.length, 9);
    assert.ok(m.fates.every((f, i) => i === 0 || f.place > m.fates[i - 1].place));
    assert.equal(m.fates.find((f) => f.byYou)?.ship, 4);
    assert.ok(m.fates.every((f) => /^#[0-9a-f]{6}$/i.test(f.pigments[0]) && /^#[0-9a-f]{6}$/i.test(f.pigments[1])));
    assert.deepEqual([m.rank.before, m.rank.after], [before.player.points, after.player.points]);
    assert.equal(m.rank.promoted, after.player.tier > before.player.tier);
    const mine = m.league.filter((r) => r.player);
    assert.equal(mine.length, 1);
    assert.deepEqual(new Set(m.league.map((r) => r.to)).size, m.league.length);
    assert.deepEqual(m.named, [REGIONS[2].name]);
    assert.deepEqual(m.lessons, [LESSON.breakOff]);
    assert.equal(m.firstVoyage, true);
    assert.ok(cardLines(m).length > 0);
  }
});

test('the career chart reads the career: near blank at first, inked as seen, names as lettered', () => {
  const c = newCareer(5), d0 = careerChartData(c);
  assert.equal(d0.named, 0);
  assert.equal(d0.matches, 0);
  assert.ok(d0.inked < 200, `${d0.inked}`);
  inkChart(c, 2 / 3, 5);
  const d1 = careerChartData(c);
  assert.ok(d1.inked >= 640 && d1.inked <= 700, `${d1.inked}`);
  assert.equal(d1.named, 5);
  assert.ok(d1.regions.some((r) => r.breakOffs > 0));
  c.chart.seen.fill(255);
  c.chart.named.forEach((_, i) => { c.chart.named[i] = { match: 0, tick: i }; });
  const d2 = careerChartData(c);
  assert.equal(d2.inked, 1000);
  assert.equal(d2.named, REGIONS.length);
  assert.ok(d2.regions.every((r) => r.inked === 1000));
});

test('the first voyage, scripted: each lesson prompted once, in its moment, in order, folding when done', () => {
  const t = newTutorial(), lessons = new Array<number>(LESSONS).fill(-1), seen: number[] = [];
  let prev = -1;
  const run = (from: number, to: number, o: Partial<Moment>, lesson = -1, at = -1): void => {
    for (let tick = from; tick < to; tick++) {
      if (tick === at) lessons[lesson] = tick;
      const k = tutorialStep(t, { tick, breakOff: lessons[LESSON.breakOff] >= 0, offer: false, rivalNear: false, stormNear: false, lessons, ...o });
      if (k >= 0 && k !== prev) seen.push(k);
      prev = k;
    }
  };
  run(0, 300, {}, LESSON.breakOff, 260);
  run(300, 700, {}, LESSON.steer, 600);
  run(700, 1400, {}, LESSON.loop, 1200);
  run(1400, 1900, {}, LESSON.gull, 1700);
  run(1900, 2300, { offer: true }, LESSON.chest, 2200);
  run(2300, 2700, { rivalNear: true }, LESSON.broadside, 2600);
  run(2700, 3200, { stormNear: true }, LESSON.storm, 3000);
  run(3200, 3400, {});
  assert.deepEqual(seen, [LESSON.breakOff, LESSON.steer, LESSON.loop, LESSON.gull, LESSON.chest, LESSON.broadside, LESSON.storm]);
  assert.ok(t.shown.every((s, k) => s >= 0 && s < lessons[k]), `${t.shown} ${lessons}`);
  assert.ok(tutorialOver(t, lessons));
  // a lesson learned before its moment is never prompted; an urgent moment hurries a calm prompt along
  const u = newTutorial(), early = new Array<number>(LESSONS).fill(-1);
  early[LESSON.breakOff] = 10;
  let shown = -1;
  for (let tick = 0; tick < 900; tick++) { const k = tutorialStep(u, { tick, breakOff: true, offer: tick >= 300, rivalNear: false, stormNear: false, lessons: early }); if (k === LESSON.chest && shown < 0) shown = tick; }
  assert.equal(u.shown[LESSON.breakOff], -1);
  assert.ok(u.shown[LESSON.steer] >= 0 && shown >= 300 && shown <= 300 + 7 * 30 + 1, `chest shown at ${shown}`);
});

test('the first voyage on the real sim: the moments come from the match itself, each prompt at most once', () => {
  const career = newCareer(21), { setup } = toSetup(career, 4242);
  assert.equal(setup.firstVoyage, true);
  const fleet = setup.fleet!.map((o, i) => (i === 0 ? { ...o, captain: { temperament: 0, tier: 1 } } : o));
  const sea = seaFor(world(), 4242), state = createMatch({ ...setup, fleet }), v = newVoyage(), t = newTutorial(), seen: number[] = [];
  let prev = -1;
  for (let tick = 0; tick < 30 * 60 * 4 && afloat(state.ships[0]); tick++) {
    step(sea, state, idleInput());
    observe(v, sea, state);
    const k = tutorialStep(t, sense(state, v));
    if (k >= 0 && k !== prev) seen.push(k);
    prev = k;
  }
  assert.ok(seen.length >= 2, `prompts ${seen}, lessons ${v.lessons}`);
  assert.equal(new Set(seen).size, seen.length);
  for (let k = 0; k < LESSONS; k++) if (t.shown[k] >= 0 && v.lessons[k] >= 0) assert.ok(t.shown[k] <= v.lessons[k], `lesson ${k}`);
});

test('every sheet fits the safe area of the iPhone and the iPad, with targets of 44 pt or more', () => {
  for (const view of VIEWS) {
    const s = safeOf(view), c = chestLayout(view);
    assert.ok(within(c.sheet, s));
    for (const r of [...c.cards, c.later]) { assert.ok(within(r, c.sheet)); assert.ok(r.width >= MIN_TARGET && r.height >= MIN_TARGET); }
    assert.ok(c.cards.every((r) => r.y + r.height <= c.later.y));
    const r = resultsLayout(view);
    assert.ok(within(r.page, s));
    for (const col of [r.left, r.mid, r.right, r.cont]) assert.ok(within(col, r.page));
    assert.ok(r.cont.width >= MIN_TARGET && r.cont.height >= MIN_TARGET);
    assert.ok(r.rose.y + r.rose.r + 70 * r.k <= r.left.y + r.left.height, 'the rose and its lines fit the column');
    for (let k = 0; k < LESSONS; k++) for (const left of [false, true]) {
      const p = promptLayout(view, k, left);
      assert.ok(within(p.card, s), `lesson ${k}`);
      assert.ok(p.card.height >= MIN_TARGET);
    }
    // part B: the next voyage's page, the skip card, the stowed chest's chip beside the compact chart
    const n = nextLayout(view);
    assert.ok(within(n.page, s) && within(n.cont, n.page) && n.cont.width >= MIN_TARGET && n.cont.height >= MIN_TARGET);
    assert.equal(n.cells.length, 9);
    assert.ok(n.cells.every((c) => within(c, n.page) && c.y >= n.cont.y + n.cont.height));
    const k = skipLayout(view);
    assert.ok(within(k.card, s) && within(k.button, k.card) && k.button.width >= MIN_TARGET && k.button.height >= MIN_TARGET);
  }
});

test('part B: the results end with the next voyage’s nine, and the chart inks a voyage’s seas in the order it entered them', () => {
  const before = newCareer(5), result = madeMatch(3), voyage = newVoyage(), { drawn } = toSetup(before, 3);
  const after = applyResult(before, result, voyage), m = resultsModel(before, after, result, drawn, voyage);
  assert.deepEqual(m.next.map((c) => c.id), draw(after));
  voyage.entered[4] = 90;
  voyage.entered[7] = 600;
  const mask = unrollMask(voyage.entered), region = regionCells(), mean = (r: number): number => {
    let sum = 0, n = 0;
    region.forEach((q, cell) => { if (q === r) { const { x, y } = cellBin(cell); sum += mask[y * 360 + x]; n++; } });
    return sum / n;
  };
  assert.ok(mean(4) < mean(7) && mean(7) < mean(1), `${mean(4).toFixed(2)} < ${mean(7).toFixed(2)} < ${mean(1).toFixed(2)}`);
});

/** A chart cell's bin on the 360 × 180 plate (careerChart.ts). */
function cellBin(cell: number): { x: number; y: number } {
  const d = cellDir(CHART_GRID, cell, v3()), len = Math.hypot(d.x, d.y, d.z);
  return { x: Math.min(359, Math.floor(((Math.atan2(d.z, d.x) + Math.PI) / (2 * Math.PI)) * 360)), y: Math.min(179, Math.floor(((Math.PI / 2 - Math.asin(d.y / len)) / Math.PI) * 180)) };
}
