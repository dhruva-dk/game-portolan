// The kinds of gun, and of what lies on the water: named here once, for the sim, the seams, what draws them, the HUD
// and the sound alike. A leaf: it imports nothing.

/** The guns' kinds, in the one order they are told everywhere (the gunfire's shaders index them by it: gunOrder). */
export const KINDS = ['cannon', 'scatter', 'repeater', 'harpoon', 'mortar'] as const;
export type GunKind = (typeof KINDS)[number];

/** The stores a ship carries in her hold (sim/hold.ts). */
export type Use = 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

/** What a piece of loot is: a gun of a kind, or stores. */
export type LootKind = GunKind | Use;

const GUNS: ReadonlySet<LootKind> = new Set(KINDS);
/** Whether a piece of loot is a gun. */
export const isGun = (k: LootKind): k is GunKind => GUNS.has(k);

const ORDER = Object.fromEntries(KINDS.map((k, i) => [k, i])) as Record<GunKind, number>;
/** A gun's kind's place in KINDS. */
export const gunOrder = (k: GunKind): number => ORDER[k];
