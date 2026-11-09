// The interface's view models from the career: what each screen shows, read from the saved record. The screens never
// see the career itself, and the career never sees the screens.
import {
  ABILITY_LEVEL, COSMETICS, careerLevel, careerRank, isUnlocked, levelOf, rivalsOf, unlockedAbilities, wornLook, type Career, type Cosmetic,
} from '../career/index.ts';
import { ABILITIES, type ActiveId, type PassiveId } from '../sim/abilities.ts';
import {
  rarityOf, type AbilitiesModel, type CosmeticView, type LevelView, type LockerModel, type RankModel, type RankView, type RivalsModel,
} from '../ui/model.ts';
import { markOf } from './matchModels.ts';

export function levelView(c: Career): LevelView {
  const l = levelOf(c.xp);
  return { level: l.level, into: l.into, need: l.need };
}

export function rankView(c: Career): RankView {
  const r = careerRank(c);
  return { index: r.step.index, tier: r.step.tier, step: r.step.step };
}

/** Every ability, the ones your level has reached unlocked. */
export function abilitiesModel(c: Career): AbilitiesModel {
  const open = new Set<string>(unlockedAbilities(c));
  return {
    active: c.active as ActiveId, passive: c.passive as PassiveId,
    abilities: ABILITIES.map((a) => ({ id: a.id, kind: a.kind, level: ABILITY_LEVEL[a.id], unlocked: open.has(a.id) })),
  };
}

const cosmeticView = (k: Cosmetic, level: number, bestTier: number): CosmeticView => ({
  id: k.id, kind: k.kind, ...(k.colour ? { colour: k.colour } : {}), rarity: rarityOf(k.unlock), unlock: k.unlock, unlocked: isUnlocked(k, level, bestTier),
});

export function lockerModel(c: Career): LockerModel {
  const level = careerLevel(c);
  return { cosmetics: COSMETICS.map((k) => cosmeticView(k, level, c.bestTier)), look: wornLook(c) };
}

/** The league's captains, rivals first, with your record against each. */
export function rivalsModel(c: Career): RivalsModel {
  return {
    rivals: rivalsOf(c).map((r) => ({
      ...markOf(r.captain.look), id: r.captain.id, rank: r.rank, active: r.captain.active, passive: r.captain.passive, sankYou: r.sankYou, sunkByYou: r.sunkByYou,
    })),
  };
}

export function rankModel(c: Career): RankModel {
  const level = careerLevel(c);
  return {
    rank: rankView(c), bestTier: c.bestTier,
    rewards: COSMETICS.filter((k) => k.unlock.by === 'rank').map((k) => cosmeticView(k, level, c.bestTier)),
  };
}
