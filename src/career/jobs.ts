// The player's job offers (Phase B section 7, D22): TakeJob moves the player to the team: they sail its ship one, its
// weaker driver is released, its manager goes to the free agents, its talks under way end, and the old team's chairman
// hires a replacement. The player's colours and emblem stay with the old team. DeclineJob lets the team's chairman hire
// elsewhere; a sacked player must take one of the offers shown and cannot decline the last.

import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { released } from './contracts.ts';
import type { Dice } from './dice.ts';
import { hireManager } from './chairmen.ts';
import { endTalk } from './hiring.ts';
import { unscheduled, type Event } from './queue.ts';
import { stars } from './stars.ts';
import type { CareerState, Team, Hands } from './state.ts';
import { TUNING } from './tuning.ts';

/** Whether the player may take a team's offered post now. */
export function takeCheck(s: CareerState, team: number): Check {
  const p = s.player;
  if (!p) return why('unfounded', 'Found a team first.');
  if (!whole(team, 0, s.teams.length - 1))
    return why('noOffer', 'No such team.');
  const o = p.offers.find((x) => x.team === team);
  if (!o) return why('noOffer', 'That team has not offered you its post.');
  if (!p.sacked && s.day > o.expires)
    return why('lapsed', 'That offer has lapsed.');
  if (s.race !== null) return why('raceDay', 'It is race day: sail it first.');
  return null;
}

/** A state with every talk of a team ended. */
const talksOf = (s: CareerState, team: number): CareerState =>
  s.talks
    .filter((t) => t.team === team)
    .reduce((acc, t) => endTalk(acc, team, t.person), s);

/** A state with offers taken off the player's list (their lapse events too), the teams' open posts filled. */
function withdrawn(
  s: CareerState,
  teams: readonly number[],
  roll: Dice
): CareerState {
  const set = new Set(teams);
  let out = unscheduled(
    s,
    (e: Event) => e.kind === 'jobExpires' && set.has(e.team)
  );
  out = {
    ...out,
    player: {
      ...out.player!,
      offers: out.player!.offers.filter((o) => !set.has(o.team)),
    },
  };
  for (const c of teams) out = hireManager(out, c, roll, false);
  return out;
}

/** A state with the player moved to a team (checked first). */
export function taken(s: CareerState, team: number, roll: Dice): CareerState {
  const p = s.player!;
  const old = p.sacked ? null : p.team;
  let out = talksOf(s, team);
  if (old !== null) {
    out = talksOf(out, old);
    const o = out.teams[old];
    out = withTeam(out, {
      ...o,
      player: false,
      staff: { ...o.staff, manager: null },
    });
  }
  const was = out.teams[team].staff.manager;
  if (was !== null) out = released(out, was);
  // its drivers: the stronger sails ship two, the weaker is released; ship one is the player's
  const caps = out.teams[team].staff.ships
    .map((h) => h.driver)
    .filter((x): x is number => x !== null);
  const [stronger, weaker] = [...caps].sort(
    (a, b) => stars(out.people[b]) - stars(out.people[a]) || a - b
  );
  if (weaker !== undefined) out = released(out, weaker);
  const c = out.teams[team];
  const ships: [Hands, Hands] = [
    { driver: null, mechanic: c.staff.ships[0].mechanic },
    { driver: stronger ?? null, mechanic: c.staff.ships[1].mechanic },
  ];
  out = withTeam(out, {
    ...c,
    player: true,
    bonds: [0, 0],
    confidence: TUNING.team.confidence,
    staff: { ...c.staff, manager: p.person, ships },
  });
  const people = [...out.people];
  if (stronger !== undefined)
    people[stronger] = {
      ...people[stronger],
      contract: { ...people[stronger].contract!, status: 'ship' },
    };
  people[p.person] = {
    ...people[p.person],
    contract: {
      team,
      status: 'staff',
      wage: 0,
      fee: 0,
      ends: null,
      podium: 0,
      sinking: 0,
      breakClause: null,
      signed: s.day,
    },
  };
  out = { ...out, people, player: { ...p, team, sacked: false } };
  const others = p.offers.map((o) => o.team);
  out = withdrawn(out, others, roll);
  return old === null ? out : hireManager(out, old, roll, false);
}

const withTeam = (s: CareerState, c: Team): CareerState => {
  const teams = [...s.teams];
  teams[c.id] = c;
  return { ...s, teams };
};

/** Whether the player may decline a team's offer. */
export function declineCheck(s: CareerState, team: number): Check {
  const p = s.player;
  if (!p) return why('unfounded', 'Found a team first.');
  if (!p.offers.some((o) => o.team === team))
    return why('noOffer', 'That team has not offered you its post.');
  if (p.sacked && p.offers.length === 1)
    return why('mustTake', 'You have no team: take this post.');
  return null;
}

/** A job offer's last day passes: it lapses, and the team's chairman hires elsewhere. */
export function jobLapses(
  s: CareerState,
  e: Extract<Event, { kind: 'jobExpires' }>,
  roll: Dice
): CareerState {
  const p = s.player;
  if (!p || p.sacked || !p.offers.some((o) => o.team === e.team)) return s;
  return withdrawn(s, [e.team], roll);
}

export const JOBS_TAKEN: Handlers = {
  TakeJob: (s, c, roll) => {
    const no = takeCheck(s, c.team);
    return no ? refuse(no.code, no.sentence) : accept(taken(s, c.team, roll));
  },
  DeclineJob: (s, c, roll) => {
    const no = declineCheck(s, c.team);
    return no
      ? refuse(no.code, no.sentence)
      : accept(withdrawn(s, [c.team], roll));
  },
};
