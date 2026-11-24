import type { DriverStats, MatchSetup, ShipSpec, ShipValues } from './setup.ts';

export const EVEN = {
  teams: { least: 2, most: 40 },
  standing: { best: 1, worst: 40 },
} as const;

export type EvenOptions = {
  planet: string;
  match: number;
  storm: MatchSetup['storm'];
  heals: MatchSetup['heals'];
  teams?: number;
  perTeam?: 1 | 2;
  values: ShipValues | ((ship: number) => ShipValues);
  stats: DriverStats | ((ship: number) => DriverStats);
  standings?: readonly number[];
  player?: boolean;
};

const SLOTS = [0, 1] as const;

const isWhole = (n: number, least: number, most: number): boolean =>
  Number.isInteger(n) && n >= least && n <= most;

function checked(
  teams: number,
  perTeam: number,
  standings: readonly number[] | undefined
): void {
  if (!isWhole(teams, EVEN.teams.least, EVEN.teams.most)) {
    throw new RangeError(
      `teams must be a whole number from ${EVEN.teams.least} to ${EVEN.teams.most}, not ${teams}`
    );
  }
  if (perTeam !== 1 && perTeam !== 2) {
    throw new RangeError(`perTeam must be 1 or 2, not ${perTeam}`);
  }
  if (standings === undefined) return;
  if (standings.length !== teams) {
    throw new RangeError(
      `standings must have one entry per team: ${standings.length} for ${teams} teams`
    );
  }
  const wrong = standings.find(
    (s) => !isWhole(s, EVEN.standing.best, EVEN.standing.worst)
  );
  if (wrong !== undefined) {
    throw new RangeError(
      `a standing is a whole number from ${EVEN.standing.best} to ${EVEN.standing.worst}, not ${wrong}`
    );
  }
}

function spec(
  team: number,
  slot: 0 | 1,
  standing: number,
  hands: ShipSpec['hands'],
  v: ShipValues
): ShipSpec {
  return {
    team,
    slot,
    standing,
    hands,
    topSpeed: v.topSpeed,
    gather: v.gather,
    turnRate: v.turnRate,
    hullPoints: v.hullPoints,
    spreadFactor: v.spreadFactor,
    reloadFactor: v.reloadFactor,
    gun: v.gun,
    damageFactor: v.damageFactor,
    assistCone: v.assistCone,
    gustCapacity: v.gustCapacity,
    shieldRate: v.shieldRate,
    healTime: v.healTime,
    healFactor: v.healFactor,
  };
}

export function evenSetup(options: EvenOptions): MatchSetup {
  const {
    planet,
    match,
    storm,
    heals,
    teams = EVEN.teams.most,
    perTeam = 2,
    values,
    stats,
    standings,
    player = false,
  } = options;
  checked(teams, perTeam, standings);
  const valuesOf = (ship: number): ShipValues =>
    typeof values === 'function' ? values(ship) : values;
  const statsOf = (ship: number): DriverStats => ({
    ...(typeof stats === 'function' ? stats(ship) : stats),
  });
  const ships: ShipSpec[] = [];
  for (let team = 0; team < teams; team++) {
    const standing = standings?.[team] ?? team + EVEN.standing.best;
    for (const slot of SLOTS.slice(0, perTeam)) {
      const ship = ships.length;
      const hands = player && ship === 0 ? 'player' : statsOf(ship);
      ships.push(spec(team, slot, standing, hands, valuesOf(ship)));
    }
  }
  return { planet, match, storm, heals, ships };
}
