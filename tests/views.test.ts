import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apply, start } from '../src/career/career.ts';
import {
  foundErrors,
  foundView,
  homeView,
  letters,
  recoverView,
  settingsView,
  topBar,
} from '../src/career/views.ts';
import { moneyText, ordinal } from '../src/career/names.ts';
import { table } from '../src/career/read.ts';
import { FOUND, founded, must, sailed, toRaceDay } from './career-kit.ts';
import type { Figure } from '../src/office/career.ts';
import type { Offer } from '../src/office/command.ts';
import type { CareerState } from '../src/career/state.ts';
import { sackedOffers } from '../src/career/chairmen.ts';
import { careerView, jobsView } from '../src/career/views-career.ts';
import { teamView } from '../src/career/views-team.ts';
import { raceCards } from '../src/career/card.ts';
import { staffOf } from '../src/career/state.ts';
import { TEAM } from '../src/race.ts';
import { seen } from '../src/career/views-person.ts';
import { scoutingView } from '../src/career/views-scouting.ts';
import { offerView } from '../src/career/views-offer.ts';
import { profileView } from '../src/career/views-profile.ts';
import { rivalView } from '../src/career/views-rival.ts';
import { calendarPaper } from '../src/career/papers.ts';
import { standingsView } from '../src/career/office.ts';
import { traitLine } from '../src/career/views-traits.ts';
import { TRAITS } from '../src/career/traits.ts';
import { nameOf } from '../src/career/views.ts';

/** Every figure of a view carries what it is set against and what it is made of. */
function figures(v: unknown, out: Figure[] = []): Figure[] {
  if (v && typeof v === 'object') {
    if ('value' in v && 'text' in v && 'against' in v && 'explain' in v)
      out.push(v as Figure);
    else for (const x of Object.values(v)) figures(x, out);
  }
  return out;
}

test('ordinal and balance text', () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 40].map(ordinal), [
    '1st',
    '2nd',
    '3rd',
    '4th',
    '11th',
    '12th',
    '13th',
    '21st',
    '22nd',
    '40th',
  ]);
  assert.equal(moneyText(12500), '12,500');
  assert.equal(moneyText(-300), '−300');
  assert.equal(moneyText(300, true), '+300');
});

test('the top bar: the player, their team, day one of season one, Continue free', () => {
  const s = founded(),
    t = topBar(s),
    c = s.teams[s.player!.team];
  assert.equal(t.name, `${FOUND.given} ${FOUND.family}`);
  assert.equal(t.team, FOUND.team);
  assert.equal(t.face.role, 'manager');
  assert.deepEqual(t.face.colours, FOUND.colours);
  assert.match(t.date, /^Day \d+, Season 1$/);
  assert.equal(t.balance.value, c.balance);
  assert.equal(t.balance.against?.kind, 'change');
  assert.ok(t.balance.explain && t.balance.explain.lines.length >= 1);
  assert.equal(t.go.label, 'Continue');
  assert.equal(t.go.blocker, null);
});

test('the top bar on race day reads Race plan and opens the plan', () => {
  const t = topBar(toRaceDay(founded()));
  assert.equal(t.go.label, 'Race plan');
  assert.equal(t.go.raceDay, true);
  assert.equal(t.go.blocker?.screen, 'plan');
});

test("home: the next race, her four ships, the improvement, five lines of the table round the player's, four letters", () => {
  const s = founded(),
    h = homeView(s),
    c = s.teams[s.player!.team];
  assert.ok(h.race);
  assert.match(h.race.round, /^Round 1 of \d+$/);
  assert.equal(h.race.heading, 'Next Race');
  assert.ok(h.race.days.value >= 0);
  assert.equal(h.race.target.value, c.target);
  assert.equal(h.ships[0].you, true);
  assert.equal(h.ships[0].driver, null, 'the player sails ship one');
  assert.equal(h.ships.length, TEAM);
  for (const x of h.ships.slice(1))
    assert.ok(x.driver && !x.you, 'each other ship has her driver');
  assert.equal(h.ships[0].parts.length, 6);
  assert.ok(h.ships.every((x) => x.parts.every((p) => p.fitted)));
  assert.equal(h.table.lines.length, 5);
  assert.equal(h.table.lines.filter((l) => l.mine).length, 1);
  const rows = table(s, c.tier);
  for (const l of h.table.lines) assert.equal(rows[l.place - 1].team, l.team);
  assert.ok(h.mail.letters.length <= 4);
  for (const f of figures(h)) {
    assert.ok(f.against, `${f.text} has nothing it is set against`);
    assert.ok(
      f.explain && f.explain.lines.length > 0,
      `${f.text} has no explanation`
    );
  }
});

test('home on race day: the heading reads Race Day', () => {
  assert.equal(homeView(toRaceDay(founded())).race?.heading, 'Race Day');
});

test('a part under half its condition is marked low', () => {
  const s = founded(),
    id = s.player!.team,
    c = s.teams[id];
  const worn = {
    ...s,
    teams: s.teams.map((k) =>
      k.id !== id
        ? k
        : {
            ...k,
            parts: c.parts.map((p) =>
              p.ship === 0 && p.type === 'sails' ? { ...p, condition: 0.3 } : p
            ),
          }
    ),
  };
  const marks = homeView(worn).ships[0].parts;
  assert.equal(marks.find((p) => p.type === 'sails')?.low, true);
  assert.equal(marks.filter((p) => p.low).length, 1);
});

test("letters: newest first, the Admiralty's from its secretary, a dilemma sealed", () => {
  const s = toRaceDay(founded()),
    ls = letters(s, 50);
  for (let i = 1; i < ls.length; i++) assert.ok(ls[i - 1].day >= ls[i].day);
  for (const l of ls) {
    const m = s.mail.find((x) => x.id === l.id)!;
    assert.equal(l.unread, !m.read);
    assert.equal(l.sealed, m.dilemma !== null && m.dilemma.answer === null);
    if (m.sender === null) assert.equal(l.from, "The Admiralty's secretary");
  }
});

test('found: defaults the career takes, the same for a seed, the team it replaces named', () => {
  const v = foundView(FOUND.seed, FOUND.colours);
  assert.deepEqual(foundView(FOUND.seed, FOUND.colours), v);
  assert.ok(v.team.length >= 1 && v.team.length <= v.limits.team);
  assert.deepEqual([v.dyes, v.patterns], [16, 3]);
  assert.equal(v.emblems, 12);
  assert.ok(v.replacing.team.length > 0 && v.replacing.chairman.length > 0);
  assert.ok(v.replacing.staff > 0);
  const r = apply(start(), {
    kind: 'Found',
    seed: v.seed,
    team: v.team,
    colours: v.colours,
    emblem: v.emblem,
    given: v.given,
    family: v.family,
    headshot: v.headshot,
  });
  assert.ok(r.ok, r.ok ? '' : r.reason.sentence);
  assert.notEqual(foundView(FOUND.seed + 1, FOUND.colours).team, '');
});

test('found errors: each under its own field, none for a founding the career takes', () => {
  assert.deepEqual(foundErrors(FOUND), {});
  const e = foundErrors({
    ...FOUND,
    team: '',
    colours: { dye: 3, pattern: 7 },
    family: 'x'.repeat(40),
  });
  assert.match(e.team ?? '', /needs a name/);
  assert.match(e.colours ?? '', /dye and a pattern/);
  assert.match(e.person ?? '', /too long/);
  assert.equal(e.emblem, undefined);
  assert.match(
    foundErrors({ ...FOUND, team: 'A'.repeat(30) }).team ?? '',
    /at most 24/
  );
});

test('recover and settings say what happened', () => {
  const failed = recoverView({
    from: 'new',
    lost: '',
    failed: 'The save could not be read.',
  });
  assert.deepEqual(
    failed.ways.map((w) => w.way),
    ['retry']
  );
  const replayed = recoverView({
    from: 'journal',
    lost: 'Two actions since Day 4 were lost.',
    failed: null,
  });
  assert.match(replayed.found, /journal/);
  assert.ok(replayed.ways.some((w) => w.way === 'carry'));
  assert.equal(settingsView(null).backup, 'Never backed up.');
  assert.match(settingsView({ day: 12, season: 0 }).backup, /Day 12, Season 1/);
});

// ---- the people screens

/** Every figure of a view set against something and explained. */
function explained(v: unknown): void {
  for (const f of figures(v)) {
    assert.ok(f.against, `${f.text} has nothing it is set against`);
    assert.ok(
      f.explain && f.explain.lines.length > 0,
      `${f.text} has no explanation`
    );
  }
}
/** Advances (sailing each race day) until a test holds (at most n days). */
function until(
  s: CareerState,
  done: (s: CareerState) => boolean,
  n = 40
): CareerState {
  for (let i = 0; i < n && !done(s); i++)
    s = topBar(s).go.raceDay ? sailed(s) : must(s, { kind: 'Advance' });
  return s;
}
/** A free agent the player could sign today, and the offer at their ask (naming whom they replace, if need be). */
function signable(s: CareerState): { person: number; offer: Offer } {
  for (const g of s.people) {
    if (
      g.contract ||
      g.retired !== null ||
      g.player ||
      g.role === 'manager' ||
      g.role === 'chairman'
    )
      continue;
    const v = offerView(s, g.id, null);
    for (const r of v.replaces) {
      const offer = { ...v.draft, replaces: r.id };
      if (offerView(s, g.id, offer).send.ok) return { person: g.id, offer };
    }
  }
  throw new Error('no one to sign');
}

test("team: the roster by role with the player heading the drivers, the pit crew, and each ship's stop as her card carries it", () => {
  const s = founded(),
    v = teamView(s),
    c = s.teams[s.player!.team];
  assert.equal(v.roster[0].kind, 'head');
  assert.equal(v.roster[1].you, true);
  assert.deepEqual(
    v.roster.filter((r) => r.kind === 'head').map((r) => r.title),
    ['Drivers', 'Mechanics', 'Designer', 'Scouts', 'Pit crew', 'Chairman']
  );
  const people = v.roster.filter((r) => r.kind === 'person');
  assert.equal(people.length, staffOf(c).length, 'everyone on the staff once');
  assert.equal(v.pit.length, c.staff.pit.length);
  assert.equal(v.bonds.length, TEAM);
  assert.equal(v.stops.length, TEAM);
  const day = toRaceDay(s);
  const card = raceCards(day)[c.tier];
  assert.deepEqual(
    teamView(day).stops.map((x) => [x.pace.value, x.slip.value]),
    card.ships.slice(0, TEAM).map((x) => [x.pit.pace, x.pit.slip]),
    'the stop shown is the stop sailed'
  );
  explained(v);
});

test('profile: a rival unknown in ranges, scouted then known; one of her own may be dismissed, she may not', () => {
  const s = founded(),
    c = s.teams[s.player!.team];
  const stranger = s.people.find(
    (g) =>
      g.contract &&
      g.contract.team !== c.id &&
      s.teams[g.contract.team].tier === c.tier &&
      g.role === 'driver' &&
      !seen(s, c.id, g.id).known
  )!;
  const p = profileView(s, stranger.id);
  assert.equal(p.known, false);
  assert.equal(p.wants, null);
  assert.equal(p.stats.length, 0);
  assert.ok(p.stars.lo < p.stars.hi);
  explained(p);
  assert.ok(p.scout.ok, p.scout.why);
  const sent = must(s, {
    kind: 'StartScout',
    scout: p.scout.scout!,
    person: stranger.id,
  });
  assert.equal(profileView(sent, stranger.id).scout.ok, false);
  const q = profileView(
    until(sent, (x) => seen(x, c.id, stranger.id).known),
    stranger.id
  );
  assert.equal(q.known, true);
  assert.equal(q.wants?.length, 3);
  assert.ok(q.stats.length > 0);
  assert.equal(p.bond, null);
  const own = profileView(s, c.staff.ships[1].driver);
  const beside = c.staff.ships[1].mechanic;
  if (beside !== null) {
    assert.deepEqual(own.bond?.with, {
      person: beside,
      name: nameOf(s.people[beside]),
    });
    assert.equal(profileView(s, beside).bond?.with.name, own.name);
    assert.equal(
      profileView(s, beside).bond?.with.person,
      c.staff.ships[1].driver
    );
  }
  assert.equal(own.post, 'Ship 2');
  assert.equal(own.mine, true);
  assert.equal(own.dismiss.ok, true);
  assert.ok(own.dismiss.owed.value > 0);
  assert.equal(own.offer.ok, false);
  const me = profileView(s, s.player!.person);
  assert.equal(me.you, true);
  assert.equal(me.dismiss.ok, false);
  assert.equal(me.renew.ok, false);
});

test('rival: every team page names its own people, stands where the standings have it, and links what it names', () => {
  const s = sailed(toRaceDay(founded())),
    me = s.player!.team;
  const look = { dyes: [['#000000', '#ffffff'] as const], patterns: ['Plain'] };
  const lines = standingsView(s, look).championships;
  for (const c of s.teams) {
    const v = rivalView(s, look, c.id);
    assert.equal(v.team.id, c.id);
    assert.equal(v.own, c.id === me);
    const line = lines[c.tier]?.teams.find((t) => t.team.id === c.id);
    assert.equal(v.season.place, line?.place);
    assert.equal(v.season.points, line?.points);
    assert.equal(v.championship, lines[c.tier]?.championship);
    // everyone named is on its books (her own page: she sails ship 1)
    const books = new Set([
      ...staffOf(c),
      ...(c.player ? [s.player!.person] : []),
    ]);
    for (const h of [...v.drivers, ...v.staff])
      assert.ok(books.has(h.person), `${c.name}: ${h.name}`);
    assert.equal(v.chairman.person, c.staff.chairman);
    if (v.manager) {
      assert.equal(v.manager.you, c.player);
      assert.equal(v.manager.personality === null, c.player);
      assert.ok(c.player || v.manager.first.length === 3, c.name);
    }
    if (c.player) assert.equal(v.season.hers, null);
    else if (c.tier === s.teams[me].tier) assert.notEqual(v.season.hers, null);
  }
  // her own page, when none is named
  assert.equal(rivalView(s, look, null).own, true);
});

test('calendar: opened at the next round unless one is asked for; each round its storm and days off; the votes and the season’s days in order', () => {
  const s = sailed(toRaceDay(founded())),
    v = calendarPaper(s, null);
  assert.equal(v.races.length, s.calendar!.rounds.length);
  assert.equal(v.races[v.chosen]?.when, 'ahead', 'the next round chosen');
  assert.equal(v.races[0]?.when, 'sailed');
  assert.equal(calendarPaper(s, 6).chosen, 6);
  assert.equal(calendarPaper(s, 99).chosen, v.races.length - 1);
  v.races.forEach((r, i) => {
    const round = s.calendar!.rounds[i]!;
    assert.equal(r.storm, round.planet.pace);
    assert.equal(r.days, round.day - s.day);
  });
  assert.deepEqual(
    v.races.filter((r) => r.vote).map((r) => r.round - 1),
    [3, 7]
  );
  assert.equal(v.dates.at(-1)?.what, 'Next season’s first race');
  assert.ok(v.dates.some((d) => d.what === 'The season ends'));
});

test('traits: each says what it does in words, when it holds, and whether it helps or hinders its team', () => {
  for (const t of TRAITS) {
    const l = traitLine(t.id);
    assert.ok(l.effect.length > 0, t.id);
    assert.equal(l.lasts, t.lasts ?? 'Always', t.id);
  }
  const line = (name: string) =>
    traitLine(TRAITS.find((t) => t.name === name)!.id);
  assert.deepEqual(line('Storm Specialist'), {
    name: 'Storm Specialist',
    effect: '+2 Stormcraft',
    lasts: 'When the storm runs slow',
    sense: 1,
  });
  assert.equal(line('Fair-weather Sailor').sense, -1);
  assert.equal(line('Old Salt').lasts, 'From age 32');
  assert.equal(line('Sunny').lasts, 'Always');
});

test('offer: drawn at the ask, sent and locked while waiting, then answered', () => {
  const s = must(founded(), { kind: 'DebugBalance', balance: 50000 }),
    { person, offer } = signable(s);
  const v = offerView(s, person, offer);
  assert.equal(v.state, 'open');
  assert.ok(v.cost.now.value >= offer.fee);
  explained(v);
  const sent = must(s, { kind: 'OfferContract', person, offer });
  const w = offerView(sent, person, null);
  assert.equal(w.state, 'waiting');
  assert.equal(w.send.ok, false);
  assert.equal(w.withdraw.ok, true);
  const a = offerView(
    until(sent, (x) => offerView(x, person, null).state !== 'waiting'),
    person,
    null
  );
  assert.ok(
    ['signed', 'countered', 'open', 'silent'].includes(a.state),
    a.state
  );
  assert.ok(a.last, 'the answer is on file');
  if (a.state === 'countered') assert.equal(a.accept.ok, true);
});

test('market: the filter lets through only its role, its tier and its contracts; the shortlist kept', () => {
  const s = founded(),
    v = scoutingView(
      s,
      { role: 'pit', tier: 3, contract: 'free', known: false, stars: 0 },
      [s.player!.person]
    );
  assert.ok(v.rows.length > 0);
  for (const r of v.rows) assert.equal(s.people[r.id].role, 'pit');
  for (const r of v.rows) assert.equal(s.people[r.id].contract, null);
  assert.equal(v.shortlist.length, 1);
  assert.equal(v.count, String(v.rows.length));
  const all = scoutingView(s, null, []);
  assert.ok(
    all.rows.every((r) => s.people[r.id].contract?.team !== s.player!.team)
  );
  explained(all);
});

test('career and jobs: reputation ranked among managers; sacked, the old chairman writes and the offers wait', () => {
  const s = founded(),
    v = careerView(s);
  assert.equal(v.rank.against?.kind, 'rank');
  explained(v);
  const j = jobsView(
    sackedOffers({ ...s, player: { ...s.player!, sacked: true } })
  );
  assert.equal(j.sacked, true);
  assert.match(j.letter.title, /dismissed/);
  assert.ok(j.offers.length > 0);
  assert.ok(j.offers.every((o) => o.expires === 'Until taken'));
  explained(j);
});
