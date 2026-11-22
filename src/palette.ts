// The palette: every colour of the world, named once, in linear RGB. A sea
// chart's inks: vermilion, ochre, murrey, moss, gold and parchment cream, on a
// sea of turquoise and ultramarine, against a violet storm. Each solid thing
// has two tones, the one it shows where the sun reaches it and the one it shows
// where it does not (sky/light.ts toon): the shadow is a colour chosen for it,
// warm and saturated, never the lit one greyed. Written as the display's sRGB,
// as a painter would pick them (colour.ts turns them to light); the lights that
// glow of themselves are written as light.

import { hexToLinear as ink, type Rgb } from './colour.ts';

export type { Rgb };
/** A solid's two tones. */
export interface Tones {
  readonly lit: Rgb;
  readonly shadow: Rgb;
}

const tones = (lit: string, shadow: string): Tones => ({
  lit: ink(lit),
  shadow: ink(shadow),
});
/** A colour's luminance (three's luminance(), the working space's weights, on the CPU). */
const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/** A colour as the tint of a light: its hue and saturation, at luminance y. */
export const tint = (c: Rgb, y: number): Rgb => {
  const k = y / luma(c);
  return [c[0] * k, c[1] * k, c[2] * k];
};

// ---- the land
export const SAND = tones('#F6CF6A', '#D08E3E');
/**
 * The sand along the waterline, paler; and the dry sand high up the beach,
 * deeper.
 */
export const SAND_SHORE = tones('#FBE7B0', '#DDAA66');
export const SAND_DRY = tones('#EBA532', '#BF6A2A');
/**
 * Inland: a warmer, earthier sand in patches where the shrubs grow; and the
 * bleached, wind-blown sand high up.
 */
export const SAND_LOAM = tones('#D88B3A', '#A2552E');
export const SAND_DUNE = tones('#F1D49A', '#C9925A');
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

// ---- the harbour (land/harbour.ts): lime-washed walls, tiled roofs, the
// quay's stone, a foundry's brick, an awning's stripes, a window's glass
export const PLASTER = tones('#F7EBD0', '#C9A096');
export const ROOF_TILE = tones('#C9573A', '#7C2F47');
export const QUAY = tones('#CDB995', '#86707E');
export const BRICK = tones('#A9523C', '#662C40');
export const AWNING = tones('#D2332A', '#8A2238');
export const CANVAS = tones('#F3E6C8', '#C3A090');
export const GLASS = tones('#2F6FA8', '#27437A');

// ---- the ships
export const TIMBER = tones('#9A5A2C', '#5A2F2E');
export const DECK = tones('#D9A86A', '#9A6548');
export const TAR = tones('#3A2A2E', '#221827');
export const GILDING = tones('#F5C542', '#B8792A');
/**
 * The hard highlight on gilding and gunmetal, and the mark on a sail whose own
 * paint would not show: cream.
 */
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
/**
 * Past the planet's limb, seen from space: all but black, a little blue (linear
 * light, before exposure).
 */
export const SPACE: Rgb = [0.0015, 0.002, 0.004];
/** A fair-weather cloud: cream where the sun lights it, rose beneath. */
export const CLOUD = tones('#FFF1D6', '#E8A58C');
/** Powder smoke: a cloud's cream, and a deeper rose in its shadow. */
export const SMOKE: Tones = { lit: CLOUD.lit, shadow: ink('#D9907C') };

/**
 * Dust a ball throws up on land, and the dark smoke of a ball home in a hull.
 */
export const DUST = ink('#C9A06A');
export const SOOT = ink('#5A4A55');
/** A worn ship's thin smoke: a warm grey (gunfire/puffs.ts). */
export const WISP = ink('#9C9294');

// ---- the guns' fire: lights, radiance per unit of sun (gunfire/gunfire.ts)
/** A muzzle's flash, and a ball home's. */
export const FIRE: Rgb = [1, 0.55, 0.2];
/**
 * A shield's light, azure: #4FC3FF's sRGB numbers taken as light (so paler than
 * that ink would be).
 */
export const AZURE: Rgb = [0.31, 0.76, 1];
/** A ball in flight: its iron core, and the hot rim round it. */
export const BALL_IRON: Rgb = [0.015, 0.013, 0.012];
export const BALL_SPARK: Rgb = [6, 3, 0.9];
/** A ball's tracer at the ball, dying to nothing at its tail. */
export const TRACER: Rgb = [5, 2.2, 0.6];
/** The ring laid on the water where a mortar's shell will fall. */
export const FALL_MARK: Rgb = [3.2, 0.9, 0.35];

// ---- the loot
export const ICE = tones('#8FE0F5', '#3F8FC9');
/** A highlight on ice: white. */
export const GLINT = ink('#FFFFFF');
/**
 * The light each rarity glows with on the water (its rim, its ring), worst to
 * best: grey, green, blue, purple, gold (ui/ink.ts RARITY: the same rarities'
 * inks on the chart).
 */
export const RARITY_GLOW: readonly Rgb[] = [
  '#C9D1DA',
  '#55E05A',
  '#3AA0FF',
  '#B85CFF',
  '#FFA21F',
].map((hex) => ink(hex));

// ---- the grade's lifted blacks (post/grade.ts fadeTo)
/** A morning's lavender mist, and the storm's slate violet. */
export const DAWN_MIST: Rgb = [0.12, 0.1, 0.15];
export const STORM_SLATE: Rgb = [0.13, 0.1, 0.19];

// ---- the dyes: what a ship's paint and canvas are, and so her water's
/**
 * A dye's shadow tone is its lit one times this: darker, and redder (as canvas
 * goes to its warm tan).
 */
export const DYE_SHADE: Rgb = [0.56, 0.4, 0.42];
/**
 * A sail with the sun behind it glows: its dye times itself by this share
 * (deeper, more saturated) and brighter.
 */
export const DYE_GLOW = { deepen: 0.35, gain: 1.25 } as const;
export const VERMILION = ink('#D2332A');
export const OCHRE = ink('#E8A21C');
/**
 * A yellow green, far from the sea's; a pale pink no one takes for her red; and
 * a clear yellow.
 */
export const MOSS = ink('#7F9A2A');
export const ROSE = ink('#F2A0B4');
export const LEMON = ink('#F4E06A');
export const MURREY = ink('#8A2A6A');
export const CHARCOAL = ink('#2E2A33');
/**
 * The rest of the liveries' dyes (play/colours.ts COLOURS): a pink-red coral, a
 * clear orange, a yellow-green brighter than the moss, a dark olive, an oxblood
 * darker than her vermilion, a brown umber, a hot cerise, a pale peach, and a
 * warm pewter grey. None a blue, a green near the sea's, the foam's cream or
 * the storm's violet.
 */
export const CORAL = ink('#EE6E5C');
export const TANGERINE = ink('#F2801E');
export const CHARTREUSE = ink('#BCC82C');
export const OLIVE = ink('#5C5A1E');
export const OXBLOOD = ink('#741A22');
export const UMBER = ink('#6E4222');
export const CERISE = ink('#D63C88');
export const PEACH = ink('#F6BC8C');
export const PEWTER = ink('#8E8882');
/**
 * The marks (cross, band, stripes) on a canvas of a dye: cream on a dark dye,
 * tar on a light one; a dye lighter than `turn` (its luminance) is light. The
 * turn is where the two stand out from it equally (the luminances' contrast
 * ratio, each + 0.05), so whichever is chosen stands out the more: at worst
 * some 3.3 : 1, the ship's own material and the livery folio alike
 * (ship/materials.ts, ui/livery.ts by the Wardrobe).
 */
export const MARKS = {
  light: CREAM,
  dark: TAR.lit,
  turn: Math.sqrt((luma(CREAM) + 0.05) * (luma(TAR.lit) + 0.05)) - 0.05,
} as const;
/** The ink of the marks on a canvas of dye `c` (MARKS). */
export const markOn = (c: Rgb): Rgb =>
  luma(c) > MARKS.turn ? MARKS.dark : MARKS.light;
