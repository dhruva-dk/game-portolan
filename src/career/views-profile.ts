// `profile` (Phase C batch 2): any gull of any role, as the player's crew sees them: their stars (ranges until known),
// traits, morale and marketability, wants once scouted, stats with which way they head, the role's own figures, the
// history, the contract, and what the player may do (scout, offer, renew, dismiss), each with why not. Pure.

import type { Offer } from '../office.ts';
import type { Act, ProfileView, StatLine } from '../office-people.ts';
import { closing, dismissalCost, racesLeft } from './contracts.ts';
import { effective, marketability } from './effective.ts';
import { offerCheck } from './hiring.ts';
import { askOf } from './market.ts';
import { TUNING } from './tuning.ts';
import type { Gull, GullOf } from './roles.ts';
import { scoutCheck, scoutingDays } from './scouting.ts';
import { seatOf, seatRole } from './seats.ts';
import { JOBS, mendingFactor, rating, repairsFactor } from './service.ts';
import {
  designSpeed,
  feedbackPoints,
  innovationChance,
  starWidth,
} from './staff.ts';
import { age } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import { trait } from './traits.ts';
import {
  JOB_NAMES,
  ROLE_NAMES,
  WANT_NAMES,
  endsText,
  heading,
  postOf,
  seen,
  statName,
  wageText,
  whereText,
} from './views-gull.ts';
import {
  LEAGUES,
  coinText,
  crewOf,
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

/** The gull a profile or offer opens on when none is named: the first in talks, else ship two's captain. */
export function defaultGull(s: CareerState, c: Crew): number {
  return (
    s.talks.find((t) => t.crew === c.id)?.gull ??
    c.staff.ships[1].captain ??
    c.staff.elder
  );
}

/** The offer a crew would make a gull at their ask: their post if theirs (a renewal), else an open one. */
export function askOffer(s: CareerState, c: Crew, g: Gull): Offer {
  const ask = askOf(s, g, c),
    mine = g.contract?.crew === c.id;
  const seat = mine ? seatOf(c, g.id, (id) => s.gulls[id].job) : null;
  const status = seat
    ? seatRole(seat).status
    : g.role === 'captain'
      ? c.staff.ships[1].captain === null
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

/** The role's own figures. */
function specifics(
  s: CareerState,
  g: Gull
): { label: string; figure: ReturnType<typeof fig> }[] {
  const st = effective(g as GullOf<typeof g.role>, null) as Readonly<
    Record<string, number>
  >;
  const one = (
    label: string,
    v: number,
    text: string,
    against: string,
    lines: [string, string | number][]
  ) => ({
    label,
    figure: fig(v, text, rival('average', against), {
      title: label,
      lines: lines.map(([a, b]) => line(a, b)),
    }),
  });
  switch (g.role) {
    case 'captain':
      return [
        one(
          'Feedback a race',
          feedbackPoints(st.feedback),
          feedbackPoints(st.feedback).toFixed(1),
          feedbackPoints(10).toFixed(1),
          [['Feedback', st.feedback]]
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
    case 'bosun':
      return [
        one(
          'Repairs',
          repairsFactor(st.repairs),
          `×${repairsFactor(st.repairs).toFixed(2)}`,
          `×${repairsFactor(10).toFixed(2)}`,
          [['Repairs', st.repairs]]
        ),
        one(
          'Mending',
          mendingFactor(st.mending),
          `×${mendingFactor(st.mending).toFixed(2)}`,
          `×${mendingFactor(10).toFixed(2)}`,
          [['Mending', st.mending]]
        ),
      ];
    case 'shipwright':
      return [
        one(
          'Design speed',
          designSpeed(st.speed),
          `×${designSpeed(st.speed).toFixed(2)}`,
          `×${designSpeed(10).toFixed(2)}`,
          [['Speed', st.speed]]
        ),
        one(
          'Innovation',
          innovationChance(st.innovation),
          pct(innovationChance(st.innovation)),
          pct(innovationChance(10)),
          [['Innovation', st.innovation]]
        ),
      ];
    case 'scout':
      return [
        one(
          'Star range',
          starWidth(st.judgement),
          `±${(starWidth(st.judgement) / 2).toFixed(1)}`,
          `±${(starWidth(10) / 2).toFixed(1)}`,
          [['Judgement', st.judgement]]
        ),
      ];
    case 'flight': {
      const best = [...JOBS].sort(
        (a, b) =>
          rating(st as GullOf<'flight'>['stats'], b) -
          rating(st as GullOf<'flight'>['stats'], a)
      )[0];
      const r = rating(st as GullOf<'flight'>['stats'], best);
      return [
        one(
          `Best job: ${JOB_NAMES[best]}`,
          r,
          String(Math.round(r * 100)),
          '50',
          JOBS.map((j) => [
            JOB_NAMES[j],
            Math.round(rating(st as GullOf<'flight'>['stats'], j) * 100),
          ])
        ),
      ];
    }
    case 'manager':
      return [
        one(
          'Reputation',
          g.reputation,
          String(Math.round(g.reputation)),
          '50',
          [['Reputation', Math.round(g.reputation)]]
        ),
      ];
    default:
      return [];
  }
}

/** `profile` of a gull (null: the default). */
export function profileView(s: CareerState, gull: number | null): ProfileView {
  const c = crewOf(s),
    id = gull ?? defaultGull(s, c),
    g = s.gulls[id];
  const v = seen(s, c.id, id),
    mine = g.contract?.crew === c.id,
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
  const talk = s.talks.find((t) => t.crew === c.id && t.gull === id) ?? null;
  const busy = s.scouting.find((x) => x.crew === c.id && x.gull === id);
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
    'league',
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
      : g.role === 'elder' || g.role === 'manager'
        ? "Elders and managers are the elder's."
        : g.contract?.ends === null || !closing(s, g.contract!)
          ? `Opens in the contract's last ${TUNING.market.closingDays} days.`
          : (offerNo?.sentence ?? null);
  const owed = dismissalCost(s, g);
  const dismissNo =
    !mine || you
      ? 'Not yours.'
      : g.role === 'elder' || g.role === 'manager'
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
    crew: where.crew,
    league: where.league,
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
    specifics: v.known ? specifics(s, g) : [],
    history: [...g.history]
      .reverse()
      .map((h) => ({
        season: `S${h.season + 1}`,
        crew: h.crew === null ? 'Free' : s.crews[h.crew].name,
        league:
          h.league === null ? '—' : LEAGUES[h.league].replace('League ', 'L'),
        role: ROLE_NAMES[h.role],
        races: h.races,
        best: h.best === null ? '—' : String(h.best),
        points: h.points,
        sinkings: h.sinkings,
      })),
    contract: k && {
      title: `${ROLE_NAMES[g.role]}, ${where.crew}`,
      terms: [
        line('Post', postOf(s, g)),
        line('Wage', wageText(k.wage)),
        line('Ends', endsText(s, g)),
        line('Podium bonus', coinText(k.podium)),
        line('Sinking bonus', coinText(k.sinking)),
        line(
          'Break clause',
          k.breakClause === null ? 'None' : coinText(k.breakClause)
        ),
      ],
      parties: [where.crew, nameOf(g)],
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
        coinText(owed),
        rival('wage a race', coinText(k?.wage ?? 0)),
        {
          title: 'Owed on dismissal',
          lines: [
            line('Wage a race', coinText(k?.wage ?? 0)),
            line('Races left', racesLeft(s)),
          ],
        }
      ),
    },
  };
}
