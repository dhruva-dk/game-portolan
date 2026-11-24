// Scouting: a free scout of a team is sent to a person in their Reach; after the scout's days (Speed)
// times the crow's nest's factor, the report comes by mail and the team knows the person exactly. CancelScout frees the
// scout and loses the progress. Rivals scout through the same check and the same start.

import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import { scoutingStopped } from './contracts.ts';
import { effective } from './effective.ts';
import { knows, tierOf, learned } from './knowledge.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import { inReach, scoutDays } from './staff.ts';
import { inRole } from './roles.ts';
import type { CareerState } from './state.ts';

/** Whether a team may send one of its scouts to a person. */
export function scoutCheck(
  s: CareerState,
  team: number,
  scout: number,
  person: number
): Check {
  const c = s.teams[team];
  if (!whole(scout, 0, s.people.length - 1) || !c.staff.scouts.includes(scout))
    return why('notScout', 'Only your own scouts can be sent.');
  if (s.scouting.some((x) => x.scout === scout))
    return why('busy', 'That scout is already at work.');
  if (!whole(person, 0, s.people.length - 1))
    return why('who', 'No such person.');
  const g = s.people[person];
  if (g.retired !== null || g.player)
    return why('who', 'There is no one there to scout.');
  if (knows(team, g)) return why('known', 'You know them already.');
  if (s.scouting.some((x) => x.team === team && x.person === person))
    return why('already', 'Another of your scouts is on them.');
  const reach = effective(inRole(s.people[scout], 'scout'), null).reach;
  if (!inReach(reach, c.tier, tierOf(s, g)))
    return why('reach', "They are beyond this scout's Reach.");
  return null;
}

/** The days a scout of a team takes. */
export function scoutingDays(
  s: CareerState,
  team: number,
  scout: number
): number {
  return scoutDays(
    effective(inRole(s.people[scout], 'scout'), null).speed,
    s.teams[team].buildings.scoutingCentre.level
  );
}

/** A state with a scout sent (checked first), the report scheduled. */
export function sent(
  s: CareerState,
  team: number,
  scout: number,
  person: number
): CareerState {
  const done = s.day + scoutingDays(s, team, scout);
  const out = {
    ...s,
    scouting: [...s.scouting, { team, scout, person, started: s.day, done }],
  };
  return schedule(out, done, { kind: 'report', team, scout });
}

/** A scout reports: the team knows the person, the scout is free, and the player is mailed if the team is theirs. */
export function reported(
  s: CareerState,
  e: Extract<Event, { kind: 'report' }>
): CareerState {
  const job = s.scouting.find((x) => x.team === e.team && x.scout === e.scout);
  if (!job) return s;
  const out = learned(
    { ...s, scouting: s.scouting.filter((x) => x !== job) },
    job.team,
    job.person,
    job.scout
  );
  return post(out, {
    team: job.team,
    category: 'market',
    sender: job.scout,
    kind: 'scoutReport',
    slots: { person: job.person, scout: job.scout },
    links: [{ to: 'person', id: job.person }],
  });
}

export const SCOUTING: Handlers = {
  StartScout: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    const no = scoutCheck(s, me, c.scout, c.person);
    return no
      ? refuse(no.code, no.sentence)
      : accept(sent(s, me, c.scout, c.person));
  },
  CancelScout: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no team: take one of the posts offered.'
      );
    if (!s.scouting.some((x) => x.team === me && x.scout === c.scout))
      return refuse('idle', 'That scout is not at work.');
    return accept(scoutingStopped(s, c.scout));
  },
};
