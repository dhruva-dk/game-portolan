// The ground materials of the Ice Crown and the northern ring: four or five scans of each region's own,
// painted into the six roles every region fills. Scans come from Poly Haven and ambientCG (credits in
// credits/materials-north.md); the files live in public/tex/regions/<region>/.
//
// Scales are metres per texture repeat. Tints are linear multipliers that pull each scan toward its
// region's portrait colours (PLAN.md, "The 16 regions"); wet darkens and smooths a layer.
import type { RegionId } from '../../sim/world/index.ts';
import { scanMaps, type MaterialLayer, type MaterialRole, type MaterialSet, type NorthRegionId } from './types.ts';

const PH = (id: string) => `https://polyhaven.com/a/${id}`;
const ACG = (id: string) => `https://ambientcg.com/a/${id}`;

type Rgb = readonly [number, number, number];

/** One scan as a region uses it; `layer` paints it into a role. */
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

// The Ice Crown: white, pale blue and steel. Snow over blue ice, frost-white lichen on the outer rocks,
// glassy refrozen leads at the waterline, dark shingle under the slush.
const ice = (n: string, s: string) => scan('iceCrown', n, s);
const iceSnow = ice('snow', ACG('Snow005'));
const iceLichen = ice('frostlichen', ACG('Rock046S'));
const iceBlue = ice('blueice', ACG('Ice003'));
const iceRime = ice('rime', ACG('Snow013'));
const iceShingle = ice('shingle', ACG('Gravel035'));

// The Fjords: granite grey, dark pine green, heather purple. Wet granite slabs, scree, heather slopes,
// pine needles under the forest, pale glacial silt under the milky water.
const fj = (n: string, s: string) => scan('fjords', n, s);
const fjGranite = fj('granite', ACG('Rock050'));
const fjScree = fj('scree', ACG('Gravel040'));
const fjHeather = fj('heather', PH('sparse_grass'));
const fjNeedles = fj('needles', PH('forrest_ground_03'));
const fjSilt = fj('silt', ACG('Ground021'));

// Mistwood: deep blue-green, the darkest ground in the north. Moss over everything, leaf litter,
// rooty banks and black forest mud at the still water.
const mw = (n: string, s: string) => scan('mistwood', n, s);
const mwMoss = mw('mossfloor', ACG('Ground037'));
const mwLitter = mw('litter', PH('forest_leaves_02'));
const mwRock = mw('mossrock', PH('mossy_rock'));
const mwMud = mw('mud', PH('mud_forest'));
const mwRoots = mw('roots', PH('roots'));

// The Spires: pale weathered limestone and dark pine. Bone-white faces, cracked karst on the ledges,
// pine needles on the crowns, pale shingle and white sand under teal water.
const sp = (n: string, s: string) => scan('spires', n, s);
const spLime = sp('limestone', ACG('Rock017'));
const spKarst = sp('karst', PH('marble_rock_01'));
const spNeedles = sp('needles', ACG('Ground077'));
const spShingle = sp('shingle', ACG('Gravel037'));
const spSand = sp('sand', ACG('Ground027'));

// The Narrows: warm ochre and rust, the only warm rock in the north. Banded sandstone walls, ochre
// ledges, dry juniper scrub on top, scree fans and red sand at the mouths.
const nr = (n: string, s: string) => scan('narrows', n, s);
const nrSandstone = nr('sandstone', PH('cliff_side'));
const nrLedge = nr('ledge', ACG('Rock056'));
const nrScrub = nr('scrub', PH('dry_ground_rocks'));
const nrScree = nr('scree', ACG('Ground079S'));
const nrSand = nr('redsand', PH('red_sand'));

// The Basalt Stacks: black rock and vivid green turf. Fractured basalt faces, black slabs in the surf,
// turf over the tops, rock breaking through the turf, black boulder beaches.
const bs = (n: string, s: string) => scan('basaltStacks', n, s);
const bsBasalt = bs('basalt', PH('dark_rock'));
const bsSlab = bs('basaltslab', PH('dark_rock_02'));
const bsTurf = bs('turf', ACG('Grass001'));
const bsTurfRock = bs('turfrock', PH('coast_sand_rocks_02'));
const bsBoulders = bs('boulders', PH('dry_river_pebbles'));

// The Kelp Shallows: olive and gold. Tide-pool rock, wet sand, rippled sand seen through the water,
// olive grass on the islet tops.
const kp = (n: string, s: string) => scan('kelpShallows', n, s);
const kpTide = kp('tiderock', PH('coast_land_rocks_01'));
const kpWetSand = kp('wetsand', PH('damp_beach_sand'));
const kpRipples = kp('ripples', ACG('Ground055S'));
const kpGrass = kp('grass', PH('grass_ground'));
const kpRock = kp('searock', PH('rock_3'));

// Blossom Run: cherry pink and spring green. Meadow, petals fallen on the banks, river stones,
// a clear stony riverbed, soft mossy rock in the few cuts.
const bl = (n: string, s: string) => scan('blossomRun', n, s);
const blMeadow = bl('meadow', ACG('Grass007'));
const blPetals = bl('petals', PH('flower_scattered_dirt'));
const blStones = bl('riverstones', PH('river_small_rocks'));
const blBed = bl('riverbed', ACG('Rocks024S'));
const blBank = bl('bank', ACG('Rock040'));

export const REGION_MATERIALS: Record<NorthRegionId, MaterialSet> = {
  iceCrown: set('iceCrown', [
    iceSnow('top', 4, [2.55, 2.68, 2.85], 0, 0.6),
    iceLichen('slope', 3, [2.0, 2.2, 2.7]),
    iceBlue('cliff', 9, [1.75, 1.75, 1.7]),
    iceRime('beach', 3, [1.74, 1.79, 1.72]),
    iceBlue('wetShore', 5, [0.95, 0.95, 0.98], 0.7),
    iceShingle('seabed', 4, [0.68, 0.84, 1.18], 0.5),
  ]),
  fjords: set('fjords', [
    fjNeedles('top', 4, [0.35, 0.43, 0.39]),
    fjHeather('slope', 4, [1.5, 1.35, 2.6]),
    fjGranite('cliff', 10, [2.13, 2.24, 2.47]),
    fjScree('beach', 3, [1.45, 1.49, 1.77]),
    fjGranite('wetShore', 6, [1.6, 1.76, 1.94], 0.8),
    fjSilt('seabed', 5, [1.19, 1.31, 1.19], 0.5),
  ]),
  mistwood: set('mistwood', [
    mwMoss('top', 4, [0.25, 0.38, 0.5]),
    mwLitter('slope', 3, [0.34, 0.55, 0.98]),
    mwRock('cliff', 6, [0.59, 0.84, 0.99]),
    mwRoots('beach', 4, [0.47, 0.51, 0.64]),
    mwMud('wetShore', 4, [1.1, 1.4, 1.8], 0.8),
    mwMud('seabed', 6, [0.6, 1.0, 1.6], 0.6),
  ]),
  spires: set('spires', [
    spNeedles('top', 4, [0.32, 0.45, 0.75]),
    spKarst('slope', 5, [1.82, 2.13, 2.5]),
    spLime('cliff', 9, [1.41, 1.34, 1.23]),
    spShingle('beach', 2.5, [1.11, 1.22, 1.51]),
    spLime('wetShore', 5, [0.89, 0.95, 0.95], 0.7),
    spSand('seabed', 4, [1.16, 1.43, 1.84], 0.4),
  ]),
  narrows: set('narrows', [
    nrScrub('top', 4, [1.21, 0.97, 0.85]),
    nrLedge('slope', 8, [1.5, 1.15, 1.3]),
    nrSandstone('cliff', 10, [2.0, 1.56, 1.45]),
    nrScree('beach', 3, [1.17, 0.87, 0.67]),
    nrSandstone('wetShore', 6, [1.52, 1.14, 1.27], 0.75),
    nrSand('seabed', 5, [0.64, 0.79, 0.74], 0.5),
  ]),
  basaltStacks: set('basaltStacks', [
    bsTurf('top', 3, [1.38, 1.97, 1.08]),
    bsTurfRock('slope', 12, [0.78, 1.52, 0.96]),
    bsBasalt('cliff', 7, [1.8, 2.2, 2.6]),
    bsBoulders('beach', 3, [0.25, 0.28, 0.51]),
    bsSlab('wetShore', 5, [0.8, 1.01, 1.46], 0.8),
    bsBoulders('seabed', 5, [0.25, 0.25, 0.36], 0.5),
  ]),
  kelpShallows: set('kelpShallows', [
    kpGrass('top', 4, [1.69, 1.9, 1.13]),
    kpGrass('slope', 6, [1.25, 1.43, 1.07]),
    kpRock('cliff', 6, [1.18, 1.35, 1.18]),
    kpWetSand('beach', 4, [2.07, 1.9, 1.37]),
    kpTide('wetShore', 12, [1.36, 1.62, 1.32], 0.6),
    kpRipples('seabed', 3, [1.29, 1.09, 0.65], 0.3),
  ]),
  blossomRun: set('blossomRun', [
    blMeadow('top', 3, [1.39, 1.48, 2.09]),
    blPetals('slope', 3, [1.4, 1.12, 1.4]),
    blBank('cliff', 6, [0.88, 0.96, 0.92]),
    blStones('beach', 3, [1.6, 1.8, 2.1]),
    blBed('wetShore', 3, [0.97, 1.02, 1.1], 0.7),
    blBed('seabed', 4, [1.11, 1.32, 1.53], 0.4),
  ]),
};
