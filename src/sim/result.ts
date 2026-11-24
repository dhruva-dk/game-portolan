export type ShipResult = {
  place: number;
  sunkAt: number | null;
  sunkBy: number | null;
  sinkings: number;
  shotsFired: number;
  shotsLanded: number;
  damageDealt: number;
  damageTaken: number;
  afloatAtPhaseFour: boolean;
};

export type MatchResult = {
  seconds: number;
  hash: string;
  ships: readonly ShipResult[];
  sea: readonly (readonly number[])[];
};
