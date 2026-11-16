import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, start } from '../src/career/career.ts';
import { coinText, foundErrors, foundView, homeView, letters, ordinal, recoverView, settingsView, topBar } from '../src/career/views.ts';
import { table } from '../src/career/read.ts';
import { FOUND, founded, must, sailed, toRaceDay } from './career-kit.ts';
import type { Figure, Offer } from '../src/office.ts';
import type { CareerState } from '../src/career/state.ts';
import { sackedOffers } from '../src/career/elders.ts';
import { careerView, jobsView } from '../src/career/views-career.ts';
import { crewView, planDraft } from '../src/career/views-crew.ts';
import { seen } from '../src/career/views-gull.ts';
import { marketView } from '../src/career/views-market.ts';
import { offerView } from '../src/career/views-offer.ts';
import { profileView } from '../src/career/views-profile.ts';

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

// ---- the people screens (Phase C batch 2)

/** Every figure of a view set against something and explained. */
function explained(v: unknown): void {
  for (const f of figures(v)) {
    assert.ok(f.against, `${f.text} has nothing it is set against`);
    assert.ok(f.explain && f.explain.lines.length > 0, `${f.text} has no explanation`);
  }
}
/** Advances (sailing each race day) until a test holds (at most n days). */
function until(s: CareerState, done: (s: CareerState) => boolean, n = 40): CareerState {
  for (let i = 0; i < n && !done(s); i++) s = topBar(s).go.raceDay ? sailed(s) : must(s, { kind: 'Advance' });
  return s;
}
/** A free agent the player could sign today, and the offer at their ask (naming whom they replace, if need be). */
function signable(s: CareerState): { gull: number; offer: Offer } {
  for (const g of s.gulls) {
    if (g.contract || g.retired !== null || g.player || g.role === 'manager' || g.role === 'elder') continue;
    const v = offerView(s, g.id, null);
    for (const r of v.replaces) {
      const offer = { ...v.draft, replaces: r.id };
      if (offerView(s, g.id, offer).send.ok) return { gull: g.id, offer };
    }
  }
  throw new Error('no one to sign');
}

test('crew: the roster by role with the player heading the captains, the flight at four jobs, the order movable', () => {
  const s = founded(), v = crewView(s), c = s.crews[s.player!.crew];
  assert.equal(v.roster[0].kind, 'head');
  assert.equal(v.roster[1].you, true);
  assert.deepEqual(v.roster.filter((r) => r.kind === 'head').map((r) => r.title), ['Captains', 'Bosuns', 'Shipwright', 'Scouts', 'Flight', 'Elder']);
  assert.equal(v.flight.length, c.staff.flight.length);
  assert.equal(v.order.length, 4);
  assert.equal(v.order[0].up, null);
  assert.equal(v.order[3].down, null);
  explained(v);
  const plan = v.order[1].up;
  assert.ok(plan, v.orderWhy ?? '');
  const moved = must(s, { kind: 'SetPlan', plan });
  assert.deepEqual(crewView(moved).order.map((o) => o.job), [v.order[1].job, v.order[0].job, v.order[2].job, v.order[3].job]);
  assert.equal(planDraft(moved, moved.crews[c.id]), moved.crews[c.id].plan);
});

test('profile: a rival unknown in ranges, scouted then known; one of her own may be dismissed, she may not', () => {
  const s = founded(), c = s.crews[s.player!.crew];
  const stranger = s.gulls.find((g) => g.contract && g.contract.crew !== c.id && s.crews[g.contract.crew].league === c.league && g.role === 'captain' && !seen(s, c.id, g.id).known)!;
  const p = profileView(s, stranger.id);
  assert.equal(p.known, false);
  assert.equal(p.wants, null);
  assert.equal(p.stats.length, 0);
  assert.ok(p.stars.lo < p.stars.hi);
  explained(p);
  assert.ok(p.scout.ok, p.scout.why);
  const sent = must(s, { kind: 'StartScout', scout: p.scout.scout!, gull: stranger.id });
  assert.equal(profileView(sent, stranger.id).scout.ok, false);
  const q = profileView(until(sent, (x) => seen(x, c.id, stranger.id).known), stranger.id);
  assert.equal(q.known, true);
  assert.equal(q.wants?.length, 3);
  assert.ok(q.stats.length > 0);
  const own = profileView(s, c.staff.ships[1].captain);
  assert.equal(own.mine, true);
  assert.equal(own.dismiss.ok, true);
  assert.ok(own.dismiss.owed.value > 0);
  assert.equal(own.offer.ok, false);
  const me = profileView(s, s.player!.gull);
  assert.equal(me.you, true);
  assert.equal(me.dismiss.ok, false);
  assert.equal(me.renew.ok, false);
});

test('offer: drawn at the ask, sent and locked while waiting, then answered', () => {
  const s = must(founded(), { kind: 'DebugCoin', coin: 50000 }), { gull, offer } = signable(s);
  const v = offerView(s, gull, offer);
  assert.equal(v.state, 'open');
  assert.ok(v.cost.now.value >= offer.fee);
  explained(v);
  const sent = must(s, { kind: 'OfferContract', gull, offer });
  const w = offerView(sent, gull, null);
  assert.equal(w.state, 'waiting');
  assert.equal(w.send.ok, false);
  assert.equal(w.withdraw.ok, true);
  const a = offerView(until(sent, (x) => offerView(x, gull, null).state !== 'waiting'), gull, null);
  assert.ok(['signed', 'countered', 'open', 'silent'].includes(a.state), a.state);
  assert.ok(a.last, 'the answer is on file');
  if (a.state === 'countered') assert.equal(a.accept.ok, true);
});

test('market: the filter lets through only its role, its league and its contracts; the shortlist kept', () => {
  const s = founded(), v = marketView(s, { role: 'flight', league: 3, contract: 'free', known: false, stars: 0 }, [s.player!.gull]);
  assert.ok(v.rows.length > 0);
  for (const r of v.rows) assert.equal(s.gulls[r.id].role, 'flight');
  for (const r of v.rows) assert.equal(s.gulls[r.id].contract, null);
  assert.equal(v.shortlist.length, 1);
  assert.equal(v.count, String(v.rows.length));
  const all = marketView(s, null, []);
  assert.ok(all.rows.every((r) => s.gulls[r.id].contract?.crew !== s.player!.crew));
  explained(all);
});

test('career and jobs: reputation ranked among managers; sacked, the old elder writes and the offers wait', () => {
  const s = founded(), v = careerView(s);
  assert.equal(v.rank.against?.kind, 'rank');
  explained(v);
  const j = jobsView(sackedOffers({ ...s, player: { ...s.player!, sacked: true } }));
  assert.equal(j.sacked, true);
  assert.match(j.letter.title, /dismissed/);
  assert.ok(j.offers.length > 0);
  assert.ok(j.offers.every((o) => o.expires === 'Until taken'));
  explained(j);
});
