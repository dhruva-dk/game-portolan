// The bot-behaviour report: runs whole matches of captains headless and counts each behaviour PLAN.md's mechanics list
// says bots show. `node tests/tools/bots.ts [seed] [count]` prints it; tests/sim/bots.test.ts checks it over 20 seeds.
import { createMatch, step, over, EVENT, PHASE, SHIPS, TICK, WHALE_STATE, type MatchState } from '../../src/sim/match.ts';
import { CAPTAINS, LEAGUE_SIZE, type TemperamentId } from '../../src/career/captains.ts';
import { BRAIN, MODE, SIGHT_MAX, inSight } from '../../src/sim/captains/brain.ts';
import { STYLES } from '../../src/sim/captains/temperaments.ts';
import { currentAt, seaLevel, seaLevelAt } from '../../src/sim/environment.ts';
import { dot, length, v3 } from '../../src/sim/math.ts';
import { copy } from '../../src/sim/state.ts';
import { clearLine } from '../../src/sim/nav.ts';
import { ACTIVES } from '../../src/sim/perks.ts';
import { offWind, pointOfSail } from '../../src/sim/sailing.ts';
import { apart, tangentToward } from '../../src/sim/sphere.ts';
import { inStorm } from '../../src/sim/storm.ts';
import { ITEM_NAMES, WEAPON_KINDS, ITEM, WHALE } from '../../src/sim/tables.ts';
import { SEEN, seen } from '../../src/sim/visibility.ts';
import { newSky, skyAt } from '../../src/sim/weather.ts';
import { newWind, windAt } from '../../src/sim/wind.ts';
import { LANDMARKS } from '../../src/sim/world/index.ts';

/** Every count the mechanics list asks for; each must come out above zero, but for NEVER, which must stay at zero. */
export interface BotReport {
  matches: number;
  counts: Record<string, number>;
  /** Seconds each temperament held a landmark, on average per captain of it. */
  holding: number[];
  /** The average place of the captains drawn sharp (skill 0.6 and over) and green (0.4 and under); 1 is the winner. */
  placed: { high: number; low: number };
}

/** What the bots must never do. */
export const NEVER = ['targets a hidden ship'];
/** Ticks between looks at the fleet. */
const EVERY = 6;
/** The temperament that sails to hold water (STYLES[1], the Homesteader). */
export const HOLDER = 1;
const USES = [ITEM.smallShield, ITEM.bigShield, ITEM.repairKit, ITEM.fullRepair];

const FLOW = v3(), TO = v3(), W = newWind(), SKY = newSky(), LEFT = newSky();
const hidden: number[][] = Array.from({ length: SHIPS }, () => []);

/** The career's temperaments as the simulation numbers them, as src/app/session.ts maps them. */
const STYLE: Record<TemperamentId, number> = { hunter: 0, holder: 1, ambusher: 2, survivor: 3, looter: 4, skirmisher: 5 };

/**
 * Twenty of the league's captains, a different twenty each seed, each with its own temperament, ability and passive.
 * Half are drawn sharp (skill 0.6 to 1) and half green (0 to 0.4), every other ship, and which half swaps each seed, so
 * that over the matches each place in the fleet (and in the Gale) is held as often by a sharp captain as a green one.
 */
const fleetFor = (seed: number) => Array.from({ length: SHIPS }, (_, k) => {
  const c = CAPTAINS[(seed * 7 + k) % LEAGUE_SIZE];
  const skill = ((seed + k) % 2 ? 0.6 : 0) + ((seed * 13 + k * 5) % 5) / 10;
  return { captain: true, name: k, look: k, temperament: STYLE[c.temperament], skill, active: c.active, passive: c.passive };
});

export function botReport(seed: number, count: number): BotReport {
  const counts: Record<string, number> = {};
  const add = (k: string, n = 1): void => void (counts[k] = (counts[k] ?? 0) + n);
  // the list's every line, so a behaviour that never happens shows as a zero
  for (const k of ['sails on a good point', 'routes round land', 'gusts to close in', 'gusts to run', 'gusts back into the circle',
    'rides a current its way', 'routes round a passage the tide is closing', 'gets out of thunder', 'gets out of ash',
    'lets a hidden ship be', 'targets a hidden ship', 'selects', 'drops', 'heals when hurt', 'loots', 'claims water', 'spreads its Gale picks',
    'calls a delivery', 'gets out of the Storm', 'gets clear of a rising whale', 'answers a region event']) counts[k] = 0;
  for (const k of WEAPON_KINDS) counts[`fires the ${ITEM_NAMES[k]}`] = 0;
  for (const k of USES) counts[`uses the ${ITEM_NAMES[k]}`] = 0;
  for (const a of ACTIVES) counts[`uses ${a}`] = 0;
  for (const l of LANDMARKS) counts[`holds ${l.name}`] = 0;
  const held = STYLES.map(() => 0), captains = STYLES.map(() => 0);
  const places = { high: 0, highs: 0, low: 0, lows: 0 };

  for (let s = seed; s < seed + count; s++) {
    const state = createMatch({ seed: s, fleet: fleetFor(s) });
    const was = Array.from({ length: SHIPS }, () => ({ storm: false, thunder: 0, ash: 0, path: 0, whale: false, at: v3() }));
    const picks = new Map<number, number>();
    for (const ship of state.ships) captains[ship.captain.temperament % STYLES.length]++;
    while (!over(state) && state.tick < 60 * 60 * 30) {
      // every ship within the farthest a captain looks that is hidden from it (by night, fog, Hidden Wake or smoke),
      // as it looks: on the ticks it thinks, before the ships move on. It neither follows nor aims at one, though it
      // may make for where it lost it
      for (let i = 0; i < SHIPS; i++) {
        const ship = state.ships[i], h = hidden[i];
        h.length = 0;
        if (ship.phase !== PHASE.sea || !ship.captain.on || ship.captain.think !== 1) continue;
        for (let j = 0; j < SHIPS; j++) {
          const o = state.ships[j];
          if (j !== i && o.phase === PHASE.sea && apart(ship.pos, o.pos) <= SIGHT_MAX && (seen(state, i, j) & SEEN.visible) === 0) h.push(j);
        }
      }
      step(state, null);
      for (const e of state.events) tally(state, e, add);
      for (let i = 0; i < SHIPS; i++) {
        const c = state.ships[i].captain;
        if (c.think !== BRAIN.every) continue;
        for (const j of hidden[i]) add(c.foe === j && inSight(state, c) ? 'targets a hidden ship' : 'lets a hidden ship be');
      }
      if (state.tick % EVERY !== 0) continue;
      for (let i = 0; i < SHIPS; i++) {
        const ship = state.ships[i], c = ship.captain, w = was[i];
        if (ship.phase === PHASE.glide) picks.set(i, c.region);
        if (ship.phase !== PHASE.sea) continue;
        if (ship.perks !== 0) held[c.temperament % STYLES.length] += EVERY * TICK;
        windAt(state, ship.pos, W);
        if (ship.speed > 4 && pointOfSail(offWind(ship.head, W.v)) >= 0.95) add('sails on a good point');
        if (c.path.length > 0 && w.path === 0) add('routes round land');
        w.path = c.path.length;
        // a current running within 45° of her course to her goal, at over 1 m/s, that she sails along
        currentAt(state, ship.pos, FLOW);
        const flow = length(FLOW);
        if (flow > 1 && apart(ship.pos, c.goal) > 30) {
          tangentToward(ship.pos, c.goal, TO);
          if (dot(FLOW, TO) > 0.7 * flow && dot(FLOW, ship.head) > 0.7 * flow) add('rides a current its way');
        }
        // a straight line open now that the tide will close: she takes a route round instead
        if (c.path.length > 0 && apart(ship.pos, c.goal) > 30 && clearLine(ship.pos, c.goal, 6, seaLevel(state))
          && !clearLine(ship.pos, c.goal, 6, Math.min(seaLevel(state), seaLevelAt(state.tick * TICK + 15)))) add('routes round a passage the tide is closing');
        // out of it, from a spot that is still under it: she left the weather, not the weather her
        skyAt(state, ship.pos, SKY);
        skyAt(state, w.at, LEFT);
        if (w.thunder > 0 && SKY.thunder === 0 && LEFT.thunder > 0) add('gets out of thunder');
        if (w.ash > 0 && SKY.ash === 0 && LEFT.ash > 0) add('gets out of ash');
        w.thunder = SKY.thunder;
        w.ash = SKY.ash;
        copy(w.at, ship.pos);
        const storm = inStorm(state, ship.pos);
        if (w.storm && !storm) add('gets out of the Storm');
        w.storm = storm;
        // out of the lift's reach of the spot it will breach at, which stays put, before it breaches
        const whale = state.whale.state === WHALE_STATE.rising && apart(state.whale.spot, ship.pos) < WHALE.lift;
        if (w.whale && !whale && state.whale.state === WHALE_STATE.rising) add('gets clear of a rising whale');
        w.whale = whale;
        if (c.mode === MODE.event) add('answers a region event');
        if (c.mode === MODE.heal && ship.use >= 0) add('heals when hurt');
      }
    }
    // no region gets more than a quarter of the captains' picks
    const per = new Map<number, number>();
    for (const r of picks.values()) per.set(r, (per.get(r) ?? 0) + 1);
    if (picks.size > 0 && Math.max(...per.values()) <= picks.size / 4) add('spreads its Gale picks');
    for (const ship of state.ships) {
      if (ship.captain.skill >= 0.6) [places.high, places.highs] = [places.high + ship.place, places.highs + 1];
      if (ship.captain.skill <= 0.4) [places.low, places.lows] = [places.low + ship.place, places.lows + 1];
    }
  }
  return {
    matches: count, counts, holding: held.map((h, k) => (captains[k] ? h / captains[k] : 0)),
    placed: { high: places.high / Math.max(1, places.highs), low: places.low / Math.max(1, places.lows) },
  };
}

function tally(state: MatchState, e: MatchState['events'][number], add: (k: string, n?: number) => void): void {
  const ship = state.ships[e.ship];
  if (!ship?.captain.on) return;
  const mode = ship.captain.mode;
  switch (e.kind) {
    case EVENT.fire: add(`fires the ${ITEM_NAMES[e.item]}`); break;
    case EVENT.select: add('selects'); break;
    case EVENT.drop: add('drops'); break;
    case EVENT.useStart: add(`uses the ${ITEM_NAMES[e.item]}`); break;
    case EVENT.pickup: add('loots'); break;
    case EVENT.claim: add('claims water'); break;
    case EVENT.perkGained: add(`holds ${LANDMARKS[e.item].name}`); break;
    case EVENT.deliveryCalled: add('calls a delivery'); break;
    case EVENT.ability: add(`uses ${ACTIVES[e.item]}`); break;
    case EVENT.gust:
      if (mode === MODE.fight) add('gusts to close in');
      else if (mode === MODE.flee) add('gusts to run');
      else if (mode === MODE.storm) add('gusts back into the circle');
      break;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = Number(process.argv[2] ?? 1), count = Number(process.argv[3] ?? 20);
  const t0 = performance.now();
  const r = botReport(seed, count);
  console.log(`${r.matches} matches from seed ${seed}, in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  for (const [k, v] of Object.entries(r.counts)) console.log(`${(v > 0) !== NEVER.includes(k) ? ' ' : '!'} ${k.padEnd(48)} ${Number.isInteger(v) ? v : v.toFixed(2)}`);
  console.log('seconds holding a landmark, per captain:', STYLES.map((_, k) => `${k === HOLDER ? '*' : ''}${r.holding[k].toFixed(0)}`).join(' '));
  console.log(`average place, skill 0.6 and over: ${r.placed.high.toFixed(1)}; 0.4 and under: ${r.placed.low.toFixed(1)}`);
}
