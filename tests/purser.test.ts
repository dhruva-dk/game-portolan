import { test } from 'node:test';
import { nature } from '../src/sim/persona.ts';
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
import { emptyHold, stowed } from '../src/sim/hold.ts';
import type { Flotsam, Loot } from '../src/sim/loot.ts';
import { healSlot, PURSER } from '../src/sim/purser.ts';
import { shipAt, turned, type Helm } from '../src/sim/ship.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { asked, crewed, NOTHING, stored, type Ask } from '../src/sim/stores.ts';
import { temper } from '../src/sim/temper.ts';
import {
  along,
  distance,
  frameAt,
  fromLatLon,
  type Vec3,
} from '../src/world/sphere.ts';
import { EVEN_SHIP, HANDY } from './setups.ts';

const DEEP: Depth = () => 30;
const c0 = fromLatLon(0.3, 0.1);
const out = (m: number, b = 0) =>
  along(c0, turned(shipAt(c0, frameAt(c0).east), b), m).p;
const piece = (id: number, at: Vec3, goods: Loot['goods']): Loot => ({
  id,
  at,
  goods,
  from: -1,
  age: 10,
  way: [0, 0, 0],
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
  const modes: string[][] = at.map(() => []);
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
        nature(seeds[v.id])
      );
      minds[v.id] = r.memory;
      helms[i] = r.helm;
      asks.set(v.id, r.ask);
      if (modes[v.id].at(-1) !== r.memory.mode) modes[v.id].push(r.memory.mode);
    });
    const w = asked(battle.crews, fleet, f, asks);
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
      w.takes,
      [],
      STEP,
      deep,
      1
    );
    battle = { ...fought.battle, crews: k.crews };
    f = k.flotsam;
  }
  return { fleet, crews: battle.crews, flotsam: f, minds, modes };
}

test("her taps: on the item in hand with stores in reach, a swap; else the hold's", () => {
  const fleet: Vessel[] = [afloat(0, shipAt(c0, frameAt(c0).north))];
  const items = [
    { kind: 'smallShield', count: 2 },
    { kind: 'bigShield', count: 1 },
    { kind: 'fullRepair', count: 1 },
  ] as const;
  const playerCrew: Crew = {
    ...crewOf(0, EVEN_SHIP),
    hold: { ...emptyHold(), items, chosen: 1 },
  };
  const tap = (slot: number, pieces: Loot[]) =>
    asked(
      [playerCrew],
      fleet,
      { pieces, next: 9 },
      new Map([[0, { ...NOTHING, tap: slot }]])
    );
  const stores = [piece(2, out(4), { kind: 'repairKit', count: 1 })];
  assert.equal(tap(0, []).takes.size, 0, 'none: nothing to take');
  assert.equal(
    tap(1, stores).takes.get(0),
    1,
    'stores in reach, the slot in hand: swaps'
  );
  const chose = tap(2, stores);
  assert.deepEqual(
    [chose.takes.size, chose.crews[0].hold.chosen],
    [0, 2],
    'another slot: chosen, no swap'
  );
  const far = tap(1, [piece(2, out(40), { kind: 'repairKit', count: 1 })]);
  assert.equal(far.takes.size, 0, "out of reach: the tap is the hold's");
});

const seeds = (ok: (s: number) => boolean, n: number) => {
  const r: number[] = [];
  for (let s = 1; r.length < n; s++) if (ok(s)) r.push(s);
  return r;
};

test('it mends with the slot worth most to it as it is', () => {
  let h = emptyHold();
  for (const k of ['smallShield', 'repairKit', 'fullRepair'] as const)
    h = stowed(h, k, 1).hold;
  const at = (hull: number, shield: number) =>
    healSlot({
      ...crewOf(0, EVEN_SHIP),
      hold: h,
      health: { hull, shield, most: 100 },
    });
  assert.equal(at(100, 0), 1, 'a shield');
  assert.equal(at(60, 60), 2, 'a kit');
  assert.equal(at(30, 0), 3, 'a full repair');
  assert.equal(at(100, 60), -1, 'nothing worth it');
});

const stowedOf = (c: Crew) => c.hold.items.flatMap((k) => (k ? [k.kind] : []));

test('a piece abeam, inside the circle it turns at its top speed, it slows to come round to it, not sail round it', () => {
  for (const seed of seeds((s) => temper(s).lootReach >= 110, 4)) {
    const r = sail(
      [c0],
      [seed],
      [crewOf(0, EVEN_SHIP)],
      {
        pieces: [piece(1, out(28, 0), { kind: 'repairKit', count: 1 })],
        next: 2,
      },
      15
    );
    assert.deepEqual(
      stowedOf(r.crews[0]),
      ['repairKit'],
      `${seed}: ${r.modes[0]}`
    );
  }
});

test('a hurt bot with something to mend with uses it', () => {
  for (const seed of seeds(() => true, 4)) {
    const hold = stowed(
      stowed(emptyHold(), 'repairKit', 2).hold,
      'smallShield',
      2
    ).hold;
    const r = sail(
      [c0],
      [seed],
      [
        {
          ...crewOf(0, EVEN_SHIP),
          hold,
          health: { hull: 40, shield: 0, most: 100 },
        },
      ],
      { pieces: [], next: 0 },
      20
    );
    const c = r.crews[0];
    assert.ok(
      c.health.hull > 40 && c.health.shield > 0,
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
    { pieces: [piece(1, c0, { kind: 'repairKit', count: 1 })], next: 2 },
    60
  );
  assert.equal(r.crews.filter((c) => stowedOf(c).length > 0).length, 1);
  assert.ok(
    r.minds.every((m) => m.target !== 1 || m.mode !== 'loot'),
    'none still after it'
  );
});

test('a piece it can not come to it gives up after a while, and leaves be', () => {
  const lagoon = out(100),
    reef: Depth = (p) => {
      const d = distance(p, lagoon);
      return d > 15 && d < 45 ? -2 : 30;
    };
  for (const seed of seeds(
    (s) => temper(s).loot >= 0.5 && temper(s).lootReach > 100,
    3
  )) {
    const r = sail(
      [c0],
      [seed],
      [crewOf(0, HANDY)],
      { pieces: [piece(1, lagoon, { kind: 'repairKit', count: 1 })], next: 2 },
      PURSER.patience + 15,
      reef
    );
    assert.equal(r.minds[0].shun, 1, `${seed}: ${r.modes[0]}`);
    assert.notEqual(r.minds[0].mode, 'loot');
  }
});
