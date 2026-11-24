export const SIZE = 256;
export const CASCADES = [1024, 128, 16];
export const BANDS: [number, number][] = CASCADES.map((L, c) => [
  c === 0 ? 0 : (12 * Math.PI) / L,
  c === CASCADES.length - 1
    ? (Math.PI * SIZE) / L
    : (12 * Math.PI) / CASCADES[c + 1],
]);

export const PERIOD = 200;
export const CHOP = 1;
export const FETCH = 300_000;
export const BREAKER = 0.78;
export const LONG = 2;
