// Plays a career for N seasons with no UI (Phase B section 15) and prints the tables: standings, transfers, sackings,
// coin by crew, stars by league, parts' ranks, every mail kind's count and every dilemma's. Results are synthetic
// (tools/synthetic.ts, seeded from each card) unless --real, which sails each race with runRace (slow, for the record).
// A bot plays the player: it sets a plan now and then, answers its dilemmas, takes a post when sacked, and sends a few
// of the random commands the tests send. It asserts the invariants after every race day and reports Advance's time.
// It gates nothing about balance: it exits 1 only on a thrown error or a broken invariant.
//   node tools/season.ts [seasons=2] [--seed=n] [--real]

import { apply, start, type CareerState } from '../src/career/career.ts';
import { raceCards } from '../src/career/card.ts';
import { DILEMMAS } from '../src/career/events.ts';
import { TEMPLATES } from '../src/career/mail.ts';
import { askOf } from '../src/career/market.ts';
import { YEAR, stars } from '../src/career/stars.ts';
import { TUNING } from '../src/career/tuning.ts';
import { standingOf } from '../src/career/elders.ts';
import { staffOf } from '../src/career/state.ts';
import type { Command } from '../src/office.ts';
import type { RaceCard, RaceResult } from '../src/race.ts';
import { SPEC } from '../src/sim/fit.ts';
import { random } from '../src/world/random.ts';
import { FOUND, invariants, someCommand, someOffer, somePlan } from '../tests/career-kit.ts';
import { synthetic } from './synthetic.ts';

const args = process.argv.slice(2);
const seasons = Number(args.find((a) => /^\d+$/.test(a)) ?? 2);
const seed = Number(args.find((a) => a.startsWith('--seed='))?.slice(7) ?? FOUND.seed);
const real = args.includes('--real');
const rand = random(seed ^ 0xb07);

/** A race's result: synthetic, or sailed whole in node. */
async function resultOf(s: CareerState, card: RaceCard): Promise<RaceResult> {
  if (!real) return synthetic(card, 0.4 + rand() * 0.3);
  const [{ runRace }, { createPlanet }, { chart }, { berthing }] = await Promise.all([
    import('../src/play/race.ts'), import('../src/world/planet.ts'), import('../src/sim/route.ts'), import('../src/sim/spawn.ts')]);
  const planet = createPlanet(s.calendar!.rounds[s.round].planet.seed);
  const depth = (p: Parameters<typeof planet.height>[0]) => -planet.height(p);
  return runRace(card, planet, { chart: chart(depth), water: berthing(depth) });
}

let s = start();
const must = (c: Command): void => {
  const r = apply(s, c, { debug: true });
  if (!r.ok) throw new Error(`${c.kind} refused on day ${s.day}: ${r.reason.sentence}`);
  s = r.state;
};
const refusals = new Map<string, number>();
const tryIt = (c: Command): boolean => {
  const r = apply(s, c, { debug: true });
  if (r.ok) s = r.state;
  else refusals.set(`${c.kind}:${r.reason.code}`, (refusals.get(`${c.kind}:${r.reason.code}`) ?? 0) + 1);
  return r.ok;
};
must({ ...FOUND, seed });

const times: number[] = [], ends: number[] = [];
let tabled = -1;
const counts = { sackings: 0, hirings: 0, transfers: 0, forfeits: 0, topped: 0, gaps: 0, wright: 0 };
const coinLog: string[] = [];
const tables: string[] = [];
let managers = s.crews.map((c) => c.staff.manager);
let crewOf = s.gulls.map((g) => g.contract?.crew ?? null);

// A post that changed hands is a sacking only if its manager is left free (not retired, not gone to another crew).
const sacks = { bySeason: [] as number[], midSeason: 0, early: 0, afterOne: 0, afterTwo: 0, moved: 0, retired: 0, expired: 0 };
/** Each crew's seasons in a row finished more than the elder's slack behind its target, as of the last table. */
let poor = s.crews.map(() => 0);

/** The day each crew's manager took the post, and the last season of their contract. */
const tenure = s.crews.map(() => 0);
let leagueAt = s.crews.map((c) => c.league);
let lastSeasonOf = s.crews.map((c) => (c.staff.manager === null ? null : s.gulls[c.staff.manager].contract?.ends ?? null));

/** Managers sacked and hired, and gulls moved between crews, since the last look: after a race day (`ended` false; a
 *  sacking then is an elder's confidence run out) or an Advance that crossed a season's end (the verdicts). */
function tallied(ended = false): void {
  const now = s.crews.map((c) => c.staff.manager);
  now.forEach((m, i) => {
    if (m === managers[i]) return;
    const old = managers[i];
    if (m !== null) counts.hirings += 1;
    if (old === null) return;
    const g = s.gulls[old];
    if (g.retired !== null) sacks.retired += 1;
    else if (ended && lastSeasonOf[i] !== null && lastSeasonOf[i]! < s.season) sacks.expired += 1;
    // poached: hired by a crew a league above (elders poach only upward); the player taking another post, or displacing
    // a manager by taking theirs
    else if ((g.contract !== null && g.contract.crew !== i && (g.player || leagueAt[g.contract.crew] < leagueAt[i])) || (m !== null && s.gulls[m].player)) sacks.moved += 1;
    else {
      counts.sackings += 1;
      const season = ended ? s.season - 1 : s.season;
      sacks.bySeason[season] = (sacks.bySeason[season] ?? 0) + 1;
      if (!ended) sacks.midSeason += 1;
      if (s.day - tenure[i] < YEAR / 2) sacks.early += 1;
      const seasonsPoor = ended ? poor[i] : poor[i] + 1;
      if (seasonsPoor >= 2) sacks.afterTwo += 1;
      else sacks.afterOne += 1;
    }
  });
  now.forEach((m, i) => { if (m !== managers[i]) tenure[i] = s.day; });
  leagueAt = s.crews.map((c) => c.league);
  lastSeasonOf = now.map((m) => (m === null ? null : s.gulls[m].contract?.ends ?? null));
  managers = now;
  const crews = s.gulls.map((g) => g.contract?.crew ?? null);
  crews.forEach((c, i) => { if (c !== null && i < crewOf.length && crewOf[i] !== null && crewOf[i] !== c) counts.transfers += 1; });
  crewOf = crews;
}

const TYPES = ['sails', 'rigging', 'rudder', 'hull', 'keel', 'mounts'] as const;
const BUILDINGS = ['factory', 'drawingLoft', 'testTank', 'foundry', 'sailingSchool', 'flightLoft', 'crowsNest', 'fishMarket', 'landingPad'] as const;

/** What a manager means to do between race days: a design under way when none is (each slot dealt, its first card
 *  taken), a building now and then, and its free scouts sent to free captains. */
function works(): void {
  const c = s.crews[s.player!.crew];
  counts.gaps++;
  if (c.staff.shipwright !== null) counts.wright++;
  // a new part better than ship one's goes on her
  for (const p of c.parts) {
    const on = c.parts.find((x) => x.ship === 0 && x.type === p.type);
    if (p.ship === null && !p.forNext && (!on || p.perf > on.perf)) tryIt({ kind: 'FitPart', part: p.id, ship: 0 });
  }
  // a shipwright's counter is met
  for (const t of s.talks) if (t.crew === c.id && t.counter !== null && s.gulls[t.gull].role === 'shipwright') tryIt({ kind: 'AcceptCounter', gull: t.gull });
  if (c.staff.shipwright === null && !s.talks.some((t) => t.crew === c.id && s.gulls[t.gull].role === 'shipwright')) {
    // the weakest free shipwrights first: they ask least and want a post most
    const pool = s.gulls.filter((g) => g.role === 'shipwright' && g.contract === null && g.retired === null && !g.player && s.day >= g.silentUntil)
      .sort((a, b) => stars(a) - stars(b) || a.id - b.id);
    for (const g of pool.slice(0, 12)) {
      const ask = askOf(s, g, c);
      // a crew past its floor cannot sign: the bot tops it up with DebugCoin to sign one (counted apart from the ledger)
      const short = Math.ceil(s.crews[c.id].debtFloor + ask.fee + ask.wage * 2 - s.crews[c.id].coin);
      if (short > 0 && short <= 1e6 && tryIt({ kind: 'DebugCoin', coin: short })) counts.topped += short;
      if (tryIt({ kind: 'OfferContract', gull: g.id, offer: { role: 'shipwright', status: 'staff', wage: Math.round(ask.wage * 1.5), fee: ask.fee, seasons: ask.seasons,
        podium: 0, sinking: 0, breakClause: null, replaces: null } })) break;
    }
  }
  if (c.design === null && s.crews[c.id].staff.shipwright !== null) {
    const spec = s.leagues[c.league].rules.spec;
    const open = TYPES.filter((t) => !spec.includes(t)).sort(() => rand() - 0.5);
    for (const type of open) {
      for (let slot = 0; slot < 4; slot++) tryIt({ kind: 'DealComponents', type, slot });
      const d = s.crews[c.id].draft;
      if (d && d.type === type && tryIt({ kind: 'StartDesign', type, components: d.deals.map((x) => x.cards[0]), forNext: rand() < 0.2 })) break;
    }
  }
  if (rand() < 0.15) tryIt({ kind: 'Build', building: BUILDINGS[Math.floor(rand() * BUILDINGS.length)] });
  // the market: a low offer to a gull a rival is talking to (they sign with the rival, or lose patience and fall silent)
  const theirs = s.talks.filter((t) => t.crew !== c.id && !s.talks.some((u) => u.crew === c.id && u.gull === t.gull));
  if (theirs.length > 0) {
    const t = theirs[Math.floor(rand() * theirs.length)], o = someOffer(s, t.gull, rand);
    const wright = s.crews[c.id].staff.shipwright;
    if (o.role !== 'shipwright' && (o.replaces === null || o.replaces !== wright)) {
      tryIt({ kind: 'OfferContract', gull: t.gull, offer: { ...o, wage: Math.round(askOf(s, s.gulls[t.gull], s.crews[c.id]).wage * 0.5) } });
    }
  }
  const free =s.gulls.filter((g) => g.role === 'captain' && g.contract === null && g.retired === null && !g.player);
  for (const scout of s.crews[c.id].staff.scouts) if (free.length > 0) tryIt({ kind: 'StartScout', scout, gull: free[Math.floor(rand() * free.length)].id });
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
/** The season's tables, as it ends. */
function seasonTables(): void {
  const me = s.player!.crew;
  const lines = [`season ${s.season + 1}: the player's crew ${s.crews[me].name}, League ${['One', 'Two', 'Three'][s.crews[me].league]}, place ${standingOf(s, me)}, coin ${Math.round(s.crews[me].coin)}`];
  for (const l of s.leagues) {
    const order = [...l.crews].sort((a, b) => standingOf(s, a) - standingOf(s, b));
    const coin = l.crews.map((id) => s.crews[id].coin);
    const st = l.crews.map((id) => staffOf(s.crews[id]).map((g) => stars(s.gulls[g])).reduce((a, b) => a + b, 0) / staffOf(s.crews[id]).length);
    const perf = l.crews.map((id) => s.crews[id].parts.filter((p) => p.ship === 0).reduce((a, p) => a + p.perf, 0) / 6);
    lines.push(`  League ${l.id + 1}: top ${order.slice(0, 3).map((id) => `${s.crews[id].name} (${l.standings.find((x) => x.crew === id)!.points})`).join(', ')};`
      + ` coin median ${Math.round(median(coin))}, least ${Math.round(Math.min(...coin))}; staff stars ${(st.reduce((a, b) => a + b, 0) / st.length).toFixed(2)};`
      + ` ship-one parts' mean ${Math.round(perf.reduce((a, b) => a + b, 0) / perf.length)}`);
  }
  tables.push(...lines);
  poor = s.crews.map((c, i) => (standingOf(s, c.id) - c.target > TUNING.elder.slack ? poor[i] + 1 : 0));
}

const start0 = performance.now();
let lastSeason = s.season;
while (s.season < seasons) {
  if (s.player!.sacked) {
    const best = [...s.player!.offers].sort((a, b) => s.crews[a.crew].league - s.crews[b.crew].league)[0];
    must({ kind: 'TakeJob', crew: best.crew });
    continue;
  }
  const waiting = s.mail.find((m) => m.dilemma && m.dilemma.answer === null);
  if (waiting) {
    const n = waiting.dilemma!.options.length, first = Math.floor(rand() * n);
    for (let k = 0; k < n && !tryIt({ kind: 'AnswerDilemma', mail: waiting.id, option: (first + k) % n }); k++);
  }
  if (s.race !== null) {
    if (rand() < 0.3) tryIt({ kind: 'SetPlan', plan: somePlan(s, rand) });
    must({ kind: 'RaceStarted', round: s.race.round });
    if (rand() < 0.02) {
      must({ kind: 'Forfeit', round: s.race.round });
      counts.forfeits += 1;
    }
    const cards = raceCards(s, SPEC);
    for (const card of cards) must({ kind: 'RecordRace', result: await resultOf(s, card) });
    tallied();
    invariants(s);
    continue;
  }
  works();
  for (let k = 0; k < 4; k++) {
    const c = someCommand(s, rand);
    // the bot keeps its shipwright (it designs every season)
    const wright = s.crews[s.player!.crew].staff.shipwright;
    const keeps = (c.kind === 'Dismiss' && c.gull === wright) || (c.kind === 'OfferContract' && c.offer?.replaces === wright && wright !== null);
    if (c.kind !== 'Advance' && !c.kind.startsWith('Debug') && c.kind !== 'Snapshot' && !keeps) tryIt(c);
  }
  if (s.player!.sacked || s.race !== null) continue;
  if (s.round >= 10 && tabled !== s.season) {
    tabled = s.season;
    seasonTables();
  }
  const t = performance.now(), before = s.season, from = s.day;
  must({ kind: 'Advance' });
  const took = performance.now() - t;
  (s.season === before ? times : ends).push(took);
  tallied(s.season !== before);
  if (took > 100) console.log(`slow Advance: ${took.toFixed(0)} ms, day ${from} to ${s.day}`);
  if (s.season !== lastSeason) {
    lastSeason = s.season;
    const me = s.player!.crew;
    coinLog.push(`season ${s.season}: start coin ${Math.round(s.crews[me].coin)}`);
  }
}
invariants(s);

const mailKinds = new Map<string, number>();
for (const m of s.mail) mailKinds.set(m.kind, (mailKinds.get(m.kind) ?? 0) + 1);
const dilemmaIds = new Set(DILEMMAS.map((d) => d.id));
console.log(tables.join('\n'));
console.log(`\n${seasons} seasons in ${((performance.now() - start0) / 1000).toFixed(1)} s, day ${s.day}`);
console.log(`managers sacked ${counts.sackings}, hired ${counts.hirings}; gulls moved between crews ${counts.transfers}; forfeits ${counts.forfeits}`);
const per = Array.from({ length: seasons }, (_, k) => sacks.bySeason[k] ?? 0);
console.log(`sackings a season ${per.join(' ')} (mean ${(counts.sackings / seasons).toFixed(1)}): ${sacks.midSeason} in a season, ${counts.sackings - sacks.midSeason} at its end;`
  + ` ${sacks.early} within half a season of the post; ${sacks.afterOne} in a crew's first poor season, ${sacks.afterTwo} in its second or later;`
  + ` posts left for another crew ${sacks.moved}, by retirement ${sacks.retired}, at a contract's end ${sacks.expired}`);
const timing = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b), at = (q: number) => (sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0).toFixed(1);
  return `${xs.length} calls, mean ${(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)).toFixed(1)} ms, 95th ${at(0.95)} ms, most ${at(1)} ms (call ${xs.indexOf(sorted[sorted.length - 1])})`;
};
console.log(`Advance between race days: ${timing(times)}; through a season's end: ${timing(ends)}`);
console.log(`ledger of the player's crew: ${coinLog.join('; ')}; the bot's DebugCoin top-ups to sign a shipwright: ${counts.topped}; with a shipwright ${counts.wright} of ${counts.gaps} gaps`);
console.log('mail kinds:', [...mailKinds].sort().map(([k, n]) => `${k} ${n}`).join(', '));
const missingMail = Object.keys(TEMPLATES).filter((k) => !mailKinds.has(k));
const missingDilemmas = [...dilemmaIds].filter((k) => !mailKinds.has(k));
console.log(`mail kinds never sent: ${missingMail.join(', ') || 'none'}`);
console.log(`dilemmas never drawn for the player: ${missingDilemmas.join(', ') || 'none'}`);
console.log(`the bot's refusals: ${[...refusals].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, v]) => `${k} ${v}`).join(', ')}`);
