import type { Summary } from './match.ts';

const pc = (x: number | null) => (x === null ? '-' : `${Math.round(100 * x)}%`);
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 0;
};

const parts = (s: Summary) =>
  Object.entries(s.cost.parts)
    .filter(([k]) => k !== 'step')
    .sort((a, b) => b[1].mean - a[1].mean)
    .map(([k, c]) => `${k} ${c.mean}`)
    .join(' · ');

export function printMatch(s: Summary, dir: string) {
  const sc = s.scenario,
    win = s.placements.filter((p) => p.place === 1);
  const fleet = sc.race
    ? `race of ${sc.race.teams}×${sc.race.ships}`
    : `${s.placements.length} ships, brains ${(sc.brains ?? ['default']).join(',')}`;
  const c = s.combat;
  console.log(
    `match ${sc.match ?? 1} on planet ${sc.planet ?? 'default'} · ${s.type} · ${fleet} · ${sc.sea ?? 'flat'} sea · seed ${s.seed}`
  );
  console.log(
    `ended: ${s.end} at ${s.seconds} s (${s.steps} steps, ${(s.wallMs / 1000).toFixed(1)} s wall) · hash ${s.hash}`
  );
  console.log(
    `left: ${win.map((p) => `#${p.id} (${p.brain}, ${p.persona}, ${p.kills} kills)`).join(', ') || 'none'}`
  );
  console.log(
    `combat: ${c.shots} shots, ${c.hits} home (${pc(c.hitRate)}) · ` +
      Object.entries(c.byRange)
        .map(([b, k]) => `${b} ${pc(k.rate)} of ${k.shots}`)
        .join(' · ')
  );
  console.log(
    `  by gun: ` +
      Object.entries(c.byGun)
        .map(
          ([g, k]) =>
            `${g} ${pc(k.rate)} of ${k.shots}, ${Math.round(k.dealt)} dealt`
        )
        .join(' · ')
  );
  console.log(
    `  ttk median ${c.ttk.median ?? '-'} s over ${c.ttk.kills} kills · dps median ${c.dps.median ?? '-'} · quiet ${c.quiet} s, lull ${c.lull} s · sunk by ${
      Object.entries(c.causes)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ') || 'none'
    }`
  );
  const l = s.loot;
  console.log(
    `loot: ${l.start} at the start (${l.shallow} too shoal), ${l.taken.first.pieces + l.taken.later.pieces} taken, ${l.end} left`
  );
  const m = s.movement;
  console.log(
    `movement: ${m.pinned} ship-seconds pinned, ${m.aground} aground${m.worst.length ? ` · worst ${m.worst.map((w) => `#${w.id} ${w.pinned} s`).join(', ')}` : ''}`
  );
  const step = s.cost.parts.step;
  console.log(
    `cost: ${step.mean} ms a step (median ${step.median}, p95 ${step.p95}, worst ${step.worst}) · ${parts(s)}`
  );
  const inv = s.invariants;
  console.log(
    inv.broken
      ? `INVARIANTS: ${inv.broken} broken · first: ${inv.first
          .slice(0, 3)
          .map(
            (b) =>
              `${b.what} ${b.ship === null ? '' : `#${b.ship} `}at ${b.t} s (${b.detail})`
          )
          .join('; ')} · all in events.jsonl (type "invariant")`
      : 'invariants: none broken'
  );
  console.log(
    `→ ${dir}  (summary.json; events.jsonl; ships.jsonl, each ship each second)`
  );
}

export function pooled(all: readonly Summary[]) {
  const ships = all.flatMap((s) => s.placements);
  const group = (key: (p: (typeof ships)[number]) => string) => {
    const by = new Map<string, typeof ships>();
    for (const p of ships) by.set(key(p), [...(by.get(key(p)) ?? []), p]);
    return Object.fromEntries(
      [...by].map(([k, ps]) => [
        k,
        {
          ships: ps.length,
          wins: ps.filter((p) => p.place === 1).length,
          place: r2(mean(ps.map((p) => p.place))),
          kills: r2(mean(ps.map((p) => p.kills))),
          dealt: r2(mean(ps.map((p) => p.dealt))),
          taken: r2(mean(ps.map((p) => p.taken))),
          hitRate: r2(
            ps.reduce((n, p) => n + p.hits, 0) /
              Math.max(
                1,
                ps.reduce((n, p) => n + p.shots, 0)
              )
          ),
          pinned: r2(mean(ps.map((p) => p.pinned))),
        },
      ])
    );
  };
  const shots = all.reduce((n, s) => n + s.combat.shots, 0),
    hits = all.reduce((n, s) => n + s.combat.hits, 0);
  const band = (b: string) => {
    const k = all.map((s) => s.combat.byRange[b] ?? { shots: 0, hits: 0 });
    const sh = k.reduce((n, x) => n + x.shots, 0);
    return {
      shots: sh,
      rate: sh ? r2(k.reduce((n, x) => n + x.hits, 0) / sh) : null,
    };
  };
  return {
    matches: all.length,
    seconds: {
      median: median(all.map((s) => s.seconds)),
      mean: r2(mean(all.map((s) => s.seconds))),
    },
    ends: Object.fromEntries(
      [...new Set(all.map((s) => s.end))].map((e) => [
        e,
        all.filter((s) => s.end === e).length,
      ])
    ),
    hitRate: shots ? r2(hits / shots) : null,
    byRange: { close: band('close'), mid: band('mid'), far: band('far') },
    ttk: median(all.flatMap((s) => s.combat.ttk.each.map((k) => k.seconds))),
    msPerStep: r2(mean(all.map((s) => s.cost.parts.step.mean))),
    invariants: all.reduce((n, s) => n + s.invariants.broken, 0),
    byBrain: group((p) => p.brain),
    byPersona: group((p) => p.persona),
    hashes: all.map((s) => ({ match: s.scenario.match, hash: s.hash })),
  };
}

export function printPooled(p: ReturnType<typeof pooled>, dir: string) {
  console.log(
    `pooled over ${p.matches} matches: median ${p.seconds.median} s · ends ${JSON.stringify(p.ends)}`
  );
  console.log(
    `combat: ${pc(p.hitRate)} home · ${Object.entries(p.byRange)
      .map(([b, k]) => `${b} ${pc(k.rate)} of ${k.shots}`)
      .join(' · ')} · ttk median ${p.ttk} s`
  );
  for (const [title, rows] of [
    ['brain', p.byBrain],
    ['persona', p.byPersona],
  ] as const) {
    console.log(
      `by ${title}:  ships  wins  place  kills  dealt  taken  hit%  pinned s`
    );
    for (const [k, r] of Object.entries(rows))
      console.log(
        `  ${k.padEnd(12)} ${String(r.ships).padStart(5)} ${String(r.wins).padStart(5)} ${String(r.place).padStart(6)} ${String(r.kills).padStart(6)} ${String(r.dealt).padStart(6)} ${String(r.taken).padStart(6)} ${pc(r.hitRate).padStart(5)} ${String(r.pinned).padStart(8)}`
      );
  }
  console.log(
    `cost: ${p.msPerStep} ms a step · invariants: ${p.invariants ? `${p.invariants} BROKEN` : 'none broken'}`
  );
  console.log(
    `→ ${dir}  (pooled.json; run-*/ each a match's summary.json, events.jsonl, ships.jsonl)`
  );
}
