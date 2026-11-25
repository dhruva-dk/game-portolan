import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apply,
  newCareer,
  runPolicy,
  type Applied,
} from '../src/career/apply.ts';
import type { Command } from '../src/career/commands.ts';
import { OFFSEASON_RACE, pick } from '../src/career/draw.ts';
import { matchSetup } from '../src/career/fit.ts';
import {
  SLOTS,
  edition,
  editionKind,
  editionRace,
  headlineText,
  importance,
  inImportance,
  ordinal,
  slotsIn,
  usableVariants,
  valuesOf,
  type Edition,
  type Headline,
} from '../src/career/paper.ts';
import { standings } from '../src/career/rules/standing.ts';
import { standInResult } from '../src/career/standin.ts';
import {
  NEWS_KINDS,
  type CareerState,
  type NewsEvent,
  type NewsKind,
  type RaceReport,
} from '../src/career/state.ts';
import { LEAGUE, PAPER } from '../src/career/tuning.ts';
import { SPECIAL_WORDING, WORDINGS } from '../src/career/wordings.ts';

const YOURS = 0;
const SEASON = LEAGUE.racesPerSeason;

const careerOf = (seed: string): CareerState =>
  newCareer({
    seed,
    name: 'Gull Racing',
    livery: { dye: 3, pattern: 1 },
    emblem: 2,
  });

const BASE = careerOf('gullible');

function accepted(applied: Applied): CareerState {
  if (!applied.ok) throw new Error(`refused for ${applied.reason}`);
  assert.deepEqual(applied.refused, []);
  return applied.state;
}

const send = (state: CareerState, command: Command): CareerState =>
  accepted(apply(state, command));

function raced(state: CareerState): CareerState {
  const started = send(state, { type: 'StartRace', team: YOURS });
  const result = standInResult(matchSetup(started, { hands: 'player' }));
  return send(started, { type: 'RecordRace', team: YOURS, result });
}

const AFTER_ONE = raced(BASE);
const REPORT: RaceReport | null = AFTER_ONE.lastRace;

const withNews = (
  news: NewsEvent[],
  state: CareerState = AFTER_ONE
): CareerState => ({ ...state, news });

const linked = (state: CareerState): CareerState => ({
  ...state,
  seen: [...state.seen, 'opponents'],
});

function rival(index: number) {
  const team = BASE.teams[index];
  const owner = team.owner;
  if (owner === null) throw new Error('a rival has an owner');
  const driverId = team.seats.driver;
  const driver = BASE.people.find((p) => p.id === driverId);
  if (driver === undefined) throw new Error('a rival starts with a driver');
  return { name: team.name, owner, driver };
}

const R = rival(4);
const S = rival(17);
const FREE = AFTER_ONE.people.find((p) => p.contract === null);
if (FREE === undefined) throw new Error('a free agent');

const SAMPLE: Record<NewsKind, NewsEvent> = {
  yourFinish: { kind: 'yourFinish', team: YOURS, place: 12 },
  yourSeason: { kind: 'yourSeason', team: YOURS, place: 23 },
  raceWon: {
    kind: 'raceWon',
    team: 4,
    person: R.owner.name,
    personId: R.owner.id,
    planet: 'Port Drizzle',
  },
  hired: {
    kind: 'hired',
    team: 4,
    person: R.driver.name,
    personId: R.driver.id,
  },
  poached: {
    kind: 'poached',
    team: 4,
    team2: 17,
    person: R.driver.name,
    personId: R.driver.id,
  },
  retired: {
    kind: 'retired',
    team: 17,
    person: 'Q. Oldgull',
    personId: 99999,
    age: 41,
  },
  rookie: { kind: 'rookie', person: FREE.name, personId: FREE.id, age: 19 },
  repossessed: { kind: 'repossessed', team: 17 },
  streak: { kind: 'streak', team: 4, n: 3 },
  title: { kind: 'title', team: 17 },
  sponsorSigned: { kind: 'sponsorSigned', team: 4, sponsor: 'Dinghy Co' },
  unlocked: { kind: 'unlocked', team: 4, gun: 'harpoon' },
  lineLead: { kind: 'lineLead', team: 17, line: 'rudder' },
};

const fill = (template: string, values: Record<string, string>): string =>
  template.replace(/\{(\w+)\}/g, (_, name: string) => values[name]);

const TEXTS: Record<string, string> = {
  team: R.name,
  team2: S.name,
  place: '12th',
  planet: 'Port Drizzle',
  sponsor: 'Dinghy Co',
  gun: 'harpoon',
  line: 'rudder',
  n: '3',
};

function expectedText(kind: NewsKind, variant: number): string {
  const event = SAMPLE[kind];
  const texts: Record<string, string> = {
    ...TEXTS,
    team: kind === 'yourFinish' || kind === 'yourSeason' ? 'Gull Racing' : '',
    person: event.person ?? '',
    age: String(event.age),
    place: event.place === undefined ? '' : ordinal(event.place),
  };
  if (texts.team === '') texts.team = event.team === 17 ? S.name : R.name;
  return fill(WORDINGS[kind][variant], texts);
}

const only = (state: CareerState): Headline => {
  const paper = edition(state);
  assert.equal(paper.items.length, 1);
  return paper.items[0];
};

test('ordinal: 1st, 2nd, 3rd, 4th, the teens, and on', () => {
  const cases: [number, string][] = [
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [40, '40th'],
    [80, '80th'],
    [101, '101st'],
    [111, '111th'],
  ];
  for (const [n, text] of cases) assert.equal(ordinal(n), text);
});

test('every wording uses only the placeholders of §1.13.1, and every kind has its wordings', () => {
  assert.deepEqual(Object.keys(WORDINGS).sort(), [...NEWS_KINDS].sort());
  const counts = NEWS_KINDS.map((kind) => WORDINGS[kind].length);
  assert.deepEqual(counts, [3, 2, 2, 2, 2, 2, 1, 2, 1, 1, 1, 1, 1]);
  for (const kind of NEWS_KINDS)
    for (const template of WORDINGS[kind]) {
      const named = [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
      assert.deepEqual(slotsIn(template), named, template);
    }
  assert.deepEqual(slotsIn(SPECIAL_WORDING), ['team']);
});

test('each kind becomes its item: kind, a usable variant and the values of the event', () => {
  for (const kind of NEWS_KINDS) {
    const state = withNews([SAMPLE[kind]]);
    const item = only(state);
    assert.equal(item.kind, kind);
    assert.ok(usableVariants(kind, item.values).includes(item.variant));
    assert.equal(headlineText('race', item), expectedText(kind, item.variant));
    const event = SAMPLE[kind];
    for (const slot of SLOTS)
      assert.equal(
        item.values[slot] !== undefined,
        event[slot] !== undefined,
        `${kind}.${slot}`
      );
  }
});

test('raceWon with no person named takes only the wording without {person}', () => {
  const unnamed: NewsEvent = {
    kind: 'raceWon',
    team: YOURS,
    planet: 'Port Drizzle',
  };
  assert.deepEqual(usableVariants('raceWon', valuesOf(BASE, unnamed, false)), [
    0,
  ]);
  assert.deepEqual(
    usableVariants('raceWon', valuesOf(BASE, SAMPLE.raceWon, false)),
    [0, 1]
  );
  for (let race = 1; race <= SEASON; race++) {
    const state = withNews([unnamed], {
      ...AFTER_ONE,
      lastRace: REPORT && { ...REPORT, race },
    });
    assert.equal(only(state).variant, 0);
  }
});

test('the variant is the keyed draw among the usable ones: wording, season, race, item index', () => {
  const news = [SAMPLE.yourFinish, SAMPLE.hired, SAMPLE.poached];
  const state = withNews(news);
  assert.ok(REPORT);
  const paper = edition(state);
  paper.items.forEach((item, index) => {
    const usable = usableVariants(item.kind, item.values);
    assert.equal(
      item.variant,
      pick(usable, state.seed, 'wording', REPORT.season, REPORT.race, index)
    );
  });
  assert.deepEqual(editionRace(state), {
    season: REPORT.season,
    race: REPORT.race,
  });
  assert.deepEqual(editionRace({ ...state, phase: 'offseason' }), {
    season: state.season,
    race: OFFSEASON_RACE,
  });
});

test('the same state gives the same paper; another race gives other wordings', () => {
  const news = NEWS_KINDS.filter(
    (k) => k !== 'title' && k !== 'yourSeason'
  ).map((k) => SAMPLE[k]);
  const state = withNews(news);
  assert.deepEqual(edition(state), edition(structuredClone(state)));
  const variants = (s: CareerState) => edition(s).items.map((i) => i.variant);
  const seen = new Set<string>();
  for (let race = 1; race <= SEASON; race++)
    seen.add(
      JSON.stringify(
        variants({ ...state, lastRace: REPORT && { ...REPORT, race } })
      )
    );
  assert.ok(seen.size > 1, 'the wordings change from race to race');
});

test('links: only once the Opponents button is there; owners and people under contract open their team', () => {
  const plainPaper = edition(withNews([SAMPLE.poached, SAMPLE.raceWon]));
  for (const item of plainPaper.items)
    for (const value of Object.values(item.values)) {
      assert.equal(value.team, null);
      assert.equal(value.person, null);
    }
  const values = (event: NewsEvent) => valuesOf(linked(AFTER_ONE), event, true);
  const poached = values(SAMPLE.poached);
  assert.deepEqual(poached.team, { text: R.name, team: 4, person: null });
  assert.deepEqual(poached.team2, { text: S.name, team: 17, person: null });
  const now =
    AFTER_ONE.people.find((p) => p.id === R.driver.id)?.contract?.team ?? null;
  assert.deepEqual(poached.person, {
    text: R.driver.name,
    team: now,
    person: now === null ? null : R.driver.id,
  });
  assert.deepEqual(values(SAMPLE.raceWon).person, {
    text: R.owner.name,
    team: 4,
    person: R.owner.id,
  });
  assert.deepEqual(values(SAMPLE.retired).person, {
    text: 'Q. Oldgull',
    team: null,
    person: null,
  });
  assert.deepEqual(values(SAMPLE.rookie).person, {
    text: FREE.name,
    team: null,
    person: null,
  });
  assert.deepEqual(values(SAMPLE.yourFinish).place, {
    text: '12th',
    team: null,
    person: null,
  });
  const linkedPaper = edition(linked(withNews([SAMPLE.poached])));
  assert.equal(linkedPaper.items[0].values.team?.team, 4);
});

test('your own repossession makes the special: one headline, plain, in the special wording', () => {
  const news = [
    SAMPLE.yourFinish,
    SAMPLE.raceWon,
    { kind: 'repossessed', team: YOURS } satisfies NewsEvent,
    SAMPLE.repossessed,
  ];
  for (const phase of ['lobby', 'offseason'] as const) {
    const state = linked(withNews(news, { ...AFTER_ONE, phase }));
    const paper = edition(state);
    assert.equal(paper.kind, 'special');
    assert.equal(paper.items.length, 1);
    assert.deepEqual(paper.items[0].values, {
      team: { text: 'Gull Racing', team: null, person: null },
    });
    assert.equal(
      headlineText(paper.kind, paper.items[0]),
      'Creditors take everything from Gull Racing except Uncle.'
    );
  }
  assert.equal(editionKind(withNews([SAMPLE.repossessed])), 'race');
});

test('the order of importance, yours first within a kind, then better standing', () => {
  const order: NewsEvent[] = [
    { kind: 'repossessed', team: YOURS },
    SAMPLE.yourSeason,
    SAMPLE.title,
    SAMPLE.yourFinish,
    { kind: 'poached', team: 4, team2: YOURS, person: 'A. B', personId: 1 },
    SAMPLE.raceWon,
    SAMPLE.streak,
    SAMPLE.repossessed,
    SAMPLE.poached,
    SAMPLE.retired,
    SAMPLE.hired,
    SAMPLE.unlocked,
    SAMPLE.lineLead,
    SAMPLE.sponsorSigned,
    SAMPLE.rookie,
  ];
  order.forEach((event, rank) => assert.equal(importance(event), rank));
  const table = standings(AFTER_ONE);
  const [better, worse] = [4, 17].sort((a, b) => table[a] - table[b]);
  const hired = (team: number): NewsEvent => ({
    kind: 'hired',
    team,
    person: `P. ${team}`,
    personId: team,
  });
  const state = withNews([
    SAMPLE.rookie,
    hired(worse),
    SAMPLE.lineLead,
    hired(better),
    hired(YOURS),
    SAMPLE.yourFinish,
  ]);
  assert.deepEqual(inImportance(state), [
    SAMPLE.yourFinish,
    hired(YOURS),
    hired(better),
    hired(worse),
    SAMPLE.lineLead,
    SAMPLE.rookie,
  ]);
  assert.deepEqual(
    edition(state).items.map((i) => i.values.team?.text ?? i.kind),
    [
      'Gull Racing',
      'Gull Racing',
      BASE.teams[better].name,
      BASE.teams[worse].name,
      BASE.teams[17].name,
    ]
  );
});

test('at most five items, the most important kept; fewer events give fewer items', () => {
  const many = NEWS_KINDS.map((k) => SAMPLE[k]);
  const paper = edition(withNews(many));
  assert.equal(PAPER.headlines, 5);
  assert.equal(paper.items.length, 5);
  assert.deepEqual(
    paper.items.map((i) => i.kind),
    ['yourSeason', 'title', 'yourFinish', 'raceWon', 'streak']
  );
  assert.equal(edition(withNews(many.slice(0, 3))).items.length, 3);
  assert.equal(edition(withNews([])).items.length, 0);
});

test('a race edition has yourFinish; the season edition has yourSeason and title and no yourFinish or raceWon', () => {
  const race = edition(withNews(NEWS_KINDS.map((k) => SAMPLE[k]).reverse()));
  assert.equal(race.kind, 'race');
  assert.ok(race.items.some((i) => i.kind === 'yourFinish'));
  const season = edition(
    withNews(
      NEWS_KINDS.map((k) => SAMPLE[k]),
      { ...AFTER_ONE, phase: 'offseason' }
    )
  );
  assert.equal(season.kind, 'season');
  assert.deepEqual(
    season.items.map((i) => i.kind),
    ['yourSeason', 'title', 'streak', 'repossessed', 'poached']
  );
});

function renderAll(paper: Edition, problems: string[]): void {
  for (const item of paper.items) {
    const text = headlineText(paper.kind, item);
    if (/[{}]|undefined|NaN/.test(text)) problems.push(text);
  }
}

test('over three seasons from three seeds every wording of every event renders with no slot left and no undefined', () => {
  const told = new Set<NewsKind>();
  const problems: string[] = [];
  let papers = 0;
  for (const seed of ['test', 'tide', 'squall']) {
    let state = linked(careerOf(seed));
    for (let race = 0; race < 3 * SEASON; race++) {
      if (state.phase === 'offseason')
        state = send(runPolicy(state, YOURS).state, {
          type: 'FinishOffseason',
          team: YOURS,
        });
      state = raced(runPolicy(state, YOURS).state);
      const paper = edition(state);
      papers += 1;
      assert.ok(paper.items.length <= PAPER.headlines);
      if (paper.kind === 'race')
        assert.equal(paper.items[0].kind, 'yourFinish');
      if (paper.kind === 'season')
        assert.deepEqual(
          paper.items.slice(0, 2).map((i) => i.kind),
          ['yourSeason', 'title']
        );
      renderAll(paper, problems);
      for (const event of state.news) {
        told.add(event.kind);
        for (const links of [true, false]) {
          const values = valuesOf(state, event, links);
          const usable = usableVariants(event.kind, values);
          assert.ok(usable.length > 0, event.kind);
          for (const variant of usable)
            renderAll(
              { kind: 'race', items: [{ kind: event.kind, variant, values }] },
              problems
            );
        }
      }
      state = send(state, { type: 'MarkRead', team: YOURS });
    }
  }
  assert.equal(papers, 90);
  for (const kind of NEWS_KINDS.filter((k) => !told.has(k)))
    for (const variant of WORDINGS[kind].keys())
      renderAll(
        {
          kind: 'race',
          items: [
            { kind, variant, values: valuesOf(AFTER_ONE, SAMPLE[kind], true) },
          ],
        },
        problems
      );
  renderAll(
    edition(withNews([{ kind: 'repossessed', team: YOURS }])),
    problems
  );
  assert.deepEqual(problems, []);
});
