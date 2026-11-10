// Immutable opaque photographs packed beside their JPEG sources as ASTC 4×4, at their native dimensions.
// Keep cutout images and the canvases painted from them on their existing path.
export interface Photograph { file: string; srgb: boolean }
const pairs = (folder: string, names: readonly string[]): Photograph[] => names.flatMap((name) => [
  { file: `tex/${folder}/${name}_d.jpg`, srgb: true }, { file: `tex/${folder}/${name}_n.jpg`, srgb: false },
]);
export const PHOTOGRAPHS: readonly Photograph[] = [
  ...pairs('rocks', ['ice', 'snow', 'granite', 'limestone', 'sandstone', 'basalt', 'coral', 'scoria', 'pahoehoe', 'wetblack', 'moss', 'slate', 'seaside', 'shore']),
  ...pairs('flora/a', ['fir_bark', 'pine_bark', 'cedar_bark']),
  ...pairs('flora/b', ['juniper_bark', 'cherry_bark', 'maple_bark']),
  ...pairs('flora/c', ['fanpalm_bark', 'seagrape_bark', 'coconut_bark']),
  ...pairs('flora/d', ['bark_ash', 'bark_fern', 'bark_mangrove', 'bark_mossy']),
  ...['hull_d', 'hull_n', 'deck_d', 'deck_n', 'linen_d'].map((name) => ({ file: `tex/${name}.jpg`, srgb: name.endsWith('_d') })),
];
const files = new Set(PHOTOGRAPHS.map((p) => p.file));
export const packedPhotograph = (file: string): boolean => files.has(file);
