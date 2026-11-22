// Founding: the player names the team, picks its livery and an emblem, and
// names their own person (a headshot seed they may reroll). The world is made
// from the command's seed with the player's livery taken out of the deal; the
// team takes the place of a weak team of the last tier (TUNING.player.place by
// staff strength) and inherits its staff, contracts, buildings, parts and
// balance. That team's manager goes to the free agents; the player sails its
// first ship; its three strongest drivers sail the others; its weakest is
// released to the market; its reserve stays.

import type { Colours } from '../race.ts';
import { SHIPS, type CommandOf } from '../office/command.ts';
import {
  accept,
  refuse,
  whole,
  why,
  type Check,
  type Handlers,
} from './command.ts';
import type { Dice } from './dice.ts';
import { SCHEMA } from './migrate.ts';
import { allowed, fullName, words } from './names.ts';
import { inRole, mapped, type Person, type PersonOf } from './roles.ts';
import { YEAR, stars } from './stars.ts';
import {
  championshipOf,
  staffOf,
  teamOf,
  withPeople,
  withTeam,
  type CareerState,
  type Team,
} from './state.ts';
import { playerAboard } from './seats.ts';
import { TUNING } from './tuning.ts';
import { makeWorld, staffStars } from './world.ts';

const P = TUNING.player;

/** Whether a name the player gives is one the career takes. */
function nameCheck(name: string, most: number, what: string): Check {
  const t = name.trim();
  if (t.length === 0) return why('name', `${what} needs a name.`);
  if (t.length > most)
    return why('name', `${what}'s name is too long: at most ${most} letters.`);
  if (!/^[\p{L}][\p{L}' -]*$/u.test(t))
    return why(
      'name',
      `${what}'s name may hold only letters, spaces, hyphens and apostrophes.`
    );
  if (!allowed(t)) return why('banned', `${what} cannot take that name.`);
  return null;
}

const L = TUNING.world.liveries;

/** Whether the colours are a livery a ship may wear: a dye of the palette's in one of its patterns. */
const coloursCheck = (c: Colours): Check =>
  !c || !whole(c.dye, 0, L.dyes - 1) || !whole(c.pattern, 0, L.patterns - 1)
    ? why('colours', 'Pick a dye and a pattern for your ships.')
    : null;

/** What Found checks before the world is made: every refusal a founding screen can show. */
export function foundingCheck(c: CommandOf<'Found'>): Check {
  if (!whole(c.seed, 0, 0xffffffff))
    return why('seed', 'The world needs a seed.');
  if (!whole(c.headshot, 0, 0xffffffff))
    return why('headshot', 'Your person needs a face.');
  if (!whole(c.emblem, 0, TUNING.world.emblems - 1))
    return why('emblem', 'Pick an emblem.');
  return (
    coloursCheck(c.colours) ??
    nameCheck(c.team, P.teamName, 'The team') ??
    nameCheck(c.given, P.personName, 'Your person') ??
    nameCheck(c.family, P.personName, "Your person's family")
  );
}

/**
 * The team the player takes: the one of the last tier that stands
 * TUNING.player.place by mean staff stars (1 the strongest; the lower id of
 * equals the stronger).
 */
export function taken(s: CareerState): Team {
  const last = championshipOf(s, s.championships.length - 1);
  const strength = new Map(
    last.teams.map((id) => {
      const staff = staffOf(teamOf(s, id)).flatMap((i) => {
        const g = s.people[i];
        return g ? [g] : [];
      });
      return [id, staffStars(staff)];
    })
  );
  const of = (id: number) => strength.get(id) ?? 0;
  const order = [...last.teams].sort((a, b) => of(b) - of(a) || a - b);
  const id = order[Math.min(order.length, P.place) - 1];
  return teamOf(s, id ?? -1);
}

/** The player's person: a manager whose stats are all 0 and never read. */
function playerPerson(
  s: CareerState,
  c: CommandOf<'Found'>,
  team: Team
): PersonOf<'manager'> {
  const zero = mapped(
    inRole(s.people[team.staff.manager ?? -1], 'manager').stats,
    () => 0
  );
  return {
    id: s.people.length,
    seed: c.headshot,
    given: c.given.trim(),
    family: c.family.trim(),
    colony: team.colony,
    born: -P.age * YEAR,
    improvability: 0,
    peak: 0,
    traits: [],
    morale: TUNING.morale.start,
    marketability: 0,
    wants: [],
    known: {},
    history: [],
    contract: {
      team: team.id,
      status: 'staff',
      wage: 0,
      fee: 0,
      ends: null,
      podium: 0,
      sinking: 0,
      breakClause: null,
      signed: 0,
    },
    persona: null,
    personality: null,
    reputation: P.reputation,
    fatigue: 0,
    fatigueDay: 0,
    components: [],
    unfit: 0,
    grudge: null,
    patience: TUNING.patience,
    silentUntil: 0,
    silenced: false,
    retired: null,
    player: true,
    role: 'manager',
    stats: zero,
    ceiling: zero,
  };
}

/**
 * A team as the player takes it: they manage it and sail its first ship, its
 * drivers (strongest first) sail the rest, and the one left over and its old
 * manager are released.
 */
function takenOver(
  world: CareerState,
  taking: Team,
  me: PersonOf<'manager'>,
  c: CommandOf<'Found'>
): CareerState {
  const drivers = taking.staff.ships
    .flatMap((h) => {
      const g = h.driver === null ? undefined : world.people[h.driver];
      return g ? [g] : [];
    })
    .sort((a, b) => stars(b) - stars(a) || a.id - b.id);
  const kept = drivers.slice(0, SHIPS.length - 1);
  const manager =
    taking.staff.manager === null ? [] : [world.people[taking.staff.manager]];
  const freed = [...manager, ...drivers.slice(SHIPS.length - 1)].flatMap(
    (g): Person[] => (g ? [{ ...g, contract: null }] : [])
  );
  const team: Team = {
    ...taking,
    name: c.team.trim(),
    colours: { dye: c.colours.dye, pattern: c.colours.pattern },
    emblem: c.emblem,
    player: true,
    bonds: SHIPS.map(() => 0),
    staff: {
      ...taking.staff,
      manager: me.id,
      ships: playerAboard(taking.staff.ships, kept),
    },
  };
  const out = withTeam(
    withPeople({ ...world, people: [...world.people, me] }, freed),
    team
  );
  return {
    ...out,
    schema: SCHEMA,
    player: {
      person: me.id,
      team: team.id,
      reputation: P.reputation,
      sacked: false,
      offers: [],
    },
  };
}

/** The founded world, or why not. */
function found(
  c: CommandOf<'Found'>,
  roll: Dice
): { ok: true; state: CareerState } | { ok: false; check: NonNullable<Check> } {
  const pre = foundingCheck(c);
  if (pre) return { ok: false, check: pre };
  const world = makeWorld(c.seed, c.colours, roll);
  const taking = taken(world);
  const mine = new Set(words(c.team));
  const clash = world.teams.find(
    (k) => k.id !== taking.id && words(k.name).some((w) => mine.has(w))
  );
  if (clash)
    return {
      ok: false,
      check: why(
        'name',
        `${clash.name} already sails under a word of that name.`
      ),
    };
  const me = playerPerson(world, c, taking);
  if (
    world.people.some((g) => g.retired === null && fullName(g) === fullName(me))
  )
    return {
      ok: false,
      check: why(
        'name',
        'A person of that name already sails: choose another.'
      ),
    };
  const state = takenOver(world, taking, me, c);
  return { ok: true, state: { ...state, streams: roll.counters() } };
}

export const FOUNDING: Handlers = {
  Found: (s, c, roll) => {
    if (s.player !== null)
      return refuse('founded', 'Your team is already founded.');
    const made = found(c, roll);
    return made.ok
      ? accept(made.state)
      : refuse(made.check.code, made.check.sentence);
  },
};
