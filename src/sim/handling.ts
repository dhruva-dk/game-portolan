// What a ship's handling is tuned by, all in one place for tuning by feel: the sea demo's (0117 src/sea/ship.ts) with
// its top speed brought down from 14 to 10 m/s for this smaller planet, its rates kept, and the speed at which the
// rudder bites fully kept the same share of top speed.

/** Everything her handling is tuned by. Rates are per second. */
export const SHIP = {
  /** Top speed, m/s. */
  top: 10,
  /** The share of the gap to the speed asked for that she makes up a second, gathering way and losing it. */
  gather: 0.47,
  drag: 0.35,
  /** Her fastest turn, rad/s; and how fast her turn follows the rudder. */
  turn: 0.42,
  answer: 2.5,
  /** The rudder bites this much at rest, and fully from `fullBite` of top speed on. */
  bite: 0.25,
  fullBite: 0.32,
  /** Rudder per radian still to turn: full rudder from 48° off the course. */
  steer: 1.2,
  /** Hull, metres: her keel's depth below the waterline, her length and beam. */
  draught: 2.2,
  length: 26,
  beam: 6.5,
} as const;
