// Sweep (WP12 tuning): named variants of the captains' tuning, each over the same tournament matches (0 … n−1) on
// worker_threads, one compact table per variant: per temperament check 3's five spec stats (sea, broken, sunk, loot,
// place) and its sinkings by the killer's mode (flee/fight/ram/hunt/face/loop/home), then check 3's distinct-profile, hunters' lead
// and rank numbers. A variant lays Style fields over temperaments (by index: career/league.ts TEMPERAMENT) and sets
// brain TUNE knobs; each worker applies them from the defaults before a variant's matches, so nothing in the source
// changes between runs. t values scale with √n: at 100 matches they read about 0.71 of a 200-match run's.
//   node tests/tools/sweep.ts --matches 100 --variants '[{"name":"base"},{"name":"shy","tune":{"shy":0.3},"style":{"1":{"run":0.9}}}]'
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { TUNE } from '../../src/sim/captains/brain.ts';
import { restyle, STYLES, type Style } from '../../src/sim/captains/temperaments.ts';
import { NAMES, mean, placesByTier, profiles, tournamentMatch, welch, type MatchOut } from './tournament.ts';

interface Variant { name: string; tune?: Partial<typeof TUNE>; style?: Record<string, Partial<Style>> }
const SPEC = ['sea', 'broken', 'sunk', 'loot', 'place'] as const;
const KILL_MODES = [10, 8, 9, 7, 12, 3, 4]; // brain.ts MODE: flee, fight, ram, hunt, face, loop, home

if (!isMainThread && (workerData as { sweepWorker?: boolean } | null)?.sweepWorker) {
  const variants = (workerData as { variants: Variant[] }).variants, tune0 = { ...TUNE }, styles0 = STYLES.map((s) => ({ ...s }));
  let on = -1;
  parentPort!.on('message', ({ k, v, m }: { k: number; v: number; m: number }) => {
    if (v !== on) {
      Object.assign(TUNE, tune0, variants[v].tune ?? {});
      styles0.forEach((s, t) => restyle(t, { ...s, ...(variants[v].style?.[t] ?? {}) }));
      on = v;
    }
    parentPort!.postMessage({ k, out: tournamentMatch(m) });
  });
} else if (isMainThread) {
  const arg = (name: string): string | undefined => {
    const k = process.argv.indexOf(`--${name}`);
    return k > 0 ? process.argv[k + 1] : undefined;
  };
  const n = Number(arg('matches') ?? 100), width = Number(arg('workers') ?? availableParallelism());
  const variants = JSON.parse(arg('variants') ?? '[{"name":"base"}]') as Variant[];
  const jobs = variants.flatMap((_, v) => Array.from({ length: n }, (_, m) => ({ v, m })));
  const out: MatchOut[] = new Array<MatchOut>(jobs.length);
  let next = 0;
  const t0 = performance.now();
  await Promise.all(Array.from({ length: Math.min(width, jobs.length) }, () => new Promise<void>((done, fail) => {
    const w = new Worker(fileURLToPath(import.meta.url), { workerData: { sweepWorker: true, variants } });
    const give = (): void => {
      if (next < jobs.length) {
        const k = next++;
        w.postMessage({ k, ...jobs[k] });
      } else void w.terminate().then(() => done());
    };
    w.on('message', (msg: { k: number; out: MatchOut }) => {
      out[msg.k] = msg.out;
      give();
    });
    w.on('error', fail);
    give();
  })));
  console.log(`${variants.length} variants × ${n} matches: ${((performance.now() - t0) / 1000).toFixed(0)} s   (cols: ${SPEC.join(' ')}  k flee/fight/ram/hunt/face/loop/home)`);
  variants.forEach((vr, v) => {
    const ms = out.slice(v * n, (v + 1) * n), rows = ms.flatMap((x) => x.rows), p = profiles(rows);
    const tick = ms.reduce((a, x) => a + x.ms, 0) / ms.reduce((a, x) => a + x.minutes * 60 * 30, 0);
    console.log(`== ${vr.name} ${JSON.stringify({ ...vr.tune, ...vr.style })}  match ${mean(ms.map((x) => x.minutes)).toFixed(2)} min, tick ${tick.toFixed(3)} ms`);
    p.forEach((x, t) => {
      const mine = rows.filter((r) => r.temperament === t), km = KILL_MODES.map((k) => mean(mine.map((r) => r.kmode[k])).toFixed(2));
      console.log(`${NAMES[t].padEnd(11)} ${SPEC.map((f) => x.mean[f].toFixed(f === 'sea' || f === 'loot' ? 0 : 2).padStart(6)).join('')}  k ${km.join('/')}`);
      if (process.argv.includes('--detail')) { // sinkings by every killer mode and by cause, hurt dealt by mode, time by mode (shares)
        const sum = (f: 'kmode' | 'kvict' | 'causes' | 'dmode' | 'tmode'): string => { const v = mine[0][f].map((_, k) => mean(mine.map((r) => r[f][k]))), all = v.reduce((a, y) => a + y, 0) || 1; return v.map((y) => (f === 'kmode' || f === 'kvict' || f === 'causes' ? y : y / all).toFixed(2)).join(' '); };
        console.log(`   kvict ${sum('kvict')}\n   kmode ${sum('kmode')} | causes ${sum('causes')}\n   dmode ${sum('dmode')}\n   tmode ${sum('tmode')}`);
      }
    });
    const spread = SPEC.map((f) => Math.max(1e-9, Math.max(...p.map((x) => x.mean[f])) - Math.min(...p.map((x) => x.mean[f]))));
    let near = Infinity, nearP = '', weak = Infinity, weakP = '';
    for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
      const d = Math.hypot(...SPEC.map((f, k) => (p[a].mean[f] - p[b].mean[f]) / spread[k]));
      const ts = SPEC.map((f) => Math.abs(welch(p[a].values[f], p[b].values[f]))), best = Math.max(...ts);
      if (d < near) [near, nearP] = [d, `${NAMES[a]}/${NAMES[b]}`];
      if (best < weak) [weak, weakP] = [best, `${NAMES[a]}/${NAMES[b]}(${SPEC[ts.indexOf(best)]})`];
    }
    const hunt = p.slice(1).map((x) => welch(p[0].values.sunk, x.values.sunk));
    const og = SPEC.map((f) => `${f} ${welch(p[4].values[f], p[5].values[f]).toFixed(1)}`).join(', ');
    const tiers = placesByTier(rows), low = tiers.slice(0, 3).flat(), high = tiers.slice(5).flat();
    console.log(`huntT ${Math.min(...hunt).toFixed(2)} [${hunt.map((y) => y.toFixed(1)).join(' ')}]; weakest ${weakP} ${weak.toFixed(2)}; nearest ${nearP} ${near.toFixed(2)}; opp/gam ${og}; rank ${(mean(low) - mean(high)).toFixed(2)} t ${welch(low, high).toFixed(1)}`);
  });
}
