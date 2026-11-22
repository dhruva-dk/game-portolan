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
  ShipPaper,
  SponsorsPaper,
} from '../office/papers.ts';
import type { Act } from '../office/people.ts';
import type { Check } from './command.ts';
import { component, TYPES } from './components.ts';
import { designCheck, projection } from './design.ts';
import {
  buildCheck,
  buildCost,
  buildDays,
  designSlots,
  upkeepAt,
} from './hq.ts';
import { render } from './mail.ts';
import { perRace } from './money.ts';
import {
  BUILT,
  NEWS,
  PARTS,
  championship,
  dateAt,
  short,
  span,
} from './office.ts';
import { dilemmaView, fixtures } from './read.ts';
import { signCheck } from './sponsors.ts';
import type { CareerState, Objective, Sponsor } from './state.ts';
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
    subject: l.subject,
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
            body: render(s, mail).body,
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

/** The finances. */
export function financesPaper(s: CareerState): FinancesPaper {
  const c = myTeam(s),
    r = perRace(s, c.id);
  return {
    balance: c.balance,
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

/** The headquarters. */
export function hqPaper(s: CareerState): HqPaper {
  const c = myTeam(s);
  return {
    buildings: BUILDINGS.map((b) => {
      const w = c.buildings[b],
        top = TUNING.hq.works[b].cost.length,
        next = Math.min(top, w.level + 1);
      return {
        id: b,
        name: BUILT[b],
        level: w.level,
        top,
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

/** The ship: the design on the drawing board is of `type`, with `picked` its slots' cards (null: none picked). */
export function shipPaper(
  s: CareerState,
  type: PartType,
  picked: readonly (string | null)[]
): ShipPaper {
  const c = myTeam(s),
    me = s.player ? s.people[s.player.person] : null;
  const deals = c.draft?.type === type ? c.draft.deals : [];
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
        ok: c.staff.designer !== null && !d?.redealt && !c.design,
        why:
          c.staff.designer === null
            ? 'The team has no designer.'
            : d?.redealt
              ? 'That slot has had its one redeal.'
              : '',
      },
    };
  });
  const chosen = slots.flatMap((x) => (x.picked ? [x.picked] : []));
  const p = projection(s, c.id, type, chosen);
  return {
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
