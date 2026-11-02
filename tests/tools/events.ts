// Runs whole bot matches and reports what the regions' events did: `node tests/tools/events.ts [seed] [count]`.
// For each event a captain keeps clear of, it compares the time ships spend in its danger from its warning to its end
// with the time they spend there over the same span just before the warning.
import { MODE } from '../../src/sim/captains/brain.ts';
import { EVENT_REGION, aground } from '../../src/sim/environment.ts';
import { EVENT, createMatch, over, step } from '../../src/sim/match.ts';
import { apart } from '../../src/sim/sphere.ts';
import { CAUSE, PHASE, TICK, type MatchState } from '../../src/sim/state.ts';
import { REGION_EVENT } from '../../src/sim/tables.ts';
import { REGIONS, REGION_EVENTS } from '../../src/sim/world/index.ts';

const seed = Number(process.argv[2] ?? 1), count = Number(process.argv[3] ?? 1);
const totals = { secs: 0, warned: 0, started: 0, ended: 0, bombs: 0, rockHits: 0, bombHits: 0, eventMode: 0, aground: 0, shipTicks: 0, ms: 0 };
const DANGERS = [EVENT_REGION.spires, EVENT_REGION.narrows, EVENT_REGION.glass, EVENT_REGION.fire, EVENT_REGION.kelp, EVENT_REGION.maelstrom];
const inDanger = new Map(DANGERS.map((ri) => [ri, { before: 0, during: 0 }]));
const firstAt = new Map<string, number[]>();

/** The danger zone of region ri's event, wherever it is in its programme. */
function zone(state: MatchState, ri: number) {
  const ev = state.regionEvents[ri];
  if (ri === EVENT_REGION.fire) return { at: REGION_EVENTS[ri].spots[ev.k], r: REGION_EVENTS[ri].r };
  return { at: ev.spot, r: ri === EVENT_REGION.kelp ? REGION_EVENT.bloom.r : REGION_EVENTS[ri].r };
}

for (let s = seed; s < seed + count; s++) {
  const t0 = performance.now();
  const state = createMatch({ seed: s, fleet: Array.from({ length: 20 }, () => ({ captain: true })) });
  const inside = new Map(DANGERS.map((ri) => [ri, [] as number[]]));
  while (!over(state) && state.tick < 60 * 60 * 30) {
    step(state);
    const landed = state.events.some((e) => e.kind === EVENT.lavaBomb && e.flag !== 0);
    for (const e of state.events) {
      if (e.kind === EVENT.regionWarn) totals.warned++;
      if (e.kind === EVENT.regionStart) {
        totals.started++;
        const n = REGIONS[e.item].id;
        firstAt.set(n, [...(firstAt.get(n) ?? []), Math.round(state.tick * TICK)]);
      }
      if (e.kind === EVENT.regionEnd) totals.ended++;
      if (e.kind === EVENT.lavaBomb && e.flag === 0) totals.bombs++;
      if (e.kind === EVENT.hit && e.item === CAUSE.rock) totals.rockHits++;
      if (landed && e.kind === EVENT.hit && e.item === CAUSE.burn && e.by === -1) totals.bombHits++;
    }
    for (const ri of DANGERS) {
      const z = zone(state, ri);
      let n = 0;
      for (const x of state.ships) if (x.phase === PHASE.sea && apart(x.pos, z.at) < z.r) n++;
      inside.get(ri)!.push(n);
    }
    for (const x of state.ships) {
      if (x.phase !== PHASE.sea) continue;
      totals.shipTicks++;
      if (x.captain.mode === MODE.event) totals.eventMode++;
      if (aground(state, x.pos)) totals.aground++;
    }
  }
  for (const ri of DANGERS) {
    const ev = state.regionEvents[ri], ticks = inside.get(ri)!, m = inDanger.get(ri)!;
    const from = Math.round((ev.at - ev.warn) / TICK), to = Math.round((ev.at + ev.run) / TICK), span = to - from;
    for (let t = from; t < to && t < ticks.length; t++) m.during += ticks[t];
    for (let t = Math.max(0, from - span); t < from; t++) m.before += ticks[t];
  }
  totals.secs += state.tick * TICK;
  totals.ms += performance.now() - t0;
}
console.log(`${count} matches: ${(totals.secs / count).toFixed(0)} s each, ${(totals.ms / count).toFixed(0)} ms each to run`);
console.log(`events warned ${totals.warned}, started ${totals.started}, ended ${totals.ended}; bombs ${totals.bombs}, bomb hits ${totals.bombHits}, rock hits ${totals.rockHits}`);
console.log(`ship time in event mode ${((100 * totals.eventMode) / totals.shipTicks).toFixed(2)}%, aground ${((100 * totals.aground) / totals.shipTicks).toFixed(2)}%`);
console.log('ship-seconds in each danger, the span before its warning against warning to end:');
for (const [ri, m] of inDanger) console.log(`  ${REGIONS[ri].id}: ${(m.before * TICK).toFixed(0)} before, ${(m.during * TICK).toFixed(0)} during`);
for (const [n, ts] of [...firstAt].sort()) console.log(`  ${n} started at ${ts.join(' ')} s`);
