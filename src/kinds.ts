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

export const STORES = [
  'smallShield',
  'repairKit',
  'bigShield',
  'fullRepair',
] as const;
export type Use = (typeof STORES)[number];

export type LootKind = GunKind | Use;

const GUNS: ReadonlySet<LootKind> = new Set(KINDS);
export const isGun = (k: LootKind): k is GunKind => GUNS.has(k);

const ORDER = perKind((k) => KINDS.indexOf(k));
export const gunOrder = (k: GunKind): number => ORDER[k];
