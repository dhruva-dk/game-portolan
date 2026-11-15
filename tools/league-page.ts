// In the page (tools/league.ts): a race dealt from `seed` (play/deal.ts, `count` ships, its storm at `pace`) run
// whole in the league's Worker (play/league.ts) on the planet of `planet`; and, run in node and in the page alike,
// where two runs part: the planet's ground, its water sounded, the berths, then each second of the race.
import { createLeague } from '../src/play/league.ts';
import { deal } from '../src/play/deal.ts';
import { matchOf, runRace } from '../src/play/race.ts';
import { createState } from '../src/play/state.ts';
import type { RaceResult } from '../src/race.ts';
import { STEP } from '../src/sim/fixed.ts';
import { chart } from '../src/sim/route.ts';
import { berthing, berths } from '../src/sim/spawn.ts';
import { createPlanet } from '../src/world/planet.ts';
import { fromLatLon, type Vec3 } from '../src/world/sphere.ts';
import { flat } from '../src/world/swell.ts';

export async function race(planet: number, seed: number, count: number, pace: number): Promise<RaceResult> {
  const league = createLeague(planet), c = deal(seed, count);
  try {
    return await league.run({ ...c, rules: { ...c.rules, storm: { pace } } });
  } finally {
    league.close();
  }
}

/** The same race run on the page's own thread (play/race.ts runRace), not in the Worker. */
export function onPage(planetSeed: number, seed: number, count: number, pace: number): RaceResult {
  const planet = createPlanet(planetSeed), depth = (p: Vec3) => -planet.height(p), c = deal(seed, count);
  return runRace({ ...c, rules: { ...c.rules, storm: { pace } } }, planet, { chart: chart(depth), water: berthing(depth) });
}

/** Where a run stands, read at each stage in turn: the ground at a lattice of points, the water sounded, the berths,
 *  then each ship's place after each second of the race, for `seconds`. */
export function stages(planetSeed: number, seed: number, count: number, seconds: number): string[] {
  const planet = createPlanet(planetSeed), depth = (p: Vec3) => -planet.height(p);
  const out: string[] = [];
  let ground = '';
  for (let i = 0; i < 400; i++) ground += planet.height(fromLatLon(Math.asin(((i * 37) % 400) / 200 - 1), i * 0.7)).toString(36);
  out.push(`ground ${ground}`);
  const water = berthing(depth), waters = { chart: chart(depth), water };
  out.push(`water ${water.points.flat().join(',')}`);
  out.push(`berths ${berths(water, seed, count, depth).map((b) => [...b.at, ...b.heading].join(',')).join(';')}`);
  const m = matchOf(deal(seed, count), planet), state = createState(planet, flat, waters, m);
  state.start(m, false);
  for (let s = 0; s < seconds; s++) {
    for (let k = 0; k < Math.round(1 / STEP); k++) state.advance({ course: null, throttle: 0 }, { aim: null, fire: false });
    out.push(`${s + 1} s ${state.vessels().map((v) => `${v.id}:${v.ship.at.join(',')}:${state.crew(v.id).health.hull}`).join(';')}`);
  }
  return out;
}
