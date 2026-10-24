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
// Fittings, consumables and chests (PROMPT.md, Chests and loot, Fittings, Consumables): ids, slots and the sailing
// modifiers (WP6); the rest of their rules (WP9, items.ts, with the guns and rams in the combat section)

export const SLOT = { bow: 0, broadside: 1, stern: 2, rig: 3, hull: 4, lookout: 5 } as const;
export const SLOTS = 6;
/** Pigment tiers; a fitting's tier scales its strength. */
export const TIERS = 5;
/** The pigment tiers, dullest first: a chest glows in its tier's colour as the gull carries it, before it lands. */
export const PIGMENT_TIER = { ironGall: 0, verdigris: 1, ultramarine: 2, vermilion: 3, goldLeaf: 4 } as const;

export const FITTING = {
  none: 0,
  stemPost: 1, ironRam: 2, cutwater: 3,
  lightGuns: 4, longGuns: 5, swivelGuns: 6, chainShot: 7, heatedShot: 8,
  sternChasers: 9, powderKegs: 10, mortar: 11,
  spareCanvas: 12, lateenMizzen: 13, stormSails: 14,
  copperSheathing: 15, doubledPlanking: 16, pumps: 17,
  sternGlass: 18, crowsNest: 19, lookout: 20,
} as const;

/** By FITTING, the slot it goes in (none: −1). */
export const FITTING_SLOT: readonly number[] = [-1, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5];

/**
 * What a captain sets out with by its rank tier (items.ts startingFittings; WP10 and WP11 fit the fleet out), slot by
 * slot: the fitting each slot holds from rank tier `at`, every one at the brightest pigment tier in the loot pool a
 * rank below (the first at the first rank), so higher-ranked captains sail better fitted.
 */
export const OUTFIT: readonly { readonly at: number; readonly kind: number }[] = [
  { at: 1, kind: FITTING.stemPost }, { at: 1, kind: FITTING.lightGuns }, { at: 4, kind: FITTING.sternChasers },
  { at: 3, kind: FITTING.spareCanvas }, { at: 2, kind: FITTING.doubledPlanking }, { at: 5, kind: FITTING.crowsNest },
];

/** What every ship starts with, by slot, at the first tier: the first rank's outfit, the stem post and the light guns. */
export const START_FITTINGS: readonly number[] = OUTFIT.map((o) => (o.at <= 1 ? o.kind : FITTING.none));

/** By tier: spare canvas and copper sheathing add speed, the lateen mizzen tightens the turn. */
export const SPARE_CANVAS = [0.04, 0.06, 0.08, 0.1, 0.12];
export const COPPER = [0.03, 0.045, 0.06, 0.075, 0.09];
export const LATEEN_MIZZEN = [0.08, 0.12, 0.16, 0.2, 0.24];
/** Storm sails by tier: the share of speed gained in a gale (TRIM.gale) where other rigs lose it; at the first tier only nothing is lost. */
export const STORM_SAILS = [0, 0.03, 0.06, 0.09, 0.12];
/** Pumps by tier: hull points a second mended anywhere, besides any harbour's or home waters' mending (combat.ts). */
export const PUMPS = [0.15, 0.25, 0.35, 0.45, 0.55];
/** By tier, u: how far astern the stern glass's inset shows the sea, and how far the lookout points out ships it knows of (items.ts). */
export const STERN_GLASS = [25, 30, 35, 40, 45];
export const LOOKOUT = [40, 50, 60, 70, 80];

/** Consumables: item ids after the fittings' (an offer holds either). A ship has three slots, each stacking one kind. */
export const CONSUMABLE = { patchKit: 21, ward: 22, gust: 23, fogFlask: 24, flare: 25 } as const;
export const CONSUMABLE_SLOTS = 3;

/**
 * By CONSUMABLE from the patch kit, the seconds each is at work once used (items.ts): the patch kit restores `patch` of
 * the full hull over its time; the ward takes every blow and holds the open trail (combat.ts damage, territory.ts
 * breakTrail); the gust drives the ship `gust` faster (sailing.ts trim); the fog flask hides ship and trail from every
 * rival, and the flare shows its ship every ship within SIGHT.flare (visibility.ts).
 */
export const CONSUMABLES = { time: [3, 4, 4, 20, 6], patch: 0.35, gust: 0.4 };

/**
 * Loot (items.ts). Pigment tier k enters the loot pool at the player's rank tier `enters[k]` (MatchSetup.rank, the
 * first rank 1). A chest's tier is drawn by `weight`, each tier's growing by `climb` for every rank tier past its entry
 * and × the region's richness once for every tier above the first, so higher ranks and richer seas bring brighter
 * chests. Each of a chest's offers is a consumable with chance `consumable` by tier, a stack of `count` by tier, else a
 * fitting of the chest's tier. A ship takes a chest by sailing within `reach` u of it; a fitting it swaps out floats
 * `astern` u behind its stern. Captains count a consumable `worth` a pigment tier each (items.ts worth).
 */
export const LOOT = {
  enters: [1, 2, 3, 5, 7], weight: [1, 0.5, 0.25, 0.12, 0.06], climb: 0.5,
  consumable: [0.45, 0.4, 0.35, 0.3, 0.25], count: [1, 1, 2, 2, 3], reach: 0.8, astern: 1.5, worth: 0.5,
};

// ---------------------------------------------------------------------------------------------------------------
// Territory, trails and doubloons (WP7)

/** Home waters: the disc a ship inks where it slows after breaking off, and what its own waters give it. */
export const HOME = {
  radius: 10, // u: the home disc's radius
  repair: 0.5, // hull points a second mended inside your own waters (WP8 mends the hull)
  gull: 0.75, // a gull call costs this share of its price inside your own waters (WP9)
};

/** What doubloons are earned at (PROMPT.md, Doubloons). */
export const ECONOMY = {
  trail: 0.6, // into the purse per u sailed on an open trail, up to the form's purse: a pinnace fills its 120 in 200 u
  income: 1 / 60000, // a second per u² held, straight into the bank: one doubloon a minute for every 1000 u²
};

/** What floats (MatchState.coins): a spill scatters its doubloons as up to `most` coins of about `each`, within `scatter` u. */
export const COINS = {
  count: 96, // things afloat at once (coins, flotsam, bottles); a full sea gives the oldest one's place to the new
  each: 15,
  most: 8,
  scatter: 2.5, // u
  reach: 1.5, // u: a hull passing this close scoops a coin, flotsam or a bottle
  life: 90, // s afloat before a coin sinks
};

/** Harbours: any hull in a harbour's waters (Geography ZONE.harbour) mends at harbour speed. */
export const HARBOUR = {
  repair: 4, // hull points a second (WP8 mends the hull)
};

/**
 * What the landmarks' perks give while the landmark lies in the holder's waters (PROMPT.md, The regions). The Root
 * Gate and the Whale Road are in TRIM, the Eye in VORTEX (sailing.ts), the Caldera in CALDERA.
 */
export const PERK = {
  crownLight: { reach: 70, half: 0.15, period: 12 }, // the beam: u, half-width rad, s a turn
  greatFalls: 2, // home-waters repair ×
  arch: 4 / 3, // reload speed × (WP8, WP9)
  sandbarLight: 2, // gull chest flight speed × (WP9)
  weepingIsle: 2, // income ×
  spiceHarbour: 0.5, // gull price ×
};

/**
 * The Caldera erupts every `eruption` s of its region's mechanics, for `burst` s: a coin worth its share of `value`
 * falls every `drop` s within `spread` u of its shore, into its holder's waters (`tries` points, else into the crater), or
 * anywhere at sea round it while nobody holds it.
 */
export const CALDERA = { burst: 8, drop: 0.5, value: 90, spread: 24, tries: 8 };

/**
 * Finds (PROMPT.md, Doubloons), worth `value` × their region's richness. A wreck or an island cache is taken by holding
 * within `reach` u of it for `hold` s, and is back `refill` s (± `jitter` of that) later. Every `every` s a wreck there
 * to take sheds flotsam (`pieces` within `scatter` u), and a bottle comes afloat somewhere at sea (`tries` points); both
 * drift on the currents, are scooped by sailing through them like coins, and are gone after `life` s.
 */
export const FINDS = {
  wreck: { value: 40, reach: 4, hold: 4, refill: 180 },
  cache: { value: 75, reach: 9, hold: 6, refill: 300 },
  jitter: 0.25,
  flotsam: { value: 5, pieces: 4, scatter: 3, every: 15, life: 75 },
  bottle: { value: 35, every: 40, life: 240, tries: 16 },
};

// ---------------------------------------------------------------------------------------------------------------
// The opening and the end of the match (WP8)

const RIDE = 15;

/**
 * The opening on the Great Current. The fleet rides its centreline at `ride` u/s, three times a ship's way, so the
 * longest route (about 1600 u through five regions) is ridden in under two minutes and each region it passes is a
 * choice of some seconds. A ship breaking off keeps `way` u/s through the water (the riding speed less the current's),
 * comes about `peel` rad off the current's line, and makes its home where it has slowed, clear of the current: after
 * `settle` of its form's time constants of losing way (FORMS drag), when the ride's extra way is all but gone. A hull that cannot get clear
 * (steered back onto the current, or held against a shore) makes it after `most` s wherever it is.
 */
export const OPENING = { ride: RIDE, way: RIDE - GREAT_CURRENT.speed, peel: 0.6, settle: 3, most: 8 };

/**
 * A sinking pays its sinker `bounty` doubloons into the bank, twice over for sinking the pennant's holder: worth a
 * loop's purse, so a fight can pay as well as charting, and the leader is a prize. The storm ends every match (STORM).
 */
export const END = { bounty: 60 };

// ---------------------------------------------------------------------------------------------------------------
// Combat (WP8)

/**
 * A ship's batteries: its two broadsides, the carrack's heavy stern castle firing astern, and its stern fitting (the
 * stern chasers firing on their own, the powder kegs and the mortar: items.ts), each reloading in Ship.reload.
 */
export const BATTERY = { port: 0, starboard: 1, castle: 2, stern: 3 } as const;
export const BATTERIES = 4;

/** What a shot does besides holing the hull, for its `lasting` s: tear the sails (Ship.torn, TRIM.torn), or set the hull afire (FIRE). */
export const EFFECT = { none: 0, tear: 1, burn: 2 } as const;

/** By tier: nothing. */
const NIL: readonly number[] = [0, 0, 0, 0, 0];

/** A gun fitting's battery: how it bears, reloads, strikes and flies. */
export interface Gun {
  /** u: the farthest it is laid. */
  readonly range: number;
  /** rad: half the arc it bears on, either side of the beam (a broadside) or of the stern (stern guns). */
  readonly arc: number;
  /** s to reload after firing. */
  readonly reload: number;
  /** The hull a ball strikes for at the muzzle, by tier, and the share of it lost by full range. */
  readonly damage: readonly number[];
  readonly falloff: number;
  /** How far a ball falls from where it was laid, across and along the line of fire, as a share of the distance. */
  readonly spread: number;
  /** u/s the shot flies at, and the height of its arc at mid-flight as a share of the distance (drawn only). */
  readonly speed: number;
  readonly loft: number;
  /** u: a shell lobbed over everything bursts where it falls, striking hulls this close; 0 for shot fired flat, striking the first hull in its path. */
  readonly blast: number;
  /** An EFFECT on a hull it strikes, lasting `lasting` s by tier. */
  readonly effect: number;
  readonly lasting: readonly number[];
}

/**
 * By FITTING, the guns that fire on their own: the light guns, the starting guns, short-ranged and quick to reload;
 * the long guns, reaching far but slow to reload; the swivel guns, quick and short; chain shot, tearing sails
 * (EFFECT.tear); heated shot, setting fires (EFFECT.burn); the stern chasers, firing astern (BATTERY.stern).
 */
export const GUNS: Readonly<Partial<Record<number, Gun>>> = {
  [FITTING.lightGuns]: {
    range: 22, arc: 0.45, reload: 2.5, damage: [6, 6.6, 7.2, 7.8, 8.4], falloff: 0.4, spread: 0.05, speed: 30, loft: 0.06,
    blast: 0, effect: EFFECT.none, lasting: NIL,
  },
  [FITTING.longGuns]: {
    range: 40, arc: 0.35, reload: 5, damage: [7.5, 8.25, 9, 9.75, 10.5], falloff: 0.3, spread: 0.03, speed: 40, loft: 0.08,
    blast: 0, effect: EFFECT.none, lasting: NIL,
  },
  [FITTING.swivelGuns]: {
    range: 14, arc: 0.7, reload: 0.9, damage: [2.6, 2.9, 3.2, 3.5, 3.8], falloff: 0.5, spread: 0.07, speed: 28, loft: 0.04,
    blast: 0, effect: EFFECT.none, lasting: NIL,
  },
  [FITTING.chainShot]: {
    range: 18, arc: 0.45, reload: 3.5, damage: [3, 3.3, 3.6, 3.9, 4.2], falloff: 0.4, spread: 0.06, speed: 26, loft: 0.06,
    blast: 0, effect: EFFECT.tear, lasting: [3, 4, 5, 6, 7],
  },
  [FITTING.heatedShot]: {
    range: 18, arc: 0.45, reload: 4, damage: [3.5, 3.85, 4.2, 4.55, 4.9], falloff: 0.4, spread: 0.06, speed: 26, loft: 0.06,
    blast: 0, effect: EFFECT.burn, lasting: [2, 2.75, 3.5, 4.25, 5],
  },
  [FITTING.sternChasers]: {
    range: 24, arc: 0.4, reload: 2.5, damage: [5, 5.5, 6, 6.5, 7], falloff: 0.4, spread: 0.05, speed: 32, loft: 0.06,
    blast: 0, effect: EFFECT.none, lasting: NIL,
  },
};

/** The stern chasers: `guns` firing across the stern, bearing within their arc of it. */
export const CHASERS = { guns: 2 };

/**
 * The mortar (items.ts), fired by hand and bearing all round (no arc): its shell flies over islands and hulls alike
 * and bursts where it falls, striking every hull within its blast.
 */
export const MORTAR: Gun = {
  range: 45, arc: 0, reload: 8, damage: [10, 11.5, 13, 14.5, 16], falloff: 0, spread: 0, speed: 16, loft: 0.5,
  blast: 2.5, effect: EFFECT.none, lasting: NIL,
};

/**
 * Powder kegs (items.ts), dropped astern on their own, one each `reload` s, while a rival in sight follows within
 * `range` u and `arc` rad of the stern. A keg arms after `arm` s and explodes once a rival's hull comes within
 * `trigger` u, or where it floats when its `fuse` s burn out, striking every rival hull within `blast` u for `damage` by tier.
 */
export const KEGS = { reload: 4, range: 14, arc: 0.7, arm: 0.6, trigger: 0.6, fuse: 25, blast: 2.5, damage: [9, 10.5, 12, 13.5, 15] };

/** The carrack's heavy stern castle: `guns` of its broadside fitting firing astern, bearing within `arc` rad of the stern. */
export const CASTLE = { guns: 2, arc: 0.5 };

/**
 * Gunnery. A ball within `ball` u of a hull strikes it; one striking along the hull's length, raking it from bow or
 * stern, does up to 1 + `rake` times what one striking its beam does. Gunners of gunnery g (0 … 1, Ship.gunnery) lead
 * their target by g of its way over the shot's flight and lay their guns `wild` × (1 − g) wider. A battery's guns are
 * spread over `deck` of the hull's length (the castle's over its beam) and fire parallel.
 */
export const GUNNERY = { ball: 0.15, rake: 0.5, wild: 0.1, deck: 0.6, passes: 3 };

/**
 * Ramming: a hull striking another with its bow (Ship.bumpOn ≥ `bow`) at a closing speed over `speed` u/s holes it for
 * `damage` hull per u/s over that, × its bow's power (BOWS) and × 2m / (m + m′) by the forms' masses; the rammer takes
 * `recoil` of it, × its bow's recoil.
 */
export const RAM = { bow: 0.5, speed: 0.6, damage: 3.5, recoil: 0.2 };

/** A bow fitting's ramming power by tier, the share of the recoil it takes, and the seconds by tier a ship it rams lays no trail. */
export interface Bow {
  readonly power: readonly number[];
  readonly recoil: number;
  readonly cut: readonly number[];
}

/** The stem post, the starting ram: weak. A bow without a row in BOWS rams as the stem post. */
export const STEM_POST: Bow = { power: [1, 1.1, 1.2, 1.3, 1.4], recoil: 1, cut: NIL };

/**
 * By FITTING: the stem post; the iron ram, striking twice as hard and shrugging off half the recoil; the cutwater,
 * striking a little harder, which also cuts the rammed ship's open trail (combat.ts ram) so it lays none for `cut` s.
 */
export const BOWS: Readonly<Partial<Record<number, Bow>>> = {
  [FITTING.stemPost]: STEM_POST,
  [FITTING.ironRam]: { power: [2, 2.3, 2.6, 2.9, 3.2], recoil: 0.5, cut: NIL },
  [FITTING.cutwater]: { power: [1.2, 1.3, 1.4, 1.5, 1.6], recoil: 0.8, cut: [3, 4, 5, 6, 7] },
};

/** Reefs and rocks: a hull striking land faster than `speed` u/s loses `damage` hull per u/s over it. */
export const ROCKS = { speed: 1.5, damage: 4 };

/**
 * Fire burns `rate` hull a second while it lasts. In the Fire Archipelago's hot water embers set a hull alight
 * `embers` times a second on average, copper-sheathed or not, for `ember` s.
 */
export const FIRE = { rate: 1.5, embers: 1 / 25, ember: 5 };

/** Doubled planking by tier: the share of its form's hull points it adds. */
export const DOUBLED_PLANKING = [0.15, 0.22, 0.3, 0.38, 0.45];

/**
 * The storm (PROMPT.md, The storm), phase by phase: each `move`s at that second of the match and sweeps for `sweep` s
 * to a calm of radius `calm` u (arc), then holds until the next moves; inside it a ship loses `rate` hull a second.
 * The first is announced at `announce` s, each after it the moment the one before holds, so every phase is on the
 * chart 20–45 s before it moves. The calms close from seven-tenths of the planet to a final calm 30 u across, close
 * enough that the last ships must fight, held from 550 s; the last phase closes it to nothing by 600 s at a rate that
 * sinks the stoutest hull in under 20 s, so every match is over by about ten minutes and a quarter, and sooner when the
 * last ships fight. In the storm sails labour, losing `labour` of their speed without storm sails, and lookouts see
 * `sight` as far. The territory scan passes over every row of the territory grid once every `scan` ticks.
 */
export const STORM = {
  announce: 45,
  phases: [
    { move: 90, sweep: 60, calm: 400, rate: 0.2 },
    { move: 195, sweep: 60, calm: 260, rate: 0.4 },
    { move: 300, sweep: 45, calm: 160, rate: 0.7 },
    { move: 390, sweep: 40, calm: 90, rate: 1.2 },
    { move: 465, sweep: 30, calm: 44, rate: 2 },
    { move: 525, sweep: 25, calm: 15, rate: 4 },
    { move: 570, sweep: 30, calm: 0, rate: 12 },
  ],
  labour: 0.25,
  sight: 0.45,
  scan: 30,
};

/**
 * Sight (visibility.ts), u above the sea by FORM: the lookout's eye on deck, the masthead (seen first over the curve)
 * and the hull's top (hull-down below it); a crow's nest raises the eye, by tier. In clear air a lookout sees `clear`
 * u, less in fog, squalls and the storm; a flare reveals every ship within `flare` u.
 */
export const SIGHT = {
  eye: [0.9, 1, 1.2, 1.4],
  mast: [3, 3.6, 4.4, 5],
  hull: [0.4, 0.5, 0.7, 0.8],
  crowsNest: [1.5, 2, 2.5, 3, 3.5],
  clear: 70,
  flare: 90,
};

/**
 * Treasure brought home (PROMPT.md, The results): `share` of the bank (the rest pays the crew) times the finishing
 * place's multiplier, winner first. It falls steeply over the first places and gently after, so outlasting one more
 * ship is always worth something and winning pays four times the first to sink, while a rich bank still counts at
 * every place.
 */
export const TREASURE = { share: 0.5, place: [2, 1.6, 1.35, 1.15, 1, 0.9, 0.8, 0.7, 0.6, 0.5] };

/** The results' timeline keeps the player's `loops` largest loops among all its other moments, so it stays short. */
export const MOMENTS = { loops: 3 };

// ---------------------------------------------------------------------------------------------------------------
// The companion gull (WP9, gull.ts)

/**
 * The companion gull in a match (PROMPT.md, The companion gull); arrays by trait level, 0 untrained. `levels`: each
 * trait's top. A call costs `price` doubloons (territory.ts gullPrice: HOME.gull at home, PERK.spiceHarbour holding
 * Spice Harbour); its chest takes `flight` s by Wings (÷ PERK.sandbarLight holding the Sandbar Light), shared between
 * its `legs`: flying off `far` u along the bow, away over the horizon, back, once round its ship `circle` u out. It
 * flies `fly` u high, seen that far over the curve. Talons is the brightest pigment tier it carries: its level. Eye: it
 * scouts `ahead` u before the bow, `height` u aloft, marking loot within that height's horizon. Beak: the share of a
 * spilled purse it snatches back. Dive: its cooldown (s), its reach (u), how near a point aimed by hand a rival must be
 * (u), how long it holds over the rival marking it (s), and the share of the rival's speed the strike leaves. Danger,
 * when it wheels overhead: the hull under this share of full, a rival in sight this near (u), the storm this near (u).
 */
export const GULL = {
  levels: { talons: 4, wings: 4, eye: 4, beak: 3, dive: 3 },
  price: 60,
  flight: [12, 10, 8.5, 7, 6],
  legs: { out: 0.25, away: 0.3, back: 0.3, circle: 0.15 },
  far: 60,
  circle: 4,
  fly: 8,
  eye: { ahead: [0, 20, 30, 40, 50], height: [0, 6, 9, 12, 15] },
  beak: [0, 0.25, 0.4, 0.6],
  dive: { cool: [0, 30, 22, 15], reach: 40, near: 10, hold: 4, check: 0.5 },
  danger: { hull: 0.4, near: 30, storm: 15 },
};
