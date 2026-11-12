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
