// Founding (Phase B section 3, D32, D35): the player names the crew, picks two colours and an emblem, and names their
// own gull (a headshot seed they may reroll). The world is made from the command's seed with the player's colours
// taken out of the deal; the crew takes the place of the weakest crew of League Three and inherits its staff,
// contracts, buildings, parts and coin. That crew's manager goes to the free agents; its stronger captain sails ship
// two; its weaker is released to the market; its reserve stays.

import { SWATCHES, type Colours } from '../race.ts';
import type { CommandOf } from '../office.ts';
import { accept, refuse, whole, why, type Check, type Handlers } from './command.ts';
import type { Dice } from './dice.ts';
import { SCHEMA } from './migrate.ts';
import { allowed, fullName, words } from './names.ts';
import { ROLE_STATS, type Gull } from './roles.ts';
import { YEAR, stars } from './stars.ts';
import type { CareerState, Crew } from './state.ts';
import { TUNING } from './tuning.ts';
import { makeWorld, staffStars } from './world.ts';

const P = TUNING.player;

/** Whether a name the player gives is one the career takes. */
function nameCheck(name: string, most: number, what: string): Check {
  const t = name.trim();
  if (t.length === 0) return why('name', `${what} needs a name.`);
  if (t.length > most) return why('name', `${what}'s name is too long: at most ${most} letters.`);
  if (!/^[\p{L}][\p{L}' -]*$/u.test(t)) return why('name', `${what}'s name may hold only letters, spaces, hyphens and apostrophes.`);
  if (!allowed(t)) return why('banned', `${what} cannot take that name.`);
  return null;
}

/** Whether the colours are two different swatches of the palette's crew colours. */
export const coloursCheck = (c: Colours): Check =>
  !whole(c.first, 0, SWATCHES - 1) || !whole(c.second, 0, SWATCHES - 1) ? why('colours', 'Pick two of the crew colours.')
    : c.first === c.second ? why('colours', 'Pick two different colours.') : null;

/** What Found checks before the world is made: every refusal a founding screen can show. */
export function foundingCheck(c: CommandOf<'Found'>): Check {
  if (!whole(c.seed, 0, 0xffffffff)) return why('seed', 'The world needs a seed.');
  if (!whole(c.headshot, 0, 0xffffffff)) return why('headshot', 'Your gull needs a face.');
  if (!whole(c.emblem, 0, TUNING.world.emblems - 1)) return why('emblem', 'Pick an emblem.');
  return coloursCheck(c.colours) ?? nameCheck(c.crew, P.crewName, 'The crew') ?? nameCheck(c.given, P.gullName, 'Your gull')
    ?? nameCheck(c.family, P.gullName, "Your gull's family");
}

/** The weakest crew of League Three: lowest mean staff stars, the lower id of equals. */
export function weakest(s: CareerState): Crew {
  const three = s.leagues[s.leagues.length - 1].crews.map((i) => s.crews[i]);
  const strength = (c: Crew) => staffStars(staffIds(c).map((i) => s.gulls[i]));
  return three.reduce((a, b) => (strength(b) < strength(a) ? b : a));
}

const staffIds = (c: Crew): number[] =>
  [c.staff.manager, ...c.staff.ships.flatMap((h) => [h.captain, h.bosun]), c.staff.reserve, c.staff.shipwright, ...c.staff.scouts, ...c.staff.flight]
    .filter((x): x is number => x !== null);

/** The player's gull: a manager whose stats are all 0 and never read (D8, D35). */
function playerGull(s: CareerState, c: CommandOf<'Found'>, crew: number): Gull {
  const zero = Object.fromEntries(ROLE_STATS.manager.map((k) => [k, 0])) as Record<(typeof ROLE_STATS.manager)[number], number>;
  return {
    id: s.gulls.length, seed: c.headshot, given: c.given.trim(), family: c.family.trim(), colony: s.crews[crew].colony,
    born: -P.age * YEAR, improvability: 0, peak: 0, traits: [],
    morale: TUNING.morale.start, marketability: 0, wants: [], known: {}, history: [],
    contract: { crew, status: 'staff', wage: 0, fee: 0, ends: null, podium: 0, sinking: 0, breakClause: null, signed: 0 },
    style: null, personality: null, reputation: P.reputation, fatigue: 0, fatigueDay: 0, job: null, components: [], unfit: 0, grudge: null,
    patience: TUNING.patience, silentUntil: 0, silenced: false, retired: null, player: true, role: 'manager', stats: zero, ceiling: zero,
  };
}

/** The founded world, or why not. */
export function found(c: CommandOf<'Found'>, roll: Dice): { ok: true; state: CareerState } | { ok: false; check: NonNullable<Check> } {
  const pre = foundingCheck(c);
  if (pre) return { ok: false, check: pre };
  const world = makeWorld(c.seed, c.colours, roll);
  const taking = weakest(world);
  const mine = new Set(words(c.crew));
  const clash = world.crews.find((k) => k.id !== taking.id && words(k.name).some((w) => mine.has(w)));
  if (clash) return { ok: false, check: why('name', `${clash.name} already sails under a word of that name.`) };
  const me = playerGull(world, c, taking.id);
  if (world.gulls.some((g) => g.retired === null && fullName(g) === fullName(me))) return { ok: false, check: why('name', 'A gull of that name already flies: choose another.') };
  const gulls = [...world.gulls, me];
  const [a, b] = taking.staff.ships.map((h) => h.captain as number);
  const [stronger, weaker] = stars(gulls[b]) > stars(gulls[a]) ? [b, a] : [a, b];
  const free = (id: number) => { gulls[id] = { ...gulls[id], contract: null }; };
  free(taking.staff.manager);
  free(weaker);
  const strongerGull = gulls[stronger];
  if (strongerGull.contract) gulls[stronger] = { ...strongerGull, contract: { ...strongerGull.contract, status: 'ship' } };
  const crew: Crew = {
    ...taking, name: c.crew.trim(), colours: { ...c.colours }, emblem: c.emblem, player: true, bonds: [0, 0],
    staff: { ...taking.staff, manager: me.id, ships: [{ captain: null, bosun: taking.staff.ships[0].bosun }, { captain: stronger, bosun: taking.staff.ships[1].bosun }] },
  };
  const crews = [...world.crews];
  crews[crew.id] = crew;
  return {
    ok: true,
    state: { ...world, schema: SCHEMA, gulls, crews, streams: roll.counters(),
      player: { gull: me.id, crew: crew.id, reputation: P.reputation, sacked: false, offers: [] } },
  };
}

export const FOUNDING: Handlers = {
  Found: (s, c, roll) => {
    if (s.player !== null) return refuse('founded', 'Your crew is already founded.');
    const made = found(c, roll);
    return made.ok ? accept(made.state) : refuse(made.check.code, made.check.sentence);
  },
};
