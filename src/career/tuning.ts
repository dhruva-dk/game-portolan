import type { DriverStats } from '../sim/setup.ts';

type Seasons = 1 | 2 | 3;

export const STAT_SPAN = { least: 1, most: 20 };

export const LEVEL_SPAN = { least: 0, most: 100 } as const;

export const LEAGUE = { teams: 40, shipsPerTeam: 2, racesPerSeason: 10 };

export const RACE_REPORT = { podium: 3 };

export const POINTS = {
  podium: [50, 44, 40],
  lastScoring: 40,
  scoringFrom: 41,
  perSinking: 2,
};

export const STANDING = { noRaceYet: 81 };

export const SHIPS = { leastLevel: 5 };

export const LEVEL_VALUES = {
  topSpeed: { line: 'sails', atZero: 20, atHundred: 45 },
  gather: { line: 'rigging', atZero: 0.9, atHundred: 2.0 },
  gustCapacity: { line: 'rigging', atZero: 3, atHundred: 8 },
  turnRate: { line: 'rudder', atZero: 0.45, atHundred: 0.8 },
  hullPoints: { line: 'hull', atZero: 80, atHundred: 200 },
  spreadFactor: { line: 'keel', atZero: 1.3, atHundred: 0.6 },
  reloadFactor: { line: 'mounts', atZero: 1.2, atHundred: 0.6 },
  damageFactor: { line: 'gun', atZero: 0.8, atHundred: 1.4 },
  assistCone: { line: 'gun', atZero: 0.06, atHundred: 0.1 },
} as const;

export const MECHANIC_VALUES = {
  shieldRate: { stat: 'shield', none: 1.5, base: 2, perPoint: 0.2 },
  healTime: { stat: 'healSpeed', none: 2.5, base: 2.2, perPoint: -0.07 },
  healFactor: { stat: 'healAmount', none: 0.8, base: 0.9, perPoint: 0.03 },
} as const;

export const STARS = { perStar: 4, steps: 2, most: 5 };

export const PERSON = {
  spikiness: { lo: 0, hi: 1 },
  shape: { lo: -1, hi: 1 },
  reach: 6,
  peakAge: { lo: 26, hi: 31 },
  retireAge: { lo: 36, hi: 42 },
};

export const AGEING = {
  young: { perYear: 0.05, floor: 0.5 },
  prime: 3,
  old: { perYear: 0.04, floor: 0.3 },
  perStop: 1,
  rookieAge: { lo: 18, hi: 21 },
  rookieLevel: { lo: 3, hi: 17 },
};

export const OWNERS = {
  level: { lo: 6, hi: 14 },
  cautious: { lo: 1, hi: 8 },
  sensible: { lo: 9, hi: 11 },
  bold: { lo: 12, hi: 20 },
};

export const STAND_IN: DriverStats = {
  gunnery: 2,
  helm: 1,
  nerve: 1,
  territory: 2,
  stormcraft: 1,
  lookout: 1,
};

export const HEADCOUNT = {
  staffAge: { lo: 20, hi: 37 },
  freeAgentsPerRole: 60,
  freeAgentLevel: { lo: 3, hi: 17 },
  freeAgentAge: { lo: 20, hi: 37 },
  belowRetirement: 1,
};

export const KNOWLEDGE = { spread: 3, offset: { lo: -1, hi: 1 } };

export const DEAL = { size: 3 };

export const SCOUTING = { reportPerStar: 200, leastReport: 100, approach: 500 };

export const WANTS = {
  money: { lo: 0.4, hi: 0.7 },
  leastStanding: 0.1,
  standingAndMoney: 0.9,
  wageFactor: { lo: 0.7, hi: 1.3 },
  preferred: [1, 2, 3] satisfies Seasons[],
  askPerStar: 60,
  askLeastStars: 0.5,
  askPower: 3,
  askStep: 10,
  leastAsk: 10,
  expectedWorst: 40,
  expectedSpan: 39,
  standingSpan: 20,
  standingScore: { lo: 0, hi: 1.2 },
  eligible: 0.5,
};

export const NEGOTIATION = {
  wage: { least: 10, most: 30000, step: 10 },
  seasons: { least: 1, most: 3 },
  fee: { least: 0, most: 50000, step: 100 },
  clause: { least: 0, most: 300000, step: 500 },
  standardClauseRaces: 10,
  feeWeight: 1.5,
  securitySpan: 2,
  clausePenalty: 0.1,
  signs: 1,
  counters: 0.85,
  counterTarget: 1.05,
  attempts: 3,
  bar: { lo: 0, hi: 1.5 },
};

export const CONTRACTS = {
  renewWithin: 10,
  releaseShare: 0.5,
  reserveRaces: 3,
};

export const GAIN = { focused: 1, unfocused: 0.5, perSkill: 4, falloff: 110 };

export const UNLOCK = { perSkill: 4, needed: 20 };

export const BUILD = {
  perLevel: 30,
  designScale: 25,
  thriftCut: 0.02,
  noThrift: 0,
  leastFit: 200,
};

export const START = { level: 5 };

export const RIVAL_SHIPS = { width: 30, builtWidth: 20, narrowing: 0.25 };

export const RACE_MONEY = {
  placePrize: 3000,
  prizeFrom: 81,
  prizeSpan: 80,
  prizePower: 2,
  perSinking: 150,
  seaPrize: 40000,
  seaSamples: 7,
  interest: 0.05,
};

export const SEASON_PRIZE = { prize: 60000, from: 41, span: 40, power: 2 };

export const REPOSSESSION = { below: -10000, balance: 1500 };

export const SPONSORS = {
  slots: 3,
  offers: 3,
  base: 100,
  top: 1400,
  from: 40,
  span: 39,
  power: 1.5,
  factor: { lo: 0.8, hi: 1.2 },
  step: 10,
  bonus: 2,
  races: { lo: 5, hi: 10 },
  topPlaces: 10,
  sinkings: 2,
  seaShare: 0.03,
};

export const REPAINT = { cost: 1000 };

export const YOUR_START = { balance: 1500 };

export const WINTER = { loss: 10, perUpkeep: 0.3, lossWithout: 11 };

export const LEAGUE_START = {
  strengthSpan: 38,
  design: { base: 10, perStrength: 70, jitter: 8 },
  fittedShortfall: { lo: 0, hi: 6 },
  staffLevel: { base: 4, perStrength: 12, jitter: 2 },
  contractRaces: [10, 20, 30],
  balance: { base: 2000, perStrength: 30000 },
  unlocksPerStrength: 4,
  sponsorRaces: { lo: 5, hi: 10 },
};

export const POLICY = {
  most: 40,
  emptySeatStars: -1,
  approachReputation: 10,
  approachChance: 0.1,
  signMargin: 0.5,
  approachMargin: 1,
  gunPerKind: 25,
  behindWeight: 1.5,
  aheadWeight: 1,
  sponsorBonusWeight: 0.5,
  cautious: { build: 12, share: 0.25, reserve: 6 },
  sensible: { build: 8, share: 0.4, reserve: 4 },
  bold: { build: 5, share: 0.6, reserve: 3 },
};

export const PAPER = { headlines: 5 };

export const NAMES = { longest: 16, teams: 60, sponsors: 60, planets: 200 };

export const RACE_RATINGS = [1, 2, 3, 4, 5] as const;

export const STAND_IN_RESULT = {
  seconds: 480,
  firstSinking: 30,
  sinkingSpan: 420,
  teammateAfloatShare: 8,
  phaseFourShare: 4,
  sampleSpacing: 8,
  playerStat: 10,
  shotsFired: 100,
  landedBase: 0.1,
  landedPerGunnery: 0.4,
  damagePerSinking: 100,
  damageSunk: 100,
  damageAfloat: 50,
  sea: 0.8,
};
