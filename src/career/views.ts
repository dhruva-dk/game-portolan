// The office's views (Phase C, office.ts): what each management screen draws, built from the career's state. Pure:
// a view is plain data, every figure with what it is set against and what it is made of. The screens work out no rule.

import { SWATCHES, type Colours, type PartType } from '../race.ts';
import type { CommandOf, Comparison, Explanation, Face, Figure, FoundErrors, FoundView, HomeView, LetterLine, Line, Named, PartMark, RecoverView, SettingsView, ShipHalf, StandingLine, TopBar } from '../office.ts';
import { advanceCheck } from './advance.ts';
import { dice, seeded } from './dice.ts';
import { standingOf } from './elders.ts';
import { foundingCheck, weakest } from './found.ts';
import { NOUNS, crewName, family, given, place, words } from './names.ts';
import { mailView, table, unread } from './read.ts';
import type { Gull } from './roles.ts';
import { factoryPoints } from './rookery.ts';
import { bondLevel } from './service.ts';
import { age, potential, stars } from './stars.ts';
import type { CareerState, Crew, Objective } from './state.ts';
import { trait } from './traits.ts';
import { TUNING } from './tuning.ts';
import { PART_TYPES, makeWorld, staffStars } from './world.ts';
import { yardPoints } from './yard.ts';

/** 1st, 2nd, 3rd, 4th, 11th. */
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
/** Coin as a figure's text: grouped by thousands, signed when asked. */
export const coinText = (n: number, signed = false) => `${signed && n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;
const line = (label: string, amount: string | number): Line => ({ label, amount: String(amount) });
const fig = (value: number, text: string, against: Comparison | null, explain: Explanation | null): Figure => ({ value, text, against, explain });
const rival = (label: string, text: string): Comparison => ({ kind: 'rival', label, text });

/** A gull's name, as the office writes it. */
export const nameOf = (g: { given: string; family: string }) => `${g.given} ${g.family}`;
/** What a gull's headshot is drawn from. */
export function faceOf(s: CareerState, g: Gull): Face {
  const crew = g.contract ? s.crews[g.contract.crew] : null;
  return { seed: g.seed, role: g.role, age: age(g, s.day), colours: crew ? crew.colours : null, emblem: crew ? crew.emblem : null };
}
const named = (s: CareerState, id: number | null): Named | null => (id === null ? null : { id, face: faceOf(s, s.gulls[id]), name: nameOf(s.gulls[id]) });

/** The player's crew: the one they manage, or the one they left when sacked. */
const crewOf = (s: CareerState): Crew => s.crews[(s.player as NonNullable<CareerState['player']>).crew];

/** The Coin and its change this season, from the ledger. */
function coinFigure(s: CareerState, c: Crew): Figure {
  const start = s.calendar?.start ?? 0, season = s.ledger.filter((l) => l.day >= start);
  const by = season.reduce((a, l) => a + l.amount, 0);
  const kinds = new Map<string, number>();
  for (const l of season) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + l.amount);
  const lines = [line('At the season\'s start', coinText(c.coin - by)), ...[...kinds].map(([k, n]) => line(LEDGER[k] ?? k, coinText(n, true)))];
  return fig(c.coin, coinText(c.coin), { kind: 'change', by, text: `${coinText(by, true)} this season` }, { title: 'Coin', lines });
}
/** The ledger's kinds as the slip names them. */
const LEDGER: Readonly<Record<string, string>> = {
  wages: 'Wages', pay: 'Pay', prize: 'Prize money', patron: 'Patrons', upkeep: 'Upkeep', building: 'Building', design: 'Designs', fee: 'Fees',
  fish: 'Fish market', lobby: 'Lobbying', fine: 'Fines', bonus: 'Bonuses', supplier: 'Suppliers', debug: 'Granted', break: 'Break clauses',
  dilemma: 'Dilemmas', dismissal: 'Dismissals',
};

/** The top bar. */
export function topBar(s: CareerState): TopBar {
  const c = crewOf(s), me = s.gulls[(s.player as NonNullable<CareerState['player']>).gull];
  const blocked = advanceCheck(s);
  const raceDay = blocked?.code === 'raceDay';
  const screen = blocked === null ? null : raceDay ? 'plan' : blocked.code === 'sacked' ? 'jobs' : 'league';
  return {
    name: nameOf(me), face: faceOf(s, me), crew: c.name, emblem: c.emblem, colours: c.colours,
    date: `Day ${s.day - (s.calendar?.start ?? 0) + 1}, Season ${s.season + 1}`, coin: coinFigure(s, c),
    unread: unread(s), dilemma: s.mail.some((m) => m.dilemma !== null && m.dilemma.answer === null),
    go: { label: raceDay ? 'Race plan' : 'Continue', raceDay, blocker: blocked && screen ? { screen, sentence: blocked.sentence } : null },
  };
}

/** What a patron's objective asks, in words. */
const OBJECTIVE: Readonly<Record<Objective, string>> = { top10: 'a top-ten finish', sinkTwo: 'two ships sunk', afloat: 'both ships afloat', mostSea: 'the most sea held' };

function racePanel(s: CareerState, c: Crew): HomeView['race'] {
  const cal = s.calendar;
  if (!cal || s.round >= cal.rounds.length) return null;
  const r = cal.rounds[s.round], days = Math.max(0, r.day - s.day), league = s.leagues[c.league];
  const standing = standingOf(s, c.id), E = TUNING.elder;
  const patron = c.patrons.find((p) => p && p.objectives.length > 0) ?? null;
  return {
    heading: s.race ? 'Race Day' : 'Next Race', round: `Round ${s.round + 1} of ${cal.rounds.length}`, planet: { seed: r.planet.seed, name: r.planet.name },
    days: fig(days, days === 0 ? 'Today' : `${days} ${days === 1 ? 'day' : 'days'}`, rival('race day', `Day ${r.day - cal.start + 1}`),
      { title: 'Days to go', lines: [line('Today', `Day ${s.day - cal.start + 1}`), line('Race day', `Day ${r.day - cal.start + 1}`)] }),
    target: fig(c.target, ordinal(c.target), { kind: 'rank', place: standing, of: league.crews.length },
      { title: 'The elder\'s target', lines: [line('Target', ordinal(c.target)), line('Standing now', ordinal(standing)), line('Sacked if missed by', `${E.missedBy} places`)] }),
    confidence: fig(Math.round(c.confidence), String(Math.round(c.confidence)), rival('sacked under', String(E.verdict)),
      { title: 'The elder\'s confidence', lines: [line('Each race at or above the target', `+${E.met}`), line('Each place past the target', `−${E.perPlace}`), line('A missed target sacks under', String(E.verdict))] }),
    patron: patron ? `${patron.name}: ${patron.objectives.map((o) => OBJECTIVE[o]).join(' or ')}` : null,
  };
}

function shipHalf(s: CareerState, c: Crew, ship: 0 | 1): ShipHalf {
  const hands = c.staff.ships[ship], bond = c.bonds[ship], level = bondLevel(bond), next = TUNING.bond.levels[level] ?? null;
  const parts: PartMark[] = PART_TYPES.map((type: PartType) => {
    const p = c.parts.find((x) => x.ship === ship && x.type === type && !x.forNext);
    return { type, low: !!p && p.condition < 0.5, fitted: !!p };
  });
  const cap = hands.captain === null ? null : s.gulls[hands.captain];
  const M = TUNING.morale;
  return {
    ship, you: ship === 0 && c.player, parts, bosun: named(s, hands.bosun),
    bond: fig(bond, `Bond ${level} of ${TUNING.bond.levels.length}`, next === null ? rival('the', 'strongest bond') : rival('next at', `${next} races`),
      { title: 'Bond', lines: [line('Races together', bond), ...TUNING.bond.levels.map((at, i) => line(`Level ${i + 1} at`, `${at} races`))] }),
    captain: cap && {
      ...(named(s, cap.id) as Named), stars: stars(cap), potential: potential(cap), tags: cap.traits.map((t) => trait(t).name),
      morale: fig(Math.round(cap.morale), String(Math.round(cap.morale)), rival('asks to leave under', String(M.leave)),
        { title: 'Morale', lines: [line('Now', Math.round(cap.morale)), line('Asks to leave under', M.leave), line('A race on her target', `up to +${M.result}`)] }),
    },
  };
}

/** Five lines of the table round the player's: two above, theirs, two below, each with its gap to the line above. */
function tableWindow(s: CareerState, c: Crew): StandingLine[] {
  const rows = table(s, c.league), at = rows.findIndex((r) => r.crew === c.id);
  const from = Math.max(0, Math.min(rows.length - 5, at - 2));
  return rows.slice(from, from + 5).map((r, i) => {
    const above = from + i > 0 ? rows[from + i - 1] : null, k = s.crews[r.crew];
    return { place: r.place, crew: r.crew, name: r.name, emblem: k.emblem, colours: k.colours, points: r.points, gap: above ? `−${above.points - r.points}` : '', mine: r.mine };
  });
}

/** The newest `n` letters. */
export function letters(s: CareerState, n: number): LetterLine[] {
  return mailView(s).slice(0, n).map((m) => {
    const mail = s.mail.find((x) => x.id === m.id), sender = mail?.sender ?? null;
    return {
      id: m.id, day: m.day - (s.calendar?.start ?? 0) + 1, subject: m.subject, category: m.category, unread: !m.read, sealed: m.open,
      from: sender === null ? 'The Admiralty\'s secretary' : nameOf(s.gulls[sender]), face: sender === null ? null : faceOf(s, s.gulls[sender]),
    };
  });
}

/** `home`. */
export function homeView(s: CareerState): HomeView {
  const c = crewOf(s), points = yardPoints(s, c.id), factory = factoryPoints(c);
  const league = s.leagues[c.league].crews, rank = 1 + league.filter((k) => k !== c.id && yardPoints(s, k) > points).length;
  const d = c.design;
  return {
    top: topBar(s), race: racePanel(s, c), ships: [shipHalf(s, c, 0), shipHalf(s, c, 1)],
    yard: {
      design: d && { type: d.type, days: fig(Math.max(0, d.built - s.day), `${Math.max(0, d.built - s.day)} days`, rival('built on', `Day ${d.built - (s.calendar?.start ?? 0) + 1}`),
        { title: 'The design', lines: [line('Drawn by', `Day ${d.designed - (s.calendar?.start ?? 0) + 1}`), line('Built by', `Day ${d.built - (s.calendar?.start ?? 0) + 1}`)] }) },
      points: fig(points, points.toFixed(1), { kind: 'rank', place: rank, of: league.length },
        { title: 'Yard points a day', lines: [line('The factory', factory.toFixed(1)), line('The bosuns', (points - factory).toFixed(1))] }),
      works: Object.entries(c.buildings).filter(([, w]) => w.next !== null)
        .map(([b, w]) => ({ building: b as keyof Crew['buildings'], level: (w.next as { level: number }).level, days: Math.max(0, (w.next as { done: number }).done - s.day) })),
    },
    table: { league: LEAGUES[c.league] ?? `League ${c.league + 1}`, lines: tableWindow(s, c) },
    mail: { letters: letters(s, 4), unread: unread(s) },
  };
}
const LEAGUES = ['League One', 'League Two', 'League Three'];

/** Founding's defaults for a seed: a crew name whose words clash with no crew's, a name for the player, a face. */
const founding = new Map<string, { replacing: string; names: string[] }>();
function worldFor(seed: number, colours: Colours) {
  const key = `${seed}.${colours.first}.${colours.second}`;
  let w = founding.get(key);
  if (!w) {
    const world = makeWorld(seed, colours, dice(seed, {}));
    const k = weakest(world), elder = world.gulls[k.staff.elder];
    const staff = world.gulls.filter((g) => g.contract?.crew === k.id && g.retired === null);
    w = {
      replacing: `${k.name} of ${LEAGUES[k.league]}: elder ${nameOf(elder)}, staff ${staffStars(staff).toFixed(1)} stars on average.`,
      names: world.crews.map((x) => x.name),
    };
    founding.set(key, w);
    if (founding.size > 4) founding.delete(founding.keys().next().value as string);
  }
  return w;
}

/** `found` for a world seed and the colours chosen so far: its defaults, rolled from the seed. */
export function foundView(seed: number, colours: Colours): FoundView {
  const w = worldFor(seed, colours), rand = seeded(seed, 0x0f0d);
  const taken = new Set(w.names.flatMap(words));
  let crew = '';
  for (let k = 0; k < 40 && (crew === '' || words(crew).some((x) => taken.has(x)) || crew.length > 24); k++) crew = crewName(place(rand), NOUNS[Math.floor(rand() * NOUNS.length)]);
  return {
    seed, crew, given: given(rand), family: family(rand), headshot: Math.floor(rand() * 0xffffffff), age: TUNING.player.age, colours, emblem: Math.floor(rand() * TUNING.world.emblems),
    swatches: SWATCHES, emblems: TUNING.world.emblems, limits: { crew: 24, gull: TUNING.player.gullName }, replacing: w.replacing,
  };
}

/** What the founding form gets wrong, field by field (each checked with the others set to ones the career takes), so
 *  each error shows under its own field; a field missing is right. The crew's name is held to the form's 24. */
export function foundErrors(c: CommandOf<'Found'>): FoundErrors {
  const v = foundView(c.seed, { first: 0, second: 1 });
  const good: CommandOf<'Found'> = { ...c, crew: v.crew, colours: { first: 0, second: 1 }, emblem: 0, given: v.given, family: v.family, headshot: v.headshot };
  const say = (k: Partial<CommandOf<'Found'>>) => foundingCheck({ ...good, ...k })?.sentence;
  const out: FoundErrors = {
    crew: c.crew.trim().length > v.limits.crew ? `The crew's name is too long: at most ${v.limits.crew} letters.` : say({ crew: c.crew }),
    colours: say({ colours: c.colours }), emblem: say({ emblem: c.emblem }),
    gull: say({ given: c.given }) ?? say({ family: c.family }) ?? say({ headshot: c.headshot }),
  };
  for (const k of Object.keys(out) as (keyof FoundErrors)[]) if (out[k] === undefined) delete out[k];
  return out;
}

/** `recover`: what the load kept and lost, from session.ts's Opened. */
export function recoverView(o: { from: string; lost: string; failed: string | null }): RecoverView {
  if (o.failed !== null) return {
    found: o.failed, lost: 'The career could not be read, and its backup was tried.',
    ways: [{ way: 'retry', label: 'Try loading again' }],
  };
  const FROM: Readonly<Record<string, string>> = {
    snapshot: 'The career was read from its last snapshot.', older: 'The last snapshot was damaged; an older one was read.',
    journal: 'The snapshots were damaged; the career was replayed from its journal.', backup: 'The save was damaged; the backup was read.',
  };
  return {
    found: FROM[o.from] ?? 'The career was read.', lost: o.lost,
    ways: [{ way: 'carry', label: 'Carry on from here' }, { way: 'retry', label: 'Try loading again' }, { way: 'restore', label: 'Restore the backup' }],
  };
}

/** `settings`: the day of the last backup. */
export const settingsView = (backup: { day: number; season: number } | null): SettingsView =>
  ({ backup: backup ? `Last backed up on Day ${backup.day}, Season ${backup.season + 1}.` : 'Never backed up.' });
