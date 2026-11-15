// The palette: every colour of the world, named once, in linear RGB. A sea chart's inks: vermilion, ochre, murrey,
// moss, gold and parchment cream, on a sea of turquoise and ultramarine, against a violet storm. Each solid thing has two tones, the one it shows
// where the sun reaches it and the one it shows where it does not (sky/light.ts toon): the shadow is a colour chosen
// for it, warm and saturated, never the lit one greyed. Written as the display's sRGB, as a painter would pick them.

export type Rgb = readonly [number, number, number];
/** A solid's two tones. */
export interface Tones { readonly lit: Rgb; readonly shadow: Rgb }

/** A display colour ('#RRGGBB', sRGB) as linear RGB. */
const ink = (hex: string): Rgb => {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(1), channel(2)];
};
const tones = (lit: string, shadow: string): Tones => ({ lit: ink(lit), shadow: ink(shadow) });
/** A colour as the tint of a light: its hue and saturation, at luminance y. */
export const tint = (c: Rgb, y: number): Rgb => {
  const k = y / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  return [c[0] * k, c[1] * k, c[2] * k];
};

// ---- the land
export const SAND = tones('#F2B632', '#C9772A');
/** The sand along the waterline, paler; the dry sand high up the beach, deeper; and where fronds have fallen on it. */
export const SAND_SHORE = tones('#F8D675', '#D9984A');
export const SAND_DRY = tones('#EBA532', '#BF6A2A');
export const LITTER = tones('#C98A3A', '#96552E');
export const ROCK = tones('#B8553A', '#74304A');
/** A cliff's paler strata, sandstone between the rock's red bands. */
export const STRATUM = tones('#C98552', '#83432F');
export const PALM_LEAF = tones('#4DA63A', '#1F6148');
/** A palm's old fronds, yellowing; and its nuts. */
export const PALM_LEAF_OLD = tones('#A8B03A', '#5E6A3A');
export const PALM_NUT = tones('#B8862E', '#6E4A2A');
export const PALM_TRUNK = tones('#8A5630', '#55303A');
export const SHRUB = tones('#6FAE3C', '#2C6A4A');
export const SEABED_SAND = tones('#E8D08A', '#B89A6A');
export const SEABED_STONE = tones('#8FA08A', '#55707A');
export const SEABED_WEED = tones('#4F9A6E', '#2E6A62');

/** A biome's ground (world/biome.ts, by its name; land/sand.ts lays it): its beach's three sands, the litter under its
 *  growth, its cliffs' rock and their paler strata, its sea floor's sand, rubble and weed, its shrubs' green, and the
 *  turf that covers its ground from `from` m over the sea (to `to` m, if it gives out), if any. */
export interface Grounds {
  readonly sand: Tones; readonly shore: Tones; readonly dry: Tones; readonly litter: Tones;
  readonly rock: Tones; readonly stratum: Tones;
  readonly seabed: Tones; readonly stone: Tones; readonly weed: Tones;
  readonly shrub: Tones;
  readonly turf: { readonly tones: Tones; readonly from: number; readonly to: number } | null;
}
const TODAY: Grounds = {
  sand: SAND, shore: SAND_SHORE, dry: SAND_DRY, litter: LITTER, rock: ROCK, stratum: STRATUM,
  seabed: SEABED_SAND, stone: SEABED_STONE, weed: SEABED_WEED, shrub: SHRUB, turf: null,
};
export const GROUNDS: Readonly<Record<string, Grounds>> = {
  palmKeys: TODAY,
  // white coral sand, coral-pink rock, the reef flats' pale floor and its coral heads
  coralAtolls: {
    sand: tones('#F7E2A8', '#D9A46A'), shore: tones('#FFF3CF', '#E6BC86'), dry: tones('#F0D08A', '#CC955A'), litter: tones('#C99A4E', '#97653A'),
    rock: tones('#E39A7E', '#A5586A'), stratum: tones('#F0BE98', '#B87566'),
    seabed: tones('#F5E9C2', '#C9B08A'), stone: tones('#E08A78', '#A0566C'), weed: tones('#5FAE8A', '#2E7A6A'),
    shrub: tones('#7DB84A', '#2F6E4A'), turf: null,
  },
  // black sand and dark basalt in columns, green turf over the tops
  basaltFjords: {
    sand: tones('#7A6E68', '#3E3448'), shore: tones('#988A7C', '#54485A'), dry: tones('#6A5E58', '#352B40'), litter: tones('#5E5A3A', '#3A3436'),
    rock: tones('#545468', '#25213A'), stratum: tones('#6A687C', '#332F4A'),
    seabed: tones('#9C9A8E', '#626478'), stone: tones('#62707A', '#3A4258'), weed: tones('#3E7E5E', '#24524E'),
    shrub: tones('#5E9A3E', '#24543E'), turf: { tones: tones('#78A848', '#2C5C40'), from: 2.2, to: Infinity },
  },
  // grey-brown mud, wet at the waterline, and the low ground's rank grass
  mangroveDelta: {
    sand: tones('#A8925E', '#6E5442'), shore: tones('#8C7C58', '#56483E'), dry: tones('#9A8A52', '#62553A'), litter: tones('#6E6034', '#463C2C'),
    rock: tones('#8A7058', '#54404A'), stratum: tones('#A08668', '#644E48'),
    seabed: tones('#B0A274', '#786E58'), stone: tones('#8C8A6A', '#5A5E58'), weed: tones('#5A8E4A', '#2E5E42'),
    shrub: tones('#6AA040', '#2A5E40'), turf: { tones: tones('#86AA42', '#3A663A'), from: 0.55, to: Infinity },
  },
  // ash beaches, black lava, rust-red tuff in the cuts; green only on the lower flanks
  volcanicArc: {
    sand: tones('#5C5054', '#2E2436'), shore: tones('#7A6C6A', '#443848'), dry: tones('#4E4248', '#2A2032'), litter: tones('#5A4A36', '#33283A'),
    rock: tones('#443C48', '#1E1828'), stratum: tones('#8A4E3A', '#4A283A'),
    seabed: tones('#8A8478', '#545066'), stone: tones('#4E4A52', '#2C2838'), weed: tones('#3E7258', '#244A48'),
    shrub: tones('#6A9E3A', '#285640'), turf: { tones: tones('#6E9A3E', '#2C5440'), from: 1.6, to: 9 },
  },
  // white chalk cliffs over a shingle beach, banded with flint, and the downs' short turf
  chalkDowns: {
    sand: tones('#D9C9A4', '#9A887E'), shore: tones('#E8DCBE', '#AC9C8E'), dry: tones('#C9B88C', '#8E7C70'), litter: tones('#8E8A4E', '#5A5440'),
    rock: tones('#F4F0E2', '#B4AAC2'), stratum: tones('#E6DFCF', '#A99FB8'),
    seabed: tones('#E2DABA', '#A8A08E'), stone: tones('#B8B4A8', '#7A7A86'), weed: tones('#4F9A6E', '#2E6A62'),
    shrub: tones('#6EA642', '#2C6444'), turf: { tones: tones('#8CBC4E', '#3A6E42'), from: 1.4, to: Infinity },
  },
};

/** The trees of the biomes that have them (land/trees.ts): a conifer's, a broadleaf's and a mangrove's leaves; the
 *  bark of each; a mangrove's roots. */
export const CONIFER = tones('#3E8A4E', '#173E3E');
export const BROADLEAF = tones('#6EAE3E', '#24583E');
export const MANGROVE = tones('#5C9E3E', '#20503C');
export const BARK = tones('#7A5236', '#3E2834');
export const ROOTS = tones('#8A6E4E', '#4A3838');
/** A crater's steam. */
export const STEAM = tones('#FFF6E8', '#C8B4C0');

// ---- the flight's gulls (gulls/gull.ts): white feathers, grey wings (their tips in the crew's paint, a scarf in her
// sail's colour), a yellow beak and legs, and dark sunglasses
export const FEATHER = tones('#FFFDF6', '#B8B2CE');
export const WING = tones('#C4CAD6', '#7E80A0');
export const BEAK = tones('#F5B93A', '#B8663A');
export const SHADES = tones('#2A2633', '#120F18');

// ---- the ships
export const TIMBER = tones('#9A5A2C', '#5A2F2E');
export const DECK = tones('#D9A86A', '#9A6548');
export const TAR = tones('#3A2A2E', '#221827');
export const GILDING = tones('#F5C542', '#B8792A');
/** The hard highlight on gilding and gunmetal, and the mark on a sail whose own paint would not show: cream. */
export const CREAM = ink('#F3E6C8');
/** Gunmetal: the iron of a gun's yoke and barrels. */
export const IRON = tones('#4A4450', '#2A2233');

// ---- the sea
export const SEA_SHALLOW = ink('#22B4B6');
export const SEA_MIDDLE = ink('#1E86B8');
export const SEA_DEEP = ink('#1F4FA8');
export const FOAM = ink('#FFF9EC');

// ---- the sky
export const STORM = tones('#7A4FB8', '#3D2670');
export const LIGHTNING = ink('#D9C2FF');
/** The haze's glow is the horizon's sky times this: warm. */
export const HAZE: Rgb = [1.08, 0.9, 0.7];
/** Past the planet's limb, seen from space: all but black, a little blue (linear light, before exposure). */
export const SPACE: Rgb = [0.0015, 0.002, 0.004];
/** A fair-weather cloud: cream where the sun lights it, rose beneath. */
export const CLOUD = tones('#FFF1D6', '#E8A58C');
/** Powder smoke: a cloud's cream, and a deeper rose in its shadow. */
export const SMOKE = tones('#FFF1D6', '#D9907C');

/** Dust a ball throws up on land, and the dark smoke of a ball home in a hull. */
export const DUST = ink('#C9A06A');
export const SOOT = ink('#5A4A55');

// ---- the rookery's buildings (campus/): limestone and whitewash under terracotta and slate, brick for the works,
// verdigris on the copper, dark panes that catch the sun
export const STONE = tones('#E0C99A', '#9A6458');
export const PLASTER = tones('#F4E4C2', '#C08A74');
export const BRICK = tones('#B5533A', '#6A2838');
export const ROOF_TILE = tones('#D2603C', '#82303E');
export const SLATE = tones('#647490', '#323A5C');
export const COPPER = tones('#5FBFA4', '#2C6A70');
export const GLASS = tones('#35587A', '#1C2646');
export const CANVAS = tones('#F2E6C8', '#B48C78');
/** The test tank's water, and a doorway's dark. */
export const TANK = tones('#3EC2C8', '#1E7090');
export const DOORWAY = tones('#4A2E36', '#2A1A2A');
/** The foundry's coal smoke, greyer than powder smoke. */
export const COAL_SMOKE = tones('#D8CCC4', '#7A6070');

// ---- the loot
export const ICE = tones('#8FE0F5', '#3F8FC9');
/** A highlight on ice: white. */
export const GLINT = ink('#FFFFFF');

// ---- the dyes: what a ship's paint and canvas are, and so her water's
/** A dye's shadow tone is its lit one times this: darker, and redder (as canvas goes to its warm tan). */
export const DYE_SHADE: Rgb = [0.56, 0.4, 0.42];
/** A sail with the sun behind it glows: its dye times itself by this share (deeper, more saturated) and brighter. */
export const DYE_GLOW = { deepen: 0.35, gain: 1.25 } as const;
export const VERMILION = ink('#D2332A');
export const OCHRE = ink('#E8A21C');
/** A yellow green, far from the sea's; a pale pink no one takes for her red; and a clear yellow. */
export const MOSS = ink('#7F9A2A');
export const ROSE = ink('#F2A0B4');
export const LEMON = ink('#F4E06A');
export const MURREY = ink('#8A2A6A');
export const CHARCOAL = ink('#2E2A33');

// ---- the crews' swatches: a side's colours (race.ts Colours index them). Starting values: twelve hues round the
// wheel, each deep and light; the first, vermilion, the player's.
export const CREW: readonly { readonly name: string; readonly rgb: Rgb }[] = ([
  ['vermilion', '#C8322A'], ['coral', '#EE8A7E'], ['amber', '#C0702A'], ['apricot', '#F0B47C'],
  ['mustard', '#B09E22'], ['primrose', '#F0DC7C'], ['olive', '#6E9A24'], ['lime', '#B8E07C'],
  ['green', '#2E9A3A'], ['mint', '#8CD892'], ['jade', '#24946A'], ['seafoam', '#7CD8B4'],
  ['teal', '#22908E'], ['aqua', '#7CD6D4'], ['azure', '#2A6AB0'], ['sky', '#7CAEE8'],
  ['indigo', '#3A3AB0'], ['periwinkle', '#9090E8'], ['violet', '#6E34B0'], ['lavender', '#B48AE8'],
  ['magenta', '#A0309A'], ['orchid', '#E07CD8'], ['crimson', '#B02E62'], ['pink', '#E87CA6'],
] as const).map(([name, hex]) => ({ name, rgb: ink(hex) }));
