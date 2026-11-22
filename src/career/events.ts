// The twelve dilemmas, as data: each a trigger the career can evaluate for a team (the slots of
// its mail if it holds, else null), its options, what each option does, and which option each personality of rival
// manager takes. Their words are career/mail.ts's (the dilemma's id is its mail kind). Drawing and answering them is
// career/dilemmas.ts's.

import {
  SHIPS,
  type MailCategory,
  type Offer,
  type Personality,
} from '../office/command.ts';
import { PARTS, type PartType } from '../race.ts';
import { askWage } from './asks.ts';
import { canSpend, paid } from './balance.ts';
import { why, type Check } from './command.ts';
import type { Rand } from './dice.ts';
import { standingOf } from './standings.ts';
import { flag, flagged, nextRace, unflagged } from './flags.ts';
import { signableCheck } from './hiring.ts';
import { learned } from './knowledge.ts';
import { moraleIn } from './morale.ts';
import { signed } from './contracts.ts';
import { bondLevel, fatigueOn } from './pit.ts';
import type { Person } from './roles.ts';
import { age, potential } from './stars.ts';
import {
  championshipOf,
  personAt,
  staffOf,
  teamOf,
  withPerson,
  withTeam,
  type CareerState,
  type Team,
  type Mail,
  type Part,
} from './state.ts';
import { TUNING } from './tuning.ts';
import { improvementTo } from './improvement.ts';

const D = TUNING.dilemmas;
type Slots = Mail['slots'];

/** What an answer comes to: the new state, or why the option cannot be taken. */
export type Answer = { state: CareerState } | { no: NonNullable<Check> };

export interface Dilemma {
  id: string;
  category: MailCategory;
  chairman: boolean; // drawn by the chairman's Meddling
  options: readonly string[]; // the last is taken when the player lets it lapse
  trigger: (s: CareerState, c: Team, rand: Rand) => Slots | null;
  answer: (s: CareerState, c: Team, slots: Slots, option: number) => Answer;
  rival: readonly number[]; // the option each personality takes, in PERSONALITIES' order
}

export const PERSONALITIES: readonly Personality[] = [
  'spender',
  'youthBuilder',
  'poacher',
  'engineer',
  'gambler',
  'steady',
];

const ok = (state: CareerState): Answer => ({ state });
const no = (code: string, sentence: string): Answer => ({
  no: why(code, sentence),
});

/** A state with a person changed by a function. */
const personSet = (
  s: CareerState,
  id: number,
  f: (g: Person) => Person
): CareerState => withPerson(s, f(personAt(s, id)));
const moraleBy = (s: CareerState, id: number, by: number) =>
  personSet(s, id, (g) => ({ ...g, morale: moraleIn(g.morale + by) }));
const marketBy = (s: CareerState, id: number, by: number) =>
  personSet(s, id, (g) => ({
    ...g,
    marketability: Math.min(100, Math.max(0, g.marketability + by)),
  }));
const teamSet = (
  s: CareerState,
  team: number,
  f: (c: Team) => Team
): CareerState => withTeam(s, f(teamOf(s, team)));
/** money spent on an answer, if the chairman allows it. */
const spend = (
  s: CareerState,
  team: number,
  balance: number,
  what: string
): Answer =>
  canSpend(s.teams[team], balance)
    ? ok(paid(s, team, balance, { kind: 'dilemma', what }))
    : no('balance', 'The chairman will not let the balance fall that low.');
/** The team's ships' drivers. */
const drivers = (c: Team): number[] =>
  c.staff.ships.map((h) => h.driver).filter((x): x is number => x !== null);
const N = (x: string | number | undefined): number => Number(x);

/** The parts of a team's first ship by type. */
const shipOne = (c: Team): Map<PartType, Part> =>
  new Map(c.parts.filter((p) => p.ship === 0).map((p) => [p.type, p]));
/** Two parts with their numbers exchanged. */
const numbers = (p: Part) => ({
  perf: p.perf,
  perfMax: p.perfMax,
  reliability: p.reliability,
  reliabilityMax: p.reliabilityMax,
  risk: p.risk,
  components: p.components,
  cost: p.cost,
});
const swapped = (a: Part, b: Part): [Part, Part] => [
  { ...a, ...numbers(b) },
  { ...b, ...numbers(a) },
];
const replaced = (c: Team, parts: readonly Part[]): Team => ({
  ...c,
  parts: c.parts.map((p) => parts.find((q) => q.id === p.id) ?? p),
});

export const DILEMMAS: readonly Dilemma[] = [
  {
    id: 'riseAsk',
    category: 'team',
    chairman: false,
    options: ['pay', 'refuse', 'promise'],
    rival: [0, 2, 0, 2, 1, 2],
    trigger: (s, c) => {
      const g = staffOf(c)
        .map((id) => s.people[id])
        .filter(
          (x) =>
            !x.player &&
            x.role !== 'chairman' &&
            x.role !== 'manager' &&
            x.morale < D.low &&
            x.contract !== null &&
            x.contract.ends !== null &&
            x.contract.ends > s.season
        )
        .sort((a, b) => a.morale - b.morale || a.id - b.id)[0];
      return g ? { person: g.id } : null;
    },
    answer: (s, _c, slots, o) => {
      const id = N(slots.person);
      if (o === 1) return ok(moraleBy(s, id, D.refuse));
      return ok(
        personSet(s, id, (g) =>
          g.contract === null
            ? g
            : o === 0
              ? {
                  ...g,
                  morale: moraleIn(g.morale + D.riseMorale),
                  contract: {
                    ...g.contract,
                    wage: Math.round(g.contract.wage * (1 + D.rise)),
                  },
                }
              : {
                  ...g,
                  morale: moraleIn(g.morale + D.promiseMorale),
                  contract: {
                    ...g.contract,
                    podium:
                      g.contract.podium +
                      Math.round(g.contract.wage * D.promise),
                  },
                }
        )
      );
    },
  },
  {
    id: 'shipsArgue',
    category: 'ship',
    chairman: false,
    options: ['give', 'hold'],
    rival: [1, 1, 1, 1, 1, 1],
    trigger: (s, c) => {
      const when = flag(s, `newPart:${c.id}`);
      const type = PARTS.find((t) => c.lastNew[t] !== null);
      const got = type ? c.lastNew[type] : null;
      const ship = c.staff.ships.findIndex(
        (h, k) => k !== got && h.driver !== null
      );
      const driver = c.staff.ships[ship]?.driver ?? null;
      return when !== null &&
        when >= s.day - TUNING.calendar.gap &&
        driver !== null &&
        got !== null &&
        type
        ? { person: driver, type, ship, from: got }
        : null;
    },
    answer: (s, c, slots, o) => {
      const out = unflagged(s, `newPart:${c.id}`);
      if (o === 1) return ok(moraleBy(out, N(slots.person), D.argueLost));
      const to = SHIPS[N(slots.ship)];
      const a = c.parts.find(
          (p) => p.ship === N(slots.from) && p.type === slots.type
        ),
        b = c.parts.find((p) => p.ship === to && p.type === slots.type);
      if (!a || !b || to === undefined)
        return no('part', 'The part is no longer fitted.');
      const moved = teamSet(out, c.id, (x) => ({
        ...replaced(x, [
          { ...a, ship: b.ship },
          { ...b, ship: a.ship },
        ]),
        lastNew: { ...x.lastNew, [a.type]: to },
      }));
      return ok(moraleBy(moved, N(slots.person), D.argue));
    },
  },
  {
    id: 'bondFallOut',
    category: 'team',
    chairman: false,
    options: ['swap', 'dinner', 'leave'],
    rival: [1, 2, 2, 0, 0, 2],
    trigger: (s, c) => {
      // a bond gains 1 to 2 a race, so after five races every pair is past level 1's 5 points: the pair that falls out
      // is one still short of level 2 (docs/decisions.md)
      if (s.round < 5) return null;
      const k = c.staff.ships.findIndex(
        (h, i) =>
          h.mechanic !== null &&
          h.driver !== null &&
          bondLevel(c.bonds[i] ?? 0) <= 1
      );
      const h = c.staff.ships[k];
      return h && h.mechanic !== null && h.driver !== null
        ? { ship: k, mechanic: h.mechanic, person: h.driver }
        : null;
    },
    answer: (s, c, slots, o) => {
      const k = N(slots.ship);
      if (o === 0) {
        // her mechanic changes places with the next ship's
        const n = (k + 1) % c.staff.ships.length;
        const a = c.staff.ships[k],
          b = c.staff.ships[n];
        if (!a || !b || a.mechanic === null || b.mechanic === null)
          return no('mechanic', 'Both ships need a mechanic to swap them.');
        return ok(
          teamSet(s, c.id, (x) => ({
            ...x,
            bonds: x.bonds.map((bond, i) => (i === k || i === n ? 0 : bond)),
            staff: {
              ...x.staff,
              ships: x.staff.ships.map((h, i) =>
                i === k
                  ? { ...h, mechanic: b.mechanic }
                  : i === n
                    ? { ...h, mechanic: a.mechanic }
                    : h
              ),
            },
          }))
        );
      }
      if (o === 2) return ok(s);
      const spent = spend(s, c.id, D.dinner, 'dinner for a quarrel');
      if ('no' in spent) return spent;
      return ok(
        teamSet(spent.state, c.id, (x) => ({
          ...x,
          bonds: x.bonds.map((bond, i) =>
            i === k ? bond + D.dinnerBond : bond
          ),
        }))
      );
    },
  },
  {
    id: 'greyComponent',
    category: 'ship',
    chairman: false,
    options: ['take', 'refuse', 'report'],
    rival: [0, 1, 0, 0, 0, 2],
    trigger: (s, c) =>
      c.design !== null &&
      c.staff.designer !== null &&
      flag(s, `grey:${c.id}`) !== c.design.started
        ? { person: c.staff.designer, type: c.design.type }
        : null,
    answer: (s, c, _slots, o) => {
      if (c.design === null) return no('design', 'The design is finished.');
      const out = flagged(s, `grey:${c.id}`, c.design.started);
      if (o === 1) return ok(out);
      if (o === 2)
        return ok(
          drivers(c).reduce((acc, id) => marketBy(acc, id, D.report), out)
        );
      const up = <T extends { perf: number; perfMax: number; risk: number }>(
        n: T
      ): T => ({
        ...n,
        perf: n.perf + D.grey.perf,
        perfMax: n.perfMax + D.grey.perf,
        risk: Math.min(
          TUNING.design.riskMost,
          Math.round((n.risk + D.grey.risk) * 1000) / 1000
        ),
      });
      return ok(
        teamSet(out, c.id, (x) => ({
          ...x,
          design: x.design && {
            ...x.design,
            projected: up(x.design.projected),
            drawn: x.design.drawn && up(x.design.drawn),
          },
        }))
      );
    },
  },
  {
    id: 'sponsorGuest',
    category: 'finance',
    chairman: false,
    options: ['agree', 'decline'],
    rival: [0, 1, 0, 1, 0, 1],
    trigger: (s, c) => {
      const p = c.sponsors.find((x) => x !== null && x.objectives.length === 0);
      return p && nextRace(s) !== null
        ? { sponsor: p.id, name: p.name, balance: p.perRace }
        : null;
    },
    answer: (s, c, slots, o) => {
      if (o === 0)
        return ok(
          flagged(
            paid(s, c.id, -N(slots.balance), {
              kind: 'sponsor',
              what: `${slots.name}'s guest`,
            }),
            `guest:${c.id}`,
            nextRace(s) ?? s.day
          )
        );
      return ok(
        teamSet(s, c.id, (x) => ({
          ...x,
          sponsors: x.sponsors.map((p) =>
            p && p.id === N(slots.sponsor)
              ? { ...p, races: Math.max(1, p.races - 1) }
              : p
          ),
        }))
      );
    },
  },
  {
    id: 'pitWorn',
    category: 'team',
    chairman: false,
    options: ['rest', 'push', 'cover'],
    rival: [2, 0, 1, 0, 1, 0],
    // the fatigue the last race left them (a race adds at most ~49 and the days between take 140 or more, so "above 75"
    // never holds of fatigue now; docs/decisions.md)
    trigger: (s, c) => {
      const g = c.staff.pit
        .map((id) => s.people[id])
        .find((x) => x.fatigue > D.worn);
      return g && nextRace(s) !== null ? { person: g.id } : null;
    },
    answer: (s, c, slots, o) => {
      const id = N(slots.person),
        race = nextRace(s) ?? s.day;
      if (o === 1) return ok(flagged(s, `push:${id}`, race));
      if (o === 0) {
        const loft = c.buildings.pitHouse.level;
        const rested = personSet(s, id, (g) => ({
          ...g,
          fatigue: Math.max(0, fatigueOn(g, s.day, loft) - D.restFatigue),
          fatigueDay: s.day,
        }));
        return ok(flagged(rested, `rest:${id}`, race));
      }
      const spent = spend(s, c.id, D.cover, 'cover for the pit crew');
      return 'no' in spent
        ? spent
        : ok(flagged(spent.state, `cover:${id}`, race));
    },
  },
  {
    id: 'partSwap',
    category: 'ship',
    chairman: false,
    options: ['swap', 'decline'],
    rival: [1, 1, 1, 1, 1, 1],
    trigger: (s, c, rand) => {
      const l = championshipOf(s, c.tier);
      const spec = new Set(l.rules.spec);
      const mineOf = shipOne(c);
      const others = l.teams.filter((x) => x !== c.id);
      const r = others[Math.floor(rand() * others.length)];
      if (r === undefined) return null;
      const theirs = shipOne(teamOf(s, r));
      const gap = (t: PartType) =>
        (theirs.get(t)?.perf ?? 0) - (mineOf.get(t)?.perf ?? 0);
      const types = PARTS.filter(
        (t) => !spec.has(t) && mineOf.has(t) && theirs.has(t)
      );
      const give = types.find((t) => gap(t) > 0),
        take = types.find((t) => gap(t) < 0);
      return give && take ? { team: r, give, take } : null;
    },
    answer: (s, c, slots, o) => {
      if (o === 1) return ok(s);
      const r = N(slots.team);
      let a = improvementTo(improvementTo(s, c.id), r);
      const ours = shipOne(teamOf(a, c.id)),
        theirs = shipOne(teamOf(a, r));
      const pairs = PARTS.filter(
        (t) => t === slots.give || t === slots.take
      ).flatMap((t) => {
        const mine = ours.get(t),
          other = theirs.get(t);
        return mine && other ? [swapped(mine, other)] : [];
      });
      if (pairs.length !== 2)
        return no('part', 'The parts are no longer fitted.');
      a = teamSet(a, c.id, (x) =>
        replaced(
          x,
          pairs.map((p) => p[0])
        )
      );
      return ok(
        teamSet(a, r, (x) =>
          replaced(
            x,
            pairs.map((p) => p[1])
          )
        )
      );
    },
  },
  {
    id: 'pressChairman',
    category: 'chairman',
    chairman: true,
    options: ['back', 'free', 'silent'],
    rival: [0, 0, 1, 2, 1, 2],
    trigger: (_s, c) =>
      c.confidence < D.low && c.staff.manager !== null ? { team: c.id } : null,
    answer: (s, c, _slots, o) => {
      if (o === 2 || c.staff.manager === null) return ok(s);
      const by = o === 0 ? D.press : -D.press;
      const out = teamSet(s, c.id, (x) => ({
        ...x,
        confidence: Math.min(100, Math.max(0, x.confidence + by)),
      }));
      return ok(marketBy(out, c.staff.manager, -by));
    },
  },
  {
    id: 'youngTrial',
    category: 'market',
    chairman: false,
    options: ['sign', 'scout', 'decline'],
    rival: [2, 0, 1, 2, 0, 1],
    trigger: (s, c, rand) => {
      const young = s.people.filter(
        (g) =>
          g.role === 'driver' &&
          g.contract === null &&
          g.retired === null &&
          !g.player &&
          age(g, s.day) < D.trialAge &&
          potential(g) >= D.trialPotential
      );
      const g = young[Math.floor(rand() * young.length)];
      return g && c.staff.reserve === null ? { person: g.id } : null;
    },
    answer: (s, c, slots, o) => {
      const id = N(slots.person);
      if (o === 2) return ok(s);
      if (o === 1) return ok(learned(s, c.id, id, null));
      const offer: Offer = {
        role: 'driver',
        status: 'reserve',
        wage: Math.round(askWage(s.people[id], c.tier) * D.trialWage),
        fee: 0,
        seasons: 2,
        podium: 0,
        sinking: 0,
        breakClause: null,
        replaces: null,
      };
      const check = signableCheck(s, c.id, id, offer);
      return check
        ? { no: check }
        : ok(signed(s, { team: c.id, person: id, offer }));
    },
  },
  {
    id: 'stormDamage',
    category: 'hq',
    chairman: false,
    options: ['now', 'slowly'],
    rival: [0, 1, 1, 0, 1, 0],
    trigger: (s, c) =>
      (flag(s, `storm:${c.id}`) ?? -1) < (s.calendar?.start ?? 0)
        ? { building: 'factory', balance: D.repair * c.buildings.factory.level }
        : null,
    answer: (s, c, slots, o) => {
      const out = flagged(s, `storm:${c.id}`, s.day);
      if (o === 0) return spend(out, c.id, N(slots.balance), 'storm repairs');
      return ok(
        flagged(improvementTo(out, c.id), `slow:${c.id}`, s.day + D.slowDays)
      );
    },
  },
  {
    id: 'unfitWantsSail',
    category: 'team',
    chairman: false,
    options: ['let', 'rest'],
    rival: [0, 1, 0, 1, 0, 1],
    trigger: (s, c) => {
      const g = drivers(c)
        .concat(c.staff.reserve ?? [])
        .map((id) => s.people[id])
        .find((x) => x.unfit === 1);
      return g && nextRace(s) !== null ? { person: g.id } : null;
    },
    answer: (s, _c, slots, o) => {
      const id = N(slots.person);
      if (o === 1) return ok(s);
      if (s.people[id].unfit !== 1)
        return no('fit', 'They are fit already, or further from it.');
      return ok(
        flagged(
          personSet(s, id, (g) => ({ ...g, unfit: 0 })),
          `pushed:${id}`,
          nextRace(s) ?? s.day
        )
      );
    },
  },
  {
    id: 'testingExemption',
    category: 'tier',
    chairman: false,
    options: ['take', 'decline'],
    rival: [0, 0, 0, 0, 0, 1],
    trigger: (s, c) =>
      s.round >= 1 &&
      standingOf(s, c.id) > s.championships[c.tier].teams.length - D.lowest &&
      (flag(s, `exempt:${c.id}`) ?? -1) < s.day
        ? { tier: c.tier }
        : null,
    answer: (s, c, _slots, o) => {
      if (o === 1) return ok(s);
      const out = flagged(
        improvementTo(s, c.id),
        `exempt:${c.id}`,
        s.day + D.exemptDays
      );
      return ok(
        drivers(c).reduce((acc, id) => marketBy(acc, id, -D.exemptCost), out)
      );
    },
  },
];

const BY_ID = new Map(DILEMMAS.map((d) => [d.id, d]));
export const dilemma = (id: string): Dilemma | null => BY_ID.get(id) ?? null;
