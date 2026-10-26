import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seaFor } from '../../src/sim/environment.ts';
import { idleInput } from '../../src/sim/input.ts';
import { step } from '../../src/sim/match.ts';
import { EVENT, PHASE, SHIPS, TICK, createMatch, type Outfit } from '../../src/sim/state.ts';
import { world } from './vectors.ts';

const MATCHES = 20, LIMIT = Math.round(900 / TICK);
const NAMES = ['hunter', 'expander', 'raider', 'turtle', 'opportunist', 'gambler'];
const STATS = ['sea', 'broken', 'sunk', 'loot', 'place'] as const;
type Profile = Record<(typeof STATS)[number], number>;

test('the smoke tournament: twenty matches, six distinct temperament profiles', { timeout: 900_000 }, (t) => {
  const sum: Profile[] = NAMES.map(() => ({ sea: 0, broken: 0, sunk: 0, loot: 0, place: 0 })), n = NAMES.map(() => 0);
  const geo = world(), idle = idleInput(), cpu0 = process.cpuUsage();
  let ticks = 0, minutes = 0;
  for (let m = 0; m < MATCHES; m++) {
    const temper = (i: number): number => (i - 1 + m) % 6;
    const fleet: Outfit[] = Array.from({ length: SHIPS }, (_, i) => (i === 0 ? {} : { pigment: 5 * temper(i) + ((i + m) % 5), captain: { temperament: temper(i), tier: 5 } }));
    const seed = 7100 + m, sea = seaFor(geo, seed), s = createMatch({ seed, fleet, rank: 6 });
    const row: Profile[] = Array.from({ length: SHIPS }, () => ({ sea: 0, broken: 0, sunk: 0, loot: 0, place: 0 }));
    const out: number[] = new Array<number>(SHIPS).fill(-1);
    let sunk = 0, over = false, k = 0;
    for (; k < LIMIT && !over; k++) {
      step(sea, s, idle);
      for (const e of s.events) {
        if (e.kind === EVENT.loop && e.ship >= 0) row[e.ship].sea += e.amount;
        else if (e.kind === EVENT.broken && e.by >= 0) row[e.by].broken++;
        else if ((e.kind === EVENT.scoop || e.kind === EVENT.find) && e.ship >= 0) row[e.ship].loot += e.amount;
        else if (e.kind === EVENT.sunk) {
          out[e.ship] = sunk++;
          if (e.by >= 0) row[e.by].sunk++;
        } else if (e.kind === EVENT.win) over = true;
      }
    }
    ticks += k;
    minutes += (k * TICK) / 60 / MATCHES;
    const afloat = s.ships.map((_, i) => i).filter((i) => s.ships[i].phase !== PHASE.sunk).sort((a, b) => s.ships[b].held - s.ships[a].held);
    for (let i = 0; i < SHIPS; i++) row[i].place = out[i] >= 0 ? SHIPS - out[i] : 1 + afloat.indexOf(i);
    for (let i = 1; i < SHIPS; i++) {
      n[temper(i)]++;
      for (const f of STATS) sum[temper(i)][f] += row[i][f];
    }
  }
  const cpu = process.cpuUsage(cpu0), mean = sum.map((p, k) => Object.fromEntries(STATS.map((f) => [f, p[f] / n[k]])) as Profile);
  t.diagnostic(`${MATCHES} matches, mean ${minutes.toFixed(1)} min, ${(((cpu.user + cpu.system) / 1e6)).toFixed(1)} s CPU, ${((cpu.user + cpu.system) / 1000 / ticks).toFixed(3)} ms a tick`);
  t.diagnostic(`temperament  ships  sea u²  broken  sunk  loot  place`);
  for (let k = 0; k < NAMES.length; k++) {
    const p = mean[k];
    t.diagnostic(`${NAMES[k].padEnd(12)} ${String(n[k]).padStart(5)} ${p.sea.toFixed(0).padStart(7)} ${p.broken.toFixed(2).padStart(7)} ${p.sunk.toFixed(2).padStart(5)} ${p.loot.toFixed(0).padStart(5)} ${p.place.toFixed(1).padStart(6)}`);
  }
  const scale = STATS.map((f) => Math.max(1e-9, Math.max(...mean.map((p) => p[f])) - Math.min(...mean.map((p) => p[f]))));
  let nearest = Infinity, pair = '';
  for (let a = 0; a < NAMES.length; a++) for (let b = a + 1; b < NAMES.length; b++) {
    const d = Math.hypot(...STATS.map((f, k) => (mean[a][f] - mean[b][f]) / scale[k]));
    if (d < nearest) [nearest, pair] = [d, `${NAMES[a]}/${NAMES[b]}`];
  }
  t.diagnostic(`nearest profiles: ${pair}, ${nearest.toFixed(2)} spreads apart`);
  assert.ok(nearest > 0.25, `${pair} too alike (${nearest.toFixed(2)})`);
  const [hunter, expander, raider, turtle, opportunist, gambler] = mean;
  assert.ok(Math.max(expander.sea, gambler.sea) > Math.max(hunter.sea, raider.sea, turtle.sea, opportunist.sea), 'expanders and gamblers claim the most sea');
  assert.ok(hunter.broken > Math.max(expander.broken, turtle.broken), 'hunters break more trails than expanders and turtles');
  assert.ok(raider.broken > (expander.broken + turtle.broken + opportunist.broken + gambler.broken) / 4, 'raiders break more trails than the temperaments that do not raid');
});
