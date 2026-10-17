// Acceptance check 3: a tournament of 50 seeded headless matches, four minutes of match time each. The 20 bots play
// exactly as in the game; the player's slot sails the scripted loop captain of the determinism check (shot.ts
// loopPilot), a neutral rival that is left out of the statistics. Matches run in worker threads.
//
// Each of the 200 captain-matches per strategy (4 captains × 50 matches) yields one sample of every metric:
//   held       share of the planet held, averaged over the match (%)
//   peak       largest share held at any moment (%)
//   claimed    area taken by all its claims together (% of the planet)
//   bite       mean area of one claim (u²); claims/min, claims per minute afloat
//   enemy      share of the claimed area that was a rival's territory (%)
//   sinks      rivals it sank (trail cut or territory taken to nothing); deaths, times it was sunk
//   inside     share of its time afloat spent inside its own territory (%)
// A strategy's profile is the vector of its metric means. Two strategies count as clearly distinct when at least two
// metrics separate them with a large effect, |Cohen's d| ≥ 0.8 over the per-sample spread, so no single noisy metric
// can carry the distinction. On top, each strategy must stand out where its play says it should: greedy captains
// take the largest bites, cautious ones the smallest and most frequent, defenders spend the most time inside their
// territory, opportunists take the most rival territory, and hunters lead in sinkings. A lead counts only when it
// clears every other strategy by two standard errors of the difference of means.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { Sim, PLANET_AREA, cellArea } from '../src/sim.ts';
import { createWorld } from '../src/world.ts';
import { Bots, STRATEGIES, type Strategy } from '../src/bots.ts';
import { loopPilot } from './shot.ts';

const MATCHES = 50;
const TICKS = 4 * 60 * 30;
const METRICS = ['held', 'peak', 'claimed', 'bite', 'claims/min', 'enemy', 'sinks', 'deaths', 'inside'] as const;
type Metric = (typeof METRICS)[number];
type Sample = Record<Metric, number> & { strategy: Strategy };
type Moments = { mean: number; sd: number; n: number };
interface Match {
  samples: Sample[];
  decideMs: number;
  selfSinks: number;
  sinks: number;
}

function play(seed: number): Match {
  const sim = new Sim({ seed, world: createWorld(seed) });
  const n = sim.ships.length, bots = new Bots(sim), pilot = loopPilot(), inputs = new Float32Array(n);
  const held = new Float64Array(n), peak = new Float64Array(n), claimed = new Float64Array(n);
  const enemy = new Float64Array(n), claims = new Int32Array(n), sinks = new Int32Array(n), deaths = new Int32Array(n);
  const afloat = new Int32Array(n), inside = new Int32Array(n);
  let decideMs = 0, selfSinks = 0, total = 0;
  for (let t = 0; t < TICKS; t++) {
    inputs[0] = Math.max(-1, Math.min(1, pilot(sim)));
    const t0 = performance.now();
    bots.decide(sim, inputs);
    decideMs += performance.now() - t0;
    sim.step(inputs);
    for (const e of sim.events) {
      if (e.type === 'claim') {
        claims[e.ship]++;
        for (let k = 0; k < e.cells.length; k++) {
          const a = cellArea(e.cells[k]);
          claimed[e.ship] += a;
          if (e.prev[k] && e.prev[k] !== e.ship + 1) enemy[e.ship] += a;
        }
      } else if (e.type === 'sink') {
        deaths[e.ship]++;
        total++;
        if (e.by === e.ship) selfSinks++;
        else if (e.by >= 0) sinks[e.by]++;
      }
    }
    sim.events = [];
    for (const s of sim.ships) {
      held[s.id] += s.share;
      peak[s.id] = Math.max(peak[s.id], s.share);
      if (!s.alive) continue;
      afloat[s.id]++;
      if (!s.trail.length) inside[s.id]++;
    }
  }
  const samples: Sample[] = [];
  for (let id = 1; id < n; id++) {
    samples.push({
      strategy: bots.strategy[id],
      held: (100 * held[id]) / TICKS,
      peak: 100 * peak[id],
      claimed: (100 * claimed[id]) / PLANET_AREA,
      bite: claims[id] ? claimed[id] / claims[id] : NaN,
      'claims/min': (claims[id] * 60 * 30) / Math.max(1, afloat[id]),
      enemy: claimed[id] ? (100 * enemy[id]) / claimed[id] : NaN,
      sinks: sinks[id],
      deaths: deaths[id],
      inside: (100 * inside[id]) / Math.max(1, afloat[id]),
    });
  }
  return { samples, decideMs: decideMs / TICKS, selfSinks, sinks: total };
}

/** Mean, standard deviation and count of the defined values. */
function moments(xs: number[]): Moments {
  const v = xs.filter((x) => !Number.isNaN(x)), mean = v.reduce((a, b) => a + b, 0) / v.length;
  return { mean, sd: Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1)), n: v.length };
}

if (!isMainThread) {
  for (const seed of workerData as number[]) parentPort!.postMessage(play(seed));
} else {
  test('50 seeded matches: every strategy has a clearly distinct profile; hunters lead in sinkings', async (t) => {
    const lanes = Math.max(1, Math.min(8, availableParallelism() - 2));
    const seeds = Array.from({ length: MATCHES }, (_, k) => k + 1), t0 = performance.now();
    const lane = (k: number) => new Promise<Match[]>((done, fail) => {
      const out: Match[] = [];
      const w = new Worker(new URL(import.meta.url), { workerData: seeds.filter((s) => s % lanes === k) });
      w.on('message', (m: Match) => out.push(m));
      w.on('error', fail);
      w.on('exit', () => done(out));
    });
    const matches = (await Promise.all(Array.from({ length: lanes }, (_, k) => lane(k)))).flat();
    assert.equal(matches.length, MATCHES);

    const all = matches.flatMap((m) => m.samples);
    const stats = {} as Record<Strategy, Record<Metric, Moments>>;
    for (const s of STRATEGIES) {
      const mine = all.filter((x) => x.strategy === s);
      stats[s] = {} as Record<Metric, Moments>;
      for (const m of METRICS) stats[s][m] = moments(mine.map((x) => x[m]));
    }
    const mean = (s: Strategy, m: Metric) => stats[s][m].mean;
    const fmt = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
    const rows = [['strategy', ...METRICS], ...STRATEGIES.map((s) => [s, ...METRICS.map((m) => fmt(mean(s, m)))])];
    const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)));
    for (const r of rows) t.diagnostic(r.map((c, i) => (i ? c.padStart(widths[i]) : c.padEnd(widths[i]))).join('  '));
    const decide = matches.reduce((a, m) => a + m.decideMs, 0) / MATCHES;
    const sinkings = matches.reduce((a, m) => a + m.sinks, 0), self = matches.reduce((a, m) => a + m.selfSinks, 0);
    t.diagnostic(`${MATCHES} matches in ${((performance.now() - t0) / 1000).toFixed(0)} s on ${lanes} threads; ` +
      `decide() ${decide.toFixed(3)} ms per tick for 20 bots; ${(sinkings / MATCHES).toFixed(1)} sinkings per match ` +
      `(${((100 * self) / sinkings).toFixed(0)}% self-inflicted)`);

    // pairwise distinctness
    for (let i = 0; i < STRATEGIES.length; i++) {
      for (let j = i + 1; j < STRATEGIES.length; j++) {
        const a = STRATEGIES[i], b = STRATEGIES[j];
        const effects = METRICS.map((m) => {
          const x = stats[a][m], y = stats[b][m];
          return { m, d: (x.mean - y.mean) / Math.sqrt((x.sd * x.sd + y.sd * y.sd) / 2) };
        }).sort((p, q) => Math.abs(q.d) - Math.abs(p.d));
        t.diagnostic(`${a} vs ${b}: ${effects.slice(0, 3).map((e) => `${e.m} d=${e.d.toFixed(2)}`).join(', ')}`);
        const large = effects.filter((e) => Math.abs(e.d) >= 0.8).length;
        assert.ok(large >= 2, `${a} and ${b} must differ clearly in two metrics`);
      }
    }
    const leads = (s: Strategy, m: Metric, sign = 1) => {
      for (const o of STRATEGIES) {
        if (o === s) continue;
        const x = stats[s][m], y = stats[o][m], se = Math.sqrt((x.sd * x.sd) / x.n + (y.sd * y.sd) / y.n);
        assert.ok(sign * (x.mean - y.mean) > 2 * se, `${s} must ${sign > 0 ? 'top' : 'undercut'} ${o} in ${m}`);
      }
    };
    leads('greedy', 'bite');
    leads('cautious', 'bite', -1);
    leads('cautious', 'claims/min');
    leads('defender', 'inside');
    leads('opportunist', 'enemy');
    leads('hunter', 'sinks');
  });
}
