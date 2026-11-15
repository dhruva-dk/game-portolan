// The flight (#58 section 8.1, D12): gulls who fly to a ship in her side's water and restore things, as well as her
// bosun and flight can (race.ts Service, which the career works out from their stats; the sim never sees a gull).
//
// Called while she lies in her side's water and isn't being served, the flight arrives `service.arrive` s later and
// works while she stays in it; leaving it, or losing the water under her, ends the stop. It does four jobs, one at a
// time in `service.order`, a job with nothing to do passed over, until none has anything to do; with k the job's rate:
//   mend    hull points, up to her most, FLIGHT.mend × k a second
//   gust    a charge at a time, up to her most, one every FLIGHT.gust / k s
//   stores  one repair kit stowed (her hold with room for it), once a stop, after FLIGHT.stores / k s
//   part    one failed part repaired (wear.ts), after FLIGHT.part / k s
// As a job starts, one seeded draw botches it with chance `service.botch[job]`, times `service.underFire` if she was
// struck in the last FLIGHT.fire s: a botch pauses the job FLIGHT.botched s and never harms her. With
// `service.freeRepair` her first failed part is repaired the moment the flight arrives.
//
// A bot calls hers by the same rule (bot.ts's 'service' option, `serviceUrge`): worth more the lower her hull, the
// more parts failed, the fewer Gust charges, and the nearer her side's water.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import type { Job, PartType, Service } from '../race.ts';
import { distance } from '../world/sphere.ts';
import { hash, random } from '../world/random.ts';
import { GUST } from './handling.ts';
import { charged, type Gust } from './gust.ts';
import { healed, type Health } from './health.ts';
import { roomFor, stowed, type Hold } from './hold.ts';
import { repaired, type Part } from './wear.ts';
import { ramp, utility } from './utility.ts';
import { fitOf, type Ctx } from './captain.ts';
import { circle, inOwn } from './claimer.ts';

/** Every number of the flight, starting values: the seconds a job takes at k = 1 (mend: hull points a second), how
 *  long a botch pauses it, the seconds a blow counts as her being under fire, and what a bot weighs in calling it
 *  (its weight, her side's water out of reach past `far` m, `near` m wholly, and each need's worth). */
export const FLIGHT = {
  mend: 8, gust: 3, stores: 5, part: 6, botched: 3, fire: 5,
  weight: 2, far: 300, near: 60, fault: 0.7, faults: 0.15, charge: 0.1,
} as const;

/** A ship's flight that no career has worked out (a card-less ship, or a dealt card's): middling at every job. */
export const SERVICE: Service = {
  arrive: 5, order: ['mend', 'gust', 'stores', 'part'],
  rate: { mend: 1, gust: 1, stores: 1, part: 1 }, botch: { mend: 0.1, gust: 0.1, stores: 0.1, part: 0.1 },
  underFire: 2, freeRepair: false, gustRecharge: 1,
};

/** A stop: seconds since she called, whether the flight has come, the job in hand (null between jobs) and seconds left
 *  of it (a gust's: to its next charge), seconds left of a botch's pause, whether the stores were given, and the jobs
 *  begun so far (its draws' key). */
export interface Stop { t: number; come: boolean; job: Job | null; left: number; paused: number; stored: boolean; begun: number }

/** What the flight works on: her hit points and her most hull, her gust, her hold and her parts. */
export interface Serving { health: Health; most: number; gust: Gust; hold: Hold; parts: readonly Part[] }

/** What a stop did in a step: the flight came; a job began, and whether it botched; a part repaired; the stop ended
 *  (she left her water, or was served). */
export type Done = { kind: 'come' } | { kind: 'job'; job: Job; botched: boolean } | { kind: 'repaired'; part: PartType } | { kind: 'ended'; served: boolean };

/** A stop just called. */
export const called = (): Stop => ({ t: 0, come: false, job: null, left: 0, paused: 0, stored: false, begun: 0 });

/** Whether a job has anything to do for her. */
export function wanted(job: Job, s: Serving, stop: Stop): boolean {
  switch (job) {
    case 'mend': return s.health.hull < s.most;
    case 'gust': return s.gust.charges < GUST.charges;
    case 'stores': return !stop.stored && roomFor(s.hold, 'repairKit') >= 0;
    case 'part': return s.parts.some((p) => p.failed);
  }
}

/** The seconds job `job` takes at rate k (a gust's: each charge); mending is by the second. */
const lasts = (job: Job, k: number) => (job === 'mend' ? 0 : FLIGHT[job] / Math.max(1e-6, k));

/** What a stop's step is told: what her flight can do, whether she lies in her side's water, whether she was struck in
 *  the last FLIGHT.fire s, and the seed its draws are keyed from (her race's and her id's). */
export interface Station { service: Service; home: boolean; fired: boolean; seed: number }

/** dt seconds of a stop: the stop after (null once ended), the ship as the flight left her, and what it did. */
export function served(stop: Stop, ship: Serving, at: Station, dt: number): { stop: Stop | null; ship: Serving; done: Done[] } {
  const done: Done[] = [];
  if (!at.home) return { stop: null, ship, done: [{ kind: 'ended', served: false }] };
  let s: Stop = { ...stop, t: stop.t + dt }, her = ship;
  if (!s.come) {
    if (s.t < at.service.arrive) return { stop: s, ship, done };
    s = { ...s, come: true };
    done.push({ kind: 'come' });
    const first = her.parts.findIndex((p) => p.failed);
    if (at.service.freeRepair && first >= 0) {
      her = { ...her, parts: her.parts.map((p, i) => (i === first ? repaired(p) : p)) };
      done.push({ kind: 'repaired', part: her.parts[first].type });
    }
  }
  // the next job with something to do, begun: its botch drawn
  if (s.job === null || !wanted(s.job, her, s)) {
    const job = at.service.order.find((j) => wanted(j, her, s)) ?? null;
    if (job === null) return { stop: null, ship: her, done: [...done, { kind: 'ended', served: true }] };
    const chance = at.service.botch[job] * (at.fired ? at.service.underFire : 1);
    const botched = random(hash(at.seed, s.begun))() < chance;
    s = { ...s, job, left: lasts(job, at.service.rate[job]), paused: botched ? FLIGHT.botched : 0, begun: s.begun + 1 };
    done.push({ kind: 'job', job, botched });
    return { stop: s, ship: her, done };
  }
  if (s.paused > 0) return { stop: { ...s, paused: Math.max(0, s.paused - dt) }, ship: her, done };
  const k = at.service.rate[s.job];
  if (s.job === 'mend') return { stop: s, ship: { ...her, health: healed(her.health, FLIGHT.mend * k * dt, 'hull', her.most) }, done };
  const left = s.left - dt;
  if (left > 1e-9) return { stop: { ...s, left }, ship: her, done };
  switch (s.job) {
    case 'gust':
      her = { ...her, gust: charged(her.gust) };
      return { stop: { ...s, left: lasts('gust', k) }, ship: her, done };
    case 'stores': {
      return { stop: { ...s, stored: true, job: null }, ship: { ...her, hold: stowed(her.hold, 'repairKit', 1).hold }, done };
    }
    case 'part': {
      const i = her.parts.findIndex((p) => p.failed);
      done.push({ kind: 'repaired', part: her.parts[i].type });
      return { stop: { ...s, job: null }, ship: { ...her, parts: her.parts.map((p, j) => (j === i ? repaired(p) : p)) }, done };
    }
  }
}

/** The share of the way the flight has come (0…1), or 1 once it is working. */
export const coming = (stop: Stop, service: Service) => (stop.come ? 1 : Math.min(1, stop.t / Math.max(1e-6, service.arrive)));

// ---------------------------------------------------------------- a bot's call

/** How much a bot wants her flight (bot.ts's 'service' option): her need (her hull down, her parts failed, her gust
 *  charges spent) by how near her side's water is; held while it serves her. None with no flight or no water. */
export function serviceUrge(c: Ctx): number {
  if (!c.hand.service || !c.sea.holdings) return 0;
  const home = inOwn(c);
  if (c.own.served) return home ? 1 : 0;
  const most = fitOf(c.own).hull, hull = c.own.hull ?? most, faults = c.own.faults ?? 0;
  const charges = c.own.crew?.gust.charges ?? GUST.charges;
  const need = Math.max(ramp(hull, 0.9 * most, 0.3 * most), faults > 0 ? FLIGHT.fault + FLIGHT.faults * (faults - 1) : 0, FLIGHT.charge * (GUST.charges - charges));
  return utility(need, home ? 1 : ramp(distance(c.own.ship.at, c.m.haven), FLIGHT.far, FLIGHT.near));
}

/** Makes for her side's water, and once in it circles there while the flight comes and works. */
export function serviceAct(c: Ctx): void {
  c.m.goal = inOwn(c) ? circle(c) : c.m.haven;
}

/** Whether she calls her flight now: about it, in her side's water, and not being served. */
export const calls = (c: Ctx): boolean => c.m.mode === 'service' && !c.own.served && inOwn(c);
