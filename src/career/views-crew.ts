// `crew` (Phase C batch 2): the roster by role, its wages and open posts, the bonds, and the flight at its jobs with
// their order. Pure, read-side; the order's moves are whole race plans (SetPlan is the one command that sets it).

import type { Plan } from '../office.ts';
import type { CrewView, FlightRow, OrderRow, RosterRow } from '../office-people.ts';
import type { Job } from '../race.ts';
import { effective } from './effective.ts';
import { perRace, wages } from './money.ts';
import { planCheck } from './raceday.ts';
import type { Gull, GullOf } from './roles.ts';
import { JOBS, bondLevel, jobBotch, jobRate, fatigueOn, rating } from './service.ts';
import type { CareerState, Crew } from './state.ts';
import { trait } from './traits.ts';
import { TUNING } from './tuning.ts';
import { JOB_NAMES, ROLE_NAMES, ageOf, endsText, openPosts, postOf, seen, wageText } from './views-gull.ts';
import { coinText, crewOf, faceOf, fig, line, nameOf, rival, topBar } from './views.ts';

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** A gull's line of the roster. */
function gullRow(s: CareerState, c: Crew, g: Gull, you = false): RosterRow {
  const v = seen(s, c.id, g.id);
  return {
    kind: 'gull', id: g.id, you, title: you ? `${nameOf(g)} (you)` : nameOf(g), face: faceOf(s, g), post: you ? 'Ship one' : postOf(s, g), age: String(ageOf(s, g)),
    stars: v.stars, potential: v.potential, morale: you ? null : Math.round(g.morale),
    wage: you ? '—' : wageText(g.contract?.wage ?? 0), ends: you ? '—' : endsText(s, g), tags: g.traits.map((t) => trait(t).name), find: null,
  };
}
const head = (title: string): RosterRow => ({ kind: 'head', id: null, you: false, title, face: null, post: '', age: '', stars: null, potential: null, morale: null, wage: '', ends: '', tags: [], find: null });
const open = (o: ReturnType<typeof openPosts>[number]): RosterRow => ({ ...head(o.label), kind: 'open', post: 'Open', find: { role: o.role, status: o.status } });

/** The roster: the captains (the player first, as ship one's), bosuns, shipwright, scouts, flight, and the elder. */
function roster(s: CareerState, c: Crew): RosterRow[] {
  const g = (id: number | null) => (id === null ? null : s.gulls[id]);
  const posts = openPosts(s, c), opens = (role: string) => posts.filter((p) => p.role === role).map(open);
  const rows: RosterRow[] = [head('Captains')];
  const me = s.player ? s.gulls[s.player.gull] : null;
  if (me && c.player) rows.push(gullRow(s, c, me, true));
  for (const x of [g(c.staff.ships[1].captain), g(c.staff.reserve)]) if (x) rows.push(gullRow(s, c, x));
  rows.push(...opens('captain'), head('Bosuns'));
  for (const h of c.staff.ships) { const b = g(h.bosun); if (b) rows.push(gullRow(s, c, b)); }
  rows.push(...opens('bosun'), head('Shipwright'));
  const w = g(c.staff.shipwright);
  if (w) rows.push(gullRow(s, c, w));
  rows.push(...opens('shipwright'), head('Scouts'), ...c.staff.scouts.map((id) => gullRow(s, c, s.gulls[id])), ...opens('scout'), head('Flight'));
  const order = (x: Gull) => JOBS.indexOf(x.job ?? 'part');
  rows.push(...c.staff.flight.map((id) => s.gulls[id]).sort((a, b) => order(a) - order(b)).map((x) => gullRow(s, c, x)), ...opens('flight'));
  rows.push(head('Elder'), gullRow(s, c, s.gulls[c.staff.elder]));
  return rows;
}

/** A flight gull at their job: rating (against the best of the four at it), fatigue, rate and botch. */
function flightRow(s: CareerState, c: Crew, g: GullOf<'flight'>, four: readonly GullOf<'flight'>[]): FlightRow {
  const job: Job = g.job ?? 'mend', st = effective(g, null), loft = c.buildings.flightLoft.level;
  const r = rating(st, job), tired = fatigueOn(g, s.day, loft);
  const best = four.map((x) => ({ x, r: rating(effective(x, null), job) })).sort((a, b) => b.r - a.r)[0];
  const weights = TUNING.flight.weights[job] as Readonly<Record<string, number>>;
  const rate = jobRate(r, tired), fresh = jobRate(r, 0), botch = jobBotch(st.precision, tired), rested = jobBotch(st.precision, 0);
  return {
    id: g.id, face: faceOf(s, g), name: nameOf(g), job, jobName: JOB_NAMES[job],
    rating: fig(Math.round(r * 100), String(Math.round(r * 100)), rival('best', String(Math.round(best.r * 100))),
      { title: `${JOB_NAMES[job]} rating`, lines: [line(`Best of the four: ${nameOf(best.x)}`, Math.round(best.r * 100)), ...Object.entries(weights).map(([k, w]) => line(`${k[0].toUpperCase()}${k.slice(1)} ${(st as Readonly<Record<string, number>>)[k]} × ${w}`, Math.round(w * (st as Readonly<Record<string, number>>)[k] / 20 * 100)))] }),
    fatigue: fig(Math.round(tired), String(Math.round(tired)), rival('a day', `−${Math.round(TUNING.flight.recovery * (1 + loft))}`),
      { title: 'Fatigue', lines: [line('After the last race', Math.round(g.fatigue)), line('Recovered since', Math.round(g.fatigue - tired)), line('Flight loft level', loft)] }),
    rate: fig(rate, rate.toFixed(2), rival('rested', fresh.toFixed(2)),
      { title: 'Work rate', lines: [line('Base', TUNING.flight.base), line('Rating', r.toFixed(2)), line('Lost to fatigue', `−${pct(TUNING.flight.tired * tired / 100)}`)] }),
    botch: fig(botch, pct(botch), rival('rested', pct(rested)),
      { title: 'Botch chance', lines: [line('From Precision', pct(rested)), line('From fatigue', pct(botch - rested))] }),
    moves: JOBS.filter((j) => j !== job).map((j) => ({ job: j, label: JOB_NAMES[j] })),
  };
}

/** A whole race plan to carry a new flight order: the plan set, else one drawn from the crew as it stands (ship two's
 *  captain, the reserve if she has none; the jobs as worked; no parts moved; no objectives). Null if none can be. */
export function planDraft(s: CareerState, c: Crew): Plan | null {
  if (c.plan) return c.plan;
  const captain = c.staff.ships[1].captain ?? c.staff.reserve;
  const jobs: Partial<Record<Job, number>> = {};
  for (const id of c.staff.flight) { const j = s.gulls[id].job; if (j) jobs[j] = id; }
  if (captain === null || JOBS.some((j) => jobs[j] === undefined)) return null;
  return { captain, parts: [], stance: 'hold', order: [...JOBS], jobs: jobs as Record<Job, number>, objectives: [], call: 'withMe' };
}

/** The flight's order, each job with the plans that move it a place up or down; and why it cannot move, if not. */
function order(s: CareerState, c: Crew): { rows: OrderRow[]; why: string | null } {
  const plan = planDraft(s, c), list = plan?.order ?? JOBS;
  const no = plan === null ? 'Ship two needs a captain and every job a flight gull before the order can change.' : planCheck(s, c.id, plan)?.sentence ?? null;
  const swapped = (i: number, k: number): Plan | null => {
    if (!plan || no || k < 0 || k >= list.length) return null;
    const o = [...list];
    [o[i], o[k]] = [o[k], o[i]];
    return { ...plan, order: o };
  };
  const who = (j: Job) => c.staff.flight.map((id) => s.gulls[id]).find((g) => g.job === j);
  return { why: no, rows: list.map((j, i) => ({ job: j, label: JOB_NAMES[j], who: who(j) ? nameOf(who(j)!) : 'Nobody', up: swapped(i, i - 1), down: swapped(i, i + 1) })) };
}

/** `crew`. */
export function crewView(s: CareerState): CrewView {
  const c = crewOf(s), total = wages(s, c), money = perRace(s, c.id), income = money.pay + money.patrons + money.fish;
  const byRole = new Map<string, number>();
  for (const id of [c.staff.ships[1].captain, c.staff.reserve, ...c.staff.ships.map((h) => h.bosun), c.staff.shipwright, ...c.staff.scouts, ...c.staff.flight]) {
    if (id === null) continue;
    const g = s.gulls[id];
    byRole.set(ROLE_NAMES[g.role], (byRole.get(ROLE_NAMES[g.role]) ?? 0) + (g.contract?.wage ?? 0));
  }
  const levels = TUNING.bond.levels, top = levels[levels.length - 1];
  const four = c.staff.flight.map((id) => s.gulls[id] as GullOf<'flight'>);
  const o = order(s, c);
  return {
    top: topBar(s), roster: roster(s, c),
    wages: fig(total, coinText(total), rival('income a race', coinText(income)),
      { title: 'Wages a race', lines: [...[...byRole].map(([k, n]) => line(k, coinText(n))), line('Income a race', coinText(income))] }),
    open: openPosts(s, c),
    bonds: c.bonds.map((b, ship) => {
      const level = bondLevel(b), next = levels[level] ?? null;
      return { ship: ship as 0 | 1, label: ship === 0 ? 'Ship one' : 'Ship two', fill: Math.min(100, (b / top) * 100),
        bond: fig(b, `Level ${level} of ${levels.length}`, next === null ? rival('the', 'strongest bond') : rival('next at', `${next} races`),
          { title: 'Bond', lines: [line('Races together', b), ...levels.map((at, i) => line(`Level ${i + 1} at`, `${at} races`))] }) };
    }),
    flight: four.map((g) => flightRow(s, c, g, four)).sort((a, b) => JOBS.indexOf(a.job) - JOBS.indexOf(b.job)),
    order: o.rows, orderWhy: o.why,
  };
}
