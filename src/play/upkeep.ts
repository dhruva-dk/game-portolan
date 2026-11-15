// What a race's ships keep up between the fighting's steps (#58 steps 7, 8.1 and 8.2): each carded ship's parts worn
// and failing (sim/wear.ts), her handling as her faults leave it and a sprung plank's leak; her flight called, coming
// and working (sim/flight.ts); and the calls her side's first ship gives her crewmate (sim/crewmate.ts), with the ship
// each first ship fights. A card-less match keeps none of it: its ships have no parts and no flight, and sail as ever.
//
// Pure: no three, no page; deterministic for the same inputs.

import type { Call, Job, PartType, RaceCard, RaceShip } from '../race.ts';
import type { Crew, Strike } from '../sim/battle.ts';
import type { Lead } from '../sim/captain.ts';
import type { Vessel } from '../sim/contact.ts';
import { called, coming, FLIGHT, served, type Stop } from '../sim/flight.ts';
import { WEAR } from '../sim/handling.ts';
import { atHome, type Waters } from '../sim/holding.ts';
import { PLAYER } from '../sim/match.ts';
import { faulted, fitOut, leaked, worn, type Part } from '../sim/wear.ts';
import { hash } from '../world/random.ts';

/** What the upkeep did in a step, ship by ship: a part failed or repaired; her flight come, a job begun (botched or
 *  not), or the stop ended. */
export type Kept =
  | { id: number; kind: 'faulted' | 'repaired'; part: PartType }
  | { id: number; kind: 'flight'; job: Job | null; botched: boolean };

/** Her flight and parts as the HUD reads them: whether she lies in her side's water; whether she may call it (in her side's water, not being served), the
 *  stop if one is under way (how far the flight has come, 0…1; the job in hand; whether it is paused by a botch), and
 *  the parts failed. */
export interface Upkept { home: boolean; can: boolean; stop: { coming: number; job: Job | null; botched: boolean } | null; failed: readonly PartType[] }

/** Seconds ship one's last blow on a ship counts as her fighting it, when ship one is the player's. */
const FIGHTING = 20;

/** The upkeep of a race of `card` (none: a card-less match). */
export function createUpkeep() {
  let card: RaceCard | undefined;
  const parts = new Map<number, Part[]>(), stops = new Map<number, Stop>();
  /** The match's clock at each ship's last blow taken, and each ship's last blow dealt: whom, when. */
  const hitAt = new Map<number, number>(), fought = new Map<number, { target: number; at: number }>();
  const faults: { id: number; type: PartType; second: number }[] = [], jobs: { id: number; job: Job; botched: boolean }[] = [];
  /** The player's last call to her crewmate, numbered, and the ship she fought as she gave it. */
  let call: { call: Call | null; seq: number; at: number } = { call: null, seq: 0, at: -1 };

  const shipOf = (id: number): RaceShip | undefined => card?.ships[id];
  /** Her captain's Seamanship over 20; the player's ship's WEAR.player. */
  const seaman = (id: number) => (id === PLAYER ? WEAR.player : (shipOf(id)?.captain?.stats.seamanship ?? 10) / 20);
  /** The ship ship `id` fights: her bot's foe (`foe`, −1 none), else the last she struck within FIGHTING s. */
  const fights = (id: number, foe: number, clock: number) => {
    if (foe >= 0) return foe;
    const f = fought.get(id);
    return f && clock - f.at < FIGHTING ? f.target : -1;
  };

  return {
    /** A new race: each carded ship's parts fitted out, nothing kept from the last. */
    begin(c: RaceCard | undefined, ids: readonly number[]) {
      card = c;
      [parts, stops, hitAt, fought].forEach((m) => m.clear());
      faults.length = jobs.length = 0;
      call = { call: null, seq: 0, at: -1 };
      if (c) for (const id of ids) parts.set(id, fitOut(c.ships[id]?.parts ?? [], c.seed, id));
    },

    /** The player's call to her crewmate, at the match's `clock`; `foe` the ship she fights (−1: by her last blow). */
    call(given: Call, foe: number, clock: number) {
      call = { call: given, seq: call.seq + 1, at: fights(PLAYER, foe, clock) };
    },

    /** What ship `id`'s side's first ship asks of her (her crewmate's lead), the first ship's bot's foe `foe`; none for
     *  a first ship, or in a card-less match. */
    lead(id: number, foe: (first: number) => number, clock: number): Lead | undefined {
      if (!card || id % 2 === 0) return undefined;
      const first = id - 1, target = fights(first, foe(first), clock);
      return first === PLAYER ? { id: first, target, ...call } : { id: first, target, call: null, seq: 0, at: -1 };
    },

    /** What a bot knows of her own upkeep: her parts failed, and whether her flight is with her or coming. */
    seen(id: number) {
      return { faults: parts.get(id)?.filter((p) => p.failed).length ?? 0, served: stops.has(id) };
    },

    /** Calls ship `id`'s flight, if she may: in her side's water, carded, not already served. Returns whether it came. */
    summon(id: number, v: Vessel | undefined, waters: Waters | null) {
      if (!card || !v || stops.has(id) || !atHome(waters, v)) return false;
      stops.set(id, called());
      return true;
    },

    /** The step's upkeep, after the fighting, at the match's `clock`: every carded ship afloat worn by `dt` s and the
     *  blows she took (`strikes`), her handling set by her faults and a plank leaking; each stop stepped. The fleet
     *  and crews after it (in place: their own arrays, written), and what it did. */
    step(fleet: Vessel[], crews: Crew[], strikes: readonly Strike[], at: { clock: number; dt: number; waters: Waters | null }): Kept[] {
      if (!card) return [];
      const done: Kept[] = [], lost = new Map<number, number>();
      for (const s of strikes) {
        if (s.shooter !== s.struck) fought.set(s.shooter, { target: s.struck, at: at.clock });
        hitAt.set(s.struck, at.clock);
        lost.set(s.struck, (lost.get(s.struck) ?? 0) + s.hull);
      }
      const index = new Map(crews.map((c, i) => [c.id, i]));
      fleet.forEach((v, n) => {
        const ship = shipOf(v.id), i = index.get(v.id);
        if (!ship || i === undefined || crews[i].health.hull <= 0) return;
        let crew = crews[i], kit = parts.get(v.id) ?? [];
        const wore = worn(kit, at.dt, seaman(v.id), lost.get(v.id) ?? 0);
        kit = wore.parts;
        for (const type of wore.failed) {
          faults.push({ id: v.id, type, second: at.clock });
          done.push({ id: v.id, kind: 'faulted', part: type });
        }
        const stop = stops.get(v.id);
        if (stop) {
          const station = { service: ship.service, home: atHome(at.waters, v), fired: at.clock - (hitAt.get(v.id) ?? -Infinity) < FLIGHT.fire, seed: hash(hash(card!.seed, v.id), jobs.length) };
          const r = served(stop, { health: crew.health, most: ship.handling.hull, gust: crew.gust, hold: crew.hold, parts: kit }, station, at.dt);
          if (r.stop) stops.set(v.id, r.stop);
          else stops.delete(v.id);
          crew = { ...crew, health: r.ship.health, gust: r.ship.gust, hold: r.ship.hold };
          kit = [...r.ship.parts];
          for (const d of r.done) {
            if (d.kind === 'repaired') done.push({ id: v.id, kind: 'repaired', part: d.part });
            else if (d.kind === 'come') done.push({ id: v.id, kind: 'flight', job: null, botched: false });
            else if (d.kind === 'job') {
              jobs.push({ id: v.id, job: d.job, botched: d.botched });
              done.push({ id: v.id, kind: 'flight', job: d.job, botched: d.botched });
            }
          }
        }
        crews[i] = { ...crew, health: leaked(crew.health, kit, at.dt) };
        parts.set(v.id, kit);
        const fit = faulted(ship.handling, kit);
        if (fit !== v.fit) fleet[n] = { ...v, fit };
      });
      return done;
    },

    /** Ship `id`'s flight and parts for the HUD, lying in `waters` as `v` (undefined: sunk). */
    upkept(id: number, v: Vessel | undefined, waters: Waters | null): Upkept {
      const stop = stops.get(id), ship = shipOf(id), home = !!v && atHome(waters, v);
      return {
        home, can: !!ship && !stop && home,
        stop: stop && ship ? { coming: coming(stop, ship.service), job: stop.come ? stop.job : null, botched: stop.paused > 0 } : null,
        failed: (parts.get(id) ?? []).filter((p) => p.failed).map((p) => p.type),
      };
    },

    /** The race's faults and the flight's jobs begun, for its result. */
    faults: (): readonly { id: number; type: PartType; second: number }[] => faults,
    stops: (): readonly { id: number; job: Job; botched: boolean }[] => jobs,
    /** The player's last call (null: none, or free). */
    lastCall: () => call.call,
  };
}

export type Upkeep = ReturnType<typeof createUpkeep>;
