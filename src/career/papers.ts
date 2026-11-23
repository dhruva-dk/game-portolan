// The office's papers of a career (office/papers.ts): the mail, the calendar,
// the finances, the sponsors, the headquarters and the ship, each built from
// the career's state as plain data, with whether each thing it offers may be
// done now (the rule's own check) and why not.

import type { PartType } from '../race.ts';
import type {
  Backer,
  CalendarPaper,
  FinancesPaper,
  HqPaper,
  MailPaper,
  Measure,
  ShipPaper,
  SponsorsPaper,
} from '../office/papers.ts';
import type { Act } from '../office/people.ts';
import type { Check } from './command.ts';
import type { Building } from '../office/command.ts';
import { COMPONENTS, component, TYPES } from './components.ts';
import { designCheck, pool, projection } from './design.ts';
import {
  buildCheck,
  buildCost,
  buildDays,
  designSlots,
  upkeepAt,
} from './hq.ts';
import { render } from './mail.ts';
import { perRace, projection as balanceAt } from './money.ts';
import { standingOf } from './standings.ts';
import {
  BUILT,
  NEWS,
  PARTS,
  championship,
  dateAt,
  short,
  span,
  titled,
} from './office.ts';
import { dilemmaView, fixtures } from './read.ts';
import { signCheck } from './sponsors.ts';
import {
  championshipOf,
  type CareerState,
  type Objective,
  type Sponsor,
  type Team,
} from './state.ts';
import { TRADES, supplier } from './suppliers.ts';
import { TUNING } from './tuning.ts';
import { letters, myTeam } from './views.ts';
import { shipName } from './views-person.ts';
import { BUILDINGS } from './world.ts';

/** A check as a button's state. */
const act = (c: Check): Act => ({ ok: c === null, why: c?.sentence ?? '' });

/** A word with its capital. */
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** The mail, the letter `open` open (null, or gone: none). */
export function mailPaper(s: CareerState, open: number | null): MailPaper {
  const start = s.calendar?.start ?? 0;
  const all = letters(s, s.mail.length).map((l) => ({
    id: l.id,
    date: dateAt(s, start + l.day - 1),
    subject: titled(l.subject),
    from: l.from,
    about: NEWS[l.category][1],
    unread: l.unread,
    sealed: l.sealed,
  }));
  const letter = all.find((l) => l.id === open),
    mail = s.mail.find((m) => m.id === open),
    asked = letter ? dilemmaView(s, letter.id) : null;
  return {
    letters: all,
    open:
      letter && mail
        ? {
            ...letter,
            body: titled(render(s, mail).body),
            options: (asked?.options ?? []).map(capital),
            answer: asked?.answer ?? null,
          }
        : null,
  };
}

/** The season's races. */
export function calendarPaper(s: CareerState): CalendarPaper {
  return {
    championship: championship(myTeam(s).tier),
    races: fixtures(s).map((f) => ({
      round: f.round + 1,
      name: f.planet.name,
      date: dateAt(s, f.day),
      when: f.when,
    })),
  };
}

/** What each kind of the ledger's lines was for, as the finances name it; what came in first. */
const SPENT: Readonly<Record<string, string>> = {
  sponsor: 'Sponsors',
  prize: 'Prize money',
  fish: 'Fish market',
  pay: 'Pay drivers',
  wages: 'Wages',
  bonus: 'Bonuses',
  upkeep: 'Headquarters upkeep',
  building: 'Buildings',
  design: 'Designs',
  supplier: 'Suppliers',
  fee: 'Signing fees',
  break: 'Break clauses',
  dismissal: 'Dismissals',
  standIn: 'Stand-ins',
  fine: 'Fines',
  lobby: 'Lobbying',
  dilemma: 'Decisions',
};

/** The finances. */
export function financesPaper(s: CareerState): FinancesPaper {
  const c = myTeam(s),
    r = perRace(s, c.id),
    ahead = balanceAt(s, c.id);
  const start = s.calendar?.start ?? 0,
    end = s.calendar?.end ?? s.day,
    season = s.ledger.filter((l) => l.day >= start);
  const by = new Map<string, number>();
  for (const l of season) {
    const label = SPENT[l.kind] ?? capital(l.kind);
    by.set(label, (by.get(label) ?? 0) + l.amount);
  }
  /** The balance as the season began: before its first line, else as it is. */
  const opening = season[0] ? season[0].balance - season[0].amount : c.balance;
  return {
    balance: c.balance,
    floor: c.debtFloor,
    projection: {
      races: ahead.races,
      place: standingOf(s, c.id),
      prize: ahead.prize,
      end: ahead.end,
    },
    season: [...by]
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount),
    chart: {
      from: dateAt(s, start),
      to: dateAt(s, Math.max(end, s.day)),
      start,
      today: s.day,
      end: Math.max(end, s.day),
      points: [
        { day: start, balance: opening },
        ...season.map((l) => ({ day: l.day, balance: l.balance })),
      ],
    },
    race: [
      { label: 'Sponsors', amount: r.sponsors },
      { label: 'Fish Market', amount: r.fish },
      { label: 'Pay Drivers', amount: r.pay },
      { label: 'Wages', amount: -r.wages },
      { label: 'Headquarters Upkeep', amount: -r.upkeep },
    ],
    net: r.net,
    ledger: [...s.ledger]
      .reverse()
      .map((l) => ({
        date: dateAt(s, l.day),
        what: capital(l.what),
        amount: l.amount,
        balance: l.balance,
      })),
  };
}

/** What a sponsor asks for its bonus. */
const OBJECTIVES: Readonly<Record<Objective, string>> = {
  top10: 'Top Ten',
  sinkTwo: 'Two Sinkings',
  afloat: 'Afloat at the End',
  mostSea: 'Most Sea Held',
};

const backer = (p: Sponsor): Backer => ({
  id: p.id,
  name: p.name,
  pays:
    p.objectives.length === 0
      ? 'Every Race'
      : p.objectives.map((o) => OBJECTIVES[o]).join(' / '),
  amount: p.objectives.length === 0 ? p.perRace : p.bonus,
  races: p.races,
  grade: p.grade,
});

/** The sponsors. */
export function sponsorsPaper(s: CareerState): SponsorsPaper {
  const c = myTeam(s);
  return {
    slots: c.sponsors.map((p) => (p ? backer(p) : null)),
    offers: c.offers
      .filter((o) => o.expires >= s.day)
      .map((o) => ({
        ...backer(o.sponsor),
        days: o.expires - s.day,
        sign: act(signCheck(s, c.id, o.sponsor.id, 0)),
      })),
  };
}

const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0;

/** A chart's bars for her team `c` against its championship: `of` each team's numbers, a bar each, as shares of `most`. */
function measured(
  s: CareerState,
  c: Team,
  names: readonly string[],
  of: (team: Team) => readonly number[],
  most: (k: number, all: readonly (readonly number[])[]) => number
): Measure[] {
  const all = s.teams.map(of),
    tier = championshipOf(s, c.tier).teams.map((id) => all[id] ?? []);
  return names.map((name, k) => {
    const top = Math.max(1e-9, most(k, all));
    const share = (m: readonly number[]) => (m[k] ?? 0) / top;
    return {
      name,
      value: share(all[c.id] ?? []),
      best: Math.max(...tier.map(share)),
      average: mean(tier.map(share)),
    };
  });
}

/** What each building is for, as its card says it (hq.ts reads what each level gives). */
const ABOUT: Readonly<Record<Building, string>> = {
  factory:
    'Where parts are built and improved between races. Each level gives more improvement work a day and builds a part sooner.',
  drawingLoft:
    'Where parts are designed. Each level gives a design another component, shortens it, and brings designers on faster.',
  testTank: 'Hulls proved in still water. Each level opens better components.',
  foundry: 'Iron cast for the ships. Each level opens better components.',
  sailingSchool: 'Where drivers are taught. Each level brings them on faster.',
  pitHouse: 'Where the pit crew rest. Each level mends their fatigue sooner.',
  crowsNest:
    'Where the scouts keep watch. Each level takes on another scout and shortens a scouting.',
  fishMarket: 'The team’s stall on the quay. It brings in money every race.',
  landingPad:
    'Where sponsors come ashore. Each level lets a better sponsor be signed.',
};

/** What the buildings are for, a bar of the headquarters' chart each: its name, and the buildings counted in it. */
const WINGS: readonly (readonly [string, readonly Building[]])[] = [
  ['Overall', BUILDINGS],
  ['Design', ['drawingLoft', 'testTank', 'foundry']],
  ['Factory', ['factory']],
  ['Crew', ['sailingSchool', 'pitHouse']],
  ['Scouting', ['crowsNest']],
  ['Income', ['fishMarket', 'landingPad']],
];

/** The headquarters. */
export function hqPaper(s: CareerState): HqPaper {
  const c = myTeam(s),
    top = (b: Building) => TUNING.hq.works[b].cost.length;
  return {
    stats: measured(
      s,
      c,
      WINGS.map(([name]) => name),
      (x) =>
        WINGS.map(([, of]) => of.reduce((a, b) => a + x.buildings[b].level, 0)),
      (k) => (WINGS[k]?.[1] ?? []).reduce((a, b) => a + top(b), 0)
    ),
    knowledge: TYPES.map((t) => ({
      part: PARTS[t] ?? t,
      known: pool(s, c.id, t).length,
      of: COMPONENTS.filter((x) => x.type === t).length,
    })),
    buildings: BUILDINGS.map((b) => {
      const w = c.buildings[b],
        next = Math.min(top(b), w.level + 1);
      return {
        id: b,
        name: BUILT[b],
        about: ABOUT[b],
        level: w.level,
        top: top(b),
        upkeep: upkeepAt(b, w.level),
        cost: buildCost(b, next),
        days: buildDays(b, next),
        under: w.next
          ? span(s, w.next.done - buildDays(b, w.next.level), w.next.done)
          : null,
        build: act(buildCheck(s, c.id, b)),
      };
    }),
  };
}

/** What a component does, in a few words. */
function effectOf(id: string): string {
  const e = component(id)?.effects;
  if (!e) return '';
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  return [
    e.perf && `${signed(Math.round(e.perf))} Performance`,
    e.reliability && `${signed(Math.round(e.reliability * 100))}% Reliability`,
    e.risk && `${Math.round(e.risk * 100)}% Risk`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** The mean performance of the parts a team has fitted: of them all, then of each type. */
function fitted(c: Team): number[] {
  const on = c.parts.filter((p) => p.ship !== null && !p.forNext);
  return [
    mean(on.map((p) => p.perf)),
    ...TYPES.map((t) =>
      mean(on.filter((p) => p.type === t).map((p) => p.perf))
    ),
  ];
}

/** The ship: the design on the drawing board is of `type`, with `picked` its slots' cards (null: none picked). */
export function shipPaper(
  s: CareerState,
  type: PartType,
  picked: readonly (string | null)[]
): ShipPaper {
  const c = myTeam(s),
    me = s.player ? s.people[s.player.person] : null;
  const deals = c.draft?.type === type ? c.draft.deals : [];
  const known = pool(s, c.id, type).length;
  const slots = Array.from({ length: designSlots(c) }, (_, slot) => {
    const d = deals.find((x) => x.slot === slot),
      pick = picked[slot] ?? null;
    return {
      cards: (d?.cards ?? []).map((id) => ({
        id,
        name: component(id)?.name ?? id,
        effect: effectOf(id),
      })),
      picked: pick !== null && d?.cards.includes(pick) ? pick : null,
      deal: {
        ok: known > 0 && !d?.redealt && !c.design,
        why:
          c.staff.designer === null
            ? 'The team has no designer.'
            : known === 0
              ? 'The designer knows no components of this part.'
              : d?.redealt
                ? 'That slot has had its one redeal.'
                : '',
      },
    };
  });
  const chosen = slots.flatMap((x) => (x.picked ? [x.picked] : []));
  const p = projection(s, c.id, type, chosen);
  return {
    stats: measured(
      s,
      c,
      ['Overall', ...TYPES.map((t) => PARTS[t] ?? t)],
      fitted,
      (k, all) => Math.max(...all.map((m) => m[k] ?? 0))
    ),
    suppliers: TRADES.map((t) => ({
      trade: capital(t),
      name: supplier(c.suppliers[t])?.name ?? null,
    })),
    improving: {
      perf: c.improvement.reduce((a, x) => a + x.perf, 0),
      reliability: c.improvement.reduce((a, x) => a + x.reliability, 0),
      shares: c.improvement,
    },
    ships: c.staff.ships.map((h, i) => ({
      name: shipName(i),
      driver:
        h.driver !== null ? short(s.people[h.driver]) : me ? short(me) : '',
    })),
    types: TYPES.map((t) => ({ id: t, label: PARTS[t] ?? t })),
    parts: c.parts
      .filter((x) => !x.forNext)
      .map((x) => ({
        id: x.id,
        type: x.type,
        name: PARTS[x.type] ?? x.type,
        perf: x.perf,
        perfMax: x.perfMax,
        reliability: x.reliability,
        condition: x.condition,
        ship: x.ship,
        spec: x.spec,
      })),
    design: c.design
      ? {
          name: PARTS[c.design.type] ?? c.design.type,
          ...span(s, c.design.started, c.design.built),
        }
      : null,
    draft: {
      type,
      slots,
      perf: p.numbers.perf,
      perfMax: p.numbers.perfMax,
      reliability: p.numbers.reliability,
      cost: p.cost,
      days: p.days + p.build,
      start: act(designCheck(s, c.id, type, chosen, false)),
    },
  };
}
