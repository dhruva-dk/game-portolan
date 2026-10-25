// Acceptance check 3 (PROMPT.md, Captains): in a headless tournament of 200 seeded matches (tests/tools/tournament.ts,
// on worker_threads),
//   - each of the six temperaments shows a clearly distinct profile of sea claimed, trails broken, ships sunk, loot
//     taken and finishing place, and hunters lead in ships sunk;
//   - higher-ranked captains finish ahead of lower-ranked captains by a clear, stated margin;
//   - a scripted player that always breaks off into one region and draws large loops is measurably countered within
//     five matches, and the counter fades within five matches after the script changes its habits.
// The stated margins are MARGIN's. The numbers are recorded in progress/checks/check3.json before anything is asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NAMES, habitRegions, mean, placesByTier, pool, profiles, sd, table, tournament, welch, type CareerMatch, type Measure } from '../tools/tournament.ts';

const SPEC = ['sea', 'broken', 'sunk', 'loot', 'place'] as const;
/** The stated margins. */
export const MARGIN = {
  /** Every pair of temperaments differs in at least one of the five stats by Welch |t| ≥ pairT, and their profiles (each stat over its spread across the six) lie ≥ spread apart. */
  pairT: 4, spread: 0.5,
  /** Hunters' ships sunk a captain exceed every other temperament's by Welch t ≥ huntT. */
  huntT: 2,
  /** Captains of tiers 6–8 finish at least `places` places ahead of tiers 1–3, at Welch t ≥ rankT. */
  places: 1, rankT: 6,
  /** Scripted player: countered once at least `on` more captains (mean over the careers) break off into its region than naive captains on the same seeds and fleets; faded once the excess stays ≤ `off`; each within `within` matches. */
  on: 0.5, off: 0.25, within: 5,
} as const;
const CAREERS = 10, MATCHES = 10, CHANGE = 5;

test('check 3: captains — 200 matches, six distinct temperaments, rank margin, the player countered and the counter fading', { timeout: 1_200_000 }, async (t) => {
  const run = await tournament(200), p = profiles(run.rows);
  t.diagnostic(`200 matches: ${run.wall.toFixed(1)} s wall, ${run.workerSeconds.toFixed(0)} worker-s, mean match ${run.meanMinutes.toFixed(2)} min`);
  for (const l of table(run.rows)) t.diagnostic(l);

  // Distinct profiles.
  const spread = SPEC.map((f) => Math.max(1e-9, Math.max(...p.map((x) => x.mean[f])) - Math.min(...p.map((x) => x.mean[f]))));
  let nearest = Infinity, nearPair = '', weakest = Infinity, weakPair = '';
  for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) {
    const d = Math.hypot(...SPEC.map((f, k) => (p[a].mean[f] - p[b].mean[f]) / spread[k]));
    const best = Math.max(...SPEC.map((f) => Math.abs(welch(p[a].values[f], p[b].values[f]))));
    if (d < nearest) [nearest, nearPair] = [d, `${NAMES[a]}/${NAMES[b]}`];
    if (best < weakest) [weakest, weakPair] = [best, `${NAMES[a]}/${NAMES[b]}`];
  }
  const huntT = Math.min(...p.slice(1).map((x) => welch(p[0].values.sunk, x.values.sunk)));
  const tiers = placesByTier(run.rows), low = tiers.slice(0, 3).flat(), high = tiers.slice(5).flat();
  const rank = { low: mean(low), high: mean(high), margin: mean(low) - mean(high), t: welch(low, high) };
  t.diagnostic(`nearest profiles ${nearPair} ${nearest.toFixed(2)} spreads; weakest pair ${weakPair} best |t| ${weakest.toFixed(1)}; hunters' sinkings lead t ${huntT.toFixed(2)}`);
  t.diagnostic(`rank: tiers 1–3 place ${rank.low.toFixed(2)}, tiers 6–8 ${rank.high.toFixed(2)}: ${rank.margin.toFixed(2)} places, t ${rank.t.toFixed(1)}`);

  // The scripted player.
  const [ra, rb] = habitRegions();
  const careers = await pool<CareerMatch[]>(Array.from({ length: CAREERS }, (_, k) => ({ kind: 'career' as const, k, a: { region: ra, temperament: 5 }, b: { region: rb, temperament: 3 }, matches: MATCHES, change: CHANGE })));
  const excess = (j: number, f: keyof Measure): number => mean(careers.map((c) => c[j].learn[f] - c[j].naive[f]));
  const follow = Array.from({ length: MATCHES }, (_, j) => excess(j, 'follow'));
  const counteredAt = follow.slice(0, CHANGE).findIndex((x) => x >= MARGIN.on) + 1;
  let fadedAfter = 0;
  for (let j = MATCHES - 1; j >= CHANGE && follow[j] <= MARGIN.off; j--) fadedAfter = j - CHANGE + 1;
  const perMatch = follow.map((x, j) => ({
    match: j + 1, follow: x, near: excess(j, 'near'), reach: excess(j, 'reach'), broken: excess(j, 'broken'),
    knewRegion: mean(careers.map((c) => c[j].knewRegion)), knewLoop: mean(careers.map((c) => c[j].knewLoop)), learnt: mean(careers.map((c) => c[j].learnt)),
  }));
  for (const m of perMatch) t.diagnostic(`career match ${m.match}: +${m.follow.toFixed(2)} follow into region ${ra}, near ${m.near.toFixed(2)}, hunters' reach ${m.reach.toFixed(1)} u, knew region ${m.knewRegion.toFixed(1)}, knew loops ${m.knewLoop.toFixed(1)}, learnt in play ${m.learnt.toFixed(1)}`);
  t.diagnostic(`countered at match ${counteredAt || 'never'}; faded ${fadedAfter || 'never'} matches after the change`);

  const record = {
    date: new Date().toISOString().slice(0, 10), matches: 200, wall: run.wall, workerSeconds: run.workerSeconds, meanMinutes: run.meanMinutes, margins: MARGIN,
    profiles: Object.fromEntries(p.map((x, k) => [NAMES[k], { ships: x.n, mean: x.mean, sd: x.sd }])),
    distinct: { nearest, nearPair, weakest, weakPair }, huntT, rank, placeByTier: tiers.map((x) => mean(x)), placeSdByTier: tiers.map((x) => sd(x)),
    scripted: { careers: CAREERS, habits: { first: { region: ra, loops: 'gambler' }, then: { region: rb, loops: 'turtle' } }, change: CHANGE, perMatch, counteredAt, fadedAfter },
  };
  mkdirSync('progress/checks', { recursive: true });
  writeFileSync('progress/checks/check3.json', `${JSON.stringify(record, null, 1)}\n`);

  assert.ok(nearest >= MARGIN.spread, `${nearPair} profiles too alike (${nearest.toFixed(2)} spreads)`);
  assert.ok(weakest >= MARGIN.pairT, `${weakPair} differ in no stat at |t| ≥ ${MARGIN.pairT} (${weakest.toFixed(1)})`);
  assert.ok(huntT >= MARGIN.huntT, `hunters do not lead ships sunk by t ≥ ${MARGIN.huntT} (${huntT.toFixed(2)})`);
  assert.ok(rank.margin >= MARGIN.places && rank.t >= MARGIN.rankT, `rank margin ${rank.margin.toFixed(2)} places, t ${rank.t.toFixed(1)}`);
  assert.ok(counteredAt >= 1 && counteredAt <= MARGIN.within, `not countered within ${MARGIN.within} matches (${follow.map((x) => x.toFixed(2)).join(' ')})`);
  assert.ok(fadedAfter >= 1 && fadedAfter <= MARGIN.within, `the counter did not fade within ${MARGIN.within} matches (${follow.map((x) => x.toFixed(2)).join(' ')})`);
});
