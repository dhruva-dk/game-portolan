// `career` and `jobs`: the player as a manager (reputation and its rank, marketability, the
// chairman's confidence, the record by season, honours, the posts offered), and the chairman's letter with the offers when
// sacked or tempted. Pure, read-side.

import { known } from './canon.ts';
import type { JobCard, JobsView, CareerView } from '../office/people.ts';
import { marketability } from './effective.ts';
import { standingOf } from './standings.ts';
import { declineCheck, takeCheck } from './jobs.ts';
import { seasonYear } from './office.ts';
import type { CareerState } from './state.ts';
import { TUNING } from './tuning.ts';
import { ROLE_NAMES, ageOf, dayText } from './views-person.ts';
import {
  TIERS,
  myTeam,
  faceOf,
  fig,
  line,
  nameOf,
  rival,
  topBar,
} from './views.ts';
import { moneyText, ordinal } from './names.ts';

/** A team's offer of its manager's post, as a card shows it. */
function card(s: CareerState, team: number, expires: number): JobCard {
  const c = s.teams[team],
    chairman = s.people[c.staff.chairman],
    no = takeCheck(s, team),
    stay = declineCheck(s, team);
  const place = standingOf(s, team),
    of = s.championships[c.tier].standings.length;
  return {
    team,
    name: c.name,
    tier: TIERS[c.tier],
    colours: c.colours,
    emblem: c.emblem,
    chairmanId: chairman.id,
    chairman: nameOf(chairman),
    chairmanFace: faceOf(s, chairman),
    target: ordinal(c.target),
    budget: fig(
      c.budget,
      moneyText(c.budget),
      rival('balance', moneyText(c.balance)),
      {
        title: 'Budget',
        lines: [
          line('A season', moneyText(c.budget)),
          line('In hand', moneyText(c.balance)),
        ],
      }
    ),
    standing: `${ordinal(place)} of ${of}`,
    expires: s.player?.sacked ? 'Until taken' : dayText(s, expires),
    take: { ok: no === null, why: no?.sentence ?? '' },
    decline: { ok: stay === null, why: stay?.sentence ?? '' },
  };
}

/** `career`. */
export function careerView(s: CareerState): CareerView {
  const p = known(s.player),
    me = s.people[p.person],
    c = myTeam(s);
  const managers = s.people
    .filter((g) => g.role === 'manager' && g.retired === null && !g.player)
    .map((g) => g.reputation);
  const above = managers.filter((r) => r > p.reputation).length,
    of = managers.length + 1;
  const reps = [...managers].sort((a, b) => b - a),
    best = reps[0] ?? p.reputation;
  const lines = me.history;
  const honours: string[] = [];
  lines.forEach((h, i) => {
    const next = lines[i + 1];
    if (h.best === 1) honours.push(`${seasonYear(h)} · Race won`);
    if (
      next &&
      h.team === next.team &&
      h.tier !== null &&
      next.tier !== null &&
      next.tier < h.tier
    )
      honours.push(`${seasonYear(h)} · Promoted`);
  });
  return {
    top: topBar(s),
    face: faceOf(s, me),
    name: nameOf(me),
    teamId: c.id,
    team: c.name,
    age: ageOf(s, me),
    reputation: fig(
      Math.round(p.reputation),
      String(Math.round(p.reputation)),
      rival('best rival', String(Math.round(best))),
      {
        title: 'Reputation',
        lines: [
          line('Now', Math.round(p.reputation)),
          line('Tier 1 posts at', TUNING.chairman.jobs[0]),
          line('Tier 2 posts at', TUNING.chairman.jobs[1]),
        ],
      }
    ),
    rank: fig(
      above + 1,
      ordinal(above + 1),
      { kind: 'rank', place: above + 1, of },
      {
        title: 'Rank of managers',
        lines: [line('Above you', above), line('Managers', of)],
      }
    ),
    marketability: fig(
      Math.round(marketability(me)),
      String(Math.round(marketability(me))),
      rival('of', '100'),
      {
        title: 'Marketability',
        lines: [
          line('Raw', Math.round(me.marketability)),
          line('With traits', Math.round(marketability(me))),
        ],
      }
    ),
    confidence: fig(
      Math.round(c.confidence),
      String(Math.round(c.confidence)),
      rival('sacked under', String(TUNING.chairman.verdict)),
      {
        title: "Chairman's confidence",
        lines: [
          line('Now', Math.round(c.confidence)),
          line('Target place', ordinal(c.target)),
          line('Sacked under', TUNING.chairman.verdict),
        ],
      }
    ),
    posts: TIERS.map((tier, i) => {
      const at = TUNING.chairman.jobs[i] ?? 0;
      return { tier, at, open: p.reputation >= at };
    }),
    record: [...lines]
      .reverse()
      .map((h) => ({
        season: String(seasonYear(h)),
        teamId: h.team,
        team: h.team === null ? 'Free' : s.teams[h.team].name,
        tier: h.tier === null ? '—' : TIERS[h.tier],
        role: ROLE_NAMES[h.role],
        races: h.races,
        points: h.points,
      })),
    honours,
    offers: p.offers.map((o) => card(s, o.team, o.expires)),
  };
}

/** `jobs`: sacked, the old team's chairman writes; tempted, the first offering team's. */
export function jobsView(s: CareerState): JobsView {
  const p = known(s.player),
    offers = p.offers.map((o) => card(s, o.team, o.expires));
  const from = p.sacked
    ? s.teams[p.team]
    : s.teams[p.offers[0]?.team ?? p.team];
  const chairman = s.people[from.staff.chairman];
  return {
    sacked: p.sacked,
    letter: {
      from: `${nameOf(chairman)}, chairman of ${from.name}`,
      fromId: chairman.id,
      face: faceOf(s, chairman),
      title: p.sacked ? 'You are dismissed' : `${from.name} wants you`,
      paragraphs: p.sacked
        ? [`Your time at ${from.name} is over.`]
        : [`The post is yours if you take it.`],
    },
    offers,
  };
}
