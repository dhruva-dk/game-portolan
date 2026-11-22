// Every starting value of the career, in one table, so the owner tunes it in one place (epic section 0.2). A save's
// journal entries carry the TUNING_VERSION they were written under (D36): change a number here and bump the version
// (tests/career-tuning.test.ts pins a hash of TUNING to it), so a journal written under other numbers is never
// replayed whole as if it were this one's.
//
// A pair [a, b] is a line in u = stat / 20: a + b × u. A triple by league is League One's, Two's, Three's.

/** Bump with any change to TUNING (and pin the new hash in the test). */
export const TUNING_VERSION = 5;

const ROLE_YEARS = {
  manager: [40, 55],
  captain: [26, 31],
  bosun: [28, 34],
  flight: [28, 34],
  shipwright: [35, 45],
  scout: [35, 45],
  elder: [45, 60],
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
    free: 300, // free agents across every role
    freeManagers: 30, // of them, managers
    /** The share of the other free agents in each role. */
    freeRoles: {
      captain: 0.3,
      bosun: 0.15,
      shipwright: 0.1,
      scout: 0.12,
      flight: 0.33,
    },
    flight: 4, // flight gulls a crew
    bosuns: 2, // one a ship
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
    start: {
      manager: [36, 64],
      captain: [18, 38],
      bosun: [22, 50],
      flight: [19, 40],
      shipwright: [26, 60],
      scout: [26, 60],
      elder: [50, 76],
    },
    peak: ROLE_YEARS,
    retire: {
      manager: [58, 70],
      captain: [34, 40],
      bosun: [45, 55],
      flight: [36, 42],
      shipwright: [55, 65],
      scout: [55, 65],
      elder: [70, 80],
    },
    young: [16, 19], // the new gulls each season
  },

  /** Growth at each season's end (Phase B section 2.2). */
  growth: {
    rate: 0.35, // of improvability × school × the gap to potential
    decline: 0.3, // lost a stat a year past peak, plus
    declineYear: 0.2, //   this for each year past peak
    spread: 0.3, // each stat's share by seed: 1 ± this
    school: [1, 1.25, 1.5], // the role's building, by level
    mentor: 0.25, // growth added (as a share) to a Mentor's crew's captains under mentorAge
    mentorAge: 22,
    stamina: 0.2, // a captain's Stamina grows this more a season a sailing school level
  },

  /** Morale (Phase B section 2.3), 0 to 100. */
  morale: {
    start: 60,
    result: 6, // most a race moves it by the result against the crew's target
    resultPerPlace: 2, //   this a place, to that most
    status: 2, // a race on ship two, or off it as reserve, for a captain who wants status
    silence: 10, // no renewal offered in the contract's last days, once
    silenceDays: 60,
    renewal: 10,
    wage: [-2, 2], // most a race moves it by wage against ask, each way
    wagePerShare: 4, //   this per share of the ask above or below it
    bond: 0.5, // a race, per bond level, for the bosun and her captain
    effect: 50, // stats shift (morale − 50) / this
    leave: 25, // below: asks to leave, refuses renewal
    content: 80, // above: renewal asks less by
    contentDiscount: 0.1,
  },

  /** Form (Phase B section 2.3): a captain's stats shift by up to this × (1 − u Consistency) for a race. */
  form: 3,

  /** Injury (Phase B section 2.3). */
  injury: { chance: 0.04, races: [1, 3] },

  /** Traits' numbers (career/traits.ts). */
  traits: {
    most: 3,
    gain: 0.08, // chance a season's end gives a trait, if under most
    lose: 0.06, // chance a season's end takes one
    pay: 0.6, // a Pay Captain brings this × marketability Coin a race
  },

  /** What each role's stats do (Phase B section 2.1). */
  captain: { feedback: 30 },
  bosun: {
    repairs: [0.7, 0.6],
    mending: [0.7, 0.6],
    concentration: [1.3, -0.6],
    leadership: [1.3, -0.6],
    leadershipMorale: 4,
    arrive: 4,
    handling: [1.25, -0.5],
    reliability: [0.8, 0.4],
    perf: [0.8, 0.4],
    chemistry: [1, 1],
  },
  bond: { levels: [5, 12, 20], sooner: 1, gustRecharge: 0.9 },
  shipwright: {
    start: 8,
    innovation: [0.2, 0.6],
    speed: [1.3, -0.6],
    accuracy: 0.15,
    knows: 3,
  },
  scout: {
    width: [0.5, 2],
    centre: 1,
    potentialScouted: 1.5,
    traitAt: 14,
    reachAdjacent: 7,
    reachAll: 14,
    days: 14,
    speed: [1.3, -0.6],
    persuasionDays: 30,
    nest: [1, 0.85, 0.7],
  },
  flight: {
    weights: {
      mend: { strength: 0.6, speed: 0.4 },
      gust: { speed: 0.6, teamwork: 0.4 },
      stores: { speed: 0.5, precision: 0.5 },
      part: { precision: 0.7, teamwork: 0.3 },
    },
    base: 0.5,
    tired: 0.3,
    botch: 0.25,
    botchTired: 0.25,
    stamina: 25,
    staminaOver: 1.5,
    recovery: 10,
  },

  /** What a rival manager's stats do (Phase B section 6). */
  manager: {
    negotiation: [1.1, -0.3], // bids at the ask × this
    talentEye: [0.2, 0.6], // the weight on potential over stars in a gull's worth
    finance: [0.25, 0.5], // the share of coin above the floor it will commit
    development: [0.5, 2], // how sharply the yard's points go to the worst-ranked parts (an exponent)
    tactics: [0.4, 0.6], // the chance the race plan takes its best choice
  },
  /** What an elder's stats do (Phase B section 7). */
  elder: {
    ambition: 3, // places the target is moved up, × u
    perPlace: 0.6,
    fall: -4,
    rise: 4, // confidence a race: perPlace a place past the slack (to fall) or ahead (to rise)
    slack: 3, // places behind the target an elder lets pass
    met: 1, // confidence a race at or above the target
    settle: 5, // races before the standings weigh in full (the first weighs 1/settle)
    patience: [1.3, -0.6], // a fall × this
    recover: 0.25, // at a season's start confidence moves this share back toward the start's
    verdict: 35, // at the season's end a target missed sacks only below this confidence
    grace: 0.5, // seasons a new manager serves before they can be sacked
    debt: 0,
    pastFloor: -0.5, // a race while coin is below zero, past the floor
    generosity: 0.3, // Coin added at the season's start, × u × the league's budget
    floor: [0.3, 0.4], // the debt floor, × the league's budget, below zero
    meddling: [0.2, 0.6], // the chance an elder's dilemma is the one drawn
    words: [75, 50, 25], // confidence crossing these sends the elder's word
    missedBy: 5, // places past the target at the season's end that sack the manager
    fit: [55, 30, 0], // the manager's reputation an elder looks for, by league
    jobs: [70, 45, 0], // the player's reputation a league's crews offer their post at
    ambitious: 14, // an elder's Ambition at or above which, at the season's end, they court a better manager
    offerDays: 7, // a job offer stands this long
    standing: 2, // the most job offers standing at once while the player has a crew
  },

  /** Rival managers' decisions (Phase B section 6), and what each personality weighs. */
  rivals: {
    review: 7, // days between a crew's reviews, staggered by crew id
    better: 1,
    betterGambler: 0.5, // stars a known candidate must be better by to replace the weakest
    bigBid: 1.1, // a gambler's bids × this
    counterMost: 1.25, // a counter is met if its wage is at most the ask × this, and payable
    breakRaces: 12, // a rival's break clause, in races' wage; none at Negotiation u ≥ 0.5
    renewBelow: 0.75, // renews staff whose worth is at least this share of the best of their role on the crew
    openFirst: 3, // worth added, in scouting, to a candidate for an open post: open posts are scouted first
    scoutLooks: 240, // the most candidates a review's scouting looks over (an even sample of a crowded market)
    /** Each personality's weights over the section 6 table's rows (higher acts first), the share of its Finance
     *  commitment it spends, and the contract length it offers the young (under the market's young age) and others. */
    personalities: {
      spender: {
        order: {
          fill: 3,
          build: 2.8,
          replace: 2.5,
          design: 2.2,
          renew: 2,
          patrons: 1.8,
          yard: 1.6,
          poach: 1.5,
          scout: 1,
          suppliers: 0.6,
          vote: 0.5,
        },
        spend: 1.3,
        young: 2,
        other: 2,
      },
      youthBuilder: {
        order: {
          fill: 3,
          renew: 2.5,
          scout: 2.2,
          yard: 2,
          design: 1.8,
          patrons: 1.7,
          replace: 1.5,
          build: 1.2,
          poach: 1,
          suppliers: 0.6,
          vote: 0.5,
        },
        spend: 1,
        young: 3,
        other: 2,
      },
      poacher: {
        order: {
          poach: 3.2,
          fill: 3,
          replace: 2,
          patrons: 1.8,
          renew: 1.5,
          yard: 1.4,
          design: 1.3,
          scout: 1,
          build: 0.8,
          suppliers: 0.6,
          vote: 0.5,
        },
        spend: 1.1,
        young: 1,
        other: 1,
      },
      engineer: {
        order: {
          yard: 3.5,
          design: 3.4,
          fill: 3,
          build: 2.4,
          renew: 2,
          patrons: 1.6,
          replace: 1.5,
          scout: 1,
          poach: 0.5,
          suppliers: 0.6,
          vote: 0.5,
        },
        spend: 0.9,
        young: 2,
        other: 2,
      },
      gambler: {
        order: {
          fill: 3,
          replace: 2.6,
          design: 2.5,
          poach: 2,
          yard: 1.8,
          scout: 1.5,
          patrons: 1.4,
          build: 1.2,
          renew: 1,
          suppliers: 0.6,
          vote: 0.5,
        },
        spend: 1.2,
        young: 1,
        other: 2,
      },
      steady: {
        order: {
          fill: 3,
          renew: 2.5,
          patrons: 2.2,
          yard: 2,
          design: 1.6,
          replace: 1.5,
          scout: 1.2,
          build: 1,
          poach: 0.5,
          suppliers: 0.6,
          vote: 0.5,
        },
        spend: 0.7,
        young: 2,
        other: 3,
      },
    },
    talentYouth: 0.2, // a youth builder's Talent Eye weight on potential, added
  },

  /** The market (Phase B section 5). */
  market: {
    answerDays: 2, // a gull answers an offer this long after it is made
    approachDays: 7, // an approach to another crew's gull is answered this long after
    counterDays: 7, // a counter stands this long
    accept: 1,
    counterFrom: 0.85,
    most: 1.2, // the score that accepts, that counters; a want's most
    weights: [0.5, 0.3, 0.2], // the three wants' weights, first most
    lowball: 0.8, // a wage below this share of the ask costs a patience
    silentDays: 30, // with patience gone they will not talk for this long
    patienceMost: 4, // patience with a scout's Persuasion
    closingDays: 60, // a contract's last days, in which others may approach
    silenceDays: 30, // into those days with no renewal offered, morale pays once
    expect: { podium: 0.06, sinking: 0.4 }, // the podiums and sinkings a race an offer's bonuses are worth
    reserve: 0.3, // status's score for a captain offered the reserve
    leagueBelow: 0.6,
    leagueFree: 0.4, // league's score one below their level; two below when out of contract
    levelStars: [3, 2.1], // a free agent's level by stars: League One at or above the first, Two the second
    ambitionSpan: 50, // ambition: 1 at the crew's reputation equal to theirs, ± this per 1
    securityStep: 0.35, // security's score lost a season from the length they ask
    away: 0.5, // home's score at a crew of another colony
    young: { count: 150, stars: [0.5, 1.5] }, // new gulls each season (ages TUNING.ages.young)
  },

  /** Wages (Phase B section 5): base a race by role, × 1.6^stars × league × (1 + marketability / 200). */
  wage: {
    base: {
      manager: 30,
      captain: 40,
      bosun: 20,
      shipwright: 25,
      scout: 15,
      flight: 10,
      elder: 0,
    },
    growth: 1.6,
    league: [2, 1.3, 1],
    market: 200,
    feeRaces: 4,
    /** Contract length in seasons at the start, by age: under young, under old, older. */
    young: 24,
    old: 32,
    lengths: [1, 2, 3],
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
    buildings: [2, 1.5, 1], // mean level, by seed: each building 1 to 3
    /** Starting parts' performance by league (0..1000), its spread, the headroom to the maximum, reliability and its headroom. */
    parts: {
      perf: [620, 470, 330],
      spread: 60,
      headroom: 120,
      reliability: [0.82, 0.74, 0.66],
      reliabilityHeadroom: 0.1,
    },
    /** A manager's reputation at the start, by league, ± half the spread. */
    managerReputation: [65, 40, 18],
    managerSpread: 20,
  },

  /** Each league's rules at the start (race.ts Rules). */
  rules: {
    spec: [],
    pace: 1,
    banned: [],
    pointsPerSinking: 1,
    seaHeldPoint: true,
    prizeSpread: 1,
    inspection: 1 / 3,
  },
  /** A planet's storm pace, drawn in this range at the season's making, to the nearest step. */
  planetPace: { lo: 0.8, hi: 1.25, step: 0.05 },
  /** Starting contracts: the share with a break clause, its size in races' wage, and a captain's podium bonus in races' wage. */
  contracts: {
    breakShare: 0.5,
    breakRaces: [8, 20],
    podium: 0.5,
    sinking: 0.1,
  },

  /** The player at founding: their manager's reputation, and the longest names they may give. */
  player: { reputation: 10, crewName: 32, gullName: 20, age: 35 },

  /** A gull's patience in talks (Phase B section 5). */
  patience: 3,

  /** Parts (Phase B section 8). */
  parts: {
    handling: 0.15, // a part's Handling: spec × (1 ± this × perf / 1000)
    standard: { perf: 500, reliability: 0.9 }, // a spec type's standard part
    spare: { perf: 300, reliability: 0.7 }, // what a ship sails with when her part of a type is confiscated and no spare is left
    wear: 0.1,
    faultWear: 0.05, // condition lost a race sailed, and more a fault
    carry: 0.6, // a part's performance and maximum carried into the next season
    spares: 1, // unfitted parts kept a type at the season's end (the best)
    newPartMorale: 5, // ship two's captain's morale lost at a second new part in a row to ship one
    fine: 0.2, // an inspection's fine: (1 + risk) × this × the part's design cost
  },
  /** The yard (Phase B section 8.4): points a day, and what a point does. */
  yard: { condition: 0.01, perf: 1, reliability: 0.002, bosun: 0.25 },
  /** Designing (Phase B section 8.3). */
  design: {
    days: 14,
    build: 7,
    headroom: 100,
    reliability: 0.5,
    reliabilityMax: 0.8,
    riskMost: 0.9,
    deal: 3,
    forNextFrom: 4,
    cost: {
      sails: 300,
      rigging: 260,
      rudder: 240,
      hull: 340,
      keel: 280,
      mounts: 260,
    },
    tier: [1, 1.6, 2.4], // the cost × this by the highest tier among its components
  },
  /** The rookery (Phase B section 9): each building's cost, days and upkeep a race, by level 1..3 (level 1 is every
   *  crew's from the start, so its cost and days are never paid). */
  rookery: {
    works: {
      factory: {
        cost: [0, 2400, 6000],
        days: [0, 30, 50],
        upkeep: [10, 25, 50],
      },
      drawingLoft: {
        cost: [0, 2000, 5000],
        days: [0, 25, 45],
        upkeep: [8, 20, 40],
      },
      testTank: {
        cost: [0, 2200, 5500],
        days: [0, 30, 50],
        upkeep: [8, 20, 40],
      },
      foundry: {
        cost: [0, 2200, 5500],
        days: [0, 30, 50],
        upkeep: [8, 20, 40],
      },
      sailingSchool: {
        cost: [0, 1800, 4500],
        days: [0, 25, 40],
        upkeep: [6, 15, 30],
      },
      flightLoft: {
        cost: [0, 1200, 3000],
        days: [0, 20, 35],
        upkeep: [5, 12, 25],
      },
      crowsNest: {
        cost: [0, 1200, 3000],
        days: [0, 20, 35],
        upkeep: [5, 12, 25],
      },
      fishMarket: {
        cost: [0, 1500, 4000],
        days: [0, 20, 35],
        upkeep: [0, 0, 0],
      },
      landingPad: {
        cost: [0, 1600, 4200],
        days: [0, 25, 40],
        upkeep: [5, 12, 25],
      },
    },
    points: [10, 20, 30], // the factory's yard points a day
    slots: [2, 3, 4], // the drawing loft's design slots
    loft: [1, 0.85, 0.7], // the drawing loft's design days ×
    fish: [120, 80, 50], // Coin a race the fish market brings at level 1, by league
    fishLevel: [1, 1.8, 2.6], //   × this by its level
  },

  /** Money (Phase B section 10): each league's prize pool at the season's end, shared by place by rules.prizeSpread. */
  //   Sized so a median crew's prize is about a third of its season's wages and upkeep (the patrons bring about half).
  money: { prize: [1040000, 400000, 210000] },
  /** Reputation (Phase B section 10), 0..100. */
  reputation: {
    perPoint: 0.1,
    most: 3, // a crew's a race: × (its points − its league's mean), to ± most
    title: 10,
    promoted: 6,
    relegated: -8, // a crew's at the season's end
    perPlace: 0.5,
    managerMost: 2, // a manager's a race: × (target − standing), to ± managerMost
    playerPerPoint: 0.15,
    playerSinking: 0.5,
    playerMost: 3, // the player's own ship: × (her points − a ship's mean), + a sinking
  },
  /** Marketability's moves a race (Phase B section 10): a podium, a sinking, and the drift back toward what stars and youth give. */
  marketMoves: { podium: 3, sinking: 1, drift: 0.1, crew: 0.4 },
  /** Patrons (Phase B section 10). */
  patrons: {
    slots: 3,
    every: 42,
    offers: 2,
    stand: 14, // offers a crew gets every so many days, standing so long
    perRace: 4.6, // a fixed patron's Coin a race × the crew's marketability × its league's factor
    league: [1.7, 1, 1], //   (League One's wages outrun its marketability)
    tier: [1, 1.6, 2.4], // × by the offer's tier (the landing pad's level at most)
    races: [3, 10],
    bonus: 7, // an objective patron's bonus × the crew's marketability × league × the objective's weight
    objectives: { top10: 1, sinkTwo: 1.6, afloat: 1.2, mostSea: 1.8 },
    objectiveShare: 0.5, // the share of offers that pay for objectives
    better: [1.5, -0.5], // a rival replaces a patron for one worth this × as much (Finance u)
  },
  /** The Admiralty (Phase B section 11). */
  admiralty: {
    rounds: [3, 7], // the votes come before these rounds (0 the first)
    open: 12, // days a proposal stands before its vote
    abstain: 0.2, // a measure nearer even than this abstains
    lobby: 0.1, // sway a Coin lobbied
    pace: 0.1,
    paceRange: [0.6, 1.6],
    spread: 0.25,
    spreadRange: [0, 2],
    inspection: 1 / 6,
    inspectionRange: [0, 2 / 3],
    points: [0, 3],
  },
  /** Race day (Phase B section 13, D20): points for places 1 to 5, then 21 − place to place 20; the leagues that swap at
   *  the season's end each way. */
  race: { top: [25, 22, 20, 18, 16], last: 20, swap: 4, standIn: 1 }, // standIn: a stand-in captain's fee a race × their ask
  /** The dilemmas (Phase B section 12, career/events.ts): the chance a crew draws one after a round, and their numbers. */
  dilemmas: {
    chance: 0.6,
    after: [2, 9], // a player's comes this many days after the round closes
    rise: 0.15,
    riseMorale: 10,
    refuse: -15,
    promise: 0.5,
    promiseMorale: 5, // a rise, the refusal, a podium bonus × wage
    argue: 5,
    argueLost: -10, // morale: the part given over, or the loser's when held
    dinner: 150,
    dinnerBond: 5, // Coin, bond points
    grey: { perf: 40, risk: 0.15 },
    report: 5, // a grey component's numbers; marketability for reporting it
    guest: 2, // ship two's Consistency lost with a guest aboard
    worn: 30,
    rest: 0.5,
    restFatigue: 30,
    push: 0.1,
    cover: 120, // fatigue that triggers; rest's rate ×; push's botch +; cover's Coin
    press: 5,
    low: 40, // confidence and marketability moved; below this confidence the press asks
    trialAge: 20,
    trialPotential: 3.5,
    trialWage: 0.5, // a young free agent's age under, potential from; wage × their ask
    repair: 400,
    slowDays: 20,
    slow: 0.5, // Coin a building level to repair now; else the factory at × slow for slowDays
    stamina: 6,
    relapse: 0.3,
    relapseRaces: 2, // an unfit captain who sails: Stamina lost, the chance of more races out
    exemptDays: 30,
    exempt: 0.2,
    exemptCost: 5,
    lowest: 2, // the testing exemption's yard points +, days, marketability; for the lowest crews
  },
  /** What rivals weigh in the works (Phase B section 6): risk accepted by personality, buildings in order. */
  works: {
    risk: {
      spender: 0.15,
      youthBuilder: 0.1,
      poacher: 0.15,
      engineer: 0.2,
      gambler: 0.4,
      steady: 0.05,
    },
    build: {
      spender: [
        'fishMarket',
        'landingPad',
        'factory',
        'drawingLoft',
        'testTank',
        'foundry',
        'sailingSchool',
        'crowsNest',
        'flightLoft',
      ],
      youthBuilder: [
        'sailingSchool',
        'crowsNest',
        'flightLoft',
        'drawingLoft',
        'factory',
        'testTank',
        'foundry',
        'fishMarket',
        'landingPad',
      ],
      poacher: [
        'crowsNest',
        'landingPad',
        'fishMarket',
        'factory',
        'sailingSchool',
        'flightLoft',
        'drawingLoft',
        'testTank',
        'foundry',
      ],
      engineer: [
        'factory',
        'drawingLoft',
        'testTank',
        'foundry',
        'flightLoft',
        'sailingSchool',
        'crowsNest',
        'fishMarket',
        'landingPad',
      ],
      gambler: [
        'testTank',
        'foundry',
        'landingPad',
        'factory',
        'drawingLoft',
        'fishMarket',
        'sailingSchool',
        'crowsNest',
        'flightLoft',
      ],
      steady: [
        'fishMarket',
        'factory',
        'flightLoft',
        'sailingSchool',
        'drawingLoft',
        'crowsNest',
        'landingPad',
        'testTank',
        'foundry',
      ],
    },
    buildShare: 0.6, // a building is begun if it costs at most this of the room
    designShare: 0.5, // a design likewise
    reliabilityBelow: 0.8, // the yard gives reliability a share while a part's is below this
  },
} as const;

export type Tuning = typeof TUNING;
