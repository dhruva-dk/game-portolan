// Duels: a bot with one kind of gun against a bot with another, alone on open
// water, from each of several ranges; who sinks first. Each pair of bold bots
// (a temperament keen to fight) sails twice, the guns swapped, so a gun's wins
// are not a captain's. What a rating by gun (rate.ts --by gun) can't say, as
// there a ship's gun and the fights she was in come together.
//   node tools/harness/duel.ts [a=scatter] [b=cannon] [--pairs=20] [--seconds=90]
//
// Every ship starts with a full shield, as she would be with a few fights'
// loot in her, the two bow to bow; each gun common. The same steps as the
// game's: think (sim/bot.ts), stepFleet (contact.ts), stepBattle (battle.ts),
// the guns asked for taken in hand (stores.ts), a bot told of what strikes her
// and what it took (play/state.ts's way).

import { parseArgs } from 'node:util';
import { KINDS, type GunKind } from '../../src/kinds.ts';
import {
  armed,
  battleOf,
  crewOf,
  stepBattle,
  type Battle,
  type Order,
} from '../../src/sim/battle.ts';
import { bruised, mind, shot, think, type Memory } from '../../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../../src/sim/contact.ts';
import { STEP } from '../../src/sim/fixed.ts';
import { gunOf } from '../../src/sim/gun.ts';
import { HEALTH } from '../../src/sim/handling.ts';
import { sunk } from '../../src/sim/health.ts';
import { nature } from '../../src/sim/persona.ts';
import type { Depth } from '../../src/sim/shoal.ts';
import { shipAt, type Helm } from '../../src/sim/ship.ts';
import { asked, type Ask } from '../../src/sim/stores.ts';
import { temper } from '../../src/sim/temper.ts';
import { along, bearingAt, fromLatLon } from '../../src/world/sphere.ts';

/** The ranges the two start at, m. */
const RANGES = [40, 80, 120, 160, 200];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    pairs: { type: 'string', default: '20' },
    seconds: { type: 'string', default: '90' },
  },
});
const kindOf = (name: string | undefined, fallback: GunKind): GunKind => {
  if (name === undefined) return fallback;
  const k = KINDS.find((g) => g === name);
  if (!k) throw new Error(`no gun "${name}": one of ${KINDS.join(', ')}`);
  return k;
};
const A = kindOf(positionals[0], 'scatter'),
  B = kindOf(positionals[1], 'cannon'),
  pairs = Number(values.pairs),
  seconds = Number(values.seconds);

const deep: Depth = () => 30;
const start = fromLatLon(0.2, 0.3);
/** Ship `id` `metres` north of the start, heading `heading` rad. */
const placed = (id: number, metres: number, heading: number): Vessel => {
  const at = along(start, bearingAt(start, 0), metres).p;
  return afloat(id, { ...shipAt(at, bearingAt(at, heading)), speed: 0 });
};

/** The first two of each pair: bots keen to fight. */
const bold: number[] = [];
for (let s = 1; bold.length < 2 * pairs; s++)
  if (temper(s).fight > 0.5) bold.push(s);

/** Which of the two sinks first (0 or 1), or -1: neither in `seconds`. */
function duel(metres: number, seeds: number[], guns: GunKind[]): number {
  let fleet = [placed(0, 0, 0), placed(1, metres, Math.PI)];
  const minds: Memory[] = fleet.map((v, i) => mind(seeds[i], v.ship.at));
  let b: Battle = battleOf(
    fleet.map((v, i) => ({
      ...crewOf(v.id, gunOf(guns[i], 0)),
      health: { hull: HEALTH.hull, shield: HEALTH.shield },
    })),
    7
  );
  for (let n = 0; n < Math.round(seconds / STEP); n++) {
    const seen = fleet.map((v) => {
      const c = b.crews.find((k) => k.id === v.id);
      if (!c) throw new Error(`no crew for ${v.id}`);
      return {
        ...v,
        hull: c.health.hull,
        shield: c.health.shield,
        armed: armed(c),
        crew: c,
      };
    });
    const helms: Helm[] = [],
      orders: Order[] = [],
      asks = new Map<number, Ask>();
    fleet.forEach((v, i) => {
      const r = think(
        seen[i],
        seen.filter((o) => o.id !== v.id),
        { depth: deep },
        minds[i],
        nature(seeds[i])
      );
      minds[i] = r.memory;
      helms.push(r.helm);
      orders.push(r.order);
      asks.set(v.id, r.ask);
    });
    b = {
      ...b,
      crews: asked(b.crews, fleet, { pieces: [], next: 0 }, asks).crews,
    };
    const met = stepFleet(fleet, helms, STEP, deep);
    fleet = met.fleet;
    const f = stepBattle(b, fleet, orders, met.blows, STEP, deep);
    b = f.battle;
    for (const k of f.strikes) {
      const j = fleet.findIndex((v) => v.id === k.struck);
      if (j >= 0)
        minds[j] = k.ram
          ? bruised(minds[j], k.damage)
          : shot(minds[j], k.shooter, k.damage);
    }
    for (const c of b.crews) if (sunk(c.health)) return c.id;
  }
  return -1;
}

console.log(
  `${A} against ${B}: ${pairs} pairs of bold bots, each sailed both ways, ${seconds} s at most; wins of ${A} / ${B} / neither, by the range they start at:`
);
for (const metres of RANGES) {
  let a = 0,
    b = 0,
    none = 0;
  for (let p = 0; p < pairs; p++) {
    const seeds = [bold[2 * p], bold[2 * p + 1]];
    for (const guns of [
      [A, B],
      [B, A],
    ]) {
      const lost = duel(metres, seeds, guns);
      if (lost < 0) none++;
      else if (guns[lost] === A) b++;
      else a++;
    }
  }
  console.log(`  ${String(metres).padStart(3)} m: ${a} / ${b} / ${none}`);
}
