// The yard (Phase B section 8.4): work points a day, the factory's 10, 20 or 30 plus each bosun's
// (Reliability + Performance) / 4. First each day the points restore fitted parts' condition (a point, 0.01) up to 1;
// the rest go as the crew split them: per fitted non-spec part, a share to performance (1 a point, × her ship's
// bosun's Performance factor) and a share to reliability (0.002 a point, × her Reliability factor), each up to its
// maximum, × the part's supplier's yard terms.
//
// Worked out in closed form over the days since the crew's yardDay (D41): condition only rises between races, so over
// n days the first points restore it (the most worn part first) and the rest split; caps are per part. `yardTo` brings
// a crew's parts to today; anything that reads or changes them first calls it.

import type { YardShare } from '../office.ts';
import { accept, refuse, why, type Check, type Handlers } from './command.ts';
import { effective } from './effective.ts';
import { within } from './flags.ts';
import { mine } from './post.ts';
import type { GullOf } from './roles.ts';
import { factoryPoints } from './rookery.ts';
import { perfYard, reliabilityYard } from './service.ts';
import type { CareerState, Crew, Part } from './state.ts';
import { termsFor } from './suppliers.ts';
import { TUNING } from './tuning.ts';

const Y = TUNING.yard;

/** A ship's bosun's effective stats, or null. */
function bosunOf(s: CareerState, c: Crew, ship: 0 | 1): GullOf<'bosun'>['stats'] | null {
  const id = c.staff.ships[ship].bosun;
  return id === null ? null : effective(s.gulls[id] as GullOf<'bosun'>, null);
}

/** A crew's yard points a day: the factory's, plus each bosun's (Reliability + Performance) / 4. */
export function yardPoints(s: CareerState, crew: number): number {
  const c = s.crews[crew];
  let points = factoryPoints(c);
  for (const ship of [0, 1] as const) {
    const b = bosunOf(s, c, ship);
    if (b) points += (b.reliability + b.perf) * Y.bosun;
  }
  return points;
}

/** A crew's yard points over the days [from, to): each day's points, the factory's at × slow on the days storm damage
 *  is mended slowly, and all × (1 + exempt) on the days of a testing exemption (career/events.ts). */
export function yardWork(s: CareerState, crew: number, from: number, to: number): number {
  const D = TUNING.dilemmas;
  const daily = yardPoints(s, crew);
  const slow = within(s, `slow:${crew}`, D.slowDays, from, to), exempt = within(s, `exempt:${crew}`, D.exemptDays, from, to);
  return (to - from) * daily - slow * factoryPoints(s.crews[crew]) * (1 - D.slow) + exempt * daily * D.exempt;
}

/** Parts after some points of work: condition restored first (most worn first), then the rest by the shares. */
export function worked(parts: readonly Part[], points: number, shares: readonly YardShare[], factors: (p: Part) => { perf: number; reliability: number }): Part[] {
  let left = points;
  const out = parts.map((p) => ({ ...p }));
  for (const p of [...out].filter((x) => x.ship !== null && x.condition < 1).sort((a, b) => a.condition - b.condition || a.id - b.id)) {
    const need = (1 - p.condition) / Y.condition;
    const used = Math.min(left, need);
    p.condition = Math.min(1, Math.round((p.condition + used * Y.condition) * 1000) / 1000);
    left -= used;
    if (left <= 0) break;
  }
  if (left <= 0) return out;
  for (const sh of shares) {
    const p = out.find((x) => x.id === sh.part);
    if (!p || p.ship === null || p.spec) continue;
    const f = factors(p);
    p.perf = Math.min(p.perfMax, Math.round((p.perf + left * sh.perf * Y.perf * f.perf) * 10) / 10);
    p.reliability = Math.min(p.reliabilityMax, Math.round((p.reliability + left * sh.reliability * Y.reliability * f.reliability) * 1000) / 1000);
  }
  return out;
}

/** A state with a crew's yard work reckoned from its yardDay to today. */
export function yardTo(s: CareerState, crew: number): CareerState {
  const c = s.crews[crew];
  const days = s.day - c.yardDay;
  if (days <= 0) return s;
  const bosuns = [bosunOf(s, c, 0), bosunOf(s, c, 1)];
  const factors = (p: Part) => {
    const b = bosuns[p.ship ?? 0];
    const yard = termsFor(c.suppliers, p.type).yard;
    return { perf: perfYard(b?.perf ?? 0) * yard, reliability: reliabilityYard(b?.reliability ?? 0) * yard };
  };
  const parts = worked(c.parts, yardWork(s, crew, c.yardDay, s.day), c.yard, factors);
  const crews = [...s.crews];
  crews[crew] = { ...c, parts, yardDay: s.day };
  return { ...s, crews };
}

/** Every crew's yard brought to today (section 13 calls it before race cards are made). */
export const yardsTo = (s: CareerState): CareerState => s.crews.reduce((acc, c) => yardTo(acc, c.id), s);

/** Whether a split of the yard's points is one the crew may set: its own fitted non-spec parts, each named once, each
 *  share 0..1, all the shares together at most 1. */
export function yardCheck(s: CareerState, crew: number, shares: readonly YardShare[]): Check {
  if (!Array.isArray(shares)) return why('shares', 'The yard needs a split.');
  const c = s.crews[crew];
  const seen = new Set<number>();
  let total = 0;
  for (const sh of shares) {
    const ok = (x: unknown) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1;
    if (!sh || !ok(sh.perf) || !ok(sh.reliability)) return why('shares', 'Each share is between none and all of the points.');
    const p = c.parts.find((x) => x.id === sh.part);
    if (!p || p.ship === null) return why('part', 'The yard works only on your fitted parts.');
    if (p.spec) return why('spec', 'A standard part is never improved.');
    if (seen.has(sh.part)) return why('twice', 'Name each part once.');
    seen.add(sh.part);
    total += sh.perf + sh.reliability;
  }
  if (total > 1 + 1e-9) return why('over', 'The shares come to more than the yard\'s points.');
  return null;
}

/** A state with a crew's split set (checked first): the work so far reckoned on the old split. */
export function yardSet(s: CareerState, crew: number, shares: readonly YardShare[]): CareerState {
  const out = yardTo(s, crew);
  const crews = [...out.crews];
  crews[crew] = { ...out.crews[crew], yard: shares.map((x) => ({ part: x.part, perf: x.perf, reliability: x.reliability })) };
  return { ...out, crews };
}

export const YARD: Handlers = {
  SetYard: (s, c) => {
    const me = mine(s);
    if (me === null) return refuse('sacked', 'You have no crew: take one of the posts offered.');
    const no = yardCheck(s, me, c.shares);
    return no ? refuse(no.code, no.sentence) : accept(yardSet(s, me, c.shares));
  },
};
