// The office's views (office.ts): what each management screen draws, built from the career's state. Pure:
// a view is plain data, every figure with what it is set against and what it is made of. The screens work out no rule.

import { PARTS, type Colours } from '../race.ts';
import { SHIPS, type Ship } from '../office/command.ts';
import type { CommandOf } from '../office/command.ts';
import type {
  Comparison,
  Explanation,
  Face,
  Figure,
  FoundErrors,
  FoundView,
  HomeView,
  LetterLine,
  Line,
  Named,
  RecoverView,
  SettingsView,
  ShipHalf,
  StandingLine,
  TopBar,
} from '../office/career.ts';
import { advanceCheck } from './advance.ts';
import { dice, seeded } from './dice.ts';
import { standingOf } from './standings.ts';
import { foundingCheck, taken } from './found.ts';
import {
  NOUNS,
  teamName,
  family,
  given,
  moneyText,
  ordinal,
  place,
  words,
} from './names.ts';
import { mailView, table, unread } from './read.ts';
import type { Person } from './roles.ts';
import { factoryPoints } from './hq.ts';
import { bondLevel } from './pit.ts';
import { age, potential, stars } from './stars.ts';
import {
  teamOf,
  personAt,
  type CareerState,
  type Team,
  type Objective,
} from './state.ts';
import { trait } from './traits.ts';
import { TUNING } from './tuning.ts';
import { BUILDINGS, makeWorld, staffStars } from './world.ts';
import { improvementPoints } from './improvement.ts';

/** A line of an explanation. */
export const line = (label: string, amount: string | number): Line => ({
  label,
  amount: String(amount),
});
/** A figure: value, text, what it is set against, what it is made of. */
export const fig = (
  value: number,
  text: string,
  against: Comparison | null,
  explain: Explanation | null
): Figure => ({ value, text, against, explain });
/** A figure set beside another's. */
export const rival = (label: string, text: string): Comparison => ({
  kind: 'rival',
  label,
  text,
});

/** A person's name, as the office writes it. */
export const nameOf = (g: { given: string; family: string }) =>
  `${g.given} ${g.family}`;
/** What a person's headshot is drawn from. */
export function faceOf(s: CareerState, g: Person): Face {
  const team = g.contract ? s.teams[g.contract.team] : null;
  return {
    seed: g.seed,
    role: g.role,
    age: age(g, s.day),
    colours: team ? team.colours : null,
    emblem: team ? team.emblem : null,
  };
}
/** A person as a line names them, or null. */
const named = (s: CareerState, id: number | null): Named | null =>
  id === null
    ? null
    : { id, face: faceOf(s, s.people[id]), name: nameOf(s.people[id]) };

/** The player, once the career is founded (the screens open only then). */
function playerOf(s: CareerState): NonNullable<CareerState['player']> {
  if (!s.player) throw new Error('no career is founded');
  return s.player;
}
/** The player's team: the one they manage, or the one they left when sacked. */
export const myTeam = (s: CareerState): Team => teamOf(s, playerOf(s).team);

/** The balance and its change this season, from the ledger. */
function moneyFigure(s: CareerState, c: Team): Figure {
  const start = s.calendar?.start ?? 0,
    season = s.ledger.filter((l) => l.day >= start);
  const by = season.reduce((a, l) => a + l.amount, 0);
  const kinds = new Map<string, number>();
  for (const l of season)
    kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + l.amount);
  const lines = [
    line("At the season's start", moneyText(c.balance - by)),
    ...[...kinds].map(([k, n]) => line(LEDGER[k] ?? k, moneyText(n, true))),
  ];
  return fig(
    c.balance,
    moneyText(c.balance),
    { kind: 'change', by, text: `${moneyText(by, true)} this season` },
    { title: 'Balance', lines }
  );
}
/** The ledger's kinds as the slip names them. */
const LEDGER: Readonly<Record<string, string>> = {
  wages: 'Wages',
  pay: 'Pay',
  prize: 'Prize money',
  sponsor: 'Sponsors',
  upkeep: 'Upkeep',
  building: 'Building',
  design: 'Designs',
  fee: 'Fees',
  fish: 'Commercial Centre',
  lobby: 'Lobbying',
  fine: 'Fines',
  bonus: 'Bonuses',
  supplier: 'Suppliers',
  debug: 'Granted',
  break: 'Break clauses',
  dilemma: 'Dilemmas',
  dismissal: 'Dismissals',
  board: 'The chairman',
};

/** The top bar. */
export function topBar(s: CareerState): TopBar {
  const c = myTeam(s),
    me = personAt(s, playerOf(s).person);
  const blocked = advanceCheck(s);
  const raceDay = blocked?.code === 'raceDay';
  const screen =
    blocked === null
      ? null
      : raceDay
        ? 'plan'
        : blocked.code === 'sacked'
          ? 'jobs'
          : 'tier';
  return {
    name: nameOf(me),
    face: faceOf(s, me),
    team: c.name,
    emblem: c.emblem,
    colours: c.colours,
    date: `Day ${s.day - (s.calendar?.start ?? 0) + 1}, Season ${s.season + 1}`,
    balance: moneyFigure(s, c),
    unread: unread(s),
    dilemma: s.mail.some(
      (m) => m.dilemma !== null && m.dilemma.answer === null
    ),
    go: {
      label: raceDay ? 'Race plan' : 'Continue',
      raceDay,
      blocker:
        blocked && screen ? { screen, sentence: blocked.sentence } : null,
    },
  };
}

/** What a sponsor's objective asks, in words. */
const OBJECTIVE: Readonly<Record<Objective, string>> = {
  top10: 'a top-ten finish',
  sinkTwo: 'two ships sunk',
  afloat: 'three ships afloat',
  mostSea: 'the most sea held',
};

function racePanel(s: CareerState, c: Team): HomeView['race'] {
  const cal = s.calendar;
  if (!cal || s.round >= cal.rounds.length) return null;
  const r = cal.rounds[s.round],
    days = Math.max(0, r.day - s.day),
    tier = s.championships[c.tier];
  const standing = standingOf(s, c.id),
    E = TUNING.chairman;
  const sponsor = c.sponsors.find((p) => p && p.objectives.length > 0) ?? null;
  return {
    heading: s.race ? 'Race Day' : 'Next Race',
    round: `Round ${s.round + 1} of ${cal.rounds.length}`,
    planet: { seed: r.planet.seed, name: r.planet.name },
    days: fig(
      days,
      days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`,
      rival('race day', `Day ${r.day - cal.start + 1}`),
      {
        title: 'Days to go',
        lines: [
          line('Today', `Day ${s.day - cal.start + 1}`),
          line('Race day', `Day ${r.day - cal.start + 1}`),
        ],
      }
    ),
    target: fig(
      c.target,
      ordinal(c.target),
      { kind: 'rank', place: standing, of: tier.teams.length },
      {
        title: "The chairman's target",
        lines: [
          line('Target', ordinal(c.target)),
          line('Standing now', ordinal(standing)),
          line('Sacked if missed by', `${E.missedBy} places`),
        ],
      }
    ),
    confidence: fig(
      Math.round(c.confidence),
      String(Math.round(c.confidence)),
      rival('sacked under', String(E.verdict)),
      {
        title: "The chairman's confidence",
        lines: [
          line('Each race at or above the target', `+${E.met}`),
          line('Each place past the target', `−${E.perPlace}`),
          line('A missed target sacks under', String(E.verdict)),
        ],
      }
    ),
    sponsor: sponsor
      ? `${sponsor.name}: ${sponsor.objectives.map((o) => OBJECTIVE[o]).join(' or ')}`
      : null,
  };
}

/** A ship's bond, its mechanic's and driver's, as a figure: its level, the races to the next, the levels. */
export function bondFigure(bond: number): Figure {
  const level = bondLevel(bond),
    next = TUNING.bond.levels[level] ?? null;
  return fig(
    bond,
    `Bond ${level} of ${TUNING.bond.levels.length}`,
    next === null
      ? rival('the', 'strongest bond')
      : rival('next at', `${next} races`),
    {
      title: 'Bond',
      lines: [
        line('Races together', bond),
        ...TUNING.bond.levels.map((at, i) =>
          line(`Level ${i + 1} at`, `${at} races`)
        ),
      ],
    }
  );
}

function shipHalf(s: CareerState, c: Team, ship: Ship): ShipHalf {
  const hands = c.staff.ships[ship] ?? { driver: null, mechanic: null };
  const parts = PARTS.map((type) => {
    const p = c.parts.find(
      (x) => x.ship === ship && x.type === type && !x.forNext
    );
    return { type, low: !!p && p.condition < 0.5, fitted: !!p };
  });
  const cap = hands.driver === null ? null : personAt(s, hands.driver);
  const M = TUNING.morale;
  return {
    ship,
    you: ship === 0 && c.player,
    parts,
    mechanic: named(s, hands.mechanic),
    bond: bondFigure(c.bonds[ship] ?? 0),
    driver: cap && {
      id: cap.id,
      face: faceOf(s, cap),
      name: nameOf(cap),
      stars: stars(cap),
      potential: potential(cap),
      tags: cap.traits.map((t) => trait(t).name),
      morale: fig(
        Math.round(cap.morale),
        String(Math.round(cap.morale)),
        rival('asks to leave under', String(M.leave)),
        {
          title: 'Morale',
          lines: [
            line('Now', Math.round(cap.morale)),
            line('Asks to leave under', M.leave),
            line('A race on her target', `up to +${M.result}`),
          ],
        }
      ),
    },
  };
}

/** Five lines of the table round the player's: two above, theirs, two below, each with its gap to the line above. */
function tableWindow(s: CareerState, c: Team): StandingLine[] {
  const rows = table(s, c.tier),
    at = rows.findIndex((r) => r.team === c.id);
  const from = Math.max(0, Math.min(rows.length - 5, at - 2));
  return rows.slice(from, from + 5).map((r, i) => {
    const above = from + i > 0 ? rows[from + i - 1] : null,
      k = s.teams[r.team];
    return {
      place: r.place,
      team: r.team,
      name: r.name,
      emblem: k.emblem,
      colours: k.colours,
      points: r.points,
      gap: !above
        ? ''
        : above.points === r.points
          ? 'level'
          : `−${above.points - r.points}`,
      mine: r.mine,
    };
  });
}

/** The newest `n` letters. */
export function letters(s: CareerState, n: number): LetterLine[] {
  return mailView(s)
    .slice(0, n)
    .map((m) => {
      const mail = s.mail.find((x) => x.id === m.id),
        sender = mail?.sender ?? null;
      return {
        id: m.id,
        day: m.day - (s.calendar?.start ?? 0) + 1,
        subject: m.subject,
        category: m.category,
        unread: !m.read,
        sealed: m.open,
        from:
          sender === null
            ? "The Admiralty's secretary"
            : nameOf(s.people[sender]),
        face: sender === null ? null : faceOf(s, s.people[sender]),
      };
    });
}

/** `home`. */
export function homeView(s: CareerState): HomeView {
  const c = myTeam(s),
    points = improvementPoints(s, c.id),
    factory = factoryPoints(c);
  const tier = s.championships[c.tier].teams,
    rank =
      1 +
      tier.filter((k) => k !== c.id && improvementPoints(s, k) > points).length;
  const d = c.design;
  return {
    top: topBar(s),
    race: racePanel(s, c),
    ships: SHIPS.map((ship) => shipHalf(s, c, ship)),
    improvement: {
      design: d && {
        type: d.type,
        days: fig(
          Math.max(0, d.built - s.day),
          `${Math.max(0, d.built - s.day)} days`,
          rival('built on', `Day ${d.built - (s.calendar?.start ?? 0) + 1}`),
          {
            title: 'The design',
            lines: [
              line(
                'Drawn by',
                `Day ${d.designed - (s.calendar?.start ?? 0) + 1}`
              ),
              line('Built by', `Day ${d.built - (s.calendar?.start ?? 0) + 1}`),
            ],
          }
        ),
      },
      points: fig(
        points,
        points.toFixed(1),
        { kind: 'rank', place: rank, of: tier.length },
        {
          title: 'Improvement points a day',
          lines: [
            line('The factory', factory.toFixed(1)),
            line('The mechanics', (points - factory).toFixed(1)),
          ],
        }
      ),
      works: BUILDINGS.flatMap((building) => {
        const next = c.buildings[building].next;
        return next
          ? [
              {
                building,
                level: next.level,
                days: Math.max(0, next.done - s.day),
              },
            ]
          : [];
      }),
    },
    table: {
      tier: TIERS[c.tier] ?? `Championship ${c.tier + 1}`,
      lines: tableWindow(s, c),
    },
    mail: { letters: letters(s, 4), unread: unread(s) },
  };
}
/** The championships' names, the first the highest: as every screen and letter names them. */
export const TIERS = [
  'First Championship',
  'Second Championship',
  'Third Championship',
];

/** Founding's defaults for a seed: a team name whose words clash with no team's, a name for the player, a face. */
const founding = new Map<
  string,
  { replacing: FoundView['replacing']; names: string[] }
>();
function worldFor(seed: number, colours: Colours) {
  const key = `${seed}.${colours.dye}.${colours.pattern}`;
  let w = founding.get(key);
  if (!w) {
    const world = makeWorld(seed, colours, dice(seed, {}));
    const k = taken(world),
      chairman = world.people[k.staff.chairman];
    const staff = world.people.filter(
      (g) => g.contract?.team === k.id && g.retired === null
    );
    w = {
      replacing: {
        team: k.name,
        chairman: nameOf(chairman),
        staff: staffStars(staff),
      },
      names: world.teams.map((x) => x.name),
    };
    founding.set(key, w);
    for (const oldest of [...founding.keys()].slice(0, -4))
      founding.delete(oldest);
  }
  return w;
}

/** `found` for a world seed and the colours chosen so far: its defaults, rolled from the seed. */
export function foundView(seed: number, colours: Colours): FoundView {
  const w = worldFor(seed, colours),
    rand = seeded(seed, 0x0f0d);
  const taken = new Set(w.names.flatMap(words));
  let team = '';
  for (
    let k = 0;
    k < 40 &&
    (team === '' || words(team).some((x) => taken.has(x)) || team.length > 24);
    k++
  )
    team = teamName(place(rand), NOUNS[Math.floor(rand() * NOUNS.length)]);
  return {
    seed,
    team,
    given: given(rand),
    family: family(rand),
    headshot: Math.floor(rand() * 0xffffffff),
    age: TUNING.player.age,
    colours,
    emblem: Math.floor(rand() * TUNING.world.emblems),
    dyes: TUNING.world.liveries.dyes,
    patterns: TUNING.world.liveries.patterns,
    emblems: TUNING.world.emblems,
    limits: { team: 24, person: TUNING.player.personName },
    replacing: w.replacing,
  };
}

/** What the founding form gets wrong, field by field (each checked with the others set to ones the career takes), so
 *  each error shows under its own field; a field missing is right. The team's name is held to the form's 24. */
export function foundErrors(c: CommandOf<'Found'>): FoundErrors {
  const v = foundView(c.seed, { dye: 0, pattern: 0 });
  const good: CommandOf<'Found'> = {
    ...c,
    team: v.team,
    colours: { dye: 0, pattern: 0 },
    emblem: 0,
    given: v.given,
    family: v.family,
    headshot: v.headshot,
  };
  const say = (k: Partial<CommandOf<'Found'>>) =>
    foundingCheck({ ...good, ...k })?.sentence;
  const out: FoundErrors = {};
  const set = (k: keyof FoundErrors, sentence: string | undefined) => {
    if (sentence !== undefined) out[k] = sentence;
  };
  set(
    'team',
    c.team.trim().length > v.limits.team
      ? `The team's name is too long: at most ${v.limits.team} letters.`
      : say({ team: c.team })
  );
  set('colours', say({ colours: c.colours }));
  set('emblem', say({ emblem: c.emblem }));
  set(
    'person',
    say({ given: c.given }) ??
      say({ family: c.family }) ??
      say({ headshot: c.headshot })
  );
  return out;
}

/** `recover`: what the load kept and lost, from session.ts's Opened. */
export function recoverView(o: {
  from: string;
  lost: string;
  failed: string | null;
}): RecoverView {
  if (o.failed !== null)
    return {
      found: o.failed,
      lost: 'The career could not be read, and its backup was tried.',
      ways: [{ way: 'retry', label: 'Try loading again' }],
    };
  const FROM: Readonly<Record<string, string>> = {
    snapshot: 'The career was read from its last snapshot.',
    older: 'The last snapshot was damaged; an older one was read.',
    journal:
      'The snapshots were damaged; the career was replayed from its journal.',
    backup: 'The save was damaged; the backup was read.',
  };
  return {
    found: FROM[o.from] ?? 'The career was read.',
    lost: o.lost,
    ways: [
      { way: 'carry', label: 'Carry on from here' },
      { way: 'retry', label: 'Try loading again' },
      { way: 'restore', label: 'Restore the backup' },
    ],
  };
}

/** `settings`: the day of the last backup. */
export const settingsView = (
  backup: { day: number; season: number } | null
): SettingsView => ({
  backup: backup
    ? `Last backed up on Day ${backup.day}, Season ${backup.season + 1}.`
    : 'Never backed up.',
});
