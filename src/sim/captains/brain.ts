// A captain at the helm (PROMPT.md, How captains think; The league; A match; Controls). It fills the very ShipInput
// the player's touch fills — the stick, the sail steps, the swipe off the current, head home, the gull call, the
// chest choice, the consumable slots, the aimed fittings, a drawn course — and nothing else. Its tick has two halves:
// helm(), before the hulls move, works the controls from its own ship and its record (Ship.captain) alone; think(),
// once the tick's survey is in, perceives what its ship and gull could see (perception.ts) and, when its reaction
// time has run, decides: its mode, goal and plan go into its record, so a snapshot resumes it mid-thought.
//
// The skills are shared by every captain and parameterised by a Style; a temperament (temperaments.ts) is a Style and
// priorities over the same skills, each captain sailing it under its own signature; the first voyage's captains sail
// the GENTLE one. Rank sets one number, Ship.captain.skill (0 … 1 from the rank tier): how fast it reacts, how far ahead it leads
// its course on a moving target, how shrewdly it judges a threat to its purse and the storm's sweep, and how well it
// times its items; its gunners' own lead is Outfit.gunnery. Its intent shows before it acts: the heading it means
// to hold (intent()) leads its hull, and a strike is telegraphed for BRAIN.tell s while its course bends round.
import { siteValue } from '../economy.ts';
import { aground, type Sea } from '../environment.ts';
import { bound, callPrice, perched } from '../gull.ts';
import { FLAG, STEER_MAX, type ShipInput } from '../input.ts';
import { bestPick } from '../items.ts';
import { addScaled, cross, datan2, dcos, dot, dsin, hash32, normalize, rngFloat, rngInt, set, v3, type Rng, type V3 } from '../math.ts';
import { passage, type Passage } from '../opening.ts';
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
import { REGIONS } from '../world/regions.ts';
import { apart, knows, newPercept, perceive } from './perception.ts';
import { lure, pressAt } from './learning.ts';
import { PATROL, patrolOf, reachOf, standoff, styleOf, wary, type Style } from './temperaments.ts';

type Captain = Ship['captain'];

/** What a captain is about (Ship.captain.mode). */
export const MODE = {
  ride: 0, // riding the Great Current, weighing where to break off
  peel: 1, // it has chosen: the swipe off the current, then the coast to its home
  roam: 2, // making for its goal with nothing better to do
  loop: 3, // sailing the loop it drew out of its waters
  home: 4, // head home held: closing the loop
  find: 5, // sailing through a chest or flotsam
  hold: 6, // holding beside a wreck or cache to take it
  hunt: 7, // breaking a rival's open trail
  fight: 8, // bringing a broadside to bear
  ram: 9, // driving its bow into a rival
  flee: 10, // running, wounded
  storm: 11, // keeping ahead of the storm
  face: 12, // turning its bow on an intruder in its waters, reefed: a turtle's tell before it strikes
  lurk: 13, // lying off a fight between others, waiting for one to weaken
  stalk: 14, // closing on a wounded ship, or a laden one a gull gave away, from beyond its guns' reach
  mend: 15, // making for a harbour (or the Great Lagoon it holds) to mend its hull, and lying in it reefed
} as const;

/** The brain's timings and reaches; pairs run from skill 0 to skill 1. */
export const BRAIN = {
  react: [18, 5], // ticks between decisions: 0.6 s … 0.17 s (half as long again when gentle)
  jitter: 4, // and up to this many ticks more, from its stream
  tell: 1.2, // s a strike is telegraphed, its course bending round, before it commits
  ride: 5, // s every captain rides the current before it may break off
  danger: 40, // u: a rival this near is a danger to a wounded ship
  threat: [18, 36], // u at which a rival near threatens its open trail and purse
  engage: 1.5, // × its guns' range: how near a rival must be for it to close and fight
  ram: 30, // u: the farthest it drives in to ram from
  hunt: 45, // u: the farthest open trail it goes for
  stalk: 90, // u: the farthest it stalks a ship, lies off a fight, or patrols from its own home
  loot: 40, // u: the farthest find it goes for
  wait: 35, // s it pursues one trail or find before giving it up
  lead: [4, 20], // s to spare it keeps over the storm's sweep
  probe: [5, 10, 16], // u ahead it looks for hazards, for a turning circle up to `circle` u (wider: as much farther)
  circle: 10,
  gap: 4, // u between the points of a drawn loop
  patch: [0.3, 0.55], // hull share it patches at
  full: 0.95, // share of its form's purse at which its purse is full: home to bank it
  gentle: 30, // u a gentle captain keeps from the player
  mend: 120, // u: the farthest harbour it makes for to mend
  mended: 0.9, // hull share at which it leaves the harbour, mended
  inside: 0.4, // the most of a calm's radius it keeps as its margin from the storm: in a small calm it holds its own ground, not the centre
};

const by = (pair: readonly number[], s: number): number => pair[0] + (pair[1] - pair[0]) * s;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const share = (ship: Ship): number => ship.hull / fullHull(ship.form, ship.fittings);
/** Whether it steers by a heading (Ship.captain.want) rather than for its goal. */
/**
 * Tuning knobs (WP12; tests/tools/sweep.ts sets them per variant): shy, how much less a captain that avoids fights
 * (Style.fight < 0.1: expanders) wants one; scatter, how hard a runner (not a hunter) bears away from every other rival
 * it reads near, not only the one it runs from; finish, the prey's hull share under which a hunter stays on a ship it
 * has broken (and is sounder than) rather than run; storm, × BRAIN.ram within which a hunter finishes a broken ship
 * before it keeps ahead of the storm; steal, how much more a hunter wants a wounded ship another is already on; ram,
 * × BRAIN.ram a hunter drives its bow in from to finish a ship it has broken; fin, the hull share under which a
 * hunter's prey counts as broken, to ram.
 */
export const TUNE = { shy: 0.3, scatter: 1, finish: 0.4, steal: 0.3, ram: 1.5, fin: 0.4, storm: 2 };
const byWant = (mode: number): boolean => mode === MODE.fight || mode === MODE.flee || mode === MODE.face;

/** Whether ship i has a captain at its helm: never the player's (index 0), nor a ship fitted out without one (Outfit.captain). */
export const captained = (state: MatchState, i: number): boolean => state.ships[i].captain.temperament >= 0;

/** Whether the player's own ship sails under a captain's brain (the scripted players of tests/tools/tournament.ts): it issues only the player's controls, on the first captain's stream. */
export const piloted = (state: MatchState): boolean => state.ships[0].captain.temperament >= 0;

const QTR = v3();
const P = newPercept(), SV = newStormView(), PASS: Passage = { region: 0, next: -1, untilNext: 0, untilEnd: 0 };
const EMPTY: number[] = [], F = v3(), H = v3(), G = v3(), Q = v3(), T = v3(), U = v3(), V = v3(), STAR = v3(), STAR2 = v3();

/** The unit tangent at p toward q into out, or `fallback` when q is all but p. */
function toward(p: V3, q: V3, fallback: V3, out: V3): V3 {
  if (dot(p, q) > 1 - 1e-12) return set(out, fallback.x, fallback.y, fallback.z);
  return tangentToward(p, q, out);
}

/** The point `d` u from p along its unit tangent t, into out. */
function along(p: V3, t: V3, d: number, out: V3): V3 {
  const c = dcos(d / R), s = dsin(d / R);
  return normalize(set(out, p.x * c + t.x * s, p.y * c + t.y * s, p.z * c + t.z * s));
}

/** The tangent t at p turned `a` rad to starboard, into out (not aliasing t). */
function turned(t: V3, p: V3, a: number, out: V3): V3 {
  cross(STAR2, t, p);
  const c = dcos(a), s = dsin(a);
  return set(out, t.x * c + STAR2.x * s, t.y * c + STAR2.y * s, t.z * c + STAR2.z * s);
}

// ---------------------------------------------------------------------------------------------------------------
// The helm: every tick, before the hulls move.

/**
 * Captain i's controls this tick, into `out` (cleared first), from its ship and record alone: the sail step toward
 * the setting it wants; on the current the swipe off once it has chosen; a loop it planned, as a drawn course, and
 * no hand on the stick while it sails it; head home held; else the stick for its goal, its course bending round over
 * a telegraphed strike and bearing off a hazard ahead. A ship without a captain gets an idle input.
 */
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
  if (c.plan.length && c.tell === 0) { // a loop it drew, once it has swung round to it
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
  } else toward(pos, c.plan.length ? cellDir(TERRITORY, c.plan[c.plan.length >> 1], Q) : c.goal, ship.head, H); // committing: its bow swung on the loop's far side
  if (c.tell > 0 && c.plan.length === 0) { // the bend: from its heading round to the strike, over the telegraph
    const k = 0.7 * (c.tell / BRAIN.tell);
    addScaled(G, addScaled(G, set(G, 0, 0, 0), H, 1 - k), ship.head, k);
    if (dot(G, G) > 1e-6) normalize(set(H, G.x, G.y, G.z));
  }
  if (c.avoid !== 0) normalize(turned(set(G, H.x, H.y, H.z), pos, c.avoid, H));
  out.steer = steerFor(ship, H);
  return out;
}

/** The stick that brings ship's bow to the heading h, as the pilot would (route.ts): easing as the turn under way will carry it. */
function steerFor(ship: Ship, h: V3): number {
  cross(STAR, ship.head, ship.pos);
  const error = datan2(dot(h, STAR), dot(h, ship.head)), lead = FORMS[ship.form].helm + PILOT.lead;
  const want = clamp((error - ship.rate * lead) / PILOT.full, -1, 1), a = HELM.soft, m = Math.abs(want);
  const s = (Math.sqrt(a * a + 4 * (1 - a) * m) - a) / (2 * (1 - a)); // the stick whose soft curve gives that helm
  return Math.round(Math.sign(want) * Math.min(1, s) * STEER_MAX);
}

// ---------------------------------------------------------------------------------------------------------------
// The mind: once the tick's survey is in.

/**
 * The second half of captain i's tick, with this tick's `sight` (its survey): when its reaction time has run it
 * perceives and decides, and works the controls of the moment into `out` (which helm() filled): the chest choice, a
 * consumable, the gull's call or dive, the mortar.
 */
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

/** The heading ship i shows on the chart's short inked arrow, into `out`: a captain's intent, which leads its hull; any other ship's heading. */
export function intent(state: MatchState, i: number, out: V3): V3 {
  const ship = state.ships[i], c = ship.captain.intent;
  const src = captained(state, i) && ship.phase !== PHASE.riding && dot(c, c) > 0 ? c : ship.head;
  return set(out, src.x, src.y, src.z);
}

// ---------------------------------------------------------------------------------------------------------------
// Breaking off the Great Current.

/**
 * Whether captain i, riding, breaks off now: the region it is passing against the one the current reaches next
 * (opening.ts passage) by their richness, its own taste (by the seed), the storm rising near, and where it knows the
 * player breaks off; the longer it rides the less it asks, and it waits for a better region only if that comes soon —
 * the bolder (Style.bold), the more it asks and the longer it rides on for richer waters. It rides on past a rival
 * that has broken off within BRAIN.danger, so as not to ink its home within that rival's guns — a hunter too, which
 * finds its prey later, and an opportunist, which waits off fights rather than starting them — unless these are the
 * waters it knows the player breaks off into.
 */
function breaksOff(sea: Sea, state: MatchState, i: number): boolean {
  const ship = state.ships[i], t = state.tick * TICK, style = styleOf(ship), bold = style.bold;
  passage(sea, ship.ride, PASS);
  if (t < BRAIN.ride) return false;
  if (PASS.untilEnd < 3) return true;
  const c = ship.captain, sought = (c.knows & KNOW.breakOff) !== 0 && c.breakOff === PASS.region;
  if ((c.knows & KNOW.breakOff) !== 0 && c.breakOff !== PASS.region && PASS.untilEnd > 6 && lure(c, style) > 0.5 && passesOn(sea, ship.ride, c.breakOff)) return false; // it rides on for the waters it knows the player breaks off into
  if (!sought && PASS.untilEnd > 6 && beside(state, i)) return false; // it rides on past a rival breaking off: no home within its guns
  const here = regionWorth(state, i, PASS.region) - 0.6 * Math.max(0, dot(ship.pos, state.storm.origin) - 0.6) / 0.4;
  const ahead = PASS.next >= 0 ? regionWorth(state, i, PASS.next) : -Infinity;
  return here >= 1.3 + 0.5 * (bold - 0.3) - 0.02 * t && (here >= ahead || PASS.untilNext > 12 * (1 + bold));
}

/** Whether a rival it sees has broken off within BRAIN.danger of it. */
function beside(state: MatchState, i: number): boolean {
  for (let k = 0; k < SHIPS; k++) if (k !== i && knows(P, k) && afloat(state.ships[k]) && state.ships[k].phase !== PHASE.riding && apart(state.ships[i].pos, state.ships[k].pos) < BRAIN.danger) return true;
  return false;
}

const LOOK: Passage = { region: 0, next: -1, untilNext: 0, untilEnd: 0 };

/** Whether the Great Current, ridden on from s, still passes region r (its course is on every chart; opening.ts passage). */
function passesOn(sea: Sea, s: number, r: number): boolean {
  const t0 = passage(sea, s, LOOK).untilEnd, v = 10 / Math.max(1e-6, t0 - passage(sea, s + 10, LOOK).untilEnd); // u/s down the current
  for (let k = 0, at = s; k < 8; k++, at += v * LOOK.untilNext + 1) {
    passage(sea, at, LOOK);
    if (LOOK.region === r) return true;
    if (LOOK.next < 0) return false;
  }
  return false;
}

function regionWorth(state: MatchState, i: number, r: number): number {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), taste = (hash32(state.seed, i * 64 + r) & 0xffff) / 0xffff;
  let w = REGIONS[r].richness * (1 + 0.5 * style.guard) + 0.4 * taste; // a turtle sets most store by rich waters
  if ((c.knows & KNOW.breakOff) !== 0 && c.breakOff === r) w += lure(c, style); // the player's waters, by its temperament (learning.ts)
  return w;
}

// ---------------------------------------------------------------------------------------------------------------
// Items: the moment to use them.

function act(sea: Sea, state: MatchState, i: number, out: ShipInput, hurt: boolean, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, g = ship.gull, foe = P.rival, near = P.rivalD;
  const spare = foe !== 0 || !c.gentle || ship.harm[0] > 0; // a gentle captain turns nothing on the player unprovoked
  if (ship.offer.length) out.chestPick = bestPick(ship);
  out.consumable = consumable(ship, c, hurt);
  const safe = near > GULL.danger.near && share(ship) > GULL.danger.hull && rngFloat(rng) < 0.5 + 0.5 * c.skill;
  if (perched(g) && safe && ship.bank >= callPrice(sea, state, i)) out.flags |= FLAG.callGull;
  if (foe < 0 || !spare) return;
  const pressing = c.mode === MODE.fight || c.mode === MODE.ram || c.mode === MODE.hunt;
  if (g.dive > 0 && g.cool === 0 && perched(g) && pressing && near < GULL.dive.reach) out.flags |= FLAG.dive;
  const sure = c.skill >= 0.5 || (P.hulls & (1 << foe)) !== 0;
  if (ship.fittings[SLOT.stern].kind === FITTING.mortar && ship.reload[BATTERY.stern] === 0 && near < MORTAR.range && near > 3 * MORTAR.blast && sure) {
    velocityOf(sea, state.ships[foe], V); // aimed by hand, a drag at a point: where the rival will be as the shell falls, as far ahead as its eye leads
    normalize(addScaled(Q, state.ships[foe].pos, V, (c.skill * near) / MORTAR.speed / R));
    out.flags |= FLAG.useAimed;
    out.aim = cellOf(TERRITORY, Q);
  }
}

/** The consumable slot captain's ship uses now, the most pressing need first, or −1. */
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

// ---------------------------------------------------------------------------------------------------------------
// The decision: one mode, by priority, each skill setting the goal it sails for.

function decide(sea: Sea, state: MatchState, i: number, sight: Sight, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), was = c.mode, aim = c.target;
  let mode = -1;
  const prey = P.rival >= 0 && (P.hulls & (1 << P.rival)) !== 0 && share(state.ships[P.rival]) < TUNE.fin && P.rivalD < TUNE.storm * BRAIN.ram;
  if (stormGoal(state, i, style) && !(style.stalk >= 0.8 && prey)) mode = MODE.storm; // a hunter finishes a broken ship before the storm
  else if (flees(state, i, style)) mode = MODE.flee;
  else if (threatened(state, i, style, was)) mode = MODE.home;
  if (mode < 0) mode = mends(sea, state, i, style, was);
  if (mode < 0) mode = guards(state, i, style, was, aim);
  if (mode < 0) mode = engages(sea, state, i, style);
  if (mode < 0 && style.stalk >= 0.8) mode = stalks(sea, state, i, sight, style, was, aim); // a hunter finishes the wounded before it raids
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
  const reach = standoff(c, style, c.target) * (GUNS[ship.fittings[SLOT.broadside].kind]?.range ?? 0); // closing under full sail, fighting under plain
  const lying = ((mode === MODE.hold || mode === MODE.lurk) && apart(ship.pos, c.goal) < 12) || (mode === MODE.mend && apart(ship.pos, c.goal) < HOME.radius);
  c.trim = mode === MODE.fight ? ((c.target >= 0 ? apart(ship.pos, state.ships[c.target].pos) : P.rivalD) > reach || style.stalk >= 0.8 ? SAIL.full : SAIL.plain) : lying || mode === MODE.face ? SAIL.reefed : SAIL.full;
  const hasty = mode === MODE.flee || mode === MODE.storm || mode === MODE.ram;
  c.avoid = mode === MODE.loop || mode === MODE.home ? 0 : clearing(sea, state, ship, style, hasty);
  if (Math.abs(c.avoid) >= 1) c.trim = SAIL.reefed; // coming about off foul water, it shortens sail: the tightest turn and the softest blow
  intend(ship);
}

/** The margin it keeps inside the storm's coming calm: a shrewder captain keeps the full margin of its Style. */
const stormMargin = (c: Captain, style: Style, calm: Calm): number => Math.min(style.margin * (0.5 + 0.5 * c.skill), BRAIN.inside * calm.r * R);

/**
 * The storm (stormView: what every chart announces): in it, it makes for the calm; inside, while a phase is announced,
 * it leaves for the coming calm once the sweep would reach it with less than its lead to spare — the edge closes from
 * the calm now to the next between the phase's move and its hold — and makes for a point its margin inside that calm.
 */
function stormGoal(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain, pos = ship.pos, margin = stormMargin(c, style, SV.announced ? SV.next : SV.calm);
  const inNow = dot(pos, SV.calm.at) >= SV.calm.cos, calm: Calm = SV.announced ? SV.next : SV.calm;
  if (inNow && !SV.announced) return false;
  const d = R * angleBetween(pos, calm.at), safe = calm.r * R - margin;
  if (inNow) {
    if (d <= safe) return false;
    const nowR = SV.calm.r * R, nextR = calm.r * R, frac = nowR > nextR ? clamp((nowR - d) / (nowR - nextR), 0, 1) : 0;
    const need = (d - safe) / FORMS[ship.form].speed + by(BRAIN.lead, c.skill);
    if (need < SV.toMove + (SV.toHold - SV.toMove) * frac) return false;
  }
  along(calm.at, toward(calm.at, pos, ship.head, T), Math.max(0, Math.min(d, safe) - 0.5 * margin), c.goal);
  c.target = -1;
  return true;
}

/**
 * Mending (PROMPT.md, The sea: harbours mend a hull fast, and the Great Lagoon its holder's): wounded below its Style's
 * mend share — the reckless hold on lowest — it breaks off to mend rather than fight on: it makes for the nearest
 * harbour within BRAIN.mend that lies inside the coming calm by its margin (or the Great Lagoon while it holds it), else
 * for its own home, and lies there reefed until its hull is sound again (BRAIN.mended). Bound for a harbour with its
 * trail open and home the nearer, it closes the trail first (loops).
 */
function mends(sea: Sea, state: MatchState, i: number, style: Style, was: number): number {
  const ship = state.ships[i], c = ship.captain;
  if (share(ship) >= (was === MODE.mend ? BRAIN.mended : style.mend)) return -1;
  const calm = SV.announced ? SV.next : SV.calm, inside = dcos(Math.max(0, calm.r - stormMargin(c, style, calm) / R));
  let best = BRAIN.mend, at: V3 | null = null;
  for (const h of sea.geo.harbours) { // it lies inside the harbour's mouth, with the open sea to swing through
    const d = apart(ship.pos, h.pos);
    if (d < best && dot(h.pos, calm.at) >= inside) [best, at] = [d, along(h.pos, h.facing, 0.5 * h.r, F)];
  }
  const lagoon = sea.geo.landmarks.find((l) => l.perk === 'greatLagoon');
  if (lagoon !== undefined && holds(sea, state, i, 'greatLagoon') && apart(ship.pos, lagoon.pos) < best) [best, at] = [apart(ship.pos, lagoon.pos), lagoon.pos];
  if (at === null && state.owner[cellOf(TERRITORY, c.anchor)] === i + 1 && dot(c.anchor, calm.at) >= inside) at = c.anchor; // no harbour in reach: its own waters mend it, slowly
  if (at === null || (at !== c.anchor && ship.laid.length > 0 && apart(ship.pos, c.anchor) < best)) return -1;
  set(c.goal, at.x, at.y, at.z);
  c.target = -1;
  return MODE.mend;
}

/** Wounded below its Style's run share (a lesser captain holds on longer) with a rival near: it runs, home-ward if home lies away from the rival. */
function flees(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  const r = P.rival, prey = r >= 0 && (P.hulls & (1 << r)) !== 0 ? share(state.ships[r]) : 1;
  if (style.stalk >= 0.8 && prey < TUNE.finish && prey < share(ship)) return false; // a hunter stays on a ship it has broken: it finishes it
  const outgunned = style.stalk >= 0.8 && r >= 0 && (P.hulls & (1 << r)) !== 0 && share(ship) < 0.7 && power(state.ships[r]) > 1.2 * power(ship); // a hunter breaks off from a ship that outguns it
  if (r < 0 || P.rivalD > BRAIN.danger || (share(ship) >= style.run * (0.75 + 0.25 * c.skill) && !outgunned)) return false;
  toward(ship.pos, state.ships[P.rival].pos, ship.head, T);
  set(c.want, -T.x, -T.y, -T.z);
  if (TUNE.scatter > 0 && style.stalk < 0.8) { // a runner bears away from every rival it reads near, not only the one it runs from
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

/**
 * Home with its trail open: a raider (Style.bolt) as soon as its purse is worth the raid or its strike is home; any
 * captain with a rival near its open trail (nearer as its skill falls: a lesser captain notices late; farther for a
 * raider, and for the player when it knows the player breaks trails) while its purse is worth guarding or its hull is
 * low — save a gambler sailing out the loop it committed to. A gentle captain keeps clear of the player.
 */
function threatened(state: MatchState, i: number, style: Style, was: number): boolean {
  const ship = state.ships[i], c = ship.captain;
  if (ship.laid.length === 0 || ship.held <= 0) return false;
  if (style.bolt && (ship.purse >= 0.35 * FORMS[ship.form].purse || (was === MODE.hunt && P.trail !== c.target))) {
    c.target = -1;
    return true;
  }
  if (P.rival < 0) return false;
  if (style.stalk >= 0.8 && share(ship) > 0.5 && ship.purse < 0.5 * FORMS[ship.form].purse) return false; // a hunter meets a rival near its trail with its guns (engages); only a rich purse sends it home
  if (c.gentle && P.rival === 0 && P.rivalD < BRAIN.gentle) return true;
  if (style.commit > 0 && was === MODE.loop && share(ship) > 0.5) return false;
  if (P.rivalD > by(BRAIN.threat, c.skill) * (style.bolt ? 1.5 : 1) * (P.rival === 0 ? 1 + 0.5 * wary(c) : 1)) return false;
  c.target = -1;
  return ship.purse > 0.25 * FORMS[ship.form].purse || share(ship) < 0.6;
}

/**
 * A fight with the nearest rival it knows, when it is willing: by its Style, the rival's wounds (read only hull-up;
 * the more for a captain that stalks), a rival in the waters it guards, its own wounds, a grudge against the player, the player's habit of running when wounded (press it), a rival that has hurt
 * it. It rams when its bow or weight make that favourable, else brings a broadside to bear within reach of its guns.
 */
function engages(sea: Sea, state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain, keen = style.stalk >= 0.8;
  let j = P.rival, d = P.rivalD;
  if (j < 0) return -1;
  if (keen) { // a hunter turns its guns on the weakest hull it reads within reach, not merely the nearest
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
  if (keen && theirs > 0.55) { // a hunter lets a sound ship that runs from it go: a long stern chase is no hunt
    velocityOf(sea, r, V);
    if (dot(V, toward(ship.pos, r.pos, ship.head, T)) > 0.5 * Math.sqrt(dot(V, V))) will -= 0.5;
  }
  if (style.guard > 0) will += intrudes(state, i, j) ? style.guard : ship.harm[j] > 0 ? -0.2 : -0.4; // a turtle drives intruders off its waters; it does not chase them to the kill far out
  if (keen) will -= 0.8 * Math.max(0, 1 - ((P.hulls & (1 << j)) !== 0 ? power(ship) / power(r) : 1)); // a hunter picks its fights: never a stronger ship than its own
  else if (style.edge === 0 && theirs < 0.6 && another(state, i, j, d)) will -= 0.35; // another ship is on the wounded one first: it leaves it the kill
  if (keen && theirs < 0.6 && TUNE.steal > 0 && another(state, i, j, d)) will += TUNE.steal; // a hunter swoops on a wounded ship another has engaged: the kill is its
  if (style.fight < 0.1) will -= TUNE.shy; // a captain that avoids fights leaves even a wounded ship be
  if (j === 0) {
    will += 0.15 * c.grudge;
    if ((c.knows & KNOW.run) !== 0 && c.run > 0 && theirs * 100 <= c.run + 10) will += 0.3;
    if (c.gentle) will = ship.harm[0] > 0 ? 0.3 * will : -1;
  }
  if (will < 0.55) return -1;
  const bow = BOWS[ship.fittings[SLOT.bow].kind], mass = FORMS[ship.form].mass / FORMS[r.form].mass;
  const finish = keen && theirs < TUNE.fin && mine > theirs + 0.1; // a hunter fights with its broadsides and rams only to finish a ship they have broken
  if (!c.gentle && (finish ? d < TUNE.ram * BRAIN.ram && (bow !== undefined || mass >= 1 || theirs < 0.25) : !keen && d < BRAIN.ram && mine > 0.5 && (bow !== undefined ? theirs < 0.8 || mass >= 1 : mass >= 1.5 && theirs < 0.4))) {
    velocityOf(sea, r, V); // where it will be when the bow arrives, as far ahead as the captain's eye leads
    normalize(addScaled(c.goal, r.pos, V, (c.skill * d) / Math.max(1, ship.speed) / R));
    c.target = j;
    return MODE.ram;
  }
  const gun = GUNS[ship.fittings[SLOT.broadside].kind];
  if (gun === undefined || d > gun.range * BRAIN.engage * (j === 0 ? 1 + 0.15 * c.grudge : 1) * (keen ? 1.6 : 1)) return -1; // a hunter takes up the chase from farther, its guns run out
  broadside(sea, state, i, j, gun, style, d);
  c.target = j;
  return MODE.fight;
}

/**
 * The heading that lays rival j on a beam: the side whose battery has reloaded if it is not far round, else the
 * nearer; turned in toward the rival when beyond its standoff, away when inside it. A captain of rank lays off for
 * where the rival will be.
 */
function broadside(sea: Sea, state: MatchState, i: number, j: number, gun: Gun, style: Style, d: number): void {
  const ship = state.ships[i], c = ship.captain, r = state.ships[j], pos = ship.pos;
  velocityOf(sea, r, V);
  normalize(addScaled(Q, r.pos, V, (c.skill * (d / gun.speed + 1)) / R));
  toward(pos, Q, ship.head, T);
  cross(H, pos, T); // the heading with the rival on the starboard beam
  let side = dot(H, ship.head) >= 0 ? 1 : -1;
  const port = ship.reload[BATTERY.port], starboard = ship.reload[BATTERY.starboard];
  if (port === 0 && starboard > 0 && -dot(H, ship.head) > -0.3) side = -1;
  else if (starboard === 0 && port > 0 && dot(H, ship.head) > -0.3) side = 1;
  const keen = style.stalk >= 0.8, loaded = (side > 0 ? starboard : port) === 0 && d < gun.range;
  let a = clamp((d - standoff(c, style, j) * gun.range * (keen && share(r) < 0.6 ? 0.6 : 1)) /* a hunter closes on a broken ship */ / (0.5 * gun.range), -1, 1);
  if (keen && loaded) a = clamp(a, -0.7 * gun.arc, 0.7 * gun.arc); // a hunter yaws a loaded battery onto its prey, inside the arc, so the guns bear
  else if (keen && a > 0 && quarter(state, i, j)) { // reloading, it closes hard for the prey's quarter, wide of its stern chasers
    set(c.want, T.x, T.y, T.z);
    return;
  } else if (keen && a > 0) a = Math.min(1.45, 1.45 * Math.sqrt(a)); // reloading, it closes hard
  const ca = dcos(a), sa = dsin(a);
  normalize(set(c.want, side * H.x * ca + T.x * sa, side * H.y * ca + T.y * sa, side * H.z * ca + T.z * sa));
}

/** Ship i inside the cone astern of rival j that stern chasers sweep (and a margin): the heading for a point on j's quarter, out of that cone, into T. */
function quarter(state: MatchState, i: number, j: number): boolean {
  const pos = state.ships[i].pos, r = state.ships[j];
  cross(U, r.head, r.pos); // the rival's starboard
  set(QTR, pos.x - r.pos.x, pos.y - r.pos.y, pos.z - r.pos.z);
  const aft = -dot(QTR, r.head), lat = dot(QTR, U);
  if (aft <= 0 || Math.abs(lat) > 0.9 * aft) return false;
  normalize(addScaled(QTR, Q, U, (lat >= 0 ? 1 : -1) * aft));
  toward(pos, QTR, state.ships[i].head, T);
  return true;
}

/** The nearest open rival trail its chart shows, when worth the raid by its Style, the trail's length and distance, and a grudge. */
function hunts(i: number, state: MatchState, style: Style, was: number): boolean {
  const c = state.ships[i].captain, owner = P.trail;
  // a raider goes farther for a trail; a hunter patrolling for the player's (patrols) goes for one as far as it stalks a ship
  const reach = owner === 0 && patrolOf(c, style) > 0 ? BRAIN.stalk : BRAIN.hunt * Math.min(1.35, 0.6 + 0.4 * style.raid);
  if (owner < 0 || P.trailD > reach || (c.gentle && owner === 0)) return false;
  if (was === MODE.hunt && c.target === owner && c.since > BRAIN.wait) return false;
  const want = style.raid * Math.min(1.5, P.trailLen / 25) * (1 - P.trailD / reach) + (owner === 0 ? 0.1 * c.grudge : 0);
  if (want < 0.2) return false;
  cellDir(TERRITORY, P.trailCell, c.goal);
  c.target = owner;
  return true;
}

/**
 * A rival in the waters it guards (Style.guard: turtles), the sea it holds or its home: it turns its bow on the
 * intruder under reefed sail for BRAIN.tell, its tell, before it strikes (engages, the fiercer for the intrusion).
 */
function guards(state: MatchState, i: number, style: Style, was: number, aim: number): number {
  const ship = state.ships[i], c = ship.captain, j = P.rival;
  if (style.guard < 0.5 || j < 0 || !intrudes(state, i, j)) return -1;
  if ((was === MODE.face && aim === j && c.since >= BRAIN.tell) || was === MODE.fight || was === MODE.ram) return -1;
  toward(ship.pos, state.ships[j].pos, ship.head, c.want);
  c.target = j;
  return MODE.face;
}

/** Whether another ship it knows lies nearer the wounded ship j than its own d: the kill is that ship's to take. */
function another(state: MatchState, i: number, j: number, d: number): boolean {
  for (let k = 0; k < SHIPS; k++) if (k !== i && k !== j && knows(P, k) && afloat(state.ships[k]) && apart(state.ships[k].pos, state.ships[j].pos) < d) return true;
  return false;
}

/** A ship's strength as a rival reads it hull-up: its hull by its form's guns. */
const power = (ship: Ship): number => Math.max(1, ship.hull) * (1 + 0.25 * FORMS[ship.form].guns);

const intrudes = (state: MatchState, i: number, j: number): boolean => {
  const p = state.ships[j].pos;
  return state.owner[cellOf(TERRITORY, p)] === i + 1 || apart(p, state.ships[i].captain.anchor) < HOME.radius + 4;
};

/**
 * Stalking (Style.stalk): a wounded rival it reads hull-up, or — a hunter — a laden one whose gull it sees bringing a
 * chest home (Sight.gulls; gull.ts bound: where the gull flies shows where its ship is). It closes under full sail on
 * where the ship will be, until it is near enough to fight, for BRAIN.wait at most.
 */
function stalks(sea: Sea, state: MatchState, i: number, sight: Sight, style: Style, was: number, aim: number): number {
  const ship = state.ships[i], c = ship.captain, r = P.rival;
  if (style.stalk === 0 && c.grudge === 0) return -1;
  const keen = style.stalk >= 0.8, weak = keen ? 0.6 : 0.7; // a hunter stalks a ship that is broken, not one merely scratched, and from farther
  let j = -1, d = BRAIN.stalk * (keen ? 1.8 : 1);
  if (r >= 0 && (style.stalk > 0 || r === 0) && (P.hulls & (1 << r)) !== 0 && share(state.ships[r]) < (r === 0 ? Math.max(pressAt(c), weak) : weak) && P.rivalD < d) [j, d] = [r, P.rivalD];
  for (let k = 0; keen && k < SHIPS; k++) { // a hunter reads every hull it sees for the weakest
    if (k === i || k === j || (P.hulls & (1 << k)) === 0 || !afloat(state.ships[k]) || share(state.ships[k]) >= weak) continue;
    const e = apart(ship.pos, state.ships[k].pos);
    if (e < BRAIN.stalk * 1.8 && (j < 0 || share(state.ships[k]) < share(state.ships[j]) - 0.15)) [j, d] = [k, e];
  }
  if (j < 0 && c.grudge > 0 && !c.gentle && knows(P, 0) && afloat(state.ships[0]) && share(ship) > 0.5) { // a grudge: it stalks the player whenever it sees it
    const e = apart(ship.pos, state.ships[0].pos);
    if (e < BRAIN.stalk * (1 + 0.5 * c.grudge)) [j, d] = [0, e];
  }
  for (let k = 0; style.stalk >= 0.8 && k < SHIPS; k++) {
    const g = state.ships[k].gull.flight;
    if (k === i || (sight.gulls & (1 << k)) === 0 || (g !== FLIGHT.back && g !== FLIGHT.circle) || !afloat(state.ships[k])) continue;
    const at = bound(state, k), e = at === null ? Infinity : apart(ship.pos, at);
    if (e < d) [j, d] = [k, e];
  }
  if (keen && j >= 0 && (P.hulls & (1 << j)) !== 0 && power(ship) < 1.1 * power(state.ships[j])) j = -1; // only prey it is the stronger of, read hull-up
  if (j < 0 || (was === MODE.stalk && aim === j && c.since > BRAIN.wait * (keen ? 2 : 1))) return -1; // a hunter stalks twice as long
  const prey = state.ships[j];
  if (knows(P, j)) velocityOf(sea, prey, V);
  else set(V, 0, 0, 0);
  normalize(addScaled(c.goal, prey.pos, V, (c.skill * d) / Math.max(1, ship.speed) / R));
  c.target = j;
  return MODE.stalk;
}

/**
 * The edge of a fight (Style.edge: opportunists): two rivals it sees within guns' reach of each other, or a rival's
 * gull diving on a ship (Sight.gulls, bound): it makes for a point its edge off the nearest such fight, on its own
 * side, and lies there reefed until one of them weakens enough to pounce on (engages, stalks).
 */
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

/**
 * A hunter that knows the margin the player keeps from the storm (Mind.storm) lies in wait while a phase is
 * announced: on the coming calm's rim at that margin inside, on its own side, where the player will run in.
 */
function waylays(state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain;
  if (style.stalk < 0.8 || (c.knows & KNOW.storm) === 0 || !SV.announced) return -1;
  along(SV.next.at, toward(SV.next.at, ship.pos, ship.head, T), Math.max(0, SV.next.r * R - Math.max(2, c.margin)), c.goal);
  c.target = -1;
  return MODE.roam;
}

/**
 * A hunter that knows the player draws wide loops (temperaments.ts PATROL), with the player's home (which every chart
 * shows) within BRAIN.stalk of its own and little purse to bank, patrols beyond the player's border: round that home
 * where such loops' trails run, always making for a point PATROL.step farther round in the sense its own loops wheel,
 * inside the coming calm by its margin, so the player's long open trails run out into its reach (hunts).
 */
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

/**
 * The richest find in reach for the distance — a chest by its tier (a gold-leaf one by Style.gold, and that much
 * farther), flotsam and coins by their worth, a wreck or cache to hold beside — or −1. Sailing a loop, it leaves it
 * only for a find worth the more the less its appetite (an expander's patience).
 */
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
  set(c.goal, at.x, at.y, at.z);
  c.target = target;
  return mode;
}

/**
 * Loops (PROMPT.md, Territory): at home with no trail open it draws its next loop (planLoop); it sails it until the
 * purse is full, then heads home; a trail left open by anything else is closed by heading home. A ship with no waters
 * left makes for the coming calm and whatever it finds.
 */
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
    c.tell = style.commit; // a gambler swings round to it first, for all to see
    return MODE.loop;
  }
  set(c.goal, c.anchor.x, c.anchor.y, c.anchor.z); // nowhere to draw a loop now: it keeps to its waters
  return MODE.roam;
}

/** A lobe of a loop by fractions of its half-width and of its reach beyond the home rim (0: back inside its waters). */
const LOBE: readonly (readonly [number, number])[] = [[-1, 0.55], [-0.5, 1], [0.5, 1], [1, 0.55], [1.2, 0]];

/**
 * Captain i's next loop into its record's plan, as the cells of a drawn course: a lobe out of its waters on a bearing
 * that wheels round its home from loop to loop (Style.wheel), its size by its Style and what it knows of the player (and smaller as the calm shrinks), every point
 * a gap apart clear of hazards and inside the coming calm by its margin; tried on six bearings, then smaller.
 */
function planLoop(sea: Sea, state: MatchState, i: number, style: Style, rng: Rng): boolean {
  const ship = state.ships[i], c = ship.captain, calm = SV.announced ? SV.next : SV.calm, margin = stormMargin(c, style, calm);
  const inside = dcos(Math.max(0, calm.r - margin / R));
  let reach = Math.min(reachOf(c, style) * (1 + style.stretch) * (0.85 + 0.3 * rngFloat(rng)), 0.4 * (calm.r * R - margin));
  toward(c.anchor, ship.pos, ship.head, T); // bearings from the anchor, 0 toward the ship
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

/** Whether a hull at p comes to harm or hindrance: aground (rocks, shoals, floes), hot water unsheathed, the vortex unless bold, kelp when in haste. */
function hazard(sea: Sea, state: MatchState, ship: Ship, style: Style, p: V3, hasty: boolean): boolean {
  if (aground(sea, state, p)) return true;
  const z = sea.geo.zones[cellOf(TERRITORY, p)];
  if ((z & ZONE.hot) !== 0 && ship.fittings[SLOT.hull].kind !== FITTING.copperSheathing) return true;
  if ((z & ZONE.vortex) !== 0 && style.bold < 0.7) return true;
  return hasty && (z & ZONE.kelp) !== 0;
}

const SWERVE = [0, 0.5, -0.5, 1, -1, 1.6, -1.6];

/** The angle to starboard it bears off its heading for the goal so that the water BRAIN.probe ahead (the farther as its turning circle is the wider) is clear; about, when nothing is. */
function clearing(sea: Sea, state: MatchState, ship: Ship, style: Style, hasty: boolean): number {
  const c = ship.captain, pos = ship.pos, mode = c.mode;
  if (byWant(mode)) normalize(addScaled(H, c.want, pos, -dot(c.want, pos)));
  else toward(pos, c.goal, ship.head, H);
  const turn = ship.rate < 0 ? -1 : 1, look = Math.max(1, (FORMS[ship.form].radius * SAILS[ship.sail].radius) / BRAIN.circle);
  for (const a of SWERVE) {
    turned(H, pos, a * turn, U);
    let clear = true;
    for (const d of BRAIN.probe) if (hazard(sea, state, ship, style, along(pos, U, d * look, V), hasty)) clear = false;
    if (clear) return a * turn;
  }
  return 2.6 * turn;
}

/** Its intent: the heading it means to hold, toward its next mark, the chart's inked arrow. */
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
