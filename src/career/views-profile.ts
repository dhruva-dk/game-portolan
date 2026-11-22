// `profile` (Phase C batch 2): any person of any role, as the player's team sees them: their stars (ranges until known),
// traits, morale and marketability, wants once scouted, stats with which way they head, the role's own figures, the
// history, the contract, and what the player may do (scout, offer, renew, dismiss), each with why not. Pure.

import type { Figure, Offer } from '../office.ts';
import type { Act, ProfileView, StatLine } from '../office-people.ts';
import { closing, dismissalCost, racesLeft } from './contracts.ts';
import { effective, marketability } from './effective.ts';
import { offerCheck } from './hiring.ts';
import { askOf } from './market.ts';
import { TUNING } from './tuning.ts';
import type { Person } from './roles.ts';
import { scoutCheck, scoutingDays } from './scouting.ts';
import { openSeat, seatOf, seatRole } from './seats.ts';
import { mendingFactor, repairsFactor, slipOf, work } from './pit.ts';
import {
  designSpeed,
  feedbackPoints,
  innovationChance,
  starWidth,
} from './staff.ts';
import { age } from './stars.ts';
import type { CareerState, Team } from './state.ts';
import { trait } from './traits.ts';
import {
  ROLE_NAMES,
  WANT_NAMES,
  endsText,
  heading,
  postOf,
  seen,
  statName,
  wageText,
  whereText,
} from './views-person.ts';
import {
  TIERS,
  moneyText,
  myTeam,
  faceOf,
  fig,
  line,
  nameOf,
  rival,
  topBar,
} from './views.ts';

const act = (why: string | null | undefined): Act => ({
  ok: !why,
  why: why ?? '',
});
const pct = (x: number) => `${Math.round(x * 100)}%`;
/** A pit crew member's chance of a slip at stats of 10, rested. */
const SLIP_AT_TEN =
  TUNING.pit.slip *
  (1 - (TUNING.pit.steady.precision + TUNING.pit.steady.nerve) / 2);

/** The person a profile or offer opens on when none is named: the first in talks, else the first of its hired drivers. */
export function defaultPerson(s: CareerState, c: Team): number {
  return (
    s.talks.find((t) => t.team === c.id)?.person ??
    c.staff.ships.find((h) => h.driver !== null)?.driver ??
    c.staff.chairman
  );
}

/** The offer a team would make a person at their ask: their post if theirs (a renewal), else an open one. */
export function askOffer(s: CareerState, c: Team, g: Person): Offer {
  const ask = askOf(s, g, c),
    mine = g.contract?.team === c.id;
  const seat = mine ? seatOf(c, g.id) : null;
  const status = seat
    ? seatRole(seat).status
    : g.role === 'driver'
      ? openSeat(c, 'driver', 'ship')
        ? 'ship'
        : 'reserve'
      : 'staff';
  return {
    role: g.role,
    status,
    wage: ask.wage,
    fee: mine ? 0 : ask.fee,
    seasons: ask.seasons,
    podium: 0,
    sinking: 0,
    breakClause: null,
    replaces: null,
  };
}

/** One of a role's own figures, set against what stats of 10 make. */
const one = (
  label: string,
  now: { value: number; text: string },
  against: string,
  lines: [string, string | number][]
) => ({
  label,
  figure: fig(now.value, now.text, rival('average', against), {
    title: label,
    lines: lines.map(([a, b]) => line(a, b)),
  }),
});
const times = (x: number) => ({ value: x, text: `×${x.toFixed(2)}` });

/** The role's own figures. */
function specifics(g: Person): { label: string; figure: Figure }[] {
  switch (g.role) {
    case 'driver': {
      const points = feedbackPoints(effective(g, null).feedback);
      return [
        one(
          'Feedback a race',
          { value: points, text: points.toFixed(1) },
          feedbackPoints(10).toFixed(1),
          [['Feedback', effective(g, null).feedback]]
        ),
        {
          label: 'Fitness',
          figure: fig(
            g.unfit,
            g.unfit ? 'Unfit' : 'Fit',
            rival('misses', g.unfit ? `${g.unfit} races` : 'none'),
            { title: 'Unfit', lines: [line('Races to miss', g.unfit)] }
          ),
        },
      ];
    }
    case 'mechanic': {
      const st = effective(g, null);
      return [
        one(
          'Repairs',
          times(repairsFactor(st.repairs)),
          times(repairsFactor(10)).text,
          [['Repairs', st.repairs]]
        ),
        one(
          'Mending',
          times(mendingFactor(st.mending)),
          times(mendingFactor(10)).text,
          [['Mending', st.mending]]
        ),
      ];
    }
    case 'designer': {
      const st = effective(g, null);
      const chance = innovationChance(st.innovation);
      return [
        one(
          'Design speed',
          times(designSpeed(st.speed)),
          times(designSpeed(10)).text,
          [['Speed', st.speed]]
        ),
        one(
          'Innovation',
          { value: chance, text: pct(chance) },
          pct(innovationChance(10)),
          [['Innovation', st.innovation]]
        ),
      ];
    }
    case 'scout': {
      const width = starWidth(effective(g, null).judgement);
      return [
        one(
          'Star range',
          { value: width, text: `±${(width / 2).toFixed(1)}` },
          `±${(starWidth(10) / 2).toFixed(1)}`,
          [['Judgement', effective(g, null).judgement]]
        ),
      ];
    }
    case 'pit': {
      const st = effective(g, null),
        slip = slipOf(st, 0);
      return [
        one('Work', times(work(st, 0)), times(1).text, [
          ['Speed', st.speed],
          ['Strength', st.strength],
          ['Teamwork', st.teamwork],
        ]),
        one('Slip chance', { value: slip, text: pct(slip) }, pct(SLIP_AT_TEN), [
          ['Precision', st.precision],
          ['Nerve', st.nerve],
        ]),
      ];
    }
    case 'manager':
      return [
        one(
          'Reputation',
          {
            value: g.reputation,
            text: String(Math.round(g.reputation)),
          },
          '50',
          [['Reputation', Math.round(g.reputation)]]
        ),
      ];
    case 'chairman':
      return [];
  }
}

/** `profile` of a person (null: the default). */
export function profileView(
  s: CareerState,
  person: number | null
): ProfileView {
  const c = myTeam(s),
    id = person ?? defaultPerson(s, c),
    g = s.people[id];
  const v = seen(s, c.id, id),
    mine = g.contract?.team === c.id,
    you = g.player;
  const where = whereText(s, g),
    years = age(g, s.day);
  const stats: StatLine[] = v.known
    ? Object.entries(g.stats as Readonly<Record<string, number>>).map(
        ([k, n]) => {
          const ceiling = (g.ceiling as Readonly<Record<string, number>>)[k];
          return {
            label: statName(k),
            value: n,
            ceiling,
            arrow: heading(s, g, n, ceiling),
            text: n.toFixed(0),
          };
        }
      )
    : [];
  const talk = s.talks.find((t) => t.team === c.id && t.person === id) ?? null;
  const busy = s.scouting.find((x) => x.team === c.id && x.person === id);
  const free = c.staff.scouts.filter(
    (x) => !s.scouting.some((y) => y.scout === x)
  );
  const scout = free.find((x) => scoutCheck(s, c.id, x, id) === null) ?? null;
  const scoutWhy = busy
    ? `Scouted by Day ${busy.done - (s.calendar?.start ?? 0) + 1}.`
    : v.known
      ? 'Known.'
      : c.staff.scouts.length === 0
        ? 'No scouts.'
        : free.length === 0
          ? 'Every scout is out.'
          : scout === null
            ? (scoutCheck(s, c.id, free[0], id)?.sentence ?? 'Out of reach.')
            : null;
  const draft = askOffer(s, c, g);
  const offerNo = offerCheck(s, c.id, id, draft);
  const blocks = [
    'silent',
    'waiting',
    'retired',
    'role',
    'contracted',
    'tier',
    'who',
    'leaving',
  ];
  const offerWhy = mine
    ? 'Already yours.'
    : offerNo?.code === 'waiting'
      ? 'Awaiting their answer.'
      : offerNo && blocks.includes(offerNo.code)
        ? offerNo.sentence
        : null;
  const renewWhy =
    !mine || you
      ? 'Not yours to renew.'
      : g.role === 'chairman' || g.role === 'manager'
        ? "Chairmen and managers are the chairman's."
        : g.contract?.ends === null || !closing(s, g.contract!)
          ? `Opens in the contract's last ${TUNING.market.closingDays} days.`
          : (offerNo?.sentence ?? null);
  const owed = dismissalCost(s, g);
  const dismissNo =
    !mine || you
      ? 'Not yours.'
      : g.role === 'chairman' || g.role === 'manager'
        ? 'Not yours to dismiss.'
        : null;
  const k = g.contract;
  return {
    top: topBar(s),
    id,
    known: v.known,
    mine,
    you,
    face: faceOf(s, g),
    name: nameOf(g),
    role: g.role,
    roleName: ROLE_NAMES[g.role],
    age: years,
    colony: s.colonies[g.colony] ?? '',
    team: where.team,
    tier: where.tier,
    post: postOf(s, g),
    stars: v.stars,
    potential: v.potential,
    traits: v.known
      ? g.traits.map((t) => trait(t).name)
      : v.trait
        ? [trait(v.trait).name]
        : [],
    morale:
      v.known && !you
        ? fig(
            Math.round(g.morale),
            String(Math.round(g.morale)),
            rival('leaves under', String(TUNING.morale.leave)),
            {
              title: 'Morale',
              lines: [
                line('Now', Math.round(g.morale)),
                line('Asks to leave under', TUNING.morale.leave),
              ],
            }
          )
        : null,
    marketability: fig(
      Math.round(marketability(g)),
      String(Math.round(marketability(g))),
      rival('of', '100'),
      {
        title: 'Marketability',
        lines: [
          line('Raw', Math.round(g.marketability)),
          line('With traits', Math.round(marketability(g))),
        ],
      }
    ),
    wants: v.known
      ? g.wants.map((w) => ({ want: w, label: WANT_NAMES[w] }))
      : null,
    stats,
    statsNote: v.known ? '' : 'Scout to read',
    specifics: v.known ? specifics(g) : [],
    history: [...g.history]
      .reverse()
      .map((h) => ({
        season: `S${h.season + 1}`,
        team: h.team === null ? 'Free' : s.teams[h.team].name,
        tier:
          h.tier === null ? '—' : TIERS[h.tier].replace('Championship ', 'L'),
        role: ROLE_NAMES[h.role],
        races: h.races,
        best: h.best === null ? '—' : String(h.best),
        points: h.points,
        sinkings: h.sinkings,
      })),
    contract: k && {
      title: `${ROLE_NAMES[g.role]}, ${where.team}`,
      terms: [
        line('Post', postOf(s, g)),
        line('Wage', wageText(k.wage)),
        line('Ends', endsText(s, g)),
        line('Podium bonus', moneyText(k.podium)),
        line('Sinking bonus', moneyText(k.sinking)),
        line(
          'Break clause',
          k.breakClause === null ? 'None' : moneyText(k.breakClause)
        ),
      ],
      parties: [where.team, nameOf(g)],
    },
    talk: talk
      ? talk.counter
        ? `Countered: ${wageText(talk.counter.wage)}`
        : `Answer on Day ${talk.answer - (s.calendar?.start ?? 0) + 1}`
      : null,
    scout: {
      ...act(scoutWhy),
      scout,
      label:
        scout === null
          ? 'Scout'
          : `Scout · ${scoutingDays(s, c.id, scout)} days`,
    },
    offer: act(offerWhy),
    renew: act(renewWhy),
    dismiss: {
      ...act(dismissNo),
      owed: fig(
        owed,
        moneyText(owed),
        rival('wage a race', moneyText(k?.wage ?? 0)),
        {
          title: 'Owed on dismissal',
          lines: [
            line('Wage a race', moneyText(k?.wage ?? 0)),
            line('Races left', racesLeft(s)),
          ],
        }
      ),
    },
  };
}
