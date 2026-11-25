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

function fingerprint(numbers: readonly number[]): string {
  const bytes = new Uint8Array(new Float64Array(numbers).buffer);
  let h = 0x811c9dc5;
  for (const b of bytes) h = Math.imul(h ^ b, 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

export function sealed(
  rest: Omit<MatchResult, 'hash'>,
  state: readonly number[]
): MatchResult {
  const n = [...state, rest.seconds, rest.ships.length];
  for (const s of rest.ships)
    n.push(
      s.place,
      s.sunkAt ?? -1,
      s.sunkBy ?? -1,
      s.sinkings,
      s.shotsFired,
      s.shotsLanded,
      s.damageDealt,
      s.damageTaken,
      s.afloatAtPhaseFour ? 1 : 0
    );
  n.push(rest.sea.length);
  for (const samples of rest.sea) n.push(samples.length, ...samples);
  return {
    seconds: rest.seconds,
    hash: fingerprint(n),
    ships: rest.ships,
    sea: rest.sea,
  };
}
