import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mind, think, type Memory } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import type { Depth } from '../src/sim/shoal.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import type { Storm } from '../src/sim/storm.ts';
import type { DriverStats } from '../src/sim/setup.ts';
import {
  createTerritory,
  type Outcome,
  type Territory,
} from '../src/sim/territory.ts';
import { along, bearingAt, distance, fromLatLon } from '../src/world/sphere.ts';
import { EVEN_SHIP, aboard, botOf, statsWith } from './setups.ts';

const start = fromLatLon(0.2, 0.3);
const deep: Depth = () => 30;
const WHOLE = { center: start, radius: Math.PI };

const placed = (
  id: number,
  bearing: number,
  meters: number,
  heading: number
): Vessel => {
  const at = along(start, bearingAt(start, bearing), meters).p;
  return afloat(id, shipAt(at, bearingAt(at, heading)));
};

type Seen = Vessel & { shield?: number; hull?: number };

function voyage(
  fleet: Seen[],
  seeds: (number | null)[],
  seconds: number,
  t: Territory,
  o: {
    stats?: DriverStats;
    minds?: (Memory | null)[];
    storm?: Storm;
    since?: number;
    held?: (v: Vessel) => Helm;
    each?: (fleet: Seen[], minds: (Memory | null)[], did: Outcome) => void;
  }
) {
  const minds =
    o.minds ??
    fleet.map((v, i) =>
      seeds[i] === null ? null : mind(seeds[i]!, v.ship.at)
    );
  for (let n = 1; n <= Math.round(seconds / STEP); n++) {
    const helms = fleet.map((v, i) => {
      const m = minds[i];
      if (!m) return o.held!(v);
      const r = think(
        aboard(v),
        fleet.filter((k) => k.id !== v.id).map((k) => aboard(k)),
        { depth: deep, storm: o.storm ?? null, holdings: t },
        m,
        botOf(seeds[i]!, o.stats)
      );
      minds[i] = r.memory;
      return r.helm;
    });
    const from = fleet.map((v) => v.ship.at),
      moved = stepFleet(
        fleet,
        helms,
        STEP,
        deep,
        fleet.map(() => EVEN_SHIP)
      ).fleet;
    fleet = fleet.map((v, i) => ({ ...v, ...moved[i] }));
    const did = t.step(
      fleet.map((v, i) => ({ id: v.id, from: from[i], to: v.ship.at })),
      (o.since ?? 0) + n * STEP,
      WHOLE
    );
    o.each?.(fleet, minds, did);
  }
  return { fleet, minds };
}

test('a bot sails out of its water on a loop and back into it, and takes the water it closes', () => {
  const seed = 1,
    t = createTerritory(1);
  t.begin([start], 0);
  const home = t.share(0);
  let out = 0,
    closed = 0,
    back = 0;
  voyage([placed(0, 0, 0, 0)], [seed], 120, t, {
    stats: statsWith({ territory: 20 }),
    each: (fleet, _, did) => {
      out = Math.max(out, distance(fleet[0].ship.at, start));
      closed += did.claimed.filter((k) => k.id === 0).length;
      if (did.claimed.length) back += +(t.ownerAt(fleet[0].ship.at) === 0);
    },
  });
  assert.ok(out > 50, `the farthest out ${out.toFixed(0)} m`);
  assert.ok(
    closed >= 1 && back === closed,
    `${closed} loops closed, ${back} of them back in its water`
  );
  assert.ok(t.share(0) > 2 * home, `its share ${t.share(0)} from ${home}`);
});
