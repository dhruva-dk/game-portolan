// Making a match from its setup: the seed, the date (which picks the rule), and the fleet.
import { STARTER_ACTIVE, STARTER_PASSIVE, type ActiveId, type PassiveId } from './abilities.ts';
import type { LearntMind } from './end.ts';
import { empty, seedLoot, starter } from './items.ts';
import { hash32, rngFrom, rngFloat, rngInt, rngRange } from './math.ts';
import { galeSeat, planGale } from './opening.ts';
import { activeIndex, passiveIndex } from './perks.ts';
import { RULE, ruleFor } from './rules.ts';
import { TERRITORY } from './sphere.ts';
import { GULL, PHASE, SHIPS, STREAM, STREAMS, WHALE_STATE, type Captain, type MatchState, type Ship } from './state.ts';
import { planStorm } from './storm.ts';
import { DAY, GALE, GUST, SLOTS } from './tables.ts';
import { newWeather } from './weather.ts';
import { planWhale } from './whale.ts';
import { newGusts } from './wind.ts';

/** One ship in the fleet. Leave `captain` false for the player's ship. */
export interface FleetEntry {
  /** A captain sails this ship. */
  captain: boolean;
  /** Indices the interface and renderer map to a name and a look. */
  name?: number;
  look?: number;
  /** 0–5: which temperament (see captains/temperaments.ts). */
  temperament?: number;
  /** 0 (green) to 1 (sharp). */
  skill?: number;
  /** A gentle captain: for a first match. */
  gentle?: boolean;
  active?: ActiveId;
  passive?: PassiveId;
  /** What this captain already knows of the player, from earlier matches. */
  mind?: Partial<LearntMind>;
}

export interface MatchSetup {
  seed: number;
  /** The day, as YYYY-MM-DD: it picks the rotating rule. */
  date?: string;
  /** Overrides the date's rule (see rules.ts). */
  rule?: number;
  /** Overrides the random start hour (0–24) and tilt (radians). */
  hour?: number;
  tilt?: number;
  /** Up to 20 ships; missing ones are filled with captains. Ship 0 is the player's unless its entry says captain. */
  fleet?: readonly FleetEntry[];
  /** Every captain is gentle: a first match. */
  gentle?: boolean;
}

const xyz = () => ({ x: 0, y: 0, z: 1 });
const expect = (e?: { value: number; confidence: number }) => ({ value: e?.value ?? 0, confidence: e?.confidence ?? 0 });

function newCaptain(e: FleetEntry, i: number, seed: number, gentle: boolean): Captain {
  const h = hash32(seed, 0xc0ffee + i), rng = rngFrom(h);
  const m = e.mind ?? {};
  return {
    on: e.captain, temperament: e.temperament ?? rngInt(rng, 6), skill: e.skill ?? rngRange(rng, 0.35, 0.9),
    gentle: e.gentle ?? gentle, grudge: 0, aggro: rngRange(rng, 0.2, 1), greed: rngRange(rng, 0.2, 1),
    dive: expect(m.dive), loop: expect(m.loop), raids: expect(m.raids), run: expect(m.run), storm: expect(m.storm),
    watches: e.captain, eyed: false,
    mode: 0, think: rngInt(rng, 6), since: 0, react: 0, foe: -1, seen: -1e9, last: xyz(), goal: xyz(), want: xyz(), target: -1,
    region: -1, drop: xyz(), path: [], leg: 0, pathTo: xyz(), repath: 0, strafe: rngFloat(rng) < 0.5 ? -1 : 1, strafeT: 0,
    err: xyz(), errTo: xyz(), errT: 0, burst: 0, swapT: 0, stuckT: 0, backT: 0, claimT: 0, ring: [], li: 0, avoid: 0, felt: 0,
  };
}

function newShip(state: MatchState, e: FleetEntry, i: number, gentle: boolean): Ship {
  const ship: Ship = {
    name: e.name ?? i, look: e.look ?? i, phase: PHASE.gale, pos: xyz(), head: { x: 1, y: 0, z: 0 }, was: xyz(), alt: GALE.height, vy: 0,
    speed: 0, drift: 0, rate: 0, turn: 0, shove: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 100, shield: state.rule === RULE.fullShields ? 100 : 0,
    slots: Array.from({ length: SLOTS }, empty), sel: 0, cool: 0, reload: 0, equip: 0, use: -1, useT: 0,
    gusts: GUST.charges, gustT: 0, boost: 0, aim: xyz(), aimY: 0,
    active: Math.max(0, activeIndex(e.active ?? STARTER_ACTIVE)), passive: Math.max(0, passiveIndex(e.passive ?? STARTER_PASSIVE)),
    cooldown: 0, power: 0, burn: 0, burnBy: -1, slow: 0, spotted: 0, revealed: 0, ice: 0, ash: 0, flip: 0, scrape: 0,
    kills: 0, dealt: 0, place: 0, by: -1, cause: -1, lastBy: -1, lastHit: -100000, landed: -1, sunk: -1, coins: 0, sailed: 0,
    regions: 0, laid: [], held: 0, perks: 0,
    gull: { state: GULL.home, t: 0, tier: 0, at: xyz(), alt: 0 },
    near: -1, captain: newCaptain(e, i, state.seed, gentle),
  };
  ship.slots[0] = starter(state);
  galeSeat(state, i, 0, ship.pos, ship.head);
  ship.was = { ...ship.pos };
  return ship;
}

/** A new match, at its first tick: the fleet aboard the Gale, the loot laid out, the Storm planned. */
export function createMatch(setup: MatchSetup): MatchState {
  const seed = setup.seed >>> 0;
  const rng = Array.from({ length: STREAMS }, (_, k) => rngFrom(hash32(seed, k)));
  const w = rng[STREAM.world];
  const rule = setup.rule ?? ruleFor(setup.date);
  const state: MatchState = {
    seed, tick: 0, rule,
    hour: setup.hour ?? rngRange(w, 0, 24),
    tilt: setup.tilt ?? rngRange(w, -DAY.tilt, DAY.tilt),
    rng,
    ships: [],
    gale: { from: xyz(), dir: { x: 1, y: 0, z: 0 }, at: xyz(), head: { x: 1, y: 0, z: 0 }, t: 0, done: false },
    storm: { region: 0, centres: [], start: 0, phase: 0, shrinking: false, scale: 1 },
    gusts: newGusts(),
    weather: newWeather(),
    owner: new Uint8Array(TERRITORY.cells),
    trail: new Uint8Array(TERRITORY.cells),
    loot: [], nextId: 1, shots: [], clouds: [], decoys: [], mines: [],
    whale: { at: xyz(), head: { x: 1, y: 0, z: 0 }, route: [], leg: 0, state: WHALE_STATE.under, t: 0, breaches: 0, spot: xyz() },
    leader: -1, rentT: 0, events: [], sunk: [], winner: -1,
  };
  planGale(state);
  const fleet = setup.fleet ?? [{ captain: false }];
  for (let i = 0; i < SHIPS; i++) state.ships.push(newShip(state, fleet[i] ?? { captain: true }, i, setup.gentle ?? false));
  planStorm(state);
  planWhale(state);
  seedLoot(state);
  return state;
}

