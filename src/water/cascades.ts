// The sea is drawn as three patches of waves, each tiling the sea at its own size and holding its own band of
// wavelengths, so together they hold the whole spectrum once, from swells of hundreds of metres to ripples of a
// few centimetres, and no pattern repeats at a scale the eye can find. Pure numbers, shared by the GPU and the tests.

/** Texels across each patch. */
export const SIZE = 256;
/** Each patch's width, metres. */
export const CASCADES = [1024, 128, 16];
/**
 * Each patch's band of wavenumbers, rad/m. A patch hands the next the waves six of whose wavelengths fit across
 * the next patch: shorter than that, the larger patch's texels would draw them coarsely, and longer, the smaller
 * patch has too few modes to draw them well.
 */
export const BANDS: [number, number][] = CASCADES.map((_, c) => [
  c === 0 ? 0 : (12 * Math.PI) / CASCADES[c],
  c === CASCADES.length - 1 ? Infinity : (12 * Math.PI) / CASCADES[c + 1],
]);
