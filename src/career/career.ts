// The career: everything that lasts between matches. Your record and stats, the hidden rating and the best
// tier reached, your XP, your loadout, the chart of regions sailed, and the
// league's twenty captains with their ratings, your record against each and what each has learned of you.
// A career is plain data; every change makes a new one (copyCareer), so the old one stays as it was.
import { ABILITIES, STARTER_ACTIVE, STARTER_PASSIVE, ability, type AbilityId } from '../sim/abilities.ts';
import { hash32, rngFrom, rngInt } from '../sim/math.ts';
import { REGION_COUNT } from '../sim/world/index.ts';
import { CAPTAINS, LEAGUE_SIZE } from './captains.ts';
import { decode, encode, hash64, int, list, rec, str, type Format, type Value } from './codec.ts';
import { COSMETICS, RETIRED, STARTER_LOOK, cosmetic, isUnlocked, type Cosmetic, type Look } from './cosmetics.ts';
import { newLearned } from './habits.ts';
import { ABILITY_LEVEL, abilityUnlocked, levelOf } from './levels.ts';
import { rankOf, type Rank } from './ranks.ts';

const LEARNED = rec(
  ['drop', list(int)], ['run', list(int)], ['storm', list(int)], ['range', list(int)], ['weapon', list(int)],
  ['runAt', int], ['stormU', int], ['rangeU', int],
);

const LOOK = rec(['sailColour', str], ['sailPattern', str], ['hullPaint', str], ['figurehead', str], ['emblem', str], ['wake', str]);

const CAPTAIN = rec(
  ['id', str],
  /** League rating: where it stands, and who it gets drawn against. */
  ['rating', int],
  /** The level its rating drifts back toward. */
  ['home', int],
  /** Matches together; you finished ahead of it; behind it; it sank you; you sank it. */
  ['met', int], ['ahead', int], ['behind', int], ['sank', int], ['sunk', int],
  ['grudge', int],
  ['habits', LEARNED],
);

const FIELDS = [
  ['seed', int],
  ['matches', int], ['wins', int], ['top5', int], ['kills', int], ['damage', int], ['survived', int], ['bestPlace', int],
  /** The hidden skill rating. */
  ['rating', int],
  /** The best rank tier reached: your floor. */
  ['bestTier', int],
  ['xp', int],
  ['active', str], ['passive', str], ['look', LOOK],
  /** Matches in which you sailed each region, by index into REGIONS. */
  ['chart', list(int)],
  ['captains', list(CAPTAIN)],
  /** What you yourself tend to do: the same learning, watching every match. */
  ['profile', LEARNED],
] as const;

const CAREER = rec(...FIELDS);

/** The save format. Bump the version when the schema changes, and add a migration in save.ts. */
export const CAREER_FORMAT: Format<typeof CAREER> = { magic: 'PTLC', version: 5, schema: CAREER };

/** Version 3, the same fields, and 4, which also kept a list of what was found on the planet (since cut): kept to
 *  read old saves. */
const CAREER_4 = rec(...FIELDS, ['found', list(str)]);
export const CAREER_V3: Format<typeof CAREER> = { magic: 'PTLC', version: 3, schema: CAREER };
export const CAREER_V4: Format<typeof CAREER_4> = { magic: 'PTLC', version: 4, schema: CAREER_4 };

export type Career = Value<typeof CAREER>;
export type CaptainRecord = Career['captains'][number];

export const encodeCareer = (c: Career): Uint8Array => encode(CAREER_FORMAT, c);
export const decodeCareer = (bytes: Uint8Array): Career => decode(CAREER_FORMAT, bytes);
export const careerHash = (c: Career): string => hash64(encodeCareer(c));
export const copyCareer = (c: Career): Career => decodeCareer(encodeCareer(c));

/** The league starts spread over the whole ladder, from below Iron I to Legend, in an order the seed shuffles. */
/** The league's starting ratings: twenty captains a step apart, spanning the ladder from the gentlest to the strongest. */
export const LEAGUE_SPREAD = { from: -150, step: 124, jitter: 80 } as const;
const NEW = 0x6e657721;

export const newCaptainRecord = (id: string, rating: number): CaptainRecord => ({
  id, rating, home: rating, met: 0, ahead: 0, behind: 0, sank: 0, sunk: 0, grudge: 0, habits: newLearned(),
});

export function newCareer(seed: number): Career {
  const rng = rngFrom(hash32(seed >>> 0, NEW)), order = CAPTAINS.map((_, i) => i);
  for (let i = LEAGUE_SIZE - 1; i > 0; i--) {
    const j = rngInt(rng, i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const rating = new Array<number>(LEAGUE_SIZE).fill(0);
  order.forEach((id, k) => {
    rating[id] = LEAGUE_SPREAD.from + k * LEAGUE_SPREAD.step + rngInt(rng, LEAGUE_SPREAD.jitter);
  });
  return {
    seed: seed >>> 0,
    matches: 0, wins: 0, top5: 0, kills: 0, damage: 0, survived: 0, bestPlace: 0,
    rating: 0,
    bestTier: 0,
    xp: 0,
    active: STARTER_ACTIVE, passive: STARTER_PASSIVE, look: { ...STARTER_LOOK },
    chart: new Array<number>(REGION_COUNT).fill(0),
    captains: CAPTAINS.map((c, i) => newCaptainRecord(c.id, rating[i])),
    profile: newLearned(),
  };
}

export const careerLevel = (c: Career): number => levelOf(c.xp).level;
export const careerRank = (c: Career): Rank => rankOf(c.rating, c.bestTier);

export const unlockedAbilities = (c: Career): AbilityId[] => ABILITIES.filter((a) => abilityUnlocked(a.id, careerLevel(c))).map((a) => a.id);
export const unlockedCosmetics = (c: Career): Cosmetic[] => COSMETICS.filter((k) => isUnlocked(k, careerLevel(c), c.bestTier));

const knownAbility = (id: string): boolean => ABILITIES.some((a) => a.id === id);

/** Bring an unlocked ability: an active replaces your active, a passive your passive. Locked or unknown throws. */
export function equipAbility(c: Career, id: AbilityId): Career {
  if (!knownAbility(id)) throw new RangeError(`equipAbility: no ability ${id}`);
  if (!abilityUnlocked(id, careerLevel(c))) throw new RangeError(`equipAbility: ${id} is locked (level ${ABILITY_LEVEL[id]})`);
  const next = copyCareer(c);
  if (ability(id).kind === 'active') next.active = id;
  else next.passive = id;
  return next;
}

/** Put on an unlocked cosmetic in its kind's slot. Locked or unknown throws. */
export function equipCosmetic(c: Career, id: string): Career {
  const k = cosmetic(id);
  if (!k) throw new RangeError(`equipCosmetic: no cosmetic ${id}`);
  if (!isUnlocked(k, careerLevel(c), c.bestTier)) throw new RangeError(`equipCosmetic: ${id} is locked`);
  const next = copyCareer(c);
  next.look[k.kind] = id;
  return next;
}

/** The look a career wears, each slot checked: an id since cut is read as the item it became, and anything unknown or
 *  locked falls back to the starter. */
export function wornLook(c: Career): Look {
  const level = careerLevel(c), out: Look = { ...STARTER_LOOK };
  for (const k of COSMETICS) {
    const worn = c.look[k.kind];
    if ((RETIRED[worn] ?? worn) === k.id && isUnlocked(k, level, c.bestTier)) out[k.kind] = k.id;
  }
  return out;
}
