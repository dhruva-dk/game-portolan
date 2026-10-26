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
import { afloat, createMatch, EVENT, TICK } from '../../src/sim/state.ts';
import { CONSUMABLE, FITTING, FITTING_SLOT, TIERS } from '../../src/sim/tables.ts';
import { REGIONS } from '../../src/sim/world/regions.ts';
import { careerChartData, regionCells, unrollMask } from '../../src/ui/careerChart.ts';
import { draw } from '../../src/career/league.ts';
import { CHART_GRID } from '../../src/career/voyage.ts';
import { cellDir } from '../../src/sim/sphere.ts';
import { v3 } from '../../src/sim/math.ts';
import { cardLines } from './results.lines.ts';
import { cardFace, centreOf, chestLayout, chestOffers, chestPick, chestWords, headerOf, itemDoes, itemName, laterSize, pickAt, TIER_WORDS, type Offer } from '../../src/ui/chestChoice.ts';
import { layoutText } from '../../src/lettering/text.ts';
import { hudLayout, type HudButton } from '../../src/ui/hud.ts';
import { inset, MIN_LETTER, MIN_TARGET, safeOf, widthOf, within } from '../../src/ui/inkpage.ts';
import type { Rect } from '../../src/ui/safeArea.ts';
import { FIGURE, nextLayout, resultsLayout, resultsModel, skipLayout, timeColumn, timelineFit } from '../../src/ui/results.ts';
import { newTutorial, promptLayout, sense, tutorialOver, tutorialStep, type Moment } from '../../src/ui/tutorial.ts';
import { world } from '../sim/vectors.ts';
import { inkChart, madeMatch } from './results.fixtures.ts';

const IPHONE = { width: 956, height: 440, dpr: 3, safe: { top: 0, right: 62, bottom: 20, left: 62 } };
const IPAD = { width: 1376, height: 1032, dpr: 2, safe: { top: 24, right: 0, bottom: 20, left: 0 } };
const VIEWS = [IPHONE, IPAD];
const MINI = { width: 812, height: 375, dpr: 3, safe: { top: 0, right: 50, bottom: 21, left: 50 } };
const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

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
      const k = tutorialStep(t, { tick, breakOff: lessons[LESSON.breakOff] >= 0, offer: false, rivalNear: false, stormNear: false, homeward: true, lessons, ...o });
      if (k >= 0 && k !== prev) seen.push(k);
      prev = k;
    }
  };
  run(0, 300, { homeward: false }, LESSON.breakOff, 260);
  run(300, 700, { homeward: false }, LESSON.steer, 600);
  run(700, 900, { homeward: false });
  assert.equal(t.shown[LESSON.loop], -1, 'the loop prompt waits until head home can close one');
  run(900, 1400, {}, LESSON.loop, 1200);
  assert.ok(t.shown[LESSON.loop] >= 900);
  run(1400, 1900, {}, LESSON.gull, 1700);
  run(1900, 2300, { offer: true }, LESSON.chest, 2200);
  run(2300, 2700, { rivalNear: true }, LESSON.broadside, 2600);
  run(2700, 3200, { stormNear: true }, LESSON.storm, 3000);
  run(3200, 3400, {});
  assert.deepEqual(seen, [LESSON.breakOff, LESSON.steer, LESSON.loop, LESSON.gull, LESSON.chest, LESSON.broadside, LESSON.storm]);
  assert.ok(t.shown.every((s, k) => s >= 0 && s < lessons[k]), `${t.shown} ${lessons}`);
  assert.ok(tutorialOver(t, lessons));
  const u = newTutorial(), early = new Array<number>(LESSONS).fill(-1);
  early[LESSON.breakOff] = 10;
  let shown = -1;
  for (let tick = 0; tick < 900; tick++) { const k = tutorialStep(u, { tick, breakOff: true, offer: tick >= 300, rivalNear: false, stormNear: false, homeward: true, lessons: early }); if (k === LESSON.chest && shown < 0) shown = tick; }
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
    if (k === LESSON.loop && prev !== k) assert.ok(state.ships[0].laid.length > 0, 'the loop prompt only with an open trail out of her waters');
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
    assert.ok(c.cards.every((r) => within(r, c.panel) && !overlaps(r, c.later)));
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
    const n = nextLayout(view);
    assert.ok(within(n.page, s) && within(n.cont, n.page) && n.cont.width >= MIN_TARGET && n.cont.height >= MIN_TARGET);
    assert.equal(n.cells.length, 9);
    assert.ok(n.cells.every((c) => within(c, n.page) && c.y >= n.cont.y + n.cont.height));
    const k = skipLayout(view);
    assert.ok(within(k.card, s) && within(k.button, k.card) && k.button.width >= MIN_TARGET && k.button.height >= MIN_TARGET);
  }
});

test('the chest choice leaves the match in sight and in hand: clear of the centre, the stick and every control, on the free thumb’s side', () => {
  const box = (b: HudButton): Rect => (b.w !== undefined && b.h !== undefined ? { x: b.x - b.w / 2, y: b.y - b.h / 2, width: b.w, height: b.h } : { x: b.x - b.hit, y: b.y - b.hit, width: 2 * b.hit, height: 2 * b.hit });
  for (const view of VIEWS) for (const left of [false, true]) {
    const L = hudLayout(view, left), c = chestLayout(view, 3, L), s = safeOf(view), name = `${view.width} ${left ? 'left' : 'right'}-handed`;
    const drawn = [c.panel, c.later];
    for (const r of drawn) {
      assert.ok(within(r, s), `${name}: in the safe area`);
      assert.ok(!overlaps(r, centreOf(s)), `${name}: out of the frame's centre (the ship and the sea ahead)`);
      assert.ok(!overlaps(r, L.stick), `${name}: clear of the stick's half`);
      for (const [k, q] of [['hull', L.hull], ['top', L.top], ['purse', L.purse], ['sail', L.sail]] as const) assert.ok(!overlaps(r, q), `${name}: clear of the ${k}`);
      for (const f of L.fittings) assert.ok(!overlaps(r, { x: f.x - f.r, y: f.y - f.r, width: 2 * f.r, height: 2 * f.r }), `${name}: clear of the fittings`);
      for (const b of L.buttons) if (b.kind !== 'chart' || c.column) assert.ok(!overlaps(r, box(b)), `${name}: clear of ${b.kind}`);
    }
    assert.ok(c.cards.every((q) => (left ? q.x + q.width <= s.x + s.width / 2 : q.x >= s.x + s.width / 2)), `${name}: on the thumb's side`);
    assert.equal(c.column, view === IPAD, `${name}: ${c.column ? 'column' : 'row'}`);
    if (c.column) assert.ok(!overlaps(c.panel, L.chart));
    assert.ok(c.cards.every((q) => q.width >= MIN_TARGET && q.height >= 90), `${name}: cards a thumb can take`);
    assert.ok(c.panel.height <= s.height * 0.5, `${name}: a compact panel, ${c.panel.height.toFixed(0)} of ${s.height} tall`);
    assert.ok(c.cards.every((q) => within(q, c.panel)), `${name}: the cards inside the panel`);
  }
  const disc = (d: { x: number; y: number; r: number }): Rect => ({ x: d.x - d.r, y: d.y - d.r, width: 2 * d.r, height: 2 * d.r });
  for (const view of [IPHONE, MINI, IPAD]) {
    const cards: Rect[][] = [];
    for (const left of [false, true]) {
      const L = hudLayout(view, left), s = safeOf(view), chest = chestLayout(view, 3, L), name = `${view.width} ${left ? 'left' : 'right'}-handed`;
      const controls: [string, Rect][] = [['hull', L.hull], ['share', L.share], ['top', L.top], ['compact chart', L.chart], ['sail', L.sail], ['purse', L.purse],
        ['wind rose', disc(L.compass)], ['stern glass', disc(L.sternGlass)], ...L.fittings.map((f, i): [string, Rect] => [`fitting ${i}`, disc(f)]), ...L.buttons.map((b): [string, Rect] => [b.kind, box(b)])];
      const rest = { x: L.stick.x, y: L.stick.y + L.stick.height / 2, width: L.stick.width, height: L.stick.height / 2 };
      cards.push([]);
      for (let k = 0; k < LESSONS; k++) {
        const p = promptLayout(view, k, left, L), c = p.card, what = `${name}: prompt ${k}`;
        cards[cards.length - 1].push(c);
        assert.ok(within(c, s), `${what}: in the safe area`);
        assert.ok(!overlaps(c, centreOf(s)), `${what}: out of the frame's centre`);
        for (const [n, q] of controls) assert.ok(!overlaps(c, q), `${what}: clear of the ${n}`);
        assert.ok(!overlaps(c, rest), `${what}: clear of where the stick comes up`);
        if (k === LESSON.chest) assert.ok(!overlaps(c, chest.sheet), `${what}: beside the chest's panel, not on it`);
        for (const w of p.words) {
          assert.ok(w.o.size >= MIN_LETTER, `${what}: "${w.text}" at ${w.o.size.toFixed(1)}`);
          const b = layoutText(w.text, w.o).box;
          assert.ok(within({ x: w.x + b.left, y: w.y + b.top, width: b.right - b.left, height: b.bottom - b.top }, inset(c, 4)), `${what}: "${w.text}" inside its scrap`);
        }
      }
    }
    cards[0].forEach((r, k) => { const m = cards[1][k]; assert.ok(Math.abs(view.width - r.x - r.width - m.x) < 1 && Math.abs(r.y - m.y) < 1, `${view.width}: prompt ${k} mirrored for the left hand`); });
  }
  const offerOf = (kind: number, tier: number, replaces: number, takeable = true): Offer => {
    const consumable = kind >= CONSUMABLE.patchKit, slot = consumable ? -1 : FITTING_SLOT[kind];
    return { index: 0, item: { kind, tier }, name: itemName(kind), does: itemDoes(kind), consumable, slot, pigment: '#4566b0', tierWord: TIER_WORDS[tier], gold: tier === TIERS - 1,
      takeable, replaces: replaces > 0 ? { kind: replaces, tier: 0 } : null, count: consumable ? 3 : 0, worth: 0, best: false };
  };
  const kinds = [...Object.values(FITTING).filter((f) => f > 0), ...Object.values(CONSUMABLE)];
  const longest = (slot: number): number => kinds.filter((f) => f < CONSUMABLE.patchKit && FITTING_SLOT[f] === slot).reduce((a, b) => (widthOf(itemName(b), { size: 12 }) > widthOf(itemName(a), { size: 12 }) ? b : a));
  const boxOf = (w: { text: string; x: number; y: number; o: Parameters<typeof layoutText>[1] }): Rect => { const b = layoutText(w.text, w.o).box; return { x: w.x + b.left, y: w.y + b.top, width: b.right - b.left, height: b.bottom - b.top }; };
  for (const view of [IPHONE, MINI, IPAD]) for (const left of [false, true]) {
    const L = hudLayout(view, left), c = chestLayout(view, 3, L), name = `${view.width} ${left ? 'left' : 'right'}-handed`;
    assert.ok(c.cards.every((q) => within(q, c.panel)), `${name}: the cards inside the panel`);
    const ls = laterSize(c);
    assert.ok(ls >= MIN_LETTER && widthOf('Later', { size: ls }) <= c.later.width - 8, `${name}: "Later" fits its tab at ${ls.toFixed(1)}`);
    if (c.column) for (let t = 0; t < TIERS; t++) { const h = headerOf(c); assert.ok(h.size >= MIN_LETTER && widthOf(chestWords(t), { size: h.size, swash: true }) <= h.w, `${name}: the header fits`); }
    for (const kind of kinds) for (const tier of [0, TIERS - 1]) {
      const fitting = kind < CONSUMABLE.patchKit, cases = fitting ? [offerOf(kind, tier, 0), offerOf(kind, tier, longest(FITTING_SLOT[kind]))] : [offerOf(kind, tier, 0), offerOf(kind, tier, 0, false)];
      for (const o of cases) for (const card of c.cards) {
        const k = c.k, f = cardFace(o, card, k), frame = inset(card, 5 * k), what = `${name}: ${o.name} (${o.replaces ? `in place of ${itemName(o.replaces.kind)}` : o.takeable ? 'free' : 'full'})`;
        const icon = { x: f.icon.x - f.icon.r, y: f.icon.y - f.icon.r, width: 2 * f.icon.r, height: 2 * f.icon.r };
        assert.ok(within(icon, frame), `${what}: the roundel inside the card`);
        const boxes = f.words.map(boxOf);
        f.words.forEach((w, i) => {
          assert.ok(w.o.size >= MIN_LETTER, `${what}: "${w.text}" at ${w.o.size.toFixed(1)} ≥ ${MIN_LETTER}`);
          assert.ok(within(boxes[i], frame), `${what}: "${w.text}" inside the card (${JSON.stringify(boxes[i])} in ${JSON.stringify(frame)})`);
          assert.ok(!overlaps(boxes[i], icon), `${what}: "${w.text}" clear of the roundel`);
          for (let j = 0; j < i; j++) assert.ok(!overlaps(boxes[i], boxes[j]), `${what}: "${w.text}" clear of "${f.words[j].text}"`);
        });
      }
    }
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

function cellBin(cell: number): { x: number; y: number } {
  const d = cellDir(CHART_GRID, cell, v3()), len = Math.hypot(d.x, d.y, d.z);
  return { x: Math.min(359, Math.floor(((Math.atan2(d.z, d.x) + Math.PI) / (2 * Math.PI)) * 360)), y: Math.min(179, Math.floor(((Math.PI / 2 - Math.asin(d.y / len)) / Math.PI) * 180)) };
}

test('the timeline tells the gull and the chests, leaves no bare gap when short of room, and its figures read on an iPhone', () => {
  const before = newCareer(21), { drawn } = toSetup(before, 99), result = madeMatch(4), voyage = newVoyage(), after = applyResult(before, result, voyage);
  const t0 = result.timeline[0].tick, at = (s: number) => t0 + Math.round(s / TICK);
  const gull = [{ tick: at(20), kind: EVENT.called, ship: 0, by: -1, amount: 12 }, { tick: at(50), kind: EVENT.landed, ship: 0, by: -1, amount: 1 },
    { tick: at(60), kind: EVENT.called, ship: 3, by: -1, amount: 12 }, { tick: result.ships[0].tick + 99, kind: EVENT.dive, ship: 0, by: 2, amount: 4 }];
  const span = result.ships[0].tick - t0, loops = Array.from({ length: 12 }, (_, i) => ({ tick: t0 + Math.round(span * (0.55 + i * 0.02)), kind: EVENT.loop, ship: 0, by: -1, amount: 100 + i }));
  const long = { ...result, timeline: [...result.timeline, ...loops].sort((a, b) => a.tick - b.tick) };
  const m = resultsModel(before, after, long, drawn, voyage, gull), text = m.timeline.map((l) => l.text).join(' | ');
  assert.ok(text.includes('Sent the gull for a chest, 12 doubloons') && text.includes('The gull brought its chest aboard'), text);
  assert.ok(!text.includes('dove'), 'nothing of hers after she sank; no other ship\'s gull');
  assert.ok(m.timeline.every((l, i) => i === 0 || l.tick >= m.timeline[i - 1].tick), 'in order');
  for (const view of [IPHONE, MINI, IPAD]) {
    const l = resultsLayout(view), rows = 7, fit = timelineFit(m.timeline, rows), shown = fit.map((x) => x.text).join(' | ');
    assert.ok(fit.length <= rows && fit.length >= Math.min(rows, 3), `${fit.length} lines in ${rows}`);
    assert.ok(fit.every((x) => !/^\.+$|…/.test(x.text)), `no bare gap: ${shown}`);
    assert.ok(fit.every((x, i) => i === 0 || x.tick >= fit[i - 1].tick), 'in order');
    for (const want of [/^Broke off into/, /^Chose the Long Guns/, /^Closed \d+ loops, \d+ of sea/, /^Sunk by /]) assert.ok(fit.some((x) => want.test(x.text)), `${want} in ${shown}`);
    const short = resultsModel(before, after, result, drawn, voyage, gull).timeline;
    assert.ok(timelineFit(short, 10).some((x) => /^The gull fetched a chest, 12 doubloons/.test(x.text)), 'a call and its landing told as one');
    assert.ok(fit[fit.length - 1].kind === 'end' || /^Sunk by /.test(fit[fit.length - 1].text), 'the ending last');
    assert.ok(FIGURE * l.k >= MIN_LETTER + 3, `figures at ${(FIGURE * l.k).toFixed(1)}`);
    assert.ok(timeColumn(l.k) - 8 * l.k >= widthOf('10:00', { size: FIGURE * l.k }) && timeColumn(l.k) < l.mid.width * 0.3, 'the time column holds the widest time');
  }
});
