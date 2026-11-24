// The office's fixtures: careers on a memory store, made by the commands a
// player would send (Found, Advance, StartScout, OfferContract), for ?screen=
// (debug.ts) and tools/browser.ts. Nothing here touches the device's own
// career, and no race is sailed here: every fixture stands before the season's
// first race, or on its day. `people` has one rival driver scouted, another
// being scouted, and a free agent's talks under way (a lowball, its answer
// due); `sacked` is that career with the chairman's patience gone (its state
// set, then snapshotted).

import type { Command } from './office/command.ts';
import type { CareerDesk } from './office/career.ts';
import { createDesk, type Shelf } from './desk.ts';
import { send, fresh, checkpoint, type Kept } from './career/session.ts';
import type { CareerState } from './career/career.ts';
import { sackedOffers } from './career/chairmen.ts';
import { offerView } from './career/views-offer.ts';
import { profileView } from './career/views-profile.ts';
import { seen } from './career/views-person.ts';
import { myTeam, topBar } from './career/views.ts';
import { emptyDisk, memoryStore, type Disk } from './store/memory.ts';

/** The fixtures' founding. */
export const FOUNDING: Extract<Command, { kind: 'Found' }> = {
  kind: 'Found',
  seed: 20261115,
  team: 'Portolan Quills',
  colours: { dye: 2, pattern: 1 },
  emblem: 3,
  given: 'Ottoline',
  family: 'Wrackham',
  headshot: 99,
};

/**
 * The careers a fixture can be: none yet (found), founded (home), on race day,
 * a save whose last action is torn (recover), with scouting and talks under
 * way (people), and dismissed (sacked).
 */
export const FIXTURES = [
  'found',
  'home',
  'raceday',
  'recover',
  'people',
  'sacked',
] as const;
export type Fixture = (typeof FIXTURES)[number];

/** A step of a fixture: a command, or the commands a state calls for. */
type Step = Command | ((s: CareerState) => readonly Command[]);

/** The rival drivers of the player's tier not yet known to them. */
const strangers = (s: CareerState) => {
  const mine = myTeam(s);
  return s.people.filter(
    (g) =>
      g.contract &&
      g.contract.team !== mine.id &&
      g.role === 'driver' &&
      s.teams[g.contract.team]?.tier === mine.tier &&
      !seen(s, mine.id, g.id).known
  );
};
/** The first of them a scout of the player's is sent to. */
const scouted = (s: CareerState): Command[] => {
  const g = strangers(s)[0];
  const scout = g ? profileView(s, g.id).scout : null;
  return g && scout && scout.ok && scout.scout !== null
    ? [{ kind: 'StartScout', scout: scout.scout, person: g.id }]
    : [];
};
/** A free mechanic offered less than they ask, in place of the mechanic of the player's last ship. */
const haggle = (s: CareerState): Command[] => {
  for (const g of s.people) {
    if (g.contract || g.retired !== null || g.player || g.role !== 'mechanic')
      continue;
    const v = offerView(s, g.id, null),
      offer = {
        ...v.draft,
        replaces: v.replaces[v.replaces.length - 1]?.id ?? null,
        wage: Math.round(v.draft.wage * 0.75),
      };
    if (offerView(s, g.id, offer).send.ok)
      return [{ kind: 'OfferContract', person: g.id, offer }];
  }
  return [];
};
/** A day on, unless `done` (or race day). */
const until =
  (done: (s: CareerState) => boolean) =>
  (s: CareerState): Command[] =>
    done(s) || topBar(s).go.raceDay ? [] : [{ kind: 'Advance' }];

/**
 * The people fixture's people (for ?screen=profile, offer and ?who=): the
 * rival driver scouted, the one being scouted, the free agent in talks, and
 * the first of the player's hired drivers.
 */
export const PICKED = { scouted: -1, unknown: -1, talks: -1, driver: -1 };
const PEOPLE: readonly Step[] = [
  FOUNDING,
  { kind: 'DebugBalance', balance: 6400 },
  (s) => {
    PICKED.scouted = strangers(s)[0]?.id ?? -1;
    return scouted(s);
  },
  ...Array.from({ length: 12 }, () =>
    until((s) => seen(s, myTeam(s).id, PICKED.scouted).known)
  ),
  (s) => {
    PICKED.unknown = strangers(s)[0]?.id ?? -1;
    PICKED.driver =
      myTeam(s).staff.ships.find((h) => h.driver !== null)?.driver ?? -1;
    return scouted(s);
  },
  (s) => {
    const c = haggle(s);
    PICKED.talks = c[0]?.kind === 'OfferContract' ? c[0].person : -1;
    return c;
  },
];

const COMMANDS: Readonly<Record<Fixture, readonly Step[]>> = {
  found: [],
  home: [FOUNDING, { kind: 'DebugBalance', balance: 1250 }],
  raceday: [FOUNDING, { kind: 'Advance' }],
  recover: [FOUNDING, { kind: 'Advance' }],
  people: PEOPLE,
  sacked: PEOPLE,
};

/** A shelf over a memory disk. */
function memoryShelf(disk: Disk): Shelf {
  let day: { day: number; season: number } | null = { day: 1, season: 0 };
  return {
    open: async () => memoryStore(disk),
    wipe: async () => {
      disk.entries = [];
      disk.snapshots = [];
      disk.backup = null;
      day = null;
    },
    backupDay: {
      get: () => day,
      set: (v) => {
        day = v;
      },
    },
  };
}

/** A career with the player dismissed and the posts open to them offered. */
function dismissed(s: CareerState): CareerState {
  return s.player
    ? sackedOffers({ ...s, player: { ...s.player, sacked: true } })
    : s;
}

/** A desk on a fixture's career. */
export async function fixture(name: Fixture): Promise<CareerDesk> {
  const disk = emptyDisk(),
    store = memoryStore(disk);
  let kept: Kept = fresh(true);
  for (const step of COMMANDS[name]) {
    for (const c of typeof step === 'function' ? step(kept.state) : [step]) {
      const r = await send(store, kept, c);
      if (!r.ok)
        throw new Error(
          `the ${name} fixture's ${c.kind} was refused: ${r.reason.sentence}`
        );
      kept = r.kept;
    }
  }
  // (recover: the last action's entry torn on the disk, as a crash mid-write leaves it)
  if (name === 'recover')
    disk.entries = disk.entries.map((e, i) =>
      i === disk.entries.length - 1 ? e.slice(0, 40) : e
    );
  if (name === 'sacked')
    await checkpoint(
      store,
      { ...kept, state: dismissed(kept.state), snapshots: [] },
      false
    );
  return createDesk(memoryShelf(disk), true);
}
