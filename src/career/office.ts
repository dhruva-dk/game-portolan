// The office's views of a career (office/office.ts Views): the shell round
// every screen, Home, the team's making, race day's plan, a race's result and
// the standings, each built from the career's state as plain data. How a
// livery looks on the page is the page's to say (Look): the career names a
// dye by its number.

import { TEAM, type RaceResult } from '../race.ts';
import { SHIPS, type Building, type MailCategory } from '../office/command.ts';
import type { HomeView, NewsKind, StandingLine } from '../office/home.ts';
import type {
  FoundView,
  Move,
  PlanView,
  ResultView,
  Sailor,
  StandingsTable,
  StandingsView,
} from '../office/loop.ts';
import type { Team as Named, Verdict } from '../office/office.ts';
import type { PartLine } from '../office/papers.ts';
import type { ShellView } from '../office/shell.ts';
import { askWage } from './asks.ts';
import { TYPES } from './components.ts';
import { buildDays } from './hq.ts';
import { grid, lineups, maySail } from './lineup.ts';
import { prizeAt } from './money.ts';
import type { Person } from './roles.ts';
import { tally } from './round.ts';
import { finalOrder, movesOf } from './season.ts';
import { standingOf } from './standings.ts';
import { stars } from './stars.ts';
import {
  championshipOf,
  teamOf,
  type CareerState,
  type Objective,
  type Part,
  type Team,
} from './state.ts';
import { TUNING } from './tuning.ts';
import { TIERS, foundView, letters, myTeam } from './views.ts';
import { BUILDINGS } from './world.ts';

/** How the page shows a livery: each dye's colour and its mark, and the patterns' names. */
export interface Look {
  dyes: readonly (readonly [string, string])[];
  patterns: readonly string[];
}

/** A championship's name, the first the highest. */
export const championship = (tier: number) =>
  TIERS[tier] ?? `Championship ${tier + 1}`;

/** A letter's words with each championship named as the office names it. */
export const titled = (text: string) =>
  text.replace(/\bTier ([1-9])\b/g, (_, n: string) =>
    championship(Number(n) - 1)
  );

/** The year the first season is sailed in, and the months a season runs through with their days. */
const YEAR_ONE = 1716;
const MONTHS: readonly (readonly [string, number])[] = [
  ['March', 31],
  ['April', 30],
  ['May', 31],
  ['June', 30],
  ['July', 31],
  ['August', 31],
  ['September', 30],
];

/** The year a career's season is sailed in. */
export const seasonYear = (s: Pick<CareerState, 'season'>): number =>
  YEAR_ONE + s.season;

/** A day of the season as a date: the season's first day is the first of March. */
export function dateAt(s: CareerState, day: number): string {
  let left = Math.max(0, day - (s.calendar?.start ?? day));
  for (const [month, days] of MONTHS) {
    if (left < days) return `${left + 1} ${month} ${seasonYear(s)}`;
    left -= days;
  }
  return `${left + 1} October ${seasonYear(s)}`;
}

/** No colours: a team whose dye the page has none for. */
const UNDYED = ['', ''] as const;

/** A team as the office names it. */
export const named = (c: Team, look: Look): Named => ({
  id: c.id,
  name: c.name,
  emblem: c.emblem,
  colours: look.dyes[c.colours.dye % look.dyes.length] ?? UNDYED,
});

/** A person's name as a table has it (an initial and the family name), and in full. */
export const short = (g: Person) => `${g.given.charAt(0)}. ${g.family}`;
const full = (g: Person) => `${g.given} ${g.family}`;

/** A name's words, each with its capital. */
const capitalled = (name: string) =>
  name.replace(
    /(^|[\s-])(\p{L})/gu,
    (_, gap: string, letter: string) => gap + letter.toUpperCase()
  );

/** The next round to be sailed (null: the season's races are done). */
const nextRound = (s: CareerState) => s.calendar?.rounds[s.round] ?? null;

/** The round's number as the office counts it (from 1), no more than the season has. */
const roundOf = (s: CareerState) =>
  Math.min(s.round + 1, TUNING.calendar.rounds);

/** The shell round every screen. */
export function shellView(s: CareerState, look: Look): ShellView {
  const c = myTeam(s),
    next = nextRound(s);
  const building = Object.values(c.buildings).some((w) => w.next !== null);
  const scouting = s.scouting.filter((x) => x.team === c.id).length;
  const unread = s.mail.filter((m) => !m.read).length;
  return {
    team: named(c, look),
    balance: c.balance,
    championship: championship(c.tier),
    next: next
      ? { name: next.planet.name, days: Math.max(0, next.day - s.day) }
      : { name: 'Season’s End', days: 0 },
    notices: unread,
    date: dateAt(s, s.day),
    marks: {
      ...(c.design && { ship: { busy: true } }),
      ...(building && { hq: { busy: true } }),
      ...(scouting > 0 && { scouting: { count: scouting } }),
      ...(unread > 0 && { mail: { count: unread } }),
    },
    on: 'Continue',
  };
}

/** A move as the screens name it, by the season's (−1 up, +1 down). */
const MOVE = new Map<number | undefined, Move>([
  [-1, 'up'],
  [1, 'down'],
]);

/** A championship's teams as they stand: each one's prize there, and where the season's end would move it. */
export function teamLines(
  s: CareerState,
  tier: number,
  look: Look
): StandingsTable['teams'] {
  const l = championshipOf(s, tier),
    me = s.player?.team,
    moves = movesOf(finalOrder(s));
  const lines = [...l.standings]
    .sort((a, b) => standingOf(s, a.team) - standingOf(s, b.team))
    .map((x, i) => {
      const c = teamOf(s, x.team);
      return {
        person: null,
        place: i + 1,
        name: c.name,
        team: named(c, look),
        points: x.points,
        own: x.team === me,
        ruled: false,
        wins: x.wins,
        podiums: x.podiums,
        sinkings: x.sinkings,
        prize: prizeAt(s, tier, i + 1),
        move: MOVE.get(moves.get(x.team)) ?? null,
      };
    });
  // a rule under the last that goes up, and under the last that stays over those that go down
  return lines.map((x, i) => {
    const next = lines[i + 1]?.move;
    return {
      ...x,
      ruled:
        (x.move === 'up' && next !== 'up') ||
        (x.move !== 'down' && next === 'down'),
    };
  });
}

/** A championship's drivers as they stand: everyone who sails for a team of it or has scored in it, by person. */
export function driverLines(
  s: CareerState,
  tier: number,
  look: Look
): (StandingLine & { person: number; wins: number; podiums: number })[] {
  const l = championshipOf(s, tier),
    me = s.player?.team;
  const rows = new Map<
    number,
    { team: number; points: number; wins: number; podiums: number }
  >();
  for (const id of l.teams) {
    const c = teamOf(s, id);
    const sailors = [
      c.player ? (s.player?.person ?? null) : null,
      ...c.staff.ships.map((h) => h.driver),
    ];
    for (const g of sailors)
      if (g !== null) rows.set(g, { team: id, points: 0, wins: 0, podiums: 0 });
  }
  for (const d of l.drivers) rows.set(d.person, d);
  return [...rows]
    .sort(
      ([a, x], [b, y]) =>
        y.points - x.points ||
        standingOf(s, x.team) - standingOf(s, y.team) ||
        a - b
    )
    .map(([person, x], i) => ({
      person,
      place: i + 1,
      name: short(s.people[person]),
      team: named(teamOf(s, x.team), look),
      points: x.points,
      own: x.team === me,
      ruled: false,
      wins: x.wins,
      podiums: x.podiums,
    }));
}

/** How secure a manager's job is, by the chairman's confidence. */
export function security(confidence: number): Verdict {
  const [high, mid] = TUNING.chairman.words;
  return confidence >= high
    ? { label: 'Very Secure', mood: 'good' }
    : confidence >= mid
      ? { label: 'Secure', mood: 'good' }
      : confidence >= TUNING.chairman.verdict
        ? { label: 'Under Pressure', mood: 'warn' }
        : { label: 'At Risk', mood: 'bad' };
}

/** How a team stands to its chairman's target. */
export const standing = (place: number, target: number): Verdict =>
  place <= target
    ? { label: 'On Target', mood: 'good' }
    : { label: 'Below Target', mood: 'bad' };

const mean = (xs: readonly number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** A team's five measures, each as it is (not yet a share). */
function measures(s: CareerState, c: Team): number[] {
  const of = (ids: readonly (number | null)[]) =>
    mean(ids.flatMap((id) => (id === null ? [] : [stars(s.people[id])])));
  return [
    mean(c.parts.filter((p) => p.ship !== null).map((p) => p.perf)),
    of(c.staff.ships.map((h) => h.driver)),
    Object.values(c.buildings).reduce((a, w) => a + w.level, 0),
    of([
      ...c.staff.ships.map((h) => h.mechanic),
      c.staff.designer,
      ...c.staff.scouts,
      ...c.staff.pit,
    ]),
    c.sponsors.reduce((a, p) => a + (p ? p.perRace + p.bonus : 0), 0),
  ];
}
const MEASURES = ['Ship', 'Drivers', 'Headquarters', 'Staff', 'Sponsors'];

/** A team's stats against its championship: each a share of the most any team of the career has. */
export function teamStats(s: CareerState, c: Team): HomeView['stats'] {
  const all = s.teams.map((x) => measures(s, x)),
    tier = championshipOf(s, c.tier).teams.map((id) => all[id] ?? []);
  return MEASURES.map((name, k) => {
    const most = Math.max(1e-9, ...all.map((m) => m[k] ?? 0));
    const share = (m: readonly number[]) => (m[k] ?? 0) / most;
    return {
      name,
      value: share(all[c.id] ?? []),
      best: Math.max(...tier.map(share)),
      average: mean(tier.map(share)),
    };
  });
}

/** What a letter's category pictures, and how the news heads it. */
export const NEWS: Readonly<Record<MailCategory, readonly [NewsKind, string]>> =
  {
    team: ['driver', 'Team'],
    market: ['driver', 'Market'],
    ship: ['part', 'Ship'],
    hq: ['building', 'Headquarters'],
    tier: ['vote', 'Championship'],
    finance: ['sponsor', 'Finances'],
    chairman: ['vote', 'Chairman'],
  };

export const BUILT: Readonly<Record<Building, string>> = {
  factory: 'Factory',
  drawingLoft: 'Drawing Loft',
  testTank: 'Test Tank',
  foundry: 'Foundry',
  sailingSchool: 'Sailing School',
  pitHouse: 'Pit House',
  crowsNest: 'Crow’s Nest',
  fishMarket: 'Fish Market',
  landingPad: 'Landing Pad',
};
export const PARTS: Readonly<Record<string, string>> = {
  sails: 'Sails',
  rigging: 'Rigging',
  rudder: 'Rudder',
  hull: 'Hull',
  keel: 'Keel',
  mounts: 'Mounts',
};

/** A part as the office lists it. */
export const partLine = (x: Part): PartLine => ({
  id: x.id,
  type: x.type,
  name: PARTS[x.type] ?? x.type,
  perf: x.perf,
  perfMax: x.perfMax,
  reliability: x.reliability,
  condition: x.condition,
  ship: x.ship,
  spec: x.spec,
});

/** A job's share done and days left, from the days it began and ends on. */
export const span = (s: CareerState, began: number, ends: number) => ({
  done: Math.min(1, Math.max(0, (s.day - began) / Math.max(1, ends - began))),
  days: Math.max(0, ends - s.day),
});

/** The work under way at her team, a kind at a time. */
function work(s: CareerState, c: Team, look: Look): HomeView['work'] {
  const scouting = s.scouting
    .filter((x) => x.team === c.id)
    .map((x) => {
      const g = s.people[x.person],
        at = g.contract ? teamOf(s, g.contract.team) : null;
      return {
        id: `scout:${x.scout}`,
        name: short(g),
        team: at ? named(at, look) : null,
        ...span(s, x.started, x.done),
        details: g.role === 'driver' ? 'Driver Details' : 'Staff Details',
        cancels: true,
      };
    });
  const design = c.design
    ? [
        {
          id: 'design',
          name: PARTS[c.design.type] ?? c.design.type,
          team: null,
          ...span(s, c.design.started, c.design.built),
          details: 'Part Details',
          cancels: false,
        },
      ]
    : [];
  const building = BUILDINGS.flatMap((b) => {
    const next = c.buildings[b].next;
    return next
      ? [
          {
            id: `build:${b}`,
            name: BUILT[b],
            team: null,
            ...span(s, next.done - buildDays(b, next.level), next.done),
            details: 'Building Details',
            cancels: false,
          },
        ]
      : [];
  });
  return [
    { kind: 'Scouting', jobs: scouting },
    { kind: 'Part Design', jobs: design },
    { kind: 'Headquarters', jobs: building },
  ].filter((w) => w.jobs.length > 0);
}

/** Home. */
export function homeView(s: CareerState, look: Look): HomeView {
  const c = myTeam(s),
    drivers = driverLines(s, c.tier, look),
    next = nextRound(s);
  const mine = [
    s.player?.person ?? null,
    ...c.staff.ships.slice(1).map((h) => h.driver),
  ];
  const letter = letters(s, 1)[0];
  const news = letter ? NEWS[letter.category] : null;
  return {
    team: named(c, look),
    championship: championship(c.tier),
    drivers: mine.flatMap((id) => {
      const line = drivers.find((d) => d.person === id);
      return line
        ? [{ person: line.person, name: line.name, place: line.place }]
        : [];
    }),
    chairman: {
      happiness: c.confidence / 100,
      security: security(c.confidence),
      target: c.target,
      standing: standing(standingOf(s, c.id), c.target),
    },
    stats: teamStats(s, c),
    news:
      letter && news
        ? {
            kind: news[0],
            headline: news[1],
            subject: titled(letter.subject),
            status: letter.from,
            button: 'Mail',
            screen: 'mail',
          }
        : null,
    work: work(s, c, look),
    next: {
      round: roundOf(s),
      rounds: TUNING.calendar.rounds,
      name: next?.planet.name ?? '',
    },
    standings: { teams: teamLines(s, c.tier, look), drivers },
  };
}

/** The standings, whole. */
export function standingsView(s: CareerState, look: Look): StandingsView {
  const c = myTeam(s);
  return {
    round: s.round,
    rounds: TUNING.calendar.rounds,
    mine: c.tier,
    chairman: {
      target: c.target,
      standing: standing(standingOf(s, c.id), c.target),
    },
    championships: s.championships.map((l) => ({
      championship: championship(l.id),
      pool: TUNING.money.prize[l.id] ?? 0,
      teams: teamLines(s, l.id, look),
      drivers: driverLines(s, l.id, look),
    })),
  };
}

/** The team's making, before a career is founded on `seed`. */
export function foundingView(
  seed: number,
  look: Look,
  refused: string | null
): FoundView {
  const v = foundView(seed, { dye: 0, pattern: 0 });
  return {
    team: capitalled(v.team),
    given: capitalled(v.given),
    family: capitalled(v.family),
    dyes: look.dyes.slice(0, TUNING.world.liveries.dyes),
    patterns: look.patterns.slice(0, TUNING.world.liveries.patterns),
    emblems: TUNING.world.emblems,
    championship: championship(TUNING.world.championships - 1),
    replacing: v.replacing,
    refused,
  };
}

/** A sponsor's objectives as the plan names them. */
const OBJECTIVES: Readonly<Record<Objective, string>> = {
  top10: 'Finish in the top ten',
  sinkTwo: 'Sink two ships',
  afloat: 'Three ships afloat',
  mostSea: 'Hold the most sea',
};

/** How many free drivers the plan offers to stand in, the best first. */
const STAND_INS = 6;

/** Race day's plan: who sails each ship as the lineup has it (the plan's drivers where they may sail, else each ship's
 *  own, the reserve, a stand-in), who else may, each ship's parts and what may be fitted instead, her sponsors'
 *  objectives as chosen (the first, if none is), and the call. */
export function planView(
  s: CareerState,
  look: Look,
  waiting: boolean
): PlanView {
  const c = myTeam(s),
    next = nextRound(s),
    aboard = lineups(s)[c.id]?.ships ?? [];
  const sailor = (person: number): Sailor => {
    const g = s.people[person],
      standIn = g.contract === null;
    return {
      person,
      name: full(g),
      stars: stars(g),
      standIn,
      fee: standIn ? Math.round(askWage(g, c.tier) * TUNING.race.standIn) : 0,
    };
  };
  const own = [...c.staff.ships.map((h) => h.driver), c.staff.reserve].filter(
    (d): d is number => d !== null && maySail(s, c.id, d)
  );
  const free = s.people
    .filter(
      (g) =>
        g.role === 'driver' &&
        g.contract === null &&
        g.retired === null &&
        !g.player &&
        maySail(s, c.id, g.id)
    )
    .sort((a, b) => stars(b) - stars(a) || a.id - b.id)
    .slice(0, STAND_INS);
  const drivers = aboard.slice(1).map((a) => a.driver);
  for (const d of drivers)
    if (d !== null && !own.includes(d) && !free.some((g) => g.id === d))
      free.push(s.people[d]);
  const parts = c.parts.filter((x) => !x.forNext).map(partLine);
  const planned = c.plan?.objectives ?? [];
  const sponsors = c.sponsors.flatMap((p, slot) =>
    p && p.objectives.length > 0
      ? [
          {
            slot,
            name: p.name,
            bonus: p.bonus,
            objectives: p.objectives.map((o) => OBJECTIVES[o]),
            chosen:
              typeof planned[slot] === 'number' &&
              (planned[slot] ?? 0) < p.objectives.length
                ? planned[slot]
                : 0,
          },
        ]
      : []
  );
  return {
    team: named(c, look),
    round: roundOf(s),
    rounds: TUNING.calendar.rounds,
    name: next?.planet.name ?? '',
    championship: championship(c.tier),
    ships: SHIPS.map((ship) => {
      const d = aboard[ship]?.driver ?? null;
      return {
        ship,
        you: ship === 0,
        driver: ship === 0 || d === null ? null : sailor(d),
        parts: TYPES.map((type) => ({
          type,
          label: PARTS[type] ?? type,
          fitted: parts.find((x) => x.ship === ship && x.type === type) ?? null,
          others: parts.filter((x) => x.ship !== ship && x.type === type),
        })),
      };
    }),
    sailors: [...own.map(sailor), ...free.map((g) => sailor(g.id))],
    sponsors,
    drivers,
    objectives: c.sponsors.map(
      (_, slot) => sponsors.find((x) => x.slot === slot)?.chosen ?? null
    ),
    set:
      s.race === null
        ? { ok: false, why: 'No race today.' }
        : s.race.started
          ? { ok: false, why: 'The race is under way.' }
          : { ok: true, why: '' },
    call: c.plan?.call ?? 'free',
    blocked:
      s.race === null
        ? 'No race today'
        : aboard.some((a) => a.forfeit)
          ? 'A ship has no driver'
          : null,
    waiting,
  };
}

/** Who sails each ship of her championship's race today, as its result will name them: by the card's ship id. */
export interface Entry {
  person: number | null;
  driver: string;
  team: number;
}
export function entries(s: CareerState): Entry[] {
  const c = myTeam(s),
    all = lineups(s),
    me = s.player?.person ?? null;
  return grid(s, c.tier).flatMap((team) =>
    (all[team]?.ships ?? []).map((a) => {
      const person = a.driver ?? (team === c.id ? me : null);
      return {
        team,
        person,
        driver: person !== null ? short(s.people[person]) : '',
      };
    })
  );
}

/** A race's result, as sailed by `sheet` under the rules of `before` (the career as the race began), on the career as it stands now. */
export function resultView(
  s: CareerState,
  look: Look,
  race: {
    result: RaceResult;
    sheet: readonly Entry[];
    name: string;
    rules: { pointsPerSinking: number; seaHeldPoint: boolean };
  }
): ResultView {
  const c = myTeam(s),
    { result, sheet } = race;
  const teams = tally(result, Math.ceil(sheet.length / TEAM), race.rules);
  const sunk = new Map(result.sinkings.map((k) => [k.id, k.second]));
  const stops = new Map<number, number>();
  for (const p of result.pits) stops.set(p.id, (stops.get(p.id) ?? 0) + 1);
  return {
    title: `${YEAR_ONE + s.season} ${race.name} - ${championship(c.tier)}`,
    lines: result.order.map((id, i) => {
      const e = sheet[id],
        line = teams[Math.floor(id / TEAM)]?.ships[id % TEAM];
      return {
        place: i + 1,
        person: e?.person ?? null,
        driver: e?.driver ?? '',
        team: named(teamOf(s, e?.team ?? c.id), look),
        own: e?.team === c.id,
        afloat: !sunk.has(id),
        sinkings: line?.sinkings ?? 0,
        second: sunk.get(id) ?? null,
        stops: stops.get(id) ?? 0,
        points: line?.points ?? 0,
      };
    }),
    points: teams[0]?.points ?? 0,
    target: c.target,
    standing: standing(standingOf(s, c.id), c.target),
    place: standingOf(s, c.id),
  };
}
