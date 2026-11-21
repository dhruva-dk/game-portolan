// The fighting: one fixed step of it for a whole fleet, after the fleet has
// sailed (contact.ts stepFleet). Each ship's crew keeps her hit points
// (health.ts) and her guns, two at most, one in hand (gun.ts). The step takes
// the rams the fleet's step reported off both ships, brings every ball in
// flight on (shot.ts) and takes those that strike off the ship struck (less
// with the distance flown, for a kind whose bite falls off; a mortar's shell
// bursting over all within its splash, less toward its rim), and works the gun
// in hand: taken in hand it fires only once EQUIP has passed; held on the
// trigger it fires at its kind's interval while the magazine lasts, a heavy gun
// winding up first and firing when wound, wherever it is laid by then; emptied,
// it reloads, and it fires again full. A ship sunk takes no more, fires no
// more, and is no longer laid on or struck; her crew is kept, sunk, for the
// game to take her off the sea. A blow that strikes breaks off whatever she was
// mending with (hold.ts), lands on one of her zones and breaks the quiet of
// both ships (faults.ts: what her hull is in each zone her faults; a gun
// reloads by her handling, fitOf); a gun fired in a gust goes off wider
// (gust.ts); a gun that cuts rigging (the scatter's grape) leaves her slowed a
// while (stores.ts crewed).
//
// The storm (storm.ts) wears at every ship outside its cap, a share of a full
// hull a second, past the shield (weathered, after the step).
//
// Pure arithmetic: no three, so it runs in node for the tests; deterministic
// for the same inputs. Crews are kept in order of their ships' ids, so it makes
// no difference in which order the fleet is listed.

import type { Rise } from '../world/planet.ts';
import { distance, type Vec3 } from '../world/sphere.ts';
import type { Blow, Vessel } from './contact.ts';
import type { GunKind } from '../kinds.ts';
import { CARRIED, FALLOFF, GUN, GUNS, GUST, HEALTH } from './handling.ts';
import { dealt, fitOf, struck, UNWORN, zoneOf, type Wear } from './faults.ts';
import { harmed, sunk, whole, type Health } from './health.ts';
import { outside, type Storm } from './storm.ts';
import {
  damageOf,
  falloff,
  laid,
  reloadOf,
  spreadOf,
  type Gun,
} from './gun.ts';
import { fly, loosed, offHull, type Ball } from './shot.ts';
import { broken, emptyHold, type Hold } from './hold.ts';
import { gustOf, type Gust } from './gust.ts';
import type { Sight } from './sight.ts';
import type { Depth } from './shoal.ts';

/**
 * A ship's crew: who she is (her Vessel's id), her hit points, the guns she
 * carries (CARRIED slots, null empty) and the slot in hand, seconds till the
 * gun in hand may fire after she took it up (EQUIP), her hold (hold.ts), her
 * gust (gust.ts), seconds till her rigging is mended, cut by a gun that cuts
 * it (GUNS `cuts`; 0 whole), and what her blows have done to her (faults.ts).
 */
export interface Crew {
  id: number;
  health: Health;
  guns: readonly (Gun | null)[];
  hand: number;
  equip: number;
  hold: Hold;
  gust: Gust;
  cut: number;
  wear: Wear;
}

/**
 * The fighting as it stands: every ship's crew, the balls in flight, the seed
 * the guns' spread is drawn from, and the guns' assist (its cone, radians, by
 * rarity: the match's rules, rules.ts).
 */
export interface Battle {
  crews: Crew[];
  balls: Ball[];
  seed: number;
  assist: readonly number[];
}

/**
 * What she is ordered: the line of sight her gun is aimed along (sight.ts;
 * null: along her heading), whether its trigger is held, and how many times the
 * gun's own spread her balls go off within (a bot's unsteady hand, gunner.ts; 1
 * if not given).
 */
export interface Order {
  aim: Sight | null;
  fire: boolean;
  spread?: number;
}

/**
 * A shot: by whom and from what kind of gun, from where (metres, from the
 * centre), the ways its balls went off (unit vectors), and the ship it was laid
 * on, if any.
 */
export interface Shot {
  shooter: number;
  gun: GunKind;
  from: Vec3;
  dirs: Vec3[];
  target: number | null;
}

/**
 * A ball, a shell's burst or a ram striking home: who dealt it (for a ram, the
 * other ship), who took it, the hit points it took off her shield and her hull
 * together, and of those off each; whether it broke her shield (took the last
 * of it); and where (a unit vector); whether a ram, else the gun's kind. A
 * scatter's pellets striking one ship in one step are one strike.
 */
export interface Strike {
  shooter: number;
  struck: number;
  damage: number;
  shield: number;
  hull: number;
  broke: boolean;
  at: Vec3;
  ram: boolean;
  gun: GunKind | null;
  /** The zone of her it landed on (kinds.ts ZONES' order: faults.ts zoneOf). */
  zone: number;
}

/**
 * A ball come down in the sea or on the land: who fired it, from what, and
 * where (a unit vector).
 */
export interface Splash {
  shooter: number;
  gun: GunKind;
  at: Vec3;
  land: boolean;
}

/**
 * What a gun did besides firing, for the ship whose it is, where she lies (a
 * unit vector): began winding up, began reloading, was reloaded, or was taken
 * in hand (stores.ts).
 */
export interface Cue {
  ship: number;
  at: Vec3;
  kind: 'winding' | 'reloading' | 'reloaded' | 'swapped';
  gun: GunKind;
}

/**
 * A crew as she puts to sea: whole, an empty hold, every gust ready, and with
 * the guns given (none by default), the first in hand.
 */
export const crewOf = (id: number, ...guns: Gun[]): Crew => ({
  id,
  health: whole(),
  guns: Array.from({ length: CARRIED }, (_, i) => guns[i] ?? null),
  hand: 0,
  equip: 0,
  hold: emptyHold(),
  gust: gustOf(),
  cut: 0,
  wear: UNWORN,
});

/** The gun in her hand, or null. */
export const inHand = (c: Crew): Gun | null => c.guns[c.hand] ?? null;
/** Whether she carries any gun. */
export const armed = (c: Crew) => c.guns.some((g) => g !== null);

/**
 * The fighting before it starts: these crews, no balls, drawing from `seed`,
 * the guns' assist `assist` (the game's own if not given).
 */
export const battleOf = (
  crews: readonly Crew[],
  seed: number,
  assist: readonly number[] = GUN.assist
): Battle => ({
  crews: [...crews].sort((a, b) => a.id - b.id),
  balls: [],
  seed,
  assist,
});

/**
 * One step of the gun `g` in hand of crew `c`, firing by `loose` (which lays it
 * and puts its balls in flight), reloading in `reload` times its own time (her
 * handling's: handling.ts Handling); its cues told to `cue`. The gun after it.
 */
function worked(
  c: Crew,
  g: Gun,
  trigger: boolean,
  dt: number,
  reload: number,
  loose: (g: Gun) => void,
  cue: (kind: Cue['kind']) => void
): Gun {
  const bore = GUNS[g.kind];
  let gun: Gun = { ...g, cool: g.cool - dt },
    fired = false;
  const fire = () => {
    loose(gun);
    gun = {
      ...gun,
      rounds: gun.rounds - 1,
      fired: gun.fired + 1,
      windup: 0,
      cool: bore.interval + Math.max(gun.cool, -dt),
    };
    fired = true;
    if (gun.rounds <= 0) {
      gun = { ...gun, reload: reloadOf(gun, reload) };
      cue('reloading');
    }
  };
  if (gun.windup > 0) {
    gun = { ...gun, windup: gun.windup - dt };
    if (gun.windup <= 1e-9) fire();
  } else if (gun.reload > 0) {
    gun = { ...gun, reload: gun.reload - dt };
    if (gun.reload <= 1e-9) {
      gun = { ...gun, reload: 0, rounds: bore.mag };
      cue('reloaded');
    }
  } else if (gun.rounds <= 0) {
    gun = { ...gun, reload: reloadOf(gun, reload) };
    cue('reloading');
  } else if (trigger && gun.cool <= 1e-9 && c.equip <= 1e-9) {
    if (bore.windup > 0) {
      gun = { ...gun, windup: bore.windup };
      cue('winding');
    } else fire();
  }
  return fired || gun.cool >= 0 ? gun : { ...gun, cool: 0 };
}

/**
 * One step of dt seconds of the fighting, after the fleet's step: `fleet` as
 * that left it, `orders[i]` for fleet[i], `blows` the rams it reported, over
 * water `depth` deep (its land's `rises`, if given, where a gun's sight looks
 * for it: gun.ts laid). A ship with no crew is given one, whole and unarmed.
 * The battle after it, and what happened: the shots, the strikes, the splashes,
 * the guns' cues, and the ships sunk this step.
 */
export function stepBattle(
  b: Battle,
  fleet: readonly Vessel[],
  orders: readonly Order[],
  blows: readonly Blow[],
  dt: number,
  depth: Depth,
  rises?: readonly Rise[]
): {
  battle: Battle;
  shots: Shot[];
  strikes: Strike[];
  splashes: Splash[];
  cues: Cue[];
  sunk: number[];
} {
  const crews = new Map(b.crews.map((c) => [c.id, { ...c }]));
  for (const v of fleet) if (!crews.has(v.id)) crews.set(v.id, crewOf(v.id));
  const afloat = (id: number) => {
    const c = crews.get(id);
    return !!c && !sunk(c.health);
  };
  const strikes: Strike[] = [],
    sunkNow: number[] = [];
  // a blow (a ball coming along `way`) on the zone of her it lands on
  // (faults.ts zoneOf), and both ships' quiet broken
  const ships = new Map(fleet.map((v) => [v.id, v.ship]));
  const deal = (
    by: number,
    id: number,
    damage: number,
    at: Vec3,
    gun: GunKind | null,
    way = at
  ) => {
    const ram = gun === null;
    const c = crews.get(id),
      ship = ships.get(id);
    if (!c || !ship || sunk(c.health)) return;
    const harm = harmed(c.health, damage);
    c.health = harm.health;
    c.hold = broken(c.hold);
    const zone = zoneOf(ship, at, way, gun);
    c.wear = struck(c.wear, zone, harm.hull);
    const d = crews.get(by);
    if (d) d.wear = dealt(d.wear);
    if (gun) c.cut = Math.max(c.cut, GUNS[gun].cuts);
    const broke = harm.shield > 0 && c.health.shield <= 0;
    // a scatter's pellets on one ship in one step: one strike
    const same = ram
      ? undefined
      : strikes.find((s) => !s.ram && s.shooter === by && s.struck === id);
    if (same) {
      // (the zone of the first pellet to reach her hull)
      if (same.hull === 0 && harm.hull > 0) same.zone = zone;
      same.damage += harm.shield + harm.hull;
      same.shield += harm.shield;
      same.hull += harm.hull;
      same.broke ||= broke;
    } else
      strikes.push({
        shooter: by,
        struck: id,
        damage: harm.shield + harm.hull,
        shield: harm.shield,
        hull: harm.hull,
        broke,
        at,
        ram,
        gun,
        zone,
      });
    if (sunk(c.health)) sunkNow.push(id);
  };

  // the rams
  for (const blow of blows) {
    deal(blow.struck.id, blow.striker.id, blow.striker.damage, blow.at, null);
    deal(blow.striker.id, blow.struck.id, blow.struck.damage, blow.at, null);
  }

  // the balls in flight
  const marks = fleet
    .filter((v) => afloat(v.id))
    .map((v) => ({ id: v.id, ship: v.ship }));
  const flight = fly(b.balls, marks, dt, depth);
  const splashes: Splash[] = [];
  for (const f of flight.falls) {
    const { shooter, kind } = f.ball,
      splash = GUNS[kind].splash;
    const damage = f.ball.damage * falloff(kind, distance(f.ball.from, f.at));
    if (splash > 0) {
      // a shell bursts: every ship within its splash takes it, less toward the
      // rim (the one it struck, all of it)
      for (const m of marks) {
        const d = m.id === f.struck ? 0 : offHull(m.ship, f.at);
        if (m.id !== shooter && d <= splash)
          deal(
            shooter,
            m.id,
            damage * (1 - (FALLOFF.edge * d) / splash),
            f.at,
            kind,
            f.ball.v
          );
      }
    } else if (f.struck !== null)
      deal(shooter, f.struck, damage, f.at, kind, f.ball.v);
    if (f.struck === null)
      splashes.push({ shooter, gun: kind, at: f.at, land: f.land });
  }

  // the guns in hand: winding up, reloading, and firing those whose trigger is
  // held
  const balls = flight.balls,
    shots: Shot[] = [],
    cues: Cue[] = [];
  const targets = fleet.filter((v) => afloat(v.id));
  fleet
    .map((v, i) => [v, orders[i]] as const)
    .sort(([a], [c]) => a.id - c.id)
    .forEach(([v, order]) => {
      const c = crews.get(v.id)!;
      if (sunk(c.health)) return;
      c.equip = Math.max(0, c.equip - dt);
      const g = inHand(c);
      if (!g) return;
      const loose = (gun: Gun) => {
        const spread =
          spreadOf(gun) *
          (order?.spread ?? 1) *
          (c.gust.blowing > 0 ? GUST.spread : 1);
        const lay = laid(v, gun, order?.aim ?? null, targets, {
          seed: b.seed,
          depth,
          spread,
          cone: b.assist[gun.rarity],
          rises,
        });
        for (const dir of lay.dirs)
          balls.push(
            loosed(
              v.id,
              gun.kind,
              lay.from,
              dir,
              lay.speed,
              damageOf(gun),
              lay.fall
            )
          );
        shots.push({
          shooter: v.id,
          gun: gun.kind,
          from: lay.from,
          dirs: lay.dirs,
          target: lay.target,
        });
      };
      const gun = worked(
        c,
        g,
        !!order?.fire,
        dt,
        fitOf(c).reload,
        loose,
        (kind) => cues.push({ ship: v.id, at: v.ship.at, kind, gun: g.kind })
      );
      c.guns = c.guns.map((k, i) => (i === c.hand ? gun : k));
    });

  return {
    battle: {
      crews: [...crews.values()].sort((x, y) => x.id - y.id),
      balls,
      seed: b.seed,
      assist: b.assist,
    },
    shots,
    strikes,
    splashes,
    cues,
    sunk: sunkNow,
  };
}

/**
 * The storm's wear over dt seconds on every ship of `fleet` outside its cap:
 * `storm.damage` of a full hull a second, past the shield. The battle after it,
 * and the ships it sank.
 */
export function weathered(
  b: Battle,
  fleet: readonly Vessel[],
  storm: Pick<Storm, 'centre' | 'radius' | 'damage'>,
  dt: number
): { battle: Battle; sunk: number[] } {
  const out = new Set(
    fleet.filter((v) => outside(v.ship.at, storm)).map((v) => v.id)
  );
  if (out.size === 0 || !(storm.damage > 0)) return { battle: b, sunk: [] };
  const sunkNow: number[] = [];
  const crews = b.crews.map((c) => {
    if (!out.has(c.id) || sunk(c.health)) return c;
    const health = harmed(
      c.health,
      storm.damage * HEALTH.hull * dt,
      true
    ).health;
    if (sunk(health)) sunkNow.push(c.id);
    return { ...c, health };
  });
  return { battle: { ...b, crews }, sunk: sunkNow };
}
