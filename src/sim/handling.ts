// What a ship's handling is tuned by, all in one place for tuning by feel: the sea demo's (0117 src/sea/ship.ts) with
// its top speed brought down from 14 to 12 m/s for this smaller planet, quicker to gather way (0.47 → 0.8) and to turn
// from rest (bite 0.25 → 0.45) after the first drive on the phone, and the speed at which the rudder bites fully kept
// the same share of top speed; then, by the owner ("a little faster and more nimble"), 12.5% faster (12 → 13.5 m/s),
// 12% quicker to turn (0.42 → 0.47 rad/s), gathering way (0.8 → 0.9) and answering her helm (2.5 → 2.8) to suit.
// Whatever was brought down from 0117's top of 14.5 m/s by her top's share (RAM, GUST, the guns' muzzle speeds) is now
// brought down by 13.5 / 14.5. What her hull does when she meets another's is beside it.

/** Everything her handling is tuned by. Rates are per second. */
export const SHIP = {
  /** Top speed, m/s. */
  top: 13.5,
  /** The share of the gap to the speed asked for that she makes up a second, gathering way and losing it. */
  gather: 0.9,
  drag: 0.35,
  /** Her fastest turn, rad/s; and how fast her turn follows the rudder. */
  turn: 0.47,
  answer: 2.8,
  /** The rudder bites this much at rest, and fully from `fullBite` of top speed on. */
  bite: 0.45,
  fullBite: 0.32,
  /** Rudder per radian still to turn: full rudder from 48° off the course. */
  steer: 1.2,
  /**
   * Hull, metres: her keel's depth below the waterline, her length and beam, for her capsule (contact.ts, shot.ts) and
   * her soundings (shoal.ts). The length is the drawn galleon's overall, beak and bowsprit in (src/ship at 0.6×, as
   * its commit gives it: 26 m overall), not her waterline, which is 18.6 m by 5.0 m (src/ship/waterline.ts): so her
   * capsule meets a bowsprit, and she sounds 10.4 m ahead, past her stem at 9.2. 0117's hull, a circle, went by its
   * waterline (tables.ts SHIP half 8.6, beam 2.6: 17.2 m by 5.2). The beam is wider than the drawn hull's 5.2 m at
   * its widest, and nothing records why; left as it is until it is tuned by feel.
   */
  draught: 2.2,
  length: 26,
  beam: 6.5,
  /** Her rig's top over the water, metres: the mainmast's truck (src/ship/lines.ts MASTS at 0.6). A line of sight
   *  through her canvas is on her (sight.ts). */
  rig: 21.5,
} as const;

/**
 * Ships meeting (contact.ts): 0117's ramming (src/sim/tables.ts SHIP, sailing.ts collide) with its speeds brought down
 * from her top of 14.5 m/s to 13.5, so the same share of top speed does the same damage, in its hit points (a ship
 * there had 100 of hull behind 100 of shield).
 */
export const RAM = {
  /** Closing faster than this, m/s, where they meet, is a ram (0117: 7). */
  least: 6.5,
  /** A ram's damage: hit points for each m/s of closing past `past` (0117: 2.2 past 5); the most one ram takes off a
   * ship (0117's cap). */
  damage: 2.363,
  past: 4.655,
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
  /** The shield she puts to sea with (0117's: none, filled from loot). */
  start: 0,
} as const;

/**
 * Her own water (territory.ts): inside it her shield comes back `shield` hit points a second, well under what a
 * common cannon takes off a second held on her (GUNS.cannon), so a fight can't be won by sitting at home, but 20–30 s
 * there after one puts back 60–90 of it; and she sails `speed` times her top speed (+9%, 14.7 m/s).
 */
export const HOLDING = {
  shield: 3,
  speed: 1.09,
} as const;

/**
 * Gust, her one ability (gust.ts): 0117's (tables.ts GUST, sailing.ts gust), a burst of wind in her canvas and a hop
 * off the water. Two charges, each coming back `recharge` s after the last came back; spent, for `time` s her speed
 * asked rises by `speed` and is reached at `accel` m/s², and her turn by `turn`; her balls go off `spread` times as
 * wide. Its speeds brought down by her top speed's share as RAM's are (14.5 → 13.5: 13 → 12.1 m/s, 28 → 26 m/s²);
 * after it, speed over her top is shed at 0117's deceleration, likewise (4.5 → 4.2 m/s²). The hop: up at `hop` m/s
 * under 0117's gravity (9.8), some 2 m and 1.3 s.
 */
export const GUST = {
  charges: 2, recharge: 6.5, time: 1.15,
  speed: 12.1, accel: 26, shed: 4.2, turn: 1.35, spread: 1.6,
  hop: 6.3, gravity: 9.8,
} as const;

/** The guns' kinds (GUNS), in the order they are told everywhere. */
export const KINDS = ['cannon', 'scatter', 'repeater', 'harpoon', 'mortar'] as const;
export type GunKind = (typeof KINDS)[number];

/** One kind of gun (GUNS). */
export interface Bore {
  /** Hit points a ball takes off (each pellet's), and the balls (pellets) a shot throws. */
  damage: number; pellets: number;
  /** Seconds between shots, held on the trigger; balls a magazine holds; seconds to reload it, once empty. */
  interval: number; mag: number; reload: number;
  /** Seconds from the trigger to the shot (the gun wound up, seen and heard: 0117's telegraph), 0 for none. */
  windup: number;
  /** Muzzle speed, m/s (a lobbed gun's at full range); the furthest a ball laid at its best elevation carries, m, which
   *  sets the pull it flies under (shot.ts: 0117 gave each kind its own gravity), and the furthest it is laid, m. */
  speed: number; carry: number; range: number;
  /** A lobbed gun's fixed elevation, radians (its charge, the muzzle speed, is had for the distance), and the nearest it
   *  is laid, m; 0 for a gun laid low. */
  lob: number; least: number;
  /** The spread, a common gun's: each ball goes off within this cone (half-angle, radians) of where it is laid. */
  spread: number;
  /** Metres round where a shell comes down that it bursts over (0117's burst), 0 for none; whether its damage falls
   *  off with the distance flown (FALLOFF). */
  splash: number; falls: boolean;
}

/**
 * The five guns (gun.ts, shot.ts), on a plinth in her waist, two carried and one in hand: 0117's (tables.ts WEAPONS),
 * their numbers kept, but the muzzle speeds brought down by her top speed's share (14.5 → 13.5 m/s) and each kind's
 * pull chosen by its `carry`, on the same 554 m planet (a flat shot at these speeds would go round it):
 * - cannon, the all-rounder: 20 a ball, 8 in the magazine 0.42 s apart, 1.9 s to reload; 165 → 154 m/s. Its carry is
 *   its range, 200 m, as the one gun this sea had before (its pull some 14 g at the sea, its arcs as they were);
 * - scatter, the shotgun: 8 pellets of 8 in a wide cone, 1 s apart, 4 to a magazine, 70 m (165 → 126 m/s), the pellets
 *   dropping into the sea not far past it;
 * - repeater, the rifle: 7 a ball, 0.1 s apart, 30 to a magazine, 150 m (185 → 172 m/s), flat (12° at full range);
 * - harpoon, the long gun: one 80 bolt, wound up 0.75 s, none of the spread, 240 m (300 → 279 m/s), flattest of all (8°
 *   at full range); its bite does not fall off with range (new: 0117's fell to half, its sail-head crits making up);
 * - mortar, the lob: a 60 shell over 11 m, two to a magazine, wound up 0.6 s, out to 220 m: laid at 60°, its charge
 *   for the distance, 1.3 s in the air at 50 m and 2.8 s at 220 (0117's LOB, 0.9–2.8 s), never nearer than 30 m.
 * 0117's crits (a hit on the sail's head) are left: this sea has no parts to a ship. Rarity scales them all as before.
 */
export const GUNS: Readonly<Record<GunKind, Bore>> = {
  cannon: { damage: 20, pellets: 1, interval: 0.42, mag: 8, reload: 1.9, windup: 0, speed: 154, carry: 200, range: 200, lob: 0, least: 0, spread: 0.03, splash: 0, falls: true },
  scatter: { damage: 8, pellets: 8, interval: 1, mag: 4, reload: 2.3, windup: 0, speed: 126, carry: 110, range: 70, lob: 0, least: 0, spread: 0.09, splash: 0, falls: true },
  repeater: { damage: 7, pellets: 1, interval: 0.1, mag: 30, reload: 2, windup: 0, speed: 172, carry: 360, range: 150, lob: 0, least: 0, spread: 0.05, splash: 0, falls: true },
  harpoon: { damage: 80, pellets: 1, interval: 1.4, mag: 1, reload: 2.1, windup: 0.75, speed: 279, carry: 900, range: 240, lob: 0, least: 0, spread: 0, splash: 0, falls: false },
  mortar: { damage: 60, pellets: 1, interval: 1.3, mag: 2, reload: 2.8, windup: 0.6, speed: 157, carry: 254, range: 220, lob: Math.PI / 3, least: 30, spread: 0.02, splash: 11, falls: false },
};

/** A ball's damage holds to `hold` of its gun's range, then falls to `floor` of it at full range (0117's FALLOFF). A
 *  shell's burst takes off its damage less `edge` of it at its splash's rim (0117's burst). */
export const FALLOFF = { hold: 0.6, floor: 0.5, edge: 0.6 } as const;

/** Seconds from taking a gun in hand to its first shot (0117's EQUIP); the guns she carries. */
export const EQUIP = 0.22, CARRIED = 2;

/**
 * What every gun shares: the rarity tiers (0117's five), each easing the damage and the reload, closing the spread up
 * a little and widening the assist; the muzzle's place; how a ball meets a hull.
 */
export const GUN = {
  /** The tiers, worst to best (0117's). */
  rarities: ['common', 'uncommon', 'rare', 'epic', 'legendary'],
  /** By rarity: the damage and the reload, by 0117's table. */
  damageBy: [1, 1.08, 1.16, 1.24, 1.32],
  reloadBy: [1, 0.95, 0.9, 0.85, 0.8],
  /** The spread, by rarity, times the kind's common one: a common cannon's 0.03 rad goes, across, 4.5 m off at 150 m at
   * most; along, it changes the ball's carry most, up to 10 m at 100 m. Laid on a ship crossing at her top speed
   * (tests/gunnery.test.ts), a common cannon strikes some 19 balls in 20 at 100–150 m, a legendary every one. 0117 laid
   * its guns on the touched point, 0.008 rad for its cannon; each kind's here is that one's share of it. */
  spreadBy: [1, 0.867, 0.733, 0.6, 0.467],
  /** The assist: the ship whose body (sight.ts) stands nearest the line of sight she is aimed along, within this cone
   * (half-angle, radians, seen from the eye) and in range, is laid on, led for her course: 3.4° for a common gun, some
   * 30 px about her on the phone. New: 0117 had none, but aimed at a touched point. */
  assist: [0.06, 0.07, 0.08, 0.09, 0.1],
  /** In choosing among those in the cone, the share of range that counts as much as the cone's whole width. */
  nearer: 0.5,
  /** The muzzle, metres ahead of amidships and above the waterline: the gun on its plinth in the waist abaft the
   *  mainmast (where the chase's eye, astern, sees it under her courses), whose top is 1.44 m astern and 2.32 m up
   *  (src/ship/mount.ts GUN_MOUNT), its bore 0.3 m above that on its post (GUN_DRAWN). (tests/battle.test.ts holds the
   *  two together.) No higher: a ball comes down to the muzzle's height where it is laid, and the nearer that is to
   *  the top of her freeboard the more of a gun's spread flies over her (at 3.3 m a common gun struck a crossing ship
   *  82 balls in 100 at 100 m, against 96 at 2.6 m: tests/gunnery.test.ts). */
  ahead: -1.44,
  up: 2.63,
  /** Her hull, for a ball: the hull's capsule (contact.ts) standing from the waterline to this many metres up. */
  freeboard: 4,
  /** A ball's path is looked along every this many metres for a hull or the ground; and gone after this many seconds. */
  probe: 0.25,
  life: 8,
} as const;
