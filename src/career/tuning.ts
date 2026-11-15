// Every starting value of the career, in one table, so the owner tunes it in one place (epic section 0.2). A save's
// journal entries carry the TUNING_VERSION they were written under (D36): change a number here and bump the version
// (tests/career-tuning.test.ts pins a hash of TUNING to it), so a journal written under other numbers is never
// replayed whole as if it were this one's.
//
// A pair [a, b] is a line in u = stat / 20: a + b × u. A triple by league is League One's, Two's, Three's.

/** Bump with any change to TUNING (and pin the new hash in the test). */
export const TUNING_VERSION = 2;

const ROLE_YEARS = {
  manager: [40, 55], captain: [26, 31], bosun: [28, 34], flight: [28, 34], shipwright: [35, 45], scout: [35, 45], elder: [45, 60],
} as const;

export const TUNING = {
  /** The calendar (Phase B section 13): ten races fourteen days apart, then thirty days off. One season is one year of a gull's age. */
  calendar: { rounds: 10, gap: 14, off: 30 },

  /** The world at the start (Phase B section 3, epic section 5). */
  world: {
    leagues: 3,
    crews: 40,
    emblems: 12,
    colonies: 40,
    free: 300,                                       // free agents across every role
    freeManagers: 30,                                // of them, managers
    /** The share of the other free agents in each role. */
    freeRoles: { captain: 0.3, bosun: 0.15, shipwright: 0.1, scout: 0.12, flight: 0.33 },
    flight: 4,                                       // flight gulls a crew
    bosuns: 2,                                       // one a ship
    /** A crew's staff stars by league, and the seeded spread about them (± half of it). */
    stars: [3.5, 2.5, 1.75],
    starSpread: 1,
    /** Free agents' stars and spread. */
    freeStars: 2,
    freeSpread: 2,
    /** How far each stat lies from its gull's mean (± this, by seed). */
    statSpread: 3,
    /** The young (under the role's peak) lie this many stars below their potential a year short of peak, up to the cap. */
    youthGap: 0.35,
    youthGapMost: 2,
    /** Each gull has 0 to 3 traits; the chance of each further trait. */
    traitChance: 0.35,
  },

  /** Ages at the start, and peaks and retirements (Phase B section 2.2), in years. */
  ages: {
    start: { manager: [36, 64], captain: [18, 38], bosun: [22, 50], flight: [19, 40], shipwright: [26, 60], scout: [26, 60], elder: [50, 76] },
    peak: ROLE_YEARS,
    retire: { manager: [58, 70], captain: [34, 40], bosun: [45, 55], flight: [36, 42], shipwright: [55, 65], scout: [55, 65], elder: [70, 80] },
    young: [16, 19],                                 // the new gulls each season
  },

  /** Growth at each season's end (Phase B section 2.2). */
  growth: {
    rate: 0.35,                                      // of improvability × school × the gap to potential
    decline: 0.3,                                    // lost a stat a year past peak, plus
    declineYear: 0.2,                                //   this for each year past peak
    spread: 0.3,                                     // each stat's share by seed: 1 ± this
    school: [1, 1.25, 1.5],                          // the role's building, by level
    mentor: 0.25,                                    // growth added (as a share) to a Mentor's crew's captains under mentorAge
    mentorAge: 22,
    stamina: 0.2,                                    // a captain's Stamina grows this more a season a sailing school level
  },

  /** Morale (Phase B section 2.3), 0 to 100. */
  morale: {
    start: 60,
    result: 6,                                       // most a race moves it by the result against the crew's target
    resultPerPlace: 2,                               //   this a place, to that most
    status: 2,                                       // a race on ship two, or off it as reserve, for a captain who wants status
    silence: 10,                                     // no renewal offered in the contract's last days, once
    silenceDays: 60,
    renewal: 10,
    wage: [-2, 2],                                   // most a race moves it by wage against ask, each way
    wagePerShare: 4,                                 //   this per share of the ask above or below it
    bond: 0.5,                                       // a race, per bond level, for the bosun and her captain
    effect: 50,                                      // stats shift (morale − 50) / this
    leave: 25,                                       // below: asks to leave, refuses renewal
    content: 80,                                     // above: renewal asks less by
    contentDiscount: 0.1,
  },

  /** Form (Phase B section 2.3): a captain's stats shift by up to this × (1 − u Consistency) for a race. */
  form: 3,

  /** Injury (Phase B section 2.3). */
  injury: { chance: 0.04, races: [1, 3] },

  /** Traits' numbers (career/traits.ts). */
  traits: {
    most: 3,
    gain: 0.08,                                      // chance a season's end gives a trait, if under most
    lose: 0.06,                                      // chance a season's end takes one
    pay: 0.6,                                        // a Pay Captain brings this × marketability Coin a race
  },

  /** What each role's stats do (Phase B section 2.1). */
  captain: { feedback: 30 },
  bosun: {
    repairs: [0.7, 0.6], mending: [0.7, 0.6], concentration: [1.3, -0.6], leadership: [1.3, -0.6], leadershipMorale: 4,
    arrive: 4, handling: [1.25, -0.5], reliability: [0.8, 0.4], perf: [0.8, 0.4], chemistry: [1, 1],
  },
  bond: { levels: [5, 12, 20], sooner: 1, gustRecharge: 0.9 },
  shipwright: { start: 8, innovation: [0.2, 0.6], speed: [1.3, -0.6], accuracy: 0.15, knows: 3 },
  scout: {
    width: [0.5, 2], centre: 1, potentialScouted: 1.5, traitAt: 14, reachAdjacent: 7, reachAll: 14,
    days: 14, speed: [1.3, -0.6], persuasionDays: 30, nest: [1, 0.85, 0.7],
  },
  flight: {
    weights: {
      mend: { strength: 0.6, speed: 0.4 }, gust: { speed: 0.6, teamwork: 0.4 },
      stores: { speed: 0.5, precision: 0.5 }, part: { precision: 0.7, teamwork: 0.3 },
    },
    base: 0.5, tired: 0.3, botch: 0.25, botchTired: 0.25, stamina: 25, staminaOver: 1.5, recovery: 10,
  },

  /** What a rival manager's stats do (Phase B section 6). */
  manager: {
    negotiation: [1.1, -0.3],                        // bids at the ask × this
    talentEye: [0.2, 0.6],                           // the weight on potential over stars in a gull's worth
    finance: [0.25, 0.5],                            // the share of coin above the floor it will commit
    development: [0.5, 2],                           // how sharply the yard's points go to the worst-ranked parts (an exponent)
    tactics: [0.4, 0.6],                             // the chance the race plan takes its best choice
  },
  /** What an elder's stats do (Phase B section 7). */
  elder: {
    ambition: 3,                                     // places the target is moved up, × u
    perPlace: 1.5, fall: -8, rise: 6,                // confidence a race: clamp(perPlace × (target − standing), fall, rise)
    patience: [1.3, -0.6],                           // a fall × this
    debt: -3, pastFloor: -10,                        // a race while coin is below zero, past the floor
    generosity: 0.3,                                 // Coin added at the season's start, × u × the league's budget
    floor: [0.3, 0.4],                               // the debt floor, × the league's budget, below zero
    meddling: [0.2, 0.6],                            // the chance an elder's dilemma is the one drawn
    words: [75, 50, 25],                             // confidence crossing these sends the elder's word
    missedBy: 5,                                     // places past the target at the season's end that sack the manager
    fit: [55, 30, 0],                                // the manager's reputation an elder looks for, by league
    jobs: [70, 45, 0],                               // the player's reputation a league's crews offer their post at
    ambitious: 14,                                   // an elder's Ambition at or above which, at the season's end, they court a better manager
    offerDays: 7,                                    // a job offer stands this long
  },

  /** Rival managers' decisions (Phase B section 6), and what each personality weighs. */
  rivals: {
    review: 7,                                       // days between a crew's reviews, staggered by crew id
    better: 1, betterGambler: 0.5,                   // stars a known candidate must be better by to replace the weakest
    bigBid: 1.1,                                     // a gambler's bids × this
    counterMost: 1.25,                               // a counter is met if its wage is at most the ask × this, and payable
    breakRaces: 12,                                  // a rival's break clause, in races' wage; none at Negotiation u ≥ 0.5
    renewBelow: 0.75,                                // renews staff whose worth is at least this share of the best of their role on the crew
    openFirst: 3,                                    // worth added, in scouting, to a candidate for an open post: open posts are scouted first
    /** Each personality's weights over the section 6 table's rows (higher acts first), the share of its Finance
     *  commitment it spends, and the contract length it offers the young (under the market's young age) and others. */
    personalities: {
      spender: { order: { fill: 3, build: 2.8, replace: 2.5, design: 2.2, renew: 2, patrons: 1.8, yard: 1.6, poach: 1.5, scout: 1 }, spend: 1.3, young: 2, other: 2 },
      youthBuilder: { order: { fill: 3, renew: 2.5, scout: 2.2, yard: 2, design: 1.8, patrons: 1.7, replace: 1.5, build: 1.2, poach: 1 }, spend: 1, young: 3, other: 2 },
      poacher: { order: { poach: 3.2, fill: 3, replace: 2, patrons: 1.8, renew: 1.5, yard: 1.4, design: 1.3, scout: 1, build: 0.8 }, spend: 1.1, young: 1, other: 1 },
      engineer: { order: { yard: 3.5, design: 3.4, fill: 3, build: 2.4, renew: 2, patrons: 1.6, replace: 1.5, scout: 1, poach: 0.5 }, spend: 0.9, young: 2, other: 2 },
      gambler: { order: { fill: 3, replace: 2.6, design: 2.5, poach: 2, yard: 1.8, scout: 1.5, patrons: 1.4, build: 1.2, renew: 1 }, spend: 1.2, young: 1, other: 2 },
      steady: { order: { fill: 3, renew: 2.5, patrons: 2.2, yard: 2, design: 1.6, replace: 1.5, scout: 1.2, build: 1, poach: 0.5 }, spend: 0.7, young: 2, other: 3 },
    },
    talentYouth: 0.2,                                // a youth builder's Talent Eye weight on potential, added
  },

  /** The market (Phase B section 5). */
  market: {
    answerDays: 2,                                   // a gull answers an offer this long after it is made
    approachDays: 7,                                 // an approach to another crew's gull is answered this long after
    counterDays: 7,                                  // a counter stands this long
    accept: 1, counterFrom: 0.85, most: 1.2,         // the score that accepts, that counters; a want's most
    weights: [0.5, 0.3, 0.2],                        // the three wants' weights, first most
    lowball: 0.8,                                    // a wage below this share of the ask costs a patience
    silentDays: 30,                                  // with patience gone they will not talk for this long
    patienceMost: 4,                                 // patience with a scout's Persuasion
    closingDays: 60,                                 // a contract's last days, in which others may approach
    silenceDays: 30,                                 // into those days with no renewal offered, morale pays once
    expect: { podium: 0.06, sinking: 0.4 },          // the podiums and sinkings a race an offer's bonuses are worth
    reserve: 0.3,                                    // status's score for a captain offered the reserve
    leagueBelow: 0.6, leagueFree: 0.4,               // league's score one below their level; two below when out of contract
    levelStars: [3, 2.1],                            // a free agent's level by stars: League One at or above the first, Two the second
    ambitionSpan: 50,                                // ambition: 1 at the crew's reputation equal to theirs, ± this per 1
    securityStep: 0.35,                              // security's score lost a season from the length they ask
    away: 0.5,                                       // home's score at a crew of another colony
    young: { count: 150, stars: [0.5, 1.5] },        // new gulls each season (ages TUNING.ages.young)
  },

  /** Wages (Phase B section 5): base a race by role, × 1.6^stars × league × (1 + marketability / 200). */
  wage: {
    base: { manager: 30, captain: 40, bosun: 20, shipwright: 25, scout: 15, flight: 10, elder: 0 },
    growth: 1.6, league: [2, 1.3, 1], market: 200, feeRaces: 4,
    /** Contract length in seasons at the start, by age: under young, under old, older. */
    young: 24, old: 32, lengths: [1, 2, 3],
  },

  /** Marketability (Phase B section 10) at the start, 0 to 100: base + stars × perStar + youth (under youthAge), ± spread. */
  marketability: { base: 8, perStar: 12, youth: 8, youthAge: 23, spread: 10 },

  /** A crew at the start, by league. */
  crew: {
    coin: [4000, 2200, 1200],
    budget: [6000, 3500, 2000],
    reputation: [70, 45, 20],
    reputationSpread: 16,
    confidence: 70,
    buildings: [2, 1.5, 1],                          // mean level, by seed: each building 1 to 3
    /** Starting parts' performance by league (0..1000), its spread, the headroom to the maximum, reliability and its headroom. */
    parts: { perf: [620, 470, 330], spread: 60, headroom: 120, reliability: [0.82, 0.74, 0.66], reliabilityHeadroom: 0.1 },
    /** A manager's reputation at the start, by league, ± half the spread. */
    managerReputation: [65, 40, 18],
    managerSpread: 20,
  },

  /** Each league's rules at the start (race.ts Rules). */
  rules: { spec: [], pace: 1, banned: [], pointsPerSinking: 1, seaHeldPoint: true, prizeSpread: 1, inspection: 1 / 3 },
  /** A planet's storm pace, drawn in this range at the season's making, to the nearest step. */
  planetPace: { lo: 0.8, hi: 1.25, step: 0.05 },
  /** Starting contracts: the share with a break clause, its size in races' wage, and a captain's podium bonus in races' wage. */
  contracts: { breakShare: 0.5, breakRaces: [8, 20], podium: 0.5, sinking: 0.1 },

  /** The player at founding: their manager's reputation, and the longest names they may give. */
  player: { reputation: 10, crewName: 32, gullName: 20, age: 35 },

  /** A gull's patience in talks (Phase B section 5). */
  patience: 3,
} as const;

export type Tuning = typeof TUNING;
