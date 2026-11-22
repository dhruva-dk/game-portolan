// One carded race sailed headless (src/play/race.ts runRace) on the planet of
// its seed, by a field of spec ships (specField): its result's hash and how
// long it took on this machine's clock. The hash is the race's own (the same
// wherever it is run); the time is this machine's.
//
//   node tools/race.ts [seed] [teams] [--json]
//
// seed: the planet's and the race's (the game's own if not given); teams: how
// many teams of four (20 if not given); --json: the whole result, as JSON, in
// place of the lines.
//
// Node only (tools/): no three, no browser.

import { SEED } from '../src/environment.ts';
import { runRace, specField } from '../src/play/race.ts';
import { TEAM, TEAMS } from '../src/race.ts';
import { worldOf } from './harness/world.ts';

const args = process.argv.slice(2),
  json = args.includes('--json'),
  [seed = SEED, teams = TEAMS] = args
    .filter((a) => !a.startsWith('--'))
    .map(Number);
if (!Number.isInteger(seed) || !Number.isInteger(teams) || teams < 1)
  throw new Error('usage: node tools/race.ts [seed] [teams] [--json]');

const world = worldOf(seed),
  card = specField(seed, teams);
const began = performance.now(),
  result = runRace(card, world.planet, world.waters),
  ms = performance.now() - began;

if (json) console.log(JSON.stringify(result));
else {
  const afloat = result.order.length - result.sinkings.length;
  console.log(`seed ${seed}: ${teams * TEAM} ships in ${teams} teams`);
  console.log(`hash ${result.hash}`);
  console.log(
    `race ${result.seconds.toFixed(1)} s, ${result.sinkings.length} sunk, ${afloat} afloat, won by ship ${result.order[0]} of team ${card.ships[result.order[0]].team}`
  );
  const sum = (k: 'jobs' | 'slips' | 'seconds') =>
    result.pits.reduce((n, p) => n + p[k], 0);
  console.log(
    `pits ${result.pits.length} stops by ${new Set(result.pits.map((p) => p.id)).size} ships: ${sum('jobs')} jobs, ${sum('slips')} slips, ${sum('seconds').toFixed(0)} s in all; ${result.faults.length} faults`
  );
  console.log(
    `wall ${(ms / 1000).toFixed(2)} s (the planet ${(world.ms / 1000).toFixed(2)} s besides)`
  );
}
