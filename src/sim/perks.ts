// Who has what: region perks (held by holding a landmark) and abilities (one active and one passive per ship).
import { ABILITIES, type ActiveId, type PassiveId } from './abilities.ts';
import type { Ship } from './state.ts';
import { REGIONS, type PerkId } from './world/index.ts';

/** Each perk's bit in Ship.perks: the index of the region whose landmark gives it. */
export const PERK = ((): Readonly<Record<PerkId, number>> => {
  const out = {} as Record<PerkId, number>;
  for (let i = 0; i < REGIONS.length; i++) out[REGIONS[i].perk] = i;
  return out;
})();

export const hasPerk = (ship: Ship, perk: PerkId): boolean => (ship.perks & (1 << PERK[perk])) !== 0;

/** Actives and passives in catalogue order; Ship.active and Ship.passive index these. */
export const ACTIVES: readonly ActiveId[] = ABILITIES.filter((a) => a.kind === 'active').map((a) => a.id as ActiveId);
export const PASSIVES: readonly PassiveId[] = ABILITIES.filter((a) => a.kind === 'passive').map((a) => a.id as PassiveId);

export const activeIndex = (id: ActiveId): number => ACTIVES.indexOf(id);
export const passiveIndex = (id: PassiveId): number => PASSIVES.indexOf(id);

export const activeOf = (ship: Ship): ActiveId => ACTIVES[ship.active] ?? 'repair';
export const passiveOf = (ship: Ship): PassiveId => PASSIVES[ship.passive] ?? 'salvage';
export const hasPassive = (ship: Ship, id: PassiveId): boolean => PASSIVES[ship.passive] === id;
export const hasActive = (ship: Ship, id: ActiveId): boolean => ACTIVES[ship.active] === id;

export const cooldownOf = (id: ActiveId): number => {
  for (const a of ABILITIES) if (a.id === id) return a.cooldown;
  return 30;
};
