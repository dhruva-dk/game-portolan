export const KINDS = [
  'cannon',
  'scatter',
  'repeater',
  'harpoon',
  'mortar',
] as const;
export type GunKind = (typeof KINDS)[number];

export const perKind = <T>(f: (k: GunKind) => T): Record<GunKind, T> => ({
  cannon: f('cannon'),
  scatter: f('scatter'),
  repeater: f('repeater'),
  harpoon: f('harpoon'),
  mortar: f('mortar'),
});

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export type Rarity = (typeof RARITIES)[number];

export const rankOf = (r: Rarity): number => RARITIES.indexOf(r);

const ORDER = perKind((k) => KINDS.indexOf(k));
export const gunOrder = (k: GunKind): number => ORDER[k];
