// The harness's report (PLAN section 5): bots' matches run on every planet of
// the pool (planets.ts), several each, and measured (pooled.ts) planet by
// planet, each set pooled, and each set's worst planet; set down as one page,
// nothing fetched, a table per metric, each planet linking a replay of its
// first match (replay.ts) written beside it.
//   node tools/harness/report.ts [--pool all|tune|held] [--matches 16] [--from 1]
//     [--workers n] [--out .cache/harness/report] [--results file.jsonl]
//     [--save tools/harness/baseline.json] [--against tools/harness/baseline.json]
//     [--no-replays]
// --results: measure a run already made (its JSONL: cli.ts --pool, or this
// one's results.jsonl) instead of running; --save: the figures as a baseline;
// --against: each figure's change from a baseline, with its standard error, the
// gated ones (damage, lull, distinctness, comebacks) on the held-out set and its worst
// planet flagged where they fell by more than two. 16 matches a planet (the
// baseline's) run in some four and a half minutes on ten cores, replays and
// all: as many as keep a worst planet's lull to an se of some ten seconds.
//
// Node only (tools/).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { KEPT, PLANETS, planetsOf, poolSpecs, type Kept } from './planets.ts';
import {
  METRICS,
  measured,
  type Measure,
  type Measured,
  type Metric,
} from './pooled.ts';
import { CORES, runPool, runReplays } from './pool.ts';
import type { Result } from './run.ts';

/** A baseline: what was run, and its figures. */
export interface Baseline {
  matches: number;
  from: number;
  planets: typeof PLANETS;
  measured: Measured;
}

const fmt = (x: number, digits: number) =>
  Number.isFinite(x) ? x.toFixed(digits) : '–';
const pm = (m: Measure, digits: number) =>
  `${fmt(m.v, digits)} ± ${fmt(m.se, digits)}`;
const esc = (s: string) =>
  s.replace(
    /[&<>"]/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot' }[c]};`
  );

/**
 * Figures to six significant places, for a baseline kept small (a run of it
 * again, measured against it, changes by nothing shown); NaN as null (JSON's
 * way).
 */
const rounded = (m: Measured): Measured =>
  JSON.parse(
    JSON.stringify(m, (_, v) =>
      typeof v === 'number' && !Number.isInteger(v)
        ? Number.isFinite(v)
          ? Number(v.toPrecision(6))
          : null
        : v
    )
  );
/** A figure read back from JSON (null: NaN). */
const back = (m: Measure | undefined): Measure => ({
  v: m?.v ?? NaN,
  se: m?.se ?? NaN,
});

/** The change of `now` from `was`, with its standard error and whether it is worse by over two. */
function change(metric: Metric, now: Measure, was: Measure) {
  const d = now.v - was.v,
    se = Math.hypot(now.se, was.se),
    z = se > 0 ? d / se : 0,
    worse = metric.better === 'up' ? z < -2 : z > 2;
  return `${d >= 0 ? '+' : ''}${fmt(d, metric.digits)} ± ${fmt(se, metric.digits)}${worse ? ' WORSE' : ''}`;
}

/** Lines of each figure's change from a baseline: each set pooled, and its worst planet. */
export function against(now: Measured, base: Baseline): string[] {
  const lines = ['against the baseline (* gated; WORSE: by over two se):'];
  for (const m of METRICS) {
    const parts: string[] = [];
    for (const k of KEPT) {
      const p = now.pooled[k],
        q = base.measured.pooled[k];
      if (!p || !q) continue;
      parts.push(`${k} ${change(m, p[m.key], back(q[m.key]))}`);
      const w = now.worst[k]?.[m.key],
        v = base.measured.worst[k]?.[m.key];
      if (w && v)
        parts.push(
          `worst ${k} ${change(m, w, back(v))} (${w.planet}${w.planet === v.planet ? '' : `, was ${v.planet}`})`
        );
    }
    lines.push(
      `  ${m.gate ? '*' : ' '} ${m.key.padEnd(9)} ${parts.join('; ')}`
    );
  }
  return lines;
}

/** The figures as lines: each set pooled and its worst planet. */
export function table(m: Measured): string[] {
  const lines = [
    `${'metric'.padEnd(10)}${KEPT.map((k) => `${`${k} pooled`.padEnd(22)}${`worst ${k}`.padEnd(30)}`).join('')}`,
  ];
  for (const x of METRICS)
    lines.push(
      `${x.key.padEnd(10)}${KEPT.map((k) => {
        const p = m.pooled[k]?.[x.key],
          w = m.worst[k]?.[x.key];
        return `${(p ? pm(p, x.digits) : '').padEnd(22)}${(w ? `${pm(w, x.digits)} (${w.planet})` : '').padEnd(30)}`;
      }).join('')}`
    );
  return lines;
}

/** A row of a metric's table: its name, its set, its figure, and its replay. */
interface Row {
  name: string;
  kept: Kept | null;
  m: Measure;
  replay?: string;
  pooled?: boolean;
}

/** A dot for each row with its standard error as a whisker, on one scale from 0. */
function dots(rows: readonly Row[], metric: Metric): string[] {
  const hi =
      Math.max(
        ...rows.map((r) => r.m.v + (Number.isFinite(r.m.se) ? r.m.se : 0)),
        1e-9
      ) * 1.05,
    W = 220,
    H = 22,
    x = (v: number) => 6 + (Math.max(0, v) / hi) * (W - 12);
  return rows.map((r) => {
    const c = r.kept ? `var(--${r.kept})` : 'var(--fg)',
      se = Number.isFinite(r.m.se) ? r.m.se : 0,
      tip = `${r.name}: ${pm(r.m, metric.digits)} ${metric.unit}`;
    return (
      `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(tip)}">` +
      `<line x1="6" x2="${W - 6}" y1="${H / 2}" y2="${H / 2}" class="axis"/>` +
      `<line x1="${x(r.m.v - se)}" x2="${x(r.m.v + se)}" y1="${H / 2}" y2="${H / 2}" stroke="${c}" stroke-width="2"/>` +
      `<circle cx="${x(r.m.v)}" cy="${H / 2}" r="${r.pooled ? 6 : 4.5}" fill="${c}" stroke="var(--panel)" stroke-width="2"><title>${esc(tip)}</title></circle></svg>`
    );
  });
}

/** The report page: what was run, a glance at every figure, then a table per metric. */
export function page(
  m: Measured,
  {
    matches,
    from,
    seconds,
  }: { matches: number; from: number; seconds: number },
  replays: boolean
): string {
  const tag = (k: Kept | null) =>
    k ? `<span class="tag ${k}">${k}</span>` : '';
  const planetName = (p: number) =>
    replays
      ? `<a href="replay-${p}.html" title="replay of match ${from}">${p}</a>`
      : String(p);
  const glance = `<table><thead><tr><th>Planet</th><th>Set</th>${METRICS.map((x) => `<th title="${esc(x.label)}">${x.key}${x.gate ? ' *' : ''}</th>`).join('')}</tr></thead><tbody>
${m.planets.map((p) => `<tr><td>${planetName(p.planet)}</td><td>${tag(p.kept)}</td>${METRICS.map((x) => `<td>${fmt(p.values[x.key].v, x.digits)}</td>`).join('')}</tr>`).join('\n')}
${KEPT.flatMap((k) => (m.pooled[k] ? [`<tr class="pooled"><td>pooled</td><td>${tag(k)}</td>${METRICS.map((x) => `<td>${fmt(m.pooled[k]![x.key].v, x.digits)}</td>`).join('')}</tr>`] : [])).join('\n')}
</tbody></table>`;
  const sections = METRICS.map((x) => {
    const rows: Row[] = [
      ...m.planets.map((p) => ({
        name: String(p.planet),
        kept: p.kept,
        m: p.values[x.key],
        replay: planetName(p.planet),
      })),
      ...KEPT.flatMap((k): Row[] =>
        m.pooled[k]
          ? [
              {
                name: `pooled ${k}`,
                kept: k,
                m: m.pooled[k]![x.key],
                pooled: true,
              },
            ]
          : []
      ),
      ...KEPT.flatMap((k): Row[] => {
        const w = m.worst[k]?.[x.key];
        return w
          ? [{ name: `worst ${k}: ${w.planet}`, kept: k, m: w, pooled: true }]
          : [];
      }),
    ];
    const svg = dots(rows, x);
    return `<section><h2>${esc(x.label)}${x.unit ? ` <span class="unit">(${esc(x.unit)})</span>` : ''}${x.gate ? ' <span class="gate">gated</span>' : ''}</h2>
<p class="note">${x.better === 'up' ? 'Higher' : 'Lower'} is better. The whisker is one standard error.</p>
<table><thead><tr><th>Planet</th><th>Set</th><th class="num">Value ± se</th><th></th></tr></thead><tbody>
${rows.map((r, i) => `<tr${r.pooled ? ' class="pooled"' : ''}><td>${r.replay ?? esc(r.name)}</td><td>${tag(r.kept)}</td><td class="num">${pm(r.m, x.digits)}</td><td>${svg[i]}</td></tr>`).join('\n')}
</tbody></table></section>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harness report</title>
<style>
:root { --bg:#fcfcfb; --panel:#ffffff; --fg:#0b0b0b; --muted:#52514e; --line:#dcdbd6; --tune:#2a78d6; --held:#eb6834; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#1a1a19; --panel:#232322; --fg:#f0efec; --muted:#c3c2b7; --line:#3a3a38; --tune:#3987e5; --held:#d95926; } }
:root[data-theme="dark"] { --bg:#1a1a19; --panel:#232322; --fg:#f0efec; --muted:#c3c2b7; --line:#3a3a38; --tune:#3987e5; --held:#d95926; }
* { box-sizing: border-box; }
body { margin:0; padding:16px; background:var(--bg); color:var(--fg); font:14px/1.45 system-ui, sans-serif; max-width:1100px; }
h1 { font-size:20px; margin:0 0 4px; } h2 { font-size:15px; margin:28px 0 2px; }
.note, .unit { color:var(--muted); } .note { margin:0 0 8px; font-size:13px; }
.wrap { overflow-x:auto; }
table { border-collapse:collapse; font-variant-numeric:tabular-nums; }
th, td { padding:3px 10px 3px 0; text-align:left; border-bottom:1px solid var(--line); white-space:nowrap; }
th { color:var(--muted); font-weight:500; } td.num, th.num { text-align:right; }
tr.pooled td { font-weight:600; }
a { color:inherit; }
.tag { display:inline-block; padding:0 6px; border-radius:4px; font-size:12px; color:#fff; }
.tag.tune { background:var(--tune); } .tag.held { background:var(--held); }
.gate { font-size:12px; font-weight:500; color:var(--muted); border:1px solid var(--line); border-radius:4px; padding:0 5px; }
svg { display:block; } svg .axis { stroke:var(--line); stroke-width:1; }
</style></head><body>
<h1>Harness report</h1>
<p class="note">${matches} match${matches === 1 ? '' : 'es'} a planet (matches ${from} to ${from + matches - 1}), every ship a bot; ${m.planets.length} planets, ${m.planets.reduce((a, p) => a + p.matches, 0)} matches in ${seconds.toFixed(0)} s. Figures of each planet's matches together; se by the jackknife over matches. <span class="tag tune">tune</span> planets are tuned on, <span class="tag held">held</span> never; gated (*) on the held-out set and its worst planet.${replays ? ' Each planet links a replay of its first match.' : ''}</p>
<h2>At a glance</h2>
<div class="wrap">${glance}</div>
${sections.map((s) => `<div class="wrap">${s}</div>`).join('\n')}
</body></html>
`;
}

const readJsonl = (file: string): Result[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

if (import.meta.main) {
  const { values: a } = parseArgs({
    options: {
      pool: { type: 'string', default: 'all' },
      matches: { type: 'string', default: '16' },
      from: { type: 'string', default: '1' },
      workers: { type: 'string', default: String(CORES) },
      out: { type: 'string', default: '.cache/harness/report' },
      results: { type: 'string' },
      save: { type: 'string' },
      against: { type: 'string' },
      'no-replays': { type: 'boolean', default: false },
    },
  });
  const workers = Number(a.workers),
    t = performance.now();
  mkdirSync(a.out, { recursive: true });
  let results: Result[];
  if (a.results) results = readJsonl(a.results);
  else {
    const specs = poolSpecs(planetsOf(a.pool), Number(a.matches), {
      from: Number(a.from),
    });
    console.log(
      `${specs.length} matches on ${Math.min(workers, specs.length)} workers`
    );
    results = await runPool(specs, {
      workers,
      done: (r, n) =>
        console.log(
          `  ${n}/${specs.length} planet ${r.spec.planet} match ${r.spec.match}: ` +
            `${r.left} left at ${r.seconds.toFixed(0)} s, ${r.msPerStep.toFixed(2)} ms a step`
        ),
    });
    const file = join(a.out, 'results.jsonl');
    writeFileSync(
      file,
      results.map((r) => JSON.stringify(r)).join('\n') + '\n'
    );
    console.log(`results in ${file}`);
  }
  const ran = (performance.now() - t) / 1000,
    from = Math.min(...results.map((r) => r.spec.match)),
    matches = new Set(results.map((r) => r.spec.match)).size;
  const m = measured(results);
  console.log(table(m).join('\n'));
  if (!a['no-replays']) {
    // each planet's first match, sailed again in full to be drawn
    const firsts = m.planets.map(
      (p) =>
        results.find(
          (r) => r.spec.planet === p.planet && r.spec.match === from
        )!
    );
    await runReplays(
      firsts.map((r) => ({
        replay: {
          match: r.spec.match,
          brain: r.spec.brains[0],
          seconds: Math.ceil(r.seconds) + 1,
          planet: r.spec.planet,
        },
        out: join(a.out, `replay-${r.spec.planet}.html`),
      })),
      { workers, done: (line) => console.log(`  ${line}`) }
    );
  }
  const file = join(a.out, 'index.html');
  writeFileSync(
    file,
    page(m, { matches, from, seconds: ran }, !a['no-replays'])
  );
  console.log(
    `report in ${file} (${((performance.now() - t) / 1000).toFixed(1)} s)`
  );
  if (a.save) {
    const base: Baseline = {
      matches,
      from,
      planets: PLANETS,
      measured: rounded(m),
    };
    writeFileSync(a.save, JSON.stringify(base, null, 1) + '\n');
    console.log(`baseline in ${a.save}`);
  }
  if (a.against) {
    const base = JSON.parse(readFileSync(a.against, 'utf8')) as Baseline;
    if (base.matches !== matches || base.from !== from)
      console.log(
        `(the baseline ran matches ${base.from} to ${base.from + base.matches - 1} a planet; this, ${from} to ${from + matches - 1})`
      );
    console.log(against(m, base).join('\n'));
  }
}
