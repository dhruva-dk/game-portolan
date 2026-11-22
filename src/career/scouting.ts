// Scouting (Phase B section 4): a free scout of a crew is sent to a gull in their Reach; after the scout's days (Speed)
// times the crow's nest's factor, the report comes by mail and the crew knows the gull exactly. CancelScout frees the
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
import { knows, leagueOf, learned } from './knowledge.ts';
import { mine, post } from './post.ts';
import { schedule, type Event } from './queue.ts';
import type { GullOf } from './roles.ts';
import { inReach, scoutDays } from './staff.ts';
import type { CareerState } from './state.ts';

/** Whether a crew may send one of its scouts to a gull. */
export function scoutCheck(
  s: CareerState,
  crew: number,
  scout: number,
  gull: number
): Check {
  const c = s.crews[crew];
  if (!whole(scout, 0, s.gulls.length - 1) || !c.staff.scouts.includes(scout))
    return why('notScout', 'Only your own scouts can be sent.');
  if (s.scouting.some((x) => x.scout === scout))
    return why('busy', 'That scout is already at work.');
  if (!whole(gull, 0, s.gulls.length - 1)) return why('who', 'No such gull.');
  const g = s.gulls[gull];
  if (g.retired !== null || g.player)
    return why('who', 'There is no one there to scout.');
  if (knows(s, crew, g)) return why('known', 'You know them already.');
  if (s.scouting.some((x) => x.crew === crew && x.gull === gull))
    return why('already', 'Another of your scouts is on them.');
  const reach = effective(s.gulls[scout] as GullOf<'scout'>, null).reach;
  if (!inReach(reach, c.league, leagueOf(s, g)))
    return why('reach', "They are beyond this scout's Reach.");
  return null;
}

/** The days a scout of a crew takes. */
export function scoutingDays(
  s: CareerState,
  crew: number,
  scout: number
): number {
  return scoutDays(
    effective(s.gulls[scout] as GullOf<'scout'>, null).speed,
    s.crews[crew].buildings.crowsNest.level
  );
}

/** A state with a scout sent (checked first), the report scheduled. */
export function sent(
  s: CareerState,
  crew: number,
  scout: number,
  gull: number
): CareerState {
  const done = s.day + scoutingDays(s, crew, scout);
  const out = {
    ...s,
    scouting: [...s.scouting, { crew, scout, gull, started: s.day, done }],
  };
  return schedule(out, done, { kind: 'report', crew, scout });
}

/** A scout reports: the crew knows the gull, the scout is free, and the player is mailed if the crew is theirs. */
export function reported(
  s: CareerState,
  e: Extract<Event, { kind: 'report' }>
): CareerState {
  const job = s.scouting.find((x) => x.crew === e.crew && x.scout === e.scout);
  if (!job) return s;
  const out = learned(
    { ...s, scouting: s.scouting.filter((x) => x !== job) },
    job.crew,
    job.gull,
    job.scout
  );
  return post(out, {
    crew: job.crew,
    category: 'market',
    sender: job.scout,
    kind: 'scoutReport',
    slots: { gull: job.gull, scout: job.scout },
    links: [{ to: 'gull', id: job.gull }],
  });
}

export const SCOUTING: Handlers = {
  StartScout: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no crew: take one of the posts offered.'
      );
    const no = scoutCheck(s, me, c.scout, c.gull);
    return no
      ? refuse(no.code, no.sentence)
      : accept(sent(s, me, c.scout, c.gull));
  },
  CancelScout: (s, c) => {
    const me = mine(s);
    if (me === null)
      return refuse(
        'sacked',
        'You have no crew: take one of the posts offered.'
      );
    if (!s.scouting.some((x) => x.crew === me && x.scout === c.scout))
      return refuse('idle', 'That scout is not at work.');
    return accept(scoutingStopped(s, c.scout));
  },
};
