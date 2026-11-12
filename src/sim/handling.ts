// What a ship's handling is tuned by, all in one place for tuning by feel: the sea demo's (0117 src/sea/ship.ts) with
// its top speed brought down from 14 to 12 m/s for this smaller planet, quicker to gather way (0.47 → 0.8) and to turn
// from rest (bite 0.25 → 0.45) after the first drive on the phone, and the speed at which the
// rudder bites fully kept the same share of top speed. What her hull does when she meets another's is beside it.

/** Everything her handling is tuned by. Rates are per second. */
export const SHIP = {
  /** Top speed, m/s. */
  top: 12,
  /** The share of the gap to the speed asked for that she makes up a second, gathering way and losing it. */
  gather: 0.8,
  drag: 0.35,
  /** Her fastest turn, rad/s; and how fast her turn follows the rudder. */
  turn: 0.42,
  answer: 2.5,
  /** The rudder bites this much at rest, and fully from `fullBite` of top speed on. */
  bite: 0.45,
  fullBite: 0.32,
  /** Rudder per radian still to turn: full rudder from 48° off the course. */
  steer: 1.2,
  /** Hull, metres: her keel's depth below the waterline, her length and beam. */
  draught: 2.2,
  length: 26,
  beam: 6.5,
} as const;

/**
 * Ships meeting (contact.ts): 0117's ramming (src/sim/tables.ts SHIP, sailing.ts collide) with its speeds brought down
 * from her top of 14.5 m/s to 12, so the same share of top speed does the same damage, in its hit points (a ship there
 * had 100 of hull behind 100 of shield).
 */
export const RAM = {
  /** Closing faster than this, m/s, where they meet, is a ram (0117: 7). */
  least: 5.8,
  /** A ram's damage: hit points for each m/s of closing past `past` (0117: 2.2 past 5); the most one ram takes off a
   * ship (0117's cap). */
  damage: 2.65,
  past: 4.1,
  most: 45,
  /** Each ship takes `bear` of it, and the rest by the other's share of the closing, so the one driving in takes the
   * less (0117). */
  bear: 0.3,
  /** And by where it lands on her: her stem is built to take a blow and her side is not. A blow is on her bow or her
   * stern when it meets her within `stem` radians of dead ahead or dead astern. */
  bow: 0.5,
  side: 1,
  stern: 0.75,
  stem: 0.87,
  /** The share of the closing given back as they part (0117's shove came to 0.2 of it), and how hard their sides grip
   * as they slide, as a share of how hard they meet. */
  bounce: 0.2,
  grip: 0.2,
  /** Her mass against being pushed broadside, the water she must shoulder aside with it, and her radius of gyration
   * in yaw, metres (about a plank's of her length): each to her mass ahead. */
  sway: 2,
  gyration: 0.3 * SHIP.length,
  /** How fast a shove dies away in the water, per second (0117's 1.5), and below what speed, m/s, it is gone. */
  ease: 1.5,
  still: 0.01,
  /** Hulls are kept this many metres apart; and a pair that has rammed may ram again once this many metres clear. */
  skin: 0.01,
  rearm: 3,
} as const;

/**
 * A ship's hit points (health.ts): 0117's (src/sim/tables.ts SHIP, harm.ts), 100 of hull behind 100 of shield. The
 * shield takes every blow first and what it can't hold goes on to the hull in the same blow; it never comes back of
 * itself, only from what heals it. At 0 hull she sinks.
 */
export const HEALTH = {
  /** The most hull and shield she can have. */
  hull: 100,
  shield: 100,
  /** The shield she puts to sea with (0117: none, filled from loot; full here until there is loot). */
  start: 100,
} as const;

/**
 * Her gun (gun.ts) and its balls (shot.ts): one at most, on the plinth in her waist, firing one ball at a time.
 * 0117's cannon (tables.ts WEAPONS) with its muzzle speed brought down by the same share as her top speed (165 m/s at
 * 14.5, so 136 at 12) and its 200 m reach kept, on the same 554 m planet. The balls fly true orbits round the
 * planet's centre, under a pull chosen so that 136 m/s carries a ball no further than `range` at its best elevation
 * (shot.ts MU): some 11 g at the sea, for this tiny world; a flat shot's ball would otherwise go round it.
 * Rarity is 0117's five tiers: it mostly closes up the spread and widens the assist; damage and reload ease a little.
 */
export const GUN = {
  /** The tiers, worst to best (0117's). */
  rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  /** Muzzle speed, m/s; and the furthest a ball carries, m along the sea, before it is back down to the muzzle's height. */
  speed: 136,
  range: 200,
  /** Hit points a ball takes off, and seconds to reload: 0117's cannon's 20, and between its 0.42 s a shot from the
   * magazine and its 1.9 s reload, for a gun that fires one ball at a time; each scaled by 0117's rarity table. */
  damage: 20,
  reload: 2,
  damageBy: [1, 1.08, 1.16, 1.24, 1.32],
  reloadBy: [1, 0.95, 0.9, 0.85, 0.8],
  /** The spread: each ball goes off within this cone (half-angle, radians) of where it is laid; about 7 m off at
   * 150 m for a common gun and 2 m for a legendary one. New: 0117 laid its guns on the touched point, 0.008 rad. */
  spread: [0.05, 0.038, 0.028, 0.02, 0.014],
  /** The assist: the ship nearest the bearing she is aimed on, within this cone (half-angle, radians) of it and in
   * range, is laid on, led for her course. New: 0117 had none, but aimed at a touched point. */
  assist: [0.2, 0.25, 0.3, 0.36, 0.42],
  /** In choosing among those in the cone, the share of range that counts as much as the cone's whole width. */
  nearer: 0.5,
  /** The muzzle, metres ahead of amidships and above the waterline: the gun on its plinth (src/ship/mount.ts). */
  ahead: 3,
  up: 2.6,
  /** Her hull, for a ball: the hull's capsule (contact.ts) standing from the waterline to this many metres up. */
  freeboard: 4,
  /** A ball's path is looked along every this many metres for a hull or the ground; and gone after this many seconds. */
  probe: 0.25,
  life: 8,
} as const;
