// The sea is drawn as three patches of waves, each tiling the sea at its own size and holding its own band of
// wavelengths, so together they hold the whole spectrum once, from swells of hundreds of metres to ripples of a
// few centimetres, and no pattern repeats at a scale the eye can find. Pure numbers, shared by the GPU (water/waves.ts,
// water/water.ts), the CPU's copy of the long waves (swell.ts) and the tests.

/** Texels across each patch. */
export const SIZE = 256;
/** Each patch's width, metres. */
export const CASCADES = [1024, 128, 16];
/**
 * Each patch's band of wavenumbers, rad/m. A patch hands the next the waves six of whose wavelengths fit across
 * the next patch: shorter than that, the larger patch's texels would draw them coarsely, and longer, the smaller
 * patch has too few modes to draw them well. The last patch stops at its grid's Nyquist circle: the square grid holds
 * shorter waves in its corners, but only along the diagonals, and those would draw the grid's axes into the
 * ripples (and the caustics, which weigh the shortest waves most). What it leaves out the ripples' roughness takes.
 */
export const BANDS: [number, number][] = CASCADES.map((L, c) => [
  c === 0 ? 0 : (12 * Math.PI) / L,
  c === CASCADES.length - 1 ? (Math.PI * SIZE) / L : (12 * Math.PI) / CASCADES[c + 1],
]);

/** The sea repeats after this many seconds: ω is rounded to multiples of 2π/PERIOD. */
export const PERIOD = 200;
/** How far the crests lean: the sideways displacement's scale. */
export const CHOP = 1;
/** Open ocean: the trade winds have blown over hundreds of kilometres, metres. */
export const FETCH = 300_000;
/** The breaker index: the highest wave (significant height) water of a given depth holds (McCowan 1894). */
export const BREAKER = 0.78;
/** The cascades the depth cuts to the breaker index (the long waves); the rest fade only in the last few centimetres. */
export const LONG = 2;
