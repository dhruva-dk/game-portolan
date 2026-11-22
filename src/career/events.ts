// The twelve dilemmas (Phase B section 12), as data: each a trigger the career can evaluate for a crew (the slots of
// its mail if it holds, else null), its options, what each option does, and which option each personality of rival
// manager takes. Their words are career/mail.ts's (the dilemma's id is its mail kind). Drawing and answering them is
// career/dilemmas.ts's.

import type { MailCategory, Offer, Personality } from '../office.ts';
import type { PartType } from '../race.ts';
import { askWage } from './asks.ts';
import { canSpend, paid } from './coin.ts';
import { why, type Check } from './command.ts';
import { TYPES } from './components.ts';
import type { Rand } from './dice.ts';
import { standingOf } from './elders.ts';
import { flag, flagged, nextRace, unflagged } from './flags.ts';
import { signableCheck } from './hiring.ts';
import { learned } from './knowledge.ts';
import { moraleIn } from './morale.ts';
import { signed } from './contracts.ts';
import { bondLevel, fatigueOn } from './service.ts';
import { age, potential } from './stars.ts';
import {
  staffOf,
  type CareerState,
  type Crew,
  type Mail,
  type Part,
} from './state.ts';
import { TUNING } from './tuning.ts';
import { yardTo } from './yard.ts';

const D = TUNING.dilemmas;
type Slots = Mail['slots'];

/** What an answer comes to: the new state, or why the option cannot be taken. */
export type Answer = { state: CareerState } | { no: NonNullable<Check> };

export interface Dilemma {
  id: string;
  category: MailCategory;
  elder: boolean; // drawn by the elder's Meddling
  options: readonly string[]; // the last is taken when the player lets it lapse
  trigger: (s: CareerState, c: Crew, rand: Rand) => Slots | null;
  answer: (s: CareerState, c: Crew, slots: Slots, option: number) => Answer;
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

/** A state with a gull changed by a function. */
function gullSet(
  s: CareerState,
  id: number,
  f: (g: CareerState['gulls'][number]) => CareerState['gulls'][number]
): CareerState {
  const gulls = [...s.gulls];
  gulls[id] = f(gulls[id]);
  return { ...s, gulls };
}
const moraleBy = (s: CareerState, id: number, by: number) =>
  gullSet(s, id, (g) => ({ ...g, morale: moraleIn(g.morale + by) }));
const marketBy = (s: CareerState, id: number, by: number) =>
  gullSet(s, id, (g) => ({
    ...g,
    marketability: Math.min(100, Math.max(0, g.marketability + by)),
  }));
function crewSet(
  s: CareerState,
  crew: number,
  f: (c: Crew) => Crew
): CareerState {
  const crews = [...s.crews];
  crews[crew] = f(crews[crew]);
  return { ...s, crews };
}
/** Coin spent on an answer, if the elder allows it. */
const spend = (
  s: CareerState,
  crew: number,
  coin: number,
  what: string
): Answer =>
  canSpend(s.crews[crew], coin)
    ? ok(paid(s, crew, coin, { kind: 'dilemma', what }))
    : no('coin', 'The elder will not let the coin fall that low.');
/** The crew's two ships' captains. */
const captains = (c: Crew): number[] =>
  c.staff.ships.map((h) => h.captain).filter((x): x is number => x !== null);
const N = (x: string | number | undefined): number => Number(x);

/** The ship-one parts of a crew by type. */
const shipOne = (c: Crew): Map<PartType, Part> =>
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
const replaced = (c: Crew, parts: readonly Part[]): Crew => ({
  ...c,
  parts: c.parts.map((p) => parts.find((q) => q.id === p.id) ?? p),
});

export const DILEMMAS: readonly Dilemma[] = [
  {
    id: 'riseAsk',
    category: 'crew',
    elder: false,
    options: ['pay', 'refuse', 'promise'],
    rival: [0, 2, 0, 2, 1, 2],
    trigger: (s, c) => {
      const g = staffOf(c)
        .map((id) => s.gulls[id])
        .filter(
          (x) =>
            !x.player &&
            x.role !== 'elder' &&
            x.role !== 'manager' &&
            x.morale < D.low &&
            x.contract !== null &&
            x.contract.ends !== null &&
            x.contract.ends > s.season
        )
        .sort((a, b) => a.morale - b.morale || a.id - b.id)[0];
      return g ? { gull: g.id } : null;
    },
    answer: (s, _c, slots, o) => {
      const id = N(slots.gull);
      if (o === 1) return ok(moraleBy(s, id, D.refuse));
      return ok(
        gullSet(s, id, (g) =>
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
    elder: false,
    options: ['give', 'hold'],
    rival: [1, 1, 1, 1, 1, 1],
    trigger: (s, c) => {
      const when = flag(s, `newPart:${c.id}`),
        captain = c.staff.ships[1].captain;
      const type = TYPES.find((t) => c.lastNew[t] === 0);
      return when !== null &&
        when >= s.day - TUNING.calendar.gap &&
        captain !== null &&
        type
        ? { gull: captain, type }
        : null;
    },
    answer: (s, c, slots, o) => {
      const out = unflagged(s, `newPart:${c.id}`);
      if (o === 1) return ok(moraleBy(out, N(slots.gull), D.argueLost));
      const a = c.parts.find((p) => p.ship === 0 && p.type === slots.type),
        b = c.parts.find((p) => p.ship === 1 && p.type === slots.type);
      if (!a || !b) return no('part', 'The part is no longer fitted.');
      const moved = crewSet(out, c.id, (x) => ({
        ...replaced(x, [
          { ...a, ship: 1 },
          { ...b, ship: 0 },
        ]),
        lastNew: { ...x.lastNew, [a.type]: 1 },
      }));
      return ok(moraleBy(moved, N(slots.gull), D.argue));
    },
  },
  {
    id: 'bondFallOut',
    category: 'crew',
    elder: false,
    options: ['swap', 'dinner', 'leave'],
    rival: [1, 2, 2, 0, 0, 2],
    trigger: (s, c) => {
      // a bond gains 1 to 2 a race, so after five races every pair is past level 1's 5 points: the pair that falls out
      // is one still short of level 2 (docs/decisions.md)
      if (s.round < 5) return null;
      const k = c.staff.ships.findIndex(
        (h, i) =>
          h.bosun !== null && h.captain !== null && bondLevel(c.bonds[i]) <= 1
      );
      return k < 0
        ? null
        : {
            ship: k,
            bosun: c.staff.ships[k].bosun!,
            gull: c.staff.ships[k].captain!,
          };
    },
    answer: (s, c, slots, o) => {
      const k = N(slots.ship);
      if (o === 0) {
        const [a, b] = c.staff.ships;
        if (a.bosun === null || b.bosun === null)
          return no('bosun', 'Both ships need a bosun to swap them.');
        return ok(
          crewSet(s, c.id, (x) => ({
            ...x,
            bonds: [0, 0],
            staff: {
              ...x.staff,
              ships: [
                { ...a, bosun: b.bosun },
                { ...b, bosun: a.bosun },
              ],
            },
          }))
        );
      }
      if (o === 2) return ok(s);
      const spent = spend(s, c.id, D.dinner, 'dinner for a quarrel');
      if ('no' in spent) return spent;
      return ok(
        crewSet(spent.state, c.id, (x) => ({
          ...x,
          bonds: [
            x.bonds[0] + (k === 0 ? D.dinnerBond : 0),
            x.bonds[1] + (k === 1 ? D.dinnerBond : 0),
          ],
        }))
      );
    },
  },
  {
    id: 'greyComponent',
    category: 'ship',
    elder: false,
    options: ['take', 'refuse', 'report'],
    rival: [0, 1, 0, 0, 0, 2],
    trigger: (s, c) =>
      c.design !== null &&
      c.staff.shipwright !== null &&
      flag(s, `grey:${c.id}`) !== c.design.started
        ? { gull: c.staff.shipwright, type: c.design.type }
        : null,
    answer: (s, c, _slots, o) => {
      if (c.design === null) return no('design', 'The design is finished.');
      const out = flagged(s, `grey:${c.id}`, c.design.started);
      if (o === 1) return ok(out);
      if (o === 2)
        return ok(
          captains(c).reduce((acc, id) => marketBy(acc, id, D.report), out)
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
        crewSet(out, c.id, (x) => ({
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
    id: 'patronGuest',
    category: 'finance',
    elder: false,
    options: ['agree', 'decline'],
    rival: [0, 1, 0, 1, 0, 1],
    trigger: (s, c) => {
      const p = c.patrons.find((x) => x !== null && x.objectives.length === 0);
      return p && nextRace(s) !== null
        ? { patron: p.id, name: p.name, coin: p.perRace }
        : null;
    },
    answer: (s, c, slots, o) => {
      if (o === 0)
        return ok(
          flagged(
            paid(s, c.id, -N(slots.coin), {
              kind: 'patron',
              what: `${slots.name}'s guest`,
            }),
            `guest:${c.id}`,
            nextRace(s) ?? s.day
          )
        );
      return ok(
        crewSet(s, c.id, (x) => ({
          ...x,
          patrons: x.patrons.map((p) =>
            p && p.id === N(slots.patron)
              ? { ...p, races: Math.max(1, p.races - 1) }
              : p
          ),
        }))
      );
    },
  },
  {
    id: 'flightWorn',
    category: 'crew',
    elder: false,
    options: ['rest', 'push', 'cover'],
    rival: [2, 0, 1, 0, 1, 0],
    // the fatigue the last race left them (a race adds at most ~49 and the days between take 140 or more, so "above 75"
    // never holds of fatigue now; docs/decisions.md)
    trigger: (s, c) => {
      const g = c.staff.flight
        .map((id) => s.gulls[id])
        .find((x) => x.fatigue > D.worn);
      return g && nextRace(s) !== null
        ? { gull: g.id, job: g.job ?? 'mend' }
        : null;
    },
    answer: (s, c, slots, o) => {
      const id = N(slots.gull),
        race = nextRace(s) ?? s.day;
      if (o === 1) return ok(flagged(s, `push:${id}`, race));
      if (o === 0) {
        const loft = c.buildings.flightLoft.level;
        const rested = gullSet(s, id, (g) => ({
          ...g,
          fatigue: Math.max(0, fatigueOn(g, s.day, loft) - D.restFatigue),
          fatigueDay: s.day,
        }));
        return ok(flagged(rested, `rest:${id}`, race));
      }
      const spent = spend(s, c.id, D.cover, 'cover for the flight');
      return 'no' in spent
        ? spent
        : ok(flagged(spent.state, `cover:${id}`, race));
    },
  },
  {
    id: 'partSwap',
    category: 'ship',
    elder: false,
    options: ['swap', 'decline'],
    rival: [1, 1, 1, 1, 1, 1],
    trigger: (s, c, rand) => {
      const spec = new Set(s.leagues[c.league].rules.spec);
      const mineOf = shipOne(c);
      const others = s.leagues[c.league].crews.filter((x) => x !== c.id);
      const r = others[Math.floor(rand() * others.length)];
      if (r === undefined) return null;
      const theirs = shipOne(s.crews[r]);
      const types = TYPES.filter(
        (t) => !spec.has(t) && mineOf.has(t) && theirs.has(t)
      );
      const give = types.find((t) => theirs.get(t)!.perf > mineOf.get(t)!.perf),
        take = types.find((t) => mineOf.get(t)!.perf > theirs.get(t)!.perf);
      return give && take ? { crew: r, give, take } : null;
    },
    answer: (s, c, slots, o) => {
      if (o === 1) return ok(s);
      const r = N(slots.crew);
      let a = yardTo(yardTo(s, c.id), r);
      const ours = shipOne(a.crews[c.id]),
        theirs = shipOne(a.crews[r]);
      const types = [slots.give, slots.take] as PartType[];
      if (!types.every((t) => ours.has(t) && theirs.has(t)))
        return no('part', 'The parts are no longer fitted.');
      const pairs = types.map((t) => swapped(ours.get(t)!, theirs.get(t)!));
      a = crewSet(a, c.id, (x) =>
        replaced(
          x,
          pairs.map((p) => p[0])
        )
      );
      return ok(
        crewSet(a, r, (x) =>
          replaced(
            x,
            pairs.map((p) => p[1])
          )
        )
      );
    },
  },
  {
    id: 'pressElder',
    category: 'elder',
    elder: true,
    options: ['back', 'free', 'silent'],
    rival: [0, 0, 1, 2, 1, 2],
    trigger: (_s, c) =>
      c.confidence < D.low && c.staff.manager !== null ? { crew: c.id } : null,
    answer: (s, c, _slots, o) => {
      if (o === 2 || c.staff.manager === null) return ok(s);
      const by = o === 0 ? D.press : -D.press;
      const out = crewSet(s, c.id, (x) => ({
        ...x,
        confidence: Math.min(100, Math.max(0, x.confidence + by)),
      }));
      return ok(marketBy(out, c.staff.manager, -by));
    },
  },
  {
    id: 'youngTrial',
    category: 'market',
    elder: false,
    options: ['sign', 'scout', 'decline'],
    rival: [2, 0, 1, 2, 0, 1],
    trigger: (s, c, rand) => {
      const young = s.gulls.filter(
        (g) =>
          g.role === 'captain' &&
          g.contract === null &&
          g.retired === null &&
          !g.player &&
          age(g, s.day) < D.trialAge &&
          potential(g) >= D.trialPotential
      );
      const g = young[Math.floor(rand() * young.length)];
      return g && c.staff.reserve === null ? { gull: g.id } : null;
    },
    answer: (s, c, slots, o) => {
      const id = N(slots.gull);
      if (o === 2) return ok(s);
      if (o === 1) return ok(learned(s, c.id, id, null));
      const offer: Offer = {
        role: 'captain',
        status: 'reserve',
        wage: Math.round(askWage(s.gulls[id], c.league) * D.trialWage),
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
        : ok(signed(s, { crew: c.id, gull: id, offer }));
    },
  },
  {
    id: 'stormDamage',
    category: 'rookery',
    elder: false,
    options: ['now', 'slowly'],
    rival: [0, 1, 1, 0, 1, 0],
    trigger: (s, c) =>
      (flag(s, `storm:${c.id}`) ?? -1) < (s.calendar?.start ?? 0)
        ? { building: 'factory', coin: D.repair * c.buildings.factory.level }
        : null,
    answer: (s, c, slots, o) => {
      const out = flagged(s, `storm:${c.id}`, s.day);
      if (o === 0) return spend(out, c.id, N(slots.coin), 'storm repairs');
      return ok(flagged(yardTo(out, c.id), `slow:${c.id}`, s.day + D.slowDays));
    },
  },
  {
    id: 'unfitWantsSail',
    category: 'crew',
    elder: false,
    options: ['let', 'rest'],
    rival: [0, 1, 0, 1, 0, 1],
    trigger: (s, c) => {
      const g = captains(c)
        .concat(c.staff.reserve ?? [])
        .map((id) => s.gulls[id])
        .find((x) => x.unfit === 1);
      return g && nextRace(s) !== null ? { gull: g.id } : null;
    },
    answer: (s, _c, slots, o) => {
      const id = N(slots.gull);
      if (o === 1) return ok(s);
      if (s.gulls[id].unfit !== 1)
        return no('fit', 'They are fit already, or further from it.');
      return ok(
        flagged(
          gullSet(s, id, (g) => ({ ...g, unfit: 0 })),
          `pushed:${id}`,
          nextRace(s) ?? s.day
        )
      );
    },
  },
  {
    id: 'testingExemption',
    category: 'league',
    elder: false,
    options: ['take', 'decline'],
    rival: [0, 0, 0, 0, 0, 1],
    trigger: (s, c) =>
      s.round >= 1 &&
      standingOf(s, c.id) > s.leagues[c.league].crews.length - D.lowest &&
      (flag(s, `exempt:${c.id}`) ?? -1) < s.day
        ? { league: c.league }
        : null,
    answer: (s, c, _slots, o) => {
      if (o === 1) return ok(s);
      const out = flagged(
        yardTo(s, c.id),
        `exempt:${c.id}`,
        s.day + D.exemptDays
      );
      return ok(
        captains(c).reduce((acc, id) => marketBy(acc, id, -D.exemptCost), out)
      );
    },
  },
];

const BY_ID = new Map(DILEMMAS.map((d) => [d.id, d]));
export const dilemma = (id: string): Dilemma | null => BY_ID.get(id) ?? null;
