import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CAPTAINS } from '../../src/career/captains.ts';
import { newCareer, type Career } from '../../src/career/career.ts';
import type { FleetEntry } from '../../src/career/contract.ts';
import { drawCaptains, planMatch } from '../../src/career/fleet.ts';
import { CARD, FIGHTS, GRUDGE, LEARNING, WEAPON_CLASSES, knowledgeOf, learn, newLearned, type Expect, type PlayerHabits } from '../../src/career/habits.ts';
import { recordLine, rivalCard, rivalsOf, yourHabits } from '../../src/career/record.ts';
import { applyMatch } from '../../src/career/results.ts';
import { REGIONS } from '../../src/sim/world/index.ts';
import { scriptedReport } from './synthetic.ts';

const habits = (h: Partial<PlayerHabits>): PlayerHabits => ({ drop: null, runAt: null, storm: null, range: null, weapon: null, ...h });
const sure = (e: Expect, value: number): boolean => e.confidence >= LEARNING.known && e.value === value;
const knowing = (c: Career, knows: (f: FleetEntry) => boolean): number => planMatch(c).fleet.filter(knows).length;

test('learning moves 40% of the way each match together and fades 15% each match apart', () => {
  assert.deepEqual([LEARNING.learn, LEARNING.fade, LEARNING.known], [40, 15, 500]);
  const h = newLearned(), seen = habits({ drop: 3, range: 120 }), path: number[] = [];
  for (let k = 0; k < 5; k++) {
    learn(h, seen);
    path.push(h.drop[3]);
  }
  assert.deepEqual(path, [400, 640, 784, 870, 922]);
  assert.equal(h.rangeU, 120);
  const apart = structuredClone(h), faded: number[] = [];
  for (let k = 0; k < 5; k++) {
    learn(apart, null);
    faded.push(apart.drop[3]);
  }
  assert.deepEqual(faded, [784, 667, 567, 482, 410]);
  const changed = habits({ drop: 5, range: 40 });
  learn(h, changed);
  learn(h, changed);
  assert.deepEqual([h.drop[3], h.drop[5], h.rangeU], [333, 640, 69]);
});

test('a habit is known within five matches together and forgotten within five after the player changes it', () => {
  let c = applyMatch(newCareer(7), scriptedReport(planMatch(newCareer(7)), 10)).career;
  const habit = habits({ drop: 2, runAt: 70, storm: -10, range: 200, weapon: 4 });
  for (let k = 0; k < 5; k++) c = applyMatch(c, scriptedReport(planMatch(c), 10, {}, habit)).career;
  assert.ok(knowing(c, (f) => sure(f.knows.drop, 2) && sure(f.knows.weapon, 4)) >= 5);
  assert.ok(knowing(c, (f) => sure(f.knows.runAt, 70) && sure(f.knows.storm, -10) && sure(f.knows.range, 200)) >= 5);
  const changed = habits({ drop: 6, runAt: 0, storm: 30, range: 50, weapon: 0 });
  for (let k = 0; k < 5; k++) c = applyMatch(c, scriptedReport(planMatch(c), 10, {}, changed)).career;
  for (const r of c.captains) {
    const h = r.habits;
    assert.ok(h.drop[2] < LEARNING.known && h.weapon[4] < LEARNING.known && h.run[2] < LEARNING.known && h.storm[0] < LEARNING.known && h.range[2] < LEARNING.known);
  }
  assert.ok(knowing(c, (f) => sure(f.knows.drop, 6) && sure(f.knows.runAt, 0) && sure(f.knows.weapon, 0)) >= 5);
  assert.ok(c.profile.drop[6] >= LEARNING.known && c.profile.drop[2] < LEARNING.known, 'your own profile follows you too');
  assert.deepEqual(yourHabits(c).slice(0, 1).length, 1);
  assert.ok(yourHabits(c).every((l) => l.startsWith('You ')));
});

test('only the captains you met learn; the rest forget a little', () => {
  const c0 = newCareer(5), plan = planMatch(c0), met = drawCaptains(c0);
  c0.captains.forEach((r) => (r.habits.drop[9] = 800));
  const c1 = applyMatch(c0, scriptedReport(plan, 4, {}, habits({ drop: 1 }))).career;
  c1.captains.forEach((r, i) => {
    if (met.includes(i)) assert.deepEqual([r.habits.drop[1], r.habits.drop[9]], [400, 480]);
    else assert.deepEqual([r.habits.drop[1], r.habits.drop[9]], [0, 680]);
  });
  const blind = applyMatch(c0, scriptedReport(plan, 4, {}, null)).career;
  assert.ok(blind.captains.every((r) => r.habits.drop[9] === 680), 'an unmeasured match teaches nothing');
});

test('a captain you sank holds a grudge and hunts you; a match where you leave it be eases the grudge one step', () => {
  let c = applyMatch(newCareer(3), scriptedReport(planMatch(newCareer(3)), 10)).career;
  let plan = planMatch(c);
  const victim = plan.fleet[2].captain, killer = plan.fleet[4].captain, vi = CAPTAINS.findIndex((x) => x.id === victim);
  const metBefore = c.captains[vi].met;
  // Ship 3 is plan.fleet[2]; ship 5 is plan.fleet[4].
  let out = applyMatch(c, scriptedReport(plan, 6, { 3: 0, 0: 5 }));
  c = out.career;
  assert.deepEqual(out.changes.rivals.filter((n) => n.what !== 'firstMeeting'), [{ captain: victim, what: 'sunkByYou' }, { captain: killer, what: 'sankYou' }]);
  assert.deepEqual([c.captains[vi].met, c.captains[vi].sank, c.captains[vi].sunk, c.captains[vi].grudge], [metBefore + 1, 0, 1, 1]);
  const ki = CAPTAINS.findIndex((x) => x.id === killer);
  assert.equal(c.captains[ki].sank, 1);
  assert.equal(rivalCard(c, vi).lines[0], CARD.grudge[0]);
  assert.equal(rivalCard(c, ki).lines.at(-1), recordLine(c.captains[ki].met, 1, 0));
  plan = planMatch(c);
  const again = plan.fleet.find((f) => f.captain === victim);
  assert.ok(again, 'the captain you sank turns up again');
  assert.equal(again.grudge, 1);
  // Sink it twice more and its grudge is at its deepest; the news says it hunts you hard.
  for (let k = 0; k < 2; k++) {
    plan = planMatch(c);
    const ship = plan.fleet.findIndex((f) => f.captain === victim) + 1;
    assert.ok(ship > 0);
    out = applyMatch(c, scriptedReport(plan, 1, { [ship]: 0 }));
    c = out.career;
    assert.ok(out.changes.rivals.some((n) => n.captain === victim && n.what === 'grudge'));
  }
  assert.equal(c.captains[vi].grudge, GRUDGE.max);
  assert.equal(rivalCard(c, vi).lines[0], CARD.grudge[2]);
  assert.equal(rivalsOf(c)[0].captain.id, victim, 'your fiercest rival heads the rivals page');
  plan = planMatch(c);
  assert.ok(plan.fleet.some((f) => f.captain === victim));
  c = applyMatch(c, scriptedReport(plan, 1)).career;
  assert.equal(c.captains[vi].grudge, GRUDGE.max - 1);
});

test('the rivals record: met, ahead, behind, sank and sunk, for every captain', () => {
  let c = newCareer(17);
  const ahead = new Array<number>(CAPTAINS.length).fill(0), behind = ahead.slice(), met = ahead.slice();
  for (let m = 0; m < 12; m++) {
    const plan = planMatch(c), place = 1 + ((m * 7) % 20), report = scriptedReport(plan, place);
    plan.fleet.forEach((f, k) => {
      const i = CAPTAINS.findIndex((x) => x.id === f.captain);
      met[i]++;
      if (report.ships[k + 1].place > place) ahead[i]++;
      else behind[i]++;
    });
    c = applyMatch(c, report).career;
  }
  c.captains.forEach((r, i) => assert.deepEqual([r.met, r.ahead, r.behind], [met[i], ahead[i], behind[i]], CAPTAINS[i].id));
  const cards = rivalsOf(c);
  assert.equal(cards.length, CAPTAINS.length);
  for (const card of cards) {
    assert.ok(card.lines.length >= 1 && card.rank.length > 0 && card.temperament.name.length > 0);
    assert.equal(card.lines.at(-1), recordLine(card.met, card.sankYou, card.sunkByYou));
  }
  assert.ok(cards.some((k) => k.met === 0 ? k.lines.at(-1) === CARD.stranger : true));
});

test('a card says each habit learned in one plain line, the surest first', () => {
  const c = newCareer(1), card = (set: (h: Career['captains'][number]['habits']) => void): string[] => {
    const d = structuredClone(c);
    set(d.captains[0].habits);
    return rivalCard(d, 0).lines;
  };
  REGIONS.forEach((_, r) => assert.equal(card((h) => (h.drop[r] = 1000))[0], CARD.drop(r)));
  CARD.run.forEach((line, b) => assert.equal(card((h) => (h.run[b] = 1000))[0], line));
  CARD.storm.forEach((line, b) => assert.equal(card((h) => (h.storm[b] = 1000))[0], line));
  CARD.range.forEach((line, b) => assert.equal(card((h) => (h.range[b] = 1000))[0], line));
  WEAPON_CLASSES.forEach((_, k) => assert.equal(card((h) => (h.weapon[k] = 1000))[0], CARD.weapon(k)));
  assert.deepEqual(card(() => {}), [CARD.stranger]);
  assert.deepEqual(card((h) => {
    h.storm[1] = 700;
    h.range[2] = 900;
    h.run[FIGHTS] = LEARNING.known - 1;
  }).slice(0, 2), [CARD.range[2], CARD.storm[1]]);
  const k = knowledgeOf(newLearned());
  assert.ok([k.drop, k.runAt, k.storm, k.range, k.weapon].every((e) => e.value === -1 && e.confidence === 0));
});
