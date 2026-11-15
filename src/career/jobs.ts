// The player's job offers (Phase B section 7, D22): TakeJob moves the player to the crew: they sail its ship one, its
// weaker captain is released, its manager goes to the free agents, its talks under way end, and the old crew's elder
// hires a replacement. The player's colours and emblem stay with the old crew. DeclineJob lets the crew's elder hire
// elsewhere; a sacked player must take one of the offers shown and cannot decline the last.

import { accept, refuse, whole, why, type Check, type Handlers } from './command.ts';
import { released } from './contracts.ts';
import type { Dice } from './dice.ts';
import { hireManager } from './elders.ts';
import { endTalk } from './hiring.ts';
import { unscheduled, type Event } from './queue.ts';
import { stars } from './stars.ts';
import type { CareerState, Crew, Hands } from './state.ts';
import { TUNING } from './tuning.ts';

/** Whether the player may take a crew's offered post now. */
export function takeCheck(s: CareerState, crew: number): Check {
  const p = s.player;
  if (!p) return why('unfounded', 'Found a crew first.');
  if (!whole(crew, 0, s.crews.length - 1)) return why('noOffer', 'No such crew.');
  const o = p.offers.find((x) => x.crew === crew);
  if (!o) return why('noOffer', 'That crew has not offered you its post.');
  if (!p.sacked && s.day > o.expires) return why('lapsed', 'That offer has lapsed.');
  if (s.race !== null) return why('raceDay', 'It is race day: sail it first.');
  return null;
}

/** A state with every talk of a crew ended. */
const talksOf = (s: CareerState, crew: number): CareerState => s.talks.filter((t) => t.crew === crew).reduce((acc, t) => endTalk(acc, crew, t.gull), s);

/** A state with offers taken off the player's list (their lapse events too), the crews' open posts filled. */
function withdrawn(s: CareerState, crews: readonly number[], roll: Dice): CareerState {
  const set = new Set(crews);
  let out = unscheduled(s, (e: Event) => e.kind === 'jobExpires' && set.has(e.crew));
  out = { ...out, player: { ...out.player!, offers: out.player!.offers.filter((o) => !set.has(o.crew)) } };
  for (const c of crews) out = hireManager(out, c, roll, false);
  return out;
}

/** A state with the player moved to a crew (checked first). */
export function taken(s: CareerState, crew: number, roll: Dice): CareerState {
  const p = s.player!;
  const old = p.sacked ? null : p.crew;
  let out = talksOf(s, crew);
  if (old !== null) {
    out = talksOf(out, old);
    const o = out.crews[old];
    out = withCrew(out, { ...o, player: false, staff: { ...o.staff, manager: null } });
  }
  const was = out.crews[crew].staff.manager;
  if (was !== null) out = released(out, was);
  // its captains: the stronger sails ship two, the weaker is released; ship one is the player's
  const caps = out.crews[crew].staff.ships.map((h) => h.captain).filter((x): x is number => x !== null);
  const [stronger, weaker] = [...caps].sort((a, b) => stars(out.gulls[b]) - stars(out.gulls[a]) || a - b);
  if (weaker !== undefined) out = released(out, weaker);
  const c = out.crews[crew];
  const ships: [Hands, Hands] = [{ captain: null, bosun: c.staff.ships[0].bosun }, { captain: stronger ?? null, bosun: c.staff.ships[1].bosun }];
  out = withCrew(out, { ...c, player: true, bonds: [0, 0], confidence: TUNING.crew.confidence, staff: { ...c.staff, manager: p.gull, ships } });
  const gulls = [...out.gulls];
  if (stronger !== undefined) gulls[stronger] = { ...gulls[stronger], contract: { ...gulls[stronger].contract!, status: 'ship' } };
  gulls[p.gull] = { ...gulls[p.gull], contract: { crew, status: 'staff', wage: 0, fee: 0, ends: null, podium: 0, sinking: 0, breakClause: null, signed: s.day } };
  out = { ...out, gulls, player: { ...p, crew, sacked: false } };
  const others = p.offers.map((o) => o.crew);
  out = withdrawn(out, others, roll);
  return old === null ? out : hireManager(out, old, roll, false);
}

const withCrew = (s: CareerState, c: Crew): CareerState => {
  const crews = [...s.crews];
  crews[c.id] = c;
  return { ...s, crews };
};

/** Whether the player may decline a crew's offer. */
export function declineCheck(s: CareerState, crew: number): Check {
  const p = s.player;
  if (!p) return why('unfounded', 'Found a crew first.');
  if (!p.offers.some((o) => o.crew === crew)) return why('noOffer', 'That crew has not offered you its post.');
  if (p.sacked && p.offers.length === 1) return why('mustTake', 'You have no crew: take this post.');
  return null;
}

/** A job offer's last day passes: it lapses, and the crew's elder hires elsewhere. */
export function jobLapses(s: CareerState, e: Extract<Event, { kind: 'jobExpires' }>, roll: Dice): CareerState {
  const p = s.player;
  if (!p || p.sacked || !p.offers.some((o) => o.crew === e.crew)) return s;
  return withdrawn(s, [e.crew], roll);
}

export const JOBS_TAKEN: Handlers = {
  TakeJob: (s, c, roll) => {
    const no = takeCheck(s, c.crew);
    return no ? refuse(no.code, no.sentence) : accept(taken(s, c.crew, roll));
  },
  DeclineJob: (s, c, roll) => {
    const no = declineCheck(s, c.crew);
    return no ? refuse(no.code, no.sentence) : accept(withdrawn(s, [c.crew], roll));
  },
};
