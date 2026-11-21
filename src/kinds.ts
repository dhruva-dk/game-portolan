// The kinds of gun, of what lies on the water, and of a ship's zones and their
// faults: named here once, for the sim, the seams, what draws them, the HUD and
// the sound alike. A leaf: it imports nothing.

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

/**
 * A ship's four zones, where a blow lands on her (sim/faults.ts), in the one
 * order they are told everywhere: aloft, her stern, her side low, her deck.
 */
export const ZONES = ['rigging', 'rudder', 'waterline', 'deck'] as const;
export type Zone = (typeof ZONES)[number];
/** A zone's fault: none, minor, major. */
export type Fault = 0 | 1 | 2;
/** One number for each zone, in ZONES' order; a fault for each. */
export type Zones<T> = readonly [T, T, T, T];
export type Faults = Zones<Fault>;
/** No zone faulted. */
export const SOUND: Faults = [0, 0, 0, 0];

const ORDER = perKind((k) => KINDS.indexOf(k));
/** A gun's kind's place in KINDS. */
export const gunOrder = (k: GunKind): number => ORDER[k];
