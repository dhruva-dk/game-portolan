// The rock skins: which scanned photograph each rock wears, how it is graded, how far up the sea wets it, and what
// grows on it. Every region's rock gets its own skin, so no two regions share a rock colour.
import type { RegionId } from '../../sim/world/index.ts';

/** The photographs in public/tex/rocks (credited in CREDITS.md). Each has <id>_d.jpg and <id>_n.jpg. */
export type TexId =
  | 'ice' | 'snow' | 'granite' | 'limestone' | 'sandstone' | 'basalt' | 'coral' | 'scoria' | 'pahoehoe'
  | 'wetblack' | 'moss' | 'slate' | 'seaside' | 'shore';

type RGB = readonly [number, number, number];

export interface Skin {
  tex: TexId;
  /** Metres covered by one repeat of the photograph. */
  tile: number;
  /** Height/width ratio of the photograph (1 for square ones). */
  aspect?: number;
  tint: RGB;
  /** Saturation, contrast (around a 25% grey) and brightness multipliers. */
  grade?: RGB;
  /** Roughness dry and wet. */
  rough: readonly [number, number];
  /** Metres above the sea that waves and spray keep wet. */
  spray: number;
  /** Wet everywhere, 0..1 (the Weeping Isle). */
  wetAll?: number;
  /** Normal map strength. */
  normal?: number;
  /** Growth at the tide line and below: colour, amount. */
  algae?: readonly [RGB, number];
  /** A layer on faces that look up: moss, snow or turf. */
  cover?: { tex: TexId; tile: number; tint: RGB; amount: number; up: number; soft: number };
  /** Strata of colour by height above the sea. */
  bands?: { period: number; strength: number; warp: number; seed: number; colours: readonly [RGB, RGB, RGB] };
  /** Emissive colour of hot cracks (HDR). */
  glow?: RGB;
  /** Ice: the colour deep in the ice, and how much light it seems to hold. */
  ice?: { deep: RGB; inner: number };
  /** Wet streaks running down cliff faces, 0..1. */
  streak?: number;
  /** Four tints, one picked per piece. */
  pieces?: readonly [RGB, RGB, RGB, RGB];
}

const KELP: RGB = [0.16, 0.2, 0.07];
const WEED: RGB = [0.12, 0.16, 0.09];

export const SKINS = {
  // the Ice Crown: blue-white ice under snow
  ice: {
    tex: 'ice', tile: 3.2, tint: [1, 1, 1], rough: [0.14, 0.05], spray: 0.5, normal: 0.8,
    ice: { deep: [0.2, 0.48, 0.72], inner: 0.08 },
    cover: { tex: 'snow', tile: 3, tint: [1.0, 1.02, 1.06], amount: 1, up: 0.55, soft: 0.18 },
  },
  // sea ice riding low, wet nearly all over: paler in the body than a berg's glacier ice, and a rougher wet sheen,
  // since with nothing for it to mirror a dark glassy top reads black against the sea once the sun is low
  floe: {
    tex: 'ice', tile: 3.2, tint: [1, 1, 1], rough: [0.2, 0.3], spray: 0.5, normal: 0.8,
    ice: { deep: [0.4, 0.66, 0.86], inner: 0.12 },
    cover: { tex: 'snow', tile: 3, tint: [1.0, 1.02, 1.06], amount: 1, up: 0.55, soft: 0.18 },
  },
  // dark rock poking through snow, for the Ice Crown's generic boulders
  snowrock: {
    tex: 'granite', tile: 3, tint: [0.55, 0.58, 0.64], grade: [0.5, 1.2, 1], rough: [0.75, 0.2], spray: 0.8,
    cover: { tex: 'snow', tile: 3, tint: [1.0, 1.02, 1.06], amount: 1, up: 0.35, soft: 0.2 },
  },
  // the Fjords: grey granite, glacier-polished, with yellow lichen
  granite: {
    tex: 'granite', tile: 3.5, tint: [0.98, 0.98, 1.0], grade: [0.8, 1.05, 1], rough: [0.62, 0.18], spray: 1.4,
    algae: [WEED, 0.6],
    cover: { tex: 'moss', tile: 2.2, tint: [1.05, 0.95, 0.55], amount: 0.55, up: 0.72, soft: 0.12 },
  },
  // the tropics: pale warm granite, sun-bleached and clean above the tide, dark only where the sea wets it
  tropicGranite: {
    tex: 'granite', tile: 4, tint: [1.12, 1.06, 1.0], grade: [0.85, 1.15, 1], rough: [0.7, 0.18], spray: 0.9,
    algae: [[0.16, 0.15, 0.1], 0.35],
  },
  // the Spires: pale limestone with dark weathering
  limestone: {
    tex: 'limestone', tile: 5, tint: [1.02, 1.0, 0.95], grade: [0.9, 1.1, 1.05], rough: [0.8, 0.25], spray: 1.6,
    algae: [[0.18, 0.2, 0.12], 0.7],
    cover: { tex: 'moss', tile: 2, tint: [0.65, 0.8, 0.5], amount: 0.35, up: 0.82, soft: 0.1 },
  },
  // the Narrows: ochre and rust banded sandstone
  sandstone: {
    tex: 'sandstone', tile: 4, tint: [1.05, 0.92, 0.8], grade: [1.1, 1.05, 1.05], rough: [0.88, 0.3], spray: 1.0,
    algae: [[0.2, 0.17, 0.1], 0.5],
    bands: { period: 1.7, strength: 0.75, warp: 0.6, seed: 3.1, colours: [[1.18, 0.98, 0.78], [1.0, 0.66, 0.45], [0.82, 0.48, 0.32]] },
  },
  // the Basalt Stacks: black columns under vivid green turf
  basalt: {
    tex: 'basalt', tile: 2.6, tint: [0.92, 0.93, 0.96], grade: [0.6, 1.1, 1.1], rough: [0.72, 0.16], spray: 2.2,
    algae: [[0.1, 0.16, 0.09], 0.8],
    cover: { tex: 'moss', tile: 1.8, tint: [0.75, 1.1, 0.42], amount: 0.9, up: 0.86, soft: 0.06 },
  },
  // the Coral Atolls: bleached coral, cream, pink and salmon
  coral: {
    tex: 'coral', tile: 1.2, tint: [1.25, 1.18, 1.08], grade: [0.6, 0.95, 1.15], rough: [0.9, 0.35], spray: 0.6,
    algae: [[0.32, 0.3, 0.2], 0.4],
    pieces: [[1.15, 1.12, 1.05], [1.15, 0.95, 0.9], [1.18, 0.85, 0.72], [1.08, 1.04, 0.92]],
  },
  // the Fire Archipelago: fresh clinker, black with glowing cracks
  scoria: {
    tex: 'scoria', tile: 2.2, tint: [0.36, 0.33, 0.33], grade: [0.5, 1.25, 1], rough: [0.92, 0.3], spray: 0.9, normal: 1.3,
    glow: [6.0, 1.5, 0.25],
  },
  // the Fire Archipelago: old ropy pahoehoe, black with a silver sheen
  pahoehoe: {
    tex: 'pahoehoe', tile: 3, aspect: 0.5, tint: [0.42, 0.41, 0.43], grade: [0.4, 1.2, 1], rough: [0.42, 0.12], spray: 0.9,
    glow: [5.0, 1.1, 0.2],
  },
  // the Weeping Isle: black rock streaming with water, emerald moss
  weeping: {
    tex: 'wetblack', tile: 4, tint: [0.8, 0.85, 0.82], grade: [0.8, 1.1, 1], rough: [0.5, 0.1], spray: 2.5, wetAll: 0.55, streak: 0.85,
    algae: [[0.08, 0.16, 0.08], 0.8],
    cover: { tex: 'moss', tile: 2, tint: [0.7, 1.15, 0.5], amount: 1, up: 0.25, soft: 0.25 },
  },
  // the Maelstrom: storm-cut slate, dark blue-grey, always wet from the spray
  slate: {
    tex: 'slate', tile: 3, tint: [0.72, 0.8, 0.92], grade: [0.7, 1.15, 0.95], rough: [0.55, 0.12], spray: 4, wetAll: 0.2,
    algae: [[0.08, 0.12, 0.1], 0.6],
  },
  // generic sea boulders and tide-pool rock
  seaside: {
    tex: 'seaside', tile: 2.5, tint: [1, 1, 1], rough: [0.75, 0.18], spray: 1.2, algae: [WEED, 0.8],
    cover: { tex: 'moss', tile: 2, tint: [0.85, 0.9, 0.6], amount: 0.25, up: 0.8, soft: 0.1 },
  },
  shore: {
    tex: 'shore', tile: 3, tint: [0.95, 0.95, 0.93], grade: [0.9, 1.1, 1], rough: [0.78, 0.15], spray: 1.0, algae: [[0.2, 0.22, 0.1], 1],
  },
  // reskins of the generic forms, one per region without its own rock
  mossy: {
    tex: 'seaside', tile: 2.5, tint: [0.75, 0.82, 0.78], rough: [0.7, 0.14], spray: 1.0, algae: [WEED, 0.8], wetAll: 0.2,
    cover: { tex: 'moss', tile: 1.8, tint: [0.6, 0.85, 0.5], amount: 1, up: 0.2, soft: 0.25 },
  },
  kelp: {
    tex: 'shore', tile: 3, tint: [0.95, 0.9, 0.78], rough: [0.75, 0.15], spray: 1.3, algae: [KELP, 1],
    cover: { tex: 'moss', tile: 2, tint: [1.0, 0.95, 0.55], amount: 0.35, up: 0.8, soft: 0.1 },
  },
  river: {
    tex: 'granite', tile: 2.5, tint: [1.08, 1.02, 0.98], grade: [0.7, 0.95, 1.1], rough: [0.55, 0.12], spray: 0.6, algae: [[0.25, 0.28, 0.15], 0.5],
    cover: { tex: 'moss', tile: 1.8, tint: [0.75, 1.0, 0.5], amount: 0.4, up: 0.75, soft: 0.12 },
  },
  glass: {
    tex: 'limestone', tile: 3, tint: [1.12, 1.1, 1.06], grade: [0.5, 0.9, 1.15], rough: [0.7, 0.2], spray: 0.6, algae: [[0.4, 0.42, 0.3], 0.3],
  },
  beachrock: {
    tex: 'sandstone', tile: 2.5, tint: [1.15, 1.02, 0.82], grade: [0.8, 0.95, 1.1], rough: [0.85, 0.3], spray: 0.6, algae: [[0.3, 0.32, 0.18], 0.5],
  },
  spice: {
    tex: 'basalt', tile: 2.6, tint: [1.0, 0.85, 0.78], grade: [0.9, 1.1, 1], rough: [0.7, 0.15], spray: 1.2, algae: [WEED, 0.6],
    bands: { period: 0.9, strength: 0.4, warp: 1.2, seed: 7.7, colours: [[1.3, 0.75, 0.55], [1, 1, 1], [1.1, 0.85, 0.7]] },
    cover: { tex: 'moss', tile: 1.8, tint: [0.5, 0.8, 0.35], amount: 0.6, up: 0.6, soft: 0.15 },
  },
  mud: {
    tex: 'shore', tile: 2.5, tint: [0.7, 0.6, 0.48], grade: [0.9, 1, 0.9], rough: [0.6, 0.1], spray: 1.2, wetAll: 0.35, algae: [[0.2, 0.18, 0.1], 0.9],
    cover: { tex: 'moss', tile: 2, tint: [0.75, 0.8, 0.45], amount: 0.5, up: 0.6, soft: 0.15 },
  },
} satisfies Record<string, Skin>;

export type SkinId = keyof typeof SKINS;

/** The skin each region's generic boulders and tide-pool rocks wear, so even the shared forms look local. */
export const REGION_SKIN: Record<RegionId, SkinId> = {
  iceCrown: 'snowrock',
  fjords: 'granite',
  mistwood: 'mossy',
  spires: 'limestone',
  narrows: 'sandstone',
  basaltStacks: 'basalt',
  kelpShallows: 'kelp',
  blossomRun: 'river',
  glassSea: 'glass',
  jadeShoals: 'beachrock',
  coralAtolls: 'coral',
  spiceIsles: 'spice',
  fireArchipelago: 'scoria',
  weepingIsle: 'weeping',
  mangroveLabyrinth: 'mud',
  maelstrom: 'slate',
};
