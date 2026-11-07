// Portolan's career: the public face for the interface and the integration step. Import from here.
//
//   const store = webStore(localStorage);
//   let { career } = loadCareer(store, seed);
//   const plan = planMatch(career);                 // 19 captains, the player's loadout, a match seed
//   ...run the match, then adapt its result into a MatchReport...
//   const { career: next, changes } = applyMatch(career, report);
//   saveCareer(store, next);
export type { FleetEntry, MatchChanges, MatchPlan, MatchReport, PlayerEntry, RivalNews, ShipReport } from './contract.ts';
export { CAPTAINS, LEAGUE_SIZE, TEMPERAMENTS, captainIndex, temperament, type Captain, type Temperament, type TemperamentId } from './captains.ts';
export {
  careerHash, careerLevel, careerRank, copyCareer, equipAbility, equipCosmetic, newCareer, unlockedAbilities, unlockedCosmetics, wornLook,
  type CaptainRecord, type Career,
} from './career.ts';
export {
  COSMETICS, COSMETIC_KINDS, LOOK_KINDS, STARTER_LOOK, cosmetic, cosmeticsOf, isUnlocked, type Cosmetic, type CosmeticKind, type Look, type Unlock,
} from './cosmetics.ts';
export { FLEET_SIZE, RIVAL_AT, drawCaptains, planMatch, rivalry } from './fleet.ts';
export { CARD, LEARNING, NO_HABITS, WEAPON_CLASSES, type Expect, type Knowledge, type PlayerHabits, type WeaponClass } from './habits.ts';
export { ABILITY_LEVEL, ABILITY_ORDER, MATCH_XP, levelOf, xpAt, xpToNext, type LevelProgress, type XpPart } from './levels.ts';
export { RANKS, RANK_STEP, TIER, TIERS, rankOf, type Rank, type RankStep } from './ranks.ts';
export { SKILL } from './rating.ts';
export { careerStats, chartOf, regionsCharted, rivalCard, rivalsOf, standingOf, yourHabits, type CareerStats, type ChartRegion, type RivalCard, type Standing } from './record.ts';
export { applyMatch } from './results.ts';
export { BACKUP_KEY, SAVE_KEY, loadCareer, memoryStore, saveCareer, serializeCareer, webStore, type LoadStatus, type SaveStore } from './save.ts';
export { playSynthetic, type SyntheticResult } from './synthetic.ts';
