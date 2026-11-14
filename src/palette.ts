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
export const SAND = tones('#E9B44C', '#C98A3A');
/** The sand along the waterline, paler; the dry sand high up the beach, deeper; and where fronds have fallen on it. */
export const SAND_SHORE = tones('#F6DE8E', '#D8AE62');
export const SAND_DRY = tones('#E6C25A', '#BF8E40');
export const LITTER = tones('#C98A3A', '#96552E');
export const ROCK = tones('#C0603A', '#7E3A2C');
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
export const SEA_SHALLOW = ink('#38D9A8');
export const SEA_MIDDLE = ink('#1C7AB6');
export const SEA_DEEP = ink('#1F4AA3');
export const FOAM = ink('#FFF9EC');

// ---- the sky
export const STORM = tones('#7A4FB8', '#3D2670');
/** The gold of the sunlit calm's light along the storm wall's foot. */
export const STORM_FOOT = ink('#F5C67A');
export const LIGHTNING = ink('#D9C2FF');
/** A fair-weather cloud: cream where the sun lights it, a warm mauve beneath. */
export const CLOUD = tones('#FFF1D6', '#C4A8BC');
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
