// Profiles as data: what a device's console says about a run (tools/ios.ts --profile), and how one run compares with
// another. Every kind of run (the device's, the headless fight's and perf's) comes down to the same flat table of
// metrics, lower is better, which `diff` compares against a committed baseline.
//
//   node tools/profile.ts diff <baseline.json> <run.json> [--tolerance 0.1] [--strict]
//
// With --strict a run that is worse than the baseline by more than the tolerance (and by more than the noise floor)
// exits 1.
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

/** One perf window as the app prints it (`perfjson …`, src/app/app.ts logPerf). */
export interface PerfWindow {
  screen: string;
  region: string | null;
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  worst: number;
  cpu: number;
  tick: number;
  gpu: number;
  systems: Record<string, number>;
  passes: number;
  submits: number;
  mb: number;
  [k: string]: unknown;
}

export interface DeviceProfile {
  kind: 'device';
  device: string;
  at: string;
  /** Seconds each step of the tool took: build, install, launch, first output, first perf window. */
  steps: Record<string, number>;
  /** Seconds each boot step took, and when the boot ended (`ready at`). */
  boot: Record<string, number>;
  /** Seconds each preparation job took. */
  prepare: Record<string, number>;
  windows: PerfWindow[];
  errors: string[];
}

const BOOT = /\bboot (.+?): ([\d.]+) s \(at ([\d.]+) s\)/;
const RENDERER = /\bboot renderer ([\d.]+) s, stage built ([\d.]+) s/;
const PREPARE = /\bprepare (.+?): ([\d.]+) s\s*$/;
const WINDOW = /\bperfjson (\{.*\})\s*$/;
const ERROR = /\[error\]|WebView process terminated|Unhandled|TypeError|device lost/i;

/** Reads what the device printed into a profile (the tool fills in `steps`). */
export function parseConsole(lines: readonly string[], device = ''): DeviceProfile {
  const p: DeviceProfile = { kind: 'device', device, at: new Date().toISOString(), steps: {}, boot: {}, prepare: {}, windows: [], errors: [] };
  for (const line of lines) {
    let m: RegExpExecArray | null;
    if ((m = WINDOW.exec(line))) {
      try { p.windows.push(JSON.parse(m[1]) as PerfWindow); } catch { p.errors.push(`unreadable perf window: ${line.slice(0, 200)}`); }
    } else if ((m = RENDERER.exec(line))) {
      p.boot.renderer = +m[1];
      p.boot.stage = +m[2];
    } else if ((m = BOOT.exec(line))) {
      p.boot[m[1]] = +m[2];
      p.boot['ready at'] = Math.max(p.boot['ready at'] ?? 0, +m[3]);
    } else if ((m = PREPARE.exec(line))) {
      p.prepare[m[1]] = +m[2];
    } else if (ERROR.test(line)) {
      p.errors.push(line.slice(0, 300));
    }
  }
  return p;
}

const median = (xs: number[]): number => {
  const s = xs.filter((x) => Number.isFinite(x) && x >= 0).sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : NaN;
};

/** Any run as flat metrics, lower is better: milliseconds end in `ms`, seconds in ` s`, the rest are counts. */
export function metrics(run: unknown): Record<string, number> {
  const r = run as Record<string, unknown>, out: Record<string, number> = {};
  if (r.kind === 'device') {
    const p = run as DeviceProfile;
    const screens = new Set(p.windows.map((w) => w.screen));
    for (const s of screens) {
      // the first window of a screen carries its arrival (preparation, a camera flight): steady state is the rest
      const all = p.windows.filter((w) => w.screen === s), ws = all.length > 1 ? all.slice(1) : all;
      out[`${s} p50 ms`] = median(ws.map((w) => w.p50));
      out[`${s} p95 ms`] = median(ws.map((w) => w.p95));
      out[`${s} worst ms`] = Math.max(...ws.map((w) => w.worst));
      out[`${s} cpu ms`] = median(ws.map((w) => w.cpu));
      out[`${s} gpu ms`] = median(ws.map((w) => w.gpu));
      for (const sys of new Set(ws.flatMap((w) => Object.keys(w.systems ?? {})))) {
        out[`${s} gpu ${sys} ms`] = median(ws.map((w) => w.systems?.[sys] ?? 0));
      }
      out[`${s} passes`] = median(ws.map((w) => w.passes));
      out[`${s} submits`] = median(ws.map((w) => w.submits));
      out[`${s} memory MB`] = Math.max(...ws.map((w) => w.mb));
    }
    if (p.boot['ready at'] !== undefined) out['boot ready s'] = p.boot['ready at'];
    for (const [k, v] of Object.entries(p.prepare)) out[`prepare ${k} s`] = v;
    out.errors = p.errors.length;
  } else if (r.kind === 'prepare') {
    // tools/capture/prepare.ts: pipelines built after preparation finished
    for (const row of r.rows as { screen: string; render: number; compute: number; shaders: number }[]) {
      out[`${row.screen} missed render pipelines`] = row.render;
      out[`${row.screen} missed compute pipelines`] = row.compute;
      out[`${row.screen} missed shaders`] = row.shaders;
    }
  } else if (typeof r.total === 'number' && r.systems) {
    // tools/capture/fight.ts
    out['fight gpu ms'] = r.total;
    for (const [k, v] of Object.entries(r.systems as Record<string, { gpu: number }>)) out[`fight gpu ${k} ms`] = v.gpu;
    const cpu = r.cpu as { frameMs: number; p95Ms: number; calls: number } | undefined;
    if (cpu) {
      out['fight cpu ms'] = cpu.frameMs;
      out['fight cpu p95 ms'] = cpu.p95Ms;
      out['fight calls'] = cpu.calls;
    }
  } else if (Array.isArray(r.rows)) {
    // tools/capture/perf.ts
    for (const row of r.rows as Record<string, number | string>[]) {
      out[`${row.region} frame ms`] = +row.frameMs;
      out[`${row.region} p95 ms`] = +row.p95Ms;
      if (row.calls !== undefined) out[`${row.region} calls`] = +row.calls;
    }
  } else throw new Error('profile: not a device profile, a fight or a perf run');
  for (const k of Object.keys(out)) if (!Number.isFinite(out[k])) delete out[k];
  return out;
}

export interface Change {
  metric: string;
  base: number | null;
  run: number | null;
  /** run / base − 1; null when either side is missing. */
  change: number | null;
  worse: boolean;
}

/** The noise floor under which a change is not called worse, by unit. */
const FLOOR = { ms: 0.3, s: 0.25, MB: 8, count: 0 };

/** Each metric of `run` against `base`; a metric is worse past `tolerance` and past its unit's noise floor. */
export function diff(base: Record<string, number>, run: Record<string, number>, tolerance = 0.1): Change[] {
  const keys = [...new Set([...Object.keys(base), ...Object.keys(run)])].sort();
  return keys.map((metric) => {
    const b = base[metric] ?? null, n = run[metric] ?? null;
    if (b === null || n === null) return { metric, base: b, run: n, change: null, worse: false };
    const floor = metric.endsWith(' ms') ? FLOOR.ms : metric.endsWith(' s') ? FLOOR.s : metric.endsWith(' MB') ? FLOOR.MB : FLOOR.count;
    const change = b === 0 ? (n === 0 ? 0 : Infinity) : n / b - 1;
    return { metric, base: b, run: n, change, worse: n - b > floor && change > tolerance };
  });
}

export function formatDiff(changes: readonly Change[]): string {
  const f = (x: number | null) => (x === null ? '—' : String(+x.toFixed(2)));
  const w = Math.max(6, ...changes.map((c) => c.metric.length));
  const lines = [`${'metric'.padEnd(w)}  ${'base'.padStart(9)}  ${'run'.padStart(9)}  change`];
  for (const c of changes) {
    const pct = c.change === null ? '' : c.change === Infinity ? 'new' : `${c.change >= 0 ? '+' : ''}${(c.change * 100).toFixed(0)}%`;
    lines.push(`${c.metric.padEnd(w)}  ${f(c.base).padStart(9)}  ${f(c.run).padStart(9)}  ${pct}${c.worse ? '  WORSE' : ''}`);
  }
  return lines.join('\n');
}

if (import.meta.main) {
  const { values: a, positionals } = parseArgs({
    allowPositionals: true,
    options: { tolerance: { type: 'string', default: '0.1' }, strict: { type: 'boolean', default: false } },
  });
  const [command, basePath, runPath] = positionals;
  if (command !== 'diff' || !basePath || !runPath) {
    console.log('usage: node tools/profile.ts diff <baseline.json> <run.json> [--tolerance 0.1] [--strict]');
    process.exit(2);
  }
  const read = (p: string) => metrics(JSON.parse(readFileSync(p, 'utf8')));
  const changes = diff(read(basePath), read(runPath), Number(a.tolerance));
  console.log(formatDiff(changes));
  const worse = changes.filter((c) => c.worse);
  console.log(worse.length ? `\n${worse.length} metric(s) worse than the baseline` : '\nno metric worse than the baseline');
  if (a.strict && worse.length) process.exit(1);
}
