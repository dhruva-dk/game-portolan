// Game moments as the app sees them. The simulation adapter turns each tick's state.events into these, and the juice,
// sound, actors and HUD adapters read only these, so a change in the simulation's event shapes touches one file.
import type { V3 } from '../sim/math.ts';

export type WeaponClass = 'cannon' | 'scatter' | 'harpoon' | 'mortar' | 'repeater' | 'broadside' | 'chain' | 'heated';
export const WEAPON_CLASSES: readonly WeaponClass[] = ['cannon', 'scatter', 'harpoon', 'mortar', 'repeater', 'broadside', 'chain', 'heated'];

/** The parts of a ship a shot struck: aloft (canvas and mast), at the waterline, the rudder; and whether it raked her. */
export interface Struck { sail: boolean; waterline: boolean; rudder: boolean; rake: boolean }

export type ConsumableKind = 'smallShield' | 'bigShield' | 'repairKit' | 'fullRepair';

export type Moment =
  | { k: 'fire'; ship: number; weapon: WeaponClass; rarity: number; pos: V3; dir: V3 }
  | { k: 'impact'; pos: V3; on: 'water' | 'land' | 'ship'; weapon: WeaponClass; ship: number; by: number; struck?: Struck }
  | {
    k: 'hit'; ship: number; by: number; shield: number; hull: number; crit: boolean; pos: V3;
    weapon: WeaponClass | 'storm' | 'ram' | 'fire' | 'flood' | 'other';
    /** A shot down her length. */
    rake?: boolean;
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
  /** A region's own event warned, started or ended: seconds of warning, or how long it runs. */
  | { k: 'regionEvent'; region: number; phase: 'warn' | 'start' | 'end'; seconds: number; pos: V3 }
  /** Cinder Peak threw a bomb (pos where it will land, seconds in the air), or it landed. */
  | { k: 'lavaBomb'; pos: V3; landed: boolean; seconds: number }
  /** The mainmast went over the side (side +1 starboard), brought down by `by`; a jury mast stands in its place. */
  | { k: 'mastFall'; ship: number; by: number; side: number; pos: V3 }
  | { k: 'juryRig'; ship: number; pos: V3 }
  /** A ship set burning: by a hit, or (`spread`) by the fire leaping from a ship upwind. */
  | { k: 'ablaze'; ship: number; by: number; spread: boolean; pos: V3 }
  /** The weather put a ship's fire out, or (`shot`) quenched a heated shot as it struck. */
  | { k: 'quench'; ship: number; shot: boolean; pos: V3 }
  | { k: 'win'; ship: number }
  /** The player found a secret of the planet: its index into SECRETS. */
  | { k: 'secret'; ship: number; secret: number; pos: V3 }
  /** On a voyage, a wreck sails again. */
  | { k: 'refit'; ship: number; pos: V3 };

export type MomentKind = Moment['k'];
