// Traits (Phase B section 2.3), as data: an id, a name, the roles that may have one, a condition the career can
// evaluate (the planet, the round, the rules, a rival on the grid, contract state, age, league), and a modifier (to
// stats, morale, marketability, wants, wage, Coin a race, or the crew's young captains' growth). A gull has at most
// three; they gain or lose them at a season's end by seed (`turned`) and by events.

import type { Rules } from '../race.ts';
import type { Role, Want } from '../office.ts';
import { pick, type Rand } from './dice.ts';
import { TUNING } from './tuning.ts';

/** What a trait's condition reads. */
export interface Setting {
  pace: number;                                      // the race's storm pace (the planet's under the rules)
  round: number;                                     // 0 the season's first
  rules: Rules;
  grid: readonly number[];                           // the crews on the grid
  grudge: number | null;                             // the crew that last sank her
  daysLeft: number | null;                           // in her contract; null with none
  age: number;
  league: number | null;                             // her crew's
}

/** What a trait changes. `all` shifts every stat of her role; a named stat shifts only if her role has it. */
export interface Modifier {
  stats: Readonly<Record<string, number>>;
  all: number;
  morale: number;                                    // a race
  marketability: number;
  wage: number;                                      // her ask × (1 + this)
  coin: number;                                      // × her marketability, Coin a race to her crew
  growth: number;                                    // to her crew's captains under the mentor age
  wants: Want | null;                                // a want she always ranks first
}

export interface Trait {
  id: string;
  name: string;
  roles: readonly Role[];
  when: (s: Setting) => boolean;
  mod: Partial<Modifier>;
}

const ALWAYS = () => true;
const SAILORS: readonly Role[] = ['captain'];
const ANY: readonly Role[] = ['captain', 'bosun', 'shipwright', 'scout', 'flight', 'manager'];
const HANDS: readonly Role[] = ['captain', 'bosun', 'shipwright', 'scout', 'flight'];
const T = TUNING.traits;
const SEASON_DAYS = TUNING.calendar.rounds * TUNING.calendar.gap + TUNING.calendar.off;

export const TRAITS: readonly Trait[] = [
  { id: 'stormSpecialist', name: 'Storm Specialist', roles: SAILORS, when: (s) => s.pace < 1, mod: { stats: { stormcraft: 2 } } },
  { id: 'hothead', name: 'Hothead', roles: SAILORS, when: ALWAYS, mod: { stats: { nerve: 2, consistency: -2 } } },
  { id: 'crowdFavourite', name: 'Crowd Favourite', roles: HANDS, when: ALWAYS, mod: { marketability: 20 } },
  { id: 'payCaptain', name: 'Pay Captain', roles: SAILORS, when: ALWAYS, mod: { coin: T.pay } },
  { id: 'homebody', name: 'Homebody', roles: ANY, when: ALWAYS, mod: { wants: 'home' } },
  { id: 'mentor', name: 'Mentor', roles: SAILORS, when: ALWAYS, mod: { growth: TUNING.growth.mentor } },
  { id: 'showboat', name: 'Showboat', roles: SAILORS, when: ALWAYS, mod: { stats: { gunnery: 1, consistency: -1 }, marketability: 10 } },
  { id: 'ironLungs', name: 'Iron Lungs', roles: ['captain', 'flight'], when: ALWAYS, mod: { stats: { stamina: 2 } } },
  { id: 'grudgeHolder', name: 'Grudge-holder', roles: SAILORS, when: (s) => s.grudge !== null && s.grid.includes(s.grudge), mod: { stats: { nerve: 2 } } },
  { id: 'fastStarter', name: 'Fast Starter', roles: SAILORS, when: (s) => s.round === 0, mod: { stats: { helm: 1, nerve: 1 } } },
  { id: 'closer', name: 'Closer', roles: SAILORS, when: (s) => s.round >= TUNING.calendar.rounds - 3, mod: { stats: { nerve: 1, consistency: 1 } } },
  { id: 'fairWeather', name: 'Fair-weather Sailor', roles: SAILORS, when: (s) => s.pace < 1, mod: { stats: { stormcraft: -2 } } },
  { id: 'traditionalist', name: 'Traditionalist', roles: SAILORS, when: (s) => s.rules.banned.length === 0, mod: { stats: { gunnery: 1 } } },
  { id: 'engineersEye', name: "Engineer's Eye", roles: SAILORS, when: (s) => s.rules.spec.length === 0, mod: { stats: { feedback: 2 } } },
  { id: 'contractYear', name: 'Playing for a Contract', roles: HANDS, when: (s) => s.daysLeft !== null && s.daysLeft <= TUNING.morale.silenceDays, mod: { all: 1 } },
  { id: 'complacent', name: 'Complacent', roles: HANDS, when: (s) => s.daysLeft !== null && s.daysLeft > SEASON_DAYS, mod: { all: -1 } },
  { id: 'veteran', name: 'Old Salt', roles: SAILORS, when: (s) => s.age >= 32, mod: { stats: { consistency: 1, seamanship: 1 } } },
  { id: 'prodigy', name: 'Prodigy', roles: HANDS, when: (s) => s.age < 21, mod: { marketability: 10 } },
  { id: 'loyal', name: 'Loyal', roles: ANY, when: ALWAYS, mod: { wage: -0.1, morale: 0.5 } },
  { id: 'mercenary', name: 'Mercenary', roles: ANY, when: ALWAYS, mod: { wage: 0.15, wants: 'money' } },
  { id: 'climber', name: 'Climber', roles: ANY, when: ALWAYS, mod: { wants: 'ambition' } },
  { id: 'bigStage', name: 'Big Stage', roles: HANDS, when: (s) => s.league === 0, mod: { all: 1 } },
  { id: 'bigFish', name: 'Big Fish', roles: HANDS, when: (s) => s.league === 2, mod: { all: 1 } },
  { id: 'sunny', name: 'Sunny', roles: ANY, when: ALWAYS, mod: { morale: 1 } },
  { id: 'brooder', name: 'Brooder', roles: ANY, when: ALWAYS, mod: { morale: -1 } },
  { id: 'tireless', name: 'Tireless', roles: ['flight'], when: ALWAYS, mod: { stats: { stamina: 2, strength: 1 } } },
  { id: 'steadyHands', name: 'Steady Hands', roles: ['flight', 'bosun'], when: ALWAYS, mod: { stats: { precision: 2, concentration: 2 } } },
  { id: 'tinkerer', name: 'Tinkerer', roles: ['shipwright'], when: ALWAYS, mod: { stats: { innovation: 2, accuracy: -1 } } },
  { id: 'hawkEye', name: 'Hawk Eye', roles: ['scout'], when: ALWAYS, mod: { stats: { judgement: 2 } } },
  { id: 'silverTongue', name: 'Silver Tongue', roles: ['manager', 'scout'], when: ALWAYS, mod: { stats: { negotiation: 2, persuasion: 2 } } },
  { id: 'patronsDarling', name: "Patron's Darling", roles: HANDS, when: ALWAYS, mod: { marketability: 8, wage: 0.05 } },
  { id: 'nightOwl', name: 'Night Owl', roles: SAILORS, when: (s) => s.pace > 1, mod: { stats: { lookout: 2 } } },
];

const BY_ID: ReadonlyMap<string, Trait> = new Map(TRAITS.map((t) => [t.id, t]));

/** A trait by id. Throws on an id no trait has (a state written by another version: a bug, not bad input). */
export function trait(id: string): Trait {
  const t = BY_ID.get(id);
  if (!t) throw new Error(`no trait '${id}'`);
  return t;
}

/** The traits a role may have. */
export const traitsFor = (role: Role): Trait[] => TRAITS.filter((t) => t.roles.includes(role));

/** Traits that cannot be held together. */
const CLASH: readonly (readonly [string, string])[] = [
  ['stormSpecialist', 'fairWeather'], ['loyal', 'mercenary'], ['sunny', 'brooder'], ['contractYear', 'complacent'], ['bigStage', 'bigFish'],
];
export const clashes = (a: string, b: string): boolean => CLASH.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/** A trait a gull of a role with these traits could gain, on a draw, or null. */
export function gainable(role: Role, held: readonly string[], rand: Rand): string | null {
  const open = traitsFor(role).filter((t) => !held.includes(t.id) && !held.some((h) => clashes(h, t.id)));
  return open.length === 0 || held.length >= T.most ? null : pick(rand, open).id;
}

/** A gull's traits after a season's end: one may be gained, one may be lost, on a draw of the 'traits' stream. */
export function turned(role: Role, held: readonly string[], rand: Rand): string[] {
  const out = [...held];
  if (out.length > 0 && rand() < T.lose) out.splice(Math.floor(rand() * out.length), 1);
  else if (rand() < T.gain) {
    const t = gainable(role, out, rand);
    if (t) out.push(t);
  }
  return out;
}

/** The unconditional modifier of each traits list already read: states are immutable, so a gull's list never changes
 *  (asks and marketability read it many times a review). Read only, never changed. */
const unconditional = new WeakMap<readonly string[], Modifier>();

/** What a gull's traits add up to in a setting (only those whose condition holds). Null setting: the unconditional. */
export function modifier(held: readonly string[], setting: Setting | null): Modifier {
  if (setting !== null) return summed(held, setting);
  const hit = unconditional.get(held);
  if (hit) return hit;
  const out = summed(held, null);
  unconditional.set(held, out);
  return out;
}

function summed(held: readonly string[], setting: Setting | null): Modifier {
  const out: Modifier = { stats: {}, all: 0, morale: 0, marketability: 0, wage: 0, coin: 0, growth: 0, wants: null };
  const stats: Record<string, number> = {};
  for (const id of held) {
    const t = trait(id);
    if (setting ? !t.when(setting) : t.when !== ALWAYS) continue;
    for (const [k, v] of Object.entries(t.mod.stats ?? {})) stats[k] = (stats[k] ?? 0) + v;
    out.all += t.mod.all ?? 0;
    out.morale += t.mod.morale ?? 0;
    out.marketability += t.mod.marketability ?? 0;
    out.wage += t.mod.wage ?? 0;
    out.coin += t.mod.coin ?? 0;
    out.growth += t.mod.growth ?? 0;
    out.wants = out.wants ?? t.mod.wants ?? null;
  }
  return { ...out, stats };
}
