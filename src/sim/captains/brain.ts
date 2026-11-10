// A captain's mind. Every few ticks it thinks: pick a region and dive into it, then at sea weigh the Storm,
// its hull, the ships in sight, the guns it hears, loot, the gull and its own water, and settle on a mode and a goal.
// The weighing is utility scoring (utility.ts) over a dozen options, and the chosen one is carried out by its
// behaviour tree (tree.ts). With nowhere it has to be, it weighs the water round it on the influence map
// (influence.ts). Every tick it steers for the goal (by A* over the nav grid when land is in the way), aims, fires
// and uses what it carries.
import { canCall } from '../economy.ts';
import { aground, seaLevel, seaLevelAt, solidAt } from '../environment.ts';
import type { ShipInput } from '../input.ts';
import { PI, addScaled, dcos, dot, dsin, hash32, length, normalize, rngFloat, rngInt, rngRange, set, v3, type Rng, type V3 } from '../math.ts';
import { cellCentre, clearLine, findPath, lineOfSight, nearestOpen, openAt } from '../nav.ts';
import { GALE_SPEED, galeSeat } from '../opening.ts';
import { activeOf, hasPerk } from '../perks.ts';
import { aimedAt, landing, rangeOf } from '../combat.ts';
import { roomFor, useful } from '../items.ts';
import { draftOf, offWind, pointOfSail, turnRate } from '../sailing.ts';
import { deckAt, newDeck } from '../seaway.ts';
import { R, TERRITORY, apart, along, angleTo, cellDir, tangentAt, tangentToward, turned } from '../sphere.ts';
import { exposure, haven } from './exposure.ts';
import { PHASE, PLAYER, SHIPS, STREAM, TICK, WHALE_STATE, copy, type Captain, type MatchState, type Ship } from '../state.ts';
import { calmNow, inStorm, stormPhase, stormView, newStormView, toEdge } from '../storm.ts';
import { ABOUT, GALE, ITEM, LOOT, PARCELS, PERKS, SHIP, SLOTS, WEAPONS, WEATHER_KIND, WHALE, ZONES, isUse, isWeapon } from '../tables.ts';
import { atHome, holderOf, holdsAt, landmarkHold } from '../territory.ts';
import { seen, SEEN } from '../visibility.ts';
import { newSky, skyAt, vigour } from '../weather.ts';
import { wet } from '../parts.ts';
import { newWind, windAt } from '../wind.ts';
import { CENTRES, LANDMARKS, REGIONS, currentAt, heightAt } from '../world/index.ts';
import { styleOf, type Style } from './temperaments.ts';
import { hears } from './hearing.ts';
import { scout } from './influence.ts';
import { keptClear } from './director.ts';
import { DONE, leaf, select, sequence, when, type Node } from './tree.ts';
import { choose, ease, logistic, momentum, ramp, utility, type Option } from './utility.ts';

export const MODE = { gale: 0, glide: 1, roam: 2, loot: 3, fight: 4, flee: 5, storm: 6, heal: 7, claim: 8, raid: 9, shelter: 10, landmark: 11, hunt: 12 } as const;
export const MODE_NAMES = ['gale', 'glide', 'roam', 'loot', 'fight', 'flee', 'storm', 'heal', 'claim', 'raid', 'shelter', 'landmark', 'hunt'] as const;

export const BRAIN = {
  /** Think every this many ticks. */
  every: 6,
  /** Seconds before a green / a sharp captain first fires on a ship it has just seen. */
  react: [2.2, 0.3],
  /** Preferred range for each weapon, metres. */
  pref: {
    [ITEM.cannon]: 95, [ITEM.scatter]: 28, [ITEM.harpoon]: 170, [ITEM.mortar]: 140, [ITEM.repeater]: 65, [ITEM.broadside]: 45,
    [ITEM.chain]: 75, [ITEM.heated]: 110,
  } as Record<number, number>,
  /** A crippled ship mends as soon as it is safe to: water in her past `flood`, her rudder past `rudder`, her canvas
   *  past `torn`, or her mainmast down. */
  cripple: { flood: 0.35, rudder: 0.5, torn: 0.55 },
  /** Aim error, as a share of distance, for a green captain; a sharp one has a sixth of it. */
  error: 0.2,
  /** Seconds to the next look round for a new goal while roaming. */
  roam: 9,
  repath: 2,
  /** A captain sure of this much that the player stays out in the Storm this many seconds waits for them at its edge. */
  waits: { sure: 0.4, seconds: 3 },
  /**
   * Leaving the Gale: hold on while this many ships that have already left are within `near` metres; everyone still
   * aboard starts leaving this many seconds before it blows out.
   */
  spread: { most: 3, near: 100, gap: 2.5 },
  /**
   * Backing off a bank: a ship making less than `crawl` m/s is stuck. It turns hard toward the open side at about `rate`
   * radians a second, for at least `least` seconds and at most `most`, and holds the turn until its course lies within
   * `slack` of half a turn ahead of it. One aground and dragging slower than `drag` m/s for `wade` seconds, or crawling
   * with shoal water `bow` metres ahead, makes instead for the deepest water `sound` metres round it, for up to `most`
   * seconds more.
   */
  backOff: { crawl: 1, rate: 0.65, least: 1, most: 4.5, slack: 0.6, drag: 2.5, wade: 1, bow: 4, sound: 14 },
  /** Seconds it holds a turn off land ahead once the way clears. */
  avoid: 0.8,
  /**
   * Early in a match a captain would sooner loot than fight: its will to fight falls by this much in each Storm phase, and
   * while it does, it holds its fire outside a fight it chose.
   */
  restraint: [0.5, 0.5, 0.45, 0.35, 0.25, 0.1, 0, 0],
  /** While it holds back, metres off at which it lets a ship sailing away from it go. */
  letGo: 90,
  /** With this many ships or fewer afloat, a captain holds back this much more, and leaves the Storm to bring on the end. */
  lastFew: { ships: 3, more: 0.4 },
  /** Radians a sharp captain swings either side of her course as she weaves away under fire. */
  weave: 0.55,
  /** Metres within which a sharp captain counts the other ships it sees before it picks a fight. */
  crowd: 150,
  /** A sharp captain on the run looks this far round for water behind land, out of its pursuer's sight. */
  hide: [70, 140],
  /** Metres outside a danger a captain keeps as it gets clear of one. */
  berth: 15,
  /**
   * Going to the sound of the guns: a noise (or the director's hunch) is worth going to for `memory` seconds, and gone
   * to once within `arrive` metres. A captain goes with nerve past `nerve` (a hunch adds `hunch`; the director keeping
   * the player's water clear takes `kept`), to `standoff` metres short of it, on the upwind side when it is sharp
   * enough to take the weather gage. The last `endgame` ships afloat all go.
   */
  hunt: { memory: 22, arrive: 30, nerve: 0.42, hunch: 0.3, kept: 0.7, standoff: 85, gage: 0.45, endgame: 6, more: 0.3 },
  /** Less will to start on the player while the director keeps their water clear, unless they shot first. */
  relaxed: 0.35,
  /** The will to fight at which a captain is in two minds about it. */
  will: 0.35,
} as const;

const rngOf = (state: MatchState, i: number): Rng => state.rng[STREAM.captains + i];
/** The sea level the captain thinking now plans by (see levelFor): goals it picks lie in water deep enough at it. */
let tide = 0;
/** The turn, in radians, the ship steering now would make to face its course, before it feels for land ahead. */
let course = 0;
const PICKS = new Int32Array(REGIONS.length);
const P = v3(), Q = v3(), T = v3(), U = v3(), VIEW = newStormView();

// ---------------------------------------------------------------- thinking

export function think(state: MatchState, i: number): void {
  const ship = state.ships[i], c = ship.captain;
  if (ship.phase === PHASE.sunk) return;
  c.think--;
  if (c.think > 0) return;
  c.think = BRAIN.every;
  tide = levelFor(state);
  const style = styleOf(ship), rng = rngOf(state, i);
  if (ship.phase === PHASE.gale) {
    if (c.region < 0) chooseRegion(state, i, rng);
    c.mode = MODE.gale;
    return;
  }
  if (ship.phase === PHASE.glide) {
    c.mode = MODE.glide;
    return;
  }
  c.since += BRAIN.every * TICK;
  c.swapT = Math.max(0, c.swapT - BRAIN.every * TICK);

  // what it can see
  perceive(state, i, style);
  decide(state, i, style, rng);
  // whatever it settled on, it keeps out of thunder, ash and a rising whale
  if (c.mode !== MODE.storm && foulAt(state, c.goal, 0)) {
    escapeFrom(c.goal, BRAIN.berth, c.goal);
    if (!openAt(c.goal, tide)) nearestOpen(c.goal, c.goal, 20, tide);
  }
  c.lean = leanFor(state, i);
}

/** The danger a captain is getting clear of: its centre, and how far from there is safe. */
const DANGER = { at: v3(), r: 0 };

// ---------------------------------------------------------------- deciding
//
// What to do next is chosen by utility (utility.ts) and carried out by a behaviour tree (tree.ts). Every think, each
// option below scores how much it wants doing from what the captain knows; the chooser picks one, keeping to the one in
// hand while it is still good enough; and the chosen option's tree works out where to make for. A tree that finds it
// can't (no loop round a landmark fits, say) hands the choice to the next best option.

/** What a captain weighs when it thinks, gathered once a think and shared by the options' scores and trees. */
interface Mind {
  state: MatchState;
  i: number;
  ship: Ship;
  c: Captain;
  style: Style;
  rng: Rng;
  /** Metres to the Storm's edge; whether the next circle is closing or nearly due, and whether it is inside it. */
  edge: number;
  late: boolean;
  inNext: boolean;
  /** Metres to its foe (very far without one); whether it is armed. */
  foeD: number;
  armed: boolean;
  /** Whether it is partway round a landmark, which it sees through. */
  rounding: boolean;
  /** The loot it would go for (an index into state.loot, or -1), and a rival's trail. */
  loot: number;
  trail: number;
  /** The mode the tree that acted settles on (the option's own, unless a leaf says otherwise). */
  mode: number;
}

const MIND: Mind = {
  state: null as unknown as MatchState, i: 0, ship: null as unknown as Ship, c: null as unknown as Captain, style: null as unknown as Style,
  rng: null as unknown as Rng, edge: 0, late: false, inNext: false, foeD: 0, armed: false, rounding: false, loot: -1, trail: -1, mode: 0,
};

/** An option: its name and rank, the mode it puts the captain in (-1: the one it is in), how it scores, its tree. */
interface Choice extends Option<Mind> { readonly mode: number; readonly tree: Node<Mind> }

/** How urgent getting inside is: from nothing `ease[0]` of its margin in from the edge to everything at `ease[1]`. */
const STORM_EASE = [0.55, 0.3] as const;

const OPTIONS: readonly Choice[] = [
  {
    // 1. the Storm comes first
    name: 'storm', weight: 6, mode: MODE.storm,
    score: (m) => Math.max(ramp(m.edge, m.style.margin * STORM_EASE[0], m.style.margin * STORM_EASE[1]), m.late && !m.inNext && VIEW.phase < 7 ? 1 : 0),
    tree: leaf('make for the calm', (m) => {
      const target = m.edge < m.style.margin * 0.4 || !m.late ? VIEW.calm : VIEW.next;
      inward(m.ship.pos, target.at, Math.max(0, target.r - m.style.margin), m.c.goal);
    }),
  },
  {
    // then out of a thunderstorm or an ash fall, and from over a whale rising to breach
    name: 'shelter', weight: 5.2, mode: MODE.shelter,
    score: (m) => (foulAt(m.state, m.ship.pos, 0) ? 1 : 0),
    tree: leaf('out of the weather', (m) => {
      if (!foulAt(m.state, m.ship.pos, 0)) return false;
      wayOut(m.state, m.ship.pos, m.style, m.c.goal);
    }),
  },
  {
    // 2. mend when it is safe to: not with a foe close by, where lying still to mend under its guns only gets it sunk,
    // so it runs first. A sharp captain tops up sooner, between fights
    name: 'heal', weight: 3.5, mode: MODE.heal,
    score: (m) => (healSlot(m.ship) < 0 ? 0 : utility(mendNeed(m), ramp(m.foeD, 55, 90))),
    tree: leaf('mend', (m) => {
      const { ship, c } = m;
      // where it is, unless the tide is leaving it there
      if (!openAt(ship.pos, tide) || !nearestOpen(ship.pos, c.goal, 10, tide)) copy(c.goal, ship.pos);
      if (c.foe >= 0) away(ship.pos, foeAt(m.state, c), 60, c.goal);
    }),
  },
  {
    // 3. run from a fight it is losing; or, shot at by a ship it won't fight, get out of her guns' reach (a green
    // captain is slower to, and sails on under them)
    name: 'flee', weight: 3.3, mode: MODE.flee,
    score: (m) => Math.max(losing(m), evading(m)),
    tree: sequence(
      select(
        // behind land, out of her pursuer's sight
        when((m) => m.c.skill > 0.35, leaf('behind the land', (m) => behindLand(m.state, m.i, m.style, m.c.goal))),
        leaf('away', (m) => void away(m.ship.pos, foeAt(m.state, m.c), 120, m.c.goal)),
      ),
      leaf('inside', (m) => keepInside(m.state, m.c.goal, m.style)),
    ),
  },
  {
    // 4. fight what it sees
    name: 'fight', weight: 2.6, mode: MODE.fight,
    score: (m) => fightUrge(m),
    tree: select(
      // a captain who has learnt that the player lingers out in the Storm waits at its edge for them to come back in
      when((m) => m.c.foe === PLAYER && waitsOut(m.c) && inStorm(m.state, foeAt(m.state, m.c)), leaf('wait at the edge', (m) => {
        lieInWait(foeAt(m.state, m.c), m.style.margin * 0.6, m.c.goal);
      })),
      leaf('close', (m) => void copy(m.c.goal, foeAt(m.state, m.c))),
    ),
  },
  {
    // 4c. guns heard out of sight (or the director's hunch): a captain with the nerve for it goes to see
    name: 'hunt', weight: 2, mode: MODE.hunt,
    score: (m) => huntUrge(m),
    tree: leaf('to the guns', (m) => {
      const { ship, c } = m;
      approach(m.state, m.i, m.style, c.goal);
      // got there and found nothing: it lets that noise go
      if (apart(ship.pos, c.goal) < BRAIN.hunt.arrive) {
        c.heardT = m.state.tick * TICK;
        copy(c.heard, ship.pos);
        c.hunch = false;
      }
    }),
  },
  {
    // 6. loot worth having (the gull, when it is flush, is hailed in helm, so the input is set on the tick it thinks)
    name: 'loot', weight: 1.8, mode: MODE.loot,
    score: (m) => {
      // a captain going round a landmark sees it through, though loot or a rival's trail turns up; the trail it lays
      // wouldn't last for the detour
      m.loot = m.rounding ? -1 : bestLoot(m.state, m.i, m.style);
      return m.loot < 0 ? 0 : ease(LOOT_WORTH.v, 0.05, 0.3);
    },
    tree: leaf('take it', (m) => {
      const { c } = m, l = m.state.loot[m.loot];
      if (!l) return false;
      c.target = l.id;
      copy(c.goal, l.at);
      // loot lying in the shallows it takes from the edge of the water deep enough to reach it by
      if (!openAt(c.goal, tide)) nearestOpen(c.goal, c.goal, 1, tide);
    }),
  },
  {
    // 7. raid a rival's trail
    name: 'raid', weight: 1.2, mode: MODE.raid,
    score: (m) => {
      if (m.style.raid <= 0.4 || m.c.gentle || m.rounding) return 0;
      m.trail = nearestTrail(m.state, m.i, 160);
      return m.trail < 0 ? 0 : m.style.raid * 0.8;
    },
    tree: leaf('cut her trail', (m) => void cellDir(TERRITORY, m.trail, m.c.goal)),
  },
  {
    // 8. make for its own water while it can: a rival could reach the open trail before it is safe. Seen through once begun.
    name: 'turn back', weight: 2.3, mode: -1,
    score: (m) => (exposed(m) ? 1 : 0),
    tree: leaf('make for home', (m) => {
      const c = m.c;
      if (!haven(m.state, m.i, c.goal)) return false;
      c.ring = [];
      c.li = 0;
    }),
  },
  {
    // 9. claim water: a loop out from home and back, or round a landmark, seen through once begun
    name: 'ring', weight: 1.5, mode: -1,
    score: (m) => ((m.c.mode === MODE.claim || m.c.mode === MODE.landmark) && m.c.li < m.c.ring.length ? 1 : 0),
    tree: leaf('round the loop', (m) => {
      const c = m.c, p = c.ring[c.li];
      if (apart(m.ship.pos, p) < (c.mode === MODE.landmark ? 12 : 18)) c.li++;
      if (c.li >= c.ring.length) return false;
      copy(c.goal, c.ring[c.li]);
    }),
  },
  {
    name: 'home', weight: 1, mode: MODE.claim,
    score: (m) => (m.c.claimT <= 0 && m.edge > m.style.loop * 2 ? 0.7 : 0),
    tree: select(
      // a landmark near enough to sail round, for the captains who go for them, from home water or by way of it
      when((m) => rngFloat(m.rng) < m.style.marks, leaf('round a landmark', (m) => {
        if (!markLoop(m.state, m.i, m.style)) return false;
        m.c.claimT = rngRange(m.rng, 12, 30);
        m.mode = MODE.landmark;
        copy(m.c.goal, m.c.ring[0]);
      })),
      when((m) => atHome(m.state, m.i), leaf('claim water', (m) => {
        planLoop(m.state, m.i, m.style, m.rng);
        m.c.claimT = rngRange(m.rng, 12, 30);
        if (m.c.ring.length === 0) return false;
        copy(m.c.goal, m.c.ring[0]);
      })),
    ),
  },
  {
    // 10. otherwise roam: home water when it has some, else somewhere in the circle
    name: 'roam', weight: 1, mode: MODE.roam,
    score: () => 0.15,
    tree: leaf('roam', (m) => {
      const c = m.c;
      if (c.mode !== MODE.roam || c.since > BRAIN.roam || apart(m.ship.pos, c.goal) < 20) {
        // (the roam starts afresh, so the time since it began counts from now)
        c.since = 0;
        roamGoal(m.state, m.i, m.style, m.rng);
      }
    }),
  },
];

/** The option a mode belongs to: the one whose mode it is, with a loop's modes belonging to seeing it through. */
const OPTION_OF: Int8Array = (() => {
  const o = new Int8Array(MODE_NAMES.length).fill(-1);
  OPTIONS.forEach((x, k) => {
    if (x.mode >= 0 && o[x.mode] < 0) o[x.mode] = k;
  });
  o[MODE.claim] = o[MODE.landmark] = OPTIONS.findIndex((x) => x.name === 'ring');
  return o;
})();

export const OPTION_NAMES: readonly string[] = OPTIONS.map((o) => o.name);
/** Each ship's options as last scored (weighted), for anyone watching the captains think; never read by the sim. */
export const SCORES: Float64Array[] = Array.from({ length: SHIPS }, () => new Float64Array(OPTIONS.length));
const TRIED = new Float64Array(OPTIONS.length);
const HAVEN = v3();

function decide(state: MatchState, i: number, style: Style, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, m = MIND;
  stormView(state, VIEW);
  m.state = state; m.i = i; m.ship = ship; m.c = c; m.style = style; m.rng = rng;
  m.edge = toEdge(state, ship.pos);
  m.inNext = apart(ship.pos, VIEW.next.at) < VIEW.next.r - style.margin * 0.5;
  m.late = VIEW.closing || VIEW.left < 25;
  m.foeD = c.foe >= 0 ? apart(ship.pos, foeAt(state, c)) : 1e9;
  m.armed = hasWeapon(ship);
  m.rounding = c.mode === MODE.landmark && c.li < c.ring.length;
  m.loot = -1; m.trail = -1;
  c.claimT -= BRAIN.every * TICK;

  // choose, and carry it out; an option whose tree can't be carried out is struck off and the next best chosen
  const scores = SCORES[i];
  let current = OPTION_OF[c.mode] ?? -1;
  STRUCK.fill(0);
  for (let tries = 0; tries < OPTIONS.length; tries++) {
    const k = choose(OPTIONS, m, current, c.skill, rng, tries === 0 ? scores : TRIED, STRUCK, momentum(c.since));
    if (k < 0) break;
    const o = OPTIONS[k];
    m.mode = o.mode >= 0 ? o.mode : c.mode;
    if (o.tree(m) === DONE) {
      setMode(c, m.mode);
      return;
    }
    STRUCK[k] = 1;
    if (current === k) current = -1;
  }
  setMode(c, MODE.roam);
  roamGoal(state, i, style, rng);
}

/** How much she needs mending: hull or shield under what its temperament (and, sharper, sooner) tops up at, or a
 *  part crippled. */
function mendNeed(m: Mind): number {
  const { ship, c, style } = m, hull = style.mend + 20 * c.skill, shield = 25 + 25 * c.skill;
  return Math.max(ramp(ship.hull, hull + 8, hull - 8), ramp(ship.shield, shield + 8, shield - 8), crippled(ship) ? 1 : 0);
}

/** Out on a trail with too little head start on the quickest rival (each captain's reading of it out by a share that
 *  shrinks with skill), or already making for home. */
function exposed(m: Mind): boolean {
  const { c, ship, style, state, i } = m;
  if (ship.laid.length === 0 || (c.mode !== MODE.claim && c.mode !== MODE.landmark)) return false;
  if (!haven(state, i, HAVEN)) return false;
  if (c.ring.length === 0) return true;
  const misjudged = 1 + (1 - c.skill) * 0.35 * (rngFloat(m.rng) * 2 - 1);
  return exposure(state, i, apart(ship.pos, HAVEN), misjudged) > -style.headStart;
}

/** Losing a fight: her hull down past where its temperament runs (sooner when gentle), with the foe close. */
function losing(m: Mind): number {
  const { ship, c, style } = m;
  if (c.foe < 0) return 0;
  const run = style.run * (c.gentle ? 1.3 : 1);
  return utility(ramp(ship.hull, run + 8, run - 4), ramp(m.foeD, 160, 130));
}

/** Shot at by a ship it doesn't want to fight: the less it wants to, and the sharper it is, the more it gets clear. */
function evading(m: Mind): number {
  const { ship, c } = m;
  if (c.foe < 0 || m.foeD >= 140 || !shotBy(m.state, ship, c.foe, 90)) return 0;
  return utility(1 - fightUrge(m), 0.3 + 0.7 * c.skill);
}

/**
 * How much it wants to fight the ship it sees, from its will: its temperament and mood, the odds (as a sharp captain
 * reads them), whether it was shot, the crowd round it where a third ship finishes whoever wins, what it has learnt
 * of the player, and how far into the match it is. Early on it would sooner loot, and lets a ship running from it go.
 * Close enough, it fights whatever its will.
 */
function fightUrge(m: Mind): number {
  const { state, i, ship, c, style } = m;
  if (c.foe < 0 || !m.armed) return 0;
  const foe = state.ships[c.foe], d = m.foeD;
  let will = style.fight * (0.6 + 0.4 * c.aggro);
  will += (0.1 + 0.5 * c.skill) * ((ship.hull + ship.shield) - (foe.hull + foe.shield)) / 100;
  // shot by it: roused, and cooling over a few seconds after
  if (shotBy(state, ship, c.foe, 240)) will += 0.4 * ramp(state.tick - ship.lastHit, 240, 90);
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    if (j !== i && j !== c.foe && o.phase === PHASE.sea && apart(ship.pos, o.pos) < BRAIN.crowd && (seen(state, i, j) & SEEN.visible) !== 0) will -= 0.25 * c.skill;
  }
  // a captain who has learnt where the player's hull breaks presses the attack below it
  if (c.foe === PLAYER && c.run.confidence > 0.3 && foe.hull < c.run.value + 10) will += 0.3;
  if (c.foe === PLAYER && c.gentle) will -= 0.3;
  // the director keeps the player's water clear after a fight: a fresh captain is in less of a hurry to start another
  if (c.foe === PLAYER && keptClear(state, i) > 0 && !shotBy(state, ship, PLAYER, 300)) will -= BRAIN.relaxed;
  const restraint = holdBack(state);
  will -= restraint;
  // close aboard, it fights whatever its will, easing off as they open out again
  const close = ramp(d, 50 - 50 * restraint, 35 - 50 * restraint);
  if (close >= 1) return 1;
  // holding back, it lets a ship going away from it go once she is past its guns' best range. Letting go sticks: in a
  // fight, it lets her go when she is clearly sailing away; out of one, it takes her up again only when she clearly
  // comes on, not as she weaves
  let go = 1;
  if (restraint > 0) {
    const off = dot(foe.head, normalize(addScaled(P, foe.pos, ship.pos, -1)));
    go = 1 - ramp(d, BRAIN.letGo - 10, BRAIN.letGo + 15) * (c.mode === MODE.fight ? ramp(off, 0, 0.35) : ramp(off, -0.45, -0.15));
  }
  return Math.max(close, utility(logistic(will, BRAIN.will, 0.1), go));
}

/** How much it wants to go and see the guns it heard (or the director's hunch): by its nerve, if it is fit to. */
function huntUrge(m: Mind): number {
  const { state, i, ship, c, style } = m, h = BRAIN.hunt;
  if (state.tick * TICK - c.heardT > h.memory || apart(ship.pos, c.heard) < h.arrive) return 0;
  if (!m.armed || crippled(ship) || ship.hull < style.run + 20) return 0;
  if (toEdge(state, c.heard) < style.margin * 0.5) return 0;
  let n = nerveOf(state, i, style) + (c.hunch ? h.hunch : 0);
  const clear = keptClear(state, i);
  if (clear > 0 && apart(c.heard, state.ships[PLAYER].pos) < clear) n -= h.kept;
  // fading as the noise grows old
  return utility(logistic(n, h.nerve, 0.08), ramp(state.tick * TICK - c.heardT, h.memory, h.memory * 0.5));
}

const STRUCK = new Uint8Array(OPTIONS.length);

function setMode(c: Captain, mode: number): void {
  if (c.mode !== mode) {
    c.mode = mode;
    c.since = 0;
    c.path.length = 0;
  }
}

/** Whether the captain saw its foe (or the foe's decoy) when it last looked. It looks every BRAIN.every ticks. */
export const inSight = (state: MatchState, c: Captain): boolean => state.tick * TICK - c.seen < (BRAIN.every - 0.5) * TICK;

/** Where the captain takes its foe to be: where it sees it, or else where it last saw it. A ship it can't see it
 *  doesn't follow, aim at or fire on; it makes for the spot it lost it at, and lets it go after 4 s. */
const foeAt = (state: MatchState, c: Captain): V3 => (inSight(state, c) ? state.ships[c.foe].pos : c.last);

/** Chooses the region to dive to: its own pick, or the player's, if it has learnt where the player goes. */
const inFirst = (state: MatchState, r: number): boolean => apart(CENTRES[r], state.storm.centres[0]) <= ZONES[0] - 120;

function chooseRegion(state: MatchState, i: number, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship);
  // a region whose heart is inside the first safe circle
  let r = rngInt(rng, REGIONS.length);
  for (let k = 0; k < 4 && !inFirst(state, r); k++) r = rngInt(rng, REGIONS.length);
  const knows = c.dive.confidence >= 0.4 && !state.ships[PLAYER].captain.on;
  if (knows && !c.gentle && style.fight >= 0.55 && rngFloat(rng) < 0.6 + 0.4 * c.dive.confidence) r = c.dive.value;
  else if (knows && (c.gentle || style.fight < 0.35) && r === c.dive.value) r = (r + 1 + rngInt(rng, REGIONS.length - 1)) % REGIONS.length;
  // the fleet spreads out: no region takes more than a quarter of the captains' picks, so a full one sends this
  // captain to the least picked region in the first circle instead
  let captains = 0;
  const picks = PICKS.fill(0);
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j].captain;
    if (!o.on) continue;
    captains++;
    if (j !== i && o.region >= 0) picks[o.region]++;
  }
  if (picks[r] >= Math.max(1, Math.floor(captains / 4))) {
    const from = rngInt(rng, REGIONS.length);
    let best = -1;
    for (let k = 0; k < REGIONS.length; k++) {
      const q = (from + k) % REGIONS.length;
      if (best < 0 || (inFirst(state, q) && !inFirst(state, best)) || (inFirst(state, q) === inFirst(state, best) && picks[q] < picks[best])) best = q;
    }
    r = best;
  }
  c.region = r;
  // the captains who go for landmarks land near the region's own, to loop it from home; the others anywhere near the
  // middle of the region
  const mark = rngFloat(rng) < style.marks, from = mark ? landmarkHold(r) : CENTRES[r];
  tangentAt(from, rngRange(rng, -PI, PI), T);
  along(from, T, mark ? rngRange(rng, 50, 110) : rngRange(rng, 60, 180), c.drop);
  if (!openAt(c.drop, tide)) nearestOpen(c.drop, c.drop, 30, tide);
}

/** Notes the nearest ship it can see, and keeps a grudge against whoever hits it. */
function perceive(state: MatchState, i: number, style: Style): void {
  const ship = state.ships[i], c = ship.captain, now = state.tick * TICK;
  // a sharp captain keeps a better lookout, and sees a ship before it sees her
  let best = -1, bd = style.notice * (0.8 + 0.4 * c.skill) * (c.gentle ? 0.7 : 1);
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    if (j === i || o.phase !== PHASE.sea) continue;
    const d = apart(ship.pos, o.pos);
    if (d > SIGHT_MAX) continue;
    let score = d;
    if (j === ship.lastBy && state.tick - ship.lastHit < 150) score *= 0.5;
    if (j === PLAYER && c.gentle) score *= 1.6;
    if (j === PLAYER && !c.gentle && c.grudge > 0) score *= 0.8;
    if (score >= bd) continue;
    if ((seen(state, i, j) & SEEN.visible) === 0) continue;
    bd = score;
    best = j;
  }
  // a decoy draws the eye of a captain chasing its owner
  if (best >= 0) {
    for (const d of state.decoys) {
      if (d.owner === best && apart(ship.pos, d.pos) < apart(ship.pos, state.ships[best].pos) && d.t > 0) {
        copy(c.last, d.pos);
        c.foe = best;
        c.seen = now;
        c.target = -2;
        return;
      }
    }
  }
  if (best >= 0) {
    if (best !== c.foe) c.react = now + reactTime(c);
    c.foe = best;
    c.seen = now;
    c.target = -1;
    copy(c.last, state.ships[best].pos);
    if (best === PLAYER && ship.lastBy === PLAYER) c.grudge = 1;
  } else if (c.foe >= 0 && (now - c.seen > 4 || state.ships[c.foe].phase !== PHASE.sea)) c.foe = -1;
  // and it listens, for what it can't see: a noise newer than the one it last went by takes over from it (and from a
  // hunch)
  {
    const k = hears(state, i, Q, best);
    if (k >= 0 && state.noise[k].t > c.heardT) {
      copy(c.heard, Q);
      c.heardT = state.noise[k].t;
      c.hunch = false;
    }
  }
}

/** The farthest a captain looks for a ship to fight. */
export const SIGHT_MAX = 240;

const reactTime = (c: Captain): number => BRAIN.react[0] + (BRAIN.react[1] - BRAIN.react[0]) * c.skill + (c.gentle ? 1.5 : 0);

/** Whether ship j has shot this one in the last `ticks`: a bump from a ship sailing into it is no attack. */
const shotBy = (state: MatchState, ship: Ship, j: number, ticks: number): boolean => ship.lastBy === j && state.tick - ship.lastHit < ticks && isWeapon(ship.cause);

/** How much a captain holds back from a fight now: by the Storm's phase, and more among the last few afloat. */
function holdBack(state: MatchState): number {
  const by = BRAIN.restraint[stormPhase(state)];
  if (by <= 0) return 0;
  let afloat = 0;
  for (let j = 0; j < SHIPS; j++) if (state.ships[j].phase !== PHASE.sunk) afloat++;
  return afloat <= BRAIN.lastFew.ships ? by + BRAIN.lastFew.more : by;
}

/** A captain's nerve now, 0..1 or so: its will to go looking for a fight, by temperament, its own state, the Storm's
 *  phase and how few are left. */
function nerveOf(state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain;
  // (the early restraint counts for half: going to look is not yet starting a fight)
  let n = style.fight * (0.6 + 0.4 * c.aggro) - 0.5 * holdBack(state) + (ship.hull + ship.shield - 100) / 400;
  let afloat = 0;
  for (let j = 0; j < SHIPS; j++) if (state.ships[j].phase !== PHASE.sunk) afloat++;
  if (afloat <= BRAIN.hunt.endgame) n += BRAIN.hunt.more;
  return c.gentle ? n - 0.4 : n;
}

/**
 * Where to make for to come on what it heard: `standoff` short of it, so it sights the ships there before it is among
 * them. A sharp captain comes at it from upwind, to hold the weather gage when the fight starts: from upwind she
 * chooses when it starts and when it ends.
 */
function approach(state: MatchState, i: number, style: Style, out: V3): void {
  const ship = state.ships[i], c = ship.captain, h = BRAIN.hunt;
  // already as near as it would stand off and still nothing in sight: it closes on the noise itself to look
  const off = apart(ship.pos, c.heard) < h.standoff * style.standoff * 1.1 ? 0 : h.standoff * style.standoff;
  if (off === 0) {
    copy(out, c.heard);
    if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
    return;
  }
  if (c.skill > h.gage && apart(ship.pos, c.heard) > off * 1.3) {
    windAt(state, c.heard, WIND);
    const m = length(WIND.v);
    if (m > 0.5) {
      // the tangent toward where the wind comes from
      set(T, -WIND.v.x / m, -WIND.v.y / m, -WIND.v.z / m);
      // swung toward its own side of the noise, so it doesn't sail through the fight to get upwind of it
      tangentToward(c.heard, ship.pos, U);
      normalize(set(T, T.x + U.x * 0.6, T.y + U.y * 0.6, T.z + U.z * 0.6));
      along(c.heard, T, off, out);
      if (openAt(out, tide) || nearestOpen(out, out, 20, tide)) {
        keepInside(state, out, style);
        return;
      }
    }
  }
  tangentToward(c.heard, ship.pos, T);
  along(c.heard, T, off, out);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  keepInside(state, out, style);
}

/** Water out of its pursuer's sight behind land, in `out`, the nearest of a ring round it away from the foe. */
function behindLand(state: MatchState, i: number, style: Style, out: V3): boolean {
  const ship = state.ships[i], c = ship.captain, foe = foeAt(state, c);
  tangentToward(ship.pos, foe, U);
  let bd = 1e9;
  for (const r of BRAIN.hide) {
    for (let k = -3; k <= 3; k++) {
      // the half of the ring facing away from the foe
      rotateTangent(ship.pos, U, PI + (k * PI) / 7, T);
      along(ship.pos, T, r, P);
      if (!openAt(P, tide) || toEdge(state, P) < style.margin || lineOfSight(foe, P)) continue;
      const d = r + Math.abs(k) * 10;
      if (d < bd && clearLine(ship.pos, P, 6, tide)) {
        bd = d;
        copy(out, P);
      }
    }
    if (bd < 1e9) return true;
  }
  return false;
}

const hasWeapon = (ship: Ship): boolean => {
  for (let s = 0; s < SLOTS; s++) if (isWeapon(ship.slots[s].kind)) return true;
  return false;
};

/** Hurt in her parts badly enough that mending them comes before anything but a fight close by. */
const crippled = (ship: Ship): boolean =>
  ship.flood > BRAIN.cripple.flood || ship.rudder > BRAIN.cripple.rudder || ship.torn > BRAIN.cripple.torn || ship.fallen > 0;

/** The slot holding the consumable it should use now, or -1. */
function healSlot(ship: Ship): number {
  let best = -1, bv = 0;
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (!isUse(it.kind) || it.n <= 0 || !useful(ship, it.kind)) continue;
    let v = 0;
    // a full repair is worth spending on a fallen mast; a kit on any part badly hurt
    if (it.kind === ITEM.fullRepair) v = ship.hull < 45 || ship.fallen > 0 ? 4 : 0;
    else if (it.kind === ITEM.repairKit) v = ship.hull < 75 || crippled(ship) ? 3 : 0;
    else if (it.kind === ITEM.bigShield) v = ship.shield < 50 ? 2.5 : 0;
    else v = ship.shield < 50 ? 2 : 0;
    if (v > bv) {
      bv = v;
      best = s;
    }
  }
  return best;
}

function bestLoot(state: MatchState, i: number, style: Style): number {
  const ship = state.ships[i], c = ship.captain;
  const reach = style.lootReach * (hasPerk(ship, 'lootSense') ? 1 + PERKS.lootSense / 200 : 1);
  let best = -1, bs = 0;
  for (let k = 0; k < state.loot.length; k++) {
    const l = state.loot[k], d = apart(ship.pos, l.at);
    if (d > reach || toEdge(state, l.at) < 10) continue;
    // nor loot in water too shallow to come within reach of it
    if (!openAt(l.at, tide) && !(nearestOpen(l.at, P, 1, tide) && apart(P, l.at) < LOOT.reach - 1.5)) continue;
    let worth = 0;
    if (isWeapon(l.item.kind)) worth = weaponWorth(ship, l.item.kind, l.item.rarity);
    else if (roomFor(ship, l.item) >= 0) worth = 0.5;
    if (worth <= 0) continue;
    const score = (worth * style.loot) / (1 + d / 60);
    if (score > bs) {
      bs = score;
      best = k;
    }
  }
  if (best >= 0 && c.mode === MODE.loot && c.target >= 0) {
    const k = state.loot.findIndex((l) => l.id === c.target);
    if (k >= 0 && apart(ship.pos, state.loot[k].at) < reach) {
      LOOT_WORTH.v = Math.max(bs, 0.1);
      return k;
    }
  }
  LOOT_WORTH.v = bs;
  return bs > 0.04 ? best : -1;
}
/** The worth of the loot bestLoot last chose (worth to the hotbar, by temperament, falling off with distance). */
const LOOT_WORTH = { v: 0 };

/** How much a weapon would improve the hotbar: 0 if it wouldn't. */
function weaponWorth(ship: Ship, kind: number, rarity: number): number {
  let empty = false, worst = 99, same = -1;
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (it.kind === ITEM.none) empty = true;
    if (isWeapon(it.kind)) {
      worst = Math.min(worst, it.rarity);
      if (it.kind === kind) same = Math.max(same, it.rarity);
    }
  }
  if (same >= rarity) return 0;
  if (empty) return 1 + rarity * 0.2;
  return rarity > worst ? 0.4 + 0.2 * (rarity - worst) : 0;
}

function nearestTrail(state: MatchState, i: number, reach: number): number {
  let best = -1, bd = reach;
  const ship = state.ships[i];
  for (let j = 0; j < SHIPS; j++) {
    if (j === i) continue;
    const laid = state.ships[j].laid;
    for (let k = 0; k < laid.length; k += 6) {
      const d = apart(ship.pos, cellDir(TERRITORY, laid[k], P));
      if (d < bd) {
        bd = d;
        best = laid[k];
      }
    }
  }
  return best;
}

/** A loop out of its own water and back: a few points around a circle that touches home. */
function planLoop(state: MatchState, i: number, style: Style, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain;
  const r = style.loop * (1 - 0.3 * Math.min(1, c.raids.value / 4) * c.raids.confidence);
  c.ring = [];
  c.li = 0;
  // the circle's centre is r out from here, on a side with open water
  const a0 = rngRange(rng, -PI, PI);
  tangentAt(ship.pos, a0, T);
  along(ship.pos, T, r, Q);
  if (!openAt(Q, tide) || toEdge(state, Q) < r + 20) return;
  const spin = rngFloat(rng) < 0.5 ? -1 : 1, n = 6;
  tangentToward(Q, ship.pos, U);
  for (let k = 1; k <= n; k++) {
    const a = (spin * 2 * PI * k) / n;
    const p = v3();
    rotateTangent(Q, U, a, T);
    along(Q, T, r, p);
    if (!openAt(p, tide) && !nearestOpen(p, p, 6, tide)) continue;
    c.ring.push(p);
  }
}

function rotateTangent(p: V3, t: V3, a: number, out: V3): V3 {
  const sx = t.y * p.z - t.z * p.y, sy = t.z * p.x - t.x * p.z, sz = t.x * p.y - t.y * p.x;
  const c = dcos(a), s = dsin(a);
  return set(out, t.x * c + sx * s, t.y * c + sy * s, t.z * c + sz * s);
}

function roamGoal(state: MatchState, i: number, style: Style, rng: Rng): void {
  const ship = state.ships[i], c = ship.captain, calm = calmNow(state);
  if (scout(state, i, style, nerveOf(state, i, style), rng, tide, c.goal)) return;
  for (let tries = 0; tries < 8; tries++) {
    tangentAt(ship.pos, rngRange(rng, -PI, PI), T);
    along(ship.pos, T, rngRange(rng, 60, 160), P);
    // drift toward the middle of the circle as it closes
    if (calm.r < 600) {
      const k = 0.4;
      normalize(set(P, P.x + (calm.at.x - P.x) * k, P.y + (calm.at.y - P.y) * k, P.z + (calm.at.z - P.z) * k));
    }
    if (openAt(P, tide) && toEdge(state, P) > style.margin) {
      copy(c.goal, P);
      return;
    }
  }
  inward(ship.pos, calm.at, Math.max(0, calm.r - style.margin * 2), c.goal);
}

/** A point at most `r` from the centre, along the line from p toward it. */
const waitsOut = (c: Captain): boolean => c.storm.confidence >= BRAIN.waits.sure && c.storm.value >= BRAIN.waits.seconds;

/** The water `inset` metres inside the calm's edge on the way out to p, where a ship out in the Storm comes back in. */
function lieInWait(p: V3, inset: number, out: V3): V3 {
  tangentToward(VIEW.calm.at, p, T);
  along(VIEW.calm.at, T, Math.max(0, VIEW.calm.r - inset), out);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  return out;
}

function inward(p: V3, centre: V3, r: number, out: V3): V3 {
  const d = R * Math.sqrt(Math.max(0, 2 - 2 * dot(p, centre)));
  if (d <= r) return copy(out, p);
  tangentToward(centre, p, T);
  along(centre, T, r * 0.6, out);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  return out;
}

function away(p: V3, from: V3, d: number, out: V3): V3 {
  tangentToward(p, from, T);
  set(T, -T.x, -T.y, -T.z);
  along(p, T, d, out);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
  return out;
}

/**
 * Out of DANGER from p to open water inside the calm: straight out if that is inside, else swung round the danger a
 * little further each way until it is (pulling it in toward the calm's centre only would lead back into the danger).
 * Where the edge of the danger is dry land, it looks on out to the water beyond.
 */
function wayOut(state: MatchState, p: V3, style: Style, out: V3): void {
  for (let k = 0; k <= 12; k++) {
    const swing = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (PI / 12);
    for (let m = 0; m <= 60 && (m === 0 || !openAt(out, tide)); m += 10) escapeFrom(p, BRAIN.berth + m, out, swing);
    if (toEdge(state, out) >= style.margin && openAt(out, tide)) return;
  }
  escapeFrom(p, BRAIN.berth, out);
  keepInside(state, out, style);
  if (!openAt(out, tide)) nearestOpen(out, out, 20, tide);
}

function keepInside(state: MatchState, p: V3, style: Style): void {
  const calm = calmNow(state);
  if (toEdge(state, p) < style.margin) inward(p, calm.at, Math.max(0, calm.r - style.margin), p);
}

/** Metres round the spot a rising whale breaches at that a captain keeps clear of: the lift's reach and a margin. */
const BREACH = WHALE.lift + 15;

/**
 * Whether p is within `pad` of a thunderstorm or an ash fall at more than a third of its strength, or of the spot a
 * whale is rising to breach at, with that in DANGER.
 */
function foulAt(state: MatchState, p: V3, pad: number): boolean {
  const w = state.whale;
  if (w.state === WHALE_STATE.rising && apart(p, w.spot) < BREACH + pad) return foul(w.spot, BREACH);
  for (const s of state.weather) {
    if ((s.kind !== WEATHER_KIND.thunder && s.kind !== WEATHER_KIND.ash) || vigour(s) < 0.35) continue;
    if (apart(p, s.at) < s.r + pad) return foul(s.at, s.r);
  }
  return false;
}

function foul(at: V3, r: number): boolean {
  copy(DANGER.at, at);
  DANGER.r = r;
  return true;
}

/** A point `berth` metres outside DANGER, straight out from its centre through p, or swung `swing` radians round from there. */
function escapeFrom(p: V3, berth: number, out: V3, swing = 0): V3 {
  if (apart(p, DANGER.at) < 1) tangentAt(DANGER.at, 0, T);
  else tangentToward(DANGER.at, p, T);
  if (swing !== 0) turned(T, DANGER.at, swing, T);
  return along(DANGER.at, T, DANGER.r + berth, out);
}

/**
 * How far from its home water a captain looks for a landmark to take, the longest trip out, round it and home that fits
 * in a trail, and how far it goes back to the water it landed in to set out from.
 */
const MARK_REACH = 260;
const MARK_TRIP = 560;
const MARK_HOME = 360;

/**
 * A loop round the hold of the nearest landmark it doesn't hold, well inside the calm and out of any race too strong to
 * sail round in (the Eye's vortex): eight points round it at the first water out from it on each bearing, from the one
 * nearest home all the way round to it again, then home. Home is where it is if that's its own water, else the spot it
 * landed on if it still holds it, sailed to first. None if the trip wouldn't fit in a trail.
 */
function markLoop(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  const out = !atHome(state, i);
  if (out && (!holdsAt(state, i, c.drop) || apart(ship.pos, c.drop) > MARK_HOME)) return false;
  const home = copy(HOME, out ? c.drop : ship.pos);
  let best = -1, near = MARK_REACH;
  for (let r = 0; r < LANDMARKS.length; r++) {
    const h = landmarkHold(r), d = apart(home, h);
    if (d >= near || holderOf(state, r) === i || toEdge(state, h) < style.margin + 40) continue;
    if (length(currentAt(h, U)) > 5) continue;
    best = r;
    near = d;
  }
  if (best < 0) return false;
  const h = landmarkHold(best), spin = i & 1 ? 1 : -1;
  c.ring = [];
  c.li = 0;
  if (out) c.ring.push(copy(v3(), home));
  tangentToward(h, home, U);
  let trip = 2 * near;
  for (let k = 0; k <= 8; k++) {
    rotateTangent(h, U, (spin * 2 * PI * k) / 8, T);
    let r = 16;
    while (r <= 160 && !openAt(along(h, T, r, Q), tide)) r += 6;
    if (r > 160) continue;
    // a little further out where there is water, to clear the shore
    if (openAt(along(h, T, r + 6, P), tide)) copy(Q, P);
    if (c.ring.length > 0) trip += apart(c.ring[c.ring.length - 1], Q);
    c.ring.push(copy(v3(), Q));
  }
  if (c.ring.length < (out ? 7 : 6) || trip > MARK_TRIP) {
    c.ring = [];
    return false;
  }
  c.ring.push(copy(v3(), home));
  return true;
}
const HOME = v3();

/** Leans tried off the straight course to the goal, radians, and what one has to gain over it, m/s made good. */
const LEANS = [-0.6, -0.3, 0.3, 0.6];
const LEAN_GAIN = 0.8;
const WIND = newWind(), FLOW = v3();

/**
 * How far off the straight line to its goal a captain sails, to ride a current going its way or to sail a better
 * point of the wind: the lean that makes most speed good toward the goal, if it beats the straight course by enough.
 * Not in a fight, on a route round land, or close to the goal.
 */
function leanFor(state: MatchState, i: number): number {
  const ship = state.ships[i], c = ship.captain;
  if (c.mode === MODE.fight || c.mode === MODE.gale || c.mode === MODE.glide || c.path.length > 0 || apart(ship.pos, c.goal) < 60) return 0;
  windAt(state, ship.pos, WIND);
  tangentToward(ship.pos, c.goal, U);
  const straight = madeGood(ship.pos, 0);
  let best = 0, most = straight + LEAN_GAIN;
  for (const a of LEANS) {
    const m = madeGood(ship.pos, a);
    if (m > most) [best, most] = [a, m];
  }
  return best;
}

/** Speed made good toward U (the goal's bearing) sailing `a` off it, in the current 35 m out that way. */
function madeGood(p: V3, a: number): number {
  rotateTangent(p, U, a, T);
  along(p, T, 35, Q);
  if (!openAt(Q, tide)) return -Infinity;
  currentAt(Q, FLOW);
  return SHIP.top * pointOfSail(offWind(T, WIND.v)) * dcos(a) + dot(FLOW, U);
}

// ---------------------------------------------------------------- the helm, every tick

export function helm(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, style = styleOf(ship), rng = rngOf(state, i);
  tide = levelFor(state);
  out.fire = false;
  out.select = -1;
  out.swap = -1;
  out.drop = false;
  out.take = false;
  out.reload = false;
  out.gust = false;
  out.ability = false;
  out.dive = false;
  out.hail = -1;
  out.throttle = 1;
  out.steer = 0;

  if (ship.phase === PHASE.gale) {
    galeHelm(state, i, out);
    return;
  }
  if (ship.phase === PHASE.glide) {
    tangentToward(ship.pos, c.drop, T);
    out.steer = angleTo(ship.head, T, ship.pos);
    const d = apart(ship.pos, c.drop), reach = (GALE.glide * ship.alt) / GALE.fall;
    out.dive = d < reach * 0.35;
    return;
  }

  steerFor(state, i, out);
  aimAndFire(state, i, style, rng, out);
  useWhatItCarries(state, i, style, out);
  answer(state, i, out);
  stuck(state, i, rng, out);
}

/**
 * Leaves the Gale when it passes closest to the drop point it chose, or as the Gale is about to blow out. The fleet
 * spreads out: once bound to leave, it holds on while ships that have just left crowd round it.
 */
function galeHelm(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.region < 0) return;
  const now = apart(ship.pos, c.drop);
  galeSeat(state, i, state.gale.t + 1, P, T);
  const soon = apart(P, c.drop), reach = (GALE.glide * GALE.height) / GALE.fall;
  if ((soon > now && now < reach * 0.9) || now < GALE_SPEED * 2 || state.gale.t > GALE.time - BRAIN.spread.gap * lateRiders(state)) c.bound = true;
  out.dive = c.bound && crowd(state, i) < BRAIN.spread.most;
  // the captains after it this tick count it as gone
  if (out.dive) c.mode = MODE.glide;
}

const END = v3(), BEFORE = v3(), EH = v3();

/**
 * Captains still riding whose drop the Gale is still closing on as it blows out. Each needs about BRAIN.spread.gap
 * seconds to itself to leave without a crowd, so they start taking turns that long before the end.
 */
function lateRiders(state: MatchState): number {
  let n = 0;
  for (let j = 0; j < SHIPS; j++) {
    const c = state.ships[j].captain;
    if (state.ships[j].phase !== PHASE.gale || !c.on || c.region < 0 || c.mode === MODE.glide) continue;
    galeSeat(state, j, GALE.time, END, EH);
    galeSeat(state, j, GALE.time - 1, BEFORE, EH);
    if (apart(END, c.drop) < apart(BEFORE, c.drop)) n++;
  }
  return n;
}

/** Ships that have left the Gale, or are leaving it this tick, within BRAIN.spread.near metres of ship i. */
function crowd(state: MatchState, i: number): number {
  let n = 0;
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    const gone = o.phase === PHASE.glide || o.phase === PHASE.sea || (o.phase === PHASE.gale && o.captain.on && o.captain.mode === MODE.glide);
    if (j !== i && gone && apart(o.pos, state.ships[i].pos) < BRAIN.spread.near) n++;
  }
  return n;
}

const WANT = v3();

/** Seconds of tide a captain looks ahead: it routes through water deep enough now and still deep enough then. */
const TIDE_AHEAD = 15;
const levelFor = (state: MatchState): number => Math.min(seaLevel(state), seaLevelAt(state.tick * TICK + TIDE_AHEAD));

const HERE = newWind(), ON = v3(), OFF = v3(), RUN = v3(), DECK = newDeck();
/** How close to the wind a captain beats: `close` radians off the wind's run at its best, and `pinch` higher with
 *  no skill (close to the no-go zone, so the least able pinch into irons now and then); how much nearer the mark must
 *  lie to the other board before it goes about. */
const BEAT = { close: 2.42, pinch: 0.45, layline: 0.3 } as const;

/**
 * To windward it beats: a course in the eye of the wind is sailed close-hauled on one board and then the other,
 * going about once the mark lies nearer the other board's heading by a margin (its layline), so it zigzags up to a
 * mark straight upwind rather than pinching at it.
 */
function beat(state: MatchState, i: number, t: V3): void {
  const ship = state.ships[i], c = ship.captain;
  windAt(state, ship.pos, HERE);
  const w = length(HERE.v);
  if (w < 1e-6 || HERE.strength <= ABOUT.breeze) return;
  const close = BEAT.close + (1 - c.skill) * BEAT.pinch;
  if (offWind(t, HERE.v) <= close) return;
  // the two close-hauled headings: the wind's run turned either way by as close as it sails
  normalize(addScaled(RUN, HERE.v, ship.pos, -dot(HERE.v, ship.pos)));
  rotateTangent(ship.pos, RUN, c.beat * close, ON);
  rotateTangent(ship.pos, RUN, -c.beat * close, OFF);
  if (Math.abs(angleTo(OFF, t, ship.pos)) + BEAT.layline < Math.abs(angleTo(ON, t, ship.pos))) {
    c.beat = -c.beat;
    copy(t, OFF);
  } else copy(t, ON);
}

/**
 * Through a gybe in a blow an able captain eases the helm, so her yards come across under control rather than slam:
 * the turn it wants is cut, by its skill, toward the most she can turn at without throwing them (HERE is the wind
 * beat read this tick).
 */
function easeGybe(ship: Ship, steer: number): number {
  if (HERE.strength <= ABOUT.hard || Math.abs(steer) < 0.05 || length(HERE.v) < 1e-6) return steer;
  normalize(addScaled(RUN, HERE.v, ship.pos, -dot(HERE.v, ship.pos)));
  const a = angleTo(ship.head, RUN, ship.pos);
  // the turn carries her stern through the wind if the wind's run lies between her heading and where she turns to, and
  // the yards are not across until the wind is clear on her other quarter
  const ahead = a * Math.sign(steer);
  if (ahead < -0.32 || ahead > Math.abs(steer)) return steer;
  // in the rate she turns at, which the helm reaches at a third of a radian (sailing.ts sail)
  const max = Math.max(1e-3, turnRate(ship)), want = Math.min(1, Math.abs(steer) / 0.3) * max, safe = ABOUT.crash * 0.8;
  if (want <= safe) return steer;
  const rate = want + (safe - want) * Math.min(1, ship.captain.skill * 1.5);
  return (Math.sign(steer) * 0.3 * rate) / max;
}

function steerFor(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, level = tide;
  if (c.mode === MODE.fight && c.foe >= 0 && inSight(state, c)) {
    fightCourse(state, i, WANT);
  } else copy(WANT, c.goal);
  // land in the way: follow a route. A line from shallows isn't to be trusted, for it starts past the ground the ship is
  // on: a bar there may lie between it and the water beyond, so it works out to open water by the route first.
  const d = apart(ship.pos, WANT), shoaled = !openAt(ship.pos, level);
  let to: V3 = WANT;
  if (d > 12 && (shoaled || !clearLine(ship.pos, WANT, 6, level))) {
    c.repath -= TICK;
    if (c.path.length === 0 || c.repath <= 0 || apart(c.pathTo, WANT) > 30) {
      findPath(ship.pos, WANT, c.path, 4000, level);
      copy(c.pathTo, WANT);
      c.leg = Math.min(1, c.path.length - 1);
      c.repath = BRAIN.repath;
    }
    while (c.leg < c.path.length - 1 && apart(ship.pos, cellCentre(c.path[c.leg], P)) < 10) c.leg++;
    if (c.leg < c.path.length) {
      // look ahead along the route as far as the water is clear
      let k = c.leg;
      while (!shoaled && k + 1 < c.path.length && k < c.leg + 6 && clearLine(ship.pos, cellCentre(c.path[k + 1], Q), 6, level)) k++;
      to = cellCentre(c.path[k], P);
    }
  } else c.path.length = 0;
  tangentToward(ship.pos, to, T);
  if (c.lean !== 0 && c.path.length === 0 && c.mode !== MODE.fight) rotateTangent(ship.pos, T, c.lean, T);
  // under fire on the run, a sharp captain weaves, so the ship behind her can't lead her
  if (c.mode === MODE.flee && c.path.length === 0 && c.foe >= 0 && shotBy(state, ship, c.foe, 150)) {
    c.strafeT -= TICK;
    if (c.strafeT <= 0) {
      c.strafe = -c.strafe;
      c.strafeT = rngRange(rngOf(state, i), 1, 2.2);
    }
    rotateTangent(ship.pos, T, c.strafe * BRAIN.weave * c.skill, T);
  }
  beat(state, i, T);
  let steer = angleTo(ship.head, T, ship.pos);
  course = steer;
  // feel ahead along its course for land, and for floes and columns standing in the water; not along its heading, for
  // a ship coming round in a narrow channel would only ever feel the bank
  along(ship.pos, T, Math.min(14 + ship.speed, apart(ship.pos, to)), Q);
  if (!clearAt(state, Q, level)) {
    const left = probeSide(state, ship, -0.6, level), right = probeSide(state, ship, 0.6, level);
    // it keeps turning off the way it began to, unless only the other side lies open
    let way = Math.sign(c.avoid);
    if (way === 0 || (way < 0 ? !left && right : !right && left)) way = left !== right ? (left ? -1 : 1) : left ? 0 : steer >= 0 ? 1 : -1;
    if (way !== 0) {
      steer = way * (left !== right ? 0.9 : 1.2);
      c.avoid = way * BRAIN.avoid;
    }
  } else if (c.avoid !== 0) {
    // and holds the turn a moment once the way ahead clears, rather than swing straight back at what it turned from
    if (Math.sign(steer) !== Math.sign(c.avoid)) steer = Math.sign(c.avoid) * 0.9;
    c.avoid = c.avoid > 0 ? Math.max(0, c.avoid - TICK) : Math.min(0, c.avoid + TICK);
  }
  out.steer = easeGybe(ship, steer);
  // ease off to pick loot up, or to hold a position
  if ((c.mode === MODE.loot || c.mode === MODE.heal) && d < 25) out.throttle = 0.55;
  if (c.mode === MODE.heal && d < 15) out.throttle = 0.3;
}

const clearAt = (state: MatchState, p: V3, level: number): boolean => openAt(p, level) && !solidAt(state, p);

/**
 * The way off the ground for a ship aground, as a turn from her heading: radians, to starboard positive. It goes by the
 * highest ground she would cross in the first `sound` metres each way, then by how deep the water is at the end of it,
 * so she never makes for deep water over a spit of land.
 */
function deepest(ship: Ship): number {
  let best = 0, low = Infinity;
  for (let k = -7; k <= 8; k++) {
    rotateTangent(ship.pos, ship.head, (k * PI) / 8, T);
    let top = -Infinity, end = 0;
    for (let m = 2; m <= BRAIN.backOff.sound; m += 3) top = Math.max(top, end = heightAt(along(ship.pos, T, m, Q)));
    const score = top + 0.25 * end;
    if (score < low) [low, best] = [score, (k * PI) / 8];
  }
  return best;
}

function probeSide(state: MatchState, ship: Ship, a: number, level: number): boolean {
  rotateTangent(ship.pos, ship.head, a, T);
  along(ship.pos, T, 16 + ship.speed, Q);
  return clearAt(state, Q, level);
}

/** In a fight: hold the selected weapon's preferred range, circling the foe. */
function fightCourse(state: MatchState, i: number, out: V3): void {
  const ship = state.ships[i], c = ship.captain, foe = state.ships[c.foe], style = styleOf(ship);
  const kind = ship.slots[ship.sel].kind;
  const pref = (BRAIN.pref[kind] ?? 80) * style.standoff;
  const d = apart(ship.pos, foe.pos);
  c.strafeT -= TICK;
  if (c.strafeT <= 0) {
    const rng = rngOf(state, i);
    c.strafe = -c.strafe;
    // a sharp captain weaves, turning back more often, so she is hard to lead
    c.strafeT = rngRange(rng, 4, 9) * (1 - 0.6 * c.skill);
    // and more often than not works round to windward of her foe, to keep the weather gage
    if (rngFloat(rng) < c.skill * 0.7) {
      windAt(state, foe.pos, WIND);
      tangentToward(foe.pos, ship.pos, T);
      rotateTangent(foe.pos, T, 0.5, U);
      const port = -dot(U, WIND.v);
      rotateTangent(foe.pos, T, -0.5, U);
      c.strafe = port > -dot(U, WIND.v) ? 1 : -1;
    }
  }
  tangentToward(foe.pos, ship.pos, T);
  // a point on the ring of radius pref round the foe, a little round from where it is now
  const swing = kind === ITEM.broadside ? 0.9 : 0.5;
  rotateTangent(foe.pos, T, c.strafe * swing, U);
  along(foe.pos, U, d < pref * 0.6 ? pref * 1.2 : pref, out);
  // crossing the T: a sharp captain with a broadside lays herself across the bow of a foe coming at her, where every
  // gun bears and the foe's shot can only rake back down her length
  if (kind === ITEM.broadside && c.skill > 0.45 && dot(foe.head, T) > 0.6) along(foe.pos, foe.head, pref, out);
  if (activeOf(ship) === 'ram' && ship.cooldown <= 0 && d < 45 && ship.hull > foe.hull) copy(out, foe.pos);
  if (!openAt(out, tide)) nearestOpen(out, out, 10, tide);
}

const LEAD = v3(), SKY = newSky();

function aimAndFire(state: MatchState, i: number, style: Style, rng: Rng, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain, now = state.tick * TICK;
  void style;
  if (c.foe < 0 || ship.use >= 0 || !inSight(state, c)) {
    copy(out.aim, ship.head);
    along(ship.pos, ship.head, 60, out.aim);
    out.aimY = 2;
    return;
  }
  const foe = state.ships[c.foe], target = c.target === -2 ? c.last : foe.pos;
  const d = apart(ship.pos, target);
  // the right weapon for the range, and for the foe
  if (c.swapT <= 0 && c.mode === MODE.fight && ship.windup <= 0) {
    const s = bestWeapon(ship, d, state, c.foe);
    if (s >= 0 && s !== ship.sel) {
      out.select = s;
      c.swapT = 1.5;
      return;
    }
  }
  const it = ship.slots[ship.sel];
  if (!isWeapon(it.kind)) {
    // healing, it holds what it heals with
    if (c.mode === MODE.heal) return;
    const s = bestWeapon(ship, d);
    if (s >= 0) out.select = s;
    return;
  }
  const w = WEAPONS[it.kind];
  // lead the target by its velocity over the flight time, with a wandering error
  // (a heavy gun's wind-up adds to the flight: the able gunner lays her lead for where the foe will be when it fires)
  const flight = (w.lob ? Math.max(0.9, Math.min(2.8, d / 70)) : d / w.speed) + (ship.windup > 0 ? ship.windup : w.windup) * (0.3 + 0.7 * c.skill);
  set(LEAD, target.x + (foe.vel.x * flight) / R, target.y + (foe.vel.y * flight) / R, target.z + (foe.vel.z * flight) / R);
  normalize(LEAD);
  c.errT -= TICK;
  if (c.errT <= 0) {
    c.errT = rngRange(rng, 0.6, 1.4);
    tangentAt(LEAD, rngRange(rng, -PI, PI), c.errTo);
    const k = rngFloat(rng);
    set(c.errTo, c.errTo.x * k, c.errTo.y * k, c.errTo.z * k);
  }
  const blend = Math.min(1, TICK * 2);
  set(c.err, c.err.x + (c.errTo.x - c.err.x) * blend, c.err.y + (c.errTo.y - c.err.y) * blend, c.err.z + (c.errTo.z - c.err.z) * blend);
  const miss = BRAIN.error * (1 - 0.85 * c.skill) * (c.gentle ? 2 : 1) * d;
  addScaled(out.aim, LEAD, c.err, miss / R);
  normalize(out.aim);
  // a sharp captain puts the harpoon into the head of the sail; anyone with chain shot aims it at the rigging
  out.aimY = (c.skill > 0.7 && it.kind === ITEM.harpoon) || it.kind === ITEM.chain ? 12 : 2.5;
  // fire when in range, past the first moment's surprise, and not in a pause between bursts
  const range = rangeOf(ship, w);
  if (now < c.react || d > range * 0.95 || c.mode === MODE.loot && d > range * 0.6) return;
  // while it holds back it fires only in a fight it chose, or back at a ship close by that has just shot it; not at one
  // that only bumped it, nor after one that has broken off, or the two would trade shots all the way to the bottom
  if (c.mode !== MODE.fight && holdBack(state) > 0 && !(shotBy(state, ship, c.foe, 150) && d < BRAIN.letGo)) return;
  if (c.burst > 0) {
    c.burst -= TICK;
    if (c.burst <= 0) c.burst = -rngRange(rng, 0.8, 2.2) * (c.gentle ? 2.5 : 1);
  } else if (c.burst < 0) {
    c.burst += TICK;
    if (c.burst >= 0) c.burst = rngRange(rng, 1.5, 4);
    return;
  } else c.burst = rngRange(rng, 1.5, 4);
  // in a seaway an able gunner waits for the top of the roll, and the abler for her side to roll down toward the foe
  const deck = c.skill > 0.55 ? deckAt(state, i, DECK) : null;
  if (deck && deck.sea > 0.25 && deck.unsteady > 1.15 - c.skill * 0.6) return;
  if (it.kind === ITEM.broadside) {
    tangentToward(ship.pos, target, T);
    const signed = angleTo(ship.head, T, ship.pos), a = Math.abs(signed);
    if (Math.abs(a - PI / 2) > 0.45) return;
    if (deck && c.skill > 0.75 && deck.sea > 0.3 && Math.sign(signed) * deck.roll < 0) return;
  }
  out.fire = it.n > 0 || ship.reload <= 0;
}

/**
 * The weapon slot that suits this range best, preferring one that's loaded. Given the foe: chain shot for one running
 * away with her canvas whole (or one that sails faster), and not heated shot into rain that would quench it.
 */
function bestWeapon(ship: Ship, d: number, state?: MatchState, foe = -1): number {
  let best = -1, bs = -1e9;
  const f = state && foe >= 0 ? state.ships[foe] : null;
  for (let s = 0; s < SLOTS; s++) {
    const it = ship.slots[s];
    if (!isWeapon(it.kind)) continue;
    const w = WEAPONS[it.kind], pref = BRAIN.pref[it.kind] ?? 80;
    let score = it.rarity * 0.15 - Math.abs(d - pref) / Math.max(pref, 40);
    if (f && it.kind === ITEM.chain) {
      tangentToward(ship.pos, f.pos, T);
      const running = dot(f.head, T) > 0.5 || f.speed > ship.speed + 1.5;
      score += running && f.fallen <= 0 && f.torn < 0.6 ? 0.5 : -0.25;
    }
    if (f && state && it.kind === ITEM.heated) {
      skyAt(state, f.pos, SKY);
      score += wet(SKY) ? -0.8 : f.burn > 0 ? -0.1 : 0.2;
    }
    if (d > rangeOf(ship, w)) score -= 2;
    if (it.n <= 0) score -= 0.6;
    if (s === ship.sel) score += 0.2;
    if (score > bs) {
      bs = score;
      best = s;
    }
  }
  return best;
}

function useWhatItCarries(state: MatchState, i: number, style: Style, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  // consumables
  if (c.mode === MODE.heal && ship.use < 0) {
    const s = healSlot(ship);
    if (s >= 0) {
      if (ship.sel !== s) out.select = s;
      else out.fire = true;
    }
  }
  if (c.mode !== MODE.heal && ship.use < 0 && isUse(ship.slots[ship.sel].kind) && c.swapT <= 0) {
    const s = bestWeapon(ship, c.foe >= 0 ? apart(ship.pos, foeAt(state, c)) : 100);
    if (s >= 0) out.select = s;
  }
  // a full hotbar: drop the worst weapon for better loot in reach
  if (c.mode === MODE.loot && c.target >= 0) {
    const l = state.loot.find((x) => x.id === c.target);
    if (l && apart(ship.pos, l.at) < 9 && roomFor(ship, l.item) < 0 && isWeapon(l.item.kind) && weaponWorth(ship, l.item.kind, l.item.rarity) > 0) {
      let worst = -1;
      for (let s = 0; s < SLOTS; s++) {
        const it = ship.slots[s];
        if (isWeapon(it.kind) && (worst < 0 || it.rarity < ship.slots[worst].rarity)) worst = s;
      }
      if (worst >= 0 && worst !== ship.sel) out.select = worst;
      else out.take = true;
    }
  }
  // the gust: to close in, to run, or to get back inside the circle
  const fleeing = c.mode === MODE.flee || c.mode === MODE.storm;
  if (ship.gusts > 0 && ship.boost <= 0 && ship.use < 0) {
    // caught in irons, an able captain gusts out of it; the rest wait for her to pay off
    if (ship.irons > 0 && c.skill > 0.4 && ABOUT.irons - ship.irons > 0.3 + (1 - c.skill) * 0.8) out.gust = true;
    if ((fleeing && (ship.gusts === 2 || ship.hull < 40)) || (c.mode === MODE.fight && apart(ship.pos, c.goal) > 120)) out.gust = true;
  }
  // the gull, when it has coins to spare and nothing on
  if (c.foe < 0 && (state.tick + i) % 90 === 0) {
    for (let tier = PARCELS.length - 1; tier >= 0; tier--) {
      if (canCall(ship, tier) && ship.coins - PARCELS[tier].cost >= style.thrift) {
        out.hail = tier;
        break;
      }
    }
  }
  // the active ability
  if (ship.cooldown <= 0 && ship.phase === PHASE.sea) out.ability = abilityNow(state, i, style);
}

// ---------------------------------------------------------------- answering what's coming

/**
 * Every heavy attack is telegraphed and every one has an answer (WINDUP). A captain that sees a heavy gun winding up on
 * it, or a mortar shell coming down near it, answers. A sharp one notices sooner and nearly always; a green one is
 * often too slow, or never sees it:
 * - the shell: it sails out from under where it's coming down, and gusts clear, the gust's burst of speed taking it
 *   out of the splash, once the shell is close;
 * - the harpoon and the broadside: it turns her bow or her stern to the gun, whichever is nearer, so she is a narrow
 *   mark and the balls go by either side; a sharp captain with far to turn gusts for the gust's quicker turn.
 */
function answer(state: MatchState, i: number, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (ship.phase !== PHASE.sea || c.gentle) return;
  const notice = 0.2 + 0.75 * c.skill, canGust = ship.gusts > 0 && ship.boost <= 0 && ship.use < 0;
  // shells coming down
  for (const sh of state.shots) {
    if (sh.owner === i || sh.splash <= 0 || sh.g <= 0) continue;
    const t = landing(sh, P);
    // where she'll be by then, as she's going
    set(Q, ship.pos.x + (ship.vel.x * t) / R, ship.pos.y + (ship.vel.y * t) / R, ship.pos.z + (ship.vel.z * t) / R);
    normalize(Q);
    const d = apart(Q, P);
    if (d > sh.splash + 5 || apart(ship.pos, P) > 140) continue;
    // whether this captain sees it in time: once per shell, by the shell and the ship
    // (a shell's speed is set once, with a little chance in it, when it's fired: a key that holds for its flight)
    if (unitHash(i, Math.round(sh.v * 4096) + sh.owner * 131) > notice) continue;
    tangentToward(ship.pos, P, T);
    set(T, -T.x, -T.y, -T.z);
    out.steer = angleTo(ship.head, T, ship.pos);
    out.throttle = 1;
    if (canGust && t < 0.9 + 0.4 * c.skill && d < sh.splash + 2) out.gust = true;
    ANSWERED.shell++;
    return;
  }
  // guns winding up on it
  for (let j = 0; j < SHIPS; j++) {
    const o = state.ships[j];
    if (j === i || o.windup <= 0 || o.phase !== PHASE.sea) continue;
    const w = WEAPONS[o.slots[o.sel].kind];
    if (!w || aimedAt(state, j, w) !== i || (seen(state, i, j) & SEEN.visible) === 0) continue;
    // it notices once the wind-up has gone on long enough for it to (sooner when sharp), or not at all
    const gone = w.windup - o.windup;
    if (gone < (1 - c.skill) * 0.3 || unitHash(i, j * 7919 + Math.floor((state.tick * TICK - gone) * 10)) > notice) continue;
    tangentToward(ship.pos, o.pos, T);
    // bow or stern to her, whichever is the smaller turn: end on, she is a fifth the mark she is broadside on
    const bearing = angleTo(ship.head, T, ship.pos);
    out.steer = Math.abs(bearing) < PI / 2 ? bearing : bearing - Math.sign(bearing) * PI;
    // and a sharp captain with a long way to turn gusts, for the gust's quicker turn
    if (canGust && c.skill > 0.45 && Math.abs(out.steer) > 0.6) out.gust = true;
    ANSWERED.gun++;
    return;
  }
}

/** Ticks spent answering shells and guns, for watching; never read by the sim. */
export const ANSWERED = { shell: 0, gun: 0 };

/** A number in 0..1 fixed by its two keys, for a choice made once and kept (whether a captain notices a threat). */
const unitHash = (a: number, b: number): number => (hash32(a * 2654435761, b) >>> 0) / 4294967296;

function abilityNow(state: MatchState, i: number, style: Style): boolean {
  const ship = state.ships[i], c = ship.captain;
  const foe = c.foe >= 0 && inSight(state, c) ? state.ships[c.foe] : null, d = c.foe >= 0 ? apart(ship.pos, foeAt(state, c)) : 1e9;
  switch (activeOf(ship)) {
    case 'repair': return ship.hull < 70;
    case 'smokeScreen': return c.mode === MODE.flee && d < 110;
    case 'ram': {
      if (!foe || d > 40 || c.mode !== MODE.fight) return false;
      tangentToward(ship.pos, foe.pos, T);
      return Math.abs(angleTo(ship.head, T, ship.pos)) < 0.3;
    }
    case 'reveal': return c.foe < 0 && c.since > 10 && style.fight > 0.4;
    case 'hardTurn': return (c.mode === MODE.flee && d < 60) || c.stuckT > 2;
    case 'decoy': return c.mode === MODE.flee && d < 140;
    case 'wave': return d < 30;
    case 'driftMine': {
      if (!foe || d > 70) return false;
      tangentToward(ship.pos, foe.pos, T);
      return Math.abs(angleTo(ship.head, T, ship.pos)) > 2.2;
    }
    // under a foe that can't turn away in time: slow, or close and in the fight
    default: return false;
  }
}

/**
 * Backs off land it is stuck against. It goes by how far it really sailed last tick, not by its speed: a hull pressed
 * into a bank or a floe keeps its way on while hardly moving.
 */
function stuck(state: MatchState, i: number, rng: Rng, out: ShipInput): void {
  const ship = state.ships[i], c = ship.captain;
  if (c.backT > 0) {
    c.backT -= TICK;
    out.steer = c.strafe * 2.4;
    out.throttle = 0.6;
    return;
  }
  const crawling = apart(ship.was, ship.pos) < BRAIN.backOff.crawl * TICK, free = ship.flip <= 0 && ship.use < 0;
  // aground and dragging at a grounded ship's pace, or held up by shoal water off her bow (as in a pool a falling tide
  // has closed round her), it stops making for its mark across the bar and works off it the way the water deepens,
  // mending or not; the back-off clock runs below zero for the time it spends so
  const { drag, wade, most, bow } = BRAIN.backOff, draft = draftOf(ship);
  const held = (aground(state, ship.pos, draft) && ship.speed < drag) || (crawling && aground(state, along(ship.pos, ship.head, bow, Q), draft));
  if (held && ship.flip <= 0 && c.backT > -(wade + most)) {
    c.backT -= TICK;
    if (c.backT > -wade) return;
    if (c.backT + TICK > -wade) c.path.length = 0;
    // (with the way off astern it holds the turn it is in, or it would swing from one side to the other)
    const deep = deepest(ship);
    out.steer = Math.abs(deep) > PI / 2 && ship.rate * deep < 0 ? Math.sign(ship.rate) * 2.4 : Math.max(-2.4, Math.min(2.4, 2 * deep));
    out.throttle = 0.6;
    return;
  }
  // and if that doesn't float it, it backs off as from a bank
  const gaveUp = c.backT <= -(wade + most);
  c.backT = 0;
  if ((crawling || gaveUp) && free) c.stuckT += gaveUp ? 2.5 : TICK;
  else c.stuckT = Math.max(0, c.stuckT - TICK * 2);
  if (c.stuckT > 2.5) {
    c.stuckT = 0;
    c.path.length = 0;
    // it turns off toward whichever side lies open, or on the way to its course when both do
    const left = probeSide(state, ship, -1.2, tide), right = probeSide(state, ship, 1.2, tide);
    c.strafe = left !== right ? (left ? -1 : 1) : course >= 0 ? 1 : -1;
    // and keeps turning until its course lies less than half a turn on, so it doesn't swing back across the bank
    const { rate, least, slack } = BRAIN.backOff;
    const round = c.strafe * course >= 0 ? Math.abs(course) : 2 * PI - Math.abs(course);
    c.backT = Math.min(most, Math.max(rngRange(rng, least, least * 2.2), (round - PI + slack) / rate));
  }
}

export const modeName = (m: number): string => MODE_NAMES[m] ?? 'roam';
