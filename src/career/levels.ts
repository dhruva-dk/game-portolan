// Levels: XP from each match earns levels. The curve climbs to level 40 over roughly 90 matches, then every
// level after costs the same. Levels unlock the 16 abilities (the starter pair at level 1, the rest spread
// to level 40) and most cosmetics (see cosmetics.ts).
import { ABILITIES, STARTER_ACTIVE, STARTER_PASSIVE, type AbilityId } from '../sim/abilities.ts';

export const XP = {
  /** XP to go from level 1 to 2; each level up to LEVEL_CURVE_END costs `rise` more than the last. */
  first: 300,
  rise: 40,
  curveEnd: 40,
} as const;

/** XP to climb from `level` to `level + 1`. */
export const xpToNext = (level: number): number => XP.first + XP.rise * (Math.min(level, XP.curveEnd) - 1);

/** Total XP needed to reach `level` from a new career. */
export function xpAt(level: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) total += xpToNext(l);
  return total;
}

export interface LevelProgress {
  level: number;
  /** XP earned inside this level. */
  into: number;
  /** XP this level takes in all. */
  need: number;
}

export function levelOf(xp: number): LevelProgress {
  let level = 1, rest = Math.max(0, xp);
  while (rest >= xpToNext(level)) rest -= xpToNext(level++);
  return { level, into: rest, need: xpToNext(level) };
}

/** The level each ability unlocks at. Actives and passives alternate so every few levels bring a new one. */
export const ABILITY_LEVEL: Readonly<Record<AbilityId, number>> = {
  repair: 1,
  salvage: 1,
  smokeScreen: 3,
  quickReload: 5,
  hardTurn: 8,
  quickHands: 10,
  ram: 13,
  lightHull: 16,
  reveal: 19,
  windReader: 22,
  decoy: 25,
  stormWalker: 28,
  wave: 31,
  deepHold: 34,
  driftMine: 37,
  steadyAim: 40,
};

export const abilityUnlocked = (id: AbilityId, level: number): boolean => ABILITY_LEVEL[id] <= level;

/** The abilities in unlock order. */
export const ABILITY_ORDER: readonly AbilityId[] = ABILITIES.map((a) => a.id).sort(
  (a, b) => ABILITY_LEVEL[a] - ABILITY_LEVEL[b] || (a === STARTER_ACTIVE ? -1 : b === STARTER_ACTIVE ? 1 : a === STARTER_PASSIVE ? -1 : 1),
);

/** What one match earns. Every part is listed so the results screen can count each one up. */
export const MATCH_XP = {
  played: 100,
  /** Per ship you outlast. */
  outlast: 12,
  top5: 50,
  win: 150,
  kill: 40,
  /** Per point of damage dealt. */
  damage: 0.05,
  /** Per second afloat. */
  survived: 0.2,
  /** Per region charted for the first time. */
  newRegion: 30,
} as const;

export interface XpPart {
  label: string;
  amount: number;
}

export function matchXp(place: number, ships: number, kills: number, damage: number, survived: number, newRegions: number): XpPart[] {
  const parts: XpPart[] = [
    { label: 'Played', amount: MATCH_XP.played },
    { label: 'Ships outlasted', amount: MATCH_XP.outlast * Math.max(0, ships - place) },
  ];
  if (place <= 5) parts.push({ label: 'Top 5', amount: MATCH_XP.top5 });
  if (place === 1) parts.push({ label: 'Victory', amount: MATCH_XP.win });
  if (kills > 0) parts.push({ label: 'Ships sunk', amount: MATCH_XP.kill * kills });
  const dealt = Math.floor(MATCH_XP.damage * Math.max(0, damage));
  if (dealt > 0) parts.push({ label: 'Damage dealt', amount: dealt });
  const afloat = Math.floor(MATCH_XP.survived * Math.max(0, survived));
  if (afloat > 0) parts.push({ label: 'Time afloat', amount: afloat });
  if (newRegions > 0) parts.push({ label: 'New waters charted', amount: MATCH_XP.newRegion * newRegions });
  return parts;
}
