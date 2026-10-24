// The shared tuning tables of the simulation: every number a designer turns to change how the game plays, one
// section per package (A5). Plain data only; the systems that use a table derive their per-tick constants from it.
import { PI } from './math.ts';
import { R } from './sphere.ts';

// ---------------------------------------------------------------------------------------------------------------
// Ship forms and sailing (WP6)

/**
 * The reference speed, u/s: a caravel under plain sail in fair weather, neither helped nor hindered by its point of
 * sail, sails once round the equator in six minutes (PROMPT.md, The planet).
 */
export const REFERENCE = (2 * PI * R) / 360;

export const FORM = { pinnace: 0, caravel: 1, carrack: 2, galleon: 3 } as const;
export type FormName = keyof typeof FORM;

export interface Form {
  readonly name: FormName;
  /** u/s under plain sail at the neutral point of sail in fair weather. */
  readonly speed: number;
  /** Turning radius in u with the helm hard over under plain sail. */
  readonly radius: number;
  /** Seconds: the time constants of gathering way, of losing it, and of the turn answering the helm. */
  readonly accel: number;
  readonly drag: number;
  readonly helm: number;
  /** Hull points, guns a side, a heavy stern castle, and the doubloons the purse holds (WP7, WP8). */
  readonly hull: number;
  readonly guns: number;
  readonly castle: boolean;
  readonly purse: number;
  /** Relative mass in collisions. */
  readonly mass: number;
  /** The hull as a capsule for collisions: half its length and half its beam, u (WP18's hull lines). */
  readonly half: number;
  readonly beam: number;
  /**
   * The rig's point-of-sail curve: the speed factor is 1 + POINT·g with g = −close·cos θ − reach·cos 2θ, θ the angle
   * off the wind (0 head to wind). With no constant term g averages zero over every heading, so the reference speed
   * holds round a lap; close + reach = 1 loses the full POINT head to wind. A lateen rig loses least close to the
   * wind and gives a little back on a run.
   */
  readonly close: number;
  readonly reach: number;
}

/** Indexed by FORM. Speed falls and the turning circle widens with every step up in size (PROMPT.md, Ship forms). */
export const FORMS: readonly Form[] = [
  {
    name: 'pinnace', speed: 1.1 * REFERENCE, radius: 5, accel: 1.2, drag: 1, helm: 0.18,
    hull: 60, guns: 1, castle: false, purse: 120, mass: 1, half: 1.9, beam: 0.53, close: 0.5, reach: 0.4,
  },
  {
    name: 'caravel', speed: REFERENCE, radius: 6.5, accel: 1.6, drag: 1.3, helm: 0.25,
    hull: 80, guns: 2, castle: false, purse: 180, mass: 1.4, half: 2.2, beam: 0.64, close: 0.3, reach: 0.45,
  },
  {
    name: 'carrack', speed: 0.9 * REFERENCE, radius: 9, accel: 2.4, drag: 1.9, helm: 0.38,
    hull: 120, guns: 3, castle: true, purse: 300, mass: 2.4, half: 2.6, beam: 0.88, close: 0.6, reach: 0.4,
  },
  {
    name: 'galleon', speed: 0.82 * REFERENCE, radius: 11.5, accel: 3.2, drag: 2.5, helm: 0.5,
    hull: 150, guns: 4, castle: false, purse: 400, mass: 3, half: 2.9, beam: 0.8, close: 0.65, reach: 0.35,
  },
];

/** The largest change of speed the point of sail makes (PROMPT.md, Wind). */
export const POINT = 0.15;

/** Indexed by SAIL: full is faster with wider turns, reefed slower with the tightest (PROMPT.md, Controls). */
export const SAILS: readonly { readonly speed: number; readonly radius: number }[] = [
  { speed: 0.72, radius: 0.7 },
  { speed: 1, radius: 1 },
  { speed: 1.22, radius: 1.4 },
];

export const HELM = {
  /** The stick's response: helm = s·(soft + (1 − soft)·|s|), fine near the centre and full at the rim. */
  soft: 0.35,
  /** A ship nearly stopped still turns as if making this fraction of its plain-sail speed. */
  steerage: 0.3,
  /** The fraction of way a turn at the full rate bleeds off. */
  carve: 0.12,
};

/** Grounding: the speed kept when driving straight at the shore, and the crawl over a bar the tide left behind. */
export const LAND = { keep: 0.12, crawl: 0.35 };
/** Ship against ship: restitution of the closing speed; seconds for a shove to die away. */
export const BUMP = { restitution: 0.3, shove: 0.6 };

/** The pilot that sails a route or a drawn course: error in radians that puts the helm hard over, and arrival. */
export const PILOT = {
  full: 0.45,
  /** Seconds of the current turn rate the pilot allows for beyond the form's helm time, so it does not overshoot. */
  lead: 0.35,
  /** u: the end of a route is reached within this, and the pilot aims this far along the route beyond the ship. */
  arrive: 3.5,
  look: 7.5,
  /** Route points ahead of the last one reached among which the ship's place on the route is sought. */
  window: 48,
  /** The sine of the widest angle the bow is laid off against a cross current: beyond it the ship lets the current
   * carry it across rather than stem a stream it cannot beat. */
  crab: 0.6,
  /** Making less than this fraction of its way good along the track, the ship crosses the stream square instead. */
  stem: 0.25,
  /** The headway a route home reckons on against a current, as a fraction of the reference speed, however strong. */
  headway: 0.15,
  /** Ticks between replans of the route home while the button is held. */
  replan: 90,
};

/** The modifiers on speed and turning (PROMPT.md, Territory, The regions, Fittings, Combat). */
export const TRIM = {
  home: 0.1, // sailing in your own waters
  rival: 0.1, // slowed in a rival's waters…
  rootGate: 2, // …twice as much if that rival holds the Root Gate
  whaleRoad: 0.2, // holding the Whale Road, everywhere
  torn: 0.3, // sails torn by chain shot
  gust: 0.14, // at the heart of a gust
  /** Wind strength (fair = 1) over which a ship without storm sails loses speed, all of `loss` by `to`. */
  gale: { from: 1.7, to: 2.4, loss: 0.3 },
  /** Below fair strength the ship slows: speed × (calm + (1 − calm)·strength). */
  calm: 0.4,
};

// ---------------------------------------------------------------------------------------------------------------
// Wind, gusts and currents (WP6)

export const WIND = {
  /** u/s of the true wind at fair strength: what sails, flags, smoke and foliage answer. */
  speed: 6,
  /** Swirling terms in the planetary field, their lobes per half-turn and their drift (rad/s round random axes). */
  terms: 12,
  freq: [3, 6],
  drift: [0.0005, 0.0012],
  /** Where the field is this weak relative to its mean the wind has no settled direction and the point of sail fades. */
  lull: 0.35,
};

export const GUSTS = {
  count: 96,
  radius: [10, 22],
  life: [6, 14],
  /** Gusts run downwind at this fraction of the wind, and add this much strength at their heart. */
  drift: 0.7,
  strength: 0.6,
};

/** The Great Current's lane: width and speed in u and u/s, and the length over which it rises and dies at its ends. */
export const GREAT_CURRENT = { width: 18, speed: 5.5, taper: 30 };
/** The length over which a fixed lane rises and dies at its ends. */
export const LANE_TAPER = 12;

// ---------------------------------------------------------------------------------------------------------------
// Weather, the hour and the regions' moving waters (WP6)

/** What a weather spell is; a fair spell is a slot resting before the seed sends its next. */
export const SPELL = { fair: 0, fog: 1, squall: 2, calm: 3 } as const;

/** The weather (PROMPT.md, Wind, currents, tides, and time). */
export const WEATHER = {
  /** Spells over the planet at once, fair ones included. */
  count: 48,
  /** By SPELL: outer radius in u and life in s (a fair spell has no extent; its life is the rest before the next). */
  spells: [
    { r: [0, 0], life: [20, 50] },
    { r: [26, 48], life: [60, 120] },
    { r: [22, 40], life: [50, 90] },
    { r: [34, 60], life: [70, 140] },
  ],
  /** Seconds a spell takes to rise, and to fade. */
  rise: 15,
  /** Depth is full where 1 − (d/r)² ≥ 1/core: over the inner ~77 % of the radius, thinning to nothing at the edge. */
  core: 2.5,
  /** Spells drift downwind at this fraction of the wind, re-taking its direction every `stride` ticks. */
  drift: 0.15,
  stride: 30,
  /** Farther than `open` u from any coast is the open sea, where squalls form `openSquall` times as often. */
  open: 40,
  openSquall: 3.5,
  /** Fog this deep hides ships and trails, and a trail laid in it never shows on rival charts. */
  veil: 0.5,
  /**
   * At a spell's heart: sight × fog.sight in fog; the wind's strength × (1 + squall.wind), sight × squall.sight and
   * the sea's roughness × squall.rough in a squall; the wind's strength × (1 − calm.drop) and a flat sea in a calm.
   */
  fog: { sight: 0.3 },
  squall: { wind: 0.5, sight: 0.55, rough: 1.8 },
  calm: { drop: 0.75 },
};

/** The hour (PROMPT.md, Time of day): the sun advances `rate` hours a second, so ten minutes of play cover 3.5 hours. */
export const DAY = {
  rate: 3.5 / 600,
  /** The openings a match starts in, hours: dawn into morning, afternoon into dusk, the blue hour into night. */
  starts: [[4.75, 5.75], [14.25, 15.25], [18, 18.75]],
  /** The sun rises at `sunrise` and sets twelve hours later; its path leans `tilt` from the zenith (noon stands at 60°). */
  sunrise: 6,
  tilt: PI / 6,
};

/**
 * The Maelstrom (PROMPT.md, The regions): its swirl falls by `fall` from the eye wall to the rim; its water closes a
 * hull's way on its flow with time constant `grip` s; a ship leaving it keeps `keep` of that way (all of it under its
 * own colour: The Eye), which dies off with time constant `carry` s until under `still` u/s.
 */
export const VORTEX = { fall: 0.4, grip: 1.2, carry: 4, keep: 0.5, still: 0.02 };

// ---------------------------------------------------------------------------------------------------------------
// Fittings (ids and slots: WP6, for the sailing modifiers; WP9 adds the rest of their rules)

export const SLOT = { bow: 0, broadside: 1, stern: 2, rig: 3, hull: 4, lookout: 5 } as const;
export const SLOTS = 6;
/** Pigment tiers; a fitting's tier scales its strength. */
export const TIERS = 5;

export const FITTING = {
  none: 0,
  stemPost: 1, ironRam: 2, cutwater: 3,
  lightGuns: 4, longGuns: 5, swivelGuns: 6, chainShot: 7, heatedShot: 8,
  sternChasers: 9, powderKegs: 10, mortar: 11,
  spareCanvas: 12, lateenMizzen: 13, stormSails: 14,
  copperSheathing: 15, doubledPlanking: 16, pumps: 17,
  sternGlass: 18, crowsNest: 19, lookout: 20,
} as const;

/** What every ship starts with, by slot: the stem post and the light guns, at the first tier. */
export const START_FITTINGS: readonly number[] = [FITTING.stemPost, FITTING.lightGuns, 0, 0, 0, 0];

/** By tier: spare canvas and copper sheathing add speed, the lateen mizzen tightens the turn. */
export const SPARE_CANVAS = [0.04, 0.06, 0.08, 0.1, 0.12];
export const COPPER = [0.03, 0.045, 0.06, 0.075, 0.09];
export const LATEEN_MIZZEN = [0.08, 0.12, 0.16, 0.2, 0.24];
