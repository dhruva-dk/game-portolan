// The office's fixtures: careers on a memory store, made by the commands a player would send (Found, Advance, StartScout,
// OfferContract, a race recorded), for ?screen= (debug.ts) and tools/capture.ts. Nothing here touches the device's own
// career. `people` is a career past its first race: one rival captain scouted, another being scouted, and a free agent's
// talks under way (a lowball, its answer due); `sacked` is that career with the elder's patience gone (its state set, then
// snapshotted: no run of races reliably ends in a sacking).

import type { Command, Desk } from './office';
import type { RaceResult } from './race';
import { createDesk, type Shelf } from './desk';
import { send, fresh, checkpoint, type Kept } from './career/session';
import type { CareerState } from './career/career';
import { raceCards } from './career/card';
import { sackedOffers } from './career/elders';
import { offerView } from './career/views-offer';
import { profileView } from './career/views-profile';
import { seen } from './career/views-gull';
import { topBar } from './career/views';
import { SPEC } from './sim/fit';
import { emptyDisk, memoryStore, type Disk } from './store/memory';

/** The fixtures' founding. */
export const FOUNDING: Extract<Command, { kind: 'Found' }> = {
  kind: 'Found', seed: 20261115, crew: 'Portolan Quills', colours: { first: 2, second: 7 }, emblem: 3, given: 'Ottoline', family: 'Wrackham', headshot: 99,
};

/** The careers a fixture can be: none yet (found), founded (home), on race day, a save whose last action is torn
 *  (recover), past the first race with scouting and talks under way (people), and dismissed (sacked). */
export const FIXTURES = ['found', 'home', 'raceday', 'recover', 'people', 'sacked'] as const;
export type Fixture = (typeof FIXTURES)[number];

/** A step of a fixture: a command, or the commands a state calls for. */
type Step = Command | ((s: CareerState) => readonly Command[]);

/** Every league's race recorded, the ships home in card order, none sunk. */
const raced = (s: CareerState): Command[] => [
  { kind: 'RaceStarted', round: s.race!.round },
  ...raceCards(s, SPEC).map((card): Command => {
    const order = card.ships.map((x) => x.id), sea = order.slice(0, 10), total = sea.reduce((a, _i, k) => a + 10 - k, 0);
    const result: RaceResult = {
      seed: card.seed, league: card.league, round: card.round, order, sinkings: [], faults: [], stops: [],
      seaHeld: sea.map((id, k) => ({ id, share: (10 - k) / total })), hits: order.map((id) => ({ id, fired: 12, landed: 4, taken: 3 })), seconds: 720,
    };
    return { kind: 'RecordRace', result };
  }),
];

const mine = (s: CareerState) => s.player!.crew;
/** The `n`th rival captain of the player's league not yet known to them. */
const stranger = (s: CareerState, n: number) => s.gulls.filter((g) => g.contract && g.contract.crew !== mine(s) && g.role === 'captain'
  && s.crews[g.contract.crew].league === s.crews[mine(s)].league && !seen(s, mine(s), g.id).known)[n];
const scouted = (n: number) => (s: CareerState): Command[] => {
  const g = stranger(s, n), p = profileView(s, g.id);
  return p.scout.ok ? [{ kind: 'StartScout', scout: p.scout.scout!, gull: g.id }] : [];
};
/** A free bosun offered less than they ask, in place of the player's ship-two bosun. */
const haggle = (s: CareerState): Command[] => {
  for (const g of s.gulls) {
    if (g.contract || g.retired !== null || g.player || g.role !== 'bosun') continue;
    const v = offerView(s, g.id, null), offer = { ...v.draft, replaces: v.replaces[v.replaces.length - 1].id, wage: Math.round(v.draft.wage * 0.75) };
    if (offerView(s, g.id, offer).send.ok) return [{ kind: 'OfferContract', gull: g.id, offer }];
  }
  return [];
};
/** A day on, unless `done` (or race day). */
const until = (done: (s: CareerState) => boolean) => (s: CareerState): Command[] => (done(s) || topBar(s).go.raceDay ? [] : [{ kind: 'Advance' }]);

/** The people fixture's gulls (for ?screen=profile, offer and ?who=): the rival captain scouted, the one being scouted,
 *  the free agent in talks, and ship two's captain. */
export const PICKED = { scouted: -1, unknown: -1, talks: -1, captain: -1 };
const PEOPLE: readonly Step[] = [
  FOUNDING, { kind: 'DebugCoin', coin: 6400 },
  (s) => {
    PICKED.scouted = stranger(s, 0).id;
    return scouted(0)(s);
  },
  { kind: 'Advance' }, raced,
  ...Array.from({ length: 6 }, () => until((s) => seen(s, mine(s), PICKED.scouted).known)),
  (s) => {
    PICKED.unknown = stranger(s, 0).id;
    PICKED.captain = s.crews[mine(s)].staff.ships[1].captain ?? -1;
    return scouted(0)(s);
  },
  (s) => {
    const c = haggle(s);
    PICKED.talks = c[0]?.kind === 'OfferContract' ? c[0].gull : -1;
    return c;
  },
];

const COMMANDS: Readonly<Record<Fixture, readonly Step[]>> = {
  found: [],
  home: [FOUNDING, { kind: 'DebugCoin', coin: 1250 }],
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
    backupDay: { get: () => day, set: (v) => { day = v; } },
  };
}

/** A desk on a fixture's career. */
export async function fixture(name: Fixture): Promise<Desk> {
  const disk = emptyDisk(), store = memoryStore(disk);
  let kept: Kept = fresh(true);
  for (const step of COMMANDS[name]) {
    for (const c of typeof step === 'function' ? step(kept.state) : [step]) {
      const r = await send(store, kept, c);
      if (!r.ok) throw new Error(`the ${name} fixture's ${c.kind} was refused: ${r.reason.sentence}`);
      kept = r.kept;
    }
  }
  // (recover: the last action's entry torn on the disk, as a crash mid-write leaves it)
  if (name === 'recover') disk.entries[disk.entries.length - 1] = disk.entries[disk.entries.length - 1].slice(0, 40);
  if (name === 'sacked') await checkpoint(store, { ...kept, state: sackedOffers({ ...kept.state, player: { ...kept.state.player!, sacked: true } }), snapshots: [] }, false);
  return createDesk(memoryShelf(disk), true);
}
