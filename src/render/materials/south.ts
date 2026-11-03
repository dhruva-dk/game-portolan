// The ground materials of the southern ring and the Maelstrom: four or five scans of each region's own,
// painted into the six roles every region fills. Scans come from Poly Haven and ambientCG (credits in
// CREDITS.md); the files live in public/tex/regions/<region>/.
//
// Scales are metres per texture repeat. Tints are linear multipliers that pull each scan toward its
// region's own colours; wet darkens and smooths a layer.
import type { RegionId } from '../../sim/world/index.ts';
import { scanMaps, type MaterialLayer, type MaterialRole, type MaterialSet, type SouthRegionId } from './types.ts';

const PH = (id: string) => `https://polyhaven.com/a/${id}`;
const ACG = (id: string) => `https://ambientcg.com/a/${id}`;

type Rgb = readonly [number, number, number];

/** One scan as a region uses it; calling the result paints it into a role. */
function scan(region: RegionId, name: string, source: string) {
  const maps = scanMaps(region, name, true);
  return (role: MaterialRole, scale: number, tint: Rgb, wet = 0, normalScale?: number): MaterialLayer => {
    const layer: MaterialLayer = { role, scan: name, source, maps, scale, tint, wet };
    if (normalScale !== undefined) layer.normalScale = normalScale;
    return layer;
  };
}

function set(region: RegionId, layers: MaterialLayer[]): MaterialSet {
  const byRole = Object.fromEntries(layers.map((l) => [l.role, l])) as Record<MaterialRole, MaterialLayer>;
  return { region, layers: byRole };
}

// The Glass Sea: sky-coloured, the emptiest skyline. White sand above and below the mirror, a rippled
// white floor through the clear water, sea-grape litter on the isles and pale glassy rock at their cores.
const gs = (n: string, s: string) => scan('glassSea', n, s);
const gsSand = gs('whiteSand', ACG('Ground060'));
const gsFloor = gs('rippleFloor', PH('aerial_beach_01'));
const gsWet = gs('wetSand', ACG('Ground059'));
const gsLitter = gs('leafSand', ACG('Ground035'));
const gsRock = gs('glassRock', ACG('Rock018'));

// The Jade Shoals: amber sand and jade water, the brightest and flattest region. Rippled dunes on top,
// fine ripples on the bars under the water, tide-striped wet sand and golden dune grass on the slopes.
const js = (n: string, s: string) => scan('jadeShoals', n, s);
const jsSand = js('amberSand', ACG('Ground089'));
const jsDune = js('duneRipples', ACG('Ground098'));
const jsFlats = js('flatRipples', ACG('Ground093B'));
const jsTidal = js('tidalSand', PH('damp_beach_sand_02'));
const jsGrass = js('duneGrass', PH('withered_grass'));

// The Coral Atolls: coral pink and orange on white sand. Shell-grit sand spits, coral rubble banks,
// porous reef flats under the turquoise lagoon, wet coral sediment at the edge and palm litter inland.
const ca = (n: string, s: string) => scan('coralAtolls', n, s);
const caSand = ca('shellSand', ACG('Ground056'));
const caRubble = ca('coralRubble', PH('coral_gravel'));
const caReef = ca('reefFlat', PH('coral_ground_02'));
const caWet = ca('wetCoral', PH('coral_mud_01'));
const caLitter = ca('palmLitter', ACG('Ground053'));

// The Spice Isles: deep jungle green on red earth, with black rock points. Red earth runs to the water,
// laterite on the hillsides, a leafy jungle floor on top and red mud under the warm emerald shallows.
const si = (n: string, s: string) => scan('spiceIsles', n, s);
const siEarth = si('redEarth', PH('red_mud_stones'));
const siLaterite = si('laterite', PH('red_laterite_soil_stones'));
const siJungle = si('jungleFloor', PH('brown_mud_leaves_01'));
const siRock = si('blackRock', ACG('Rock033'));
const siMud = si('redMud', PH('red_dirt_mud_01'));

// The Fire Archipelago: the only black and red region. Black cinder sand, ash on the high ground,
// fresh glassy lava on the faces and older weathered flows on the slopes. The glowing flow itself is
// FIRE_LAVA_FLOW below, painted where the region's terrain code runs lava to the sea.
const fa = (n: string, s: string) => scan('fireArchipelago', n, s);
const faSand = fa('blackSand', ACG('Gravel024'));
const faAsh = fa('ash', PH('moon_dusted_02'));
const faFresh = fa('freshLava', ACG('Rock035'));
const faOld = fa('oldLava', ACG('Rock031'));

// The Weeping Isle: emerald moss, white water, soft grey light, everything wet. Dark rock streaked
// with moss on the weeping cliffs, moss over boulders on the slopes, cloud-forest moss on top,
// wet pebbles in the pools at the cliff feet and wet black rock at the sea.
const wi = (n: string, s: string) => scan('weepingIsle', n, s);
const wiCliff = wi('mossCliff', ACG('Rock012'));
const wiSlope = wi('mossSlope', PH('aerial_rocks_04'));
const wiMoss = wi('cloudMoss', ACG('Moss003'));
const wiPebbles = wi('poolPebbles', PH('low_tide_rocks'));
const wiRock = wi('wetBlackRock', PH('seaside_rock'));

// The Mangrove Labyrinth: olive and brown, no real shore. Mud flats, rippled mud where the tide works,
// dark silt under the tea-brown water, root-laced banks and a floor of roots and leaf litter.
const ml = (n: string, s: string) => scan('mangroveLabyrinth', n, s);
const mlFlat = ml('mudFlat', PH('brown_mud_03'));
const mlRipple = ml('rippleMud', ACG('Ground100'));
const mlSilt = ml('silt', ACG('Ground051'));
const mlBank = ml('rootBank', PH('brown_mud_02'));
const mlFloor = ml('rootFloor', ACG('Ground076'));

// The Maelstrom: dark navy, slate and white foam under a heavy sky. Storm-cut slate faces, broken
// boulder shelves, sharp slate shingle, storm-flattened grass on the tops and black wet slate at the sea.
const mx = (n: string, s: string) => scan('maelstrom', n, s);
const mxSlate = mx('slate', ACG('Rock058'));
const mxShelf = mx('boulderShelf', PH('gray_rocks'));
const mxShingle = mx('shingle', ACG('Rocks006'));
const mxGrass = mx('stormGrass', PH('aerial_grass_rock'));
const mxWet = mx('wetSlate', ACG('Rock062'));

export const REGION_MATERIALS: Record<SouthRegionId, MaterialSet> = {
  glassSea: set('glassSea', [
    gsSand('beach', 3, [2.0, 2.05, 2.45], 0.05),
    gsFloor('seabed', 14, [2.85, 3.0, 3.0], 0.5, 1.3),
    gsRock('cliff', 8, [1.32, 1.36, 1.44], 0, 0.8),
    gsSand('slope', 3, [1.8, 1.82, 2.12]),
    gsLitter('top', 3.5, [1.03, 1.24, 1.51]),
    gsWet('wetShore', 2.5, [2.0, 2.0, 2.55], 0.7),
  ]),
  jadeShoals: set('jadeShoals', [
    jsSand('beach', 3, [1.3, 1.19, 0.87], 0.05),
    jsFlats('seabed', 4, [1.13, 0.91, 0.56], 0.5, 1.2),
    jsSand('cliff', 4, [1.08, 0.9, 0.62]),
    jsGrass('slope', 3, [1.04, 1.25, 0.62]),
    jsDune('top', 6, [1.42, 1.32, 0.78], 0, 1.2),
    jsTidal('wetShore', 3, [3.0, 3.0, 1.93], 0.5),
  ]),
  coralAtolls: set('coralAtolls', [
    caSand('beach', 2.5, [2.83, 2.76, 3.0], 0.05),
    caReef('seabed', 4, [2.11, 1.85, 2.51], 0.5),
    caReef('cliff', 5, [1.85, 1.66, 2.25]),
    caRubble('slope', 2.5, [2.63, 2.7, 3.0]),
    caLitter('top', 3, [2.79, 3.0, 2.85]),
    caWet('wetShore', 2.5, [1.67, 1.64, 1.98], 0.6),
  ]),
  spiceIsles: set('spiceIsles', [
    siEarth('beach', 3, [1.63, 0.84, 0.73]),
    siMud('seabed', 3, [0.64, 0.45, 0.48], 0.6),
    siRock('cliff', 7, [0.78, 0.8, 0.91]),
    siLaterite('slope', 3, [2.51, 1.18, 0.68]),
    siJungle('top', 3, [0.51, 1.0, 0.59]),
    siMud('wetShore', 3, [0.9, 0.44, 0.4], 0.6),
  ]),
  fireArchipelago: set('fireArchipelago', [
    faSand('beach', 1.5, [0.33, 0.33, 0.36]),
    faSand('seabed', 1.5, [0.25, 0.25, 0.28], 0.6),
    faFresh('cliff', 7, [1.81, 0.9, 0.77], 0, 1.2),
    faOld('slope', 6, [1.24, 1.03, 1.07]),
    faAsh('top', 4, [1.11, 1.19, 1.36]),
    faSand('wetShore', 1.5, [0.33, 0.33, 0.36], 0.7),
  ]),
  weepingIsle: set('weepingIsle', [
    wiPebbles('beach', 2.5, [0.69, 0.81, 1.04], 0.4),
    wiPebbles('seabed', 2.5, [0.52, 0.61, 0.82], 0.6),
    wiCliff('cliff', 7, [1.6, 2.2, 1.4]),
    wiSlope('slope', 10, [0.57, 1.6, 0.85], 0.2),
    wiMoss('top', 2.5, [0.99, 1.48, 1.61], 0.15),
    wiRock('wetShore', 4, [0.56, 0.59, 0.7], 0.75),
  ]),
  mangroveLabyrinth: set('mangroveLabyrinth', [
    mlFlat('beach', 3, [1.15, 1.15, 0.72], 0.35),
    mlSilt('seabed', 3, [0.55, 0.57, 0.57], 0.6),
    mlBank('cliff', 3.5, [0.76, 0.68, 0.57], 0.3),
    mlBank('slope', 3.5, [0.98, 0.88, 0.72], 0.2),
    mlFloor('top', 3, [0.44, 0.66, 0.64]),
    mlRipple('wetShore', 3, [0.79, 0.8, 0.75], 0.6),
  ]),
  maelstrom: set('maelstrom', [
    mxShingle('beach', 2, [0.88, 1.02, 1.15], 0.1),
    mxShingle('seabed', 2, [0.59, 0.69, 0.81], 0.6),
    mxSlate('cliff', 8, [0.85, 0.88, 0.93], 0.1, 1.2),
    mxShelf('slope', 4, [0.72, 0.89, 1.19]),
    mxGrass('top', 10, [0.63, 1.07, 2.32]),
    mxWet('wetShore', 4, [0.53, 0.65, 1.03], 0.75),
  ]),
};

/** A layer that glows: the emissive map is linear-ish sRGB, scaled by `glow` (linear RGB, HDR). */
export interface GlowLayer extends MaterialLayer {
  emissive: string;
  glow: Rgb;
}

/**
 * The Fire Archipelago's molten flows: dark crust over glowing cracks. Not one of the six roles; the
 * region's terrain code paints it along its lava channels down to the sea, over the slope and beach.
 */
export const FIRE_LAVA_FLOW: GlowLayer = {
  ...fa('lavaFlow', ACG('Lava003'))('slope', 6, [1, 1, 1], 0, 1),
  emissive: 'tex/regions/fireArchipelago/lavaFlow_emissive.jpg',
  glow: [6, 2.4, 0.9],
};
