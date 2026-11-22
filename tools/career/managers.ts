// The scripted managers of the career's harness (MANAGER.md 4 and 6): what each sends at a stop, as the player's own
// commands, journaled like any other.
//
// - idle: nothing (never spends, never hires): its contracts run out, its chairman's confidence with them.
// - sensible: decides as a rival manager does (career/rivals.ts ROWS, each through the player's own checks), with a
//   Mind of its own on the player's team: steady, 10 in every manager's stat.
// - shrewd: the same rows as an engineer of 16 in every stat.
//
// The rows are run on the state as it stands, one by one, and what each changed for the player's team is read back
// as the commands that make that change (an offer, a scouting, the improvement, a design's deals and start, a
// building, a sponsor, a supplier, a vote). The commands then go through apply: one the career refuses is counted,
// never forced. Besides the rows, both fit a part built where it beats the worse of the ships' parts of its type (as
// design.ts fits a rival's), meet a counter of at most TUNING.rivals.counterMost of the ask, and choose each
// objective sponsor's first objective in a race plan of the team's drivers as they stand.

import type { Command, Personality } from '../../src/office/command.ts';
import { SHIPS } from '../../src/office/command.ts';
import { askWage } from '../../src/career/asks.ts';
import { dice } from '../../src/career/dice.ts';
import { designSlots } from '../../src/career/hq.ts';
import { knownTo } from '../../src/career/knowledge.ts';
import { commitment } from '../../src/career/leadership.ts';
import { maySail } from '../../src/career/lineup.ts';
import { roomOf } from '../../src/career/money.ts';
import { ROWS, rowsFor, type Mind } from '../../src/career/rivals.ts';
import type { CareerState, Team } from '../../src/career/state.ts';
import { TRADES } from '../../src/career/suppliers.ts';
import { TUNING } from '../../src/career/tuning.ts';
import { BUILDINGS } from '../../src/career/world.ts';
import { canonical } from '../../src/career/canon.ts';
import { TEAM } from '../../src/race.ts';

export type Manager = 'idle' | 'sensible' | 'shrewd';
export const MANAGERS: readonly Manager[] = ['idle', 'sensible', 'shrewd'];

/** A scripted manager's mind: its personality and the one value of every stat. */
const SCRIPTS: Readonly<
  Record<Exclude<Manager, 'idle'>, { personality: Personality; stat: number }>
> = {
  sensible: { personality: 'steady', stat: 10 },
  shrewd: { personality: 'engineer', stat: 16 },
};

/** The player's team's Mind for a script, as rivals.ts mindOf makes a rival's. */
function mindFor(
  s: CareerState,
  team: number,
  person: number,
  script: { personality: Personality; stat: number }
): Mind {
  const v = script.stat,
    c = s.teams[team];
  const room =
    Math.min(roomOf(s, team, v), commitment(v, c.balance, c.debtFloor)) *
    TUNING.rivals.personalities[script.personality].spend;
  let seen: readonly number[] | null = null;
  return {
    team,
    manager: person,
    stats: {
      negotiation: v,
      talentEye: v,
      development: v,
      finance: v,
      tactics: v,
      politics: v,
    },
    personality: script.personality,
    room,
    known: () =>
      (seen ??= knownTo(s, team).filter((id) => {
        const x = s.people[id];
        return x.contract?.team !== team && x.retired === null && !x.player;
      })),
  };
}

/** The commands that make what a row changed for a team, from `was` to `now`. */
function changes(was: CareerState, now: CareerState, team: number): Command[] {
  const out: Command[] = [];
  const a = was.teams[team],
    b = now.teams[team];
  const talks = new Set(was.talks.map((t) => t.id));
  for (const t of now.talks)
    if (t.team === team && !talks.has(t.id))
      out.push({ kind: 'OfferContract', person: t.person, offer: t.offer });
  const scouting = new Set(was.scouting.map((x) => `${x.scout}:${x.person}`));
  for (const x of now.scouting)
    if (x.team === team && !scouting.has(`${x.scout}:${x.person}`))
      out.push({ kind: 'StartScout', scout: x.scout, person: x.person });
  if (canonical(a.improvement) !== canonical(b.improvement))
    out.push({ kind: 'SetImprovement', shares: b.improvement });
  if (!a.design && b.design) out.push(...designed(a, b));
  for (const building of BUILDINGS)
    if (b.buildings[building].next && !a.buildings[building].next)
      out.push({ kind: 'Build', building });
  for (const [slot, p] of b.sponsors.entries())
    if (p && p.id !== a.sponsors[slot]?.id)
      out.push({ kind: 'SignSponsor', offer: p.id, slot });
  for (const trade of TRADES) {
    const id = b.suppliers[trade];
    if (id !== null && id !== a.suppliers[trade])
      out.push({ kind: 'ChooseSupplier', trade, supplier: id });
  }
  const tier = b.tier;
  for (const p of now.championships[tier].proposals) {
    const side = p.votes[team];
    const before = was.championships[tier].proposals.find((x) => x.id === p.id);
    if (side !== undefined && before?.votes[team] === undefined)
      out.push({ kind: 'Vote', proposal: p.id, side });
  }
  return out;
}

/** A design begun by a row: each slot not yet dealt of its type dealt, then the design started with the row's cards. */
function designed(a: Team, b: Team): Command[] {
  const d = b.design;
  if (!d) return [];
  const out: Command[] = [];
  const dealt =
    a.draft?.type === d.type ? a.draft.deals.map((x) => x.slot) : [];
  for (let slot = 0; slot < designSlots(a); slot++)
    if (!dealt.includes(slot))
      out.push({ kind: 'DealComponents', type: d.type, slot });
  out.push({
    kind: 'StartDesign',
    type: d.type,
    components: d.components,
    forNext: d.forNext,
  });
  return out;
}

/** The rows' commands for the player's team. */
function rowCommands(
  s: CareerState,
  team: number,
  person: number,
  script: { personality: Personality; stat: number }
): Command[] {
  let mind = mindFor(s, team, person, script),
    at = s;
  const roll = dice(s.seed, s.streams),
    out: Command[] = [];
  for (const row of rowsFor(script.personality)) {
    const act = ROWS[row];
    if (!act) continue;
    const r = act(at, mind, roll);
    out.push(...changes(at, r.state, team));
    at = r.state;
    mind = r.mind;
  }
  return out;
}

/** Each part built and not fitted, onto the ship whose part of its type is the worse, if it beats it. */
function fittings(c: Team): Command[] {
  const out: Command[] = [];
  for (const p of c.parts) {
    if (p.ship !== null || p.forNext) continue;
    const worst = SHIPS.map((ship) => ({
      ship,
      perf:
        c.parts.find((q) => q.ship === ship && q.type === p.type)?.perf ?? 0,
    })).reduce((x, y) => (y.perf < x.perf ? y : x));
    if (p.perf > worst.perf)
      out.push({ kind: 'FitPart', part: p.id, ship: worst.ship });
  }
  return out;
}

/** Each counter of at most counterMost of the person's ask, met. */
function counters(s: CareerState, c: Team): Command[] {
  return s.talks.flatMap((t) =>
    t.team === c.id &&
    t.counter !== null &&
    t.counter.wage <=
      askWage(s.people[t.person], c.tier) * TUNING.rivals.counterMost
      ? [{ kind: 'AcceptCounter', person: t.person } satisfies Command]
      : []
  );
}

/** On race day, a plan of the drivers as they stand that chooses each objective sponsor's first objective. */
function plan(s: CareerState, c: Team): Command[] {
  if (s.race === null || s.race.started) return [];
  if (!c.sponsors.some((p) => p && p.objectives.length > 0)) return [];
  // the ships' drivers, an unfit one replaced by the reserve if she may sail
  let reserve = c.staff.reserve;
  const drivers: number[] = [];
  for (const h of c.staff.ships.slice(1, TEAM)) {
    if (h.driver !== null && maySail(s, c.id, h.driver)) drivers.push(h.driver);
    else if (reserve !== null && maySail(s, c.id, reserve)) {
      drivers.push(reserve);
      reserve = null;
    } else return [];
  }
  return [
    {
      kind: 'SetPlan',
      plan: {
        drivers,
        parts: [],
        objectives: c.sponsors.map((p) =>
          p && p.objectives.length > 0 ? 0 : null
        ),
        call: c.plan?.call ?? 'free',
      },
    },
  ];
}

/** What a manager sends at a stop (before race day's race, or before Advance). */
export function commandsOf(s: CareerState, manager: Manager): Command[] {
  const p = s.player;
  if (manager === 'idle' || !p || p.sacked) return [];
  const script = SCRIPTS[manager];
  const c = s.teams[p.team];
  return [
    ...counters(s, c),
    ...rowCommands(s, p.team, p.person, script),
    ...fittings(c),
    ...plan(s, c),
  ];
}
