// The ability catalogue. Every ship brings one active ability (on a button with a cooldown) and one passive
// into a match. Everyone starts with the same solid pair; later abilities are different, never stronger.
// The simulation owns the effects; the career owns when each one unlocks; the interface shows these names.
// Ids are stable: saves and captains refer to them. The last of each kind (Whale Call, Dark Lantern) are not earned by
// level but by finding a secret on the planet (secrets.ts).

export type ActiveId = 'repair' | 'smokeScreen' | 'ram' | 'reveal' | 'hardTurn' | 'decoy' | 'wave' | 'driftMine' | 'whaleCall';
export type PassiveId = 'salvage' | 'quickReload' | 'quickHands' | 'lightHull' | 'windReader' | 'stormWalker' | 'deepHold' | 'steadyAim' | 'darkLantern';
export type AbilityId = ActiveId | PassiveId;

export interface AbilityDef {
  id: AbilityId;
  kind: 'active' | 'passive';
  name: string;
  /** One plain sentence for the card. */
  text: string;
  /** Seconds between uses, for actives. */
  cooldown: number;
}

export const ABILITIES: readonly AbilityDef[] = [
  { id: 'repair', kind: 'active', name: 'Repair', text: 'Patch 30 hull over three seconds.', cooldown: 40 },
  { id: 'smokeScreen', kind: 'active', name: 'Smoke Screen', text: 'Pour out a cloud that hides you and blocks shots.', cooldown: 35 },
  { id: 'ram', kind: 'active', name: 'Ram', text: 'Surge forward and smash into the ship ahead.', cooldown: 30 },
  { id: 'reveal', kind: 'active', name: 'Reveal', text: 'Show every ship near you on the map.', cooldown: 45 },
  { id: 'hardTurn', kind: 'active', name: 'Hard Turn', text: 'Spin on the spot and come out fast.', cooldown: 20 },
  { id: 'decoy', kind: 'active', name: 'Decoy', text: 'Leave a ghost ship that sails on and draws fire.', cooldown: 40 },
  { id: 'wave', kind: 'active', name: 'Wave', text: 'Push a wave out that shoves nearby ships away.', cooldown: 35 },
  { id: 'driftMine', kind: 'active', name: 'Drift Mine', text: 'Drop a mine that bursts when a ship comes close.', cooldown: 30 },
  { id: 'whaleCall', kind: 'active', name: 'Whale Call', text: 'Call the whale up under the water you aim at: it breaches there a few seconds later.', cooldown: 70 },
  { id: 'salvage', kind: 'passive', name: 'Salvage', text: 'Sinking a ship refills some shield.', cooldown: 0 },
  { id: 'quickReload', kind: 'passive', name: 'Quick Reload', text: 'Reload 20% faster.', cooldown: 0 },
  { id: 'quickHands', kind: 'passive', name: 'Quick Hands', text: 'Use consumables 25% faster.', cooldown: 0 },
  { id: 'lightHull', kind: 'passive', name: 'Light Hull', text: 'Sail 5% faster and turn sharper.', cooldown: 0 },
  { id: 'windReader', kind: 'passive', name: 'Wind Reader', text: 'Lose less speed sailing upwind.', cooldown: 0 },
  { id: 'stormWalker', kind: 'passive', name: 'Storm Walker', text: 'Take less damage from the Storm.', cooldown: 0 },
  { id: 'deepHold', kind: 'passive', name: 'Deep Hold', text: 'Carry one more of every consumable.', cooldown: 0 },
  { id: 'steadyAim', kind: 'passive', name: 'Steady Aim', text: 'Your shots spread less while you turn.', cooldown: 0 },
  { id: 'darkLantern', kind: 'passive', name: 'Dark Lantern', text: 'At night, ships beyond close range cannot see you at all.', cooldown: 0 },
];

export const STARTER_ACTIVE: ActiveId = 'repair';
export const STARTER_PASSIVE: PassiveId = 'salvage';

export const ability = (id: AbilityId): AbilityDef => ABILITIES.find((a) => a.id === id)!;
