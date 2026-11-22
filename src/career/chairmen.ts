// Chairmen and the managers' market: each chairman sets a target at the season's start (Ambition)
// and adds money and a debt floor (Generosity); their confidence moves after each race (Patience), only with a run of
// races behind the target, and carries into the next season; their word comes by mail as it crosses 75, 50 or 25. A
// manager past their grace and behind the target is sacked at 0 at once, and at the season's end if the target was
// missed by more than 5 places with confidence low. The chairman then hires: the best manager whose reputation fits the
// tier, from the free agents or a lower tier's teams, or offers the post to the player. The player is a manager
// like any other here.

import { known } from './canon.ts';
import type { Offer } from '../office/command.ts';
import { askFee, askSeasons, askWage } from './asks.ts';
import { contractEnds, signed, released } from './contracts.ts';
import { between, within, type Dice } from './dice.ts';
import { endTalk } from './hiring.ts';
import {
  confidenceCarried,
  confidenceMove,
  debtFloor,
  debtMove,
  endowment,
} from './leadership.ts';
import { fullName } from './names.ts';
import { mine, post } from './post.ts';
import { schedule, unscheduled } from './queue.ts';
import { makePerson } from './recruit.ts';
import type { Person, PersonOf } from './roles.ts';
import { YEAR, age, stars } from './stars.ts';
import {
  withPeople,
  type CareerState,
  type Team,
  type JobOffer,
} from './state.ts';
import { standingOf } from './standings.ts';
import { TUNING } from './tuning.ts';
import { inRole } from './roles.ts';
import { targets } from './world.ts';

const E = TUNING.chairman;

const chairmanOf = (s: CareerState, c: Team): PersonOf<'chairman'> =>
  inRole(s.people[c.staff.chairman], 'chairman');
const withTeam = (s: CareerState, c: Team): CareerState => {
  const teams = [...s.teams];
  teams[c.id] = c;
  return { ...s, teams };
};

/** The chairman's word, if confidence crossed one of 75, 50, 25 (either way): the level crossed. */
export function wordAt(before: number, after: number): number | null {
  for (const w of E.words) if (before >= w !== after >= w) return w;
  return null;
}

/** A state after a race for one team's chairman: confidence moved by the standing against the target (Patience scales a
 *  fall), by the balance, and by each ship with no driver signed to her; the word mailed at a crossing; the manager sacked at 0. Section 13 calls it for every team
 *  as the round closes, after the standings. */
export function afterRace(
  s: CareerState,
  team: number,
  roll: Dice
): CareerState {
  const c = s.teams[team];
  if (c.staff.manager === null) return s;
  const patience = chairmanOf(s, c).stats.patience;
  const standing = standingOf(s, team);
  // (the player's own ship has no driver's seat)
  const unmanned = c.staff.ships.filter(
    (h, ship) => h.driver === null && !(c.player && ship === 0)
  ).length;
  const move =
    confidenceMove(patience, c.target, standing, s.round + 1) +
    debtMove(c.balance, c.debtFloor) +
    E.seat * unmanned;
  const confidence =
    Math.round(Math.min(100, Math.max(0, c.confidence + move)) * 10) / 10;
  let out = withTeam(s, { ...c, confidence });
  const word = wordAt(c.confidence, confidence);
  if (word !== null)
    out = post(out, {
      team,
      category: 'chairman',
      sender: c.staff.chairman,
      kind: 'chairmanWord',
      slots: { level: word, rising: confidence > c.confidence ? 1 : 0 },
      links: [],
    });
  // (behind the target, or with a ship sailed by no one of the team's: a target sinks with a team let run down)
  return confidence <= 0 &&
    (standing - c.target > E.slack || unmanned > 0) &&
    served(s, c)
    ? sacked(out, team, roll)
    : out;
}

/** Whether a team's manager has served long enough to be sacked: `grace` seasons since they signed. */
export function served(s: CareerState, c: Team): boolean {
  const m = c.staff.manager;
  const since = m === null ? null : (s.people[m].contract?.signed ?? null);
  return since !== null && s.day - since >= E.grace * YEAR;
}

/** Whether the chairman sacks the manager at the season's end: they have served their grace, missed the target by more
 *  than `missedBy` places, and confidence is below `verdict` (a team that met its target is never judged). */
export function sacksAtEnd(s: CareerState, team: number): boolean {
  const c = s.teams[team];
  return (
    c.staff.manager !== null &&
    served(s, c) &&
    standingOf(s, team) - c.target > E.missedBy &&
    c.confidence < E.verdict
  );
}

/** A state with a team's manager sacked: a rival manager to the free agents, the player out of a team (shown offers);
 *  the tier's teams' managers told by mail; the chairman then hires. */
export function sacked(s: CareerState, team: number, roll: Dice): CareerState {
  const c = s.teams[team];
  const m = c.staff.manager;
  if (m === null) return s;
  const me = mine(s);
  const told = c.player || (me !== null && s.teams[me].tier === c.tier);
  let out = told
    ? post(s, {
        team: null,
        category: 'tier',
        sender: c.staff.chairman,
        kind: c.player ? 'sacked' : 'managerSacked',
        slots: { team, person: m },
        links: [{ to: 'team', id: team }],
      })
    : s;
  const p = out.player;
  if (c.player && p) {
    for (const t of out.talks.filter((x) => x.team === team))
      out = endTalk(out, team, t.person);
    out = withTeam(out, {
      ...out.teams[team],
      player: false,
      staff: { ...out.teams[team].staff, manager: null },
    });
    const people = [...out.people];
    people[m] = { ...people[m], contract: null };
    out = unscheduled(
      { ...out, people, player: { ...p, sacked: true, offers: [] } },
      (e) => e.kind === 'jobExpires'
    );
    out = hireManager(out, team, roll, false);
    return sackedOffers(out);
  }
  out = released(out, m);
  return hireManager(out, team, roll, true, m);
}

/** Whether a manager's reputation fits a tier. */
const fits = (g: Person, tier: number): boolean => g.reputation >= E.fit[tier];

/** The managers a chairman may hire: the free agents, and the managers of lower championships' teams (poached). The player's
 *  person is never among them: posts reach the player only as offers. */
export function managerCandidates(
  s: CareerState,
  team: number,
  barred: number | null = null
): Person[] {
  const tier = s.teams[team].tier;
  return managersIn(s.people).filter(
    (g) =>
      g.id !== barred &&
      (g.contract === null || s.teams[g.contract.team].tier > tier)
  );
}

/** The working managers (not retired, not the player) of each people list already read (lists are immutable). */
const managers = new WeakMap<readonly Person[], readonly Person[]>();
function managersIn(people: readonly Person[]): readonly Person[] {
  let out = managers.get(people);
  if (!out) {
    out = people.filter(
      (g) => g.role === 'manager' && !g.player && g.retired === null
    );
    managers.set(people, out);
  }
  return out;
}

/** The best manager for a team: of those who fit, the best reputation, then stars, then the free before the poached,
 *  then the lower id; if none fits, the best free agent by the same order. `barred`: the manager just sacked. */
export function bestManager(
  s: CareerState,
  team: number,
  barred: number | null = null
): Person | null {
  const tier = s.teams[team].tier;
  const all = managerCandidates(s, team, barred);
  const order = (a: Person, b: Person) =>
    b.reputation - a.reputation ||
    stars(b) - stars(a) ||
    Number(a.contract !== null) - Number(b.contract !== null) ||
    a.id - b.id;
  return (
    all.filter((g) => fits(g, tier)).sort(order)[0] ??
    all.filter((g) => g.contract === null).sort(order)[0] ??
    null
  );
}

/** Whether a team may offer its post to the player now: the player's reputation reaches its tier's threshold, the
 *  team is not theirs, and no offer of its is standing; while the player has a team, only a team of their tier or a
 *  better one offers, and no more than `standing` offers stand at once (a post below them is no offer). */
export function mayOffer(s: CareerState, team: number): boolean {
  const p = s.player;
  if (!p) return false;
  const c = s.teams[team];
  if (
    c.player ||
    p.reputation < E.jobs[c.tier] ||
    p.offers.some((o) => o.team === team)
  )
    return false;
  return (
    p.sacked || (c.tier <= s.teams[p.team].tier && p.offers.length < E.standing)
  );
}

/** A state with a team's post offered to the player: 7 days to answer (no lapse while they are out of a team). */
export function offerJob(s: CareerState, team: number): CareerState {
  const p = known(s.player);
  const offer: JobOffer = { team, made: s.day, expires: s.day + E.offerDays };
  let out: CareerState = {
    ...s,
    player: { ...p, offers: [...p.offers, offer] },
  };
  if (!p.sacked)
    out = schedule(out, offer.expires, { kind: 'jobExpires', team });
  return post(out, {
    team: null,
    category: 'chairman',
    sender: s.teams[team].staff.chairman,
    kind: 'jobOffer',
    slots: { team, expires: offer.expires },
    links: [{ to: 'team', id: team }],
  });
}

/** A state with a team's open post filled: offered to the player if they may take it and stand at least as high as the
 *  best candidate (when `player` allows); else the best candidate signed (a poached manager's team then hires in turn).
 *  Nothing while an offer of the post to the player stands. A chairman never takes back the manager it sacked (`barred`). */
export function hireManager(
  s: CareerState,
  team: number,
  roll: Dice,
  player: boolean,
  barred: number | null = null
): CareerState {
  const c = s.teams[team];
  if (c.staff.manager !== null || s.player?.offers.some((o) => o.team === team))
    return s;
  const best = bestManager(s, team, barred);
  if (
    player &&
    s.player &&
    !s.player.sacked &&
    mayOffer(s, team) &&
    s.player.reputation >= (best?.reputation ?? 0)
  )
    return offerJob(s, team);
  if (!best) return s;
  const from = best.contract?.team ?? null;
  const wage = askWage(best, c.tier);
  const offer: Offer = {
    role: 'manager',
    status: 'staff',
    wage,
    fee: askFee(wage),
    seasons: askSeasons(age(best, s.day)),
    podium: 0,
    sinking: 0,
    breakClause: null,
    replaces: null,
  };
  let out = signed(s, { team, person: best.id, offer });
  out = withTeam(out, {
    ...out.teams[team],
    confidence: TUNING.team.confidence,
  });
  return from === null ? out : hireManager(out, from, roll, player);
}

/** The offers shown to a sacked player: every open post whose team may offer, and always one from Tier 3 (the
 *  team there whose chairman trusts its manager least). */
export function sackedOffers(s: CareerState): CareerState {
  let out = s;
  for (const c of s.teams)
    if (c.staff.manager === null && mayOffer(out, c.id))
      out = offerJob(out, c.id);
  const three = s.championships[s.championships.length - 1].teams
    .map((i) => s.teams[i])
    .filter((c) => !c.player);
  const least = [...three].sort(
    (a, b) => a.confidence - b.confidence || a.id - b.id
  )[0];
  if (
    least &&
    !known(out.player).offers.some((o) => out.teams[o.team].tier === least.tier)
  )
    out = offerJob(out, least.id);
  return out;
}

/** A state at a season's start for every chairman: the target set (expected place by staff stars, moved up by Ambition);
 *  money added, the debt floor set (Generosity) and any debt past it cleared. Section 13 calls it as each season starts. */
export function seasonStart(s: CareerState): CareerState {
  const teams = s.teams.map((c) => {
    const g = chairmanOf(s, c).stats.generosity;
    const floor = Math.round(debtFloor(g, c.budget));
    return {
      ...c,
      // a debt past the floor is the chairman's to make good: it has cost the manager their confidence all season
      balance: Math.max(floor, Math.round(c.balance + endowment(g, c.budget))),
      debtFloor: floor,
      confidence:
        Math.round(
          confidenceCarried(c.confidence, TUNING.team.confidence) * 10
        ) / 10,
    };
  });
  const out = s.championships.flatMap((l) =>
    targets(
      l.teams.map((i) => teams[i]),
      s.people
    )
  );
  for (const c of out) teams[c.id] = c;
  return { ...s, teams };
}

/** A state at a season's end for every chairman, in order: a retired chairman succeeded; a retired manager's post opened;
 *  the verdicts (a target missed by more than 5 places sacks the manager); then, for an ambitious chairman whose
 *  manager stands below the player, the post offered to the player. Section 13 calls it after contracts expire. */
export function verdicts(s: CareerState, roll: Dice): CareerState {
  let out = successions(s, roll);
  for (const c of out.teams) {
    const m = c.staff.manager;
    if (m !== null && out.people[m].retired !== null) {
      out = released(out, m);
      out = hireManager(out, c.id, roll, true);
    }
  }
  for (const c of out.teams)
    if (sacksAtEnd(out, c.id)) out = sacked(out, c.id, roll);
  for (const c of out.teams) {
    const m = c.staff.manager;
    const p = out.player;
    if (
      m === null ||
      !p ||
      p.sacked ||
      c.player ||
      chairmanOf(out, c).stats.ambition < E.ambitious
    )
      continue;
    if (out.people[m].reputation < p.reputation && mayOffer(out, c.id))
      out = offerJob(out, c.id);
  }
  return out;
}

/** A state with each rival manager whose contract runs out this season renewed by their chairman, if the chairman's
 *  confidence is at least `verdict`: for their age's length, at their ask in the team's tier; their tenure (`signed`)
 *  kept. Others leave as their contract ends. Section 13 calls it at the season's end, before contracts expire. */
export function managersRenewed(s: CareerState): CareerState {
  const changed: Person[] = [];
  for (const c of s.teams) {
    const m = c.staff.manager;
    const g = m === null ? null : s.people[m];
    if (
      !g ||
      g.player ||
      g.retired !== null ||
      !g.contract ||
      g.contract.ends === null ||
      g.contract.ends > s.season ||
      c.confidence < E.verdict
    )
      continue;
    const contract = {
      ...g.contract,
      wage: askWage(g, c.tier),
      ends: contractEnds(s, askSeasons(age(g, s.day))),
    };
    changed.push({ ...g, contract });
  }
  return changed.length === 0 ? s : withPeople(s, changed);
}

/** A state with each retired chairman succeeded by a new one of the team's colony (a chairman's post never stands open). */
function successions(s: CareerState, roll: Dice): CareerState {
  const retired = s.teams.filter(
    (c) => s.people[c.staff.chairman].retired !== null
  );
  if (retired.length === 0) return s;
  const rand = roll.roll('chairmen');
  const taken = new Set(
    s.people.filter((g) => g.retired === null).map(fullName)
  );
  const people = [...s.people];
  const teams = [...s.teams];
  const [lo, hi] = TUNING.ages.start.chairman;
  for (const c of retired) {
    const g = makePerson(
      {
        id: people.length,
        role: 'chairman',
        stars: within(rand, 1.5, 3.5),
        years: between(rand, lo, hi),
        day: s.day,
        colony: c.colony,
      },
      rand,
      taken
    );
    people[c.staff.chairman] = { ...people[c.staff.chairman], contract: null };
    people.push({
      ...g,
      contract: {
        team: c.id,
        status: 'staff',
        wage: 0,
        fee: 0,
        ends: null,
        podium: 0,
        sinking: 0,
        breakClause: null,
        signed: s.day,
      },
    });
    teams[c.id] = {
      ...c,
      staff: { ...c.staff, chairman: g.id },
      confidence: TUNING.team.confidence,
    };
  }
  return { ...s, people, teams };
}
