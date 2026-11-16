// `market` (Phase C batch 2): every gull of a role the filter lets through, as the player's crew sees them, the
// shortlist, and the scouts at work with the crow's nest that sets how many there may be. Pure, read-side.

import type { Role } from '../office.ts';
import type { MarketFilter, MarketRow, MarketView, ScoutRow } from '../office-people.ts';
import { closing } from './contracts.ts';
import { effective } from './effective.ts';
import { leagueOf } from './knowledge.ts';
import { askOf } from './market.ts';
import type { Gull, GullOf } from './roles.ts';
import { inReach } from './staff.ts';
import { stars } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import { ROLE_NAMES, ageOf, dayText, openPosts, seen, whereText } from './views-gull.ts';
import { coinText, crewOf, faceOf, fig, line, nameOf, rival, topBar } from './views.ts';

/** The roles a market lists (managers and elders are hired by elders, not offered contracts). */
const ROLES: readonly Role[] = ['captain', 'bosun', 'shipwright', 'scout', 'flight'];

/** The filter a market opens on: the first open post's role, else captains. */
export function defaultFilter(s: CareerState): MarketFilter {
  return { role: openPosts(s, crewOf(s))[0]?.role ?? 'captain', league: null, contract: 'any', known: false, stars: 0 };
}

/** Whether a gull passes a filter, as a crew sees them. */
function passes(s: CareerState, c: Crew, g: Gull, f: MarketFilter): boolean {
  if (g.role !== f.role || g.retired !== null || g.player || g.contract?.crew === c.id) return false;
  const league = leagueOf(s, g);
  if (f.league !== null && (f.league === 3 ? league !== null : league !== f.league)) return false;
  if (f.contract === 'free' && g.contract) return false;
  if (f.contract === 'closing' && (!g.contract || !closing(s, g.contract))) return false;
  const v = seen(s, c.id, g.id);
  if (f.known && !v.known) return false;
  return v.stars.hi >= f.stars;
}

/** A gull as the market lists them. */
function row(s: CareerState, c: Crew, g: Gull): MarketRow {
  const v = seen(s, c.id, g.id), talk = s.talks.find((t) => t.crew === c.id && t.gull === g.id);
  return {
    id: g.id, face: faceOf(s, g), name: nameOf(g), age: ageOf(s, g), stars: v.stars, potential: v.potential,
    crew: whereText(s, g).crew, contract: !g.contract ? 'Free' : g.contract.ends === null ? 'Open' : `S${g.contract.ends + 1}${closing(s, g.contract) ? ' · ending' : ''}`,
    ask: coinText(askOf(s, g, c).wage),
    talk: talk ? (talk.counter ? 'Countered' : `Answer ${dayText(s, talk.answer)}`) : s.day < g.silentUntil ? 'Silent' : null,
  };
}

const reachText = (r: number) => (inReach(r, 0, 2) ? 'All leagues' : inReach(r, 0, 1) ? 'Next league' : 'Own league');

/** `market` on a filter (null: the default) with the session's shortlist. */
export function marketView(s: CareerState, filter: MarketFilter | null, shortlist: readonly number[]): MarketView {
  const c = crewOf(s), f = filter ?? defaultFilter(s);
  const rows = s.gulls.filter((g) => passes(s, c, g, f)).map((g) => row(s, c, g))
    .sort((a, b) => b.stars.hi + b.stars.lo - (a.stars.hi + a.stars.lo) || a.name.localeCompare(b.name));
  const scouts: ScoutRow[] = c.staff.scouts.map((id) => {
    const g = s.gulls[id] as GullOf<'scout'>, job = s.scouting.find((x) => x.scout === id) ?? null;
    const left = job ? Math.max(0, job.done - s.day) : 0;
    return {
      id, face: faceOf(s, g), name: nameOf(g), stars: Math.round(stars(g) * 2) / 2, reach: reachText(effective(g, null).reach),
      on: job ? nameOf(s.gulls[job.gull]) : null,
      days: job ? fig(left, `${left}d`, rival('report', dayText(s, job.done)), { title: 'Scouting', lines: [line('Sent', dayText(s, job.started)), line('Report', dayText(s, job.done))] }) : null,
      cancel: { ok: job !== null, why: job ? '' : 'Idle.' },
    };
  });
  const nest = c.buildings.crowsNest.level;
  return {
    top: topBar(s), filter: f, roles: ROLES.map((r) => ({ id: r, label: ROLE_NAMES[r] })),
    rows, count: `${rows.length}`,
    shortlist: shortlist.filter((id) => s.gulls[id] && !s.gulls[id].retired).map((id) => row(s, c, s.gulls[id])),
    scouts,
    nest: fig(nest, `Level ${nest}`, rival('scouts', `${c.staff.scouts.length} of ${nest}`),
      { title: "Crow's nest", lines: [line('Level', nest), line('Scouts allowed', nest), line('Scouts hired', c.staff.scouts.length)] }),
  };
}
