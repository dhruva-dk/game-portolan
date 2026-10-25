// A captain at the helm (PROMPT.md, How captains think; The league; A match; Controls). It fills the very ShipInput
// the player's touch fills — the stick, the sail steps, the swipe off the current, head home, the gull call, the
// chest choice, the consumable slots, the aimed fittings, a drawn course — and nothing else. Its tick has two halves:
// helm(), before the hulls move, works the controls from its own ship and its record (Ship.captain) alone; think(),
// once the tick's survey is in, perceives what its ship and gull could see (perception.ts) and, when its reaction
// time has run, decides: its mode, goal and plan go into its record, so a snapshot resumes it mid-thought.
//
// The skills are shared by every captain and parameterised by a Style; a temperament (WP11 part B) is a Style and
// priorities over the same skills, the first voyage's captains sail the GENTLE one, every other the NEUTRAL one until
// then. Rank sets one number, Ship.captain.skill (0 … 1 from the rank tier): how fast it reacts, how far ahead it leads
// its course on a moving target, how shrewdly it judges a threat to its purse and the storm's sweep, and how well it
// times its items; its gunners' own lead is Outfit.gunnery. Its intent shows before it acts: the heading it means
// to hold (intent()) leads its hull, and a strike is telegraphed for BRAIN.tell s while its course bends round.
import { siteValue } from '../economy.ts';
import { aground, type Sea } from '../environment.ts';
import { callPrice, perched } from '../gull.ts';
import { FLAG, STEER_MAX, type ShipInput } from '../input.ts';
import { bestPick } from '../items.ts';
import { addScaled, cross, datan2, dcos, dot, dsin, hash32, normalize, rngFloat, rngInt, set, v3, type Rng, type V3 } from '../math.ts';
import { passage, type Passage } from '../opening.ts';
import { velocityOf } from '../sailing.ts';
import { R, TERRITORY, angleBetween, cellDir, cellOf, tangentToward } from '../sphere.ts';
import { KNOW, PHASE, SAIL, STREAM, TICK, afloat, fullHull, type MatchState, type Ship } from '../state.ts';
import { newStormView, stormView, type Calm } from '../storm.ts';
import {
  BATTERY, BOWS, CONSUMABLE, FITTING, FORMS, GULL, GUNS, HELM, HOME, MORTAR, PILOT, SLOT, type Gun,
} from '../tables.ts';
import { atHome } from '../territory.ts';
import type { Sight } from '../visibility.ts';
import { ZONE } from '../world/geography.ts';
import { REGIONS } from '../world/regions.ts';
import { apart, newPercept, perceive } from './perception.ts';

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
} as const;

/** How a captain sails: the parameters of the shared skills. A temperament is one of these (part B). */
export interface Style {
  /** u its loops reach beyond its home's rim, and how far a lobe they stretch to (0 round … 1 long and narrow). */
  loop: number;
  stretch: number;
  /** 0 … 1: how readily it fights a rival in sight, and breaks a rival's open trail. */
  fight: number;
  raid: number;
  /** Share of its full hull it runs at with a rival near. */
  run: number;
  /** u it keeps inside the storm's coming calm. */
  margin: number;
  /** 0 … 1: its appetite for chests and finds, and its daring with hazards (from 0.7 it rides the vortex). */
  loot: number;
  bold: number;
  /** Share of its guns' range it lies off a rival at. */
  standoff: number;
}

export const NEUTRAL: Style = { loop: 22, stretch: 0.35, fight: 0.5, raid: 0.5, run: 0.35, margin: 14, loot: 0.6, bold: 0.25, standoff: 0.7 };

/** The first voyage's captains (Mind.gentle): slow to fight and slow to chase, never raiding, running early, drawing small loops. */
export const GENTLE: Style = { loop: 15, stretch: 0.2, fight: 0.15, raid: 0, run: 0.6, margin: 18, loot: 0.7, bold: 0, standoff: 1 };

/** The Style a captain sails by. */
export const styleOf = (c: Captain): Style => (c.gentle ? GENTLE : NEUTRAL);

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
  loot: 40, // u: the farthest find it goes for
  wait: 35, // s it pursues one trail or find before giving it up
  lead: [4, 20], // s to spare it keeps over the storm's sweep
  probe: [5, 10, 16], // u ahead it looks for hazards
  gap: 4, // u between the points of a drawn loop
  patch: [0.3, 0.55], // hull share it patches at
  full: 0.95, // share of its form's purse at which its purse is full: home to bank it
  gentle: 30, // u a gentle captain keeps from the player
};

const by = (pair: readonly number[], s: number): number => pair[0] + (pair[1] - pair[0]) * s;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
const share = (ship: Ship): number => ship.hull / fullHull(ship.form, ship.fittings);

/** Whether ship i has a captain at its helm: never the player's (index 0), nor a ship fitted out without one (Outfit.captain). */
export const captained = (state: MatchState, i: number): boolean => i > 0 && state.ships[i].captain.temperament >= 0;

const P = newPercept(), SV = newStormView(), PASS: Passage = { region: 0, next: -1, untilNext: 0, untilEnd: 0 };
const EMPTY: number[] = [], H = v3(), G = v3(), Q = v3(), T = v3(), U = v3(), V = v3(), STAR = v3(), STAR2 = v3();

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
  if (c.plan.length) {
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
  if (c.mode === MODE.fight || c.mode === MODE.flee) {
    addScaled(H, c.want, pos, -dot(c.want, pos));
    if (dot(H, H) < 1e-12) set(H, ship.head.x, ship.head.y, ship.head.z);
    normalize(H);
  } else toward(pos, c.goal, ship.head, H);
  if (c.tell > 0) { // the bend: from its heading round to the strike, over the telegraph
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
  const rng = state.rng[STREAM.captains + i - 1];
  c.think = Math.round(by(BRAIN.react, c.skill) * (c.gentle ? 1.5 : 1)) + rngInt(rng, BRAIN.jitter + 1);
  perceive(sea, state, i, sight, P);
  stormView(state, SV);
  if (ship.phase === PHASE.riding) {
    if (c.mode === MODE.ride && breaksOff(sea, state, i)) c.mode = MODE.peel;
    return;
  }
  if (ship.phase === PHASE.peeling) return;
  if (c.mode === MODE.ride || c.mode === MODE.peel) set(c.anchor, ship.pos.x, ship.pos.y, ship.pos.z); // its home inked here
  const hurt = ship.hull < c.felt - 1e-6;
  c.felt = ship.hull;
  act(sea, state, i, out, hurt, rng);
  decide(sea, state, i, rng);
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
 * player breaks off; the longer it rides the less it asks, and it waits for a better region only if that comes soon.
 */
function breaksOff(sea: Sea, state: MatchState, i: number): boolean {
  const ship = state.ships[i], t = state.tick * TICK;
  passage(sea, ship.ride, PASS);
  if (t < BRAIN.ride) return false;
  if (PASS.untilEnd < 3) return true;
  const here = regionWorth(state, i, PASS.region) - 0.6 * Math.max(0, dot(ship.pos, state.storm.origin) - 0.6) / 0.4;
  const ahead = PASS.next >= 0 ? regionWorth(state, i, PASS.next) : -Infinity;
  return here >= 1.3 - 0.02 * t && (here >= ahead || PASS.untilNext > 12);
}

function regionWorth(state: MatchState, i: number, r: number): number {
  const c = state.ships[i].captain, taste = (hash32(state.seed, i * 64 + r) & 0xffff) / 0xffff;
  let w = REGIONS[r].richness + 0.4 * taste;
  if ((c.knows & KNOW.breakOff) !== 0 && c.breakOff === r) w += c.gentle ? -0.5 : (styleOf(c).fight - 0.5) * 0.8 + 0.15 * c.grudge;
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
  if (ship.fittings[SLOT.stern].kind === FITTING.mortar && near < MORTAR.range && near > 3 * MORTAR.blast && sure) out.flags |= FLAG.useAimed;
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

function decide(sea: Sea, state: MatchState, i: number, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(c), was = c.mode, aim = c.target;
  let mode = -1;
  if (stormGoal(state, i, style)) mode = MODE.storm;
  else if (flees(state, i, style)) mode = MODE.flee;
  else if (threatened(state, i)) mode = MODE.home;
  if (mode < 0) mode = engages(sea, state, i, style);
  if (mode < 0 && hunts(i, state, style, was)) mode = MODE.hunt;
  if (mode < 0) mode = loots(sea, state, i, style, was);
  if (mode < 0) mode = loops(sea, state, i, style, rng, was);
  if (mode !== was || c.target !== aim) {
    c.since = 0;
    if (mode === MODE.hunt || mode === MODE.ram) c.tell = BRAIN.tell;
  }
  c.mode = mode;
  const reach = style.standoff * (GUNS[ship.fittings[SLOT.broadside].kind]?.range ?? 0); // closing under full sail, fighting under plain
  c.trim = mode === MODE.fight ? (P.rivalD > reach ? SAIL.full : SAIL.plain) : mode === MODE.hold && apart(ship.pos, c.goal) < 12 ? SAIL.reefed : SAIL.full;
  const hasty = mode === MODE.flee || mode === MODE.storm || mode === MODE.ram;
  c.avoid = mode === MODE.loop || mode === MODE.home ? 0 : clearing(sea, state, ship, style, hasty);
  intend(ship);
}

/** The margin it keeps inside the storm's coming calm: a shrewder captain keeps the full margin of its Style. */
const stormMargin = (c: Captain, style: Style): number => style.margin * (0.5 + 0.5 * c.skill);

/**
 * The storm (stormView: what every chart announces): in it, it makes for the calm; inside, while a phase is announced,
 * it leaves for the coming calm once the sweep would reach it with less than its lead to spare — the edge closes from
 * the calm now to the next between the phase's move and its hold — and makes for a point its margin inside that calm.
 */
function stormGoal(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain, pos = ship.pos, margin = stormMargin(c, style);
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

/** Wounded below its Style's run share (a lesser captain holds on longer) with a rival near: it runs, home-ward if home lies away from the rival. */
function flees(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  if (P.rival < 0 || P.rivalD > BRAIN.danger || share(ship) >= style.run * (0.75 + 0.25 * c.skill)) return false;
  toward(ship.pos, state.ships[P.rival].pos, ship.head, T);
  set(c.want, -T.x, -T.y, -T.z);
  if (ship.held > 0 && dot(toward(ship.pos, c.anchor, ship.head, U), T) < 0) normalize(addScaled(c.want, c.want, U, 1));
  c.target = P.rival;
  return true;
}

/**
 * A rival near its open trail (nearer as its skill falls: a lesser captain notices late) while its purse is worth
 * guarding or its hull is low: it cuts the loop short and heads home. A gentle captain keeps clear of the player.
 */
function threatened(state: MatchState, i: number): boolean {
  const ship = state.ships[i], c = ship.captain;
  if (ship.laid.length === 0 || ship.held <= 0 || P.rival < 0) return false;
  if (c.gentle && P.rival === 0 && P.rivalD < BRAIN.gentle) return true;
  if (P.rivalD > by(BRAIN.threat, c.skill)) return false;
  c.target = -1;
  return ship.purse > 0.25 * FORMS[ship.form].purse || share(ship) < 0.6;
}

/**
 * A fight with the nearest rival it knows, when it is willing: by its Style, the rival's wounds (read only hull-up),
 * its own, a grudge against the player, the player's habit of running when wounded (press it), a rival that has hurt
 * it. It rams when its bow or weight make that favourable, else brings a broadside to bear within reach of its guns.
 */
function engages(sea: Sea, state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain, j = P.rival;
  if (j < 0) return -1;
  const r = state.ships[j], d = P.rivalD, theirs = (P.hulls & (1 << j)) !== 0 ? share(r) : 1, mine = share(ship);
  let will = style.fight + 0.6 * (1 - theirs) + 0.3 * (mine - 0.7) + (ship.harm[j] > 0 ? 0.2 : 0);
  if (j === 0) {
    will += 0.15 * c.grudge;
    if ((c.knows & KNOW.run) !== 0 && c.run > 0 && theirs * 100 <= c.run + 10) will += 0.3;
    if (c.gentle) will = ship.harm[0] > 0 ? 0.3 * will : -1;
  }
  if (will < 0.55) return -1;
  const bow = BOWS[ship.fittings[SLOT.bow].kind], mass = FORMS[ship.form].mass / FORMS[r.form].mass;
  if (!c.gentle && d < BRAIN.ram && mine > 0.5 && (bow !== undefined ? theirs < 0.8 || mass >= 1 : mass >= 1.5 && theirs < 0.4)) {
    velocityOf(sea, r, V); // where it will be when the bow arrives, as far ahead as the captain's eye leads
    normalize(addScaled(c.goal, r.pos, V, (c.skill * d) / Math.max(1, ship.speed) / R));
    c.target = j;
    return MODE.ram;
  }
  const gun = GUNS[ship.fittings[SLOT.broadside].kind];
  if (gun === undefined || d > gun.range * BRAIN.engage) return -1;
  broadside(sea, state, i, j, gun, style);
  c.target = j;
  return MODE.fight;
}

/**
 * The heading that lays rival j on a beam: the side whose battery has reloaded if it is not far round, else the
 * nearer; turned in toward the rival when beyond its standoff, away when inside it. A captain of rank lays off for
 * where the rival will be.
 */
function broadside(sea: Sea, state: MatchState, i: number, j: number, gun: Gun, style: Style): void {
  const ship = state.ships[i], c = ship.captain, r = state.ships[j], pos = ship.pos;
  velocityOf(sea, r, V);
  normalize(addScaled(Q, r.pos, V, (c.skill * (P.rivalD / gun.speed + 1)) / R));
  toward(pos, Q, ship.head, T);
  cross(H, pos, T); // the heading with the rival on the starboard beam
  let side = dot(H, ship.head) >= 0 ? 1 : -1;
  const port = ship.reload[BATTERY.port], starboard = ship.reload[BATTERY.starboard];
  if (port === 0 && starboard > 0 && -dot(H, ship.head) > -0.3) side = -1;
  else if (starboard === 0 && port > 0 && dot(H, ship.head) > -0.3) side = 1;
  const a = clamp((P.rivalD - style.standoff * gun.range) / (0.5 * gun.range), -1, 1), ca = dcos(a), sa = dsin(a);
  normalize(set(c.want, side * H.x * ca + T.x * sa, side * H.y * ca + T.y * sa, side * H.z * ca + T.z * sa));
}

/** The nearest open rival trail its chart shows, when worth the raid by its Style, the trail's length and distance, and a grudge. */
function hunts(i: number, state: MatchState, style: Style, was: number): boolean {
  const c = state.ships[i].captain, owner = P.trail;
  if (owner < 0 || P.trailD > BRAIN.hunt || (c.gentle && owner === 0)) return false;
  if (was === MODE.hunt && c.target === owner && c.since > BRAIN.wait) return false;
  const want = style.raid * Math.min(1.5, P.trailLen / 25) * (1 - P.trailD / BRAIN.hunt) + (owner === 0 ? 0.1 * c.grudge : 0);
  if (want < 0.2) return false;
  cellDir(TERRITORY, P.trailCell, c.goal);
  c.target = owner;
  return true;
}

/** The richest find in reach for the distance — a chest by its tier, flotsam and coins by their worth, a wreck or cache to hold beside — or −1. */
function loots(sea: Sea, state: MatchState, i: number, style: Style, was: number): number {
  const c = state.ships[i].captain;
  let best = 0.25, mode = -1, target = -1, at: V3 | null = null;
  if (P.chest >= 0 && P.chestD < BRAIN.loot) {
    const chest = state.chests[P.chest], s = (style.loot * (2 + chest.tier)) / (1 + P.chestD / 10);
    if (s > best) [best, mode, target, at] = [s, MODE.find, P.chest, chest.at];
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
    return MODE.loop;
  }
  set(c.goal, c.anchor.x, c.anchor.y, c.anchor.z); // nowhere to draw a loop now: it keeps to its waters
  return MODE.roam;
}

/** A lobe of a loop by fractions of its half-width and of its reach beyond the home rim (0: back inside its waters). */
const LOBE: readonly (readonly [number, number])[] = [[-1, 0.55], [-0.5, 1], [0.5, 1], [1, 0.55], [1.2, 0]];

/**
 * Captain i's next loop into its record's plan, as the cells of a drawn course: a lobe out of its waters on a bearing
 * that turns round its home from loop to loop, its size by its Style (and smaller as the calm shrinks), every point
 * a gap apart clear of hazards and inside the coming calm by its margin; tried on six bearings, then smaller.
 */
function planLoop(sea: Sea, state: MatchState, i: number, style: Style, rng: Rng): boolean {
  const ship = state.ships[i], c = ship.captain, calm = SV.announced ? SV.next : SV.calm, margin = stormMargin(c, style);
  const inside = dcos(Math.max(0, calm.r - margin / R));
  let reach = Math.min(style.loop * (1 + style.stretch) * (0.85 + 0.3 * rngFloat(rng)), 0.4 * (calm.r * R - margin));
  toward(c.anchor, ship.pos, ship.head, T); // bearings from the anchor, 0 toward the ship
  const width = 0.6 - 0.3 * style.stretch, first = c.loops * 2.4;
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

/** The angle to starboard it bears off its heading for the goal so that the water BRAIN.probe ahead is clear; about, when nothing is. */
function clearing(sea: Sea, state: MatchState, ship: Ship, style: Style, hasty: boolean): number {
  const c = ship.captain, pos = ship.pos, mode = c.mode;
  if (mode === MODE.fight || mode === MODE.flee) normalize(addScaled(H, c.want, pos, -dot(c.want, pos)));
  else toward(pos, c.goal, ship.head, H);
  const turn = ship.rate < 0 ? -1 : 1;
  for (const a of SWERVE) {
    turned(H, pos, a * turn, U);
    let clear = true;
    for (const d of BRAIN.probe) if (hazard(sea, state, ship, style, along(pos, U, d, V), hasty)) clear = false;
    if (clear) return a * turn;
  }
  return 2.6 * turn;
}

/** Its intent: the heading it means to hold, toward its next mark, the chart's inked arrow. */
function intend(ship: Ship): void {
  const c = ship.captain, pos = ship.pos;
  if (c.mode === MODE.fight || c.mode === MODE.flee) set(c.intent, c.want.x, c.want.y, c.want.z);
  else if (c.mode === MODE.loop && c.plan.length) toward(pos, cellDir(TERRITORY, c.plan[Math.min(2, c.plan.length - 1)], Q), ship.head, c.intent);
  else if (c.mode === MODE.loop && ship.course.length) toward(pos, cellDir(TERRITORY, ship.course[Math.min(ship.leg + 2, ship.course.length - 1)], Q), ship.head, c.intent);
  else if (c.mode === MODE.home && ship.home.length) toward(pos, cellDir(TERRITORY, ship.home[Math.min(ship.homeLeg + 2, ship.home.length - 1)], Q), ship.head, c.intent);
  else if (c.mode === MODE.home) toward(pos, c.anchor, ship.head, c.intent);
  else toward(pos, c.goal, ship.head, c.intent);
  if (c.avoid !== 0 && c.mode !== MODE.loop && c.mode !== MODE.home) normalize(turned(set(G, c.intent.x, c.intent.y, c.intent.z), pos, c.avoid, c.intent));
}
