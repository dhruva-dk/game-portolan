import { siteValue } from '../economy.ts';
import { aground, currentAt, tideOf, type Sea } from '../environment.ts';
import { bound, callPrice, perched } from '../gull.ts';
import { FLAG, STEER_MAX, type ShipInput } from '../input.ts';
import { bestPick } from '../items.ts';
import { addScaled, cross, datan2, dcos, dot, dsin, hash32, normalize, rngFloat, rngInt, set, v3, type Rng, type V3 } from '../math.ts';
import { passage, type Passage } from '../opening.ts';
import { openNear } from '../route.ts';
import { velocityOf } from '../sailing.ts';
import { R, TERRITORY, angleBetween, cellDir, cellOf, tangentToward } from '../sphere.ts';
import { FLIGHT, KNOW, PHASE, SAIL, SHIPS, STREAM, TICK, afloat, fullHull, type MatchState, type Ship } from '../state.ts';
import { newStormView, stormView, type Calm } from '../storm.ts';
import {
  BATTERY, BOWS, CONSUMABLE, FITTING, FORMS, GULL, GUNS, HELM, HOME, MORTAR, PIGMENT_TIER, PILOT, SAILS, SLOT, type Gun,
} from '../tables.ts';
import { atHome, holds } from '../territory.ts';
import type { Sight } from '../visibility.ts';
import { ZONE } from '../world/geography.ts';
import { NAV, findRoute, navCellOf } from '../world/nav.ts';
import { REGIONS } from '../world/regions.ts';
import { apart, knows, newPercept, perceive } from './perception.ts';
import { lure, pressAt } from './learning.ts';
import { PATROL, patrolOf, reachOf, standoff, styleOf, wary, type Style } from './temperaments.ts';

type Captain = Ship['captain'];

export const MODE = {
  ride: 0,
  peel: 1,
  roam: 2,
  loop: 3,
  home: 4,
  find: 5,
  hold: 6,
  hunt: 7,
  fight: 8,
  ram: 9,
  flee: 10,
  storm: 11,
  face: 12,
  lurk: 13,
  stalk: 14,
  mend: 15,
} as const;

export const BRAIN = {
  react: [18, 5],
  jitter: 4,
  tell: 1.2,
  ride: 5,
  danger: 40,
  threat: [18, 36],
  engage: 1.5,
  ram: 30,
  hunt: 45,
  stalk: 90,
  loot: 40,
  wait: 35,
  lead: [4, 20],
  probe: [5, 10, 16],
  circle: 10,
  bow: 1,
  arc: 0.4,
  gap: 4,
  patch: [0.3, 0.55],
  full: 0.95,
  gentle: 30,
  mend: 120,
  mended: 0.9,
  corner: 50,
  few: 3,
  side: 0.6,
  wide: 60,
  keep: 1.3,
  detour: 2.5,
  round: 1.5,
  greed: 2,
  marks: 40,
  ahead: 20,
  rechart: [32, 60, 180, 5],
  inside: 0.4,
};

const by = (pair: readonly number[], s: number): number => pair[0] + (pair[1] - pair[0]) * s;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const share = (ship: Ship): number => ship.hull / fullHull(ship.form, ship.fittings);
export const TUNE = { shy: 0.3, scatter: 1, finish: 0.4, steal: 0.3, ram: 1.5, fin: 0.4, storm: 2 };
const byWant = (mode: number): boolean => mode === MODE.fight || mode === MODE.flee || mode === MODE.face;

export const captained = (state: MatchState, i: number): boolean => state.ships[i].captain.temperament >= 0;

export const piloted = (state: MatchState): boolean => state.ships[0].captain.temperament >= 0;

const QTR = v3();
const P = newPercept(), SV = newStormView(), PASS: Passage = { region: 0, next: -1, untilNext: 0, untilEnd: 0 };
const EMPTY: number[] = [], F = v3(), H = v3(), G = v3(), Q = v3(), T = v3(), U = v3(), V = v3(), STAR = v3(), STAR2 = v3();

function toward(p: V3, q: V3, fallback: V3, out: V3): V3 {
  if (dot(p, q) > 1 - 1e-12) return set(out, fallback.x, fallback.y, fallback.z);
  return tangentToward(p, q, out);
}

function along(p: V3, t: V3, d: number, out: V3): V3 {
  const c = dcos(d / R), s = dsin(d / R);
  return normalize(set(out, p.x * c + t.x * s, p.y * c + t.y * s, p.z * c + t.z * s));
}

function turned(t: V3, p: V3, a: number, out: V3): V3 {
  cross(STAR2, t, p);
  const c = dcos(a), s = dsin(a);
  return set(out, t.x * c + STAR2.x * s, t.y * c + STAR2.y * s, t.z * c + STAR2.z * s);
}

export function helm(state: MatchState, i: number, out: ShipInput): ShipInput {
  const ship = state.ships[i], c = ship.captain;
  out.steer = out.sail = out.flags = 0;
  out.consumable = out.aim = out.chestPick = -1;
  out.course = null;
  if (!afloat(ship) || !captained(state, i)) return out;
  out.sail = Math.sign(c.trim - ship.sail);
  c.tell = Math.max(0, c.tell - TICK);
  if (ship.phase === PHASE.riding) {
    if (c.mode === MODE.peel) out.flags = FLAG.breakOff;
    return out;
  }
  if (ship.phase === PHASE.peeling) return out;
  if (c.plan.length && c.tell === 0) {
    out.course = c.plan.slice();
    c.plan.length = 0;
    return out;
  }
  if (c.mode === MODE.home) {
    out.flags = FLAG.headHome;
    return out;
  }
  if (ship.course.length) {
    if (c.mode === MODE.loop) return out;
    out.course = EMPTY;
  }
  const pos = ship.pos;
  if (byWant(c.mode)) {
    addScaled(H, c.want, pos, -dot(c.want, pos));
    if (dot(H, H) < 1e-12) set(H, ship.head.x, ship.head.y, ship.head.z);
    normalize(H);
  } else toward(pos, c.plan.length ? cellDir(TERRITORY, c.plan[c.plan.length >> 1], Q) : c.goal, ship.head, H);
  if (c.tell > 0 && c.plan.length === 0) {
    const k = 0.7 * (c.tell / BRAIN.tell);
    addScaled(G, addScaled(G, set(G, 0, 0, 0), H, 1 - k), ship.head, k);
    if (dot(G, G) > 1e-6) normalize(set(H, G.x, G.y, G.z));
  }
  if (c.avoid !== 0) normalize(turned(set(G, H.x, H.y, H.z), pos, c.avoid, H));
  out.steer = steerFor(ship, H);
  return out;
}

function steerFor(ship: Ship, h: V3): number {
  cross(STAR, ship.head, ship.pos);
  const error = datan2(dot(h, STAR), dot(h, ship.head)), lead = FORMS[ship.form].helm + PILOT.lead;
  const want = clamp((error - ship.rate * lead) / PILOT.full, -1, 1), a = HELM.soft, m = Math.abs(want);
  const s = (Math.sqrt(a * a + 4 * (1 - a) * m) - a) / (2 * (1 - a));
  return Math.round(Math.sign(want) * Math.min(1, s) * STEER_MAX);
}

export function think(sea: Sea, state: MatchState, i: number, sight: Sight, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (!afloat(ship) || !captained(state, i)) return;
  c.since += TICK;
  if (--c.think > 0) return;
  const rng = state.rng[STREAM.captains + Math.max(0, i - 1)];
  c.think = Math.round(by(BRAIN.react, c.skill) * (c.gentle ? 1.5 : 1)) + rngInt(rng, BRAIN.jitter + 1);
  perceive(sea, state, i, sight, P);
  stormView(state, SV);
  if (ship.phase === PHASE.riding) {
    if (c.mode === MODE.ride && breaksOff(sea, state, i)) c.mode = MODE.peel;
    return;
  }
  if (ship.phase === PHASE.peeling) return;
  const hurt = ship.hull < c.felt - 1e-6;
  c.felt = ship.hull;
  act(sea, state, i, out, hurt, rng);
  decide(sea, state, i, sight, rng);
}

export function intent(state: MatchState, i: number, out: V3): V3 {
  const ship = state.ships[i], c = ship.captain.intent;
  const src = captained(state, i) && ship.phase !== PHASE.riding && dot(c, c) > 0 ? c : ship.head;
  return set(out, src.x, src.y, src.z);
}

function breaksOff(sea: Sea, state: MatchState, i: number): boolean {
  const ship = state.ships[i], t = state.tick * TICK, style = styleOf(ship), bold = style.bold;
  passage(sea, ship.ride, PASS);
  if (t < BRAIN.ride) return false;
  if (PASS.untilEnd < 3) return true;
  const c = ship.captain, sought = (c.knows & KNOW.breakOff) !== 0 && c.breakOff === PASS.region;
  if ((c.knows & KNOW.breakOff) !== 0 && c.breakOff !== PASS.region && PASS.untilEnd > 6 && lure(c, style) > 0.5 && passesOn(sea, ship.ride, c.breakOff)) return false;
  if (!sought && PASS.untilEnd > 6 && beside(state, i)) return false;
  const here = regionWorth(state, i, PASS.region) - 0.6 * Math.max(0, dot(ship.pos, state.storm.origin) - 0.6) / 0.4;
  const ahead = PASS.next >= 0 ? regionWorth(state, i, PASS.next) : -Infinity;
  return here >= 1.3 + 0.5 * (bold - 0.3) - 0.02 * t && (here >= ahead || PASS.untilNext > 12 * (1 + bold));
}

function beside(state: MatchState, i: number): boolean {
  for (let k = 0; k < SHIPS; k++) if (k !== i && knows(P, k) && afloat(state.ships[k]) && state.ships[k].phase !== PHASE.riding && apart(state.ships[i].pos, state.ships[k].pos) < BRAIN.danger) return true;
  return false;
}

const LOOK: Passage = { region: 0, next: -1, untilNext: 0, untilEnd: 0 };

function passesOn(sea: Sea, s: number, r: number): boolean {
  const t0 = passage(sea, s, LOOK).untilEnd, v = 10 / Math.max(1e-6, t0 - passage(sea, s + 10, LOOK).untilEnd);
  for (let k = 0, at = s; k < 8; k++, at += v * LOOK.untilNext + 1) {
    passage(sea, at, LOOK);
    if (LOOK.region === r) return true;
    if (LOOK.next < 0) return false;
  }
  return false;
}

function regionWorth(state: MatchState, i: number, r: number): number {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), taste = (hash32(state.seed, i * 64 + r) & 0xffff) / 0xffff;
  let w = REGIONS[r].richness * (1 + 0.5 * style.guard) + 0.4 * taste;
  if ((c.knows & KNOW.breakOff) !== 0 && c.breakOff === r) w += lure(c, style);
  return w;
}

function act(sea: Sea, state: MatchState, i: number, out: ShipInput, hurt: boolean, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, g = ship.gull, foe = P.rival, near = P.rivalD;
  const spare = foe !== 0 || !c.gentle || ship.harm[0] > 0;
  if (ship.offer.length) out.chestPick = bestPick(ship);
  out.consumable = consumable(ship, c, hurt);
  const safe = near > GULL.danger.near && share(ship) > GULL.danger.hull && rngFloat(rng) < 0.5 + 0.5 * c.skill;
  if (perched(g) && safe && ship.bank >= callPrice(sea, state, i)) out.flags |= FLAG.callGull;
  if (foe < 0 || !spare) return;
  const pressing = c.mode === MODE.fight || c.mode === MODE.ram || c.mode === MODE.hunt;
  if (g.dive > 0 && g.cool === 0 && perched(g) && pressing && near < GULL.dive.reach) out.flags |= FLAG.dive;
  const sure = c.skill >= 0.5 || (P.hulls & (1 << foe)) !== 0;
  if (ship.fittings[SLOT.stern].kind === FITTING.mortar && ship.reload[BATTERY.stern] === 0 && near < MORTAR.range && near > 3 * MORTAR.blast && sure) {
    velocityOf(sea, state.ships[foe], V);
    normalize(addScaled(Q, state.ships[foe].pos, V, (c.skill * near) / MORTAR.speed / R));
    out.flags |= FLAG.useAimed;
    out.aim = cellOf(TERRITORY, Q);
  }
}

function consumable(ship: Ship, c: Captain, hurt: boolean): number {
  const near = P.rivalD, purse = ship.purse / FORMS[ship.form].purse;
  let k = -1;
  if (ship.patch === 0 && share(ship) < by(BRAIN.patch, c.skill) && (k = slotOf(ship, CONSUMABLE.patchKit)) >= 0) return k;
  const trailAtRisk = c.skill >= 0.4 && ship.laid.length > 0 && purse > 0.5 && near < by(BRAIN.threat, c.skill);
  if (ship.ward === 0 && ((hurt && near < 30) || trailAtRisk) && (k = slotOf(ship, CONSUMABLE.ward)) >= 0) return k;
  if (c.mode === MODE.flee && ship.flask === 0 && near < 30 && (k = slotOf(ship, CONSUMABLE.fogFlask)) >= 0) return k;
  const dash = (c.mode === MODE.flee && near < 20) || (c.mode === MODE.ram && c.tell === 0 && near < 15);
  if (ship.boost === 0 && dash && (k = slotOf(ship, CONSUMABLE.gust)) >= 0) return k;
  if (ship.flare === 0 && P.ships === 0 && SV.phase >= 3 && c.mode !== MODE.flee && (k = slotOf(ship, CONSUMABLE.flare)) >= 0) return k;
  return -1;
}

function slotOf(ship: Ship, kind: number): number {
  for (let k = 0; k < ship.consumables.length; k++) if (ship.consumables[k].kind === kind && ship.consumables[k].count > 0) return k;
  return -1;
}

function decide(sea: Sea, state: MatchState, i: number, sight: Sight, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), was = c.mode, aim = c.target;
  let mode = -1;
  const prey = P.rival >= 0 && (P.hulls & (1 << P.rival)) !== 0 && share(state.ships[P.rival]) < TUNE.fin && P.rivalD < TUNE.storm * BRAIN.ram;
  if (stormGoal(sea, state, i, style) && !(style.stalk >= 0.8 && prey)) mode = MODE.storm;
  else if (waits(state, i) || flees(state, i, style)) mode = MODE.flee;
  else if (threatened(state, i, style, was)) mode = MODE.home;
  if (mode < 0 && !holdsOn(state, i, style)) mode = mends(sea, state, i, style, was);
  if (mode < 0 && keepsClear(state, i, style)) mode = MODE.roam;
  if (mode < 0 && lastFew(state)) {
    const calm = SV.announced ? SV.next : SV.calm;
    along(calm.at, toward(calm.at, ship.pos, ship.head, T), BRAIN.side * calm.r * R, c.goal);
    c.target = -1;
    mode = MODE.hold;
  }
  if (mode < 0) mode = guards(state, i, style, was, aim);
  if (mode < 0) mode = engages(sea, state, i, style);
  if (mode < 0 && style.stalk >= 0.8) mode = stalks(sea, state, i, sight, style, was, aim);
  if (mode < 0 && hunts(i, state, style, was)) mode = MODE.hunt;
  if (mode < 0 && style.stalk < 0.8) mode = stalks(sea, state, i, sight, style, was, aim);
  if (mode < 0) mode = lurks(state, i, sight, style);
  if (mode < 0) mode = loots(sea, state, i, style, was);
  if (mode < 0) mode = waylays(state, i, style);
  if (mode < 0) mode = patrols(state, i, style);
  if (mode < 0) mode = loops(sea, state, i, style, rng, was);
  if (mode !== was || c.target !== aim) {
    c.since = 0;
    if (mode === MODE.hunt || mode === MODE.ram || mode === MODE.face) c.tell = BRAIN.tell;
  }
  c.mode = mode;
  const reach = standoff(c, style, c.target) * (GUNS[ship.fittings[SLOT.broadside].kind]?.range ?? 0);
  const lying = ((mode === MODE.hold || mode === MODE.lurk) && apart(ship.pos, c.goal) < 12) || (mode === MODE.mend && berth < HOME.radius);
  c.trim = mode === MODE.fight ? ((c.target >= 0 ? apart(ship.pos, state.ships[c.target].pos) : P.rivalD) > reach || style.stalk >= 0.8 ? SAIL.full : SAIL.plain) : lying || mode === MODE.face ? SAIL.reefed : SAIL.full;
  const hasty = mode === MODE.flee || mode === MODE.storm || mode === MODE.ram;
  tight = false;
  c.avoid = mode === MODE.loop || mode === MODE.home ? 0 : clearing(sea, state, ship, style, hasty);
  if (Math.abs(c.avoid) >= 1 || tight) c.trim = SAIL.reefed;
  intend(ship);
}

const stormMargin = (c: Captain, style: Style, calm: Calm): number => Math.min(style.margin * (0.5 + 0.5 * c.skill), BRAIN.inside * calm.r * R);

function stormGoal(sea: Sea, state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain, pos = ship.pos, margin = stormMargin(c, style, SV.announced ? SV.next : SV.calm);
  const inNow = dot(pos, SV.calm.at) >= SV.calm.cos, calm: Calm = SV.announced ? SV.next : SV.calm;
  if (inNow && !SV.announced) return false;
  const d = R * angleBetween(pos, calm.at), safe = calm.r * R - margin, speed = FORMS[ship.form].speed;
  const was = c.mode === MODE.storm, beat = (state.tick + 7 * i) % BRAIN.rechart[2];
  const fresh = !was || beat < BRAIN.rechart[0] || apart(pos, c.goal) < BRAIN.rechart[3];
  if (inNow) {
    if (d <= safe) return false;
    const nowR = SV.calm.r * R, nextR = calm.r * R, frac = nowR > nextR ? clamp((nowR - d) / (nowR - nextR), 0, 1) : 0;
    const lead = by(BRAIN.lead, c.skill), spare = SV.toMove + (SV.toHold - SV.toMove) * frac;
    if ((d - safe) / speed + lead < spare) {
      if (((d - safe) * BRAIN.detour) / speed + lead < spare) return false;
      if (beat % BRAIN.rechart[1] >= BRAIN.rechart[0]) return was;
      along(calm.at, toward(calm.at, pos, ship.head, T), safe, EDGE);
      if (openWater(sea, state, ship, pos, EDGE, tideOf(state), Math.max(ship.speed, 0.5 * speed), false) || ((d - safe) * BRAIN.round) / speed + lead < spare) return false;
    }
  }
  const to = Math.max(0, Math.min(d, safe) - 0.5 * margin);
  if (lastFew(state) && inNow && P.rival >= 0) {
    toward(calm.at, state.ships[P.rival].pos, ship.head, T);
    along(calm.at, set(T, -T.x, -T.y, -T.z), safe - 0.5 * margin, c.goal);
    c.target = -1;
    return true;
  }
  if (!fresh) return true;
  if (was && apart(c.goal, calm.at) < 1e-3) {
    if (beat >= c.think) return true;
    if (openWater(sea, state, ship, pos, along(pos, toward(pos, calm.at, ship.head, T), Math.min(BRAIN.ahead, d), EDGE), tideOf(state), Math.max(ship.speed, 0.5 * speed), false)) return true;
  }
  if (chart(sea, state, ship, calm.at, to, BRAIN.detour * d + 2 * BRAIN.mend, c.goal) < 0) set(c.goal, calm.at.x, calm.at.y, calm.at.z);
  c.target = -1;
  return true;
}

const ROUTE: number[] = [], EDGE = v3(), MARK = v3(), STEP = v3(), FLOW = v3();

function openWater(sea: Sea, state: MatchState, ship: Ship, p: V3, q: V3, tide: number, way: number, shoal = true): boolean {
  const nav = sea.voyage, style = styleOf(ship);
  const n = Math.ceil(apart(p, q) / 1.5), dx = q.x - p.x, dy = q.y - p.y, dz = q.z - p.z, len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  for (let s = 1; s <= n; s++) {
    const f = s / n;
    normalize(set(STEP, p.x * (1 - f) + q.x * f, p.y * (1 - f) + q.y * f, p.z * (1 - f) + q.z * f));
    if (!(nav.level[navCellOf(STEP)] < tide) || (shoal && hazard(sea, state, ship, style, STEP, false))) return false;
    if (s % 4 === 1 && (currentAt(sea, STEP, FLOW).x * dx + FLOW.y * dy + FLOW.z * dz) / len < -(1 - PILOT.stem) * way) return false;
  }
  return true;
}

function chart(sea: Sea, state: MatchState, ship: Ship, to: V3, within: number, limit: number, out: V3): number {
  const nav = sea.voyage, tide = tideOf(state), pos = ship.pos, d = R * angleBetween(pos, to), way = Math.max(ship.speed, 0.5 * FORMS[ship.form].speed);
  if (d <= within) {
    set(out, to.x, to.y, to.z);
    return 0;
  }
  along(to, toward(to, pos, ship.head, T), within, EDGE);
  if (openWater(sea, state, ship, pos, EDGE, tide, way, false)) {
    set(out, EDGE.x, EDGE.y, EDGE.z);
    return d - within;
  }
  const from = openNear(nav.level, pos, tide), cos = dcos(within / R);
  if (from < 0) return -1;
  const cost = findRoute(nav, from, tide, (k) => dot(cellDir(NAV, k, MARK), to) >= cos, to, ROUTE, limit, BRAIN.greed);
  if (cost < 0) return -1;
  let k = Math.min(1, ROUTE.length - 1);
  for (let j = 2; j < Math.min(ROUTE.length, BRAIN.marks); j *= 2) {
    if (!openWater(sea, state, ship, pos, cellDir(NAV, ROUTE[j], MARK), tide, way, false)) break;
    k = j;
  }
  cellDir(NAV, ROUTE[k], out);
  return cost;
}

let berth = Infinity;

function mends(sea: Sea, state: MatchState, i: number, style: Style, was: number): number {
  const ship = state.ships[i], c = ship.captain;
  if (share(ship) >= (was === MODE.mend ? BRAIN.mended : style.mend)) return -1;
  const calm = SV.announced ? SV.next : SV.calm, inside = dcos(Math.max(0, calm.r - stormMargin(c, style, calm) / R));
  let best = BRAIN.mend, at: V3 | null = null;
  for (const h of sea.geo.harbours) {
    const d = apart(ship.pos, h.pos);
    if (d < best && dot(h.pos, calm.at) >= inside) [best, at] = [d, along(h.pos, h.facing, 0.5 * h.r, F)];
  }
  const lagoon = sea.geo.landmarks.find((l) => l.perk === 'greatLagoon');
  if (lagoon !== undefined && holds(sea, state, i, 'greatLagoon') && apart(ship.pos, lagoon.pos) < best) [best, at] = [apart(ship.pos, lagoon.pos), lagoon.pos];
  if (at === null && state.owner[cellOf(TERRITORY, c.anchor)] === i + 1 && dot(c.anchor, calm.at) >= inside) at = c.anchor;
  if (at === null || (at !== c.anchor && ship.laid.length > 0 && apart(ship.pos, c.anchor) < best)) return -1;
  berth = apart(ship.pos, at);
  const beat = (state.tick + 7 * i) % BRAIN.rechart[2], way = Math.max(ship.speed, 0.5 * FORMS[ship.form].speed), charted = apart(c.goal, at) > 1e-3;
  const fresh = was !== MODE.mend || berth < HOME.radius || (charted && apart(ship.pos, c.goal) < BRAIN.rechart[3]) || (beat < c.think && (!charted || !openWater(sea, state, ship, ship.pos, c.goal, tideOf(state), way, false)));
  if (fresh && chart(sea, state, ship, at, HOME.radius, BRAIN.detour * berth + BRAIN.mend, c.goal) < 0) set(c.goal, at.x, at.y, at.z);
  c.target = -1;
  return MODE.mend;
}

function waits(state: MatchState, i: number): boolean {
  const ship = state.ships[i], c = ship.captain, r = P.rival;
  if (r < 0 || !lastFew(state) || P.rivalD > BRAIN.wide) return false;
  const calm = SV.announced ? SV.next : SV.calm, d = R * angleBetween(ship.pos, calm.at);
  toward(ship.pos, state.ships[r].pos, ship.head, T);
  set(c.want, -T.x, -T.y, -T.z);
  if (d > 0.6 * calm.r * R) normalize(addScaled(c.want, c.want, toward(ship.pos, calm.at, ship.head, U), 1.2));
  return true;
}

const lastFew = (state: MatchState): boolean => SV.calm.r * R > BRAIN.corner && state.sunk.length >= SHIPS - BRAIN.few && afloatN(state) <= BRAIN.few;

function afloatN(state: MatchState): number {
  let n = 0;
  for (let k = 0; k < SHIPS; k++) if (afloat(state.ships[k])) n++;
  return n;
}

function holdsOn(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], mine = share(ship);
  if (style.guard >= 0.5 && P.rival >= 0 && intrudes(state, i, P.rival)) return true;
  if (style.stalk === 0) return false;
  const weak = TUNE.fin, far = TUNE.storm * BRAIN.ram;
  for (let k = 0; k < SHIPS; k++) {
    const r = state.ships[k];
    if (k === i || (P.hulls & (1 << k)) === 0 || !afloat(r)) continue;
    const h = share(r);
    if (h < weak && mine > h + 0.1 && power(ship) > 1.1 * power(r) && apart(ship.pos, r.pos) < far) return true;
  }
  return false;
}

function flees(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  const r = P.rival, prey = r >= 0 && (P.hulls & (1 << r)) !== 0 ? share(state.ships[r]) : 1;
  if (style.stalk >= 0.8 && prey < TUNE.finish && prey < share(ship)) return false;
  const outgunned = style.stalk >= 0.8 && r >= 0 && (P.hulls & (1 << r)) !== 0 && share(ship) < 0.7 && power(state.ships[r]) > 1.2 * power(ship);
  if (r < 0 || P.rivalD > BRAIN.danger || (share(ship) >= style.run * (0.75 + 0.25 * c.skill) && !outgunned)) return false;
  toward(ship.pos, state.ships[P.rival].pos, ship.head, T);
  set(c.want, -T.x, -T.y, -T.z);
  if (TUNE.scatter > 0 && style.stalk < 0.8) {
    for (let k = 0; k < SHIPS; k++) {
      if (k === i || k === r || (P.hulls & (1 << k)) === 0 || !afloat(state.ships[k])) continue;
      const e = apart(ship.pos, state.ships[k].pos);
      if (e < BRAIN.danger) addScaled(c.want, c.want, toward(ship.pos, state.ships[k].pos, ship.head, U), -TUNE.scatter * (1 - e / BRAIN.danger));
    }
    if (dot(c.want, c.want) > 1e-6) normalize(c.want);
    else set(c.want, -T.x, -T.y, -T.z);
  }
  if (ship.held > 0 && dot(toward(ship.pos, c.anchor, ship.head, U), T) < 0) normalize(addScaled(c.want, c.want, U, 1));
  c.target = P.rival;
  return true;
}

function threatened(state: MatchState, i: number, style: Style, was: number): boolean {
  const ship = state.ships[i], c = ship.captain;
  if (ship.laid.length === 0 || ship.held <= 0) return false;
  if (style.bolt && (ship.purse >= 0.35 * FORMS[ship.form].purse || (was === MODE.hunt && P.trail !== c.target))) {
    c.target = -1;
    return true;
  }
  if (P.rival < 0) return false;
  if (style.stalk >= 0.8 && share(ship) > 0.5 && ship.purse < 0.5 * FORMS[ship.form].purse) return false;
  if (c.gentle && P.rival === 0 && P.rivalD < BRAIN.gentle) return true;
  if (style.commit > 0 && was === MODE.loop && share(ship) > 0.5) return false;
  if (P.rivalD > by(BRAIN.threat, c.skill) * (style.bolt ? 1.5 : 1) * (P.rival === 0 ? 1 + 0.5 * wary(c) : 1)) return false;
  c.target = -1;
  return ship.purse > 0.25 * FORMS[ship.form].purse || share(ship) < 0.6;
}

function engages(sea: Sea, state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain, keen = style.stalk >= 0.8;
  let j = P.rival, d = P.rivalD;
  if (j < 0) return -1;
  if (keen) {
    const far = (GUNS[ship.fittings[SLOT.broadside].kind]?.range ?? 0) * BRAIN.engage;
    let low = (P.hulls & (1 << j)) !== 0 ? share(state.ships[j]) : 1;
    for (let k = 0; k < SHIPS; k++) {
      if (k === i || k === j || (P.hulls & (1 << k)) === 0 || !afloat(state.ships[k])) continue;
      const e = apart(ship.pos, state.ships[k].pos), h = share(state.ships[k]);
      if (e < far && h < low - 0.15) [j, d, low] = [k, e, h];
    }
  }
  const r = state.ships[j], theirs = (P.hulls & (1 << j)) !== 0 ? share(r) : 1, mine = share(ship);
  let will = style.fight + (0.3 + 0.6 * style.fight + style.stalk) * (1 - theirs) + 0.3 * (mine - 0.7) + (ship.harm[j] > 0 ? 0.2 : 0);
  if (keen && theirs > 0.55) {
    velocityOf(sea, r, V);
    if (dot(V, toward(ship.pos, r.pos, ship.head, T)) > 0.5 * Math.sqrt(dot(V, V))) will -= 0.5;
  }
  if (style.guard > 0) will += intrudes(state, i, j) ? style.guard : ship.harm[j] > 0 ? -0.2 : -0.4;
  if (keen) will -= 0.8 * Math.max(0, 1 - ((P.hulls & (1 << j)) !== 0 ? power(ship) / power(r) : 1));
  else if (style.edge === 0 && theirs < 0.6 && another(state, i, j, d)) will -= 0.35;
  if (keen && theirs < 0.6 && TUNE.steal > 0 && another(state, i, j, d)) will += TUNE.steal;
  if (style.fight < 0.1) will -= TUNE.shy;
  if (j === 0) {
    will += 0.15 * c.grudge;
    if ((c.knows & KNOW.run) !== 0 && c.run > 0 && theirs * 100 <= c.run + 10) will += 0.3;
    if (c.gentle) will = ship.harm[0] > 0 ? 0.3 * will : -1;
  }
  if (will < 0.55) return -1;
  const bow = BOWS[ship.fittings[SLOT.bow].kind], mass = FORMS[ship.form].mass / FORMS[r.form].mass;
  const finish = keen && theirs < TUNE.fin && mine > theirs + 0.1;
  if (!c.gentle && (finish ? d < TUNE.ram * BRAIN.ram && (bow !== undefined || mass >= 1 || theirs < 0.25) : !keen && d < BRAIN.ram && mine > 0.5 && (bow !== undefined ? theirs < 0.8 || mass >= 1 : mass >= 1.5 && theirs < 0.4))) {
    velocityOf(sea, r, V);
    normalize(addScaled(c.goal, r.pos, V, (c.skill * d) / Math.max(1, ship.speed) / R));
    c.target = j;
    return MODE.ram;
  }
  const gun = GUNS[ship.fittings[SLOT.broadside].kind];
  if (gun === undefined || d > gun.range * BRAIN.engage * (j === 0 ? 1 + 0.15 * c.grudge : 1) * (keen ? 1.6 : 1)) return -1;
  broadside(sea, state, i, j, gun, style, d);
  c.target = j;
  return MODE.fight;
}

function broadside(sea: Sea, state: MatchState, i: number, j: number, gun: Gun, style: Style, d: number): void {
  const ship = state.ships[i], c = ship.captain, r = state.ships[j], pos = ship.pos;
  velocityOf(sea, r, V);
  normalize(addScaled(Q, r.pos, V, (c.skill * (d / gun.speed + 1)) / R));
  toward(pos, Q, ship.head, T);
  cross(H, pos, T);
  let side = dot(H, ship.head) >= 0 ? 1 : -1;
  const port = ship.reload[BATTERY.port], starboard = ship.reload[BATTERY.starboard];
  if (port === 0 && starboard > 0 && -dot(H, ship.head) > -0.3) side = -1;
  else if (starboard === 0 && port > 0 && dot(H, ship.head) > -0.3) side = 1;
  const keen = style.stalk >= 0.8, loaded = (side > 0 ? starboard : port) === 0 && d < gun.range;
  let a = clamp((d - standoff(c, style, j) * gun.range * (keen && share(r) < 0.6 ? 0.6 : 1))  / (0.5 * gun.range), -1, 1);
  if (keen && loaded) a = clamp(a, -0.7 * gun.arc, 0.7 * gun.arc);
  else if (keen && a > 0 && quarter(state, i, j)) {
    set(c.want, T.x, T.y, T.z);
    return;
  } else if (keen && a > 0) a = Math.min(1.45, 1.45 * Math.sqrt(a));
  const ca = dcos(a), sa = dsin(a);
  normalize(set(c.want, side * H.x * ca + T.x * sa, side * H.y * ca + T.y * sa, side * H.z * ca + T.z * sa));
}

function quarter(state: MatchState, i: number, j: number): boolean {
  const pos = state.ships[i].pos, r = state.ships[j];
  cross(U, r.head, r.pos);
  set(QTR, pos.x - r.pos.x, pos.y - r.pos.y, pos.z - r.pos.z);
  const aft = -dot(QTR, r.head), lat = dot(QTR, U);
  if (aft <= 0 || Math.abs(lat) > 0.9 * aft) return false;
  normalize(addScaled(QTR, Q, U, (lat >= 0 ? 1 : -1) * aft));
  toward(pos, QTR, state.ships[i].head, T);
  return true;
}

function hunts(i: number, state: MatchState, style: Style, was: number): boolean {
  const c = state.ships[i].captain, owner = P.trail;
  const reach = owner === 0 && patrolOf(c, style) > 0 ? BRAIN.stalk : BRAIN.hunt * (style.stalk >= 0.8 ? 1.35 : Math.min(1.35, 0.6 + 0.4 * style.raid));
  if (owner < 0 || P.trailD > reach || (c.gentle && owner === 0)) return false;
  if (was === MODE.hunt && c.target === owner && c.since > BRAIN.wait) return false;
  const want = style.raid * Math.min(1.5, P.trailLen / 25) * (1 - P.trailD / reach) + (owner === 0 ? 0.1 * c.grudge : 0);
  if (want < 0.2) return false;
  cellDir(TERRITORY, P.trailCell, c.goal);
  c.target = owner;
  return true;
}

function guards(state: MatchState, i: number, style: Style, was: number, aim: number): number {
  const ship = state.ships[i], c = ship.captain, j = P.rival;
  if (style.guard < 0.5 || j < 0 || !intrudes(state, i, j)) return -1;
  if ((was === MODE.face && aim === j && c.since >= BRAIN.tell) || was === MODE.fight || was === MODE.ram) return -1;
  toward(ship.pos, state.ships[j].pos, ship.head, c.want);
  c.target = j;
  return MODE.face;
}

function another(state: MatchState, i: number, j: number, d: number): boolean {
  for (let k = 0; k < SHIPS; k++) if (k !== i && k !== j && knows(P, k) && afloat(state.ships[k]) && apart(state.ships[k].pos, state.ships[j].pos) < d) return true;
  return false;
}

const power = (ship: Ship): number => Math.max(1, ship.hull) * (1 + 0.25 * FORMS[ship.form].guns);

const guarded = (state: MatchState, i: number, p: V3): boolean => state.owner[cellOf(TERRITORY, p)] === i + 1 || apart(p, state.ships[i].captain.anchor) < HOME.radius + 4;

const intrudes = (state: MatchState, i: number, j: number): boolean => guarded(state, i, state.ships[j].pos);

function keepsClear(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain, r = P.rival;
  if (style.guard < 0.5 || r < 0 || ship.harm[r] > 0 || guarded(state, i, ship.pos) || SV.calm.r * R <= BRAIN.corner) return false;
  const reach = BRAIN.keep * Math.max(GUNS[ship.fittings[SLOT.broadside].kind]?.range ?? 0, GUNS[state.ships[r].fittings[SLOT.broadside].kind]?.range ?? 0);
  if (P.rivalD > reach) return false;
  const calm = SV.announced ? SV.next : SV.calm, d = R * angleBetween(ship.pos, calm.at);
  toward(ship.pos, state.ships[r].pos, ship.head, T);
  set(U, -T.x, -T.y, -T.z);
  if (d > 0.6 * calm.r * R) normalize(addScaled(U, U, toward(ship.pos, calm.at, ship.head, V), 1.2));
  along(ship.pos, U, BRAIN.wide, c.goal);
  c.target = -1;
  return true;
}

function stalks(sea: Sea, state: MatchState, i: number, sight: Sight, style: Style, was: number, aim: number): number {
  const ship = state.ships[i], c = ship.captain, r = P.rival;
  if (style.stalk === 0 && c.grudge === 0) return -1;
  const keen = style.stalk >= 0.8, weak = keen ? 0.6 : 0.7;
  let j = -1, d = BRAIN.stalk * (keen ? 1.8 : 1);
  if (r >= 0 && (style.stalk > 0 || r === 0) && (P.hulls & (1 << r)) !== 0 && share(state.ships[r]) < (r === 0 ? Math.max(pressAt(c), weak) : weak) && P.rivalD < d) [j, d] = [r, P.rivalD];
  for (let k = 0; keen && k < SHIPS; k++) {
    if (k === i || k === j || (P.hulls & (1 << k)) === 0 || !afloat(state.ships[k]) || share(state.ships[k]) >= weak) continue;
    const e = apart(ship.pos, state.ships[k].pos);
    if (e < BRAIN.stalk * 1.8 && (j < 0 || share(state.ships[k]) < share(state.ships[j]) - 0.15)) [j, d] = [k, e];
  }
  if (j < 0 && c.grudge > 0 && !c.gentle && knows(P, 0) && afloat(state.ships[0]) && share(ship) > 0.5) {
    const e = apart(ship.pos, state.ships[0].pos);
    if (e < BRAIN.stalk * (1 + 0.5 * c.grudge)) [j, d] = [0, e];
  }
  for (let k = 0; style.stalk >= 0.8 && k < SHIPS; k++) {
    const g = state.ships[k].gull.flight;
    if (k === i || (sight.gulls & (1 << k)) === 0 || (g !== FLIGHT.back && g !== FLIGHT.circle) || !afloat(state.ships[k])) continue;
    const at = bound(state, k), e = at === null ? Infinity : apart(ship.pos, at);
    if (e < d) [j, d] = [k, e];
  }
  if (keen && j >= 0 && (P.hulls & (1 << j)) !== 0 && power(ship) < 1.1 * power(state.ships[j])) j = -1;
  if (j < 0 || (was === MODE.stalk && aim === j && c.since > BRAIN.wait * (keen ? 2 : 1))) return -1;
  const prey = state.ships[j];
  if (knows(P, j)) velocityOf(sea, prey, V);
  else set(V, 0, 0, 0);
  normalize(addScaled(c.goal, prey.pos, V, (c.skill * d) / Math.max(1, ship.speed) / R));
  c.target = j;
  return MODE.stalk;
}

function lurks(state: MatchState, i: number, sight: Sight, style: Style): number {
  const ship = state.ships[i], c = ship.captain, gun = GUNS[ship.fittings[SLOT.broadside].kind];
  if (style.edge === 0 || gun === undefined) return -1;
  let best = BRAIN.stalk;
  for (let j = 0; j < SHIPS; j++) {
    if (j === i || !afloat(state.ships[j])) continue;
    const a = state.ships[j].pos;
    if ((sight.gulls & (1 << j)) !== 0 && state.ships[j].gull.flight === FLIGHT.dive) {
      const at = bound(state, j);
      if (at !== null && apart(ship.pos, at) < best) [best] = [apart(ship.pos, set(F, at.x, at.y, at.z))];
    }
    if (!knows(P, j)) continue;
    for (let k = j + 1; k < SHIPS; k++) {
      if (k === i || !knows(P, k) || !afloat(state.ships[k]) || apart(a, state.ships[k].pos) > 1.2 * gun.range) continue;
      const b = state.ships[k].pos;
      normalize(set(U, a.x + b.x, a.y + b.y, a.z + b.z));
      if (apart(ship.pos, U) < best) [best] = [apart(ship.pos, set(F, U.x, U.y, U.z))];
    }
  }
  if (best === BRAIN.stalk) return -1;
  along(F, toward(F, ship.pos, ship.head, T), style.edge * gun.range, c.goal);
  c.target = -1;
  return MODE.lurk;
}

function waylays(state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain;
  if (style.stalk < 0.8 || (c.knows & KNOW.storm) === 0 || !SV.announced) return -1;
  along(SV.next.at, toward(SV.next.at, ship.pos, ship.head, T), Math.max(0, SV.next.r * R - Math.max(2, c.margin)), c.goal);
  c.target = -1;
  return MODE.roam;
}

function patrols(state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain, p = state.ships[0], den = p.captain.anchor, ring = patrolOf(c, style);
  if (ring <= 0 || p.held <= 0 || !afloat(p) || ship.purse >= 0.5 * FORMS[ship.form].purse || apart(c.anchor, den) > BRAIN.stalk) return -1;
  const calm = SV.announced ? SV.next : SV.calm;
  along(den, turned(toward(den, ship.pos, ship.head, T), den, Math.sign(style.wheel) * PATROL.step, U), ring, G);
  if (dot(G, calm.at) < dcos(Math.max(0, calm.r - stormMargin(c, style, calm) / R))) return -1;
  set(c.goal, G.x, G.y, G.z);
  c.target = -1;
  return MODE.roam;
}

function loots(sea: Sea, state: MatchState, i: number, style: Style, was: number): number {
  const c = state.ships[i].captain;
  let best = was === MODE.loop ? 0.25 + 0.5 * (1 - style.loot) : 0.25, mode = -1, target = -1, at: V3 | null = null;
  if (P.chest >= 0) {
    const chest = state.chests[P.chest], gold = chest.tier === PIGMENT_TIER.goldLeaf ? style.gold : 1;
    const s = (style.loot * (2 + chest.tier) * gold) / (1 + P.chestD / 10);
    if (P.chestD < BRAIN.loot * Math.min(2, gold) && s > best) [best, mode, target, at] = [s, MODE.find, P.chest, chest.at];
  }
  if (P.coin >= 0 && P.coinD < BRAIN.loot) {
    const coin = state.coins[P.coin], s = (style.loot * coin.value) / 15 / (1 + P.coinD / 5);
    if (s > best) [best, mode, target, at] = [s, MODE.find, P.coin, coin.at];
  }
  if (P.site >= 0 && P.siteD < BRAIN.loot) {
    const s = (style.loot * siteValue(sea, P.site)) / 30 / (1 + P.siteD / 10);
    if (s > best) [best, mode, target, at] = [s, MODE.hold, P.site, sea.geo.finds[P.site].pos];
  }
  if (at === null || (was === mode && c.target === target && c.since > BRAIN.wait)) return -1;
  if (style.guard >= 0.5 && !guarded(state, i, at)) return -1;
  set(c.goal, at.x, at.y, at.z);
  c.target = target;
  return mode;
}

function loops(sea: Sea, state: MatchState, i: number, style: Style, rng: Rng, was: number): number {
  const ship = state.ships[i], c = ship.captain;
  c.target = -1;
  if (ship.held <= 0) {
    const calm = SV.announced ? SV.next : SV.calm;
    set(c.goal, calm.at.x, calm.at.y, calm.at.z);
    return MODE.roam;
  }
  const full = ship.purse >= BRAIN.full * FORMS[ship.form].purse;
  if (was === MODE.loop && (ship.course.length > 0 || c.plan.length > 0) && !full) return MODE.loop;
  if (ship.laid.length > 0 || !atHome(state, i)) return MODE.home;
  if (planLoop(sea, state, i, style, rng)) {
    c.loops++;
    c.tell = style.commit;
    return MODE.loop;
  }
  set(c.goal, c.anchor.x, c.anchor.y, c.anchor.z);
  return MODE.roam;
}

const LOBE: readonly (readonly [number, number])[] = [[-1, 0.55], [-0.5, 1], [0.5, 1], [1, 0.55], [1.2, 0]];

function planLoop(sea: Sea, state: MatchState, i: number, style: Style, rng: Rng): boolean {
  const ship = state.ships[i], c = ship.captain, calm = SV.announced ? SV.next : SV.calm, margin = stormMargin(c, style, calm);
  const inside = dcos(Math.max(0, calm.r - margin / R));
  let reach = Math.min(reachOf(c, style) * (1 + style.stretch) * (0.85 + 0.3 * rngFloat(rng)), 0.4 * (calm.r * R - margin));
  toward(c.anchor, ship.pos, ship.head, T);
  const width = 0.6 - 0.3 * style.stretch, first = c.loops * style.wheel;
  for (let round = 0; round < 2; round++, reach *= 0.6) {
    for (let k = 0; k < 6; k++) if (lobe(sea, state, ship, style, first + k * 1.05, width, reach, calm, inside)) return true;
  }
  c.plan.length = 0;
  return false;
}

function lobe(sea: Sea, state: MatchState, ship: Ship, style: Style, bearing: number, width: number, reach: number, calm: Calm, inside: number): boolean {
  const plan = ship.captain.plan;
  plan.length = 0;
  set(Q, ship.pos.x, ship.pos.y, ship.pos.z);
  for (const [off, frac] of LOBE) {
    turned(T, ship.captain.anchor, bearing + off * width, U);
    along(ship.captain.anchor, U, frac > 0 ? HOME.radius + frac * reach : 0.5 * HOME.radius, G);
    const n = Math.max(1, Math.ceil(apart(Q, G) / BRAIN.gap));
    for (let s = 1; s <= n; s++) {
      const f = s / n;
      normalize(set(V, Q.x * (1 - f) + G.x * f, Q.y * (1 - f) + G.y * f, Q.z * (1 - f) + G.z * f));
      if (hazard(sea, state, ship, style, V, false) || dot(V, calm.at) < inside) return false;
      const cell = cellOf(TERRITORY, V);
      if (plan[plan.length - 1] !== cell) plan.push(cell);
    }
    set(Q, G.x, G.y, G.z);
  }
  return true;
}

function hazard(sea: Sea, state: MatchState, ship: Ship, style: Style, p: V3, hasty: boolean): boolean {
  if (aground(sea, state, p)) return true;
  const z = sea.geo.zones[cellOf(TERRITORY, p)];
  if ((z & ZONE.hot) !== 0 && ship.fittings[SLOT.hull].kind !== FITTING.copperSheathing) return true;
  if ((z & ZONE.vortex) !== 0 && style.bold < 0.7) return true;
  return hasty && (z & ZONE.kelp) !== 0;
}

const SWERVE = [0, 0.5, -0.5, 1, -1, 1.6, -1.6];
const ARC = v3(), BOW = v3(), CHORD = v3();
let tight = false;

function clearing(sea: Sea, state: MatchState, ship: Ship, style: Style, hasty: boolean): number {
  const c = ship.captain, pos = ship.pos, mode = c.mode, form = FORMS[ship.form];
  if (byWant(mode)) normalize(addScaled(H, c.want, pos, -dot(c.want, pos)));
  else toward(pos, c.goal, ship.head, H);
  const turn = ship.rate < 0 ? -1 : 1, look = Math.max(1, (form.radius * SAILS[ship.sail].radius) / BRAIN.circle);
  tight = false;
  for (const a of SWERVE) {
    turned(H, pos, a * turn, U);
    let clear = true;
    for (const d of BRAIN.probe) if (hazard(sea, state, ship, style, along(pos, U, d * look, V), hasty)) clear = false;
    if (!clear) continue;
    if (swept(sea, state, ship, style, U, form.radius * SAILS[ship.sail].radius, hasty)) return a * turn;
    if (ship.sail !== SAIL.reefed && swept(sea, state, ship, style, U, form.radius * SAILS[SAIL.reefed].radius, hasty)) {
      tight = true;
      return a * turn;
    }
  }
  tight = true;
  return 2.6 * turn;
}

function swept(sea: Sea, state: MatchState, ship: Ship, style: Style, u: V3, rho: number, hasty: boolean): boolean {
  const pos = ship.pos, head = ship.head, reach = FORMS[ship.form].half + BRAIN.bow;
  cross(CHORD, head, pos);
  const e = datan2(dot(u, CHORD), dot(u, head)), n = Math.max(1, Math.ceil(Math.abs(e) / BRAIN.arc));
  for (let k = 1; k <= n; k++) {
    const th = (e * k) / n;
    along(pos, turned(head, pos, th / 2, CHORD), 2 * rho * dsin(Math.abs(th) / 2), ARC);
    if (hazard(sea, state, ship, style, along(ARC, turned(head, pos, th, CHORD), reach, BOW), hasty)) return false;
  }
  return true;
}

function intend(ship: Ship): void {
  const c = ship.captain, pos = ship.pos;
  if (byWant(c.mode)) set(c.intent, c.want.x, c.want.y, c.want.z);
  else if (c.mode === MODE.loop && c.plan.length) toward(pos, cellDir(TERRITORY, c.plan[c.tell > 0 ? c.plan.length >> 1 : Math.min(2, c.plan.length - 1)], Q), ship.head, c.intent);
  else if (c.mode === MODE.loop && ship.course.length) toward(pos, cellDir(TERRITORY, ship.course[Math.min(ship.leg + 2, ship.course.length - 1)], Q), ship.head, c.intent);
  else if (c.mode === MODE.home && ship.home.length) toward(pos, cellDir(TERRITORY, ship.home[Math.min(ship.homeLeg + 2, ship.home.length - 1)], Q), ship.head, c.intent);
  else if (c.mode === MODE.home) toward(pos, c.anchor, ship.head, c.intent);
  else toward(pos, c.goal, ship.head, c.intent);
  if (c.avoid !== 0 && c.mode !== MODE.loop && c.mode !== MODE.home) normalize(turned(set(G, c.intent.x, c.intent.y, c.intent.z), pos, c.avoid, c.intent));
}
