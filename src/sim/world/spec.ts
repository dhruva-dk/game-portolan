// What each region's module gives the world: its own height function and its sites, all in its local chart
// (x metres east and y metres north of the region's centre, on the tangent plane). index.ts places them on
// the sphere and blends neighbours. Bearings are degrees clockwise from north.

/** A current lane: flat x, y pairs from source to mouth. It should run on past the border into a neighbour. */
export interface LaneSpec {
  name: string;
  pts: readonly number[];
  /** Full width in metres; the flow tapers to nothing at the edges. */
  width: number;
  /** Speed at the lane's core, m/s. */
  speed: number;
}

/**
 * Something the heightfield can't express:
 * - arch: a span between two pillars (the pillars are terrain); ships pass under. r is half the span, along `bearing`.
 * - log: a hollow fallen trunk lying along `bearing`. Its walls are solid; ships sail through the bore (radius `inner`).
 * - trunk: a standing trunk or column of radius r, solid at the waterline.
 * - curtain: a falling sheet of water along `bearing`, length long; not solid, it hides what is behind it.
 */
export type ObstacleKind = 'arch' | 'log' | 'trunk' | 'curtain';

export interface ObstacleSpec {
  kind: ObstacleKind;
  x: number;
  y: number;
  bearing: number;
  r: number;
  /** Top, in metres above sea level. */
  height: number;
  /** Length along the bearing (logs, curtains). */
  length?: number;
  /** Bore radius of a log, or clearance under an arch. */
  inner?: number;
}

/** Areas of water with their own behaviour. Circles, in the chart. */
export type ZoneKind =
  | 'kelp' | 'hot' | 'mist' | 'canopy' | 'curtain' | 'slush' | 'lagoon' | 'petals' | 'sulphur' | 'spray';

export interface ZoneSpec {
  kind: ZoneKind;
  x: number;
  y: number;
  r: number;
}

/**
 * Skyline props: big plants and growths that shape a region's silhouette but that nothing collides with
 * (they stand on land). The renderer draws them as blocked-out shapes until the flora arrives.
 */
export type PropKind = 'cedar' | 'snag' | 'pine' | 'fir' | 'cherry' | 'palm' | 'flameTree' | 'mangrove' | 'treeFern';

export interface PropSpec {
  kind: PropKind;
  x: number;
  y: number;
  /** Trunk radius at the base. */
  r: number;
  /** Height of the top above sea level. */
  height: number;
}

/** A disc where the sea rises (by > 0) or is drawn down while the event runs: full inside r, fading out over `fade` metres. */
export interface LiftSpec {
  x: number;
  y: number;
  r: number;
  fade: number;
  by: number;
  /** Odd spots turn the sign: the other side rises. */
  flip?: boolean;
}

/** Rock overhead: a slab `length` long along its bearing and `width` wide, its underside `under` metres above mean sea. */
export interface RoofSpec {
  x: number;
  y: number;
  bearing: number;
  length: number;
  width: number;
  under: number;
}

/**
 * The region's own event (sim/regionEvents.ts says what each one does): where it can happen, flat x, y pairs, of which
 * each match picks one, and whatever geometry its effect needs.
 */
export interface EventSpec {
  spots: readonly number[];
  /** A bearing for each spot, degrees: which way what falls there lies. */
  bearings?: readonly number[];
  /** Reach of the danger, or of the prize, round the spot, metres. */
  r: number;
  lift?: readonly LiftSpec[];
  /**
   * What falls across the water at the spot: a bar `length` long along its bearing and `width` wide, or a disc `width`
   * across when length is 0. It lies there while the event runs, or for the rest of the match if it `stays`.
   */
  block?: { length: number; width: number; stays?: boolean };
  roofs?: readonly RoofSpec[];
}

export interface RegionSpec {
  /** Ground height in metres (negative is sea floor). Must be defined everywhere, well past the border. */
  height(x: number, y: number): number;
  /** The landmark: its centre, footprint radius and the height it is seen at (its top, or its light). */
  landmark: { x: number; y: number; r: number; height: number; bearing: number };
  /** The natural beacon: where its light sits and how high, and which way its face turns if it has one (chart degrees). */
  beacon: { x: number; y: number; height: number; bearing?: number };
  /** Loot spots, flat x, y pairs, all in water a ship can reach. */
  loot: readonly number[];
  lanes: readonly LaneSpec[];
  obstacles: readonly ObstacleSpec[];
  zones: readonly ZoneSpec[];
  /** Tidal sills (flat x, y pairs): passages between -2.5 and -0.5 m that open and close with the tide. */
  tidal: readonly number[];
  props: readonly PropSpec[];
  event: EventSpec;
}
