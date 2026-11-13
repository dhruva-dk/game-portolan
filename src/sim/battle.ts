// The fighting: one fixed step of it for a whole fleet, after the fleet has sailed (contact.ts stepFleet). Each ship's
// crew keeps her hit points (health.ts) and her gun, if she has one (gun.ts). The step takes the rams the fleet's step
// reported off both ships, brings every ball in flight on (shot.ts) and takes those that strike off the ship struck,
// reloads the guns, and fires those ordered to that are loaded. A ship sunk takes no more, fires no more, and is no
// longer laid on or struck; her crew is kept, sunk, for the game to take her off the sea. A blow that strikes breaks
// off whatever she was mending with (hold.ts); a gun fired in a gust goes off wider (gust.ts).
//
// The storm (storm.ts) wears at every ship outside its cap, a share of a full hull a second, past the shield as the old
// game's did (weathered, after the step).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic for the same inputs. Crews are kept in
// order of their ships' ids, so it makes no difference in which order the fleet is listed.

import type { Vec3 } from '../world/sphere.ts';
import type { Blow, Vessel } from './contact.ts';
import { GUN, GUST, HEALTH } from './handling.ts';
import { harmed, sunk, whole, type Health } from './health.ts';
import { outside, type Storm } from './storm.ts';
import { laid, type Gun } from './gun.ts';
import { fly, loosed, type Ball } from './shot.ts';
import { broken, emptyHold, type Hold } from './hold.ts';
import { gustOf, type Gust } from './gust.ts';
import type { Depth } from './shoal.ts';

/** A ship's crew: who she is (her Vessel's id), her hit points, her gun or null, her hold (hold.ts) and her gust
 * (gust.ts). */
export interface Crew {
  id: number;
  health: Health;
  gun: Gun | null;
  hold: Hold;
  gust: Gust;
}

/** The fighting as it stands: every ship's crew, the balls in flight, and the seed the guns' spread is drawn from. */
export interface Battle {
  crews: Crew[];
  balls: Ball[];
  seed: number;
}

/** What she is ordered: the bearing she is aimed on (any vector; its part along the surface counts), whether to fire,
 * and how many times the gun's own spread her balls go off within (a bot's unsteady hand, gunner.ts; 1 if not given). */
export interface Order {
  aim: Vec3 | null;
  fire: boolean;
  spread?: number;
}

/** A ball fired: by whom, from where (metres, from the centre), the way it went off (a unit vector), and the ship it
 * was laid on, if any. */
export interface Shot {
  shooter: number;
  from: Vec3;
  dir: Vec3;
  target: number | null;
}

/** A ball or a ram striking home: who dealt it (for a ram, the other ship), who took it, the hit points it took off her
 * shield and her hull together, and where (a unit vector). */
export interface Strike {
  shooter: number;
  struck: number;
  damage: number;
  at: Vec3;
  ram: boolean;
}

/** A ball come down in the sea or on the land: who fired it, and where (a unit vector). */
export interface Splash {
  shooter: number;
  at: Vec3;
  land: boolean;
}

/** A crew as she puts to sea: whole, an empty hold, every gust ready, and with no gun. */
export const crewOf = (id: number, gun: Gun | null = null): Crew => ({ id, health: whole(), gun, hold: emptyHold(), gust: gustOf() });

/** The fighting before it starts: these crews, no balls, drawing from `seed`. */
export const battleOf = (crews: readonly Crew[], seed: number): Battle => ({ crews: [...crews].sort((a, b) => a.id - b.id), balls: [], seed });

/**
 * One step of dt seconds of the fighting, after the fleet's step: `fleet` as that left it, `orders[i]` for fleet[i],
 * `blows` the rams it reported, over water `depth` deep. A ship with no crew is given one, whole and unarmed. The
 * battle after it, and what happened: the balls fired, the strikes, the splashes, and the ships sunk this step.
 */
export function stepBattle(
  b: Battle, fleet: readonly Vessel[], orders: readonly Order[], blows: readonly Blow[], dt: number, depth: Depth,
): { battle: Battle; shots: Shot[]; strikes: Strike[]; splashes: Splash[]; sunk: number[] } {
  const crews = new Map(b.crews.map((c) => [c.id, { ...c }]));
  for (const v of fleet) if (!crews.has(v.id)) crews.set(v.id, crewOf(v.id));
  const afloat = (id: number) => { const c = crews.get(id); return !!c && !sunk(c.health); };
  const strikes: Strike[] = [], sunkNow: number[] = [];
  const deal = (by: number, id: number, damage: number, at: Vec3, ram: boolean) => {
    const c = crews.get(id);
    if (!c || sunk(c.health)) return;
    const harm = harmed(c.health, damage);
    c.health = harm.health;
    c.hold = broken(c.hold);
    strikes.push({ shooter: by, struck: id, damage: harm.shield + harm.hull, at, ram });
    if (sunk(c.health)) sunkNow.push(id);
  };

  // the rams
  for (const blow of blows) {
    deal(blow.struck.id, blow.striker.id, blow.striker.damage, blow.at, true);
    deal(blow.striker.id, blow.struck.id, blow.struck.damage, blow.at, true);
  }

  // the balls in flight
  const marks = fleet.filter((v) => afloat(v.id)).map((v) => ({ id: v.id, ship: v.ship }));
  const flight = fly(b.balls, marks, dt, depth);
  const splashes: Splash[] = [];
  for (const f of flight.falls) {
    if (f.struck !== null) deal(f.ball.shooter, f.struck, f.ball.damage, f.at, false);
    else splashes.push({ shooter: f.ball.shooter, at: f.at, land: f.land });
  }

  // the guns: reloading, and firing those ordered to that are loaded
  const balls = flight.balls, shots: Shot[] = [];
  const targets = fleet.filter((v) => afloat(v.id));
  fleet.map((v, i) => [v, orders[i]] as const).sort(([a], [c]) => a.id - c.id).forEach(([v, order]) => {
    const c = crews.get(v.id)!;
    if (!c.gun || sunk(c.health)) return;
    let gun = { ...c.gun, loading: Math.max(0, c.gun.loading - dt) };
    if (order?.fire && gun.loading < 1e-9) {
      const lay = laid(v, gun, order.aim ?? v.ship.heading, targets, b.seed, GUN.spread[gun.rarity] * (order.spread ?? 1) * (c.gust.blowing > 0 ? GUST.spread : 1));
      balls.push(loosed(v.id, lay.from, lay.dir, GUN.damage * GUN.damageBy[gun.rarity]));
      shots.push({ shooter: v.id, ...lay });
      gun = { ...gun, loading: GUN.reload * GUN.reloadBy[gun.rarity], fired: gun.fired + 1 };
    }
    c.gun = gun;
  });

  return {
    battle: { crews: [...crews.values()].sort((x, y) => x.id - y.id), balls, seed: b.seed },
    shots, strikes, splashes, sunk: sunkNow,
  };
}

/** The storm's wear over dt seconds on every ship of `fleet` outside its cap: `storm.damage` of a full hull a second,
 * past the shield. The battle after it, and the ships it sank. */
export function weathered(b: Battle, fleet: readonly Vessel[], storm: Pick<Storm, 'centre' | 'radius' | 'damage'>, dt: number): { battle: Battle; sunk: number[] } {
  const out = new Set(fleet.filter((v) => outside(v.ship.at, storm)).map((v) => v.id));
  if (out.size === 0 || !(storm.damage > 0)) return { battle: b, sunk: [] };
  const sunkNow: number[] = [];
  const crews = b.crews.map((c) => {
    if (!out.has(c.id) || sunk(c.health)) return c;
    const health = harmed(c.health, storm.damage * HEALTH.hull * dt, true).health;
    if (sunk(health)) sunkNow.push(c.id);
    return { ...c, health };
  });
  return { battle: { ...b, crews }, sunk: sunkNow };
}
