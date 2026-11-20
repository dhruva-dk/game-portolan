// The kinds of gun, and of what lies on the water: named here once, for the
// sim, the seams, what draws them, the HUD and the sound alike. A leaf: it
// imports nothing.

/**
 * The guns' kinds, in the one order they are told everywhere (the gunfire's
 * shaders index them by it: gunOrder).
 */
export const KINDS = [
  'cannon',
  'scatter',
  'repeater',
  'harpoon',
  'mortar',
] as const;
export type GunKind = (typeof KINDS)[number];

/** A record of `f` for each kind of gun, made in KINDS' order. */
export const perKind = <T>(f: (k: GunKind) => T): Record<GunKind, T> => ({
  cannon: f('cannon'),
  scatter: f('scatter'),
  repeater: f('repeater'),
  harpoon: f('harpoon'),
  mortar: f('mortar'),
});

/**
 * The stores a ship carries in her hold (sim/hold.ts), in the order the loot's
 * shares of them are drawn (sim/loot.ts).
 */
export const STORES = [
  'smallShield',
  'repairKit',
  'bigShield',
  'fullRepair',
] as const;
export type Use = (typeof STORES)[number];

/** What a piece of loot is: a gun of a kind, or stores. */
export type LootKind = GunKind | Use;

const GUNS: ReadonlySet<LootKind> = new Set(KINDS);
/** Whether a piece of loot is a gun. */
export const isGun = (k: LootKind): k is GunKind => GUNS.has(k);

const ORDER = perKind((k) => KINDS.indexOf(k));
/** A gun's kind's place in KINDS. */
export const gunOrder = (k: GunKind): number => ORDER[k];
