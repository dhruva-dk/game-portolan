import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { TUNE } from '../../src/sim/captains/brain.ts';
import { restyle, STYLES, type Style } from '../../src/sim/captains/temperaments.ts';
import { KITS, STORM } from '../../src/sim/tables.ts';
import { NAMES, mean, placesByTier, profiles, tournamentMatch, welch, type MatchOut } from './tournament.ts';

type Phase = (typeof STORM.phases)[number];
interface Variant { name: string; tune?: Partial<typeof TUNE>; style?: Record<string, Partial<Style>>; kit?: Record<string, number[]>; storm?: { announce?: number; shift?: number; phases?: Record<string, Partial<Phase>> } }
const SPEC = ['sea', 'broken', 'sunk', 'loot', 'place'] as const;
const KILL_MODES = [10, 8, 9, 7, 12, 3, 4];

if (!isMainThread && (workerData as { sweepWorker?: boolean } | null)?.sweepWorker) {
  const variants = (workerData as { variants: Variant[] }).variants, tune0 = { ...TUNE }, styles0 = STYLES.map((s) => ({ ...s })), kits0 = KITS.map((k) => [...k]);
  const announce0 = STORM.announce, phases0 = STORM.phases.map((p) => ({ ...p }));
  let on = -1;
  parentPort!.on('message', ({ k, v, m }: { k: number; v: number; m: number }) => {
    if (v !== on) {
      Object.assign(TUNE, tune0, variants[v].tune ?? {});
      styles0.forEach((s, t) => restyle(t, { ...s, ...(variants[v].style?.[t] ?? {}) }));
      kits0.forEach((k, t) => KITS[t].splice(0, k.length, ...(variants[v].kit?.[t] ?? k)));
      const st = variants[v].storm ?? {};
      STORM.announce = st.announce ?? announce0;
      phases0.forEach((p, k) => Object.assign(STORM.phases[k], p, { move: p.move + (st.shift ?? 0) }, st.phases?.[k] ?? {}));
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
    const len = ms.map((x) => x.minutes).sort((a, b) => a - b), at = (q: number): string => len[Math.round(q * (len.length - 1))].toFixed(2);
    console.log(`== ${vr.name} ${JSON.stringify({ ...vr.tune, ...vr.style, ...vr.kit, ...vr.storm })}  match ${mean(len).toFixed(2)} min, tick ${tick.toFixed(3)} ms`);
    const died = (storm: boolean): string => Array.from({ length: 12 }, (_, k) => (rows.filter((r) => r.fate >= 0 && (r.fate === 5) === storm && Math.min(11, Math.floor(r.at)) === k).length / n).toFixed(2)).join(' ');
    console.log(`match min/q1/median/q3/max ${[0, 0.25, 0.5, 0.75, 1].map(at).join('/')} min, ${len.filter((x) => x >= 9 && x <= 11).length} of ${n} in 9–11 (short: ${ms.filter((x) => x.minutes < 9).map((x) => `${x.m} ${x.minutes.toFixed(1)}`).join(', ')}); sunk a match by minute 0…11, by the storm ${died(true)}, else ${died(false)}; the last to fall sunk by the storm in ${ms.filter((x) => x.rows.filter((r) => r.fate >= 0).sort((a, b) => a.at - b.at).at(-1)?.fate === 5).length}`);
    p.forEach((x, t) => {
      const mine = rows.filter((r) => r.temperament === t), km = KILL_MODES.map((k) => mean(mine.map((r) => r.kmode[k])).toFixed(2));
      console.log(`${NAMES[t].padEnd(11)} ${SPEC.map((f) => x.mean[f].toFixed(f === 'sea' || f === 'loot' ? 0 : 2).padStart(6)).join('')}  k ${km.join('/')}`);
      if (process.argv.includes('--detail')) {
        const sum = (f: 'kmode' | 'kvict' | 'causes' | 'dmode' | 'tmode'): string => { const v = mine[0][f].map((_, k) => mean(mine.map((r) => r[f][k]))), all = v.reduce((a, y) => a + y, 0) || 1; return v.map((y) => (f === 'kmode' || f === 'kvict' || f === 'causes' ? y : y / all).toFixed(2)).join(' '); };
        const fate = [0, 1, 2, 3, 4, 5].map((c) => mine.filter((r) => r.fate === c).length / mine.length), sank = mine.filter((r) => r.fate >= 0);
        console.log(`   sunk by gun/ram/fire/rocks/hot/storm ${fate.map((y) => y.toFixed(2)).join(' ')}, at ${mean(sank.map((r) => r.at)).toFixed(2)} min (quartiles ${[0.25, 0.5, 0.75].map((q) => sank.map((r) => r.at).sort((a, b) => a - b)[Math.floor(q * sank.length)]?.toFixed(1)).join(' ')})`);
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
