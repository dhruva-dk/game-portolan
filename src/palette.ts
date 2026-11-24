import { hexToLinear as ink, type Rgb } from './color.ts';

export type { Rgb };
export interface Tones {
  readonly lit: Rgb;
  readonly shadow: Rgb;
}

const tones = (lit: string, shadow: string): Tones => ({
  lit: ink(lit),
  shadow: ink(shadow),
});
const luma = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
export const tint = (c: Rgb, y: number): Rgb => {
  const k = y / luma(c);
  return [c[0] * k, c[1] * k, c[2] * k];
};

export const SAND = tones('#F6CF6A', '#D08E3E');
export const SAND_SHORE = tones('#FBE7B0', '#DDAA66');
export const SAND_DRY = tones('#EBA532', '#BF6A2A');
export const SAND_LOAM = tones('#D88B3A', '#A2552E');
export const SAND_DUNE = tones('#F1D49A', '#C9925A');
export const ROCK = tones('#B8553A', '#74304A');
export const STRATUM = tones('#C98552', '#83432F');
export const PALM_LEAF = tones('#4DA63A', '#1F6148');
export const PALM_LEAF_OLD = tones('#A8B03A', '#5E6A3A');
export const PALM_NUT = tones('#B8862E', '#6E4A2A');
export const PALM_TRUNK = tones('#8A5630', '#55303A');
export const SHRUB = tones('#6FAE3C', '#2C6A4A');
export const SEABED_SAND = tones('#E8D08A', '#B89A6A');
export const SEABED_STONE = tones('#8FA08A', '#55707A');
export const SEABED_WEED = tones('#4F9A6E', '#2E6A62');

export const TIMBER = tones('#9A5A2C', '#5A2F2E');
export const DECK = tones('#D9A86A', '#9A6548');
export const TAR = tones('#3A2A2E', '#221827');
export const GILDING = tones('#F5C542', '#B8792A');
export const CREAM = ink('#F3E6C8');
export const IRON = tones('#4A4450', '#2A2233');

export const SEA_SHALLOW = ink('#22B4B6');
export const SEA_MIDDLE = ink('#1E86B8');
export const SEA_DEEP = ink('#1F4FA8');
export const FOAM = ink('#FFF9EC');

export const STORM = tones('#7A4FB8', '#3D2670');
export const LIGHTNING = ink('#D9C2FF');
export const HAZE: Rgb = [1.08, 0.9, 0.7];
export const SPACE: Rgb = [0.0015, 0.002, 0.004];
export const CLOUD = tones('#FFF1D6', '#E8A58C');
export const SMOKE: Tones = { lit: CLOUD.lit, shadow: ink('#D9907C') };

export const DUST = ink('#C9A06A');
export const SOOT = ink('#5A4A55');
export const WISP = ink('#9C9294');

export const FIRE: Rgb = [1, 0.55, 0.2];
export const AZURE: Rgb = [0.31, 0.76, 1];
export const BALL_IRON: Rgb = [0.015, 0.013, 0.012];
export const BALL_SPARK: Rgb = [6, 3, 0.9];
export const TRACER: Rgb = [5, 2.2, 0.6];
export const FALL_MARK: Rgb = [3.2, 0.9, 0.35];

export const ICE = tones('#8FE0F5', '#3F8FC9');
export const GLINT = ink('#FFFFFF');
export const RARITY_GLOW: readonly Rgb[] = [
  '#C9D1DA',
  '#55E05A',
  '#3AA0FF',
  '#B85CFF',
  '#FFA21F',
].map((hex) => ink(hex));

export const DAWN_MIST: Rgb = [0.12, 0.1, 0.15];
export const STORM_SLATE: Rgb = [0.13, 0.1, 0.19];

export const DYE_SHADE: Rgb = [0.56, 0.4, 0.42];
export const DYE_GLOW = { deepen: 0.35, gain: 1.25 } as const;
export const VERMILION = ink('#D2332A');
export const OCHRE = ink('#E8A21C');
export const MOSS = ink('#7F9A2A');
export const ROSE = ink('#F2A0B4');
export const LEMON = ink('#F4E06A');
export const MURREY = ink('#8A2A6A');
export const CHARCOAL = ink('#2E2A33');
export const CORAL = ink('#EE6E5C');
export const TANGERINE = ink('#F2801E');
export const CHARTREUSE = ink('#BCC82C');
export const OLIVE = ink('#5C5A1E');
export const OXBLOOD = ink('#741A22');
export const UMBER = ink('#6E4222');
export const CERISE = ink('#D63C88');
export const PEACH = ink('#F6BC8C');
export const PEWTER = ink('#8E8882');
export const MARKS = {
  light: CREAM,
  dark: TAR.lit,
  turn: Math.sqrt((luma(CREAM) + 0.05) * (luma(TAR.lit) + 0.05)) - 0.05,
} as const;
export const markOn = (c: Rgb): Rgb =>
  luma(c) > MARKS.turn ? MARKS.dark : MARKS.light;
