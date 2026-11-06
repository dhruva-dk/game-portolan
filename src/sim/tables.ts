// Every tuning number in the match, in metres, seconds and hit points. Ported from the rewrite's flat game
// (src/game.ts, src/territory.ts) and the old simulation, converted to metres on the 554 m sphere.
import { PI } from './math.ts';
import { R } from './sphere.ts';

// ---------------------------------------------------------------- the ship

export const SHIP = {
  /** Top speed under sail, m/s. */
  top: 14.5,
  /** Acceleration toward the target speed, m/s², speeding up and slowing down. */
  accel: 6.5,
  decel: 4.5,
  /** Turning rate in rad/s: base plus a share that grows with way on, up to `full` m/s. */
  turn: 0.55,
  turnWay: 0.8,
  turnFull: 8,
  /** A turn sharper than this (rad) holds her to `crawl` m/s while she comes round. */
  hard: 1.8,
  crawl: 8,
  /** Sideways slip while carving a turn, as a share of speed. */
  carve: 0.12,
  /** Hull length and beam, for grounding probes and collisions. */
  half: 8.6,
  beam: 2.6,
  /** Two hulls closer than this push apart; closing faster than `ram` m/s is a ramming. */
  touch: 10,
  ram: 7,
  ramDamage: 2.2,
  /** The most one collision takes off a ship, the Ram ability's blow included. */
  ramCap: 45,
  /** Using a consumable slows her to this share of speed. */
  using: 0.6,
  hull: 100,
  shield: 100,
} as const;

/** How well she sails at angle a off the wind (0 running before it, PI straight into it). At most 25% slower upwind. */
export const POINT = { run: 0.92, beam: 1, upwind: 0.75 } as const;

/**
 * The seaway (seaway.ts). A sea of the wind's speed at `flat` m/s (the squall's own added) rolls nothing, one of `full`
 * rolls her `roll` radians each way, over about `period` s. A gun fired as the deck swings through upright spreads up to
 * `spread` more, by how rough the sea is; at the top of a roll, not at all. A broadside's balls rise (or fall) by
 * `throw` of what the roll would tilt them, toward the rigging on the up-roll and the hull on the down.
 */
export const SEAWAY = { flat: 5, full: 17, roll: 0.14, period: 6.5, spread: 1.6, throw: 0.35 } as const;

/**
 * Going about. Pointing higher than `nogo` radians off the wind's run (into the eye of it), she pinches, the canvas
 * shaking; held there past `linger` seconds in any real wind (`breeze` of a fair one) she loses her way and hangs in
 * irons for `irons` s, turning at `ironsTurn` of her rate and making `ironsSpeed` m/s, until she pays off or the gust
 * breaks her out. Carried through the wind briskly (no more than `brisk` s pinching), a tack fills her canvas on the
 * new board: up to `surge` m/s more, by as much way as she carried in (full at `carry` m/s), fading over `fill` s. A
 * gybe is the same for `gybe` of that, unless it is thrown: turning faster than `crash` rad/s with more than `hard`
 * of a fair wind behind her, the yards slam across, `slam` of her way is gone and her aim is thrown off for `lurch` s
 * (her shots spread `lurchSpread` more at its worst). A board counts once the wind is `clear` (the sine of the angle)
 * to one side, and a change of board only while she is turning faster than `turning`, so the wind veering about a
 * ship running dead before it never throws her.
 */
export const ABOUT = {
  nogo: 2.72, linger: 2.6, breeze: 0.45, irons: 2.2, ironsTurn: 0.35, ironsSpeed: 1.2, brisk: 1.2, surge: 2.4, carry: 9, fill: 1.6, gybe: 0.45,
  crash: 0.9, hard: 0.65, slam: 0.3, lurch: 1.3, lurchSpread: 1.4, clear: 0.17, turning: 0.08,
} as const;

/** The gust: a burst of wind and a hop off the water. */
export const GUST = { charges: 2, speed: 13, time: 1.15, recharge: 6.5, hop: 6.3, accel: 28, turn: 1.35, spread: 1.6 } as const;

export const GRAVITY = 9.8;

/**
 * Running aground: the push off a falling tide, and the share of it a ship under way still gets; the speed kept against
 * a shore, the speed that scrapes, the gradient's reach (m) and the share of it for the ground right under her, how
 * many times a stopped move slides on along what stopped it, and how fast she eases off it (m/s).
 */
export const GROUND = { push: 1.2, under: 0.25, keep: 0.9, scrape: 3.5, probe: 1.5, fine: 0.12, slides: 3, ease: 0.3 } as const;

// ---------------------------------------------------------------- items

export const RARITIES = 5;
export const RARITY = {
  names: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'],
  damage: [1, 1.08, 1.16, 1.24, 1.32],
  reload: [1, 0.95, 0.9, 0.85, 0.8],
} as const;

/** Item kinds. 0 is an empty slot; 1–6 and 11–12 are weapons; 7–10 are consumables. Shot made for a purpose came
 *  later than the rest, so its numbers follow the consumables'. */
export const ITEM = {
  none: 0,
  cannon: 1, scatter: 2, harpoon: 3, mortar: 4, repeater: 5, broadside: 6,
  smallShield: 7, bigShield: 8, repairKit: 9, fullRepair: 10,
  chain: 11, heated: 12,
} as const;
export const ITEM_NAMES = ['', 'Cannon', 'Scattergun', 'Harpoon', 'Mortar', 'Repeater', 'Broadside', 'Small Shield', 'Big Shield', 'Repair Kit', 'Full Repair', 'Chain Shot', 'Heated Shot'];
/** The weapons, in the order of their classes everywhere outside the simulation. */
export const WEAPON_KINDS: readonly number[] = [ITEM.cannon, ITEM.scatter, ITEM.harpoon, ITEM.mortar, ITEM.repeater, ITEM.broadside, ITEM.chain, ITEM.heated];
export const isWeapon = (kind: number): boolean => (kind >= ITEM.cannon && kind <= ITEM.broadside) || kind === ITEM.chain || kind === ITEM.heated;
export const isUse = (kind: number): boolean => kind >= ITEM.smallShield && kind <= ITEM.fullRepair;

export interface Weapon {
  readonly damage: number;
  /** Seconds between shots. */
  readonly interval: number;
  readonly mag: number;
  readonly reload: number;
  /** Muzzle speed, m/s; lobbed weapons pick their own. */
  readonly speed: number;
  readonly gravity: number;
  readonly spread: number;
  readonly pellets: number;
  /** Metres: tuned to the sightline of about 240 m. */
  readonly range: number;
  readonly crit: number;
  readonly splash: number;
  readonly auto: boolean;
  readonly lob: boolean;
  /** Broadside only: balls fired abeam from each side at once. */
  readonly sides: number;
  /** How hard it goes at each part of a ship, as a multiple of what any shot does there (see PARTS). */
  readonly parts: PartsBias;
  /** Seconds a hit that reaches the hull sets her burning for; 0 none. */
  readonly ignite: number;
}

export interface PartsBias { readonly sail: number; readonly mast: number; readonly flood: number; readonly rudder: number }
const EVEN: PartsBias = { sail: 1, mast: 1, flood: 1, rudder: 1 };

const gun = (w: Partial<Weapon> & Pick<Weapon, 'damage' | 'interval' | 'mag' | 'reload' | 'speed' | 'gravity' | 'spread' | 'range'>): Weapon => ({
  pellets: 1, crit: 1.5, splash: 0, auto: false, lob: false, sides: 0, parts: EVEN, ignite: 0, ...w,
});

export const WEAPONS: Readonly<Record<number, Weapon>> = {
  [ITEM.cannon]: gun({ damage: 20, interval: 0.42, mag: 8, reload: 1.9, speed: 165, gravity: 7, spread: 0.008, range: 200, auto: true }),
  [ITEM.scatter]: gun({ damage: 8, interval: 1, mag: 4, reload: 2.3, speed: 135, gravity: 4, spread: 0.065, pellets: 8, range: 70 }),
  [ITEM.harpoon]: gun({ damage: 80, interval: 1.4, mag: 1, reload: 2.1, speed: 300, gravity: 2.5, spread: 0, range: 240, crit: 1.75 }),
  [ITEM.mortar]: gun({ damage: 60, interval: 1.3, mag: 2, reload: 2.8, speed: 0, gravity: 26, spread: 0.012, range: 220, crit: 1, splash: 11, lob: true }),
  [ITEM.repeater]: gun({ damage: 7, interval: 0.1, mag: 30, reload: 2, speed: 185, gravity: 3, spread: 0.024, range: 150, auto: true }),
  [ITEM.broadside]: gun({ damage: 14, interval: 1.6, mag: 3, reload: 3, speed: 110, gravity: 6, spread: 0.02, range: 110, crit: 1.25, sides: 4 }),
  // two half-balls on a chain, whirling: little against a hull, ruin to canvas and spars; slow and short-ranged, so
  // it is the weapon for stopping a ship that runs, aimed high
  [ITEM.chain]: gun({
    damage: 11, interval: 0.85, mag: 3, reload: 2.4, speed: 115, gravity: 7.5, spread: 0.03, range: 130, crit: 1.25,
    parts: { sail: 3.5, mast: 5, flood: 0.3, rudder: 0.6 },
  }),
  // a ball heated red in the galley's furnace: sets whatever it holes burning, unless the rain has it first
  [ITEM.heated]: gun({ damage: 15, interval: 0.7, mag: 4, reload: 2.6, speed: 140, gravity: 8, spread: 0.012, range: 170, ignite: 5 }),
};

/** Lobbed shots take this long in the air: distance / `per`, held between `min` and `max` seconds. */
export const LOB = { per: 70, min: 0.9, max: 2.8 } as const;

/** Damage holds to `hold` of range, then falls to `floor` at full range; shots fly on to `beyond` of range. */
export const FALLOFF = { hold: 0.6, floor: 0.5, beyond: 1.15 } as const;

/** The muzzle: metres ahead of the mast step and above the water. */
export const MUZZLE = { ahead: 2.6, up: 2.8 } as const;

/** Swapping weapons takes a moment before the next shot. */
export const EQUIP = 0.22;

/** Hit boxes in the ship's frame: x across, y up from the waterline, z along. The head of the sail is the weak spot. */
export const BOXES: readonly (readonly [number, number, number, number, number, number, boolean])[] = [
  [-2.8, 2.8, -1, 2.6, -9.4, 9.2, false],
  [-2.4, 2.4, 2.6, 5.4, -10, -3.9, false],
  [-2, 2, 2.6, 4.4, 5.4, 9, false],
  [-1.8, 1.8, 4.4, 11, -8.5, 9.5, false],
  [-1.6, 1.6, 11, 20, -9, 7, true],
];

/** Consumables: values, caps, use times (s) and stack sizes. */
export interface Use { readonly shield: number; readonly hull: number; readonly cap: number; readonly time: number; readonly stack: number }
export const USES: Readonly<Record<number, Use>> = {
  [ITEM.smallShield]: { shield: 25, hull: 0, cap: 50, time: 1, stack: 6 },
  [ITEM.bigShield]: { shield: 50, hull: 0, cap: 100, time: 2.6, stack: 3 },
  [ITEM.repairKit]: { shield: 0, hull: 15, cap: 75, time: 1.8, stack: 8 },
  [ITEM.fullRepair]: { shield: 0, hull: 100, cap: 100, time: 5, stack: 2 },
};

export const SLOTS = 5;

/** Loot: rarity weights on the water and at loot spots, and the share that are weapons. */
export const LOOT = {
  weights: [42, 30, 17, 8, 3],
  weapon: 0.62,
  /** Consumables come in these counts, and read as this rarity. */
  counts: { [ITEM.smallShield]: 3, [ITEM.bigShield]: 1, [ITEM.repairKit]: 4, [ITEM.fullRepair]: 1 } as Record<number, number>,
  rarity: { [ITEM.smallShield]: 1, [ITEM.bigShield]: 2, [ITEM.repairKit]: 1, [ITEM.fullRepair]: 3 } as Record<number, number>,
  /** A second item at a spot, with this chance. */
  second: 0.4,
  reach: 9.5,
  /** Fresh loot can't be picked up for this long, so a drop isn't caught straight back. */
  settle: 0.6,
  drift: 2.2,
  /** Loot spots when the world has none yet: this many per region, on open water near its centre. */
  fallback: 6,
} as const;

// ---------------------------------------------------------------- damage

/** Bots spar more gently with each other, and with a player fresh off the drop. */
export const SPAR = { bots: 0.4, player: 0.65, grace: 0.4, from: 8, over: 50 } as const;

/** Burning: hit points a second, through the shield first. */
export const BURN = { rate: 3, fireShot: 3 } as const;

/**
 * Damage to a ship's parts, from the hull points a hit takes where it lands (the shield, an aura round her, keeps
 * every part whole while it holds). Per hull point: the canvas torn (a share, 1 all of it), the mainmast weakened (1
 * and it falls), water let in at the waterline (1 full) and the rudder shot about (1 shot away). Hits within `mid`
 * metres of her centreline aloft strike the mast itself, `spar` times as hard.
 */
export const PARTS = {
  sail: 0.01, mast: 0.0068, flood: 0.0095, rudder: 0.008, mid: 0.9, spar: 1.6,
  /** Aloft is above `aloft` metres; the waterline below `waterline`; the rudder aft of `stern` metres along her. */
  aloft: 4.4, waterline: 1.1, stern: -6.8,
  /** Drive lost with all her canvas torn; the share she keeps with the mainmast down, and under a jury rig. */
  drive: 0.42, bare: 0.5, jury: 0.82,
  /** Drag of a hull full of water, and how much heavier she steers; steering lost with the rudder shot away. */
  drag: 0.32, heavy: 0.25, steer: 0.58,
  /** Seconds to rig a jury mast once the mainmast falls, and how weak it stands. */
  rig: 14, rigged: 0.55,
  /** Past `sinks` the water takes hull, `rate` points a second when she is full; it is past the shield. */
  sinks: 0.6, rate: 5,
  /** Quiet for `quiet` seconds, the pumps clear `pump` a second and the crew mends `mend` of canvas and rudder;
   *  twice as fast in her own water. */
  quiet: 3, pump: 0.022, mend: 0.012,
  /** A repair kit mends this share of each part's damage; a full repair mends every part and rigs a jury mast. */
  kit: 0.5,
  /** Lightning down the mast: how much it weakens it; a breaching whale's wave: how much water it ships. */
  bolt: 0.45, swamp: 0.35,
} as const;

/** Raking fire: a shot within `cos` of a ship's length, landing more than `ends` metres from her middle, does `mult`. */
export const RAKE = { cos: 0.92, ends: 6, mult: 1.35 } as const;

/** Blanketing: a ship within `reach` metres upwind (within `cone` of dead upwind) takes up to `most` of the wind. */
export const BLANKET = { reach: 48, cone: 0.82, most: 0.38 } as const;

/**
 * Fire aboard: the canvas it burns away a second; a burning ship sets one within `spread` metres downwind of her
 * (within `cone` of the wind) burning for `catch` seconds, and stronger wind (per m/s) feeds it; rain, thunder and snow
 * put it out `quench` times as fast and quench heated shot before it catches.
 */
export const FIRE = { sail: 0.025, spread: 12, cone: 0.5, catch: 4, wind: 0.06, quench: 5 } as const;

// ---------------------------------------------------------------- territory and coins

export const INK = {
  /** Home water inked on landing. */
  home: 26,
  /** Cutting a rival's trail: what it costs the hull that laid it (past the shield), and pays the cutter. */
  cut: 28,
  cutCoins: 10,
  /** A trail longer than this many cells runs dry. */
  trail: 260,
  /** Hull mended a second in your own water, once nobody has hit you for `quiet` seconds. */
  repair: 2.5,
  quiet: 4,
  /** Coins a claimed square metre pays, and a held square metre every `every` seconds. */
  claim: 1 / 220,
  rent: 1 / 2600,
  every: 10,
} as const;

export const COINS = {
  /** One coin for every this many metres sailed. */
  metres: 40,
  kill: 12,
  loot: 1,
} as const;

/** Gull deliveries: what each parcel costs. */
export const PARCELS = [
  { name: 'Supplies', cost: 20 },
  { name: 'Armament', cost: 45 },
  { name: 'Treasure', cost: 80 },
] as const;

export const DELIVERY = { speed: 30, height: 40, drop: 5, ahead: 12, rest: 18, fetch: 2.5 } as const;

/** Region perks: the numbers behind each. */
export const PERKS = {
  frostShot: { slow: 0.7, time: 1.5 },
  fastRepair: 2,
  longRange: 1.15,
  fastReload: 0.7,
  quickGust: 0.6,
  cheapDeliveries: 0.7,
  shallowDraft: 0.3,
  fastRefill: 0.7,
  tightTurns: 1.5,
  currentRider: 1.5,
  spotter: 5,
  fireShot: 3,
  lootSense: 120,
} as const;

// ---------------------------------------------------------------- abilities

export const POWERS = {
  repair: { hull: 30, time: 3 },
  smokeScreen: { r: 25, time: 8 },
  ram: { speed: 12, time: 1.5, damage: 40 },
  reveal: { r: 250, time: 6 },
  hardTurn: { boost: 1 },
  decoy: { time: 8 },
  wave: { r: 40, push: 12, damage: 5 },
  driftMine: { arm: 1, r: 8, splash: 10, damage: 35, life: 60 },
  salvage: 30,
  quickReload: 0.8,
  quickHands: 0.75,
  lightHull: { speed: 1.05, turn: 1.15 },
  windReader: 0.5,
  stormWalker: 0.6,
  deepHold: 1,
  steadyAim: 0.2,
  /** Whale Call: how far ahead along the aim the whale is called to, at the nearest and furthest. */
  whaleCall: { near: 45, far: 110 },
} as const;

/** How much turning spreads shots, at the full turning rate. */
export const TURN_SPREAD = 1;

// ---------------------------------------------------------------- wind, weather, tides, day

export const WIND = {
  /** Mean wind speed, m/s. */
  speed: 6,
  terms: 12,
  freq: [3, 6],
  drift: [0.0005, 0.0012],
  /** Wind weaker than this share of the mean reads as unsteady. */
  lull: 0.35,
  /** Below full strength the sails lose way, down to `airs` in a flat calm. */
  airs: 0.7,
  /** The lee of an island: probes upwind, in metres, and how still it gets. */
  lee: [12, 28, 48],
  still: 0.25,
} as const;

/** Wind gusts: patches of stronger wind that drift over the sea. */
export const GUSTS = { count: 48, radius: [25, 55], life: [6, 14], drift: 0.7, strength: 0.6 } as const;

export const WEATHER_KIND = { fog: 0, rain: 1, thunder: 2, calm: 3, snow: 4, ash: 5 } as const;
export const WEATHER_NAMES = ['fog', 'rain', 'thunder', 'calm', 'snow', 'ash'] as const;

export const WEATHER = {
  slots: 5,
  least: 3,
  r: [70, 130],
  life: [70, 150],
  gap: [0, 30],
  /** Seconds to grow and to fade. */
  rise: 12,
  /** The share of the radius at full strength. */
  core: 0.6,
  /** Drift speed as a share of the wind. */
  drift: 0.15,
  /** A system spawned over a region is one of its own kinds this often. */
  own: 0.85,
  /** A system formed after the start is formed over the calm this often. (Settled overnight in the owner's absence;
   *  the owner may change it.) */
  gather: 0.5,
  fog: { sight: 0.35 },
  rain: { wind: 1.4, rough: 1.8, spread: 1.3, swirl: 3 },
  thunder: { every: [6, 12], warn: 1.5, reach: 12, damage: 25, open: 30, swirl: 3 },
  calm: { wind: 0.15 },
  /** Snow: ice builds over `build` seconds and slows turning by up to `turn`. It lives only north of `lat`. */
  snow: { build: 20, melt: 10, turn: 0.5, lat: 50 * (PI / 180) },
  /** Ash: after `after` seconds in it, embers burn this many points a second. */
  ash: { after: 4, rate: 1.5 },
} as const;

/** Tides: the sea level swings by the world's TIDE_AMPLITUDE over this period, in seconds. */
export const TIDE = { period: 240 } as const;

export const DAY = {
  /** Hours the sun moves in a second: about 4 hours over a match. */
  rate: 4 / 630,
  /** The planet's tilt is drawn from ±this, in radians. */
  tilt: 0.45,
  /** Darker than this sun height counts as night. */
  dusk: -0.05,
} as const;

// ---------------------------------------------------------------- sight

export const SIGHT = {
  /** The sightline: another ship's mast drops below the horizon at about this range. */
  range: 240,
  /** At night, beyond this a ship shows only as a lantern. */
  lantern: 150,
  /** How far captains notice a ship early on and late, before temperament. */
  notice: [45, 180],
} as const;

// ---------------------------------------------------------------- the Storm

/** Radii of the safe circles in metres: the first covers half the planet, the last nonzero one is the final circle. */
export const ZONES: readonly number[] = [(PI / 2) * R, 600, 400, 260, 160, 90, 40, 0];

/** Seven phases: each waits, then shrinks to the next circle. Damage is hull points a second, past the shield. */
export const STORM = {
  phases: [
    { wait: 95, shrink: 65, damage: 1 },
    { wait: 85, shrink: 60, damage: 2 },
    { wait: 80, shrink: 55, damage: 3 },
    { wait: 65, shrink: 50, damage: 5 },
    { wait: 45, shrink: 40, damage: 7 },
    { wait: 35, shrink: 35, damage: 9 },
    { wait: 30, shrink: 30, damage: 12 },
  ],
  /** Before the first phase. */
  first: 1,
  /** Once closed, the Storm keeps rising by this much every `every` seconds. */
  rise: 4,
  every: 10,
  /** Rows of the territory grid the Storm washes each tick. */
  scan: 30,
  /** Treasure glints just inside the wall when a phase starts to close. */
  treasure: 3,
} as const;

// ---------------------------------------------------------------- the Gale

export const GALE = {
  /** Height of the Gale above the sea, and how long it carries the fleet. */
  height: 350,
  time: 35,
  /** Arc it covers, in radians. */
  arc: PI,
  /** Gliding: horizontal speed, fall speed, and the dive. */
  glide: 32,
  slow: 12,
  fall: 10,
  dive: 35,
  turn: 1.5,
  /** Ships near land as they come down drift to open water below this height. */
  steer: 40,
  /** Speed on landing. */
  land: 10,
} as const;

// ---------------------------------------------------------------- the whale

export const WHALE = {
  speed: 6,
  surface: 20,
  under: 40,
  waypoints: 6,
  roam: 250,
  /** Depth of water it needs to surface. */
  deep: 4,
  /** The breach: warning time, reach of the lift and of the flip, the lift, and how long a flip lasts. */
  rising: 6,
  lift: 35,
  flip: 18,
  up: 12,
  flipped: 3,
  /** Breaches come as these Storm phases are announced. */
  at: [1, 3],
  loot: 6,
} as const;

// ---------------------------------------------------------------- the regions' events

/**
 * Each region's own event (regionEvents.ts), once a match, in region order: the first `first` seconds in, then one every
 * `every` seconds, each up to `late` seconds later than that, with a warning of `warn` seconds before it.
 */
export const REGION_EVENT = {
  first: 45,
  every: 27,
  late: 12,
  warn: [5, 10],
  /** How long each runs, and how many seconds it takes to build up and to die down, by region index. The Glass Sea's
   *  runs through the whale's leap until it is down and the wall of water thrown. */
  run: [60, 45, 60, 4, 75, 60, 70, 50, 7, 70, 70, 60, 45, 60, 70, 45],
  ramp: [8, 6, 10, 0, 0, 6, 10, 6, 0, 10, 10, 0, 4, 10, 10, 8],
  /** The Ice Crown: how many times as fast the floes ride, and how close to one a captain will go. */
  ice: { speed: 4, berth: 16 },
  /** The Fjords' and the Blossom Run's lanes run this many times as fast. */
  surge: 2.5,
  /** Mistwood's fog bank: its radius as it starts and at its height. */
  mist: { from: 140, r: 290 },
  /** The falling spire and the Narrows' rockfall: damage to a ship caught under them. */
  fall: 25,
  rock: 20,
  /** The Basalt Stacks' tunnel: a ship needs this much air between the sea and the roof. */
  air: 9.5,
  /** The kelp bloom: its radius at its height, and the share of her speed a ship in it keeps. */
  bloom: { r: 110, slow: 0.5 },
  /** The Spice Isles' clam bed: how many pearls, and how much rarer than usual they roll. The Basalt Stacks' cave hoard, likewise. */
  pearls: { n: 5, boost: 3 },
  hoard: { n: 3, boost: 1 },
  /**
   * Cinder Peak: a bomb every `every` seconds, `flight` seconds in the air, landing `near` to `far` metres from the peak,
   * hurting ships within `reach` and setting them burning for `burn` seconds; one in `aimed` falls near a ship. The ash
   * cloud's radius, how fast it drifts on the wind (m/s), and how far it can go.
   */
  eruption: { every: 0.7, flight: 1.4, near: 28, far: 130, reach: 9, damage: 14, burn: 3, aimed: 3, ash: { r: 100, drift: 3, far: 220 } },
  /** The Weeping Isle's cloudburst: the radius of its fog and of its rain. */
  cloudburst: { fog: 320, rain: 260 },
  /** The Maelstrom's vortex at the event's height, as a multiple of its usual strength. */
  vortex: 2.4,
  /** A captain goes for an event's prize this far off, and keeps this far outside a danger it is escaping. */
  reach: 300,
  berth: 15,
  /** Metres of the Storm's calm an event's danger must leave clear of it (past the berth) by its end; one that would not comes earlier. */
  room: 60,
} as const;

// ---------------------------------------------------------------- the match

export const MATCH = { ships: 20, tick: 1 / 30 } as const;

/** The free voyage (voyage.ts). */
export const VOYAGE = {
  /** Captains who sail the voyage with you; the rest of the fleet stays ashore. */
  captains: 7,
  /** Seconds a wreck waits before it refits and sails again: yours, and a captain's. */
  refit: 8,
  refitCaptain: 30,
  /** Metres a refitted ship comes back clear of every other ship, and a captain's clear of you. */
  clear: 160,
  clearYou: 320,
  /** Seconds between loot laid again on an empty spot. */
  loot: 6,
  /** Seconds what a wreck spilled floats before it goes down. */
  spill: 240,
  /** Seconds a region's event rests before it comes round again, at the least and the most. */
  rest: [150, 330],
  /** Seconds between the whale's breaches, at the least and the most. */
  whale: [150, 260],
  /** Seconds before a hidden cache taken is filled again. */
  cache: 120,
} as const;
