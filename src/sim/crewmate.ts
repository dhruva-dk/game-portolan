// The crewmate (#58 section 8.2, D39): a bot like any other, sailing by her own captain's stats and style, with a
// stance from the card and the calls of her side's first ship (ship one), which she obeys as well as her Lookout and
// Nerve allow.
//
// Her stance (race.ts Stance) is a set of weights on the bot's options (sim/handling.ts CREWMATE.stance): `hunt` raises
// roaming to seek and fighting; `hold` claiming and going home to her side's water; `loot` looting, and lowers
// fighting; `shadow` keeps her within CREWMATE.near m of ship one, fighting what ship one fights.
//
// A call (race.ts Call) is plain input like a helm (captain.ts Lead): play/ passes it in, and she records it on her
// memory. She notices it CREWMATE.notice × (1.2 − Lookout's u) s after it is given; it lasts until another call, or
// CREWMATE.lasts s, and then she goes back to her stance. `withMe`: she shadows ship one. `attack`: she goes for the ship
// ship one fought as it was called, wherever it is, until it sinks; a captain of Nerve below CREWMATE.breaks may break
// off to run once her own `run` is crossed, as she would without a call. `hold`: back to her side's water, and she
// holds it. `free`: back to her stance.
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs.

import type { Call, Stance } from '../race.ts';
import { distance } from '../world/sphere.ts';
import { CREWMATE } from './handling.ts';
import type { Ctx, Mode, Seen } from './captain.ts';
import { circle, inOwn } from './claimer.ts';

/** The seconds she takes to notice a call, by her Lookout (Temper.lookout, on skill's scale: 0.35 + 0.55 u). */
export const noticeDelay = (lookout: number) => CREWMATE.notice * (1.2 - (lookout - 0.35) / 0.55);

/** Notes a call given since she last looked (each step): from when she notices it to when it lapses. */
export function heed(c: Ctx): void {
  const lead = c.hand.lead, m = c.m;
  if (!lead || lead.seq <= m.heard) return;
  m.heard = lead.seq;
  m.call = lead.call === 'free' ? null : lead.call;
  m.callFor = lead.at;
  m.callFrom = m.clock + noticeDelay(c.t.lookout);
  m.callTo = m.callFrom + CREWMATE.lasts;
}

/** The call she obeys now, if any: noticed, not lapsed. */
export const obeyed = (c: Ctx): Call | null => (c.m.call && c.m.clock >= c.m.callFrom && c.m.clock < c.m.callTo ? c.m.call : null);

/** The weight a stance puts on an option of `mode` (1 with none). */
export const stanceOn = (stance: Stance | undefined, mode: Mode): number => (stance ? CREWMATE.stance[stance][mode] ?? 1 : 1);

/** Ship one, afloat, if she has a lead. */
const leader = (c: Ctx): Seen | null => {
  const id = c.hand.lead?.id;
  return id === undefined || id === c.own.id ? null : c.others.find((o) => o.id === id) ?? null;
};

/** Whether she shadows ship one now: by a `withMe` call, or by her stance with no call in force. */
const shadowing = (c: Ctx) => obeyed(c) === 'withMe' || (c.hand.stance === 'shadow' && !obeyed(c));

/** The foe a call or her shadowing gives her (perceive's, before her own eyes): an attack's ship while it is afloat;
 *  shadowing, the ship ship one fights, when it is within her sight. */
export function calledFoe(c: Ctx, sight: number): Seen | null {
  const call = obeyed(c);
  if (call === 'attack') return c.others.find((o) => o.id === c.m.callFor) ?? null;
  const target = c.hand.lead?.target ?? -1;
  if (!shadowing(c) || target < 0) return null;
  const o = c.others.find((k) => k.id === target);
  return o && distance(c.own.ship.at, o.ship.at) <= sight ? o : null;
}

/** How much she wants to close on ship one: shadowing and further than CREWMATE.near from her, wholly by a call and
 *  `stanced` of that by her stance; nearer, a little, so she keeps by her when nothing else calls. */
export function shadowUrge(c: Ctx): number {
  const one = leader(c);
  if (!one || !shadowing(c)) return 0;
  return (distance(c.own.ship.at, one.ship.at) > CREWMATE.near ? 1 : 0.3) * (obeyed(c) === 'withMe' ? 1 : CREWMATE.stanced);
}

/** Makes for ship one. */
export function shadowAct(c: Ctx): void {
  c.m.goal = leader(c)?.ship.at ?? c.m.goal;
}

/** How much an attack call is worth to her: wholly, while its ship is afloat; but a captain of Nerve below
 *  CREWMATE.breaks, losing (her hull past her `run`), lets it go to run. */
export function attackUrge(c: Ctx, losing: number): number {
  if (obeyed(c) !== 'attack' || !c.others.some((o) => o.id === c.m.callFor)) return 0;
  return (c.hand.nerve ?? 20) < CREWMATE.breaks && losing > 0.5 ? 0 : 1;
}

/** How much a hold call is worth to her: wholly, while it is in force. */
export const holdUrge = (c: Ctx): number => (obeyed(c) === 'hold' && !!c.sea.holdings ? 1 : 0);

/** Back to her side's water, and round in it. */
export function holdAct(c: Ctx): void {
  c.m.goal = inOwn(c) ? circle(c) : c.m.haven;
}
