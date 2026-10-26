import { PI } from './math.ts';
import { R } from './sphere.ts';

export const REFERENCE = (2 * PI * R) / 360;

export const FORM = { pinnace: 0, caravel: 1, carrack: 2, galleon: 3 } as const;
export type FormName = keyof typeof FORM;

export interface Form {
  readonly name: FormName;
  readonly speed: number;
  readonly radius: number;
  readonly accel: number;
  readonly drag: number;
  readonly helm: number;
  readonly hull: number;
  readonly guns: number;
  readonly castle: boolean;
  readonly purse: number;
  readonly mass: number;
  readonly half: number;
  readonly beam: number;
  readonly close: number;
  readonly reach: number;
}

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

export const POINT = 0.15;

export const SAILS: readonly { readonly speed: number; readonly radius: number }[] = [
  { speed: 0.72, radius: 0.7 },
  { speed: 1, radius: 1 },
  { speed: 1.22, radius: 1.4 },
];

export const HELM = {
  soft: 0.35,
  steerage: 0.3,
  carve: 0.12,
};

export const LAND = { keep: 0.12, crawl: 0.35 };
export const BUMP = { restitution: 0.3, shove: 0.6 };

export const PILOT = {
  full: 0.45,
  lead: 0.35,
  arrive: 3.5,
  look: 7.5,
  window: 48,
  crab: 0.6,
  stem: 0.25,
  headway: 0.15,
  replan: 90,
  offing: 3,
};

export const TRIM = {
  home: 0.1,
  rival: 0.1,
  rootGate: 2,
  whaleRoad: 0.2,
  torn: 0.3,
  gust: 0.14,
  gale: { from: 1.7, to: 2.4, loss: 0.3 },
  calm: 0.4,
};

export const WIND = {
  speed: 6,
  terms: 12,
  freq: [3, 6],
  drift: [0.0005, 0.0012],
  lull: 0.35,
};

export const GUSTS = {
  count: 96,
  radius: [10, 22],
  life: [6, 14],
  drift: 0.7,
  strength: 0.6,
};

export const GREAT_CURRENT = { width: 18, speed: 5.5, taper: 30 };
export const LANE_TAPER = 12;

export const SPELL = { fair: 0, fog: 1, squall: 2, calm: 3 } as const;

export const WEATHER = {
  count: 48,
  spells: [
    { r: [0, 0], life: [20, 50] },
    { r: [26, 48], life: [60, 120] },
    { r: [22, 40], life: [50, 90] },
    { r: [34, 60], life: [70, 140] },
  ],
  rise: 15,
  core: 2.5,
  drift: 0.15,
  stride: 30,
  open: 40,
  openSquall: 3.5,
  veil: 0.5,
  fog: { sight: 0.3 },
  squall: { wind: 0.5, sight: 0.55, rough: 1.8 },
  calm: { drop: 0.75 },
};

export const DAY = {
  rate: 3.5 / 600,
  starts: [[4.75, 5.75], [14.25, 15.25], [18, 18.75]],
  sunrise: 6,
  tilt: PI / 6,
};

export const VORTEX = { fall: 0.4, grip: 1.2, carry: 4, keep: 0.5, still: 0.02 };

export const SLOT = { bow: 0, broadside: 1, stern: 2, rig: 3, hull: 4, lookout: 5 } as const;
export const SLOTS = 6;
export const TIERS = 5;
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

export const FITTING_SLOT: readonly number[] = [-1, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5];

export const OUTFIT: readonly { readonly at: number; readonly kind: number }[] = [
  { at: 1, kind: FITTING.stemPost }, { at: 1, kind: FITTING.lightGuns }, { at: 4, kind: FITTING.sternChasers },
  { at: 3, kind: FITTING.spareCanvas }, { at: 2, kind: FITTING.doubledPlanking }, { at: 5, kind: FITTING.crowsNest },
];

export const KITS: number[][] = [
  [FITTING.ironRam, FITTING.lightGuns, FITTING.sternChasers, FITTING.spareCanvas, FITTING.doubledPlanking, FITTING.crowsNest],
  [FITTING.stemPost, FITTING.chainShot, FITTING.sternChasers, FITTING.spareCanvas, FITTING.doubledPlanking, FITTING.crowsNest],
  [FITTING.cutwater, FITTING.lightGuns, FITTING.sternChasers, FITTING.spareCanvas, FITTING.copperSheathing, FITTING.crowsNest],
  [FITTING.stemPost, FITTING.lightGuns, FITTING.sternChasers, FITTING.spareCanvas, FITTING.doubledPlanking, FITTING.crowsNest],
  [FITTING.stemPost, FITTING.chainShot, FITTING.sternChasers, FITTING.spareCanvas, FITTING.doubledPlanking, FITTING.crowsNest],
  [FITTING.stemPost, FITTING.chainShot, FITTING.sternChasers, FITTING.spareCanvas, FITTING.copperSheathing, FITTING.crowsNest],
];

export const START_FITTINGS: readonly number[] = OUTFIT.map((o) => (o.at <= 1 ? o.kind : FITTING.none));

export const SPARE_CANVAS = [0.04, 0.06, 0.08, 0.1, 0.12];
export const COPPER = [0.03, 0.045, 0.06, 0.075, 0.09];
export const LATEEN_MIZZEN = [0.08, 0.12, 0.16, 0.2, 0.24];
export const STORM_SAILS = [0, 0.03, 0.06, 0.09, 0.12];
export const PUMPS = [0.15, 0.25, 0.35, 0.45, 0.55];
export const STERN_GLASS = [25, 30, 35, 40, 45];
export const LOOKOUT = [40, 50, 60, 70, 80];

export const CONSUMABLE = { patchKit: 21, ward: 22, gust: 23, fogFlask: 24, flare: 25 } as const;
export const CONSUMABLE_SLOTS = 3;

export const CONSUMABLES = { time: [3, 4, 4, 20, 6], patch: 0.35, gust: 0.4 };

export const LOOT = {
  enters: [1, 2, 3, 5, 7], weight: [1, 0.5, 0.25, 0.12, 0.06], climb: 0.5,
  consumable: [0.45, 0.4, 0.35, 0.3, 0.25], count: [1, 1, 2, 2, 3], reach: 0.8, astern: 1.5, worth: 0.5,
};

export const HOME = {
  radius: 10,
  repair: 0.5,
  gull: 0.75,
};

export const ECONOMY = {
  trail: 0.6,
  income: 1 / 60000,
};

export const COINS = {
  count: 96,
  each: 15,
  most: 8,
  scatter: 2.5,
  reach: 1.5,
  life: 90,
};

export const HARBOUR = {
  repair: 4,
};

export const PERK = {
  crownLight: { reach: 70, half: 0.15, period: 12 },
  greatFalls: 2,
  arch: 4 / 3,
  sandbarLight: 2,
  weepingIsle: 2,
  spiceHarbour: 0.5,
};

export const CALDERA = { burst: 8, drop: 0.5, value: 90, spread: 24, tries: 8 };

export const FINDS = {
  wreck: { value: 40, reach: 4, hold: 4, refill: 180 },
  cache: { value: 75, reach: 9, hold: 6, refill: 300 },
  jitter: 0.25,
  flotsam: { value: 5, pieces: 4, scatter: 3, every: 15, life: 75 },
  bottle: { value: 35, every: 40, life: 240, tries: 16 },
};

const RIDE = 15;

export const OPENING = { ride: RIDE, way: RIDE - GREAT_CURRENT.speed, peel: 0.6, settle: 3, most: 8 };

export const END = { bounty: 60 };

export const BATTERY = { port: 0, starboard: 1, castle: 2, stern: 3 } as const;
export const BATTERIES = 4;

export const EFFECT = { none: 0, tear: 1, burn: 2 } as const;

const NIL: readonly number[] = [0, 0, 0, 0, 0];

export interface Gun {
  readonly range: number;
  readonly arc: number;
  readonly reload: number;
  readonly damage: readonly number[];
  readonly falloff: number;
  readonly spread: number;
  readonly speed: number;
  readonly loft: number;
  readonly blast: number;
  readonly effect: number;
  readonly lasting: readonly number[];
}

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

export const CHASERS = { guns: 2 };

export const MORTAR: Gun = {
  range: 45, arc: 0, reload: 8, damage: [10, 11.5, 13, 14.5, 16], falloff: 0, spread: 0, speed: 16, loft: 0.5,
  blast: 2.5, effect: EFFECT.none, lasting: NIL,
};

export const KEGS = { reload: 4, range: 14, arc: 0.7, arm: 0.6, trigger: 0.6, fuse: 25, blast: 2.5, damage: [9, 10.5, 12, 13.5, 15] };

export const CASTLE = { guns: 2, arc: 0.5 };
export const AFT = { reload: 3 };

export const GUNNERY = { ball: 0.15, rake: 0.5, wild: 0.1, deck: 0.6, passes: 3 };

export const RAM = { bow: 0.5, speed: 0.6, damage: 3.5, recoil: 0.2 };

export interface Bow {
  readonly power: readonly number[];
  readonly recoil: number;
  readonly cut: readonly number[];
}

export const STEM_POST: Bow = { power: [1, 1.1, 1.2, 1.3, 1.4], recoil: 1, cut: NIL };

export const BOWS: Readonly<Partial<Record<number, Bow>>> = {
  [FITTING.stemPost]: STEM_POST,
  [FITTING.ironRam]: { power: [2, 2.3, 2.6, 2.9, 3.2], recoil: 0.5, cut: NIL },
  [FITTING.cutwater]: { power: [1.2, 1.3, 1.4, 1.5, 1.6], recoil: 0.8, cut: [3, 4, 5, 6, 7] },
};

export const ROCKS = { speed: 1.5, damage: 4 };

export const FIRE = { rate: 1.5, embers: 1 / 25, ember: 5 };

export const DOUBLED_PLANKING = [0.15, 0.22, 0.3, 0.38, 0.45];

export const STORM = {
  announce: 115,
  phases: [
    { move: 160, sweep: 60, calm: 400, rate: 0.1 },
    { move: 265, sweep: 60, calm: 260, rate: 0.2 },
    { move: 370, sweep: 45, calm: 160, rate: 0.3 },
    { move: 460, sweep: 40, calm: 90, rate: 0.4 },
    { move: 535, sweep: 30, calm: 44, rate: 0.6 },
    { move: 590, sweep: 20, calm: 15, rate: 3 },
    { move: 630, sweep: 18, calm: 0, rate: 24 },
  ],
  labour: 0.25,
  sight: 0.45,
  scan: 30,
};

export const SIGHT = {
  eye: [0.9, 1, 1.2, 1.4],
  mast: [3, 3.6, 4.4, 5],
  hull: [0.4, 0.5, 0.7, 0.8],
  crowsNest: [1.5, 2, 2.5, 3, 3.5],
  clear: 70,
  flare: 90,
};

export const TREASURE = { share: 0.5, place: [2, 1.6, 1.35, 1.15, 1, 0.9, 0.8, 0.7, 0.6, 0.5] };

export const MOMENTS = { loops: 3 };

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
