// The fairness report's numbers (MANAGER.md 6), read from a batch of whole
// careers the fleet sailed (tools/fleet: `run career`), and written as
// Markdown:
//   node tools/career/fairness.ts <results folder> [out.md]
// Each file of the folder is one career's job (tools/fleet/job.ts): its report
// (sail.ts Report) under `result`. What is measured here is what the careers
// came to; nothing is rolled or assumed. A claim the batch cannot speak to is
// said so in the report's own words (docs/fairness/README.md).
//
// Node only (tools/).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { MANAGERS, type Manager } from './managers.ts';
import type { Report } from './sail.ts';
import type { Season, TeamSeason } from './tally.ts';

type Career = Omit<Report, 'wall' | 'records'> & {
  records: (Omit<Season, 'wall'> & { wall: { races: number } })[];
};

const [folder, out] = process.argv.slice(2);
if (!folder) throw new Error('a results folder');

const careers: Career[] = readdirSync(folder)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${folder}/${f}`, 'utf8')).result)
  .filter((r): r is Career => Array.isArray(r?.records));

const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);
/** The value a share of the way up a list (0.5 the median). */
function at(xs: readonly number[], share: number): number {
  const v = sorted(xs);
  if (v.length === 0) return NaN;
  const i = (v.length - 1) * share,
    lo = Math.floor(i);
  return (v[lo] ?? 0) + ((v[Math.ceil(i)] ?? 0) - (v[lo] ?? 0)) * (i - lo);
}
const mean = (xs: readonly number[]) =>
  xs.length === 0 ? NaN : xs.reduce((a, b) => a + b, 0) / xs.length;
const fixed = (x: number, digits = 1) =>
  Number.isFinite(x) ? x.toFixed(digits) : '-';
/** A list as its median and the middle half: "12 (9-15)". */
const spread = (xs: readonly number[], digits = 0) =>
  `${fixed(at(xs, 0.5), digits)} (${fixed(at(xs, 0.25), digits)}-${fixed(at(xs, 0.75), digits)})`;
/** How two lists go together, -1 to 1 (Pearson). */
function together(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs),
    my = mean(ys);
  let top = 0,
    a = 0,
    b = 0;
  xs.forEach((x, i) => {
    const y = ys[i] ?? my;
    top += (x - mx) * (y - my);
    a += (x - mx) ** 2;
    b += (y - my) ** 2;
  });
  return a > 0 && b > 0 ? top / Math.sqrt(a * b) : NaN;
}

const lines: string[] = [];
const say = (...text: string[]) => lines.push(...text);
const table = (head: readonly string[], rows: readonly (readonly string[])[]) =>
  say(
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.join(' | ')} |`),
    ''
  );

const of = (m: Manager) => careers.filter((c) => c.manager === m);
const seasons = Math.max(0, ...careers.map((c) => c.records.length));

say(
  '# The careers sailed',
  '',
  `${careers.length} careers (${MANAGERS.map((m) => `${of(m).length} ${m}`).join(', ')}), ` +
    `up to ${seasons} seasons each, tuning ${[...new Set(careers.map((c) => c.tuning))].join(', ')}; ` +
    `${careers.filter((c) => c.ended).length} stopped early.`,
  ''
);

// ---- the bands (MANAGER.md 4): where each scripted manager's team lands
say(
  '## The three managers',
  '',
  'Her team’s championship (1 the first) and its place in it at each season’s end: the median, and the middle half.',
  ''
);
table(
  ['Manager', ...Array.from({ length: seasons }, (_, i) => `Season ${i + 1}`)],
  MANAGERS.map((m) => [
    m,
    ...Array.from({ length: seasons }, (_, i) => {
      const here = of(m).flatMap((c) => (c.records[i] ? [c.records[i]] : []));
      return here.length === 0
        ? '-'
        : `C${fixed(mean(here.map((r) => r.player.tier + 1)))} · ${spread(here.map((r) => r.player.place))}`;
    }),
  ])
);
/** The first season (from 1) a career's team sailed a higher championship than it began in, or null. */
const promoted = (c: Career): number | null => {
  const from = c.records[0]?.player.tier ?? 0;
  const i = c.records.findIndex((r) => r.player.tier < from);
  if (i >= 0) return i;
  const last = c.records[c.records.length - 1];
  const next = last?.teams.find((t) => t.team === last.player.team)?.next;
  return next !== null && next !== undefined && next < from
    ? c.records.length
    : null;
};
table(
  [
    'Manager',
    'Sacked in a season',
    'Promoted within the run',
    'Seasons to promotion',
    'Balance at the end',
  ],
  MANAGERS.map((m) => {
    const all = of(m),
      ups = all.flatMap((c) => {
        const p = promoted(c);
        return p === null ? [] : [p];
      });
    return [
      m,
      `${all.filter((c) => c.records.some((r) => r.player.sacked)).length} of ${all.length}`,
      `${ups.length} of ${all.length}`,
      ups.length ? spread(ups) : '-',
      spread(
        all.flatMap((c) => {
          const b = c.records[c.records.length - 1]?.player.balance;
          return b === null || b === undefined ? [] : [b];
        })
      ),
    ];
  })
);

// ---- every rival team's season, of every career: the claims read from them
const rivals: TeamSeason[] = careers.flatMap((c) =>
  c.records.flatMap((r) => r.teams.filter((t) => !t.player))
);
/** The championships, told apart in every table: points are alike in scale only within one. */
const tiers = [0, 1, 2];

say(
  '## 3. No seat advantage',
  '',
  `${rivals.length} rival team-seasons. A team’s slot on its grid against its points, by championship (how they go together, −1 to 1), and the mean points of the front half of the grid and the back half.`,
  ''
);
table(
  ['Championship', 'Slot and points', 'Slots 1-10', 'Slots 11-20'],
  tiers.map((tier) => {
    const t = rivals.filter((x) => x.tier === tier);
    return [
      String(tier + 1),
      fixed(
        together(
          t.map((x) => x.slot),
          t.map((x) => x.points)
        ),
        3
      ),
      fixed(mean(t.filter((x) => x.slot < 10).map((x) => x.points))),
      fixed(mean(t.filter((x) => x.slot >= 10).map((x) => x.points))),
    ];
  })
);

/** Team-seasons of a championship in four groups by `key`, least first: each group's mean points. */
function quartiles(tier: number, key: (t: TeamSeason) => number): string[] {
  const t = rivals
    .filter((x) => x.tier === tier)
    .sort((a, b) => key(a) - key(b));
  return [0, 1, 2, 3].map((q) =>
    fixed(
      mean(
        t
          .slice(
            Math.floor((q * t.length) / 4),
            Math.floor(((q + 1) * t.length) / 4)
          )
          .map((x) => x.points)
      )
    )
  );
}
const QUARTERS = ['Lowest quarter', 'Second', 'Third', 'Highest quarter'];
const byQuarter = (title: string, key: (t: TeamSeason) => number) => {
  say(`${title}: mean points of the team-seasons in each quarter.`, '');
  table(
    ['Championship', ...QUARTERS],
    tiers.map((tier) => [String(tier + 1), ...quartiles(tier, key)])
  );
};

say('## 4. Strength pays', '');
byQuarter('By the drivers’ stars', (t) => t.strength.drivers);
byQuarter('By the fitted parts’ performance', (t) => t.strength.perf);

say('## 5. Decisions pay', '');
byQuarter('By the buildings’ levels', (t) => t.strength.buildings);
byQuarter('By the wages paid a race', (t) => t.strength.wages);
byQuarter('By the fitted parts’ risk', (t) => t.strength.risk);

say(
  '## 7. The economy holds',
  '',
  'A rival team’s balance over a season (its end less its start), and the leader’s lead over the second at the season’s end, by championship: the median, and the middle half.',
  ''
);
table(
  ['Championship', 'Balance over a season', 'Balance at the end', 'Lead'],
  tiers.map((tier) => {
    const t = rivals.filter((x) => x.tier === tier && x.balance.end !== null);
    return [
      String(tier + 1),
      spread(t.map((x) => (x.balance.end ?? 0) - x.balance.start)),
      spread(t.map((x) => x.balance.end ?? 0)),
      spread(
        careers.flatMap((c) =>
          c.records.flatMap((r) =>
            r.tiers.filter((x) => x.tier === tier).map((x) => x.lead)
          )
        )
      ),
    ];
  })
);

say('## What the managers were refused', '');
table(
  ['Manager', 'Refusals a career (the commonest)'],
  MANAGERS.map((m) => {
    const sums = new Map<string, number>();
    for (const c of of(m))
      for (const [k, n] of Object.entries(c.refused))
        sums.set(k, (sums.get(k) ?? 0) + n);
    return [
      m,
      [...sums]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([k, n]) => `${k} ${fixed(n / Math.max(1, of(m).length))}`)
        .join(', ') || '-',
    ];
  })
);

const text = `${lines.join('\n')}\n`;
if (out) writeFileSync(out, text);
else process.stdout.write(text);
