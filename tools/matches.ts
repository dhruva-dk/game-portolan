// Whole matches of bots, no browser needed: how they arm themselves from the loot, and how they end.
//   node tools/matches.ts [matches=3] [ships=80] [seed]
// Each match puts `ships` bots to sea on open water spread over the planet (seeded), strews its loot (sim/loot.ts) and
// runs its storm, stepping the sim as play/state.ts advance does (bots, stores, fleet, fighting, the storm's wear,
// stores again), until one ship is left or the storm's last close is long past. Prints, per match, the share of ships
// afloat that are armed at 30, 60 and 120 s, the share with a shield or something to mend with, how the ships were
// sunk, how long it took, and any bot that went for one piece of loot for more than a minute without reaching it.

import { battleOf, crewOf, stepBattle, weathered } from '../src/sim/battle.ts';
import { mind, rammed, shot, think, type Memory, type Seen } from '../src/sim/bot.ts';
import { afloat, stepFleet, type Vessel } from '../src/sim/contact.ts';
import { STEP } from '../src/sim/fixed.ts';
import { sunk } from '../src/sim/health.ts';
import { strewn } from '../src/sim/loot.ts';
import { chart } from '../src/sim/route.ts';
import { shipAt, type Helm } from '../src/sim/ship.ts';
import { asked, crewed, stored, type Ask } from '../src/sim/stores.ts';
import { createStorm, STORM } from '../src/sim/storm.ts';
import { SEED, createPlanet } from '../src/world/planet.ts';
import { hash, random } from '../src/world/random.ts';
import { frameAt, fromLatLon, type Vec3 } from '../src/world/sphere.ts';

const games = Number(process.argv[2] ?? 3), ships = Number(process.argv[3] ?? 80), seed = Number(process.argv[4] ?? SEED);
const t0 = performance.now();
const planet = createPlanet(seed);
const depth = (p: Vec3) => -planet.height(p);
const charted = chart(depth);
console.log(`planet and chart in ${(performance.now() - t0).toFixed(0)} ms`);
const end = STORM.phases.reduce((t, p) => t + p.wait + p.close, 0) + 120;

for (let g = 0; g < games; g++) {
  const matchSeed = seed + 7919 * (g + 1), storm = createStorm(matchSeed, depth), draw = random(hash(matchSeed, 0xb0a7));
  let fleet: Vessel[] = [];
  const minds = new Map<number, Memory>();
  for (let id = 0; fleet.length < ships; id++) {
    const at = fromLatLon(Math.asin(2 * draw() - 1), 2 * Math.PI * draw());
    if (depth(at) < 6 || fleet.some((v) => Math.acos(Math.min(1, v.ship.at[0] * at[0] + v.ship.at[1] * at[1] + v.ship.at[2] * at[2])) * 554 < 60)) continue;
    const s = shipAt(at, frameAt(at).north);
    fleet.push(afloat(fleet.length, s));
    minds.set(fleet.length - 1, mind(hash(matchSeed, fleet.length - 1), at));
  }
  let battle = battleOf(fleet.map((v) => crewOf(v.id)), matchSeed), flotsam = strewn(matchSeed, depth);
  const causes: Record<string, number> = { shot: 0, ram: 0, storm: 0 };
  const marks: string[] = [], chase = new Map<number, { target: number; since: number }>(), stuck = new Set<string>();
  let tick = 0;
  const t1 = performance.now();
  for (; fleet.length > 1 && tick * STEP < end; tick++) {
    const time = tick * STEP, s = storm(time);
    const crews = new Map(battle.crews.map((c) => [c.id, c]));
    const seen: Seen[] = fleet.map((v) => { const c = crews.get(v.id)!; return { ...v, hull: c.health.hull, shield: c.health.shield, armed: !!c.gun, crew: c }; });
    const helms: Helm[] = [], orders = fleet.map(() => ({ aim: null as Vec3 | null, fire: false })), asks = new Map<number, Ask>();
    fleet.forEach((v, i) => {
      const r = think(seen[i], seen.filter((o) => o.id !== v.id), { depth, chart: charted, storm: s, loot: flotsam.pieces }, minds.get(v.id)!, hash(matchSeed, v.id));
      minds.set(v.id, r.memory);
      [helms[i], orders[i]] = [r.helm, r.order];
      asks.set(v.id, r.ask);
      const m = r.memory, was = chase.get(v.id);
      if (m.mode === 'loot' && m.target >= 0) {
        if (was?.target !== m.target) chase.set(v.id, { target: m.target, since: time });
        else if (time - was.since > 60) stuck.add(`${v.id}→${m.target}`);
      } else chase.delete(v.id);
    });
    const wants = asked(battle.crews, fleet, flotsam, asks);
    const manned = new Map(wants.crews.map((c) => [c.id, c]));
    fleet.forEach((v, i) => { helms[i] = crewed(helms[i], manned.get(v.id)); });
    battle = { ...battle, crews: wants.crews };
    const met = stepFleet(fleet, helms, STEP, depth);
    fleet = met.fleet;
    for (const b of met.blows) minds.set(b.struck.id, rammed(minds.get(b.struck.id)!, b.striker.id));
    const fought = stepBattle(battle, fleet, orders, met.blows, STEP, depth);
    for (const k of fought.strikes) if (!k.ram && minds.has(k.struck)) minds.set(k.struck, shot(minds.get(k.struck)!, k.shooter));
    const worn = weathered(fought.battle, fleet, s, STEP);
    const sunkNow = [...fought.sunk, ...worn.sunk];
    const kept = stored(worn.battle.crews, flotsam, fleet, wants.takes, sunkNow, STEP, depth, matchSeed);
    battle = { ...worn.battle, crews: kept.crews };
    flotsam = kept.flotsam;
    for (const id of sunkNow) {
      const blow = fought.sunk.includes(id) ? fought.strikes.findLast((k) => k.struck === id) : undefined;
      causes[blow ? (blow.ram ? 'ram' : 'shot') : 'storm']++;
    }
    fleet = fleet.filter((v) => !sunkNow.includes(v.id));
    if ([30, 60, 120].some((at) => Math.round(at / STEP) === tick)) {
      const up = battle.crews.filter((c) => !sunk(c.health));
      const armed = up.filter((c) => c.gun).length, mended = up.filter((c) => c.health.shield > 0 || c.hold.items.some((x) => x)).length;
      marks.push(`${Math.round(time)} s: ${armed}/${up.length} armed (${((100 * armed) / up.length).toFixed(0)}%), ${mended} shielded or stocked`);
    }
  }
  const ms = performance.now() - t1;
  console.log(`match ${g + 1} (seed ${matchSeed}): ${fleet.length} left at ${(tick * STEP).toFixed(0)} s; sunk by shot ${causes.shot}, ram ${causes.ram}, storm ${causes.storm}; ${flotsam.pieces.length} pieces left; ${(ms / tick).toFixed(2)} ms a step`);
  for (const m of marks) console.log(`  ${m}`);
  console.log(`  bots on one piece over 60 s: ${stuck.size ? [...stuck].join(', ') : 'none'}`);
}
