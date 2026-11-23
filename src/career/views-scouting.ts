// `market`: every person of a role the filter lets through, as the player's team sees them, the
// shortlist, and the scouts at work with the crow's nest that sets how many there may be. Pure, read-side.

import type { Role } from '../office/command.ts';
import type {
  ScoutingFilter,
  ScoutingRow,
  ScoutingView,
  ScoutRow,
} from '../office/people.ts';
import { closing } from './contracts.ts';
import { effective } from './effective.ts';
import { championship } from './office.ts';
import { tierOf } from './knowledge.ts';
import { askOf } from './market.ts';
import type { Person } from './roles.ts';
import { inReach } from './staff.ts';
import { stars } from './stars.ts';
import type { CareerState, Team } from './state.ts';
import {
  ROLE_NAMES,
  ageOf,
  dayText,
  openPosts,
  seen,
  whereText,
} from './views-person.ts';
import { myTeam, faceOf, fig, line, nameOf, rival, topBar } from './views.ts';
import { inRole } from './roles.ts';
import { moneyText } from './names.ts';

/** The roles a market lists (managers and chairmen are hired by chairmen, not offered contracts). */
const ROLES: readonly Role[] = [
  'driver',
  'mechanic',
  'designer',
  'scout',
  'pit',
];

/** The filter a market opens on: the first open post's role, else drivers. */
function defaultFilter(s: CareerState): ScoutingFilter {
  return {
    role: openPosts(myTeam(s))[0]?.role ?? 'driver',
    tier: null,
    contract: 'any',
    known: false,
    stars: 0,
  };
}

/** Whether a person passes a filter, as a team sees them. */
function passes(
  s: CareerState,
  c: Team,
  g: Person,
  f: ScoutingFilter
): boolean {
  if (
    g.role !== f.role ||
    g.retired !== null ||
    g.player ||
    g.contract?.team === c.id
  )
    return false;
  const tier = tierOf(s, g);
  if (f.tier !== null && (f.tier === 3 ? tier !== null : tier !== f.tier))
    return false;
  if (f.contract === 'free' && g.contract) return false;
  if (f.contract === 'closing' && (!g.contract || !closing(s, g.contract)))
    return false;
  const v = seen(s, c.id, g.id);
  if (f.known && !v.known) return false;
  return v.stars.hi >= f.stars;
}

/** A person as the market lists them. */
function row(s: CareerState, c: Team, g: Person): ScoutingRow {
  const v = seen(s, c.id, g.id),
    talk = s.talks.find((t) => t.team === c.id && t.person === g.id);
  return {
    id: g.id,
    face: faceOf(s, g),
    name: nameOf(g),
    age: ageOf(s, g),
    stars: v.stars,
    potential: v.potential,
    team: whereText(s, g).team,
    contract: !g.contract
      ? 'Free'
      : g.contract.ends === null
        ? 'Open'
        : `S${g.contract.ends + 1}${closing(s, g.contract) ? ' · ending' : ''}`,
    ask: moneyText(askOf(s, g, c).wage),
    talk: talk
      ? talk.counter
        ? 'Countered'
        : `Answer ${dayText(s, talk.answer)}`
      : s.day < g.silentUntil
        ? 'Silent'
        : null,
  };
}

const reachText = (r: number) =>
  inReach(r, 0, 2)
    ? 'All championships'
    : inReach(r, 0, 1)
      ? 'Next tier'
      : 'Own tier';

/** `market` on a filter (null: the default) with the session's shortlist. */
export function scoutingView(
  s: CareerState,
  filter: ScoutingFilter | null,
  shortlist: readonly number[]
): ScoutingView {
  const c = myTeam(s),
    f = filter ?? defaultFilter(s);
  const rows = s.people
    .filter((g) => passes(s, c, g, f))
    .map((g) => row(s, c, g))
    .sort(
      (a, b) =>
        b.stars.hi + b.stars.lo - (a.stars.hi + a.stars.lo) ||
        a.name.localeCompare(b.name)
    );
  const scouts: ScoutRow[] = c.staff.scouts.map((id) => {
    const g = inRole(s.people[id], 'scout'),
      job = s.scouting.find((x) => x.scout === id) ?? null;
    const left = job ? Math.max(0, job.done - s.day) : 0;
    return {
      id,
      face: faceOf(s, g),
      name: nameOf(g),
      stars: Math.round(stars(g) * 2) / 2,
      reach: reachText(effective(g, null).reach),
      on: job
        ? { person: job.person, name: nameOf(s.people[job.person]) }
        : null,
      days: job
        ? fig(left, `${left}d`, rival('report', dayText(s, job.done)), {
            title: 'Scouting',
            lines: [
              line('Sent', dayText(s, job.started)),
              line('Report', dayText(s, job.done)),
            ],
          })
        : null,
      cancel: { ok: job !== null, why: job ? '' : 'Idle.' },
    };
  });
  const nest = c.buildings.crowsNest.level;
  return {
    top: topBar(s),
    filter: f,
    roles: ROLES.map((r) => ({ id: r, label: ROLE_NAMES[r] })),
    tiers: [0, 1, 2].map(championship),
    rows,
    count: `${rows.length}`,
    shortlist: shortlist
      .filter((id) => s.people[id] && !s.people[id].retired)
      .map((id) => row(s, c, s.people[id])),
    scouts,
    nest: fig(
      nest,
      `Level ${nest}`,
      rival('scouts', `${c.staff.scouts.length} of ${nest}`),
      {
        title: "Crow's nest",
        lines: [
          line('Level', nest),
          line('Scouts allowed', nest),
          line('Scouts hired', c.staff.scouts.length),
        ],
      }
    ),
  };
}
