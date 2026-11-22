// `career` and `jobs` (Phase C batch 2): the player as a manager (reputation and its rank, marketability, the
// elder's confidence, the record by season, honours, the posts offered), and the elder's letter with the offers when
// sacked or tempted. Pure, read-side.

import type { JobCard, JobsView, CareerView } from '../office-people.ts';
import { marketability } from './effective.ts';
import { standingOf } from './elders.ts';
import { takeCheck } from './jobs.ts';
import type { CareerState } from './state.ts';
import { TUNING } from './tuning.ts';
import { ROLE_NAMES, ageOf, dayText } from './views-gull.ts';
import {
  LEAGUES,
  coinText,
  crewOf,
  faceOf,
  fig,
  line,
  nameOf,
  ordinal,
  rival,
  topBar,
} from './views.ts';

/** A crew's offer of its manager's post, as a card shows it. */
function card(s: CareerState, crew: number, expires: number): JobCard {
  const c = s.crews[crew],
    elder = s.gulls[c.staff.elder],
    no = takeCheck(s, crew);
  const place = standingOf(s, crew),
    of = s.leagues[c.league].standings.length;
  return {
    crew,
    name: c.name,
    league: LEAGUES[c.league],
    colours: c.colours,
    emblem: c.emblem,
    elder: nameOf(elder),
    elderFace: faceOf(s, elder),
    target: ordinal(c.target),
    budget: fig(c.budget, coinText(c.budget), rival('coin', coinText(c.coin)), {
      title: 'Budget',
      lines: [
        line('A season', coinText(c.budget)),
        line('In hand', coinText(c.coin)),
      ],
    }),
    standing: `${ordinal(place)} of ${of}`,
    expires: s.player?.sacked ? 'Until taken' : dayText(s, expires),
    take: { ok: no === null, why: no?.sentence ?? '' },
  };
}

/** `career`. */
export function careerView(s: CareerState): CareerView {
  const p = s.player!,
    me = s.gulls[p.gull],
    c = crewOf(s);
  const managers = s.gulls
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
    if (h.best === 1) honours.push(`S${h.season + 1} · Race won`);
    if (
      next &&
      h.crew === next.crew &&
      h.league !== null &&
      next.league !== null &&
      next.league < h.league
    )
      honours.push(`S${h.season + 1} · Promoted`);
  });
  return {
    top: topBar(s),
    face: faceOf(s, me),
    name: nameOf(me),
    crew: c.name,
    age: ageOf(s, me),
    reputation: fig(
      Math.round(p.reputation),
      String(Math.round(p.reputation)),
      rival('best rival', String(Math.round(best))),
      {
        title: 'Reputation',
        lines: [
          line('Now', Math.round(p.reputation)),
          line('League One posts at', TUNING.elder.jobs[0]),
          line('League Two posts at', TUNING.elder.jobs[1]),
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
      rival('sacked under', String(TUNING.elder.verdict)),
      {
        title: "Elder's confidence",
        lines: [
          line('Now', Math.round(c.confidence)),
          line('Target place', ordinal(c.target)),
          line('Sacked under', TUNING.elder.verdict),
        ],
      }
    ),
    record: [...lines]
      .reverse()
      .map((h) => ({
        season: `S${h.season + 1}`,
        crew: h.crew === null ? 'Free' : s.crews[h.crew].name,
        league: h.league === null ? '—' : LEAGUES[h.league],
        role: ROLE_NAMES[h.role],
        races: h.races,
        points: h.points,
      })),
    honours,
    offers: p.offers.map((o) => card(s, o.crew, o.expires)),
  };
}

/** `jobs`: sacked, the old crew's elder writes; tempted, the first offering crew's. */
export function jobsView(s: CareerState): JobsView {
  const p = s.player!,
    offers = p.offers.map((o) => card(s, o.crew, o.expires));
  const from = p.sacked
    ? s.crews[p.crew]
    : s.crews[p.offers[0]?.crew ?? p.crew];
  const elder = s.gulls[from.staff.elder];
  return {
    sacked: p.sacked,
    letter: {
      from: `${nameOf(elder)}, elder of ${from.name}`,
      face: faceOf(s, elder),
      title: p.sacked ? 'You are dismissed' : `${from.name} wants you`,
      paragraphs: p.sacked
        ? [`Your time at ${from.name} is over.`]
        : [`The post is yours if you take it.`],
    },
    offers,
  };
}
