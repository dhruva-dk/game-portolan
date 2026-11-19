// The palette: every colour of the world, named once, in linear RGB. A sea chart's inks: vermilion, ochre, murrey,
// moss, gold and parchment cream, on a sea of turquoise and ultramarine, against a violet storm. Each solid thing has two tones, the one it shows
// where the sun reaches it and the one it shows where it does not (sky/light.ts toon): the shadow is a colour chosen
// for it, warm and saturated, never the lit one greyed. Written as the display's sRGB, as a painter would pick them.

import { hexToLinear as ink, type Rgb } from './colour.ts';

export type { Rgb };
/** A solid's two tones. */
export interface Tones { readonly lit: Rgb; readonly shadow: Rgb }

const tones = (lit: string, shadow: string): Tones => ({ lit: ink(lit), shadow: ink(shadow) });
/** A colour as the tint of a light: its hue and saturation, at luminance y. */
export const tint = (c: Rgb, y: number): Rgb => {
  const k = y / (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]);
  return [c[0] * k, c[1] * k, c[2] * k];
};

// ---- the land
export const SAND = tones('#F6CF6A', '#D08E3E');
/** The sand along the waterline, paler; the dry sand high up the beach, deeper; and where fronds have fallen on it. */
export const SAND_SHORE = tones('#FBE7B0', '#DDAA66');
export const SAND_DRY = tones('#EBA532', '#BF6A2A');
/** Inland: a warmer, earthier sand in patches where the shrubs grow; and the bleached, wind-blown sand high up. */
export const SAND_LOAM = tones('#D88B3A', '#A2552E');
export const SAND_DUNE = tones('#F1D49A', '#C9925A');
export const LITTER = tones('#C98A3A', '#96552E');
export const ROCK = tones('#B8553A', '#74304A');
/** A cliff's paler strata, sandstone between the rock's red bands. */
export const STRATUM = tones('#C98552', '#83432F');
/** Where the land's tones lie (land/sand.ts; tools/terrain-map.ts): the heights over the sea, metres, where the shore's
 *  pale sand, the beach and the dry sand begin, and past which the dunes'; the ground's cover past which the sand is
 *  earthier (its growth: where the shrubs grow), and past which rubble lies (on the land's tops, bare rock); how far up
 *  or down the ground's mottling moves a band's edge, metres (the dunes' six times as far). On the terrain the dunes
 *  begin `dunes` of the way up to its summit instead (its land runs higher than an island's). */
export const BANDS = { shore: -0.15, beach: 0.45, dry: 2.6, dune: 9, dunes: 0.5, loam: 0.5, rubble: 0.7, ragged: 0.5 } as const;
export const PALM_LEAF = tones('#4DA63A', '#1F6148');
/** A palm's old fronds, yellowing; and its nuts. */
export const PALM_LEAF_OLD = tones('#A8B03A', '#5E6A3A');
export const PALM_NUT = tones('#B8862E', '#6E4A2A');
export const PALM_TRUNK = tones('#8A5630', '#55303A');
export const SHRUB = tones('#6FAE3C', '#2C6A4A');
export const SEABED_SAND = tones('#E8D08A', '#B89A6A');
export const SEABED_STONE = tones('#8FA08A', '#55707A');
export const SEABED_WEED = tones('#4F9A6E', '#2E6A62');

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
