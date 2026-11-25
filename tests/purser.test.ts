import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  battleOf,
  crewOf,
  stepBattle,
  weathered,
  type Battle,
  type Crew,
} from '../src/sim/battle.ts';
import { mind, think, type Memory, type Own } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { emptyHold, type Hold } from '../src/sim/hold.ts';
import type { Rarity } from '../src/sim/kinds.ts';
import type { Flotsam, Loot } from '../src/sim/loot.ts';
import { healSlot, PURSER } from '../src/sim/purser.ts';
import { shipAt, turned, type Helm } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { asked, crewed, stored, type Ask } from '../src/sim/stores.ts';
import {
  along,
  distance,
  frameAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';
import { EVEN_SHIP, HANDY, botOf } from './setups.ts';

const DEEP: Depth = () => 30;
const c0 = fromLatLon(0.3, 0.1);
const out = (m: number, b = 0) =>
  along(c0, turned(shipAt(c0, frameAt(c0).east), b), m).p;
const piece = (id: number, at: Vec3, heal: Rarity): Loot => ({
  id,
  at,
  heal,
  age: 10,
  way: [0, 0, 0],
});
const holding = (...items: (Rarity | null)[]): Hold => ({
  ...emptyHold(),
  items,
});

function sail(
  at: Vec3[],
  seeds: number[],
  crews: Crew[],
  flotsam: Flotsam,
  seconds: number,
  deep: Depth = DEEP
) {
  let fleet: Vessel[] = at.map((p, i) =>
    afloat(i, shipAt(p, frameAt(p).north))
  );
  const minds: Memory[] = at.map((p, i) => mind(seeds[i], p));
  let battle: Battle = battleOf(crews, 1),
    f = flotsam;
  const modes: string[][] = at.map(() => []),
    took: number[] = [];
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const by = new Map(battle.crews.map((c) => [c.id, c]));
    const seen: Own[] = fleet.map((v) => ({
      ...v,
      crew: by.get(v.id)!,
      hull: by.get(v.id)!.health.hull,
      shield: by.get(v.id)!.health.shield,
    }));
    const helms: Helm[] = [],
      asks = new Map<number, Ask>();
    fleet.forEach((v, i) => {
      const r = think(
        seen[i],
        seen.filter((o) => o.id !== v.id),
        { depth: deep, loot: f.pieces },
        minds[v.id],
        botOf(seeds[v.id])
      );
      minds[v.id] = r.memory;
      helms[i] = r.helm;
      asks.set(v.id, r.ask);
      if (modes[v.id].at(-1) !== r.memory.mode) modes[v.id].push(r.memory.mode);
    });
    const w = asked(battle.crews, asks);
    const manned = new Map(w.crews.map((c) => [c.id, c]));
    fleet.forEach((v, i) => {
      helms[i] = crewed(helms[i], manned.get(v.id));
    });
    const met = stepFleet(
      fleet,
      helms,
      STEP,
      deep,
      fleet.map((v) => manned.get(v.id)!.values)
    );
    fleet = met.fleet;
    const fought = stepBattle(
      { ...battle, crews: w.crews },
      fleet,
      fleet.map(() => ({ aim: null, fire: false })),
      met.blows,
      STEP,
      deep
    );
    const k = stored(
      weathered(
        fought.battle,
        fleet,
        { center: c0, radius: 4, damage: 0 },
        STEP
      ).battle.crews,
      f,
      fleet,
      [],
      STEP,
      deep,
      1
    );
    battle = { ...fought.battle, crews: k.crews };
    f = k.flotsam;
    for (const t of k.took) took.push(t.ship);
  }
  return { fleet, crews: battle.crews, flotsam: f, minds, modes, took };
}

const seeds = (ok: (s: number) => boolean, n: number) => {
  const r: number[] = [];
  for (let s = 1; r.length < n; s++) if (ok(s)) r.push(s);
  return r;
};

test('it heals with the least heal that fills its hull, else with its greatest; at full hull, with none', () => {
  const values = { ...EVEN_SHIP, hullPoints: 100, healFactor: 1 };
  const at = (hull: number, hold = holding('legendary', 'common', 'epic')) =>
    healSlot({
      ...crewOf(0, values),
      hold,
      health: { hull, shield: 0, most: 100 },
    });
  assert.equal(at(90), 1, 'a common fills it');
  assert.equal(at(60), 2, 'an epic fills it');
  assert.equal(at(20), 0, 'only a legendary fills it');
  assert.equal(at(20, holding(null, 'common', 'rare')), 2, 'none fills it');
  assert.equal(at(100), -1, 'nothing to mend');
  assert.equal(at(50, holding(null, null, null)), -1, 'nothing to mend with');
});

const stowedOf = (c: Crew) => c.hold.items.flatMap((k) => (k ? [k] : []));

test('a piece abeam, inside the circle it turns at its top speed, it slows to come round to it, not sail round it', () => {
  for (const seed of seeds(() => true, 4)) {
    const r = sail(
      [c0],
      [seed],
      [crewOf(0, EVEN_SHIP)],
      { pieces: [piece(1, out(28, 0), 'common')], next: 2 },
      15
    );
    assert.deepEqual(
      stowedOf(r.crews[0]),
      ['common'],
      `${seed}: ${r.modes[0]}`
    );
  }
});

test('a hurt bot with something to mend with uses it', () => {
  for (const seed of seeds(() => true, 4)) {
    const hold = holding('common', 'rare', null);
    const r = sail(
      [c0],
      [seed],
      [
        {
          ...crewOf(0, EVEN_SHIP),
          hold,
          health: { hull: 40, shield: 0, most: EVEN_SHIP.hullPoints },
        },
      ],
      { pieces: [], next: 0 },
      20
    );
    const c = r.crews[0];
    assert.ok(
      c.health.hull > 40 && c.hold.items.includes(null),
      `${seed}: ${JSON.stringify(c.health)} ${r.modes[0]}`
    );
  }
});

test('bots near one piece do not all pile on it: one takes it, and none goes for it for ever', () => {
  const at = [0, 1, 2, 3, 4, 5].map((k) => out(70, (k * Math.PI) / 3));
  const r = sail(
    at,
    [1, 2, 3, 4, 5, 6],
    at.map((_, i) => crewOf(i, EVEN_SHIP)),
    { pieces: [piece(1, c0, 'common')], next: 2 },
    180
  );
  assert.equal(r.took.length, 1);
  assert.equal(r.flotsam.pieces.length, 0);
  assert.ok(
    r.minds.every((m) => m.target !== 1 || m.mode !== 'loot'),
    'none still after it'
  );
});

test('a piece it can not come to it gives up after a while, and leaves be', () => {
  const lagoon = out(70),
    reef: Depth = (p) => {
      const d = distance(p, lagoon);
      return d > 15 && d < 45 ? -2 : 30;
    };
  for (const seed of seeds(() => true, 3)) {
    const r = sail(
      [c0],
      [seed],
      [crewOf(0, HANDY)],
      { pieces: [piece(1, lagoon, 'common')], next: 2 },
      PURSER.patience + 15,
      reef
    );
    assert.equal(r.minds[0].shun, 1, `${seed}: ${r.modes[0]}`);
    assert.notEqual(r.minds[0].mode, 'loot');
  }
});
