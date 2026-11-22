// One whole career sailed headless on real races (MANAGER.md 6): one process is one career, from one seed, for so many
// seasons. Its player's team is run by a scripted manager (managers.ts), and its ship is sailed by a bot of the tier's
// median stats (a driver put on the card for ship 0). Every race is a real runRace of the career's own card; no result
// is rolled. Every command goes through the career's session onto a memory store, journaled as the game's are.
//
//   node tools/career/run.ts <idle|sensible|shrewd> [seed] [seasons] [out.json]
//
// seed: the world's (7 if not given); seasons: how many (5 if not given); out.json: where the report goes (stdout if
// not given). The report: { manager, seed, seasons, tuning, journal: { entries, tip }, refused: { 'Kind:code': n },
// ended: why it stopped early or null, wall: { ms, perSeason }, records: Season[] (tally.ts) }.
//
// Node only (tools/): no three, no browser.

import { writeFileSync } from 'node:fs';
import {
  STATS,
  type Driver,
  type Persona,
  type RaceCard,
} from '../../src/race.ts';
import type { Command } from '../../src/office/command.ts';
import { runRace } from '../../src/play/race.ts';
import { raceCards } from '../../src/career/card.ts';
import { fresh, send, type Kept } from '../../src/career/session.ts';
import type { CareerState } from '../../src/career/state.ts';
import { TUNING, TUNING_VERSION } from '../../src/career/tuning.ts';
import { emptyDisk, memoryStore } from '../../src/store/memory.ts';
import { worldOf } from '../harness/world.ts';
import { MANAGERS, commandsOf, type Manager } from './managers.ts';
import { tables, turned, type Season } from './tally.ts';

const [who = '', seedArg = '7', seasonsArg = '5', outPath] =
  process.argv.slice(2);
const manager = MANAGERS.find((m) => m === who);
const seed = Number(seedArg),
  seasons = Number(seasonsArg);
if (
  !manager ||
  !Number.isInteger(seed) ||
  !Number.isInteger(seasons) ||
  seasons < 1
)
  throw new Error(
    'usage: node tools/career/run.ts <idle|sensible|shrewd> [seed] [seasons] [out.json]'
  );

const median = (xs: readonly number[]): number => {
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length === 0
    ? 10
    : v.length % 2
      ? (v[m] ?? 10)
      : ((v[m - 1] ?? 10) + (v[m] ?? 10)) / 2;
};

/** The bot of a card's median stats: each stat the median of the card's drivers', its persona their commonest. */
function medianDriver(card: RaceCard): Driver {
  const drivers = card.ships.flatMap((x) => (x.driver ? [x.driver] : []));
  const stats = Object.fromEntries(
    STATS.map((k) => [k, median(drivers.map((d) => d.stats[k]))])
  ) as Driver['stats'];
  const counts = new Map<Persona, number>();
  for (const d of drivers)
    counts.set(d.persona, (counts.get(d.persona) ?? 0) + 1);
  const persona = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)
  )[0]?.[0];
  return { seed: card.seed, persona: persona ?? 'hunter', stats };
}

/** A card with the player's ship (ship 0, driverless) given the median bot. */
function piloted(card: RaceCard): RaceCard {
  const first = card.ships[0];
  if (!first || first.driver !== null) return card;
  const bot = medianDriver(card);
  return {
    ...card,
    ships: card.ships.map((x) => (x.id === 0 ? { ...x, driver: bot } : x)),
  };
}

const store = memoryStore(emptyDisk());
let kept: Kept = fresh(false);
const refused: Record<string, number> = {};

/** Sends a command; a refusal is counted, not thrown. */
async function trySend(c: Command): Promise<boolean> {
  const r = await send(store, kept, c);
  if (!r.ok) {
    const k = `${c.kind}:${r.reason.code}`;
    refused[k] = (refused[k] ?? 0) + 1;
    return false;
  }
  kept = r.kept;
  return true;
}

/** Sends a command the run cannot go on without. */
async function mustSend(c: Command): Promise<void> {
  const r = await send(store, kept, c);
  if (!r.ok) throw new Error(`${c.kind} refused: ${r.reason.sentence}`);
  kept = r.kept;
}

/** The post the sacked player takes: the offer of the highest tier, then the earliest made, then the lower team. */
function bestOffer(s: CareerState): number | null {
  const offers = [...(s.player?.offers ?? [])].sort(
    (a, b) =>
      (s.teams[a.team]?.tier ?? 9) - (s.teams[b.team]?.tier ?? 9) ||
      a.made - b.made ||
      a.team - b.team
  );
  return offers[0]?.team ?? null;
}

const began = performance.now();
await mustSend({
  kind: 'Found',
  seed,
  team: 'Inkwell Quillers',
  colours: {
    dye: seed % TUNING.world.liveries.dyes,
    pattern: seed % TUNING.world.liveries.patterns,
  },
  emblem: 0,
  given: 'Ada',
  family: 'Holt',
  headshot: 1,
});

const records: Season[] = [];
const perSeason: number[] = [];
let start = kept.state.teams.map((c) => c.balance),
  seasonBegan = began,
  wall = { ms: 0, races: 0, raceMs: 0, planetMs: 0 },
  sacked = false,
  record: Season | null = null,
  ended: string | null = null;

while (records.length < seasons) {
  const s = kept.state;
  if (s.player?.sacked) {
    sacked = true;
    const team = bestOffer(s);
    if (team === null) {
      ended = `season ${s.season}: sacked, and no post offered`;
      break;
    }
    await mustSend({ kind: 'TakeJob', team });
    continue;
  }
  for (const c of commandsOf(s, manager)) await trySend(c);
  const race = kept.state.race;
  if (race !== null) {
    if (!race.started)
      await mustSend({ kind: 'RaceStarted', round: race.round });
    const round = kept.state.calendar?.rounds[kept.state.round];
    const t = performance.now(),
      world = worldOf(round?.planet.seed ?? seed);
    wall.planetMs += performance.now() - t;
    for (const card of raceCards(kept.state)) {
      const r0 = performance.now();
      const result = runRace(piloted(card), world.planet, world.waters);
      wall.raceMs += performance.now() - r0;
      wall.races++;
      await mustSend({ kind: 'RecordRace', result });
    }
    if (kept.state.round >= TUNING.calendar.rounds)
      record = tables(
        kept.state,
        start,
        { ...wall, ms: performance.now() - seasonBegan },
        sacked
      );
    continue;
  }
  const season = kept.state.season;
  await mustSend({ kind: 'Advance' });
  if (kept.state.season !== season && record) {
    records.push(turned(record, kept.state));
    perSeason.push(performance.now() - seasonBegan);
    process.stderr.write(
      `season ${record.season}: ${(perSeason.at(-1) ?? 0) / 1000} s, ${record.wall.races} races, player ${record.player.place} of tier ${record.player.tier + 1}\n`
    );
    start = kept.state.teams.map((c) => c.balance);
    seasonBegan = performance.now();
    wall = { ms: 0, races: 0, raceMs: 0, planetMs: 0 };
    sacked = false;
    record = null;
  }
}

const report = {
  manager,
  seed,
  seasons,
  tuning: TUNING_VERSION,
  journal: { entries: kept.seq, tip: kept.tip },
  refused,
  ended,
  wall: { ms: performance.now() - began, perSeason },
  records,
};
const text = JSON.stringify(report);
if (outPath) writeFileSync(outPath, text + '\n');
else console.log(text);
