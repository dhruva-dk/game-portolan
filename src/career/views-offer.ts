// `offer` (Phase C batch 2): the contract document drawn on a draft, what it costs, how it meets the person's wants,
// their patience, the talks so far and who else is talking to them, and where the talk stands. Pure, read-side.

import type { Offer, Status } from '../office/command.ts';
import type { Act, OfferView } from '../office/people.ts';
import { breakCost, dismissalCost } from './contracts.ts';
import { offerCheck } from './hiring.ts';
import { askOf, satisfied } from './market.ts';
import { statuses } from './seats.ts';
import type { CareerState } from './state.ts';
import { TUNING } from './tuning.ts';
import {
  ROLE_NAMES,
  WANT_NAMES,
  dayText,
  seen,
  wageText,
} from './views-person.ts';
import { askOffer, defaultPerson } from './views-profile.ts';
import { myTeam, faceOf, fig, line, nameOf, rival, topBar } from './views.ts';
import { moneyText } from './names.ts';

const act = (why: string | null | undefined): Act => ({
  ok: !why,
  why: why ?? '',
});
const STATUS: Readonly<Record<Status, string>> = {
  ship: 'A ship',
  reserve: 'Reserve',
  staff: 'Staff',
};
const ANSWERS: Readonly<Record<string, string>> = {
  accepted: 'Accepted',
  refused: 'Refused',
  counter: 'Countered',
  silent: 'Walked away',
  signedElsewhere: 'Signed elsewhere',
  lapsedPost: 'Post gone',
  counterLapsed: 'Counter lapsed',
};

/** `offer` to a person (null: the default) on a draft (null: the counter, the last offer, else their ask). */
export function offerView(
  s: CareerState,
  person: number | null,
  draft: Offer | null
): OfferView {
  const c = myTeam(s),
    id = person ?? defaultPerson(s, c),
    g = s.people[id];
  const talk = s.talks.find((t) => t.team === c.id && t.person === id) ?? null;
  const ask = askOf(s, g, c),
    v = seen(s, c.id, id);
  const d = draft ?? talk?.counter ?? talk?.offer ?? askOffer(s, c, g);
  const breaking = breakCost(s, g, c.id),
    leaving = d.replaces === null ? 0 : dismissalCost(s, s.people[d.replaces]);
  const now = d.fee + breaking + leaving,
    left = c.balance - now;
  const met = satisfied(s, g, c, d);
  const letters = s.mail.filter(
    (m) => m.category === 'market' && m.slots.person === id && m.kind in ANSWERS
  );
  const signedNow =
    g.contract?.team === c.id &&
    talk === null &&
    (letters.some(
      (m) => m.kind === 'accepted' && m.day >= (g.contract?.signed ?? Infinity)
    ) ||
      (g.contract?.signed === s.day && s.day > (s.calendar?.start ?? 0)));
  const silent = s.day < g.silentUntil;
  const state = signedNow
    ? 'signed'
    : silent
      ? 'silent'
      : talk && talk.counter === null
        ? 'waiting'
        : talk?.counter
          ? 'countered'
          : 'open';
  const stateText = {
    signed: 'Signed',
    silent: `Silent until ${dayText(s, g.silentUntil)}`,
    waiting: `Answer on ${dayText(s, talk?.answer ?? s.day)}`,
    countered: 'Countered',
    open: 'Draft',
  }[state];
  const check = offerCheck(s, c.id, id, d);
  const locked =
    state === 'signed'
      ? 'Signed.'
      : state === 'silent'
        ? stateText + '.'
        : state === 'waiting'
          ? stateText + '.'
          : null;
  const mineRoles = (r: string) =>
    [
      ...c.staff.ships.map((h) => h.driver),
      c.staff.reserve,
      ...c.staff.ships.map((h) => h.mechanic),
      c.staff.designer,
      ...c.staff.scouts,
      ...c.staff.pit,
    ].filter((x): x is number => x !== null && s.people[x].role === r);
  const renewal = g.contract?.team === c.id;
  return {
    top: topBar(s),
    id,
    name: nameOf(g),
    face: faceOf(s, g),
    role: g.role,
    roleName: ROLE_NAMES[g.role],
    stars: v.stars,
    team: c.name,
    draft: d,
    ask,
    statuses: statuses(g.role).map((x) => ({ id: x, label: STATUS[x] })),
    replaces: renewal
      ? [{ id: null, label: 'None' }]
      : [
          { id: null, label: 'Open post' },
          ...mineRoles(g.role).map((x) => ({
            id: x,
            label: nameOf(s.people[x]),
          })),
        ],
    most: {
      wage: Math.max(10, ask.wage * 3),
      fee: Math.max(10, ask.fee * 3),
      bonus: Math.max(10, ask.wage),
      breakClause: Math.max(100, ask.wage * 40),
    },
    cost: {
      now: fig(
        now,
        moneyText(now),
        rival('their ask', moneyText(renewal ? 0 : ask.fee)),
        {
          title: 'Cost to sign',
          lines: [
            line('Signing fee', moneyText(d.fee)),
            line('Break clause', moneyText(breaking)),
            line('Owed the one replaced', moneyText(leaving)),
          ],
        }
      ),
      perRace: fig(
        d.wage,
        wageText(d.wage),
        rival('asks', wageText(ask.wage)),
        {
          title: 'A race',
          lines: [
            line('Wage', moneyText(d.wage)),
            line('Podium bonus', moneyText(d.podium)),
            line('Sinking bonus', moneyText(d.sinking)),
          ],
        }
      ),
      left: fig(left, moneyText(left), rival('floor', moneyText(c.debtFloor)), {
        title: 'Balance left',
        lines: [
          line('Balance', moneyText(c.balance)),
          line('Cost to sign', `−${moneyText(now)}`),
        ],
      }),
    },
    wants: v.known
      ? g.wants.map((w) => ({
          want: w,
          label: WANT_NAMES[w],
          value: Math.min(1, met[w] / 1.2),
          text: `${Math.round(met[w] * 100)}%`,
        }))
      : [],
    patience: { left: Math.max(0, g.patience), of: TUNING.market.patienceMost },
    last: letters.length ? ANSWERS[letters[letters.length - 1].kind] : null,
    earlier: letters
      .slice(-4)
      .reverse()
      .map((m) => ({ day: dayText(s, m.day), answer: ANSWERS[m.kind] })),
    rivals: s.talks
      .filter((t) => t.person === id && t.team !== c.id)
      .map((t) => s.teams[t.team].name),
    counter: talk?.counter ?? null,
    state,
    stateText,
    send: act(locked ?? check?.sentence),
    accept: act(locked ?? (talk?.counter ? null : 'No counter.')),
    withdraw: act(
      state === 'signed' ? 'Signed.' : talk ? null : 'No offer out.'
    ),
  };
}
