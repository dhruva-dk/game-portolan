// Every starting value of the career, in one table, so the owner tunes it in one place (epic section 0.2). A save's
// journal entries carry the TUNING_VERSION they were written under (D36): change a number here and bump the version
// (tests/career-tuning.test.ts pins a hash of TUNING to it), so a journal written under other numbers is never
// replayed whole as if it were this one's.
//
// A pair [a, b] is a line in u = stat / 20: a + b × u. A triple by tier is Tier 1's, Two's, Three's.

/** Bump with any change to TUNING (and pin the new hash in the test). */
export const TUNING_VERSION = 9;

const ROLE_YEARS = {
  manager: [40, 55],
  driver: [26, 31],
  mechanic: [28, 34],
  pit: [28, 34],
  designer: [35, 45],
  scout: [35, 45],
  chairman: [45, 60],
} as const;

export const TUNING = {
  /** The calendar (Phase B section 13): ten races fourteen days apart, then thirty days off. One season is one year of a person's age. */
  calendar: { rounds: 10, gap: 14, off: 30 },

  /** The world at the start (Phase B section 3, epic section 5). */
  world: {
    championships: 3,
    teams: 20, // a championship's: race.ts TEAMS
    /** The liveries a team's colours are dealt from: the dyes and patterns a ship may wear (race.ts Colours). */
    liveries: { dyes: 16, patterns: 3 },
    emblems: 12,
    colonies: 40,
    free: 300, // free agents across every role
    freeManagers: 30, // of them, managers
    /** The share of the other free agents in each role. */
    freeRoles: {
      driver: 0.3,
      mechanic: 0.15,
      designer: 0.1,
      scout: 0.12,
      pit: 0.33,
    },
    pit: 4, // pit crew members a team
    /** A team's staff stars by tier, and the seeded spread about them (± half of it). */
    stars: [3.5, 2.5, 1.75],
    starSpread: 1,
    /** Free agents' stars and spread. */
    freeStars: 2,
    freeSpread: 2,
    /** How far each stat lies from its person's mean (± this, by seed). */
    statSpread: 3,
    /** The young (under the role's peak) lie this many stars below their potential a year short of peak, up to the cap. */
    youthGap: 0.35,
    youthGapMost: 2,
    /** Each person has 0 to 3 traits; the chance of each further trait. */
    traitChance: 0.35,
  },

  /** Ages at the start, and peaks and retirements (Phase B section 2.2), in years. */
  ages: {
    start: {
      manager: [36, 64],
      driver: [18, 38],
      mechanic: [22, 50],
      pit: [19, 40],
      designer: [26, 60],
      scout: [26, 60],
      chairman: [50, 76],
    },
    peak: ROLE_YEARS,
    retire: {
      manager: [58, 70],
      driver: [34, 40],
      mechanic: [45, 55],
      pit: [36, 42],
      designer: [55, 65],
      scout: [55, 65],
      chairman: [70, 80],
    },
    young: [16, 19], // the new people each season
  },

  /** Growth at each season's end (Phase B section 2.2). */
  growth: {
    rate: 0.35, // of improvability × school × the gap to potential
    decline: 0.3, // lost a stat a year past peak, plus
    declineYear: 0.2, //   this for each year past peak
    spread: 0.3, // each stat's share by seed: 1 ± this
    school: [1, 1.25, 1.5], // the role's building, by level
    mentor: 0.25, // growth added (as a share) to a Mentor's team's drivers under mentorAge
    mentorAge: 22,
    stamina: 0.2, // a driver's Stamina grows this more a season a sailing school level
  },

  /** Morale (Phase B section 2.3), 0 to 100. */
  morale: {
    start: 60,
    result: 3, // most a race moves it by the result against the team's target
    resultPerPlace: 1, //   this a place, to that most
    settle: 0.12, // a race brings it this share of the way back to the start: a bad run sours a team, not for good
    status: 2, // a race on ship two, or off it as reserve, for a driver who wants status
    silence: 10, // no renewal offered in the contract's last days, once
    silenceDays: 60,
    renewal: 10,
    wage: [-2, 2], // most a race moves it by wage against ask, each way
    wagePerShare: 4, //   this per share of the ask above or below it
    bond: 0.5, // a race, per bond level, for the mechanic and her driver
    effect: 50, // stats shift (morale − 50) / this
    leave: 25, // below: asks to leave, refuses renewal
    content: 80, // above: renewal asks less by
    contentDiscount: 0.1,
  },

  /** Form (Phase B section 2.3): a driver's stats shift by up to this × (1 − u Consistency) for a race. */
  form: 3,

  /** Injury (Phase B section 2.3). */
  injury: { chance: 0.04, races: [1, 3] },

  /** Traits' numbers (career/traits.ts). */
  traits: {
    most: 3,
    gain: 0.08, // chance a season's end gives a trait, if under most
    lose: 0.06, // chance a season's end takes one
    pay: 0.6, // a Pay Driver brings this × marketability money a race
  },

  /** What each role's stats do (Phase B section 2.1). */
  driver: { feedback: 30 },
  mechanic: {
    repairs: [0.7, 0.6],
    mending: [0.7, 0.6],
    concentration: [1.3, -0.6],
    leadership: [1.3, -0.6],
    leadershipMorale: 4,
    handling: [1.25, -0.5],
    reliability: [0.8, 0.4],
    perf: [0.8, 0.4],
    chemistry: [1, 1],
  },
  /** The bond of a ship's mechanic and driver: the points each level takes, and her pit's pace × by the level reached. */
  bond: { levels: [5, 12, 20], pace: [1, 0.97, 0.94, 0.9] },
  designer: {
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
  /** The pit crew (career/pit.ts): what a member's stats weigh in their work and their steadiness, and what tiring does. */
  pit: {
    work: { speed: 0.4, strength: 0.3, teamwork: 0.3 },
    steady: { precision: 0.7, nerve: 0.3 },
    base: 0.5,
    tired: 0.3,
    slip: 0.25,
    slipTired: 0.25,
    stamina: 25,
    staminaOver: 1.5,
    recovery: 10,
  },

  /** What a rival manager's stats do (Phase B section 6). */
  manager: {
    negotiation: [1.1, -0.3], // bids at the ask × this
    talentEye: [0.2, 0.6], // the weight on potential over stars in a person's worth
    finance: [0.25, 0.5], // the share of balance above the floor it will commit
    development: [0.5, 2], // how sharply the improvement's points go to the worst-ranked parts (an exponent)
    tactics: [0.4, 0.6], // the chance the race plan takes its best choice
  },
  /** What a chairman's stats do (Phase B section 7). */
  chairman: {
    ambition: 3, // places the target is moved up, × u
    perPlace: 0.6,
    fall: -4,
    rise: 4, // confidence a race: perPlace a place past the slack (to fall) or ahead (to rise)
    slack: 3, // places behind the target a chairman lets pass
    met: 1, // confidence a race at or above the target
    settle: 5, // races before the standings weigh in full (the first weighs 1/settle)
    patience: [1.3, -0.6], // a fall × this
    recover: 0.25, // at a season's start confidence moves this share back toward the start's
    verdict: 35, // at the season's end a target missed sacks only below this confidence
    grace: 0.5, // seasons a new manager serves before they can be sacked
    debt: 0,
    pastFloor: -0.5, // a race while balance is below zero, past the floor
    generosity: 0.3, // money added at the season's start, × u × the tier's budget
    floor: [0.3, 0.4], // the debt floor, × the tier's budget, below zero
    meddling: [0.2, 0.6], // the chance a chairman's dilemma is the one drawn
    words: [75, 50, 25], // confidence crossing these sends the chairman's word
    missedBy: 5, // places past the target at the season's end that sack the manager
    fit: [55, 30, 0], // the manager's reputation a chairman looks for, by tier
    jobs: [70, 45, 0], // the player's reputation a tier's teams offer their post at
    ambitious: 14, // a chairman's Ambition at or above which, at the season's end, they court a better manager
    offerDays: 7, // a job offer stands this long
    standing: 2, // the most job offers standing at once while the player has a team
  },

  /** Rival managers' decisions (Phase B section 6), and what each personality weighs. */
  rivals: {
    review: 7, // days between a team's reviews, staggered by team id
    better: 1,
    betterGambler: 0.5, // stars a known candidate must be better by to replace the weakest
    bigBid: 1.1, // a gambler's bids × this
    counterMost: 1.25, // a counter is met if its wage is at most the ask × this, and payable
    breakRaces: 12, // a rival's break clause, in races' wage; none at Negotiation u ≥ 0.5
    renewBelow: 0.6, // renews staff whose worth is at least this share of the best of their role on the team
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
          sponsors: 1.8,
          improvement: 1.6,
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
          improvement: 2,
          design: 1.8,
          sponsors: 1.7,
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
          sponsors: 1.8,
          renew: 1.5,
          improvement: 1.4,
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
          improvement: 3.5,
          design: 3.4,
          fill: 3,
          build: 2.4,
          renew: 2,
          sponsors: 1.6,
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
          improvement: 1.8,
          scout: 1.5,
          sponsors: 1.4,
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
          sponsors: 2.2,
          improvement: 2,
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
    answerDays: 2, // a person answers an offer this long after it is made
    approachDays: 7, // an approach to another team's person is answered this long after
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
    reserve: 0.3, // status's score for a driver offered the reserve
    tierBelow: 0.6,
    tierFree: 0.4, // tier's score one below their level; two below when out of contract
    levelStars: [3, 2.1], // a free agent's level by stars: Tier 1 at or above the first, Two the second
    ambitionSpan: 50, // ambition: 1 at the team's reputation equal to theirs, ± this per 1
    securityStep: 0.35, // security's score lost a season from the length they ask
    away: 0.5, // home's score at a team of another colony
    young: { count: 150, stars: [0.5, 1.5] }, // new people each season (ages TUNING.ages.young)
  },

  /** Wages (Phase B section 5): base a race by role, × 1.6^stars × tier × (1 + marketability / 200). */
  wage: {
    base: {
      manager: 30,
      driver: 40,
      mechanic: 20,
      designer: 25,
      scout: 15,
      pit: 10,
      chairman: 0,
    },
    growth: 1.6,
    tier: [2, 1.3, 1],
    market: 200,
    feeRaces: 4,
    /** Contract length in seasons at the start, by age: under young, under old, older. */
    young: 24,
    old: 32,
    lengths: [1, 2, 3],
  },

  /** Marketability (Phase B section 10) at the start, 0 to 100: base + stars × perStar + youth (under youthAge), ± spread. */
  marketability: { base: 8, perStar: 12, youth: 8, youthAge: 23, spread: 10 },

  /** A team at the start, by tier. */
  team: {
    balance: [4000, 2200, 1200],
    budget: [6000, 3500, 2000],
    reputation: [70, 45, 20],
    reputationSpread: 16,
    confidence: 70,
    buildings: [2, 1.5, 1], // mean level, by seed: each building 1 to 3
    /** Starting parts' performance by tier (0..1000), its spread, the headroom to the maximum, reliability and its headroom. */
    parts: {
      perf: [620, 470, 330],
      spread: 60,
      headroom: 120,
      reliability: [0.6, 0.5, 0.4],
      reliabilitySpread: 0.04,
      reliabilityHeadroom: 0.1,
    },
    /** A manager's reputation at the start, by tier, ± half the spread. */
    managerReputation: [65, 40, 18],
    managerSpread: 20,
  },

  /** Each tier's rules at the start (race.ts Rules). */
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
  /** Starting contracts: the share with a break clause, its size in races' wage, and a driver's podium bonus in races' wage. */
  contracts: {
    breakShare: 0.5,
    breakRaces: [8, 20],
    podium: 0.5,
    sinking: 0.1,
  },

  /** The player at founding: their manager's reputation, and the longest names they may give. */
  /** The player: their manager's reputation at the start, the longest names, their age, and the team they take (its
   *  place by staff strength in the last tier, 1 the strongest). */
  player: { reputation: 10, teamName: 32, personName: 20, age: 35, place: 18 },

  /** A person's patience in talks (Phase B section 5). */
  patience: 3,

  /** Parts (Phase B section 8). */
  parts: {
    handling: 0.6, // a part as fitted: the spec part's performance × (1 + this × (perf − the standard's) / 1000)
    standard: { perf: 500, reliability: 0.5 }, // a spec type's standard part: race.ts Fitted's 1 and 0.5
    spare: { perf: 300, reliability: 0.3 }, // what a ship sails with when her part of a type is confiscated and no spare is left
    wear: 0.1,
    faultWear: 0.05, // condition lost a race sailed, and more a fault
    carry: 0.85, // a part's performance and maximum carried into the next season: what a season's designs about win back
    spares: 1, // unfitted parts kept a type at the season's end (the best)
    newPartMorale: 5, // the other ships' drivers' morale lost at a second new part in a row to one ship
    fine: 0.2, // an inspection's fine: (1 + risk) × this × the part's design cost
  },
  /** The improvement (Phase B section 8.4): points a day, and what a point does. */
  improvement: { condition: 0.01, perf: 1, reliability: 0.002, mechanic: 0.25 },
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
  /** The headquarters (Phase B section 9): each building's cost, days and upkeep a race, by level 1..3 (level 1 is every
   *  team's from the start, so its cost and days are never paid). */
  hq: {
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
      pitHouse: {
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
    points: [10, 20, 30], // the factory's improvement points a day
    slots: [2, 3, 4], // the drawing loft's design slots
    loft: [1, 0.85, 0.7], // the drawing loft's design days ×
    fish: [120, 80, 50], // money a race the fish market brings at level 1, by tier
    fishLevel: [1, 1.8, 2.6], //   × this by its level
  },

  /** Money (Phase B section 10): each tier's prize pool at the season's end, shared by place by rules.prizeSpread. */
  //   Sized so a median team's three sponsors about pay its wages and upkeep race by race (a team that cannot pay as
  //   it goes can renew no contract in the season), and its prize, about a tenth of them, is what it has to build with.
  money: { prize: [250000, 110000, 50000] }, // a tier's pool
  /** Reputation (Phase B section 10), 0..100. */
  reputation: {
    perPoint: 0.1,
    most: 3, // a team's a race: × (its points − its tier's mean), to ± most
    title: 10,
    promoted: 6,
    relegated: -8, // a team's at the season's end
    perPlace: 0.5,
    managerMost: 2, // a manager's a race: × (target − standing), to ± managerMost
    playerPerPoint: 0.15,
    playerSinking: 0.5,
    playerMost: 3, // the player's own ship: × (her points − a ship's mean), + a sinking
  },
  /** Marketability's moves a race (Phase B section 10): a podium, a sinking, and the drift back toward what stars and youth give. */
  marketMoves: { podium: 3, sinking: 1, drift: 0.1, team: 0.4 },
  /** Sponsors (Phase B section 10). */
  sponsors: {
    slots: 3,
    every: 42,
    offers: 2,
    stand: 14, // offers a team gets every so many days, standing so long
    perRace: 15.5, // a fixed sponsor's money a race × the team's marketability × its tier's factor
    tier: [1.7, 1, 1], //   (Tier 1's wages outrun its marketability)
    grade: [1, 1.6, 2.4], // × by the offer's grade (the landing pad's level at most)
    races: [3, 10],
    bonus: 23.5, // an objective sponsor's bonus × the team's marketability × tier × the objective's weight
    objectives: { top10: 1, sinkTwo: 1.6, afloat: 1.2, mostSea: 1.8 },
    /** What each objective asks of a team's race: a ship in the first so many, so many ships sunk, so many of its own afloat at the end. */
    need: { top: 10, sink: 2, afloat: 3 },
    objectiveShare: 0.5, // the share of offers that pay for objectives
    better: [1.5, -0.5], // a rival replaces a sponsor for one worth this × as much (Finance u)
  },
  /** The Admiralty (Phase B section 11). */
  admiralty: {
    rounds: [3, 7], // the votes come before these rounds (0 the first)
    open: 12, // days a proposal stands before its vote
    abstain: 0.2, // a measure nearer even than this abstains
    lobby: 0.1, // sway a unit of money lobbied
    pace: 0.1,
    paceRange: [0.6, 1.6],
    spread: 0.25,
    spreadRange: [0, 2],
    inspection: 1 / 6,
    inspectionRange: [0, 2 / 3],
    points: [0, 3],
  },
  /** Race day: the points of the first ten ships; the teams that swap between two championships at the season's end,
   *  each way; a stand-in driver's fee a race × their ask; how many times over a driver's distance from her field's
   *  mean is read (card.ts fielded). */
  race: {
    top: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
    swap: 1,
    standIn: 1,
    field: 2.5,
  },
  /** The dilemmas (Phase B section 12, career/events.ts): the chance a team draws one after a round, and their numbers. */
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
    dinnerBond: 5, // money, bond points
    grey: { perf: 40, risk: 0.15 },
    report: 5, // a grey component's numbers; marketability for reporting it
    guest: 2, // the Consistency her first hired driver loses with a guest aboard
    worn: 30,
    rest: 0.5,
    restFatigue: 30,
    push: 0.1,
    cover: 120, // fatigue that triggers; rest's work ×; push's slip +; cover's cost
    press: 5,
    low: 40, // confidence and marketability moved; below this confidence the press asks
    trialAge: 20,
    trialPotential: 3.5,
    trialWage: 0.5, // a young free agent's age under, potential from; wage × their ask
    repair: 400,
    slowDays: 20,
    slow: 0.5, // money a building level to repair now; else the factory at × slow for slowDays
    stamina: 6,
    relapse: 0.3,
    relapseRaces: 2, // an unfit driver who sails: Stamina lost, the chance of more races out
    exemptDays: 30,
    exempt: 0.2,
    exemptCost: 5,
    lowest: 2, // the testing exemption's improvement points +, days, marketability; for the lowest teams
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
        'pitHouse',
      ],
      youthBuilder: [
        'sailingSchool',
        'crowsNest',
        'pitHouse',
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
        'pitHouse',
        'drawingLoft',
        'testTank',
        'foundry',
      ],
      engineer: [
        'factory',
        'drawingLoft',
        'testTank',
        'foundry',
        'pitHouse',
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
        'pitHouse',
      ],
      steady: [
        'fishMarket',
        'factory',
        'pitHouse',
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
    reliabilityBelow: 0.8, // the improvement gives reliability a share while a part's is below this
  },
} as const;
