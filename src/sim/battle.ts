import type { Rise } from '../world/planet.ts';
import { distance, type Vec3 } from '../world/sphere.ts';
import { mates } from './teams.ts';
import type { Blow, Vessel } from './contact.ts';
import type { GunKind } from './kinds.ts';
import { FALLOFF, GUNS, GUST } from './handling.ts';
import { harmed, sunk, whole, type Health } from './health.ts';
import { outside, type Storm } from './storm.ts';
import {
  damageOf,
  falloff,
  gunOf,
  laid,
  reloadOf,
  spreadOf,
  type Gun,
} from './gun.ts';
import { fly, loosed, offHull, type Ball } from './shot.ts';
import { emptyHold, type Hold } from './hold.ts';
import { gustOf, type Gust } from './gust.ts';
import type { Sight } from './sight.ts';
import type { Depth } from './shoal.ts';
import type { ShipValues } from './setup.ts';

export interface Crew {
  id: number;
  values: ShipValues;
  health: Health;
  gun: Gun;
  hold: Hold;
  gust: Gust;
  cut: number;
}

export interface Battle {
  crews: Crew[];
  balls: Ball[];
  seed: number;
  teams?: readonly number[];
}

export interface Order {
  aim: Sight | null;
  fire: boolean;
  spread?: number;
}

export interface Shot {
  shooter: number;
  gun: GunKind;
  from: Vec3;
  dirs: Vec3[];
  target: number | null;
}

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
}

export interface Splash {
  shooter: number;
  gun: GunKind;
  at: Vec3;
  land: boolean;
}

export interface Cue {
  ship: number;
  at: Vec3;
  kind: 'winding' | 'reloading' | 'reloaded';
  gun: GunKind;
}

export const crewOf = (id: number, values: ShipValues): Crew => ({
  id,
  values,
  health: whole(values.hullPoints),
  gun: gunOf(values.gun),
  hold: emptyHold(),
  gust: gustOf(values.gustCapacity),
  cut: 0,
});

export const battleOf = (
  crews: readonly Crew[],
  seed: number,
  teams?: readonly number[]
): Battle => ({
  crews: [...crews].sort((a, b) => a.id - b.id),
  balls: [],
  seed,
  ...(teams && { teams }),
});

export const marksOf = (
  b: Pick<Battle, 'teams'>,
  id: number,
  fleet: readonly Vessel[]
): readonly Vessel[] =>
  b.teams ? fleet.filter((o) => !mates(b.teams, id, o.id)) : fleet;

function worked(
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
      gun = { ...gun, reload: reloadOf(gun.kind, reload) };
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
    gun = { ...gun, reload: reloadOf(gun.kind, reload) };
    cue('reloading');
  } else if (trigger && gun.cool <= 1e-9) {
    if (bore.windup > 0) {
      gun = { ...gun, windup: bore.windup };
      cue('winding');
    } else fire();
  }
  return fired || gun.cool >= 0 ? gun : { ...gun, cool: 0 };
}

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
  const afloat = (id: number) => {
    const c = crews.get(id);
    return !!c && !sunk(c.health);
  };
  const strikes: Strike[] = [],
    sunkNow: number[] = [];
  const ships = new Map(fleet.map((v) => [v.id, v.ship]));
  const deal = (
    by: number,
    id: number,
    damage: number,
    at: Vec3,
    gun: GunKind | null
  ) => {
    const ram = gun === null;
    const c = crews.get(id),
      ship = ships.get(id);
    if (!c || !ship || sunk(c.health)) return;
    const harm = harmed(c.health, damage);
    c.health = harm.health;
    if (gun) c.cut = Math.max(c.cut, GUNS[gun].cuts);
    const broke = harm.shield > 0 && c.health.shield <= 0;
    const same = ram
      ? undefined
      : strikes.find((s) => !s.ram && s.shooter === by && s.struck === id);
    if (same) {
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
      });
    if (sunk(c.health)) sunkNow.push(id);
  };

  for (const blow of blows) {
    if (mates(b.teams, blow.striker.id, blow.struck.id)) continue;
    deal(blow.struck.id, blow.striker.id, blow.striker.damage, blow.at, null);
    deal(blow.striker.id, blow.struck.id, blow.struck.damage, blow.at, null);
  }

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
      for (const m of marks) {
        const d = m.id === f.struck ? 0 : offHull(m.ship, f.at);
        if (m.id !== shooter && d <= splash && !mates(b.teams, shooter, m.id))
          deal(
            shooter,
            m.id,
            damage * (1 - (FALLOFF.edge * d) / splash),
            f.at,
            kind
          );
      }
    } else if (f.struck !== null && !mates(b.teams, shooter, f.struck))
      deal(shooter, f.struck, damage, f.at, kind);
    if (f.struck === null)
      splashes.push({ shooter, gun: kind, at: f.at, land: f.land });
  }

  const balls = flight.balls,
    shots: Shot[] = [],
    cues: Cue[] = [];
  const targets = fleet.filter((v) => afloat(v.id));
  fleet
    .map((v, i) => [v, orders[i]] as const)
    .sort(([a], [c]) => a.id - c.id)
    .forEach(([v, order]) => {
      const c = crews.get(v.id);
      if (!c || sunk(c.health)) return;
      const g = c.gun,
        values = c.values;
      const loose = (gun: Gun) => {
        const spread =
          spreadOf(gun.kind, values.spreadFactor) *
          (order?.spread ?? 1) *
          (c.gust.on ? GUST.spread : 1);
        const lay = laid(
          v,
          gun,
          order?.aim ?? null,
          marksOf(b, v.id, targets),
          { seed: b.seed, depth, spread, cone: values.assistCone, rises }
        );
        for (const dir of lay.dirs)
          balls.push(
            loosed(
              v.id,
              gun.kind,
              lay.from,
              dir,
              lay.speed,
              damageOf(gun.kind, values.damageFactor),
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
      c.gun = worked(g, !!order?.fire, dt, values.reloadFactor, loose, (kind) =>
        cues.push({ ship: v.id, at: v.ship.at, kind, gun: g.kind })
      );
    });

  return {
    battle: {
      ...b,
      crews: [...crews.values()].sort((x, y) => x.id - y.id),
      balls,
    },
    shots,
    strikes,
    splashes,
    cues,
    sunk: sunkNow,
  };
}

export function weathered(
  b: Battle,
  fleet: readonly Vessel[],
  storm: Pick<Storm, 'center' | 'radius' | 'damage'>,
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
      storm.damage * c.health.most * dt,
      true
    ).health;
    if (sunk(health)) sunkNow.push(c.id);
    return { ...c, health };
  });
  return { battle: { ...b, crews }, sunk: sunkNow };
}
