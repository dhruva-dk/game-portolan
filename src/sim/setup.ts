import type { GunKind } from './kinds.ts';

export type DriverStats = {
  gunnery: number;
  helm: number;
  nerve: number;
  territory: number;
  stormcraft: number;
  lookout: number;
};

export type ShipSpec = {
  team: number;
  slot: 0 | 1;
  standing: number;
  hands: 'player' | DriverStats;
  topSpeed: number;
  gather: number;
  turnRate: number;
  hullPoints: number;
  spreadFactor: number;
  reloadFactor: number;
  gun: GunKind;
  damageFactor: number;
  assistCone: number;
  gustCapacity: number;
  shieldRate: number;
  healTime: number;
  healFactor: number;
};

export type ShipValues = Omit<ShipSpec, 'team' | 'slot' | 'standing' | 'hands'>;

export type MatchSetup = {
  planet: string;
  match: number;
  storm: 1 | 2 | 3 | 4 | 5;
  heals: 1 | 2 | 3 | 4 | 5;
  ships: readonly ShipSpec[];
};
