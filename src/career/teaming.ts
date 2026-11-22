// Moving a pit crew member to another job (Phase B section 2.1): their rating is then that job's weights. If another of
// the team's pit works that job, the two swap.

import type { Job } from '../race.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { JOBS } from './service.ts';
import type { CareerState } from './state.ts';

/** Whether the player's team may move a person to a job. */
export function moveJobCheck(s: CareerState, person: number, job: Job): Check {
  if (!s.player) return why('unfounded', 'Found a team first.');
  if (!JOBS.includes(job))
    return why(
      'job',
      'The pit crew has four jobs: mend, gust, stores and part.'
    );
  const team = s.teams[s.player.team];
  if (!team.staff.pit.includes(person))
    return why(
      'notPit',
      'Only your own pit crew members can be moved between jobs.'
    );
  if (s.race?.started)
    return why(
      'racing',
      'The race is under way: the pit crew stays at its posts.'
    );
  if (s.people[person].job === job)
    return why('same', 'They already work that job.');
  return null;
}

export const TEAMING: Handlers = {
  MovePitJob: (s, c) => {
    const no = moveJobCheck(s, c.person, c.job);
    if (no) return refuse(no.code, no.sentence);
    const team = s.teams[s.player!.team];
    const people = [...s.people];
    const mover = people[c.person];
    const holder = team.staff.pit.find(
      (id) => id !== c.person && people[id].job === c.job
    );
    if (holder !== undefined)
      people[holder] = { ...people[holder], job: mover.job };
    people[c.person] = { ...mover, job: c.job };
    return accept({ ...s, people });
  },
};
