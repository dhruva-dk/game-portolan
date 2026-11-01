// Game moments as the app sees them. The simulation adapter turns each tick's state.events into these, and the juice,
// sound, actors and HUD adapters read only these, so a change in the simulation's event shapes touches one file.
import type { V3 } from '../sim/math.ts';

export type WeaponClass = 'cannon' | 'scatter' | 'harpoon' | 'mortar' | 'repeater' | 'broadside';
export const WEAPON_CLASSES: readonly WeaponClass[] = ['cannon', 'scatter', 'harpoon', 'mortar', 'repeater', 'broadside'];

export type ConsumableKind = 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

export type Moment =
  | { k: 'fire'; ship: number; weapon: WeaponClass; rarity: number; pos: V3; dir: V3 }
  | { k: 'impact'; pos: V3; on: 'water' | 'land' | 'ship'; weapon: WeaponClass; ship: number }
  | {
    k: 'hit'; ship: number; by: number; shield: number; hull: number; crit: boolean; pos: V3; weapon: WeaponClass | 'storm' | 'ram' | 'fire' | 'other';
    /** Damage that comes tick by tick (burning, ash): counted, but too small and too often to juice. */
    steady?: boolean;
  }
  | { k: 'shieldBreak'; ship: number; by: number; pos: V3 }
  | { k: 'shieldUp'; ship: number; pos: V3 }
  | { k: 'sink'; ship: number; by: number; cause: string; pos: V3 }
  | { k: 'pickup'; ship: number; item: string; rarity: number; pos: V3 }
  | { k: 'drop'; ship: number; pos: V3 }
  | { k: 'gust'; ship: number; pos: V3 }
  | { k: 'reload'; ship: number; weapon: WeaponClass }
  | { k: 'empty'; ship: number }
  | { k: 'useStart'; ship: number; item: ConsumableKind; seconds: number }
  | { k: 'useDone'; ship: number; item: ConsumableKind }
  | { k: 'useCancel'; ship: number; item: ConsumableKind }
  | { k: 'ability'; ship: number; id: string; pos: V3 }
  | { k: 'stormPhase'; phase: number; seconds: number }
  | { k: 'stormHurt'; ship: number }
  | { k: 'galeDive'; ship: number; region: number; pos: V3 }
  | { k: 'landing'; ship: number; pos: V3 }
  | { k: 'deliveryCalled'; ship: number; pos: V3 }
  | { k: 'deliveryArrived'; ship: number; pos: V3 }
  | { k: 'coins'; ship: number; amount: number; pos: V3 }
  | { k: 'whaleBreach'; pos: V3 }
  | { k: 'whaleSurface'; pos: V3 }
  | { k: 'whaleDive'; pos: V3 }
  | { k: 'perk'; ship: number; perk: string; on: boolean }
  | { k: 'lightning'; pos: V3; warning: boolean }
  | { k: 'aground'; ship: number; pos: V3 }
  | { k: 'ram'; ship: number; by: number; pos: V3 }
  | { k: 'win'; ship: number };

export type MomentKind = Moment['k'];
