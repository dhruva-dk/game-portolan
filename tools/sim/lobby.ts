// A career run headless through the lobby's own reducer (career/career.ts
// start and apply: commands in, a new state or a refusal out), by a scripted
// manager (managers.ts) for so many seasons. Every race of it is sailed as a
// match (match.ts runCard: the career's own card, ship 0 given a bot of the
// card's median stats) and its result sent back as RecordRace.
//
// Writes, into its folder:
//   commands.jsonl  every command: applied or refused (and why), what of the
//                   state it changed (path, was, now), the mail it brought
//   views.jsonl     each screen's view (career/views*.ts) after a command, a
//                   line only when that screen's view changed
//   races/          each race sailed, a match folder (match.ts)
//   summary.json    season by season, refusals by kind and code, how it ended
//
// Node only (tools/).

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { apply, start } from '../../src/career/career.ts';
import { raceCards } from '../../src/career/card.ts';
import { table } from '../../src/career/read.ts';
import type { CareerState } from '../../src/career/state.ts';
import { TUNING } from '../../src/career/tuning.ts';
import { boardView } from '../../src/career/views-board.ts';
import { careerView } from '../../src/career/views-career.ts';
import { teamView } from '../../src/career/views-team.ts';
import { homeView } from '../../src/career/views.ts';
import type { Command } from '../../src/office/command.ts';
import {
  STATS,
  type Driver,
  type Persona,
  type RaceCard,
} from '../../src/race.ts';
import { lines, writeJson } from '../out.ts';
import { commandsOf, MANAGERS, type Manager } from './managers.ts';
import { runCard } from './match.ts';

/** A career: its seed, its manager, how many seasons; `races: false` sails them unrecorded (faster). */
export interface LobbyScenario {
  kind: 'lobby';
  seed: number;
  manager: Manager;
  seasons: number;
  races?: boolean;
}

/** The most changes logged a command; the rest counted. */
const CHANGES = 200;
/** The most commands a run sends: past it, something loops. */
const MOST = 500_000;

type Change = { path: string; was: unknown; now: unknown };

const brief = (v: unknown) => {
  if (v === null || typeof v !== 'object') return v;
  const s = JSON.stringify(v);
  return s.length <= 200 ? v : `${s.slice(0, 200)}… (${s.length} chars)`;
};

/**
 * What changed from `a` to `b`, path by path. The reducer makes a new object
 * only where it changes something, so a part the same by reference is skipped.
 */
function diff(
  a: unknown,
  b: unknown,
  path: string,
  out: Change[],
  count: { n: number }
) {
  if (a === b) return;
  const objs =
    a !== null &&
    b !== null &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b);
  if (!objs) {
    count.n++;
    if (out.length < CHANGES) out.push({ path, was: brief(a), now: brief(b) });
    return;
  }
  const x = Object(a),
    y = Object(b);
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)]))
    diff(x[k], y[k], path ? `${path}.${k}` : k, out, count);
}

const median = (xs: readonly number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? v[v.length >> 1] : 10;
};

/** A card with ship 0 (the player's, no driver) given a bot of the card's median stats. */
function piloted(card: RaceCard): RaceCard {
  if (card.ships[0]?.driver !== null) return card;
  const drivers = card.ships.flatMap((x) => (x.driver ? [x.driver] : []));
  const stats = Object.fromEntries(
    STATS.map((k) => [k, median(drivers.map((d) => d.stats[k]))])
  ) as Driver['stats'];
  const counts = new Map<Persona, number>();
  for (const d of drivers)
    counts.set(d.persona, (counts.get(d.persona) ?? 0) + 1);
  const persona = [...counts].sort(
    (x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)
  )[0][0];
  const bot: Driver = { seed: card.seed, persona, stats };
  return {
    ...card,
    ships: card.ships.map((x) => (x.id === 0 ? { ...x, driver: bot } : x)),
  };
}

/** The views logged, by screen. */
const SCREENS: Record<string, (s: CareerState) => unknown> = {
  home: homeView,
  team: teamView,
  career: careerView,
  board: boardView,
};

/** The career sailed; false if it failed (a command it needed refused, or it looped). */
export async function runLobby(
  sc: LobbyScenario,
  dir: string
): Promise<boolean> {
  if (!MANAGERS.includes(sc.manager))
    throw new Error(`no manager "${sc.manager}" (${MANAGERS.join(', ')})`);
  const commands = lines(join(dir, 'commands.jsonl')),
    views = lines(join(dir, 'views.jsonl'));
  const shown = new Map<string, string>();
  const refused: Record<string, number> = {};
  const seasons: Record<string, unknown>[] = [];
  let s = start(),
    sent = 0,
    races = 0,
    ended: string | null = null;
  const began = performance.now();

  /** A command sent through the reducer, and logged; whether it was taken. */
  const send = (c: Command): boolean => {
    if (++sent > MOST)
      throw new Error(`more than ${MOST} commands: the run loops`);
    const t = performance.now(),
      r = apply(s, c),
      ms = Math.round((performance.now() - t) * 100) / 100;
    const at = { i: sent, season: s.season, round: s.round, day: s.day };
    if (!r.ok) {
      const k = `${c.kind}:${r.reason.code}`;
      refused[k] = (refused[k] ?? 0) + 1;
      commands.write({ ...at, command: c, ok: false, refused: r.reason, ms });
      return false;
    }
    const changed: Change[] = [],
      count = { n: 0 };
    diff(s, r.state, '', changed, count);
    const mail = r.state.mail.filter((m) => !s.mail.some((o) => o.id === m.id));
    commands.write({
      ...at,
      command: c,
      ok: true,
      ms,
      changes: count.n,
      changed,
      ...(count.n > CHANGES && { truncated: count.n - CHANGES }),
      mail: mail.map((m) => ({
        id: m.id,
        category: m.category,
        kind: m.kind,
        sender: m.sender,
        slots: m.slots,
      })),
    });
    s = r.state;
    if (s.player)
      for (const [screen, view] of Object.entries(SCREENS)) {
        let v: unknown;
        try {
          v = view(s);
        } catch (e) {
          v = { error: e instanceof Error ? e.message : String(e) };
        }
        const json = JSON.stringify(v);
        if (shown.get(screen) === json) continue;
        shown.set(screen, json);
        views.write({ i: sent, season: s.season, day: s.day, screen, view: v });
      }
    return true;
  };
  const must = (c: Command) => {
    if (send(c)) return;
    throw new Error(`${c.kind} refused: see commands.jsonl line ${sent}`);
  };

  const mine = () => s.teams[s.player!.team];
  const seasonLine = () => {
    const team = mine(),
      row = table(s, team.tier).find((x) => x.mine);
    return {
      season: s.season + 1,
      tier: team.tier + 1,
      place: row?.place ?? null,
      points: row?.points ?? null,
      balance: team.balance,
    };
  };

  try {
    must({
      kind: 'Found',
      seed: sc.seed,
      team: 'Inkwell Quillers',
      colours: {
        dye: sc.seed % TUNING.world.liveries.dyes,
        pattern: sc.seed % TUNING.world.liveries.patterns,
      },
      emblem: 0,
      given: 'Ada',
      family: 'Holt',
      headshot: 1,
    });
    let seasonRaces = 0,
      seasonSent = sent,
      line: ReturnType<typeof seasonLine> | null = null;
    const t0 = performance.now();
    let seasonBegan = t0;
    while (seasons.length < sc.seasons) {
      if (s.player?.sacked) {
        const offers = [...(s.player.offers ?? [])].sort(
          (a, b) =>
            (s.teams[a.team]?.tier ?? 9) - (s.teams[b.team]?.tier ?? 9) ||
            a.made - b.made ||
            a.team - b.team
        );
        if (!offers[0]) {
          ended = `season ${s.season + 1}: sacked, and no post offered`;
          break;
        }
        must({ kind: 'TakeJob', team: offers[0].team });
        continue;
      }
      for (const c of commandsOf(s, sc.manager)) send(c);
      const race = s.race;
      if (race !== null) {
        if (!race.started) must({ kind: 'RaceStarted', round: race.round });
        const planet = s.calendar?.rounds[s.round]?.planet.seed ?? sc.seed;
        for (const card of raceCards(s)) {
          let to: string | undefined;
          if (sc.races !== false) {
            to = join(
              dir,
              'races',
              `s${s.season + 1}-r${String(s.round + 1).padStart(2, '0')}-seed${card.seed}`
            );
            mkdirSync(to, { recursive: true });
          }
          const sum = runCard(piloted(card), planet, to);
          races++;
          seasonRaces++;
          if (!sum.result)
            throw new Error(
              `race ${card.seed} ended without a result (${sum.end})`
            );
          must({ kind: 'RecordRace', result: sum.result });
        }
        if (s.round >= TUNING.calendar.rounds) line = seasonLine();
        continue;
      }
      const season = s.season;
      must({ kind: 'Advance' });
      if (s.season !== season && line) {
        const ms = performance.now() - seasonBegan;
        const done = {
          ...line,
          races: seasonRaces,
          commands: sent - seasonSent,
          wallS: Math.round(ms / 100) / 10,
        };
        seasons.push(done);
        console.log(
          `season ${done.season}: tier ${done.tier}, place ${done.place}, ${done.points} pts, balance ${done.balance} · ${done.races} races, ${done.commands} commands, ${done.wallS} s`
        );
        seasonRaces = 0;
        seasonSent = sent;
        seasonBegan = performance.now();
        line = null;
      }
    }
  } catch (e) {
    ended = e instanceof Error ? e.message : String(e);
  }
  commands.close();
  views.close();
  const summary = {
    scenario: sc,
    seasons,
    commands: sent,
    races,
    refused,
    ended,
    wallS: Math.round((performance.now() - began) / 100) / 10,
    files: { commands: commands.count(), views: views.count() },
  };
  writeJson(join(dir, 'summary.json'), summary);
  const top = Object.entries(refused)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
  console.log(
    `${sc.manager} manager, seed ${sc.seed}: ${seasons.length}/${sc.seasons} seasons · ${sent} commands, ${races} races · ${summary.wallS} s`
  );
  console.log(`refused: ${top || 'none'}`);
  if (ended) console.log(`ENDED EARLY: ${ended}`);
  console.log(
    `→ ${dir}  (summary.json; commands.jsonl; views.jsonl${sc.races !== false ? '; races/ a match folder each' : ''})`
  );
  return ended === null || ended.includes('sacked');
}
