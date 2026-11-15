// Moving a flight gull to another job (Phase B section 2.1): their rating is then that job's weights. If another of
// the crew's flight works that job, the two swap.

import type { Job } from '../race.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { JOBS } from './service.ts';
import type { CareerState } from './state.ts';

/** Whether the player's crew may move a gull to a job. */
export function moveJobCheck(s: CareerState, gull: number, job: Job): Check {
  if (!s.player) return why('unfounded', 'Found a crew first.');
  if (!JOBS.includes(job)) return why('job', 'The flight has four jobs: mend, gust, stores and part.');
  const crew = s.crews[s.player.crew];
  if (!crew.staff.flight.includes(gull)) return why('notFlight', 'Only your own flight gulls can be moved between jobs.');
  if (s.race?.started) return why('racing', 'The race is under way: the flight stays at its posts.');
  if (s.gulls[gull].job === job) return why('same', 'They already work that job.');
  return null;
}

export const CREWING: Handlers = {
  MoveFlightJob: (s, c) => {
    const no = moveJobCheck(s, c.gull, c.job);
    if (no) return refuse(no.code, no.sentence);
    const crew = s.crews[s.player!.crew];
    const gulls = [...s.gulls];
    const mover = gulls[c.gull];
    const holder = crew.staff.flight.find((id) => id !== c.gull && gulls[id].job === c.job);
    if (holder !== undefined) gulls[holder] = { ...gulls[holder], job: mover.job };
    gulls[c.gull] = { ...mover, job: c.job };
    return accept({ ...s, gulls });
  },
};
