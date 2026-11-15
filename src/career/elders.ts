// Elders and the managers' market (Phase B section 7, D22): each elder sets a target at the season's start (Ambition)
// and adds Coin and a debt floor (Generosity); their confidence moves after each race (Patience) and their word comes
// by mail as it crosses 75, 50 or 25; at 0 they sack the manager at once, and at the season's end if the target was
// missed by more than 5 places. The elder then hires: the best manager whose reputation fits the league, from the free
// agents or a lower league's crews, or offers the post to the player. The player is a manager like any other here.

import type { Offer } from '../office.ts';
import { askFee, askSeasons, askWage } from './asks.ts';
import { signed, released } from './contracts.ts';
import { between, within, type Dice } from './dice.ts';
import { endTalk } from './hiring.ts';
import { confidenceMove, debtFloor, debtMove, endowment } from './leadership.ts';
import { fullName } from './names.ts';
import { mine, post } from './post.ts';
import { schedule, unscheduled } from './queue.ts';
import { makeGull } from './recruit.ts';
import type { Gull, GullOf } from './roles.ts';
import { age, stars } from './stars.ts';
import type { CareerState, Crew, JobOffer } from './state.ts';
import { TUNING } from './tuning.ts';
import { targets } from './world.ts';

const E = TUNING.elder;

const elderOf = (s: CareerState, c: Crew): GullOf<'elder'> => s.gulls[c.staff.elder] as GullOf<'elder'>;
const withCrew = (s: CareerState, c: Crew): CareerState => {
  const crews = [...s.crews];
  crews[c.id] = c;
  return { ...s, crews };
};

/** A crew's place in its league (1 best): by points, then wins, then the lower id. */
export function standingOf(s: CareerState, crew: number): number {
  const l = s.leagues[s.crews[crew].league];
  const sorted = [...l.standings].sort((a, b) => b.points - a.points || b.wins - a.wins || a.crew - b.crew);
  return sorted.findIndex((x) => x.crew === crew) + 1;
}

/** The elder's word, if confidence crossed one of 75, 50, 25 (either way): the level crossed. */
export function wordAt(before: number, after: number): number | null {
  for (const w of E.words) if ((before >= w) !== (after >= w)) return w;
  return null;
}

/** A state after a race for one crew's elder: confidence moved by the standing against the target (Patience scales a
 *  fall) and by the coin; the word mailed at a crossing; the manager sacked at 0. Section 13 calls it for every crew
 *  as the round closes, after the standings. */
export function afterRace(s: CareerState, crew: number, roll: Dice): CareerState {
  const c = s.crews[crew];
  if (c.staff.manager === null) return s;
  const patience = elderOf(s, c).stats.patience;
  const move = confidenceMove(patience, c.target, standingOf(s, crew)) + debtMove(c.coin, c.debtFloor);
  const confidence = Math.round(Math.min(100, Math.max(0, c.confidence + move)) * 10) / 10;
  let out = withCrew(s, { ...c, confidence });
  const word = wordAt(c.confidence, confidence);
  if (word !== null) out = post(out, { crew, category: 'elder', sender: c.staff.elder, kind: 'elderWord', slots: { level: word, rising: confidence > c.confidence ? 1 : 0 }, links: [] });
  return confidence <= 0 ? sacked(out, crew, roll) : out;
}

/** A state with a crew's manager sacked: a rival manager to the free agents, the player out of a crew (shown offers);
 *  the league's crews' managers told by mail; the elder then hires. */
export function sacked(s: CareerState, crew: number, roll: Dice): CareerState {
  const c = s.crews[crew];
  const m = c.staff.manager;
  if (m === null) return s;
  const me = mine(s);
  const told = c.player || (me !== null && s.crews[me].league === c.league);
  let out = told ? post(s, { crew: null, category: 'league', sender: c.staff.elder, kind: c.player ? 'sacked' : 'managerSacked', slots: { crew, gull: m },
    links: [{ to: 'crew', id: crew }] }) : s;
  const p = out.player;
  if (c.player && p) {
    for (const t of out.talks.filter((x) => x.crew === crew)) out = endTalk(out, crew, t.gull);
    out = withCrew(out, { ...out.crews[crew], player: false, staff: { ...out.crews[crew].staff, manager: null } });
    const gulls = [...out.gulls];
    gulls[m] = { ...gulls[m], contract: null };
    out = unscheduled({ ...out, gulls, player: { ...p, sacked: true, offers: [] } }, (e) => e.kind === 'jobExpires');
    out = hireManager(out, crew, roll, false);
    return sackedOffers(out);
  }
  out = released(out, m);
  return hireManager(out, crew, roll, true, m);
}

/** Whether a manager's reputation fits a league. */
const fits = (g: Gull, league: number): boolean => g.reputation >= E.fit[league];

/** The managers an elder may hire: the free agents, and the managers of lower leagues' crews (poached). The player's
 *  gull is never among them: posts reach the player only as offers. */
export function managerCandidates(s: CareerState, crew: number, barred: number | null = null): Gull[] {
  const league = s.crews[crew].league;
  return s.gulls.filter((g) => g.role === 'manager' && !g.player && g.retired === null && g.id !== barred
    && (g.contract === null || s.crews[g.contract.crew].league > league));
}

/** The best manager for a crew: of those who fit, the best reputation, then stars, then the free before the poached,
 *  then the lower id; if none fits, the best free agent by the same order. `barred`: the manager just sacked. */
export function bestManager(s: CareerState, crew: number, barred: number | null = null): Gull | null {
  const league = s.crews[crew].league;
  const all = managerCandidates(s, crew, barred);
  const order = (a: Gull, b: Gull) => b.reputation - a.reputation || stars(b) - stars(a) || Number(a.contract !== null) - Number(b.contract !== null) || a.id - b.id;
  return all.filter((g) => fits(g, league)).sort(order)[0] ?? all.filter((g) => g.contract === null).sort(order)[0] ?? null;
}

/** Whether a crew may offer its post to the player now: the player's reputation reaches its league's threshold, the
 *  crew is not theirs, and no offer of its is standing. */
export function mayOffer(s: CareerState, crew: number): boolean {
  const p = s.player;
  if (!p) return false;
  const c = s.crews[crew];
  return !c.player && p.reputation >= E.jobs[c.league] && !p.offers.some((o) => o.crew === crew);
}

/** A state with a crew's post offered to the player: 7 days to answer (no lapse while they are out of a crew). */
export function offerJob(s: CareerState, crew: number): CareerState {
  const p = s.player!;
  const offer: JobOffer = { crew, made: s.day, expires: s.day + E.offerDays };
  let out: CareerState = { ...s, player: { ...p, offers: [...p.offers, offer] } };
  if (!p.sacked) out = schedule(out, offer.expires, { kind: 'jobExpires', crew });
  return post(out, { crew: null, category: 'elder', sender: s.crews[crew].staff.elder, kind: 'jobOffer', slots: { crew, expires: offer.expires },
    links: [{ to: 'crew', id: crew }] });
}

/** A state with a crew's open post filled: offered to the player if they may take it and stand at least as high as the
 *  best candidate (when `player` allows); else the best candidate signed (a poached manager's crew then hires in turn).
 *  Nothing while an offer of the post to the player stands. An elder never takes back the manager it sacked (`barred`). */
export function hireManager(s: CareerState, crew: number, roll: Dice, player: boolean, barred: number | null = null): CareerState {
  const c = s.crews[crew];
  if (c.staff.manager !== null || s.player?.offers.some((o) => o.crew === crew)) return s;
  const best = bestManager(s, crew, barred);
  if (player && s.player && !s.player.sacked && mayOffer(s, crew) && s.player.reputation >= (best?.reputation ?? 0)) return offerJob(s, crew);
  if (!best) return s;
  const from = best.contract?.crew ?? null;
  const wage = askWage(best, c.league);
  const offer: Offer = { role: 'manager', status: 'staff', wage, fee: askFee(wage), seasons: askSeasons(age(best, s.day)), podium: 0, sinking: 0, breakClause: null, replaces: null };
  let out = signed(s, { crew, gull: best.id, offer });
  out = withCrew(out, { ...out.crews[crew], confidence: TUNING.crew.confidence });
  return from === null ? out : hireManager(out, from, roll, player);
}

/** The offers shown to a sacked player: every open post whose crew may offer, and always one from League Three (the
 *  crew there whose elder trusts its manager least). */
export function sackedOffers(s: CareerState): CareerState {
  let out = s;
  for (const c of s.crews) if (c.staff.manager === null && mayOffer(out, c.id)) out = offerJob(out, c.id);
  const three = s.leagues[s.leagues.length - 1].crews.map((i) => s.crews[i]).filter((c) => !c.player);
  const least = [...three].sort((a, b) => a.confidence - b.confidence || a.id - b.id)[0];
  if (least && !out.player!.offers.some((o) => out.crews[o.crew].league === least.league)) out = offerJob(out, least.id);
  return out;
}

/** A state at a season's start for every elder: the target set (expected place by staff stars, moved up by Ambition);
 *  Coin added and the debt floor set (Generosity). Section 13 calls it as each season starts. */
export function seasonStart(s: CareerState): CareerState {
  const crews = s.crews.map((c) => {
    const g = elderOf(s, c).stats.generosity;
    return { ...c, coin: Math.round(c.coin + endowment(g, c.budget)), debtFloor: Math.round(debtFloor(g, c.budget)) };
  });
  const out = s.leagues.flatMap((l) => targets(l.crews.map((i) => crews[i]), s.gulls));
  for (const c of out) crews[c.id] = c;
  return { ...s, crews };
}

/** A state at a season's end for every elder, in order: a retired elder succeeded; a retired manager's post opened;
 *  the verdicts (a target missed by more than 5 places sacks the manager); then, for an ambitious elder whose
 *  manager stands below the player, the post offered to the player. Section 13 calls it after contracts expire. */
export function verdicts(s: CareerState, roll: Dice): CareerState {
  let out = successions(s, roll);
  for (const c of out.crews) {
    const m = c.staff.manager;
    if (m !== null && out.gulls[m].retired !== null) {
      out = released(out, m);
      out = hireManager(out, c.id, roll, true);
    }
  }
  for (const c of out.crews) {
    if (out.crews[c.id].staff.manager !== null && standingOf(out, c.id) - c.target > E.missedBy) out = sacked(out, c.id, roll);
  }
  for (const c of out.crews) {
    const m = c.staff.manager;
    const p = out.player;
    if (m === null || !p || p.sacked || c.player || elderOf(out, c).stats.ambition < E.ambitious) continue;
    if (out.gulls[m].reputation < p.reputation && mayOffer(out, c.id)) out = offerJob(out, c.id);
  }
  return out;
}

/** A state with each retired elder succeeded by a new one of the crew's colony (an elder's post never stands open). */
function successions(s: CareerState, roll: Dice): CareerState {
  const retired = s.crews.filter((c) => s.gulls[c.staff.elder].retired !== null);
  if (retired.length === 0) return s;
  const rand = roll.roll('elders');
  const taken = new Set(s.gulls.filter((g) => g.retired === null).map(fullName));
  const gulls = [...s.gulls];
  const crews = [...s.crews];
  const [lo, hi] = TUNING.ages.start.elder;
  for (const c of retired) {
    const g = makeGull({ id: gulls.length, role: 'elder', stars: within(rand, 1.5, 3.5), years: between(rand, lo, hi), day: s.day, colony: c.colony }, rand, taken);
    gulls[c.staff.elder] = { ...gulls[c.staff.elder], contract: null };
    gulls.push({ ...g, contract: { crew: c.id, status: 'staff', wage: 0, fee: 0, ends: null, podium: 0, sinking: 0, breakClause: null, signed: s.day } });
    crews[c.id] = { ...c, staff: { ...c.staff, elder: g.id }, confidence: TUNING.crew.confidence };
  }
  return { ...s, gulls, crews };
}
